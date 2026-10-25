/* ==========================================================================
   幻言 · 举报与投诉 / 隐私与安全说明（安全评估要看的两块）
   - 举报：公开入口，POST /api/report 落库（后台「举报」页处理）→ 这就是"有关记录保存"
   - 隐私：把"收集什么、不收集什么、存在哪、用户怎么删"写清楚（个保法的最小必要 + 告知同意）
   ========================================================================== */
RP.legal = (function () {
  function mask(id) {
    let m = document.getElementById(id);
    if (m) return m;
    m = document.createElement('div');
    m.id = id;
    m.className = 'age-mask';
    document.body.appendChild(m);
    m.addEventListener('click', function (e) { if (e.target === m) close(id); });
    return m;
  }
  function close(id) {
    const m = document.getElementById(id);
    if (m) m.remove();
    document.documentElement.style.overflow = '';
  }
  function open_(id, html) {
    const m = mask(id);
    m.innerHTML = '<div class="age-card legal-card">' + html + '</div>';
    document.documentElement.style.overflow = 'hidden';
    const x = m.querySelector('.legal-x');
    if (x) x.addEventListener('click', function () { close(id); });
    return m;
  }

  /* ------------------------------ 举报 ------------------------------ */
  const KINDS = ['违法有害信息', '未成年人相关', '侵犯个人信息', '色情低俗', '诈骗与引流', '其他'];

  function openReport() {
    const m = open_('reportMask',
      '<div class="legal-head"><h2>举报与投诉</h2><button class="legal-x" title="关闭">×</button></div>' +
      '<p>本站会在 <b>48 小时内</b>处理；涉及未成年人的举报优先处置。举报内容和处理记录会保存，用于监管核查。</p>' +
      (function () {
        const st = (RP.settings.get() || {}).site || {};
        const em = String(st.reportEmail || '').trim();
        const ph = String(st.reportPhone || '').trim();
        if (!em && !ph) return '';
        let s2 = '<p class="age-fine">也可以直接联系：';
        if (em) s2 += '邮箱 <a href="mailto:' + RP.util.esc(em) + '">' + RP.util.esc(em) + '</a>';
        if (em && ph) s2 += ' · ';
        if (ph) s2 += '电话 ' + RP.util.esc(ph);
        return s2 + '（工作日 48 小时内回复）</p>';
      })() +
      '<div class="report-form">' +
        '<label>举报类型<select id="repKind">' + KINDS.map(function (k) { return '<option>' + k + '</option>'; }).join('') + '</select></label>' +
        '<label>涉及页面或本子（可选）<input id="repTarget" maxlength="120" placeholder="例如：雨夜诊所 / 对话页第 30 轮"></label>' +
        '<label>具体内容（必填）<textarea id="repDetail" rows="4" maxlength="2000" placeholder="发生了什么、时间、你能提供的线索。不要在这里填你的身份证号。"></textarea></label>' +
        '<label>联系方式（可选，便于回复）<input id="repContact" maxlength="120" placeholder="邮箱即可，可不填"></label>' +
      '</div>' +
      '<p class="age-fine">如果情况紧急或涉及人身安全，请直接报警（110），不要等我们处理。</p>' +
      '<div class="age-row"><button class="btn primary" id="repSend">提交举报</button>' +
      '<button class="btn" id="repCancel">取消</button></div>' +
      '<p class="age-fine" id="repState"></p>');

    const state = m.querySelector('#repState');
    function done(txt, bad) { state.textContent = txt; state.style.color = bad ? 'var(--danger)' : 'var(--text-3)'; }
    m.querySelector('#repCancel').addEventListener('click', function () { close('reportMask'); });
    m.querySelector('#repSend').addEventListener('click', function () {
      const btn = this;
      const detail = (m.querySelector('#repDetail').value || '').trim();
      if (detail.length < 4) { done('请把情况写清楚一点（至少几个字）', true); return; }
      btn.disabled = true;
      done('提交中…');
      fetch('/api/report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          kind: m.querySelector('#repKind').value,
          target: m.querySelector('#repTarget').value,
          detail: detail,
          contact: m.querySelector('#repContact').value
        })
      }).then(function (r) { return r.json().catch(function () { return null; }).then(function (d) { return { ok: r.ok, d: d }; }); })
        .then(function (res) {
          btn.disabled = false;
          if (!res.ok || !res.d || !res.d.ok) { done((res.d && res.d.error) || '提交失败，请稍后再试', true); return; }
          done('已收到，编号 ' + res.d.id + '。我们会在 48 小时内处理。');
          m.querySelector('.report-form').style.display = 'none';
          btn.style.display = 'none';
        })
        .catch(function (e) { btn.disabled = false; done('网络出错：' + (e && e.message ? e.message : e), true); });
    });
  }

  /* ------------------------------ 隐私与安全 ------------------------------ */
  function openPrivacy() {
    open_('privacyMask',
      '<div class="legal-head"><h2>隐私与安全说明</h2><button class="legal-x" title="关闭">×</button></div>' +
      '<div class="legal-body">' +
      '<h4>我们不收集什么</h4>' +
      '<p>不要求注册，不收集姓名、身份证件号码、手机号码、住址、人脸、声纹。本站没有账号体系，也没有"实名认证"环节。</p>' +
      '<h4>我们实际记录什么</h4>' +
      '<p>① 你浏览器里的一个<b>随机匿名标识</b>（cookie <code>rp_vid</code>），只用于统计与限流，与你本人身份无关；' +
      '② 服务器访问日志：时间、网络源地址与端口、请求路径、状态码、耗时、浏览器标识（UA）、上述匿名标识。' +
      '依法留存 <b>180 天</b>，到期自动删除。' +
      '③ 举报内容与处理记录（你主动提交时）。</p>' +
      '<h4>对话内容存在哪</h4>' +
      '<p>本站服务器<b>不保存</b>对话正文。会话记录保存在你自己的浏览器里（localStorage），清除浏览器数据即删除。' +
      '对话文字会发送给<b>你自己配置的模型服务商</b>，由你与服务商之间的协议约束，本站不参与、不转发留存。</p>' +
      '<h4>本站不做什么</h4>' +
      '<p>不投放广告，不含充值/打赏/会员等任何付费项，不向第三方出售或共享你的信息，不做用户画像用于营销。' +
      '没有关注、好友、群组、评论、转发等社交功能，也不提供任何对外分享入口。</p>' +
      '<h4>你的权利</h4>' +
      '<p>你可以在「我的」里清空本地会话与设置；如需删除服务器上的访问日志或举报记录，可通过下方举报入口提出，我们核实后处理。</p>' +
      '<h4>未成年人</h4>' +
      '<p>本站仅面向年满十八周岁的用户，不向未成年人提供内容与服务。如果你未满十八周岁，请停止使用。</p>' +
      '<h4>联系与投诉</h4>' +
      '<p>点击页脚「举报与投诉」提交，48 小时内处理；涉及未成年人的优先处置。' + (function () { const st = (RP.settings.get() || {}).site || {}; const em = String(st.reportEmail || '').trim(); return em ? ('也可发邮件至 <a href="mailto:' + RP.util.esc(em) + '">' + RP.util.esc(em) + '</a>。') : ''; })() + '紧急情况请直接报警。</p>' +
      '</div>' +
      '<div class="age-row"><button class="btn primary legal-x2">我知道了</button></div>');
    const btn = document.querySelector('#privacyMask .legal-x2');
    if (btn) btn.addEventListener('click', function () { close('privacyMask'); });
  }

  return { openReport: openReport, openPrivacy: openPrivacy };
})();
