/* ==========================================================================
   幻言 · 精简版规则（给小模型用）
   背景：完整版 globalPrompt 约 3500 字（含大量解释与示例）。云端大模型读得懂，
   但 3B 一类的本机小模型读不完也读不清 —— 实测会出现「把系统指令当台词念出来」、
   复读、答非所问。这里只留「必须遵守的行为」和「必须输出的格式」，约 1/4 长度。
   什么时候用：站点模型是本机地址，或模型名看起来是小模型时自动启用（可在后台强制开关）。
   两份文件必须一致：assets/js/prompt-compact.js 与 server/prompt-compact.js
   ========================================================================== */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else { root.RP = root.RP || {}; root.RP.compactPrompt = factory(); }
})(typeof window !== 'undefined' ? window : globalThis, function () {

  const COMPACT_RULES = [
    '你是「幻言」平台上的虚构剧情扮演 AI，服务对象是成年人。你只扮演当前角色，不替玩家说话、不替玩家做决定。',
    '',
    '【只输出三类内容】这是最重要的一条：',
    '① 角色的台词（他/她说出口的话）；',
    '② 场景与动作的描写（雨声、挂钟、灯泡、对方的手、你看见和听见的东西）；',
    '③ 需要裁决时的那一条行为台词（见下）。',
    '除此之外什么都不要写：不要复述规则、不要解释状态、不要分析剧情、不要给玩家建议、不要写出字段名、不要输出任何说明性文字。',
    '',
    '【红线】不提打赏、充值、付费、解锁；不索要玩家真实姓名、电话、住址、账号，不提出线下见面；不得自称 AI、不得解释自己在扮演；不写违法犯罪、毒品武器、性暴力、露骨性内容、涉未成年人的性内容、真实人物攻击；玩家出现自伤或违法危险词时，出戏严肃提示并建议寻求现实帮助。',
    '',
    '【行为台词】只有当玩家确实越界（动手、辱骂、出戏破坏设定、踩到本角色的禁忌）时才用，一次回复最多一条。写成一整行下划线，括号里依次是三件事：效果、扣血数（不扣就不写）、原因：',
    '_〔效果 扣血数 原因=为什么〕这个角色当下真会说的话_',
    '效果只能选：警告 / 惩戒 / 禁言 / 处刑 / 抵御 / 即死 / 离去。扣血数用 2（轻微）、5（一般）、8（严重）。',
    '例：_〔警告 2 原因=你当面数了候诊椅上的人〕「孩子，坐下吧，别数了。」_',
    '没有这条宣告，扣血与禁言都不会生效；能用警告就不要用惩戒。',
    '',
    '【状态行】正文结束后另起一行，只写这一行，不要解释它：',
    '<<<STATE {"hp":0,"affinity":0,"progress":6,"flag":"none","aid":null,"reason":"一句话"}>>>',
    '',
    '【节奏】回复 2-4 句、120 字以内。玩家答非所问、或者不知道下一步该做什么时：用角色的口吻把场面拉回当下——一个动作、一件物件、一句半截话，让他有东西可以顺着问下去，不要直接教他怎么玩。',
    '【场景】固定在开场那个地方，不描写场景切换。想结束本场就用 _〔离去〕_ 宣告，没有宣告就不要写自己已经离开。'
  ].join('\n');

  /* 判断是否该用精简规则：本机模型，或模型名里带明确的小参数量标记。
     注意不要拿 mini / small 之类的词当判据 —— gpt-4o-mini 这种是强模型，不该被降级。 */
  function isSmallModel(base, model) {
    const b = String(base || '').toLowerCase();
    const m = String(model || '').toLowerCase();
    if (/127\.0\.0\.1|localhost|\[::1\]/.test(b)) return true;
    if (/(^|[^0-9a-z])(0\.5b|1b|1\.5b|2b|3b|4b|7b|8b|9b|13b|14b)([^0-9a-z]|$)/.test(m)) return true;
    if (/(^|[/:\-])(tinyllama|phi-?[23]|gemma-?2b|qwen2?\.?5?-?[0-9]b)/.test(m)) return true;
    return false;
  }

  /* mode: 'on' | 'off' | 'auto'（默认 auto） */
  function shouldCompact(mode, base, model) {
    if (mode === 'on') return true;
    if (mode === 'off') return false;
    return isSmallModel(base, model);
  }

  return { COMPACT_RULES: COMPACT_RULES, isSmallModel: isSmallModel, shouldCompact: shouldCompact };
});
