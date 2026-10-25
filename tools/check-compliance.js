/* 合规基础设施验收（安全评估要的两项）
   ① 举报：公开可提交、类型白名单、必填校验、后台可读/可处理/可删除、无令牌读不到
   ② 访问日志：每个请求一条 JSON，含 时间/源地址/源端口/目标/方法/路径/状态/UA/匿名id；
      文件按天切分；保留期 ≥180 天（检查 server.js 里的常量）
   用法： ADMIN_TOKEN=xxx HLOG_DIR=xxx node tools/check-compliance.js http://127.0.0.1:5599 */
'use strict';
const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');

const BASE = process.argv[2] || 'http://127.0.0.1:5599';
const TOKEN = process.env.ADMIN_TOKEN || '';
const u = new URL(BASE);
const lib = u.protocol === 'https:' ? https : http;
const LOG_DIR = process.env.HLOG_DIR || path.join(__dirname, '..', 'logs');

let pass = 0, fail = 0;
function ok(c, label, extra) {
  console.log((c ? '  \u2713 ' : '  \u2717 ') + label + (extra ? '  \u2014\u2014 ' + extra : ''));
  if (c) pass++; else fail++;
}
function req(method, p, body, headers) {
  return new Promise(function (resolve) {
    const data = body === undefined ? null : Buffer.from(JSON.stringify(body), 'utf8');
    const h = Object.assign({ 'User-Agent': 'huanyan-check/1.0' }, headers || {});
    if (data) { h['Content-Type'] = 'application/json; charset=utf-8'; h['Content-Length'] = data.length; }
    const r = lib.request({ hostname: u.hostname, port: u.port || 80, path: p, method: method, headers: h, timeout: 20000 },
      function (res) {
        const c = [];
        res.on('data', function (d) { c.push(d); });
        res.on('end', function () {
          let j = null;
          try { j = JSON.parse(Buffer.concat(c).toString('utf8')); } catch (e) { }
          resolve({ code: res.statusCode, json: j, body: Buffer.concat(c).toString('utf8') });
        });
      });
    r.on('error', function (e) { resolve({ code: 0, err: e.message }); });
    r.on('timeout', function () { r.destroy(); resolve({ code: 0, err: '超时' }); });
    if (data) r.write(data);
    r.end();
  });
}
const adm = function (m, p, b) { return req(m, p, b, { 'x-admin-token': TOKEN }); };

(async function () {
  console.log('=== 举报与访问日志验收：' + BASE + ' ===');

  /* ---------- 举报 ---------- */
  console.log('【① 举报可以公开提交】');
  const bad = await req('POST', '/api/report', { kind: '瞎写', detail: '测试内容' });
  ok(bad.code === 400, '非法类型被拒（400）', 'HTTP ' + bad.code);
  const empty = await req('POST', '/api/report', { kind: '其他', detail: '' });
  ok(empty.code === 400, '空内容被拒（400）', 'HTTP ' + empty.code);
  const r1 = await req('POST', '/api/report', { kind: '未成年人相关', target: '验收测试', detail: '验收用：测试举报链路', contact: 'test@example.com' });
  ok(r1.code === 200 && r1.json && r1.json.ok && r1.json.id, '正常提交成功并返回编号', (r1.json || {}).id || '');
  const RID = (r1.json || {}).id || '';

  console.log('【② 后台能读、能处理】');
  const noTok = await req('GET', '/api/reports');
  ok(noTok.code === 403, '无令牌读举报被拒（403）', 'HTTP ' + noTok.code);
  const list = await adm('GET', '/api/reports');
  const one = ((list.json || {}).reports || []).filter(function (x) { return x.id === RID; })[0];
  ok(!!one && one.status === 'open' && one.kind === '未成年人相关', '队列里是未处理', one ? one.status : '（没找到）');
  ok(!!one && !!one.ts && !!one.ip, '记下了时间与来源 IP', one ? (one.ts ? 'ts✓ ' : '') + (one.ip ? 'ip✓' : '') : '');
  const hd = await adm('POST', '/api/reports/' + RID + '/handle', { note: '验收：已核查' });
  ok(hd.code === 200, '标记已处理成功', 'HTTP ' + hd.code);
  const list2 = await adm('GET', '/api/reports');
  const two = ((list2.json || {}).reports || []).filter(function (x) { return x.id === RID; })[0];
  ok(!!two && two.status === 'handled' && two.note === '验收：已核查', '状态与处理说明都留下了', two ? two.status + '/' + two.note : '');

  console.log('【③ 访问日志】');
  const files = fs.existsSync(LOG_DIR) ? fs.readdirSync(LOG_DIR).filter(function (f) { return /^access-\d{4}-\d{2}-\d{2}\.log$/.test(f); }) : [];
  ok(files.length > 0, '生成了按天切分的日志文件', files.length + ' 个');
  let lines = [];
  if (files.length) {
    const fp = path.join(LOG_DIR, files.sort().slice(-1)[0]);
    lines = fs.readFileSync(fp, 'utf8').trim().split('\n').slice(-40).map(function (s) { try { return JSON.parse(s); } catch (e) { return null; } }).filter(Boolean);
  }
  ok(lines.length > 0, '日志是逐行 JSON（可解析）', lines.length + ' 行');
  const last = lines[lines.length - 1] || {};
  ['ts', 'ip', 'sport', 'method', 'path', 'status', 'ua'].forEach(function (k) {
    ok(last[k] !== undefined, '日志含字段 ' + k, String(last[k]).slice(0, 40));
  });
  const src = fs.readFileSync(path.join(__dirname, '..', 'server', 'server.js'), 'utf8');
  const keep = /LOG_KEEP_DAYS\s*=\s*Math\.max\(\s*\d+\s*,\s*Number\(process\.env\.LOG_KEEP_DAYS\)\s*\|\|\s*(\d+)/.exec(src);
  ok(!!keep && Number(keep[1]) >= 180, '保留期配置 ≥ 180 天', keep ? keep[1] + ' 天' : '（没读到）');
  ok(/pruneAccessLogs/.test(src), '有过期日志清理逻辑');

  console.log('【④ 隐私与安全说明页】');
  const page = await req('GET', '/');
  const legal = await req('GET', '/assets/js/views-legal.js');
  ok(page.code === 200 && page.body !== undefined, '首页可访问');
  ok(legal.code === 200 && /openReport/.test(legal.body || ''), '合规模块已下发', 'HTTP ' + legal.code);

  /* 收尾：删掉验收举报 */
  if (RID) await adm('POST', '/api/reports/' + RID + '/delete', {});
  const list3 = await adm('GET', '/api/reports');
  ok(!((list3.json || {}).reports || []).some(function (x) { return x.id === RID; }), '验收举报已清理');

  console.log('');
  console.log(fail === 0 ? '=== 全部通过（' + pass + ' 项）===' : '=== 失败 ' + fail + ' 项 / 通过 ' + pass + ' 项 ===');
  console.log('=== 完成 ===');
  process.exit(fail === 0 ? 0 : 1);
})();
