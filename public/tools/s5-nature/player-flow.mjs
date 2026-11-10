import { intersectNatureCases, compareObservedHp } from './measurement-comparison.mjs';
import { compareEvilExchange, evilExchangeHealing } from './evil-exchange.mjs';
import { observationMatch, observationDifference, readOutgoingObservations, readIncomingObservation } from './matchup-ui.mjs';

// 方案 A · 对照表速查：野怪一行、出战一行；桌面两种测法同页，每招读数旁直接给结论；
// 右栏五项属性 + 30 种性格矩阵。计算、匹配与读数仍由既有模块负责，这里只排版和汇总。
const $ = id => document.getElementById(id);
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const names = {hp:'生命',physicalAttack:'物攻',magicalAttack:'魔攻',physicalDefense:'物防',magicalDefense:'魔防',speed:'速度'};
const STAT_ORDER = ['hp','physicalAttack','magicalAttack','physicalDefense','magicalDefense','speed'];
const PAR_ID = 'spirit_684f5cd1fec1df27';
const AXES = ['hp','physicalDefense','magicalDefense','physicalAttack','magicalAttack'];
const WORD = {up:'加',down:'减',neutral:'不变'};
let ui, catalog, layout, commit, saveState;
function saveLayout(persist = true) { saveState(structuredClone(layout), persist); }
export function normalizePlayerFlow(value, targetId, catalog, ownSpiritId) {
  const saved = value && typeof value === 'object' ? value : {};
  const goal = typeof saved.goal === 'string' && (catalog.natures.some(n=>n.id===saved.goal) || Object.keys(names).filter(key=>key!=='speed').some(key=>saved.goal===`stat:${key}`)) ? saved.goal : '';
  return {tab:saved.tab==='incoming'?'incoming':'outgoing',goal,roster:saved.roster!==false,
    rosterScrollTop:Number.isFinite(saved.rosterScrollTop)&&saved.rosterScrollTop>=0?saved.rosterScrollTop:0,
    skill:Number.isInteger(saved.skill)&&saved.skill>=0&&saved.skill<4?saved.skill:0,
    hp:['string','number'].includes(typeof saved.hp)&&Number.isSafeInteger(Number(saved.hp))&&Number(saved.hp)>0?String(Number(saved.hp)):'',
    exchange:{enabled:saved.exchange?.enabled===true || (ownSpiritId===PAR_ID && saved.exchange?.ownSpiritId!==ownSpiritId),
      healing:['string','number'].includes(typeof saved.exchange?.healing)?String(saved.exchange.healing).slice(0,20):'',
      percent:typeof saved.exchange?.percent==='number' && Number.isFinite(saved.exchange.percent)?saved.exchange.percent:10,
      ownSpiritId},
    checked:{own:saved.checked?.own===true,target:saved.checked?.target===true},
    targetId:typeof saved.targetId==='string'?saved.targetId:targetId,
    ownDiceSignature:typeof saved.ownDiceSignature==='string'?saved.ownDiceSignature:'',targetDiceSignature:typeof saved.targetDiceSignature==='string'?saved.targetDiceSignature:''};
}
function own(s) { return s.profiles.find(p=>p.id===s.activeProfileId) || s.profiles[0]; }
const natureState = (n, stat) => n.upStat===stat ? 'up' : n.downStat===stat ? 'down' : 'neutral';
const phrase = (stat, state) => state==='neutral' ? `${names[stat]}不变` : `${WORD[state]}${names[stat]}`;
function sameState(predictions, stat) { const set=new Set(predictions.map(p=>natureState(p,stat))); return set.size===1?[...set][0]:null; }
const categoryOf = (row, skills) => skills?.find(skill=>skill.id===row?.skillId)?.category;

// 单招读数的即时结论：只描述这一条读数能说明什么，不替代右栏的合并结果。
// 防御只看伤害（±1 容错按预测伤害判断）；生命在伤害和余血都有时，与右栏同用实伤 + 余血反推，
// 不从容错后的预测命中里取生命档，也不放宽余血。返回分段，便于一段吻合、一段冲突时分别标色。
export function outgoingReadingVerdict(row, obs, rawObs, format = 'game0', category = 'physical', hpPredictions = []) {
  if (!rawObs || (rawObs.damage == null && rawObs.remainingPercent == null)) return null;
  const single = (tone, text) => ({tone, text, parts:[{tone, text}], axes:{}});
  if (obs?.invalid) return single('bad', '输入格式有误');
  if (!obs) return single('flat', '余血 0%，不能判断');
  if (row?.status !== 'estimated' || !row.predictions?.length) return single('bad', '这一招无法计算');
  const defense = category==='physical' ? 'physicalDefense' : 'magicalDefense';
  const parts = [], axes = {};
  if (obs.damage != null) {
    const damageHits = row.predictions.filter(p=>observationMatch(p,{damage:obs.damage},format));
    if (!damageHits.length) return single('bad', observationDifference(row,{damage:obs.damage},format) || '与计算不符');
    if (damageHits.every(p=>p.damage>=p.hpMax)) return single('flat', '一击倒，不能判断');
    const state = sameState(damageHits, defense);
    parts.push({tone:state?'good':'flat', text:state ? phrase(defense,state) : `${names[defense]}待分`});
    if (state) axes[defense] = state;
  }
  if (obs.remainingPercent != null) {
    let matched;
    if (obs.damage != null) {
      const comparison = compareObservedHp({ outgoing:[row], observed:{0:obs}, format, hpPredictions });
      if (comparison.status === 'conflict') {
        const range = comparison.ranges.map(r=>r.max===null?`≥${r.min}`:r.min===r.max?`${r.min}`:`${r.min}–${r.max}`).join('／');
        parts.push({tone:'bad', text: range ? `生命对不上（推算 ${range}）` : '生命对不上'});
      } else matched = comparison.matchedPredictions;
    } else matched = row.predictions.filter(p=>observationMatch(p,obs,format));
    if (matched) {
      if (!matched.length) parts.push({tone:'bad', text:'余血对不上'});
      else {
        const state = sameState(matched, 'hp');
        parts.push({tone:state?'good':'flat', text:state ? phrase('hp',state) : '生命待分'});
        if (state) axes.hp = state;
      }
    }
  }
  const tones = new Set(parts.map(part=>part.tone));
  const tone = tones.size===1 ? [...tones][0] : tones.has('bad') ? 'mixed' : 'good';
  return {tone, text:parts.map(part=>part.text).join(' · '), parts, axes};
}
export function incomingReadingVerdict(row, obs, format = 'game0', category = 'physical') {
  if (!obs) return null;
  if (obs.invalid) return {tone:'bad', text:'输入格式有误'};
  if (row?.status !== 'estimated' || !row.predictions?.length) return {tone:'bad', text:'这一招无法计算'};
  const hits = row.predictions.filter(p=>observationMatch(p,obs,format));
  if (!hits.length) return {tone:'bad', text:observationDifference(row,obs,format) || '与计算不符'};
  const attack = category==='physical' ? 'physicalAttack' : 'magicalAttack';
  const state = sameState(hits, attack);
  return {tone:'good', text:state ? phrase(attack,state) : `${names[attack]}待分`, axes:state ? {[attack]:state} : {}};
}

function setTab(tab) {
  layout.tab=tab; saveLayout(); render();
}
function clearCard(direction) {
  commit(s=>{
    const p=own(s);
    if(direction==='outgoing') { p.preview.observed={};p.preview.picked={};layout.exchange.healing='';s.playerFlow=structuredClone(layout); }
    else { s.preview.incomingDamages=[null,null];s.preview.incomingPicks=[null,null]; }
  });
}
function nextTarget() {
  layout.hp='';layout.exchange.healing='';layout.exchange.percent=10;layout.checked.target=false;
  commit(s=>{
    s.observations=[];
    for(const p of s.profiles) if(p.preview) {p.preview.observed={};p.preview.picked={};}
    Object.assign(s.preview,{incomingDamages:[null,null],incomingPicks:[null,null],diceId:'none',diceEffects:{}});
    delete s.preview.incomingByDefender;
    s.playerFlow=structuredClone(layout);
  });
}
function goalNature() { return catalog.natures.find(n=>n.id===layout.goal); }
function goalMatches(n) { return layout.goal.startsWith('stat:') ? n.upStat===layout.goal.slice(5) : n.id===layout.goal; }
function axis(natures,key) { const all=new Set(natures.map(n=>n.upStat===key?'加':n.downStat===key?'减':'不变'));return all.size===1?[...all][0]:'待区分'; }
const statIcon = key => catalog.assets?.stats?.[key] ? `<img src="${esc(catalog.assets.stats[key])}" alt=""/>` : '';

function natureMatrix(candidateIds, state) {
  const goal = layout.goal;
  let html = `<div class="flow-matrix" aria-label="性格矩阵：行是加的属性，列是减的属性"><div class="fm-corner" aria-hidden="true"><span class="up">↑</span><span class="down">↓</span></div>`;
  html += STAT_ORDER.map(key=>`<div class="fm-head">${statIcon(key)}<b>${names[key]}</b><i class="down">↓</i></div>`).join('');
  for (const up of STAT_ORDER) {
    html += `<div class="fm-head fm-row-head">${statIcon(up)}<b>${names[up]}</b><i class="up">↑</i></div>`;
    for (const down of STAT_ORDER) {
      const n = up === down ? null : catalog.natures.find(x=>x.upStat===up && x.downStat===down);
      if (!n) { html += '<div class="fm-cell fm-none" aria-hidden="true"></div>'; continue; }
      const on = state==='open' || candidateIds.has(n.id);
      const cls = state==='open' ? '' : on ? ' on' : ' off';
      html += `<button type="button" class="fm-cell${cls}${goal===n.id?' goal':''}" data-goal-nature="${esc(n.id)}" aria-pressed="${goal===n.id}" title="${esc(n.name)} · ${names[up]}↑ ${names[down]}↓${goal===n.id?' · 目标（再点取消）':' · 点击设为目标'}">${esc(n.name)}</button>`;
    }
  }
  return html + '</div>';
}

function exchangeMessage(exchange, unavailableReason) {
  if(exchange.reason==='invalid-target-percent') return '剩余比例需为 0–100%，最多两位小数';
  if(exchange.reason==='no-healing') return '野怪已满血，无法通过回血判断';
  if(exchange.status==='invalid') return '填写正整数回血量';
  if(exchange.status==='unavailable') return unavailableReason || '当前目标缺少本体生命数据';
  if(exchange.status==='conflict') return '回血量与三档不符，请核对等级和使用条件';
  if(exchange.status==='matched') {
    const state=sameState(exchange.matching,'hp');
    return state ? phrase('hp',state) : '生命档待区分';
  }
  return '';
}
function renderExchange(exchange, result) {
  const enabled=layout.exchange.enabled;
  $('flow-exchange-enabled').checked=enabled;
  $('flow-exchange-row').hidden=!enabled;
  if(document.activeElement!==$('flow-exchange-healing')) $('flow-exchange-healing').value=layout.exchange.healing;
  $('flow-exchange-healing').setAttribute('aria-invalid',String(exchange.invalid));
  const percent=layout.exchange.percent;
  const percentValid=percent>=0 && percent<=100 && Math.abs(percent*100-Math.round(percent*100))<1e-8;
  const custom=percent!==10;
  $('flow-exchange-condition-gear').classList.toggle('is-set',custom);
  if(document.activeElement!==$('flow-exchange-percent')) $('flow-exchange-percent').value=percent;
  $('flow-exchange-condition-label').textContent=custom?`余血${percent}% · 手填`:'破盾10%';
  const hpRows=result.evilExchangeUnavailableReason || !percentValid?[]:result.targetBodyHpByLevel || [];
  const hitStates=new Set(exchange.matching.map(n=>natureState(n,'hp')));
  $('flow-exchange-values').innerHTML=['down','neutral','up'].map(state=>{
    const amounts=hpRows.map(row=>evilExchangeHealing(row[state],percent));
    const min=Math.min(...amounts),max=Math.max(...amounts);
    const text=amounts.length ? min===max?`${min}`:`${min}–${max}` : '—';
    return `<div class="flow-exchange-prediction pcell paxis hp-reading${hitStates.has(state)?' matches':''}" data-exchange-hp="${state}"><span class="hit-formula">${state==='neutral'?'普通':phrase('hp',state)}</span><b class="dmg">${text}</b></div>`;
  }).join('');
  const note=$('flow-exchange-verdict');
  note.className=`flow-row-verdict${exchange.used?exchange.status==='matched'?' good':' bad':''}`;
  note.textContent=exchangeMessage(exchange,result.evilExchangeUnavailableReason);
}

function render() {
  if(!ui || !layout || !$('flow-result')) return;
  const s=ui.getSession(), p=own(s), result=ui.getPreview(), v=result.uiVerdict;
  if(!v) return;
  layout=normalizePlayerFlow(s.playerFlow,s.targetId,catalog,p.spiritId);
  if(layout.targetId!==s.targetId) {layout.hp='';layout.exchange.healing='';layout.exchange.percent=10;layout.checked.target=false;}
  layout.targetId=s.targetId;
  const format=s.preview?.percentFormat ?? 'game0';
  const category=row=>categoryOf(row,catalog.skills);
  document.body.dataset.testTab=layout.tab;
  for(const button of document.querySelectorAll('[data-flow-tab]')) button.setAttribute('aria-selected',String(button.dataset.flowTab===layout.tab));
  if(document.activeElement!==$('flow-goal')) $('flow-goal').value=layout.goal;
  const target=catalog.spirits.find(x=>x.id===s.targetId);
  const defenseStats=new Set((result.outgoing||[]).filter(row=>row.status==='estimated').map(row=>category(row)==='physical'?'物防':'魔防'));
  const defenseName=defenseStats.size===1?[...defenseStats][0]:'防御';
  const heads=[...$('preview-outgoing').querySelectorAll(':scope > .pth')];
  const hpLegend=[['down','↓','生命降低'],['neutral','＝','生命不变'],['up','↑','生命提高']].map(([key,symbol,label])=>`<span class="hp-state-label" data-hp-state="${key}" title="${label}时的剩余血量" aria-label="${label}时的剩余血量"><img src="./assets/hp-outline.svg" alt=""/><span aria-hidden="true">${symbol}</span></span>`).join('');
  [`${defenseName}↓`,`${defenseName}不变`,`${defenseName}↑`].forEach((label,i)=>{
    heads[i+1].classList.add('defense-column-head');
    heads[i+1].innerHTML=`<span>${label}</span><div class="hp-column-legend">${hpLegend}</div>`;
  });
  $('preview-outgoing').classList.toggle('mixed-defense',defenseStats.size>1);
  for(const side of ['own','target']) {
    const holder=side==='own'?p.preview:s.preview, sig=JSON.stringify([side==='own'?`${p.id}:${p.spiritId}`:s.targetId,holder?.diceId||'none',holder?.diceEffects||{}]);
    const signatureKey=`${side}DiceSignature`;
    if(layout[signatureKey] && layout[signatureKey]!==sig) layout.checked[side]=false;
    layout[signatureKey]=sig;
    const b=$(`flow-check-${side}`);b.textContent=layout.checked[side]?'已核对':'未核对';b.setAttribute('aria-pressed',String(layout.checked[side]));
  }
  saveLayout(false);
  const level=s.level==='all'?'41–43':s.level;
  const wildLabel=`${target?.name||'野怪'} · ${level}级${s.preview.shiny?' · 异色':''}`;
  $('flow-hp-name').textContent=wildLabel;
  for(const item of document.querySelectorAll('[data-roster-id]')) item.setAttribute('aria-pressed',String(item.dataset.rosterId===s.targetId&&s.preview.shiny===true));
  for(const entry of $('target-hp-range').querySelectorAll(':scope > [data-hp-nature]')) {
    if(entry.querySelector('.hp-state-label')) continue;
    const key=entry.dataset.hpNature, label={down:'生命↓',neutral:'生命不变',up:'生命↑'}[key], symbol={down:'↓',neutral:'＝',up:'↑'}[key];
    const value=entry.querySelector('b');
    entry.replaceChildren();
    entry.insertAdjacentHTML('afterbegin',`<span class="hp-state-label" data-hp-state="${key}" title="${label}" aria-label="${label}"><img src="./assets/hp-outline.svg" alt=""/><span aria-hidden="true">${symbol}</span></span>`);
    if(value) entry.append(value);
  }
  $('flow-hp-values').innerHTML=$('target-hp-range').innerHTML;
  if(document.activeElement!==$('flow-hp-value')) $('flow-hp-value').value=layout.hp;
  $('flow-hp-value').closest('.flow-direct-hp').classList.toggle('filled',Boolean(layout.hp));

  // 我方摘要（手机收起时显示）。
  const nature=catalog.natures.find(n=>n.id===p.natureId);
  const ownDice=(p.preview?.diceId??'none')!=='none';
  $('flow-own-summary-text').innerHTML=`<b>${esc(p.label || `${p.name} ${(p.awakening??5)+5}★`)}</b><span>${esc(p.level ?? 60)}级 · ${(p.awakening??5)+5}★ · ${esc(nature?.name ?? '普通')}${ownDice?' · 有骰子':''}</span>`;
  const ownImage=$('own-image');
  if(ownImage?.getAttribute('src')) $('flow-own-summary-image').src=ownImage.getAttribute('src');

  for(const [i,button] of [...document.querySelectorAll('[data-flow-skill]')].entries()) {
    const has=p.preview?.observed?.[i] && (p.preview.observed[i].damage!=null || p.preview.observed[i].remainingPercent!=null);
    button.innerHTML=`${esc(result.outgoing?.[i]?.skillName || '选择技能')}${has?'<i class="flow-dot" aria-label="已填读数"></i>':''}`;
    button.setAttribute('aria-selected',String(i===layout.skill));
    document.querySelector(`[data-preview-row="${i}"]`).classList.toggle('flow-active-row',i===layout.skill);
  }
  const n=goalNature(), goalStat=n?.upStat || (layout.goal.startsWith('stat:')?layout.goal.slice(5):'');
  for(const cell of document.querySelectorAll('.pcell')) {
    const group=cell.dataset.natureGroup, condition=cell.dataset.natureCondition;
    const attention=(group===goalStat && condition==='base') || (n && group===n.downStat && condition==='down');
    cell.classList.toggle('flow-attention',Boolean(attention));
    cell.setAttribute('title',[cell.classList.contains('picked')?'已标记':null,cell.classList.contains('hit')?'实测吻合':null,cell.classList.contains('miss')?'与实测不符':null,attention?'目标关注':null].filter(Boolean).join(' · ') || '点击标记');
    for(const hp of cell.querySelectorAll('.hp-reading')) {
      const hpAttention=!hp.classList.contains('impossible') && ((goalStat==='hp' && hp.dataset.hpNature==='up') || (n?.downStat==='hp' && hp.dataset.hpNature==='down'));
      hp.classList.toggle('flow-hp-attention',Boolean(hpAttention));
    }
  }

  // 每招读数旁的即时结论，并记下各属性的来源。
  const sources=Object.fromEntries(AXES.map(key=>[key,[]]));
  const {observed:outObserved}=readOutgoingObservations(p.preview ?? {},format);
  const hpPredictions=(result.targetHpByLevel ?? []).flatMap(row=>catalog.natures.map(n=>({
    targetLevel:row.level, natureId:n.id, upStat:n.upStat, downStat:n.downStat,
    hpMax:row[n.upStat==='hp'?'up':n.downStat==='hp'?'down':'neutral'] })));
  for(let i=0;i<4;i++) {
    const raw=p.preview?.observed?.[i], row=result.outgoing?.[i];
    const verdict=outgoingReadingVerdict(row,outObserved[i],raw,format,category(row),hpPredictions);
    const holder=$(`flow-row-verdict-out-${i}`);
    holder.className=`flow-row-verdict${verdict?` ${verdict.tone}`:''}`;
    holder.innerHTML=verdict ? verdict.parts.map(part=>`<span class="${part.tone}">${esc(part.text)}</span>`).join('<span class="sep"> · </span>') : '';
    document.querySelector(`[data-preview-row="${i}"]`).classList.toggle('flow-has-reading',Boolean(verdict));
    for(const key of Object.keys(verdict?.axes ?? {}))
      sources[key].push(key==='hp'?`${row.skillName} 剩 ${raw.remainingPercent}%`:`${row.skillName} ${raw.damage}`);
  }
  for(let k=0;k<2;k++) {
    const row=result.incomingList?.[k], obs=readIncomingObservation(s.preview ?? {},k,row);
    const verdict=incomingReadingVerdict(row,obs,format,category(row));
    const holder=$(`flow-row-verdict-in-${k}`);
    holder.className=`flow-row-verdict${verdict?` ${verdict.tone}`:''}`;
    holder.textContent=verdict?.text ?? '';
    document.querySelector(`[data-incoming-row="${k}"]`).classList.toggle('flow-has-reading',Boolean(verdict));
    for(const key of Object.keys(verdict?.axes ?? {})) sources[key].push(`${row.skillName} 掉血 ${obs.inputDamage}`);
  }

  const hpRows=result.targetHpByLevel || [];
  const direct=layout.hp!=='' && Number.isInteger(Number(layout.hp)) && Number(layout.hp)>0;
  const hpHits=direct?hpRows.flatMap(row=>catalog.natures.filter(n=>row[n.upStat==='hp'?'up':n.downStat==='hp'?'down':'neutral']===Number(layout.hp)).map(n=>({...n,targetLevel:row.level}))):[];
  const exchange=compareEvilExchange({healing:layout.exchange.enabled?layout.exchange.healing:'',
    hpByLevel:result.evilExchangeUnavailableReason?[]:result.targetBodyHpByLevel,natures:catalog.natures,targetPercent:layout.exchange.percent});
  renderExchange(exchange,result);
  const exchangeComparable=['matched','conflict'].includes(exchange.status);
  const combinedGroups=[v.candidates];
  if(direct) combinedGroups.push(hpHits.map(h=>`${h.targetLevel}:${h.id}`));
  if(exchangeComparable) combinedGroups.push(exchange.candidates);
  const matched=intersectNatureCases(catalog.natures,result.targetLevels || [s.level],combinedGroups).matching;
  const invalid=v.invalid || exchange.invalid;
  const incomplete=v.incomplete || (exchange.used && exchange.status==='unavailable');
  const used=v.used+(direct?1:0)+(exchange.used?1:0), ready=used>0 && matched.length>0 && !invalid && !incomplete;
  const axesEvidence={...v.axesEvidence};
  const hpGroups=axesEvidence.hp?.used ? [axesEvidence.hp.candidates] : [];
  if(direct) { hpGroups.push(hpHits.map(h=>`${h.targetLevel}:${h.id}`)); sources.hp.unshift(`读到 HP ${layout.hp}`); }
  if(exchangeComparable) { hpGroups.push(exchange.candidates);sources.hp.unshift(`恶念交换 回血 ${layout.exchange.healing}${layout.exchange.percent===10?'':`（余血${layout.exchange.percent}%）`}`); }
  axesEvidence.hp=intersectNatureCases(catalog.natures,result.targetLevels || [s.level],hpGroups);
  let goal='';
  if(layout.goal) {
    const label=n?.name || `加${names[goalStat]}`;
    const hasConflict=invalid||incomplete||(used>0&&!matched.length)||axesEvidence.hp.conflict;
    const state=!used?'待实测':hasConflict?'待复核':matched.some(goalMatches)?matched.length===1?'就是它':'还在候选':'已排除';
    const tone=!used||hasConflict?'':matched.some(goalMatches)?' good':' bad';
    goal=`<div class="flow-goal-result${tone}"><span>目标 ${esc(label)}</span><b>${state}</b></div>`;
  }
  const hasReading = value => value != null && (typeof value !== 'string' || value.trim() !== '');
  const outgoingCount = Array.from({length:4},(_,i)=>p.preview?.observed?.[i])
    .filter(observation=>observation && (hasReading(observation.damage) || hasReading(observation.remainingPercent))).length;
  const incomingCount = Array.from({length:2},(_,i)=>s.preview?.incomingDamages?.[i]).filter(hasReading).length;
  const recordCount = outgoingCount + incomingCount + (direct ? 1 : 0) + (exchange.used ? 1 : 0);

  const hpRanges = v.hpComparison?.ranges ?? [];
  const hpRangeText = hpRanges.map(range=>range.max===null?`≥${range.min}`:range.min===range.max?`${range.min}`:`${range.min}–${range.max}`).join('／');
  const hpNotes = [];
  if(hpRangeText) hpNotes.push(`推算总血量 ${hpRangeText}`);
  if(direct && !hpHits.length) hpNotes.push('<span class="bad">读到的 HP 与三档都不符</span>');
  if(v.hpComparison?.status==='conflict') hpNotes.push(`<span class="bad">${hpRanges.length?'推算血量与三档不符':'血量记录互相冲突'}</span>`);
  else if(axesEvidence.hp.conflict && ((direct && hpHits.length) || exchange.status==='matched')) hpNotes.push('<span class="bad">血量记录互相冲突</span>');
  if(exchange.used && exchange.status!=='matched') hpNotes.push(`<span class="bad">${esc(exchangeMessage(exchange,result.evilExchangeUnavailableReason))}</span>`);
  if(s.level==='all' && axesEvidence.hp.used && axesEvidence.hp.matching.length) {
    const hpLevels = [...new Set(axesEvidence.hp.candidates.map(id=>Number(id.split(':')[0])))];
    if(hpLevels.length) hpNotes.push(`对应等级 ${hpLevels.join('／')}`);
  }
  const axisStates = AXES.map(key=>{
    const ownEvidence=axesEvidence[key];
    const value=ownEvidence?.conflict?'记录冲突':ready?axis(matched,key)
      :ownEvidence?.used?axis(ownEvidence.matching,key):'待测';
    return {key,value,conflict:ownEvidence?.conflict,confirmed:['加','减','不变'].includes(value)};
  });
  const confirmedCount=axisStates.filter(entry=>entry.confirmed).length;
  const combinedConflict=used>0 && !matched.length && !axisStates.some(entry=>entry.conflict) && !invalid && !incomplete;
  // 一条读数有误不影响其他属性：已有独立结论时仍报“已判断 N 项”。
  const title=ready?(matched.length===1?matched[0].name:`剩 ${matched.length} 种`)
    :confirmedCount?`已判断 ${confirmedCount} 项`:!used&&!invalid&&!incomplete?'待实测'
    :invalid?'输入有误':incomplete?'有读数未计算':combinedConflict?'读数对不上':'待复核';
  const titleTone=ready?'':!used&&!invalid&&!incomplete?' empty'
    :(invalid||incomplete||combinedConflict||axisStates.some(entry=>entry.conflict))?' bad':' pending';
  const axes = axisStates.map(({key,value,conflict,confirmed})=>{
    const cls=conflict?'conflict':value==='加'?'up':value==='减'?'down':confirmed?'neutral':'none';
    const src=(confirmed||conflict)&&sources[key].length?`<em>${esc(sources[key].join('；'))}</em>`:'<em></em>';
    const note=key==='hp'&&hpNotes.length?`<small>${hpNotes.join(' · ')}</small>`:'';
    return `<div class="flow-axis-row" data-axis="${key}"><span class="flow-axis-name">${statIcon(key)}${names[key]}</span><b class="${cls}">${value}</b>${src}${note}</div>`;
  }).join('');
  const conflictNote=[combinedConflict?'各项读数没有共同的性格，请核对等级、异色、骰子或读数。':'',
    invalid?'有读数格式有误，见对应技能旁的提示。':'', v.incomplete?'有技能无法计算，它的读数没有参与判断。':'']
    .filter(Boolean).map(text=>`<p class="flow-result-note bad">${text}</p>`).join('');
  const candidateIds=new Set(ready?matched.map(x=>x.id):[]);
  const matrixState=!used?'open':'filtered';
  const evidence = v.evidence?.length ? `<details class="flow-evidence"><summary>读数明细 <span>${v.evidence.length}</span></summary>${v.evidence.map(entry=>`<div class="${entry.tone==='bad'?'bad':''}"><span>${esc(entry.label)}</span><b>${esc(entry.text)}</b></div>`).join('')}</details>` : '';
  const unchecked = ['own','target'].filter(side=>!layout.checked[side]).map(side=>side==='own'?'我方':'野怪');
  const diceNote = recordCount && unchecked.length ? `<div class="flow-dice-warning">骰子未核对：${unchecked.join('、')}</div>` : '';
  const countLine = recordCount ? `<span class="flow-result-count">${recordCount} 条读数</span>` : '';
  $('flow-result').innerHTML=`<div class="flow-result-cap"><b>结论</b><span>${esc(wildLabel)}</span></div><div class="flow-verdict-line"><div class="flow-verdict${titleTone}">${esc(title)}</div>${countLine}</div>${goal}${diceNote}<div class="flow-axis-list">${axes}</div>${conflictNote}${natureMatrix(candidateIds,matrixState)}<p class="flow-matrix-legend">${!used?'行是加的属性，列是减的属性；点一格设为目标':ready?'<i class="on"></i>仍在候选 · 点一格设为目标':'<i></i>暂无共同候选'}</p>${evidence}`;
  const pills=axisStates.filter(entry=>entry.confirmed).map(entry=>`<span class="${entry.value==='加'?'up':entry.value==='减'?'down':''}">${names[entry.key]}${entry.value}</span>`).join('');
  $('flow-result-brief').innerHTML=`<b>${esc(title)}</b>${pills}`;
  $('flow-mobile-dice').textContent=unchecked.length&&recordCount?'骰子待核对':'';
}

export function mountPlayerFlow(options) {
  ({ui,catalog,commit,saveState}=options);
  const session=ui.getSession();
  layout=normalizePlayerFlow(session.playerFlow,session.targetId,catalog,own(session).spiritId);
  const versus=$('versus-grid'), workspace=$('preview-workspace'), rail=document.querySelector('.preview-rail');

  // ---- 我方、野怪左右两列，每列一项一行 ----
  const setup=document.createElement('section');
  setup.id='flow-setup';setup.setAttribute('aria-label','我方与野怪配置');
  const row=(key,body,cls='')=>`<div class="flow-row${cls?` ${cls}`:''}"><span class="flow-key">${key}</span><div class="flow-val">${body}</div></div>`;
  setup.innerHTML=`<button type="button" id="flow-own-summary" class="flow-own-summary" aria-expanded="false" aria-controls="flow-own-card"><img id="flow-own-summary-image" alt=""/><span id="flow-own-summary-text"></span><span class="flow-own-summary-edit">改</span></button>
  <div class="flow-card flow-own-card" id="flow-own-card">
    <div class="flow-head"><span class="flow-role flow-role-own">我方</span><i data-slot="own"></i><i data-slot="configs"></i><i data-slot="own-actions"></i></div>
    ${row('等级','<i data-slot="own-level"></i><i data-slot="stars"></i>')}
    ${row('性格','<i data-slot="nature"></i>')}
    ${row('个体','<i data-slot="ivs"></i>')}
    ${row('骰子','<i data-slot="own-dice"></i>')}
    ${row('特性','<i data-slot="own-trait"></i>','flow-trait-field')}
    <i data-slot="own-extra"></i>
  </div>
  <div class="flow-card flow-wild-card" id="flow-wild-card">
    <div class="flow-head"><span class="flow-role flow-role-wild">野怪</span><i data-slot="target"></i><span class="flow-filter-slot" id="flow-filter-head"><i data-slot="filter"></i></span><button type="button" id="flow-wild-more" class="flow-more" aria-expanded="false" aria-controls="flow-wild-sub">条件</button><i data-slot="next"></i></div>
    ${row('等级','<i data-slot="level"></i>')}
    ${row('血量','<i data-slot="hp"></i><i data-slot="shiny"></i><label class="flow-field flow-direct-hp"><input id="flow-hp-value" type="number" min="1" step="1" inputmode="numeric" autocomplete="off" placeholder="读到 HP" aria-label="读到的最大生命"/></label>','flow-hp-field')}
    <div class="flow-wild-sub" id="flow-wild-sub">
      ${row('目标',`<select id="flow-goal" aria-label="目标性格" title="选你想抓的性格：表里会标出相关格子，结论栏显示它是否还在候选；不影响计算"><option value="">不限定</option><optgroup label="属性">${Object.entries(names).filter(([k])=>k!=='speed').map(([k,n])=>`<option value="stat:${k}">加${n}</option>`).join('')}</optgroup><optgroup label="性格">${catalog.natures.map(n=>`<option value="${n.id}">${n.name} · ${names[n.upStat]}↑ ${names[n.downStat]}↓</option>`).join('')}</optgroup></select>`)}
      ${row('骰子','<i data-slot="wild-dice"></i>')}
      ${row('特性','<i data-slot="wild-trait"></i>','flow-trait-field')}
      <div class="flow-row flow-filter-row"><span class="flow-key">范围</span><div class="flow-val" id="flow-filter-sub"></div></div>
    </div>
    <i data-slot="wild-extra"></i>
  </div>`;
  const fill=(slot,...nodes)=>setup.querySelector(`[data-slot="${slot}"]`).replaceWith(...nodes.filter(Boolean));
  const hpRow=$('target-hp-range').parentElement;
  const levelInput=$('profile-level');
  levelInput.closest('label').remove();
  levelInput.classList.add('flow-level-input');
  const details=$('profiles-section');
  // 低频操作（另存、改名、删除、载入预设、详细面板）收进“⋯”菜单，标题行只留精灵和配置下拉。
  const detailButton=document.createElement('button');detailButton.type='button';detailButton.className='flow-details-button';detailButton.setAttribute('role','menuitem');detailButton.textContent='详细面板 / 个体数值';detailButton.setAttribute('aria-expanded',String(details.open));
  detailButton.onclick=()=>{details.open=!details.open;if(details.open)details.scrollIntoView({block:'nearest'});};details.addEventListener('toggle',()=>detailButton.setAttribute('aria-expanded',String(details.open)));
  const preset=$('load-own-preset');preset.textContent='载入推荐预设';preset.title='按这只精灵的推荐配置重置性格、个体和配招，保留等级';preset.className='';preset.setAttribute('role','menuitem');
  const ownActions=document.createElement('div');ownActions.className='flow-menu';
  ownActions.innerHTML=`<button type="button" class="flow-menu-button" id="flow-own-menu-button" aria-haspopup="menu" aria-expanded="false" aria-controls="flow-own-menu" title="配置操作" aria-label="配置操作">⋯</button><div class="flow-menu-list" id="flow-own-menu" role="menu" hidden><button type="button" role="menuitem" data-own-menu="save">另存为新配置</button><button type="button" role="menuitem" data-own-menu="rename">改名</button><button type="button" role="menuitem" data-own-menu="delete">删除这套配置</button><hr/></div>`;
  ownActions.querySelector('.flow-menu-list').append(preset,detailButton);
  const menuButton=ownActions.querySelector('.flow-menu-button'), menuList=ownActions.querySelector('.flow-menu-list');
  const closeMenu=()=>{menuList.hidden=true;menuButton.setAttribute('aria-expanded','false');};
  menuButton.onclick=event=>{event.stopPropagation();const open=menuList.hidden;
    // 另存、删除的可用状态跟随原配置按钮（例如只剩一套时不能删）。
    for(const item of menuList.querySelectorAll('[data-own-menu]')) item.disabled=Boolean(document.querySelector(`#profile-tabs [data-config-action="${item.dataset.ownMenu}"]`)?.disabled);
    menuList.hidden=!open;menuButton.setAttribute('aria-expanded',String(open));if(open)menuList.querySelector('button:not(:disabled)')?.focus();};
  menuList.addEventListener('click',event=>{const item=event.target.closest('button');if(!item)return;
    if(item.dataset.ownMenu) document.querySelector(`#profile-tabs [data-config-action="${item.dataset.ownMenu}"]`)?.click();
    closeMenu();});
  document.addEventListener('click',event=>{if(!ownActions.contains(event.target))closeMenu();});
  document.addEventListener('keydown',event=>{if(event.key==='Escape'&&!menuList.hidden){closeMenu();menuButton.focus();}});
  const dice=(side,ui,select)=>{const holder=document.createElement('span');holder.className='flow-dice';holder.append($(ui),$(select));holder.insertAdjacentHTML('beforeend',`<button type="button" class="flow-check" id="flow-check-${side}" aria-pressed="false">未核对</button>`);return holder;};
  const wrap=(cls,...ids)=>{const holder=document.createElement('span');holder.className=cls;holder.append(...ids.map(id=>typeof id==='string'?$(id):id));return holder;};
  const next=document.createElement('button');next.type='button';next.id='flow-next';next.className='flow-next';next.textContent='清空读数';next.title='清掉这只野怪的全部读数，野怪和我方配置保留';
  fill('target',wrap('flow-spirit','target-image','target-picker'));fill('level',$('level-seg'),$('target-level'));fill('shiny',$('target-shiny-control'));fill('hp',$('target-hp-range'));fill('next',next);
  fill('wild-dice',dice('target','target-dice-ui','target-dice'));fill('wild-trait',$('wild-trait-row'));fill('filter',$('target-filter'));
  fill('wild-extra',wrap('flow-extra','target-dice-custom','target-dice-note','use-initial-form'));
  fill('configs',$('profile-tabs'));fill('own',wrap('flow-spirit','own-image','own-picker'));fill('own-level',levelInput);
  fill('stars',wrap('flow-stars','star-seg','stab-badge','profile-awakening'));
  fill('nature',$('nature-picker'));fill('ivs',$('quick-ivs'));fill('own-dice',dice('own','own-dice-ui','own-dice'));fill('own-trait',$('own-trait-row'));
  fill('own-actions',ownActions);
  fill('own-extra',wrap('flow-extra','own-dice-custom','own-dice-note',document.querySelector('.dice-panel-source'),details));
  hpRow.remove();
  document.querySelector('.calculator-layout').prepend(setup);

  // ---- 异色目标栏：桌面是左侧一列（无外框、透明底），可收起成左侧边缘中间的把手；手机为滑出浮层 ----
  // 名单：S5 → S2 → 通行证 → 火红尾、云梦豚，均取初始形态；只收有异色形态的精灵。
  const spiritById=new Map(catalog.spirits.map(x=>[x.id,x]));
  const groupRoots=id=>((catalog.targetGroups ?? []).find(g=>g.id===id)?.families ?? []).map(f=>f.spiritIds?.[0]).filter(id=>spiritById.get(id)?.hasShinyForm===true);
  const extras=['火红尾','云梦豚'].map(name=>catalog.spirits.find(x=>x.name===name)).filter(x=>x?.hasShinyForm===true).map(x=>x.id);
  const rosterGroups=[['S5 异色',groupRoots('S5')],['S2 异色',groupRoots('S2')],['通行证',groupRoots('battlepass')],['其他',extras]].filter(([,ids])=>ids.length);
  const drawer=document.createElement('aside');drawer.id='flow-roster';drawer.setAttribute('aria-label','异色目标');
  drawer.innerHTML=`<div class="fr-title"><button type="button" class="fr-close" aria-label="收起异色目标栏" title="收起异色目标栏">‹ 收起</button></div><div class="fr-scroll">${rosterGroups.map(([label,ids])=>`<section class="fr-group"><h3>${label}</h3><div class="fr-list">${ids.map(id=>{const sp=spiritById.get(id);return `<button type="button" class="fr-item" data-roster-id="${esc(id)}" aria-pressed="false" title="${esc(sp.name)} · 异色" aria-label="${esc(sp.name)} · 异色"><img src="/assets/spirits/roster/${esc(id)}.png" data-fallback="${esc(sp.imageUrl)}" alt="" loading="lazy" decoding="async"/></button>`;}).join('')}</div></section>`).join('')}</div>`;
  const handle=document.createElement('button');handle.type='button';handle.id='flow-roster-tab';handle.className='fr-handle';
  handle.setAttribute('aria-controls','flow-roster');handle.setAttribute('aria-expanded','false');handle.title='展开异色目标栏';
  handle.innerHTML='<span class="fr-handle-text">异色</span><span class="fr-handle-arrow" aria-hidden="true">›</span>';
  document.querySelector('.calculator-layout').prepend(drawer);document.body.append(handle);
  const scroller=drawer.querySelector('.fr-scroll'), overlay=matchMedia('(max-width:820px)');
  const isOpen=()=>document.body.classList.contains('flow-roster-open');
  let rosterScrollTop=layout.rosterScrollTop, scrollTimer;
  const saveRosterScroll=()=>{
    clearTimeout(scrollTimer);
    // display:none 时不能用 0 覆盖用户最后划到的位置。
    if(scroller.clientHeight)rosterScrollTop=scroller.scrollTop;
    layout.rosterScrollTop=rosterScrollTop;
    saveLayout();
  };
  scroller.addEventListener('scroll',()=>{
    if(!scroller.clientHeight)return;
    rosterScrollTop=scroller.scrollTop;
    clearTimeout(scrollTimer);
    scrollTimer=setTimeout(saveRosterScroll,150);
  },{passive:true});
  window.addEventListener('pagehide',saveRosterScroll);
  const setDrawer=(open,{remember=true}={})=>{
    if(isOpen())saveRosterScroll();
    document.body.classList.toggle('flow-roster-open',open);handle.setAttribute('aria-expanded',String(open));drawer.setAttribute('aria-hidden',String(!open));
    // 桌面的展开状态记住；手机浮层每次默认收起。
    if(remember&&!overlay.matches){layout.roster=open;saveLayout();}
    if(open)scroller.scrollTo({top:rosterScrollTop,behavior:'instant'});
  };
  const applyMode=()=>setDrawer(overlay.matches?false:layout.roster,{remember:false});
  overlay.addEventListener('change',applyMode);applyMode();
  handle.onclick=()=>setDrawer(!isOpen());
  drawer.querySelector('.fr-close').onclick=()=>{setDrawer(false);handle.focus();};
  document.addEventListener('keydown',event=>{if(event.key==='Escape'&&overlay.matches&&isOpen()){setDrawer(false);handle.focus();}});
  document.addEventListener('pointerdown',event=>{if(overlay.matches&&isOpen()&&!drawer.contains(event.target)&&!handle.contains(event.target))setDrawer(false);});
  // 立绘缺失时退回计算器小头像。
  drawer.addEventListener('error',event=>{const img=event.target;if(img.tagName==='IMG'&&img.dataset.fallback&&!img.src.endsWith(img.dataset.fallback))img.src=img.dataset.fallback;},true);
  drawer.addEventListener('click',event=>{
    const item=event.target.closest('[data-roster-id]');if(!item)return;
    const id=item.dataset.rosterId;
    if(overlay.matches)setDrawer(false);
    if(ui.getSession().targetId!==id){
      const select=$('target-species');
      select.replaceChildren(new Option(spiritById.get(id).name,id));select.value=id;
      select.dispatchEvent(new Event('change',{bubbles:true}));
    }
    // 栏里都是有异色形态的目标：选中即按异色计算（最大生命 ×1.5）。
    const shiny=$('target-shiny');
    if(spiritById.get(id)?.hasShinyForm===true && !shiny.checked){shiny.checked=true;shiny.dispatchEvent(new Event('change',{bubbles:true}));}
  });

  versus.hidden=true;
  details.append($('preview-panel'));
  // 桌面：异色与生命同排；手机宽度不够，异色移到等级那排，血量保持一行。
  const shinyControl=$('target-shiny-control'), hpVal=setup.querySelector('.flow-hp-field .flow-val'), levelVal=$('level-seg').closest('.flow-val');
  const narrow=matchMedia('(max-width:820px)');
  const placeShiny=()=>{ if(narrow.matches) levelVal.append(shinyControl); else hpVal.insertBefore(shinyControl,hpVal.querySelector('.flow-direct-hp')); };
  // 搜索范围：桌面在野怪标题行，手机收进“条件”。
  const filter=$('target-filter');filter.title='搜索范围';
  const placeFilter=()=>{ (narrow.matches?$('flow-filter-sub'):$('flow-filter-head')).append(filter); };
  narrow.addEventListener('change',()=>{placeShiny();placeFilter();}); placeShiny(); placeFilter();

  // 滚过野怪行后，顶部常驻最大生命。
  $('app').prepend(Object.assign(document.createElement('div'),{id:'flow-sticky-hp',innerHTML:'<strong id="flow-hp-name"></strong><span class="flow-hp-caption">最大生命</span><div id="flow-hp-values"></div><span id="flow-mobile-dice"></span>'}));

  // ---- 我打它 / 它打我：桌面同页，手机切页 ----
  const cards=[...workspace.querySelectorAll(':scope > .preview-card')];
  cards[0].id='flow-outgoing-card';cards[1].id='flow-incoming-card';
  cards[0].querySelector('h2').textContent='我打它';cards[1].querySelector('h2').textContent='它打我';
  cards[0].querySelector('h2').insertAdjacentHTML('beforeend','<small class="flow-reading-key">测生命 · 物防 · 魔防</small>');
  cards[1].querySelector('h2').insertAdjacentHTML('beforeend','<small class="flow-reading-key">测物攻 · 魔攻</small>');
  for(const [i,card] of cards.entries()) { const b=document.createElement('button');b.className='flow-clear';b.type='button';b.textContent='清空';b.setAttribute('aria-label',i?'清空它打我的读数':'清空我打它的读数');b.onclick=()=>clearCard(i?'incoming':'outgoing');card.querySelector('.preview-heading').append(b); }
  workspace.insertAdjacentHTML('afterbegin',`<div class="flow-test-bar"><div role="tablist" aria-label="测法" class="flow-tabs"><button type="button" role="tab" data-flow-tab="outgoing">我打它<small>生命 · 双防</small></button><button type="button" role="tab" data-flow-tab="incoming">它打我<small>双攻</small></button></div></div>`);
  const skills=document.createElement('div');skills.className='flow-mobile-skills';skills.setAttribute('role','tablist');skills.setAttribute('aria-label','四个技能');skills.innerHTML=Array.from({length:4},(_,i)=>`<button type="button" role="tab" data-flow-skill="${i}"></button>`).join('');cards[0].querySelector('.preview-heading').after(skills);
  $('preview-incoming').insertAdjacentHTML('afterbegin','<div class="pth pth-skill">技能</div><div class="pth">攻击↓</div><div class="pth">攻击不变</div><div class="pth">攻击↑</div><div class="pth">实测</div>');
  for(const [i,row] of [...document.querySelectorAll('#preview-outgoing [data-preview-row]')].entries()) {
    row.querySelector('.pobservations').insertAdjacentHTML('beforeend',`<div class="flow-row-verdict" id="flow-row-verdict-out-${i}" aria-live="polite"></div>`);
    const line=row.querySelector('.pskill-line'), picker=line.querySelector('.picker-anchor'), gear=line.querySelector('.pskill-gear');
    const editor=document.createElement('button');editor.type='button';editor.className='flow-edit-skill';editor.textContent='换招';editor.setAttribute('aria-expanded','false');
    line.insertBefore(editor,gear);
    gear.innerHTML='<span class="flow-gear-icon" aria-hidden="true">⚙</span><span class="flow-gear-text">条件</span>';gear.setAttribute('aria-label',`第${i+1}槽技能条件`);
    editor.onclick=()=>{const open=row.classList.toggle('flow-editing-skill');editor.setAttribute('aria-expanded',String(open));editor.textContent=open?'收起':'换招';if(open)picker.querySelector('input').focus();};
  }
  // 第五招独立测生命；开关记住选择，切到龙息帕尔自动开启。
  const exchangeToggle=document.createElement('label');exchangeToggle.className='switch-label';
  exchangeToggle.title='打开后常驻第五行；选择龙息帕尔会自动打开';
  exchangeToggle.innerHTML='<input id="flow-exchange-enabled" class="switch" type="checkbox" role="switch" aria-label="恶念交换第五行" aria-controls="flow-exchange-row"/><span>恶念交换</span>';
  cards[0].querySelector('.flow-clear').before(exchangeToggle);
  const exchangeRow=document.createElement('section');exchangeRow.id='flow-exchange-row';exchangeRow.className='preview-grid';exchangeRow.setAttribute('aria-label','第五招恶念交换测生命');exchangeRow.hidden=true;
  exchangeRow.innerHTML=`<div class="flow-exchange-skill pskill-body"><div class="flow-exchange-title pskill-line"><span class="muted">5</span><b class="pskill-body">恶念交换</b><span class="pskill-meta">测生命</span><button type="button" id="flow-exchange-condition-gear" class="pskill-gear" aria-label="恶念交换条件" aria-expanded="false" aria-controls="flow-exchange-condition-pop">⚙</button></div>
    <div id="flow-exchange-condition-label" class="pskill-meta">破盾10%</div>
    <div id="flow-exchange-condition-pop" class="pskill-pop" role="dialog" aria-label="恶念交换条件" hidden><label class="flow-dialog-field">野怪剩余血量 %<input id="flow-exchange-percent" type="number" min="0" max="100" step="0.01" inputmode="decimal" aria-label="恶念交换野怪剩余血量百分比"/></label><p class="flow-dialog-message">我方满血，读野怪绿色回血；期间无额外扣血、回血或生命上限变化。</p><div class="pskill-pop-foot"><span>默认 10% · 按精确比例算</span><button type="button" id="flow-exchange-reset" class="text-button">恢复默认</button></div></div></div>
    <div id="flow-exchange-values" class="hp-column-legend" aria-label="恶念交换三档回血"></div>
    <div class="pobservations"><label class="pobs"><span>野怪回血</span><input id="flow-exchange-healing" type="text" inputmode="numeric" autocomplete="off" maxlength="20" placeholder="绿色数字" aria-label="恶念交换野怪绿色回血" aria-describedby="flow-exchange-verdict"/></label><div id="flow-exchange-verdict" class="flow-row-verdict" aria-live="polite"></div></div>`;
  $('preview-outgoing').after(exchangeRow);
  for(const [k,row] of [...document.querySelectorAll('#preview-incoming [data-incoming-row]')].entries())
    row.querySelector('.pobservations').insertAdjacentHTML('beforeend',`<div class="flow-row-verdict" id="flow-row-verdict-in-${k}" aria-live="polite"></div>`);
  rail.insertAdjacentHTML('beforeend','<section id="flow-result" class="rail-card" aria-live="polite" tabindex="-1"></section>');
  document.body.insertAdjacentHTML('beforeend','<div id="flow-mobile-result"><span id="flow-result-brief">待实测</span><button type="button" id="flow-result-jump">看结果</button></div>');

  // ---- 事件 ----
  for(const side of ['own','target']) $(`flow-check-${side}`).onclick=()=>{layout.checked[side]=!layout.checked[side];saveLayout();render();};
  $('flow-exchange-enabled').onchange=()=>{layout.exchange.enabled=$('flow-exchange-enabled').checked;saveLayout();render();};
  const exchangePop=$('flow-exchange-condition-pop'), exchangeGear=$('flow-exchange-condition-gear');
  exchangeGear.onclick=event=>{
    event.stopPropagation();const open=exchangePop.hidden;
    for(const pop of document.querySelectorAll('.pskill-pop:not([hidden])')) {
      pop.hidden=true;$(pop.id.replace(/-pop$/,'-gear'))?.setAttribute('aria-expanded','false');
    }
    exchangePop.hidden=!open;exchangeGear.setAttribute('aria-expanded',String(open));
    if(open) { $('flow-exchange-percent').focus();exchangePop.scrollIntoView({block:'nearest'}); }
  };
  $('flow-exchange-percent').onchange=()=>{const value=$('flow-exchange-percent').value;layout.exchange.percent=value===''?10:Number(value);saveLayout();render();};
  $('flow-exchange-percent').onkeydown=event=>{if(event.key==='Enter'){event.preventDefault();$('flow-exchange-percent').dispatchEvent(new Event('change'));exchangePop.hidden=true;exchangeGear.setAttribute('aria-expanded','false');exchangeGear.focus();}};
  $('flow-exchange-reset').onclick=()=>{layout.exchange.percent=10;saveLayout();render();};
  const saveExchange=()=>{layout.exchange.healing=$('flow-exchange-healing').value.trim();saveLayout();render();};
  $('flow-exchange-healing').addEventListener('input',saveExchange);
  $('flow-exchange-healing').addEventListener('keydown',event=>{if(event.key==='Enter'){saveExchange();event.target.blur();}});
  let hpTimer;
  const saveHp=()=>{const value=$('flow-hp-value').value.trim();layout.hp=Number.isSafeInteger(Number(value))&&Number(value)>0?String(Number(value)):'';saveLayout();render();};
  $('flow-hp-value').addEventListener('input',()=>{clearTimeout(hpTimer);hpTimer=setTimeout(saveHp,240);});
  $('flow-hp-value').addEventListener('change',()=>{clearTimeout(hpTimer);saveHp();});
  $('flow-hp-value').addEventListener('keydown',event=>{if(event.key==='Enter'){clearTimeout(hpTimer);saveHp();event.target.blur();}});
  const toggleOpen=(button,cls)=>{const open=document.body.classList.toggle(cls);button.setAttribute('aria-expanded',String(open));};
  $('flow-wild-more').onclick=()=>toggleOpen($('flow-wild-more'),'flow-wild-open');
  $('flow-own-summary').onclick=()=>toggleOpen($('flow-own-summary'),'flow-own-open');
  $('flow-result-jump').onclick=()=>{$('flow-result').scrollIntoView({behavior:'smooth',block:'start'});$('flow-result').focus({preventScroll:true});};
  $('flow-result').addEventListener('click',event=>{
    const cell=event.target.closest('[data-goal-nature]');if(!cell)return;
    layout.goal=layout.goal===cell.dataset.goalNature?'':cell.dataset.goalNature;
    const n=goalNature();if(n)layout.tab=['physicalAttack','magicalAttack'].includes(n.upStat)?'incoming':'outgoing';
    saveLayout();render();
  });
  new IntersectionObserver(([entry])=>document.body.classList.toggle('flow-result-in-view',entry.isIntersecting),{rootMargin:'-60px 0px -68px 0px'}).observe($('flow-result'));
  workspace.addEventListener('focusin',event=>{
    if(event.target.matches('input,select'))document.body.classList.add('flow-input-focus');
    // 桌面两张表同页；记住最后操作的一张，切到手机宽度时停在同一页。
    const tab=event.target.closest('#flow-incoming-card')?'incoming':event.target.closest('#flow-outgoing-card')?'outgoing':null;
    if(tab && tab!==layout.tab){layout.tab=tab;saveLayout();document.body.dataset.testTab=tab;for(const b of document.querySelectorAll('[data-flow-tab]'))b.setAttribute('aria-selected',String(b.dataset.flowTab===tab));}
  });
  workspace.addEventListener('focusout',()=>requestAnimationFrame(()=>document.body.classList.toggle('flow-input-focus',workspace.contains(document.activeElement)&&document.activeElement.matches('input,select'))));
  next.onclick=nextTarget;
  // 手机把“清空读数”放在顶栏，野怪区留给精灵、等级和生命。
  const topNext=Object.assign(document.createElement('button'),{type:'button',id:'flow-next-top',className:'flow-next flow-next-top',textContent:'清空读数',title:'清掉这只野怪的全部读数，野怪和我方配置保留'});
  topNext.onclick=nextTarget;
  document.querySelector('.app-header')?.append(topNext);
  for(const b of document.querySelectorAll('[data-flow-tab]')) b.onclick=()=>setTab(b.dataset.flowTab);
  for(const b of document.querySelectorAll('[data-flow-skill]')) b.onclick=()=>{layout.skill=Number(b.dataset.flowSkill);saveLayout();render();};
  $('flow-goal').value=layout.goal;
  $('flow-goal').onchange=()=>{layout.goal=$('flow-goal').value;const n=goalNature(),k=n?.upStat||layout.goal.slice(5);layout.tab=['physicalAttack','magicalAttack'].includes(k)?'incoming':'outgoing';saveLayout();render();};
  // 读数输入停顿即算，回车立即算；读数本身仍由原模块保存。
  let timer;
  workspace.addEventListener('input',event=>{if(!event.target.matches('.pobs input'))return;clearTimeout(timer);const input=event.target;timer=setTimeout(()=>{input.dispatchEvent(new Event('change',{bubbles:true}));render();},240);});
  workspace.addEventListener('keydown',event=>{if(event.key==='Enter'&&event.target.matches('.pobs input')){clearTimeout(timer);event.target.dispatchEvent(new Event('change',{bubbles:true}));event.target.blur();render();}});
  new IntersectionObserver(([entry])=>document.body.classList.toggle('flow-past-config',!entry.isIntersecting),{threshold:0}).observe(setup.querySelector('.flow-hp-field'));
  render();
  return {render,toggleDirection:()=>setTab(layout.tab==='incoming'?'outgoing':'incoming')};
}
