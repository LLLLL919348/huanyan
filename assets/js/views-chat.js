/* ==========================================================================
   幻言 · 对话区
   新建会话 → 载入资源提示词与准则 → 先发「剧情提醒」→ 用户开口 → AI 扮演
   · 行为台词（下划线）是唯一裁决凭证，扣血 / 禁言 / 处刑 / 抵御道具都只认它
   · 状态值不显示数字：改成玩家气泡与左栏会话上的「破碎」程度
   · 不显示好感数字：改成「心境」标签；另设「剧情完成度」
   · 背景固定，场景不进入对话
   ========================================================================== */
RP.chat = (function () {
  let typing = false;
  /* 对话必须由模型主导：没有可用模型时入口直接锁住，不用脚本硬凑角色台词
     （固定台词仍由程序出：剧情提醒、节点旁白、处刑/离去卡、安全提示、会话助手 FAQ） */
  function hasModel() { return RP.api.mode() !== 'none'; }
  /* 草稿：切换会话 / 切板块 / 重绘都不会丢字；顺便落到 sessionStorage，刷新也还在 */
  const DRAFT_KEY = 'rp_drafts_v1';
  let drafts = (function () {
    try { return JSON.parse(sessionStorage.getItem(DRAFT_KEY) || '{}') || {}; } catch (e) { return {}; }
  })();
  let draftTimer = null;
  function persistDrafts() {
    clearTimeout(draftTimer);
    draftTimer = setTimeout(function () {
      try { sessionStorage.setItem(DRAFT_KEY, JSON.stringify(drafts)); } catch (e) { /* 隐私模式忽略 */ }
    }, 300);
  }

  function maxHp() {
    const c = RP.settings.get().combat || {};
    return c.maxHp || 20;
  }

  /* 破碎程度：data-dmg 管「裂成什么样」，--hp-k（0-1）管「红到什么程度」，
     两者都挂在 #view-chat 上，CSS 里统一消费 */
  function paintDamage(conv, tier) {
    const view = document.getElementById('view-chat');
    if (!view) return;
    if (!conv || conv.kind === 'assistant') {
      view.dataset.dmg = '0';
      view.style.setProperty('--hp-k', '0');
      return;
    }
    const t = typeof tier === 'number' ? tier : dmgTier(conv.hp, conv.maxHp);
    const ratio = 1 - Math.max(0, Math.min(1, (conv.hp || 0) / (conv.maxHp || maxHp())));
    view.dataset.dmg = String(t);
    view.style.setProperty('--hp-k', ratio.toFixed(3));
  }

  /* ------------------------------ 道具 ------------------------------ */
  function draftOf(conv) {
    if (!drafts[conv.id]) drafts[conv.id] = { items: [], text: '' };
    const d = drafts[conv.id];
    if (typeof d.text !== 'string') d.text = '';           // 兼容旧结构
    if (!Array.isArray(d.items)) d.items = [];
    return d;
  }
  function ownedShopItems() {
    const inv = RP.store.get().inventory || {};
    return (RP.settings.get().items || []).filter(function (i) { return (inv[i.id] || 0) > 0; });
  }
  function plotItemsOf(conv) { return conv.plotItems || (conv.plotItems = []); }
  function attachItem(conv, item) {
    const d = draftOf(conv);
    if (d.items.some(function (x) { return x.id === item.id && !!x.plot === !!item.plot; })) return false;
    d.items.push(item);
    return true;
  }
  function detachItem(conv, id, plot) {
    const d = draftOf(conv);
    d.items = d.items.filter(function (x) { return !(x.id === id && !!x.plot === !!plot); });
  }

  /* 真正生效的道具效果：只有被引用的道具才会走到这里 */
  function applyItemEffect(conv, resource, item, events) {
    const def = item.plot ? { effect: {} } : (RP.store.itemDef(item.id) || { effect: {} });
    const ef = def.effect || {};
    let touched = false;
    if (ef.heal) {
      const before = conv.hp;
      conv.hp = RP.util.clamp(conv.hp + ef.heal, 0, conv.maxHp);
      if (conv.hp > 0) conv.muted = false;
      events.push({ role: 'notice', text: '「' + item.name + '」生效 · 状态值 +' + (conv.hp - before), meta: { tone: 'gain' } });
      touched = true;
    }
    if (ef.affinity) {
      conv.affinity = RP.util.clamp(conv.affinity + ef.affinity, 0, 100);
      events.push({ role: 'notice', text: '「' + item.name + '」生效 · 心境 → ' + moodOf(conv.affinity).name, meta: { tone: 'gain' } });
      touched = true;
    }
    if (ef.clearWarn) conv.warned = 0;
    if (ef.shield) {
      conv.shield = true;
      events.push({ role: 'notice', text: '「' + item.name + '」生效 · 免罚金牌已挂起', meta: { tone: 'gain' } });
      touched = true;
    }
    if (ef.unseal) {
      restart(conv);
      events.push({ role: 'notice', text: '「' + item.name + '」生效 · 剧情已重置', meta: { tone: 'gain' } });
      touched = true;
    }
    if (ef.progress) {
      const before = conv.progress || 0;
      conv.progress = RP.util.clamp(before + ef.progress, 0, 100);
      events.push({ role: 'notice', text: '「' + item.name + '」生效 · 剧情推进度 ' + before + '% → ' + conv.progress + '%', meta: { tone: 'gain' } });
      touched = true;
    }
    if (ef.gift) {
      const pool = (resource && resource.plotItems) || [{ name: '一枚旧物', desc: '来路不明，但对方显然认得它' }];
      const it = RP.util.pick(pool);
      plotItemsOf(conv).push({ id: RP.util.uid('pi'), name: it.name, desc: it.desc || '', from: '顺水人情' });
      events.push({ role: 'notice', text: '获得剧情道具 · ' + it.name + (it.desc ? '（' + it.desc + '）' : ''), meta: { tone: 'gain' } });
      touched = true;
    }
    if (ef.counter === 'force-answer') {
      conv.forceAnswer = true;      // 下一轮角色必须正面回答
      events.push({ role: 'notice', text: '「' + item.name + '」已出鞘 · 这一问角色必须正面回答（人设越硬，反噬越重）', meta: { tone: 'warn' } });
      touched = true;
    }
    return touched;
  }

  /* 反制道具的反噬：人设越硬越可能暴怒反击 */
  function counterBacklash(conv, resource) {
    const spe = resource && resource.character
      ? String(resource.character.speech || '') + String(resource.character.personality || '') : '';
    const hard = /冷|硬|狠|强势|不容|规矩|克制|疏淡|不谈感情|生意/.test(spe);
    const angry = Math.random() < (hard ? 0.65 : 0.35);
    if (!angry) {
      return { text: '（对方盯着那件东西看了很久，最后把它推回你面前）「……问吧。只此一次。」', aff: -2, hp: 0, angry: false };
    }
    return {
      text: '（对方一把按住那件东西，力道大得指节发白）「你拿这个来对付我？」',
      aff: -8, hp: -((RP.settings.get().combat.dmg || {}).warn || 2), angry: true
    };
  }

  const MOODS = [
    { min: 85, name: '交付', desc: '已经把你算进自己的局里' },
    { min: 65, name: '信任', desc: '愿意让你看见软的那一面' },
    { min: 45, name: '亲近', desc: '话里开始有温度' },
    { min: 25, name: '缓和', desc: '防备比初见薄了一层' },
    { min: 10, name: '戒备', desc: '客气，但每一句都在量你' },
    { min: 0, name: '冷淡', desc: '你还没被当成自己人' }
  ];
  function moodOf(aff) {
    for (let i = 0; i < MOODS.length; i++) if (aff >= MOODS[i].min) return MOODS[i];
    return MOODS[MOODS.length - 1];
  }
  /* 破碎档位：0 完好 / 1 微裂 / 2 裂痕 / 3 破碎 / 4 崩解 */
  /* 破碎等级 0-4：门槛压得比较密，让「挨一下」就看得出来（配合 CSS 的 --hp-k 连续变红） */
  function dmgTier(hp, max) {
    if (hp <= 0) return 4;
    const r = hp / (max || 100);
    if (r > 0.9) return 0;
    if (r > 0.75) return 1;
    if (r > 0.55) return 2;
    if (r > 0.3) return 3;
    return 4;
  }

  /* 全页面背景：把当前本子的配色铺到整页（顶栏、侧栏、对话区一起变） */
  function applyBackdrop() {
    const conv = RP.store.active();
    const resource = conv && conv.resourceId ? RP.resources.byId(conv.resourceId) : null;
    const body = document.body;
    if (!resource || conv.kind !== 'roleplay') { body.dataset.scene = 'off'; return; }
    const pal = (resource.cover && resource.cover.palette) || ['#1b2130', '#2b3550', '#4d8dff'];
    const a = RP.app.isLight() ? ['3d', '33', '2b'] : ['7a', '5c', '4f'];
    body.style.setProperty('--page-1', pal[0] + a[0]);
    body.style.setProperty('--page-2', pal[1] + a[1]);
    body.style.setProperty('--page-3', pal[2] + a[2]);
    body.dataset.scene = 'on';
  }

  /* ------------------------------ 会话创建 ------------------------------ */
  function create(resource) {
    const st = RP.store.get();
    const res = RP.store.res(resource.id);
    const now = Date.now();
    const conv = {
      id: RP.util.uid('conv'),
      kind: 'roleplay',
      title: resource.name,
      resourceId: resource.id,
      pinned: false,
      hp: maxHp(), maxHp: maxHp(), affinity: 0, progress: 0, completed: false,
      turn: 0, muted: false, paused: false, warned: 0, shield: false, actMute: 0,
      plotItems: [], forceAnswer: false,
      createdAt: now, updatedAt: now,
      messages: [RP.engine.reminder(resource)]
    };
    res.plays = (res.plays || 0) + 1;
    res.lastPlayedAt = now;
    st.convs.push(conv);
    st.activeConv = conv.id;
    st.ui.selected = null;
    RP.store.save();
    return conv;
  }

  function restart(conv) {
    if (!conv || conv.kind === 'assistant') return;
    const resource = RP.resources.byId(conv.resourceId);
    conv.hp = conv.maxHp; conv.affinity = 0; conv.progress = 0; conv.completed = false;
    conv.turn = 0; conv.muted = false; conv.paused = false; conv.warned = 0;
    conv.shield = false; conv.actMute = 0;
    conv.forceAnswer = false;
    conv.left = false; conv.persuade = 0; conv.offTopic = 0; conv.conduct = 0;
    drafts[conv.id] = { items: [], text: '' };
    conv.updatedAt = Date.now();
    conv.messages = resource ? [RP.engine.reminder(resource)] : [];
    RP.store.save();
  }

  function remove(conv) {
    const st = RP.store.get();
    st.convs = st.convs.filter(function (c) { return c.id !== conv.id; });
    if (st.activeConv === conv.id) st.activeConv = 'conv-assistant';
    RP.store.save();
  }

  /* ------------------------------ 侧栏会话区 ------------------------------ */
  function renderSidebar() {
    const st = RP.store.get();
    const box = document.getElementById('convList');
    if (!box) return;
    const convs = st.convs.slice().sort(function (a, b) {
      if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
      return b.updatedAt - a.updatedAt;
    });
    box.innerHTML = convs.map(function (c) {
      const r = c.resourceId ? RP.resources.byId(c.resourceId) : null;
      const pal = r && r.cover && r.cover.palette ? r.cover.palette : ['#1b2130', '#2b3550', '#4d8dff'];
      const last = c.messages.slice(-1)[0];
      const plain = last ? (last.role === 'ai' ? RP.acts.parse(last.text).text : last.text) : '';
      const prev = !last ? '（还没有消息）'
        : last.role === 'user' ? '你：' + RP.util.trim(plain, 30)
          : last.role === 'reminder' ? '剧情提醒已送达'
            : last.role === 'execution' ? '已被处刑 · 会话终止'
              : last.role === 'notice' ? plain
                : last.role === 'beat' ? RP.util.trim(plain, 32)
                  : RP.util.trim(plain, 34);
      const tier = c.kind === 'assistant' ? 0 : dmgTier(c.hp, c.maxHp);
      const badge = c.kind === 'assistant' ? '<span class="mini-tag">助手</span>'
        : c.muted ? '<span class="mini-tag dead">禁言</span>'
          : c.paused ? '<span class="mini-tag warn">暂停</span>'
            : c.actMute ? '<span class="mini-tag warn">封口 ' + c.actMute + '</span>'
              : '<span class="mini-tag hp">' + c.progress + '%</span>';
      return '<div class="conv-item' + (st.activeConv === c.id ? ' active' : '') + '" data-id="' + c.id + '" data-dmg="' + tier + '">' +
        '<div class="conv-ico" style="background:linear-gradient(145deg,' + pal[1] + ',' + pal[2] + ')">' +
          (c.kind === 'assistant' ? RP.util.esc(RP.settings.get().assistant.initial || '幻') : RP.util.esc((r ? r.character.name : c.title).slice(0, 1))) + '</div>' +
        '<div class="conv-main">' +
          '<div class="conv-title"><span>' + RP.util.esc(c.title) + '</span>' + badge + '</div>' +
          '<div class="conv-prev">' + RP.util.esc(prev) + '</div>' +
        '</div>' +
        '<div class="conv-time">' + RP.util.timeAgo(c.updatedAt) + '</div>' +
        (c.pinned ? '' : '<button class="conv-del" data-del="' + c.id + '" title="删除会话">×</button>') +
      '</div>';
    }).join('');
  }

  /* ------------------------------ 主视图 ------------------------------ */
  function render() {
    const st = RP.store.get();
    const conv = RP.store.active();
    const view = document.getElementById('view-chat');
    if (!conv) {
      view.innerHTML = '<div class="view-scroll"><div class="empty">' +
        '<div class="big">🎭</div><p>还没有进行中的会话。<br>去「资源」挑一张角色卡，点两次「游玩」就能开场。</p>' +
        '<button class="btn primary" data-goto="resources" style="margin-top:8px">去资源库</button></div></div>';
      view.querySelector('[data-goto]').addEventListener('click', function () { RP.app.setView('resources'); });
      renderSidebar();
      document.body.dataset.scene = 'off';
      return;
    }
    const resource = conv.resourceId ? RP.resources.byId(conv.resourceId) : null;
    const pal = resource && resource.cover && resource.cover.palette ? resource.cover.palette : ['#1b2130', '#2b3550', '#4d8dff'];
    const sa = RP.app.isLight() ? ['26', '1f', '1a'] : ['55', '44', '3d'];
    const tier = conv.kind === 'assistant' ? 0 : dmgTier(conv.hp, conv.maxHp);
    const mood = moodOf(conv.affinity);
    const assistant = RP.settings.get().assistant;
    const avatarBg = conv.kind === 'assistant'
      ? 'linear-gradient(145deg,#2b3550,#4d8dff)'
      : 'linear-gradient(145deg,' + pal[1] + ',' + pal[2] + ')';

    view.innerHTML = '' +
    '<div class="chat">' +
      '<div class="chat-head">' +
        '<div class="chat-id">' +
          '<div class="chat-avatar" data-dmg="' + tier + '" style="background:' + avatarBg + '">' +
            (conv.kind === 'assistant' ? RP.util.esc(assistant.initial || '幻') : RP.util.esc((resource.character.name || conv.title).slice(0, 1))) + '</div>' +
          '<div><h2>' + RP.util.esc(conv.title) +
            (conv.kind === 'assistant'
              ? '<span class="status on">常驻</span>'
              : conv.left ? '<span class="status dead">已离开</span>'
                : conv.muted ? '<span class="status dead">已禁言</span>'
                  : conv.paused ? '<span class="status warn">已暂停</span>'
                    : conv.actMute ? '<span class="status warn">被封口</span>'
                      : '<span class="status on">演绎中</span>') +
          '</h2><p>' + (conv.kind === 'assistant' ? RP.util.esc(assistant.subtitle || '站点使用答疑 · 不参与剧情扮演')
            : '角色：' + RP.util.esc(resource.character.name) + ' · ' + RP.util.esc(resource.character.title || '')) + '</p></div>' +
        '</div>' +
        (conv.kind === 'assistant' ? '' :
        '<div class="chat-stats">' +
          '<div class="stat"><div class="stat-top"><span>心境</span><b id="moodVal">' + mood.name + '</b></div>' +
            '<div class="mood-note" id="moodNote">' + RP.util.esc(mood.desc) + '</div></div>' +
          '<div class="stat wide"><div class="stat-top"><span>剧情完成度</span><b id="progVal">' + conv.progress + '%</b></div>' +
            '<div class="progress"><i id="progFill" style="width:' + conv.progress + '%"></i></div></div>' +
        '</div>') +
        '<div class="chat-actions">' +
          (conv.kind === 'assistant' ? '' : '<button class="btn sm" id="btnRestart">重新开始</button>') +
          '<button class="btn sm" id="btnFocus" title="全屏沉浸（Esc 退出）">全屏</button>' +
          (conv.pinned ? '' : '<button class="btn sm danger" id="btnDel">删除会话</button>') +
        '</div>' +
      '</div>' +
      '<div class="chat-stage" id="chatStage" style="--sc-1:' + pal[0] + sa[0] + ';--sc-2:' + pal[1] + sa[1] + ';--sc-3:' + pal[2] + sa[2] + '">' +
        '<div class="messages dmg-' + tier + '" id="messages"></div>' +
      '</div>' +
      '<div class="composer" id="composer"></div>' +
    '</div>';

    renderMessages(true);        // 打开会话：直接停在最新一条
    renderComposer();
    bindHead(conv, resource);
    renderSidebar();
    applyBackdrop();
    paintDamage(conv);
    paintFocusBtn();
    /* 事件委托：消息流里的「重试这一轮」（模型调用失败时才出现） */
    const mbox = document.getElementById('messages');
    if (mbox) mbox.addEventListener('click', function (e) {
      const t = e.target && e.target.closest ? e.target.closest('[data-retry]') : null;
      if (t) { retryLast(); }
    });
  }

  /* 只刷新心境 / 完成度 / 破碎等级，避免整块重绘 */
  function renderStats() {
    const conv = RP.store.active();
    if (!conv || conv.kind === 'assistant') return;
    const mood = moodOf(conv.affinity);
    const mv = document.getElementById('moodVal'), mn = document.getElementById('moodNote');
    if (mv) mv.textContent = mood.name;
    if (mn) mn.textContent = mood.desc;
    const pv = document.getElementById('progVal'), pf = document.getElementById('progFill');
    if (pv) pv.textContent = conv.progress + '%';
    if (pf) pf.style.width = conv.progress + '%';
    const tier = dmgTier(conv.hp, conv.maxHp);
    const box = document.getElementById('messages');
    if (box) box.className = 'messages dmg-' + tier;
    paintDamage(conv, tier);
    const av = document.querySelector('#view-chat .chat-avatar');
    if (av) av.dataset.dmg = tier;
    const pill = document.querySelector('#view-chat .chat-id .status');
    if (pill) {
      const dead = conv.muted || conv.left, paused = conv.paused, mute = conv.actMute > 0;
      pill.className = 'status ' + (dead ? 'dead' : (paused || mute) ? 'warn' : 'on');
      pill.textContent = conv.left ? '已离开' : conv.muted ? '已禁言' : paused ? '已暂停' : mute ? '被封口' : '演绎中';
    }
    applyBackdrop();
  }

  function renderMessages(forceBottom) {
    const conv = RP.store.active();
    const box = document.getElementById('messages');
    if (!conv || !box) return;
    watchScroll();
    const resource = conv.resourceId ? RP.resources.byId(conv.resourceId) : null;
    const pal = resource && resource.cover && resource.cover.palette ? resource.cover.palette : ['#1b2130', '#2b3550', '#4d8dff'];
    const assistant = RP.settings.get().assistant;
    const name = conv.kind === 'assistant' ? (assistant.name || '会话助手') : (resource.character.name || conv.title);
    const av = conv.kind === 'assistant'
      ? 'linear-gradient(145deg,#2b3550,#4d8dff)'
      : 'linear-gradient(145deg,' + pal[1] + ',' + pal[2] + ')';

    box.className = 'messages dmg-' + (conv.kind === 'assistant' ? 0 : dmgTier(conv.hp, conv.maxHp));
    box.innerHTML = conv.messages.map(function (m) {
      const time = RP.util.clock(m.ts || Date.now());
      if (m.role === 'reminder') {
        const items = (m.meta && m.meta.items) || [];
        const pr = (m.meta && m.meta.plotRules) || [];
        const br = (m.meta && m.meta.behaviorRules) || [];
        const rules = (m.meta && m.meta.rules) || [];
        const group = function (title, list, cls) {
          if (!list.length) return '';
          return '<div class="rule-group ' + cls + '"><div class="rule-group-title">' + title + '</div><ul>' +
            list.map(function (i) { return '<li>' + RP.util.esc(i) + '</li>'; }).join('') + '</ul></div>';
        };
        /* 本场规则是写给 AI 的：默认藏起来留个好奇，通关后回来可以展开看 */
        const cv = RP.store.active();
        const rz = cv && cv.resourceId ? RP.resources.byId(cv.resourceId) : null;
        const unlocked = rz ? !!RP.store.claim(rz.id, rz.difficulty || 2).win : false;
        let spoiler = '';
        if (pr.length || br.length) {
          spoiler = unlocked
            ? '<details class="spoiler"><summary><b>本场规则已解锁</b>' +
              '<span>共 ' + pr.length + ' 条剧情规则 · ' + br.length + ' 条行为规则（写给 AI 的，你已经通关，可以看了）</span></summary>' +
              group('本场剧情规则', pr, 'plot') + group('本场行为规则', br, 'behavior') + '</details>'
            : '<div class="spoiler locked"><span class="lock">🔒</span>' +
              '<div><b>本场规则已隐藏</b>' +
              '<span>共 ' + pr.length + ' 条剧情规则 · ' + br.length + ' 条行为规则。这些是写给 AI 的运作说明，' +
              '提前看了会剧透关键答案与判定尺度 —— 通关之后可以回来展开看。</span></div></div>';
        }
        return '<div class="reminder"><div class="reminder-inner">' +
          '<div class="reminder-top"><span class="tag">' + RP.util.esc((m.meta && m.meta.tag) || 'BRIEFING') + '</span>' +
          '<h4>' + RP.util.esc(m.text) + '</h4></div>' +
          '<ol>' + items.map(function (i) { return '<li>' + RP.util.esc(i) + '</li>'; }).join('') + '</ol>' +
          (m.meta && m.meta.notice ? '<div class="reminder-notice">⚠ ' + RP.util.esc(m.meta.notice) + '</div>' : '') +
          (rules.length ? '<ul class="reminder-rules">' + rules.map(function (i) { return '<li>' + RP.util.esc(i) + '</li>'; }).join('') + '</ul>' : '') +
          spoiler +
          (m.meta && m.meta.foot ? '<div class="reminder-foot">' + RP.util.esc(m.meta.foot) + '</div>' : '') +
          '</div></div>';
      }
      if (m.role === 'beat') return '<div class="beat"><span>' + RP.acts.render(RP.util.esc(m.text)) + '</span></div>';
      if (m.role === 'notice') {
        const retry = m.meta && m.meta.retry;
        return '<div class="notice center' + (retry ? ' has-retry' : '') + '"><span>' + RP.util.esc(m.text) + '</span>' +
          (retry ? '<button class="btn sm" data-retry="1" id="btnRetryTurn">重试这一轮</button>' : '') + '</div>';
      }
      if (m.role === 'execution') {
        return '<div class="execution"><div class="execution-inner">' +
          '<div class="mark">' + RP.util.esc((m.meta && m.meta.title) || '处 刑') + '</div>' +
          '<div class="sub">' + RP.util.esc((m.meta && m.meta.sub) || '') + '</div>' +
          '<div class="line">' + RP.acts.render(RP.util.esc(m.text)) + '</div>' +
          (m.meta && m.meta.foot ? '<div class="reminder-foot" style="border-color:rgba(255,95,109,.35)">' + RP.util.esc(m.meta.foot) + '</div>' : '') +
          '</div></div>';
      }
      if (m.role === 'victory') {
        return '<div class="execution victory"><div class="execution-inner">' +
          '<div class="mark">' + RP.util.esc((m.meta && m.meta.title) || '通 关') + '</div>' +
          '<div class="sub">' + RP.util.esc((m.meta && m.meta.sub) || '') + '</div>' +
          '<div class="line">' + RP.util.esc(m.text) + '</div>' +
          (m.meta && m.meta.foot ? '<div class="reminder-foot">' + RP.util.esc(m.meta.foot) + '</div>' : '') +
          '</div></div>';
      }
      if (m.role === 'leave') {
        return '<div class="execution leave"><div class="execution-inner">' +
          '<div class="mark">' + RP.util.esc((m.meta && m.meta.title) || '离 去') + '</div>' +
          '<div class="sub">' + RP.util.esc((m.meta && m.meta.sub) || '') + '</div>' +
          '<div class="line">' + RP.acts.render(RP.util.esc(m.text)) + '</div>' +
          (m.meta && m.meta.foot ? '<div class="reminder-foot">' + RP.util.esc(m.meta.foot) + '</div>' : '') +
          '</div></div>';
      }
      const isUser = m.role === 'user';
      /* AI 一旦动用行为台词，整条消息的「字号与恐怖程度」按严重度升级 */
      const actsOfMsg = isUser ? [] : RP.acts.parse(String(m.text || '')).acts;
      const top = RP.acts.topAct(actsOfMsg);
      const sev = top ? RP.acts.severity(top.effect) : 0;
      const items = (m.items || []).map(function (it) {
        return '<span class="bubble-item' + (it.plot ? ' plot' : '') + (it.kind === 'counter' ? ' counter' : '') + '">' +
          '<i>' + RP.util.esc(it.icon || '◈') + '</i>' + RP.util.esc(it.name) + '</span>';
      }).join('');
      return '<div class="msg-row ' + (isUser ? 'user' : 'ai') + (m.meta && m.meta.streaming ? ' stream-row' : '') + '"' +
        (sev ? ' data-act="' + RP.util.esc(top.effect) + '" data-act-sev="' + sev + '"' : '') + '>' +
        '<div class="msg-av" style="background:' + (isUser ? 'linear-gradient(145deg,#39415c,#5b6b9a)' : av) + '">' +
          (isUser ? RP.util.esc((RP.store.get().user.name || '我').slice(0, 1)) : RP.util.esc(name.slice(0, 1))) + '</div>' +
        '<div class="msg-body">' +
          '<div class="msg-name">' + RP.util.esc(isUser ? (RP.store.get().user.name || '我') : name) +
            (sev ? '<span class="act-stamp">' + RP.util.esc(RP.acts.LABEL[top.effect] || '') + '</span>' : '') +
            '<span class="msg-time"> · ' + time +
              (m.meta && m.meta.ms ? ' · ' + (m.meta.ms / 1000).toFixed(1) + 's' + (m.meta.via === 'own' ? '（你的模型）' : m.meta.via === 'server' ? '（本站模型）' : '') : '') +
            '</span></div>' +
          (items ? '<div class="bubble-items">' + items + '</div>' : '') +
          '<div class="bubble' + (m.meta && m.meta.safety ? ' safety' : '') + (m.meta && m.meta.backlash ? ' backlash' : '') + '">' +
            (isUser ? RP.util.esc(m.text) : RP.acts.render(RP.util.esc(m.text))) + '</div>' +
        '</div></div>';
    }).join('');
    stickBottom(box, { force: forceBottom });
  }

  /* ------------------------------ 滚动位置 ------------------------------
     关键：只有「用户本来就在底部」时才自动跟到底。
     否则模型每吐一个字都把人拽回底部 —— 表现就是「滚轮滚不动、页面像卡死」。 */
  function nearBottom(box, slack) {
    if (!box) return true;
    return (box.scrollHeight - box.scrollTop - box.clientHeight) <= (slack || 90);
  }
  function stickBottom(box, opts) {
    if (!box) return;
    opts = opts || {};
    const atBottom = nearBottom(box, opts.slack);
    if (opts.force || atBottom) {
      box.scrollTop = box.scrollHeight;
      setJumpBtn(false);
    } else {
      setJumpBtn(true);
    }
  }
  /* 「回到最新」浮标：用户往上翻的时候才出现 */
  function setJumpBtn(on) {
    const stage = document.querySelector('#view-chat .chat-stage');
    let b = document.getElementById('jumpLatest');
    if (on && !b && stage) {
      b = document.createElement('button');
      b.id = 'jumpLatest';
      b.className = 'jump-latest';
      b.type = 'button';
      b.innerHTML = '<svg viewBox="0 0 24 24" class="ico"><path d="M12 5v13"/><path d="M6 12l6 6 6-6"/></svg><span>回到最新</span>';
      b.addEventListener('click', function () {
        const box = document.getElementById('messages');
        if (box) box.scrollTop = box.scrollHeight;
        setJumpBtn(false);
      });
      stage.appendChild(b);
    } else if (!on && b) {
      b.remove();
    }
  }
  /* 用户自己滚过之后就别再自动跟随；滚回底部再恢复跟随 */
  function watchScroll() {
    const box = document.getElementById('messages');
    if (!box || box.dataset.watched === '1') return;
    box.dataset.watched = '1';
    box.addEventListener('scroll', function () {
      setJumpBtn(!nearBottom(box));
    }, { passive: true });
  }

  /* 一次性的「冲击」特效：行为台词落地的那一刻，整个对话面板抖一下、红一下 */
  const IMPACT_CLASS = ['', 'impact-warn', 'impact-punish', 'impact-heavy', 'impact-fatal'];
  let impactTimer = null;
  function actImpact(effect) {
    const view = document.getElementById('view-chat');
    if (!view) return;
    const sev = RP.acts.severity(effect);
    if (!sev) return;
    IMPACT_CLASS.forEach(function (c) { if (c) view.classList.remove(c); });
    /* 强制重排，保证连续两次同级别制裁也能重新播动画 */
    void view.offsetWidth;
    view.classList.add(IMPACT_CLASS[Math.min(sev, 4)]);
    view.dataset.impact = String(sev);
    clearTimeout(impactTimer);
    impactTimer = setTimeout(function () {
      IMPACT_CLASS.forEach(function (c) { if (c) view.classList.remove(c); });
      view.dataset.impact = '0';
    }, sev >= 4 ? 2600 : (sev === 3 ? 1900 : 1300));
  }

  function renderComposer() {
    const conv = RP.store.active();
    const box = document.getElementById('composer');
    if (!conv || !box) return;
    const resource = conv.resourceId ? RP.resources.byId(conv.resourceId) : null;

    if (conv.muted) {
      box.innerHTML = '<div class="locked-panel"><h4>你已被禁言</h4>' +
        '<p>状态值归零，角色已经对你下达处刑，本场演绎终止。只能重新开始，或使用「重启令牌」解禁。</p>' +
        '<div class="row"><button class="btn primary" id="btnRestart2">重新开始</button>' +
        '<button class="btn" data-goto="resources">换一个本子</button></div></div>';
    } else if (conv.left) {
      box.innerHTML = '<div class="locked-panel left"><h4>对方已经离开</h4>' +
        '<p>' + RP.util.esc((resource && resource.character ? resource.character.name : '对方')) +
        ' 受够了这场对话，走了。这里没有「继续」这个选项。</p>' +
        '<div class="row"><button class="btn primary" id="btnRestart2">重新开始</button>' +
        '<button class="btn" data-goto="resources">换一个本子</button></div></div>';
    } else if (conv.paused) {
      box.innerHTML = '<div class="locked-panel paused"><h4>会话已暂停</h4>' +
        '<p>安全机制介入，本场对话已中止。你可以重新开始一段新的剧情，或回到「会话助手」聊聊。</p>' +
        '<div class="row"><button class="btn primary" id="btnRestart2">重新开始</button>' +
        '<button class="btn" id="btnAssistant">回到会话助手</button></div></div>';
    } else if (conv.kind === 'roleplay' && !hasModel() && !RP.engine.offlineDialogue()) {
      /* 产品铁律：角色对话必须由模型主导 —— 没有模型就不给开口，也不许脚本硬凑 */
      box.innerHTML = '<div class="locked-panel need-model"><h4>本场需要模型才能开始</h4>' +
        '<p>这里的所有对话都由大模型现场演绎（角色台词、状态结算、剧情推进都听它的），' +
        '所以没有可用模型时，本场不会用脚本来凑台词 —— 当前没有任何回复是"编"出来的。</p>' +
        '<p class="hint-strong">接上模型只要一分钟：填一次自己的 Key 就能玩，本机的 Ollama / LM Studio 也能直接扫描（都免费）；' +
        '也可以用站长配好的模型（每日额度 ' + RP.store.get().user.quota.daily + ' 次）。</p>' +
        '<div class="row"><button class="btn primary" id="btnGoModel">去配置模型</button>' +
        '<button class="btn" id="btnScanModel">扫描本机模型</button>' +
        '<button class="btn" data-goto="resources">换一个本子</button></div></div>';
    } else if (conv.actMute > 0) {
      box.innerHTML = '<div class="locked-panel muted"><h4>你被封了口</h4>' +
        '<p>角色用行为台词封住了你的话，还剩 <b>' + conv.actMute + '</b> 个回合。' +
        '你可以沉默以对，让剧情继续往前走。</p>' +
        '<div class="row"><button class="btn primary" id="btnSilent">沉默以对（跳过本回合）</button>' +
        '<button class="btn" data-goto="resources">换一个本子</button></div></div>';
    } else {
      const left = RP.store.quotaLeft();
      const daily = RP.store.get().user.quota.daily;
      const d = draftOf(conv);
      const boss = conv.kind === 'assistant';
      /* 只有「用本站模型」才吃每日额度：自带模型不占 */
      const apiMode = RP.api.mode();
      const spendQuota = apiMode === 'server';
      const quotaOut = spendQuota && left <= 0;
      const hints = (conv.kind === 'roleplay' && conv.turn === 0 && resource && resource.openingHints && !d.items.length)
        ? '<div class="hints">' + resource.openingHints.map(function (h) {
            return '<button class="hint-chip" data-hint="' + RP.util.esc(h) + '">' + RP.util.esc(h) + '</button>';
          }).join('') + '</div>' : '';
      const warn = '';
      const attached = d.items.length
        ? '<div class="attached-row">' + d.items.map(function (it, i) {
            return '<span class="attached-chip' + (it.plot ? ' plot' : '') + (it.kind === 'counter' ? ' counter' : '') + '">' +
              '<i>' + RP.util.esc(it.icon || '◈') + '</i>' + RP.util.esc(it.name) +
              '<button data-detach="' + i + '" title="取消引用">×</button></span>';
          }).join('') + '<span class="attached-tip">将随你的这句话一起发出</span></div>' : '';
      box.innerHTML = hints + warn + attached +
        '<div class="composer-inner"><div class="composer-box">' +
        '<textarea id="chatInput" rows="1" placeholder="' +
          (boss ? '问我会话助手：怎么开始 / 行为台词是什么 / 积分怎么拿……'
            : (d.items.length ? '可以只说一句话，也可以只发道具……' : '以你的身份说第一句话……（Enter 发送，Shift+Enter 换行）')) +
        '"></textarea>' +
        (boss ? '' : '<div class="composer-tools">' +
          '<button class="item-btn' + ((ownedShopItems().length + plotItemsOf(conv).length) ? '' : ' empty') + '" id="btnItems" title="引用道具（口述不算数）">' +
          '<svg viewBox="0 0 24 24" class="ico"><path d="M12 3l2.2 4.6 5 .7-3.6 3.5.9 5-4.5-2.4-4.5 2.4.9-5L4.8 8.3l5-.7z"/></svg>' +
          '<span>道具</span><b>' + (ownedShopItems().length + plotItemsOf(conv).length) + '</b></button>' +
        '</div>') +
        '</div>' +
        '<button class="send-btn" id="btnSend"' + (quotaOut ? ' disabled' : '') + '>发送</button></div>' +
        '<div class="composer-hint">' +
        /* 额度只显示这一处。数字来自服务端（客户端那份是它的镜像），
           以前这里一个「今日额度剩余」、右边又跟一个「本站额度剩余」，两套计数会互相矛盾。
           ★ 手机屏幕窄：带 .hint-2 的都是次要说明，窄屏隐藏（见 style.css 的 ≤700px 段）。 */
        (spendQuota
          ? '<span>今日额度剩余 <b style="color:var(--accent-2)">' + left + '</b> / ' + daily + '</span>' +
            '<span class="quota-tag">本站模型</span>'
          : '') +
        (apiMode === 'own' ? '<span class="quota-tag ok">你自己的模型 · 不占额度</span>' : '') +
        (apiMode === 'none' ? '<span class="quota-tag warn">测试用离线引擎（仅 tools/ 下的冒烟测试）</span>' : '') +
        '<span>·</span><span>积分 <b style="color:var(--accent-2)">' + (RP.store.get().score || 0) + '</b></span>' +
        (RP.api.serverReady()
          ? '<span class="hint-2">·</span><span class="hint-2">模型：<b style="color:var(--accent-2)">' + RP.util.esc(RP.api.serverInfo().model) + '</b></span>'
          : '') +
        '<span class="hint-2">·</span><span class="hint-2">惩戒只认下划线行为台词</span>' +
        '<span class="hint-2">·</span><span class="hint-2">口述使用道具不算，要点右上角「道具」引用</span></div>';
      /* 本站额度用尽：输入框照常存在，但给出明确的替代路径（自己的模型 / 明天再来） */
      if (quotaOut) {
        const lock = document.createElement('div');
        lock.className = 'locked-panel quota';
        lock.innerHTML = '<h4>今日额度已用完</h4>' +
          '<p>本站模型每天给每位访客 <b>' + RP.store.get().user.quota.daily + '</b> 次对话，今天已经用完了，明天 0 点自动重置。' +
          '想现在继续，就把你自己的模型接上 —— 用你自己的 Key，不占站内额度；本机的 Ollama / LM Studio 也可以一键扫描。</p>' +
          '<div class="row"><button class="btn primary" id="btnQuotaModel">去配置我自己的模型</button>' +
          '<button class="btn" id="btnQuotaScan">扫描本机模型</button>' +
          '<button class="btn" data-goto="resources">换一个本子</button></div>';
        box.insertBefore(lock, box.firstChild);
      }
    }
    bindComposer(conv, resource);
  }

  function bindComposer(conv, resource) {
    const box = document.getElementById('composer');
    const input = box.querySelector('#chatInput');
    const send = box.querySelector('#btnSend');
    const d = draftOf(conv);                             // 草稿对象（每场会话一份）
    if (input) {
      input.value = d.text || '';                        // 还原草稿：切会话 / 重绘都不丢字
      input.style.height = 'auto';
      if (input.value) input.style.height = Math.min(input.scrollHeight, 150) + 'px';
      input.addEventListener('input', function () {
        d.text = input.value;                            // 每次输入都存进草稿
        persistDrafts();
        input.style.height = 'auto';
        input.style.height = Math.min(input.scrollHeight, 150) + 'px';
      });
      input.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(); }
      });
      setTimeout(function () { input.focus(); }, 30);
    }
    if (send) send.addEventListener('click', submit);
    box.querySelectorAll('[data-hint]').forEach(function (b) {
      b.addEventListener('click', function () {
        input.value = b.dataset.hint;
        input.dispatchEvent(new Event('input'));
        input.focus();
      });
    });
    /* 取消引用道具 */
    box.querySelectorAll('[data-detach]').forEach(function (b) {
      b.addEventListener('click', function () {
        const d = draftOf(conv);
        const it = d.items[Number(b.dataset.detach)];
        if (it) detachItem(conv, it.id, it.plot);
        renderComposer();
      });
    });
    /* 道具选择器 */
    const btnItems = box.querySelector('#btnItems');
    if (btnItems) btnItems.addEventListener('click', function () {
      const shop = ownedShopItems();
      const plot = plotItemsOf(conv);
      const inv = RP.store.get().inventory || {};
      const rows = [];
      if (shop.length) {
        rows.push({ html: '<div class="popover-title">商店道具 · 使用后消耗</div>' });
        shop.forEach(function (i) {
          rows.push({ html: '<button class="popover-item" data-pick="' + i.id + '" data-plot="0">' +
            '<span class="sw item-ico">' + RP.util.esc(i.icon || '◈') + '</span>' +
            '<span><span class="t">' + RP.util.esc(i.name) + ' <em class="cnt">×' + (inv[i.id] || 0) + '</em></span>' +
            '<span class="d">' + RP.util.esc(i.desc || '') + '</span></span></button>' });
        });
      }
      if (plot.length) {
        rows.push({ html: '<div class="popover-title">剧情道具 · 不消耗，可反复引用</div>' });
        plot.forEach(function (p, idx) {
          rows.push({ html: '<button class="popover-item" data-pick="' + idx + '" data-plot="1">' +
            '<span class="sw item-ico plot">◈</span>' +
            '<span><span class="t">' + RP.util.esc(p.name) + '</span>' +
            '<span class="d">' + RP.util.esc(p.desc || (p.from ? '来自 ' + p.from : '剧情道具')) + '</span></span></button>' });
        });
      }
      if (!rows.length) {
        rows.push({ html: '<div class="popover-title">还没有道具</div>' });
        rows.push({ html: '<div class="popover-empty">去「我的 → 积分商店」用积分换几件，或等角色在剧情里给你。</div>' });
      }
      const r = btnItems.getBoundingClientRect();
      RP.app.popover(r.right - 300, r.top - Math.min(rows.length * 46, 320), rows, function (el) {
        if (!el.dataset || el.dataset.pick === undefined) return;
        el.addEventListener('click', function () {
          const isPlot = el.dataset.plot === '1';
          const item = isPlot
            ? plot[Number(el.dataset.pick)]
            : (function () {
                const def = RP.store.itemDef(el.dataset.pick);
                return def ? { id: def.id, name: def.name, icon: def.icon, kind: def.kind, plot: false } : null;
              })();
          if (item) {
            if (isPlot) item.plot = true;
            attachItem(conv, Object.assign({}, item, { plot: isPlot }));
          }
          RP.app.closePopover();
          renderComposer();
        });
      });
    });
    const r2 = box.querySelector('#btnRestart2');
    if (r2) r2.addEventListener('click', function () { confirmRestart(conv); });
    /* 没模型 / 额度用尽时的两条路：去「我的」配置 / 直接扫本机 */
    function gotoModelPanel(scan) {
      const st = RP.store.get();
      st.ui.openAcc.sys = true;
      RP.store.save();
      RP.app.setView('profile');
      if (scan) {
        setTimeout(function () {
          const b = document.getElementById('apiScan');
          if (b) b.click();
        }, 260);
      } else {
        RP.app.toast('在「模型与安全」里：选供应商 → 填 Key → 测试连接 → 保存并启用', 'ok');
      }
    }
    ['#btnGoModel', '#btnQuotaModel'].forEach(function (sel) {
      const b = box.querySelector(sel);
      if (b) b.addEventListener('click', function () { gotoModelPanel(false); });
    });
    ['#btnScanModel', '#btnQuotaScan'].forEach(function (sel) {
      const b = box.querySelector(sel);
      if (b) b.addEventListener('click', function () { gotoModelPanel(true); });
    });
    const silent = box.querySelector('#btnSilent');
    if (silent) silent.addEventListener('click', function () { silentTurn(conv, resource); });
    const asst = box.querySelector('#btnAssistant');
    if (asst) asst.addEventListener('click', function () {
      RP.store.get().activeConv = 'conv-assistant';
      RP.store.save(); render();
    });
    box.querySelectorAll('[data-goto]').forEach(function (b) {
      b.addEventListener('click', function () { RP.app.setView(b.dataset.goto); });
    });

    function submit() {
      const text = (input.value || '').trim();
      const d = draftOf(conv);
      if (!text && !d.items.length) return;
      input.value = '';
      input.style.height = 'auto';
      d.text = '';                                     // 发出后清掉草稿
      sendMessage(conv, resource, text);
    }
  }

  /* 重新开始：头部与禁言面板共用 */
  function confirmRestart(conv) {
    RP.app.modal({
      title: '重新开始本场',
      body: '状态值、心境、推进度与警告记录都会重置，剧情从头再来（历史消息会被清空，仅保留剧情提醒）。',
      ok: '重新开始', cancel: '取消',
      onOk: function () {
        restart(conv);
        drafts[conv.id] = { items: [], text: '' };
        render();
        RP.app.toast('本场已重置 · 剧情提醒已重新送达', 'ok');
      }
    });
  }

  /* 全屏按钮的文字跟着状态走（真正的状态刷新统一在 RP.app.paintFocus 里做） */
  function paintFocusBtn() {
    if (RP.app && RP.app.paintFocus) { RP.app.paintFocus(); return; }
    const b = document.getElementById('btnFocus');
    if (!b) return;
    const on = document.body.dataset.focus === '1';
    b.textContent = on ? '退出全屏' : '全屏';
    b.classList.toggle('primary', on);
  }

  function bindHead(conv, resource) {
    const view = document.getElementById('view-chat');
    const btnRestart = view.querySelector('#btnRestart');
    if (btnRestart) btnRestart.addEventListener('click', function () { confirmRestart(conv); });
    const btnFocus = view.querySelector('#btnFocus');
    if (btnFocus) btnFocus.addEventListener('click', function () { RP.app.toggleFocus(); });
    const btnDel = view.querySelector('#btnDel');
    if (btnDel) btnDel.addEventListener('click', function () {
      RP.app.modal({
        title: '删除会话',
        body: '「' + conv.title + '」的全部记录会从本机移除，无法恢复。确定删除吗？',
        ok: '删除', cancel: '取消', danger: true,
        onOk: function () { remove(conv); render(); RP.app.toast('会话已删除', 'ok'); }
      });
    });
  }

  /* ------------------------------ 发送与演绎 ------------------------------ */
  function pushMsg(conv, msg) {
    const m = Object.assign({ id: RP.util.uid('m'), ts: Date.now(), meta: {} }, msg);
    conv.messages.push(m);
    conv.updatedAt = Date.now();
    /* 服务端统计：这个本子被进入过几次（拿不到就算了，绝不影响体验） */
    if (msg && msg.role === 'reminder' && conv.resourceId) {
      try {
        fetch('/api/play', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ resourceId: conv.resourceId })
        }).catch(function () { });
      } catch (e) { }
    }
    return m;                       // 返回真正存进列表的对象（流式占位要用它改文本）
  }

  function showTyping(on, secs, flowing) {
    const box = document.getElementById('messages');
    if (!box) return;
    if (on === false || flowing) { hideTyping(); if (flowing) return; }
    const conv = RP.store.active();
    const resource = conv && conv.resourceId ? RP.resources.byId(conv.resourceId) : null;
    const name = conv && conv.kind === 'assistant'
      ? (RP.settings.get().assistant.name || '会话助手')
      : (resource ? resource.character.name : '角色');
    const slow = typeof secs === 'number' && secs >= 6;
    let el = document.getElementById('typingRow');
    if (!el) {
      el = document.createElement('div');
      el.className = 'msg-row ai';
      el.id = 'typingRow';
      el.innerHTML = '<div class="msg-av" style="background:linear-gradient(145deg,#2b3550,#4d8dff)">' + RP.util.esc(name.slice(0, 1)) + '</div>' +
        '<div class="msg-body"><div class="msg-name">' + RP.util.esc(name) +
          '<span class="msg-time" id="typingSecs"></span></div>' +
        '<div class="bubble typing"><i></i><i></i><i></i>' +
          '<span class="typing-note" id="typingNote"></span>' +
        '</div></div>';
      box.appendChild(el);
      stickBottom(box);
    }
    /* 每秒只改这两行文字，绝不重建整块（重建会打断滚动与选中） */
    const secEl = document.getElementById('typingSecs');
    const noteEl = document.getElementById('typingNote');
    if (secEl) secEl.textContent = slow ? ' · 正在推理 ' + secs + 's' : '';
    if (noteEl) noteEl.textContent = slow
      ? '正在本机推理（这台电脑的 CPU，未用显卡）：一轮通常 5-15 秒，换新本子后的第一轮久一些。想更快就到「我的 → 模型与安全」把接口换成云端大模型（一般 2-5 秒）。可以往上翻看历史。'
      : '';
  }
  function hideTyping() {
    const el = document.getElementById('typingRow');
    if (el) el.remove();
  }
  const wait = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };

  function afterTurn(conv) {
    typing = false;
    hideTyping();
    if (conv && conv.forceAnswer) conv.forceAnswer = false;   // 反制道具只强制一轮
    RP.store.save();
    renderMessages();
    renderStats();
    renderComposer();
    renderSidebar();
    RP.app.paintQuota();
    RP.app.paintNavDot();
  }

  /* 模型调用失败后的「重试这一轮」：不重复发玩家消息，也不重复扣额度 */
  async function retryLast() {
    const conv = RP.store.active();
    const resource = conv && conv.resourceId ? RP.resources.byId(conv.resourceId) : null;
    if (!conv || !resource || typing) return;
    let idx = -1;
    conv.messages.forEach(function (m, i) { if (m.meta && m.meta.retry) idx = i; });
    if (idx === -1) return;
    const text = conv.messages[idx].meta.retry;
    conv.messages.splice(idx, 1);
    RP.store.save();
    renderMessages();
    typing = true;
    showTyping();
    try {
      await respond(conv, resource, text, {});
    } catch (err) {
      pushMsg(conv, { role: 'notice', text: '重试失败：' + (err && err.message ? err.message : err), meta: { tone: 'danger' } });
    }
    afterTurn(conv);
  }

  async function sendMessage(conv, resource, text, opts) {
    opts = opts || {};
    if (typing) return;
    if (conv.muted || conv.paused || conv.left) return;    const d = draftOf(conv);
    const items = (opts.silent || conv.kind === 'assistant') ? [] : d.items.slice();
    if (!text && !items.length && !opts.silent) return;   // 沉默回合允许空文本
    /* 每日额度只针对「用本站模型」的访客：自带模型不占额度；会话助手走模型时同样计数 */
    const spendQuota = RP.api.mode() === 'server';
    if (!opts.silent && spendQuota && RP.store.quotaLeft() <= 0) {
      RP.app.toast('今日额度已用完，明日 0 点自动重置；也可以到「我的 → 模型与安全」换成自己的模型（不占额度）', 'warn');
      renderComposer();
      return;
    }
    typing = true;
    const itemEvents = [];
    /* 送给 AI 的文本才带道具标记：玩家口述不算数，只有这里引用过的道具才存在 */
    const marker = items.length ? '【使用道具：' + items.map(function (i) { return i.name; }).join('、') + '】' : '';
    const aiText = [text, marker].filter(Boolean).join('\n');
    if (opts.silent) {
      pushMsg(conv, { role: 'beat', text: '（你选择了沉默，没有说话。）', meta: { silent: true } });
    } else {
      pushMsg(conv, {
        role: 'user',
        text: text || ('（你什么也没说，只把' + items[0].name + '放在了他面前。）'),
        items: items,
        meta: {}
      });
      if (spendQuota) RP.store.spendQuota(1);
      /* 道具是真的被引用了才生效；口述不算 */
      items.forEach(function (it) {
        if (applyItemEffect(conv, resource, it, itemEvents)) {
          if (!it.plot) RP.store.consumeItem(it.id);
        }
      });
      d.items = [];
      d.text = '';
      persistDrafts();
    }
    itemEvents.forEach(function (e) { pushMsg(conv, e); });
    renderMessages(true);        // 玩家刚发话：一定跟到底
    renderComposer();
    renderSidebar();
    showTyping();

    try {
      if (conv.kind === 'assistant') {
        await wait(320);
        pushMsg(conv, await assistantTurn(text));
      } else {
        await respond(conv, resource, aiText, Object.assign({ items: items, displayText: text }, opts));
      }
    } catch (err) {
      pushMsg(conv, { role: 'notice', text: '演绎出错：' + (err && err.message ? err.message : err), meta: { tone: 'danger' } });
    }
    afterTurn(conv);
  }

  /* 会话助手：有模型就让模型答（把 FAQ 当参考材料一起给它），没有模型才用 FAQ 固定回答 */
  async function assistantTurn(text) {
    const a = RP.settings.get().assistant || {};
    if (hasModel()) {
      try {
        const r = await RP.api.completeAssistant(text);
        if (r && r.text && r.text.trim()) return { role: 'ai', text: r.text.trim(), meta: { online: true } };
      } catch (err) {
        return {
          role: 'ai',
          text: '（助手暂时接不上模型：' + (err && err.message ? err.message : err) + '）\n' +
            '我先按固定说明回答你：' + RP.engine.assistantReply(text),
          meta: { safety: false, fallback: true }
        };
      }
    }
    /* 固定台词：站点说明类问答，不参与剧情扮演，不需要模型 */
    return { role: 'ai', text: RP.engine.assistantReply(text), meta: { canned: true } };
  }

  function silentTurn(conv, resource) {
    if (conv.actMute > 0) conv.actMute -= 1;
    RP.store.save();
    renderComposer();          // 立刻反映剩余回合
    sendMessage(conv, resource, '', { silent: true });
  }

  async function respond(conv, resource, text, opts) {
    opts = opts || {};
    const scan = opts.silent ? { level: 'ok' } : RP.safety.scan(text);

    /* 安全路径：关怀 / 严重违规 —— 出戏警告并暂停，不扣状态值（固定台词，不需要模型） */
    if (scan.level === 'care' || scan.level === 'severe') {
      pushMsg(conv, { role: 'notice', text: '安全机制已介入 · ' + scan.label, meta: { tone: 'danger' } });
      pushMsg(conv, { role: 'ai', text: scan.level === 'care' ? RP.safety.CARE_TEXT : RP.safety.severeText(scan.label), meta: { safety: true } });
      conv.paused = true;
      conv.updatedAt = Date.now();
      return;
    }

    /* 没有模型：不给开口，也绝不退回脚本写台词 —— 只留一条固定提示 */
    if (!hasModel() && !RP.engine.offlineDialogue()) {
      pushMsg(conv, {
        role: 'notice',
        text: '本场需要模型才能继续：当前没有可用模型，这一轮没有生成任何角色台词。' +
          '到「我的 → 模型与安全」接上模型（填自己的 Key，或扫描本机 Ollama / LM Studio）后本场就能继续。',
        meta: { tone: 'danger' }
      });
      return;
    }

    /* 模型主导：失败时只报错并给「重试这一轮」，不再用模板凑一段假的角色回复 */
    if (hasModel()) {
      const t0 = Date.now();
      /* ① 流式：先把空气泡放上去，模型算出一段就填一段 —— CPU 推理几十秒也不会像卡死 */
      try {
        const holder = pushMsg(conv, { role: 'ai', text: '', meta: { online: true, streaming: true } });
        renderMessages(true);        // 玩家刚发完话：这一下一定跟到底
        showTyping(true);
        const tick = setInterval(function () { showTyping(true, Math.round((Date.now() - t0) / 1000)); }, 1000);
        let r = null;
        try {
          r = await RP.api.completeStream(conv, resource, text, opts, function (partial) {
            holder.text = partial;
            paintStreaming(holder);
            showTyping(true, Math.round((Date.now() - t0) / 1000), true);
          });
        } finally { clearInterval(tick); }
        if (r) {
          /* 流式走通了：把占位消息换成最终文本，再照常结算（不再重复 push） */
          holder.text = r.text;
          holder.meta = { online: true, ms: Date.now() - t0, via: r.via };
          applyOnline(conv, resource, r, opts, holder);
          return;
        }
        /* 服务端不支持流式（或直连模式）→ 撤掉占位消息，走下面的一次性请求 */
        conv.messages = conv.messages.filter(function (m) { return m.id !== holder.id; });
        renderMessages();
      } catch (err) {
        /* 流式过程中出错：把占位消息改成错误说明，仍给「重试这一轮」 */
        const last = conv.messages[conv.messages.length - 1];
        const isHolder = last && last.meta && last.meta.streaming;
        const msg = {
          role: 'notice',
          text: '模型调用失败：' + (err && err.message ? err.message : err) +
            ' —— 这一轮没有生成回复（不会用脚本顶替），修好后可以重试这一轮。',
          meta: { tone: 'danger', retry: text }
        };
        if (isHolder) { conv.messages.pop(); }
        pushMsg(conv, msg);
        return;
      }
      try {
        const r = await RP.api.complete(conv, resource, text, opts);
        r.ms = Date.now() - t0;
        applyOnline(conv, resource, r, opts);
        return;
      } catch (err) {
        pushMsg(conv, {
          role: 'notice',
          text: '模型调用失败：' + (err && err.message ? err.message : err) +
            ' —— 这一轮没有生成回复（不会用脚本顶替），修好后可以重试这一轮。',
          meta: { tone: 'danger', retry: text }
        });
        return;
      }
    }

    /* 只有 tools/ 下的冒烟测试打开离线开关时才会走到这里（线上不可达） */
    await wait(430 + Math.random() * 520);
    const result = RP.engine.process(conv, resource, text, opts);
    const items = (opts && opts.items) || [];
    const counter = items.filter(function (i) { return !i.plot && (RP.store.itemDef(i.id) || {}).effect && RP.store.itemDef(i.id).effect.counter; });

    /* 反制道具先落地反噬，再让角色回答 */
    counter.forEach(function () {
      const b = counterBacklash(conv, resource);
      result.events.unshift({ role: 'ai', text: b.text, meta: { backlash: true } });
      RP.engine.applyState(conv, { hpDelta: b.hp, affinity: b.aff, flag: 'none' });
      result.events.push({
        role: 'notice',
        text: b.angry ? '反噬 · 角色暴怒（好感 ' + b.aff + '，状态值 ' + b.hp + '），但你逼出了一个答案'
          : '角色屈服了 · 好感 ' + b.aff,
        meta: { tone: b.angry ? 'danger' : 'warn' }
      });
    });
    /* 角色必须对真正被引用的道具作出反应 */
    if (items.length) {
      const fb = RP.engine.itemFeedback(resource, conv, items);
      const firstAi = result.events.filter(function (e) { return e.role === 'ai' && !e.meta.backlash; })[0];
      if (fb && firstAi) firstAi.text = fb + '\n' + firstAi.text;
    }
    /* 角色离去的收尾：本场结束，不再推进 */
    if (result.state && result.state.left) {
      result.events.forEach(function (e) { pushMsg(conv, e); });
      return;
    }
    result.events.forEach(function (e) { pushMsg(conv, e); });
  }

  /* 流式增量：只改这一条气泡的文字，不整块重绘（CPU 也在省） */
  function paintStreaming(holder) {
    const box = document.getElementById('messages');
    if (!box) return;
    let row = box.querySelector('.msg-row.stream-row');
    if (!row) {
      const rows = box.querySelectorAll('.msg-row.ai');
      row = rows[rows.length - 1];
    }
    if (!row) return;
    const bubble = row.querySelector('.bubble');
    if (!bubble) return;
    bubble.classList.add('streaming');
    bubble.innerHTML = RP.acts.render(RP.util.esc(holder.text)) + '<span class="caret"></span>';
    /* 老规矩：用户没往上翻才跟到底，翻了就别拽他 */
    stickBottom(box);
  }

  /* 剧情节点卡（resource.beats）的触发时机。
     以前只按轮次：at=5/10/15/20/25 卡死了节奏。但推进度是模型逐轮按「玩家这句话的实际作用」
     判出来的 —— 会玩的人 8 轮就推到 60%，那张 key 卡（at=25）永远等不到；反过来磨蹭的玩家
     到点也会被硬塞节点。现在改成「谁先到谁触发」，每张卡只放一次：
       · 推进度跨过阈值（把 at 等比映射到 85%，最后一档刚好落在通关阈值 95% 之前）
       · 或者回合数到点（模型没给推进度时的兜底，保证不会卡住） */
  const BEAT_SCALE = 85;
  function beatThreshold(beat, beats) {
    const maxAt = beats.reduce(function (m, b) { return Math.max(m, Number(b.at) || 0); }, 0) || 1;
    return Math.round((Number(beat && beat.at) || 0) / maxAt * BEAT_SCALE);
  }
  function takeDueBeat(conv, resource, progress, byTurn) {
    const beats = (resource && resource.beats) || [];
    if (!beats.length) return null;
    conv.beatsShown = conv.beatsShown || [];
    for (let i = 0; i < beats.length; i++) {
      if (conv.beatsShown.indexOf(i) > -1) continue;
      const at = Number(beats[i].at) || 0;
      const hit = byTurn ? (conv.turn >= at) : (progress >= beatThreshold(beats[i], beats));
      if (hit) { conv.beatsShown.push(i); return beats[i]; }
    }
    return null;
  }

  /* 在线回复：行为台词是唯一裁决凭证。
     holder 存在时表示这条 AI 消息已经在列表里（流式占位），不再重复 push。 */
  function applyOnline(conv, resource, r, opts, holder) {
    opts = opts || {};
    conv.turn += 1;
    const beforeProg = conv.progress || 0;
    /* 回合到点的兜底卡：放在角色回复之前，读起来像「场景先变，角色再开口」 */
    const beatByTurn = takeDueBeat(conv, resource, beforeProg, true);
    if (beatByTurn) pushMsg(conv, { role: 'beat', text: beatByTurn.text, meta: { beat: true, key: !!beatByTurn.key } });
    /* stateRaw：模型这一轮原文里的状态行。必须存下来 —— 下一轮它要作为「历史格式」回到提示词里，
       否则模型看到的历史是「角色回复不带状态行」，它会照着模仿，状态行从此再也不出现。
       实测见 tools/check-zhipu-state.js 与 api.js 里 toHistory 的注释。 */
    if (holder) { holder.text = r.text; holder.stateRaw = r.stateRaw || ''; holder.meta = Object.assign({ online: true }, holder.meta, r.ms ? { ms: r.ms } : {}); }
    else pushMsg(conv, { role: 'ai', text: r.text, stateRaw: r.stateRaw || '', meta: Object.assign({ online: true }, r.ms ? { ms: r.ms } : {}) });

    const parsed = RP.acts.parse(r.text);
    const v = RP.acts.verdict(parsed.acts, r.state || {});

    /* 公平性兜底一：扣血必须建立在玩家真的越界之上。
       小模型（3B/7B 都实测过）偶尔把普通提问也判成「警告 -2」，这里直接作废这次扣血。 */
    const playerText = opts.silent ? '' : String(opts.displayText || '');
    const crossed = RP.acts.crossedLine(playerText, resource);
    const actList = parsed.acts || [];
    const hardPunish = actList.some(function (a) {
      return a.effect === 'punish' || a.effect === 'execute' || a.effect === 'instant';
    });
    if (!crossed && !v.instant && (v.hp < 0 || hardPunish)) {
      pushMsg(conv, {
        role: 'notice',
        text: '扣血判定作废：你这句话没有越界（模型误判），状态值不变。行为台词只能用在真正越界之后。',
        meta: { tone: 'warn' }
      });
      v.hp = 0;
      if (v.affinity < 0) v.affinity = 0;      // 好感可以因为语气略降，但不因此扣血
    } else if (!crossed && v.affinity < -2) {
      /* 没越界的一轮，心境最多掉 2 分：模型不能靠一句「警告」把关系砸到底 */
      v.affinity = -2;
    }
    /* 公平性兜底三：没越界就不许倒扣剧情推进度（实测模型会给正常提问打 progress:-4） */
    if (!crossed && v.progress < 0) v.progress = 0;

    /* 公平性兜底二：即死 / 处刑 / 离去这类「不可逆」结果，必须由「真的越界」触发。
       小模型偶尔会把普通提问也判成违规，这里把最坏的结果降级成可挽回的惩戒。 */
    if (!crossed && (v.instant || v.execute || v.leave)) {
      const cap = ((RP.settings.get().combat || {}).dmg || {}).heavy || 8;
      if (v.hp < 0) v.hp = Math.max(v.hp, -cap);
      v.instant = false; v.execute = false; v.leave = false;
      if (v.mute) { v.mute = 1; }
      if (v.flag === 'mute') v.flag = 'none';
      pushMsg(conv, {
        role: 'notice',
        text: '判定降级：玩家这句话没有越界，所以即死 / 处刑 / 离去不生效（最多按严重档扣 ' + cap + '）。' +
          '行为台词可以用，但不能拿它来「一句话定生死」。',
        meta: { tone: 'warn' }
      });
    }

    if (r.blocked) {
      pushMsg(conv, { role: 'notice', text: '已拦截 AI 输出中的违规内容（' + r.blocked + '），并记录本次异常', meta: { tone: 'danger' } });
    }
    if (v.voided) {
      pushMsg(conv, { role: 'notice', text: '本条回复没有使用行为台词，扣血判定已作废', meta: { tone: 'warn' } });
    }
    /* 只允许「安全层」暂停对话：小模型会随手写 flag:"pause" 把玩家锁在门外（实测出现过）。
       玩家这句话没触发安全机制时，这个暂停请求一律忽略。 */
    if (v.flag === 'pause') {
      const lv = opts.silent ? 'ok' : RP.safety.scan(String(opts.displayText || '')).level;
      if (lv !== 'care' && lv !== 'severe') {
        v.flag = 'none';
        pushMsg(conv, { role: 'notice', text: '模型请求暂停本场，但你这句没有触发安全机制，已忽略（只有安全层能暂停对话）', meta: { tone: 'warn' } });
      }
    }

    const state = RP.engine.applyState(conv, {
      hpDelta: v.hp, affinity: v.affinity, flag: v.flag, reason: v.reason
    });
    if (v.mute && state.hpDelta >= 0) conv.actMute = Math.max(conv.actMute || 0, v.mute);
    if (v.resist && conv.shield) {
      conv.shield = false;
      pushMsg(conv, { role: 'notice', text: '角色抵御了你的道具 · 免罚金牌已失效', meta: { tone: 'danger' } });
    }
    if (v.acts.length) {
      /* 行为台词必须给出原因：模型写在括号里就用它的；没写就由系统补一条 ——
         玩家必须知道「为什么被罚」，这比动效重要得多。 */
      const scanLv = opts.silent ? 'ok' : RP.safety.scan(playerText).level;
      const why = (RP.acts.topAct(v.acts) || {}).reason ||
        (scanLv === 'hostile' ? '你这句话构成了辱骂或攻击'
          : scanLv === 'ooc' ? '你在要求脱离扮演'
            : scanLv === 'breach' ? '你破坏了本场设定'
              : crossed ? '你踩到了本场明写的越界线（本子行为规则里列出的那条）' : '');
      pushMsg(conv, {
        role: 'notice',
        text: '行为台词 · ' + v.acts.map(function (a) { return RP.acts.chipText(a); }).join(' / ') +
          (why ? '　·　原因：' + why : ''),
        meta: { tone: v.hp < 0 || v.instant ? 'hp' : 'warn' }
      });
      /* 制裁落地 → 整个对话面板来一次冲击（越重越狠） */
      actImpact((RP.acts.topAct(v.acts) || {}).effect);
    }
    if (state.shielded) {
      pushMsg(conv, { role: 'notice', text: '免罚金牌生效 · 本次判定未扣除状态值', meta: { tone: 'gain' } });
    }
    if (v.mute && conv.actMute) {
      pushMsg(conv, { role: 'notice', text: '你被封口 ' + conv.actMute + ' 个回合', meta: { tone: 'danger' } });
    }
    /* 剧情推进度与积分里程碑 */
    if (v.progress) {
      const evs = [];
      achievement(conv, resource, v.progress, evs, beforeProg);
      evs.forEach(function (e) { pushMsg(conv, e); });
    }
    /* 推进度驱动的「提前触发」：模型判定玩家这句话真的把剧情往前推了，节点卡就不再等回合数。
       必须放在 achievement() 之后 —— 推进度是在那里才落进 conv 的。
       它排在角色回复与结算提示之后：场景变化是这句台词的后果，读起来顺。 */
    const beatByProg = takeDueBeat(conv, resource, conv.progress || 0, false);
    if (beatByProg) {
      pushMsg(conv, { role: 'beat', text: beatByProg.text, meta: { beat: true, key: !!beatByProg.key, early: true } });
    }
    /* 角色给出的剧情帮助 / 处置 */
    if (v.aid) {
      const evs = [];
      RP.engine.applyAid(conv, resource, v.aid, evs);
      evs.forEach(function (e) { pushMsg(conv, e); });
    }
    /* 反制道具的反噬 */
    ((opts.items) || []).forEach(function (it) {
      const def = it.plot ? null : RP.store.itemDef(it.id);
      if (!def || !def.effect || !def.effect.counter) return;
      const b = counterBacklash(conv, resource);
      pushMsg(conv, { role: 'ai', text: b.text, meta: { backlash: true } });
      RP.engine.applyState(conv, { hpDelta: b.hp, affinity: b.aff, flag: 'none' });
      pushMsg(conv, { role: 'notice', text: b.angry ? '反噬 · 角色暴怒（好感 ' + b.aff + '，状态值 ' + b.hp + '）' : '角色屈服了 · 好感 ' + b.aff, meta: { tone: b.angry ? 'danger' : 'warn' } });
    });
    /* 角色愤然离去：本场直接终结 */
    if (v.leave) {
      pushMsg(conv, RP.engine.leaveAction(conv, resource));
      return;
    }
    if (conv.hp <= 0 && !conv.muted) conv.muted = true;
    if (conv.muted) pushMsg(conv, RP.engine.execution(conv, resource));
    if (conv.paused && v.flag !== 'mute') {
      pushMsg(conv, { role: 'notice', text: '会话已被安全机制暂停', meta: { tone: 'danger' } });
    }
  }

  /* 推进度 + 积分里程碑（在线与离线共用；before 用于判断是否跨档） */
  function achievement(conv, resource, delta, events, before) {
    before = typeof before === 'number' ? before : (conv.progress || 0);
    conv.progress = RP.util.clamp(before + delta, 0, 100);
    const cfg = RP.settings.get().score || {};
    const diff = resource.difficulty || cfg.defaultDifficulty || 2;
    const mult = ((cfg.difficulty || {})[String(diff)] || {}).mult || 1;
    const claim = RP.store.claim(resource.id, diff);
    if (cfg.enabled !== false) {
      (cfg.milestones || []).forEach(function (m, i) {
        if (conv.progress >= m && (claim.milestones || []).indexOf(m) === -1) {
          claim.milestones = (claim.milestones || []).concat([m]);
          const gain = Math.round(((cfg.milestoneReward || [])[i] || 20) * mult);
          RP.store.addScore(gain);
          events.push({ role: 'notice', text: '剧情推进度 ' + m + '% · 积分 +' + gain + '（当前 ' + RP.store.get().score + '）', meta: { tone: 'gain' } });
        }
      });
      if (conv.progress >= (cfg.winAt || 95) && !claim.win) {
        claim.win = true;
        const gain = Math.round((cfg.winReward || 200) * mult);
        RP.store.addScore(gain);
        conv.completed = true;
        events.push({
          role: 'victory',
          text: '你问出了这一场最要紧的东西。',
          meta: {
            title: '通 关',
            sub: '剧情完成度 ' + conv.progress + '% · 最终积分奖励 +' + gain,
            foot: '本资源在「' + (((cfg.difficulty || {})[String(diff)] || {}).name || '标准') + '」难度下的积分奖励已领取，重玩不再重复发放。'
          }
        });
      }
    }
    if (delta < 0 && before >= 25) {
      events.push({ role: 'notice', text: '剧情推进度 ' + delta + '（这句话把话头带偏了）', meta: { tone: 'warn' } });
    } else if (Math.floor(conv.progress / 25) > Math.floor(before / 25) && conv.progress < (cfg.winAt || 95)) {
      events.push({ role: 'notice', text: '剧情完成度 ' + conv.progress + '%', meta: { tone: 'gain' } });
    }
    RP.store.save();
  }

  /* 道具调用入口（由「我的」触发） */
  function heal(amount) {
    const conv = RP.store.active();
    if (!conv || conv.kind !== 'roleplay') return false;
    const before = conv.hp;
    conv.hp = RP.util.clamp(conv.hp + amount, 0, conv.maxHp);
    if (conv.hp > 0) conv.muted = false;
    pushMsg(conv, { role: 'notice', text: '道具生效 · 状态值 +' + (conv.hp - before) + '，破碎痕迹合拢了一些', meta: { tone: 'gain' } });
    RP.store.save();
    return true;
  }
  function warmth(amount) {
    const conv = RP.store.active();
    if (!conv || conv.kind !== 'roleplay') return false;
    const before = moodOf(conv.affinity).name;
    conv.affinity = RP.util.clamp(conv.affinity + amount, 0, 100);
    conv.warned = 0;
    pushMsg(conv, { role: 'notice', text: '道具生效 · 心境 ' + before + ' → ' + moodOf(conv.affinity).name + '，警告记录已清除', meta: { tone: 'gain' } });
    RP.store.save();
    return true;
  }
  function unseal() {
    const conv = RP.store.active();
    if (!conv || conv.kind !== 'roleplay') return false;
    restart(conv);
    return true;
  }
  function shield() {
    const conv = RP.store.active();
    if (!conv || conv.kind !== 'roleplay') return false;
    conv.shield = true;
    pushMsg(conv, { role: 'notice', text: '道具生效 · 免罚金牌已挂起，下一次惩戒判定免于扣血', meta: { tone: 'gain' } });
    RP.store.save();
    return true;
  }

  return {
    render: render, renderSidebar: renderSidebar, renderMessages: renderMessages,
    renderComposer: renderComposer, renderStats: renderStats, achievement: achievement,
    applyBackdrop: applyBackdrop,
    create: create, restart: restart, remove: remove, moodOf: moodOf, dmgTier: dmgTier,
    heal: heal, warmth: warmth, unseal: unseal, shield: shield,
    /* 供测试 harness 直接驱动一轮对话（界面上走输入框） */
    sendMessage: sendMessage, retryLast: retryLast, hasModel: hasModel, actImpact: actImpact
  };
})();
