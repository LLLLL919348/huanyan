/* ==========================================================================
   幻言 · 安全与配额层（零依赖）
   - 统一安全响应头（CSP / nosniff / frame-options / referrer / permissions）
   - 按 IP 的滑动窗口限流（普通接口 / 聊天接口分开计）
   - 管理写接口与 /admin 的令牌校验（未配置令牌时只允许本机）
   - /api/settings 的脱敏（模型密钥永不出服务端）
   - 访客识别（cookie + IP 兜底）与每日额度（默认 30/人/天）
   模型配置独立放在 data/model.json，既不经 API 暴露、也不在静态目录里。
   ========================================================================== */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DATA_DIR = path.join(__dirname, '..', 'data');
const MODEL_FILE = path.join(DATA_DIR, 'model.json');
const QUOTA_FILE = path.join(DATA_DIR, 'quota.json');

/* ------------------------------ 安全响应头 ------------------------------ */
const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",   // 站点用内联样式属性（style="..."），故放开 inline style
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self'",                  // 前端只许连本站；在线模型走服务端代理
  "form-action 'none'",
  "frame-ancestors 'self'",             // 只允许同源嵌套（验收页用 iframe 驱动真实站点），跨源一律禁止
  "base-uri 'none'",
  "object-src 'none'"
].join('; ');

/* 开发用验收页（tools/*.html）里有内联脚本，单独放宽 script-src；
   另外允许连一个本机端口：无头浏览器里的验收页要把结果 POST 到 tools/report-sink.js
   （默认 127.0.0.1:5799）。否则 connect-src 'self' 会拦掉它 —— 而 --dump-dom 那条路不可靠：
   虚拟时间会快进，DOM 往往在真模型的回复到达之前就被倒出来了（playthrough 就是这么卡住的）。
   站点本身（index.html）与后台（admin/index.html）保持严格策略不变。 */
const CSP_RELAXED = CSP
  .replace("script-src 'self'", "script-src 'self' 'unsafe-inline'")
  .replace("connect-src 'self'", "connect-src 'self' http://127.0.0.1:5799 http://localhost:5799");

function applySecurityHeaders(res, opts) {
  opts = opts || {};
  res.setHeader('Content-Security-Policy', opts.relaxed ? CSP_RELAXED : CSP);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=(), payment=()');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
  res.setHeader('X-Permitted-Cross-Domain-Policies', 'none');
  if (opts.hsts) res.setHeader('Strict-Transport-Security', 'max-age=15552000; includeSubDomains');
}

/* ------------------------------ 限流 ------------------------------ */
const buckets = new Map();      // key -> { hits: [ts...] }
function rateLimit(key, limit, windowMs) {
  const now = Date.now();
  let b = buckets.get(key);
  if (!b) { b = { hits: [] }; buckets.set(key, b); }
  b.hits = b.hits.filter(function (t) { return now - t < windowMs; });
  if (b.hits.length >= limit) {
    const retry = Math.ceil((windowMs - (now - b.hits[0])) / 1000);
    return { ok: false, retryAfter: Math.max(1, retry), left: 0 };
  }
  b.hits.push(now);
  return { ok: true, left: limit - b.hits.length };
}
/* 定期清理，避免内存无限增长 */
setInterval(function () {
  const now = Date.now();
  buckets.forEach(function (b, k) {
    b.hits = b.hits.filter(function (t) { return now - t < 10 * 60 * 1000; });
    if (!b.hits.length) buckets.delete(k);
  });
}, 5 * 60 * 1000).unref();

/* ------------------------------ 访客与令牌 ------------------------------ */
function clientIp(req) {
  return String(req.socket && req.socket.remoteAddress || '').replace(/^::ffff:/, '');
}
function isLocal(req) {
  const ip = clientIp(req);
  return ip === '127.0.0.1' || ip === '::1' || ip === 'localhost' || ip === '';
}
function parseCookies(req) {
  const out = {};
  String(req.headers.cookie || '').split(';').forEach(function (p) {
    const i = p.indexOf('=');
    if (i > 0) out[p.slice(0, i).trim()] = decodeURIComponent(p.slice(i + 1).trim());
  });
  return out;
}
/* 匿名访客 id：优先 cookie，其次 IP 兜底；不采集任何个人信息 */
function visitorId(req, res) {
  const c = parseCookies(req);
  let id = c.rp_vid;
  if (!/^[a-f0-9]{16,64}$/.test(String(id || ''))) {
    id = crypto.randomBytes(12).toString('hex');
    res.setHeader('Set-Cookie', 'rp_vid=' + id + '; Path=/; Max-Age=31536000; SameSite=Lax; HttpOnly');
  }
  return id;
}
function safeEqual(a, b) {
  const A = Buffer.from(String(a || ''), 'utf8');
  const B = Buffer.from(String(b || ''), 'utf8');
  if (A.length !== B.length) return false;
  return crypto.timingSafeEqual(A, B);
}
/* 后台「能不能被访问到」与「有没有令牌」是两件事，必须同时成立。
   ★ 公布版的关键：后台只允许 本机（含 SSH 隧道，源地址就是回环）或 settings.admin.allowIps 里列的 IP。
     仅凭令牌不再足以从公网打开后台 —— 令牌万一泄露，也不至于让人直接进后台。
   默认 allowIps 为空 = 只有本机/隧道能进。 */
function adminReachable(req, settings) {
  if (isLocal(req)) return true;
  const list = (settings && settings.admin && Array.isArray(settings.admin.allowIps))
    ? settings.admin.allowIps : [];
  if (!list.length) return false;
  const ip = clientIp(req);
  return list.some(function (x) { return String(x).trim() === ip; });
}

/* 管理令牌：请求头 x-admin-token 或 Authorization: Bearer；
   也接受 /admin?token=xxx 这种一次性入口（仅用于打开后台页面，之后由前端存进 sessionStorage）。
   未配置令牌时只允许本机。 */
function adminAllowed(req, adminToken, query) {
  if (!adminToken) return isLocal(req);
  const h = String(req.headers['x-admin-token'] || '');
  const auth = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (safeEqual(h, adminToken) || safeEqual(auth, adminToken)) return true;
  if (query) {
    const m = /(?:^|&)token=([^&]*)/.exec(String(query));
    if (m && safeEqual(decodeURIComponent(m[1]), adminToken)) return true;
  }
  return false;
}

/* ------------------------------ 模型配置（不外泄） ------------------------------ */
let modelCache = null, modelMtime = 0;
function readModelConfig() {
  let st = 0;
  try { st = fs.statSync(MODEL_FILE).mtimeMs; } catch (e) { st = 0; }
  if (modelCache && st === modelMtime) return modelCache;
  modelMtime = st;
  let cfg = {};
  if (st) {
    try { cfg = JSON.parse(fs.readFileSync(MODEL_FILE, 'utf8')) || {}; } catch (e) { console.error('model.json 解析失败：' + e.message); cfg = {}; }
  }
  /* 环境变量优先，便于部署时不落盘密钥 */
  const env = {
    enabled: process.env.MODEL_ENABLED,
    base: process.env.MODEL_BASE,
    key: process.env.MODEL_KEY,
    model: process.env.MODEL_NAME,
    temp: process.env.MODEL_TEMP
  };
  Object.keys(env).forEach(function (k) {
    if (env[k] === undefined || env[k] === '') return;
    cfg[k] = (k === 'enabled') ? (env[k] === '1' || env[k] === 'true') : env[k];
  });
  modelCache = {
    enabled: cfg.enabled === true || cfg.enabled === 'true',
    base: String(cfg.base || '').replace(/\/+$/, ''),
    key: String(cfg.key || ''),
    model: String(cfg.model || ''),
    temp: Number(cfg.temp) || 0.85,
    dailyQuota: cfg.dailyQuota !== undefined && Number(cfg.dailyQuota) >= 0 ? Number(cfg.dailyQuota) : 30,
    maxTokens: Number(cfg.maxTokens) > 0 ? Number(cfg.maxTokens) : 800,
    timeoutMs: Number(cfg.timeoutMs) > 0 ? Number(cfg.timeoutMs) : 45000
  };
  return modelCache;
}
function isLocalBase(base) {
  try {
    const u = new URL(String(base || ''));
    const h = u.hostname.toLowerCase();
    return h === '127.0.0.1' || h === 'localhost' || h === '::1';
  } catch (e) { return false; }
}
function modelReady() {
  const m = readModelConfig();
  /* 本机推理服务（Ollama / LM Studio）不需要 key，别逼着人家编一个假的 */
  return !!(m.enabled && m.base && m.model && (m.key || isLocalBase(m.base)));
}
/* 给前端的公开信息：有没有服务端模型、用的是哪个模型、额度多少
   （绝不含 key；地址只对外暴露一个「是不是跑在本机」的布尔值，前端要据此提示速度） */
function publicModelInfo() {
  const m = readModelConfig();
  const ready = modelReady();
  return {
    serverModel: ready,
    model: ready ? m.model : '',
    local: ready ? isLocalBase(m.base) : false,
    dailyQuota: m.dailyQuota
  };
}

/* ------------------------------ 每日额度 ------------------------------ */
let quota = null;
function today() { const d = new Date(); return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate(); }
function loadQuota() {
  if (quota) return quota;
  try { quota = JSON.parse(fs.readFileSync(QUOTA_FILE, 'utf8')) || {}; } catch (e) { quota = {}; }
  return quota;
}
function saveQuota() {
  try {
    const tmp = QUOTA_FILE + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(quota), 'utf8');
    fs.renameSync(tmp, QUOTA_FILE);
  } catch (e) { /* 落盘失败不阻断请求 */ }
}
function quotaOf(vid) {
  const q = loadQuota();
  if (q.day !== today()) { q.day = today(); q.used = {}; saveQuota(); }
  if (!q.used) q.used = {};
  const limit = readModelConfig().dailyQuota;
  const used = q.used[vid] || 0;
  return { used: used, limit: limit, left: Math.max(0, limit - used), resetAt: nextMidnight() };
}
function nextMidnight() {
  const d = new Date();
  d.setHours(24, 0, 0, 0);
  return d.getTime();
}
function consumeQuota(vid) {
  const info = quotaOf(vid);
  if (info.left <= 0) return { ok: false, info: info };
  const q = loadQuota();
  q.used[vid] = (q.used[vid] || 0) + 1;
  saveQuota();
  return { ok: true, info: quotaOf(vid) };
}
function refundQuota(vid) {
  const q = loadQuota();
  if (q.used && q.used[vid]) { q.used[vid] = Math.max(0, q.used[vid] - 1); saveQuota(); }
}

/* ------------------------------ 脱敏 ------------------------------ */
const SECRET_KEYS = ['key', 'apiKey', 'apikey', 'token', 'secret', 'password'];
function sanitizeSettings(obj) {
  const seen = new WeakSet();
  function walk(v) {
    if (!v || typeof v !== 'object') return v;
    if (seen.has(v)) return undefined;
    seen.add(v);
    if (Array.isArray(v)) return v.map(walk);
    const out = {};
    Object.keys(v).forEach(function (k) {
      if (SECRET_KEYS.indexOf(k) !== -1) return;      // 密钥类字段一律不下发
      out[k] = walk(v[k]);
    });
    return out;
  }
  return walk(obj);
}

/* ------------------------------ 出站地址校验（防 SSRF） ------------------------------ */
/* 允许：https 公网地址；或明确写 localhost / 127.0.0.1 的本机推理服务。
   拒绝：http 公网、内网网段、云元数据地址（169.254.169.254）等。 */
const dns = require('dns');
function isPrivateIp(ip) {
  if (!ip) return true;
  const v = String(ip).replace(/^::ffff:/, '');
  if (v === '::1' || v === '127.0.0.1' || v === '0.0.0.0') return true;
  if (/^127\./.test(v)) return true;
  if (/^10\./.test(v)) return true;
  if (/^192\.168\./.test(v)) return true;
  if (/^169\.254\./.test(v)) return true;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(v)) return true;
  if (/^f[cd][0-9a-f]{2}:/i.test(v)) return true;      // IPv6 ULA
  return false;
}
function checkOutbound(base) {
  return new Promise(function (resolve) {
    let u;
    try { u = new URL(String(base || '')); } catch (e) { return resolve({ ok: false, reason: '地址格式不对' }); }
    const host = u.hostname.toLowerCase();
    const localOk = (host === '127.0.0.1' || host === 'localhost' || host === '::1');
    if (u.protocol !== 'https:' && !(u.protocol === 'http:' && localOk)) {
      return resolve({ ok: false, reason: '只允许 https 地址（本机推理服务可用 http://127.0.0.1）' });
    }
    if (localOk) return resolve({ ok: true, host: host });
    dns.lookup(host, function (err, ip) {
      if (err) return resolve({ ok: false, reason: '域名解析失败' });
      if (isPrivateIp(ip)) return resolve({ ok: false, reason: '不允许指向内网地址' });
      resolve({ ok: true, host: host, ip: ip });
    });
  });
}

module.exports = {
  MODEL_FILE: MODEL_FILE,
  applySecurityHeaders: applySecurityHeaders,
  rateLimit: rateLimit,
  clientIp: clientIp,
  isLocal: isLocal,
  visitorId: visitorId,
  adminAllowed: adminAllowed,
  adminReachable: adminReachable,
  readModelConfig: readModelConfig,
  modelReady: modelReady,
  publicModelInfo: publicModelInfo,
  quotaOf: quotaOf,
  consumeQuota: consumeQuota,
  refundQuota: refundQuota,
  sanitizeSettings: sanitizeSettings,
  checkOutbound: checkOutbound
};
