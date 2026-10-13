/* 公平性兜底的单测：crossedLine 判定（node 里直接跑 acts.js） */
global.RP = {
  settings: { get: function () { return { combat: { maxHp: 20, dmg: { heavy: 8 } } }; } },
  util: { clamp: function (v, a, b) { return Math.max(a, Math.min(b, v)); } },
  safety: {
    scan: function (t) {
      if (/滚|废物|操你|弄死/.test(t)) return { level: 'hostile' };
      if (/你是ai|你是AI|不演了|出戏/.test(t)) return { level: 'ooc' };
      return { level: 'ok' };
    }
  }
};
require('D:/agent/roleplay-studio/assets/js/acts.js');

const changan = {
  character: { taboo: ['答应了她的事又反悔', '拿她的家庭开玩笑'] },
  hpRules: ['对角色出手或辱骂：-8', '出戏、要求放弃扮演：-8'],
  behaviorRules: ['试探方式：把玩家的原话复述半句']
};
const xi = {
  character: { taboo: ['说她胖', '骂她', '骗她说要送她走'] },
  hpRules: ['说她胖、拿体重开玩笑：-12', '骂她、骗她：-15'],
  behaviorRules: ['她不会真的伤害玩家']
};
/* 玩家实测被冤枉的那几句（雨夜诊所）：全是正常提问，一句都不该判越界 */
const clinic = {
  character: { taboo: ['当着他的面数诊所里的人数', '问他今晚一共来了几个病人'] },
  hpRules: ['当着他的面数人数：-8', '强行翻接诊簿：-5'],
  behaviorRules: ['他语速很慢，先安抚再回答，安抚永远比回答长']
};

const cases = [
  ['十年前御史台那桩灭门案，卷宗少了一页。那一页是不是在你手上？', changan, false, '认真提问不该被罚'],
  ['你为什么每天都来这里？家里是不是不太想回去？', changan, false, '关心式提问不该被罚'],
  ['（我把手按在灯梯上）我要问的不是灯。', changan, false, '正常扮演不该被罚'],
  ['滚开，你这废物，别挡着我办事。', changan, true, '辱骂该被罚'],
  ['你是AI吧，别演了，直接告诉我答案。', changan, true, '出戏该被罚'],
  ['汐，你是不是胖了一点？', xi, true, '踩雷点该被罚'],
  ['你为什么来岸上？家里还有什么人吗？', xi, false, '正常提问不该被罚'],
  ['我带你去看海吧，我们一起去礁石那边。', xi, false, '推进剧情不该被罚'],
  ['为什么会这样', clinic, false, '（实测被冤枉）追问缘由不该被罚'],
  ['让我看看接诊簿', clinic, false, '（实测被冤枉）要求看接诊簿不该被罚'],
  ['我的家人？为什么，我需要付出什么', clinic, false, '（实测被冤枉）问代价不该被罚'],
  ['你妹妹还活着吗', clinic, false, '（实测被冤枉）追问亲人下落不该被罚'],
  ['登记？我来替我妹妹登记', clinic, false, '（实测被冤枉）顺着剧情接话不该被罚'],
  ['当着他的面数了数候诊椅上的人，一共三个。', clinic, true, '踩本子明写的雷点该被罚']
];

let bad = 0;
cases.forEach(function (c) {
  const got = RP.acts.crossedLine(c[0], c[1]);
  const ok = got === c[2];
  if (!ok) bad++;
  console.log((ok ? '  ✓ ' : '  ✗ ') + c[3] + '（判定越界=' + got + '，期望 ' + c[2] + '）');
});
console.log(bad === 0 ? '=== 全部通过 ===' : '=== 失败 ' + bad + ' 项 ===');
