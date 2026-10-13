/* 生成 Word / WPS 可直接编辑的版本（.doc = 带 Word 头的 HTML）
   用法： node tools/make-doc.js [输出路径] */
const fs = require('fs');
const SRC = 'D:/agent/roleplay-studio/docs/项目计划书.html';
const OUT = process.argv[2] || 'C:/Users/1/Desktop/幻言-项目计划书（可编辑）.doc';

let h = fs.readFileSync(SRC, 'utf8');

/* 1) 去掉封面填写脚本与固定页脚：Word 里不需要 */
h = h.replace(/<script>[\s\S]*?<\/script>\s*/g, '');
h = h.replace(/<div class="foot">[\s\S]*?<\/div>\s*/g, '');

/* 1.5) 把姓名与日期写进封面（可编辑版也带上，用户仍可自行改动） */
const NAME = process.argv[3] || '';
const DATE = process.argv[4] || '';
if (NAME) h = h.replace('<span class="ln" id="coverName">&nbsp;</span>', '<span class="ln">' + NAME + '</span>');
if (DATE) h = h.replace('<span class="ln" id="coverDate">&nbsp;</span>', '<span class="ln">' + DATE + '</span>');

/* 2) 换成 Word 认的页面设置：A4 + 2cm 边距，并把正文装进 WordSection1 */
h = h.replace('<html lang="zh-CN">',
  '<html xmlns:o="urn:schemas-microsoft-com:office:office" ' +
  'xmlns:w="urn:schemas-microsoft-com:office:word" ' +
  'xmlns="http://www.w3.org/TR/REC-html40" lang="zh-CN">');
h = h.replace('@page { size: A4; margin: 17mm 16mm 16mm 16mm; }',
  '@page WordSection1 { size: 21cm 29.7cm; margin: 2cm 1.8cm 2cm 1.8cm; mso-page-orientation: portrait; }\n' +
  '  div.WordSection1 { page: WordSection1; }\n' +
  '  body { font-size: 10.5pt; }\n' +
  '  .section { page-break-before: always; }');
h = h.replace('<body>', '<body>\n<div class="WordSection1">');
h = h.replace('</body>', '</div>\n</body>');

/* 3) Word 对 flex 支持差：封面改用居中块，目录两栏用表格代替 */
h = h.replace(/\.cover \{[^}]*\}/, '.cover { text-align: center; margin-top: 6cm; }');
h = h.replace(/\.cover \.meta \.lb \{[^}]*\}/, '.cover .meta .lb { display: inline-block; width: 26mm; text-align: right; }');

/* 4) 加 BOM，避免 Word 里中文乱码 */
fs.writeFileSync(OUT, '\ufeff' + h, 'utf8');
console.log('已生成：' + OUT + '（' + (fs.statSync(OUT).size / 1024).toFixed(0) + ' KB）');
console.log('Word / WPS / LibreOffice 都能直接打开编辑，改完「另存为 → PDF」即可');
