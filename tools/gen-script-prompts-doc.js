/* 生成《剧本提示词合集》：从 data/resources.json 直接抽，不手抄，避免和线上不一致 */
'use strict';
const fs = require('fs');
const path = require('path');

const data = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'resources.json'), 'utf8'));
const list = data.resources || [];

const stamp = new Date().toISOString().slice(0, 10);
const out = [];

out.push('# 剧本提示词合集');
out.push('');
out.push('> 每个本子一个角色，下面是从线上 `data/resources.json` 直接导出的**完整提示词原文**，可直接复制使用。');
out.push('> 通用规则（红线、行为台词、状态协议、叙事要求）见 [角色扮演通用规则](./角色扮演通用规则.md)，');
out.push('> 每个剧本的提示词里已经内联了本场专属的规则，所以单独拿走一段也能跑。');
out.push('');
out.push(`- 导出时间：${stamp}`);
out.push(`- 剧本数：${list.length}（有提示词的 ${list.filter(r => (r.prompt || '').trim()).length} 个）`);
out.push('');
out.push('| # | 剧本 | 分级 | 角色 | 提示词字数 |');
out.push('|---|---|---|---|---|');
list.forEach(function (r, i) {
  const ch = (r.character && r.character.name) || '—';
  out.push(`| ${i + 1} | ${r.name} | ${r.rating || ''} | ${ch} | ${(r.prompt || '').length} |`);
});
out.push('');
out.push('---');
out.push('');

list.forEach(function (r, i) {
  const ch = r.character || {};
  out.push(`## ${i + 1}. ${r.name}`);
  out.push('');
  if (r.subtitle) out.push(`**${r.subtitle}**`);
  out.push('');
  const meta = [];
  if (r.rating) meta.push(`分级 ${r.rating}`);
  if (r.length) meta.push(r.length);
  if (r.difficulty) meta.push(`难度 ${r.difficulty}/5`);
  if (ch.name) meta.push(`角色 ${ch.name}${ch.title ? '（' + ch.title + '）' : ''}`);
  if (meta.length) { out.push(`- ${meta.join(' · ')}`); }
  if (r.brief) out.push(`- 一句话：${r.brief}`);
  if (r.teaser) out.push(`- 钩子：${r.teaser}`);
  out.push('');
  if (ch.personality) out.push(`- 性格：${String(ch.personality).slice(0, 200)}`);
  if (ch.speech) out.push(`- 说话方式：${String(ch.speech).slice(0, 160)}`);
  if (Array.isArray(ch.taboo) && ch.taboo.length) out.push(`- 雷点：${ch.taboo.join('、')}`);
  out.push('');
  if (Array.isArray(r.plotReminder) && r.plotReminder.length) {
    out.push('**开局提醒（玩家一进来就看到的东西）**');
    out.push('');
    r.plotReminder.forEach(function (x) { out.push('- ' + x); });
    out.push('');
  }
  const p = (r.prompt || '').trim();
  if (p) {
    out.push('**提示词（原样）**');
    out.push('');
    out.push('```text');
    out.push(p);
    out.push('```');
  } else {
    out.push('> ⚠️ 这个本子还没有写提示词（资源状态：' + (r.status || 'unknown') + '），暂时不可游玩。');
  }
  out.push('');
  out.push('---');
  out.push('');
});

const target = path.join(__dirname, '..', 'docs', '剧本提示词合集.md');
fs.writeFileSync(target, out.join('\n'), 'utf8');
const bytes = fs.statSync(target).size;
console.log('已生成: ' + target);
console.log('大小: ' + (bytes / 1024).toFixed(1) + ' KB，剧本文档 ' + list.length + ' 个');
