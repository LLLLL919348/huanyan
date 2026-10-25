/* 鐢ㄤ竴涓亣 SMTP 鏈嶅姟鍣ㄩ獙璇?mailer.js 鐨勫崗璁疄鐜帮紙涓嶈繛鐪熼偖绠憋級 */
'use strict';
const net = require('net');
const mailer = require('../server/mailer');

let got = null;

const srv = net.createServer(function (sock) {
  sock.setEncoding('utf8');
  let buf = '';
  let inData = false;
  let authStage = 0;
  sock.write('220 fake.smtp ready\r\n');
  sock.on('data', function (chunk) {
    buf += chunk;
    let idx;
    while ((idx = buf.indexOf('\r\n')) !== -1) {
      const line = buf.slice(0, idx);
      buf = buf.slice(idx + 2);
      if (inData) {
        if (line === '.') { inData = false; sock.write('250 queued\r\n'); }
        else got = (got || '') + line + '\n';
        continue;
      }
      const up = line.toUpperCase();
      if (up.startsWith('EHLO')) sock.write('250-fake.smtp\r\n250-AUTH LOGIN\r\n250 SIZE 10240000\r\n');
      else if (up === 'AUTH LOGIN') { authStage = 1; sock.write('334 VXNlcm5hbWU6\r\n'); }
      else if (authStage === 1) {
        const user = Buffer.from(line, 'base64').toString('utf8');
        authStage = 2;
        sock.write('334 UGFzc3dvcmQ6\r\n');
        console.log('  鏈嶅姟鍣ㄦ敹鍒扮殑鐢ㄦ埛鍚? ' + user);
      } else if (authStage === 2) {
        const pass = Buffer.from(line, 'base64').toString('utf8');
        console.log('  鏈嶅姟鍣ㄦ敹鍒扮殑鎺堟潈鐮? ' + (pass === 'test-pass' ? '鉁?姝ｇ‘' : '鉁?' + pass));
        authStage = 3;
        sock.write('235 ok\r\n');
      } else if (up.startsWith('MAIL FROM')) { console.log('  MAIL FROM: ' + line); sock.write('250 ok\r\n'); }
      else if (up.startsWith('RCPT TO')) { console.log('  RCPT TO: ' + line); sock.write('250 ok\r\n'); }
      else if (up === 'DATA') { inData = true; sock.write('354 go\r\n'); }
      else if (up === 'QUIT') { sock.write('221 bye\r\n'); sock.end(); }
      else sock.write('250 ok\r\n');
    }
  });
});

srv.listen(0, '127.0.0.1', async function () {
  const port = srv.address().port;
  console.log('鍋?SMTP 鐩戝惉 127.0.0.1:' + port);
  const cfg = { host: '127.0.0.1', port: port, secure: false, user: 'me@example.com', pass: 'test-pass', from: 'me@example.com', fromName: '骞昏█' };
  try {
    /* 鍋囨湇鍔″櫒涓嶅鍛?STARTTLS锛屾墍浠ヨ繖閲屽簲璇ユ槑纭姤閿?鈥斺€?姝ｅソ楠岃瘉鎻愮ず */
    await mailer.send(cfg, 'you@example.com', '娴嬭瘯涓婚', '浣犲ソ锛岃繖鏄獙璇佺爜 123456');
    console.log('鉁?搴旇鎶?涓嶆敮鎸?STARTTLS"鍗存垚鍔熶簡');
  } catch (e) {
    console.log('STARTTLS 缂哄け鏃剁殑鎶ラ敊锛堥鏈燂級: ' + e.message);
  }
  srv.close();
  console.log('=== 瀹屾垚 ===');
});

