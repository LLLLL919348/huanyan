/* 流式稳定性测试：连打几轮，看首字延迟、总耗时、有没有中途卡住
   用法： node tools/check-stream-server.js [轮数] */
const http = require('http');
const rounds = Number(process.argv[2] || 3);

function once(i) {
  return new Promise(function (resolve) {
    const body = JSON.stringify({
      resourceId: 'changan-yeweiyang',
      state: { userName: '旅人', hp: 20, maxHp: 20, turn: i, progress: 8 * i, warned: 0, mood: '疏离' },
      messages: [
        { role: 'user', content: '十年前御史台那桩灭门案，卷宗少了一页。那一页是不是在你手上？' },
        { role: 'assistant', content: '（他把灯往你这边偏了半寸）这件事，不该在灯市里说。' },
        { role: 'user', content: '我不要听场面话。那一页上写的是谁的名字？' }
      ],
      stream: true
    });
    const t0 = Date.now();
    let first = null, chunks = 0, text = '', lastAt = t0, maxGap = 0, done = false, err = null;
    const r = http.request({
      host: '127.0.0.1', port: 5599, path: '/api/chat', method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }
    }, function (res) {
      res.setEncoding('utf8');
      let buf = '';
      res.on('data', function (c) {
        buf += c;
        const lines = buf.split('\n'); buf = lines.pop();
        lines.forEach(function (line) {
          if (line.indexOf('data:') !== 0) return;
          let j = null; try { j = JSON.parse(line.slice(5).trim()); } catch (e) { return; }
          const now = Date.now();
          if (j.t) {
            if (first === null) first = now - t0;
            if (now - lastAt > maxGap) maxGap = now - lastAt;
            lastAt = now; chunks++; text += j.t;
          }
          if (j.done) done = true;
          if (j.error) err = j.error;
        });
      });
      res.on('end', function () {
        resolve({ i: i, first: first, total: Date.now() - t0, chunks: chunks, maxGap: maxGap, text: text, done: done, err: err });
      });
    });
    r.on('error', function (e) { resolve({ i: i, first: first, total: Date.now() - t0, chunks: chunks, text: text, done: false, err: e.message }); });
    r.write(body); r.end();
  });
}

(async function () {
  for (let i = 0; i < rounds; i++) {
    const r = await once(i);
    console.log('第 ' + (i + 1) + ' 轮: 首字 ' + (r.first === null ? '—' : (r.first / 1000).toFixed(1) + 's') +
      ' | 总耗时 ' + (r.total / 1000).toFixed(1) + 's | 分片 ' + r.chunks +
      ' | 最长空档 ' + (r.maxGap / 1000).toFixed(1) + 's | done=' + r.done +
      (r.err ? ' | 错误=' + r.err : '') + ' | 汉字 ' + (r.text.match(/[\u4e00-\u9fa5]/g) || []).length +
      ' | STATE=' + /<<<STATE/.test(r.text));
    console.log('   ' + r.text.replace(/\s+/g, ' ').slice(0, 120));
  }
})();
