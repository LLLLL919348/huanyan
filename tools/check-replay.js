/* 用玩家日志里那段「复读三遍 + 截断」的真实文本，验一遍清理效果 */
global.RP = {
  settings: { get: () => ({ combat: { maxHp: 20 }, safety: { bannedOutput: [] }, assistant: {}, score: {} }) },
  util: { clamp: (v, a, b) => Math.max(a, Math.min(b, v)) },
  safety: { scan: () => ({ level: 'ok' }) },
  store: { get: () => ({ user: { name: '旅人' } }), active: () => null },
  acts: { memoryHint: () => '' },
  chat: { moodOf: () => ({ name: '冷淡' }) },
  contentGuard: null
};
require('D:/agent/roleplay-studio/assets/js/acts.js');
require('D:/agent/roleplay-studio/assets/js/api.js');

const dup = '闻鹤年（语气中带着温和的安抚），点了点头，表示理解：“孩子，你先坐下歇会儿。有话慢慢说。”' +
  '她转过身去，拿起桌上的一杯温水，轻声说道，“外面雨下得正大，你身上湿漉漉的。来，先喝口水暖暖身子。”';
const raw = dup + '\n\n' + dup + '\n\n' + dup + '\n\n' +
  '闻鹤年（语气中带着温和的安抚），轻轻地拍了拍桌上的热水杯：“孩子，坐下来歇会儿。”' +
  '她缓缓转过身来，目光温柔地看着眼前的“孩子';
const r = RP.api.parseState(raw);
console.log('原文 ' + raw.length + ' 字 → 清理后 ' + r.text.length + ' 字');
console.log('---- 清理结果 ----');
console.log(r.text);
console.log('---- 检查 ----');
console.log('还含重复段：' + (r.text.split('点了点头，表示理解').length - 1) + ' 次（应为 1）');
console.log('结尾是否完整：' + /[。”]$/.test(r.text));
