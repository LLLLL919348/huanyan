/* 测试替身：一个最小的 OpenAI 兼容端点，用来端到端验证 /api/chat 代理
   用法： node tools/fake-model.js 5699
   它会把收到的 messages 里 system 的长度回显出来，方便确认提示词确实是服务端组装的。 */
const http = require('http');
const PORT = Number(process.argv[2] || 5699);

http.createServer(function (req, res) {
  /* GET /models：给「测试连接 / 拉模型列表」用 */
  if (req.method === 'GET' && req.url.indexOf('/models') !== -1) {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({
      object: 'list',
      data: [{ id: 'fake-chat', object: 'model' }, { id: 'fake-chat-pro', object: 'model' }]
    }));
  }
  if (req.method !== 'POST' || req.url.indexOf('/chat/completions') === -1) {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    return res.end('{"error":"not found"}');
  }
  let raw = '';
  req.on('data', function (c) { raw += c; });
  req.on('end', function () {
    let body = {};
    try { body = JSON.parse(raw); } catch (e) { }
    const msgs = body.messages || [];
    const sys = msgs.filter(function (m) { return m.role === 'system'; }).map(function (m) { return m.content; }).join('\n');
    const lastUser = (msgs.filter(function (m) { return m.role === 'user'; }).slice(-1)[0] || {}).content || '';
    const hasAuth = !!req.headers.authorization;
    const reply = '（测试替身）收到 system ' + sys.length + ' 字 · ' +
      '含行为台词协议=' + /行为台词协议/.test(sys) + ' · ' +
      '含本场剧情规则=' + /本场专属剧情规则/.test(sys) + ' · ' +
      '含耐心状态=' + /耐心状态/.test(sys) + ' · ' +
      '带密钥=' + hasAuth + ' · 模型=' + (body.model || '') + ' · 玩家说=' + String(lastUser).slice(0, 20) +
      '\n<<<STATE {"hp":0,"affinity":1,"progress":6,"flag":"none","aid":null,"reason":"测试"}>>>';
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ choices: [{ message: { role: 'assistant', content: reply } }] }));
  });
}).listen(PORT, '127.0.0.1', function () {
  console.log('假模型端点已启动： http://127.0.0.1:' + PORT + '/v1/chat/completions');
});
