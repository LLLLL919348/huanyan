/* ==========================================================================
   幻言 · 新增资源（访客投稿）
   谁能用：持有有效邀请码的人（服务端会再校验一次，前端只是先问）。
   投到哪：POST /api/submit → 服务器写进 data/submissions.json 的审核池，
           不进线上资源库；站长在后台「审稿」里通过后才变成资源。
   为什么这样设计：站点不提供 AI 模型、也没有内容审核团队，
           所以新本子必须经人工过一遍才能上线。
   ========================================================================== */
RP.submit = (function () {
  const FIELDS = [
    { k: 'name', label: '本子名', ph: '例如：夜航船', need: true, max: 40 },
    { k: 'subtitle', label: '副标题／题材', ph: '古风 · 权谋 · 悬疑', max: 60 },
    { k: 'brief', label: '一句话简介', ph: '卡片上那一行，尽量 20 字以内', max: 80, rows: 2 },
    { k: 'teaser', label: '悬念句', ph: '卡片底部那句钩子', max: 60, rows: 2 },
    { k: 'intro', label: '开场导语', ph: '玩家推门进去看到的第一段', rows: 4 },
    { k: 'world', label: '世界观', ph: '地点、时代、这个世界的规矩', rows: 5 },
    { k: 'userRole', label: '玩家身份', ph: '玩家是谁、手里有什么、为什么来', rows: 4 },
    { k: 'plot', label: '剧情主线', ph: '起 / 承 / 转，最后给玩家两三条可选方向', rows: 6 },
    { k: 'charName', label: '角色名', ph: '例如：沈明烛', max: 20 },
    { k: 'charTitle', label: '角色身份', ph: '司灯署掌灯人', max: 60 },
    { k: 'charPersonality', label: '角色性格', ph: '他/她是什么样的人，怕什么，想要什么', rows: 4 },
    { k: 'charSpeech', label: '说话方式', ph: '语速、称呼、口头习惯', rows: 3 },
    { k: 'taboo', label: '雷点（一行一条）', ph: '当着他的面数人数\n抢他手里的本子', rows: 3 },
    { k: 'plotReminder', label: '开局提醒（一行一条）', ph: '头几条写「玩家已知」，别让玩家一头雾水', rows: 4 },
    { k: 'openingHints', label: '开局提示句（一行一条）', ph: '输入框上方的快捷句，两句以内', rows: 3 },
    { k: 'prompt', label: '提示词（模型真正读的那段）', ph: '【角色】…【世界观与场景】…【玩家已知】…【剧情规则】…【行为规则】…【输出格式】…', rows: 12, need: true }
  ];

  function esc(s) { return RP.util.esc(s); }
  function mask() {
    let m = document.getElementById('submitMask');
    if (m) return m;
    m = document.createElement('div');
    m.id = 'submitMask';
    m.className = 'submit-mask';
    document.body.appendChild(m);
    return m;
  }
  function close() { const m = document.getElementById('submitMask'); if (m) m.remove(); }

  function open() {
    const gate = RP.invite && RP.invite.info ? RP.invite.info() : { unlocked: true, enabled: false };
    if (gate.enabled && !gate.unlocked) {
      RP.invite.open(function () { open(); });
      return;
    }
    const m = mask();
    m.innerHTML = '<div class="submit-panel" role="dialog" aria-modal="true">' +
      '<div class="submit-head"><div><h3>新增资源</h3>' +
        '<p>写好之后提交，站长审核通过才会出现在资源列表里（先标为「预约中」）。每个人写的本子都要过一遍人工，通常一两天。</p></div>' +
        '<button class="submit-x" id="submitClose" title="关闭">×</button></div>' +
      '<div class="submit-body">' +
        FIELDS.map(function (f) {
          const tag = f.rows && f.rows > 1 ? '<textarea class="submit-ipt" data-f="' + f.k + '" rows="' + f.rows + '" maxlength="12000" placeholder="' + esc(f.ph || '') + '"></textarea>'
            : '<input class="submit-ipt" data-f="' + f.k + '" maxlength="' + (f.max || 4000) + '" placeholder="' + esc(f.ph || '') + '">';
          return '<div class="submit-fld' + (f.k === 'prompt' ? ' wide' : '') + '">' +
            '<label>' + esc(f.label) + (f.need ? ' <em>必填</em>' : '') + '</label>' + tag + '</div>';
        }).join('') +
        '<div class="submit-tip">' +
          '<b>关于提示词</b>：这就是模型的剧本。至少要写清【角色】【世界观与场景】【玩家已知】【剧情规则】【行为规则】【输出格式】。' +
          '「玩家已知」尤其重要 —— 玩家只知道自己身份里写明的事，别让他去回答他不知道的名字。' +
          '页面右上角「导出剧本模板」可以拿一份长春版参考（资源页里能下载已上线本子的完整内容）。' +
        '</div>' +
      '</div>' +
      '<div class="submit-foot">' +
        '<span id="submitState"></span>' +
        '<button class="btn" id="submitCancel">取消</button>' +
        '<button class="btn primary" id="submitSend">提交审核</button>' +
      '</div></div>';

    const state = m.querySelector('#submitState');
    function val(k) { const el = m.querySelector('[data-f="' + k + '"]'); return el ? el.value : ''; }
    function lines(k) { return val(k).split('\n').map(function (s) { return s.trim(); }).filter(Boolean); }
    function setState(txt, err) { state.textContent = txt || ''; state.className = err ? 'err' : ''; }

    m.querySelector('#submitClose').addEventListener('click', close);
    m.querySelector('#submitCancel').addEventListener('click', close);
    m.addEventListener('click', function (e) { if (e.target === m) close(); });
    m.querySelector('#submitSend').addEventListener('click', function () {
      const name = val('name').trim();
      const prompt = val('prompt');
      if (!name) { setState('先给本子起个名字', true); return; }
      if (prompt.trim().length < 300) { setState('提示词太短了（至少 300 字）：模型拿不出像样的演绎', true); return; }
      const pk = lines('plotReminder');
      if (pk.length < 3) { setState('开局提醒至少写 3 条 —— 不然玩家进来不知道自己在哪、要干嘛', true); return; }
      const draft = {
        name: name,
        subtitle: val('subtitle').trim(),
        genres: val('subtitle').split(/[·、,\/\s]+/).map(function (s) { return s.trim(); }).filter(Boolean).slice(0, 5),
        brief: val('brief').trim(),
        teaser: val('teaser').trim(),
        intro: val('intro').trim(),
        world: val('world').trim(),
        userRole: val('userRole').trim(),
        plot: val('plot').trim(),
        character: {
          name: val('charName').trim(),
          title: val('charTitle').trim(),
          personality: val('charPersonality').trim(),
          speech: val('charSpeech').trim(),
          taboo: lines('taboo')
        },
        plotReminder: pk,
        openingHints: lines('openingHints'),
        prompt: prompt
      };
      setState('提交中…');
      this.disabled = true;
      const btn = this;
      fetch('/api/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-invite-grant': (function () { try { return localStorage.getItem('rp_invite_grant') || ''; } catch (e) { return ''; } })() },
        body: JSON.stringify({ draft: draft })
      }).then(function (r) { return r.json().catch(function () { return null; }).then(function (d) { return { ok: r.ok, status: r.status, d: d }; }); })
        .then(function (res) {
          btn.disabled = false;
          if (!res.ok || !res.d || !res.d.ok) {
            setState((res.d && res.d.error) || ('提交失败 HTTP ' + res.status), true);
            return;
          }
          m.querySelector('.submit-panel').innerHTML =
            '<div class="submit-head"><div><h3>已提交，等审核</h3></div></div>' +
            '<div class="submit-body"><p>收到「' + esc(name) + '」。站长在后台「审稿」里通过之后，它会以「预约中」的状态出现在资源列表；' +
            '通过前不会出现在前台，也不会被别人看到。</p><p class="submit-tip">如果三天内没动静，可以带着本子名问一句。</p></div>' +
            '<div class="submit-foot"><span></span><button class="btn primary" id="submitDone">知道了</button></div>';
          const done = m.querySelector('#submitDone');
          if (done) done.addEventListener('click', function () { close(); if (RP.resources && RP.resources.render) RP.resources.render(); });
          if (RP.app && RP.app.toast) RP.app.toast('投稿已提交 · 等站长审核', 'ok');
        })
        .catch(function (e) {
          btn.disabled = false;
          setState('网络出错：' + (e && e.message ? e.message : e), true);
        });
    });
  }

  return { open: open, close: close };
})();
