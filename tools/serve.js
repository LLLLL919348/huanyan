/* 幻言 · 极简静态服务器（零依赖）
   用法： node tools/serve.js [端口]
   仅用于本地预览： http://127.0.0.1:5599 */
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const PORT = Number(process.argv[2] || process.env.PORT || 5599);
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.md': 'text/markdown; charset=utf-8'
};

const server = http.createServer(function (req, res) {
  let url = decodeURIComponent(req.url.split('?')[0]);
  if (url === '/') url = '/index.html';
  const file = path.join(ROOT, path.normalize(url).replace(/^([/\\])+/, ''));
  if (!file.startsWith(ROOT)) { res.writeHead(403); res.end('forbidden'); return; }
  fs.readFile(file, function (err, buf) {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('404 ' + url);
      return;
    }
    res.writeHead(200, {
      'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream',
      'Cache-Control': 'no-store'
    });
    res.end(buf);
  });
});

server.on('error', function (e) {
  if (e.code === 'EADDRINUSE') {
    console.log('');
    console.log('端口 ' + PORT + ' 已被占用 —— 很可能本站已经在运行了。');
    console.log('请直接用浏览器打开： http://127.0.0.1:' + PORT + '/');
    console.log('想换一个端口的话：   node tools/serve.js 5600');
    console.log('');
    process.exit(0);
  }
  throw e;
});

server.listen(PORT, '127.0.0.1', function () {
  console.log('幻言 · AI 角色扮演 已启动： http://127.0.0.1:' + PORT + '/');
  console.log('根目录：' + ROOT);
});
