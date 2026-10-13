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

  /* 打开内容后台：只有走 http 且后端在跑时才真能打开 */
  function adminUrl() {
    return (location.protocol === 'http:' || location.protocol === 'https:')
      ? location.origin + '/admin' : null;
  }
  function paintAdminDot() {
    const dot = document.getElementById('adminDot');
    const btn = document.getElementById('btnAdmin');
    if (!dot || !btn) return;
    const on = backend && !!adminUrl();
    dot.classList.toggle('on', on);
    btn.title = on ? '内容后台（已连接后端）' : '内容后台（后端未连接，点击查看如何开启）';
  }
  function openAdmin() {
    const url = adminUrl();
    if (url && backend) { window.open(url, '_blank'); return; }
    modal({
      title: '打开内容后台',
      body: '资源的提示词、剧情文案、封面图，以及会话助手的人设提示词，都由后端管理。\n\n' +
        '① 在项目目录执行：\n   node server/server.js 5599\n' +
        '（或直接双击 start.cmd，它会自动起服务并打开浏览器）\n\n' +
        '② 然后打开：\n   http://127.0.0.1:5599/admin\n\n' +
        (location.protocol === 'file:'
          ? '当前页面是用「直接打开 index.html」的方式打开的，这种方式没有后端，所以只能读取内置资源、改不了数据。'
          : '当前页面连不上后端接口，请确认服务已经启动。'),
      ok: '知道了'
    });
  }

  /* 站点文案（站点名、页脚声明等）来自后台设置 */
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
    const left = RP.store.quotaLeft();
    const box = document.getElementById('quotaMini');
    if (!box) return;
    const pct = Math.round(left / st.user.quota.daily * 100);
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
    document.getElementById('btnAdmin').addEventListener('click', openAdmin);
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

  function init() {
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

  /* 启动顺序：设置 → 资源 → 渲染 */
  async function boot() {
    await RP.settings.load();
    RP.store.syncQuota();
    await RP.api.loadServerModel();
    await RP.data.load();
    RP.store.reseedAssistant();
    applySiteTexts();
    paintQuota();
    init();
    paintAdminDot();
    if (backend) {
      const si = RP.api.serverInfo();
      if (si.serverModel) {
        toast('已连接后端 · 模型由本站提供（<b>' + RP.util.esc(si.model) + '</b>，每日 ' + si.dailyQuota + ' 次）', 'ok');
      } else {
        toast('已连接后端 · 顶栏「内容后台」可编辑提示词与人设', 'ok');
      }
    }
  }

  return {
    init: init, boot: boot, setView: setView, play: play, toast: toast, modal: modal, closeModal: closeModal,
    popover: popover, closePopover: closePopover, applyAppearance: applyAppearance,
    paintQuota: paintQuota, paintNavDot: paintNavDot, applySiteTexts: applySiteTexts,
    themeMode: themeMode, isLight: isLight, toggleMode: toggleMode,
    openAdmin: openAdmin, adminUrl: adminUrl, paintAdminDot: paintAdminDot,
    toggleFocus: toggleFocus, setFocus: setFocus, focusOn: focusOn, paintFocus: paintFocus, applyFont: applyFont,
    checkBuildNow: function () { return checkBuild(false); }, buildId: function () { return buildId; },
    FONT_SIZES: FONT_SIZES, FONT_FAMILIES: FONT_FAMILIES
  };
})();

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', RP.app.boot);
else RP.app.boot();
