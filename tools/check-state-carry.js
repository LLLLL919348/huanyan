/* ==========================================================================
   状态行「接力」验收：模型靠模仿历史的格式，所以历史里必须带状态行。

   背景（实测数据见 tools/check-zhipu-state.js）：glm-4-flash 在「历史里有一条不带状态行的
   角色回复」时，状态行命中 0/3；把那条历史回复补上状态行后 3/3。指令与示例都无效。

   这个脚本走站点真实路径 /api/chat，验收四件事：
     第 1 轮  空历史 —— 应当吐状态行（这是整条链路的起点）
     第 2 轮  历史里带上第 1 轮的真实状态行 —— 必须命中（新逻辑存下来的样子）
     第 3 轮  历史里那条没有状态行 —— 只是记录（旧会话的处境，预期易失，不作为失败）
     第 4 轮  历史里那条用协议示例行补上 —— 必须命中（toHistory 的兜底脚手架）

   用法：node tools/check-state-carry.js [每轮次数] [端口]
   ========================================================================== */
const http = require('http');
const N = Number(process.argv[2] || 3);
const PORT = Number(process.argv[3] || 5599);
const RES = 'changan-yeweiyang';

const state = { userName: '旅人', hp: 20, maxHp: 20, turn: 2, progress: 16, warned: 0, mood: '疏离' };
const TEMPLATE = '<<<STATE {"hp":0,"affinity":1,"progress":6,"flag":"none","aid":null,"reason":"简短"}>>>';
const Q1 = '十年前御史台那桩灭门案，卷宗少了一页。那一页是不是在你手上？';
const Q2 = '我不要听场面话。那一页上写的是谁的名字？';

function call(messages) {
  return new Promise(function (resolve) {
    const body = JSON.stringify({ resourceId: RES, state: state, messages: messages });
    const req = http.request({
      host: '127.0.0.1', port: PORT, path: '/api/chat', method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }
    }, function (res) {
      let buf = '';
      res.on('data', function (d) { buf += d; });
      res.on('end', function () {
        let j = null;
        try { j = JSON.parse(buf); } catch (e) { }
        if (!j || j.ok === false) return resolve({ text: '', err: (j && j.error) || '解析失败' });
        resolve({ text: j.text || '', err: null });
      });
    });
    req.on('error', function (e) { resolve({ text: '', err: e.message }); });
    req.setTimeout(90000, function () { try { req.destroy(new Error('超时')); } catch (e) { } });
    req.write(body); req.end();
  });
}

function pick(text) {
  const m = /<<<STATE[\s\S]*?>>>/i.exec(String(text || ''));
  return m ? m[0] : '';
}

(async function () {
  console.log('站点路径 http://127.0.0.1:' + PORT + '/api/chat   每项 ' + N + ' 次\n');
  let fails = 0;

  /* 先拿一条真实回复，供后面几轮当历史用 */
  const first = await call([{ role: 'user', content: Q1 }]);
  if (first.err) { console.log('!! 第 1 轮就失败：' + first.err + '（服务端模型没配好？）'); process.exit(1); }
  const firstLine = pick(first.text);
  const firstClean = String(first.text).replace(/<<<STATE[\s\S]*?>>>/gi, '').trim();
  console.log('第 1 轮拿到的状态行: ' + (firstLine || '（没有）'));
  console.log('');

  const cases = [
    {
      /* 空历史时没有可模仿的范例，只剩指令 —— 实测命中率在 1/3 到 4/5 之间波动，属随机。
         不判失败：漏掉时客户端按中性结算（不扣血、不加推进度），而且这一轮会被 toHistory
         用协议示例行补齐，从第 2 轮起就稳定命中（见下面第 2、4 项）。 */
      tag: '第 1 轮  空历史（随机，仅记录）', must: false,
      run: function () { return call([{ role: 'user', content: Q1 }]); }
    },
    {
      tag: '第 2 轮  历史带真实状态行（修复的主路径）', must: true,
      run: function () {
        return call([
          { role: 'user', content: Q1 },
          { role: 'assistant', content: firstClean + '\n' + (firstLine || TEMPLATE) },
          { role: 'user', content: Q2 }
        ]);
      }
    },
    {
      tag: '第 3 轮  历史里没有状态行（旧会话，仅记录）', must: false,
      run: function () {
        return call([
          { role: 'user', content: Q1 },
          { role: 'assistant', content: firstClean },
          { role: 'user', content: Q2 }
        ]);
      }
    },
    {
      tag: '第 4 轮  历史里用示例行补上（兜底脚手架）', must: true,
      run: function () {
        return call([
          { role: 'user', content: Q1 },
          { role: 'assistant', content: firstClean + '\n' + TEMPLATE },
          { role: 'user', content: Q2 }
        ]);
      }
    }
  ];

  /* 顺便把每轮吐出来的数值打出来：验收「增量语义」有没有被遵守
     （hp 应当是 0 或负数、progress 应当是 3-10 这种小增量，而不是当前值 20 / 24） */
  function nums(text) {
    const line = pick(text);
    if (!line) return '（无状态行）';
    const g = function (k) { const m = new RegExp('"' + k + '"\\s*:\\s*(-?\\d+)').exec(line); return m ? m[1] : '?'; };
    return 'hp=' + g('hp') + ' affinity=' + g('affinity') + ' progress=' + g('progress');
  }
  console.log('各轮数值（本轮状态值 20/20，当前推进度 16%）：');
  for (let i = 0; i < N; i++) {
    const r = await call([
      { role: 'user', content: Q1 },
      { role: 'assistant', content: firstClean + '\n' + (firstLine || TEMPLATE) },
      { role: 'user', content: Q2 }
    ]);
    console.log('  第 ' + (i + 1) + ' 次: ' + (r.err ? '错误 ' + r.err : nums(r.text)));
  }
  console.log('');

  for (const c of cases) {
    let hit = 0, errs = 0;
    const marks = [];
    for (let i = 0; i < N; i++) {
      const r = await c.run();
      if (r.err) { errs++; marks.push('错误'); continue; }
      const ok = /<<<STATE/i.test(r.text);
      if (ok) hit++;
      marks.push(ok ? '中' : '空');
    }
    const pass = hit === N;
    if (c.must && !pass) fails++;
    console.log((c.must ? (pass ? '  ✓ ' : '  ✗ ') : '  · ') + c.tag + ' → ' + hit + '/' + (N - errs) + '   ' + marks.join(' '));
  }

  console.log('');
  console.log(fails === 0 ? '=== 全部通过 ===' : '=== 失败 ' + fails + ' 项 ===');
  console.log('=== 完成 ===');
  process.exit(fails === 0 ? 0 : 1);
})();
