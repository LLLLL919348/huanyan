/* 真机 UX 校验：把模型的原始输出丢进**前端真正的清洗函数**（assets/js/api.js 的 parseState），
   看玩家最终在气泡里看到的是什么。之前直接看原始输出会高估问题（前端会去重、会摘掉括号里的伪裁决）。

   用法： node tools/check-real-ux.js <资源id> [端口]
   ========================================================================== */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const http = require('http');

const RES_ID = process.argv[2] || 'yuye-zhensuo';
const PORT = Number(process.argv[3] || 5599);
const API_JS = path.join(__dirname, '..', 'assets', 'js', 'api.js');

/* 用最小 RP 桩加载前端 api.js，拿到它自己的 parseState */
const sandbox = { console: console, RP: {}, fetch: function () { return Promise.reject(new Error('no net')); } };
sandbox.window = sandbox;
vm.runInNewContext(fs.readFileSync(API_JS, 'utf8'), sandbox, { filename: 'assets/js/api.js' });
const parseState = sandbox.RP.api.parseState;
if (typeof parseState !== 'function') { console.log('✗ 没能从 api.js 里取到 parseState'); process.exit(1); }

function post(pathname, body) {
  return new Promise(function (resolve) {
    const data = Buffer.from(JSON.stringify(body), 'utf8');
    const r = http.request({ host: '127.0.0.1', port: PORT, path: pathname, method: 'POST', timeout: 90000,
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

const TURNS = [
  '大夫，今晚有人来过吗？这把椅子还是温的。',
  '我不看病。我妹妹最后一次定位就在这栋楼，停在十一点零四。',
  '这本接诊簿我能看看吗？上面今晚这一页为什么没有名字？'
];

(async function () {
  console.log('=== 玩家实际看到的内容（经过前端清洗）：' + RES_ID + ' ===');
  const history = [];
  const state = { userName: '旅人', hp: 20, maxHp: 20, mood: '冷淡', turn: 0, progress: 0, warned: 0, conduct: 0, actMute: 0 };
  for (let i = 0; i < TURNS.length; i++) {
    history.push({ role: 'user', content: TURNS[i] });
    const r = await post('/api/chat', { resourceId: RES_ID, state: state, messages: history.slice() });
    if (r.code !== 200 || !r.json || !r.json.ok) { console.log('第 ' + (i + 1) + ' 轮失败：' + (r.code + ' ' + ((r.json && r.json.error) || r.raw || r.err))); break; }
    const raw = r.json.text || '';
    const parsed = parseState(raw);
    state.turn++;
    console.log('\n──── 第 ' + (i + 1) + ' 轮 ────');
    console.log('玩家：' + TURNS[i]);
    console.log('气泡里显示：' + parsed.text);
    console.log('解析出的状态：' + JSON.stringify(parsed.state || null));
    const thirdPerson = /（\s*(闻鹤年|沈明烛|陆见川|刘备|雷恩|凛|周廷云|汐)\s*[，,。·]/.test(parsed.text);
    const parenOpen = /^（/.test(parsed.text.trim());
    console.log('  仍然第三人称旁白：' + (thirdPerson ? '✗ 有' : '✓ 无') + ' · 以括号开头：' + (parenOpen ? '✗ 是' : '✓ 否'));
    history.push({ role: 'assistant', content: parsed.text });
  }
  console.log('\n=== 完成 ===');
})();
