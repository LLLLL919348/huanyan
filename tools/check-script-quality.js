/* 真机试演：拿站点服务端模型（glm-4-flash）连打几轮，看剧本改完以后的实际表现。
   重点看三件事：
     ① 角色会不会再向玩家索要玩家不知道的信息（比如妹妹的名字）
     ② 每次回复有没有环境细节 + 结尾有没有给出可执行方向
     ③ 玩家报出名字后，角色有没有把它当成"登记完成"来处理

   用法： node tools/check-script-quality.js [资源id] [本机端口]
   ========================================================================== */
'use strict';
const http = require('http');

const RES_ID = process.argv[2] || 'yuye-zhensuo';
const PORT = Number(process.argv[3] || 5599);

/* 预置的几轮发言：都是"玩家确实知道的事"能支撑的句子 */
const TURNS = [
  '大夫，今晚有人来过吗？这把椅子还是温的。',
  '我不看病。我妹妹最后一次定位就在这栋楼，停在十一点零四。',
  '这本接诊簿我能看看吗？上面今晚这一页为什么没有名字？'
];

function post(path, body) {
  return new Promise(function (resolve) {
    const data = Buffer.from(JSON.stringify(body), 'utf8');
    const r = http.request({ host: '127.0.0.1', port: PORT, path: path, method: 'POST', timeout: 90000,
      headers: { 'Content-Type': 'application/json', 'Content-Length': data.length } }, function (res) {
      const c = [];
      res.on('data', function (d) { c.push(d); });
      res.on('end', function () {
        let j = null;
        try { j = JSON.parse(Buffer.concat(c).toString('utf8')); } catch (e) { }
        resolve({ code: res.statusCode, json: j, raw: Buffer.concat(c).toString('utf8') });
      });
    });
    r.on('error', function (e) { resolve({ code: 0, err: e.message }); });
    r.on('timeout', function () { r.destroy(); resolve({ code: 0, err: '超时' }); });
    r.write(data); r.end();
  });
}

function stateOf(text) {
  const m = /<{2,3}\s*STATE\s*[:：]?\s*(\{[\s\S]*?\})\s*>{2,}/i.exec(text);
  if (!m) return null;
  try { return JSON.parse(m[1].replace(/"\s*([A-Za-z_]+)\s*"\s*:/g, '"$1":')); } catch (e) { return null; }
}
function strip(text) {
  return String(text || '').replace(/<{2,3}\s*STATE[\s\S]*?>{2,}/gi, '').trim();
}

(async function () {
  console.log('=== 剧本质量试演：' + RES_ID + '（真模型，端口 ' + PORT + '）===');
  const history = [];
  const state = { userName: '旅人', hp: 20, maxHp: 20, mood: '冷淡', turn: 0, progress: 0, warned: 0, conduct: 0, actMute: 0 };
  let okCount = 0, badCount = 0;

  for (let i = 0; i < TURNS.length; i++) {
    const t = TURNS[i];
    history.push({ role: 'user', content: t });
    const r = await post('/api/chat', { resourceId: RES_ID, state: state, messages: history.slice() });
    if (r.code !== 200 || !r.json || !r.json.ok) {
      console.log('\n第 ' + (i + 1) + ' 轮失败：HTTP ' + r.code + ' ' + ((r.json && r.json.error) || r.raw || r.err || ''));
      break;
    }
    const raw = r.json.text || '';
    const body = strip(raw);
    const st = stateOf(raw) || {};
    state.turn = (state.turn || 0) + 1;
    state.progress = Math.min(100, (state.progress || 0) + (Number(st.progress) || 0));
    state.hp = Math.max(0, (state.hp || 20) - Math.abs(Number(st.hp) || 0));

    console.log('\n──── 第 ' + (i + 1) + ' 轮 ────');
    console.log('玩家：' + t);
    console.log('角色：' + body);
    console.log('状态：' + (st && Object.keys(st).length ? JSON.stringify(st) : '（模型没给状态行）'));

    /* 三条判据 */
    const env = /(雨|灯|钟|椅|纸|簿|药|窗|门|影|水|冷|温|光|声|味|潮|灰|手|袖)/.test(body);
    const hook = /(问|看|翻|摸|拿|递|指|走|坐|数|试|告诉|说|答|查|进|上|下|把|给)/.test(body) && body.length > 40;
    console.log('  环境细节 ' + (env ? '✓' : '✗') + ' · 可执行方向 ' + (hook ? '✓' : '✗') + ' · 长度 ' + body.length);
    if (env) okCount++; else badCount++;
    if (hook) okCount++; else badCount++;
  }

  console.log('\n=== 小结：' + okCount + ' 项通过 / ' + badCount + ' 项未达 ===');
  console.log('=== 完成 ===');
})();
