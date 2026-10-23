/* ==========================================================================
   投稿 → 审核 → 上线 的端到端验收（对着运行中的后端发 HTTP）

   ① 没邀请码提交 → 403（投稿需要资格）
   ② 有邀请码提交 → 200，进审核池，且**不会**立刻出现在 /api/resources
   ③ 后台能读到这条待审
   ④ 通过（设为可游玩）→ 生成资源，出现在 /api/resources
   ⑤ 再投一条并驳回 → 状态变 rejected，不会生成资源
   ⑥ 收尾：删掉测试资源、关掉邀请制、删除测试码

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
    const r = lib.request({
      hostname: u.hostname, port: u.port || 80, path: path, method: method, headers: h, timeout: 20000
    }, function (res) {
      const c = [];
      res.on('data', function (d) { c.push(d); });
      res.on('end', function () {
        let j = null;
        try { j = JSON.parse(Buffer.concat(c).toString('utf8')); } catch (e) { }
        resolve({ code: res.statusCode, json: j, setCookie: res.headers['set-cookie'] || [] });
      });
    });
    r.on('error', function (e) { resolve({ code: 0, err: e.message, setCookie: [] }); });
    r.on('timeout', function () { r.destroy(); resolve({ code: 0, err: '超时', setCookie: [] }); });
    if (data) r.write(data);
    r.end();
  });
}
const adm = function (m, p, b) { return req(m, p, b, { 'x-admin-token': TOKEN }); };

const DRAFT = function (name) {
  return {
    name: name,
    subtitle: '都市 · 悬疑',
    brief: '一句话简介',
    teaser: '一句钩子',
    intro: '开场导语',
    world: '世界观说明',
    userRole: '你是访客',
    plot: '起承转',
    character: { name: '闻某', title: '值夜医生', personality: '温和', speech: '慢', taboo: ['数人数'] },
    plotReminder: ['你已知 A', '共知 B', '别做 C'],
    openingHints: ['你好'],
    prompt: '【角色】测试用\n' + '填充说明。'.repeat(80)
  };
};

(async function () {
  console.log('=== 投稿审核链路验收：' + BASE + ' ===');
  const health = await req('GET', '/api/health');
  if (health.code !== 200) { console.log('  ✗ 后端没起来'); console.log('=== 完成 ==='); process.exit(1); }

  /* 准备：生成一个邀请码并开启邀请制 */
  const made = await adm('POST', '/api/invite-admin', { action: 'create', count: 1, days: 7, note: '投稿验收' });
  if (made.code !== 200) { console.log('  ✗ 生成邀请码失败（需要 ADMIN_TOKEN）'); console.log('=== 完成 ==='); process.exit(1); }
  const CODE = made.json.made[0];
  const CODE_ID = made.json.invite.codes[0].id;
  await adm('POST', '/api/invite-admin', { action: 'toggle', enabled: true });

  /* ① 没码提交 */
  const noGrant = await req('POST', '/api/submit', { draft: DRAFT('无码测试') });
  ok(noGrant.code === 403, '没邀请码提交被拒（403）', 'HTTP ' + noGrant.code);

  /* ② 有码提交 */
  const redeem = await req('POST', '/api/invite', { code: CODE });
  const grant = (redeem.json || {}).token || '';
  const cookie = (redeem.setCookie || []).filter(function (s) { return /^rp_invite=/.test(s); })[0];
  ok(!!grant, '拿到邀请凭证', grant ? grant.slice(0, 14) + '…' : '（无）');
  const sub = await req('POST', '/api/submit', { draft: DRAFT('验收投稿本') }, { 'x-invite-grant': grant });
  ok(sub.code === 200 && sub.json && sub.json.ok, '有码提交成功', 'HTTP ' + sub.code + ' ' + ((sub.json || {}).error || ''));
  const SID = (sub.json || {}).id || '';
  ok(!!SID, '返回投稿 id', SID);

  /* ②b 提交后不该立刻出现在资源里 */
  const res1 = await req('GET', '/api/resources');
  const before = (res1.json.resources || []).length;
  ok(!(res1.json.resources || []).some(function (r) { return r.name === '验收投稿本'; }),
    '审核前不会出现在资源列表', '当前 ' + before + ' 条');

  /* ③ 后台读队列 */
  const list = await adm('GET', '/api/submissions');
  ok(list.code === 200, '后台能读投稿队列', 'HTTP ' + list.code);
  const one = ((list.json || {}).submissions || []).filter(function (x) { return x.id === SID; })[0];
  ok(!!one && one.status === 'pending', '队列里是待审状态', one ? one.status : '（没找到）');
  ok(!!one && /…$/.test(one.code || ''), '记了投稿人邀请码（脱敏）', one ? one.code : '');

  /* ④ 通过 → 生成资源 */
  const RID = 'test-submission-1';
  const ap = await adm('POST', '/api/submissions/' + SID + '/approve', { id: RID, playable: true });
  ok(ap.code === 200 && ap.json && ap.json.ok, '通过成功', 'HTTP ' + ap.code + ' ' + ((ap.json || {}).error || ''));
  const res2 = await req('GET', '/api/resources');
  const created = (res2.json.resources || []).filter(function (r) { return r.id === RID; })[0];
  ok(!!created, '资源里出现了这条', created ? created.name : '（没有）');
  ok(!!created && created.status === 'playable', '按「设为可游玩」生成', created ? created.status : '');
  ok((res2.json.resources || []).length === before + 1, '资源总数 +1',
    before + ' → ' + (res2.json.resources || []).length);
  ok(res2.json.promptIncluded === true, '访客能拿到 prompt（直连需要）', String(res2.json.promptIncluded));

  /* ⑤ 驳回路径 */
  const sub2 = await req('POST', '/api/submit', { draft: DRAFT('要被驳回的本子') }, { 'x-invite-grant': grant });
  const SID2 = (sub2.json || {}).id || '';
  const rj = await adm('POST', '/api/submissions/' + SID2 + '/reject', { note: '设定太薄' });
  ok(rj.code === 200, '驳回成功', 'HTTP ' + rj.code);
  const list2 = await adm('GET', '/api/submissions');
  const two = ((list2.json || {}).submissions || []).filter(function (x) { return x.id === SID2; })[0];
  ok(!!two && two.status === 'rejected', '状态变成 rejected', two ? two.status : '');
  ok(!!two && two.note === '设定太薄', '驳回理由记下来了', two ? two.note : '');
  const res3 = await req('GET', '/api/resources');
  ok(!(res3.json.resources || []).some(function (r) { return r.name === '要被驳回的本子'; }),
    '被驳回的不会变成资源', '');

  /* ⑥ 收尾 */
  await adm('DELETE', '/api/resources/' + RID);
  await adm('POST', '/api/invite-admin', { action: 'toggle', enabled: false });
  await adm('POST', '/api/invite-admin', { action: 'delete', id: CODE_ID });
  const res4 = await req('GET', '/api/resources');
  ok((res4.json.resources || []).length === before, '已清理测试资源', (res4.json.resources || []).length + ' 条');
  const sess = await req('GET', '/api/session');
  ok(sess.json.invite.enabled === false, '邀请制已恢复关闭', String(sess.json.invite.enabled));

  console.log('');
  console.log(fail === 0 ? '=== 全部通过（' + pass + ' 项）===' : '=== 失败 ' + fail + ' 项 / 通过 ' + pass + ' 项 ===');
  console.log('=== 完成 ===');
  process.exit(fail === 0 ? 0 : 1);
})();
