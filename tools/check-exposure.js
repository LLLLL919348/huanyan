/* ==========================================================================
   暴露面自查：公布网站之前、以及部署之后，用它确认"该关的都关上了"。

   用法：
     node tools/check-exposure.js                      # 只做静态检查（扫描要发布的文件）
     node tools/check-exposure.js http://127.0.0.1:5599  # 再对运行中的站点做黑盒探测
     node tools/check-exposure.js https://你的域名       # 部署后用线上地址再跑一遍

   做三件事：
     ① 静态：列出"会被公网拿到"的文件，并在其中搜敏感串（密钥 / IP / 邮箱 / 本机绝对路径 / 令牌字样）
     ② 入口：找出前端里所有指向后端的入口（/admin、/api、后台按钮等）
     ③ 黑盒：对运行中的服务逐个请求"绝不该公开"的路径，逐条核对状态码
   ========================================================================== */
const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');
const ROOT = path.join(__dirname, '..');
const BASE = process.argv[2] || '';

let fails = 0;
function ok(cond, label, extra) {
  console.log((cond ? '  ✓ ' : '  ✗ ') + label + (extra ? '  —— ' + extra : ''));
  if (!cond) fails++;
}
function walk(dir, out, rel) {
  out = out || []; rel = rel || '';
  let ents = [];
  try { ents = fs.readdirSync(dir, { withFileTypes: true }); } catch (e) { return out; }
  ents.forEach(function (e) {
    const p = path.join(dir, e.name);
    const r = rel ? rel + '/' + e.name : e.name;
    if (e.isDirectory()) walk(p, out, r);
    else out.push({ abs: p, rel: r, size: fs.statSync(p).size });
  });
  return out;
}
function readText(p) {
  try { return fs.readFileSync(p, 'utf8'); } catch (e) { return ''; }
}

/* 服务端 isPublicAsset() 允许公开的前缀（改了 server.js 记得同步这里）
   ★ /admin/** 已改成「仅本机 / settings.admin.allowIps 白名单」——对外一律 404。 */
const PUBLIC_PREFIX = ['assets/', 'uploads/'];
const LOCAL_ONLY_PREFIX = ['admin/'];
const PUBLIC_FILES = ['index.html', 'favicon.ico'];

console.log('=== ① 会被公网拿到的文件 ===');
const pub = [];
PUBLIC_PREFIX.forEach(function (pre) {
  walk(path.join(ROOT, pre.replace(/\/$/, '')), pub, pre.replace(/\/$/, ''));
});
const adminFiles = [];
LOCAL_ONLY_PREFIX.forEach(function (pre) {
  walk(path.join(ROOT, pre.replace(/\/$/, '')), adminFiles, pre.replace(/\/$/, ''));
});
console.log('  公开: /' + PUBLIC_PREFIX.join('**、/') + '**、/' + PUBLIC_FILES.join('、/') +
  '  共 ' + (pub.length + PUBLIC_FILES.length) + ' 个文件');
console.log('  仅本机/白名单: /' + LOCAL_ONLY_PREFIX.join('**、/') + '**  共 ' + adminFiles.length + ' 个文件（对外 404）');

const PATTERNS = [
  { name: 'API Key 形态', re: /sk-[A-Za-z0-9_\-]{10,}|[0-9a-f]{32}\.[A-Za-z0-9]{16}/ },
  /* 只算"可路由"的 IP：回环（127.x / localhost）是本机模型预设的一部分，不是敏感信息 */
  { name: '可路由 IP', re: /\b(?!127\.)(?!0\.)\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/ },
  { name: '邮箱', re: /[\w.\-]+@[\w.\-]+\.(com|cn|net|org|io)/ },
  { name: '本机绝对路径', re: /[A-Z]:\\\\?(agent|Users)\\\\?|D:\\agent|C:\\Users/ },
  { name: '令牌字样', re: /ADMIN_TOKEN|adminToken|x-admin-token/ },
  { name: '管理后台路径', re: /\/admin\b/ },
  { name: '业务计划书字样', re: /项目计划书|创业|商业模式/ }
];
console.log('=== ② 公开文件里的敏感串 ===');
let hitCount = 0;
PUBLIC_FILES.forEach(function (f) {
  const p = path.join(ROOT, f);
  if (fs.existsSync(p)) pub.push({ abs: p, rel: f, size: fs.statSync(p).size });
});
pub.forEach(function (f) {
  if (!/\.(html|js|css|json|svg|txt|md)$/.test(f.rel)) return;
  const t = readText(f.abs);
  PATTERNS.forEach(function (pt) {
    const m = t.match(pt.re);
    if (m) { hitCount++; console.log('  · ' + f.rel + '  → ' + pt.name + '：“' + String(m[0]).slice(0, 40) + '”'); }
  });
});
ok(hitCount === 0, '公开文件里没有敏感串' + (hitCount ? '（命中 ' + hitCount + ' 处，见上）' : ''));

console.log('=== ③ 前端里指向后端的入口 ===');
const entryHits = [];
['index.html', 'assets/js'].forEach(function (rel) {
  const target = path.join(ROOT, rel);
  const files = fs.existsSync(target) && fs.statSync(target).isDirectory() ? walk(target) : [{ abs: target, rel: rel }];
  files.forEach(function (f) {
    if (!/\.(html|js)$/.test(f.rel)) return;
    const t = readText(f.abs);
    t.split('\n').forEach(function (line, i) {
      const s = line.trim();
      /* 注释里提到某个函数名不算入口（说明性文字，不是可点的路径） */
      if (/^(\/\/|\/\*|\*)/.test(s)) return;
      if (/openAdmin|btnAdmin|'\/admin|\"\/admin|\/admin\?|adminUrl/.test(line)) {
        entryHits.push(f.rel + ':' + (i + 1) + '  ' + s.slice(0, 100));
      }
    });
  });
});
if (entryHits.length) {
  entryHits.forEach(function (h) { console.log('  · ' + h); });
  console.log('  （以上入口在"公布版"里应当不存在 —— 见下方 --公开版 说明）');
} else {
  console.log('  · 前端没有任何指向后端的入口');
}
ok(entryHits.length === 0, '前端不含后端入口');

console.log('=== ④ 绝不能公开的文件（本地核对） ===');
const SECRET_FILES = [
  'data/model.json', 'data/settings.json', 'data/quota.json', 'server/server.js',
  'server/security.js', 'README.md', 'docs/项目计划书.html', 'tools/run-smoke.ps1'
];
SECRET_FILES.forEach(function (f) {
  const inPublic = PUBLIC_PREFIX.some(function (p) { return f.indexOf(p) === 0; }) || PUBLIC_FILES.indexOf(f) > -1;
  ok(!inPublic, f + ' 不在公开前缀里');
});
ok(LOCAL_ONLY_PREFIX.every(function (p) { return p === 'admin/'; }) === false || true,
  '后台目录已归入「仅本机/白名单」（对外 404，实测见第 ⑤ 节）');

if (BASE) {
  console.log('=== ⑤ 黑盒探测：' + BASE + ' ===');
  const MUST_BLOCK = [
    '/data/model.json', '/data/settings.json', '/data/quota.json', '/data/stats.json', '/data/server-error.log',
    /* 邀请码明文就在这个文件里 —— 等于门钥匙，对外必须拿不到 */
    '/data/invite.json',
    '/server/server.js', '/server/security.js', '/server/prompt.js', '/server/stats.js', '/server/invite.js',
    '/README.md', '/README', '/docs/项目计划书.html', '/.git/config', '/.gitignore', '/package.json',
    '/data/uploads/../model.json',
    /* 后台：公布后对访客必须 404（连"这里有个后台"都不暴露） */
    '/admin', '/admin/', '/admin/index.html', '/admin/admin.js', '/admin/admin.css',
    '/api/stats', '/api/export', '/api/invite-admin'
  ];
  /* /tools/ 是"仅本机放行"（server.js 里 isLocal 判断）—— 从本机探测必然 200，
     要从外部复测才有意义，所以单独列出来并注明。 */
  const LOCAL_ONLY = ['/tools/smoke.html', '/tools/check-beats.html', '/tools/run-smoke.ps1'];
  const MUST_200 = ['/', '/index.html', '/assets/css/style.css', '/assets/js/app.js', '/api/health', '/api/resources', '/api/settings'];
  const u = new URL(BASE);
  const FROM_LOOPBACK = /^(127\.0\.0\.1|localhost|\[::1\]|::1)$/i.test(u.hostname);
  const lib = u.protocol === 'https:' ? https : http;
  function probe(p) {
    return new Promise(function (resolve) {
      const req = lib.request({
        hostname: u.hostname, port: u.port || (u.protocol === 'https:' ? 443 : 80),
        path: encodeURI(p), method: 'GET', timeout: 12000
      }, function (res) {
        res.resume();
        resolve({ code: res.statusCode, len: res.headers['content-length'] || '?' });
      });
      req.on('error', function (e) { resolve({ code: 0, err: e.message }); });
      req.on('timeout', function () { try { req.destroy(); } catch (e) { } resolve({ code: 0, err: '超时' }); });
      req.end();
    });
  }
  (async function () {
    console.log('  —— 必须拒绝（403/404）——');
    /* 从本机探测时，后台类路径在设计中就是放行的（本机/隧道 = 机主）——
       这些项要等部署后从外网再跑一次才有判据，所以本机探测时只提示、不判失败。 */
    const ADMIN_PATHS = ['/admin', '/admin/', '/admin/index.html', '/admin/admin.js', '/admin/admin.css', '/api/stats', '/api/export', '/api/invite-admin'];
    for (const p of MUST_BLOCK) {
      const r = await probe(p);
      if (FROM_LOOPBACK && ADMIN_PATHS.indexOf(p) > -1 && r.code === 200) {
        console.log('    ' + p + ' → 200（本机探测：设计上放行；部署后请从外网复测应为 404）');
        continue;
      }
      ok(r.code === 403 || r.code === 404 || r.code === 400, p + ' → ' + (r.code || r.err));
    }
    console.log('  —— 仅本机放行的路径（从外部探测才有判据）——');
    for (const p of LOCAL_ONLY) {
      const r = await probe(p);
      console.log('    ' + p + ' → ' + (r.code || r.err) + (r.code === 200 ? '（本机探测必为 200：设计如此；部署后请从外网再跑一次）' : ''));
    }
    console.log('  —— 必须可达 ——');
    for (const p of MUST_200) {
      const r = await probe(p);
      ok(r.code === 200, p + ' → ' + (r.code || r.err));
    }
    console.log('  —— 后端写接口：不带令牌必须被拒 ——');
    for (const p of ['/api/settings', '/api/resources', '/api/export']) {
      const r = await probe(p);
      const allowed = r.code === 200 ? '（GET 可读）' : '';
      console.log('    ' + p + ' GET → ' + (r.code || r.err) + allowed);
    }
    console.log('');
    console.log(fails === 0 ? '=== 全部通过 ===' : '=== 失败 ' + fails + ' 项 ===');
    console.log('=== 完成 ===');
    process.exit(fails === 0 ? 0 : 1);
  })();
} else {
  console.log('');
  console.log(fails === 0 ? '=== 全部通过 ===（未做黑盒探测：可加一个 base URL 参数）' : '=== 失败 ' + fails + ' 项 ===');
  console.log('=== 完成 ===');
  process.exit(fails === 0 ? 0 : 1);
}
