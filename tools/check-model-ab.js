/* 模型 A/B：同一套提示词 + 同样三轮对话，分别打「站点现用模型（glm-4-flash）」和「千问 qwen-plus」，
   两边都用前端真实的清洗函数（api.js 的 parseState）处理，再对比：
     · 有没有无缘无故的扣血/警告（"他动不动就惩戒"）
     · 有没有用括号写旁白
     · 结尾有没有给出可执行方向

   用法： node tools/check-model-ab.js [资源id]
   ========================================================================== */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const https = require('https');

const ROOT = path.join(__dirname, '..');
const RES_ID = process.argv[2] || 'yuye-zhensuo';

/* ---- 前端清洗函数 ---- */
const sandbox = { console: console, RP: {}, fetch: function () { return Promise.reject(new Error('x')); } };
sandbox.window = sandbox;
vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'assets', 'js', 'api.js'), 'utf8'), sandbox, { filename: 'api.js' });
const parseState = sandbox.RP.api.parseState;

/* ---- 提示词：直接复用服务端组装逻辑 ---- */
const pb = require(path.join(ROOT, 'server', 'prompt.js'));
const doc = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'resources.json'), 'utf8'));
const set = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'settings.json'), 'utf8'));
const res = doc.resources.filter(function (r) { return r.id === RES_ID; })[0];
const state = { userName: '旅人', hp: 20, maxHp: 20, mood: '冷淡', turn: 0, progress: 0, warned: 0, conduct: 0, actMute: 0 };

const TURNS = [
  '大夫，今晚有人来过吗？这把椅子还是温的。',
  '我不看病。我妹妹最后一次定位就在这栋楼，停在十一点零四。',
  '这本接诊簿我能看看吗？上面今晚这一页为什么没有名字？'
];

function chatOnce(cfg, messages) {
  return new Promise(function (resolve) {
    const body = Buffer.from(JSON.stringify({
      model: cfg.model, temperature: 0.85, max_tokens: cfg.maxTokens || 360, messages: messages
    }), 'utf8');
    const r = https.request({
      hostname: new URL(cfg.base).hostname,
      path: new URL(cfg.base).pathname.replace(/\/$/, '') + '/chat/completions',
      method: 'POST', timeout: 90000,
      headers: { 'Content-Type': 'application/json', 'Content-Length': body.length, Authorization: 'Bearer ' + cfg.key }
    }, function (res2) {
      const c = [];
      res2.on('data', function (d) { c.push(d); });
      res2.on('end', function () {
        let j = null;
        try { j = JSON.parse(Buffer.concat(c).toString('utf8')); } catch (e) { }
        resolve(j && j.choices && j.choices[0] && j.choices[0].message ? String(j.choices[0].message.content || '') : '');
      });
    });
    r.on('error', function () { resolve(''); });
    r.on('timeout', function () { r.destroy(); resolve(''); });
    r.write(body); r.end();
  });
}

function judge(text) {
  const punish = /_〔(惩戒|处刑|禁言)/.test(text);
  const parenLead = /^\s*[（(]/.test(text);
  const hook = /(问|看|翻|摸|拿|递|指|走|坐|数|查|告诉|说|见|听|把|给)/.test(text) && text.length > 40;
  return { punish: punish, warn: /_〔警告/.test(text), parenLead: parenLead, hook: hook };
}

async function run(name, cfg) {
  console.log('\n════════ ' + name + ' ════════');
  const history = [];
  let punished = 0, parens = 0, hooks = 0;
  for (let i = 0; i < TURNS.length; i++) {
    const msgs = pb.buildMessages(res, set, Object.assign({}, state, { turn: i }), history.concat([{ role: 'user', content: TURNS[i] }]));
    const raw = await chatOnce(cfg, msgs);
    if (!raw) { console.log('  第 ' + (i + 1) + ' 轮：没有返回'); break; }
    const parsed = parseState(raw);
    const j = judge(parsed.text);
    if (j.punish || j.warn) punished++;
    if (j.parenLead) parens++;
    if (j.hook) hooks++;
    console.log('\n  第 ' + (i + 1) + ' 轮（玩家：' + TURNS[i] + '）');
    console.log('  ' + parsed.text.replace(/\n+/g, '\n  ').slice(0, 240));
    console.log('  → 扣血/警告 ' + ((j.punish || j.warn) ? '有' : '无') + ' · 括号开头 ' + (j.parenLead ? '有' : '无') + ' · 可执行方向 ' + (j.hook ? '有' : '无'));
    history.push({ role: 'user', content: TURNS[i] });
    history.push({ role: 'assistant', content: parsed.text });
  }
  return { name: name, punished: punished, parens: parens, hooks: hooks };
}

(async function () {
  const site = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'model.json'), 'utf8'));
  const creds = fs.readFileSync(process.env.USERPROFILE + '/.dsh/.credentials.yaml', 'utf8');
  const m = /DASHSCOPE_API_KEY:\s*(\S+)/.exec(creds);
  const qwenKey = m ? m[1] : '';

  const results = [];
  results.push(await run('站点现用：' + site.model, { base: site.base, key: site.key, model: site.model, maxTokens: site.maxTokens }));
  if (qwenKey) {
    results.push(await run('千问：qwen-plus', { base: 'https://dashscope.aliyuncs.com/compatible-mode/v1', key: qwenKey, model: 'qwen-plus', maxTokens: 500 }));
  }

  console.log('\n════════ 对比 ════════');
  results.forEach(function (r) {
    console.log('  ' + r.name.padEnd(28) + ' 无缘由扣血 ' + r.punished + '/3 · 括号旁白 ' + r.parens + '/3 · 有引导 ' + r.hooks + '/3');
  });
  console.log('\n=== 完成 ===');
})();
