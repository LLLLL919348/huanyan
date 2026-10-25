/* ==========================================================================
   投稿 → 审核 → 上线 的端到端验收（对着运行中的后端发 HTTP）

   邀请制删除后，投稿入口只认管理令牌（访客不再能投稿），链路仍然要能跑：

   ① 不带令牌提交 → 403
   ② 带令牌提交 → 200，进审核池，且**不会**立刻出现在 /api/resources
   ③ 后台能读到这条待审
   ④ 通过（设为可游玩）→ 生成资源并出现在 /api/resources
   ⑤ 再投一条并驳回 → 状态 rejected、理由记下、不生成资源
   ⑥ 收尾：删掉测试资源

   用法： ADMIN_TOKEN=xxx node tools/check-submit.js http://127.0.0.1:5599
   ========================================================================== */
'use strict';
const http = require('http');
const https = require('https');
const BASE = process.argv[2] || 'http://127.0.0.1:5599';
const TOKEN = process.env.ADMIN_TOKEN || '';
const u = new URL(BASE);
const lib = u.protocol === 'https:' ? https : http;

let pass = 0, fail = 0;
function ok(c, label, extra) {
  console.log((c ? '  \u2713 ' : '  \u2717 ') + label + (extra ? '  \u2014\u2014 ' + extra : ''));
  if (c) pass++; else fail++;
}
function req(method, path, body, headers) {
  return new Promise(function (resolve) {
    const data = body === undefined ? null : Buffer.from(JSON.stringify(body), 'utf8');
    const h = Object.assign({}, headers || {});
    if (data) { h['Content-Type'] = 'application/json'; h['Content-Length'] = data.length; }
    const r = lib.request({ hostname: u.hostname, port: u.port || 80, path: path, method: method, headers: h, timeout: 20000 },
      function (res) {
        const c = [];
        res.on('data', function (d) { c.push(d); });
        res.on('end', function () {
          let j = null;
          try { j = JSON.parse(Buffer.concat(c).toString('utf8')); } catch (e) { }
          resolve({ code: res.statusCode, json: j });
        });
      });
    r.on('error', function (e) { resolve({ code: 0, err: e.message }); });
    r.on('timeout', function () { r.destroy(); resolve({ code: 0, err: '超时' }); });
    if (data) r.write(data);
    r.end();
  });
}
const adm = function (m, p, b) { return req(m, p, b, { 'x-admin-token': TOKEN }); };

const DRAFT = function (name) {
  return {
    name: name, subtitle: '都市 · 悬疑', brief: '一句话简介', teaser: '钩子',
    intro: '开场', world: '世界观', userRole: '你是访客', plot: '起承转',
    character: { name: '闻某', title: '值夜医生', personality: '温和', speech: '慢', taboo: ['数人数'] },
    plotReminder: ['A', 'B', 'C'], openingHints: ['你好'],
    prompt: '【角色】测试\n' + '填充说明。'.repeat(80)
  };
};

(async function () {
  console.log('=== 投稿审核链路验收：' + BASE + ' ===');
  const health = await req('GET', '/api/health');
  if (health.code !== 200) { console.log('  ✗ 后端没起来'); console.log('=== 完成 ==='); process.exit(1); }
  const before = ((await req('GET', '/api/resources')).json.resources || []).length;

  /* ① 不带令牌 */
  const noTok = await req('POST', '/api/submit', { draft: DRAFT('无令牌测试') });
  ok(noTok.code === 403, '不带令牌提交被拒（403）', 'HTTP ' + noTok.code);

  /* ② 带令牌提交 */
  const sub = await adm('POST', '/api/submit', { draft: DRAFT('验收投稿本') });
  ok(sub.code === 200 && sub.json && sub.json.ok, '带令牌提交成功', 'HTTP ' + sub.code + ' ' + ((sub.json || {}).error || ''));
  const SID = (sub.json || {}).id || '';
  ok(!!SID, '返回投稿 id', SID);
  const res1 = await req('GET', '/api/resources');
  ok(!(res1.json.resources || []).some(function (r) { return r.name === '验收投稿本'; }), '审核前不进资源列表');

  /* ③ 队列 */
  const list = await adm('GET', '/api/submissions');
  const one = ((list.json || {}).submissions || []).filter(function (x) { return x.id === SID; })[0];
  ok(!!one && one.status === 'pending', '队列里是待审', one ? one.status : '（没找到）');

  /* ④ 通过 */
  const RID = 'test-submission-1';
  const ap = await adm('POST', '/api/submissions/' + SID + '/approve', { id: RID, playable: true });
  ok(ap.code === 200 && ap.json && ap.json.ok, '通过成功', 'HTTP ' + ap.code + ' ' + ((ap.json || {}).error || ''));
  const res2 = await req('GET', '/api/resources');
  const created = (res2.json.resources || []).filter(function (r) { return r.id === RID; })[0];
  ok(!!created && created.status === 'playable', '生成资源且可游玩', created ? created.status : '（没有）');
  ok((res2.json.resources || []).length === before + 1, '资源数 +1');

  /* ⑤ 驳回 */
  const sub2 = await adm('POST', '/api/submit', { draft: DRAFT('要被驳回的本子') });
  const SID2 = (sub2.json || {}).id || '';
  const rj = await adm('POST', '/api/submissions/' + SID2 + '/reject', { note: '设定太薄' });
  ok(rj.code === 200, '驳回成功', 'HTTP ' + rj.code);
  const list2 = await adm('GET', '/api/submissions');
  const two = ((list2.json || {}).submissions || []).filter(function (x) { return x.id === SID2; })[0];
  ok(!!two && two.status === 'rejected' && two.note === '设定太薄', '状态 rejected + 理由记下', two ? two.status + '/' + two.note : '');
  const res3 = await req('GET', '/api/resources');
  ok(!(res3.json.resources || []).some(function (r) { return r.name === '要被驳回的本子'; }), '驳回的不生成资源');

  /* ⑥ 收尾 */
  await adm('DELETE', '/api/resources/' + RID);
  const res4 = await req('GET', '/api/resources');
  ok((res4.json.resources || []).length === before, '已清理测试资源', (res4.json.resources || []).length + ' 条');

  console.log('');
  console.log(fail === 0 ? '=== 全部通过（' + pass + ' 项）===' : '=== 失败 ' + fail + ' 项 / 通过 ' + pass + ' 项 ===');
  console.log('=== 完成 ===');
  process.exit(fail === 0 ? 0 : 1);
})();
