/* 量一下站点真实提示词有多少 token（决定本机模型的 num_ctx 要开多大）
   用法： node tools/bench-prompt-size.js [资源id] */
const fs = require('fs');
const http = require('http');
const pr = require('D:/agent/roleplay-studio/server/prompt.js');

const resId = process.argv[2] || 'changan-yeweiyang';
const set = JSON.parse(fs.readFileSync('D:/agent/roleplay-studio/data/settings.json', 'utf8'));
const raw = JSON.parse(fs.readFileSync('D:/agent/roleplay-studio/data/resources.json', 'utf8'));
const list = Array.isArray(raw) ? raw : raw.resources;
const resource = list.filter(function (r) { return r.id === resId; })[0];

const msgs = pr.buildMessages(
  resource, set,
  { hp: 20, maxHp: 20, turn: 3, progress: 20, affinity: 1, warned: 0, conduct: 0, actMute: 0, userName: '旅人', mood: '疏离' },
  [{ role: 'user', content: '十年前御史台那桩灭门案，卷宗少了一页。那一页是不是在你手上？' }]
);
const chars = msgs.map(function (m) { return m.content.length; }).reduce(function (a, b) { return a + b; }, 0);
console.log('消息条数 ' + msgs.length + ' | 总字符 ' + chars);

const payload = {
  model: process.argv[3] || 'rp3b:latest',
  messages: msgs,
  max_tokens: 1,          // 只跑 prompt 评估
  stream: false
};
const data = Buffer.from(JSON.stringify(payload), 'utf8');
const t0 = Date.now();
const r = http.request({
  host: '127.0.0.1', port: 11434, path: '/v1/chat/completions', method: 'POST',
  headers: { 'Content-Type': 'application/json', 'Content-Length': data.length }
}, function (x) {
  let b = '';
  x.setEncoding('utf8');
  x.on('data', function (c) { b += c; });
  x.on('end', function () {
    const sec = (Date.now() - t0) / 1000;
    let j = null; try { j = JSON.parse(b); } catch (e) { }
    const u = (j && j.usage) || {};
    console.log('prompt tokens = ' + (u.prompt_tokens || '?') + ' | 只算提示词耗时 ' + sec.toFixed(1) + 's');
    if (u.prompt_tokens) {
      console.log('提示词处理速度 ≈ ' + (u.prompt_tokens / sec).toFixed(1) + ' tok/s（CPU 推理，决定了每轮的最低下限）');
    }
  });
});
r.on('error', function (e) { console.log('请求失败 ' + e.message); });
r.write(data); r.end();
