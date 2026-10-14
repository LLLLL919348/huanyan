/* ==========================================================================
   幻言 · 邀请码准入（零依赖）
   用途：网站可以随便被人看到，但「开口对话」必须持有邀请码。
     · 邀请码由站长在后台生成，服务端校验，可设置有效期、可随时停用
     · 访客在页面上输入一次，服务端发一个「签名凭证」的 HttpOnly Cookie；
       浏览器本地只留一个布尔标记（用于显示），真正的判据始终在服务端
     · 凭证用 HMAC 签名，有效期与邀请码同步；停用 / 删除邀请码 = 已发出的凭证立刻失效

   数据文件 data/invite.json（不入库、权限 600）：
     { v:1, enabled:true, sessionDays:90,
       codes:[{ id, code, note, createdAt, expiresAt, disabled, used }] }
   code 明文存在服务端文件里（站长自己要看得到、要能发给人），文件不对外提供。
   ========================================================================== */
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DATA_DIR = path.join(__dirname, '..', 'data');
const INVITE_FILE = path.join(DATA_DIR, 'invite.json');

/* 签名密钥：优先环境变量，其次由 ADMIN_TOKEN / 模型 key 派生。
   不额外要求站长多配一个变量 —— 但派生值随 ADMIN_TOKEN 变化，换令牌等于让旧凭证全部失效。 */
function signingSecret() {
  if (process.env.INVITE_SECRET) return String(process.env.INVITE_SECRET);
  const seed = String(process.env.ADMIN_TOKEN || '') || String(process.env.MODEL_KEY || '') || 'huanyan-invite-local';
  return crypto.createHash('sha256').update('huanyan-invite|' + seed).digest('hex');
}

/* ------------------------------ 读写 ------------------------------ */
let cache = null, cacheMtime = -1;

function defaults() {
  return { v: 1, enabled: false, sessionDays: 90, codes: [] };
}
function normalize(raw) {
  const d = defaults();
  const o = (raw && typeof raw === 'object' && !Array.isArray(raw)) ? raw : {};
  const out = {
    v: 1,
    enabled: o.enabled === true,
    sessionDays: Number(o.sessionDays) > 0 ? Math.min(3650, Math.round(Number(o.sessionDays))) : d.sessionDays,
    codes: []
  };
  (Array.isArray(o.codes) ? o.codes : []).forEach(function (c) {
    if (!c || typeof c !== 'object') return;
    const code = String(c.code || '').trim().toUpperCase();
    if (!/^[A-Z0-9-]{4,32}$/.test(code)) return;
    out.codes.push({
      id: String(c.id || code),
      code: code,
      note: String(c.note || '').slice(0, 80),
      createdAt: Number(c.createdAt) || Date.now(),
      expiresAt: Number(c.expiresAt) || 0,          // 0 = 永久有效
      disabled: c.disabled === true,
      used: Number(c.used) || 0,                    // 累计对话轮数（仅作观察，不设上限）
      lastUsedAt: Number(c.lastUsedAt) || 0
    });
  });
  return out;
}

function load(force) {
  let st = -1;
  try { st = fs.statSync(INVITE_FILE).mtimeMs; } catch (e) { st = -1; }
  if (!force && cache && st === cacheMtime) return cache;
  cacheMtime = st;
  let raw = null;
  if (st !== -1) {
    try { raw = JSON.parse(fs.readFileSync(INVITE_FILE, 'utf8')); }
    catch (e) { console.error('invite.json 解析失败：' + e.message); raw = null; }
  }
  cache = normalize(raw);
  return cache;
}
function save(cfg) {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    const tmp = INVITE_FILE + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(cfg, null, 2) + '\n', 'utf8');
    fs.renameSync(tmp, INVITE_FILE);
    try { fs.chmodSync(INVITE_FILE, 0o600); } catch (e) { /* Windows 上会失败，忽略 */ }
    cache = cfg;
    try { cacheMtime = fs.statSync(INVITE_FILE).mtimeMs; } catch (e) { cacheMtime = -1; }
  } catch (e) { console.error('invite.json 写盘失败：' + e.message); }
}

/* ------------------------------ 邀请码 ------------------------------ */
/* 生成码：4 组 4 位，去掉了容易看错的 0/O/1/I，方便口头念、手抄 */
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
function genCode() {
  const bytes = crypto.randomBytes(16);
  let out = '';
  for (let i = 0; i < 16; i++) out += ALPHABET[bytes[i] % ALPHABET.length];
  return out.slice(0, 4) + '-' + out.slice(4, 8) + '-' + out.slice(8, 12) + '-' + out.slice(12, 16);
}
function findCode(cfg, code) {
  const c = String(code || '').trim().toUpperCase().replace(/\s+/g, '');
  if (!c) return null;
  return cfg.codes.filter(function (x) { return x.code === c; })[0] || null;
}
/* 一个邀请码此刻是否可用（启用中、未停用、未过期） */
function codeState(cfg, item) {
  if (!item) return { ok: false, reason: '邀请码不存在' };
  if (cfg.enabled !== true) return { ok: false, reason: '本站当前未开启邀请制' };
  if (item.disabled) return { ok: false, reason: '这个邀请码已被停用' };
  if (item.expiresAt && Date.now() > item.expiresAt) return { ok: false, reason: '这个邀请码已过期' };
  return { ok: true, reason: '' };
}
function publicList() {
  const cfg = load();
  const now = Date.now();
  return {
    enabled: cfg.enabled,
    sessionDays: cfg.sessionDays,
    codes: cfg.codes.map(function (c) {
      const st = (function () {
        if (!cfg.enabled) return 'off';
        if (c.disabled) return 'disabled';
        if (c.expiresAt && now > c.expiresAt) return 'expired';
        return 'active';
      })();
      return {
        id: c.id, code: c.code, note: c.note, createdAt: c.createdAt,
        expiresAt: c.expiresAt, disabled: c.disabled, used: c.used, lastUsedAt: c.lastUsedAt,
        state: st
      };
    })
  };
}

/* ------------------------------ 签名凭证 ------------------------------ */
/* 凭证内容：码 + 过期时间。Base64URL(payload) + '.' + HMAC 前 32 位十六进制。
   服务端每次请求都验签 + 回查邀请码状态，所以「停用邀请码」能立刻踢掉已经进来的访客。 */
function sign(payload) {
  return crypto.createHmac('sha256', signingSecret()).update(payload).digest('hex').slice(0, 32);
}
function issueGrant(code, days) {
  const exp = Date.now() + (Number(days) > 0 ? Number(days) : 90) * 86400000;
  const payload = Buffer.from(JSON.stringify({ c: String(code).toUpperCase(), e: exp }), 'utf8')
    .toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return { token: payload + '.' + sign(payload), exp: exp };
}
function verifyGrant(token) {
  const t = String(token || '');
  const i = t.lastIndexOf('.');
  if (i <= 0) return null;
  const payload = t.slice(0, i), mac = t.slice(i + 1);
  const want = sign(payload);
  if (mac.length !== want.length) return null;
  if (!crypto.timingSafeEqual(Buffer.from(mac), Buffer.from(want))) return null;
  let obj = null;
  try {
    obj = JSON.parse(Buffer.from(payload.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'));
  } catch (e) { return null; }
  if (!obj || !obj.c) return null;
  if (Number(obj.e) && Date.now() > Number(obj.e)) return { code: obj.c, exp: Number(obj.e), expired: true };
  return { code: obj.c, exp: Number(obj.e), expired: false };
}

/* ------------------------------ 对外接口 ------------------------------ */
const COOKIE = 'rp_invite';
/* 本次请求是否已通过邀请制准入。
   返回 { ok, via:'off'|'grant'|'local', code } —— ok:true 才允许对话。 */
function check(token) {
  const cfg = load();
  if (cfg.enabled !== true) return { ok: true, via: 'off', code: '' };
  const g = verifyGrant(token);
  if (!g || g.expired) return { ok: false, via: '', code: '', reason: g && g.expired ? '凭证已过期，请重新输入邀请码' : '需要邀请码' };
  const item = findCode(cfg, g.code);
  const st = codeState(cfg, item);
  if (!st.ok) return { ok: false, via: '', code: '', reason: st.reason };
  return { ok: true, via: 'grant', code: item.code };
}
/* 兑换邀请码：成功返回 {ok, token, exp, days}；失败返回 {ok:false, reason} */
function redeem(input) {
  const cfg = load();
  if (cfg.enabled !== true) return { ok: false, reason: '本站当前未开启邀请制' };
  const item = findCode(cfg, input);
  const st = codeState(cfg, item);
  if (!st.ok) return { ok: false, reason: st.reason };
  const g = issueGrant(item.code, cfg.sessionDays);
  return { ok: true, token: g.token, exp: g.exp, days: cfg.sessionDays, code: item.code };
}
/* 记一次使用（按邀请码计数，纯观察用，不限制）。
   每轮都写盘没必要 —— 攒够 5 次或隔了 10 分钟再落一次。 */
let pendingUse = 0, lastFlush = 0;
function noteUse(code) {
  if (!code) return;
  const cfg = load();
  const item = findCode(cfg, code);
  if (!item) return;
  item.used = (item.used || 0) + 1;
  item.lastUsedAt = Date.now();
  pendingUse++;
  const now = Date.now();
  if (pendingUse >= 5 || now - lastFlush > 600000) { lastFlush = now; pendingUse = 0; save(cfg); }
}

module.exports = {
  INVITE_FILE: INVITE_FILE,
  COOKIE: COOKIE,
  load: load,
  save: save,
  publicList: publicList,
  genCode: genCode,
  redeem: redeem,
  check: check,
  noteUse: noteUse,
  verifyGrant: verifyGrant
};
