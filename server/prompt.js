/* ==========================================================================
   幻言 · 服务端提示词组装（/api/chat 专用）
   目的：系统提示词只能由服务端用自己的数据生成，客户端只允许提供
        「资源 id + 本场状态 + 对话历史」，因此这个接口无法被当成
        免费的通用大模型代理来用。
   客户端自带的 buildSystemPrompt 只用于「访客自带密钥直连」模式。
   ========================================================================== */

const STATE_RE = /\{[\s\S]*?\}/;
const guard = require('./content-guard');
const compact = require('./prompt-compact');

/* 状态行要求只写在「历史之后那条 system」里时，云端模型的遵守度很低：
   实测 glm-4-flash 直接调用只有 1/5 会输出 <<<STATE>>>，走站点 /api/chat 更是 0/5
   —— 状态机制（HP / 好感 / 推进度 / flag）等于全部失效。
   把同一句要求补在玩家这句话之后（模型最后看到的位置）升到 4/5。
   只对云端模型补：本机小模型本来遵守得好，多塞一句反而容易被它当台词念出来。 */
const STATE_REMIND = '（系统：本轮回复的最后另起一行，原样输出这一行；三个数都换成本回合的变化量'
  + '（hp=本回合扣血数，没扣写 0）：\n'
  + '<<<STATE {"hp":0,"affinity":好感增减,"progress":推进度增量,"flag":"none","reason":"一句话原因"}>>>）';

function isLocalBase(base) {
  return /^https?:\/\/(127\.0\.0\.1|localhost|\[::1\]|0\.0\.0\.0)(:|\/|$)/i.test(String(base || ''));
}

function buildMessages(resource, settings, state, history) {
  if (!resource || !resource.prompt) return null;
  const mo = (settings && settings.__model) || {};              // { base, model, compact }
  const sys = buildSystemPrompt(resource, settings, mo);
  const hist = [];
  (Array.isArray(history) ? history : []).forEach(function (m) {
    if (!m || (m.role !== 'user' && m.role !== 'assistant')) return;
    const c = String(m.content == null ? '' : m.content);
    if (!c.trim()) return;
    hist.push({ role: m.role, content: c.slice(0, 4000) });
  });
  if (!hist.length) return null;
  /* 历史里最后一条必须是玩家发言，避免客户端塞入伪造的 assistant 回合 */
  if (hist[hist.length - 1].role !== 'assistant' && hist[hist.length - 1].role !== 'user') return null;
  /* ★ 实时状态放在最后一条独立消息里：模型服务（Ollama/llama.cpp）按「最长公共前缀」复用 KV 缓存，
     状态每轮都变 —— 只要它出现在中段，后面所有内容（输出要求、历史、这一句）每轮都要重算；
     挪到最后之后，前缀 = 规则 + 历史，基本全部命中缓存，首字延迟能砍掉一大半。
     ★ 云端模型另需在玩家发言后面再点一次名（见 STATE_REMIND）。 */
  const out = [{ role: 'system', content: sys }].concat(hist.slice(-13));
  const tail = out[out.length - 1];
  if (!isLocalBase(mo.base) && tail && tail.role === 'user') {
    tail.content = tail.content + '\n\n' + STATE_REMIND;
  }
  return out.concat([{ role: 'system', content: buildStateMessage(state, mo) }]);
}

/* 每轮的实时状态 + 本轮要求。
   ★ 刻意写短：这一段紧贴玩家的发言，是对小模型影响最大的位置。
     曾经这里堆了近千字的强调、解释与「建议你…」，结果是模型把系统指令当台词念了出来。 */
function buildStateMessage(st, mo) {
  st = st || {};
  const lines = [];
  lines.push('===== 本场状态 =====');
  lines.push(String(st.userName || '旅人').slice(0, 24) +
    ' | 状态值 ' + int(st.hp, 0, 1000) + '/' + int(st.maxHp, 1, 1000) +
    ' | 心境 ' + (String(st.mood || '冷淡').slice(0, 8)) +
    ' | 回合 ' + int(st.turn, 0, 100000) +
    ' | 推进度 ' + int(st.progress, 0, 100) + '%' +
    ' | 累计越界 ' + int(st.warned, 0, 1000));
  if (int(st.conduct, 0, 1000) > 0) lines.push('已处置 ' + int(st.conduct, 0, 1000) + ' 次：再犯要延续上次的强度或加重。');
  if (int(st.actMute, 0, 100) > 0) lines.push('玩家被封口，还剩 ' + int(st.actMute, 0, 100) + ' 回合。');
  if (st.forceAnswer) lines.push('玩家用了反制道具：这一轮必须正面回答他的问题。');
  if (Array.isArray(st.plotItems) && st.plotItems.length) {
    lines.push('玩家手上的剧情道具：' + st.plotItems.slice(0, 8).map(function (x) { return String(x).slice(0, 20); }).join('、'));
  }
  if (Array.isArray(st.items) && st.items.length) {
    lines.push('本轮引用的道具：' + st.items.slice(0, 6).map(function (x) { return String(x).slice(0, 20); }).join('、') + '（必须对它们作出反应）');
  }
  if (st.silent) {
    lines.push('本轮玩家没有说话：只写 1-2 句推进（一个动作或一句短台词），不要反问玩家。');
  } else if (st.lastAi) {
    lines.push('不要重复你上一条说过的话：「' + String(st.lastAi).slice(0, 40) + '」');
  }
  lines.push('本轮：2-4 句、120 字内，只写角色的动作与台词，不要输出【】开头的说明或建议。');
  /* 三个数必须说清是「本回合的变化量」：实测 glm-4-flash 会把 hp 写成当前血量（20）、
     progress 写成当前推进度（比如 24），而站点是按增量结算的 —— 结果是每轮白送满血回血、
     推进度一跳一大截。写清语义后它才按增量填。 */
  lines.push('结尾另起一行输出状态行，三个数都填「本回合的变化量」：' +
    'hp 填本回合扣了多少血（没扣就写 0）、affinity 填好感增减、progress 填推进度增量（一般 3-10）：');
  lines.push('<<<STATE {"hp":0,"affinity":1,"progress":6,"flag":"none","aid":null,"reason":"简短"}>>>');
  return lines.join('\n');
}

/* 把本子提示词里的「协议段」过滤掉。
   根因：10 个本子的 prompt 写在协议定稿之前，每个都自带一份「行为台词怎么写 / STATE 怎么写」，
   加上平台规则与本场规则，同一套协议在提示词里被讲了 3-4 遍。实测 3B 模型分不清
   「关于输出的说明」与「要输出的内容」，会把 `_〔效果 参数〕台词正文_` 原样念出来。
   ★ 只删讲协议的「句子」，不删整条规则 —— 否则会把「严禁任何恋爱…」这类内容一起误删
     （踩过：凛的未成年红线整条消失，被 smoke-guard 抓到）。 */
const PROTO_SENT = /行为台词|台词正文|_〔|<<<STATE|\bflag\b|\baid\b/;
const PROTO_NUM = /(progress|hp|affinity|推进度|好感|状态值)/i;
function stripProtoSentences(text) {
  return String(text || '').split(/(?<=[。；;！!])/).filter(function (sent) {
    const t = sent.trim();
    if (!t) return false;
    if (PROTO_SENT.test(t)) return false;                 // 讲行为台词/STATE/字段的句子
    if (PROTO_NUM.test(t) && /\d/.test(t)) return false;   // 讲数值区间的句子
    return true;
  }).join('').trim();
}
function slimRules(text) {
  return String(text || '').split('\n').map(function (line) {
    const t = line.trim();
    if (!t) return '';
    return stripProtoSentences(line);
  }).filter(function (l, i, arr) {
    return l.trim() || (i > 0 && arr[i - 1] && arr[i - 1].trim());
  }).join('\n').replace(/\n{3,}/g, '\n\n').trim();
}
/* 规则条目：按句过滤，条目里还剩内容就保留 */
function slimRuleList(list) {
  return (list || []).map(stripProtoSentences).filter(function (r) { return String(r || '').trim().length > 6; });
}

function buildSystemPrompt(resource, settings, mo) {
  mo = mo || {};
  const useCompact = compact.shouldCompact(mo.compact, mo.base, mo.model);
  const parts = [];
  parts.push(useCompact ? compact.COMPACT_RULES
    : (settings && settings.globalPrompt ? settings.globalPrompt : '你是角色扮演陪聊 AI，只提供虚构剧情扮演。'));
  parts.push('');
  parts.push('===== 本场资源提示词 =====');
  parts.push(slimRules(String(resource.prompt || '').slice(0, 8000)));
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
    parts.push(memoryHint());
  }
  /* 未成年角色：自动追加不可协商的红线 */
  return guard.applyToPrompt(parts.join('\n'), resource);
}

function memoryHint() {
  return '【提醒】需要制裁玩家时，必须先用一条行为台词宣告：_〔效果 参数〕台词正文_（效果：警告/惩戒/禁言/处刑/抵御/即死/离去）。' +
    '没有行为台词，系统会拒绝执行任何扣血、禁言、处刑与抵消道具。' +
    '★ 扣血只允许发生在玩家真的越界之后（顶撞辱骂、出戏破设定、踩角色雷点、动手伤人）：' +
    '正常的提问、认真的扮演、推进剧情的发言一律不得扣血，也不得为了「显得有性格」随手甩行为台词。' +
    '场景固定，不要描写或切换背景。';
}

/* ------------------------------ 会话助手 ------------------------------ */
/* 助手不是角色扮演：它只回答「这个站点怎么用」。提示词同样只由服务端组装。 */
const ASSISTANT_ID = '__assistant';
function buildAssistantSystemPrompt(settings) {
  const a = (settings && settings.assistant) || {};
  const faq = (a.faq || []).map(function (f) {
    return '· 关键词：' + String(f.keys || '').replace(/\|/g, ' / ') + '\n  标准答案：' + String(f.a || '').slice(0, 600);
  }).join('\n');
  return [
    String(a.systemPrompt || '你是站点「幻言」的会话助手，只回答这个站点怎么用。'),
    '',
    '===== 标准答案（优先照这里的说法回答，不要自己编功能）=====',
    faq || '（暂无）',
    '',
    '===== 回答要求 =====',
    '用中文，2 到 5 句，直接回答问题；不要客套、不要卖关子、不要输出列表或标题。',
    '不参与任何剧情扮演，不进入任何角色人设。玩家要求你扮演角色时，告诉他去左栏「资源」里挑一个本子。',
    '不要输出 <<<STATE>>> 之类的协议文本，不要输出行为台词。',
    '不得输出违法内容，不写露骨性内容，不诱导任何形式的付费。'
  ].join('\n');
}
function buildAssistantMessages(settings, history) {
  const hist = [];
  (Array.isArray(history) ? history : []).forEach(function (m) {
    if (!m || (m.role !== 'user' && m.role !== 'assistant')) return;
    const c = String(m.content == null ? '' : m.content);
    if (!c.trim()) return;
    hist.push({ role: m.role, content: c.slice(0, 2000) });
  });
  if (!hist.length) return null;
  return [{ role: 'system', content: buildAssistantSystemPrompt(settings) }].concat(hist.slice(-9));
}

module.exports = {
  STATE_REMIND: STATE_REMIND,
  isLocalBase: isLocalBase,
  buildMessages: buildMessages, buildSystemPrompt: buildSystemPrompt, buildStateMessage: buildStateMessage, memoryHint: memoryHint,
  buildAssistantMessages: buildAssistantMessages, buildAssistantSystemPrompt: buildAssistantSystemPrompt,
  ASSISTANT_ID: ASSISTANT_ID
};

function int(v, lo, hi) {
  const n = Number(v);
  if (!isFinite(n)) return lo;
  return Math.max(lo, Math.min(hi, Math.round(n)));
}
