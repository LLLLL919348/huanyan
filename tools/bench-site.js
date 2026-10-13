/* 量真实一轮的耗时：走站点自己的 /api/chat（服务端组装完整提示词 + 本机模型推理）
   用法： node tools/bench-site.js [资源id] [轮数] */
const http = require('http');

const resId = process.argv[2] || 'changan-yeweiyang';
const rounds = Number(process.argv[3] || 2);

function post(path, body) {
  return new Promise(function (resolve) {
    const d = Buffer.from(JSON.stringify(body), 'utf8');
    const t0 = Date.now();
    const r = http.request({
      host: '127.0.0.1', port: 5599, path: path, method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': d.length }
    }, function (x) {
      let b = '';
      x.setEncoding('utf8');
      x.on('data', function (c) { b += c; });
      x.on('end', function () {
        let j = null;
        try { j = JSON.parse(b); } catch (e) { }
        resolve({ sec: (Date.now() - t0) / 1000, status: x.statusCode, json: j, raw: b.slice(0, 200) });
      });
    });
    r.on('error', function (e) { resolve({ sec: (Date.now() - t0) / 1000, status: 0, raw: e.message }); });
    r.write(d); r.end();
  });
}

const state = {
  userName: '旅人', hp: 20, maxHp: 20, mood: '疏离', turn: 0, progress: 0,
  warned: 0, conduct: 0, actMute: 0, items: [], plotItems: []
};

(async function () {
  const history = [];
  const asks = [
    '十年前御史台那桩灭门案，卷宗少了一页。沈明烛，那一页是不是在你手上？',
    '我不要听场面话。那一页上写的是谁的名字？'
  ];
  for (let i = 0; i < rounds; i++) {
    history.push({ role: 'user', content: asks[i % asks.length] });
    const r = await post('/api/chat', { resourceId: resId, state: Object.assign({}, state, { turn: i }), messages: history });
    const text = (r.json && r.json.text) || ('(失败) ' + r.raw);
    console.log('第 ' + (i + 1) + ' 轮: HTTP ' + r.status + ' | 真实耗时 ' + r.sec.toFixed(1) + 's | ' +
      (text.match(/[\u4e00-\u9fa5]/g) || []).length + ' 个汉字 | STATE 尾注=' + /<<<STATE/.test(text) +
      ' | 行为台词=' + /_〔/.test(text));
    console.log('   ' + text.replace(/\s+/g, ' ').slice(0, 160));
    history.push({ role: 'assistant', content: text });
  }
})();
