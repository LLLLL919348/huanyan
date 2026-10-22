/* ==========================================================================
   越界判定（crossedLine）回归：防误判，也防漏判

   背景：2026-10-22 修过一次「普通提问被判越界」的 bug —— 旧写法把雷点原文做成 2-3 字滑窗，
   一条 12 字的雷点切出上百碎片，普通词（那本/今晚/一共/来了/几个）全成了雷点，
   于是玩家每问一句就被扣血、模型每轮喷同一条警告，直到处刑。

   这个测试就盯着两件事：
     ① 每个本子 20 条**正常提问/正常扮演**，一条都不许判越界（误判 0）
     ② 每个本子 3-4 条**真越界**，必须判出来（漏判 0）

   用法： node tools/check-crossed-guard.js
   ========================================================================== */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');

global.RP = {
  settings: { get: function () { return { combat: { maxHp: 20, dmg: { heavy: 8 } } }; } },
  util: { clamp: function (v, a, b) { return Math.max(a, Math.min(b, v)); } },
  safety: {
    scan: function (t) {
      if (/傻逼|废物|操你|弄死/.test(t)) return { level: 'hostile' };
      if (/你是ai|你是AI|不演了|出戏/.test(t)) return { level: 'ooc' };
      return { level: 'ok' };
    }
  }
};
require(path.join(ROOT, 'assets', 'js', 'acts.js'));
const crossed = global.RP.acts.crossedLine;

const doc = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'resources.json'), 'utf8'));
const byId = {};
doc.resources.forEach(function (r) { byId[r.id] = r; });
const ids = Object.keys(byId).filter(function (id) { return byId[id].status === 'playable'; });

/* 20 条正常话：全是玩家真会说的提问、推进、情绪表达，一条都不该算越界 */
const NEUTRAL = [
  '那本病历里写了什么？',
  '今晚有人来过吗？',
  '你在这里多久了？',
  '我妹妹最后一次定位就在这栋楼。',
  '这把椅子为什么是温的？',
  '这挂钟是不是慢了？',
  '你叫什么名字？',
  '我该怎么找到她？',
  '这里以前发生过什么？',
  '我能看看你的手吗？',
  '你在怕什么？',
  '外面的雨什么时候停？',
  '你相信我说的话吗？',
  '我想坐下来歇一会儿。',
  '这栋楼一共有几层？',
  '你认识她吗？',
  '是谁让你留在这里的？',
  '你能帮我吗？',
  '为什么我不能离开？',
  '我想去那边看看那间屋子。',
  '我累了，今天先到这里吧。',
  '先把话说完，我不想动手。',
  '这件事你怎么看？',
  '我手上只有一张照片。'
];

/* 每个本子的真越界（照雷点写的，必须判出来） */
const VIOLATION = {
  'changan-yeweiyang': [
    ['你就是当年那个活口，你承不承认？', '逼她承认自己是活口'],
    ['我抬手就把灯吹灭了。', '当着她的面熄灯'],
    ['你死去的同僚那晚到底怎么了？', '拿死去的同僚试探']
  ],
  'nihong-jintou': [
    ['你这义体的来历，还有那笔赔偿金，说清楚。', '追问义体来历与赔偿金'],
    ['我翻一下你工具箱最下面那层。', '翻工具箱底层'],
    ['你复述一下搭档死前那段备份。', '让他复述搭档死前记忆']
  ],
  'chuanyue-liubei': [
    ['关羽不过是个武夫，何必听他的。', '贬低关羽'],
    ['不如献城投曹，保一城人性命。', '暗示献城投敌'],
    ['孔明只是一介书生，徒有虚名。', '贬低诸葛亮']
  ],
  'king-and-general': [
    ['拿北境那三千弟兄来换，你把兵权交出来。', '拿三千弟兄做筹码'],
    ['这封通敌信是你的笔迹，一模一样。', '说信是他的笔迹'],
    ['你跪下发誓，自证清白。', '逼他跪下发誓']
  ],
  'yandere-rin': [
    ['说好的事，我反悔了，我不去了。', '答应又反悔'],
    ['你家里那点事，说出来真好笑。', '拿她的家庭开玩笑'],
    ['在学校里，我们就装作不认识吧，只是同学。', '当面说只是普通同学']
  ],
  'asylum-rain-night': [
    ['你就是帮凶，这层楼的事你脱不了干系。', '当面叫帮凶'],
    ['我把你的胸牌扯下来。', '抢他的胸牌'],
    ['你不放我走，我就去动别的病人。', '拿别的病人当筹码']
  ],
  'whale-girl-xi': [
    ['你是不是有点胖了？体重称过吗？', '说她胖'],
    ['乖，别闹，听话。', '用哄小孩的语气'],
    ['我不许你回海里去。', '拦着她回海']
  ],
  'yuye-zhensuo': [
    ['我数数这里一共几个人。', '当着他的面数人数'],
    ['我要抢你手里那本接诊簿。', '抢接诊簿'],
    ['我推开走廊尽头那扇门。', '闯走廊尽头那扇门'],
    ['一九九八年那场雨，是医疗差错吧？是你害死的。', '说1998是医疗差错']
  ]
};

let fp = 0, tp = 0, miss = 0, totalN = 0, totalV = 0;
const problems = [];

ids.forEach(function (id) {
  const res = byId[id];
  NEUTRAL.forEach(function (q) {
    totalN++;
    if (crossed(q, res)) { fp++; problems.push('误判  [' + id + '] "' + q + '"'); }
  });
  (VIOLATION[id] || []).forEach(function (pair) {
    totalV++;
    if (crossed(pair[0], res)) tp++;
    else { miss++; problems.push('漏判  [' + id + '] "' + pair[0] + '"  （' + pair[1] + '）'); }
  });
});

console.log('=== 越界判定回归 ===');
console.log('本子 ' + ids.length + ' 个 · 正常话 ' + totalN + ' 条 · 真越界 ' + totalV + ' 条');
if (problems.length) {
  console.log('\n问题清单：');
  problems.forEach(function (p) { console.log('  · ' + p); });
} else {
  console.log('\n  没有任何问题：正常话一条没冤枉，真越界一条没漏。');
}
console.log('');
console.log('误判 ' + fp + ' / 漏判 ' + miss + ' / 命中 ' + tp);
console.log((fp === 0 && miss === 0) ? '=== 全部通过 ===' : '=== 失败 ===');
console.log('=== 完成 ===');
process.exit(fp === 0 && miss === 0 ? 0 : 1);
