/* 端到端验证：自带模型（BYOK）经本站转发 + /api/test-model 的 SSRF 防护
   用法： 先跑 node server/server.js 5599 与 node tools/fake-model.js 5699，再跑本脚本 */
const http = require('http');

const API = 'http://127.0.0.1:5599';
let fails = 0;
function ok(cond, label, extra) {
  if (cond) console.log('  ✓ ' + label);
  else { fails++; console.log('  ✗ ' + label + (extra ? ' — ' + extra : '')); }
}
function req(path, method, body) {
  return new Promise(function (resolve) {
    const data = body ? JSON.stringify(body) : null;
    const r = http.request(API + path, {
      method: method, headers: data ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } : {}
    }, function (res) {
      let b = '';
      res.on('data', function (c) { b += c; });
      res.on('end', function () {
        let j = null;
        try { j = JSON.parse(b); } catch (e) { }
        resolve({ status: res.statusCode, json: j, raw: b });
      });
    });
    r.on('error', function (e) { resolve({ status: 0, json: null, raw: String(e.message) }); });
    if (data) r.write(data);
    r.end();
  });
}

(async function () {
  console.log('【/api/test-model 地址校验】');
  ok((await req('/api/test-model', 'POST', { base: 'http://example.com/v1' })).status === 400,
    'http 公网地址被拒（只允许 https）');
  ok((await req('/api/test-model', 'POST', { base: 'http://169.254.169.254/latest' })).status === 400,
    '云元数据地址 169.254.169.254 被拒');
  ok((await req('/api/test-model', 'POST', { base: 'http://192.168.1.10:8000/v1' })).status === 400,
    '内网地址 192.168.x.x 被拒');
  ok((await req('/api/test-model', 'POST', { base: 'ftp://example.com' })).status === 400,
    '非 http(s) 协议被拒');
  ok((await req('/api/test-model', 'POST', {})).status === 400, '缺地址被拒');

  console.log('【/api/test-model 正常路径（本机假模型）】');
  const t = await req('/api/test-model', 'POST', { base: 'http://127.0.0.1:5699/v1', key: 'sk-fake' });
  ok(t.status === 200 && t.json && t.json.ok === true, '本机地址允许并返回 ok', 'HTTP ' + t.status);
  ok(t.json && Array.isArray(t.json.models) && t.json.models.indexOf('fake-chat') > -1,
    '模型列表解析正确', t.json ? JSON.stringify(t.json.models) : '(无)');

  console.log('【/api/chat 用访客自己的模型（经本站转发）】');
  const q0 = (await req('/api/quota', 'GET')).json;
  const c = await req('/api/chat', 'POST', {
    resourceId: 'whale-girl-xi',
    state: { userName: '旅人', hp: 20, maxHp: 20, mood: '疏离', turn: 1, progress: 0, warned: 0, conduct: 0, actMute: 0 },
    messages: [{ role: 'user', content: '你为什么来岸上？' }],
    userModel: { base: 'http://127.0.0.1:5699/v1', key: 'sk-fake', model: 'fake-chat', temp: 0.8 }
  });
  ok(c.status === 200 && c.json && c.json.ok === true, '转发成功', 'HTTP ' + c.status + ' ' + String(c.raw).slice(0, 120));
  ok(c.json && /测试替身/.test(String(c.json.text || '')), '拿到替身回复');
  ok(c.json && /含行为台词协议=true/.test(String(c.json.text || '')), '服务端组装了完整系统提示词');
  ok(c.json && /带密钥=true/.test(String(c.json.text || '')), '访客的 Key 被转发给上游');
  ok(c.json && /compliance/i.test(String(c.json.text || '')) === false && c.json && c.json.via !== 'server',
    '标识为访客自己的模型（via=' + (c.json && c.json.via) + '）');
  const q1 = (await req('/api/quota', 'GET')).json;
  ok(q0.quota.used === q1.quota.used, '自带模型不消耗站内额度', q0.quota.used + ' → ' + q1.quota.used);

  console.log('【无模型可用时的兜底】');
  const c2 = await req('/api/chat', 'POST', {
    resourceId: 'whale-girl-xi',
    state: { hp: 20, maxHp: 20, turn: 1, progress: 0, warned: 0 },
    messages: [{ role: 'user', content: '你好' }]
  });
  ok(c2.status === 402 || c2.status === 503 || c2.status === 400,
    '站长未配置模型时明确报错而不是空转', 'HTTP ' + c2.status + ' ' + String(c2.json && c2.json.error || '').slice(0, 60));

  console.log('【越权探测】');
  const leak = await req('/data/model.json', 'GET');
  ok(leak.status === 403 || leak.status === 404, 'data/model.json 不可直接读取', 'HTTP ' + leak.status + ' ' + String(leak.raw).slice(0, 60));
  const del = await req('/api/resources', 'DELETE');
  ok(del.status === 401 || del.status === 403 || del.status === 405, '写接口需要管理令牌', 'HTTP ' + del.status);

  console.log(fails === 0 ? '✅ 全部通过' : '!! 失败 ' + fails + ' 项');
})();
