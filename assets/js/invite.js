/* ==========================================================================
   幻言 · 邀请码入口（前端）
   网站谁都能看；要「开口对话」必须先有邀请码。这一层只负责界面与交互，
   真正的准入判定在服务端（server/invite.js + /api/chat 的第一道闸）。

   为什么本地还要存一份凭证：
     服务端发的是 HttpOnly Cookie（JS 读不到、改不了，这是主判据）。
     但有些浏览器/隐私模式会拦掉 Cookie，所以服务端同时把凭证原文回给页面，
     这里存进 localStorage，之后每个请求用 x-invite-grant 头带上同一张凭证。
     两条路服务端都验签 + 回查邀请码状态，任一条有效即可。

   用到的调用方：
     RP.app.boot      → RP.invite.load()   （开机问一次服务端）
     views-chat       → RP.invite.locked() （锁不锁输入框）
                       RP.invite.open()   （弹输入框）
     app.js 顶栏      → RP.invite.paint()  （显示锁定标记）
   ========================================================================== */
RP.invite = (function () {
  /* 服务端是否已经问过（没有后端的 file:// 场景不问，也不锁） */
  function info() { return RP.api.inviteInfo(); }
  function locked() { return RP.api.locked(); }

  /* 打开「输入邀请码」弹窗；成功后回调 onOk */
  function open(onOk) {
    const gate = info();
    if (!gate.enabled) { if (onOk) onOk(); return; }
    if (gate.unlocked) {
      RP.app.toast('本设备已经通过邀请码验证，可以直接对话', 'ok');
      if (onOk) onOk();
      return;
    }
    RP.app.modal({
      title: '本站为邀请制',
      body: '你可以随意浏览所有本子与设定，但「和角色对话」需要邀请码。\n' +
        '邀请码由站长发放，填一次即可，之后这台设备会自动记住（' + gate.days + ' 天内有效）。\n' +
        '如果你还没有邀请码，可以先去左栏「资源」里看看有没有想玩的本子。',
      input: { label: '邀请码', value: '' },
      ok: '验证并开始',
      cancel: null,
      onOk: function (v) {
        const code = String(v || '').trim();
        if (!code) { RP.app.toast('请输入邀请码', 'warn'); return; }
        RP.app.toast('正在验证邀请码…', '');
        RP.api.redeemInvite(code).then(function () {
          RP.app.toast('邀请码已通过 · 这台设备可以对话了', 'ok');
          paint();
          if (RP.chat && RP.chat.render) RP.chat.render();
          if (onOk) onOk();
        }).catch(function (err) {
          RP.app.modal({
            title: '邀请码没有通过',
            body: (err && err.message ? err.message : '请检查邀请码是否输入正确') +
              '\n\n如果确认没输错，可能是这个码已经被停用或过期了 —— 找发码的人要一个新的。',
            ok: '重新输入',
            cancel: '先逛逛',
            onOk: function () { open(onOk); }
          });
        });
      }
    });
  }

  /* 顶栏那个小标记的显示：邀请制且没通过时，菜单右侧会出现一个「邀请码」按钮 */
  function paint() {
    const btn = document.getElementById('btnInvite');
    if (!btn) return;
    const gate = info();
    if (!gate.enabled) { btn.style.display = 'none'; return; }
    btn.style.display = '';
    btn.classList.toggle('ok', !!gate.unlocked);
    btn.title = gate.unlocked ? '本设备已通过邀请码验证' : '本站为邀请制 · 点此输入邀请码';
    const label = btn.querySelector('span');
    if (label) label.textContent = gate.unlocked ? '已通过' : '邀请码';
  }

  /* 开机：问一次服务端。没有后端（file:// 打开）会自动变成"不启用邀请制"。 */
  async function load() {
    try { await RP.api.loadSession(); } catch (e) { /* 拿不到就按未启用处理 */ }
    /* 服务端说没通过、但本地还留着凭证：可能是凭证过期。
       这里不做任何自动补救 —— 交给用户重新输入，逻辑简单且不会误判。 */
    paint();
    return info();
  }

  /* 给别处（例如「我的」页）用的一行状态文字 */
  function statusText() {
    const gate = info();
    if (!gate.enabled) return '本站当前不需要邀请码';
    if (gate.unlocked) return '已通过邀请码验证（本设备）';
    return '本站为邀请制：对话需要邀请码';
  }

  return { load: load, open: open, paint: paint, locked: locked, info: info, statusText: statusText };
})();
