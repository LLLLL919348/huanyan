/* 用 TLS 假 SMTP（465 形态）验证 mailer.js 的完整成功链路 */
'use strict';
const fs = require('fs');
const path = require('path');
const tls = require('tls');
const mailer = require('../server/mailer');

const KEY = fs.readFileSync(path.join(process.env.TEMP, 'smtp-test-key.pem'));
const CERT = fs.readFileSync(path.join(process.env.TEMP, 'smtp-test-cert.pem'));

let raw = '';
let report = [];

const srv = tls.createServer({ key: KEY, cert: CERT }, function (sock) {
  sock.setEncoding('utf8');
  let buf = '';
  let inData = false;
  let stage = 0;
  sock.write('220 fake.smtp ready\r\n');
  sock.on('data', function (chunk) {
    buf += chunk;
    let i;
    while ((i = buf.indexOf('\r\n')) !== -1) {
      const line = buf.slice(0, i);
      buf = buf.slice(i + 2);
      if (inData) {
        if (line === '.') { inData = false; sock.write('250 queued as 12345\r\n'); }
        else raw += line + '\r\n';
        continue;
      }
      const up = line.toUpperCase();
      if (up.startsWith('EHLO')) sock.write('250-fake.smtp\r\n250-AUTH LOGIN\r\n250 SIZE 10240000\r\n');
      else if (up === 'AUTH LOGIN') { stage = 1; sock.write('334 VXNlcm5hbWU6\r\n'); }
      else if (stage === 1) { report.push('user=' + Buffer.from(line, 'base64').toString('utf8')); stage = 2; sock.write('334 UGFzc3dvcmQ6\r\n'); }
      else if (stage === 2) { report.push('pass=' + Buffer.from(line, 'base64').toString('utf8')); stage = 3; sock.write('235 Authentication successful\r\n'); }
      else if (up.startsWith('MAIL FROM')) { report.push(line); sock.write('250 ok\r\n'); }
      else if (up.startsWith('RCPT TO')) { report.push(line); sock.write('250 ok\r\n'); }
      else if (up === 'DATA') { inData = true; sock.write('354 End data with <CR><LF>.<CR><LF>\r\n'); }
      else if (up === 'QUIT') { sock.write('221 bye\r\n'); sock.end(); }
      else sock.write('250 ok\r\n');
    }
  });
});

srv.listen(0, '127.0.0.1', async function () {
  const port = srv.address().port;
  const cfg = { host: '127.0.0.1', port: port, secure: true, user: 'me@example.com', pass: 'test-pass', from: 'me@example.com', fromName: '幻言' };
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
  try {
    await mailer.send(cfg, 'you@example.com', '登录验证码', '你的验证码是 123456，10 分钟内有效。');
    console.log('✓ 发送成功');
    report.forEach(function (l) { console.log('   ' + l); });
    const parts = raw.split('\r\n\r\n');
    const head = parts[0] || '';
    const bodyB64 = (parts[1] || '').replace(/\s+/g, '');
    const decoded = Buffer.from(bodyB64, 'base64').toString('utf8');
    console.log('  Subject 已 MIME 编码: ' + (/Subject: =\?UTF-8\?B\?/.test(head) ? '✓' : '✗'));
    console.log('  正文解码: ' + decoded.replace(/\r?\n/g, ' / ').slice(0, 80));
    console.log('  ' + (/验证码是 123456/.test(decoded) ? '✓ 验证码正确' : '✗ 正文不对'));
  } catch (e) {
    console.log('✗ 失败：' + e.message);
  }
  srv.close();
  console.log('=== 完成 ===');
});
