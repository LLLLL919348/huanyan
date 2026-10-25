/* ==========================================================================
   极简 SMTP 发信（零依赖）
   只做一件事：把一封纯文本邮件发出去。支持两种常见形态：
     secure: true  → 直连 TLS（QQ 邮箱 / 163 的 465）
     secure: false → 明文连上后 STARTTLS 升级（587）
   认证：AUTH LOGIN（国内邮箱都用这个）。
   配置来自 settings.mail：{ host, port, secure, user, pass, from, fromName }
   pass 是邮箱的"授权码"，不是登录密码。
   ========================================================================== */
'use strict';
const net = require('net');
const tls = require('tls');

function b64(s) { return Buffer.from(String(s), 'utf8').toString('base64'); }

function ready(cfg) {
  return !!(cfg && cfg.host && cfg.port && cfg.user && cfg.pass && cfg.from);
}

/* 读到一条完整响应（多行响应以 "250 " 结尾，"250-x" 是续行） */
function makeReader(sock) {
  let buf = '';
  let pending = null;
  function pump() {
    if (!pending) return;
    const lines = buf.split('\r\n');
    for (let i = 0; i < lines.length - 1; i++) {
      if (/^\d{3} /.test(lines[i])) {
        const resp = lines.slice(0, i + 1);
        buf = lines.slice(i + 1).join('\r\n');
        const p = pending;
        pending = null;
        p.resolve(resp);
        return;
      }
    }
  }
  sock.on('data', function (d) { buf += d.toString('utf8'); pump(); });
  return function read() {
    return new Promise(function (resolve, reject) {
      pending = { resolve: resolve, reject: reject };
      pump();
    });
  };
}

function send(cfg, to, subject, text) {
  return new Promise(function (resolve, reject) {
    if (!ready(cfg)) return reject(new Error('邮件服务未配置'));
    const host = cfg.host;
    const port = Number(cfg.port) || (cfg.secure ? 465 : 587);
    let sock = null;
    let read = null;
    let finished = false;
    const timer = setTimeout(function () { fail(new Error('SMTP 超时（20 秒）')); }, 20000);

    function fail(err) {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      try { if (sock) sock.destroy(); } catch (e) { }
      reject(err);
    }
    function done() {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      try { sock.write('QUIT\r\n'); sock.end(); } catch (e) { }
      resolve(true);
    }
    function attach(s) {
      s.setEncoding('utf8');
      s.on('error', fail);
      s.on('close', function () { if (!finished) fail(new Error('SMTP 连接被关闭')); });
      read = makeReader(s);
    }
    function cmd(line) { sock.write(line + '\r\n'); return read(); }
    function ok(resp, what) {
      const last = (resp && resp[resp.length - 1]) || '';
      if (!/^[23]/.test(last)) throw new Error('SMTP ' + what + ' 失败：' + resp.join(' '));
      return last;
    }

    try {
      sock = cfg.secure ? tls.connect({ host: host, port: port, servername: host }) : net.connect({ host: host, port: port });
      attach(sock);
    } catch (e) { return fail(e); }

    (async function () {
      try {
        ok(await read(), '问候');
        let ehlo = await cmd('EHLO huanyan');
        if (!cfg.secure) {
          if (ehlo.join('\n').toUpperCase().indexOf('STARTTLS') === -1) throw new Error('该服务器不支持 STARTTLS，请改成 465 端口（直连 TLS）');
          ok(await cmd('STARTTLS'), 'STARTTLS');
          const plain = sock;
          sock = tls.connect({ socket: plain, servername: host });
          attach(sock);
          await new Promise(function (r) { sock.once('secureConnect', r); sock.once('error', r); });
          ehlo = await cmd('EHLO huanyan');
        }
        void ehlo;
        ok(await cmd('AUTH LOGIN'), 'AUTH LOGIN');
        const r1 = await cmd(b64(cfg.user));
        if (!/^334/.test(r1[r1.length - 1])) throw new Error('用户名被拒：' + r1.join(' '));
        const r2 = await cmd(b64(cfg.pass));
        if (!/^235/.test(r2[r2.length - 1])) throw new Error('授权码被拒（注意：要用邮箱的"授权码"，不是登录密码）');
        ok(await cmd('MAIL FROM:<' + cfg.from + '>'), 'MAIL FROM');
        ok(await cmd('RCPT TO:<' + to + '>'), 'RCPT TO');
        ok(await cmd('DATA'), 'DATA');

        const headers = [
          'From: =?UTF-8?B?' + b64(cfg.fromName || '幻言') + '?= <' + cfg.from + '>',
          'To: <' + to + '>',
          'Subject: =?UTF-8?B?' + b64(subject) + '?=',
          'Date: ' + new Date().toUTCString(),
          'MIME-Version: 1.0',
          'Content-Type: text/plain; charset=UTF-8',
          'Content-Transfer-Encoding: base64',
          'Message-ID: <' + Date.now() + '.' + Math.random().toString(36).slice(2) + '@' + (String(cfg.from).split('@')[1] || 'localhost') + '>'
        ].join('\r\n');
        const body = Buffer.from(text, 'utf8').toString('base64').replace(/(.{76})/g, '$1\r\n');
        ok(await cmd(headers + '\r\n\r\n' + body + '\r\n.'), '正文');
        done();
      } catch (e) { fail(e); }
    })();
  });
}

module.exports = { send: send, ready: ready };
