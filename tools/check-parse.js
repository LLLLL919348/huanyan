/* 解析层单测：状态行 / HTML 尾巴 / 重复状态行 都要清干净（node 里直接跑 api.js 的解析逻辑） */
global.RP = {
  settings: {
    get: function () {
      return {
        combat: { maxHp: 20, dmg: { heavy: 8 } },
        safety: { bannedOutput: [] },
        assistant: {}, globalPrompt: '', score: {}
      };
    }
  },
  util: { clamp: function (v, a, b) { return Math.max(a, Math.min(b, v)); }, uid: function () { return 'x'; } },
  safety: { scan: function () { return { level: 'ok' }; } },
  store: { get: function () { return { user: { name: '旅人' } }; }, active: function () { return null; } },
  acts: { memoryHint: function () { return ''; }, label: '' },
  chat: { moodOf: function () { return { name: '冷淡' }; } },
  contentGuard: null
};
require('D:/agent/roleplay-studio/assets/js/acts.js');
/* api.js 是个 IIFE，会给 RP.api 赋值；它内部用到的东西上面都备好了 */
require('D:/agent/roleplay-studio/assets/js/api.js');

const cases = [
  {
    name: '正常：状态行在末尾',
    in: '他抬眼看你。\n<<<STATE {"hp":0,"affinity":1,"progress":8,"flag":"none"}>>>',
    want: '他抬眼看你。', state: true
  },
  {
    name: '状态行写在前面、后面还有正文',
    in: '<<<STATE {"hp":0,"affinity":-1,"progress":2,"flag":"warn"}>>> _\n闻鹤年站在门口望着雨。',
    want: '闻鹤年站在门口望着雨。', state: true
  },
  {
    name: '吐了两遍状态行（你日志里那种）',
    in: '<<<STATE {"hp":0,"affinity":-1}>>>\n她走了。\n<<<STATE {"hp":0,"affinity":-1}>>>',
    want: '她走了。', state: true
  },
  {
    name: '带 <br> 的换行（原文有过空行时统一按段落分隔）',
    in: '第一句。<br>第二句。<br><br>第三句。\n<<<STATE {"hp":0}>>>',
    want: '第一句。\n\n第二句。\n\n第三句。', state: true
  },
  {
    name: '没有状态行',
    in: '他只是摇头。',
    want: '他只是摇头。', state: false
  },
  {
    name: '状态行后面接半句自语（正文很长时丢掉）',
    in: '他沉默了很久，窗外的雨一直没停，挂钟又慢了一分，走廊尽头传来脚步声。' + '他抬手示意你坐下。\n<<<STATE {"hp":0}>>> 呃，我刚才说到哪了',
    want: null, state: true
  },
  {
    name: '整段复读三遍（你日志里那种）→ 只留一段',
    in: '闻鹤年点了点头，表示理解：“孩子，你先坐下歇会儿。有话慢慢说。”\n\n' +
      '闻鹤年点了点头，表示理解：“孩子，你先坐下歇会儿。有话慢慢说。”\n\n' +
      '闻鹤年点了点头，表示理解：“孩子，你先坐下歇会儿。有话慢慢说。”\n<<<STATE {"hp":0}>>>',
    want: '闻鹤年点了点头，表示理解：“孩子，你先坐下歇会儿。有话慢慢说。”', state: true
  },
  {
    name: '写到一半被截断的残句 → 剪掉',
    in: '她把温水放在桌上，轻声说：“先喝口水暖暖身子。”\n窗外的雨还在下，她缓缓转过身来，目光温柔地看着眼前',
    want: '她把温水放在桌上，轻声说：“先喝口水暖暖身子。”', state: false
  },
  {
    name: '松散的写法：<< STATE { … } >>（键名带空格）',
    in: '闻鹤年的目光略带冷峻。“关于此事我没有更多可以透露的信息了。”\n<< STATE { "hp" : -5, "affinity" : -1 , " progress" : 0 } >> 如果此刻是黑夜中最寂静无声的',
    want: null, state: true
  },
  {
    name: '括号里假装下裁决（（警告）/（惩戒 hp=-5））→ 抹掉',
    in: '他摇了摇头。（警告）你这问题不该问。（惩戒 hp=-5）他把本子合上。',
    want: '他摇了摇头。你这问题不该问。他把本子合上。', state: false
  },
  {
    name: '基座模型的模板占位符 =>$REPLY$ / <$REPLY$>$+$ REPLY$>',
    in: '闻鹤年眯起眼睛：「孩子，多一事不如少一事。」<<<STATE {"hp":-5}>>=>$REPLY$',
    want: '闻鹤年眯起眼睛：「孩子，多一事不如少一事。」', state: true
  },
  {
    name: '行为台词没收尾下划线 → 原文保留（由 acts 解析容忍），结尾不剪',
    in: '闻鹤年缓缓问道。<<<STATE {"hp":0}>>> _〔警告 hp=-2〕先生，请您稍稍安静些，在这里说话要轻一点哦。我还在照顾病人。',
    want: '闻鹤年缓缓问道。\n_〔警告 hp=-2〕先生，请您稍稍安静些，在这里说话要轻一点哦。我还在照顾病人。', state: true
  },
  {
    name: '把状态字段解释成散文（hp:8 / aff:+2 / flag 改为 / aid null / 游戏状态说明）',
    in: '当然可以，请慢看。\nhp:8 hp上限从下限 -3 增加到 +8；玩家表现得更耐心了 ∕ aff:+2 感受好起来了；progres +=4；flag 改为 none / warn | aid null // 游戏状态说明：游者开始表现出好感。',
    want: '当然可以，请慢看。', state: false
  },
  {
    name: '整段剧情分析（暗示出 / 行为反应表明）→ 摘掉',
    in: '这页记录着一位女士的情况。\n在这个细节中，“一九九八年六月”已经被提出来了，而“接班”的可能性则更加令人不安地将这种历史性的连续性和个人行为联系起来，闻鹤年此时的行为反应表明他对这些内容的敏感度极高。',
    want: '这页记录着一位女士的情况。', state: false
  },
  {
    name: '纯符号残片（"}) / = / - - -）→ 摘掉',
    in: '你在找的人叫什么名字？\n"})\n=\n他没有再说话。',
    want: '你在找的人叫什么名字？\n他没有再说话。', state: false
  },
  {
    name: '新格式行为台词（效果 + 扣血数 + 原因）不能被误删',
    in: '_〔警告 2 原因=你当面数了候诊椅上的人〕「孩子，坐下吧，别数了。」_',
    want: '_〔警告 2 原因=你当面数了候诊椅上的人〕「孩子，坐下吧，别数了。」_', state: false
  },
  {
    name: 'Markdown 加粗 + <场景：…> 标签 + 被截断的 <<<ST',
    in: '你看行不行呵？ _〔警告 2 原因=当面数起纸张、文书〕"孩子, 没必要那么激动."＜场景：她站在暖阁内把玩著一本册子＞**微微叹气** <<<ST',
    want: null, state: false
  }
];

let bad = 0;
cases.forEach(function (c) {
  const r = RP.api.parseState(c.in);
  const hasState = !!r.state;
  const okState = hasState === c.state;
  const okText = c.want === null ? !/STATE/.test(r.text) : r.text === c.want;
  const ok = okState && okText;
  if (!ok) bad++;
  console.log((ok ? '  ✓ ' : '  ✗ ') + c.name);
  if (!ok) {
    console.log('      得到文本: ' + JSON.stringify(r.text));
    console.log('      期望文本: ' + JSON.stringify(c.want === null ? '(不含 STATE)' : c.want));
    console.log('      得到 state: ' + JSON.stringify(r.state) + ' 期望有: ' + c.state);
  }
});
console.log(bad === 0 ? '=== 全部通过 ===' : '=== 失败 ' + bad + ' 项 ===');
