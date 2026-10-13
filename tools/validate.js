/* 资源数据校验脚本：node tools/validate.js */
global.window = {};
require('../assets/js/resources.js');
const R = window.RP_RESOURCES;
let bad = 0;
const need = ['id', 'name', 'subtitle', 'genres', 'rating', 'length', 'status', 'heat', 'players', 'cover', 'brief', 'metaLines', 'intro', 'teaser'];
const needPlay = ['world', 'character', 'userRole', 'plot', 'plotReminder', 'openingHints', 'beats', 'scenes', 'rules', 'hpRules', 'prompt', 'replies'];
const replyKeys = ['greeting', 'question', 'action', 'emotion', 'flirt', 'default', 'punish', 'execution', 'leave'];
const motifs = ['lantern', 'neon', 'mist', 'rain', 'archive', 'sea', 'fair', 'throne'];

console.log('资源数量:', R.length);
R.forEach(r => {
  need.forEach(k => { if (r[k] === undefined) { console.log('缺失', r.id, k); bad++; } });
  if (!motifs.includes(r.cover && r.cover.motif)) { console.log('封面 motif 非法', r.id, r.cover && r.cover.motif); bad++; }
  if (!r.cover || !Array.isArray(r.cover.palette) || r.cover.palette.length !== 3) { console.log('palette 非法', r.id); bad++; }
  if ((r.metaLines || []).length !== 3) { console.log('metaLines 不是 3 行', r.id); bad++; }
  if (r.status === 'playable') {
    needPlay.forEach(k => { if (r[k] === undefined) { console.log('缺失(playable)', r.id, k); bad++; } });
    const rp = r.replies || {};
    replyKeys.forEach(k => { if (!Array.isArray(rp[k]) || !rp[k].length) { console.log('语料缺失', r.id, k); bad++; } });
    if ((r.plotReminder || []).length < 5) { console.log('剧情提醒过少', r.id); bad++; }
    if (!(r.scenes || []).length) { console.log('缺少场景', r.id); bad++; }
    (r.scenes || []).forEach(s => {
      if (!Array.isArray(s.palette) || s.palette.length !== 3) { console.log('场景 palette 非法', r.id, s.id); bad++; }
      if (!/^#[0-9a-f]{6}$/i.test(s.palette[0])) { console.log('场景色值格式异常', r.id, s.id, s.palette[0]); bad++; }
    });
    if (!/<<<STATE/.test(r.prompt)) { console.log('提示词缺少状态协议', r.id); bad++; }
    if (!/诱导消费/.test(r.prompt)) { console.log('提示词缺少防诱导消费条款', r.id); bad++; }
    if ((r.plotRules || []).length < 3) { console.log('缺少本场剧情规则 plotRules', r.id); bad++; }
    if ((r.behaviorRules || []).length < 3) { console.log('缺少本场行为规则 behaviorRules', r.id); bad++; }
    if (!/【剧情规则】/.test(r.prompt) || !/【行为规则】/.test(r.prompt)) { console.log('提示词缺少规则小节', r.id); bad++; }
    const ats = (r.beats || []).map(function (b) { return b.at; }).join(',');
    if (ats !== '5,10,15,20,25') { console.log('推进节点轮次不是 5/10/15/20/25：', r.id, ats); bad++; }
    if (!(r.beats || []).every(function (b) { return (b.kind || 'guide') === 'guide'; })) { console.log('节点 kind 不是 guide', r.id); bad++; }
    if (!r.powerBalance) { console.log('缺少 powerBalance', r.id); bad++; }
  }
});
console.log('---- 概览 ----');
R.forEach(r => {
  const line = [
    r.id, r.name, r.status, r.rating, r.length, (r.genres || []).join('/'),
    'meta:' + (r.metaLines || []).length, 'brief:' + (r.brief || '').length + '字', 'intro:' + (r.intro || '').length + '字',
    r.status === 'playable'
      ? 'prompt:' + r.prompt.length + '字 reminder:' + r.plotReminder.length + '条 hints:' + r.openingHints.length +
        ' beats:' + r.beats.length + ' scenes:' + r.scenes.length + ' rules:' + r.rules.length + ' hpRules:' + r.hpRules.length +
        ' 角色:' + r.character.name
      : 'teaser:' + r.teaser
  ].join(' | ');
  console.log(line);
});
const g = {};
R.forEach(r => (r.genres || []).forEach(x => g[x] = (g[x] || 0) + 1));
console.log('题材汇总:', JSON.stringify(g, null, 0));
console.log(bad ? '❌ 问题数: ' + bad : '✅ 全部通过');
