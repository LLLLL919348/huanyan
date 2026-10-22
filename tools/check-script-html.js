/* 校验「导出可编辑 HTML」那段逻辑：它在浏览器里做的是
     html.replace(/<script id="data" ...>[\s\S]*?<\/script>/, '<script id="data" ...>' + json + closeTag)
   这里用同一套正则跑一遍，确认替换后：脚本闭合标签仍只有 3 个、JSON 能解析、改动确实进去了。 */
'use strict';
const fs = require('fs');

const file = process.argv[2];
const html = fs.readFileSync(file, 'utf8');

/* 取当前内嵌数据 */
const m = /<script id="data" type="application\/json">([\s\S]*?)<\/script>/.exec(html);
if (!m) { console.log('✗ 没找到数据块'); process.exit(1); }
const data = JSON.parse(m[1]);
console.log('原数据：' + data.id + ' / ' + data.name + ' / prompt ' + String(data.prompt || '').length + ' 字');

/* 模拟一次编辑 */
const edited = JSON.parse(JSON.stringify(data));
edited.brief = edited.brief + '（已编辑）';
edited.plotReminder = (edited.plotReminder || []).concat(['这是测试新增的一条']);
edited.prompt = String(edited.prompt || '') + '\n【测试】这是导出时加的一句。';

/* 复刻导出逻辑 */
const closeTag = '<\/scr' + 'ipt>';
const out = html.replace(/<script id="data" type="application\/json">[\s\S]*?<\/script>/,
  '<script id="data" type="application/json">' + JSON.stringify(edited).replace(/<\//g, '<\\/') + closeTag);

let fails = 0;
function ok(c, label, extra) { console.log((c ? '  ✓ ' : '  ✗ ') + label + (extra ? '  —— ' + extra : '')); if (!c) fails++; }

ok((out.match(/<\/script>/g) || []).length === 3, '导出后脚本闭合标签仍是 3 个',
  (out.match(/<\/script>/g) || []).length + ' 个');
ok(out !== html, '导出内容与原文件不同（改动写进去了）');
ok(out.length > html.length, '导出文件更大（多了编辑内容）', html.length + ' → ' + out.length);

const m2 = /<script id="data" type="application\/json">([\s\S]*?)<\/script>/.exec(out);
const data2 = m2 ? JSON.parse(m2[1]) : null;
ok(!!data2, '导出文件里的 JSON 仍可解析');
ok(!!data2 && /（已编辑）/.test(data2.brief), 'brief 的改动保住了');
ok(!!data2 && (data2.plotReminder || []).length === (data.plotReminder || []).length + 1, '新增的提醒条目保住了');
ok(!!data2 && /【测试】/.test(data2.prompt), 'prompt 的改动保住了');
ok(!!data2 && data2.id === data.id, 'id 没变（还是同一个本子）');
ok(out.indexOf('<title>') !== -1 && out.indexOf('id="form"') !== -1, '导出的仍是完整的可编辑页面');

console.log('');
console.log(fails === 0 ? '=== 全部通过 ===' : '=== 失败 ' + fails + ' 项 ===');
process.exit(fails === 0 ? 0 : 1);
