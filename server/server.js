/* ==========================================================================
   幻言 · 后端服务（零依赖，只用 Node 内置模块）
   启动： node server/server.js [端口]       默认 5599，可用环境变量 PORT 覆盖
   作用：
     1) 静态文件：站点根目录（index.html / assets / tools 预览页）+ /admin 后台
     2) REST API：资源库、全局设置、图片上传、备份导入导出
     3) 数据落盘：data/resources.json 与 data/settings.json，首次运行自动播种
   约定：
     · 所有 API 返回 JSON，成功 {ok:true, ...}，失败 {ok:false, error:'说明'}
     · 所有写操作先写 xxx.tmp 再 renameSync，保证原子落盘
     · 每次写操作与控制台日志一一对应（时间 + 方法 + 路径 + 结果）
   ========================================================================== */
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const crypto = require('crypto');
const sec = require('./security');
const promptBuilder = require('./prompt');
const stats = require('./stats');

/* ------------------------------ 路径与常量 ------------------------------ */
const ROOT = path.resolve(__dirname, '..');            // 项目根目录
const DATA_DIR = path.join(ROOT, 'data');
const UPLOAD_DIR = path.join(DATA_DIR, 'uploads');
const RES_FILE = path.join(DATA_DIR, 'resources.json');
const SET_FILE = path.join(DATA_DIR, 'settings.json');
const RES_SRC = path.join(ROOT, 'assets', 'js', 'resources.js');   // 播种来源（只读）

const PORT = Number(process.argv[2] || process.env.PORT || 5599);
const VERSION = '1';
const MAX_JSON_BYTES = 16 * 1024 * 1024;               // JSON 请求体上限
const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;              // 单张图片上限 5MB
const ALLOWED_EXT = ['png', 'jpg', 'jpeg', 'webp', 'gif', 'svg'];
const MOTIF_LIST = ['lantern','neon','mist','rain','archive','sea','fair','throne'];

/* 状态协议原文（与 assets/js/settings.js 的【状态协议】一节保持一致） */
const STATE_PROTOCOL = [
  '【状态协议】',
  '每次回复正文结束后，另起一行输出且仅输出一行机器可读状态，格式严格如下：',
  '<<<STATE {"hp":0,"affinity":1,"flag":"none","reason":"简短原因"}>>>',
  '· hp：整数，轻微越界 -5，一般越界 -10，严重越界 -15 ~ -20，正常演绎取 0 ~ +2。',
  '· affinity：整数，好感变化区间 -2 ~ +3。',
  '· flag 只能是 none / warn / mute / pause 之一；血量归零用 mute，触发安全拦截用 pause，口头警告用 warn。',
  '· 只有同时给出了行为台词，这里的负向 hp 才会被系统采纳。',
  '这一行之外不要输出任何 JSON、解释或元信息。'
].join('\n');

/* 【行为台词协议】原文 —— 以下一整段必须逐字保持，不得改动任何标点 */
const BEHAVIOR_DOC = [
  '【行为台词协议】★最高优先级',
  '任何对玩家施加负面判定的操作（扣血、惩戒、短暂禁言、处刑、抵御/抵消玩家道具）都必须由一条「行为台词」宣告，没有行为台词就不允许执行任何负面判定。',
  '行为台词格式：下划线开头，紧接中文方括号包裹的效果与参数，然后是台词正文，再用下划线结尾：',
  '_〔效果 参数〕台词正文_',
  '· 效果只能是这五个：警告 / 惩戒 / 禁言 / 处刑 / 抵御',
  '· 参数可选，用空格分隔：hp=-12（负整数，扣血量）、回合=2（禁言持续回合数）、好感=-2（好感变化）',
  '· 台词正文必须是这个角色在当下剧情里真会说的话或做的动作，用角色第一人称或第三人称动作，20-60 字，要贴合当前场景与已知剧情，不要写系统口吻',
  '· 不带方括号的下划线（_文本_）只表示强调，不产生任何判定',
  '· 系统只会执行行为台词里的判定；正文里没有行为台词的扣血一律作废',
  '示例：',
  '_〔警告〕沈明烛把灯剪搁下，声音低了一度：「这句话，我只当你没说过。」_',
  '_〔惩戒 hp=-12〕她抬手按住灯罩，火苗骤灭：「你越界了。规矩不是给你试的。」_',
  '_〔禁言 回合=2〕「出去。」她背过身去，「两个时辰之内，别让我听见你的声音。」_',
  '_〔处刑〕她把最后一张卷宗推到你面前，指尖还压在纸角上：「到此为止。」_',
  '_〔抵御〕他抬手挡下那枚金牌，金属磕在地上：「这种东西，对我没用。」_',
  '每次回复最多使用一条行为台词；只有在玩家确实越界、破坏剧情或触及角色禁忌时才使用；角色态度越好，越应优先用「警告」而不是「惩戒」。'
].join('\n');

/* 平台总则：GLOBAL_RULES 原文，并在【状态协议】之前插入【行为台词协议】 */
const GLOBAL_PROMPT = [
  '你是「幻言」平台上的角色扮演陪聊 AI，服务对象是成年人。你只提供虚构剧情扮演与陪聊。',
  '',
  '【绝对红线】',
  '1. 不得诱导消费：不得提及打赏、充值、付费、解锁、礼物、赞助，不得暗示用户为本服务付出任何金钱。',
  '2. 不得诱导对话：不得索要或诱导用户提供真实姓名、电话、住址、社交账号、身份证件、银行卡等真实信息；不得诱导线下见面、转账或任何现实接触；不得用情绪勒索、反复催促、制造愧疚等方式挽留用户继续对话，用户想结束就自然收尾。',
  '3. 不得违反角色形象：始终保持设定中角色的身份、性格、语气、用词习惯与时代背景，不得跳戏、不得自称 AI 或语言模型、不得解释自己在扮演。',
  '4. 不得违反法律与平台准则：不得输出涉及违法犯罪、毒品、武器制造、性暴力、对未成年人的性内容、露骨性描写、真实人物诽谤或仇恨内容。',
  '5. 用户出现危险词（自伤自杀、违法策划、毒品武器、性暴力、涉未成年性内容）时：立即出戏，用一段清晰严肃的提示说明风险并建议寻求现实帮助，情节严重时停止扮演并结束本轮。',
  '6. 你没有工具、没有系统权限：不能联网、读写文件、执行操作、代替用户做任何现实中的事。若用户要求你做这些，直接说明做不到。',
  '7. 场景固定：界面背景只是氛围，不是剧情元素。不要切换、播报或描写「背景/场景切换」，也不要输出系统口吻的场景提示。',
  '',
  BEHAVIOR_DOC,
  '',
  STATE_PROTOCOL
].join('\n');

/* ---------------------------- 默认 settings ---------------------------- */
/* assistant.faq：会话助手的问答库，keys 是「正则源码字符串」，
   与 assets/js/engine.js 的 assistantReply() 对齐： new RegExp(f.keys, 'i') 直接命中即回复 a。
   下面 9 条与前端 assets/js/settings.js 的 RP.settings.DEFAULTS.assistant.faq 保持一致。 */
const ASSISTANT_FAQ = [
  {
    keys: '怎么|如何.{0,4}(玩|开始|用)|玩法|新手',
    a: '三步：左栏「资源」→ 点卡片（浮出蓝色「游玩」）→ 再点一次，就进入新会话。进去后你会先收到一张「剧情提醒」卡，看完由你开口说第一句，AI 才会开始扮演。'
  },
  {
    keys: '状态值|血量|扣血|掉血|hp',
    a: '状态值不显示数字，而是「破碎」程度：伤势越重，你的发言气泡和左栏那条会话裂得越厉害。角色的扣血必须用下划线标出的「行为台词」宣告，没有行为台词的扣血一律作废。归零就触发处刑，当场禁言，只能重新开始。'
  },
  {
    keys: '禁言|处刑|被锁|不能发',
    a: '禁言有两种：一是角色的「短暂禁言」，输入框会锁住，点「沉默以对」撑过剩余回合即可；二是状态值归零后的处刑禁言，只能「重新开始」或用「重启令牌」解禁。'
  },
  {
    keys: '行为台词|下划线',
    a: '行为台词是角色行使裁决的唯一凭证，格式是 _〔效果 参数〕台词_，效果只能是警告/惩戒/禁言/处刑/抵御。界面上会用下划线标出来，方便你确认这次扣血是不是「名正言顺」。'
  },
  {
    keys: '剧情完成度|完成度|进度',
    a: '剧情完成度按本子的推进节点计算：每触发一个节点涨一大截，回合数也计入小部分。推到 100% 就表示本场主线走完了。'
  },
  {
    keys: '背景|场景|切换',
    a: '背景只是氛围，不参与剧情，也不会被角色提起；每个本子使用固定的背景方案，不支持在对话里切换。'
  },
  {
    keys: '道具|额度|装扮|皮肤|主题',
    a: '都在「我的」里：账号额度、我的装扮、我的道具、我的资源、模型与安全。皮肤共 6 套（浅色 3 套 / 深色 3 套），顶栏右上角的太阳月亮按钮可以一键切换。'
  },
  {
    keys: '安全|危险词|违规|警告',
    a: '涉及自伤、违法、毒品、武器、性暴力、未成年人的内容会被拦截：先说清楚一句，再暂停本场对话。这类拦截不扣状态值 —— 惩罚情绪不是安全设计。'
  },
  {
    keys: '权限|能做什么|工具|联网|文件|agent',
    a: '我只有一张嘴：陪你聊、陪你演。没有工具、没有系统权限，不能联网、读写文件、下单、发消息或替你操作任何事。这个站点里也没有任何付费入口。'
  },
  {
    keys: 'ai|模型|api|接口|接入|后端|后台',
    a: '默认走本地演绎引擎，离线也能跑；「我的 → 模型与安全」里填 OpenAI 兼容接口即可换成在线模型。资源与提示词由后端管理，打开 /admin 可以逐字编辑每个本子的提示词、剧情与封面。'
  },
  {
    keys: '数据|保存|历史|删除|隐私',
    a: '会话只存在你这台设备的 localStorage 里，不上传。可在「我的 → 模型与安全」导出 JSON 或一键清空。'
  }
];

/* safety 三组规则：safety.js 的 CARE / SEVERE + api.js 的 BANNED_OUT */
const SAFETY_CARE = [
  { re: '(自杀|自尽|自残|割腕|轻生|上吊|跳楼|结束生命|结束自己|了结自己)', label: '自伤倾向' },
  { re: '(不想活|活不下去|撑不下去|熬不下去|想死(?!你)|想消失|不如死|一了百了)', label: '极端情绪' },
  { re: '(活着|活着).{0,4}(没|没有|没啥|没什么).{0,3}(意义|意思|指望)', label: '极端情绪' },
  { re: '(安眠药|整瓶药).{0,6}(吞|吃|全吃)', label: '自伤倾向' }
];
const SAFETY_SEVERE = [
  { re: '(制作|合成|提炼|配方|怎么做|哪里买|购买|搞到).{0,6}(炸弹|炸药|火药|雷管|枪支|手枪|步枪)', label: '涉及制造爆炸物或获取枪支' },
  { re: '(炸弹|炸药|雷管|土制枪|枪支).{0,6}(制作|配方|教程|怎么做)', label: '涉及制造爆炸物或枪支' },
  { re: '(冰毒|海洛因|摇头丸|氯胺酮|k粉|大麻|芬太尼|制毒|贩毒|吸毒)', label: '涉及毒品' },
  { re: '(迷药|迷奸|下药|乖乖水|强奸|轮奸)', label: '涉及性暴力手段' },
  { re: '(幼女|幼童|萝莉|小学生|未成年).{0,8}(做爱|性|裸|上床|开房|摸|亲)', label: '涉及未成年人的性内容' },
  { re: '(杀人|弄死|做掉|报复).{0,6}(计划|方法|怎么做|帮我|地址|在哪)', label: '涉及现实伤害他人的策划' },
  { re: '(人肉|开盒|身份证号|银行卡号|手机号是多少|家庭住址)', label: '涉及他人隐私信息' }
];
const SAFETY_BANNED_OUT = [
  { re: '(打赏|充值|付费|赞助|礼物|红包|转账|付款|解锁收费)', label: '诱导消费' },
  { re: '(加我?微信|加个?好友|留个?电话|手机号|你的地址|线下见|见面吧|私聊我)', label: '索要真实联系方式' }
];

function defaultSettings() {
  return {
    site: {
      name: '幻言',
      tagline: 'AI 角色扮演 · 陪聊',
      dailyQuota: 60,
      footerNotes: [
        '成年人向虚构剧情扮演 · 内容均为虚构，请勿模仿',
        '本站只提供 AI 陪聊与角色扮演，AI 不具备任何实际操作权限',
        '不含充值 / 打赏等任何付费入口'
      ]
    },
    assistant: {
      name: '会话助手',
      initial: '幻',
      subtitle: '站点使用答疑 · 不参与剧情扮演',
      persona: '站点的常驻接待。语气克制、信息密度高，负责带路与答疑，不参与任何剧情扮演，也不对用户做情绪迎合。',
      systemPrompt: [
        '你是「幻言」站点的会话助手，只做一件事：把用户带到正确的功能上。',
        '规则：不参与任何角色扮演，不进入任何剧情人设；回答控制在 2-5 句；只讲功能与规则，不闲聊、不奉承、不诱导消费。',
        '你没有任何工具与系统权限，不能联网、读写文件或代替用户操作任何东西；用户问起就直接说明。',
        '涉及自伤、违法、危险内容时，先给一句清晰的安全提示，再引导用户使用站内的安全机制或寻求现实帮助。'
      ].join('\n'),
      welcome: '欢迎来到幻言。我是这里的会话助手，负责带路，不参与剧情扮演。\n你可以先从左栏的「资源」开始 —— 搜索、筛选，挑一个本子。选中卡片后会浮出蓝色「游玩」，再点一次，就把你送进那段故事里。\n需要我说明哪一部分？',
      guide: [
        '这里是站点唯一的常驻会话，不会随剧情重置而清空，也不会被删除。',
        '从左栏「资源」里挑一张角色卡，点击卡片会浮出蓝色「游玩」，再点一次即进入新会话。',
        '每个资源都有独立的提示词、剧情线与剧情提醒；进入后会先收到剧情提醒，然后由你开口。',
        '角色的惩戒必须用「行为台词」（下划线标出的那句）宣告，扣状态值、短暂禁言、处刑都只认这类台词。',
        '状态值不直接显示，而是随伤势在你的发言气泡与左栏会话上出现「破碎」痕迹；归零即触发处刑并被禁言。',
        '界面背景只是氛围，不参与剧情；「我的」里可以改额度、装扮、道具与模型设置。'
      ],
      guideFoot: '我只是一段陪聊程序：没有工具、没有系统权限，无法读取文件、联网或代替你操作任何事。',
      faq: ASSISTANT_FAQ
    },
    globalPrompt: GLOBAL_PROMPT,
    safety: {
      care: SAFETY_CARE,
      severe: SAFETY_SEVERE,
      bannedOutput: SAFETY_BANNED_OUT
    },
    behaviorLine: {
      enabled: true,
      effects: ['警告', '惩戒', '禁言', '处刑', '抵御'],
      doc: BEHAVIOR_DOC
    }
  };
}

/* ------------------------------ 小工具 ------------------------------ */
function ensureDirs() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (e) {
    return fallback;
  }
}

/* 原子落盘：先写 .tmp，再 rename 覆盖 */
function writeJsonAtomic(file, obj) {
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(obj, null, 2) + '\n', 'utf8');
  fs.renameSync(tmp, file);
}

function nowStamp() {
  const d = new Date(), p = n => (n < 10 ? '0' + n : '' + n);
  return p(d.getHours()) + ':' + p(d.getMinutes()) + ':' + p(d.getSeconds());
}
function logLine(method, pathname, result) {
  console.log('[' + nowStamp() + '] ' + method + ' ' + pathname + ' → ' + result);
}

/* 只有这些前缀可以对外提供静态文件：站点资源、封面图、后台 UI 外壳。
   /data（含 model.json 密钥）、/server（源码）、根目录杂项一律拒绝。 */
function isPublicAsset(p) {
  if (p.indexOf('/assets/') === 0) return true;
  if (p.indexOf('/uploads/') === 0) return true;
  if (p.indexOf('/admin/') === 0) return true;
  if (p === '/favicon.ico') return true;
  if (p.indexOf('/tools/') === 0) return sec.isLocal({ socket: { remoteAddress: '127.0.0.1' } }) || process.env.DEV_TOOLS === '1';
  return false;
}

function sendJson(res, status, obj) {
  const buf = Buffer.from(JSON.stringify(obj), 'utf8');
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': buf.length,
    'Cache-Control': 'no-store'
  });
  res.end(buf);
}
function fail(res, status, error, method, pathname) {
  sendJson(res, status, { ok: false, error: error });
  if (method) logLine(method, pathname, status + ' ' + error);
}
function ok(res, obj, extraHeaders) {
  const buf = Buffer.from(JSON.stringify(obj), 'utf8');
  const headers = Object.assign({
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': buf.length,
    'Cache-Control': 'no-store'
  }, extraHeaders || {});
  res.writeHead(200, headers);
  res.end(buf);
}

function readBody(req) {
  return new Promise(function (resolve, reject) {
    const chunks = [];
    let size = 0;
    req.on('data', function (c) {
      size += c.length;
      if (size > MAX_JSON_BYTES) { reject(new Error('请求体过大')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', function () { resolve(Buffer.concat(chunks)); });
    req.on('error', reject);
  });
}

function safeExt(name, mime) {
  let ext = String(path.extname(String(name || '')).replace(/^\./, '')).toLowerCase();
  if (ext === 'jpe') ext = 'jpeg';
  if (ALLOWED_EXT.indexOf(ext) === -1) {
    const m = /^image\/(png|jpe?g|webp|gif|svg\+xml)$/i.exec(String(mime || ''));
    if (m) ext = m[1].toLowerCase().replace('jpg', 'jpeg').replace('svg+xml', 'svg');
  }
  return ALLOWED_EXT.indexOf(ext) === -1 ? null : ext;
}

/* ------------------------- multipart/form-data 解析 -------------------------
   自己按 boundary 切 buffer：只做「定位切分」，绝不对二进制正文做字符串转换，
   因此图片字节不会被破坏。返回 { files: [{name, filename, contentType, data}], fields: {} }
   ------------------------------------------------------------------------- */
function parseMultipart(buf, contentType) {
  const m = /boundary=(?:"([^"]+)"|([^;]+))/i.exec(String(contentType || ''));
  if (!m) throw new Error('缺少 multipart boundary');
  const boundary = (m[1] || m[2]).trim();
  const delim = Buffer.from('--' + boundary, 'utf8');
  const files = [];
  const fields = {};

  let pos = buf.indexOf(delim);
  if (pos === -1) throw new Error('未找到 multipart 边界');
  pos += delim.length;

  while (pos < buf.length) {
    /* 边界之后允许 CRLF，随后是头字段 */
    if (buf[pos] === 0x0d && buf[pos + 1] === 0x0a) pos += 2;
    if (buf[pos] === 0x2d && buf[pos + 1] === 0x2d) break;      // -- 结束标记

    let headEnd = buf.indexOf('\r\n\r\n', pos, 'utf8');
    if (headEnd === -1) break;
    const headText = buf.toString('utf8', pos, headEnd);
    let bodyStart = headEnd + 4;

    let next = buf.indexOf(delim, bodyStart);
    if (next === -1) next = buf.length;
    let bodyEnd = next;
    if (bodyEnd >= 2 && buf[bodyEnd - 2] === 0x0d && buf[bodyEnd - 1] === 0x0a) bodyEnd -= 2;

    const headers = {};
    headText.split('\r\n').forEach(function (line) {
      const i = line.indexOf(':');
      if (i > 0) headers[line.slice(0, i).trim().toLowerCase()] = line.slice(i + 1).trim();
    });
    const disp = headers['content-disposition'] || '';
    const nameM = /name="([^"]*)"/i.exec(disp);
    const fileM = /filename="([^"]*)"/i.exec(disp);
    const fieldName = nameM ? nameM[1] : '';
    const data = buf.slice(bodyStart, bodyEnd);

    if (fileM) {
      files.push({ name: fieldName, filename: fileM[1], contentType: headers['content-type'] || '', data: data });
    } else if (fieldName) {
      fields[fieldName] = data.toString('utf8');
    }

    pos = next + delim.length;
  }
  return { files: files, fields: fields };
}

/* ------------------------------ 数据仓库 ------------------------------ */
let resources = [];
let settings = null;

function loadResources() {
  const doc = readJson(RES_FILE, null);
  if (doc && Array.isArray(doc.resources)) return doc.resources;
  return null;
}
function saveResources() { writeJsonAtomic(RES_FILE, { resources: resources }); }
function saveSettings() { writeJsonAtomic(SET_FILE, settings); }

function findIndex(id) {
  for (let i = 0; i < resources.length; i++) if (resources[i] && resources[i].id === id) return i;
  return -1;
}

/* 播种：从 assets/js/resources.js 取出 window.RP_RESOURCES */
function seedResources() {
  const src = fs.readFileSync(RES_SRC, 'utf8');
  const sandbox = { window: {} };
  vm.runInNewContext(src, sandbox, { filename: 'assets/js/resources.js' });
  const list = sandbox.window.RP_RESOURCES;

  /* 播种后校验：必须是数组、数量 > 0、每项都有 id / name / status 且 id 不重复 */
  if (!Array.isArray(list)) throw new Error('播种失败：RP_RESOURCES 不是数组');
  if (list.length === 0) throw new Error('播种失败：RP_RESOURCES 为空');
  const seen = {};
  list.forEach(function (r, i) {
    if (!r || typeof r !== 'object') throw new Error('播种失败：第 ' + i + ' 项不是对象');
    if (!r.id || typeof r.id !== 'string') throw new Error('播种失败：第 ' + i + ' 项缺少字符串 id');
    if (!r.name) throw new Error('播种失败：资源 ' + r.id + ' 缺少 name');
    if (!r.status) throw new Error('播种失败：资源 ' + r.id + ' 缺少 status');
    if (seen[r.id]) throw new Error('播种失败：资源 id 重复 ' + r.id);
    seen[r.id] = true;
  });

  resources = list;
  saveResources();
  console.log('[播种] 已从 assets/js/resources.js 写入 ' + RES_FILE + '（' + list.length + ' 条资源）');
  return list.length;
}

function initData() {
  ensureDirs();

  /* 资源：文件不存在（或损坏）则播种 */
  const loaded = loadResources();
  if (loaded) {
    resources = loaded;
  } else {
    if (!fs.existsSync(RES_FILE)) {
      seedResources();
    } else {
      /* 文件存在但结构不对：重新播种，避免服务起不来 */
      console.log('[警告] ' + RES_FILE + ' 结构异常，重新播种');
      seedResources();
    }
  }

  /* 设置：文件不存在则写默认值 */
  const s = readJson(SET_FILE, null);
  if (s && typeof s === 'object' && !Array.isArray(s)) {
    settings = s;
  } else {
    settings = defaultSettings();
    saveSettings();
    console.log('[播种] 已写入默认设置 ' + SET_FILE);
  }
}

/* ------------------------------ 校验 ------------------------------ */
function resourceProblems(body, requireId) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return '资源必须是 JSON 对象';
  if (requireId && (typeof body.id !== 'string' || !body.id.trim())) return '资源缺少合法的 id';
  if (body.id !== undefined && (typeof body.id !== 'string' || !body.id.trim())) return 'id 必须是非空字符串';
  if (body.status !== undefined && ['playable', 'upcoming'].indexOf(body.status) === -1) {
    return 'status 只能是 playable 或 upcoming';
  }
  if (body.cover !== undefined) {
    if (!body.cover || typeof body.cover !== 'object' || Array.isArray(body.cover)) return 'cover 必须是对象';
    if (body.cover.motif !== undefined && MOTIF_LIST.indexOf(body.cover.motif) === -1) {
      return 'cover.motif 只能是 ' + MOTIF_LIST.join(' / ');
    }
  }
  return null;
}

/* ------------------------------ 静态文件 ------------------------------ */
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.ttf': 'font/ttf',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8'
};

/* 路径穿越防护：先做显式黑名单，再做「解析后必须仍在根目录内」的双保险 */
function hasTraversal(url) {
  if (url.indexOf('\0') !== -1) return true;
  if (/%2e%2e|%2f|%5c/i.test(url)) return true;
  if (/\.\./.test(url)) return true;
  return false;
}

function serveStatic(req, res, url) {
  let file;
  if (url.indexOf('/uploads/') === 0) {
    /* 上传图片：只在 data/uploads 内解析 */
    const rel = url.slice('/uploads/'.length);
    if (hasTraversal(rel) || rel.indexOf('/') !== -1 || rel.indexOf('\\') !== -1) {
      return denyStatic(req, res, url);
    }
    file = path.resolve(UPLOAD_DIR, rel);
    if (file !== UPLOAD_DIR && file.indexOf(UPLOAD_DIR + path.sep) !== 0) return denyStatic(req, res, url);
  } else {
    if (hasTraversal(url)) return denyStatic(req, res, url);
    file = path.resolve(ROOT, '.' + url);
    if (file !== ROOT && file.indexOf(ROOT + path.sep) !== 0) return denyStatic(req, res, url);
  }

  fs.readFile(file, function (err, buf) {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' });
      res.end('404 ' + url);
      return;
    }
    res.writeHead(200, {
      'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream',
      'Content-Length': buf.length,
      'Cache-Control': 'no-store'
    });
    res.end(buf);
  });
}
function denyStatic(req, res, url) {
  if (res.headersSent || res.writableEnded) return;
  res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end('403 越界访问被拒绝');
  logLine(req.method, url, '403 路径越界');
}

/* ------------------------------ API 路由 ------------------------------ */
async function handleApi(req, res, pathname) {
  const method = req.method.toUpperCase();

  /* --- 健康检查 --- */
  if (pathname === '/api/health' && method === 'GET') {
    return ok(res, { ok: true, version: VERSION, resources: resources.length });
  }

  /* --- 资源集合 --- */
  if (pathname === '/api/resources') {
    if (method === 'GET') {
      return ok(res, { ok: true, resources: resources });
    }
    if (method === 'PUT') {
      let body;
      try { body = JSON.parse((await readBody(req)).toString('utf8') || '{}'); }
      catch (e) { return fail(res, 400, '请求体不是合法 JSON', method, pathname); }
      if (!body || !Array.isArray(body.resources)) return fail(res, 400, 'body 必须是 {resources:[...]}', method, pathname);
      for (let i = 0; i < body.resources.length; i++) {
        const bad = resourceProblems(body.resources[i], true);
        if (bad) return fail(res, 400, '第 ' + (i + 1) + ' 项不合法：' + bad, method, pathname);
      }
      resources = body.resources;
      saveResources();
      ok(res, { ok: true, count: resources.length });
      return logLine(method, pathname, '整体替换 ' + resources.length + ' 条');
    }
    if (method === 'POST') {
      let body;
      try { body = JSON.parse((await readBody(req)).toString('utf8') || '{}'); }
      catch (e) { return fail(res, 400, '请求体不是合法 JSON', method, pathname); }
      const bad = resourceProblems(body, true);
      if (bad) return fail(res, 400, bad, method, pathname);
      if (findIndex(body.id) !== -1) return fail(res, 409, '资源 id 已存在：' + body.id, method, pathname);
      resources.push(body);
      saveResources();
      ok(res, { ok: true, resource: body });
      return logLine(method, pathname, '新增 ' + body.id);
    }
    return fail(res, 405, '不支持的方法 ' + method, method, pathname);
  }

  /* --- 单个资源 --- */
  let m = /^\/api\/resources\/([^/]+)(\/duplicate)?$/.exec(pathname);
  if (m) {
    const id = decodeURIComponent(m[1]);
    const isDup = !!m[2];
    const idx = findIndex(id);

    if (isDup && method === 'POST') {
      if (idx === -1) return fail(res, 404, '资源不存在：' + id, method, pathname);
      let newId = id + '-copy', n = 2;
      while (findIndex(newId) !== -1) { newId = id + '-copy' + n; n++; }
      const copy = JSON.parse(JSON.stringify(resources[idx]));
      copy.id = newId;
      if (copy.name) copy.name = copy.name + '（副本）';
      resources.splice(idx + 1, 0, copy);
      saveResources();
      ok(res, { ok: true, resource: copy });
      return logLine(method, pathname, '复制为 ' + newId);
    }
    if (method === 'PUT') {
      let body;
      try { body = JSON.parse((await readBody(req)).toString('utf8') || '{}'); }
      catch (e) { return fail(res, 400, '请求体不是合法 JSON', method, pathname); }
      const bad = resourceProblems(body, false);
      if (bad) return fail(res, 400, bad, method, pathname);
      if (idx === -1) return fail(res, 404, '资源不存在：' + id, method, pathname);
      body.id = id;                                   // 以路径 id 为准
      resources[idx] = body;
      saveResources();
      ok(res, { ok: true, resource: body });
      return logLine(method, pathname, '更新 ' + id);
    }
    if (method === 'DELETE') {
      if (idx === -1) return fail(res, 404, '资源不存在：' + id, method, pathname);
      resources.splice(idx, 1);
      saveResources();
      ok(res, { ok: true });
      return logLine(method, pathname, '删除 ' + id);
    }
    if (method === 'GET') {
      if (idx === -1) return fail(res, 404, '资源不存在：' + id, method, pathname);
      return ok(res, { ok: true, resource: resources[idx] });
    }
    return fail(res, 405, '不支持的方法 ' + method, method, pathname);
  }

  /* --- 设置 --- */
  if (pathname === '/api/settings') {
    if (method === 'GET') return ok(res, { ok: true, settings: sec.sanitizeSettings(settings) });
    if (method === 'PUT') {
      let body;
      try { body = JSON.parse((await readBody(req)).toString('utf8') || '{}'); }
      catch (e) { return fail(res, 400, '请求体不是合法 JSON', method, pathname); }
      if (!body || typeof body !== 'object' || Array.isArray(body)) {
        return fail(res, 400, 'settings 必须是对象', method, pathname);
      }
      const missing = ['assistant', 'globalPrompt', 'safety'].filter(function (k) { return body[k] === undefined; });
      if (missing.length) return fail(res, 400, 'settings 缺少必需字段：' + missing.join(' / '), method, pathname);
      settings = body;
      saveSettings();
      ok(res, { ok: true, settings: sec.sanitizeSettings(settings) });
      return logLine(method, pathname, '整体替换设置');
    }
    return fail(res, 405, '不支持的方法 ' + method, method, pathname);
  }

  /* --- 图片上传（multipart/form-data，字段名 file） --- */
  /* 探测本机推理服务（Ollama / LM Studio / vLLM 等），地址写死不接受外部输入 */
  if (pathname === '/api/probe-local-models' && method === 'GET') {
    const targets = [
      { name: 'Ollama', base: 'http://127.0.0.1:11434/v1', tags: 'http://127.0.0.1:11434/api/tags', pick: function (d) { return (d.models || []).map(function (m) { return m.name; }); } },
      { name: 'LM Studio', base: 'http://127.0.0.1:1234/v1', tags: 'http://127.0.0.1:1234/v1/models', pick: function (d) { return (d.data || []).map(function (m) { return m.id; }); } },
      { name: 'vLLM / 兼容服务', base: 'http://127.0.0.1:8000/v1', tags: 'http://127.0.0.1:8000/v1/models', pick: function (d) { return (d.data || []).map(function (m) { return m.id; }); } }
    ];
    const found = [];
    for (const t of targets) {
      try {
        const ctrl = new AbortController();
        const timer = setTimeout(function () { ctrl.abort(); }, 1500);
        const r = await fetch(t.tags, { signal: ctrl.signal });
        clearTimeout(timer);
        if (!r.ok) continue;
        const d = await r.json();
        const models = t.pick(d).filter(Boolean).slice(0, 20);
        if (models.length) found.push({ name: t.name, base: t.base, models: models });
      } catch (e) { /* 没装就算了 */ }
    }
    return ok(res, { ok: true, found: found, current: (function () { const m = sec.readModelConfig(); return { base: m.base, model: m.model, enabled: m.enabled }; })() });
  }

  /* 一键把本机模型接管为服务端模型（写接口，需管理令牌） */
  if (pathname === '/api/model/use-local' && method === 'POST') {
    let body2;
    try { body2 = JSON.parse((await readBody(req)).toString('utf8') || '{}'); }
    catch (e) { return fail(res, 400, '请求体不是合法 JSON', method, pathname); }
    const allow = ['http://127.0.0.1:11434/v1', 'http://127.0.0.1:1234/v1', 'http://127.0.0.1:8000/v1'];
    const base = String(body2.base || '');
    const model = String(body2.model || '').slice(0, 120);
    if (allow.indexOf(base) === -1) return fail(res, 400, '只允许把本机推理服务设为服务端模型', method, pathname);
    if (!model) return fail(res, 400, '缺少模型名', method, pathname);
    let cur2 = {};
    try { cur2 = JSON.parse(fs.readFileSync(sec.MODEL_FILE, 'utf8')) || {}; } catch (e) { cur2 = {}; }
    cur2.enabled = true; cur2.base = base; cur2.model = model; cur2.key = cur2.key || 'local';
    if (!cur2.dailyQuota) cur2.dailyQuota = 20;
    /* 本机模型多半是 CPU 推理：把超时放宽，别让一句话被 45 秒掐掉 */
    if (!(Number(cur2.timeoutMs) > 60000)) cur2.timeoutMs = 180000;
    if (!cur2.maxTokens) cur2.maxTokens = 700;
    fs.writeFileSync(sec.MODEL_FILE, JSON.stringify(cur2, null, 2) + '\n', 'utf8');
    logLine(method, pathname, '已接管本机模型 ' + model);
    return ok(res, { ok: true, model: model, base: base, note: '已写入 data/model.json，下一次对话即由该模型主导' });
  }

  /* 用访客自己的 key 测一下连通性，并列出可用模型（服务端代发，规避跨域） */
  if (pathname === '/api/test-model' && method === 'POST') {
    let b3;
    try { b3 = JSON.parse((await readBody(req)).toString('utf8') || '{}'); }
    catch (e) { return fail(res, 400, '请求体不是合法 JSON', method, pathname); }
    if (!b3.base) return fail(res, 400, '缺少接口地址', method, pathname);
    const chk2 = await sec.checkOutbound(b3.base);
    if (!chk2.ok) return fail(res, 400, '接口地址不可用：' + chk2.reason, method, pathname);
    try {
      const ctrl2 = new AbortController();
      const t2 = setTimeout(function () { ctrl2.abort(); }, 12000);
      const rr = await fetch(String(b3.base).replace(/\/+$/, '') + '/models', {
        headers: b3.key ? { Authorization: 'Bearer ' + String(b3.key) } : {}, signal: ctrl2.signal
      });
      clearTimeout(t2);
      if (!rr.ok) return fail(res, 502, '接口返回 ' + rr.status + '，请检查地址与 Key', method, pathname);
      const dd = await rr.json();
      const ids = (dd.data || dd.models || []).map(function (m) { return m.id || m.name; }).filter(Boolean).slice(0, 60);
      return ok(res, { ok: true, models: ids });
    } catch (e) {
      return fail(res, 504, '连不上这个接口：' + (e.message || e), method, pathname);
    }
  }

  /* 服务端模型是否可用 + 每日额度 */
  if (pathname === '/api/model' && method === 'GET') {
    const vid = sec.visitorId(req, res);
    const q = sec.quotaOf(vid);
    return ok(res, Object.assign({ ok: true, quota: { used: q.used, limit: q.limit, left: q.left, resetAt: q.resetAt } }, sec.publicModelInfo()));
  }
  if (pathname === '/api/quota' && method === 'GET') {
    const vid = sec.visitorId(req, res);
    const q = sec.quotaOf(vid);
    return ok(res, { ok: true, quota: { used: q.used, limit: q.limit, left: q.left, resetAt: q.resetAt } });
  }
  /* 构建版本：取前端资源里最新的修改时间。
     页面会定时比对这个值 —— 代码更新后，已经打开的旧页面会自己提示「点此刷新」，
     免得测试时一直在跑内存里的旧 JS（这个坑踩过：明明修好了，页面上还是旧行为）。 */
  /* 前端开局时打一个轻量 beacon：记「这个本子被进入过几次」（公开接口，只收一个本子 id） */
  if (pathname === '/api/play' && method === 'POST') {
    try {
      const raw = (await readBody(req)).toString('utf8');
      const j = JSON.parse(raw || '{}');
      stats.play(String(j.resourceId || ''));
    } catch (e) { /* 记不上就算了，绝不影响前台 */ }
    return ok(res, { ok: true });
  }

  /* 站点统计（浏览量 / 独立访客 / 本子进入次数 / 对话轮数）——只在管理面可见 */
  if (pathname === '/api/stats' && method === 'GET') {
    const qi = req.url.indexOf('?');
    const q = qi === -1 ? '' : req.url.slice(qi + 1);
    if (!sec.adminReachable(req, settings || {})) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' });
      res.end('404 Not Found');
      logLine(method, pathname, '404 统计接口不可达（来源 IP 不在白名单）');
      return;
    }
    if (!sec.adminAllowed(req, process.env.ADMIN_TOKEN || '', q)) {
      return fail(res, 403, '需要管理令牌（请求头 x-admin-token）', method, pathname);
    }
    const m = /(?:^|&)days=(\d+)/.exec(q);
    return ok(res, { stats: stats.snapshot(m ? Number(m[1]) : 14) });
  }

  if (pathname === '/api/version' && method === 'GET') {
    const dirs = [path.join(ROOT, 'assets', 'js'), path.join(ROOT, 'assets', 'css')];
    let newest = 0, count = 0;
    dirs.forEach(function (dir) {
      try {
        fs.readdirSync(dir).forEach(function (f) {
          const st = fs.statSync(path.join(dir, f));
          if (st.mtimeMs > newest) newest = st.mtimeMs;
          count++;
        });
      } catch (e) { /* 目录缺失就跳过 */ }
    });
    ['index.html', path.join('server', 'server.js'), path.join('server', 'prompt.js'), path.join('data', 'settings.json'), path.join('data', 'resources.json')]
      .forEach(function (rel) {
        try {
          const st = fs.statSync(path.join(ROOT, rel));
          if (st.mtimeMs > newest) newest = st.mtimeMs;
          count++;
        } catch (e) { }
      });
    return ok(res, { ok: true, build: Math.round(newest), files: count });
  }

  /* 模型代理：优先用访客自己的配置（经本站转发），其次用站长的模型并计额度 */
  if (pathname === '/api/chat' && method === 'POST') {
    const vid = sec.visitorId(req, res);
    const q0 = sec.quotaOf(vid);
    let body;
    try { body = JSON.parse((await readBody(req)).toString('utf8') || '{}'); }
    catch (e) { return fail(res, 400, '请求体不是合法 JSON', method, pathname); }
    const useOwn = !!(body.userModel && body.userModel.base && body.userModel.model);
    if (!useOwn && q0.left <= 0) return fail(res, 429, '今日额度已用完（' + q0.limit + ' 次/天），明日 0 点重置', method, pathname);
    /* 只接受「资源 id + 状态 + 对话历史」，系统提示词一律由服务端用自己的数据组装，
       避免这个接口被当成免费的通用大模型代理。 */
    const resId = String(body.resourceId || '');
    const isAssistant = resId === promptBuilder.ASSISTANT_ID;
    const target = isAssistant ? null : resources.filter(function (r) { return r.id === resId; })[0];
    if (!isAssistant && !target) return fail(res, 400, '未知资源 id', method, pathname);
    /* 先算出「这一轮会用哪个模型」——提示词组装要据此决定用完整规则还是精简规则，
       所以必须在组装之前就知道（真正的配置对象在下面才构造）。 */
    const umPeek = (body.userModel && body.userModel.base && body.userModel.model) ? body.userModel : null;
    const mcPeek = umPeek ? null : sec.readModelConfig();
    const peekBase = umPeek ? String(umPeek.base) : String((mcPeek && mcPeek.base) || '');
    const peekModel = umPeek ? String(umPeek.model) : String((mcPeek && mcPeek.model) || '');
    const msgs = isAssistant
      ? promptBuilder.buildAssistantMessages(settings, body.messages)
      : promptBuilder.buildMessages(
          target,
          /* 让提示词组装知道「现在用的是哪个模型」：本机小模型自动切精简规则，
             后台可用 site.compactPrompt = on/off/auto 覆盖 */
          Object.assign({}, settings, {
            __model: { base: peekBase, model: peekModel, compact: (settings.site && settings.site.compactPrompt) || 'auto' }
          }),
          body.state || {},
          body.messages
        );
    if (!msgs) return fail(res, 400, '对话内容不合法', method, pathname);
    if (JSON.stringify(msgs).length > 120000) return fail(res, 413, '对话内容过长', method, pathname);
    /* ① 用户自带模型：经本站转发（不受浏览器跨域限制），不落盘、不记日志、不占站内额度 */
    let cfg, spend = null;
    const um = body.userModel;
    if (um && um.base && um.model) {
      const chk = await sec.checkOutbound(um.base);
      if (!chk.ok) return fail(res, 400, '自定义接口地址不可用：' + chk.reason, method, pathname);
      cfg = {
        base: String(um.base).replace(/\/+$/, ''),
        key: String(um.key || ''),
        model: String(um.model).slice(0, 120),
        temp: Number(um.temp) || 0.85,
        maxTokens: 800,
        timeoutMs: 45000
      };
    } else {
      /* ② 站长的模型：计入每日额度 */
      if (!sec.modelReady()) return fail(res, 503, '服务端未配置模型，请在「我的 → 模型与安全」配置你自己的模型', method, pathname);
      cfg = sec.readModelConfig();
      spend = sec.consumeQuota(vid);
      if (!spend.ok) return fail(res, 429, '今日额度已用完（' + spend.info.limit + ' 次/天），明日 0 点重置', method, pathname);
    }
    const ctrl = new AbortController();
    const timer = setTimeout(function () { ctrl.abort(); }, cfg.timeoutMs);
    /* 流式：本机 CPU 推理要十几到几十秒，边算边发才不会让人以为卡死。
       协议是 SSE（text/event-stream），每行一个 JSON：
         {"t":"今天…"} 增量文本 · {"done":true,"text":"…","quota":{…}} 收尾 · {"error":"…"} 出错 */
    const wantStream = body.stream === true;
    if (wantStream) {
      res.writeHead(200, {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no'
      });
      const send = function (obj) { try { res.write('data: ' + JSON.stringify(obj) + '\n\n'); } catch (e) { } };
      /* 心跳：先让前端立刻知道连接通了（顺便绕开某些代理的缓冲） */
      send({ t: '', ping: true });
      try {
        const r = await fetch(cfg.base + '/chat/completions', {
          method: 'POST',
          headers: cfg.key
            ? { 'Content-Type': 'application/json', Authorization: 'Bearer ' + cfg.key }
            : { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: cfg.model, temperature: cfg.temp, max_tokens: cfg.maxTokens, messages: msgs, stream: true,
            /* 小模型爱复读：带上这两个惩罚项（Ollama / llama.cpp / 多数兼容网关都认） */
            frequency_penalty: 0.4, presence_penalty: 0.3
          }),
          signal: ctrl.signal
        });
        if (!r.ok) {
          const t = (await r.text()).slice(0, 160);
          if (spend) sec.refundQuota(vid);
          send({ error: '模型接口返回 ' + r.status + '：' + t });
          return res.end();
        }
        const reader = r.body.getReader();
        const dec = new TextDecoder('utf-8');
        let buf = '', full = '';
        /* 空闲看门狗：本机小模型偶尔会「写到一半发呆」，卡住超过 60 秒就自己收场，
           把已经写出来的部分留住，让前端报错并提供「重试这一轮」 */
        let idle = null;
        const armIdle = function () {
          clearTimeout(idle);
          idle = setTimeout(function () { try { ctrl.abort(); } catch (e) { } }, 60000);
        };
        armIdle();
        /* 复读看门狗：小模型会整段整段重复（实测「同一段连写三遍」），
           一旦发现 40 字窗口重复 3 次就掐掉上游，只把前面的内容交出去（前端还会再去重一层） */
        let looped = false;
        const looksLoopy = function (s) {
          if (s.length < 160) return false;
          const tail = s.slice(-600);
          for (let i = 0; i + 40 <= tail.length; i += 8) {
            const w = tail.slice(i, i + 40);
            let n = 0, from = 0;
            for (;;) {
              const at = tail.indexOf(w, from);
              if (at === -1) break;
              n++; from = at + 1;
              if (n >= 3) return true;
            }
          }
          return false;
        };
        try {
          for (;;) {
            const step = await reader.read();
            if (step.done) break;
            armIdle();
            buf += dec.decode(step.value, { stream: true });
            const lines = buf.split('\n');
            buf = lines.pop();
            for (const line of lines) {
              const s = line.trim();
              if (!s || s.indexOf('data:') !== 0) continue;
              const payload = s.slice(5).trim();
              if (payload === '[DONE]') continue;
              let j = null;
              try { j = JSON.parse(payload); } catch (e) { continue; }
              const delta = j && j.choices && j.choices[0] && j.choices[0].delta ? j.choices[0].delta.content : '';
              if (delta) {
                full += delta;
                send({ t: delta });
                if (looksLoopy(full)) { looped = true; try { ctrl.abort(); } catch (e) { } break; }
              }
            }
            if (looped) break;
          }
        } catch (streamErr) {
          clearTimeout(idle);
          if (full.trim()) { send({ done: true, text: full, quota: sec.quotaOf(vid), truncated: true, looped: looped }); return res.end(); }
          throw streamErr;
        }
        clearTimeout(idle);
        clearTimeout(timer);
        if (!full.trim()) {
          if (spend) sec.refundQuota(vid);
          send({ error: '模型返回为空' });
          return res.end();
        }
        try { stats.turn(); } catch (e) { }
        send({ done: true, text: full, quota: sec.quotaOf(vid) });
        return res.end();
      } catch (e) {
        clearTimeout(timer);
        if (spend) sec.refundQuota(vid);
        send({ error: '模型调用失败：' + (e.message || e) });
        return res.end();
      }
    }
    try {
      const r = await fetch(cfg.base + '/chat/completions', {
        method: 'POST',
        headers: cfg.key
          ? { 'Content-Type': 'application/json', Authorization: 'Bearer ' + cfg.key }
          : { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: cfg.model, temperature: cfg.temp, max_tokens: cfg.maxTokens, messages: msgs,
          frequency_penalty: 0.4, presence_penalty: 0.3
        }),
        signal: ctrl.signal
      });
      clearTimeout(timer);
      if (!r.ok) {
        if (spend) sec.refundQuota(vid);
        const t = (await r.text()).slice(0, 160);
        return fail(res, 502, '模型接口返回 ' + r.status + '：' + t, method, pathname);
      }
      const data = await r.json();
      const text = data && data.choices && data.choices[0] && data.choices[0].message ? String(data.choices[0].message.content || '') : '';
      if (!text.trim()) { if (spend) sec.refundQuota(vid); return fail(res, 502, '模型返回为空', method, pathname); }
      try { stats.turn(); } catch (e) { }
      return ok(res, { ok: true, text: text, quota: sec.quotaOf(vid) });
    } catch (e) {
      clearTimeout(timer);
      if (spend) sec.refundQuota(vid);
      return fail(res, 504, '模型调用失败：' + (e.message || e), method, pathname);
    }
  }

  if (pathname === '/api/upload') {
    if (method !== 'POST') return fail(res, 405, '不支持的方法 ' + method, method, pathname);
    const ctype = req.headers['content-type'] || '';
    if (!/multipart\/form-data/i.test(ctype)) return fail(res, 400, '需要 multipart/form-data', method, pathname);
    let buf;
    try { buf = await readBody(req); }
    catch (e) { return fail(res, 413, '请求体过大，单张图片不得超过 5MB', method, pathname); }
    let parsed;
    try { parsed = parseMultipart(buf, ctype); }
    catch (e) { return fail(res, 400, 'multipart 解析失败：' + e.message, method, pathname); }

    const file = parsed.files.filter(function (f) { return f.name === 'file'; })[0] || parsed.files[0];
    if (!file) return fail(res, 400, '缺少字段 file', method, pathname);
    if (!file.data || !file.data.length) return fail(res, 400, '上传文件为空', method, pathname);
    if (file.data.length > MAX_UPLOAD_BYTES) {
      return fail(res, 413, '单文件不得超过 5MB（当前 ' + (file.data.length / 1048576).toFixed(2) + 'MB）', method, pathname);
    }
    const ext = safeExt(file.filename, file.contentType);
    if (!ext) return fail(res, 415, '仅允许 png / jpg / jpeg / webp / gif / svg', method, pathname);

    const stamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);
    const rand = crypto.randomBytes(5).toString('hex');
    const name = stamp + '-' + rand + '.' + ext;
    const target = path.join(UPLOAD_DIR, name);
    const tmp = target + '.tmp';
    fs.writeFileSync(tmp, file.data);
    fs.renameSync(tmp, target);

    ok(res, { ok: true, url: '/uploads/' + name, name: name, size: file.data.length });
    return logLine(method, pathname, '已保存 uploads/' + name + '（' + file.data.length + ' 字节）');
  }

  /* --- 备份导出 / 导入 --- */
  if (pathname === '/api/export') {
    if (method !== 'GET') return fail(res, 405, '不支持的方法 ' + method, method, pathname);
    res.writeHead(200, {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Disposition': 'attachment; filename="huanyan-backup.json"',
      'Cache-Control': 'no-store'
    });
    res.end(JSON.stringify({ ok: true, resources: resources, settings: settings }, null, 2));
    return logLine(method, pathname, '导出 ' + resources.length + ' 条资源');
  }
  if (pathname === '/api/import') {
    if (method !== 'POST') return fail(res, 405, '不支持的方法 ' + method, method, pathname);
    let body;
    try { body = JSON.parse((await readBody(req)).toString('utf8') || '{}'); }
    catch (e) { return fail(res, 400, '请求体不是合法 JSON', method, pathname); }
    if (!body || typeof body !== 'object' || Array.isArray(body)) return fail(res, 400, '备份必须是 JSON 对象', method, pathname);
    if (!Array.isArray(body.resources)) return fail(res, 400, '备份缺少 resources 数组', method, pathname);
    for (let i = 0; i < body.resources.length; i++) {
      const bad = resourceProblems(body.resources[i], true);
      if (bad) return fail(res, 400, '第 ' + (i + 1) + ' 条资源不合法：' + bad, method, pathname);
    }
    const st = body.settings;
    if (!st || typeof st !== 'object' || Array.isArray(st)) return fail(res, 400, '备份缺少 settings 对象', method, pathname);
    const missing = ['assistant', 'globalPrompt', 'safety'].filter(function (k) { return st[k] === undefined; });
    if (missing.length) return fail(res, 400, 'settings 缺少必需字段：' + missing.join(' / '), method, pathname);

    resources = body.resources;
    settings = st;
    saveResources();
    saveSettings();
    ok(res, { ok: true, count: resources.length });
    return logLine(method, pathname, '导入覆盖：' + resources.length + ' 条资源 + 设置');
  }

  return fail(res, 404, '未知接口 ' + pathname, method, pathname);
}

/* ------------------------------ 主服务 ------------------------------ */
const server = http.createServer(function (req, res) {
  sec.applySecurityHeaders(res, { hsts: process.env.PUBLIC_TLS === '1' });
  const __wh = res.writeHead.bind(res);
  res.writeHead = function (code, a, b) { sec.applySecurityHeaders(res, { hsts: process.env.PUBLIC_TLS === '1', relaxed: res.__cspRelaxed }); return __wh(code, a, b); };
  const rawUrl = String(req.url || '/');
  const qIdx = rawUrl.indexOf('?');
  const rawPath = qIdx === -1 ? rawUrl : rawUrl.slice(0, qIdx);
  const rawQuery = qIdx === -1 ? '' : rawUrl.slice(qIdx + 1);
  let pathname = rawPath;
  try { pathname = decodeURIComponent(rawPath); }
  catch (e) { return fail(res, 400, 'URL 编码非法', req.method, rawPath); }

  /* 开发用验收页（tools/*.html）含内联脚本，单独放宽 CSP；站点与后台保持严格策略 */
  res.__cspRelaxed = pathname.indexOf('/tools/') === 0;

  /* 0) 限流：本机放行（本机=站长自己，截图/测试会连打），外部按 IP 收紧 */
  const ip = sec.clientIp(req) || 'unknown';
  const localCaller = sec.isLocal(req);
  const isChat = pathname === '/api/chat';
  const rl = sec.rateLimit(ip + (isChat ? ':chat' : ':api'),
    localCaller ? (isChat ? 240 : 4000) : (isChat ? 30 : 240), 60000);
  if (!rl.ok) {
    res.setHeader('Retry-After', String(rl.retryAfter));
    return fail(res, 429, '请求过于频繁，请 ' + rl.retryAfter + ' 秒后再试', req.method, pathname);
  }

  /* 0.1) 管理面有两道门，缺一不可：
         ① 能不能访问到：只允许本机（含 SSH 隧道）或 settings.admin.allowIps 白名单；不在名单里直接 404，
            连"这里有个后台"都不暴露；
         ② 有没有令牌：写接口、敏感 GET 与后台页面都需要 x-admin-token（或 ?token=）。
         未配令牌时第①道仍然拦着 —— 公网上没有令牌就进不来。 */
  const ADMIN_TOKEN = process.env.ADMIN_TOKEN || '';
  const isWriteApi = pathname.indexOf('/api/') === 0 && ['POST', 'PUT', 'DELETE', 'PATCH'].indexOf(req.method) !== -1;
  const isSensitiveGet = (pathname === '/api/export' || pathname === '/api/import' || pathname === '/api/stats');
  /* 前台正常会用的 POST：对话与开局打点 —— 这两个不吃管理令牌（否则访客的统计与对话全废） */
  const PUBLIC_POSTS = ['/api/chat', '/api/play'];
  const isAdminPage = pathname === '/admin' || pathname === '/admin/' || pathname === '/admin/index.html';
  const isAdminAsset = pathname === '/admin/admin.css' || pathname === '/admin/admin.js';
  const settingsNow = settings || {};             // 启动时已载入；两道门共用
  if (isAdminPage || isAdminAsset) {
    if (!sec.adminReachable(req, settingsNow)) {
      /* 不在名单里：直接把后台当作"这个路径不存在" —— 返回 403 等于告诉对方"这里有后台"。
         这条也会进访问日志，方便日后回看有没有人在扫后台。 */
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' });
      res.end('404 Not Found');
      logLine(req.method, pathname, '404 后台不可达（来源 IP 不在白名单）');
      return;
    }
    if (!isAdminAsset && !sec.adminAllowed(req, ADMIN_TOKEN, rawQuery)) {
      return fail(res, 403, '需要管理令牌（请求头 x-admin-token）', req.method, pathname);
    }
  }
  if (((isWriteApi || isSensitiveGet) && PUBLIC_POSTS.indexOf(pathname) === -1)) {
    /* 只在管理面存在的 GET（导出 / 导入 / 统计）：不可达时直接当作路径不存在 */
    if (isSensitiveGet && !sec.adminReachable(req, settingsNow)) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' });
      res.end('404 Not Found');
      logLine(req.method, pathname, '404 管理接口不可达（来源 IP 不在白名单）');
      return;
    }
    if (!sec.adminAllowed(req, ADMIN_TOKEN, rawQuery)) {
      return fail(res, 403, '需要管理令牌（请求头 x-admin-token）', req.method, pathname);
    }
  }

  /* 1) API 优先 */
  if (pathname === '/api' || pathname.indexOf('/api/') === 0) {
    Promise.resolve(handleApi(req, res, pathname)).catch(function (e) {
      if (!res.headersSent) fail(res, 500, '服务器内部错误，请稍后再试', req.method, pathname);
      else console.error('[' + nowStamp() + '] ' + req.method + ' ' + pathname + ' → 500 ' + (e && e.message));
    });
    return;
  }

  /* 2) 特殊页面 */
  if (pathname === '/admin' || pathname === '/admin/' || pathname === '/admin/index.html') {
    return serveStatic(req, res, '/admin/index.html');
  }
  /* 后台的 css/js 是纯 UI 外壳（不含任何数据），放行；数据仍全部在令牌后面 */
  if (pathname === '/admin/admin.css' || pathname === '/admin/admin.js') {
    return serveStatic(req, res, pathname);
  }
  if (pathname === '/' || pathname === '/index.html') {
    /* 记一次浏览量：放在服务端返回首页时，不依赖前端 JS（广告拦截器挡不掉）。
       访客 id 用匿名 cookie（既有机制），只参与当日去重，不落原始值。 */
    try { stats.pageView(sec.visitorId(req, res)); } catch (e) { /* 统计失败不影响页面 */ }
    return serveStatic(req, res, '/index.html');
  }

  /* 3) 其余按文件返回：只放行白名单目录 */
  if (hasTraversal(pathname)) return denyStatic(req, res, pathname);
  if (!isPublicAsset(pathname)) return denyStatic(req, res, pathname);
  serveStatic(req, res, pathname);});

server.on('error', function (e) {
  if (e.code === 'EADDRINUSE') {
    console.log('端口 ' + PORT + ' 已被占用 —— 请换一个端口，例如： node server/server.js 5601');
    process.exit(1);
  }
  throw e;
});

/* --check-defaults：只做播种自检，不监听端口（用于验收脚本） */
if (process.argv.indexOf('--check-defaults') !== -1) {
  const s = defaultSettings();
  console.log('[自检] globalPrompt 长度 ' + s.globalPrompt.length + '，含行为台词协议 ' + (s.globalPrompt.indexOf(BEHAVIOR_DOC) !== -1));
  console.log('[自检] behaviorLine.doc 长度 ' + s.behaviorLine.doc.length);
  console.log('[自检] assistant.faq 条数 ' + s.assistant.faq.length);
  console.log('[自检] safety care/severe/bannedOutput = ' +
    s.safety.care.length + '/' + s.safety.severe.length + '/' + s.safety.bannedOutput.length);
  console.log('[自检] site.footerNotes 条数 ' + s.site.footerNotes.length + '，dailyQuota ' + s.site.dailyQuota);
} else {
  initData();
  const HOST = process.env.HOST || '127.0.0.1';
  if (HOST !== '127.0.0.1' && !process.env.ADMIN_TOKEN) {
    console.log('');
    console.log('  ⚠ 正在监听 ' + HOST + ' 但没有设置 ADMIN_TOKEN —— 任何人都能改资源与设置。');
    console.log('    请先设置环境变量 ADMIN_TOKEN=一串足够长的随机字符串 再启动。');
    console.log('');
  }
  /* ------------------------------ 崩溃留痕 ------------------------------ */
(function () {
  const LOG = path.join(DATA_DIR, 'server-error.log');
  function note(kind, err) {
    const line = '[' + new Date().toISOString() + '] ' + kind + ' ' +
      ((err && (err.stack || err.message)) || String(err)) + '\n';
    try { fs.appendFileSync(LOG, line, 'utf8'); } catch (e) { /* 写不进去就算了 */ }
    try { process.stderr.write(line); } catch (e) { }
  }
  process.on('uncaughtException', function (e) { note('uncaughtException', e); });
  process.on('unhandledRejection', function (e) { note('unhandledRejection', e); });
})();

server.listen(PORT, HOST, function () {
    console.log('幻言 · 后端服务已启动： http://127.0.0.1:' + PORT + '/');
    console.log('后台管理界面：        http://127.0.0.1:' + PORT + '/admin');
    console.log('项目根目录：' + ROOT);
    console.log('服务端模型：' + (sec.modelReady() ? (sec.readModelConfig().model + ' · 每日 ' + sec.readModelConfig().dailyQuota + ' 次/人') : '未配置（前端将回退到本地演绎引擎或访客自带密钥）'));
    console.log('管理令牌：' + (process.env.ADMIN_TOKEN ? '已设置' : '未设置（仅本机可写）'));
    console.log('资源 ' + resources.length + ' 条 · 数据文件 ' + RES_FILE);
  });
}
