/* ==========================================================================
   报告收集器：给无头浏览器里的 harness 一个「把结果送出来」的出口。

   为什么需要它：无头 Edge 的 --virtual-time-budget 会快进虚拟时钟，--dump-dom
   往往在真模型的回复到达之前就把 DOM 倒出来了（虚拟时间对长耗时的流式请求不可靠）。
   于是让页面自己 POST 结果出来，读结果就不受 dump 时机影响。

   用法：node tools/report-sink.js [端口]       默认 5799
   页面里这样用：
     fetch('http://127.0.0.1:5799/report', { method:'POST', body: 文本 })   // 简单请求，不触发预检
   ========================================================================== */
const http = require('http');
const PORT = Number(process.argv[2] || 5799);
let lastConv = '';                       // 最近一次收到会话 JSON（截图 harness 用 GET /conv 取回）

http.createServer(function (req, res) {
  /* 跨源简单请求：放行，方便页面直接 POST 文本 */
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', '*');
  if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }

  /* 会话传递：跑完试玩的页面 POST 会话，截图页 GET 回来注入 localStorage */
  if (req.url.indexOf('/conv') === 0) {
    if (req.method === 'POST') {
      let raw = '';
      req.on('data', function (c) { raw += c; });
      req.on('end', function () {
        lastConv = raw;
        console.log('收到会话快照：' + raw.length + ' 字节');
        res.writeHead(200, { 'Content-Type': 'text/plain' });
        res.end('ok');
      });
      return;
    }
    res.writeHead(lastConv ? 200 : 404, { 'Content-Type': 'application/json; charset=utf-8' });
    return res.end(lastConv || '{"error":"还没有会话快照"}');
  }

  if (req.url.indexOf('/report') !== 0) { res.writeHead(404); return res.end('not found'); }
  let raw = '';
  req.on('data', function (c) { raw += c; });
  req.on('end', function () {
    process.stdout.write('\n===== 收到报告（' + new Date().toLocaleTimeString() + '，' + raw.length + ' 字节）=====\n');
    process.stdout.write(raw + '\n');
    process.stdout.write('===== 报告结束 =====\n');
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('ok');
  });
}).listen(PORT, '127.0.0.1', function () {
  console.log('报告收集器已启动： http://127.0.0.1:' + PORT + '/report   （会话快照：/conv）');
});
