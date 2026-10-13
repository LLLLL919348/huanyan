/* 逐个模型量「站点真实一轮」的耗时：改 model.json → 重启不需要，服务端会按 mtime 重载
   用法： node tools/bench-models.js rp3b:latest rp7b:latest */
const fs = require('fs');
const http = require('http');
const { execFileSync } = require('child_process');

const MODEL_FILE = 'D:/agent/roleplay-studio/data/model.json';
const models = process.argv.slice(2);
if (!models.length) { console.log('用法： node tools/bench-models.js <模型名…>'); process.exit(1); }

function post(path, body, timeoutMs) {
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
    r.setTimeout(timeoutMs || 600000, function () { r.destroy(); resolve({ sec: (Date.now() - t0) / 1000, status: 0, raw: 'timeout' }); });
    r.write(d); r.end();
  });
}

function setModel(name) {
  const cfg = JSON.parse(fs.readFileSync(MODEL_FILE, 'utf8'));
  cfg.enabled = true; cfg.base = 'http://127.0.0.1:11434/v1'; cfg.model = name;
  cfg.key = cfg.key || 'local'; cfg.maxTokens = 300; cfg.timeoutMs = 600000;
  fs.writeFileSync(MODEL_FILE, JSON.stringify(cfg, null, 2) + '\n', 'utf8');
}

(async function () {
  for (const m of models) {
    setModel(m);
    /* 先让它把模型加载进内存（第一次调用含加载时间，单独标出来） */
    const warm = await post('/api/chat', {
      resourceId: 'changan-yeweiyang',
      state: { userName: '旅人', hp: 20, maxHp: 20, turn: 0, progress: 0, warned: 0 },
      messages: [{ role: 'user', content: '你好，我来了。' }]
    });
    const t = (warm.json && warm.json.text) || ('(失败) ' + warm.raw);
    console.log('== ' + m + ' ==');
    console.log('  冷启动（含加载）: ' + warm.sec.toFixed(1) + 's | ' + (t.match(/[\u4e00-\u9fa5]/g) || []).length + ' 汉字');
    for (let i = 0; i < 2; i++) {
      const r = await post('/api/chat', {
        resourceId: 'changan-yeweiyang',
        state: { userName: '旅人', hp: 20, maxHp: 20, turn: 1 + i, progress: 10, warned: 0 },
        messages: [
          { role: 'user', content: '十年前御史台那桩灭门案，卷宗少了一页。那一页是不是在你手上？' },
          { role: 'assistant', content: '（他把灯往你这边偏了半寸）这件事，不该在灯市里说。' },
          { role: 'user', content: '我不要听场面话。那一页上写的是谁的名字？' }
        ]
      });
      const x = (r.json && r.json.text) || ('(失败) ' + r.raw);
      console.log('  第 ' + (i + 1) + ' 问: ' + r.sec.toFixed(1) + 's | ' + (x.match(/[\u4e00-\u9fa5]/g) || []).length +
        ' 汉字 | STATE=' + /<<<STATE/.test(x) + ' | 行为台词=' + /_〔/.test(x));
      console.log('     ' + x.replace(/\s+/g, ' ').slice(0, 130));
    }
  }
})();
