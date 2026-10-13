/* 把子代理产出的新资源合并进 data/resources.json，并同步到内置副本
   用法： node tools/merge-resources.js data/new-a.json data/new-b.json
   按 id 去重（已存在的会被替换），跑完自动调用 sync-resources.js。 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const ROOT = path.join(__dirname, '..');
const MAIN = path.join(ROOT, 'data', 'resources.json');

const data = JSON.parse(fs.readFileSync(MAIN, 'utf8'));
const byId = new Map((data.resources || []).map(function (r) { return [r.id, r]; }));

let added = 0, updated = 0;
process.argv.slice(2).forEach(function (rel) {
  const f = path.isAbsolute(rel) ? rel : path.join(ROOT, rel);
  if (!fs.existsSync(f)) { console.log('跳过（不存在）：' + rel); return; }
  const pack = JSON.parse(fs.readFileSync(f, 'utf8'));
  (pack.resources || []).forEach(function (r) {
    if (!r || !r.id) return;
    if (byId.has(r.id)) { byId.set(r.id, r); updated++; }
    else { byId.set(r.id, r); added++; }
  });
  console.log('已读入 ' + rel + '（' + (pack.resources || []).length + ' 个）');
});

/* 排序：可游玩在前，其次按 heat 降序，保持稳定 */
const list = Array.from(byId.values()).sort(function (a, b) {
  const pa = a.status === 'playable' ? 0 : 1, pb = b.status === 'playable' ? 0 : 1;
  if (pa !== pb) return pa - pb;
  return (b.heat || 0) - (a.heat || 0);
});
data.resources = list;
fs.writeFileSync(MAIN, JSON.stringify(data, null, 2) + '\n', 'utf8');
console.log('合并完成：新增 ' + added + '，替换 ' + updated + '，共 ' + list.length + ' 个资源');

execFileSync(process.execPath, [path.join(__dirname, 'sync-resources.js')], { stdio: 'inherit' });
