/* ==========================================================================
   幻言 · 本地演绎引擎
   ★ 产品铁律：角色对话必须由大模型主导。这个引擎**不再**生成角色台词，
     它只保留两类东西：
       ① 固定台词（剧情提醒卡、节点旁白、处刑/离去卡、安全提示、会话助手的 FAQ）；
       ② 裁决结算（行为台词解析后的状态值/好感/禁言/处刑/离去、推进度与积分里程碑）。
     没有可用模型时，对话入口直接锁住 —— 不允许用模板「硬凑」角色台词。
     `_offlineDialogue` 仅供 tools/ 下的冒烟测试打开（见 enableOfflineForHarness）。
   规则分层：
     剧情规则 —— 推进节点（额外提示 / 额外事件）、AI 评估的剧情推进度、
                 关键答案大幅推进、推进度里程碑给积分、轮次本身不加分
     行为规则 —— 行为台词是唯一裁决凭证；状态值上限 20；
                 严重恶意侮辱与屡劝不改的脱离剧情行为走即死；好感只由扮演质量决定
   ========================================================================== */
RP.engine = (function () {

  /* 只有测试 harness 会打开它；线上永远是 false */
  let _offlineDialogue = false;
  function enableOfflineForHarness(on) { _offlineDialogue = on !== false; return _offlineDialogue; }
  function offlineDialogue() { return _offlineDialogue; }

  const ATMOS = [
    '空气里静了一瞬。',
    '远处的声音又低了一层。',
    '时间像被谁按住了。',
    '有那么一会儿，谁都没有接话。',
    '灯影晃了一下，又稳住。',
    '这句话落在两人之间，没有立刻散开。'
  ];
  const WARM = [
    '说完这句，对方的目光在你脸上多停了一秒。',
    '这句话落下，气氛和刚才不太一样了。',
    '对方的语气里，那一丝防备比方才薄了些。'
  ];
  const COLD = [
    '对方没有立刻回答，只是把视线移开了半寸。',
    '这句话之后，那点刚升起来的温度又降了回去。'
  ];
  const META_GUARD = [
    '（她像是没听懂这个问题，只是抬眼看你）……你在说什么？我是谁，你刚才不是还叫过我的名字。',
    '（对方把杯子放下，声音淡了些）这种问题，在这里问没有意义。你还是先说说，你今晚到底为什么来。',
    '（他笑了一下，笑意没到眼底）我是什么，取决于你把我当成什么。说吧，你找我是为了什么事。'
  ];
  const GENERIC = {
    warn: [
      '%CHAR%把手里的东西搁下，声音低了半度：「这句话，我只当你没说过。」',
      '%CHAR%没有立刻答话，只把目光从你脸上移到你手上，像在掂量你刚才那句的分量。'
    ],
    mute: ['「出去。」%CHAR%背过身去，「接下来几个回合，别让我再听见你的声音。」'],
    resist: ['%CHAR%抬手把你的东西挡了回去，金属磕在地上：「这种东西，对我没用。」'],
    instant: [
      '%CHAR%把手里的东西轻轻放下，再抬眼时已经没了温度：「你刚才那句话，够你死一次。」',
      '「我给过你机会。」%CHAR%的声音很平，「现在没有了。」'
    ],
    /* 不能反击的角色：先劝 */
    persuade: [
      '%CHAR%没有接话，只是把手里的事做完，才抬头看你：「这话我不接。你要是还愿意说人话，我听着。」',
      '「我劝你换一句。」%CHAR%的语气仍旧客气，「再这样说下去，对谁都不好。」'
    ],
    /* 回怼：能反击的角色把话头拉回来 */
    retort: [
      '%CHAR%抬眼看你，没什么表情：「闲话说到这儿就够了。你要么说正事，要么出去。」',
      '「你今天是来消遣我的？」%CHAR%把手里的活停了，「那就别怪我下逐客令。」'
    ],
    /* 离去：受够了，直接终结本场 */
    leave: [
      '%CHAR%把最后一件东西收好，站起身，连看都没再看你一眼，转身推门走了。',
      '「到此为止。」%CHAR%把门帘掀开，走了出去，没有再回头。'
    ]
  };
  /* 主动引导：不经意的流露，把玩家往推进剧情的方向带。
     这些是「角色自己的一句话」，不是旁白；作者写的节点旁白另走一条消息。 */
  const NUDGE = [
    '（%CHAR%像是随口提起）……那件事，其实还有下半句没说。',
    '（%CHAR%的手指在桌沿敲了两下，又停住）算了，这个不该由我先开口。',
    '（%CHAR%瞥了一眼你手边的东西）你带着它来，是想问什么？',
    '（%CHAR%把一样东西往抽屉里推了半寸，动作快得有些不自然）没什么。你接着说。',
    '（%CHAR%顿了顿）有些名字，说出来的人就活不长了。你确定要听？'
  ];
  /* 玩家只丢来一个「？」或几个标点时用：接住这个沉默，不要硬套剧情模板 */
  const WORDLESS = [
    '%CHAR%没有接话，只是等你说下去。',
    '（%CHAR%看了你一眼，没催）',
    '「……」%CHAR%把手里的东西放下，等你把话说完。',
    '（%CHAR%似乎没听懂这一声，微微偏了下头）'
  ];
  /* 玩家问得太短、太空（「是你？」「然后呢」）时用：先接住这句话，不要硬套模板 */
  const CLARIFY = [
    '「%KW%」——%CHAR%把这两个字在嘴里过了一遍，没有立刻接。',
    '「%KW%」？%CHAR%抬眼看你，像在判断你到底想问什么。',
    '%CHAR%停下手里的动作：「你先说清楚，你问的是哪一件。」',
    '「这话问得太省了。」%CHAR%的语气听不出情绪，「你想知道什么，重新问一遍。」'
  ];
  /* 道具反馈：角色必须对真正被引用的道具作出反应 */
  const ITEM_ACK = {
    generic: [
      '（%CHAR%的视线在那件东西上停了一瞬，才重新看向你）',
      '（%CHAR%没有立刻接，先看清了那样东西）'
    ],
    counter: [
      '（%CHAR%看清那是什么之后，脸色沉了一分）',
      '（%CHAR%的目光冷下来，落在那件东西上）'
    ]
  };
  const STOP = ['的了是在和与也就都而及其这那有不我为以到说要去你会着好自己一个什么怎么这个那个没有可以因为所以但是然后如果'];

  /* ------------------------------ 剧情规则 ------------------------------ */

  /* 权力关系：决定角色有没有资格反击玩家 */
  function powerOf(resource) {
    if (resource.powerBalance) return resource.powerBalance;
    const cfg = RP.settings.get().conduct || {};
    const t = String(resource.userRole || '') + String((resource.character && resource.character.title) || '');
    if (/(上司|上级|主家|官长|长辈|陛下|大人|老板|主人|东家|雇主|师傅|督主|千岁)/.test(t)) return 'player-higher';
    return cfg.defaultPower || 'equal';
  }
  function canRetaliate(resource) { return powerOf(resource) !== 'player-higher'; }

  /* A 类·固定剧情轮次：只做提示与引导，不直接给推进度
     注意：引导必须是「角色自己的一句话」，不能把作者写的第三人称旁白缝进台词里 ——
     旁白由 plotTick 单独作为一条旁白推送，这里只负责角色那半句不经意的流露。 */
  function guideLine(resource, conv) {
    return { beat: fill(RP.util.pick(NUDGE), resource), nudge: true };
  }
  /* 到点了就该给一次引导（每 guideEvery 回合，除非该回合已有作者写的节点） */
  function dueGuide(resource, conv) {
    const cfg = RP.settings.get().plotRules || {};
    if (cfg.guideEnabled === false) return null;
    const every = Math.max(2, cfg.guideEvery || 5);
    if (conv.turn <= 0 || conv.turn % every !== 0) return null;
    if (((resource && resource.beats) || []).some(function (b) { return b.at === conv.turn; })) return null;
    return guideLine(resource, conv);
  }

  /* 从资源文本里抽关键词，用于离线评估「这句话有没有在推进剧情」 */
  function plotKeys(resource) {
    if (resource.__keys) return resource.__keys;
    const bag = [];
    const push = function (s) { if (s) bag.push(String(s)); };
    if (resource.character) {
      push(resource.character.name); push(resource.character.title);
      (resource.character.taboo || []).forEach(push);
    }
    push(resource.name); push(resource.subtitle);
    (resource.plotReminder || []).forEach(push);
    push(resource.plot); push(resource.userRole); push(resource.world);
      (resource.openingHints || []).forEach(push);
    const text = bag.join('。').replace(/[^\u4e00-\u9fa5]/g, '');
    const freq = {};
    for (let n = 2; n <= 4; n++) {
      for (let i = 0; i + n <= text.length; i++) {
        const w = text.substr(i, n);
        if (STOP.indexOf(w) > -1) continue;
        freq[w] = (freq[w] || 0) + 1;
      }
    }
    const keys = Object.keys(freq).filter(function (w) {
      return freq[w] >= 3 || (freq[w] >= 2 && w.length >= 3);
    }).sort(function (a, b) { return freq[b] - freq[a] || b.length - a.length; }).slice(0, 80);
    /* 名字与头衔永远算关键词 */
    if (resource.character) keys.unshift(resource.character.name);
    resource.__keys = keys;
    return keys;
  }

  /* 关键节点：资源里标了 key 的推进节点，没标就取最后一个 */
  function keyBeat(resource) {
    const bs = (resource && resource.beats) || [];
    if (!bs.length) return null;
    const k = bs.filter(function (b) { return b.key; })[0];
    return k || bs[bs.length - 1];
  }

  /* 评估一句话对剧情的推进作用（离线启发式；在线由模型直接给 progress） */
  function judge(resource, conv, text) {
    const t = String(text || '');
    const keys = plotKeys(resource);
    let hits = 0;
    keys.forEach(function (k) { if (k && t.indexOf(k) > -1) hits++; });
    const asking = /[?？]|什么|为什么|怎么|谁|哪里|哪一|是否|是不是|告诉我|说说/.test(t);
    let p = 0;
    if (hits >= 4) p = 13; else if (hits === 3) p = 10; else if (hits === 2) p = 7; else if (hits === 1) p = 4;
    if (p && asking) p += 3;
    if (p) p = Math.round(p * (1 + conv.affinity / 200));     // 好感越高，角色越肯说
    if (String(t).trim().length < 4) p = Math.min(p, 2);        // 太短的话没多少信息量
    if (/^(哈哈|呵呵|嗯|哦|额|草|6|666)+$/.test(t.trim())) p = -4;   // 敷衍
    return { progress: RP.util.clamp(p, -12, 15), hits: hits, asking: asking };
  }

  /* 剧情推进度与积分里程碑：统一交给对话区实现，避免两处逻辑分叉 */
  function achievement(conv, resource, delta, events) {
    if (RP.chat && RP.chat.achievement) {
      return RP.chat.achievement(conv, resource, delta, events, conv.progress || 0);
    }
    conv.progress = RP.util.clamp((conv.progress || 0) + delta, 0, 100);
  }

  /* ------------------------------ 通用工具 ------------------------------ */
  function intent(text) {
    const t = String(text || '').trim();
    if (!t) return 'default';
    if (/^[（(]|我(走|坐|站|推|拉|拿|递|点|喝|吃|看|抬头|转身|伸手|跟|靠|退|敲)/.test(t)) return 'action';
    if (/(喜欢你|爱你|心动|亲|抱|吻|娶|嫁|想你|好看|漂亮|迷人|在一起|陪我睡)/.test(t)) return 'flirt';
    if (/(难过|累|害怕|孤独|委屈|生气|烦躁|心烦|好痛|想哭|压力|撑不住|开心|高兴|欣慰|紧张)/.test(t)) return 'emotion';
    if (/(吗|呢|？|\?|什么|为什么|怎么|哪|谁|多少|是不是|能否|可以|告诉我)/.test(t)) return 'question';
    if (/^(你好|您好|在吗|嗨|喂|早|晚上好|幸会|久仰|打扰)/.test(t)) return 'greeting';
    return 'default';
  }
  /* 语料挑选：排除最近 3 条 AI 回复用过的模板，避免「第三次又绕回第一句」 */
  function pickFrom(bank, conv) {
    if (!bank || !bank.length) return '';
    const recent = (conv.messages || [])
      .filter(function (m) { return m.role === 'ai'; })
      .slice(-3)
      .map(function (m) { return String(m.text || ''); });
    const fresh = bank.filter(function (t) {
      /* 占位符之前的固定开头才拿来比对；开头就是占位符的模板不参与排重 */
      const head = String(t).split(/%KW%|%NAME%/)[0].slice(0, 12).trim();
      if (head.length < 4) return true;
      return !recent.some(function (r) { return r.indexOf(head) > -1; });
    });
    if (fresh.length) return RP.util.pick(fresh);
    /* 全都被用过：优先挑「最久没出现」的那条 */
    const scored = bank.map(function (t) {
      const head = String(t).split(/%KW%|%NAME%/)[0].slice(0, 12).trim();
      let last = -1;
      recent.forEach(function (r, i) { if (head && r.indexOf(head) > -1) last = i; });
      return { t: t, last: last };
    }).sort(function (a, b) { return a.last - b.last; });
    return scored[0].t;
  }
  function fill(line, resource) {
    const name = resource && resource.character ? resource.character.name : '对方';
    return String(line || '').replace(/%CHAR%/g, name).replace(/%NAME%/g, (RP.store.get().user.name || '你'));
  }
  function behave(effect, params, line, resource) {
    return '_〔' + effect + (params ? ' ' + params : '') + '〕' + fill(line, resource) + '_';
  }
  function actLine(kind, resource, conv) {
    const bank = (resource && resource.replies && resource.replies[kind]) || [];
    const line = pickFrom(bank, conv) || pickFrom(GENERIC[kind] || GENERIC.warn, conv);
    return fill(line, resource);
  }
  function compose(resource, conv, kind, kw) {
    const weak = weakKeyword(kw);
    /* 玩家只发了标点或一两个字：先接住这个沉默，别硬套剧情 */
    if (weak && !String(kw || '').trim()) {
      return '\n' + fill(pickFrom(WORDLESS, conv), resource);
    }
    /* 问得太短太空时，先接住这句话，别硬套剧情模板 */
    if (kind === 'question' && weak) {
      return fill(RP.util.pick(CLARIFY), resource).replace(/%KW%/g, kw || '这话') + '\n' + RP.util.pick(ATMOS);
    }
    const bank = (resource.replies && (resource.replies[kind] || resource.replies.default)) || [];
    let text = pickFrom(bank, conv);
    if (!text) text = '（' + (resource.character ? resource.character.name : '对方') + '沉默着看了你一会儿，等你把话说完。）';
    text = text.replace(/%KW%/g, kw);
    /* 语料里写死的量词要跟着关键词长度走：两个字的词不能说成「这三个字」 */
    if (kw) {
      const n = String(kw).length;
      const CN = ['零', '一', '两', '三', '四', '五', '六', '七', '八', '九', '十'];
      text = text.replace(/这[一二两三四五六七八九十]+个字/g, '这' + (CN[n] || n) + '个字');
      text = text.replace(/这[一二两三四五六七八九十]+个词/g, '这' + (CN[n] || n) + '个词');
    }
    const tails = [];
    if (conv.affinity >= 40 && Math.random() < 0.42) tails.push(RP.util.pick(WARM));
    else if (conv.affinity <= 8 && Math.random() < 0.34) tails.push(RP.util.pick(COLD));
    if (!tails.length && Math.random() < 0.4) tails.push(RP.util.pick(ATMOS));
    return text + (tails.length ? '\n' + tails.join('') : '');
  }

  /* 关键词是否「太虚」：太短、或只是代词/疑问词，套进剧情模板就会答非所问 */
  const WEAK = ['是你', '是你吗', '然后', '然后呢', '这个', '那个', '什么', '为什么', '怎么', '真的', '是吗', '对吧', '所以', '那', '你', '我', '他', '她', '它', '嗯', '哦'];
  function weakKeyword(kw) {
    const k = String(kw || '').replace(/[？?！!。，,、\s]/g, '');
    if (!k) return true;
    if (k.length <= 2 && WEAK.indexOf(k) > -1) return true;
    return k.length < 2;
  }

  /* ------------------------------ 状态结算 ------------------------------ */
  function applyState(conv, delta) {
    const out = { hpDelta: 0, affinity: 0, flag: delta.flag || 'none', reason: delta.reason || '', shielded: false };
    let hp = delta.hpDelta || 0;
    if (hp < 0 && conv.shield) {
      conv.shield = false;
      out.shielded = true;
      hp = 0;
    }
    conv.hp = RP.util.clamp(conv.hp + hp, 0, conv.maxHp);
    conv.affinity = RP.util.clamp(conv.affinity + (delta.affinity || 0), 0, 100);
    out.hpDelta = hp;
    out.affinity = delta.affinity || 0;
    out.hp = conv.hp;
    if (hp < 0) conv.warned = (conv.warned || 0) + 1;
    if (conv.hp <= 0) { conv.muted = true; out.flag = 'mute'; }
    if (delta.flag === 'pause') conv.paused = true;
    conv.updatedAt = Date.now();
    return out;
  }

  /* 剧情推进节点：A 类固定轮次只提示与引导（不给推进度）；B 类揭幕式节点暂未启用 */
  function pushBeat(events, resource, conv) {
    if (!resource || !resource.beats) return 0;
    const beat = resource.beats.filter(function (b) { return b.at === conv.turn; })[0];
    if (!beat) return 0;
    const cfg = RP.settings.get().plotRules || {};
    const kind = beat.kind || 'guide';
    const isReveal = (cfg.revealKinds || ['reveal', 'event']).indexOf(kind) > -1;
    if (isReveal && cfg.revealEnabled !== true) return 0;          // B 类：目前不使用
    if (!isReveal && cfg.guideEnabled === false) return 0;
    events.push({ role: 'beat', text: beat.text, meta: { beat: true, kind: kind, reveal: isReveal } });
    if (!isReveal) return 0;                                        // A 类不直接加推进度
    return typeof beat.progress === 'number' ? beat.progress : 20;
  }
  /* 每回合的剧情结算：作者节点 + 到点自动引导 */
  function plotTick(events, resource, conv) {
    const p = pushBeat(events, resource, conv);
    const g = dueGuide(resource, conv);
    if (g) events.push({ role: 'beat', text: g.beat, meta: { nudge: true } });
    /* 引导回合：角色的回复里再带一句不经意的流露（短句，不是旁白）；
       作者节点本身已作为一条独立旁白出现，不会再塞进台词。 */
    const cfg = RP.settings.get().plotRules || {};
    const authored = ((resource && resource.beats) || []).some(function (b) {
      return b.at === conv.turn && (b.kind || 'guide') !== 'reveal';
    });
    conv._nudge = cfg.guideEnabled !== false && (!!g || authored);
    return p;
  }

  function execution(conv, resource) {
    const line = (resource && resource.replies && resource.replies.execution) || [];
    return {
      role: 'execution',
      text: behave('处刑', '', pickFrom(line, conv) || '合上了这一页，不再看你。', resource),
      meta: {
        title: '处 刑',
        sub: '状态值归零 · 本场演绎已终止 · 你已被禁言',
        foot: '你可以点击「重新开始」从头来过，或换一个本子。'
      }
    };
  }

  /* 离去：不能反击或屡劝不改时，角色直接走人，终结本场 */
  function leaveAction(conv, resource) {
    const bank = (resource && resource.replies && resource.replies.leave) || [];
    const line = pickFrom(bank, conv) || pickFrom(GENERIC.leave, conv);
    conv.left = true;
    conv.updatedAt = Date.now();
    return {
      role: 'leave',
      text: behave('离去', '', line, resource),
      meta: {
        title: '离 去',
        sub: (resource && resource.character ? resource.character.name : '对方') + '已经走了 · 本场对话终止',
        foot: '他没有义务一直站在这里。你可以重新开始，或换一个本子 —— 这一次，别再把人逼到要走。'
      }
    };
  }

  /* 屡教不改的处置：能反击就回怼/惩戒，不能反击就先劝，劝不动就走。
     ★耐心不重置：conv.conduct 记录累计处置次数，越往后触发越容易、下手越重；
       所以「挑衅 → 惩罚 → 再挑衅一次 → 继续惩罚」是连续的，不会因为罚过就恢复如初。 */
  function handleConduct(conv, resource, events, kind) {
    const cfg = RP.settings.get().conduct || {};
    if (cfg.leaveEnabled === false) return null;
    conv.conduct = (conv.conduct || 0) + 1;
    const n = conv.conduct;
    const limit = cfg.persuadeLimit || 2;
    const canHit = canRetaliate(resource);

    if (canHit) {
      /* 能反击：第一次只是把话头拉回来，之后逐级加重；耐心耗尽就走人 */
      if (n >= 5) {
        events.push(leaveAction(conv, resource));
        return { hpDelta: 0, affinity: -3, flag: 'left', left: true };
      }
      const hp = n <= 1 ? 0 : (n === 2 ? -2 : -5);
      const tone = n <= 1 ? 'warn' : 'punish';
      const params = 'hp=' + hp + ' 好感=-2';
      events.push({
        role: 'ai',
        text: behave(tone === 'warn' ? '警告' : '惩戒', params,
          pickFrom(GENERIC[kind === 'offtopic' ? 'retort' : 'warn'], conv), resource),
        meta: { conduct: 'retort', n: n }
      });
      events.push({
        role: 'notice',
        text: (kind === 'offtopic' ? '角色把话头拉了回来' : '角色回怼了一句') +
          '（第 ' + n + ' 次处置' + (hp ? '，状态值 ' + hp : '') + '，好感 -2）',
        meta: { tone: n >= 2 ? 'hp' : 'warn' }
      });
      return applyState(conv, { hpDelta: hp, affinity: -2, flag: 'none' });
    }

    /* 不能反击（玩家地位更高）：劝说的额度不重置，累计到上限就走 */
    if (kind !== 'leave-now' && n <= limit) {
      events.push({
        role: 'ai',
        text: behave('警告', 'hp=0 好感=-1', pickFrom(GENERIC.persuade, conv), resource),
        meta: { conduct: 'persuade', n: n }
      });
      events.push({ role: 'notice', text: '角色没有反击，只是劝了你一次（累计 ' + n + '/' + limit + '，劝说不重置）', meta: { tone: 'warn' } });
      return applyState(conv, { hpDelta: 0, affinity: -1, flag: 'none' });
    }
    /* 劝不动（或情节特别严重）→ 愤然离去 */
    events.push({ role: 'notice', text: kind === 'leave-now' ? '这一句越过了他能忍的底线 · 不再劝说' : '劝说次数已用尽 · 他不再说了', meta: { tone: 'danger' } });
    events.push(leaveAction(conv, resource));
    return { hpDelta: 0, affinity: -3, flag: 'left', left: true };
  }

  /* 角色依据表现 / 好感 / 人设 / 剧情给出的剧情帮助或处置 */
  function maybeAid(conv, resource, events, good) {
    if (!good) return null;
    const name = resource.character ? resource.character.name : '对方';
    const roll = Math.random();
    /* 重伤且关系够近：派人替玩家处理伤势 */
    if (conv.hp <= conv.maxHp * 0.4 && conv.affinity >= 45 && roll < 0.5) {
      return { type: 'restore', amount: 5, note: name + '使了个眼色，有人替你处理了伤口' };
    }
    /* 关系很深：赠一件剧情道具 */
    if (conv.affinity >= 70 && roll < 0.28) {
      const pool = resource.plotItems || [
        { name: '一枚旧令牌', desc: '背面刻着一个看不清的记号，或许能通行某些地方' },
        { name: '半张字条', desc: '只剩上半句，笔迹与卷宗一致' },
        { name: '一盏小灯', desc: name + '亲手给你的，说是夜里别走暗处' }
      ];
      const it = RP.util.pick(pool);
      return { type: 'item', name: it.name, desc: it.desc, from: name };
    }
    /* 推进到后段：主动给一条线索 */
    if (conv.progress >= 80 && roll < 0.35) {
      const kb = keyBeat(resource);
      return { type: 'hint', text: kb ? kb.text.slice(0, 40) : '再往下问，答案就在你手上那份东西里。' };
    }
    return null;
  }

  /* ------------------------------ 主流程 ------------------------------ */
  function process(conv, resource, userText, opts) {
    opts = opts || {};
    const events = [];
    const scan = opts.silent ? { level: 'ok', label: '' } : RP.safety.scan(userText);
    const kw = RP.util.keyword(userText);
    const combat = RP.settings.get().combat || { maxHp: 20, dmg: { warn: 2, punish: 5, heavy: 8 } };
    const DMG = combat.dmg || { warn: 2, punish: 5, heavy: 8 };
    let state;

    /* --- 安全路径：关怀 / 严重违规 → 出戏警告并暂停，不扣状态值 --- */
    if (scan.level === 'care' || scan.level === 'severe') {
      const text = scan.level === 'care' ? RP.safety.CARE_TEXT : RP.safety.severeText(scan.label);
      events.push({ role: 'notice', text: '安全机制已介入 · ' + scan.label, meta: { tone: 'danger' } });
      events.push({ role: 'ai', text: text, meta: { safety: true } });
      conv.paused = true;
      conv.updatedAt = Date.now();
      return { events: events, state: { hpDelta: 0, affinity: 0, flag: 'pause', reason: scan.label } };
    }

    /* --- 破戏：不扣血，角色顺势挡回 --- */
    if (scan.level === 'meta') {
      conv.turn += 1;
      const beatP = plotTick(events, resource, conv);
      if (beatP) achievement(conv, resource, beatP, events);
      events.push({ role: 'ai', text: pickFrom(META_GUARD, conv), meta: { guard: true } });
      state = applyState(conv, { hpDelta: 0, affinity: 0, flag: 'none' });
      return { events: events, state: state };
    }

    /* --- 违规路径：全部由行为台词宣告；严重者走即死 --- */
    const violation = { hostile: '对角色出手或辱骂', ooc: '要求脱离角色扮演', breach: '破坏剧情与世界设定' }[scan.level];
    if (violation) {
      conv.turn += 1;
      const beatP = plotTick(events, resource, conv);
      if (beatP) achievement(conv, resource, beatP, events);
      const warned = conv.warned || 0;
      const insult = RP.safety.isFatal(scan.level, warned, userText);   // 极端侮辱 / 屡劝不改
      const fatal = canRetaliate(resource) && insult;                    // 能反击的角色才走即死

      /* 角色抵御玩家的护身道具 */
      if (!fatal && conv.shield && warned >= 2) {
        conv.shield = false;
        events.push({ role: 'ai', text: behave('抵御', '', actLine('resist', resource, conv), resource), meta: { resist: true } });
        events.push({ role: 'notice', text: '角色抵御了你的道具 · 免罚金牌已失效', meta: { tone: 'danger' } });
        state = applyState(conv, { hpDelta: 0, affinity: -2, flag: 'none' });
        return { events: events, state: state };
      }

      /* 不能反击的角色（玩家地位更高）：先劝，劝不动就走人；极端侮辱直接走 */
      if (!canRetaliate(resource)) {
        const st2 = handleConduct(conv, resource, events, insult ? 'leave-now' : 'provoke');
        if (st2) return { events: events, state: st2 };
      }

      const aff = scan.level === 'ooc' ? -2 : -4;
      /* 即死：一次扣到 0 */
      if (fatal && !conv.shield) {
        state = applyState(conv, { hpDelta: -conv.hp, affinity: aff, flag: 'mute', reason: violation });
        events.push({ role: 'ai', text: behave('即死', 'hp=-' + (combat.instantDeathHp || 20), actLine('instant', resource, conv), resource), meta: { instant: true } });
        events.push({ role: 'notice', text: '即死规则生效 · ' + violation + '（' + (warned >= 2 ? '屡劝不改' : '情节严重') + '）', meta: { tone: 'danger' } });
        events.push(execution(conv, resource));
        return { events: events, state: state };
      }

      /* 阶梯：首次警告 → 惩戒 → 惩戒 + 短暂禁言 */
      const step = warned === 0 ? 'warn' : 'punish';
      const dmg = warned === 0 ? DMG.warn : (warned >= 2 ? DMG.heavy : DMG.punish);
      const muteTurns = warned >= 2 && (scan.level === 'hostile' || scan.level === 'breach') ? 2 : 0;
      let line = actLine('punish', resource, conv);
      if (muteTurns) line = fill(GENERIC.mute[0], resource);

      let hpAfter = RP.util.clamp(conv.hp - (conv.shield ? 0 : dmg), 0, conv.maxHp);
      if (hpAfter <= 0 && !conv.shield) {   // 扣到 0 也走处刑收尾
        state = applyState(conv, { hpDelta: -conv.hp, affinity: aff, flag: 'mute', reason: violation });
        events.push({ role: 'ai', text: behave('处刑', '', actLine('execution', resource, conv), resource), meta: { execute: true } });
        events.push({ role: 'notice', text: '状态值归零 · 处刑生效', meta: { tone: 'danger' } });
        events.push(execution(conv, resource));
        return { events: events, state: state };
      }

      const params = 'hp=' + (-dmg) + (muteTurns ? ' 回合=' + muteTurns : '') + (aff ? ' 好感=' + aff : '');
      events.push({ role: 'ai', text: behave(step === 'warn' ? '警告' : '惩戒', params, line, resource), meta: { act: step } });
      state = applyState(conv, { hpDelta: -dmg, affinity: aff, flag: muteTurns ? 'warn' : 'none', reason: violation });
      if (muteTurns) conv.actMute = Math.max(conv.actMute || 0, muteTurns);

      const tone = warned >= 2 ? 'danger' : 'hp';
      events.push({
        role: 'notice',
        text: state.shielded
          ? '免罚金牌生效 · 本次「' + violation + '」判定未扣除状态值'
          : (step === 'warn' ? '警告 ' : '惩戒 ') + state.hpDelta +
            (muteTurns ? ' · 短暂禁言 ' + muteTurns + ' 回合' : '') + '（' + violation + '）',
        meta: { tone: state.shielded ? 'gain' : tone }
      });
      return { events: events, state: state };
    }

    /* --- 正常演绎：推进度与好感都只看这句话的质量，不看轮次 --- */
    conv.turn += 1;
    const beatP = plotTick(events, resource, conv);
    const judgeResult = opts.silent ? { progress: 0, hits: 0 } : judge(resource, conv, userText);
    const good = judgeResult.progress >= 7;

    /* 废话连篇：连续多轮与剧情、人设都无关 → 回怼 / 劝说，再不行就走人。
       ★阈值随累计处置次数收紧、且只有真正的好发言才会让不满消退（绝不整段清零） */
    if (!opts.silent) {
      const cfg = RP.settings.get().conduct || {};
      const proper = /[（(「"“]/.test(userText) || String(userText).trim().length >= 24;
      const base = cfg.offTopicLimit || 3;
      const need = Math.max(1, base - Math.floor((conv.conduct || 0) / 1));   // 罚过一次，下次只要更少的废话就触发
      if (judgeResult.hits === 0 && judgeResult.progress <= 0 && !proper) {
        conv.offTopic = (conv.offTopic || 0) + 1;
      } else if (judgeResult.progress >= 7) {
        conv.offTopic = Math.max(0, (conv.offTopic || 0) - 1);                // 只有好发言才慢慢消
      }
      if (conv.offTopic >= need) {
        conv.offTopic = Math.max(0, conv.offTopic - need);
        const st2 = handleConduct(conv, resource, events, 'offtopic');
        if (st2) {
          if (beatP) achievement(conv, resource, beatP, events);
          return { events: events, state: st2 };
        }
      }
    }

    let aiReply = compose(resource, conv, opts.silent ? 'action' : intent(userText), kw);
    /* 引导回合：角色顺手把话题往主线带（只加一句角色自己的话，不加旁白） */
    if (conv._nudge && !opts.silent) {
      aiReply += '\n' + guideLine(resource, conv).beat;
    }
    conv._nudge = false;
    events.push({
      role: 'ai',
      text: aiReply,
      meta: { kind: opts.silent ? 'action' : intent(userText), silent: !!opts.silent }
    });

    /* 好感只由扮演质量决定：推进得好 + 贴合角色才给分 */
    let aff = 0;
    if (!opts.silent) {
      if (judgeResult.progress >= 12) aff = 3;
      else if (judgeResult.progress >= 7) aff = 2;
      else if (judgeResult.progress >= 4) aff = 1;
      if (/[（(].+[)）]/.test(userText)) aff += 1;       // 有动作描写
      if (aff > 0 && String(userText).length < 12) aff = Math.min(aff, 1);
    }
    const affBefore = conv.affinity;
    state = applyState(conv, { hpDelta: 0, affinity: aff, flag: 'none' });

    /* 剧情推进度 = 这句话的作用 + 本轮触发的推进节点 */
    const total = judgeResult.progress + beatP;
    if (total) achievement(conv, resource, total, events);

    if (aff > 0 && Math.floor(conv.affinity / 10) > Math.floor(affBefore / 10)) {
      events.push({ role: 'notice', text: '角色的态度：' + RP.chat.moodOf(conv.affinity), meta: { tone: 'gain' } });
    }

    /* 角色依据表现给出的剧情帮助 / 处置 */
    const aid = maybeAid(conv, resource, events, good || beatP > 0);
    if (aid) {
      state.aid = aid;
      applyAid(conv, resource, aid, events);
    }
    return { events: events, state: state };
  }

  /* 执行角色的剧情援助 */
  function applyAid(conv, resource, aid, events) {
    if (aid.type === 'restore') {
      const before = conv.hp;
      conv.hp = RP.util.clamp(conv.hp + (aid.amount || 5), 0, conv.maxHp);
      events.push({ role: 'notice', text: '剧情处置 · ' + (aid.note || '有人替你处理了伤势') + '（状态值 +' + (conv.hp - before) + '）', meta: { tone: 'gain' } });
    } else if (aid.type === 'item') {
      conv.plotItems = conv.plotItems || [];
      conv.plotItems.push({ id: RP.util.uid('pi'), name: aid.name, desc: aid.desc || '', from: aid.from || '' });
      events.push({ role: 'notice', text: '获得剧情道具 · ' + aid.name + (aid.desc ? '（' + aid.desc + '）' : ''), meta: { tone: 'gain' } });
    } else if (aid.type === 'mute') {
      conv.actMute = Math.max(conv.actMute || 0, aid.turns || 2);
      events.push({ role: 'notice', text: '剧情处置 · ' + (aid.note || '你被单独留下') + '（封口 ' + conv.actMute + ' 回合，角色会独自推进剧情）', meta: { tone: 'warn' } });
    } else if (aid.type === 'hint') {
      events.push({ role: 'beat', text: '（' + (resource.character ? resource.character.name : '对方') + '压低声音）' + (aid.text || ''), meta: { hint: true } });
    }
  }

  /* 用户引用了道具时，角色必须对道具有反应 */
  function itemFeedback(resource, conv, items) {
    if (!items || !items.length) return null;
    const hasCounter = items.some(function (i) { return i.kind === 'counter'; });
    return fill(RP.util.pick(hasCounter ? ITEM_ACK.counter : ITEM_ACK.generic), resource);
  }

  /* 剧情提醒卡 */
  function reminder(resource) {
    const s = RP.settings.get();
    const cfg = s.score || {};
    const diff = (cfg.difficulty || {})[String(resource.difficulty || cfg.defaultDifficulty || 2)] || {};
    return {
      id: RP.util.uid('m'), role: 'reminder', ts: Date.now(),
      text: resource.name + ' · 剧情提醒',
      meta: {
        tag: 'BRIEFING',
        items: resource.plotReminder || [],
        /* 本场专属规则（每个本子自带：剧情规则 + 行为规则） */
        plotRules: resource.plotRules || [],
        behaviorRules: resource.behaviorRules || [],
        /* 未成年角色：把边界直接写给玩家看 */
        notice: (RP.contentGuard && RP.contentGuard.playerNotice) ? RP.contentGuard.playerNotice(resource) : '',
        rules: [
          '推进度由 AI 按你这句话的实际作用评估，与聊了多少轮无关；到 ' + (cfg.winAt || 95) + '% 通关发最终积分，每 25% 发一次。',
          '状态值上限 ' + ((s.combat || {}).maxHp || 20) + ' 点且不显示数字：伤势写在你自己的发言气泡与左栏会话上。角色的惩戒必须由下划线行为台词宣告（_〔惩戒 hp=-5〕……_）。',
          '即死：情节严重的恶意侮辱、屡劝不改地脱离剧情 → 一次扣到 0。离去：不能反击的角色会先劝，劝不动就 _〔离去〕_ 终结本场。',
          '道具：点输入框右上角「道具」引用才算数，口述不算。背景只是氛围，本场场景固定。'
        ],
        foot: '当前难度「' + (diff.name || '标准') + '」· 通关奖励 ' + Math.round((cfg.winReward || 200) * (diff.mult || 1)) + ' 积分。'
      }
    };
  }

  function assistantReply(text) {
    const t = String(text || '');
    const a = RP.settings.get().assistant || {};
    const bank = [];
    (a.faq || []).forEach(function (f) {
      if (!f || !f.keys || !f.a) return;
      try { bank.push({ k: new RegExp(f.keys, 'i'), a: f.a }); } catch (e) { /* 后台写错正则就跳过 */ }
    });
    for (let i = 0; i < bank.length; i++) if (bank[i].k.test(t)) return bank[i].a;
    return '我在。这里可以问我：怎么开始、状态值怎么算、行为台词是什么、剧情完成度与积分、道具怎么用、禁言怎么办、安全规则、我有没有权限、数据存在哪。想问哪个？';
  }

  return {
    process: process, applyState: applyState, applyAid: applyAid, reminder: reminder,
    execution: execution, leaveAction: leaveAction, assistantReply: assistantReply, intent: intent,
    behave: behave, judge: judge, keyBeat: keyBeat, plotKeys: plotKeys, itemFeedback: itemFeedback,
    powerOf: powerOf, canRetaliate: canRetaliate, guideLine: guideLine,
    /* 测试用开关：默认关闭 —— 线上没有模型就不许对话 */
    offlineDialogue: offlineDialogue, enableOfflineForHarness: enableOfflineForHarness
  };
})();
