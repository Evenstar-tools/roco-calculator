import { createPicker } from './picker.mjs';
import { previewMatchup } from './matchup-preview.mjs';
import { traitControls, traitPanelPercents } from './own-trait.mjs';
import { getAwakeningBonuses } from './awakening.mjs';
import { formatGamePercent } from './hp-inverse.mjs';

const $ = id => document.getElementById(id);
const html = value => String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const statNames = { hp:'生命',physicalAttack:'物攻',magicalAttack:'魔攻',physicalDefense:'物防',magicalDefense:'魔防',speed:'速度' };
const diceFields = [
  ['skillPowerAdd','技能威力增加',0,1000,1],
  ['hpMultiplier','生命倍率',1,10,0.01],
  ['physicalAttackMultiplier','物攻倍率',1,10,0.01],
  ['magicalAttackMultiplier','魔攻倍率',1,10,0.01],
  ['physicalDefenseMultiplier','物防倍率',1,10,0.01],
  ['magicalDefenseMultiplier','魔防倍率',1,10,0.01],
];
// 我方出招只比较能改变结果的三项；物攻招的魔防列、魔攻招的物防列与其余性格完全相同。
const OUT_COLUMNS = [['hp','生命'],['physicalDefense','物防'],['magicalDefense','魔防']];
const IN_COLUMNS = [['physicalAttack','物攻'],['magicalAttack','魔攻']];
export const INCOMING_SLOTS = 2;
const number = input => input.value.trim() === '' ? null : Number(input.value);
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);

export function validatePreviewSettings(session) {
  const fail = () => { throw new Error('配招判断的配置或实测格式无效，请核对导入文件。'); };
  const overrides = value => {
    if (!object(value)) fail();
    for (const [key,v] of Object.entries(value)) {
      if (!['effectivePower','powerMultiplier','hitCount'].includes(key) || !Number.isFinite(v) || v < 0 || v > 100000) fail();
      if (key === 'hitCount' && (!Number.isInteger(v) || v < 1 || v > 100)) fail();
    }
  };
  for (const holder of [...session.profiles.map(p=>p.preview),session.preview]) {
    if (holder === undefined) continue;
    if (!object(holder)) fail();
    if (holder.skillIds !== undefined && (!Array.isArray(holder.skillIds) || holder.skillIds.length > 4 || holder.skillIds.some(id=>typeof id !== 'string'))) fail();
    if (holder.skillOverrides !== undefined) {
      if (!object(holder.skillOverrides)) fail();
      for (const value of Object.values(holder.skillOverrides)) overrides(value);
    }
    if (holder.incomingOverrides !== undefined) overrides(holder.incomingOverrides);
    if (holder.observed !== undefined) {
      if (!object(holder.observed) || Object.keys(holder.observed).some(key=>!['0','1','2','3'].includes(key))) fail();
      for (const obs of Object.values(holder.observed)) {
        if (!object(obs)) fail();
        for(const key of ['damage','remainingPercent']) if(obs[key]!=null && (!Number.isFinite(obs[key]) || obs[key]<0 || obs[key]>(key==='damage'?1000000:100))) fail();
        if(obs.damage!=null && !Number.isInteger(obs.damage)) fail();
      }
    }
    if (holder.observedUnits !== undefined && (!object(holder.observedUnits) || Object.entries(holder.observedUnits).some(([key,v])=>!['0','1','2','3'].includes(key)||!['damage','percent'].includes(v)))) fail();
    const statKeys = ['hp','physicalAttack','magicalAttack','physicalDefense','magicalDefense','speed'];
    const validPick = value => typeof value === 'string' && statKeys.includes(value.split(':')[0]) && (value.split(':').length === 1 || (value.split(':').length === 2 && /:(base|down)$/.test(value)));
    if (holder.picked !== undefined && (!object(holder.picked) || Object.entries(holder.picked).some(([key,v])=>!['0','1','2','3'].includes(key)||!validPick(v)))) fail();
    if (holder.incomingPicks !== undefined && (!Array.isArray(holder.incomingPicks)||holder.incomingPicks.length>4||holder.incomingPicks.some(v=>v!=null&&!validPick(v)))) fail();
    if (holder.shiny !== undefined && typeof holder.shiny !== 'boolean') fail();
    if (holder.trait !== undefined) {
      if (!object(holder.trait)) fail();
      if (holder.trait.stacks!=null && (!Number.isInteger(holder.trait.stacks)||holder.trait.stacks<0||holder.trait.stacks>999)) fail();
      if (holder.trait.active!=null && typeof holder.trait.active!=='boolean') fail();
    }
    if (holder.incomingDamage!=null && (!Number.isInteger(holder.incomingDamage)||holder.incomingDamage<0||holder.incomingDamage>1000000)) fail();
    if (holder.incomingSkillIds!==undefined && (!Array.isArray(holder.incomingSkillIds)||holder.incomingSkillIds.length>4||holder.incomingSkillIds.some(id=>typeof id!=='string'))) fail();
    if (holder.incomingOverridesList!==undefined) {
      if (!Array.isArray(holder.incomingOverridesList)||holder.incomingOverridesList.length>4) fail();
      for (const value of holder.incomingOverridesList) overrides(value);
    }
    if (holder.incomingDamages!==undefined && (!Array.isArray(holder.incomingDamages)||holder.incomingDamages.length>4||holder.incomingDamages.some(v=>v!=null&&(!Number.isInteger(v)||v<0||v>1000000)))) fail();
    if(holder.diceId!==undefined && !['none','manual-power-plus-40','custom','unresolved-all-stats-plus-30'].includes(holder.diceId)) fail();
    if(holder.diceEffects!==undefined) {
      if(!object(holder.diceEffects)) fail();
      for(const [key,v] of Object.entries(holder.diceEffects)) {
        if(!diceFields.some(([field])=>field===key)||!Number.isFinite(v)) fail();
        if(key==='skillPowerAdd' ? v < -10000 || v > 10000 : v < 0.001 || v > 100) fail();
      }
    }
    if(holder.percentFormat!==undefined && !['game0','round0','floor0','round1'].includes(holder.percentFormat)) fail();
  }
}

function range(values, digits=0) {
  const finite = values.filter(Number.isFinite);
  if (!finite.length) return '—';
  const min = Math.min(...finite).toFixed(digits), max = Math.max(...finite).toFixed(digits);
  return min === max ? min : `${min}–${max}`;
}
function percentDisplay(format) {
  return value => format==='game0'?formatGamePercent(value):format==='floor0'?Math.floor(value+1e-9):format==='round1'?Math.round((value+1e-9)*10)/10:Math.round(value+1e-9);
}
// 物攻招：魔防列等于其余性格；魔攻招：物防列等于其余性格。敌方出招同理。
function sameAsOtherColumn(skill, incoming) {
  if (!skill) return null;
  if (incoming) return skill.category === 'physical' ? 'magicalAttack' : skill.category === 'magical' ? 'physicalAttack' : null;
  return skill.category === 'physical' ? 'magicalDefense' : skill.category === 'magical' ? 'physicalDefense' : null;
}
// Split actual nature penalties before aggregating levels; a single level never
// turns two distinct stat conditions into an apparent random damage range.
export function splitNatureConditions(predictions, skill, incoming = false) {
  const physical = skill?.category === 'physical';
  const relevant = incoming ? (physical ? 'physicalAttack' : 'magicalAttack') : (physical ? 'physicalDefense' : 'magicalDefense');
  return [
    { condition: 'base', label: '', predictions: predictions.filter(p => p.downStat !== relevant) },
    { condition: 'down', label: `${statNames[relevant]}↓`, predictions: predictions.filter(p => p.downStat === relevant) },
  ].filter(group => group.predictions.length);
}
const levelLabel = level => level === 'all' ? '41–43' : level;
const caseId = prediction => `${prediction.targetLevel}:${prediction.natureId}`;

function shortReason(reason='') {
  if (/条件、状态或多段/.test(reason)) return '条件技能 · 在「条件」填有效威力';
  if (/没有明确的物理／魔法/.test(reason)) return '变化技能，无直接伤害';
  if (/骰子/.test(reason)) return '该骰子效果未接入，请改用自填数值';
  if (/种族|资料/.test(reason)) return '该精灵资料不足';
  return reason || '无法计算';
}

// 我方档案保存四技能、骰子与特性层数；敌方技能与骰子属于本场遭遇。
export function createMatchupUi({ catalog, diceCatalog, traitCatalog, getSession, getProfile, commit }) {
  const skills = new Map(catalog.skills.map(s => [s.id,s]));
  const spirits = new Map(catalog.spirits.map(s => [s.id,s]));
  const natures = new Map(catalog.natures.map(n => [n.id,n]));
  const pickers = [];
  let currentPreview;
  const learnset = id => (catalog.learnsets.find(row => row.spiritId === id)?.skillIds ?? []).map(id => skills.get(id)).filter(Boolean);
  const category = skill => skill?.category === 'physical' ? '物攻' : skill?.category === 'magical' ? '魔攻' : '变化';
  const typeFactor = (skill, target) => (target?.types ?? []).reduce((product, type) => product * (catalog.typeChart.matrix[catalog.typeChart.types.indexOf(skill.type)]?.[catalog.typeChart.types.indexOf(type)] ?? 1), 1);
  const ownTraitInfo = spirit => {
    const row = traitCatalog?.traits?.[spirit?.traitName];
    return row ? { damage: row.damage, attacker: row.attacker ?? null, defender: row.defender ?? null } : { damage: 'none', attacker: null, defender: null };
  };
  const limitTraitStacks = (value, info) => {
    const stack = traitControls(info).stack;
    return Math.max(stack?.min ?? 0, Math.min(stack?.max ?? 999,
      Math.floor(Number.isFinite(value) ? value : 0)));
  };

  // 默认敌方技能：一物一魔，优先对我方属性中性的招式，便于对照不同星级。
  function defaultIncoming(targetId, ownSpirit) {
    const rows = learnset(targetId).filter(skill => skill.supported && ['physical','magical'].includes(skill.category));
    const neutral = skill => typeFactor(skill, ownSpirit) === 1;
    const pick = kind => rows.filter(skill => skill.category === kind)
      .sort((a,b) => Number(neutral(b)) - Number(neutral(a)) || (b.basePower ?? 0) - (a.basePower ?? 0))[0]?.id ?? '';
    return [pick('physical'), pick('magical')];
  }
  function state() {
    const session = getSession(), profile = getProfile();
    const available = learnset(profile.spiritId);
    if (!object(profile.preview)) profile.preview = {};
    const own = profile.preview;
    if (!Array.isArray(own.skillIds) || own.speciesId !== profile.spiritId) {
      const preferred = profile.name === '迪莫' ? 'magical' : 'physical';
      const automatic = skill => skill.supported && ['physical','magical'].includes(skill.category);
      const sorted = [...available].sort((a,b) => Number(Boolean(automatic(b) && b.category === preferred)) - Number(Boolean(automatic(a) && a.category === preferred)) || Number(Boolean(automatic(b))) - Number(Boolean(automatic(a))));
      own.skillIds = Array.from({length:4},(_,index) => sorted[index]?.id ?? '');
      own.speciesId = profile.spiritId;
      own.skillOverrides = {};
      own.observed = {};
      own.observedUnits = {};
      own.picked = {};
      own.trait = { stacks: 0, active: false };
    }
    own.skillIds = Array.from({length:4},(_,i) => available.some(s => s.id === own.skillIds[i]) ? own.skillIds[i] : '');
    if (!object(own.skillOverrides)) own.skillOverrides = {};
    if (!object(own.observed)) own.observed = {};
    if (!object(own.observedUnits)) own.observedUnits = {};
    if (!object(own.picked)) own.picked = {};
    if (!object(own.trait)) own.trait = { stacks: 0, active: false };
    const traitInfo = ownTraitInfo(spirits.get(profile.spiritId));
    if (traitControls(traitInfo).stack) own.trait.stacks = limitTraitStacks(own.trait.stacks, traitInfo);
    if (own.observedTargetId !== session.targetId || own.observedLevel !== session.level) {
      own.observed = {};
      own.picked = {};
      own.observedTargetId = session.targetId;
      own.observedLevel = session.level;
    }
    if (!object(session.preview)) session.preview = {};
    const encounter = session.preview;
    if (encounter.targetId !== session.targetId) {
      for (const key of ['incomingSkillId','incomingOverrides','incomingDamage']) delete encounter[key];
      Object.assign(encounter, {targetId:session.targetId,level:session.level,incomingSkillIds:defaultIncoming(session.targetId, spirits.get(profile.spiritId)),
        incomingOverridesList:Array.from({length:INCOMING_SLOTS},()=>({})),incomingDamages:Array(INCOMING_SLOTS).fill(null),incomingPicks:Array(INCOMING_SLOTS).fill(null),shiny:false,diceId:'none',diceEffects:{}});
      for (const item of session.profiles) if(object(item.preview)) { item.preview.observed={}; item.preview.picked={}; }
    }
    if (encounter.level !== session.level) {
      encounter.level = session.level;
      encounter.incomingDamages = Array(INCOMING_SLOTS).fill(null);
      encounter.incomingPicks = Array(INCOMING_SLOTS).fill(null);
    }
    if (!Array.isArray(encounter.incomingSkillIds)) {
      // 旧记录只有一个敌方技能。
      encounter.incomingSkillIds = [encounter.incomingSkillId ?? '', ''];
      encounter.incomingOverridesList = [object(encounter.incomingOverrides) ? encounter.incomingOverrides : {}, {}];
      encounter.incomingDamages = [encounter.incomingDamage ?? null, null];
      for (const key of ['incomingSkillId','incomingOverrides','incomingDamage']) delete encounter[key];
    }
    const enemyRows = learnset(session.targetId);
    encounter.incomingSkillIds = Array.from({length:INCOMING_SLOTS},(_,i)=>enemyRows.some(s=>s.id===encounter.incomingSkillIds[i])?encounter.incomingSkillIds[i]:'');
    encounter.incomingOverridesList = Array.from({length:INCOMING_SLOTS},(_,i)=>object(encounter.incomingOverridesList?.[i])?encounter.incomingOverridesList[i]:{});
    encounter.incomingDamages = Array.from({length:INCOMING_SLOTS},(_,i)=>encounter.incomingDamages?.[i] ?? null);
    encounter.incomingPicks = Array.from({length:INCOMING_SLOTS},(_,i)=>encounter.incomingPicks?.[i] ?? null);
    encounter.shiny = encounter.shiny === true;
    // 我方受击掉血属于当前出战精灵，换档案或换精灵后不沿用。
    const defenderKey = `${profile.id}:${profile.spiritId}`;
    if (encounter.incomingDefender !== defenderKey) { encounter.incomingDamages = Array(INCOMING_SLOTS).fill(null); encounter.incomingPicks = Array(INCOMING_SLOTS).fill(null); encounter.incomingDefender = defenderKey; }
    return {session,profile,own,encounter};
  }

  const skillOptions = rows => '<option value="">选择技能</option>' + rows.map(s => `<option value="${html(s.id)}">${html(s.name)}</option>`).join('');
  function skillControl(id, pickerId, metaId, prefix, slotLabel) {
    return `<div class="pskill"><span class="pskill-slot">${slotLabel}</span><div class="pskill-body"><div class="picker-anchor" id="${pickerId}"><input id="${id}-input" autocomplete="off" placeholder="选择技能"/><span class="picker-caret" aria-hidden="true">⌄</span></div><select id="${id}" class="compat-hidden" tabindex="-1" aria-hidden="true"></select><div id="${metaId}" class="pskill-meta"></div>${conditionControl(prefix)}</div></div>`;
  }
  function conditionControl(prefix) {
    return `<details class="preview-condition"><summary>条件</summary><div class="preview-conditions-grid"><label>威力倍率<input id="${prefix}-powerMultiplier" type="number" min="0.01" max="100" step="0.01" placeholder="1"/></label><label>命中次数<input id="${prefix}-hitCount" type="number" min="1" max="100" step="1" placeholder="1"/></label><label>最终有效威力<input id="${prefix}-effectivePower" type="number" min="0.01" max="100000" step="0.01" placeholder="自动"/></label></div><p>填最终有效威力后，不再叠加本系、克制与威力骰。</p></details>`;
  }
  const heading = (columns, last) => `<div class="pth pth-skill">技能</div>${columns.map(([key,label])=>`<div class="pth">${catalog.assets?.stats?.[key]?`<img src="${html(catalog.assets.stats[key])}" alt=""/>`:''}${label}<span class="up-arrow">↑</span></div>`).join('')}<div class="pth">${last}</div>`;
  $('preview-outgoing').innerHTML = heading(OUT_COLUMNS,'实测') + Array.from({length:4},(_,i) =>
    `<div class="prow" data-preview-row="${i}">${skillControl(`preview-skill-${i}`,`preview-skill-picker-${i}`,`preview-skill-meta-${i}`,`preview-condition-${i}`,i+1)}<div class="pcells" id="preview-cells-${i}"></div><div class="pobs"><input id="preview-observed-${i}" inputmode="decimal" autocomplete="off" aria-label="技能 ${i+1} 实测"/><button id="preview-observed-unit-${i}" type="button" class="unit-toggle" aria-label="切换伤害或剩余百分比">伤害</button></div></div>`).join('');
  $('preview-incoming').innerHTML = heading(IN_COLUMNS,'我方掉血') + Array.from({length:INCOMING_SLOTS},(_,k) =>
    `<div class="prow" data-incoming-row="${k}">${skillControl(`preview-incoming-skill-${k}`,`preview-incoming-picker-${k}`,`preview-incoming-meta-${k}`,`preview-incoming-condition-${k}`,'敌')}<div class="pcells" id="preview-incoming-cells-${k}"></div><div class="pobs"><input id="preview-incoming-damage-${k}" type="number" min="0" max="1000000" step="1" inputmode="numeric" aria-label="敌方技能 ${k+1} 我方掉血"/><span class="unit-label">HP</span></div></div>`).join('');

  function configureDice(side) {
    $(`${side}-dice`).innerHTML = '<option value="none">无加成</option><option value="manual-power-plus-40">技能威力 +40</option><option value="custom">自填属性加成</option>';
    $(`${side}-dice-custom`).innerHTML = '<p>倍率 1.30 即 +30%；面板已含加成时填 1。</p><div class="dice-values">' + diceFields.map(([key,label,value,max,step])=>`<label>${label}<input id="${side}-dice-${key}" type="number" value="${value}" min="${key === 'skillPowerAdd' ? 0 : 0.01}" max="${max}" step="${step}" /></label>`).join('') + '</div>';
    $(`${side}-dice`).addEventListener('change',()=>commit(()=> {
      const {own,encounter}=state(); (side==='own'?own:encounter).diceId=$(`${side}-dice`).value;
    }));
    for (const [key] of diceFields) $(`${side}-dice-${key}`).addEventListener('change',()=>commit(()=>{
      const {own,encounter}=state(), holder=side==='own'?own:encounter;
      holder.diceEffects={...(holder.diceEffects ?? {}),[key]:number($(`${side}-dice-${key}`))};
    }));
  }
  configureDice('own'); configureDice('target');

  function configureSkill(index, incoming) {
    const id = incoming ? `preview-incoming-skill-${index}` : `preview-skill-${index}`;
    const anchor = incoming ? `preview-incoming-picker-${index}` : `preview-skill-picker-${index}`;
    pickers.push(createPicker({anchor,trigger:`${id}-input`,source:id,label:incoming?`敌方技能 ${index+1}`:`我方技能 ${index+1}`,rows:()=>{
      const {profile,session}=state(); return learnset(incoming?session.targetId:profile.spiritId);
    },image:s=>s.iconUrl ?? catalog.assets?.elements?.[s.type],describe:s=>`${s.type} · ${category(s)} · 威力 ${s.basePower ?? '—'}`}));
    $(id).addEventListener('change',()=>commit(()=>{
      const {own,encounter}=state();
      if(incoming) {encounter.incomingSkillIds[index]=$(id).value;encounter.incomingOverridesList[index]={};encounter.incomingDamages[index]=null;encounter.incomingPicks[index]=null;}
      else {own.skillIds[index]=$(id).value;delete own.observed[index];delete own.picked[index];}
    }));
    const prefix=incoming?`preview-incoming-condition-${index}`:`preview-condition-${index}`;
    for (const key of ['powerMultiplier','hitCount','effectivePower']) $(`${prefix}-${key}`).addEventListener('change',()=>commit(()=>{
      const {own,encounter}=state();
      const holder=incoming?encounter.incomingOverridesList[index]:(own.skillOverrides[own.skillIds[index]]??={});
      const value=number($(`${prefix}-${key}`)); if(value===null) delete holder[key]; else holder[key]=value;
    }));
  }
  for(let i=0;i<4;i++) configureSkill(i,false);
  for(let k=0;k<INCOMING_SLOTS;k++) configureSkill(k,true);
  for(let i=0;i<4;i++) {
    $(`preview-observed-${i}`).addEventListener('change',()=>commit(()=>{
      const {own}=state(), value=number($(`preview-observed-${i}`));
      delete own.picked[i];
      if(value===null || Number.isNaN(value)) { delete own.observed[i]; return; }
      own.observed[i] = own.observedUnits[i]==='percent' ? {remainingPercent:value} : {damage:value};
    }));
    $(`preview-observed-unit-${i}`).addEventListener('click',()=>commit(()=>{
      const {own}=state(), next=own.observedUnits[i]==='percent'?'damage':'percent';
      if(next==='damage') delete own.observedUnits[i]; else own.observedUnits[i]=next;
      const obs=own.observed[i], value=obs?.damage ?? obs?.remainingPercent;
      if(value!=null) own.observed[i]=next==='percent'?{remainingPercent:value}:{damage:value};
    }));
  }
  for(let k=0;k<INCOMING_SLOTS;k++) $(`preview-incoming-damage-${k}`).addEventListener('change',()=>commit(()=>{const {encounter}=state(); encounter.incomingDamages[k]=number($(`preview-incoming-damage-${k}`)); encounter.incomingPicks[k]=null;}));
  // 直接点伤害格＝勾选“实测落在这一列”；再点一次取消。与手填数值互斥。
  function togglePick(event) {
    const cell = event.target.closest('.pcell[data-nature-group]'); if (!cell) return;
    const row = cell.closest('[data-preview-row],[data-incoming-row]'); if (!row) return;
    const key = `${cell.dataset.natureGroup}:${cell.dataset.natureCondition}`;
    commit(()=>{
      const {own,encounter}=state();
      if (row.dataset.previewRow !== undefined) {
        const i = Number(row.dataset.previewRow);
        if (own.picked[i] === key) delete own.picked[i]; else { own.picked[i] = key; delete own.observed[i]; }
      } else {
        const k = Number(row.dataset.incomingRow);
        encounter.incomingPicks[k] = encounter.incomingPicks[k] === key ? null : key;
        if (encounter.incomingPicks[k]) encounter.incomingDamages[k] = null;
      }
    });
  }
  for (const id of ['preview-outgoing','preview-incoming']) {
    $(id).addEventListener('click', togglePick);
    $(id).addEventListener('keydown', event => { if ((event.key === 'Enter' || event.key === ' ') && event.target.closest('.pcell[data-nature-group]')) { event.preventDefault(); togglePick(event); } });
  }
  $('target-shiny').addEventListener('change',()=>commit(()=>{state().encounter.shiny=$('target-shiny').checked;}));
  $('preview-percent-format').addEventListener('change',()=>commit(()=>{state().encounter.percentFormat=$('preview-percent-format').value;}));
  $('preview-reset-observed').addEventListener('click',()=>commit(()=>{const {own,encounter}=state();own.observed={};own.picked={};encounter.incomingDamages=Array(INCOMING_SLOTS).fill(null);encounter.incomingPicks=Array(INCOMING_SLOTS).fill(null);}));
  $('trait-grid').addEventListener('click',event=>{
    const step=event.target.closest('[data-trait-step]'); if(!step) return;
    commit(()=>{const {own,profile}=state(); own.trait.stacks=limitTraitStacks((own.trait.stacks ?? 0)+Number(step.dataset.traitStep),ownTraitInfo(spirits.get(profile.spiritId)));});
  });
  $('trait-grid').addEventListener('change',event=>{
    if(event.target.id==='own-trait-stacks') commit(()=>{const {own,profile}=state(); own.trait.stacks=limitTraitStacks(number(event.target),ownTraitInfo(spirits.get(profile.spiritId)));});
    if(event.target.id==='own-trait-active') commit(()=>{state().own.trait.active=event.target.checked;});
  });

  function renderSkillControl(id, metaId, prefix, rows, skillId, overrides, ownSpirit, awakening) {
    if (!object(overrides)) overrides={};
    $(id).innerHTML=skillOptions(rows); $(id).value=skillId ?? '';
    for(const key of ['powerMultiplier','hitCount','effectivePower']) $(`${prefix}-${key}`).value=overrides[key] ?? '';
    const skill=skills.get(skillId);
    if(!skill) { $(metaId).innerHTML='<span class="muted">未选技能</span>'; $(metaId).title=''; return; }
    const stab = ownSpirit?.types?.includes(skill.type) ? getAwakeningBonuses(awakening).sameTypeMultiplier : 1;
    const power = skill.basePower ?? '—';
    $(metaId).innerHTML=`${html(skill.type)} · ${category(skill)} · ${html(power)}${stab>1?`×${stab.toFixed(2)}<span class="stab-tag">本系</span>`:''}`;
    $(metaId).title=skill.description ?? '';
  }
  // 某列包含的性格：该属性增益；“同其他”列另含不在三列中的其余性格。
  const inColumn = (p, key, columns, same) => p.upStat === key || (key === same && !columns.some(([stat]) => stat === p.upStat));
  function observationMatch(prediction, obs, format, columns, same, skill, incoming = false) {
    if (obs.unit === 'pick') {
      const [key, condition] = obs.key.split(':');
      if (!inColumn(prediction, key, columns, same)) return false;
      return !condition || splitNatureConditions([prediction], skill, incoming)[0]?.condition === condition;
    }
    if (obs.unit === 'percent') return percentDisplay(format)(prediction.remainingPercent) === obs.value;
    return Math.min(prediction.damage, prediction.hpMax) === obs.value;
  }
  function cellsMarkup(row, columns, incoming, obs, format) {
    if(!row) return `<div class="pcell-note">选择技能</div>`;
    if(row.status!=='estimated' || !row.predictions?.length) return `<div class="pcell-note">${html(shortReason(row.reason))}</div>`;
    const skill = skills.get(row.skillId), same = sameAsOtherColumn(skill, incoming);
    const digits = format==='round1' ? 1 : 0, display = percentDisplay(format);
    return columns.map(([key,label])=>{
      const items = row.predictions.filter(p => inColumn(p, key, columns, same));
      const cases = splitNatureConditions(items, skill, incoming);
      return `<div class="pcell-stack">${cases.map(({condition, label: conditionLabel, predictions: own}) => {
        let mark = '';
        if (obs) mark = own.some(p => observationMatch(p, obs, format, columns, same, skill, incoming)) ? ' hit' : ' miss';
        const picked = obs?.unit === 'pick' && (obs.key === `${key}:${condition}` || obs.key === key);
        const allKo = own.every(p => p.damage >= p.hpMax);
        const hpGroups = [
          ['neutral', '普通', p => p.upStat !== 'hp' && p.downStat !== 'hp'],
          ['up', '加生命', p => p.upStat === 'hp'],
          ['down', '减生命', p => p.downStat === 'hp'],
        ];
        const tail = incoming ? '' : allKo ? '<span class="ko">一击倒 · 0%</span>'
          : hpGroups.map(([hpKey, hpLabel, matches]) => {
            const entries = own.filter(matches);
            if (!entries.length) return '';
            return `<span class="rem" data-hp-nature="${hpKey}"><span>${hpLabel}</span><b>${range(entries.map(p => display(p.remainingPercent)),digits)}%</b></span>`;
          }).join('');
        return `<div class="pcell${mark}${key===same?' same':''}${picked?' picked':''}${condition==='down'?' pcell-penalty':''}" data-nature-group="${key}" data-nature-condition="${condition}" role="button" tabindex="0" aria-pressed="${picked}" title="${label}↑${conditionLabel?`、${conditionLabel}`:''}：点击匹配此组数值">${key===same && condition==='base'?'<span class="same-tag">同其他</span>':''}${conditionLabel?`<span class="condition-label">${conditionLabel}</span>`:''}<strong class="dmg">${range(own.map(p=>p.damage))}</strong>${tail}<span class="pcell-label">${label}↑</span></div>`;
      }).join('')}</div>`;
    }).join('');
  }
  function readObserved(own, format) {
    const out = {}; let invalid = false;
    for (let i=0;i<4;i++) {
      if (own.picked[i]) { out[i] = { unit: 'pick', key: own.picked[i] }; continue; }
      const obs = own.observed[i]; if (!obs) continue;
      const unit = own.observedUnits[i] === 'percent' ? 'percent' : 'damage';
      const value = unit === 'percent' ? obs.remainingPercent : obs.damage;
      if (value == null) continue;
      const valid = unit === 'percent'
        ? Number.isFinite(value) && value >= 0 && value <= 100 && (format==='round1' ? Math.round(value*10)/10===value : Number.isInteger(value))
        : Number.isInteger(value) && value >= 0;
      if (!valid) { invalid = true; out[i] = { invalid: true }; continue; }
      out[i] = { unit, value };
    }
    return { observed: out, invalid };
  }
  function evidenceTag(row, columns, incoming, obs, format) {
    const skill = skills.get(row.skillId), same = sameAsOtherColumn(skill, incoming);
    const hits = [], misses = [];
    for (const [key,label] of columns) {
      const items = row.predictions.filter(p => inColumn(p, key, columns, same));
      (items.some(p => observationMatch(p, obs, format, columns, same, skill, incoming)) ? hits : misses).push({ key, label, same: key === same });
    }
    if (!hits.length) return { text: '不符', tone: 'bad' };
    if (hits.length === 1 && !hits[0].same) return { text: `${hits[0].label}↑`, tone: 'good' };
    if (misses.length) return { text: `排除${misses.map(m=>`${m.label}↑`).join('/')}`, tone: 'cut' };
    return { text: '无区分', tone: 'flat' };
  }
  function incomingObservation(encounter, k) {
    if (encounter.incomingPicks[k]) return { unit: 'pick', key: encounter.incomingPicks[k] };
    const value = encounter.incomingDamages[k];
    return Number.isInteger(value) && value >= 0 ? { unit: 'damage', value } : null;
  }
  function renderVerdict(result, own, encounter, target, format) {
    const { observed, invalid } = readObserved(own, format);
    const levels = result.targetLevels ?? [getSession().level];
    let candidates = new Set(levels.flatMap(level => catalog.natures.map(n => `${level}:${n.id}`))), used = 0;
    const evidence = [];
    for (let i=0;i<4;i++) {
      const obs = observed[i], row = result.outgoing?.[i];
      if (!obs || obs.invalid || row?.status !== 'estimated') continue;
      const same = sameAsOtherColumn(skills.get(row.skillId), false);
      const ids = new Set(row.predictions.filter(p => observationMatch(p, obs, format, OUT_COLUMNS, same, skills.get(row.skillId), false)).map(caseId));
      candidates = new Set([...candidates].filter(id => ids.has(id))); used++;
      const what = obs.unit==='pick' ? `勾选${statNames[obs.key.split(':')[0]]}列` : obs.unit==='percent' ? `余 ${obs.value}%` : `伤害 ${obs.value}`;
      evidence.push({ label: `${row.skillName} ${what}`, ...evidenceTag(row, OUT_COLUMNS, false, obs, format) });
    }
    for (let k=0;k<INCOMING_SLOTS;k++) {
      const obs = incomingObservation(encounter, k), row = result.incomingList?.[k];
      if (!obs || row?.status !== 'estimated') continue;
      const same = sameAsOtherColumn(skills.get(row.skillId), true);
      const ids = new Set(row.predictions.filter(p => observationMatch(p, obs, format, IN_COLUMNS, same, skills.get(row.skillId), true)).map(caseId));
      candidates = new Set([...candidates].filter(id => ids.has(id))); used++;
      evidence.push({ label: `${row.skillName} ${obs.unit==='pick'?`勾选${statNames[obs.key.split(':')[0]]}列`:`掉血 ${obs.value}`}`, ...evidenceTag(row, IN_COLUMNS, true, obs, format) });
    }
    const matching = catalog.natures.filter(n => levels.some(level => candidates.has(`${level}:${n.id}`)));
    const ups = [...new Set(matching.map(n => n.upStat))];
    let big;
    if (invalid) big = `<div class="verdict-big bad">输入有误</div><p class="verdict-note">伤害填非负整数，剩余百分比按所选显示精度填写。</p>`;
    else if (!used) big = `<div class="verdict-big empty">待实测</div><p class="verdict-note">点选对得上的伤害格，或在右侧填伤害／剩余血量。</p>`;
    else if (!matching.length) big = `<div class="verdict-big bad">未找到匹配</div><p class="verdict-note">核对技能、星级、性格、特性与骰子。</p>`;
    else {
      const icon = ups.length === 1 && catalog.assets?.stats?.[ups[0]] ? `<img src="${html(catalog.assets.stats[ups[0]])}" alt=""/>` : '';
      big = `<div class="verdict-big">${icon}<b>${ups.length<=2?ups.map(s=>`${statNames[s]}<span class="up-arrow">↑</span>`).join(' / '):`${matching.length} 种性格`}</b></div>`;
      big += `<div class="nature-chips">${matching.length<=10
        ? matching.map(n=>`<span>${html(n.name)}<em>${statNames[n.downStat]}↓</em></span>`).join('')
        : ups.map(s=>`<span>${statNames[s]}↑<em>×${matching.filter(n=>n.upStat===s).length}</em></span>`).join('')}</div>`;
    }
    $('preview-verdict').innerHTML = `<div class="rail-cap"><span>判定</span><span>${html(target?.name ?? '')} · ${levelLabel(encounter.level)} 级</span></div>${big}${evidence.length?`<div class="evidence">${evidence.map(e=>`<div><i class="dot ${e.tone}"></i><span>${html(e.label)}</span><b class="${e.tone}">${html(e.text)}</b></div>`).join('')}</div>`:''}<p id="preview-comparison" class="compat-hidden">${used?`${matching.length} 种性格符合`:''}</p>`;
    $('preview-result-brief').textContent = invalid ? '输入有误，请核对实测数值' : !used ? '待录入实测' : !matching.length ? '未找到匹配' : matching.length === 1 ? `匹配性格：${matching[0].name}` : `匹配到 ${matching.length} 种性格`;
    return { matching, used, invalid };
  }
  function traitSummary(info, stateValue, skillTypes) {
    const pct = traitPanelPercents(info, stateValue, skillTypes), parts = [];
    const pair = (a, b, both, one, two) => { if (a && a === b) parts.push(`${both} +${a}%`); else { if (a) parts.push(`${one} +${a}%`); if (b) parts.push(`${two} +${b}%`); } };
    pair(pct.physicalAttack, pct.magicalAttack, '双攻', '物攻', '魔攻');
    pair(pct.physicalDefense, pct.magicalDefense, '双防', '物防', '魔防');
    const rule = info.attacker ?? info.defender;
    if (rule && ['power_percent','fixed_power','final_damage_percent','damage_reduction_percent'].includes(rule.kind)) {
      const active = (!rule.condition || stateValue.active) && (!rule.stack || (stateValue.stacks ?? 0) > 0);
      const amount = (rule.effect ?? 0) * (rule.stack ? stateValue.stacks ?? 0 : 1);
      if (active && amount) parts.push(`${rule.effectLabel} ${rule.kind==='fixed_power'?`+${amount}`:rule.kind==='damage_reduction_percent'?`-${amount}%`:`+${amount}%`}`);
    }
    return parts.join(' · ');
  }
  function renderTraits(ownSpirit, target, own) {
    const info = ownTraitInfo(ownSpirit), controls = traitControls(info);
    const skillTypes = own.skillIds.map(id => skills.get(id)?.type).filter(Boolean);
    let inner = '';
    if (info.damage === 'none') inner = '<span class="trait-none">不影响伤害</span>';
    else if (info.damage === 'unsupported') inner = '<span class="trait-none">未接入伤害结算</span>';
    else {
      if (controls.stack) {
        const min = controls.stack.min ?? 0, max = controls.stack.max ?? 999;
        const stacks = limitTraitStacks(own.trait.stacks, info);
        inner += `<span class="trait-num">${html(controls.stack.label)}<span class="trait-step"><button type="button" data-trait-step="-1" aria-label="减少层数" ${stacks <= min ? 'disabled' : ''}>−</button><input id="own-trait-stacks" type="number" min="${min}" max="${max}" step="1" value="${stacks}" aria-label="${html(controls.stack.label)}"/><button type="button" data-trait-step="1" aria-label="增加层数" ${stacks >= max ? 'disabled' : ''}>＋</button></span></span>`;
      }
      if (controls.condition) inner += `<label class="trait-cond"><input id="own-trait-active" type="checkbox" ${own.trait.active?'checked':''}/>${html(controls.condition.label)}</label>`;
      if (controls.automatic) inner += `<span class="trait-num">${html(controls.automatic.label)}<output>${skillTypes.filter(type=>controls.automatic.skillTypes.includes(type)).length}</output></span>`;
      const summary = traitSummary(info, own.trait, skillTypes);
      if (summary) inner += `<span class="trait-sum">${html(summary)}</span>`;
    }
    const card = (cls, head, spirit, body) => `<article class="trait-card ${cls}"><header>${head}</header><div class="trait-body"><div class="trait-text"><strong>${html(spirit?.traitName ?? '无特性')}</strong><p>${html(spirit?.traitDescription ?? '')}</p></div>${body}</div></article>`;
    $('trait-grid').innerHTML = card('trait-card--own','我方特性',ownSpirit,inner ? `<div class="trait-controls">${inner}</div>` : '') + card('trait-card--wild','野怪特性',target,'');
    return info;
  }
  function renderPanel(profile, ownSpirit, info, own) {
    const nature = natures.get(profile.natureId);
    const skillTypes = own.skillIds.map(id => skills.get(id)?.type).filter(Boolean);
    const pct = traitPanelPercents(info, own.trait, skillTypes);
    const stacks = traitControls(info).stack ? own.trait.stacks ?? 0 : 0;
    const head = `${html(profile.name)}当前面板 · ${(profile.awakening ?? 0) + 5}★ ${html(nature?.name ?? '普通')}${stacks?` · 特性 ${stacks} 层`:''}`;
    $('preview-panel').innerHTML = `<div class="rail-cap"><span>${head}</span></div><div class="panel-stats">${Object.entries(statNames).map(([key,label])=>`<div class="${nature?.upStat===key?'up':nature?.downStat===key?'down':''}"><span>${label}</span><b>${profile.panel?.[key] ?? '—'}${pct[key]?`<em>+${pct[key]}%</em>`:''}</b></div>`).join('')}</div>`;
  }

  function render() {
    const {session,profile,own,encounter}=state();
    const ownSpirit = spirits.get(profile.spiritId), target = spirits.get(session.targetId);
    const ownRows=learnset(profile.spiritId),enemyRows=learnset(session.targetId);
    const format = encounter.percentFormat ?? 'game0';
    for(let i=0;i<4;i++) {
      renderSkillControl(`preview-skill-${i}`,`preview-skill-meta-${i}`,`preview-condition-${i}`,ownRows,own.skillIds[i],own.skillOverrides[own.skillIds[i]],ownSpirit,profile.awakening ?? 0);
      const obs=own.observed[i], unit=own.observedUnits[i]==='percent'?'percent':'damage';
      $(`preview-observed-${i}`).value=(unit==='percent'?obs?.remainingPercent:obs?.damage) ?? '';
      $(`preview-observed-${i}`).placeholder='';
      $(`preview-observed-unit-${i}`).textContent=unit==='percent'?'%':'伤害';
    }
    for(let k=0;k<INCOMING_SLOTS;k++) {
      renderSkillControl(`preview-incoming-skill-${k}`,`preview-incoming-meta-${k}`,`preview-incoming-condition-${k}`,enemyRows,encounter.incomingSkillIds[k],encounter.incomingOverridesList[k],target,0);
      $(`preview-incoming-damage-${k}`).value=encounter.incomingDamages[k] ?? '';
      $(`preview-incoming-damage-${k}`).placeholder='';
      $(`preview-incoming-damage-${k}`).classList.toggle('picked-elsewhere', Boolean(encounter.incomingPicks[k]));
    }
    for(const [side,holder] of [['own',own],['target',encounter]]) {
      const id = holder.diceId === 'unresolved-all-stats-plus-30' ? 'none' : holder.diceId ?? 'none';
      $(`${side}-dice`).value=id;
      $(`${side}-dice-custom`).hidden=holder.diceId!=='custom';
      for(const [key,,fallback] of diceFields) $(`${side}-dice-${key}`).value=holder.diceEffects?.[key] ?? fallback;
    }
    $('preview-percent-format').value=format;
    $('target-shiny').checked=encounter.shiny;
    for(const picker of pickers) picker.refresh();
    const input={targetId:session.targetId,level:session.level,profile,skillIds:own.skillIds,skillOverrides:own.skillOverrides,
      incomingSkillIds:encounter.incomingSkillIds,incomingOverridesList:encounter.incomingOverridesList,ownTrait:own.trait,targetShiny:encounter.shiny,
      ownDiceIds:own.diceId==='custom'?[]:[own.diceId ?? 'none'],targetDiceIds:encounter.diceId==='custom'?[]:[encounter.diceId ?? 'none'],
      ownDiceEffects:own.diceId==='custom'?(own.diceEffects ?? {}):{},targetDiceEffects:encounter.diceId==='custom'?(encounter.diceEffects ?? {}):{}};
    try {currentPreview=previewMatchup(input,catalog,diceCatalog,traitCatalog);} catch(error) {currentPreview={outgoing:[],incoming:null,incomingList:[],warnings:[error.message]};}
    const { observed } = readObserved(own, format);
    for(let i=0;i<4;i++) {
      const obs = observed[i]?.invalid ? null : observed[i];
      $(`preview-cells-${i}`).innerHTML=cellsMarkup(own.skillIds[i]?currentPreview.outgoing?.[i]:null,OUT_COLUMNS,false,obs,format);
      $(`preview-observed-${i}`).classList.toggle('filled',Boolean(obs) && obs.unit!=='pick');
      $(`preview-observed-${i}`).classList.toggle('invalid',Boolean(observed[i]?.invalid));
    }
    for(let k=0;k<INCOMING_SLOTS;k++) {
      const obs = incomingObservation(encounter, k);
      $(`preview-incoming-cells-${k}`).innerHTML=cellsMarkup(encounter.incomingSkillIds[k]?currentPreview.incomingList?.[k]:null,IN_COLUMNS,true,obs,format);
      $(`preview-incoming-damage-${k}`).classList.toggle('filled',obs?.unit==='damage');
    }
    const targetHp = currentPreview.targetHpByNature;
    $('target-hp-range').innerHTML = [['neutral','奇遇普通'],['up','奇遇加生命'],['down','奇遇减生命']].map(([key,label]) => `<div data-hp-nature="${key}"><span>${label}</span><b>${typeof targetHp?.[key] === 'object' ? range([targetHp[key].min,targetHp[key].max]) : targetHp?.[key] ?? '—'}</b></div>`).join('');
    $('preview-target-label').textContent=`${profile.name} → ${target?.name ?? '野生目标'} ${levelLabel(session.level)} 级 · 每招满血单发 · 余血按奇遇血量`;
    $('preview-incoming-title').textContent=`${target?.name ?? '敌方'} → ${profile.name}`;
    const info = renderTraits(ownSpirit, target, own);
    renderPanel(profile, ownSpirit, info, own);
    renderVerdict(currentPreview, own, encounter, target, format);
  }
  return {render,getResult:()=>currentPreview};
}
