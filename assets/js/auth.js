/* ==========================================================================
   幻言 · 邮箱验证码登录（前端）
   流程：输邮箱 → 发验证码（服务端发信）→ 输 6 位码 → 换签名 Cookie 会话
   说明：只是"账号"，不是实名；服务端 settings.auth.requireLogin 打开后，
        必须登录才能对话（游客也要登录）。
   ========================================================================== */
RP.auth = (function () {
  let me = null;              // {id, email, createdAt, lastLoginAt} | null
  let requireLogin = false;
  let mailReady = false;
  let loaded = false;
  let waitTimer = null;
  let waitLeft = 0;

  function info() { return { me: me, requireLogin: requireLogin, mailReady: mailReady, loaded: loaded }; }
  function isOn() { return !!me; }

  async function load() {
    try {
      const r = await fetch('/api/auth/me', { cache: 'no-store' });
      const d = await r.json().catch(function () { return null; });
      if (d && d.ok) {
        me = d.account || null;
        requireLogin = d.requireLogin === true;
        mailReady = d.mailReady === true;
      }
    } catch (e) { /* 没后端就当作未登录、不强制 */ }
    loaded = true;
    return info();
  }

  function esc(s) { return RP.util.esc(s); }

  /* 全屏遮罩：没登录时挡住整个站（除了隐私/举报这类需要随时可达的入口） */
  function open(opts) {
    opts = opts || {};
    let m = document.getElementById('authMask');
    if (!m) {
      m = document.createElement('div');
      m.id = 'authMask';
      m.className = 'age-mask';
      document.body.appendChild(m);
    }
    const need = opts.force !== false;
    m.innerHTML = '<div class="age-card auth-card">' +
      '<h2>登录后使用</h2>' +
      '<p>用<b>邮箱验证码</b>登录，不需要密码，也不会给你发营销邮件。登录只是为了有个账号：能记住你的会话、在你违规时能封禁、丢了设备能找回来。</p>' +
      '<div class="auth-form">' +
        '<label>邮箱<input id="authEmail" type="email" inputmode="email" autocomplete="email" maxlength="120" placeholder="you@example.com"></label>' +
        '<div class="auth-code-row"><input id="authCode" inputmode="numeric" maxlength="6" placeholder="6 位验证码"><button class="btn" id="authSend" type="button">发送验证码</button></div>' +
      '</div>' +
      '<p class="age-fine" id="authState">验证码 10 分钟内有效。收不到就看垃圾箱；用 QQ 邮箱的可以顺手把发件人加白名单。</p>' +
      '<div class="age-row"><button class="btn primary" id="authGo" type="button">登录 / 注册</button>' +
      '<button class="btn" id="authPrivacy" type="button">隐私与安全</button>' +
      (need ? '' : '<button class="btn" id="authLater" type="button">先逛逛</button>') +
      '</div>' +
      '<p class="age-fine">本站仅面向年满十八周岁用户，不收集姓名、证件号码、手机号。</p>' +
      '</div>';

    const state = function (t, bad) {
      const el = m.querySelector('#authState');
      el.textContent = t;
      el.style.color = bad ? 'var(--danger)' : '';
    };
    const emailEl = m.querySelector('#authEmail');
    const codeEl = m.querySelector('#authCode');
    const sendBtn = m.querySelector('#authSend');

    function startWait(sec) {
      waitLeft = sec;
      if (waitTimer) clearInterval(waitTimer);
      const tick = function () {
        if (waitLeft <= 0) {
          clearInterval(waitTimer); waitTimer = null;
          sendBtn.disabled = false;
          sendBtn.textContent = '发送验证码';
          return;
        }
        sendBtn.disabled = true;
        sendBtn.textContent = waitLeft + ' 秒后重发';
        waitLeft--;
      };
      tick();
      waitTimer = setInterval(tick, 1000);
    }

    sendBtn.addEventListener('click', async function () {
      const email = (emailEl.value || '').trim();
      if (!email) { state('先填邮箱', true); return; }
      sendBtn.disabled = true;
      state('发送中…');
      try {
        const r = await fetch('/api/auth/send-code', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: email })
        });
        const d = await r.json().catch(function () { return null; });
        if (!r.ok || !d || !d.ok) {
          state((d && d.error) || ('发送失败 HTTP ' + r.status), true);
          sendBtn.disabled = false;
          return;
        }
        state('验证码已发到 ' + (d.masked || email) + '，10 分钟内有效。');
        startWait(60);
        codeEl.focus();
      } catch (e) {
        state('网络出错：' + (e && e.message ? e.message : e), true);
        sendBtn.disabled = false;
      }
    });

    codeEl.addEventListener('keydown', function (e) { if (e.key === 'Enter') m.querySelector('#authGo').click(); });

    m.querySelector('#authGo').addEventListener('click', async function () {
      const email = (emailEl.value || '').trim();
      const code = (codeEl.value || '').trim();
      if (!email || !code) { state('邮箱和验证码都要填', true); return; }
      const btn = this;
      btn.disabled = true;
      state('登录中…');
      try {
        const r = await fetch('/api/auth/verify', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: email, code: code })
        });
        const d = await r.json().catch(function () { return null; });
        if (!r.ok || !d || !d.ok) { state((d && d.error) || ('登录失败 HTTP ' + r.status), true); btn.disabled = false; return; }
        me = d.account || null;
        requireLogin = d.requireLogin === true;
        m.remove();
        document.documentElement.style.overflow = '';
        if (RP.app && RP.app.toast) RP.app.toast('已登录 · ' + (me ? me.email : ''), 'ok');
        if (opts.onDone) opts.onDone(me);
      } catch (e) {
        state('网络出错：' + (e && e.message ? e.message : e), true);
        btn.disabled = false;
      }
    });

    m.querySelector('#authPrivacy').addEventListener('click', function () { if (RP.legal) RP.legal.openPrivacy(); });
    const later = m.querySelector('#authLater');
    if (later) later.addEventListener('click', function () { m.remove(); document.documentElement.style.overflow = ''; });

    document.documentElement.style.overflow = 'hidden';
    setTimeout(function () { try { emailEl.focus(); } catch (e) { } }, 60);
  }

  async function logout() {
    try { await fetch('/api/auth/logout', { method: 'POST' }); } catch (e) { }
    me = null;
    if (RP.app && RP.app.toast) RP.app.toast('已退出登录', '');
    open({ force: true });
  }

  return {
    load: load, open: open, logout: logout, info: info,
    isOn: isOn,
    get requireLogin() { return requireLogin; }
  };
})();
