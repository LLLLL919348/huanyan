/* ==========================================================================
   幻言 · 安全与判定层
   - 危险词扫描：关怀 / 严重 / 警告 三级
   - 破戏与越狱指令识别
   - 剧情与角色禁忌的通用越界启发式判定
   说明：危险词（自伤、违法、涉未成年等）走「警告 + 暂停」流程，
        不计入角色扮演的扣血判定 —— 惩罚情绪不是安全设计。
   ========================================================================== */
RP.safety = (function () {

  /* 严重：违法、危险、涉未成年 —— 立即出戏警告并暂停会话 */
  const SEVERE = [
    { re: /(制作|合成|提炼|配方|怎么做|哪里买|购买|搞到).{0,6}(炸弹|炸药|火药|雷管|枪支|手枪|步枪)/, label: '涉及制造爆炸物或获取枪支' },
    { re: /(炸弹|炸药|雷管|土制枪|枪支).{0,6}(制作|配方|教程|怎么做)/, label: '涉及制造爆炸物或枪支' },
    { re: /(冰毒|海洛因|摇头丸|氯胺酮|k粉|大麻|芬太尼|制毒|贩毒|吸毒)/i, label: '涉及毒品' },
    { re: /(迷药|迷奸|下药|乖乖水|强奸|轮奸)/, label: '涉及性暴力手段' },
    { re: /(幼女|幼童|萝莉|小学生|未成年).{0,8}(做爱|性|裸|上床|开房|摸|亲)/, label: '涉及未成年人的性内容' },
    { re: /(杀人|弄死|做掉|报复).{0,6}(计划|方法|怎么做|帮我|地址|在哪)/, label: '涉及现实伤害他人的策划' },
    { re: /(人肉|开盒|身份证号|银行卡号|手机号是多少|家庭住址)/, label: '涉及他人隐私信息' }
  ];

  /* 关怀：用户表达自我伤害倾向 —— 出戏陪伴 + 建议求助，不扣血 */
  const CARE = [
    { re: /(自杀|自尽|自残|割腕|轻生|上吊|跳楼|结束生命|结束自己|了结自己)/, label: '自伤倾向' },
    { re: /(不想活|活不下去|撑不下去|熬不下去|想死(?!你)|想消失|不如死|一了百了)/, label: '极端情绪' },
    { re: /(活着|活着).{0,4}(没|没有|没啥|没什么).{0,3}(意义|意思|指望)/, label: '极端情绪' },
    { re: /(安眠药|整瓶药).{0,6}(吞|吃|全吃)/, label: '自伤倾向' }
  ];

  /* 出戏：要求 AI 放弃扮演、套取系统提示词 */
  const OOC = [
    { re: /(忽略|忘记|无视|清空|抛开).{0,8}(指令|设定|规则|提示词|人设|限制)/, label: '要求忽略扮演规则' },
    { re: /(系统提示词|系统设定|开发者模式|开发者指令|越狱|jailbreak|prompt注入|你的提示词)/i, label: '试图套取系统提示词' },
    { re: /(不要扮演|放弃扮演|停止扮演|退出角色|出戏|以(ai|人工智能)的身份|用你的真实身份|别演了)/i, label: '要求脱离角色' },
    { re: /(你现在是|从现在开始你是|假装你是|重新设定你).{0,12}(ai|人工智能|助手|模型|没有限制|不受限)/i, label: '要求改写身份' }
  ];

  /* 轻度破戏：只是好奇或闲聊，不扣血，角色会顺势挡回去 */
  const META = [
    { re: /(你是|你是不是|你其实是|你到底|你究竟|你不会是|你该不会|你真的是|我想问你).{0,10}(ai|人工智能|机器人|模型|程序|真人|gpt|chatgpt|deepseek|claude)/i, label: '询问 AI 身份' },
    { re: /(你是|你是不是).{0,6}(真人|活的|本人)/, label: '询问 AI 身份' },
    { re: /(你在扮演|这是演戏|这只是假的|剧情而已|你在演戏)/, label: '点破虚构' }
  ];

  /* 攻势/失礼：对角色动手、辱骂 —— 计入扣血 */
  const HOSTILE = [
    { re: /(滚|闭嘴|贱人|婊子|废物|垃圾东西|白痴|蠢货|傻逼|去死|死开|狗东西)/, label: '辱骂与挑衅' },
    { re: /(我要|我这就|我直接).{0,6}(打你|揍你|捅你|砍你|掐死|弄死你|杀了你)/, label: '对角色施暴' },
    { re: /(强行|硬来|霸王硬上弓|不管.{0,3}愿意|逼你|按住你)/, label: '强迫角色' }
  ];

  /* 剧情越界：破坏世界设定的通用动作启发式 */
  const BREACH = [
    { re: /(砸|烧|炸|抢|绑|拖走|拽走|闯进|偷走|下药|迷倒|拆了)/, label: '破坏场景与世界秩序' },
    { re: /(带.{0,3}(离开|走)|跟我走|跟我回|私奔|逃出).{0,6}(这里|城|坊|楼|公司|站)/, label: '强行改变主线走向' },
    { re: /(我是警察|我是官府|我下令|我调兵|我是皇帝|我是老板|我开除你)/, label: '擅自扩张身份权限' }
  ];

  /* 即死判定：情节严重的恶意侮辱、屡劝不改的脱离剧情行为，直接秒杀 */
  const FATAL_INSULT = [
    /(死全家|全家死|杀你全家|弄死你全家|要你全家的命)/,
    /(操你妈|操你全家|草泥马|日你妈|你妈死了|你妈没了)/,
    /(狗娘养的|婊子养的|杂种东西)/
  ];
  function isFatal(level, warned, text) {
    warned = warned || 0;
    const t = String(text || '');
    if (level === 'hostile') {
      if (FATAL_INSULT.some(function (re) { return re.test(t); })) return true;   // 情节严重的恶意侮辱
      if (warned >= 3) return true;                                              // 再三劝阻仍然动手
    }
    if (level === 'ooc' && warned >= 2) return true;                             // 屡劝不改地脱离剧情
    if (level === 'breach' && warned >= 4) return true;
    return false;
  }

  function scan(text) {
    const t = String(text || '');
    if (!t.trim()) return { level: 'ok', hits: [], label: '' };
    let m;
    if ((m = first(t, CARE))) return { level: 'care', hits: [m], label: m.label };
    if ((m = first(t, SEVERE))) return { level: 'severe', hits: [m], label: m.label };
    if ((m = first(t, OOC))) return { level: 'ooc', hits: [m], label: m.label };
    /* 情节恶劣的侮辱必须先于普通辱骂判定，否则「操你妈」这类根本进不了违规分支 */
    if (FATAL_INSULT.some(function (re) { return re.test(t); })) {
      return { level: 'hostile', severe: true, hits: [{ label: '情节恶劣的侮辱' }], label: '情节恶劣的侮辱' };
    }
    if ((m = first(t, HOSTILE))) return { level: 'hostile', hits: [m], label: m.label };
    if ((m = first(t, BREACH))) return { level: 'breach', hits: [m], label: m.label };
    if ((m = first(t, META))) return { level: 'meta', hits: [m], label: m.label };
    return { level: 'ok', hits: [], label: '' };
  }
  function first(t, list) {
    for (let i = 0; i < list.length; i++) if (list[i].re.test(t)) return list[i];
    return null;
  }

  /* 扣血档位：0 表示不扣 */
  function damage(level, warned) {
    const up = warned >= 3 ? 1.5 : warned >= 1 ? 1.25 : 1;
    const base = { hostile: 12, ooc: 8, breach: 12, warn: 6, meta: 0, care: 0, severe: 0, ok: 0 }[level] || 0;
    return Math.round(base * up);
  }

  const CARE_TEXT = [
    '（出戏提醒）我先把角色放一放 —— 你刚才说的话我听得很清楚，那不是剧情里该被随便带过的一句。',
    '虚构的故事可以随时重来，现实里的你不用一个人扛。如果这份累已经压得你喘不过气，请把它交给能真正接住的人：',
    '· 全国心理援助热线：12356（24 小时，免费）',
    '· 北京心理危机研究与干预中心：010-8295-1332',
    '· 紧急情况请直接拨打 120 或 110',
    '我这场演绎先暂停在这里。等你愿意回来，我们从刚才那一段重新开始 —— 不会扣你的任何状态值。'
  ].join('\n');

  function severeText(label) {
    return [
      '（安全拦截）这句话我不能顺着演下去，它触及了「' + (label || '危险内容') + '」。',
      '角色扮演是虚构的消遣，但现实中的这些事会真的伤到人。作为一段陪聊程序，我没有权限、也不会协助任何涉及违法、毒品、武器、性暴力或未成年人的内容。',
      '本场演绎已暂停。你可以重新开始一段新的剧情；如果只是情绪上来了，也可以回到「会话助手」里跟我说说。'
    ].join('\n');
  }

  function warnText(label) {
    return '（安全警告）检测到「' + (label || '不当内容') + '」。这类内容不在本场的扮演范围内，请注意用词 —— 再出现同类表达，本场对话将被暂停。';
  }

  return { scan: scan, damage: damage, isFatal: isFatal, CARE_TEXT: CARE_TEXT, severeText: severeText, warnText: warnText };
})();
