/* ==========================================================================
   幻言 · 状态与工具
   RP.util   通用工具
   RP.catalog 主题 / 道具 / 常量
   RP.store  本地状态（localStorage 持久化 + 订阅）
   ========================================================================== */
window.RP = window.RP || {};

/* ------------------------------ 通用工具 ------------------------------ */
RP.util = (function () {
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function uid(p) {
    return (p || 'id') + '-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 7);
  }
  function clamp(n, a, b) { return Math.max(a, Math.min(b, n)); }
  function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
  function pad(n) { return n < 10 ? '0' + n : '' + n; }
  function dayKey(d) {
    d = d || new Date();
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }
  function clock(ts) {
    const d = new Date(ts);
    return pad(d.getHours()) + ':' + pad(d.getMinutes());
  }
  function timeAgo(ts) {
    if (!ts) return '—';
    const s = Math.floor((Date.now() - ts) / 1000);
    if (s < 60) return '刚刚';
    if (s < 3600) return Math.floor(s / 60) + ' 分钟前';
    if (s < 86400) return Math.floor(s / 3600) + ' 小时前';
    if (s < 86400 * 7) return Math.floor(s / 86400) + ' 天前';
    const d = new Date(ts);
    return (d.getMonth() + 1) + '月' + d.getDate() + '日';
  }
  function num(n) {
    if (n >= 10000) return (n / 10000).toFixed(1).replace(/\.0$/, '') + ' 万';
    return String(n);
  }
  /* 取用户输入中的关键词（用于本地演绎引擎的占位符替换）
     纯标点 / 纯表情返回空串，交给引擎走「接住沉默」分支，而不是把标点当关键词 */
  function keyword(text) {
    const t = String(text || '').replace(/[（）()「」“”"'，。！？、,.!?~…\s]/g, '');
    if (!t) return '';
    if (!/[\u4e00-\u9fa5a-zA-Z0-9]/.test(t)) return '';
    return t.length > 6 ? t.slice(0, 6) : t;
  }
  function trim(text, n) {
    const t = String(text || '').replace(/\s+/g, ' ').trim();
    return t.length > n ? t.slice(0, n) + '…' : t;
  }
  function download(name, text) {
    const blob = new Blob([text], { type: 'application/json;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  }
  return { esc, uid, clamp, pick, dayKey, clock, timeAgo, num, keyword, trim, download, pad };
})();

/* ------------------------------ 常量目录 ------------------------------ */
RP.catalog = {
  /* 主题：浅色在前（默认「纸感」），深色底色也刻意抬高，不再用近黑 */
  themes: [
    { id: 'paper', name: '纸感', mode: 'light', desc: '默认 · 暖白纸面，久看不累', sw: ['#f4f0e8', '#2f6fe0'] },
    { id: 'mist', name: '晨雾', mode: 'light', desc: '冷灰浅色 · 干净通透', sw: ['#eef2f7', '#2b6fd4'] },
    { id: 'night', name: '夜幕蓝', mode: 'dark', desc: '柔灰蓝 · 弱对比暗色', sw: ['#1b1e24', '#6f9dff'] },
    { id: 'ink', name: '墨玉', mode: 'dark', desc: '青墨绿 · 沉静暗色', sw: ['#1a201f', '#5fd8b4'] },
    { id: 'vermilion', name: '朱砂', mode: 'dark', desc: '暖褐赤金 · 古风暗色', sw: ['#241c1a', '#ff8a72'] },
    { id: 'neon', name: '霓虹', mode: 'dark', desc: '赛博夜色 · 高饱和', sw: ['#161b26', '#3fe0d8'] }
  ],
  defaultLight: 'paper',
  defaultDark: 'night',
  bubbles: [
    { id: 'soft', name: '圆润', desc: '默认气泡，柔和圆角' },
    { id: 'crisp', name: '利落', desc: '小圆角、字号紧凑' },
    { id: 'outline', name: '描边', desc: '透明底 + 亮边，适合古风' }
  ],
  frames: [
    { id: 'none', name: '无框', desc: '朴素底色' },
    { id: 'gold', name: '金环', desc: '暖金描边 + 外发光' },
    { id: 'mist', name: '紫雾', desc: '冷紫渐变 + 柔光' }
  ],
  props: [
    { id: 'hourglass', name: '回溯沙漏', icon: '⏳', desc: '恢复 8 点状态值', count: 2 },
    { id: 'incense', name: '定神香', icon: '🕯', desc: '好感 +8，并清除警告记录', count: 3 },
    { id: 'shield', name: '免罚金牌', icon: '🛡', desc: '挡下一次扣血判定', count: 1 },
    { id: 'token', name: '重启令牌', icon: '🎴', desc: '解除禁言与封口，并重置本场剧情', count: 1 }
  ],
  startScore: 100,        // 初始赠予的积分（用于体验商店）
  dailyQuota: 20
};

/* ------------------------------ 状态仓库 ------------------------------ */
RP.store = (function () {
  const KEY = 'rp_studio_v1';
  let mem = null;          // localStorage 不可用时的兜底
  let state = null;
  const subs = [];

  function dailyQuota() {
    const s = RP.settings ? RP.settings.get() : null;
    const n = s && s.site && Number(s.site.dailyQuota);
    return n > 0 ? n : RP.catalog.dailyQuota;
  }

  function assistantSeed() {
    const now = Date.now();
    const a = (RP.settings ? RP.settings.get().assistant : null) || {};
    const guide = a.guide || [];
    const welcome = a.welcome || '欢迎来到幻言。我是这里的会话助手，负责带路，不参与剧情扮演。';
    return {
      id: 'conv-assistant',
      kind: 'assistant',
      title: a.name || '会话助手',
      resourceId: null,
      pinned: true,
      hp: 100, maxHp: 100, affinity: 0, progress: 0, turn: 0,
      muted: false, paused: false, warned: 0, shield: false, actMute: 0,
      sceneId: null,
      createdAt: now, updatedAt: now,
      messages: [
        {
          id: RP.util.uid('m'), role: 'reminder', ts: now,
          text: (a.name || '会话助手') + ' · 使用说明',
          meta: {
            tag: 'GUIDE',
            items: guide,
            foot: a.guideFoot || ''
          }
        },
        { id: RP.util.uid('m'), role: 'ai', ts: now, text: welcome, meta: {} }
      ]
    };
  }

  function defaults() {
    return {
      v: 1,
      ui: {
        view: 'resources',
        search: '',
        filters: { genre: '全部', rating: '全部', length: '全部', sort: '可玩优先' },
        selected: null,
        openAcc: { quota: true, dress: false, props: false, mine: false, sys: false, type: false },
        font: { size: 'std', family: 'system' }
      },
      user: { name: '旅人', initial: '旅', quota: { daily: dailyQuota(), used: 0, day: RP.util.dayKey() } },
      theme: RP.catalog.defaultLight,
      lastTheme: { light: RP.catalog.defaultLight, dark: RP.catalog.defaultDark },
      bubble: 'soft',
      frame: 'none',
      /* 积分与道具：inventory = 商店道具（无关道具）；剧情道具存在会话里 */
      score: RP.catalog.startScore,
      inventory: RP.catalog.props.reduce(function (o, p) { o[p.id] = p.count; return o; }, {}),
      claims: {},                 // { '资源id@难度': { milestones:[25,50], win:true } }
      favorites: [],
      resState: {},
      convs: [assistantSeed()],
      activeConv: 'conv-assistant',
      api: { enabled: false, base: 'https://api.openai.com/v1', key: '', model: '', temp: 0.85, direct: false }
    };
  }

  function read() {
    try {
      const raw = localStorage.getItem(KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) { return mem; }
  }
  function write(obj) {
    mem = obj;
    try { localStorage.setItem(KEY, JSON.stringify(obj)); } catch (e) { /* 隐私模式等场景静默降级为内存态 */ }
  }
  function migrate(s) {
    const d = defaults();
    if (!s || typeof s !== 'object') return d;
    s.ui = Object.assign(d.ui, s.ui || {});
    s.ui.filters = Object.assign(d.ui.filters, (s.ui && s.ui.filters) || {});
    s.ui.openAcc = Object.assign(d.ui.openAcc, (s.ui && s.ui.openAcc) || {});
    s.ui.font = Object.assign(d.ui.font, (s.ui && s.ui.font) || {});
    s.user = Object.assign(d.user, s.user || {});
    s.user.quota = Object.assign(d.user.quota, (s.user && s.user.quota) || {});
    s.api = Object.assign(d.api, s.api || {});
    /* 旧版本道具字段迁移：props → inventory，并补齐积分与领取记录 */
    if (s.props && !s.inventory) s.inventory = s.props;
    delete s.props;
    s.inventory = Object.assign({}, RP.catalog.props.reduce(function (o, p) { o[p.id] = p.count; return o; }, {}), s.inventory || {});
    if (typeof s.score !== 'number') s.score = RP.catalog.startScore;
    if (!s.claims || typeof s.claims !== 'object') s.claims = {};
    ['theme', 'bubble', 'frame'].forEach(function (k) { if (!s[k]) s[k] = d[k]; });
    /* 旧版本主题 id 迁移：moon 已并入 night，未知主题回到默认浅色 */
    const ids = RP.catalog.themes.map(function (t) { return t.id; });
    if (ids.indexOf(s.theme) === -1) s.theme = s.theme === 'moon' ? 'night' : d.theme;
    s.lastTheme = Object.assign({}, d.lastTheme, s.lastTheme || {});
    const mode = (RP.catalog.themes.filter(function (t) { return t.id === s.theme; })[0] || {}).mode || 'light';
    s.lastTheme[mode] = s.theme;
    if (!Array.isArray(s.convs) || !s.convs.length) s.convs = d.convs;
    if (!s.convs.some(function (c) { return c.kind === 'assistant'; })) s.convs.unshift(assistantSeed());
    if (!s.activeConv || !s.convs.some(function (c) { return c.id === s.activeConv; })) s.activeConv = 'conv-assistant';
    if (!Array.isArray(s.favorites)) s.favorites = [];
    if (!s.resState || typeof s.resState !== 'object') s.resState = {};
    return s;
  }

  state = migrate(read());
  // 每日额度重置；daily 始终跟随当前站点设置（站长改成 20 之后，老访客也立刻生效）
  (function () {
    const today = RP.util.dayKey();
    if (state.user.quota.day !== today) { state.user.quota.day = today; state.user.quota.used = 0; }
    const want = dailyQuota();
    if (want > 0 && state.user.quota.daily !== want) {
      state.user.quota.daily = want;
      state.user.quota.used = Math.min(state.user.quota.used, want);
    }
  })();
  write(state);

  function emit() { subs.forEach(function (fn) { try { fn(state); } catch (e) { console.error(e); } }); }
  function save() { write(state); emit(); }

  return {
    get: function () { return state; },
    save: save,
    subscribe: function (fn) { subs.push(fn); },
    /* 简化读取 */
    conv: function (id) {
      if (!id) return null;
      return state.convs.filter(function (c) { return c.id === id; })[0] || null;
    },
    active: function () { return this.conv(state.activeConv); },
    /* 额度 */
    quotaLeft: function () { return Math.max(0, state.user.quota.daily - state.user.quota.used); },
    /* 站点设置里的额度下发后调用一次：让额度上限始终跟随后台配置 */
    syncQuota: function () {
      const want = dailyQuota();
      if (!(want > 0) || state.user.quota.daily === want) return false;
      state.user.quota.daily = want;
      state.user.quota.used = Math.min(state.user.quota.used || 0, want);
      save();
      return true;
    },
    spendQuota: function (n) {
      state.user.quota.used = RP.util.clamp(state.user.quota.used + (n || 1), 0, state.user.quota.daily);
      save();
    },
    /* 资源状态 */
    res: function (id) {
      if (!state.resState[id]) state.resState[id] = { plays: 0, lastPlayedAt: 0 };
      return state.resState[id];
    },
    /* ---------------- 积分 ---------------- */
    addScore: function (n) {
      state.score = Math.max(0, (state.score || 0) + Math.round(n));
      save();
      return state.score;
    },
    spendScore: function (n) {
      n = Math.round(n);
      if ((state.score || 0) < n) return false;
      state.score -= n;
      save();
      return true;
    },
    /* ---------------- 道具 ---------------- */
    itemDef: function (id) {
      const list = RP.settings.get().items || [];
      return list.filter(function (i) { return i.id === id; })[0] || null;
    },
    itemCount: function (id) { return state.inventory[id] || 0; },
    addItem: function (id, n) {
      state.inventory[id] = Math.max(0, (state.inventory[id] || 0) + (n || 1));
      save();
      return state.inventory[id];
    },
    consumeItem: function (id) {
      if (!state.inventory[id]) return false;
      state.inventory[id] -= 1;
      save();
      return true;
    },
    buy: function (id) {
      const def = this.itemDef(id);
      if (!def) return { ok: false, msg: '没有这件道具' };
      const price = Math.round((def.price || 0) * (state.discount || 1));
      if ((state.score || 0) < price) return { ok: false, msg: '积分不足（还差 ' + (price - state.score) + '）' };
      state.score -= price;
      state.inventory[id] = (state.inventory[id] || 0) + 1;
      save();
      return { ok: true, msg: '已购入「' + def.name + '」' };
    },
    /* ---------------- 剧情积分领取记录 ---------------- */
    claimKey: function (resourceId, difficulty) {
      return resourceId + '@' + (difficulty || 2);
    },
    claim: function (resourceId, difficulty) {
      const k = this.claimKey(resourceId, difficulty);
      if (!state.claims[k]) state.claims[k] = { milestones: [], win: false };
      return state.claims[k];
    },
    reset: function () {
      state = defaults();
      write(state); emit();
    },
    /* 后台改过助手人设后重新播种会话助手（仅在用户还没跟它聊过时） */
    reseedAssistant: function () {
      const i = state.convs.map(function (c) { return c.id; }).indexOf('conv-assistant');
      const seed = assistantSeed();
      if (i < 0) { state.convs.unshift(seed); save(); return true; }
      const c = state.convs[i];
      const untouched = c.messages.every(function (m) { return m.role !== 'user'; });
      if (!untouched) return false;
      seed.createdAt = c.createdAt;
      seed.updatedAt = Date.now();
      state.convs[i] = seed;
      if (state.activeConv === 'conv-assistant') { /* 保持选中 */ }
      save();
      return true;
    },
    exportJSON: function () { return JSON.stringify(state, null, 2); }
  };
})();
