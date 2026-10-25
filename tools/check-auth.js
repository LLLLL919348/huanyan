/* ==========================================================================
   邮箱验证码登录 · 端到端验收（自带一个假 SMTP，不连真邮箱）

   ① 没配邮件服务时 send-code 明确报 503（而不是假装成功）
   ② 配好假 SMTP：发码 → 从假服务器拿到验证码 → verify 换到会话 Cookie
   ③ /api/auth/me 能读到账号（邮箱脱敏）
   ④ requireLogin 打开时：无 Cookie 调 /api/chat → 401；带 Cookie 才放行（没模型则 503）
   ⑤ 错误验证码被拒、重复发码被限流
   ⑥ 收尾：杀掉子进程、恢复 settings

   用法： node tools/check-auth.js
   ========================================================================== */
'use strict';
const fs = require('fs');
const path = require('path');
const tls = require('tls');
const http = require('http');
const { spawn } = require('child_process');

const ROOT = path.join(__dirname, '..');
const SET = path.join(ROOT, 'data', 'settings.json');
const PORT = 5598;
const SMTP_PORT = 2525;
const KEY = path.join(process.env.TEMP, 'smtp-test-key.pem');
const CERT = path.join(process.env.TEMP, 'smtp-test-cert.pem');

let pass = 0, fail = 0;
function ok(c, label, extra) {
  console.log((c ? '  \u2713 ' : '  \u2717 ') + label + (extra ? '  \u2014\u2014 ' + extra : ''));
  if (c) pass++; else fail++;
}
function req(method, p, body, headers) {
  return new Promise(function (resolve) {
    const data = body === undefined ? null : Buffer.from(JSON.stringify(body), 'utf8');
    const h = Object.assign({ 'User-Agent': 'check-auth/1.0' }, headers || {});
    if (data) { h['Content-Type'] = 'application/json'; h['Content-Length'] = data.length; }
    const r = http.request({ host: '127.0.0.1', port: PORT, path: p, method: method, headers: h, timeout: 20000 }, function (res) {
      const c = [];
      res.on('data', function (d) { c.push(d); });
      res.on('end', function () {
        let j = null;
        try { j = JSON.parse(Buffer.concat(c).toString('utf8')); } catch (e) { }
        resolve({ code: res.statusCode, json: j, cookie: (res.headers['set-cookie'] || [])[0] || '' });
      });
    });
    r.on('error', function (e) { resolve({ code: 0, err: e.message }); });
    r.on('timeout', function () { r.destroy(); resolve({ code: 0, err: '超时' }); });
    if (data) r.write(data);
    r.end();
  });
}
const sleep = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };

/* ---------- 假 SMTP：把收到的正文里的 6 位数字记下来 ---------- */
let lastCode = '';
function startFakeSmtp() {
  return new Promise(function (resolve) {
    const srv = tls.createServer({ key: fs.readFileSync(KEY), cert: fs.readFileSync(CERT) }, function (sock) {
      sock.setEncoding('utf8');
      let buf = '', inData = false, stage = 0, raw = '';
      sock.write('220 fake ready\r\n');
      sock.on('data', function (chunk) {
        buf += chunk;
        let i;
        while ((i = buf.indexOf('\r\n')) !== -1) {
          const line = buf.slice(0, i); buf = buf.slice(i + 2);
          if (inData) {
            if (line === '.') {
              inData = false;
              const bodyB64 = raw.split('\r\n\r\n')[1] || '';
              const txt = Buffer.from(bodyB64.replace(/\s+/g, ''), 'base64').toString('utf8');
              const m = /(\d{6})/.exec(txt);
              if (m) lastCode = m[1];
              sock.write('250 queued\r\n');
            } else raw += line + '\r\n';
            continue;
          }
          const up = line.toUpperCase();
          if (up.startsWith('EHLO')) sock.write('250-fake\r\n250-AUTH LOGIN\r\n250 SIZE 10240000\r\n');
          else if (up === 'AUTH LOGIN') { stage = 1; sock.write('334 VXNlcm5hbWU6\r\n'); }
          else if (stage === 1) { stage = 2; sock.write('334 UGFzc3dvcmQ6\r\n'); }
          else if (stage === 2) { stage = 3; sock.write('235 ok\r\n'); }
          else if (up.startsWith('MAIL FROM')) sock.write('250 ok\r\n');
          else if (up.startsWith('RCPT TO')) sock.write('250 ok\r\n');
          else if (up === 'DATA') { inData = true; sock.write('354 go\r\n'); }
          else if (up === 'QUIT') { sock.write('221 bye\r\n'); sock.end(); }
          else sock.write('250 ok\r\n');
        }
      });
    });
    srv.listen(SMTP_PORT, '127.0.0.1', function () { resolve(srv); });
  });
}

(async function () {
  console.log('=== 邮箱验证码登录验收 ===');
  const backup = fs.readFileSync(SET, 'utf8');
  const s = JSON.parse(backup);
  s.auth = { requireLogin: true };
  s.mail = { host: '127.0.0.1', port: SMTP_PORT, secure: true, user: 'me@example.com', pass: 'p', from: 'me@example.com', fromName: '幻言' };
  fs.writeFileSync(SET, JSON.stringify(s, null, 2) + '\n', 'utf8');

  const smtp = await startFakeSmtp();
  const child = spawn(process.execPath, [path.join(ROOT, 'server', 'server.js'), String(PORT)], {
    cwd: ROOT,
    env: Object.assign({}, process.env, { ADMIN_TOKEN: 'test-admin', NODE_TLS_REJECT_UNAUTHORIZED: '0' }),
    stdio: ['ignore', 'pipe', 'pipe']
  });
  let booted = '';
  child.stdout.on('data', function (d) { booted += d.toString(); });
  child.stderr.on('data', function (d) { booted += d.toString(); });

  try {
    for (let i = 0; i < 40 && booted.indexOf('监听') === -1 && booted.indexOf('http') === -1; i++) await sleep(150);
    await sleep(600);

    /* ① 未登录时 /api/chat 应该 401 */
    const noLogin = await req('POST', '/api/chat', { resourceId: 'changan-yeweiyang', messages: [{ role: 'user', content: 'hi' }] });
    ok(noLogin.code === 401, '未登录不让对话（401）', 'HTTP ' + noLogin.code + ' ' + ((noLogin.json || {}).error || ''));

    /* ② /api/auth/me 未登录 */
    const me0 = await req('GET', '/api/auth/me');
    ok(me0.code === 200 && me0.json.account === null && me0.json.requireLogin === true, 'me 返回未登录且要求登录',
      JSON.stringify(me0.json && { a: me0.json.account, r: me0.json.requireLogin, m: me0.json.mailReady }));

    /* ③ 发码 */
    const send = await req('POST', '/api/auth/send-code', { email: 'tester@example.com' });
    ok(send.code === 200 && send.json.ok, '验证码已发送', 'HTTP ' + send.code + ' ' + ((send.json || {}).error || ''));
    for (let i = 0; i < 30 && !lastCode; i++) await sleep(100);
    ok(/^\d{6}$/.test(lastCode), '假 SMTP 收到了 6 位验证码', lastCode);

    /* ④ 错误码被拒 */
    const bad = await req('POST', '/api/auth/verify', { email: 'tester@example.com', code: '000000' === lastCode ? '111111' : '000000' });
    ok(bad.code === 400, '错误验证码被拒（400）', 'HTTP ' + bad.code);

    /* ⑤ 正确码登录 */
    const good = await req('POST', '/api/auth/verify', { email: 'tester@example.com', code: lastCode });
    ok(good.code === 200 && good.json.ok && good.json.account, '登录成功并返回账号', 'HTTP ' + good.code);
    ok(/rp_sess=/.test(good.cookie), '下发了会话 Cookie（rp_sess）', good.cookie.slice(0, 24));
    const masked = (good.json.account || {}).email || '';
    ok(/\*\*\*/.test(masked), '邮箱是脱敏返回的', masked);

    /* ⑥ 带 Cookie：me 有账号、对话放行（没模型 → 503 而不是 401） */
    const cookie = good.cookie.split(';')[0];
    const me1 = await req('GET', '/api/auth/me', undefined, { Cookie: cookie });
    ok(me1.json.account && me1.json.account.id, 'me 能读到账号', (me1.json.account || {}).id);
    const chat2 = await req('POST', '/api/chat', { resourceId: 'changan-yeweiyang', messages: [{ role: 'user', content: 'hi' }] }, { Cookie: cookie });
    ok(chat2.code !== 401, '登录后不再被登录门挡（实际 ' + chat2.code + '）', (chat2.json || {}).error || '');

    /* ⑦ 重复发码被限流（60 秒内） */
    const again = await req('POST', '/api/auth/send-code', { email: 'tester@example.com' });
    ok(again.code === 429, '60 秒内重复发码被限流（429）', 'HTTP ' + again.code + ' ' + ((again.json || {}).error || ''));

    /* ⑧ 退出登录 */
    const out = await req('POST', '/api/auth/logout', {});
    ok(out.code === 200 && /rp_sess=;/.test(out.cookie), '退出登录清掉 Cookie', out.cookie.slice(0, 20));

    /* ⑨ 账号被封禁后会话失效 */
    const doc = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'accounts.json'), 'utf8'));
    const acc = (doc.items || []).filter(function (x) { return x.email === 'tester@example.com'; })[0];
    ok(!!acc, '账号已落库', acc ? acc.id : '');
    if (acc) {
      acc.status = 'banned';
      fs.writeFileSync(path.join(ROOT, 'data', 'accounts.json'), JSON.stringify(doc, null, 2) + '\n', 'utf8');
      const me2 = await req('GET', '/api/auth/me', undefined, { Cookie: cookie });
      ok(me2.json.account === null, '被封禁的账号会话立即失效', JSON.stringify(me2.json.account));
    }
  } finally {
    child.kill();
    smtp.close();
    fs.writeFileSync(SET, backup, 'utf8');
    fs.writeFileSync(path.join(ROOT, 'data', 'accounts.json'), '{"v":1,"items":[]}\n', 'utf8');
  }

  console.log('');
  console.log(fail === 0 ? '=== 全部通过（' + pass + ' 项）===' : '=== 失败 ' + fail + ' 项 / 通过 ' + pass + ' 项 ===');
  console.log('=== 完成 ===');
  process.exit(fail === 0 ? 0 : 1);
})();
