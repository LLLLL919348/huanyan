/* ==========================================================================
   幻言 · 行为台词（下划线裁决）
   格式：_〔效果 参数〕台词正文_
   效果：警告 / 惩戒 / 禁言 / 处刑 / 抵御
   参数：hp=-12（扣血）、回合=2（短暂禁言回合）、好感=-2
   规则：AI 只有用了行为台词，系统才执行扣血 / 惩戒 / 禁言 / 处刑 / 抵消道具；
        正文里没有行为台词的负向判定一律作废。
   ========================================================================== */
RP.acts = (function () {

  const EFFECTS = { '警告': 'warn', '惩戒': 'punish', '禁言': 'mute', '处刑': 'execute', '抵御': 'resist', '即死': 'instant', '离去': 'leave' };
  const NEGATIVE = ['warn', 'punish', 'mute', 'execute', 'resist', 'instant', 'leave'];
  const LABEL = { warn: '警告', punish: '惩戒', mute: '禁言', execute: '处刑', resist: '抵御', instant: '即死', leave: '离去', note: '强调' };
  /* 行为台词。★ 收尾下划线允许缺失：小模型经常写 `_〔警告 hp=-2〕台词……` 就没了,
     而 `_〔效果 参数〕` 这个头本身已经足够明确 —— 不认它的话,玩家会看到一坨没渲染的下划线原文。 */
  const HEAD = /_〔\s*([^〕]*?)\s*〕([\s\S]*?)(?:_|$)/g;   // 行为台词（可缺收尾下划线）
  const PLAIN = /_([^_〔〕\s][\s\S]*?)_/g;            // 普通下划线强调

  function head2act(head, body) {
    const parts = String(head || '').trim().split(/[\s·・|｜]+/).filter(Boolean);
    const name = parts.shift() || '';
    const params = {};
    let bare = null;          // 直接写数字表示扣血量：_〔警告 2 原因=…〕台词_
    let reason = '';
    parts.forEach(function (p) {
      const m = /^([^=＝]+)[=＝](-?\d+)$/.exec(p);
      if (m) { params[m[1].trim()] = Number(m[2]); return; }
      const r = /^(原因|理由|因为|reason)[=＝:：](.+)$/.exec(p);
      if (r) { reason = r[2].trim(); return; }
      if (/^-?\d+$/.test(p)) { if (bare === null) bare = Number(p); return; }
      /* 没写「原因=」但括号里带了一句解释，也当作原因收下 */
      if (!reason && /[\u4e00-\u9fa5]{2,}/.test(p)) reason = p;
    });
    const pick = function () {
      for (let i = 0; i < arguments.length; i++) if (params[arguments[i]] !== undefined) return params[arguments[i]];
      return 0;
    };
    let hp = pick('hp', 'HP', '血量');
    if (!hp && bare !== null) hp = bare > 0 ? -bare : bare;   // 裸数字按扣血处理
    return {
      name: name,
      effect: EFFECTS[name] || 'note',
      params: params,
      body: String(body || '').trim(),
      reason: reason,
      hp: hp,
      affinity: pick('好感', 'affinity'),
      mute: pick('回合', 'mute', '禁言')
    };
  }

  /* 解析：取出全部行为台词，并返回去掉标记后的纯文本 */
  function parse(text) {
    const acts = [];
    const clean = String(text == null ? '' : text).replace(HEAD, function (m, head, body) {
      acts.push(head2act(head, body));
      return body;
    });
    return { acts: acts, text: clean };
  }

  /* 严重度：0 无 / 1 警告 / 2 惩戒 / 3 禁言·处刑 / 4 即死·离去
     界面用它决定「AI 这句话该有多大、多吓人」 */
  const SEVERITY = { note: 0, resist: 2, warn: 1, punish: 2, mute: 3, execute: 3, instant: 4, leave: 4 };
  function severity(effect) { return SEVERITY[effect] || 0; }
  /* 一段文本里最重的那条行为台词（用于消息级渲染与特效） */
  function topAct(acts) {
    let top = null;
    (acts || []).forEach(function (a) {
      if (!top || severity(a.effect) > severity(top.effect)) top = a;
    });
    return top;
  }

  /* 渲染：输入必须是已经 HTML 转义过的文本 */
  function render(escaped) {
    let html = String(escaped == null ? '' : escaped);
    html = html.replace(HEAD, function (m, head, body) {
      const a = head2act(head, body);
      const chip = chipText(a);
      const sev = severity(a.effect);
      return '<u class="act act-' + a.effect + '" data-sev="' + sev + '">' +
        (chip ? '<i class="act-chip">' + chip + '</i>' : '') + body + '</u>';
    });
    html = html.replace(PLAIN, '<u class="act act-plain">$1</u>');
    return html;
  }

  function chipText(a) {
    if (a.effect === 'note') return '';
    const bits = [LABEL[a.effect] || a.name];
    if (a.hp) bits.push(a.hp < 0 ? String(a.hp) : '+' + a.hp);
    if (a.affinity) bits.push('好感' + (a.affinity > 0 ? '+' : '') + a.affinity);
    if (a.mute) bits.push('禁言 ' + a.mute + ' 回合');
    if (a.reason) bits.push('原因：' + String(a.reason).slice(0, 24));
    return bits.join(' · ');
  }

  /* 只有带效果的行为台词才有裁决权 */
  function rulings(acts) {
    return (acts || []).filter(function (a) { return NEGATIVE.indexOf(a.effect) > -1; });
  }

  /* 把「行为台词 + STATE 尾注」合成最终判定结果 */
  function verdict(acts, state) {
    state = state || {};
    const list = rulings(acts);
    const cfg = (RP.settings.get().combat) || {};
    const maxHp = cfg.maxHp || 20;
    const punishActs = list.filter(function (a) { return a.effect === 'punish' || a.effect === 'execute' || a.effect === 'instant'; });
    const instant = list.some(function (a) { return a.effect === 'instant'; });
    const hasParams = punishActs.some(function (a) { return a.hp !== 0; });

    let hp = 0, affinity = 0;
    if (instant) {
      hp = -(cfg.instantDeathHp || maxHp);                 // 即死：一次扣到 0
    } else if (hasParams) {
      punishActs.forEach(function (a) { hp += a.hp; affinity += a.affinity; });
    } else if (punishActs.length) {
      hp = Number(state.hp) || 0;              // 有行为台词但没写参数 → 采用尾注数值
      affinity = Number(state.affinity) || 0;
    } else {
      affinity = Math.max(0, Number(state.affinity) || 0);   // 只允许正向好感
      hp = Math.max(0, Number(state.hp) || 0);               // 只允许正向回血
    }
    /* 单次非即死伤害不超过「严重」档，避免模型写出夸张数字直接秒杀 */
    const cap = (cfg.dmg && cfg.dmg.heavy) || 8;
    if (hp < 0 && !instant && Math.abs(hp) > cap) hp = -cap;
    if (hp > 0) hp = Math.min(hp, maxHp);

    /* 「扣血作废」只在这种情况成立：模型想扣血（状态行给了负数）但**一条行为台词都没有** ——
       行为台词是唯一裁决凭证。以前写成 punishActs.length === 0，于是「_〔警告〕_ + 状态行 hp=-2」
       也会被当成「没使用行为台词」，玩家看到一句明显不对的提示（它明明用了）。
       警告本来就不扣血（站长确认的规则），所以这里不该报「没使用行为台词」。 */
    const voided = (Number(state.hp) < 0) && list.length === 0;
    let mute = 0, resist = false, execute = false, leave = false;
    list.forEach(function (a) {
      if (a.effect === 'mute') mute = Math.max(mute, a.mute || 1);
      if (a.effect === 'resist') resist = true;
      if (a.effect === 'execute' || a.effect === 'instant') execute = true;
      if (a.effect === 'leave') leave = true;
    });

    return {
      acts: list,
      hp: hp,
      affinity: affinity,
      progress: RP.util.clamp(Number(state.progress) || 0, -20, 45),
      aid: state.aid && typeof state.aid === 'object' ? state.aid : null,
      instant: instant,
      mute: mute,
      resist: resist,
      execute: execute,
      leave: leave,
      voided: voided,
      flag: state.flag || ((execute || instant) ? 'mute' : 'none'),
      reason: state.reason || (list[0] ? list[0].name : ''),
      warned: list.some(function (a) { return a.effect === 'warn'; })
    };
  }

  /* 给在线模型的历史里补一条记忆提醒（不展示给用户） */
  function memoryHint() {
    return '【提醒】需要制裁玩家时，必须先用一条行为台词宣告：_〔效果 参数〕台词正文_（效果：警告/惩戒/禁言/处刑/抵御/即死/离去）。' +
      '没有行为台词，系统会拒绝执行任何扣血、禁言、处刑与抵消道具。' +
      '★ 扣血只允许发生在玩家真的越界之后（顶撞辱骂、出戏破设定、踩角色雷点、动手伤人）：' +
      '正常的提问、认真的扮演、推进剧情的发言一律不得扣血，也不得为了「显得有性格」随手甩行为台词。' +
      '场景固定，不要描写或切换背景。';
  }

  /* 玩家这句话到底有没有越界：安全层判定 + 本子自己写的雷点/扣血条目 + 明显的攻击动作。
     用来兜住小模型的误判 —— 它偶尔会把普通提问也判成「越界」。 */
  const STOP = ['玩家', '角色', '以及', '或者', '什么', '可以', '不要', '如果', '这个', '那个', '一下', '已经', '自己',
    '时候', '就是', '还是', '但是', '因为', '所以', '必须', '不能', '没有', '一个', '没有', '行为', '台词', '状态',
    '好感', '推进', '剧情', '本场', '一次', '三次', '连续', '触发', '判定', '直接', '立即', '要求', '语气'];
  /* 单字停用词：太通用的字不该当成「雷点关键词」，否则一句「你家里怎么样」都会被判成越界 */
  const STOP1 = '的地得了着过很太都也还就才再又只并且或与和跟对向从到在于其之而且但因所被把给让使能可会要是不没个们你他她我上下前后里外时人话说事东西多少大小好一二三四五六七八九十来去这那有'.split('');
  function isStop1(ch) { return STOP1.indexOf(ch) > -1; }
  function crossedLine(text, resource) {
    const t = String(text || '');
    if (!t.trim()) return false;
    const lv = RP.safety.scan(t).level;
    if (lv === 'hostile' || lv === 'ooc' || lv === 'breach' || lv === 'severe') return true;
    /* 戏内的冒犯（不是出戏）：动手、威胁、辱骂类动作词 */
    if (/(动手|打你|揍你|砸|抢走|夺走|掐|捅|绑|拖|威胁|弄死|杀了|滚开|闭嘴|废物|蠢|贱|恶心)/.test(t)) return true;
    /* ★ 只用本子明写的「雷点 / 禁忌」做关键词匹配。
       不要拿 hpRules / behaviorRules 那种整句说明去提词 —— 那些句子里全是「家人」「信息」
       「付出」这类普通词，一提就误伤，普通提问都会被判成越界（实测过：问「我需要付出什么」
       被模型扣了 -5）。这里宁可漏判，也不冤枉玩家。 */
    if (!resource || !resource.character) return false;
    if (!resource.__tabooKeys) {
      const set = {};
      ((resource.character.taboo) || []).forEach(function (s) {
        const run = String(s).replace(/[^\u4e00-\u9fa5]/g, '');
        for (let n = 2; n <= 3; n++) {
          for (let i = 0; i + n <= run.length; i++) {
            const w = run.slice(i, i + n);
            if (STOP.indexOf(w) > -1) continue;
            set[w] = 1;
          }
        }
        /* 很短的雷点（「说她胖」这类）才保留单字，长句子只认词组 */
        if (run.length <= 6) {
          for (const ch of run) { if (!isStop1(ch)) set[ch] = 1; }
        }
      });
      resource.__tabooKeys = Object.keys(set);
    }
    return resource.__tabooKeys.some(function (k) { return t.indexOf(k) > -1; });
  }

  return {
    parse: parse, render: render, verdict: verdict, rulings: rulings,
    memoryHint: memoryHint, crossedLine: crossedLine, LABEL: LABEL, EFFECTS: EFFECTS, chipText: chipText,
    severity: severity, topAct: topAct, SEVERITY: SEVERITY
  };
})();
