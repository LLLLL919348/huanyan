/* ==========================================================================
   站点统计（浏览量 / 独立访客 / 各本子进入次数 / 对话轮数）

   设计取舍：
     · 零依赖、JSON 落盘，跟站点其它数据一样是纯文件，备份即复制目录。
     · 不存 IP、不存 User-Agent、不存任何能回指到人的东西 —— 只存：
         - 每天的 PV 数
         - 每天的访客去重集合（用「匿名 cookie + 当日盐」的哈希前 16 位，不落原始 cookie）
         - 每个本子的进入次数、每天的对话轮数
     · PV 记在服务端返回首页时，不依赖前端 JS（广告拦截器挡不掉，也不用额外请求）。
     · 写入防抖 1.5 秒 + 临时文件原子替换，避免频繁 IO；保留 120 天。
   ========================================================================== */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.join(__dirname, '..');
const FILE = path.join(ROOT, 'data', 'stats.json');
const KEEP_DAYS = 120;

let data = null;
let dirty = false;
let timer = null;
let daySalt = '';

function today() {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return d.getFullYear() + '-' + m + '-' + day;
}
function load() {
  if (data) return data;
  try { data = JSON.parse(fs.readFileSync(FILE, 'utf8')) || {}; } catch (e) { data = {}; }
  if (!data.days || typeof data.days !== 'object') data.days = {};
  if (!data.resources || typeof data.resources !== 'object') data.resources = {};
  if (!data.total || typeof data.total !== 'object') data.total = { pv: 0, turns: 0, plays: 0 };
  if (!data.firstDay) data.firstDay = today();
  return data;
}
function save() {
  const d = load();
  try {
    const tmp = FILE + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(d), 'utf8');
    fs.renameSync(tmp, FILE);
  } catch (e) { /* 落盘失败不影响对外服务 */ }
}
function schedule() {
  dirty = true;
  if (timer) return;
  timer = setTimeout(function () { timer = null; if (dirty) { dirty = false; save(); } }, 1500);
  if (timer.unref) timer.unref();
}
function bucket(day) {
  const d = load();
  if (!d.days[day]) d.days[day] = { pv: 0, uv: {}, turns: 0, plays: 0 };
  const b = d.days[day];
  if (!b.uv || typeof b.uv !== 'object') b.uv = {};
  if (typeof b.pv !== 'number') b.pv = 0;
  if (typeof b.turns !== 'number') b.turns = 0;
  if (typeof b.plays !== 'number') b.plays = 0;
  return b;
}
/* 当日盐：换日即换，保证跨天无法把同一个访客串起来 */
function salt() {
  const t = today();
  if (!daySalt || daySalt.slice(0, 10) !== t) {
    daySalt = t + ':' + crypto.randomBytes(8).toString('hex');
  }
  return daySalt;
}
function hashVisitor(vid) {
  return crypto.createHash('sha256').update(salt() + '|' + String(vid || '?')).digest('hex').slice(0, 16);
}
function prune() {
  const d = load();
  const days = Object.keys(d.days).sort();
  const cut = new Date(Date.now() - KEEP_DAYS * 86400000);
  const cutKey = cut.getFullYear() + '-' + String(cut.getMonth() + 1).padStart(2, '0') + '-' + String(cut.getDate()).padStart(2, '0');
  let removed = 0;
  days.forEach(function (k) { if (k < cutKey) { delete d.days[k]; removed++; } });
  if (removed) schedule();
}

/* —— 对外接口 —— */
function pageView(vid) {
  const d = load();
  const b = bucket(today());
  b.pv += 1;
  d.total.pv = (d.total.pv || 0) + 1;
  if (vid) b.uv[hashVisitor(vid)] = 1;
  schedule();
}
function play(resourceId) {
  const id = String(resourceId || '').slice(0, 60);
  if (!id) return;
  const d = load();
  bucket(today()).plays += 1;
  d.total.plays = (d.total.plays || 0) + 1;
  d.resources[id] = (d.resources[id] || 0) + 1;
  schedule();
}
function turn() {
  const d = load();
  bucket(today()).turns += 1;
  d.total.turns = (d.total.turns || 0) + 1;
  schedule();
}
function flush() { if (dirty) { dirty = false; save(); } }

/* 给后台看的快照：近 N 天 + 累计 + 各本子 */
function snapshot(days) {
  const d = load();
  const n = Math.max(1, Math.min(120, Number(days) || 14));
  const list = [];
  for (let i = n - 1; i >= 0; i--) {
    const t = new Date(Date.now() - i * 86400000);
    const key = t.getFullYear() + '-' + String(t.getMonth() + 1).padStart(2, '0') + '-' + String(t.getDate()).padStart(2, '0');
    const b = d.days[key] || { pv: 0, uv: {}, turns: 0, plays: 0 };
    list.push({ day: key, pv: b.pv || 0, uv: Object.keys(b.uv || {}).length, turns: b.turns || 0, plays: b.plays || 0 });
  }
  const t = list[list.length - 1] || { pv: 0, uv: 0, turns: 0, plays: 0 };
  const y = list[list.length - 2] || { pv: 0, uv: 0, turns: 0, plays: 0 };
  const sum = list.reduce(function (a, x) {
    a.pv += x.pv; a.uv += x.uv; a.turns += x.turns; a.plays += x.plays; return a;
  }, { pv: 0, uv: 0, turns: 0, plays: 0 });
  const resources = Object.keys(d.resources || {}).map(function (k) {
    return { id: k, plays: d.resources[k] };
  }).sort(function (a, b) { return b.plays - a.plays; });
  return {
    today: t, yesterday: y,
    range: { days: n, pv: sum.pv, uv: sum.uv, turns: sum.turns, plays: sum.plays },
    total: { pv: d.total.pv || 0, turns: d.total.turns || 0, plays: d.total.plays || 0 },
    firstDay: d.firstDay,
    list: list,
    resources: resources
  };
}

load();
prune();
process.on('exit', flush);

module.exports = {
  pageView: pageView, play: play, turn: turn,
  snapshot: snapshot, flush: flush,
  _file: FILE
};
