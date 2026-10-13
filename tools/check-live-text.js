/* 端到端看一眼：站点真实一轮的「原始输出 → 客户端清理后的成品」
   用法： node tools/check-live-text.js [资源id] [你的话] */
const http = require('http');
const resId = process.argv[2] || 'yuye-zhensuo';
const ask = process.argv[3] || '我是来找妹妹的，今晚来过谁？';

/* 借用站点自己的解析逻辑（和浏览器里跑的是同一份 api.js） */
global.RP = {
  settings: { get: () => ({ combat: { maxHp: 20 }, safety: { bannedOutput: [] }, assistant: {}, score: {} }) },
  util: { clamp: (v, a, b) => Math.max(a, Math.min(b, v)) },
  safety: { scan: () => ({ level: 'ok' }) },
  store: { get: () => ({ user: { name: '旅人' } }), active: () => null },
  acts: { memoryHint: () => '' },
  chat: { moodOf: () => ({ name: '冷淡' }) },
  contentGuard: null
};
require('D:/agent/roleplay-studio/assets/js/acts.js');
require('D:/agent/roleplay-studio/assets/js/api.js');

function post(path, payload) {
  return new Promise(function (resolve) {
    const d = Buffer.from(JSON.stringify(payload), 'utf8');
    const t0 = Date.now();
    const r = http.request({
      host: '127.0.0.1', port: 5599, path: path, method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': d.length }
    }, function (x) {
      let b = '';
      x.setEncoding('utf8');
      x.on('data', c => b += c);
      x.on('end', () => { let j = null; try { j = JSON.parse(b); } catch (e) { } resolve({ sec: (Date.now() - t0) / 1000, json: j, raw: b }); });
    });
    r.on('error', e => resolve({ sec: 0, json: null, raw: e.message }));
    r.write(d); r.end();
  });
}

(async function () {
  const r = await post('/api/chat', {
    resourceId: resId,
    state: { userName: '旅人', hp: 20, maxHp: 20, turn: 1, progress: 0, warned: 0, mood: '冷淡' },
    messages: [{ role: 'user', content: ask }]
  });
  const raw = String((r.json && r.json.text) || r.raw || '');
  const parsed = RP.api.parseState(raw);
  const acts = RP.acts.parse(parsed.text).acts;
  console.log('耗时 ' + r.sec.toFixed(1) + 's');
  console.log('---- 模型原始输出（' + raw.length + ' 字）----');
  console.log(raw.replace(/\s+/g, ' ').slice(0, 500));
  console.log('---- 清理后给玩家看的（' + parsed.text.length + ' 字）----');
  console.log(parsed.text);
  console.log('---- 判定 ----');
  console.log('状态尾注：' + JSON.stringify(parsed.state));
  console.log('行为台词：' + (acts.length ? acts.map(a => a.effect + (a.hp ? ' hp=' + a.hp : '')).join('、') : '无'));
  console.log('残留 STATE/占位符：' + (/STATE|\$REPLY\$|<br/i.test(parsed.text) ? '有（要查）' : '无'));
})();
