/* ==========================================================================
   邮箱验证码登录（零依赖）
   - 账号：data/accounts.json，只存邮箱（脱敏返回给前端）、创建/最近登录时间、状态
   - 验证码：进程内存，6 位数字，10 分钟过期，最多试 5 次，用完即焚
   - 会话：HMAC 签名的 HttpOnly Cookie（rp_sess），30 天；密钥优先 AUTH_SECRET，
     否则从 ADMIN_TOKEN 派生（和原来的邀请凭证一个思路）
   - 限流：同一邮箱 60 秒一次；同一 IP 每小时 5 次；全局每小时 100 封（防被当发信机）

   注意：邮箱登录 ≠ 实名。它解决的是"有账号、可封禁、可联系"，身份核验仍需手机号/证件。
   ========================================================================== */
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DATA_DIR = path.join(__dirname, '..', 'data');
const ACC_FILE = path.join(DATA_DIR, 'accounts.json');
const COOKIE = 'rp_sess';
const TTL_DAYS = 30;

/* ------------------------------ 存储 ------------------------------ */
function readJson(file, dflt) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) { return dflt; }
}
function writeJson(file, obj) {
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(obj, null, 2) + '\n', 'utf8');
  try { fs.chmodSync(tmp, 0o600); } catch (e) { }
  fs.renameSync(tmp, file);
}
function loadAccounts() {
  const d = readJson(ACC_FILE, null);
  if (d && Array.isArray(d.items)) return { v: 1, items: d.items };
  return { v: 1, items: [] };
}
function saveAccounts(doc) { writeJson(ACC_FILE, { v: 1, items: doc.items || [] }); }

function normEmail(s) { return String(s || '').trim().toLowerCase(); }
function validEmail(s) {
  const t = normEmail(s);
  if (t.length < 6 || t.length > 120) return false;
  return /^[a-z0-9._%+\-]+@[a-z0-9.\-]+\.[a-z]{2,}$/.test(t);
}
function maskEmail(s) {
  const t = normEmail(s);
  const at = t.indexOf('@');
  if (at < 1) return t;
  const name = t.slice(0, at);
  const host = t.slice(at);
  if (name.length <= 2) return name[0] + '***' + host;
  return name.slice(0, 2) + '***' + name.slice(-1) + host;
}

function findAccount(doc, email) {
  const e = normEmail(email);
  return doc.items.filter(function (a) { return a.email === e; })[0] || null;
}
function ensureAccount(email) {
  const doc = loadAccounts();
  let a = findAccount(doc, email);
  if (!a) {
    a = {
      id: 'u-' + Date.now().toString(36) + '-' + crypto.randomBytes(3).toString('hex'),
      email: normEmail(email),
      createdAt: Date.now(),
      lastLoginAt: 0,
      status: 'active'
    };
    doc.items.push(a);
    saveAccounts(doc);
  }
  return { doc: doc, account: a };
}

/* ------------------------------ 验证码 ------------------------------ */
const CODES = new Map();       // email -> {code, exp, tries, sentAt}
const LAST_SENT = new Map();   // email -> 最近一次发码时间（用于 60 秒节流，验证成功后仍然保留）
const IP_SENT = new Map();     // ip -> [timestamps]
let GLOBAL_SENT = [];          // 全局发送时间戳（防发信轰炸）

function sweep(now) {
  CODES.forEach(function (v, k) { if (v.exp < now) CODES.delete(k); });
  LAST_SENT.forEach(function (v, k) { if (v < now - 3600e3) LAST_SENT.delete(k); });
  IP_SENT.forEach(function (arr, k) {
    const keep = arr.filter(function (t) { return t > now - 3600e3; });
    if (keep.length) IP_SENT.set(k, keep); else IP_SENT.delete(k);
  });
  GLOBAL_SENT = GLOBAL_SENT.filter(function (t) { return t > now - 3600e3; });
}

/* 返回 {required?: 'email'|'ip'|'global'} 表示被限流 */
function rateState(email, ip) {
  const now = Date.now();
  sweep(now);
  const last = LAST_SENT.get(normEmail(email)) || 0;
  if (last && now - last < 60000) return { wait: Math.ceil((60000 - (now - last)) / 1000) };
  const arr = IP_SENT.get(ip) || [];
  if (arr.length >= 5) return { blocked: 'ip' };
  if (GLOBAL_SENT.length >= 100) return { blocked: 'global' };
  return {};
}

function issueCode(email, ip) {
  const now = Date.now();
  const code = String(Math.floor(100000 + Math.random() * 900000));
  LAST_SENT.set(normEmail(email), now);
  CODES.set(normEmail(email), { code: code, exp: now + 10 * 60000, tries: 0, sentAt: now });
  const arr = IP_SENT.get(ip) || [];
  arr.push(now);
  IP_SENT.set(ip, arr);
  GLOBAL_SENT.push(now);
  return code;
}

function checkCode(email, code) {
  const k = normEmail(email);
  const rec = CODES.get(k);
  if (!rec) return { ok: false, reason: '验证码已失效，请重新获取' };
  if (rec.exp < Date.now()) { CODES.delete(k); return { ok: false, reason: '验证码已过期，请重新获取' }; }
  rec.tries++;
  if (rec.tries > 5) { CODES.delete(k); return { ok: false, reason: '尝试次数过多，请重新获取验证码' }; }
  if (String(code || '').trim() !== rec.code) return { ok: false, reason: '验证码不正确' };
  CODES.delete(k);
  return { ok: true };
}

/* ------------------------------ 会话 ------------------------------ */
function secret() {
  return process.env.AUTH_SECRET || ('huanyan-sess-' + (process.env.ADMIN_TOKEN || 'dev-only-secret'));
}
function sign(payload) {
  const body = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
  const mac = crypto.createHmac('sha256', secret()).update(body).digest('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
  return body + '.' + mac;
}
function unsign(token) {
  const t = String(token || '');
  const i = t.lastIndexOf('.');
  if (i < 1) return null;
  const body = t.slice(0, i);
  const mac = t.slice(i + 1);
  const want = crypto.createHmac('sha256', secret()).update(body).digest('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
  if (mac.length !== want.length) return null;
  try { if (!crypto.timingSafeEqual(Buffer.from(mac), Buffer.from(want))) return null; } catch (e) { return null; }
  try {
    const p = JSON.parse(Buffer.from(body.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'));
    if (!p || !p.a || !p.exp || p.exp < Date.now()) return null;
    return p;
  } catch (e) { return null; }
}
function makeSession(accountId) {
  return sign({ a: accountId, exp: Date.now() + TTL_DAYS * 86400000 });
}
function cookieHeader(token) {
  return COOKIE + '=' + encodeURIComponent(token) + '; Path=/; Max-Age=' + (TTL_DAYS * 86400) + '; SameSite=Lax; HttpOnly';
}
function clearCookie() { return COOKIE + '=; Path=/; Max-Age=0; SameSite=Lax; HttpOnly'; }

function tokenFromReq(req) {
  const raw = String(req.headers.cookie || '');
  const parts = raw.split(';');
  for (let i = 0; i < parts.length; i++) {
    const p = parts[i].trim();
    if (p.indexOf(COOKIE + '=') === 0) {
      try { return decodeURIComponent(p.slice(COOKIE.length + 1)); } catch (e) { return ''; }
    }
  }
  return '';
}
/* 当前请求对应的账号（没有则 null；被封禁的也当没有） */
function current(req) {
  const p = unsign(tokenFromReq(req));
  if (!p) return null;
  const doc = loadAccounts();
  const a = doc.items.filter(function (x) { return x.id === p.a; })[0];
  if (!a || a.status !== 'active') return null;
  return a;
}
function publicAccount(a) {
  if (!a) return null;
  return { id: a.id, email: maskEmail(a.email), createdAt: a.createdAt, lastLoginAt: a.lastLoginAt };
}

module.exports = {
  COOKIE: COOKIE,
  validEmail: validEmail,
  maskEmail: maskEmail,
  normalize: normEmail,
  loadAccounts: loadAccounts,
  saveAccounts: saveAccounts,
  ensureAccount: ensureAccount,
  rateState: rateState,
  issueCode: issueCode,
  checkCode: checkCode,
  makeSession: makeSession,
  cookieHeader: cookieHeader,
  clearCookie: clearCookie,
  tokenFromReq: tokenFromReq,
  current: current,
  publicAccount: publicAccount
};
