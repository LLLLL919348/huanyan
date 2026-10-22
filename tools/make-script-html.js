/* 把一个剧本文本（资源对象）生成为**可编辑、可保存**的单文件 HTML。
   用法：
     node tools/make-script-html.js --id changan-yeweiyang --out "C:\\...\\幻言剧本-长安夜未央.html"
     node tools/make-script-html.js --blank --out "C:\\...\\幻言剧本-新建.html"
   数据默认取自 data/resources.json；加 --src <文件> 可指定（比如从服务器拉下来的那份）。 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const TPL = path.join(__dirname, 'script-editor-template.html');

function arg(name, dflt) {
  const i = process.argv.indexOf('--' + name);
  return i === -1 ? dflt : process.argv[i + 1];
}
const OUT = arg('out');
const ID = arg('id');
const SRC = arg('src', path.join(ROOT, 'data', 'resources.json'));
const BLANK = process.argv.indexOf('--blank') !== -1;
if (!OUT) { console.log('用法： node tools/make-script-html.js --id <资源id> --out <输出.html>  |  --blank --out <输出.html>'); process.exit(2); }

/* 空模板：字段齐全，但全是空的；挂上「幻言」的通用骨架，方便直接填 */
function blankResource() {
  return {
    id: 'new-script',
    name: '（新本子）',
    subtitle: '',
    genres: [],
    rating: '18+',
    length: '短线',
    status: 'upcoming',
    difficulty: 2,
    powerBalance: 'equal',
    heat: 0,
    players: 0,
    cover: { motif: 'lantern', palette: ['#1b1020', '#8c3b4a', '#e8b06a'] },
    brief: '',
    metaLines: ['身份：', '关系：', '节奏：'],
    intro: '',
    teaser: '',
    world: '',
    character: { name: '', title: '', age: '', appearance: '', personality: '', speech: '', desire: '', taboo: [] },
    userRole: '',
    plot: '',
    plotReminder: [],
    openingHints: [],
    beats: [],
    scenes: [],
    rules: [],
    hpRules: [],
    plotRules: [],
    behaviorRules: [],
    replies: { greeting: [], question: [], action: [], emotion: [], flirt: [], default: [], punish: [], execution: [], leave: [] },
    prompt: [
      '【角色】你扮演……（姓名、年龄、身份；语速与称呼习惯；他只做什么、不做什么）',
      '',
      '【世界观与场景】……（地点、时间、这个世界的规矩）',
      '',
      '【玩家已知】',
      '· ……（玩家确实知道的人名、物件、线索 —— 角色只能问这里有的信息）',
      '',
      '【双方共知】',
      '· ……',
      '',
      '【只有你知道的】',
      '· ……（分层揭示，不要一次说完）',
      '',
      '【你的私心与误导】',
      '· 你想要什么；你会说哪几句假话；谎的破绽在哪（玩家能靠什么抓住你）',
      '',
      '【态度基准与转折】',
      '· 基准：……；他做了什么事时，你转为……',
      '',
      '【剧情规则】',
      '· 推进度只看真做成的事，与轮数无关；重复追问同一件事推进度减半。',
      '',
      '【行为规则】',
      '· 只有玩家明确踩到上面列出的禁忌才扣血；提问、追问、要看证据都不算越界。',
      '· 需要制裁时，必须先输出一条下划线行为台词 _〔效果 参数〕台词正文_，没有行为台词不允许扣血。',
      '',
      '【输出格式】先输出角色的正文（第一人称，动作与环境写进句子里，不要用括号写旁白），正文结束后另起一行输出：',
      '<<<STATE {"hp":0,"affinity":1,"progress":6,"flag":"none","aid":null,"reason":"简短原因"}>>>'
    ].join('\n')
  };
}

const tpl = fs.readFileSync(TPL, 'utf8');
let data;
if (BLANK) {
  data = blankResource();
} else {
  if (!ID) { console.log('✗ 要么给 --id，要么加 --blank'); process.exit(2); }
  const doc = JSON.parse(fs.readFileSync(SRC, 'utf8'));
  data = (doc.resources || []).filter(function (r) { return r.id === ID; })[0];
  if (!data) { console.log('✗ ' + SRC + ' 里没有 id=' + ID); process.exit(1); }
}

const json = JSON.stringify(data).replace(/<\//g, '<\\/');
const title = (data.name || data.id) + ' · 幻言剧本';
const html = tpl.replace('__DATA__', json).replace(/__TITLE__/g, title);

/* ★ 自检：整份文件里有且只有 3 个脚本闭合标签（报错脚本、数据块、编辑器各一个）。
   多出来的一定是被写进 JS 字符串里的字面量 —— HTML 解析器会在那里提前结束脚本，
   表现是"页面打开一片空白"（这个坑踩过一次，所以现在生成时就拦下来）。 */
const closes = (html.match(/<\/script>/g) || []).length;
if (closes !== 3) {
  console.log('✗ 生成失败：文件里有 ' + closes + ' 个 </script>，应该正好 3 个。');
  console.log('  多半是脚本源码里写了字面量的闭合标签，请拆成 \'<\\/scr\' + \'ipt>\'。');
  process.exit(1);
}
const editorStart = html.lastIndexOf('<script>') + 8;
const editorBody = html.slice(editorStart, html.lastIndexOf('</script>'));
if (editorBody.indexOf('</script>') !== -1) {
  console.log('✗ 生成失败：编辑器脚本里出现了字面量的 </script>，浏览器会在这里提前截断。');
  process.exit(1);
}
const dash = (html.match(/__DATA__|__TITLE__/g) || []).length;
if (dash) { console.log('✗ 生成失败：还有 ' + dash + ' 个未替换的占位符'); process.exit(1); }

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, html, 'utf8');
console.log('✓ ' + OUT);
console.log('  ' + (data.name || '') + '（' + data.id + '）· ' + Math.round(Buffer.byteLength(html) / 1024) + ' KB · prompt ' + String(data.prompt || '').length + ' 字');
