/* Extract the <pre id="out"> text from a --dump-dom capture. Usage: node tools/extract-out.js <file> */
const fs = require('fs');
const p = process.argv[2];
let s = '';
try { s = fs.readFileSync(p, 'utf8'); } catch (e) { console.log('(cannot read ' + p + ')'); process.exit(0); }
const m = /<pre id="out">([\s\S]*?)<\/pre>/.exec(s);
if (!m) { console.log('(no #out block found - page may not have finished)'); process.exit(0); }
const dec = t => t.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');
console.log(dec(m[1]));
