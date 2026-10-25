/* ==========================================================================
   幻言 · 我的
   账号额度 / 我的装扮 / 我的道具 / 我的资源 / 模型与安全（全部为收缩展开式）
   ========================================================================== */
RP.profile = (function () {

  const ICONS = {
    quota: '<svg viewBox="0 0 24 24" class="ico"><circle cx="12" cy="12" r="8"/><path d="M12 8v4l2.5 2"/></svg>',
    dress: '<svg viewBox="0 0 24 24" class="ico"><path d="M12 3l2.4 5 5.6.7-4 3.9 1 5.4-5-2.7-5 2.7 1-5.4-4-3.9 5.6-.7z"/></svg>',
    props: '<svg viewBox="0 0 24 24" class="ico"><path d="M4 8l8-4 8 4-8 4z"/><path d="M4 8v8l8 4 8-4V8"/></svg>',
    mine: '<svg viewBox="0 0 24 24" class="ico"><path d="M5 5h6a2 2 0 0 1 2 2v12a1.5 1.5 0 0 0-1.5-1.5H5z"/><path d="M19 5h-6a2 2 0 0 0-2 2v12a1.5 1.5 0 0 1 1.5-1.5H19z"/></svg>',
    sys: '<svg viewBox="0 0 24 24" class="ico"><path d="M12 3l7 3v6c0 4-3 7-7 9-4-2-7-5-7-9V6z"/><path d="M9.5 12l1.8 1.8L15 10"/></svg>',
    type: '<svg viewBox="0 0 24 24" class="ico"><path d="M5 6h14"/><path d="M12 6v12"/><path d="M9 18h6"/></svg>'
  };

  function sizeName(font) {
    return (RP.app.FONT_SIZES[(font || {}).size] || RP.app.FONT_SIZES.std).name;
  }
  function familyName(font) {
    return (RP.app.FONT_FAMILIES[(font || {}).family] || RP.app.FONT_FAMILIES.system).name;
  }

  function accItem(key, icon, title, sub, meta, inner) {
    const open = RP.store.get().ui.openAcc[key];
    return '<div class="acc-item' + (open ? ' open' : '') + '" data-key="' + key + '">' +
      '<button class="acc-head">' +
        '<span class="acc-ico">' + ICONS[icon] + '</span>' +
        '<span class="acc-titles"><span class="t">' + title + '</span><span class="s">' + sub + '</span></span>' +
        '<span class="acc-meta">' + meta + '</span>' +
        '<svg viewBox="0 0 24 24" class="ico acc-arrow"><path d="M6 9l6 6 6-6"/></svg>' +
      '</button>' +
      '<div class="acc-body"><div><div class="acc-inner">' + inner + '</div></div></div>' +
    '</div>';
  }

  function render() {
    const st = RP.store.get();
    const view = document.getElementById('view-profile');
    const used = st.user.quota.used, daily = st.user.quota.daily;
    const left = RP.store.quotaLeft();
    const pct = daily > 0 ? Math.round(used / daily * 100) : 0;   // 0 = 不限，别除零
    const roleplayConvs = st.convs.filter(function (c) { return c.kind === 'roleplay'; });

    view.innerHTML = '<div class="view-scroll"><div class="profile-wrap">' +

      /* 资料卡 */
      '<div class="profile-card">' +
        '<div class="profile-av" style="background:linear-gradient(145deg,var(--accent),var(--purple))">' + RP.util.esc(st.user.initial) + '</div>' +
        '<div class="profile-main">' +
          '<h2>' + RP.util.esc(st.user.name) + '</h2>' +
          '<p>仅面向年满十八周岁用户 · 邮箱验证码登录 · 会话只存本机</p>' +
          '<div class="profile-tags"><span class="chip">对话不限次数</span>' +
            '<span class="chip">会话 ' + roleplayConvs.length + '</span>' +
            '<span class="chip">收藏 ' + st.favorites.length + '</span>' +
            '<span class="chip">' + (RP.api.enabled() ? '在线模型 · 已开启' : '本地演绎引擎') + '</span></div>' +
        '</div>' +
        '<div class="profile-side">' +
          '<div class="st"><b>∞</b><span>对话次数</span></div>' +
          '<div class="st"><b>' + (st.score || 0) + '</b><span>积分</span></div>' +
          '<div class="st"><b>' + roleplayConvs.reduce(function (n, c) { return n + c.turn; }, 0) + '</b><span>累计回合</span></div>' +
          '<div class="st"><b>' + st.favorites.length + '</b><span>收藏</span></div>' +
        '</div>' +
        '<div style="width:100%;display:flex;gap:10px;flex-wrap:wrap;margin-top:4px">' +
          '<button class="btn sm" id="pfRename">修改称呼</button>' +
          '<button class="btn sm" id="pfAssistant">打开会话助手</button>' +
          (RP.auth && RP.auth.info().me
            ? '<button class="btn sm" id="pfLogout">退出登录（' + RP.util.esc(RP.auth.info().me.email) + '）</button>'
            : '<button class="btn sm" id="pfLogin">登录</button>') +
        '</div>' +
      '</div>' +

      '<div class="acc">' +

        /* 1. 账号额度 */
        accItem('quota', 'quota', '对话与额度', '不限次数 · 想聊多久聊多久',
          '<span class="mini-tag hp">不限</span>',
          '<div class="quota-panel"><div class="quota-info">' +
            '<div class="row"><span>对话次数</span><b>不限</b></div>' +
            '<div class="row"><span>按量计费方</span><b>你自己选的模型服务商</b></div>' +
            '<div class="row"><span>本站收费</span><b>无（不含任何付费项）</b></div>' +
            '<div class="row"><span>Key 存在哪</span><b>只在你浏览器本地</b></div>' +
          '</div></div>' +
          '<div class="note">本站不提供 AI 模型，对话用的是你自己填的 API Key，费用由你和服务商直接结算，本站不经手、也不抽成。因此不做次数限制；如果你设了「经本站转发」，那也只是转发你的请求，模型仍是你的。</div>') +

accItem('dress', 'dress', '我的装扮', '主题皮肤 / 聊天气泡 / 头像框',
          '<span class="mini-tag">' + themeName(st.theme) + '</span>',
          '<div class="grid-cards">' +
            RP.catalog.themes.map(function (t) {
              return '<div class="tile' + (st.theme === t.id ? ' on' : '') + '" data-act="theme" data-id="' + t.id + '">' +
                '<div class="swatch" style="background:linear-gradient(135deg,' + t.sw[0] + ',' + t.sw[1] + ')"></div>' +
                '<div class="t">' + t.name + '</div><div class="d">' + t.desc + '</div>' +
                '<div class="foot"><span class="chip">' + (t.mode === 'light' ? '浅色' : '深色') + '</span>' +
                '<span class="chip">' + (st.theme === t.id ? '使用中' : '点击应用') + '</span></div></div>';
            }).join('') +
          '</div>' +
          '<div class="note" style="margin-bottom:14px">皮肤只改变站点的色调与气泡样式，不影响任何剧情与判定。' +
            '顶栏右侧的太阳 / 月亮按钮可以在浅色与深色之间一键切换，各自会记住上一次选的皮肤。</div>' +
          '<div class="grid-cards">' +
            RP.catalog.bubbles.map(function (b) {
              return '<div class="tile' + (st.bubble === b.id ? ' on' : '') + '" data-act="bubble" data-id="' + b.id + '">' +
                '<div class="t">气泡 · ' + b.name + '</div><div class="d">' + b.desc + '</div>' +
                '<div class="foot"><span class="chip">' + (st.bubble === b.id ? '使用中' : '点击应用') + '</span></div></div>';
            }).join('') +
          '</div>' +
          '<div class="grid-cards" style="margin-top:12px">' +
            RP.catalog.frames.map(function (f) {
              return '<div class="tile' + (st.frame === f.id ? ' on' : '') + '" data-act="frame" data-id="' + f.id + '">' +
                '<div class="t">头像框 · ' + f.name + '</div><div class="d">' + f.desc + '</div>' +
                '<div class="foot"><span class="chip">' + (st.frame === f.id ? '使用中' : '点击应用') + '</span></div></div>';
            }).join('') +
          '</div>') +

        /* 3. 积分商店与道具 */
        accItem('props', 'props', '积分商店与道具', '积分 ' + (st.score || 0) + ' · 购买后需在对话里引用才算使用',
          '<span class="mini-tag">' + (st.score || 0) + ' 积分</span>',
          '<div class="shop-head">' +
            '<div class="shop-score"><span>当前积分</span><b>' + (st.score || 0) + '</b></div>' +
            '<div class="shop-tip">积分来自剧情推进度：每 25% 发一次，通关再发一次；同一资源同一难度只发一次。' +
            '道具不会自动生效 —— 要在对话里点输入框右上角的「道具」引用，角色才认。</div>' +
          '</div>' +
          '<div class="shop-grid">' +
            (RP.settings.get().items || []).map(function (i) {
              const n = st.inventory[i.id] || 0;
              const afford = (st.score || 0) >= i.price;
              return '<div class="shop-card' + (i.kind === 'counter' ? ' counter' : '') + '">' +
                '<div class="shop-ico">' + RP.util.esc(i.icon || '◈') + '</div>' +
                '<div class="shop-main">' +
                  '<div class="shop-name">' + RP.util.esc(i.name) +
                    (i.kind === 'counter' ? '<em class="tag-counter">反制</em>' : '') +
                    (n ? '<em class="tag-owned">已有 ×' + n + '</em>' : '') + '</div>' +
                  '<div class="shop-desc">' + RP.util.esc(i.desc || '') + '</div>' +
                '</div>' +
                '<button class="btn sm' + (afford ? ' primary' : '') + '" data-buy="' + i.id + '"' + (afford ? '' : ' disabled') + '>' +
                  i.price + ' 积分</button>' +
              '</div>';
            }).join('') +
          '</div>' +
          '<div class="note">积分只用来换道具，没有任何充值途径。剧情道具由角色在剧情里给你，不能购买，也不消耗，可以在对话里反复引用。</div>') +

        /* 4. 我的资源 */
        accItem('mine', 'mine', '我的资源', '收藏与游玩记录',
          '<span class="mini-tag">' + RP.resources.all().length + ' 个本子</span>',
          '<div style="display:flex;flex-direction:column;gap:10px">' +
            RP.resources.all().map(function (r) {
              const rs = RP.store.res(r.id);
              const fav = st.favorites.indexOf(r.id) > -1;
              const play = r.status === 'playable';
              return '<div class="res-row">' +
                '<div class="thumb">' + RP.cover.svg(r) + '</div>' +
                '<div class="info"><div class="t">' + RP.util.esc(r.name) +
                  (fav ? '<span class="mini-tag" style="color:var(--gold);border-color:rgba(231,186,124,.4)">已收藏</span>' : '') +
                  '<span class="mini-tag">' + RP.util.esc(r.rating) + '</span></div>' +
                  '<div class="d">' + RP.util.esc(r.subtitle) + ' · 游玩 ' + (rs.plays || 0) + ' 次 · ' +
                    (rs.lastPlayedAt ? '最近 ' + RP.util.timeAgo(rs.lastPlayedAt) : '尚未开始') + '</div></div>' +
                '<div class="acts">' +
                  '<button class="btn sm" data-fav="' + r.id + '">' + (fav ? '取消收藏' : '收藏') + '</button>' +
                  (play
                    ? '<button class="btn sm primary" data-play2="' + r.id + '">进入演绎</button>'
                    : '<button class="btn sm" disabled>' + RP.util.esc(r.teaser || '预约中') + '</button>') +
                '</div></div>';
            }).join('') +
          '</div>') +

        /* 5. 字号与字体 */
        accItem('type', 'type', '字号与字体', '正文大小 ' + sizeName(st.ui.font) + ' · ' + familyName(st.ui.font) +
          ' · AI 制裁时会自动加粗放大',
          '<span class="mini-tag">' + sizeName(st.ui.font) + '</span>',
          '<div class="font-panel">' +
            '<div class="font-block">' +
              '<div class="font-title">正文字号<span>影响对话气泡、资源介绍与整个界面的文字大小</span></div>' +
              '<div class="font-sizes">' +
                Object.keys(RP.app.FONT_SIZES).map(function (k) {
                  const f = RP.app.FONT_SIZES[k];
                  return '<button class="font-chip' + ((st.ui.font || {}).size === k ? ' on' : '') + '" data-fontsize="' + k + '"' +
                    ' style="font-size:' + (12 * f.scale).toFixed(1) + 'px">' + f.name + '</button>';
                }).join('') +
              '</div>' +
            '</div>' +
            '<div class="font-block">' +
              '<div class="font-title">字体<span>本机自带的字体，不联网加载，选了立刻生效</span></div>' +
              '<div class="font-families">' +
                Object.keys(RP.app.FONT_FAMILIES).map(function (k) {
                  const f = RP.app.FONT_FAMILIES[k];
                  const style = f.body ? 'font-family:' + f.body.replace(/"/g, '&quot;') : '';
                  return '<button class="font-card' + ((st.ui.font || {}).family === k ? ' on' : '') + '" data-fontfamily="' + k + '">' +
                    '<span class="sample" style="' + style + '">幻言 · 灯下无新事</span>' +
                    '<span class="fname">' + f.name + '</span>' +
                    '<span class="fnote">' + f.note + '</span></button>';
                }).join('') +
              '</div>' +
            '</div>' +
            '<div class="font-block">' +
              '<div class="font-title">预览<span>下面这段就是对话里的样子（含 AI 制裁时的效果）</span></div>' +
              '<div class="font-preview">' +
                '<div class="pv-row user"><div class="pv-bubble">十年前御史台那桩灭门案，卷宗少了一页。</div></div>' +
                '<div class="pv-row ai"><div class="pv-bubble">（他把灯往你这边偏了半寸）这件事，不该在灯市里说。' +
                  '<u class="act act-warn" data-sev="1"><i class="act-chip">警告 · -2</i>再说一遍，我就请你出去。</u></div></div>' +
                '<div class="pv-row ai" data-act="execute" data-act-sev="3"><div class="pv-bubble">' +
                  '<u class="act act-execute" data-sev="3"><i class="act-chip">处刑</i>灯，灭了。</u></div></div>' +
              '</div>' +
            '</div>' +
            '<div class="note">字号只影响显示，不改动任何规则判定；AI 动用行为台词时，那一句会自动变大、加重、渗出红色 —— 越重的制裁越明显。</div>' +
          '</div>') +

        /* 6. 模型与安全 */
        accItem('sys', 'sys', '模型与安全', RP.api.enabled() ? '模型已接上 · 对话由大模型现场演绎' : '还没有可用模型 · 对话入口已锁住',
          '<span class="mini-tag' + (RP.api.enabled() ? ' hp' : '') + '">' + (RP.api.enabled() ? '已接上' : '未配置') + '</span>',
          apiPanel() +

          '<div style="margin-top:16px"><div class="acc-titles" style="margin-bottom:10px"><span class="t">AI 的行为边界</span>' +
          '<span class="s">以下规则同时写入系统提示词，并在前端做二次拦截</span></div>' +
          '<ul class="safety-list">' +
            '<li>只提供虚构剧情扮演与陪聊，不进行任何 agent 操作，没有文件、网络或系统权限</li>' +
            '<li>不诱导消费：不提及充值、打赏、礼物，不暗示你为本服务付出任何东西</li>' +
            '<li>不诱导对话：不索要真实姓名、电话、住址、社交账号等真实信息，不诱导线下见面</li>' +
            '<li>不脱离角色形象，不跳出扮演，不自称 AI 或语言模型</li>' +
            '<li>不输出违反法律与平台准则的内容</li>' +
            '<li class="no">危险词（自伤、违法策划、毒品武器、性暴力、涉未成年性内容）会被拦截：先严肃出戏警告，严重时直接暂停对话</li>' +
            '<li class="no">越界行为（对角色施暴、辱骂、要求出戏、破坏主线设定）由 AI 酌情扣除状态值，归零触发处刑并禁言</li>' +
          '</ul></div>' +

          '<div style="margin-top:16px"><div class="acc-titles" style="margin-bottom:10px"><span class="t">数据管理</span>' +
          '<span class="s">会话数据仅存于本机浏览器 localStorage；资源与提示词由后端 data/ 管理</span></div>' +
          '<div style="display:flex;gap:10px;flex-wrap:wrap">' +
            /* 公布版：前端不留任何通往内容后台的入口（后台只允许本机 / SSH 隧道访问，见 README「公布前清单」） */
            '<button class="btn sm" id="pfExport">导出数据 JSON</button>' +
            '<button class="btn sm danger" id="pfWipe">清空全部本地数据</button>' +
          '</div>' +
          '<div class="tip" id="pfBuild" style="margin-top:8px">构建版本：' +
            (RP.build ? 'build ' + RP.build : '（静态离线模式，无构建号）') +
            '　·　如果页面里的行为和说明不一致，多半是页面还在跑旧代码：按 Ctrl+F5 强制刷新即可。</div></div>') +

      '</div>' +
    '</div></div>';

    bind(view);
  }

  function themeName(id) {
    const t = RP.catalog.themes.filter(function (x) { return x.id === id; })[0];
    return t ? t.name : '夜幕蓝';
  }

  /* 现在到底是谁在说话、大概多快 —— 直接写在面板最上面，别让人猜 */
  function speedSummary() {
    const si = RP.api.serverInfo();
    const a = RP.store.get().api || {};
    const local = !!si.local || /ollama|lm ?studio/i.test(String(si.model || ''));
    if (RP.api.mode() === 'own') {
      return { badge: '你自己的模型', cls: 'ok', model: a.model || '—', base: a.base || '', note: '不占站内额度；速度取决于你接的那家（云端一般 2-5 秒/轮）' };
    }
    if (RP.api.mode() === 'server') {
      return {
        badge: local ? '本机模型（这台电脑在算）' : '云端模型',
        cls: local ? 'warn' : 'ok',
        model: si.model || '—',
        base: '',
        note: local
          ? '跑在这台电脑的 CPU 上（没有用显卡），一轮通常 5-15 秒、换本子后的第一轮更久；想更快就把下面的接口换成云端大模型'
          : '云端接口，一轮通常 2-5 秒，不占用你本机性能'
      };
    }
    return { badge: '还没有模型', cls: 'warn', model: '—', base: '', note: '没有模型就不开放对话：角色台词一律由大模型现场演绎，不用脚本凑' };
  }

  /* 免费额度清单：都是模型厂商的官方接口。不做「免费无限」这类承诺，也不承诺数字。 */
  function freeTierPanel() {
    const list = RP.api.FREE_TIERS || [];
    if (!list.length) return '';
    return '<details class="free-tier">' +
      '<summary>不想花钱也能用云端大模型：' + list.length + ' 家官方免费额度（点开看怎么领）</summary>' +
      '<div class="ft-note">下面全是模型厂商自己的官方接口 —— 对话只发给模型厂商本人，不经过任何第三方中转。' +
      '免费范围各家随时会调整，以官网当期政策为准；本机 ollama 那条则永远是 0 成本。</div>' +
      list.map(function (t, i) {
        return '<div class="ft-row">' +
          '<div class="ft-head"><b>' + RP.util.esc(t.name) + '</b>' +
            '<span class="ft-net">' + RP.util.esc(t.net) + '</span>' +
            '<button class="btn sm" data-ft="' + i + '">填这一家</button></div>' +
          '<div class="ft-why">' + RP.util.esc(t.why) + '</div>' +
          '<div class="ft-kv"><span>地址</span><code>' + RP.util.esc(t.base) + '</code></div>' +
          '<div class="ft-kv"><span>模型名</span><code>' + (t.model
            ? RP.util.esc(t.model)
            : '去官网模型列表筛「:free」，把挑中的名字填进下面的模型框') + '</code></div>' +
          '<div class="ft-kv"><span>怎么领</span><span>' + RP.util.esc(t.get) +
            '（<a href="' + RP.util.esc(t.home) + '" target="_blank" rel="noopener">打开官网</a>）</span></div>' +
        '</div>';
      }).join('') +
      '<div class="ft-warn">别用来路不明的「免费无限」中转：对话内容会经过陌生服务器，还随时可能断。' +
      '上面这几家官方额度 + 本机 ollama，已经够一个角色扮演站点用。</div>' +
    '</details>';
  }

  function apiPanel() {
    const a = RP.store.get().api;
    const si = RP.api.serverInfo();
    const sum = speedSummary();
    return '<div class="api-now ' + sum.cls + '">' +
        '<div class="an-top"><b>现在是谁在说话</b><span class="an-badge ' + sum.cls + '">' + RP.util.esc(sum.badge) + '</span></div>' +
        '<div class="an-model">' + RP.util.esc(sum.model) + (sum.base ? ' <em>' + RP.util.esc(sum.base) + '</em>' : '') + '</div>' +
        '<div class="an-note">' + RP.util.esc(sum.note) + '</div>' +
      '</div>' +
      '<div class="switch-row"><div class="switch' + (si.serverModel ? ' on' : '') + '" id="apiServerSwitch"></div>' +
      '<div class="switch-text">' + (si.serverModel
        ? '本站模型已启用（所有人默认用它）<small>额度 ' + si.dailyQuota + ' 次/人/天；下面的个人配置会覆盖它</small>'
        : '本站还没有配模型<small>扫描本机模型一键接管，或在下面填自己的云端接口</small>') + '</div></div>' +
      '<div class="api-quick">' +
        '<div class="aq-title">想换成「真正的大模型 + 秒回」？填一次自己的接口就行（提示词与对话都由我们这边发过去，你只出 Key）</div>' +
        '<ol class="aq-steps">' +
          '<li>选一个供应商 → 地址与模型名自动填好（<b>DeepSeek</b> 便宜、中文好；<b>智谱 GLM-4-Flash</b>、<b>SiliconFlow</b> 有免费额度）</li>' +
          '<li>把 Key 粘进下面「API Key」框 —— 默认走本站转发（不落盘、不记日志），也可以勾「浏览器直连」完全不经服务器</li>' +
          '<li>点「测试连接」拉到模型列表 → 点「保存并启用」→ 立刻生效，之后每轮回复下方会标出耗时</li>' +
        '</ol>' +
      '</div>' +
      freeTierPanel() +
      '<div style="display:flex;gap:10px;flex-wrap:wrap;margin:2px 0 12px">' +
        '<button class="btn sm" id="apiScan">扫描本机模型服务（Ollama / LM Studio）</button>' +
        '<span class="tip" style="align-self:center">本机模型免费、离线可用，代价是慢（CPU 推理）</span>' +
      '</div>' +
      '<div id="apiScanResult"></div>' +
      '<div class="switch-row" style="border-top:1px dashed var(--line);padding-top:12px"><div class="switch' + (a.enabled ? ' on' : '') + '" id="apiSwitch"></div>' +
      '<div class="switch-text">改用我自己的接口<small>默认经本站转发（不受跨域限制，Key 不落盘、不记日志）；勾选直连则完全不经服务器</small></div></div>' +
      '<div class="field"><label>接口地址（OpenAI 兼容 base url）</label>' +
      '<div style="display:flex;gap:8px"><input id="apiBase" value="' + RP.util.esc(a.base) + '" placeholder="https://api.deepseek.com/v1" style="flex:1">' +
      '<select id="apiPreset" class="btn sm" style="max-width:210px"><option value="">选择供应商…</option>' +
      RP.api.PROVIDERS.map(function (p) { return '<option value="' + p.id + '">' + RP.util.esc(p.name) + '</option>'; }).join('') +
      '</select></div>' +
      '<span class="tip" id="apiPresetTip">选一个供应商会自动填好地址与模型名；支持任何 OpenAI 兼容接口。</span></div>' +
      '<div class="field"><label>API Key</label>' +
      '<input id="apiKey" type="password" value="' + RP.util.esc(a.key) + '" placeholder="sk-...（仅保存在本机浏览器）"></div>' +
      '<div class="field"><label>模型名</label>' +
      '<input id="apiModel" value="' + RP.util.esc(a.model) + '" placeholder="例如 gpt-4o-mini / qwen2.5:14b"></div>' +
      '<div class="field"><label>温度</label>' +
      '<input id="apiTemp" type="number" min="0" max="2" step="0.05" value="' + a.temp + '">' +
      '<span class="tip">0.6 更稳，1.0 更放开；建议 0.8 ~ 0.95 用于角色扮演。</span></div>' +
      '<div style="display:flex;gap:10px;flex-wrap:wrap"><button class="btn sm" id="apiSave">保存并启用</button>' +
      '<button class="btn sm" id="apiTest">测试连接</button>' +
      '<label class="switch-text" style="display:flex;align-items:center;gap:7px;align-self:center">' +
      '<input type="checkbox" id="apiDirect"' + (a.direct ? ' checked' : '') + '> 浏览器直连（密钥不经过本站服务器）</label>' +
      '<span class="tip" style="align-self:center">默认走<b>经本站转发</b>：不受跨域限制，任何供应商都能用。</span></div>' +
      '<div id="apiTestResult"></div>';
  }

  function bind(view) {
    view.querySelectorAll('.acc-head').forEach(function (h) {
      h.addEventListener('click', function () {
        const item = h.closest('.acc-item');
        const key = item.dataset.key;
        const st = RP.store.get();
        st.ui.openAcc[key] = !st.ui.openAcc[key];
        item.classList.toggle('open', st.ui.openAcc[key]);
        RP.store.save();
      });
    });

    view.addEventListener('click', function (e) {
      const st = RP.store.get();
      const t = e.target;

      const theme = t.closest('[data-act="theme"]');
      if (theme) { st.theme = theme.dataset.id; RP.store.save(); RP.app.applyAppearance(); render(); RP.app.toast('已切换皮肤：<b>' + themeName(st.theme) + '</b>', 'ok'); return; }
      const bub = t.closest('[data-act="bubble"]');
      if (bub) { st.bubble = bub.dataset.id; RP.store.save(); RP.app.applyAppearance(); render(); RP.app.toast('已切换气泡样式', 'ok'); return; }
      const fr = t.closest('[data-act="frame"]');
      if (fr) { st.frame = fr.dataset.id; RP.store.save(); RP.app.applyAppearance(); render(); RP.app.toast('已切换头像框', 'ok'); return; }

      /* 字号：全站立即生效，只影响显示 */
      const fs = t.closest('[data-fontsize]');
      if (fs) {
        st.ui.font = st.ui.font || {};
        st.ui.font.size = fs.dataset.fontsize;
        RP.store.save(); RP.app.applyFont(); render();
        RP.app.toast('正文字号：<b>' + sizeName(st.ui.font) + '</b>', 'ok');
        return;
      }
      /* 字体：本机字体，切换即生效 */
      const ff = t.closest('[data-fontfamily]');
      if (ff) {
        st.ui.font = st.ui.font || {};
        st.ui.font.family = ff.dataset.fontfamily;
        RP.store.save(); RP.app.applyFont(); render();
        RP.app.toast('字体：<b>' + familyName(st.ui.font) + '</b>', 'ok');
        return;
      }

      const prop = t.closest('[data-prop]');
      if (prop) { useProp(prop.dataset.prop); return; }
      const buy = t.closest('[data-buy]');
      if (buy) {
        const r = RP.store.buy(buy.dataset.buy);
        RP.app.toast(r.msg, r.ok ? 'ok' : 'warn');
        if (r.ok) { render(); RP.chat.renderComposer(); }
        return;
      }

      const fav = t.closest('[data-fav]');
      if (fav) {
        const id = fav.dataset.fav;
        const i = st.favorites.indexOf(id);
        if (i > -1) st.favorites.splice(i, 1); else st.favorites.push(id);
        RP.store.save(); render(); RP.resources.refresh();
        RP.app.toast(i > -1 ? '已取消收藏' : '已加入收藏', 'ok');
        return;
      }
      const play2 = t.closest('[data-play2]');
      if (play2) { RP.app.play(play2.dataset.play2); return; }

      if (t.closest('#pfRename')) {
        RP.app.modal({
          title: '修改称呼', body: '这个称呼会出现在对话气泡与角色对你的称呼里。',
          input: { value: st.user.name }, ok: '保存', cancel: '取消',
          onOk: function (v) {
            v = (v || '').trim().slice(0, 12);
            if (!v) { RP.app.toast('称呼不能为空', 'warn'); return; }
            st.user.name = v; st.user.initial = v.slice(0, 1);
            RP.store.save(); render(); RP.chat.render();
            RP.app.toast('称呼已更新', 'ok');
          }
        });
        return;
      }
      if (t.closest('#pfAssistant')) {
        st.activeConv = 'conv-assistant'; RP.store.save(); RP.app.setView('chat'); return;
      }
      if (t.closest('#pfQuotaReset')) {
        st.user.quota.used = 0; st.user.quota.day = RP.util.dayKey();
        RP.store.save(); render(); RP.app.paintQuota();
        RP.app.toast('演示额度已重置', 'ok');
        return;
      }
      if (t.closest('#pfExport')) {
        RP.util.download('huanyan-data-' + RP.util.dayKey() + '.json', RP.store.exportJSON());
        RP.app.toast('已导出本地数据', 'ok');
        return;
      }
      if (t.closest('#pfWipe')) {
        RP.app.modal({
          title: '清空全部本地数据', danger: true, ok: '确认清空', cancel: '取消',
          body: '所有会话记录、额度、道具与外观设置都会被删除，且无法恢复。',
          onOk: function () {
            RP.store.reset(); render(); RP.chat.render(); RP.app.paintQuota(); RP.app.applyAppearance();
            RP.app.toast('本地数据已清空', 'ok');
          }
        });
        return;
      }

      /* 供应商预设 */
      if (t.closest('#apiPreset')) return;   // 选中动作在 change 事件里处理
      /* 本机模型：扫描 + 一键接管 */
      if (t.closest('#apiScan')) {
        const box = view.querySelector('#apiScanResult');
        if (box) box.innerHTML = '<div class="note">正在扫描 127.0.0.1 上的 11434 / 1234 / 8000 ……</div>';
        fetch('/api/probe-local-models', { cache: 'no-store' }).then(function (r) { return r.json(); }).then(function (d) {
          if (!box) return;
          const found = (d && d.found) || [];
          if (!found.length) {
            box.innerHTML = '<div class="note">没有发现本机模型服务。装了 <b>Ollama</b> 后执行 <code>ollama run qwen2.5</code> 再点一次；' +
              '或者直接在下面填自己的接口地址与 Key。</div>';
            return;
          }
          box.innerHTML = found.map(function (f) {
            return '<div class="note" style="margin-bottom:8px"><b>' + RP.util.esc(f.name) + '</b> · ' + RP.util.esc(f.base) +
              '<div style="margin-top:8px;display:flex;gap:8px;flex-wrap:wrap">' +
              f.models.map(function (m) {
                return '<button class="btn sm primary" data-uselocal="' + RP.util.esc(f.base) + '|' + RP.util.esc(m) + '">用它：' + RP.util.esc(m) + '</button>';
              }).join('') + '</div></div>';
          }).join('');
        }).catch(function () {
          if (box) box.innerHTML = '<div class="note">扫描失败：连不上后端。</div>';
        });
        return;
      }
      const useLocal = t.closest('[data-uselocal]');
      if (useLocal) {
        const parts = useLocal.dataset.uselocal.split('|');
        RP.app.toast('正在接管……');
        fetch('/api/model/use-local', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ base: parts[0], model: parts[1] })
        }).then(function (r) { return r.json().then(function (d) { return { ok: r.ok, d: d }; }); }).then(function (x) {
          if (!x.ok || !x.d.ok) throw new Error((x.d && x.d.error) || '失败');
          RP.app.toast('已由 <b>' + RP.util.esc(parts[1]) + '</b> 接管对话，刷新页面后生效', 'ok');
          return RP.api.loadServerModel();
        }).then(function () { render(); }).catch(function (e) {
          RP.app.toast('接管失败：' + RP.util.esc(e.message || String(e)) + '（对外部署时这里需要管理令牌）', 'danger');
        });
        return;
      }
      if (t.closest('#apiServerSwitch')) {
        const si2 = RP.api.serverInfo();
        RP.app.modal({
          title: si2.serverModel ? '本站模型已接管' : '让模型主导对话',
          body: si2.serverModel
            ? '当前由服务端的「' + si2.model + '」生成正文，额度 ' + si2.dailyQuota + ' 次/人/天。要改模型请编辑 data/model.json 或设置 MODEL_* 环境变量。'
            : '现在对话由内置的本地演绎引擎（模板）生成 —— 同一个场景容易重复、也不太接得住你的话。\n\n' +
              '想换成真正的模型，二选一：\n' +
              '① 零成本：点上面的「扫描本机模型服务」，装过 Ollama / LM Studio 就能一键接管（模型在你自己电脑上跑）。\n' +
              '② 用云端接口：站长把密钥填进 data/model.json，所有人共用并受 30 次/天限制；' +
              '或者你在下面填自己的 Key，浏览器直连（只建议本地自用）。',
          ok: '知道了'
        });
        return;
      }
      /* 模型配置 */
      if (t.closest('#apiSwitch')) {
        st.api.enabled = !st.api.enabled; RP.store.save(); render();
        RP.app.toast(st.api.enabled ? '已开启在线模型，调用失败将自动回退本地引擎' : '已关闭在线模型，使用本地演绎引擎', st.api.enabled ? 'ok' : 'warn');
        return;
      }
      if (t.closest('#apiSave')) {
        st.api.base = (view.querySelector('#apiBase').value || '').trim();
        st.api.key = (view.querySelector('#apiKey').value || '').trim();
        st.api.model = (view.querySelector('#apiModel').value || '').trim();
        st.api.temp = RP.util.clamp(parseFloat(view.querySelector('#apiTemp').value) || 0.85, 0, 2);
        st.api.direct = !!view.querySelector('#apiDirect').checked;
        const dr = view.querySelector('#apiDirect');
        if (dr) st.api.direct = !!dr.checked;
        if (!st.api.base || !st.api.model) { RP.app.toast('请先填好接口地址与模型名', 'warn'); return; }
        st.api.enabled = true;                       // 保存即启用
        RP.store.save();
        RP.app.toast('已启用你自己的模型：<b>' + RP.util.esc(st.api.model) + '</b>（刷新后本场立即生效）', 'ok');
        render();
        if (RP.chat) RP.chat.renderComposer();
        return;
      }
      if (t.closest('#apiTest')) {
        const base = (view.querySelector('#apiBase').value || '').trim();
        const key = (view.querySelector('#apiKey').value || '').trim();
        const box = view.querySelector('#apiTestResult');
        if (!base) { RP.app.toast('请先填接口地址', 'warn'); return; }
        if (box) box.innerHTML = '<div class="note">正在连接 ' + RP.util.esc(base) + ' ……</div>';
        fetch('/api/test-model', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ base: base, key: key })
        }).then(function (r) { return r.json().then(function (d) { return { ok: r.ok, d: d }; }); }).then(function (x) {
          if (!box) return;
          if (!x.ok || !x.d.ok) { box.innerHTML = '<div class="note" style="color:var(--danger)">连接失败：' + RP.util.esc((x.d && x.d.error) || '未知错误') + '</div>'; return; }
          const models = x.d.models || [];
          box.innerHTML = '<div class="note" style="color:var(--ok)">连接成功 ✅ 检测到 ' + models.length + ' 个模型' +
            (models.length ? '，点一个填进模型名：<div style="margin-top:8px;display:flex;gap:6px;flex-wrap:wrap">' +
              models.slice(0, 12).map(function (m) {
                return '<button class="btn sm" data-pickmodel="' + RP.util.esc(m) + '">' + RP.util.esc(m) + '</button>';
              }).join('') + '</div>' : '') + '</div>';
        }).catch(function (e) {
          if (box) box.innerHTML = '<div class="note" style="color:var(--danger)">连接失败：' + RP.util.esc(e.message || String(e)) + '</div>';
        });
        return;
      }
      const pickModel = t.closest('[data-pickmodel]');
      if (pickModel) {
        const f = view.querySelector('#apiModel');
        if (f) { f.value = pickModel.dataset.pickmodel; RP.app.toast('已填入模型名，点「保存并启用」生效', 'ok'); }
        return;
      }
    });
    /* 供应商预设下拉：选中即填好地址与模型名 */
    const preset = view.querySelector('#apiPreset');
    if (preset) preset.addEventListener('change', function () {
      const p = RP.api.PROVIDERS.filter(function (x) { return x.id === preset.value; })[0];
      if (!p) return;
      if (p.base) view.querySelector('#apiBase').value = p.base;
      if (p.model) view.querySelector('#apiModel').value = p.model;
      const tip = view.querySelector('#apiPresetTip');
      if (tip) tip.innerHTML = RP.util.esc(p.name) + '：' + RP.util.esc(p.note || '') + '（还需要填你自己的 API Key）';
      view.querySelector('#apiKey').focus();
    });
    /* 「填这一家」：按免费额度清单把地址/模型名填好，顺便把供应商下拉同步过去 */
    Array.prototype.forEach.call(view.querySelectorAll('[data-ft]'), function (b) {
      b.addEventListener('click', function () {
        const t = (RP.api.FREE_TIERS || [])[+b.getAttribute('data-ft')];
        if (!t) return;
        const baseEl = view.querySelector('#apiBase');
        const modelEl = view.querySelector('#apiModel');
        const presetEl = view.querySelector('#apiPreset');
        if (baseEl) baseEl.value = t.base;
        if (modelEl && t.model) modelEl.value = t.model;
        if (presetEl) presetEl.value = t.id;
        const tip = view.querySelector('#apiPresetTip');
        if (tip) tip.innerHTML = '已填好 <b>' + RP.util.esc(t.name) + '</b> 的地址' + (t.model ? '与模型名' : '') +
          '。还差一步：' + RP.util.esc(t.get) + '，把 Key 粘到下面的框里。';
        RP.app.toast('已填好「' + t.name + '」的地址，去官网领个 Key 粘进来就行', 'ok');
        const keyEl = view.querySelector('#apiKey');
        if (keyEl) { keyEl.focus(); keyEl.scrollIntoView({ block: 'center', behavior: 'smooth' }); }
      });
    });
  }

  /* 道具现在只能在对话里「引用」后生效，这里保留兼容入口：切到对话并提示 */
  function useProp(id) {
    const def = RP.store.itemDef(id);
    const conv = RP.store.active();
    if (!RP.store.itemCount(id)) { RP.app.toast('道具数量不足', 'warn'); return; }
    if (!conv || conv.kind !== 'roleplay') {
      RP.app.toast('先去资源库开一场剧情，再在对话里引用道具', 'warn');
      return;
    }
    RP.chat.renderComposer();
    RP.app.setView('chat');
    RP.app.toast('请在对话输入框右上角点「<b>道具</b>」引用' + (def ? '「' + def.name + '」' : '') + '，角色才认', 'ok');
  }

  return { render: render };
})();
