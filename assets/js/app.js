/* ==========================================================================
   幻言 · 应用外壳
   顶栏三板块路由（资源 / 对话 / 我的）、左栏会话区、提示层与弹窗
   ========================================================================== */
RP.app = (function () {
  let popEl = null;
  let backend = false;   // 是否连上了后端（决定资源/设置能否在线编辑）

  /* ------------------------------ 数据装载 ------------------------------ */
  /* 后端优先：/api/resources 与 /api/settings；没有后端就用内置资源与默认设置 */
  RP.data = {
    load: async function () {
      try {
        const res = await fetch('/api/resources', { cache: 'no-store' });
        if (!res.ok) throw new Error('HTTP ' + res.status);
        const data = await res.json();
        if (data && data.ok && Array.isArray(data.resources) && data.resources.length) {
          window.RP_RESOURCES = data.resources;
          backend = true;
        }
      } catch (e) { backend = false; }
      return window.RP_RESOURCES || [];
    },
    isBackend: function () { return backend; },
    /* 编辑态：把当前资源列表写回后端 */
    save: async function (list) {
      const res = await fetch('/api/resources', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resources: list })
      });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return res.json();
    },
    reload: async function () {
      await this.load();
      RP.app.applySiteTexts();
      RP.resources.render();
      return window.RP_RESOURCES;
    }
  };

  /* 内容后台不在前端留入口：公布版里后台只允许本机 / SSH 隧道访问（见 README「公布前清单」）。
     老版本这里有一个顶栏按钮与打开后台的函数，已删除；地址只写在 README 与部署脚本里。 */

  /* 站点文案（站点名、页脚声明等）来自后台设置 */
  /* 页脚固定出口：举报与投诉 / 隐私与安全（安全评估要求的对外可见渠道） */
  function appendFootLinks() {
    const foot = document.querySelector('.global-foot');
    if (!foot) return;
    [['lnkPrivacy', '隐私与安全', function () { if (RP.legal) RP.legal.openPrivacy(); }],
     ['lnkReport', '举报与投诉', function () { if (RP.legal) RP.legal.openReport(); }]].forEach(function (def) {
      if (foot.querySelector('#' + def[0])) return;
      const sep = document.createElement('span');
      sep.className = 'sep';
      sep.textContent = '\u00b7';
      foot.appendChild(sep);
      const wrap = document.createElement('span');
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'foot-link';
      btn.id = def[0];
      btn.textContent = def[1];
      btn.addEventListener('click', def[2]);
      wrap.appendChild(btn);
      foot.appendChild(wrap);
    });
  }

  function applySiteTexts() {
    const s = RP.settings.get().site || {};
    const brand = document.querySelector('.brand-text strong');
    if (brand && s.name) brand.textContent = s.name;
    const tag = document.querySelector('.brand-text span');
    if (tag && s.tagline) tag.textContent = s.tagline;
    const mark = document.querySelector('.brand-mark');
    if (mark && s.name) mark.textContent = s.name.slice(0, 1);
    document.title = (s.name || '幻言') + ' · AI 角色扮演';
    const foot = document.querySelector('.global-foot');
    if (foot && Array.isArray(s.footerNotes) && s.footerNotes.length) {
      foot.innerHTML = s.footerNotes.map(function (t) { return '<span>' + RP.util.esc(t) + '</span>'; }).join('<span class="sep">·</span>');
      /* 备案号：静态页脚里已经写死一份（看源码也能看到），这里只负责按后台设置更新文字，不重复添加 */
      appendFootLinks();
      if (s.icp) {
        let link = foot.querySelector('a[href*="beian.miit.gov.cn"]');
        if (!link) {
          const wrap = document.createElement('span');
          wrap.className = 'icp';
          wrap.innerHTML = '<a href="https://beian.miit.gov.cn/" target="_blank" rel="noopener noreferrer"></a>';
          foot.appendChild(document.createTextNode(' · '));
          foot.appendChild(wrap);
          link = wrap.querySelector('a');
        }
        link.textContent = s.icp;
      }
    }
  }

  /* ------------------------------ 外观 ------------------------------ */
  function themeDef(id) {
    const list = RP.catalog.themes;
    return list.filter(function (t) { return t.id === id; })[0] || list[0];
  }
  function themeMode(id) { return themeDef(id || RP.store.get().theme).mode; }
  function isLight() { return themeMode() === 'light'; }
  function paintThemeIcon() {
    const b = document.getElementById('btnThemeQuick');
    if (!b) return;
    const light = isLight();
    b.title = light ? '当前：浅色 · 点击切到深色' : '当前：深色 · 点击切到浅色';
    b.innerHTML = light
      ? '<svg viewBox="0 0 24 24" class="ico"><path d="M20 14.5A8.5 8.5 0 1 1 9.5 4a6.8 6.8 0 0 0 10.5 10.5z"/></svg>'
      : '<svg viewBox="0 0 24 24" class="ico"><circle cx="12" cy="12" r="4.2"/><path d="M12 2.6v2.2M12 19.2v2.2M2.6 12h2.2M19.2 12h2.2M5.4 5.4l1.6 1.6M17 17l1.6 1.6M18.6 5.4L17 7M7 17l-1.6 1.6"/></svg>';
  }
  /* 字号与字体：全部走 CSS 变量，改一次全站生效（对话区、资源区、我的都吃） */
  const FONT_SIZES = {
    xs: { name: '紧凑', scale: 0.92 },
    sm: { name: '小', scale: 0.97 },
    std: { name: '标准', scale: 1 },
    lg: { name: '大', scale: 1.08 },
    xl: { name: '特大', scale: 1.18 },
    xxl: { name: '巨大', scale: 1.3 }
  };
  const FONT_FAMILIES = {
    system: { name: '系统默认', body: '', note: '跟随设备，最省事' },
    hei: { name: '黑体（现代）', body: '"Microsoft YaHei","PingFang SC","Noto Sans SC","Source Han Sans SC",sans-serif', note: '笔画均匀，读长文最稳' },
    song: { name: '宋体（书卷）', body: '"Songti SC","SimSun","Noto Serif SC","Source Han Serif SC",serif', note: '有书卷气，适合古风本子' },
    kai: { name: '楷体（手写感）', body: '"Kaiti SC","KaiTi","STKaiti","Noto Serif SC",serif', note: '像手写，适合信笺与独白' },
    serif: { name: '衬线（西文优先）', body: 'Georgia,"Times New Roman","Songti SC","SimSun",serif', note: '中英混排更挺括' },
    mono: { name: '等宽（终端感）', body: '"Sarasa Mono SC","Cascadia Mono",Consolas,"Courier New",monospace', note: '像档案与终端记录' }
  };
  /* AI 动用制裁时用的「恐怖字体」：默认跟着正文字体走，字重与描边由 CSS 加强 */
  function fontScale() {
    const f = (RP.store.get().ui && RP.store.get().ui.font) || {};
    return (FONT_SIZES[f.size] || FONT_SIZES.std).scale;
  }
  function fontFamily() {
    const f = (RP.store.get().ui && RP.store.get().ui.font) || {};
    return (FONT_FAMILIES[f.family] || FONT_FAMILIES.system).body;
  }
  function applyFont() {
    const root = document.documentElement;
    const scale = fontScale();
    root.style.setProperty('--font-scale', String(scale));
    root.style.setProperty('--fs-base', (15 * scale).toFixed(2) + 'px');
    const fam = fontFamily();
    if (fam) root.style.setProperty('--font-body-custom', fam);
    else root.style.removeProperty('--font-body-custom');
    document.body.dataset.font = ((RP.store.get().ui || {}).font || {}).family || 'system';
    document.body.dataset.fontSize = ((RP.store.get().ui || {}).font || {}).size || 'std';
  }

  function applyAppearance() {
    const st = RP.store.get();
    document.body.dataset.theme = st.theme || 'paper';
    document.body.dataset.mode = themeMode(st.theme);
    document.body.dataset.bubble = st.bubble || 'soft';
    document.body.dataset.frame = st.frame || 'none';
    applyFont();
    paintThemeIcon();
  }

  /* ------------------------------ 更新提示 ------------------------------ */
  /* 代码更新后，已经打开的旧页面还在跑内存里的旧 JS —— 定时比一下构建版本，
     变了就提示刷新（测试期间这个提示能省掉大量「我明明修好了」的困惑）。 */
  let buildId = null;
  let buildTimer = null;
  function showUpdateBar(build) {
    if (document.getElementById('updateBar')) return;
    const bar = document.createElement('div');
    bar.id = 'updateBar';
    bar.className = 'update-bar';
    bar.innerHTML = '<span>站点已更新到新版本（build ' + String(build).slice(-6) + '）</span>' +
      '<button class="btn sm primary" id="btnReloadNow">立即刷新</button>' +
      '<button class="btn sm" id="btnReloadLater">稍后</button>';
    document.body.appendChild(bar);
    const rd = document.getElementById('btnReloadNow');
    if (rd) rd.addEventListener('click', function () { location.reload(); });
    const rl = document.getElementById('btnReloadLater');
    if (rl) rl.addEventListener('click', function () { bar.remove(); });
  }
  async function checkBuild(first) {
    try {
      const res = await fetch('/api/version', { cache: 'no-store' });
      if (!res.ok) return;
      const d = await res.json();
      if (!d || !d.build) return;
      if (buildId === null) { buildId = d.build; RP.build = d.build; return; }
      if (d.build !== buildId) { buildId = d.build; RP.build = d.build; showUpdateBar(d.build); }
    } catch (e) { /* 没有后端（file:// 静态预览）就不提示 */ }
  }
  function watchBuild() {
    checkBuild(true);
    if (buildTimer) clearInterval(buildTimer);
    buildTimer = setInterval(function () { checkBuild(false); }, 45000);
  }
  /* 只做「界面全屏」：隐藏顶栏与会话列表，让对话铺满整屏。
     ★ 三条出口，任何一条都能出来：右上角常驻的浮层按钮 / Esc / 浏览器自己的全屏退出。
     ★ 绝不自动进入：只有点按钮才会进（以前绑了个 F 键，太容易误触，已去掉）。
     ★ 状态永远跟着浏览器走：浏览器退出全屏（Esc 或 F11）时，界面也一起恢复正常。 */
  function focusOn() { return document.body.dataset.focus === '1'; }
  function setFocus(on, opts) {
    on = !!on;
    /* 手动进全屏时，把还在跳的倒计时收掉，免得提示条压在全屏界面上 */
    if (on && AUTO_FOCUS.timer) { clearTimeout(AUTO_FOCUS.timer); AUTO_FOCUS.timer = null; }
    if (on && AUTO_FOCUS.tick) { clearInterval(AUTO_FOCUS.tick); AUTO_FOCUS.tick = null; }
    if (on && AUTO_FOCUS.convId) { AUTO_FOCUS.done[AUTO_FOCUS.convId] = 'entered'; AUTO_FOCUS.convId = null; }
    if (on) autoFocusHint(false);
    const was = focusOn();
    document.body.dataset.focus = on ? '1' : '0';
    if (on && !was) {
      document.documentElement.dataset.focusPrev = '1';
      try {
        if (document.documentElement.requestFullscreen) {
          const p = document.documentElement.requestFullscreen();
          if (p && p.catch) p.catch(function () { /* 用户不允许就算了，界面照样沉浸 */ });
        }
      } catch (e) { /* 老浏览器没有这个 API */ }
    } else if (!on && document.fullscreenElement) {
      try {
        const p = document.exitFullscreen && document.exitFullscreen();
        if (p && p.catch) p.catch(function () { });
      } catch (e) { /* 忽略 */ }
    }
    if (!on) {
      const msgs = document.getElementById('messages');
      if (msgs) msgs.scrollTop = msgs.scrollHeight;
    }
    paintFocus();
    return on;
  }
  function toggleFocus(force) {
    return setFocus(typeof force === 'boolean' ? force : !focusOn());
  }
  function paintFocus() {
    const on = focusOn();
    /* 对话页头部的老按钮 */
    const b = document.getElementById('btnFocus');
    if (b) {
      b.textContent = on ? '退出全屏' : '全屏';
      b.classList.toggle('primary', on);
    }
    /* 顶栏右上角的全屏图标 */
    const t = document.getElementById('btnFocusTop');
    if (t) {
      t.classList.toggle('on', on);
      t.title = on ? '退出全屏（Esc）' : '全屏沉浸（Esc 退出）';
      t.setAttribute('aria-label', t.title);
    }
    /* 沉浸模式下的浮层退出按钮：只在这里出现，位置固定、不可能找不到 */
    let fl = document.getElementById('focusExit');
    if (on && !fl) {
      fl = document.createElement('button');
      fl.id = 'focusExit';
      fl.className = 'focus-exit';
      fl.type = 'button';
      fl.innerHTML = '<svg viewBox="0 0 24 24" class="ico"><path d="M9 4H5a1 1 0 0 0-1 1v4"/><path d="M15 20h4a1 1 0 0 0 1-1v-4"/><path d="M20 9V5a1 1 0 0 0-1-1h-4"/><path d="M4 15v4a1 1 0 0 0 1 1h4"/><path d="M9 9l6 6"/><path d="M15 9l-6 6"/></svg><span>退出全屏</span><em>Esc</em>';
      fl.addEventListener('click', function () { setFocus(false); });
      document.body.appendChild(fl);
    } else if (!on && fl) {
      fl.remove();
    }
  }
  /* 浏览器全屏状态变了（用户按 Esc / F11，或系统收回）→ 界面跟着同步 */
  function syncFullscreen() {
    if (!document.fullscreenElement && focusOn()) setFocus(false);
  }
  /* 一键切换浅色 / 深色（各自记住上一次用的主题） */
  function toggleMode() {
    const st = RP.store.get();
    const from = themeMode(st.theme);
    const to = from === 'light' ? 'dark' : 'light';
    st.lastTheme = st.lastTheme || {};
    st.lastTheme[from] = st.theme;
    const next = st.lastTheme[to] || (to === 'light' ? RP.catalog.defaultLight : RP.catalog.defaultDark);
    st.theme = next;
    RP.store.save();
    applyAppearance();
    if (st.ui.view === 'profile') RP.profile.render();
    if (st.ui.view === 'chat') RP.chat.render();
    toast('已切换到「<b>' + themeDef(next).name + '</b>」' + (to === 'light' ? '（浅色）' : '（深色）'));
  }

  function paintQuota() {
    const st = RP.store.get();
    const box = document.getElementById('quotaMini');
    if (!box) return;
    /* 0 = 不限（站点不自营模型后就是这个值）：既然没有额度，就别在顶栏显示一个 0 */
    if (!(st.user.quota.daily > 0)) {
      box.style.display = 'none';
      box.innerHTML = '';
      return;
    }
    const left = RP.store.quotaLeft();
    const pct = Math.round(left / st.user.quota.daily * 100);
    box.style.display = '';
    box.innerHTML = '<span>今日额度</span><b>' + left + '</b><span class="bar"><i style="width:' + pct + '%"></i></span>';
  }

  function paintNavDot() {
    const dot = document.getElementById('navDot');
    if (!dot) return;
    const st = RP.store.get();
    const busy = st.convs.some(function (c) { return c.kind === 'roleplay' && (c.muted || c.paused); });
    const active = st.convs.some(function (c) { return c.kind === 'roleplay'; });
    dot.classList.toggle('on', busy || active);
    dot.style.background = busy ? 'var(--danger)' : 'var(--accent)';
  }

  /* ------------------------------ 路由 ------------------------------ */
  function setView(v) {
    const st = RP.store.get();
    st.ui.view = v;
    /* 离开对话区就自动退出全屏沉浸：免得在「资源 / 我的」里还顶着全屏布局出不来 */
    if (v !== 'chat' && focusOn()) setFocus(false);
    document.querySelectorAll('.view').forEach(function (el) {
      el.classList.toggle('active', el.id === 'view-' + v);
    });
    document.querySelectorAll('.nav-item').forEach(function (el) {
      el.classList.toggle('active', el.dataset.view === v);
    });
    if (v === 'resources') RP.resources.render();
    if (v === 'chat') RP.chat.render();
    if (v === 'profile') RP.profile.render();
    RP.chat.renderSidebar();
    RP.store.save();
    const sc = document.querySelector('#view-' + v + ' .view-scroll');
    if (sc) sc.scrollTop = 0;
    /* 进对话页 → 开始「几秒后自动全屏」的计时；离开对话页 → 直接取消 */
    if (v === 'chat') autoFocusSchedule(); else autoFocusCancel('left-chat');
  }

  /* 从资源卡进入对话：新建会话 + 载入提示词 + 送达剧情提醒 */
  function play(id) {
    const r = RP.resources.byId(id);
    if (!r || r.status !== 'playable') return;
    const conv = RP.chat.create(r);
    setView('chat');
    const resource = r;
    toast('已进入「<b>' + RP.util.esc(r.name) + '</b>」· 提示词与准则已载入，请先读剧情提醒', 'ok');
    if (conv.messages.length && conv.messages[0].role === 'reminder') {
      setTimeout(function () {
        if (RP.store.get().activeConv === conv.id) {
          const box = document.getElementById('messages');
          if (box) box.scrollTop = 0;
        }
      }, 60);
    }
    paintNavDot();
    return resource;
  }

  /* ------------------------------ 进入对话后自动全屏 ------------------------------
     需求：进对话几秒后自动进全屏；进之前先给 3 秒倒计时提示，每秒刷新数字，
     玩家点「点击关闭」就取消。
     ★ 用的是站点自己的「界面全屏」（setFocus），不是浏览器 Fullscreen API ——
       后者不给用户手势就会被拦，倒计时结束再调用必然失败；界面全屏没有这个限制，
       而且它本来就有三条出口（右上角按钮 / Esc / 点别的页签），玩家不会被困住。
     ★ 同一个会话只问一次：进去了或取消过，就不再打扰；换本子才重新算。 */
  const AUTO_FOCUS = { delay: 3000, count: 3, timer: null, tick: null, convId: null, done: {}, hint: null };

  function autoFocusHint(show, n) {
    let el = document.getElementById('autoFocusHint');
    if (!show) { if (el) el.remove(); AUTO_FOCUS.hint = null; return; }
    if (!el) {
      el = document.createElement('div');
      el.id = 'autoFocusHint';
      el.className = 'autofocus-hint';
      el.innerHTML = '<span class="af-text">即将进入全屏模式 <b class="af-n">3s</b></span>' +
        '<button class="af-close" type="button">点击关闭</button>';
      el.addEventListener('click', function (e) {
        e.preventDefault();
        autoFocusCancel('click');
      });
      document.body.appendChild(el);
    }
    const num = el.querySelector('.af-n');
    if (num) num.textContent = n + 's';
    placeAutoFocusHint(el);
    AUTO_FOCUS.hint = el;
  }

  /* 位置不能写死：输入区高度随「道具行 / 开局提示 / 手机窄屏」变化，
     写死一个 bottom 会压住输入框（第一版就压在 textarea 上了）。
     这里实时量一次：#composer 的顶边之上 12px、对话区水平居中。 */
  function placeAutoFocusHint(el) {
    const vw = window.innerWidth, vh = window.innerHeight;
    const view = document.getElementById('view-chat');
    const comp = document.getElementById('composer');
    let left = vw / 2, bottom = 104;
    if (view) {
      const r = view.getBoundingClientRect();
      if (r.width > 200) left = r.left + r.width / 2;
    }
    if (comp) {
      const c = comp.getBoundingClientRect();
      if (c.height > 0 && c.top > 0 && c.top < vh) bottom = Math.max(14, vh - c.top + 12);
    }
    el.style.left = Math.max(90, Math.min(vw - 90, left)) + 'px';
    el.style.bottom = bottom + 'px';
  }

  function autoFocusCancel(reason) {
    clearTimeout(AUTO_FOCUS.timer);
    clearInterval(AUTO_FOCUS.tick);
    AUTO_FOCUS.timer = null; AUTO_FOCUS.tick = null;
    if (AUTO_FOCUS.convId) AUTO_FOCUS.done[AUTO_FOCUS.convId] = reason || 1;
    AUTO_FOCUS.convId = null;
    autoFocusHint(false);
  }

  /* 什么时候才应该弹：在对话页、是这个本子的会话、还没进全屏、这个会话没问过 */
  function autoFocusEligible() {
    const st = RP.store.get();
    if ((st.ui.view || '') !== 'chat') return null;
    if (focusOn()) return null;
    const conv = RP.store.active();
    if (!conv || conv.kind !== 'roleplay') return null;
    if (AUTO_FOCUS.done[conv.id]) return null;
    return conv;
  }

  function autoFocusSchedule() {
    autoFocusCancel('replaced');
    const conv = autoFocusEligible();
    if (!conv) return false;
    AUTO_FOCUS.convId = conv.id;
    AUTO_FOCUS.timer = setTimeout(function () { autoFocusCountdown(conv.id); }, AUTO_FOCUS.delay);
    return true;
  }

  function autoFocusCountdown(convId) {
    /* 倒计时开始时再确认一次条件：这几秒里玩家可能已经自己进全屏、或换了页签 */
    const conv = RP.store.conv(convId);
    const st = RP.store.get();
    if (!conv || (st.ui.view || '') !== 'chat' || focusOn() || RP.store.active() !== conv || AUTO_FOCUS.done[convId]) {
      AUTO_FOCUS.convId = null;
      return;
    }
    let n = AUTO_FOCUS.count;
    autoFocusHint(true, n);
    AUTO_FOCUS.tick = setInterval(function () {
      n -= 1;
      if (n > 0) { autoFocusHint(true, n); return; }
      clearInterval(AUTO_FOCUS.tick);
      AUTO_FOCUS.tick = null;
      autoFocusHint(false);
      AUTO_FOCUS.done[convId] = 'entered';
      AUTO_FOCUS.convId = null;
      if ((RP.store.get().ui.view || '') === 'chat' && !focusOn()) setFocus(true);
    }, 1000);
  }

  /* ------------------------------ 提示层 ------------------------------ */
  function toast(html, type) {
    const box = document.getElementById('toasts');
    if (!box) return;
    const el = document.createElement('div');
    el.className = 'toast' + (type ? ' ' + type : '');
    el.innerHTML = html;
    box.appendChild(el);
    setTimeout(function () {
      el.classList.add('out');
      setTimeout(function () { el.remove(); }, 320);
    }, 3000);
    while (box.children.length > 4) box.firstChild.remove();
  }

  function modal(opts) {
    closeModal();
    const mask = document.createElement('div');
    mask.className = 'modal-mask';
    mask.id = 'modalMask';
    mask.innerHTML = '<div class="modal">' +
      '<h3>' + (opts.title || '提示') + '</h3>' +
      '<div class="modal-body">' + (opts.body || '').replace(/\n/g, '<br>') + '</div>' +
      (opts.input ? '<div class="field" style="margin-top:14px"><label>' + (opts.input.label || '') + '</label>' +
        '<input id="modalInput" value="' + RP.util.esc(opts.input.value || '') + '"></div>' : '') +
      '<div class="modal-foot">' +
        (opts.cancel === null ? '' : '<button class="btn" data-act="cancel">' + (opts.cancel || '取消') + '</button>') +
        '<button class="btn ' + (opts.danger ? 'danger' : 'primary') + '" data-act="ok">' + (opts.ok || '确定') + '</button>' +
      '</div></div>';
    document.getElementById('modalRoot').appendChild(mask);
    const input = mask.querySelector('#modalInput');
    if (input) setTimeout(function () { input.focus(); input.select(); }, 40);
    mask.addEventListener('click', function (e) {
      if (e.target === mask || e.target.dataset.act === 'cancel') { closeModal(); return; }
      if (e.target.dataset.act === 'ok') {
        const v = input ? input.value : null;
        closeModal();
        if (opts.onOk) opts.onOk(v);
      }
    });
    mask.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && input) { e.preventDefault(); const v = input.value; closeModal(); if (opts.onOk) opts.onOk(v); }
    });
  }
  function closeModal() {
    const m = document.getElementById('modalMask');
    if (m) m.remove();
  }

  function popover(x, y, items, onEach) {
    closePopover();
    const el = document.createElement('div');
    el.className = 'popover';
    el.id = 'popEl';
    el.innerHTML = items.map(function (i) { return i.html; }).join('');
    el.style.left = Math.max(12, Math.min(x, window.innerWidth - 250)) + 'px';
    el.style.top = y + 'px';
    document.getElementById('popoverRoot').appendChild(el);
    popEl = el;
    Array.prototype.forEach.call(el.children, function (child, i) { if (onEach) onEach(child, i); });
    setTimeout(function () {
      document.addEventListener('click', outside, true);
      window.addEventListener('scroll', closePopover, true);
    }, 0);
  }
  function outside(e) { if (popEl && !popEl.contains(e.target)) closePopover(); }
  function closePopover() {
    if (popEl) { popEl.remove(); popEl = null; }
    document.removeEventListener('click', outside, true);
    window.removeEventListener('scroll', closePopover, true);
  }

  /* ------------------------------ 绑定 ------------------------------ */
  function bind() {
    document.getElementById('nav').addEventListener('click', function (e) {
      const b = e.target.closest('.nav-item');
      if (b) setView(b.dataset.view);
    });
    document.getElementById('btnNewChat').addEventListener('click', function () {
      setView('resources');
      toast('选择一张角色卡，点击两次「游玩」即可开启新会话');
    });
    document.getElementById('btnThemeQuick').addEventListener('click', toggleMode);
    const ft = document.getElementById('btnFocusTop');
    if (ft) ft.addEventListener('click', function () {
      if (RP.store.get().ui.view !== 'chat') { setView('chat'); }
      toggleFocus();
    });
    const sbBtn = document.getElementById('btnSidebar');
    if (sbBtn) sbBtn.addEventListener('click', function () {
      document.getElementById('sidebar').classList.toggle('open');
    });

    /* 会话区 */
    document.getElementById('convList').addEventListener('click', function (e) {
      const del = e.target.closest('[data-del]');
      if (del) {
        e.stopPropagation();
        const conv = RP.store.conv(del.dataset.del);
        if (!conv) return;
        modal({
          title: '删除会话', body: '「' + conv.title + '」的全部记录会从本机移除，无法恢复。',
          ok: '删除', cancel: '取消', danger: true,
          onOk: function () { RP.chat.remove(conv); RP.chat.render(); paintNavDot(); toast('会话已删除', 'ok'); }
        });
        return;
      }
      const item = e.target.closest('.conv-item');
      if (!item) return;
      const st = RP.store.get();
      st.activeConv = item.dataset.id;
      RP.store.save();
      document.getElementById('sidebar').classList.remove('open');
      setView('chat');
      paintNavDot();
    });

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') {
        if (focusOn()) { setFocus(false); return; }        // 全屏时 Esc 永远先退出全屏
        closePopover(); closeModal();
      }
      /* 只有 Alt+F 才切换全屏：单独的 F 太容易误触（浏览器里 F 是常用键），不绑 */
      if ((e.key === 'f' || e.key === 'F') && e.altKey) {
        e.preventDefault();
        toggleFocus();
      }
    });
    /* 浏览器自己的全屏状态变化（Esc / F11 / 系统收回）→ 界面同步 */
    ['fullscreenchange', 'webkitfullscreenchange', 'msfullscreenchange'].forEach(function (ev) {
      document.addEventListener(ev, syncFullscreen);
    });
    /* 从 bfcache 恢复（前进/后退回来）时，别把上次的沉浸状态一起带回来 */
    window.addEventListener('pageshow', function (e) {
      if (e.persisted && focusOn()) setFocus(false);
    });
    /* 切走对话区就退出沉浸，免得在别的页面里「出不来」 */
    window.addEventListener('hashchange', function () { if (focusOn()) setFocus(false); });
  }

  /* ------------------------------ 成年人确认 ------------------------------
     只做一次、只存在本机（localStorage），不采集任何个人信息、不联网。
     定位是仅面向成年人的虚构内容：按法规写明"不向未成年人提供"，不复述剧情元素。
     后台「全局设置」里 site.ageGate=false 可以关掉。 */
  const AGE_KEY = 'rp_age_confirmed';
  function ageGate() {
    const site = (RP.settings.get() || {}).site || {};
    if (site.ageGate === false) return;
    /* tools/ 下的验收页会被 iframe 嵌入，弹窗会挡住它们 --> 这种场景跳过 */
    try { if (window.parent !== window && /^\/tools\//.test(window.parent.location.pathname)) return; } catch (e) { }
    let ok = '';
    try { ok = localStorage.getItem(AGE_KEY) || ''; } catch (e) { return; }   // 存不了就别拦人
    if (ok === '1') return;
    const mask = document.createElement('div');
    mask.className = 'age-mask';
    mask.id = 'ageMask';
    mask.innerHTML = '<div class="age-card">' +
      '<h2>仅限成年人使用</h2>' +
      '<p>依据《中华人民共和国未成年人保护法》《未成年人网络保护条例》及《网络信息内容生态治理规定》，本站不向未满十八周岁的未成年人提供内容与服务。</p>' +
      '<p>请确认你已年满十八周岁后再继续使用。</p>' +
      '<p class="age-fine">本站内容均为虚构创作。登录只需要邮箱，不收集姓名、证件号码、手机号码等身份信息；本次年龄确认仅保存在你当前使用的浏览器中。</p>' +
      '<div class="age-row"><button class="btn primary" id="ageOk">我已年满十八周岁</button>' +
      '<button class="btn" id="ageNo">我未满十八周岁</button></div>' +
      '</div>';
    document.body.appendChild(mask);
    document.documentElement.style.overflow = 'hidden';
    const close = function () { mask.remove(); document.documentElement.style.overflow = ''; };
    mask.querySelector('#ageOk').addEventListener('click', function () {
      try { localStorage.setItem(AGE_KEY, '1'); } catch (e) { }
      close();
    });
    mask.querySelector('#ageNo').addEventListener('click', function () {
      mask.querySelector('.age-card').innerHTML = '<h2>请勿继续使用</h2>' +
        '<p>本站不向未成年人提供内容与服务，请关闭本页面。</p>' +
        '<p class="age-fine">如需帮助，可告知监护人、老师，或联系当地未成年人保护机构。</p>';
    });
  }

  /* 页脚：举报与投诉 / 隐私与安全（安全评估要求对外可见的渠道） */
  (function bindLegal() {
    const rp = document.getElementById('lnkReport');
    if (rp) rp.addEventListener('click', function () { if (RP.legal) RP.legal.openReport(); });
    const pv = document.getElementById('lnkPrivacy');
    if (pv) pv.addEventListener('click', function () { if (RP.legal) RP.legal.openPrivacy(); });
  })();

  /* 顶栏登录状态：未登录显示「登录」，已登录显示脱敏邮箱 */
  function paintAuthChip() {
    const btn = document.getElementById('btnLogin');
    if (!btn) return;
    const info = RP.auth ? RP.auth.info() : { me: null };
    if (info.me) {
      btn.textContent = info.me.email;
      btn.classList.add('on');
      btn.title = '已登录 · 点击退出';
    } else {
      btn.textContent = '登录';
      btn.classList.remove('on');
      btn.title = '登录 / 注册（邮箱验证码）';
    }
  }
  function init() {
    /* 顶栏登录按钮 */
    const loginBtn = document.getElementById('btnLogin');
    if (loginBtn) loginBtn.addEventListener('click', function () {
      const info = RP.auth ? RP.auth.info() : { me: null };
      if (info.me) {
        if (confirm('已登录：' + info.me.email + '\n要退出登录吗？')) RP.auth.logout();
      } else if (RP.auth) {
        RP.auth.open({ force: false });
      }
    });
    paintAuthChip();
    applyAppearance();
    bind();
    paintQuota();
    const st = RP.store.get();
    setFocus(false);            // 绝不带着全屏状态启动（万一上次留下了也清掉）
    setView(st.ui.view || 'resources');
    paintNavDot();
    watchBuild();               // 有后端时盯构建版本，更新了就提示刷新
    /* 首次访问的引导 */
    if (!st.convs.some(function (c) { return c.kind === 'roleplay'; }) && !sessionStorage.getItem('rp-hinted')) {
      try { sessionStorage.setItem('rp-hinted', '1'); } catch (e) { }
      setTimeout(function () {
        toast('提示：点击资源卡会浮出蓝色「<b>游玩</b>」，再点一次进入剧情', 'ok');
      }, 700);
    }
  }

  /* 仅供 tools/ 下的验收页使用：它们会伪造 /api/chat 的 SSE 响应来测整条链路，
     而站点现在不自营模型（mode()==='none' 时输入框是锁着的，走不到发送那一步）。
     所以当本页被 /tools/ 下的页面以 iframe 嵌入时，先塞一个「自己的模型」配置。
     判定条件两层：有父窗口 + 父页面在 /tools/ 下；正常访问站点时永远不生效。 */
  function installHarnessModel() {
    try {
      if (window.parent === window) return;
      if (String(window.parent.location.pathname || '').indexOf('/tools/') !== 0) return;
      const st = RP.store.get();
      if (st.api && st.api.model === '__harness') return;
      st.api = { enabled: true, base: 'http://127.0.0.1:9/v1', key: 'harness', model: '__harness', temp: 0.85, direct: false };
      RP.store.save();
    } catch (e) { /* 跨源拿不到父页面 → 当作正常访问 */ }
  }

  /* 启动顺序：设置 → 邀请制 → 资源 → 渲染 */
  async function boot() {
    installHarnessModel();
    await RP.settings.load();
    RP.store.syncQuota();
    await RP.api.loadServerModel();
    await RP.data.load();
    RP.store.reseedAssistant();
    applySiteTexts();
    paintQuota();
    ageGate();
    await RP.auth.load();
    const ai = RP.auth.info();
    if (ai.requireLogin && !ai.me) { RP.auth.open({ force: true }); }
    init();
    if (backend) {
      const si = RP.api.serverInfo();
      if (si.serverModel) {
        toast('已连接后端 · 模型由本站提供（<b>' + RP.util.esc(si.model) + '</b>，每日 ' + si.dailyQuota + ' 次）', 'ok');
      } else {
        toast('已连接后端 · 内容由服务端管理', 'ok');
      }
    }
  }

  return {
    init: init, boot: boot, setView: setView, play: play, toast: toast, modal: modal, closeModal: closeModal,
    popover: popover, closePopover: closePopover, applyAppearance: applyAppearance,
    paintQuota: paintQuota, paintNavDot: paintNavDot, applySiteTexts: applySiteTexts, refreshAuthChip: paintAuthChip,
    themeMode: themeMode, isLight: isLight, toggleMode: toggleMode,
    toggleFocus: toggleFocus, setFocus: setFocus, focusOn: focusOn, paintFocus: paintFocus, applyFont: applyFont,
    autoFocus: { schedule: autoFocusSchedule, cancel: autoFocusCancel, state: AUTO_FOCUS },
    checkBuildNow: function () { return checkBuild(false); }, buildId: function () { return buildId; },
    FONT_SIZES: FONT_SIZES, FONT_FAMILIES: FONT_FAMILIES
  };
})();

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', RP.app.boot);
else RP.app.boot();
