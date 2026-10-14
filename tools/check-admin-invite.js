/* ==========================================================================
   后台「邀请码」页 · 逻辑验收（不需要浏览器）

   为什么这么测：本机这套无头 Edge 里，admin/index.html 的 iframe load 事件与外层
   启动链都不稳定（截图里资源页与设置页都是空的），靠它证明不了邀请码页好不好用。
   与其跟无头时序纠缠，不如把这一页真正做的事放进可控环境跑：
     从 admin/admin.js 里切出 inviteTab 那一段（它有明确的起止注释），
     在 vm 里补上它用到的几个外部依赖（$ / $$ / API / esc / toast）与一个最小 DOM 桩，
     然后直接调它的 init()/info()，断言"页面被写成了什么、点按钮又发了什么请求"。
   这样测的是页面里那一段真实代码，而不是复制品。

   覆盖：
     ① info() 把概览写进 #inviteKv（开关状态 / 有效码数量 / 凭证有效期）
     ② 表格：码、四种状态中文（可用/已停用/已过期/未启用）、备注、永久、轮数
     ③ 生成：POST action=create，带 count/days/note，并回显新码、清空备注
     ④ 开关：change → POST action=toggle
     ⑤ 停用 / 恢复：POST action=update，disabled 取反
     ⑥ 删除：confirm 后 POST action=delete
     ⑦ 保存凭证有效期：POST action=update + sessionDays
     ⑧ 点码复制：剪贴板拿到完整码
     ⑨ 管理接口报错不静默：顶部提示"读取失败"

   用法： node tools/check-admin-invite.js      最后一行固定打印 === 完成 ===
   ========================================================================== */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ADMIN_JS = path.join(__dirname, '..', 'admin', 'admin.js');
const START = '/* ------------------------------ 邀请码 ------------------------------ */';
const END = '/* ------------------------------ 标签页 ------------------------------ */';

let pass = 0, fail = 0;
function ok(cond, label, extra) {
  console.log((cond ? '  \u2713 ' : '  \u2717 ') + label + (extra ? '  \u2014\u2014 ' + extra : ''));
  if (cond) pass++; else fail++;
}

/* ------------------------------ 最小 DOM 桩 ------------------------------ */
function makeEl(id, tag) {
  const el = {
    id: id || '', tagName: String(tag || 'div').toUpperCase(),
    innerHTML: '', textContent: '', value: '', checked: false, disabled: false,
    className: '', style: {}, dataset: {}, children: [],
    _listeners: {}, _attrs: {},
    classList: {
      _s: new Set(),
      add: function (c) { this._s.add(c); },
      remove: function (c) { this._s.delete(c); },
      contains: function (c) { return this._s.has(c); },
      toggle: function (c, on) { if (on === undefined) { this._s.has(c) ? this._s.delete(c) : this._s.add(c); } else if (on) this._s.add(c); else this._s.delete(c); }
    },
    addEventListener: function (ev, fn) { (el._listeners[ev] = el._listeners[ev] || []).push(fn); },
    removeEventListener: function () { },
    /* 派发事件：arg 是假 event（target 指到调用方给的元素，用来模拟事件冒泡到容器） */
    dispatch: function (ev, arg) {
      (el._listeners[ev] || []).forEach(function (fn) { fn(arg || { target: el, preventDefault: function () { } }); });
    },
    querySelector: function () { return null; },
    querySelectorAll: function () { return []; },
    appendChild: function (c) { el.children.push(c); return c; },
    remove: function () { },
    setAttribute: function (k, v) { el._attrs[k] = v; },
    getAttribute: function (k) { return el._attrs[k]; },
    closest: function () { return null; },
    scrollIntoView: function () { },
    getBoundingClientRect: function () { return { top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0 }; },
    insertBefore: function (n) { el.children.unshift(n); return n; },
    focus: function () { }, select: function () { }, contains: function () { return false; }
  };
  return el;
}

const IDS = ['inviteEnabled', 'inviteCount', 'inviteDays', 'inviteNote', 'inviteSessionDays',
  'btnInviteCreate', 'btnInviteSaveCfg', 'btnInviteReload', 'inviteKv', 'inviteTable', 'inviteHint', 'inviteMade'];
const els = {};
IDS.forEach(function (id) { els[id] = makeEl(id, 'input'); });
els.inviteCount.value = '1';
els.inviteDays.value = '30';
els.inviteSessionDays.value = '90';

/* ------------------------------ 假服务端 ------------------------------ */
const server = {
  enabled: false, sessionDays: 90,
  codes: [
    { id: 'a1', code: 'AAAA-BBBB-CCCC-DDDD', note: '阿岚-手机', createdAt: 1791900000000, expiresAt: 1792500000000, disabled: false, used: 12, lastUsedAt: 1791930000000, state: 'active' },
    { id: 'a2', code: 'EEEE-FFFF-GGGG-HHHH', note: '', createdAt: 1791900000000, expiresAt: 0, disabled: true, used: 0, lastUsedAt: 0, state: 'disabled' },
    { id: 'a3', code: 'IIII-JJJJ-KKKK-LLLL', note: '过期的', createdAt: 1791900000000, expiresAt: 1791000000000, disabled: false, used: 3, lastUsedAt: 0, state: 'expired' }
  ]
};
let calls = [];
function inviteList() {
  return {
    enabled: server.enabled, sessionDays: server.sessionDays,
    codes: server.codes.map(function (c) {
      const st = !server.enabled ? 'off' : (c.disabled ? 'disabled' : ((c.expiresAt && Date.now() > c.expiresAt) ? 'expired' : 'active'));
      return Object.assign({}, c, { state: st });
    })
  };
}
function handle(body) {
  calls.push(body);
  const b = body || {};
  if (b.action === 'toggle') server.enabled = b.enabled === true;
  else if (b.action === 'create') {
    for (let i = 0; i < (b.count || 1); i++) {
      server.codes.unshift({
        id: 'new' + i, code: 'NEW' + i + '-AAAA-BBBB-CCCC', note: b.note || '', createdAt: Date.now(),
        expiresAt: b.days > 0 ? Date.now() + b.days * 86400000 : 0, disabled: false, used: 0, lastUsedAt: 0, state: 'off'
      });
    }
  } else if (b.action === 'update') {
    if (b.sessionDays !== undefined && (b.id === undefined || b.id === '')) server.sessionDays = b.sessionDays;
    else {
      const it = server.codes.filter(function (c) { return c.id === b.id; })[0];
      if (it) {
        if (b.disabled !== undefined) it.disabled = b.disabled === true;
        if (b.expiresAt !== undefined) it.expiresAt = b.expiresAt;
      }
    }
  } else if (b.action === 'delete') {
    server.codes = server.codes.filter(function (c) { return c.id !== b.id; });
  }
  return { ok: true, made: (b.action === 'create') ? ['NEW0-AAAA-BBBB-CCCC'] : undefined, invite: inviteList() };
}

/* ------------------------------ 抽出 inviteTab 并执行 ------------------------------ */
console.log('=== 后台「邀请码」页逻辑验收（真实代码 + DOM 桩 + 假服务端）===');
const src = fs.readFileSync(ADMIN_JS, 'utf8');
const i0 = src.indexOf(START);
const i1 = src.indexOf(END);
if (i0 === -1 || i1 === -1 || i1 <= i0) {
  console.log('  \u2717 在 admin/admin.js 里找不到邀请码段的起止注释（被改名了？）');
  console.log('=== 完成 ===');
  process.exit(1);
}
const block = src.slice(i0, i1);

const sandbox = {
  console: console, setTimeout: setTimeout, Promise: Promise, Date: Date, JSON: JSON, Math: Math,
  Number: Number, String: String, Array: Array, Object: Object, Set: Set, isNaN: isNaN,
  confirm: function () { return true; },
  navigator: { clipboard: { writeText: function (v) { sandbox.__copied = v; return Promise.resolve(); } } },
  /* inviteTab 用到的外部依赖，按真实语义给最小实现 */
  $: function (sel) { const m = /^#([A-Za-z0-9_-]+)$/.exec(String(sel)); return m ? els[m[1]] : null; },
  $$: function () { return []; },
  esc: function (s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); },
  toast: function (msg, kind) { sandbox.__toasts.push({ msg: msg, kind: kind }); },
  __toasts: [],
  __copied: null,
  __failGet: false,
  API: {
    get: function (url) {
      if (sandbox.__failGet) return Promise.reject(new Error('HTTP 403'));
      return Promise.resolve({ ok: true, invite: inviteList() });
    },
    post: function (url, body) { return Promise.resolve(handle(body)); }
  }
};
sandbox.globalThis = sandbox;

/* ★ vm 里顶层 `const` 只是脚本内的词法绑定，不会挂到 sandbox 上（`var` 才会）。
   所以把这一句改写成显式赋值，才能从外面拿到 inviteTab。 */
const blockExposed = block.replace('const inviteTab = (function () {', 'globalThis.inviteTab = (function () {');
if (blockExposed === block) {
  console.log('  \u2717 没找到 `const inviteTab = (function () {`（结构改了？）');
  console.log('=== 完成 ===');
  process.exit(1);
}
try {
  vm.runInNewContext(blockExposed, sandbox, { filename: 'admin/admin.js#inviteTab' });
} catch (e) {
  console.log('  \u2717 邀请码段执行失败：' + (e && e.message));
  console.log(String((e && e.stack) || '').split('\n').slice(0, 5).join('\n'));
  console.log('=== 完成 ===');
  process.exit(1);
}
const inviteTab = sandbox.inviteTab;
ok(!!inviteTab && typeof inviteTab.init === 'function' && typeof inviteTab.info === 'function',
  '从 admin.js 抽出的 inviteTab 可用（init / info）');
if (!inviteTab) { console.log('=== 完成 ==='); process.exit(1); }

/* ------------------------------ 用例 ------------------------------ */
(async function () {
  const tick = function () { return new Promise(function (r) { setTimeout(r, 20); }); };
  const ev = function (id) {
    return { target: { closest: function (sel) { return sel === '[data-inv]' ? { dataset: { inv: id[0], id: id[1] } } : null; } } };
  };

  inviteTab.init();
  inviteTab.info();
  await tick();

  /* ① 概览（未启用） */
  ok(/未开启/.test(els.inviteKv.innerHTML), '概览写明「未开启」');
  ok(/共 3 个/.test(els.inviteKv.innerHTML), '统计了邀请码总数',
    els.inviteKv.innerHTML.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').slice(0, 90));
  ok(/90 天/.test(els.inviteKv.innerHTML), '显示凭证有效期 90 天');

  /* ② 表格 */
  const html = els.inviteTable.innerHTML;
  ok(/AAAA-BBBB-CCCC-DDDD/.test(html), '表格里有码本身');
  ok(/未启用/.test(html), '未启用时状态列全是「未启用」');
  ok(/阿岚-手机/.test(html), '备注进表格');
  ok(/永久/.test(html), 'expiresAt=0 显示「永久」');
  ok(/>12</.test(html), '对话轮数进表格');

  server.enabled = true;
  inviteTab.info();
  await tick();
  const h2 = els.inviteTable.innerHTML;
  ok(/可用/.test(h2) && /已停用/.test(h2) && /已过期/.test(h2), '开启后三种状态各自正确（可用 / 已停用 / 已过期）');
  ok(/已开启/.test(els.inviteKv.innerHTML), '概览显示「已开启」');
  ok(/已开启/.test(els.inviteHint.textContent), '顶部提示写着已开启', els.inviteHint.textContent);

  /* ③ 生成 */
  calls = [];
  els.inviteCount.value = '2';
  els.inviteDays.value = '7';
  els.inviteNote.value = '验收批次';
  els.btnInviteCreate.dispatch('click');
  await tick();
  const c = calls[0] || {};
  ok(c.action === 'create' && c.count === 2 && c.days === 7 && c.note === '验收批次',
    '生成按钮发出 create（数量 / 天数 / 备注都对）', JSON.stringify(c));
  ok(/NEW0-AAAA-BBBB-CCCC/.test(els.inviteMade.innerHTML), '页面回显了刚生成的码');
  ok(els.inviteNote.value === '', '生成后清空备注输入框');

  /* ④ 开关 */
  calls = [];
  els.inviteEnabled.checked = false;
  els.inviteEnabled.dispatch('change');
  await tick();
  ok((calls[0] || {}).action === 'toggle' && calls[0].enabled === false, '开关变化发出 toggle(enabled=false)',
    JSON.stringify(calls[0]));

  /* ⑤ 停用 */
  calls = [];
  els.inviteTable.dispatch('click', ev(['toggle', 'a1']));
  await tick();
  ok((calls[0] || {}).action === 'update' && calls[0].id === 'a1' && calls[0].disabled === true,
    '点「停用」发出 update(disabled=true)', JSON.stringify(calls[0]));

  /* ⑥ 删除 */
  calls = [];
  els.inviteTable.dispatch('click', ev(['del', 'a2']));
  await tick();
  ok((calls[0] || {}).action === 'delete' && calls[0].id === 'a2', '点「删除」发出 delete(id=a2)', JSON.stringify(calls[0]));

  /* ⑦ 保存凭证有效期 */
  calls = [];
  els.inviteSessionDays.value = '45';
  els.btnInviteSaveCfg.dispatch('click');
  await tick();
  ok((calls[0] || {}).action === 'update' && calls[0].sessionDays === 45,
    '「保存凭证有效期」发出 update(sessionDays=45)', JSON.stringify(calls[0]));

  /* ⑧ 点码复制 */
  sandbox.__copied = null;
  els.inviteTable.dispatch('click', {
    target: { closest: function (sel) { return sel === '.inv-code' ? { dataset: { code: 'AAAA-BBBB-CCCC-DDDD' } } : null; } }
  });
  await tick();
  ok(sandbox.__copied === 'AAAA-BBBB-CCCC-DDDD', '点码会复制完整邀请码到剪贴板', String(sandbox.__copied));

  /* ⑨ 读取失败要说话 */
  sandbox.__failGet = true;
  inviteTab.info();
  await tick();
  ok(/读取失败/.test(els.inviteHint.textContent), '管理接口报错时顶部提示「读取失败」', els.inviteHint.textContent);
  sandbox.__failGet = false;

  console.log('');
  console.log(fail === 0 ? '=== 全部通过（' + pass + ' 项）===' : '=== 失败 ' + fail + ' 项 / 通过 ' + pass + ' 项 ===');
  console.log('=== 完成 ===');
  process.exit(fail === 0 ? 0 : 1);
})();
