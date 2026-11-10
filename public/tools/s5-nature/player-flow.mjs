import { intersectNatureCases } from './measurement-comparison.mjs';

const $ = id => document.getElementById(id);
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const names = {hp:'生命',physicalAttack:'物攻',magicalAttack:'魔攻',physicalDefense:'物防',magicalDefense:'魔防',speed:'速度'};
let ui, catalog, layout, commit, saveState;
function saveLayout(persist = true) { saveState(structuredClone(layout), persist); }
export function normalizePlayerFlow(value, targetId, catalog) {
  const saved = value && typeof value === 'object' ? value : {};
  const goal = typeof saved.goal === 'string' && (catalog.natures.some(n=>n.id===saved.goal) || Object.keys(names).filter(key=>key!=='speed').some(key=>saved.goal===`stat:${key}`)) ? saved.goal : '';
  return {tab:saved.tab==='incoming'?'incoming':'outgoing',goal,
    skill:Number.isInteger(saved.skill)&&saved.skill>=0&&saved.skill<4?saved.skill:0,
    hp:['string','number'].includes(typeof saved.hp)&&Number.isSafeInteger(Number(saved.hp))&&Number(saved.hp)>0?String(Number(saved.hp)):'',
    checked:{own:saved.checked?.own===true,target:saved.checked?.target===true},
    targetId:typeof saved.targetId==='string'?saved.targetId:targetId,
    ownDiceSignature:typeof saved.ownDiceSignature==='string'?saved.ownDiceSignature:'',targetDiceSignature:typeof saved.targetDiceSignature==='string'?saved.targetDiceSignature:''};
}
function own(s) { return s.profiles.find(p=>p.id===s.activeProfileId) || s.profiles[0]; }
function setTab(tab) {
  layout.tab=tab; saveLayout(); document.body.dataset.testTab=tab;
  for(const b of document.querySelectorAll('[data-flow-tab]')) b.setAttribute('aria-selected',String(b.dataset.flowTab===tab));
  $('flow-outgoing-card').hidden=tab!=='outgoing'; $('flow-incoming-card').hidden=tab!=='incoming'; render();
}
function clearTab() {
  commit(s=>{
    const p=own(s);
    if(layout.tab==='outgoing') { p.preview.observed={};p.preview.picked={}; }
    else { s.preview.incomingDamages=[null,null];s.preview.incomingPicks=[null,null]; }
  });
}
function nextTarget() {
  layout.hp='';layout.checked.target=false;
  commit(s=>{
    s.observations=[];
    for(const p of s.profiles) if(p.preview) {p.preview.observed={};p.preview.picked={};}
    Object.assign(s.preview,{incomingDamages:[null,null],incomingPicks:[null,null],diceId:'none',diceEffects:{}});
    s.playerFlow=structuredClone(layout);
  });
}
function goalNature() { return catalog.natures.find(n=>n.id===layout.goal); }
function goalMatches(n) { return layout.goal.startsWith('stat:') ? n.upStat===layout.goal.slice(5) : n.id===layout.goal; }
function axis(natures,key) { const all=new Set(natures.map(n=>n.upStat===key?'加':n.downStat===key?'减':'不变'));return all.size===1?[...all][0]:'待区分'; }
function render() {
  if(!ui || !layout || !$('flow-result')) return;
  const s=ui.getSession(), p=own(s), result=ui.getPreview(), v=result.uiVerdict;
  if(!v) return;
  layout=normalizePlayerFlow(s.playerFlow,s.targetId,catalog);
  if(layout.targetId!==s.targetId) {layout.hp='';layout.checked.target=false;}
  layout.targetId=s.targetId;
  document.body.dataset.testTab=layout.tab;
  for(const button of document.querySelectorAll('[data-flow-tab]')) button.setAttribute('aria-selected',String(button.dataset.flowTab===layout.tab));
  $('flow-outgoing-card').hidden=layout.tab!=='outgoing';
  $('flow-incoming-card').hidden=layout.tab!=='incoming';
  $('flow-goal').value=layout.goal;
  const target=catalog.spirits.find(x=>x.id===s.targetId);
  const defenseStats=new Set((result.outgoing||[]).filter(row=>row.status==='estimated').map(row=>catalog.skills.find(skill=>skill.id===row.skillId)?.category==='physical'?'物防':'魔防'));
  const defenseName=defenseStats.size===1?[...defenseStats][0]:'防御';
  const heads=[...$('preview-outgoing').querySelectorAll(':scope > .pth')];
  const hpLegend=[['down','↓','生命降低'],['neutral','＝','生命不变'],['up','↑','生命提高']].map(([key,symbol,label])=>`<span class="hp-state-label" data-hp-state="${key}" title="${label}时的剩余血量" aria-label="${label}时的剩余血量"><img src="./assets/hp-outline.svg" alt=""/><span aria-hidden="true">${symbol}</span></span>`).join('');
  [`${defenseName}↓`,`${defenseName}不变`,`${defenseName}↑`].forEach((label,i)=>{
    heads[i+1].classList.add('defense-column-head');
    heads[i+1].innerHTML=`<span>${label}</span><div class="hp-column-legend">${hpLegend}</div>`;
  });
  $('preview-outgoing').classList.toggle('mixed-defense',defenseStats.size>1);
  for(const row of document.querySelectorAll('#preview-outgoing [data-preview-row]')) {
    const i=Number(row.dataset.previewRow), editor=row.querySelector('.flow-edit-skill');
    if(editor) editor.setAttribute('aria-label',`编辑第${i+1}槽技能：${result.outgoing?.[i]?.skillName || '未选择'}`);
  }
  for(const side of ['own','target']) {
    const holder=side==='own'?p.preview:s.preview, sig=JSON.stringify([side==='own'?`${p.id}:${p.spiritId}`:s.targetId,holder?.diceId||'none',holder?.diceEffects||{}]);
    const signatureKey=`${side}DiceSignature`;
    if(layout[signatureKey] && layout[signatureKey]!==sig) layout.checked[side]=false;
    layout[signatureKey]=sig;
    const b=$(`flow-check-${side}`);b.textContent=layout.checked[side]?'已核对':'未核对';b.setAttribute('aria-pressed',String(layout.checked[side]));
  }
  saveLayout(false);
  const level=s.level==='all'?'41–43':s.level;
  $('flow-hp-name').textContent=`${target?.name||'野怪'} · ${level}级${s.preview.shiny?' · 异色':''}`;
  for(const entry of $('target-hp-range').querySelectorAll(':scope > [data-hp-nature]')) {
    if(entry.querySelector('.hp-state-label')) continue;
    const key=entry.dataset.hpNature, label={down:'生命↓',neutral:'生命不变',up:'生命↑'}[key], symbol={down:'↓',neutral:'＝',up:'↑'}[key];
    const value=entry.querySelector('b');
    entry.replaceChildren();
    entry.insertAdjacentHTML('afterbegin',`<span class="hp-state-label" data-hp-state="${key}" title="${label}" aria-label="${label}"><img src="./assets/hp-outline.svg" alt=""/><span aria-hidden="true">${symbol}</span></span>`);
    if(value) entry.append(value);
  }
  $('flow-hp-values').innerHTML=$('target-hp-range').innerHTML;
  $('flow-hp-value').value=layout.hp;
  $('flow-hp-open').textContent=layout.hp?`实测 ${layout.hp}`:'实测生命';
  $('flow-hp-mobile-open').textContent=layout.hp?`实测 ${layout.hp}`:'实测生命';
  for(const [i,button] of [...document.querySelectorAll('[data-flow-skill]')].entries()) {
    button.textContent=`${i+1} ${result.outgoing?.[i]?.skillName || '选择技能'}`;
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
  const hpRows=result.targetHpByLevel || [];
  const direct=layout.hp!=='' && Number.isInteger(Number(layout.hp)) && Number(layout.hp)>0;
  const hpHits=direct?hpRows.flatMap(row=>catalog.natures.filter(n=>row[n.upStat==='hp'?'up':n.downStat==='hp'?'down':'neutral']===Number(layout.hp)).map(n=>({...n,targetLevel:row.level}))):[];
  let matched=v.matching;
  if(direct) matched=matched.filter(n=>hpHits.some(h=>h.id===n.id && v.candidates.includes(`${h.targetLevel}:${n.id}`)));
  const used=v.used+(direct?1:0), ready=used>0 && matched.length>0 && !v.invalid && !v.incomplete;
  const axesEvidence={...v.axesEvidence};
  const hpGroups=axesEvidence.hp?.used ? [axesEvidence.hp.candidates] : [];
  if(direct) hpGroups.push(hpHits.map(h=>`${h.targetLevel}:${h.id}`));
  axesEvidence.hp=intersectNatureCases(catalog.natures,result.targetLevels || [s.level],hpGroups);
  const hpIndependent=axesEvidence.hp.used?axesEvidence.hp.matching:[];
  const hasConflict=v.invalid||v.incomplete||(used>0&&!matched.length)||axesEvidence.hp.conflict;
  let goal='';
  if(layout.goal) {
    const label=n?.name || `加${names[goalStat]}`;
    const state=!used?'待实测':hasConflict?'待复核':matched.some(goalMatches)?matched.length===1?'吻合':'仍在候选':'不在候选';
    goal=`<div class="flow-goal-result"><span>目标 ${esc(label)}</span><b>${state}</b></div>`;
  }
  const hasReading = value => value != null && (typeof value !== 'string' || value.trim() !== '');
  const outgoingCount = Array.from({length:4},(_,i)=>p.preview?.observed?.[i])
    .filter(observation=>observation && (hasReading(observation.damage) || hasReading(observation.remainingPercent))).length;
  const incomingCount = Array.from({length:2},(_,i)=>s.preview?.incomingDamages?.[i]).filter(hasReading).length;
  const directCount = hasReading(layout.hp) ? 1 : 0;
  const recordCount = outgoingCount + incomingCount + directCount;
  const currentPageCount = layout.tab === 'incoming' ? incomingCount : outgoingCount;
  const sourceCounts = [
    ['生命／防御',outgoingCount],
    ['物攻／魔攻',incomingCount],
    ['最大生命',directCount],
  ].filter(([,count])=>count>0);
  const sources = sourceCounts.length ? `<div class="flow-record-sources">${sourceCounts.map(([label,count])=>`<span>${label} <b>${count}</b></span>`).join('')}${currentPageCount===0?'<span class="flow-page-empty">本页未录入</span>':''}</div>` : '';

  const hpRanges = v.hpComparison?.ranges ?? [];
  const hpRangeText = hpRanges.map(range=>range.max===null?`≥${range.min}`:range.min===range.max?`${range.min}`:`${range.min}–${range.max}`).join('／');
  const hpEvidenceParts = [];
  if(direct) hpEvidenceParts.push(`<small class="flow-axis-evidence">实测最大生命 <b>${esc(layout.hp)}</b></small>`);
  if(hpRangeText) hpEvidenceParts.push(`<small class="flow-axis-evidence">推算总血量 <b>${esc(hpRangeText)}</b></small>`);
  if(direct && !hpHits.length) hpEvidenceParts.push('<small class="flow-axis-evidence bad">与当前三档生命不符</small>');
  if(v.hpComparison?.status==='conflict') hpEvidenceParts.push(`<small class="flow-axis-evidence bad">${hpRanges.length?'推算血量与当前三档不符':'血量记录互相冲突'}</small>`);
  else if(direct && hpHits.length && axesEvidence.hp.conflict) hpEvidenceParts.push('<small class="flow-axis-evidence bad">血量记录互相冲突</small>');
  if(s.level==='all' && hpIndependent.length) {
    const hpLevels = [...new Set(axesEvidence.hp.candidates.map(id=>Number(id.split(':')[0])))];
    if(hpLevels.length) hpEvidenceParts.push(`<small class="flow-axis-evidence">对应等级 ${hpLevels.map(esc).join('／')}</small>`);
  }
  const hpEvidence = hpEvidenceParts.join('');
  const axisStates = ['hp','physicalDefense','magicalDefense','physicalAttack','magicalAttack'].map(key=>{
    const ownEvidence=axesEvidence[key];
    const value=ownEvidence?.conflict?'记录冲突':ready?axis(matched,key)
      :ownEvidence?.used?axis(ownEvidence.matching,key):'—';
    return {key,value,conflict:ownEvidence?.conflict,confirmed:['加','减','不变'].includes(value)};
  });
  const confirmedCount=axisStates.filter(entry=>entry.confirmed).length;
  const title=ready?(matched.length===1?matched[0].name:`${matched.length} 个候选`)
    :confirmedCount?`已判断 ${confirmedCount} 项`:!used&&!v.invalid&&!v.incomplete?'待实测':'待判断';
  const displayedAxes = axisStates.filter(entry=>entry.confirmed || entry.conflict || (entry.key==='hp' && hpEvidence));
  displayedAxes.sort((a,b)=>Number(b.confirmed)-Number(a.confirmed));
  const axes = displayedAxes.map(({key,value,conflict})=>`<div class="flow-axis flow-axis-v6${key==='hp'?' flow-axis--hp':''}"><div class="flow-axis-line"><span>${names[key]}</span><b class="${conflict?'conflict':value==='加'?'up':value==='减'?'down':''}">${value==='—'?'待判断':value}</b></div>${key==='hp'?hpEvidence:''}</div>`).join('');
  const unresolvedKeys = new Set(axisStates.filter(entry=>!entry.confirmed && !displayedAxes.includes(entry)).map(entry=>entry.key));
  const unresolvedNames = [];
  if(unresolvedKeys.has('hp')) unresolvedNames.push('生命');
  for(const [first,second,pair] of [['physicalDefense','magicalDefense','双防'],['physicalAttack','magicalAttack','双攻']]) {
    if(unresolvedKeys.has(first) && unresolvedKeys.has(second)) unresolvedNames.push(pair);
    else for(const key of [first,second]) if(unresolvedKeys.has(key)) unresolvedNames.push(names[key]);
  }
  const unresolved = unresolvedNames.length ? `<div class="flow-axis-unresolved"><span>${ready?'待区分':recordCount?'待判断':'待实测'}</span><b>${unresolvedNames.join('、')}</b></div>` : '';
  const combinedConflict=used>0 && !matched.length && !axisStates.some(entry=>entry.conflict) && !v.invalid && !v.incomplete;
  const conflictNote=combinedConflict?'<small class="flow-axis-evidence bad">各项记录无共同性格</small>':'';
  const chips = ready && matched.length>1 ? `<details class="flow-candidates" ${matched.length<=5?'open':''}><summary>候选性格 <span>${matched.length}</span></summary><div>${matched.map(nature=>`<span class="${goalMatches(nature)?'desired':''}"><b>${esc(nature.name)}</b><small>${names[nature.upStat]}↑ ${names[nature.downStat]}↓</small></span>`).join('')}</div></details>` : '';
  const evidence = v.evidence?.length ? `<div class="flow-evidence">${v.evidence.map(entry=>`<div class="${entry.tone==='bad'?'bad':''}"><span>${esc(entry.label)}</span><b>${esc(entry.text)}</b></div>`).join('')}</div>` : '';
  const unchecked = ['own','target'].filter(side=>!layout.checked[side]).map(side=>side==='own'?'我方':'野怪');
  const diceNote = recordCount && unchecked.length ? `<div class="flow-dice-warning flow-dice-compact">骰子未核对：${unchecked.join('、')}</div>` : '';
  $('flow-result').innerHTML=`<div class="flow-result-cap"><b>实测结果</b><span>累计 ${recordCount} 条</span></div><div class="flow-verdict flow-verdict-v6${!recordCount?' empty':''}">${esc(title)}</div>${sources}${goal}${diceNote}<div class="flow-axes flow-axes-v6">${axes}${unresolved}</div>${conflictNote}${chips}${evidence}`;
  $('flow-result-brief').textContent=recordCount?`累计 ${recordCount} 条 · ${title}`:title;
  $('flow-result-brief').classList.remove('pending');
  $('flow-mobile-dice').textContent=unchecked.length?'骰子待核对':'';
}
export function mountPlayerFlow(options) {
  ({ui,catalog,commit,saveState}=options);
  const session=ui.getSession();
  layout=normalizePlayerFlow(session.playerFlow,session.targetId,catalog);
  const versus=$('versus-grid'), workspace=$('preview-workspace'), rail=document.querySelector('.preview-rail');
  $('app').prepend(Object.assign(document.createElement('div'),{id:'flow-sticky-hp',innerHTML:'<div class="flow-hp-top"><strong id="flow-hp-name"></strong><span id="flow-mobile-dice"></span><button id="flow-config-toggle" type="button" aria-expanded="false">配置</button></div><div class="flow-hp-line"><span class="flow-hp-caption">最大生命</span><div id="flow-hp-values"></div><button type="button" id="flow-hp-mobile-open">实测生命</button></div>'}));
  document.querySelector('.calculator-layout').prepend(versus);
  const cards=[...workspace.querySelectorAll(':scope > .preview-card')];
  cards[0].id='flow-outgoing-card';cards[1].id='flow-incoming-card';cards[1].querySelector('h2').textContent='野怪出招';
  for(const card of cards) { const b=document.createElement('button');b.className='flow-clear';b.type='button';b.textContent='清空本页';b.onclick=clearTab;card.querySelector('.preview-heading').append(b); }
  workspace.insertAdjacentHTML('afterbegin',`<div class="flow-test-bar"><div role="tablist" aria-label="测法" class="flow-tabs"><button type="button" role="tab" data-flow-tab="outgoing">测生命／防御</button><button type="button" role="tab" data-flow-tab="incoming">测物攻／魔攻</button></div><label class="flow-goal-label">目标<select id="flow-goal" aria-label="想筛的性格"><option value="">不限定</option><optgroup label="属性">${Object.entries(names).filter(([k])=>k!=='speed').map(([k,n])=>`<option value="stat:${k}">加${n}</option>`).join('')}</optgroup><optgroup label="性格">${catalog.natures.map(n=>`<option value="${n.id}">${n.name} · ${names[n.upStat]}↑ ${names[n.downStat]}↓</option>`).join('')}</optgroup></select></label></div>`);
  const skills=document.createElement('div');skills.className='flow-mobile-skills';skills.setAttribute('role','tablist');skills.setAttribute('aria-label','四个技能');skills.innerHTML=Array.from({length:4},(_,i)=>`<button type="button" role="tab" data-flow-skill="${i}"></button>`).join('');cards[0].querySelector('.preview-heading').after(skills);
  for(const [i,card] of cards.entries()) card.querySelector('h2').insertAdjacentHTML('beforeend',`<small class="flow-reading-key">${i?'伤害':'伤害 / 余血 %'}</small>`);
  $('preview-incoming').insertAdjacentHTML('afterbegin','<div class="pth pth-skill">技能</div><div class="pth">攻击↓</div><div class="pth">攻击不变</div><div class="pth">攻击↑</div><div class="pth">实测</div>');
  for(const [i,row] of [...document.querySelectorAll('#preview-outgoing [data-preview-row]')].entries()) {
    const line=row.querySelector('.pskill-line'), picker=line.querySelector('.picker-anchor'), gear=line.querySelector('.pskill-gear');
    const editor=document.createElement('button');editor.type='button';editor.className='flow-edit-skill';editor.textContent='换招';editor.setAttribute('aria-expanded','false');
    line.insertBefore(editor,gear);
    gear.innerHTML='<span class="flow-gear-icon" aria-hidden="true">⚙</span><span class="flow-gear-text">条件</span>';gear.setAttribute('aria-label',`第${i+1}槽技能条件`);
    editor.onclick=()=>{const open=row.classList.toggle('flow-editing-skill');editor.setAttribute('aria-expanded',String(open));editor.textContent=open?'收起':'换招';if(open)picker.querySelector('input').focus();};
  }
  $('profiles-section').append($('preview-panel'));
  rail.insertAdjacentHTML('beforeend','<section id="flow-result" class="rail-card" aria-live="polite" tabindex="-1"></section>');
  $('wild-side').querySelector('.side-head').insertAdjacentHTML('beforeend','<button type="button" id="flow-next" class="flow-next">下一只</button>');
  const hpRow=$('target-hp-range').parentElement;hpRow.classList.add('flow-original-hp');hpRow.querySelector('.config-key').textContent='最大生命';
  hpRow.insertAdjacentHTML('beforeend','<button type="button" id="flow-hp-open" class="text-button">实测生命</button>');
  for(const side of ['own','target']) {
    $(`${side}-dice-ui`).parentElement.insertAdjacentHTML('beforeend',`<button type="button" class="flow-check" id="flow-check-${side}" aria-pressed="false">未核对</button>`);
    $(`flow-check-${side}`).onclick=()=>{layout.checked[side]=!layout.checked[side];saveLayout();render();};
  }
  const details=$('profiles-section'), secondary=document.createElement('div');secondary.className='config-secondary';
  details.before(secondary);
  const detailButton=document.createElement('button');detailButton.type='button';detailButton.className='text-button flow-details-button';detailButton.textContent='详细面板 / 个体数值';detailButton.setAttribute('aria-expanded',String(details.open));
  detailButton.onclick=()=>{details.open=!details.open;};details.addEventListener('toggle',()=>detailButton.setAttribute('aria-expanded',String(details.open)));
  secondary.append(detailButton,$('load-own-preset'));
  for(const row of versus.querySelectorAll('.config-row')) {
    const key=row.querySelector(':scope > .config-key');if(!key)continue;
    const control=document.createElement('div');control.className='config-control';
    for(const node of [...row.childNodes]) if(node!==key)control.append(node);
    row.append(control);
  }
  document.body.insertAdjacentHTML('beforeend','<dialog id="flow-hp-dialog"><form method="dialog"><div class="flow-dialog-head"><h2>实测最大生命</h2><button aria-label="关闭" value="cancel">×</button></div><label>最大生命<input id="flow-hp-value" type="number" min="1" step="1" inputmode="numeric" placeholder="例如 816" /></label><div class="flow-dialog-actions"><button id="flow-hp-clear" type="button">清空</button><button value="save" class="primary">保存</button></div></form></dialog><div id="flow-mobile-result"><span id="flow-result-brief">待实测</span><button type="button" id="flow-result-jump">看结果</button></div>');
  $('flow-hp-dialog').addEventListener('close',()=>{if($('flow-hp-dialog').returnValue==='save'){layout.hp=$('flow-hp-value').value;saveLayout();render();}});
  for(const id of ['flow-hp-open','flow-hp-mobile-open']) $(id).onclick=()=>{$('flow-hp-dialog').showModal();$('flow-hp-value').focus();};
  $('flow-hp-clear').onclick=()=>{layout.hp='';saveLayout();$('flow-hp-dialog').close();render();};
  $('flow-config-toggle').onclick=()=>{
    const open=document.body.classList.toggle('flow-config-open');
    $('flow-config-toggle').setAttribute('aria-expanded',String(open));$('flow-config-toggle').textContent=open?'收起':'配置';
    requestAnimationFrame(()=>{const anchor=open?versus:workspace;window.scrollTo({top:window.scrollY+anchor.getBoundingClientRect().top-$('flow-sticky-hp').getBoundingClientRect().height-8,behavior:'instant'});});
  };
  $('flow-result-jump').onclick=()=>{$('flow-result').scrollIntoView({behavior:'smooth',block:'start'});$('flow-result').focus({preventScroll:true});};
  new IntersectionObserver(([entry])=>document.body.classList.toggle('flow-result-in-view',entry.isIntersecting),{rootMargin:'-108px 0px -68px 0px'}).observe($('flow-result'));
  workspace.addEventListener('focusin',event=>{if(event.target.matches('input,select'))document.body.classList.add('flow-input-focus');});
  workspace.addEventListener('focusout',()=>requestAnimationFrame(()=>document.body.classList.toggle('flow-input-focus',workspace.contains(document.activeElement)&&document.activeElement.matches('input,select'))));
  $('flow-next').onclick=nextTarget;
  for(const b of document.querySelectorAll('[data-flow-tab]')) b.onclick=()=>setTab(b.dataset.flowTab);
  for(const b of document.querySelectorAll('[data-flow-skill]')) b.onclick=()=>{layout.skill=Number(b.dataset.flowSkill);saveLayout();render();};
  $('flow-goal').value=layout.goal;
  $('flow-goal').onchange=()=>{layout.goal=$('flow-goal').value;saveLayout();const n=goalNature(),k=n?.upStat||layout.goal.slice(5);setTab(['physicalAttack','magicalAttack'].includes(k)?'incoming':'outgoing');};
  // Original UI owns measurement changes, prediction marks, pickers and conditions.
  let timer;
  workspace.addEventListener('input',event=>{if(!event.target.matches('.pobs input'))return;clearTimeout(timer);const input=event.target;timer=setTimeout(()=>{input.dispatchEvent(new Event('change',{bubbles:true}));render();},240);});
  workspace.addEventListener('keydown',event=>{if(event.key==='Enter'&&event.target.matches('.pobs input')){clearTimeout(timer);event.target.dispatchEvent(new Event('change',{bubbles:true}));event.target.blur();render();}});
  new IntersectionObserver(([entry])=>document.body.classList.toggle('flow-past-config',entry.intersectionRatio<1),{threshold:1}).observe(hpRow);
  render();
  return {render,toggleDirection:()=>setTab(layout.tab==='incoming'?'outgoing':'incoming')};
}
