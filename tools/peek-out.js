/* 抓 tools/live-shot.html 或任意 harness 的 #out 内容（调试用） */
const fs = require('fs');
const p = process.argv[2];
const s = fs.readFileSync(p, 'utf8');
const m = /<pre id="out">([\s\S]*?)<\/pre>/.exec(s);
if (!m) {
  console.log('no #out; 页面长度=' + s.length);
  const t = /<title>([^<]*)<\/title>/.exec(s);
  console.log('title=' + (t ? t[1] : '?'));
  process.exit(0);
}
console.log(m[1].replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&amp;/g, '&'));
