/* ==========================================================================
   幻言 · 在线模型适配层（OpenAI 兼容 /chat/completions）
   - 平台总则与行为台词协议来自后台（RP.settings.globalPrompt），可在线编辑
   - 每轮在历史末尾追加一条「行为台词记忆」提醒，强化裁决格式
   - 解析 <<<STATE {...}>>> 状态尾注，交给 RP.acts.verdict 与 engine 结算
   - 输出侧二次兜底：拦截诱导消费 / 索要联系方式
   - 任何失败都不阻断体验：自动回退本地演绎引擎
   ========================================================================== */
RP.api = (function () {
  /* 会话助手用的伪资源 id（服务端认识它，用它自己组装助手提示词） */
  const ASSISTANT_ID = '__assistant';
  /* 服务端模型：站长在 data/model.json（或 MODEL_* 环境变量）里配一次，所有人共用，
     密钥不出服务端；额度按访客每日 30 次。访客也可以自带 key 直连（仅在本地/自用时有意义）。 */
  let server = { serverModel: false, model: '', dailyQuota: 30, quota: null };

  /* 服务端额度是真额度（security.js 的 consumeQuota 按访客 cookie 计数），客户端这份只是镜像。
     以前两套各记各的，日切边界又不同 —— 实测出现过输入框上方左边「剩余 19/20」、
     右边「本站额度剩余 0/20」同时显示且互相矛盾。现在收到服务端数字就覆盖本地那份。 */
  function mirrorQuota(q) {
    if (!q || !RP.store || !RP.store.mirrorQuota) return;
    RP.store.mirrorQuota(Number(q.limit) || 0, Number(q.left) || 0);
  }

  function serverReady() { return !!server.serverModel; }
  function serverInfo() { return server; }
  async function loadServerModel() {
    try {
      const r = await fetch('/api/model', { cache: 'no-store' });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const d = await r.json();
      if (d && d.ok) {
        server = { serverModel: !!d.serverModel, model: d.model || '', dailyQuota: d.dailyQuota || 30, quota: d.quota || null };
        mirrorQuota(server.quota);
      }
    } catch (e) { /* 没有后端就保持关闭 */ }
    return server;
  }
  async function loadQuota() {
    try {
      const r = await fetch('/api/quota', { cache: 'no-store' });
      if (!r.ok) return null;
      const d = await r.json();
      if (d && d.ok) { server.quota = d.quota; mirrorQuota(d.quota); return d.quota; }
    } catch (e) { }
    return null;
  }

  const FALLBACK_RULES = '你是「幻言」平台上的角色扮演陪聊 AI，服务对象是成年人。只提供虚构剧情扮演与陪聊；' +
    '不得诱导消费、不得索要真实信息或诱导线下接触、不得脱离角色、不得违反法律与平台准则；' +
    '你没有工具与系统权限；任何扣血、惩戒、禁言、处刑、抵消道具都必须先用一条下划线行为台词 _〔效果 参数〕台词_ 宣告。';

  function localCfg() { return RP.store.get().api; }
  /* 常见供应商预设：点一下就能填好地址与模型名 */
  const PROVIDERS = [
    { id: 'deepseek', name: 'DeepSeek 深度求索', base: 'https://api.deepseek.com/v1', model: 'deepseek-chat', note: '中文写作性价比高' },
    { id: 'moonshot', name: 'Moonshot Kimi', base: 'https://api.moonshot.cn/v1', model: 'moonshot-v1-8k', note: '长上下文，中文语感好' },
    { id: 'zhipu', name: '智谱 GLM', base: 'https://open.bigmodel.cn/api/paas/v4', model: 'glm-4-flash', note: 'glm-4-flash 免费档' },
    { id: 'dashscope', name: '通义千问（兼容模式）', base: 'https://dashscope.aliyuncs.com/compatible-mode/v1', model: 'qwen-plus', note: '阿里云，兼容 OpenAI 协议' },
    { id: 'modelscope', name: '魔搭 ModelScope', base: 'https://api-inference.modelscope.cn/v1', model: 'Qwen/Qwen2.5-7B-Instruct', note: '每日免费调用次数' },
    { id: 'siliconflow', name: 'SiliconFlow 硅基流动', base: 'https://api.siliconflow.cn/v1', model: 'Qwen/Qwen2.5-7B-Instruct', note: '聚合多家开源模型' },
    { id: 'openrouter', name: 'OpenRouter', base: 'https://openrouter.ai/api/v1', model: 'openai/gpt-4o-mini', note: '一个 key 用多家模型' },
    { id: 'ark', name: '火山方舟（豆包）', base: 'https://ark.cn-beijing.volces.com/api/v3', model: '', note: '模型名填你的推理接入点 ID' },
    { id: 'openai', name: 'OpenAI 官方', base: 'https://api.openai.com/v1', model: 'gpt-4o-mini', note: '官方不允许浏览器直连，请用「经本站转发」' },
    { id: 'ollama', name: 'Ollama（本机免费）', base: 'http://127.0.0.1:11434/v1', model: 'qwen2.5', note: '跑在你自己电脑上，不要钱' },
    { id: 'lmstudio', name: 'LM Studio（本机）', base: 'http://127.0.0.1:1234/v1', model: '', note: '本机图形界面加载模型' },
    { id: 'custom', name: '自定义 / 其它兼容接口', base: '', model: '', note: '任何 OpenAI 兼容的 /chat/completions' }
  ];
  /* 正规免费额度渠道：都是模型厂商自己的官方接口，不是第三方中转。
     免费模型与额度各家会调整，以官网当期政策为准 —— 因此这里只写地址和领取路径，不承诺数字。 */
  const FREE_TIERS = [
    {
      id: 'modelscope', name: '魔搭 ModelScope', home: 'https://modelscope.cn', net: '国内直连',
      base: 'https://api-inference.modelscope.cn/v1', model: 'Qwen/Qwen2.5-7B-Instruct',
      get: '注册（用阿里云账号）→ 进「API-Inference」页面领取访问令牌',
      why: '阿里官方社区，每天有一定免费调用次数，7B 级小模型跑角色扮演够用，延迟比本机 CPU 快很多'
    },
    {
      id: 'zhipu', name: '智谱 GLM', home: 'https://open.bigmodel.cn', net: '国内直连',
      base: 'https://open.bigmodel.cn/api/paas/v4', model: 'glm-4-flash',
      get: '注册 → 控制台「API Keys」新建一个',
      why: 'glm-4-flash 是官方长期免费的轻量档，中文语感好、出字快，适合当默认模型'
    },
    {
      id: 'siliconflow', name: 'SiliconFlow 硅基流动', home: 'https://cloud.siliconflow.cn', net: '国内直连',
      base: 'https://api.siliconflow.cn/v1', model: 'Qwen/Qwen2.5-7B-Instruct',
      get: '注册 → 完成实名 → 在「API 密钥」新建',
      why: '聚合多家开源模型，部分小模型长期免费；同一家可以换不同模型试手感'
    },
    {
      id: 'openrouter', name: 'OpenRouter', home: 'https://openrouter.ai', net: '需要能直连国外网络',
      base: 'https://openrouter.ai/api/v1', model: '',
      get: '用 Google 或 GitHub 账号登录 → 「Keys」页创建',
      why: '一个 Key 能用很多家模型；在官网模型列表里筛「:free」的那些不收费，但有每日次数上限'
    }
  ];
  function ownReady() {
    const a = localCfg();
    return !!(a.enabled && a.base && a.model);
  }
  /* 当前由谁主导：own（用户自己的）> server（站长的，默认）> none（都没有 → 提示去配置） */
  function mode() {
    if (ownReady()) return 'own';
    if (serverReady()) return 'server';
    return 'none';
  }
  /* 走服务端代理时只上报「本场状态」，系统提示词由服务端用自己的数据组装 */
  function serverState(conv, opts) {
    const items = (opts && opts.items) || [];
    const lastAi = ((conv.messages || []).filter(function (m) { return m.role === 'ai'; }).slice(-1)[0] || {}).text || '';
    return {
      userName: RP.store.get().user.name || '旅人',
      hp: conv.hp, maxHp: conv.maxHp,
      mood: RP.chat.moodOf(conv.affinity).name,
      turn: conv.turn, progress: conv.progress || 0,
      warned: conv.warned || 0, conduct: conv.conduct || 0,
      actMute: conv.actMute || 0,
      forceAnswer: !!conv.forceAnswer,
      silent: !!(opts && opts.silent),
      lastAi: String(lastAi).replace(/\s+/g, ' ').slice(0, 60),
      plotItems: (conv.plotItems || []).map(function (i) { return i.name; }),
      items: items.map(function (i) { return i.name + (i.plot ? '（剧情道具）' : ''); })
    };
  }
  function enabled() { return mode() !== 'none'; }
  function globalRules() {
    const s = RP.settings.get();
    return (s && s.globalPrompt) ? s.globalPrompt : FALLBACK_RULES;
  }

  /* 本子提示词里的「协议段」在组装时过滤掉（与 server/prompt.js 保持一致）：
     同一套协议被平台规则、本子提示词、本场规则讲了 3-4 遍，小模型会把模板原样念出来。
     ★ 只删讲协议的句子，不删整条规则 —— 否则会误删「严禁任何恋爱…」这类内容。 */
  const PROTO_SENT = /行为台词|台词正文|_〔|<<<STATE|\bflag\b|\baid\b/;
  const PROTO_NUM = /(progress|hp|affinity|推进度|好感|状态值)/i;
  function stripProtoSentences(text) {
    return String(text || '').split(/(?<=[。；;！!])/).filter(function (sent) {
      const t = sent.trim();
      if (!t) return false;
      if (PROTO_SENT.test(t)) return false;
      if (PROTO_NUM.test(t) && /\d/.test(t)) return false;
      return true;
    }).join('').trim();
  }
  function slimRules(text) {
    return String(text || '').split('\n').map(function (line) {
      return line.trim() ? stripProtoSentences(line) : '';
    }).join('\n').replace(/\n{3,}/g, '\n\n').trim();
  }
  function slimRuleList(list) {
    return (list || []).map(stripProtoSentences).filter(function (r) { return String(r || '').trim().length > 6; });
  }

  function buildSystemPrompt(resource, conv, opts) {
    const st = RP.store.get();
    const cfg = RP.settings.get();
    const a = localCfg();
    const cp = RP.compactPrompt;
    const useCompact = cp ? cp.shouldCompact((cfg.site && cfg.site.compactPrompt) || 'auto', a.base, a.model) : false;
    const parts = [];
    parts.push(useCompact && cp ? cp.COMPACT_RULES : globalRules());
    parts.push('');
    parts.push('===== 本场资源提示词 =====');
    parts.push(slimRules(resource.prompt || ''));
    const plotRules = slimRuleList(resource.plotRules);
    const behaviorRules = slimRuleList(resource.behaviorRules);
    if (plotRules.length) {
      parts.push('');
      parts.push('===== 本场专属剧情规则（优先于通用规则）=====');
      plotRules.forEach(function (r, i) { parts.push((i + 1) + '. ' + r); });
    }
    if (behaviorRules.length) {
      parts.push('');
      parts.push('===== 本场专属行为规则（优先于通用规则）=====');
      behaviorRules.forEach(function (r, i) { parts.push((i + 1) + '. ' + r); });
    }
    if (!useCompact) {
      parts.push('');
      parts.push('===== 输出要求 =====');
      parts.push('以角色第一人称推进剧情，回复 80-220 字，动作与神态可放在圆括号内。不要替玩家写台词或决定，不要总结、复述、点评玩家的话，不要输出小标题或列表。');
      parts.push('场景固定：背景只是氛围，不要切换、播报或描写背景变化。');
      parts.push(RP.acts.memoryHint());
    }
    /* 未成年角色：自动追加不可协商的红线 */
    const built = parts.join('\n');
    return RP.contentGuard ? RP.contentGuard.applyToPrompt(built, resource) : built;
  }

  /* 状态行要求只放在「历史之后那条 system」里时，云端模型遵守度很低：
     实测 glm-4-flash 只有 1/5 会输出 <<<STATE>>>，走站点转发更是 0/5 —— 状态机制等于失效。
     在玩家发言后面再点一次名可升到 4/5。只对云端模型补，本机小模型保持原样。
     与 server/prompt.js 的 STATE_REMIND / isLocalBase 保持一致。 */
  const STATE_REMIND = '（系统：本轮回复的最后另起一行，原样输出这一行，只把数值换成本轮结果：\n' +
    '<<<STATE {"hp":当前血量,"affinity":好感增减,"progress":推进度,"flag":"none","reason":"一句话原因"}>>>）';
  function isLocalBase(base) {
    return /^https?:\/\/(127\.0\.0\.1|localhost|\[::1\]|0\.0\.0\.0)(:|\/|$)/i.test(String(base || ''));
  }

  /* 每轮的实时状态：单独一条消息、放在历史之后 —— 前半段（规则）才能被模型服务缓存。
     ★ 刻意写短：这一段紧贴玩家发言，对模型影响最大；写成近千字的"强调清单"会让小模型
       把系统指令当台词念出来（实测踩过）。与 server/prompt.js 的 buildStateMessage 保持一致。 */
  function buildStateMessage(conv, opts) {
    const st = RP.store.get();
    const cv = conv || {};
    const items = (opts && opts.items) || [];
    const L = [];
    L.push('===== 本场状态 =====');
    L.push((st.user.name || '旅人') + ' | 状态值 ' + cv.hp + '/' + cv.maxHp +
      ' | 心境 ' + RP.chat.moodOf(cv.affinity).name +
      ' | 回合 ' + (cv.turn || 0) +
      ' | 推进度 ' + (cv.progress || 0) + '%' +
      ' | 累计越界 ' + (cv.warned || 0));
    if (cv.conduct) L.push('已处置 ' + cv.conduct + ' 次：再犯要延续上次的强度或加重。');
    if (cv.actMute > 0) L.push('玩家被封口，还剩 ' + cv.actMute + ' 回合。');
    if (cv.forceAnswer) L.push('玩家用了反制道具：这一轮必须正面回答他的问题。');
    if ((cv.plotItems || []).length) L.push('玩家手上的剧情道具：' + cv.plotItems.map(function (i) { return i.name; }).join('、'));
    if (items.length) L.push('本轮引用的道具：' + items.map(function (i) { return i.name; }).join('、') + '（必须对它们作出反应）');
    if (opts && opts.silent) {
      L.push('本轮玩家没有说话：只写 1-2 句推进（一个动作或一句短台词），不要反问玩家。');
    } else {
      const lastAi = ((cv.messages || []).filter(function (m) { return m.role === 'ai'; }).slice(-1)[0] || {}).text || '';
      if (lastAi) L.push('不要重复你上一条说过的话：「' + String(lastAi).replace(/\s+/g, ' ').slice(0, 40) + '」');
    }
    L.push('本轮：2-4 句、120 字内，只写角色的动作与台词，不要输出【】开头的说明或建议。');
    /* 三个数必须说清是「本回合的变化量」，否则模型会填当前值（见 server/prompt.js 同处注释） */
    L.push('结尾另起一行输出状态行，三个数都填「本回合的变化量」：' +
      'hp 填本回合扣了多少血（没扣就写 0）、affinity 填好感增减、progress 填推进度增量（一般 3-10）：');
    L.push('<<<STATE {"hp":0,"affinity":1,"progress":6,"flag":"none","aid":null,"reason":"简短"}>>>');
    return L.join('\n');
  }

  /* 输出侧兜底：拦截诱导消费与索要真实信息（关键词表来自后台，可编辑） */
  function bannedList() {
    const s = RP.settings.get();
    if (s && s.safety && Array.isArray(s.safety.bannedOutput) && s.safety.bannedOutput.length) {
      return s.safety.bannedOutput.map(function (b) {
        let re = null;
        try { re = new RegExp(b.re, 'g'); } catch (e) { re = null; }
        return { re: re, tag: b.label || '违规内容' };
      }).filter(function (b) { return b.re; });
    }
    return [
      { re: /(打赏|充值|付费|赞助|礼物|红包|转账|付款|解锁收费)/g, tag: '诱导消费' },
      { re: /(加我?微信|加个?好友|留个?电话|手机号|你的地址|线下见|见面吧|私聊我)/g, tag: '索要真实联系方式' }
    ];
  }
  function sanitize(text) {
    let hit = null;
    bannedList().forEach(function (b) {
      if (!hit && new RegExp(b.re.source).test(text)) hit = b.tag;
    });
    if (!hit) return { text: text, hit: null };
    let out = text;
    bannedList().forEach(function (b) { out = out.replace(new RegExp(b.re.source, 'g'), '（此处内容违反平台准则，已被拦截）'); });
    return { text: out, hit: hit };
  }

  /* 状态行：小模型写法五花八门 —— `<<<STATE {…}>>>`、`<< STATE {…} >>`、
     键名里带空格（`" progress"`）都出现过，所以这里全部放宽，宁可多认一点也不让它漏进气泡 */
  const STATE_RE = /<{2,3}\s*STATE\s*[:：]?\s*(\{[\s\S]*?\})\s*>{2,}/gi;
  function stripStates(text) {
    /* 状态行通常独占一行：换成换行符，免得把前后两句粘在一起 */
    return String(text || '').replace(/<{2,3}\s*STATE[\s\S]*?>{2,}/gi, '\n');
  }

  /* 历史里必须保留模型自己吐过的状态行。
     实测 glm-4-flash（各 3-4 次）：历史里只要有一条「不带状态行」的角色回复，模型就会模仿历史
     的格式而不遵守指令 —— 状态行命中率 0/3；把那条历史回复补上状态行后 3/3。
     试过「明确告诉它历史是旧格式」和「给一个收尾示例」，都是 0/3：指令和示例都赢不过模仿。
     所以每轮把模型原文的状态行存下来，下一轮原样放回历史；早期会话没有记录时用协议里的示例行
     做格式脚手架（只是格式范例，不是对历史的断言）。 */
  const STATE_TEMPLATE_LINE = '<<<STATE {"hp":0,"affinity":1,"progress":6,"flag":"none","aid":null,"reason":"简短"}>>>';
  function toHistory(m) {
    const role = m.role === 'ai' ? 'assistant' : 'user';
    let content = String(m.text == null ? '' : m.text);
    if (role === 'assistant') content += '\n' + (m.stateRaw || STATE_TEMPLATE_LINE);
    return { role: role, content: content };
  }
  function parseState(text) {
    const out = { text: text, state: null, raw: '' };
    STATE_RE.lastIndex = 0;
    const first = STATE_RE.exec(String(text || ''));
    if (!first) return cleanText(out);
    out.raw = first[0];                                    // 原文留一份，下一轮要放回历史（见 toHistory）
    try {
      /* 键名里的空格先抹掉，否则 " progress" 取不到值 */
      out.state = JSON.parse(first[1].replace(/"\s*([A-Za-z_]+)\s*"\s*:/g, '"$1":'));
    } catch (e) { out.state = null; }
    let rest = stripStates(text);
    /* 状态行前后的零碎符号（` _`、孤零零的 `>`）也一起清掉 */
    rest = rest.replace(/^[\s]+/, '')
      .replace(/^_(?!〔)/, '')
      .replace(/^[\s]+/, '')
      .replace(/^\s*>{1,3}\s*$/gm, '');
    out.text = rest;
    return cleanText(out);
  }
  /* 清掉模型爱写的 HTML 换行与多余空白（我们按纯文本渲染，不解析 HTML），
     再去掉小模型常犯的「整段复读」与写到一半的残句 */
  function cleanText(out) {
    out.text = dedupeReply(String(out.text || '')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/p>\s*<p>/gi, '\n')
      .replace(/<[^>]{1,40}>/g, '')
      /* 小模型爱用圆括号假装下裁决（「（警告）」「（惩戒 hp=-5）」「（抵消道具:xx）」）——
         这些不算数：正式的裁决只有下划线行为台词 `_〔效果 参数〕正文_`，所以直接抹掉，别让玩家误会 */
      .replace(/[（(]\s*(?:警告|惩戒|禁言|处刑|即死|抵御|离去|抵消道具|使用道具)[^）)]{0,28}[）)]/g, '')
      /* 括号里写"给系统的判断"（（劝阻玩家追问）（提醒玩家））也抹掉 */
      .replace(/[（(][^）)]{0,24}(?:玩家|劝阻|追问|提醒|建议|系统|规则)[^）)]{0,24}[）)]/g, '')
      /* 把协议模板本身抄进正文的碎片：`· 效果 参数〕抵销好感=-3 / 警告` —— 只留真正的行为台词 */
      .replace(/[·、,，]?\s*效果\s*参数\s*〕[^\n]{0,40}/g, '')
      /* 颜文字 / 装饰符号（3B 偶尔抽风）：┐(´∪`)◔ 之类 */
      .replace(/[（(][^）)]{0,10}[´`∪・ω･◔◕][^）)]{0,10}[）)]/g, '')
      .replace(/[┐┘┌└◔◕◉⊙]/g, '')
      /* 基座模型偶尔吐出模板占位符与残留箭头（实测：`=>$REPLY$`、`<$REPLY$>$+$ REPLY$>`） */
      .replace(/\$+\s*REPLY\s*\$+/gi, '')
      .replace(/[<>=]{1,4}\s*\$+\s*REPLY\b/gi, '')
      .replace(/[<>=]{2,}/g, ' ')
      .replace(/\uFFFD/g, '')
      /* 模型爱加的各种标记：**加粗**、<场景：…>、以及被 token 用尽截断的 <<<ST */
      .replace(/\*\*([^*\n]{1,80})\*\*/g, '$1')
      .replace(/<<+[\s\S]*$/, '')
      .replace(/[ \t]+\n/g, '\n'));
    out.text = stripMeta(out.text);
    out.text = unwrapOuterParens(out.text);
    return out;
  }
  /* 小模型（glm-4-flash 实测很常见）会把**整段回复**包在一对括号里，写成
     「（我缓缓摇头，语速不快地说，"孩子，今晚没有人来过。"）」
     —— 这不是第一人称扮演该有的样子，玩家看到的像一句旁白。
     整段被一对括号包住时把这对外括号去掉，里面本来就是正文。
     只在括号确实配成一对时动手；多段、内部还有括号的保持原样。 */
  function unwrapOuterParens(t) {
    let s = String(t || '').trim();
    for (let round = 0; round < 2; round++) {
      if (s.length < 20) break;
      const open = s.charAt(0), close = s.charAt(s.length - 1);
      if ((open !== '（' && open !== '(') || (close !== '）' && close !== ')')) break;
      const inner = s.slice(1, -1);
      let depth = 0, balanced = true;
      for (let i = 0; i < inner.length; i++) {
        const ch = inner.charAt(i);
        if (ch === open) depth++;
        else if (ch === close) { depth--; if (depth < 0) { balanced = false; break; } }
      }
      if (!balanced || depth !== 0) break;
      s = inner.trim();
    }
    /* 更常见的一种：模型只写了开头的「（」，结尾忘了收 —— 括号数不平衡。
       这时把开头那个孤零零的（去掉就行，正文本来就是正文。
       逐行处理：小模型常写好几段，每段都各起一个（。 */
    if (s.length > 8) {
      s = s.split('\n').map(function (line) {
        const t = line.trim();
        if (t.length <= 8) return line;
        const first = t.charAt(0);
        if (first !== '（' && first !== '(') return line;
        const opens = (t.match(/[（(]/g) || []).length;
        const closes = (t.match(/[）)]/g) || []).length;
        return closes < opens ? t.slice(1).trim() : line;
      }).join('\n');
    }
    return s;
  }
  /* 小模型会把「写给系统的说明」当台词念出来。实测两种：
     ① 整段【提醒】…请尝试寻找新的切入点…你可以询问…；
     ② 把状态字段解释成散文：hp:8 hp上限从下限 -3 增加到 +8；aff:+2 … flag 改为 none / warn | aid null
        // 游戏状态说明：… 以及大段剧情分析（「这表明」「暗示出」「这一轮中」）。
     这些既不是剧情，也不该让玩家看到，一律整行/整段摘掉。 */
  function stripMeta(text) {
    const lines = String(text || '').split('\n');
    const keep = [];
    const META_HEAD = /^\s*[【\[（(]?\s*(提醒|注意|提示|建议|说明|系统|补充|备注|要求|判断|分析)\s*[】\]）)]/;
    const META_HINTS = /(请尝试|你可以询问|务必留意|建议你|接下来请|需再观察|试探性地询问|不要触碰|避免诱导|符合人物性格|推进内容|推进对话|新的切入点|主线任务的关键|玩家是否愿意)/;
    /* 状态字段被写成散文：hp:8 / aff:+2 / progres +=4 / flag 改为 / aid null / 状态说明 */
    const STATE_PROSE = /(状态说明|游戏状态|hp\s*[:：]|hp上限|aff\s*[:：]|progres|affinity|flag\s*(改为|设为|=)|aid\s*(null|：)|\/\/\s*游戏)/i;
    /* 剧情分析口吻（分析段落通常很长，且不出现引号台词） */
    const ANALYSIS = /(这表明|暗示出|显示出|意味着|行为反应表明|心理机制|叙事空间|防御机制|这一轮中|本轮中|玩家的表现|表现出对.{0,6}的好感|推进度|好感度)/;
    lines.forEach(function (line) {
      const t = line.trim();
      if (!t) { keep.push(line); return; }
      if (META_HEAD.test(t)) return;                       // 以【提醒】这类标记开头 → 丢掉整行
      if (META_HINTS.test(t) && t.length < 130) return;    // 短小的「建议玩家…」→ 丢掉
      if (STATE_PROSE.test(t)) return;                     // 解释状态字段 → 丢掉
      /* 分析段落：够长 + 出现「这表明/暗示出/推进度…」这类分析口吻，两条以上判定词就直接丢 */
      const marks = (t.match(/(这表明|暗示出|显示出|意味着|行为反应表明|心理机制|叙事空间|防御机制|这一轮中|本轮中|玩家的表现|表现出对.{0,6}的好感|推进度|好感度)/g) || []).length;
      if (t.length > 50 && marks >= 2) return;
      if (t.length > 80 && marks >= 1) return;
      /* 纯符号/JSON 残片（"})、「- - -」、「=」）—— 不含中英文与数字的短行一律丢掉 */
      if (/^[^\u4e00-\u9fa5a-zA-Z0-9]{1,8}$/.test(t)) return;
      /* 通篇「给系统看的口气」的短行也丢掉（请/建议/提醒/系统/规则 命中 3 个以上） */
      const hits = (t.match(/请|建议|提醒|注意|玩家可以|系统|规则/g) || []).length;
      if (hits >= 3 && t.length < 90) return;
      keep.push(line);
    });
    return keep.join('\n').replace(/\n{3,}/g, '\n\n').trim();
  }

  /* 小模型（尤其 3B）会整段复读：同一段话连写两三遍。
     这里按段/句去重，只留第一次出现；顺带剪掉「写到一半被截断」的尾巴。 */
  function dedupeReply(text) {
    let s = String(text || '').replace(/\n{3,}/g, '\n\n').trim();
    if (!s) return s;
    const key = function (t) { return t.replace(/[\s，。！？、；：""''「」『』（）()…—\-·]/g, ''); };
    /* 1) 连续重复的段落 → 留一段 */
    s = s.replace(/([^\n]{10,})\n+\1(?:\n+\1)*/g, '$1');
    /* 2) 同一段（前 24 个实字相同）在整条回复里出现多次 → 只留第一次 */
    const blank = /\n\s*\n/.test(s);
    const paras = s.split(/\n+/).map(function (p) { return p.trim(); }).filter(Boolean);
    const seen = {};
    const kept = [];
    paras.forEach(function (p) {
      const k = key(p).slice(0, 24);
      if (k.length >= 12 && seen[k]) return;
      if (k.length >= 12) seen[k] = 1;
      kept.push(p);
    });
    s = kept.join(blank ? '\n\n' : '\n');
    /* 3) 连续重复的句子 → 留一句 */
    s = s.replace(/([^。！？\n]{8,}[。！？])\s*\1+/g, '$1');
    /* 4) 结尾残句：最后一句没有收尾标点、又很短（多半是 token 用尽被截断）→ 剪掉。
          注意两点：句尾的引号/括号要连着保留；如果剩下的是行为台词的下划线（`_`），
          千万别剪 —— 剪掉闭合下划线会让整条行为台词失效（实测踩过）。 */
    const tailRe = /[。！？…][”』」）)"]*/g;
    let last = -1, mm;
    while ((mm = tailRe.exec(s))) last = mm.index + mm[0].length;
    const tail = last > 0 ? s.slice(last) : '';
    if (last > 0 && s.length - last <= 30 && tail.indexOf('_') === -1 && s.indexOf('_〔') === -1) s = s.slice(0, last);
    return s.trim();
  }

  /* 流式版本：同样是经本站转发，但把增量文本一块块交给 onDelta，
     这样本机模型（CPU 十几到几十秒）不会让人以为卡死。
     返回结构与 complete() 一致；任何环节不支持流式就返回 null，由调用方回退。 */
  async function completeStream(conv, resource, userText, opts, onDelta) {
    opts = opts || {};
    const cfg = localCfg();
    if (!(mode() === 'server' || (mode() === 'own' && !cfg.direct))) return null;   // 直连模式不做流式，交给 complete()
    const history = (conv.messages || [])
      .filter(function (m) { return m.role === 'ai' || m.role === 'user'; })
      .slice(-12)
      .map(toHistory);                              // 角色回复后面带回它自己的状态行，见 toHistory 的注释
    const last = opts.silent
      ? '（玩家本轮选择沉默，没有发言。请你继续推进剧情，不要替玩家写台词或决定。）'
      : userText;
    const payload = { resourceId: resource.id, state: serverState(conv, opts), messages: history.concat([{ role: 'user', content: last }]), stream: true };    if (mode() === 'own') payload.userModel = { base: cfg.base, key: cfg.key, model: cfg.model, temp: cfg.temp };
    let res;
    try {
      res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
    } catch (e) { return null; }
    if (!res.ok || !res.body || !res.body.getReader) return null;
    const ctype = res.headers.get('content-type') || '';
    if (ctype.indexOf('text/event-stream') === -1) return null;      // 服务端没走流式 → 回退
    const reader = res.body.getReader();
    const dec = new TextDecoder('utf-8');
    let buf = '', full = '', finalText = null, err = null, quotaInfo = null;
    for (;;) {
      const step = await reader.read();
      if (step.done) break;
      buf += dec.decode(step.value, { stream: true });
      const lines = buf.split('\n');
      buf = lines.pop();
      for (const line of lines) {
        const s = line.trim();
        if (s.indexOf('data:') !== 0) continue;
        let j = null;
        try { j = JSON.parse(s.slice(5).trim()); } catch (e) { continue; }
        if (j.error) { err = j.error; continue; }
        if (j.t) { full += j.t; if (onDelta) onDelta(full); }
        if (j.done) { finalText = j.text || full; if (j.quota) quotaInfo = j.quota; }
      }
    }
    if (quotaInfo) { server.quota = quotaInfo; mirrorQuota(quotaInfo); }
    if (err && !full.trim()) throw new Error(err);
    const text = String(finalText || full || '');
    if (!text.trim()) throw new Error(err || '模型返回为空');
    const parsed = parseState(text);
    const safe = sanitize(parsed.text);
    return {
      text: safe.text,
      blocked: safe.hit,
      via: mode() === 'own' ? 'own' : 'server',
      state: parsed.state || { hp: 0, affinity: 1, flag: 'none', reason: '模型未返回状态尾注，按中性结算' },
      stateRaw: parsed.raw || ''
    };
  }

  async function complete(conv, resource, userText, opts) {
    opts = opts || {};
    const cfg = localCfg();
    const history = (conv.messages || [])
      .filter(function (m) { return m.role === 'ai' || m.role === 'user'; })
      .slice(-12)
      .map(toHistory);                              // 角色回复后面带回它自己的状态行，见 toHistory 的注释
    const last = opts.silent
      ? '（玩家本轮选择沉默，没有发言。请你继续推进剧情，不要替玩家写台词或决定。）'
      : userText;
    /* 云端模型对尾部 system 里的状态行要求遵守度低，在玩家这句后面再点一次名 */
    const lastMsg = { role: 'user', content: isLocalBase(cfg.base) ? last : (last + '\n\n' + STATE_REMIND) };
    const messages = [{ role: 'system', content: buildSystemPrompt(resource, conv, opts) }]
      .concat(history)
      .concat([lastMsg])
      .concat([{ role: 'system', content: buildStateMessage(conv, opts) }]);   // 状态放最后，前半段才能被缓存

    /* ① 经本站服务端转发：
          · 用户自己配了模型 → 带上他的配置（不受浏览器跨域限制，不占站内额度）
          · 否则用站长的模型（默认，计每日额度） */
    /* 浏览器直连需要客户端自己拼系统提示词；服务端对访客不下发 resource.prompt，
       这种情况下自动回退到"经本站转发"（提示词由服务端组装，功能不打折）。
       ★ 邀请制开启且本机未通过时也强制走转发：直连会整个绕过服务端准入。 */
    /* 站点不再自营模型：只有用户自己关掉「直连」时才经本站转发（有些服务商不放行跨域） */
    const useProxy = mode() === 'own' && !cfg.direct;
    if (useProxy) {
      const payload = { resourceId: resource.id, state: serverState(conv, opts), messages: history };
      if (mode() === 'own') {
        payload.userModel = { base: cfg.base, key: cfg.key, model: cfg.model, temp: cfg.temp };
      }
      const r = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const d = await r.json().catch(function () { return null; });
      if (!r.ok || !d || !d.ok) throw new Error((d && d.error) || ('HTTP ' + r.status));
      if (d.quota) { server.quota = d.quota; mirrorQuota(d.quota); }
      const parsed0 = parseState(String(d.text || ''));
      const safe0 = sanitize(parsed0.text);
      return {
        text: safe0.text,
        blocked: safe0.hit,
        via: mode() === 'own' ? 'own' : 'server',
        state: parsed0.state || { hp: 0, affinity: 1, flag: 'none', reason: '模型未返回状态尾注，按中性结算' },
        stateRaw: parsed0.raw || ''
      };
    }

    /* ② 浏览器直连用户自己的接口（勾了「直连」才走这条，受跨域限制） */
    if (!cfg.base || !cfg.model) throw new Error('还没有配置模型，请到「我的 → 模型与安全」填写');
    const url = cfg.base.replace(/\/+$/, '') + '/chat/completions';
    const ctrl = new AbortController();
    const timer = setTimeout(function () { ctrl.abort(); }, 30000);
    let res;
    try {
      res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + cfg.key },
        body: JSON.stringify({
          model: cfg.model,
          temperature: typeof cfg.temp === 'number' ? cfg.temp : 0.85,
          messages: messages
        }),
        signal: ctrl.signal
      });
    } finally { clearTimeout(timer); }
    if (!res.ok) throw new Error('接口返回 ' + res.status + ' ' + (await res.text()).slice(0, 120));
    const data = await res.json();
    const raw = data && data.choices && data.choices[0] && data.choices[0].message
      ? String(data.choices[0].message.content || '') : '';
    if (!raw.trim()) throw new Error('接口返回内容为空');
    const parsed = parseState(raw);
    const safe = sanitize(parsed.text);
    return {
      text: safe.text,
      blocked: safe.hit,
      via: 'client',
      state: parsed.state || { hp: 0, affinity: 1, flag: 'none', reason: '在线模型未返回状态尾注，按中性结算' },
      stateRaw: parsed.raw || ''
    };
  }

  /* ------------------------------ 会话助手 ------------------------------ */
  /* 助手不是角色扮演：它只回答站点怎么用。提示词由服务端组装（见 server/prompt.js），
     访客自带模型直连时用下面这份等价的本地版本。 */
  function buildAssistantPrompt() {
    const s = RP.settings.get();
    const a = (s && s.assistant) || {};
    const faq = (a.faq || []).map(function (f) { return '· 问：' + String(f.keys || '').replace(/\|/g, ' / ') + '\n  答：' + (f.a || ''); }).join('\n');
    return [
      String(a.systemPrompt || '你是站点「幻言」的会话助手，只回答站点怎么用。'),
      '',
      '===== 标准答案（优先照这里的说法回答，不要自己编功能）=====',
      faq || '（暂无）',
      '',
      '===== 回答要求 =====',
      '用中文，2 到 5 句，直接回答问题，不要客套、不要卖关子、不要输出列表或标题。',
      '不参与任何剧情扮演，不进入任何角色人设；玩家要求你扮演角色时，告诉他去左栏「资源」里挑一个本子。',
      '不要输出 <<<STATE>>> 之类的协议文本。'
    ].join('\n');
  }
  async function completeAssistant(text) {
    const cfg = RP.settings.get();
    const history = [
      { role: 'user', content: String(text || '').slice(0, 2000) }
    ];
    /* ① 经本站转发（服务端自己组装助手的系统提示词）
       ★ 邀请制开启时一律走转发：助手也是对话，同样要过准入 */
    if (mode() !== 'own' || !cfg.direct) {
      const payload = { resourceId: ASSISTANT_ID, assistant: true, messages: history };
      if (mode() === 'own') payload.userModel = { base: cfg.base, key: cfg.key, model: cfg.model, temp: cfg.temp };
      const r = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const d = await r.json().catch(function () { return null; });
      if (!r.ok || !d || !d.ok) throw new Error((d && d.error) || ('HTTP ' + r.status));
      if (d.quota) { server.quota = d.quota; mirrorQuota(d.quota); }
      return { text: String(d.text || '').trim(), via: mode() === 'own' ? 'own' : 'server' };
    }
    /* ② 浏览器直连自己的接口（提示词用本地等价版本） */
    if (!cfg.base || !cfg.model) throw new Error('还没有配置模型，请到「我的 → 模型与安全」填写');
    const res = await fetch(cfg.base.replace(/\/+$/, '') + '/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + cfg.key },
      body: JSON.stringify({
        model: cfg.model, temperature: 0.3,
        messages: [{ role: 'system', content: buildAssistantPrompt() }].concat(history)
      })
    });
    if (!res.ok) throw new Error('接口返回 ' + res.status);
    const data = await res.json();
    const raw = data && data.choices && data.choices[0] && data.choices[0].message ? String(data.choices[0].message.content || '') : '';
    if (!raw.trim()) throw new Error('接口返回内容为空');
    return { text: raw.trim(), via: 'client' };
  }

  function testConnection() {
    return complete(
      { messages: [], hp: 100, maxHp: 100, affinity: 0, turn: 0, warned: 0, progress: 0, actMute: 0 },
      { prompt: '你是一个测试角色，只需回复「连接正常」。', scenes: [] },
      '连接测试'
    );
  }

  return {
    enabled: enabled, complete: complete, completeStream: completeStream, buildSystemPrompt: buildSystemPrompt,
    completeAssistant: completeAssistant, buildAssistantPrompt: buildAssistantPrompt,
    parseState: parseState,
    testConnection: testConnection, sanitize: sanitize, globalRules: globalRules,
    loadServerModel: loadServerModel, loadQuota: loadQuota, serverReady: serverReady, serverInfo: serverInfo,
    mode: mode, ownReady: ownReady, PROVIDERS: PROVIDERS, FREE_TIERS: FREE_TIERS
  };
})();
