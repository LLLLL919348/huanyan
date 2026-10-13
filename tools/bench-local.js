/* 本机模型基准：跑一段真实长度的中文角色扮演请求，量一下速度与中文质量
   用法： node tools/bench-local.js [model] [maxTokens] */
const http = require('http');

const model = process.argv[2] || 'qwen2.5:3b';
const maxTokens = Number(process.argv[3] || 200);

const SYS = [
  '【角色】你扮演沈明烛，长安司灯署掌灯人，二十七岁。你说话克制、话里有话，习惯用灯与夜色打比方。',
  '【行为规则】玩家越界时按档扣血：轻微 -2，一般 -5，严重 -8；扣血必须先输出一条下划线行为台词：_〔警告 hp=-2 好感=-3〕台词正文_。',
  '【输出格式】正文结束后另起一行输出 <<<STATE {"hp":0,"affinity":1,"progress":8,"flag":"none","aid":null,"reason":"简短原因"}>>>',
  '【要求】以角色第一人称推进剧情，回复 80-220 字，不替玩家写台词。'
].join('\n');

const payload = {
  model: model,
  messages: [
    { role: 'system', content: SYS },
    { role: 'user', content: '十年前御史台那桩灭门案，卷宗少了一页。沈明烛，那一页是不是在你手上？' }
  ],
  temperature: 0.85,
  max_tokens: maxTokens,
  stream: false
};

const data = Buffer.from(JSON.stringify(payload), 'utf8');
const t0 = Date.now();
const req = http.request({
  host: '127.0.0.1', port: 11434, path: '/v1/chat/completions', method: 'POST',
  headers: { 'Content-Type': 'application/json', 'Content-Length': data.length }
}, function (res) {
  let b = '';
  res.setEncoding('utf8');
  res.on('data', function (c) { b += c; });
  res.on('end', function () {
    const sec = (Date.now() - t0) / 1000;
    let j = null;
    try { j = JSON.parse(b); } catch (e) { console.log('解析失败：' + b.slice(0, 300)); return; }
    if (!j.choices) { console.log('返回异常：' + JSON.stringify(j).slice(0, 300)); return; }
    const text = String(j.choices[0].message.content || '');
    const u = j.usage || {};
    const ct = u.completion_tokens || 0;
    console.log('模型 ' + model + ' | 用时 ' + sec.toFixed(1) + 's | 输出 ' + ct + ' tokens | ' +
      (ct ? (ct / sec).toFixed(1) : '?') + ' tok/s | 提示 ' + (u.prompt_tokens || 0) + ' tokens');
    console.log('是否包含行为台词协议：' + /_〔/.test(text));
    console.log('是否包含 STATE 尾注：' + /<<<STATE/.test(text));
    console.log('中文字符数：' + (text.match(/[\u4e00-\u9fa5]/g) || []).length);
    console.log('---- 回复 ----');
    console.log(text.trim());
  });
});
req.on('error', function (e) { console.log('请求失败：' + e.message); });
req.setTimeout(600000, function () { console.log('超时'); req.destroy(); });
req.write(data);
req.end();
