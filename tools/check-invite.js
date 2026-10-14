/* ==========================================================================
   邀请码准入 · 端到端验收（针对一个正在运行的后端）

   用法：
     node tools/check-invite.js [baseUrl]
     默认 http://127.0.0.1:5599

   它做的是"黑盒"验证 —— 只发 HTTP 请求，不看代码：
     ① 关着的时候：不填码也能对话（基线，证明这层不是无条件拦人）
     ② 开着 + 无码：/api/session 报锁定，/api/chat 必须是 403（而且不能真去调模型）
     ③ 错码 / 空码：403 且不发凭证
     ④ 对码：拿到凭证 + Set-Cookie
     ⑤ 带 Cookie 的对话请求必须能过准入（不要求模型可用：503「未配置模型」也算过了这一关）
     ⑥ 带 x-invite-grant 头（Cookie 丢失时的兜底）同样能过
     ⑦ 停用该码：已发出的凭证立刻失效
     ⑧ 过期码：立刻失效
     ⑨ 删除该码：立刻失效
     ⑩ 管理接口 /api/invite-admin 不带令牌必须被拒

   前置：后端必须已设置 ADMIN_TOKEN（第 ①②⑦⑧⑨⑩ 步要调管理接口）。
   退出码 0 = 全部通过。最后一行固定打印 === 完成 ===
   ========================================================================== */
'use strict';
const http = require('http');
const https = require('https');

const BASE = process.argv[2] || 'http://127.0.0.1:5599';
const TOKEN = process.env.ADMIN_TOKEN || '';
const u = new URL(BASE);
const lib = u.protocol === 'https:' ? https : http;

let pass = 0, fail = 0;
function ok(cond, label, extra) {
  console.log((cond ? '  \u2713 ' : '  \u2717 ') + label + (extra ? '  \u2014\u2014 ' + extra : ''));
  if (cond) pass++; else fail++;
}
function req(method, path, body, headers) {
  return new Promise(function (resolve) {
    const data = body === undefined ? null : Buffer.from(JSON.stringify(body), 'utf8');
    const h = Object.assign({}, headers || {});
    if (data) { h['Content-Type'] = 'application/json'; h['Content-Length'] = data.length; }
    const r = lib.request({
      hostname: u.hostname, port: u.port || (u.protocol === 'https:' ? 443 : 80),
      path: path, method: method, headers: h, timeout: 20000
    }, function (res) {
      const chunks = [];
      res.on('data', function (c) { chunks.push(c); });
      res.on('end', function () {
        let json = null;
        try { json = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch (e) { }
        resolve({ code: res.statusCode, json: json, setCookie: res.headers['set-cookie'] || [] });
      });
    });
    r.on('error', function (e) { resolve({ code: 0, err: e.message, setCookie: [] }); });
    r.on('timeout', function () { try { r.destroy(); } catch (e) { } resolve({ code: 0, err: '超时', setCookie: [] }); });
    if (data) r.write(data);
    r.end();
  });
}
const adm = function (method, path, body) {
  return req(method, path, body, { 'x-admin-token': TOKEN });
};
function cookieOf(res) {
  const c = (res.setCookie || []).filter(function (s) { return /^rp_invite=/.test(s); })[0];
  return c ? c.split(';')[0] : '';
}
/* 对话请求：只发一个最小的合法 body。没配模型时会得到 503 —— 那说明已经过了邀请关。 */
const CHAT = { resourceId: '__assistant', assistant: true, messages: [{ role: 'user', content: '在吗' }] };

(async function () {
  console.log('=== 邀请码准入验收：' + BASE + ' ===');
  if (!TOKEN) {
    console.log('  ! 没有设置 ADMIN_TOKEN 环境变量 —— 管理接口相关的用例会被跳过（用 127.0.0.1 启动的服务默认只允许本机，仍可继续）');
  }
  const health = await req('GET', '/api/health');
  if (health.code !== 200) {
    console.log('  \u2717 后端没有响应（' + (health.code || health.err) + '）—— 请先启动服务');
    console.log('=== 完成 ===');
    process.exit(1);
  }
  console.log('  后端在线 · 资源 ' + (health.json && health.json.resources) + ' 条\n');

  /* ---------- ① 基线：关着的时候不拦 ---------- */
  console.log('--- ① 未开启邀请制时不拦人（基线）---');
  let r = await adm('POST', '/api/invite-admin', { action: 'toggle', enabled: false });
  ok(r.code === 200, '关闭邀请制', r.code + (r.json && r.json.error ? ' ' + r.json.error : ''));
  r = await req('GET', '/api/session');
  ok(r.code === 200 && r.json && r.json.invite && r.json.invite.enabled === false, '/api/session 报告未启用',
    r.json && r.json.invite ? JSON.stringify(r.json.invite) : '');
  const baseChat = await req('POST', '/api/chat', CHAT, cookieOf(await req('GET', '/api/session')) ? {} : {});
  ok(baseChat.code !== 403, '无码也能对话（不是 403）', 'HTTP ' + baseChat.code + ' ' + ((baseChat.json || {}).error || ''));

  /* ---------- ② 开启 + 无码 = 拦 ---------- */
  console.log('--- ② 开启邀请制后，无码必须被拦 ---');
  const made = await adm('POST', '/api/invite-admin', { action: 'create', count: 1, days: 7, note: '验收脚本' });
  if (made.code !== 200) {
    console.log('  \u2717 生成邀请码失败：' + made.code + ' ' + ((made.json || {}).error || '需要管理令牌'));
    console.log('=== 完成 ===');
    process.exit(1);
  }
  const CODE = made.json.made[0];
  const CODE_ID = made.json.invite.codes[0].id;
  ok(/^[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(CODE), '生成的码格式正确', CODE);
  r = await adm('POST', '/api/invite-admin', { action: 'toggle', enabled: true });
  ok(r.code === 200 && r.json.invite.enabled === true, '开启邀请制', r.code);

  r = await req('GET', '/api/session');
  ok(r.code === 200 && r.json.invite.enabled === true && r.json.invite.unlocked === false,
    '未持凭证：enabled=true / unlocked=false', JSON.stringify(r.json.invite));
  const noCodeChat = await req('POST', '/api/chat', CHAT, { 'x-invite-grant': '' });
  ok(noCodeChat.code === 403, '无码对话被拒（403）', 'HTTP ' + noCodeChat.code);
  ok(/邀请码/.test(String((noCodeChat.json || {}).error || '')), '拒绝理由说得清楚',
    String((noCodeChat.json || {}).error || ''));

  /* ---------- ③ 错码 / 空码 ---------- */
  console.log('--- ③ 错码与空码 ---');
  r = await req('POST', '/api/invite', { code: '' });
  ok(r.code === 400, '空码被拒（400）', r.code + ' ' + ((r.json || {}).error || ''));
  r = await req('POST', '/api/invite', { code: 'ZZZZ-ZZZZ-ZZZZ-ZZZZ' });
  ok(r.code === 403, '错码被拒（403）', r.code + ' ' + ((r.json || {}).error || ''));
  ok(!cookieOf(r), '错码不会发出凭证', cookieOf(r) || '（没有 Set-Cookie）');

  /* ---------- ④ 对码换凭证 ---------- */
  console.log('--- ④ 正确邀请码 ---');
  r = await req('POST', '/api/invite', { code: CODE });
  ok(r.code === 200 && r.json && r.json.ok === true, '兑换成功', r.code);
  const SET = cookieOf(r);
  const GRANT = (r.json || {}).token || '';
  ok(!!SET && /HttpOnly/.test((r.setCookie || []).join(';')), 'Cookie 带 HttpOnly', (r.setCookie || [])[0] || '');
  ok(!!GRANT, '同时返回凭证原文（Cookie 被拦时的兜底）', GRANT ? GRANT.slice(0, 18) + '…' : '');
  ok(r.json.exp > Date.now(), '凭证有未来过期时间', new Date(r.json.exp).toLocaleString('zh-CN'));
  r = await req('GET', '/api/session', undefined, { Cookie: SET });
  ok(r.code === 200 && r.json.invite.unlocked === true, '带 Cookie 查会话：unlocked=true', JSON.stringify(r.json.invite));

  /* ---------- ⑤⑥ 两种凭证途径都能过准入 ---------- */
  console.log('--- ⑤ Cookie 途径 / ⑥ 请求头途径 ---');
  const viaCookie = await req('POST', '/api/chat', CHAT, { Cookie: SET });
  ok(viaCookie.code !== 403, '带 Cookie 的对话请求过了准入关', 'HTTP ' + viaCookie.code + ' ' + ((viaCookie.json || {}).error || ''));
  const viaHeader = await req('POST', '/api/chat', CHAT, { 'x-invite-grant': GRANT });
  ok(viaHeader.code !== 403, '带 x-invite-grant 的对话请求过了准入关', 'HTTP ' + viaHeader.code + ' ' + ((viaHeader.json || {}).error || ''));

  /* ---------- ⑦ 停用立刻失效 ---------- */
  console.log('--- ⑦ 停用该码后，已发出的凭证立刻失效 ---');
  r = await adm('POST', '/api/invite-admin', { action: 'update', id: CODE_ID, disabled: true });
  ok(r.code === 200, '停用', r.code);
  r = await req('GET', '/api/session', undefined, { Cookie: SET });
  ok(r.json.invite.unlocked === false, '停用后 unlocked=false', JSON.stringify(r.json.invite));
  r = await req('POST', '/api/chat', CHAT, { Cookie: SET });
  ok(r.code === 403, '停用后对话被拒（403）', r.code);
  r = await adm('POST', '/api/invite-admin', { action: 'update', id: CODE_ID, disabled: false });
  ok(r.code === 200, '恢复该码', r.code);
  r = await req('GET', '/api/session', undefined, { Cookie: SET });
  ok(r.json.invite.unlocked === true, '恢复后凭证又能用了（凭证本身没被作废）', JSON.stringify(r.json.invite));

  /* ---------- ⑧ 过期码 ---------- */
  console.log('--- ⑧ 把有效期改成已过去的时间 ---');
  r = await adm('POST', '/api/invite-admin', { action: 'update', id: CODE_ID, expiresAt: Date.now() - 60000 });
  ok(r.code === 200, '设为已过期', r.code);
  r = await req('GET', '/api/session', undefined, { Cookie: SET });
  ok(r.json.invite.unlocked === false, '过期后 unlocked=false', JSON.stringify(r.json.invite));
  r = await req('POST', '/api/invite', { code: CODE });
  ok(r.code === 403 && /过期/.test(String((r.json || {}).error || '')), '过期码不能再兑换', r.code + ' ' + ((r.json || {}).error || ''));

  /* ---------- ⑨ 删除 ---------- */
  console.log('--- ⑨ 删除该码 ---');
  r = await adm('POST', '/api/invite-admin', { action: 'delete', id: CODE_ID });
  ok(r.code === 200, '删除成功', r.code);
  r = await req('POST', '/api/invite', { code: CODE });
  ok(r.code === 403 && /不存在/.test(String((r.json || {}).error || '')), '删除后该码提示"不存在"', (r.json || {}).error || '');

  /* ---------- ⑩ 管理接口必须带令牌 ---------- */
  console.log('--- ⑩ 管理接口的令牌校验 ---');
  /* 注意：令牌为空时，服务端对「本机来源」是放行的（isLocal 设计如此，方便站长本机改东西），
     所以本机跑这个脚本时，不带令牌返回 200 是正确行为而不是漏判。
     真正有判据的是「令牌配了、但带错令牌」必须 403 —— 公网上的访客就是这个位置。 */
  if (TOKEN) {
    r = await req('GET', '/api/invite-admin', undefined, { 'x-admin-token': 'wrong-token' });
    ok(r.code === 403, '带错令牌读邀请码列表被拒（403）', r.code + ' ' + ((r.json || {}).error || ''));
    r = await req('POST', '/api/invite-admin', { action: 'toggle', enabled: true }, { 'x-admin-token': 'wrong-token' });
    ok(r.code === 403, '带错令牌开关邀请制被拒（403）', r.code + ' ' + ((r.json || {}).error || ''));
    r = await adm('GET', '/api/invite-admin');
    ok(r.code === 200 && r.json && r.json.invite, '带对令牌可读', r.code);
    r = await req('GET', '/api/invite-admin');
    ok(r.code === 403, '不带令牌（即使来自本机）也被拒（403）', r.code);
  } else {
    r = await req('GET', '/api/invite-admin');
    ok(r.code === 200 || r.code === 403, '未配令牌时本机可读', r.code + '（设计如此；部署后从外网必须 404）');
  }

  /* ---------- 收尾：恢复成"未开启"，别把测试状态留给线上 ---------- */
  console.log('--- 收尾 ---');
  await adm('POST', '/api/invite-admin', { action: 'toggle', enabled: false });
  r = await req('GET', '/api/session');
  ok(r.json.invite.enabled === false, '已恢复为未开启邀请制（验收不留副作用）', JSON.stringify(r.json.invite));

  console.log('');
  console.log(fail === 0 ? '=== 全部通过（' + pass + ' 项）===' : '=== 失败 ' + fail + ' 项 / 通过 ' + pass + ' 项 ===');
  console.log('=== 完成 ===');
  process.exit(fail === 0 ? 0 : 1);
})();
