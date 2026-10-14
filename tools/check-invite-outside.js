/* ==========================================================================
   外部视角复测：站在"公网上的陌生人"位置，验证邀请制真的拦得住。
   （和 check-invite.js 的区别：那个要管理令牌、会把邀请制来回开关；
     这个只会用一张已经发出去的邀请码，不碰管理接口。）

   用法： node tools/check-invite-outside.js http://8.138.170.154 <邀请码>
   ========================================================================== */
'use strict';
const http = require('http');
const https = require('https');

const BASE = process.argv[2];
const CODE = process.argv[3] || '';
if (!BASE || !CODE) {
  console.log('用法： node tools/check-invite-outside.js <baseUrl> <邀请码>');
  console.log('=== 完成 ===');
  process.exit(2);
}
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
    const r = lib.request({ hostname: u.hostname, port: u.port || (u.protocol === 'https:' ? 443 : 80), path: path, method: method, headers: h, timeout: 25000 },
      function (res) {
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
const CHAT = { resourceId: '__assistant', assistant: true, messages: [{ role: 'user', content: '在吗' }] };

(async function () {
  console.log('=== 外部视角复测：' + BASE + ' ===');
  let r = await req('GET', '/api/health');
  ok(r.code === 200 && r.json && r.json.invite === true, '线上已开启邀请制', JSON.stringify(r.json));

  r = await req('GET', '/api/session');
  ok(r.json.invite.enabled === true && r.json.invite.unlocked === false, '陌生访客：enabled / unlocked = true / false',
    JSON.stringify(r.json.invite));

  r = await req('POST', '/api/chat', CHAT);
  ok(r.code === 403, '陌生访客直接打 /api/chat → 403（服务端拦，不靠前端藏按钮）', 'HTTP ' + r.code);
  ok(/邀请码/.test(String((r.json || {}).error || '')), '提示可读', (r.json || {}).error || '');

  r = await req('POST', '/api/chat', CHAT, { 'x-invite-grant': 'forged.signature' });
  ok(r.code === 403, '伪造的凭证头也拦（HMAC 验不过）', 'HTTP ' + r.code);

  r = await req('GET', '/api/invite-admin');
  ok(r.code === 404 || r.code === 403, '外部读不到邀请码列表（明文码是门钥匙）', 'HTTP ' + r.code);

  r = await req('POST', '/api/invite', { code: CODE });
  ok(r.code === 200 && r.json && r.json.ok, '持码兑换成功', 'HTTP ' + r.code);
  const SET = (r.setCookie || []).filter(function (s) { return /^rp_invite=/.test(s); })[0];
  ok(!!SET, '服务端下发了邀请凭证 Cookie', SET ? SET.split(';')[0].slice(0, 30) + '…' : '（无）');

  r = await req('POST', '/api/chat', CHAT, { Cookie: SET.split(';')[0] });
  ok(r.code !== 403, '持凭证的对话请求过了准入关', 'HTTP ' + r.code + ' ' + ((r.json || {}).error || ''));

  console.log('');
  console.log(fail === 0 ? '=== 全部通过（' + pass + ' 项）===' : '=== 失败 ' + fail + ' 项 / 通过 ' + pass + ' 项 ===');
  console.log('=== 完成 ===');
  process.exit(fail === 0 ? 0 : 1);
})();
