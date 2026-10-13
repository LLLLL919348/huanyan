/* ==========================================================================
   一轮对话到底花多少 token：用站点真实的提示词组装去打真模型，读 usage。
   用途：① 判断免费模型够不够用；② 万一将来换成付费模型，算「一个访客 20 轮要多少钱」。
   用法：node tools/bench-turn-cost.js [每种情况跑几次]
   ========================================================================== */
const fs = require('fs');
const path = require('path');
const https = require('https');
const ROOT = path.join(__dirname, '..');
const promptBuilder = require(path.join(ROOT, 'server', 'prompt.js'));

const N = Number(process.argv[2] || 3);
const resourcesRaw = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'resources.json'), 'utf8'));
const settings = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'settings.json'), 'utf8'));
const model = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'model.json'), 'utf8'));
const list = Array.isArray(resourcesRaw) ? resourcesRaw
  : (resourcesRaw.items || resourcesRaw.resources || resourcesRaw.list || []);
const resource = list.filter(function (r) { return r && r.id === 'changan-yeweiyang'; })[0] || list[0];

settings.__model = { base: model.base, model: model.model, compact: false };

/* 造一段像真玩了几轮的历史（历史越长输入越大，所以分两个场景看） */
function makeHistory(turns) {
  const q = [
    '十年前御史台那桩灭门案，卷宗少了一页。那一页是不是在你手上？',
    '我不要听场面话。那一页上写的是谁的名字？',
    '灯芯上的记号是什么意思？',
    '司灯署为什么接连灭灯？'
  ];
  const a = [
    '（他把灯往你这边偏了半寸）这件事，不该在灯市里说。\n<<<STATE {"hp":0,"affinity":0,"progress":6,"flag":"none","reason":"岔开话题"}>>>',
    '沈明烛目光锐利地扫过你的脸：「那页不在我手上。」\n<<<STATE {"hp":0,"affinity":-1,"progress":4,"flag":"none","reason":"回避"}>>>',
    '（她指尖在灯罩上停了一下）记号是司灯署的旧规矩。\n<<<STATE {"hp":0,"affinity":1,"progress":8,"flag":"none","reason":"给出线索"}>>>',
    '（她沉默了一会儿）灭灯的事，你问错人了。\n<<<STATE {"hp":0,"affinity":0,"progress":2,"flag":"none","reason":"收束"}>>>'
  ];
  const h = [];
  for (let i = 0; i < turns; i++) {
    h.push({ role: 'user', content: q[i % q.length] });
    if (i < turns - 1) h.push({ role: 'assistant', content: a[i % a.length] });
  }
  return h;
}

function call(messages, state) {
  return new Promise(function (resolve) {
    const body = JSON.stringify({
      model: model.model, messages: messages, temperature: model.temp || 0.8,
      max_tokens: model.maxTokens || 360, stream: false
    });
    const u = new URL(model.base.replace(/\/$/, '') + '/chat/completions');
    const t0 = Date.now();
    const req = https.request({
      hostname: u.hostname, path: u.pathname, method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + model.key, 'Content-Length': Buffer.byteLength(body) }
    }, function (res) {
      let buf = '';
      res.on('data', function (d) { buf += d; });
      res.on('end', function () {
        let usage = null, err = null;
        try {
          const j = JSON.parse(buf);
          if (j.error) err = JSON.stringify(j.error);
          else usage = j.usage || null;
        } catch (e) { err = '解析失败'; }
        resolve({ usage: usage, ms: Date.now() - t0, err: err });
      });
    });
    req.on('error', function (e) { resolve({ usage: null, ms: 0, err: e.message }); });
    req.setTimeout(90000, function () { try { req.destroy(new Error('超时')); } catch (e) { } });
    req.write(body); req.end();
  });
}

(async function () {
  console.log('模型 ' + model.model + '（' + model.base + '）  每种场景跑 ' + N + ' 次\n');
  const scenes = [
    { tag: '第 1 轮（无历史）', turns: 1, prog: 0, hp: 20, mood: '冷淡' },
    { tag: '第 6 轮（带 5 轮历史）', turns: 6, prog: 30, hp: 14, mood: '疏离' },
    { tag: '第 12 轮（带 11 轮历史）', turns: 12, prog: 62, hp: 9, mood: '戒备' }
  ];
  const rows = [];
  for (const s of scenes) {
    let pin = 0, pout = 0, ms = 0, ok = 0;
    for (let i = 0; i < N; i++) {
      const msgs = promptBuilder.buildMessages(resource, settings,
        { userName: '旅人', hp: s.hp, maxHp: 20, turn: s.turns, progress: s.prog, warned: 0, mood: s.mood },
        makeHistory(s.turns));
      const r = await call(msgs);
      if (r.err) { console.log('  ' + s.tag + ' 出错: ' + r.err); continue; }
      ok++;
      pin += r.usage.prompt_tokens || 0;
      pout += r.usage.completion_tokens || 0;
      ms += r.ms;
    }
    if (!ok) continue;
    rows.push({ tag: s.tag, pin: Math.round(pin / ok), pout: Math.round(pout / ok), total: Math.round((pin + pout) / ok), ms: Math.round(ms / ok) });
    console.log('  ' + s.tag + '：输入 ' + Math.round(pin / ok) + ' + 输出 ' + Math.round(pout / ok) +
      ' = ' + Math.round((pin + pout) / ok) + ' tokens/轮   平均 ' + (ms / ok / 1000).toFixed(1) + 's');
  }

  const avg = rows.length ? Math.round(rows.reduce(function (a, r) { return a + r.total; }, 0) / rows.length) : 0;
  console.log('\n=== 结论 ===');
  console.log('  一轮平均约 ' + avg + ' tokens（' + rows[0].pin + ' 输入 + ' + rows[0].pout + ' 输出 起，随历史增长）');
  console.log('  一个访客打满 20 轮 ≈ ' + (avg * 20 / 1000).toFixed(0) + 'K tokens ≈ ' + (avg * 20 / 1e6).toFixed(3) + 'M tokens');
  console.log('  100 个访客打满 20 轮 ≈ ' + (avg * 20 * 100 / 1e6).toFixed(2) + 'M tokens\n');
  console.log('  若换成付费模型（按上面的量大数换算）：');
  const prices = [
    ['GLM-4-Flash-250414（当前，免费）', 0],
    ['GLM-4-FlashX-250414', 0.1],
    ['GLM-4-Air-250414', 0.5],
    ['GLM-4-Plus', 5]
  ];
  prices.forEach(function (p) {
    const per = avg * 20 / 1e6 * p[1];
    console.log('    ' + p[0].padEnd(30) + (p[1] === 0 ? '0 元（免费模型）' :
      '一个访客 20 轮 ' + per.toFixed(4) + ' 元 · 1 元约 ' + Math.floor(1 / per) + ' 个访客 · 100 元约 ' + Math.floor(100 / per) + ' 个'));
  });
})();
