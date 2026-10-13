/* ==========================================================================
   状态行命中率对照：为什么 <<<STATE>>> 在云端模型上时有时无？
   用法：node tools/check-zhipu-state.js [每种方案跑几次]

   方案：
     A 原样 —— 状态要求放在「历史之后的第二条 system 消息」里（站点现状，为 KV 缓存命中设计）
     C A + 在最后一条 user 消息末尾补一句简短的状态行要求（把要求放到模型最后看到的位置）
     S 站点真实路径 —— 直接打 http://127.0.0.1:5599/api/chat，量产品实际表现

   判据：回复里有没有 <<<STATE；顺便看有没有把要求/状态文字念成台词。
   ========================================================================== */
const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');
const ROOT = path.join(__dirname, '..');
const promptBuilder = require(path.join(ROOT, 'server', 'prompt.js'));
const sec = require(path.join(ROOT, 'server', 'security.js'));

const N = Number(process.argv[2] || 5);
const PORT = Number(process.argv[3] || 5599);

const resourcesRaw = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'resources.json'), 'utf8'));
const settings = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'settings.json'), 'utf8'));
const model = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'model.json'), 'utf8'));
const list = Array.isArray(resourcesRaw) ? resourcesRaw
  : (resourcesRaw.items || resourcesRaw.resources || resourcesRaw.list || []);
const resource = list.filter(function (r) { return r && r.id === 'changan-yeweiyang'; })[0] || list[0];
const state = { userName: '旅人', hp: 20, maxHp: 20, turn: 3, progress: 24, warned: 0, mood: '疏离' };
const history = [{ role: 'user', content: '十年前御史台那桩灭门案，卷宗少了一页。那一页是不是在你手上？' }];
/* 第二轮起才有历史：check-stream-server.js 用的就是这种「有一条不带状态行的 assistant 回合」的历史，
   用来验证「模型是在模仿历史格式，而不是遵守指令」这个猜想 */
const history2 = [
  { role: 'user', content: '十年前御史台那桩灭门案，卷宗少了一页。那一页是不是在你手上？' },
  { role: 'assistant', content: '（他把灯往你这边偏了半寸）这件事，不该在灯市里说。' },
  { role: 'user', content: '我不要听场面话。那一页上写的是谁的名字？' }
];

settings.__model = { base: model.base, model: model.model, compact: false };
const cfg = sec.readModelConfig();

const REMIND = '（系统提示：本轮回复的最后必须另起一行输出状态行，格式为 '
  + '<<<STATE {"hp":当前血量,"affinity":好感变化,"progress":推进度,"flag":"none","reason":"一句话原因"}>>>，'
  + '它不属于台词，不要把它写进对话内容里。）';

function post(messages, extra) {
  return new Promise(function (resolve) {
    const body = JSON.stringify(Object.assign({
      model: model.model, messages: messages, temperature: cfg.temp, max_tokens: cfg.maxTokens, stream: false,
      frequency_penalty: 0.4, presence_penalty: 0.3
    }, extra || {}));
    const u = new URL(model.base.replace(/\/$/, '') + '/chat/completions');
    const t0 = Date.now();
    const req = https.request({
      hostname: u.hostname, path: u.pathname, method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + model.key, 'Content-Length': Buffer.byteLength(body) }
    }, function (res) {
      let buf = '';
      res.on('data', function (d) { buf += d; });
      res.on('end', function () {
        let text = '', err = null;
        try {
          const j = JSON.parse(buf);
          if (j.error) err = JSON.stringify(j.error);
          else text = (j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content) || '';
        } catch (e) { err = '解析失败: ' + buf.slice(0, 160); }
        resolve({ text: text, err: err, ms: Date.now() - t0 });
      });
    });
    req.on('error', function (e) { resolve({ text: '', err: String(e.message), ms: Date.now() - t0 }); });
    req.setTimeout(90000, function () { try { req.destroy(new Error('请求超时 90s')); } catch (e) { } });
    req.write(body); req.end();
  });
}

/* 站点真实路径：走 /api/chat（非流式），看产品实际拿到什么 */
function postSite(hist) {
  return new Promise(function (resolve) {
    const body = JSON.stringify({ resourceId: resource.id, state: state, messages: hist || history });
    const t0 = Date.now();
    const req = http.request({
      hostname: '127.0.0.1', port: PORT, path: '/api/chat', method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }
    }, function (res) {
      let buf = '';
      res.on('data', function (d) { buf += d; });
      res.on('end', function () {
        let text = '', err = null;
        try { const j = JSON.parse(buf); if (j.ok === false) err = j.error; else text = j.text || ''; }
        catch (e) { err = '解析失败: ' + buf.slice(0, 160); }
        resolve({ text: text, err: err, ms: Date.now() - t0 });
      });
    });
    req.on('error', function (e) { resolve({ text: '', err: String(e.message), ms: Date.now() - t0 }); });
    req.write(body); req.end();
  });
}

/* 直接流式调用：用来判断「状态行在流式下丢失」是模型没吐，还是服务端把最后一段丢了 */
function postStream(messages) {
  return new Promise(function (resolve) {
    const body = JSON.stringify({
      model: model.model, messages: messages, temperature: cfg.temp, max_tokens: cfg.maxTokens,
      stream: true, frequency_penalty: 0.4, presence_penalty: 0.3
    });
    const u = new URL(model.base.replace(/\/$/, '') + '/chat/completions');
    const t0 = Date.now();
    const req = https.request({
      hostname: u.hostname, path: u.pathname, method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + model.key, 'Content-Length': Buffer.byteLength(body) }
    }, function (res) {
      let raw = '', full = '';
      res.on('data', function (d) {
        raw += d.toString('utf8');
        const lines = raw.split('\n');
        raw = lines.pop();                       // 和服务端一样的解析方式：把不完整分片留在 raw 里
        lines.forEach(function (line) {
          const s = line.trim();
          if (!s || s.indexOf('data:') !== 0) return;
          const payload = s.slice(5).trim();
          if (payload === '[DONE]') return;
          try {
            const j = JSON.parse(payload);
            const delta = j.choices && j.choices[0] && j.choices[0].delta ? j.choices[0].delta.content : '';
            if (delta) full += delta;
          } catch (e) { }
        });
      });
      res.on('end', function () {
        resolve({
          text: full, ms: Date.now() - t0, err: null,
          /* 连接结束时还剩在缓冲里的字节：服务端的循环结束后不会处理它 —— 状态行就丢在这里 */
          leftover: raw.length,
          leftoverHasState: /<<<STATE/i.test(raw)
        });
      });
    });
    req.on('error', function (e) { resolve({ text: '', err: String(e.message), ms: Date.now() - t0, leftover: 0 }); });
    req.write(body); req.end();
  });
}

/* 修复方案对照：历史里已经有「不带状态行」的范例时，怎么才能让模型重新开始输出状态行 */
const REAL_REMIND = promptBuilder.STATE_REMIND;
function stripRemind(msgs) {
  return msgs.map(function (m) {
    return { role: m.role, content: String(m.content).split(REAL_REMIND).join('') };
  });
}
function withTail(msgs, tailText) {
  const o = stripRemind(msgs);
  o[o.length - 2] = { role: 'user', content: o[o.length - 2].content + '\n\n' + tailText };
  return o;
}
const F2 = '（系统：注意，历史里前几轮的回复漏了状态行，那是旧格式的错；从本轮起必须补上，'
  + '在回复的最后另起一行输出 <<<STATE {"hp":当前血量,"affinity":好感增减,"progress":推进度,"flag":"none","reason":"一句话原因"}>>>）';
const F3 = '（系统：本轮回复必须以下面这两行收尾，把数值换成本轮结果：\n'
  + '她的语气冷了下来，不再看你。\n'
  + '<<<STATE {"hp":20,"affinity":-1,"progress":30,"flag":"none","reason":"玩家追问敏感信息"}>>>）';
/* F1：把历史里那条角色回复补上状态行 —— 让「被模仿的范例」本身带状态行 */
const historyWithState = [
  history2[0],
  { role: 'assistant', content: history2[1].content + '\n<<<STATE {"hp":20,"affinity":0,"progress":16,"flag":"none","reason":"岔开话题"}>>>' },
  history2[2]
];

function judge(r) {
  return {
    hit: /<<<STATE/i.test(r.text),
    echo: /本轮回复的最后|系统提示|状态行|2-4\s*句|不要把它写进/.test(r.text),
    ms: r.ms, err: r.err, text: r.text
  };
}

(async function () {
  const built = promptBuilder.buildMessages(resource, settings, state, history);
  if (!built) { console.log('!! buildMessages 返回 null'); process.exit(1); }
  console.log('模型 ' + model.model + ' @ ' + model.base + '   maxTokens=' + cfg.maxTokens + ' temp=' + cfg.temp);
  console.log('每种方案跑 ' + N + ' 次\n');

  const variants = [
    {
      /* 旧行为：把玩家句末那一点名去掉（= 修复前的组装方式），留作对照 */
      tag: 'O 修复前（只有尾部 system 里有要求）', run: function () {
        const o = built.map(function (m) { return { role: m.role, content: m.content }; });
        o[o.length - 2] = { role: 'user', content: o[o.length - 2].content.replace('\n\n' + REMIND, '') };
        return post(o);
      }
    },
    { tag: 'A 修复后的组装（站点同款）', run: function () { return post(built); } },
    {
      tag: 'T 直接流式（自建解析，含服务端同款缓冲逻辑）', run: function () { return postStream(built); },
      extra: function (r) { return '  连接结束时缓冲里剩 ' + (r.leftover || 0) + ' 字节，其中含状态行=' + (r.leftoverHasState ? '是 ← 就是它丢了' : '否'); }
    },
    { tag: 'S 站点真实路径 /api/chat', run: postSite },
    {
      tag: 'H 带一段「没有状态行」的历史（第 2 轮起的真实处境）', run: function () {
        const built2 = promptBuilder.buildMessages(resource, settings, state, history2);
        return post(built2);
      }
    },
    { tag: 'H2 站点路径 + 同样那段历史', run: function () { return postSite(history2); } },
    {
      tag: 'F1 历史里那条角色回复补上状态行（让范例本身合法）', run: function () {
        return post(promptBuilder.buildMessages(resource, settings, state, historyWithState));
      }
    },
    {
      tag: 'F2 点名「历史是旧格式，本轮起必须补」', run: function () {
        return post(withTail(promptBuilder.buildMessages(resource, settings, state, history2), F2));
      }
    },
    {
      tag: 'F3 给一个「正文 + 状态行」的收尾示例', run: function () {
        return post(withTail(promptBuilder.buildMessages(resource, settings, state, history2), F3));
      }
    }
  ];

  const summary = [];
  for (const v of variants) {
    let hit = 0, echo = 0, ms = 0, errs = 0;
    const samples = [];
    for (let i = 0; i < N; i++) {
      const raw = await v.run();
      const r = judge(raw);
      if (r.err) { errs++; samples.push('错误:' + r.err.slice(0, 60)); continue; }
      if (r.hit) hit++;
      if (r.echo) echo++;
      ms += r.ms;
      if (i === 0 && v.extra) samples.push(v.extra(raw));
      samples.push((r.hit ? '中' : '空') + (r.echo ? '·念' : ''));
    }
    summary.push({ tag: v.tag, hit: hit, echo: echo, errs: errs, avg: Math.round(ms / Math.max(1, N - errs)) });
    console.log('【' + v.tag + '】命中 ' + hit + '/' + (N - errs) + '  把要求念成台词 ' + echo + '  平均 ' + Math.round(ms / Math.max(1, N - errs)) + 'ms');
    console.log('   ' + samples.join('  '));
  }

  console.log('\n=== 汇总 ===');
  summary.forEach(function (s) {
    console.log('  ' + (s.hit + '/' + (N - s.errs)).padEnd(6) + s.avg + 'ms   ' + s.tag);
  });
})();
