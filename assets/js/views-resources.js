/* ==========================================================================
   幻言 · 资源区
   封面为程序生成的 SVG（无外链图片）；悬停片刻后背景透明并展开详情；
   点击卡片选中并浮出蓝色「游玩」，再次点击进入对话区新建会话。
   ========================================================================== */
RP.cover = (function () {
  function defs(id, a, b, c) {
    return '<defs>' +
      '<linearGradient id="bg-' + id + '" x1="0" y1="0" x2="1" y2="1">' +
        '<stop offset="0" stop-color="' + a + '"/><stop offset="0.55" stop-color="' + b + '"/>' +
        '<stop offset="1" stop-color="' + a + '"/></linearGradient>' +
      '<radialGradient id="gl-' + id + '" cx="0.5" cy="0.5" r="0.5">' +
        '<stop offset="0" stop-color="' + c + '" stop-opacity="0.85"/>' +
        '<stop offset="1" stop-color="' + c + '" stop-opacity="0"/></radialGradient>' +
      '</defs>';
  }
  function lantern(id, c) {
    let s = '';
    [96, 196, 300].forEach(function (x, i) {
      const y = 44 + (i % 2) * 16;
      s += '<line x1="' + x + '" y1="0" x2="' + x + '" y2="' + y + '" stroke="' + c + '" stroke-opacity="0.35" stroke-width="1"/>' +
        '<ellipse cx="' + x + '" cy="' + (y + 16) + '" rx="26" ry="24" fill="url(#gl-' + id + ')"/>' +
        '<rect x="' + (x - 9) + '" y="' + y + '" width="18" height="24" rx="6" fill="' + c + '" fill-opacity="0.9"/>' +
        '<rect x="' + (x - 9) + '" y="' + (y + 22) + '" width="18" height="3" rx="1.5" fill="' + c + '" fill-opacity="0.6"/>';
    });
    s += '<circle cx="332" cy="60" r="34" fill="url(#gl-' + id + ')"/>' +
      '<circle cx="332" cy="60" r="19" fill="' + c + '" fill-opacity="0.55"/>' +
      '<path d="M0 196 L64 176 L128 196 L192 172 L256 196 L320 176 L400 200 L400 250 L0 250 Z" fill="#000" fill-opacity="0.42"/>' +
      '<path d="M0 214 L58 198 L120 216 L186 196 L250 218 L316 200 L400 220 L400 250 L0 250 Z" fill="#000" fill-opacity="0.55"/>';
    return s;
  }
  function neon(id, a, b, c) {
    let s = '<rect x="0" y="0" width="400" height="250" fill="#000" fill-opacity="0.28"/>';
    const bars = [[18, 120, 34], [62, 88, 26], [96, 150, 40], [146, 104, 22], [176, 138, 30], [216, 92, 46], [270, 160, 30], [310, 118, 38], [356, 140, 28]];
    bars.forEach(function (b2, i) {
      const x = b2[0], h = b2[1], w = b2[2];
      s += '<rect x="' + x + '" y="' + (250 - h) + '" width="' + w + '" height="' + h + '" fill="#05060c" fill-opacity="0.72"/>';
      s += '<rect x="' + (x + 3) + '" y="' + (250 - h + 5) + '" width="2" height="' + (h - 12) + '" fill="' + (i % 2 ? b : c) + '" fill-opacity="0.5"/>';
      if (i % 3 === 0) s += '<rect x="' + (x + w - 7) + '" y="' + (250 - h + 9) + '" width="2.5" height="' + (h * 0.4) + '" fill="' + c + '" fill-opacity="0.75"/>';
    });
    s += '<rect x="0" y="150" width="400" height="1.5" fill="' + c + '" fill-opacity="0.5"/>' +
      '<ellipse cx="200" cy="152" rx="180" ry="26" fill="url(#gl-' + id + ')"/>' +
      '<rect x="248" y="42" width="74" height="16" rx="4" fill="none" stroke="' + c + '" stroke-opacity="0.75" stroke-width="1.6"/>' +
      '<rect x="256" y="47" width="58" height="6" rx="3" fill="' + c + '" fill-opacity="0.6"/>' +
      '<rect x="44" y="66" width="46" height="12" rx="3" fill="none" stroke="' + b + '" stroke-opacity="0.65" stroke-width="1.4"/>';
    return s;
  }
  function mist(id, a, b, c) {
    let s = '<circle cx="318" cy="70" r="52" fill="url(#gl-' + id + ')"/>' +
      '<circle cx="318" cy="70" r="22" fill="' + c + '" fill-opacity="0.35"/>' +
      '<rect x="120" y="70" width="34" height="128" fill="#05070c" fill-opacity="0.5"/>' +
      '<rect x="112" y="62" width="50" height="12" rx="4" fill="#05070c" fill-opacity="0.66"/>' +
      '<circle cx="137" cy="112" r="1.8" fill="' + c + '" fill-opacity="0.8"/>' +
      '<circle cx="137" cy="140" r="1.8" fill="' + c + '" fill-opacity="0.6"/>' +
      '<g stroke="' + c + '" stroke-opacity="0.28" fill="none"><circle cx="286" cy="164" r="30"/><circle cx="286" cy="164" r="18"/></g>';
    [[196, 0.5], [168, 0.34], [140, 0.22]].forEach(function (w, i) {
      s += '<path d="M0 ' + w[0] + ' C 70 ' + (w[0] - 16) + ', 130 ' + (w[0] + 18) + ', 200 ' + w[0] +
        ' S 330 ' + (w[0] - 20) + ', 400 ' + (w[0] + 6) + ' L400 250 L0 250 Z" fill="#ffffff" fill-opacity="' + (w[1] * 0.14) + '"/>';
    });
    s += '<path d="M0 196 C 90 182, 150 208, 240 196 S 350 186, 400 200" stroke="' + c + '" stroke-opacity="0.3" stroke-width="1.2" fill="none"/>';
    return s;
  }
  function rain(id, a, b, c) {
    let s = '<rect x="0" y="0" width="400" height="250" fill="#000" fill-opacity="0.3"/>';
    let lines = '';
    for (let i = -6; i < 34; i++) {
      const x = i * 14;
      lines += '<line x1="' + x + '" y1="-10" x2="' + (x - 34) + '" y2="260" stroke="#ffffff" stroke-opacity="0.14" stroke-width="1"/>';
    }
    s += lines;
    s += '<path d="M300 66 L236 236 L364 236 Z" fill="url(#gl-' + id + ')" opacity="0.9"/>' +
      '<rect x="292" y="46" width="9" height="24" rx="3" fill="' + c + '" fill-opacity="0.9"/>' +
      '<circle cx="296" cy="70" r="10" fill="' + c + '" fill-opacity="0.5"/>' +
      '<ellipse cx="150" cy="228" rx="86" ry="10" fill="' + c + '" fill-opacity="0.16"/>' +
      '<ellipse cx="330" cy="242" rx="58" ry="7" fill="' + c + '" fill-opacity="0.12"/>' +
      '<rect x="40" y="150" width="96" height="86" rx="4" fill="#05070c" fill-opacity="0.55"/>' +
      '<rect x="54" y="166" width="30" height="34" fill="' + c + '" fill-opacity="0.22"/>' +
      '<rect x="94" y="166" width="30" height="34" fill="' + b + '" fill-opacity="0.16"/>';
    return s;
  }
  /* 深海：光柱、气泡、鲸影与珊瑚 */
  function sea(id, a, b, c) {
    let s = '<rect x="0" y="0" width="400" height="250" fill="#000" fill-opacity="0.18"/>';
    [60, 150, 250, 330].forEach(function (x, i) {
      s += '<path d="M' + x + ' 0 L' + (x - 26) + ' 250 L' + (x + 34) + ' 250 L' + (x + 46) + ' 0 Z" fill="' + c +
        '" fill-opacity="' + (i % 2 ? 0.05 : 0.08) + '"/>';
    });
    s += '<path d="M60 150 C 110 118, 190 118, 236 142 C 258 154, 268 168, 262 176 C 250 190, 200 196, 150 190 C 100 184, 62 172, 60 150 Z" fill="' + c + '" fill-opacity="0.22"/>' +
      '<path d="M236 142 C 250 128, 262 132, 258 146 C 254 158, 244 162, 236 158 Z" fill="' + c + '" fill-opacity="0.28"/>' +
      '<circle cx="96" cy="150" r="2.4" fill="' + c + '" fill-opacity="0.7"/>';
    [[318, 74, 5], [286, 104, 3], [346, 132, 4], [212, 62, 3.4], [124, 88, 2.6], [166, 196, 4.2], [92, 214, 3]].forEach(function (p) {
      s += '<circle cx="' + p[0] + '" cy="' + p[1] + '" r="' + p[2] + '" fill="none" stroke="' + c + '" stroke-opacity="0.42"/>';
    });
    s += '<path d="M0 236 C 40 220, 70 244, 108 232 C 140 222, 168 244, 200 234 C 240 222, 268 246, 300 234 C 336 220, 366 244, 400 232 L400 250 L0 250 Z" fill="#04070c" fill-opacity="0.55"/>';
    [30, 52, 76].forEach(function (x, i) {
      s += '<path d="M' + x + ' 250 C ' + (x - 6) + ' ' + (222 - i * 8) + ', ' + (x + 12) + ' ' + (216 - i * 10) + ', ' + (x + 6) + ' ' + (196 - i * 12) + '" stroke="' + c + '" stroke-opacity="0.34" fill="none" stroke-width="2"/>';
    });
    return s;
  }
  /* 废弃游乐园：摩天轮、断掉的灯串与野草 */
  function fair(id, a, b, c) {
    let s = '<circle cx="286" cy="104" r="66" fill="none" stroke="' + c + '" stroke-opacity="0.30" stroke-width="1.6"/>' +
      '<circle cx="286" cy="104" r="46" fill="none" stroke="' + c + '" stroke-opacity="0.18" stroke-width="1.2"/>' +
      '<circle cx="286" cy="104" r="6" fill="' + c + '" fill-opacity="0.5"/>';
    for (let i = 0; i < 10; i++) {
      const ang = (Math.PI * 2 / 10) * i;
      const x = 286 + Math.cos(ang) * 66, y = 104 + Math.sin(ang) * 66;
      s += '<line x1="286" y1="104" x2="' + x.toFixed(1) + '" y2="' + y.toFixed(1) + '" stroke="' + c + '" stroke-opacity="0.22" stroke-width="1"/>' +
        '<rect x="' + (x - 5).toFixed(1) + '" y="' + (y - 5).toFixed(1) + '" width="10" height="10" rx="2" fill="#0a0710" fill-opacity="0.7" stroke="' + c + '" stroke-opacity="0.34"/>';
    }
    s += '<path d="M286 170 L266 250 M286 170 L306 250 M272 214 L300 214" stroke="' + c + '" stroke-opacity="0.26" stroke-width="1.6" fill="none"/>' +
      '<path d="M0 214 L400 200" stroke="' + c + '" stroke-opacity="0.16" stroke-width="1"/>';
    [[26, 196], [58, 188], [92, 200], [126, 190], [158, 202]].forEach(function (p, i) {
      s += '<circle cx="' + p[0] + '" cy="' + p[1] + '" r="3.4" fill="' + c + '" fill-opacity="' + (i % 2 ? 0.5 : 0.22) + '"/>';
    });
    s += '<path d="M0 250 L0 226 L40 214 L74 232 L118 216 L150 236 L196 220 L240 238 L288 222 L334 240 L400 224 L400 250 Z" fill="#07050c" fill-opacity="0.6"/>';
    [40, 70, 104, 140, 300, 340, 372].forEach(function (x, i) {
      s += '<path d="M' + x + ' 250 C ' + (x - 4) + ' ' + (232 - i % 3 * 4) + ', ' + (x + 8) + ' ' + (226 - i % 3 * 5) + ', ' + (x + 3) + ' 210" stroke="' + c + '" stroke-opacity="0.26" fill="none"/>';
    });
    return s;
  }
  /* 宫墙：城垛、旗帜、火把与封蜡的信 */
  function throne(id, a, b, c) {
    let s = '<circle cx="330" cy="56" r="30" fill="url(#gl-' + id + ')"/><circle cx="330" cy="56" r="17" fill="' + c + '" fill-opacity="0.42"/>';
    s += '<path d="M0 150 L0 118 L28 118 L28 134 L56 134 L56 118 L84 118 L84 134 L112 134 L112 118 L140 118 L140 134 L168 134 L168 118 L196 118 L196 134 L224 134 L224 118 L252 118 L252 134 L280 134 L280 118 L308 118 L308 134 L336 134 L336 118 L364 118 L364 134 L400 134 L400 150 Z" fill="#08060e" fill-opacity="0.72"/>';
    s += '<rect x="0" y="150" width="400" height="100" fill="#08060e" fill-opacity="0.62"/>';
    s += '<rect x="86" y="60" width="46" height="66" fill="' + b + '" fill-opacity="0.18" stroke="' + c + '" stroke-opacity="0.3"/>' +
      '<path d="M109 60 L109 30 L142 42 L109 54 Z" fill="' + c + '" fill-opacity="0.55"/>';
    s += '<rect x="286" y="96" width="7" height="34" rx="3" fill="' + c + '" fill-opacity="0.75"/>' +
      '<ellipse cx="289" cy="94" rx="13" ry="17" fill="url(#gl-' + id + ')"/>';
    s += '<g transform="rotate(-8 200 210)"><rect x="152" y="186" width="96" height="60" rx="3" fill="#f0e8d8" fill-opacity="0.13" stroke="' + c + '" stroke-opacity="0.4"/>' +
      '<line x1="166" y1="206" x2="234" y2="206" stroke="' + c + '" stroke-opacity="0.3"/><line x1="166" y1="222" x2="222" y2="222" stroke="' + c + '" stroke-opacity="0.24"/></g>' +
      '<circle cx="238" cy="240" r="12" fill="#a8323c" fill-opacity="0.8"/>';
    return s;
  }
  function archive(id, a, b, c) {    let s = '';
    for (let i = 0; i < 6; i++) {
      s += '<line x1="0" y1="' + (48 + i * 26) + '" x2="400" y2="' + (48 + i * 26) + '" stroke="' + c + '" stroke-opacity="0.12" stroke-width="1"/>';
    }
    s += '<g transform="rotate(-7 150 140)"><rect x="60" y="104" width="150" height="96" rx="4" fill="#f3ead6" fill-opacity="0.14" stroke="' + c + '" stroke-opacity="0.35"/>' +
      '<line x1="76" y1="128" x2="192" y2="128" stroke="' + c + '" stroke-opacity="0.3"/><line x1="76" y1="146" x2="180" y2="146" stroke="' + c + '" stroke-opacity="0.24"/>' +
      '<line x1="76" y1="164" x2="188" y2="164" stroke="' + c + '" stroke-opacity="0.2"/></g>' +
      '<g transform="rotate(6 268 130)"><rect x="188" y="86" width="146" height="92" rx="4" fill="#f3ead6" fill-opacity="0.1" stroke="' + b + '" stroke-opacity="0.34"/></g>' +
      '<circle cx="318" cy="176" r="30" fill="#b3323a" fill-opacity="0.75"/>' +
      '<rect x="306" y="164" width="24" height="24" rx="3" fill="none" stroke="#f6e7d2" stroke-opacity="0.8" stroke-width="1.6"/>' +
      '<path d="M313 158 h10 M308 164 h20 M308 188 h20 M313 194 h10" stroke="#f6e7d2" stroke-opacity="0.7" stroke-width="2"/>';
    return s;
  }
  function svg(resource) {
    const cv = resource.cover || {};
    /* 后台上传了封面图就直接用图 */
    if (cv.image) {
      return '<img class="cover-img" src="' + RP.util.esc(cv.image) + '" alt="' + RP.util.esc(resource.name) + ' 封面" loading="lazy">';
    }
    const p = (cv.palette && cv.palette.length === 3) ? cv.palette : ['#141824', '#2c3550', '#6f8fd8'];
    const id = resource.id.replace(/[^a-z0-9]/gi, '');
    let art = '';
    switch (cv.motif) {
      case 'neon': art = neon(id, p[0], p[1], p[2]); break;
      case 'mist': art = mist(id, p[0], p[1], p[2]); break;
      case 'rain': art = rain(id, p[0], p[1], p[2]); break;
      case 'archive': art = archive(id, p[0], p[1], p[2]); break;
      case 'sea': art = sea(id, p[0], p[1], p[2]); break;
      case 'fair': art = fair(id, p[0], p[1], p[2]); break;
      case 'throne': art = throne(id, p[0], p[1], p[2]); break;
      default: art = lantern(id, p[2]);
    }
    return '<svg viewBox="0 0 400 250" preserveAspectRatio="xMidYMid slice" role="img" aria-label="' + RP.util.esc(resource.name) + ' 封面">' +
      defs(id, p[0], p[1], p[2]) +
      '<rect width="400" height="250" fill="url(#bg-' + id + ')"/>' + art + '</svg>';
  }
  return { svg: svg };
})();

RP.resources = (function () {
  const HOVER_DELAY = 420;   // 「悬停片刻」才展开
  let timers = {};

  function all() { return window.RP_RESOURCES || []; }
  function byId(id) { return all().filter(function (r) { return r.id === id; })[0] || null; }
  function playable() { return all().filter(function (r) { return r.status === 'playable'; }); }
  function genres() {
    const map = {};
    all().forEach(function (r) { (r.genres || []).forEach(function (g) { map[g] = (map[g] || 0) + 1; }); });
    return Object.keys(map).sort(function (a, b) { return map[b] - map[a]; });
  }
  function list() {
    const st = RP.store.get();
    const f = st.ui.filters;
    const q = (st.ui.search || '').trim().toLowerCase();
    let out = all().filter(function (r) {
      if (f.genre !== '全部' && (r.genres || []).indexOf(f.genre) === -1) return false;
      if (f.rating !== '全部' && r.rating !== f.rating) return false;
      if (f.length !== '全部' && r.length !== f.length) return false;
      if (q) {
        const hay = [r.name, r.subtitle, r.brief, r.intro, (r.genres || []).join(' '),
          r.character ? r.character.name + ' ' + r.character.title : '', r.userRole || ''].join(' ').toLowerCase();
        if (hay.indexOf(q) === -1) return false;
      }
      return true;
    });
    if (f.sort === '名称') out.sort(function (a, b) { return a.name.localeCompare(b.name, 'zh'); });
    else if (f.sort === '可玩优先') out.sort(function (a, b) { return (b.status === 'playable') - (a.status === 'playable') || b.heat - a.heat; });
    else out.sort(function (a, b) { return b.heat - a.heat; });
    return out;
  }

  function pill(group, value, current) {
    return '<button class="pill' + (value === current ? ' on' : '') + '" data-group="' + group + '" data-value="' + RP.util.esc(value) + '">' + RP.util.esc(value) + '</button>';
  }

  function skeleton() {
    const st = RP.store.get();
    const f = st.ui.filters;
    const rows = [
      { key: 'genre', label: '题材', values: ['全部'].concat(genres()) },
      { key: 'rating', label: '分级', values: ['全部', '16+', '18+'] },
      { key: 'length', label: '体量', values: ['全部', '长线', '短线'] },
      { key: 'sort', label: '排序', values: ['可玩优先', '热度', '名称'] }
    ];
    const play = playable().length;
    return '' +
      '<div class="view-scroll"><div class="res-wrap">' +
        '<div class="res-hero">' +
          '<div><h1>资源库</h1><p>成年人向剧情角色扮演 · 选一个本子，进入它的世界</p></div>' +
          '<div class="hero-stats">' +
            '<div class="st"><b>' + all().length + '</b><span>角色本</span></div>' +
            '<div class="st"><b>' + play + '</b><span>可游玩</span></div>' +
            '<div class="st"><b>' + RP.store.get().convs.filter(function (c) { return c.kind === 'roleplay'; }).length + '</b><span>我的会话</span></div>' +
          '</div>' +
        '</div>' +
        '<div class="search-bar">' +
          '<svg viewBox="0 0 24 24" class="ico"><circle cx="11" cy="11" r="6.5"/><path d="M16 16l4.5 4.5"/></svg>' +
          '<input id="resSearch" type="search" placeholder="搜索角色、题材、剧情关键词……" value="' + RP.util.esc(st.ui.search) + '" autocomplete="off">' +
          '<button class="clear" id="resSearchClear" title="清空">×</button>' +
        '</div>' +
        '<div class="filterbar">' +
          rows.map(function (row) {
            return '<div class="filter-row"><span class="filter-label">' + row.label + '</span><div class="pills">' +
              row.values.map(function (v) { return pill(row.key, v, f[row.key]); }).join('') + '</div></div>';
          }).join('') +
          '<div class="filter-foot"><span id="resCount"></span><button class="btn sm ghost" id="resReset">清除筛选</button></div>' +
        '</div>' +
        '<div class="res-grid" id="resGrid"></div>' +
      '</div></div>';
  }

  function card(r) {
    const st = RP.store.get();
    const locked = r.status !== 'playable';
    const fav = st.favorites.indexOf(r.id) > -1;
    const sel = st.ui.selected === r.id;
    return '' +
      '<article class="res-card' + (locked ? ' locked' : '') + (fav ? ' fav' : '') + (sel ? ' selected' : '') +
        '" data-id="' + r.id + '" tabindex="0" aria-label="' + RP.util.esc(r.name) + '">' +
        '<div class="res-cover">' + RP.cover.svg(r) + '<div class="res-cover-mask"></div>' +
          '<div class="res-badges"><span class="badge rate">' + RP.util.esc(r.rating) + '</span>' +
            '<span class="badge">' + RP.util.esc(r.length) + '</span>' +
            (locked ? '<span class="badge soon">预约中</span>' : '') + '</div>' +
          '<div class="res-cover-title"><h3>' + RP.util.esc(r.name) + '</h3><p>' + RP.util.esc(r.subtitle) + '</p></div>' +
        '</div>' +
        '<div class="res-body">' +
          '<ul class="res-meta">' + (r.metaLines || []).map(function (m) { return '<li>' + RP.util.esc(m) + '</li>'; }).join('') + '</ul>' +
          '<p class="res-brief">' + RP.util.esc(r.brief) + '</p>' +
        '</div>' +
        '<div class="res-reveal">' +
          '<div class="res-reveal-head"><h3>' + RP.util.esc(r.name) + '</h3><span>' + RP.util.esc(r.subtitle) + '</span>' +
            '<em class="heat">热度 ' + RP.util.num(r.heat) + ' · ' + RP.util.num(r.players) + ' 人在演</em></div>' +
          '<p class="intro">' + RP.util.esc(r.intro) + '</p>' +
          '<div class="res-reveal-foot"><div class="tags">' +
            (r.genres || []).map(function (g) { return '<i>' + RP.util.esc(g) + '</i>'; }).join('') +
            '<i>' + RP.util.esc(r.rating) + '</i><i>' + RP.util.esc(r.length) + '</i></div></div>' +
        '</div>' +
        (locked
          ? '<button class="soon-btn" data-soon="' + r.id + '">' + RP.util.esc(r.teaser || '预约中') + '</button>'
          : '<button class="play-btn" data-play="' + r.id + '">游 玩</button>') +
      '</article>';
  }

  function paintGrid() {
    const grid = document.getElementById('resGrid');
    if (!grid) return;
    const items = list();
    grid.innerHTML = items.length
      ? items.map(card).join('')
      : '<div class="empty" style="grid-column:1/-1"><div class="big">🔍</div><p>没有匹配的资源，换个关键词或清除筛选试试。</p></div>';
    const count = document.getElementById('resCount');
    if (count) {
      count.innerHTML = '共 <b>' + items.length + '</b> 个结果 · 其中 <b>' + items.filter(function (r) { return r.status === 'playable'; }).length + '</b> 个可直接游玩';
    }
  }
  function paintPills() {
    const f = RP.store.get().ui.filters;
    document.querySelectorAll('#view-resources .pill').forEach(function (p) {
      p.classList.toggle('on', f[p.dataset.group] === p.dataset.value);
    });
  }

  function render() {
    const view = document.getElementById('view-resources');
    view.innerHTML = skeleton();
    paintGrid();
    bind(view);
  }
  function refresh() { paintPills(); paintGrid(); }

  function bind(view) {
    const search = view.querySelector('#resSearch');
    let t = null;
    search.addEventListener('input', function () {
      RP.store.get().ui.search = search.value;
      clearTimeout(t);
      t = setTimeout(function () { paintGrid(); }, 120);
    });
    view.querySelector('#resSearchClear').addEventListener('click', function () {
      search.value = '';
      RP.store.get().ui.search = '';
      paintGrid(); search.focus();
    });
    view.querySelector('.filterbar').addEventListener('click', function (e) {
      const p = e.target.closest('.pill');
      if (p) {
        RP.store.get().ui.filters[p.dataset.group] = p.dataset.value;
        RP.store.save(); refresh(); return;
      }
      if (e.target.closest('#resReset')) {
        const st = RP.store.get();
        st.ui.filters = { genre: '全部', rating: '全部', length: '全部', sort: '热度' };
        st.ui.search = '';
        search.value = '';
        RP.store.save(); refresh();
      }
    });

    const grid = view.querySelector('#resGrid');
    grid.addEventListener('mouseover', function (e) {
      const c = e.target.closest('.res-card');
      if (!c) return;                       /* 未上线的本子同样可悬停查看介绍 */
      if (timers[c.dataset.id]) return;
      timers[c.dataset.id] = setTimeout(function () {
        c.classList.add('revealed');
        delete timers[c.dataset.id];
      }, HOVER_DELAY);
    });
    grid.addEventListener('mouseout', function (e) {
      const c = e.target.closest('.res-card');
      if (!c) return;
      if (timers[c.dataset.id]) { clearTimeout(timers[c.dataset.id]); delete timers[c.dataset.id]; }
      if (c.contains(e.relatedTarget)) return;
      c.classList.remove('revealed');
    });
    grid.addEventListener('click', function (e) {
      const soon = e.target.closest('[data-soon]');
      if (soon) {
        const r = byId(soon.dataset.soon);
        RP.app.modal({
          title: r.name + ' · ' + (r.teaser || '预约中'),
          body: '这个本子还在打磨中。' + r.brief + '\n\n' + r.intro + '\n\n上线后你会在资源库里直接看到它的「游玩」按钮。可以先在可玩的两个本子里熟悉玩法。',
          ok: '知道了'
        });
        return;
      }
      const c = e.target.closest('.res-card');
      if (!c) return;
      const r = byId(c.dataset.id);
      if (!r || r.status !== 'playable') return;
      const st = RP.store.get();
      if (st.ui.selected === r.id || e.target.closest('[data-play]')) {
        RP.app.play(r.id);
      } else {
        st.ui.selected = r.id;
        st.ui.search = st.ui.search;
        RP.store.save();
        document.querySelectorAll('#view-resources .res-card').forEach(function (x) {
          x.classList.toggle('selected', x.dataset.id === r.id);
        });
        c.classList.add('revealed');
        RP.app.toast('已选中「<b>' + RP.util.esc(r.name) + '</b>」，点击蓝色「游玩」开始演绎', 'ok');
      }
    });
    grid.addEventListener('keydown', function (e) {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      const c = e.target.closest('.res-card');
      if (!c) return;
      e.preventDefault();
      const r = byId(c.dataset.id);
      if (!r || r.status !== 'playable') return;
      if (RP.store.get().ui.selected === r.id) RP.app.play(r.id);
      else { c.classList.add('selected', 'revealed'); RP.store.get().ui.selected = r.id; RP.store.save(); }
    });
  }

  return { render: render, refresh: refresh, all: all, byId: byId, playable: playable, genres: genres, list: list };
})();
