/* 校验服务端（server/prompt.js）装配的系统提示词是否带合规底线与未成年红线 */
const fs = require('fs');
const pr = require('D:/agent/roleplay-studio/server/prompt.js');
const set = JSON.parse(fs.readFileSync('D:/agent/roleplay-studio/data/settings.json', 'utf8'));
const raw = JSON.parse(fs.readFileSync('D:/agent/roleplay-studio/data/resources.json', 'utf8'));
const list = Array.isArray(raw) ? raw : raw.resources;
console.log('资源条数 ' + list.length + '；类型 ' + (Array.isArray(list) ? 'array' : typeof list));

function pick(id) { return list.filter(function (r) { return r.id === id; })[0]; }
let bad = 0;
['yandere-rin', 'whale-girl-xi', 'changan-yeweiyang', 'yuye-zhensuo'].forEach(function (id) {
  const r = pick(id);
  const msgs = pr.buildMessages(
    r, set,
    { hp: 20, maxHp: 20, turn: 2, progress: 10, affinity: 1, warned: 0, conduct: 0, actMute: 0, userName: '旅人', mood: '疏离' },
    [{ role: 'user', content: '你好' }]
  );
  const sys = msgs.filter(function (m) { return m.role === 'system'; })
    .map(function (m) { return m.content; }).join('\n');
  const guard = sys.indexOf('【合规底线') > -1;
  const minor = sys.indexOf('【未成年人强制红线】') > -1;
  const perRes = sys.indexOf('【合规红线】') > -1;
  console.log('  · ' + id + ' | system ' + sys.length + ' 字 | 合规底线=' + guard +
    ' 未成年红线=' + minor + ' 本场合规红线=' + perRes + ' | 消息 ' + msgs.length + ' 条');
  if (!guard) bad++;
  if (minor !== (id === 'yandere-rin')) bad++;
});

/* ---- 精简规则（本机小模型）---- */
console.log('');
console.log('【精简规则开关】');
const res0 = pick('changan-yeweiyang');
const full = pr.buildSystemPrompt(res0, set, { compact: 'off', base: 'https://api.deepseek.com/v1', model: 'deepseek-chat' });
const slim = pr.buildSystemPrompt(res0, set, { compact: 'auto', base: 'http://127.0.0.1:11434/v1', model: 'rp3b:latest' });
const slimGuard = slim.indexOf('【合规底线') > -1;
const slimMinor = pr.buildSystemPrompt(pick('yandere-rin'), set, { compact: 'auto', base: 'http://127.0.0.1:11434/v1', model: 'rp3b:latest' })
  .indexOf('【未成年人强制红线】') > -1;
console.log('  云端（完整规则）: ' + full.length + ' 字');
console.log('  本机（自动精简）: ' + slim.length + ' 字  → 省掉 ' + (full.length - slim.length) + ' 字');
console.log('  精简版仍带合规底线: ' + slimGuard);
console.log('  精简版仍带未成年红线: ' + slimMinor);
if (!slimGuard || !slimMinor) bad++;
if (!(slim.length < full.length * 0.7)) { console.log('  !! 精简版没有明显变短'); bad++; }

/* ---- 每轮状态消息长度（短才有救）---- */
const stMsg = pr.buildStateMessage({ hp: 20, maxHp: 20, turn: 3, progress: 10, warned: 0, userName: '旅人', mood: '冷淡', lastAi: '这是规矩所限，并无他意。' });
console.log('  每轮状态消息: ' + stMsg.length + ' 字（曾经常 900+ 字，会让小模型把指令当台词念）');
if (stMsg.length > 420) { console.log('  !! 状态消息又变长了'); bad++; }

/* ---- 占位词与协议重复度（模型「念规则」的根因）---- */
console.log('');
console.log('【协议重复度与占位词】');
const sys0 = pr.buildSystemPrompt(res0, set, { compact: 'auto', base: 'http://127.0.0.1:11434/v1', model: 'rp3b:latest' });
['_〔效果 参数〕台词正文_', '效果 参数', '台词正文'].forEach(function (w) {
  const n = (sys0.split(w).length - 1);
  console.log('  占位词「' + w + '」出现 ' + n + ' 次' + (n ? '   ← 必须为 0，否则模型会照抄' : ''));
  if (n) bad++;
});
const actMentions = (sys0.match(/行为台词/g) || []).length;
const stateMentions = (sys0.match(/<<<STATE/g) || []).length;
console.log('  「行为台词」出现 ' + actMentions + ' 次（同一套协议不该被讲多遍）');
console.log('  「<<<STATE」出现 ' + stateMentions + ' 次（规则 1 次 + 每轮提示 1 次）');
if (actMentions > 3 || stateMentions > 2) { console.log('  !! 协议又被重复讲解，小模型会照抄'); bad++; }

console.log(bad === 0 ? '✅ 服务端提示词装配全部正确' : '!! 有 ' + bad + ' 处不正确');
