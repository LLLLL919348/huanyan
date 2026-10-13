/* 打印某一轮「模型实际收到的完整提示词」：system（规则+本子+本场规则）+ 历史 + 末位状态消息
   用法： node tools/dump-prompt.js [资源id] [full|compact] */
const fs = require('fs');
const pr = require('D:/agent/roleplay-studio/server/prompt.js');

const resId = process.argv[2] || 'yuye-zhensuo';
const mode = process.argv[3] || 'compact';
const set = JSON.parse(fs.readFileSync('D:/agent/roleplay-studio/data/settings.json', 'utf8'));
const list = JSON.parse(fs.readFileSync('D:/agent/roleplay-studio/data/resources.json', 'utf8')).resources;
const resource = list.filter(function (r) { return r.id === resId; })[0];
if (!resource) { console.log('没有这个资源：' + resId); process.exit(1); }

const mo = mode === 'compact'
  ? { base: 'http://127.0.0.1:11434/v1', model: 'rp3b:latest', compact: 'auto' }
  : { base: 'https://api.deepseek.com/v1', model: 'deepseek-chat', compact: 'auto' };

const state = {
  userName: '旅人', hp: 8, maxHp: 20, mood: '戒备', turn: 4, progress: 12, warned: 1, conduct: 0,
  actMute: 0, silent: false, lastAi: '这页似乎记录着一位名叫艾琳·李女士于 1987 年的详细情况。'
};
const history = [
  { role: 'user', content: '我是来找妹妹的，今晚来过谁？' },
  { role: 'assistant', content: '（他把手电筒放在桌上）雨停之前，你哪儿也去不了。' },
  { role: 'user', content: '病历上写了什么你要告诉我啊' }
];

const msgs = pr.buildMessages(resource, Object.assign({}, set, { __model: mo }), state, history);
console.log('资源：' + resource.name + '（' + resId + '）');
console.log('模式：' + mode + '　消息条数：' + msgs.length);
let total = 0;
msgs.forEach(function (m, i) {
  total += m.content.length;
  console.log('');
  console.log('========== 消息 ' + (i + 1) + ' 【' + m.role + '】 ' + m.content.length + ' 字 ==========');
  console.log(m.content);
});
console.log('');
console.log('========== 合计 ' + total + ' 字（约 ' + Math.round(total / 1.4) + ' token）==========');
