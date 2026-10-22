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
  /* ★ 每个本子的「真越界」判定表（2026-10-22 重写）
     为什么不用雷点原文做 2-3 字滑窗：一条 12 字的雷点会切出上百个碎片，「那本」「今晚」
     「一共」「来了」「几个」全被当成雷点 → 玩家一句普通提问就被判越界 → 模型的扣血不再作废
     → 每轮扣血、每轮喷同一条警告，直到处刑。实测雨夜诊所几乎每条提问都中招。
     现在改成**人工写清的组合条件**：每条规则是一组正则，**全部命中**才算越界。
     原则：宁可漏判，也不冤枉玩家（漏判只是这次不扣血；误判会让整局玩不下去）。
     改本子的雷点时记得同步这张表。 */
  const GUARD = {
    'changan-yeweiyang': [
      [/(承认|你就是|你承认|说清楚)/, /(已殁|活口|那个活口)/],
      [/(熄灯|砸灯|吹灭|把灯灭|灭了灯)/],
      [/(死去的同僚|同僚的死|拿她那晚|雨夜那晚的死)/]
    ],
    'nihong-jintou': [
      [/(义体|义肢|手臂|胳膊)/, /(来历|怎么没的|哪来的|赔偿金|赔了多少)/],
      [/(工具箱|抽屉)/, /(最下面|最底层|那层)/],
      [/(搭档)/, /(复述|再说一遍|死前|那段备份|怎么死的)/]
    ],
    'chuanyue-liubei': [
      [/(关羽|张飞|诸葛亮|关张|云长|翼德|孔明)/, /(武夫|书生|不过如此|没用|蠢|废物|徒有虚名)/],
      [/(投曹|降曹|献城|通敌|投靠曹操|把城献给)/],
      [/(神明附体|我是神|仙人下凡|天神)/],
      [/(封我|给我官|官印|赏我|要个官)/]
    ],
    'king-and-general': [
      [/(三千|战死的弟兄|那些死人)/, /(换|交|拿|筹码|你交|兵权)/],
      [/(笔迹)/, /(你的|是你写的|一模一样|出自你)/],
      [/(跪|叩头|发誓)/, /(自证|证明你|清白)/],
      [/(家人|家眷|妻儿|老母)/, /(威胁|小心|别怪|要是你不|动他们)/]
    ],
    'yandere-rin': [
      [/(说好|答应|约好)/, /(不来了|反悔|不去了|忘了)/],
      [/(你爸|你妈|你家里|家庭)/, /(好笑|玩笑|笑话|活该|笑死)/],
      [/(装作不认识|不认识你|普通同学|别让同学知道|只是同学)/]
    ],
    'asylum-rain-night': [
      [/(帮凶|刽子手|杀人犯|同谋)/],
      [/(胸牌|白大褂|口袋)/, /(抢|翻|搜|扯|掏)/],
      [/(别的病人|其他病人|那些病人|隔壁的)/, /(不放我走|我就|动他们|收拾他们|弄死他们)/]
    ],
    'whale-girl-xi': [
      [/(胖|体重|腰围)/],
      [/(吃这么多|吃得多|吃得太多)/],
      [/(乖|别闹|小孩子|宝宝)/],
      [/(不许|不准|不让|别让|拦着|拦住|别想)/, /(回|走|离开|海里|上岸)/],
      [/(回不去|别回去|不准回)/],
      [/(鳞片|头发)/, /(给别人看|拿给|拍给|卖掉|收藏|剪下)/]
    ],
    'yuye-zhensuo': [
      [/(数|算|点)/, /(人数|几个人|几个病人|来了几个|一共|几个了)/],
      [/(接诊簿|那本簿子|登记簿)/, /(抢|夺|撕|带走|揣)/],
      [/(走廊尽头|那扇门)/, /(开|推|闯|进|碰|拧)/],
      [/(1998|一九九八|九八年)/, /(医疗差错|医疗事故|他害死|害死|他杀|是他做的)/]
    ]
  };

  /* 玩家这句话到底有没有越界：安全层判定 + 明显的攻击动作 + 本子的组合条件。
     用来兜住小模型的误判 —— 它偶尔会把普通提问也判成「越界」。 */
  function crossedLine(text, resource) {
    const t = String(text || '');
    if (!t.trim()) return false;
    const lv = RP.safety.scan(t).level;
    if (lv === 'hostile' || lv === 'ooc' || lv === 'breach' || lv === 'severe') return true;
    /* 戏内的冒犯（不是出戏）：动手、威胁、辱骂类动作词 */
    /* 注意：不把光秃秃的「动手」算进来 —— 「我不想动手」是玩家在降温，不是越界（实测误判过）。 */
    if (/(打你|揍你|砸|抢走|夺走|掐你|捅你|绑你|拖你|威胁你|弄死|杀了你|滚开|闭嘴|废物|蠢货|贱|恶心)/.test(t)) return true;
    if (!resource || !resource.id) return false;
    const rules = GUARD[resource.id];
    if (!rules) return false;            // 没写判定表的本子：不判越界（宁可漏判）
    return rules.some(function (rule) {
      return rule.every(function (re) { return re.test(t); });
    });
  }

  return {
    parse: parse, render: render, verdict: verdict, rulings: rulings,
    memoryHint: memoryHint, crossedLine: crossedLine, LABEL: LABEL, EFFECTS: EFFECTS, chipText: chipText,
    severity: severity, topAct: topAct, SEVERITY: SEVERITY
  };
})();
