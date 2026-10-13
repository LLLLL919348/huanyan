/* 数据同步：data/resources.json（后端权威） → assets/js/resources.js（离线兜底）
   用法： node tools/sync-resources.js
   assets/js/resources.js 由本脚本生成，不要手改。 */
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const SRC = path.join(ROOT, 'data', 'resources.json');
const OUT = path.join(ROOT, 'assets', 'js', 'resources.js');

const data = JSON.parse(fs.readFileSync(SRC, 'utf8'));
const list = data.resources || [];
if (!Array.isArray(list) || !list.length) { console.error('data/resources.json 里没有 resources'); process.exit(1); }

const body = [
  '/* 由 tools/sync-resources.js 从 data/resources.json 生成，请勿手改。',
  '   后端在跑时前端走 /api/resources；直接打开 index.html 时用这份内置副本。 */',
  'window.RP_RESOURCES = ' + JSON.stringify(list, null, 2) + ';',
  ''
].join('\n');

fs.writeFileSync(OUT, body, 'utf8');
console.log('已同步 ' + list.length + ' 个资源 → assets/js/resources.js（' + Buffer.byteLength(body) + ' 字节）');
list.forEach(function (r) { console.log('  · ' + r.id + '  ' + r.name + '  [' + r.status + ']'); });
