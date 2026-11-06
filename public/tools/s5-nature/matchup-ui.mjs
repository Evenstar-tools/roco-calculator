import { createPicker } from './picker.mjs';
import { previewMatchup, canPreviewBasePower, defaultSkillHitCount } from './matchup-preview.mjs';
import { traitControls, traitPanelPercents } from './own-trait.mjs';
import { formatGamePercent } from './hp-inverse.mjs';
import { getOwnSkillIds } from './own-presets.mjs';

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
  ['speedMultiplier','速度倍率',1,10,0.01],
];
// 分组只用于展示，实测始终对完整性格集合求交集。
const OUT_COLUMNS = [['hp','生命'],['physicalDefense','物防'],['magicalDefense','魔防']];
const IN_COLUMNS = [['physicalAttack','物攻'],['magicalAttack','魔攻'],['other','其他增益']];
export const INCOMING_SLOTS = 2;
const number = input => input.value.trim() === '' ? null : Number(input.value);
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const powerNumber = value => Number.isFinite(value) ? String(Number(value.toFixed(6))) : '—';
const diceDescription = row => [19,33].includes(row?.gameEffectId)
  ? `双攻、双防、速度 +${row.gameEffectId===19?30:100}%（不含生命）` : row?.description ?? '';

export function skillPreviewNotices(row, skill) {
  if (row?.status !== 'estimated') return [];
  const incoming = row.direction === 'incoming';
  const parts = [incoming ? '野怪攻击按模型估算' : '野怪防御按模型估算'];
  const type = row.typeInteraction;
  if (type?.formulaVerified === false && Number.isFinite(type.correctionMultiplier)) {
    parts[0] = incoming ? '攻击模型' : '防御模型';
    parts.push(type.baseMultiplier === 1
      ? '双系抵消按等倍估算'
      : `${incoming ? '钝化' : '极化'}修正×${powerNumber(type.correctionMultiplier)}（估算）`);
  }
  const notices = [parts.join(' · ')];
  // A buff callback alone does not establish that this hit consumed burst.
  // Keep the existing explicit power input; never silently add 30.
  if (skill?.name === '天旋地转' && row.powerMode === 'auto') {
    notices.push('迸发不自动识别；已触发时请在“条件”核对本次显示威力。');
  }
  return notices;
}

export function validatePreviewSettings(session) {
  const fail = () => { throw new Error('配招判断的配置或实测格式无效，请核对导入文件。'); };
  const overrides = value => {
    if (!object(value)) fail();
    if (Object.hasOwn(value, 'displayedPower') && Object.hasOwn(value, 'effectivePower')) fail();
    for (const [key,v] of Object.entries(value)) {
      if (!['displayedPower','effectivePower','powerMultiplier','hitCount'].includes(key) || !Number.isFinite(v) || v < 0 || v > 100000) fail();
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
    const statKeys = ['hp','physicalAttack','magicalAttack','physicalDefense','magicalDefense','speed','other'];
    const validPick = value => typeof value === 'string' && statKeys.includes(value.split(':')[0]) && /^[^:]+(?::(?:base|down)(?::(?:neutral|up|down))?)?$/.test(value);
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
    if(holder.diceId!==undefined && !['none','manual-power-plus-40','custom','unresolved-all-stats-plus-30'].includes(holder.diceId)
      && !(typeof holder.diceId === 'string' && /^game-dice-effect-(?:[1-9]|[1-3][0-9]|40)$/.test(holder.diceId))) fail();
    if(holder.panelIncludesDice!==undefined && typeof holder.panelIncludesDice!=='boolean') fail();
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
// Picks are visual bookmarks only, including selections saved by older versions.
const inColumn = (p, key, columns, same) => key === 'other'
  ? !columns.some(([stat]) => stat === p.upStat)
  : p.upStat === key || (key === same && !columns.some(([stat]) => stat === p.upStat));
export function observationMatch(prediction, obs, format = 'game0') {
  if (!obs) return true;
  return (obs.damage == null || prediction.damage === obs.damage)
    && (obs.remainingPercent == null || percentDisplay(format)(prediction.remainingPercent) === obs.remainingPercent);
}
export function readOutgoingObservations(own, format = 'game0') {
  const observed = {}; let invalid = false;
  for (let i = 0; i < 4; i++) {
    const obs = own.observed?.[i];
    if (!obs || (obs.damage == null && obs.remainingPercent == null)) continue;
    const { damage, remainingPercent } = obs;
    const valid = (damage == null || (Number.isInteger(damage) && damage >= 0))
      && (remainingPercent == null || (Number.isFinite(remainingPercent) && remainingPercent >= 0 && remainingPercent <= 100
        && (format === 'round1' ? Math.round(remainingPercent * 10) / 10 === remainingPercent : Number.isInteger(remainingPercent))));
    if (!valid) { invalid = true; observed[i] = { invalid: true }; continue; }
    // Zero remaining health does not distinguish nature, regardless of entered damage.
    if (remainingPercent === 0) continue;
    observed[i] = { damage, remainingPercent };
  }
  return { observed, invalid };
}
export function natureAxisState(natures, stat) {
  if (!natures.length) return '—';
  const effects = new Set(natures.map(n => n.upStat === stat ? '加' : n.downStat === stat ? '减' : '不变'));
  return effects.size === 1 ? [...effects][0] : !effects.has('加') ? '不加' : '—';
}
const levelLabel = level => level === 'all' ? '41–43' : level;
const caseId = prediction => `${prediction.targetLevel}:${prediction.natureId}`;

function shortReason(reason='') {
  if (/没有明确的物理／魔法/.test(reason)) return '变化技能，无直接伤害';
  if (/骰子|极化|钝化/.test(reason)) return reason;
  if (/种族|资料/.test(reason)) return '该精灵资料不足';
  return reason || '无法计算';
}

// 当次敌方招式可超出静态学习面；追加攻击招式仅供记录，不改变默认选技或学习面。
export function incomingSkillOptions(catalog, targetId) {
  const skills = new Map(catalog.skills.map(skill => [skill.id, skill]));
  const native = (catalog.learnsets.find(row => row.spiritId === targetId)?.skillIds ?? []).map(id => skills.get(id));
  const attacks = catalog.skills.filter(skill => ['physical', 'magical'].includes(skill.category));
  const seen = new Set();
  return [...native, ...attacks].filter(skill => {
    if (!skill || seen.has(skill.id)) return false;
    seen.add(skill.id);
    return true;
  });
}

// 我方档案保存四技能、骰子与特性层数；敌方技能与骰子属于本场遭遇。
export function createMatchupUi({ catalog, diceCatalog, traitCatalog, getSession, getProfile, commit }) {
  const skills = new Map(catalog.skills.map(s => [s.id,s]));
  const spirits = new Map(catalog.spirits.map(s => [s.id,s]));
  const natures = new Map(catalog.natures.map(n => [n.id,n]));
  const pickers = [];
  let currentPreview;
  const learnset = id => (catalog.learnsets.find(row => row.spiritId === id)?.skillIds ?? []).map(id => skills.get(id)).filter(Boolean);
  const ownLearnset = id => getOwnSkillIds(catalog, id).map(id => skills.get(id)).filter(Boolean);
  const automatic = canPreviewBasePower;
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
    const rows = learnset(targetId).filter(automatic);
    const neutral = skill => typeFactor(skill, ownSpirit) === 1;
    const pick = kind => rows.filter(skill => skill.category === kind)
      .sort((a,b) => Number(neutral(b)) - Number(neutral(a)) || (b.basePower ?? 0) - (a.basePower ?? 0))[0]?.id ?? '';
    return [pick('physical'), pick('magical')];
  }
  function state() {
    const session = getSession(), profile = getProfile();
    const available = ownLearnset(profile.spiritId);
    if (!object(profile.preview)) profile.preview = {};
    const own = profile.preview;
    if (!Array.isArray(own.skillIds) || own.speciesId !== profile.spiritId) {
      const preferred = profile.name === '迪莫' ? 'magical' : 'physical';
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
    const enemyRows = incomingSkillOptions(catalog, session.targetId);
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
    return `<div id="${prefix}-legacyPower" class="preview-legacy-power" hidden><span id="${prefix}-legacyPower-label"></span><button id="${prefix}-resetPower" type="button">恢复自动</button></div><details class="preview-condition"><summary>条件</summary><div class="preview-conditions-grid"><label>额外威力倍率<input id="${prefix}-powerMultiplier" type="number" min="0.01" max="100" step="0.01" placeholder="1"/></label><label>命中次数<input id="${prefix}-hitCount" type="number" min="1" max="100" step="1" placeholder="1"/></label><label>显示威力<input id="${prefix}-displayedPower" type="number" min="0" max="100000" step="any" placeholder="自动"/></label></div><p>留空自动。手填显示威力时不重复叠加攻防、威力骰子；已包含的额外倍率填 1。</p><details class="preview-final-power"><summary>已知最终威力</summary><label>最终威力<input id="${prefix}-effectivePower" type="number" min="0" max="100000" step="any" placeholder="未填写"/></label><p>仅填已知且包含系别、极化/钝化的威力；不含面板攻防。与显示威力互斥，原存档沿用此口径。</p></details></details>`;
  }
  const heading = (columns, last) => `<div class="pth pth-skill">技能</div>${columns.map(([key,label])=>`<div class="pth">${catalog.assets?.stats?.[key]?`<img src="${html(catalog.assets.stats[key])}" alt=""/>`:''}${label}${key==='other'?'':'<span class="up-arrow">↑</span>'}</div>`).join('')}<div class="pth">${last}</div>`;
  $('preview-outgoing').innerHTML = heading(OUT_COLUMNS,'实测') + Array.from({length:4},(_,i) =>
    `<div class="prow" data-preview-row="${i}">${skillControl(`preview-skill-${i}`,`preview-skill-picker-${i}`,`preview-skill-meta-${i}`,`preview-condition-${i}`,i+1)}<div class="pcells" id="preview-cells-${i}"></div><div class="pobservations"><label class="pobs"><span>伤害</span><input id="preview-observed-${i}" inputmode="numeric" autocomplete="off" aria-label="技能 ${i+1} 实测伤害"/></label><label class="pobs"><span>剩余 %</span><input id="preview-remaining-${i}" inputmode="decimal" autocomplete="off" aria-label="技能 ${i+1} 实测剩余百分比"/></label></div></div>`).join('');
  $('preview-incoming').innerHTML = heading(IN_COLUMNS,'我方掉血') + Array.from({length:INCOMING_SLOTS},(_,k) =>
    `<div class="prow" data-incoming-row="${k}">${skillControl(`preview-incoming-skill-${k}`,`preview-incoming-picker-${k}`,`preview-incoming-meta-${k}`,`preview-incoming-condition-${k}`,'敌')}<div class="pcells" id="preview-incoming-cells-${k}"></div><div class="pobs"><input id="preview-incoming-damage-${k}" type="number" min="0" max="1000000" step="1" inputmode="numeric" aria-label="敌方技能 ${k+1} 我方掉血"/><span class="unit-label">HP</span></div></div>`).join('');

  function configureDice(side) {
    const records = (diceCatalog?.dice ?? []).filter(row => Number.isInteger(row.gameEffectId));
    const group = (label, rows) => rows.length ? `<optgroup label="${label}">${rows.map(row=>`<option value="${html(row.id)}">${html(row.name)} · ${html(diceDescription(row))}</option>`).join('')}</optgroup>` : '';
    $(`${side}-dice`).innerHTML = '<option value="none">无加成</option>'
      + group('属性与威力 · 试算', records.filter(row=>row.supported))
      + group('系别关系 · 待校验', records.filter(row=>row.typeCoefficient))
      + group('回合与特殊效果 · 仅资料', records.filter(row=>!row.supported&&!row.typeCoefficient))
      + '<option value="custom">自填合计加成</option>'
      + (diceCatalog?.dice ?? []).filter(row=>['manual-power-plus-40','unresolved-all-stats-plus-30'].includes(row.id)).map(row=>`<option value="${row.id}" hidden>${html(row.name)}（旧配置）</option>`).join('');
    $(`${side}-dice-custom`).innerHTML = '<p>倍率 1.30 即 +30%；留空不额外加成。面板已含属性时勾选下方标记。</p><div class="dice-values">' + diceFields.map(([key,label,value,max,step])=>`<label>${label}<input id="${side}-dice-${key}" type="number" placeholder="${value}" min="${key === 'skillPowerAdd' ? -10000 : 0.001}" max="${max}" step="${step}" /></label>`).join('') + '</div>';
    $(`${side}-dice`).addEventListener('change',()=>commit(()=> {
      const {own,encounter}=state(); (side==='own'?own:encounter).diceId=$(`${side}-dice`).value;
    }));
    for (const [key] of diceFields) $(`${side}-dice-${key}`).addEventListener('change',()=>commit(()=>{
      const {own,encounter}=state(), holder=side==='own'?own:encounter;
      holder.diceEffects={...(holder.diceEffects ?? {})};
      const value=number($(`${side}-dice-${key}`));
      if(value===null) delete holder.diceEffects[key]; else holder.diceEffects[key]=value;
    }));
  }
  configureDice('own'); configureDice('target');
  $('own-dice-panel-included').addEventListener('change',()=>commit(()=>{
    const {own,profile}=state();
    own.panelIncludesDice=profile.panelSource==='manual' && $('own-dice-panel-included').checked;
  }));

  function configureSkill(index, incoming) {
    const id = incoming ? `preview-incoming-skill-${index}` : `preview-skill-${index}`;
    const anchor = incoming ? `preview-incoming-picker-${index}` : `preview-skill-picker-${index}`;
    pickers.push(createPicker({anchor,trigger:`${id}-input`,source:id,label:incoming?`敌方技能 ${index+1}`:`我方技能 ${index+1}`,rows:()=>{
      const {profile,session}=state(); return incoming ? incomingSkillOptions(catalog, session.targetId) : ownLearnset(profile.spiritId);
    },image:s=>s.iconUrl ?? catalog.assets?.elements?.[s.type],describe:s=>`${s.type} · ${category(s)} · 威力 ${s.basePower ?? '—'}`}));
    $(id).addEventListener('change',()=>commit(()=>{
      const {own,encounter}=state();
      if(incoming) {encounter.incomingSkillIds[index]=$(id).value;encounter.incomingOverridesList[index]={};encounter.incomingDamages[index]=null;encounter.incomingPicks[index]=null;}
      else {own.skillIds[index]=$(id).value;delete own.observed[index];delete own.picked[index];}
    }));
    const prefix=incoming?`preview-incoming-condition-${index}`:`preview-condition-${index}`;
    for (const key of ['powerMultiplier','hitCount','displayedPower','effectivePower']) $(`${prefix}-${key}`).addEventListener('change',()=>commit(()=>{
      const {own,encounter}=state();
      const holder=incoming?encounter.incomingOverridesList[index]:(own.skillOverrides[own.skillIds[index]]??={});
      const value=number($(`${prefix}-${key}`)); if(value===null) delete holder[key]; else holder[key]=value;
      if(value!==null && key==='displayedPower') delete holder.effectivePower;
      if(value!==null && key==='effectivePower') delete holder.displayedPower;
    }));
    $(`${prefix}-resetPower`).addEventListener('click',()=>commit(()=>{
      const {own,encounter}=state();
      const holder=incoming?encounter.incomingOverridesList[index]:own.skillOverrides[own.skillIds[index]];
      if (holder) { delete holder.effectivePower; delete holder.displayedPower; }
    }));
  }
  for(let i=0;i<4;i++) configureSkill(i,false);
  for(let k=0;k<INCOMING_SLOTS;k++) configureSkill(k,true);
  for(let i=0;i<4;i++) {
    for (const [prefix,key] of [['preview-observed','damage'],['preview-remaining','remainingPercent']]) {
      $(`${prefix}-${i}`).addEventListener('change',()=>commit(()=>{
        const {own}=state(), value=number($(`${prefix}-${i}`));
        const obs=own.observed[i] ??= {};
        if(value===null) delete obs[key]; else obs[key]=value;
        if(!Object.keys(obs).length) delete own.observed[i];
      }));
    }
  }
  for(let k=0;k<INCOMING_SLOTS;k++) $(`preview-incoming-damage-${k}`).addEventListener('change',()=>commit(()=>{const {encounter}=state(); encounter.incomingDamages[k]=number($(`preview-incoming-damage-${k}`));}));
  // 点选只高亮，再点一次取消；实测记录独立保存。
  function togglePick(event) {
    const cell = event.target.closest('.pcell[data-nature-group]'); if (!cell) return;
    const row = cell.closest('[data-preview-row],[data-incoming-row]'); if (!row) return;
    const key = `${cell.dataset.natureGroup}:${cell.dataset.natureCondition}`;
    const wasPicked = cell.getAttribute('aria-pressed') === 'true';
    commit(()=>{
      const {own,encounter}=state();
      if (row.dataset.previewRow !== undefined) {
        const i = Number(row.dataset.previewRow);
        if (wasPicked) delete own.picked[i]; else own.picked[i] = key;
      } else {
        const k = Number(row.dataset.incomingRow);
        encounter.incomingPicks[k] = wasPicked ? null : key;
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

  function renderSkillControl(id, metaId, prefix, rows, skillId, overrides) {
    if (!object(overrides)) overrides={};
    $(id).innerHTML=skillOptions(rows); $(id).value=skillId ?? '';
    for(const key of ['powerMultiplier','hitCount','displayedPower','effectivePower']) $(`${prefix}-${key}`).value=overrides[key] ?? '';
    const legacy = Object.hasOwn(overrides, 'effectivePower');
    $(`${prefix}-legacyPower`).hidden = !legacy;
    $(`${prefix}-legacyPower-label`).textContent = legacy ? `最终威力 ${powerNumber(overrides.effectivePower)} · 已含系别与觉醒` : '';
    $(`${prefix}-displayedPower`).placeholder = legacy ? '最终威力生效中' : '自动';
    const skill=skills.get(skillId);
    if(!skill) { $(metaId).innerHTML='<span class="muted">未选技能</span>'; $(metaId).title=''; return; }
    $(metaId).innerHTML=`${html(skill.type)} · ${category(skill)} · 显示威力 —`;
    $(metaId).title=skill.description ?? '';
    $(`${prefix}-hitCount`).placeholder = String(legacy ? 1 : defaultSkillHitCount(skill));
  }
  function renderDisplayedPower(metaId, row) {
    const skill = skills.get(row?.skillId);
    if (!skill) return;
    const mode = row.powerMode === 'displayed' ? '（手填）' : '';
    $(metaId).innerHTML = `${html(skill.type)} · ${category(skill)} · 显示威力 ${powerNumber(row.displayedPower)}${mode}${row.hitCount > 1 ? ` · ${row.hitCount}连击` : ''}`
      + skillPreviewNotices(row, skill).map(note=>`<span class="preview-model-note">${html(note)}</span>`).join('');
  }
  function cellsMarkup(row, columns, incoming, obs, format, pickedKey) {
    if(!row) return `<div class="pcell-note">选择技能</div>`;
    if(row.status!=='estimated' || !row.predictions?.length) return `<div class="pcell-note">${html(shortReason(row.reason))}</div>`;
    const skill = skills.get(row.skillId), same = sameAsOtherColumn(skill, incoming);
    if (!incoming && pickedKey?.split(':')[0] === 'other') pickedKey = pickedKey.replace('other', same);
    const hits = obs ? row.predictions.filter(p => observationMatch(p, obs, format)) : [];
    if (!incoming && hits.length && hits.every(p => p.damage >= p.hpMax)) obs = null;
    const digits = format==='round1' ? 1 : 0, display = percentDisplay(format);
    return columns.map(([key,label])=>{
      const items = row.predictions.filter(p => inColumn(p, key, columns, same));
      const cases = splitNatureConditions(items, skill, incoming);
      return `<div class="pcell-stack">${cases.map(({condition, label: conditionLabel, predictions: own}) => {
        let mark = '';
        if (obs) mark = own.some(p => observationMatch(p, obs, format)) ? ' hit' : ' miss';
        const picked = pickedKey?.split(':').slice(0, 2).join(':') === `${key}:${condition}` || pickedKey === key;
        const allKo = own.every(p => p.damage >= p.hpMax);
        const hpGroups = [
          ['neutral', '剩余', p => p.upStat !== 'hp' && p.downStat !== 'hp'],
          ['up', '剩余', p => p.upStat === 'hp'],
          ['down', '减生命', p => p.downStat === 'hp'],
        ];
        const tail = incoming ? '' : allKo ? '<span class="ko">0%</span>'
          : hpGroups.map(([hpKey, hpLabel, matches]) => {
            const entries = own.filter(matches);
            if (!entries.length) return '';
            return `<span class="rem" data-hp-nature="${hpKey}"><span>${hpLabel}</span><b>${range(entries.map(p => display(p.remainingPercent)),digits)}%</b></span>`;
          }).join('');
        return `<div class="pcell${mark}${picked?' picked':''}${condition==='down'?' pcell-penalty':''}" data-nature-group="${key}" data-nature-condition="${condition}" role="button" tabindex="0" aria-pressed="${picked}">${conditionLabel?`<span class="condition-label">${conditionLabel}</span>`:''}<strong class="dmg">${range(own.map(p=>p.damage))}</strong>${tail}<span class="pcell-label">${label}${key==='other'?'':'↑'}</span></div>`;
      }).join('')}</div>`;
    }).join('');
  }
  function evidenceTag(row, columns, incoming, obs, format) {
    const skill = skills.get(row.skillId), same = sameAsOtherColumn(skill, incoming);
    const hits = [], misses = [];
    for (const [key,label] of columns) {
      const items = row.predictions.filter(p => inColumn(p, key, columns, same));
      (items.some(p => observationMatch(p, obs, format)) ? hits : misses).push({ key, label, same: key === same });
    }
    if (!hits.length) return { text: '模型未吻合', tone: 'bad' };
    if (hits.length === 1 && !hits[0].same) return { text: `${hits[0].label}${hits[0].key==='other'?'':'↑'}（参考）`, tone: 'good' };
    if (misses.length) return { text: `${misses.map(m=>`${m.label}${m.key==='other'?'':'↑'}`).join('/')}未吻合`, tone: 'cut' };
    return { text: '无区分', tone: 'flat' };
  }
  function incomingObservation(encounter, k) {
    const value = encounter.incomingDamages[k];
    return Number.isInteger(value) && value >= 0 ? { damage: value } : null;
  }
  function renderVerdict(result, own, encounter, target, format) {
    const { observed, invalid } = readOutgoingObservations(own, format);
    const levels = result.targetLevels ?? [getSession().level];
    let candidates = new Set(levels.flatMap(level => catalog.natures.map(n => `${level}:${n.id}`))), used = 0;
    const evidence = [];
    const addEvidence = (row, obs, incoming) => {
      if (!obs || obs.invalid || row?.status !== 'estimated') return;
      const hits = row.predictions.filter(p => observationMatch(p, obs, format));
      // Outgoing knockout observations do not distinguish the target's HP.
      // Incoming displayed damage remains an attack-stat observation even when
      // the hit exceeds our own maximum HP (for example, the recorded 660).
      if (!incoming && hits.length && hits.every(p => p.damage >= p.hpMax)) return;
      const ids = new Set(hits.map(caseId));
      candidates = new Set([...candidates].filter(id => ids.has(id))); used++;
      const values = [obs.damage == null ? '' : `${incoming ? '掉血' : '伤害'} ${obs.damage}`,
        obs.remainingPercent == null ? '' : `余 ${obs.remainingPercent}%`].filter(Boolean).join(' · ');
      evidence.push({ label: `${row.skillName} ${values}`, ...evidenceTag(row, incoming ? IN_COLUMNS : OUT_COLUMNS, incoming, obs, format) });
    };
    for (let i=0;i<4;i++) addEvidence(result.outgoing?.[i], observed[i], false);
    for (let k=0;k<INCOMING_SLOTS;k++) addEvidence(result.incomingList?.[k], incomingObservation(encounter,k), true);
    const matching = catalog.natures.filter(n => levels.some(level => candidates.has(`${level}:${n.id}`)));
    const ready = !invalid && used > 0 && matching.length > 0;
    const summary = invalid ? '输入有误' : !used ? '待实测' : !matching.length ? '模型未吻合' : `${matching.length} 个模型候选`;
    const axes = ['hp','physicalDefense','magicalDefense','physicalAttack','magicalAttack'].map(key => {
      const value = ready ? natureAxisState(matching,key) : '—';
      return `<div class="nature-axis" data-stat="${key}"><span class="axis-name">${catalog.assets?.stats?.[key]?`<img src="${html(catalog.assets.stats[key])}" alt=""/>`:''}${statNames[key]}</span><b class="${value==='加'?'up':value==='减'?'down':value==='—'?'empty':''}">${value}</b></div>`;
    }).join('');
    const chips = ready ? `<details class="nature-details" ${matching.length <= 5 ? 'open' : ''}><summary>模型候选 · ${matching.length}</summary><div class="nature-chips">${matching.map(n=>`<span>${html(n.name)}<em>${statNames[n.upStat]}↑ ${statNames[n.downStat]}↓</em></span>`).join('')}</div></details>` : '';
    $('preview-verdict').innerHTML = `<div class="rail-cap"><span>性格计算</span><span>${html(target?.name ?? '')} · ${levelLabel(encounter.level)} 级</span></div><div class="verdict-big${invalid || (used && !matching.length) ? ' bad' : !used ? ' empty' : ''}">${summary}</div><p id="preview-comparison" class="verdict-note">经验模型，未吻合不能排除性格</p><div class="nature-axes">${axes}</div>${chips}${evidence.length?`<div class="evidence">${evidence.map(e=>`<div><i class="dot ${e.tone}"></i><span>${html(e.label)}</span><b class="${e.tone}">${html(e.text)}</b></div>`).join('')}</div>`:''}`;
    $('preview-result-brief').textContent = ready && matching.length === 1 ? `${matching[0].name}（参考）` : summary;
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
    const head = `${html(profile.name)}${own.panelIncludesDice?'战斗':'计算'}面板 · ${(profile.awakening ?? 0) + 5}★ ${html(nature?.name ?? '普通')}${stacks?` · 特性 ${stacks} 层`:''}`;
    const panel = currentPreview?.ownPanel ?? profile.panel;
    $('preview-panel').innerHTML = `<div class="rail-cap"><span>${head}</span></div><div class="panel-stats">${Object.entries(statNames).map(([key,label])=>`<div class="${nature?.upStat===key?'up':nature?.downStat===key?'down':''}"><span>${label}</span><b>${powerNumber(panel?.[key])}${pct[key]?`<em>+${pct[key]}%</em>`:''}</b></div>`).join('')}</div>`;
  }

  function render() {
    const {session,profile,own,encounter}=state();
    const ownSpirit = spirits.get(profile.spiritId), target = spirits.get(session.targetId);
    const ownRows=ownLearnset(profile.spiritId),enemyRows=incomingSkillOptions(catalog, session.targetId);
    const format = encounter.percentFormat ?? 'game0';
    for(let i=0;i<4;i++) {
      renderSkillControl(`preview-skill-${i}`,`preview-skill-meta-${i}`,`preview-condition-${i}`,ownRows,own.skillIds[i],own.skillOverrides[own.skillIds[i]]);
      const obs=own.observed[i];
      $(`preview-observed-${i}`).value=obs?.damage ?? '';
      $(`preview-remaining-${i}`).value=obs?.remainingPercent ?? '';
    }
    for(let k=0;k<INCOMING_SLOTS;k++) {
      renderSkillControl(`preview-incoming-skill-${k}`,`preview-incoming-meta-${k}`,`preview-incoming-condition-${k}`,enemyRows,encounter.incomingSkillIds[k],encounter.incomingOverridesList[k]);
      $(`preview-incoming-damage-${k}`).value=encounter.incomingDamages[k] ?? '';
      $(`preview-incoming-damage-${k}`).placeholder='';
    }
    for(const [side,holder] of [['own',own],['target',encounter]]) {
      const id = holder.diceId ?? 'none';
      $(`${side}-dice`).value=id;
      $(`${side}-dice-custom`).hidden=holder.diceId!=='custom';
      for(const [key] of diceFields) $(`${side}-dice-${key}`).value=holder.diceEffects?.[key] ?? '';
      const row=diceCatalog?.dice?.find(item=>item.id===id);
      const note=$(`${side}-dice-note`);
      note.hidden=id==='none';
      note.textContent=id==='custom'?'按手填合计试算；组合与取整仍需实测。'
        : row ? `${diceDescription(row)} ${row.typeCoefficient?'与双系、极化/钝化的组合待校验，非中性关系暂停自动试算。':row.supported?'按原配置试算，取整与叠加待实测。':row.unsupportedReason ?? '当前仅展示资料，未接入结算。'}`
          : '骰子资料缺失，请重新选择。';
    }
    const includedAllowed=profile.panelSource==='manual';
    if(!includedAllowed) own.panelIncludesDice=false;
    $('own-dice-panel-included').closest('.dice-panel-source').hidden=(own.diceId??'none')==='none' && !own.panelIncludesDice;
    $('own-dice-panel-included').checked=own.panelIncludesDice===true;
    $('own-dice-panel-included').disabled=!includedAllowed;
    $('own-dice-panel-note').textContent=includedAllowed?'已包含时不再叠加骰子属性；技能威力加值仍单独处理。':'配置面板不含骰子；手填面板后可标记已包含。';
    $('preview-percent-format').value=format;
    $('target-shiny').checked=encounter.shiny;
    for(const picker of pickers) picker.refresh();
    const input={targetId:session.targetId,level:session.level,profile:{...profile,panelIncludesDice:own.panelIncludesDice===true},skillIds:own.skillIds,skillOverrides:own.skillOverrides,
      incomingSkillIds:encounter.incomingSkillIds,incomingOverridesList:encounter.incomingOverridesList,ownTrait:own.trait,targetShiny:encounter.shiny,
      ownDiceIds:own.diceId==='custom'?[]:[own.diceId ?? 'none'],targetDiceIds:encounter.diceId==='custom'?[]:[encounter.diceId ?? 'none'],
      ownDiceEffects:own.diceId==='custom'?(own.diceEffects ?? {}):{},targetDiceEffects:encounter.diceId==='custom'?(encounter.diceEffects ?? {}):{}};
    try {currentPreview=previewMatchup(input,catalog,diceCatalog,traitCatalog);} catch(error) {currentPreview={outgoing:[],incoming:null,incomingList:[],warnings:[error.message]};}
    const { observed } = readOutgoingObservations(own, format);
    for(let i=0;i<4;i++) {
      const obs = observed[i]?.invalid ? null : observed[i];
      renderDisplayedPower(`preview-skill-meta-${i}`, currentPreview.outgoing?.[i]);
      $(`preview-cells-${i}`).innerHTML=cellsMarkup(own.skillIds[i]?currentPreview.outgoing?.[i]:null,OUT_COLUMNS,false,obs,format,own.picked[i]);
      for (const prefix of ['preview-observed','preview-remaining']) {
        const field = $(`${prefix}-${i}`);
        field.classList.toggle('filled',field.value !== '');
        field.classList.toggle('invalid',Boolean(observed[i]?.invalid));
      }
    }
    for(let k=0;k<INCOMING_SLOTS;k++) {
      const obs = incomingObservation(encounter, k);
      renderDisplayedPower(`preview-incoming-meta-${k}`, currentPreview.incomingList?.[k]);
      $(`preview-incoming-cells-${k}`).innerHTML=cellsMarkup(encounter.incomingSkillIds[k]?currentPreview.incomingList?.[k]:null,IN_COLUMNS,true,obs,format,encounter.incomingPicks[k]);
      $(`preview-incoming-damage-${k}`).classList.toggle('filled',obs?.damage != null);
    }
    const targetHp = currentPreview.targetHpByNature;
    $('target-hp-range').innerHTML = [['neutral','奇遇普通'],['up','奇遇加生命'],['down','奇遇减生命']].map(([key,label]) => `<div data-hp-nature="${key}"><span>${label}</span><b>${typeof targetHp?.[key] === 'object' ? range([targetHp[key].min,targetHp[key].max]) : targetHp?.[key] ?? '—'}</b></div>`).join('');
    $('preview-target-label').textContent=`${profile.name} → ${target?.name ?? '野生目标'} ${levelLabel(session.level)} 级 · 满血单发`;
    $('preview-incoming-title').textContent=`${target?.name ?? '敌方'} → ${profile.name}`;
    const info = renderTraits(ownSpirit, target, own);
    renderPanel(profile, ownSpirit, info, own);
    renderVerdict(currentPreview, own, encounter, target, format);
  }
  return {render,getResult:()=>currentPreview};
}
