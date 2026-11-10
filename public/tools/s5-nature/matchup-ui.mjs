import { createPicker } from './picker.mjs';
import { previewMatchup, canPreviewBasePower, defaultSkillHitCount, firstActionPowerBonus } from './matchup-preview.mjs';
import { traitControls, traitPanelPercents } from './own-trait.mjs';
import { formatGamePercent } from './hp-inverse.mjs';
import { compareObservedHp, intersectNatureCases } from './measurement-comparison.mjs';
import { getOwnSkillIds } from './own-presets.mjs';
import { WILD_DEFENSE_MODEL } from './wild-defense.mjs';
import { resolveWildTarget } from './wild-forms.mjs';

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
// 分组只用于展示，实测始终对完整性格集合求交集。
const OUT_COLUMNS = [['hp','生命'],['physicalDefense','物防'],['magicalDefense','魔防']];
export const INCOMING_SLOTS = 2;
const number = input => input.value.trim() === '' ? null : Number(input.value);
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const powerNumber = value => Number.isFinite(value) ? String(Number(value.toFixed(6))) : '—';
const diceDescription = row => [19,33].includes(row?.gameEffectId)
  ? `双攻、双防、速度 +${row.gameEffectId===19?30:100}%（不含生命）` : row?.description ?? '';
const validDiceId = value => ['none','manual-power-plus-40','custom','unresolved-all-stats-plus-30'].includes(value)
  || typeof value === 'string' && /^game-dice-effect-(?:[1-9]|[1-3][0-9]|40)$/.test(value);

// Keep the complete source catalog as evidence; offer only effects consumed by this calculator.
export function calculableDiceRecords(diceCatalog) {
  return (diceCatalog?.dice ?? []).filter(row => Number.isInteger(row.gameEffectId) && row.supported === true
    && (row.typeCoefficient || diceFields.some(([key,,fallback]) => Number.isFinite(row.effects?.[key]) && row.effects[key] !== fallback)));
}

export function normalizeDiceSettings(session, diceCatalog) {
  if (!diceCatalog?.dice?.length) return { changed: false, removed: [] };
  const allowed = new Set(['none', 'custom', ...calculableDiceRecords(diceCatalog).map(row => row.id)]);
  const names = new Map((diceCatalog?.dice ?? []).map(row => [row.id, row.name]));
  const removed = []; let changed = false;
  for (const [holder, side] of [...session.profiles.map(p => [p.preview, p.name || '我方']), [session.preview, '野怪']]) {
    if (!object(holder)) continue;
    for (const key of ['diceId', 'diceLast']) {
      const id = holder[key];
      if (id === undefined) continue;
      const next = id === 'manual-power-plus-40' ? 'game-dice-effect-17' : allowed.has(id) ? id : 'none';
      if (next === id) continue;
      holder[key] = next; changed = true;
      if (key === 'diceId' && next === 'none') removed.push(`${side}·${names.get(id) ?? id}`);
    }
    // Read old custom records, but do not keep a speed-only input that has no damage/HP consumer.
    if (object(holder.diceEffects) && Object.hasOwn(holder.diceEffects, 'speedMultiplier')) {
      if (holder.diceId === 'custom' && holder.diceEffects.speedMultiplier !== 1) removed.push(`${side}·速度加成`);
      delete holder.diceEffects.speedMultiplier; changed = true;
      if (!diceFields.some(([key,,fallback]) => Number.isFinite(holder.diceEffects[key]) && holder.diceEffects[key] !== fallback)) {
        if (holder.diceId === 'custom') holder.diceId = 'none';
        if (holder.diceLast === 'custom') holder.diceLast = 'none';
      }
    }
  }
  return { changed, removed };
}

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
  if (firstActionPowerBonus(skill) && row.powerMode === 'auto') {
    notices.push(row.firstActionPowerAdd > 0
      ? `入场首次行动 · 迸发威力 +${row.firstActionPowerAdd}`
      : '首次行动可在齿轮中开启迸发。');
  }
  return notices;
}

export function validatePreviewSettings(session, target) {
  if (target) {
    const legacyFormId = session.wildStatFormId ?? '';
    // Older records keep their branch identity, while defense uses the current form.
    if (legacyFormId !== '') resolveWildTarget(target, legacyFormId);
    session.wildStatFormId = legacyFormId;
  }
  const fail = () => { throw new Error('配招判断的配置或实测格式无效，请核对导入文件。'); };
  const overrides = value => {
    if (!object(value)) fail();
    if (Object.hasOwn(value, 'displayedPower') && Object.hasOwn(value, 'effectivePower')) fail();
    for (const [key,v] of Object.entries(value)) {
      if (key === 'firstAction') { if (typeof v !== 'boolean') fail(); continue; }
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
    if (holder.incomingDamageUnits!==undefined && (!Array.isArray(holder.incomingDamageUnits)||holder.incomingDamageUnits.length>4||holder.incomingDamageUnits.some(v=>!['total','perHit'].includes(v)))) fail();
    for (const key of ['diceId','diceLast']) if(holder[key]!==undefined && !validDiceId(holder[key])) fail();
    if(holder.panelIncludesDice!==undefined && typeof holder.panelIncludesDice!=='boolean') fail();
    if(holder.diceEffects!==undefined) {
      if(!object(holder.diceEffects)) fail();
      for(const [key,v] of Object.entries(holder.diceEffects)) {
        if(!(key==='speedMultiplier'||diceFields.some(([field])=>field===key))||!Number.isFinite(v)) fail();
        if(key==='skillPowerAdd' ? v < -10000 || v > 10000 : v < 0.001 || v > 100) fail();
      }
    }
    if(holder.incomingByDefender!==undefined) {
      if(!object(holder.incomingByDefender) || Object.keys(holder.incomingByDefender).length>24) fail();
      for(const entry of Object.values(holder.incomingByDefender)) {
        if(!object(entry)) fail();
        if(!Array.isArray(entry.damages)||entry.damages.length>4||entry.damages.some(v=>v!=null&&(!Number.isInteger(v)||v<0||v>1000000))) fail();
        if(!Array.isArray(entry.picks)||entry.picks.length>4||entry.picks.some(v=>v!=null&&!validPick(v))) fail();
        if(entry.skillIds!==undefined&&(!Array.isArray(entry.skillIds)||entry.skillIds.length>4||entry.skillIds.some(id=>typeof id!=='string'))) fail();
        if(entry.overridesList!==undefined) { if(!Array.isArray(entry.overridesList)||entry.overridesList.length>4) fail(); for(const value of entry.overridesList) overrides(value); }
        if(entry.units!==undefined&&(!Array.isArray(entry.units)||entry.units.length>4||entry.units.some(v=>!['total','perHit'].includes(v)))) fail();
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
  if (obs.invalid) return false;
  return (obs.damage == null || (Number.isInteger(obs.damage) && obs.damage >= 0
    && Math.abs(prediction.damage - obs.damage) <= (prediction.damage > 50 ? 1 : 0)))
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
export function readIncomingObservation(encounter, index, row) {
  const value = encounter.incomingDamages?.[index];
  if (value == null) return null;
  const unit = encounter.incomingDamageUnits?.[index] === undefined ? 'total' : encounter.incomingDamageUnits[index];
  if (!Number.isInteger(value) || value < 0 || value > 1000000 || !['total','perHit'].includes(unit)) return { invalid: true };
  const count = unit === 'perHit' ? row?.hitCount : 1;
  if (!Number.isInteger(count) || count < 1 || count > 100) return { invalid: true };
  return { damage: value * count, inputDamage: value, unit };
}
export function observationDifference(row, obs, format = 'game0') {
  const predictions = row?.predictions ?? [];
  if (!predictions.length || !obs || obs.invalid) return '';
  if (predictions.some(p => observationMatch(p, obs, format))) return '';
  if (obs.damage != null) {
    const damageMatches = predictions.filter(p => observationMatch(p, { damage: obs.damage }, format));
    if (damageMatches.length) return `伤害吻合，计算余血 ${range(damageMatches.map(p => percentDisplay(format)(p.remainingPercent)), format === 'round1' ? 1 : 0)}%`;
    const damages = [...new Set(predictions.map(p => p.damage))];
    const nearest = damages.reduce((a,b) => Math.abs(a-obs.damage) <= Math.abs(b-obs.damage) ? a : b);
    const delta = obs.damage - nearest;
    return `计算 ${range(damages)}，实测比最近值${delta > 0 ? '多' : '少'} ${Math.abs(delta)}`;
  }
  return `计算余血 ${range(predictions.map(p => percentDisplay(format)(p.remainingPercent)), format === 'round1' ? 1 : 0)}%`;
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
  const damaging = skill => skill?.category === 'physical' || skill?.category === 'magical';
  let koCache = new Map();
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
    if (own.observedTargetId !== session.targetId) {
      own.observed = {};
      own.picked = {};
      own.observedTargetId = session.targetId;
    }
    own.observedLevel = session.level;
    if (!object(session.preview)) session.preview = {};
    const encounter = session.preview;
    if (encounter.targetId !== session.targetId) {
      for (const key of ['incomingSkillId','incomingOverrides','incomingDamage']) delete encounter[key];
      delete encounter.incomingByDefender;
      Object.assign(encounter, {targetId:session.targetId,level:session.level,incomingSkillIds:defaultIncoming(session.targetId, spirits.get(profile.spiritId)),
        incomingOverridesList:Array.from({length:INCOMING_SLOTS},()=>({})),incomingDamages:Array(INCOMING_SLOTS).fill(null),incomingDamageUnits:Array(INCOMING_SLOTS).fill('total'),incomingPicks:Array(INCOMING_SLOTS).fill(null),shiny:false,diceId:'none',diceEffects:{}});
      for (const item of session.profiles) if(object(item.preview)) { item.preview.observed={}; item.preview.picked={}; }
    }
    if (encounter.level !== session.level) encounter.level = session.level;
    if (!Array.isArray(encounter.incomingSkillIds)) {
      // 旧记录只有一个敌方技能。
      encounter.incomingSkillIds = [encounter.incomingSkillId ?? '', ''];
      encounter.incomingOverridesList = [object(encounter.incomingOverrides) ? encounter.incomingOverrides : {}, {}];
      encounter.incomingDamages = [encounter.incomingDamage ?? null, null];
      for (const key of ['incomingSkillId','incomingOverrides','incomingDamage']) delete encounter[key];
    }
    // 受击读数属于当前出战配置：切走时连同来招、条件和录入口径一起暂存，切回时整套恢复，
    // 读数不会被另一套配置换掉的技能重新解释。没有暂存的配置沿用当前来招，但不带读数。换精灵后不沿用。
    const defenderKey = `${profile.id}:${profile.spiritId}`;
    if (encounter.incomingDefender !== defenderKey) {
      const stash = object(encounter.incomingByDefender) ? encounter.incomingByDefender : {};
      const copy = value => Array.isArray(value) ? structuredClone(value) : [];
      if (encounter.incomingDefender) stash[encounter.incomingDefender] = {
        skillIds: copy(encounter.incomingSkillIds), overridesList: copy(encounter.incomingOverridesList),
        units: copy(encounter.incomingDamageUnits), damages: copy(encounter.incomingDamages), picks: copy(encounter.incomingPicks) };
      const saved = stash[defenderKey];
      delete stash[defenderKey];
      for (const key of Object.keys(stash)) if (key.startsWith(`${profile.id}:`)) delete stash[key];
      if (saved?.skillIds) {
        encounter.incomingSkillIds = saved.skillIds;
        encounter.incomingOverridesList = saved.overridesList ?? [];
        encounter.incomingDamageUnits = saved.units ?? [];
      }
      encounter.incomingDamages = Array.from({length:INCOMING_SLOTS},(_,i)=>saved?.damages?.[i] ?? null);
      encounter.incomingPicks = Array.from({length:INCOMING_SLOTS},(_,i)=>saved?.picks?.[i] ?? null);
      encounter.incomingByDefender = stash;
      encounter.incomingDefender = defenderKey;
    }
    const enemyRows = incomingSkillOptions(catalog, session.targetId);
    encounter.incomingSkillIds = Array.from({length:INCOMING_SLOTS},(_,i)=>enemyRows.some(s=>s.id===encounter.incomingSkillIds[i])?encounter.incomingSkillIds[i]:'');
    encounter.incomingOverridesList = Array.from({length:INCOMING_SLOTS},(_,i)=>object(encounter.incomingOverridesList?.[i])?encounter.incomingOverridesList[i]:{});
    encounter.incomingDamages = Array.from({length:INCOMING_SLOTS},(_,i)=>encounter.incomingDamages?.[i] ?? null);
    encounter.incomingDamageUnits = Array.from({length:INCOMING_SLOTS},(_,i)=>encounter.incomingDamageUnits?.[i] ?? 'total');
    encounter.incomingPicks = Array.from({length:INCOMING_SLOTS},(_,i)=>encounter.incomingPicks?.[i] ?? null);
    encounter.shiny = encounter.shiny === true && spirits.get(session.targetId)?.hasShinyForm === true;
    return {session,profile,own,encounter};
  }

  function skillControl(id, pickerId, metaId, prefix, slotLabel) {
    return `<div class="pskill"><span class="pskill-slot">${slotLabel}</span><div class="pskill-body"><div class="pskill-line"><div class="picker-anchor" id="${pickerId}"><input id="${id}-input" autocomplete="off" placeholder="选择技能"/><span class="picker-caret" aria-hidden="true">⌄</span></div><button type="button" id="${prefix}-gear" class="pskill-gear" aria-label="本招条件" aria-expanded="false" aria-controls="${prefix}-pop">⚙</button></div><select id="${id}" class="compat-hidden" tabindex="-1" aria-hidden="true"></select><div id="${metaId}" class="pskill-meta"></div>${conditionControl(prefix)}</div></div>`;
  }
  // 常用条件保持三项；已知最终威力保留为展开项。
  function conditionControl(prefix) {
    return `<div id="${prefix}-pop" class="pskill-pop" role="dialog" aria-label="本招条件" hidden><div class="pskill-pop-grid"><label>显示威力<input id="${prefix}-displayedPower" type="number" min="0" max="100000" step="any" placeholder="自动"/></label><label>命中次数<input id="${prefix}-hitCount" type="number" min="1" max="100" step="1" placeholder="1"/></label><label>威力倍率<input id="${prefix}-powerMultiplier" type="number" min="0.01" max="100" step="0.01" placeholder="1"/></label></div><label id="${prefix}-firstAction-row" class="pskill-first-action" hidden><input id="${prefix}-firstAction" type="checkbox"/><span id="${prefix}-firstAction-label">入场首次行动 · 迸发 +30</span></label><div class="pskill-pop-foot"><span id="${prefix}-auto" class="pskill-auto"></span><span id="${prefix}-legacyPower" class="preview-legacy-power" hidden><span id="${prefix}-legacyPower-label"></span></span><button id="${prefix}-resetPower" type="button" class="text-button">恢复自动</button></div><details class="preview-final-power"><summary>已知最终威力</summary><label>最终威力<input id="${prefix}-effectivePower" type="number" min="0" max="100000" step="any" placeholder="未填写"/></label><p>已含系别与极化/钝化，不含临场攻防加成；与显示威力互斥。</p></details></div>`;
  }
  const heading = (columns, last) => `<div class="pth pth-skill">技能</div>${columns.map(([key,label])=>`<div class="pth">${catalog.assets?.stats?.[key]?`<img src="${html(catalog.assets.stats[key])}" alt=""/>`:''}${label}${key==='other'?'':'<span class="up-arrow">↑</span>'}</div>`).join('')}<div class="pth">${last}</div>`;
  $('preview-outgoing').innerHTML = heading(OUT_COLUMNS,'实测<button id="preview-reset-observed" type="button" class="text-button pth-action">清空</button>') + Array.from({length:4},(_,i) =>
    `<div class="prow" data-preview-row="${i}">${skillControl(`preview-skill-${i}`,`preview-skill-picker-${i}`,`preview-skill-meta-${i}`,`preview-condition-${i}`,i+1)}<div class="pcells" id="preview-cells-${i}"></div><div class="pobservations"><label class="pobs"><span>伤害</span><input id="preview-observed-${i}" inputmode="numeric" autocomplete="off" aria-label="技能 ${i+1} 实测伤害"/></label><label class="pobs"><span>剩余 %</span><input id="preview-remaining-${i}" inputmode="decimal" autocomplete="off" aria-label="技能 ${i+1} 实测剩余百分比"/></label></div></div>`).join('');
  $('preview-incoming').innerHTML = Array.from({length:INCOMING_SLOTS},(_,k) =>
    `<div class="prow" data-incoming-row="${k}">${skillControl(`preview-incoming-skill-${k}`,`preview-incoming-picker-${k}`,`preview-incoming-meta-${k}`,`preview-incoming-condition-${k}`,'敌')}<div class="pcells" id="preview-incoming-cells-${k}"></div><div class="pobservations"><label class="pobs"><span id="preview-incoming-unit-label-${k}">总伤</span><input id="preview-incoming-damage-${k}" type="number" min="0" max="1000000" step="1" inputmode="numeric" aria-label="敌方技能 ${k+1} 我方掉血"/></label><select id="preview-incoming-unit-${k}" class="incoming-unit" aria-label="敌方技能 ${k+1} 伤害口径" hidden><option value="total">录入总伤</option><option value="perHit">录入单段</option></select></div></div>`).join('');

  const diceHolder = side => { const {own,encounter}=state(); return side==='own'?own:encounter; };
  const diceSummary = effects => diceFields.filter(([key,,fallback]) => Number.isFinite(effects?.[key]) && effects[key] !== fallback)
    .map(([key,label]) => key === 'skillPowerAdd' ? `威力 +${effects[key]}` : `${label.replace('倍率','')} ×${effects[key]}`).join(' · ');
  function configureDice(side) {
    const records = calculableDiceRecords(diceCatalog);
    const group = (label, rows) => rows.length ? `<optgroup label="${label}">${rows.map(row=>`<option value="${html(row.id)}">${html(row.name)} · ${html(diceDescription(row))}</option>`).join('')}</optgroup>` : '';
    $(`${side}-dice`).innerHTML = '<option value="none">无加成</option>'
      + group('属性与威力', records.filter(row=>!row.typeCoefficient))
      + group('克制与抵抗', records.filter(row=>row.typeCoefficient))
      + '<option value="custom">自填合计加成</option>';
    $(`${side}-dice-custom`).innerHTML = '<p>攻防倍率 1.25 表示临场 +25%；基础面板不变，加成计入技能威力。</p><div class="dice-values">' + diceFields.map(([key,label,value,max,step])=>`<label>${label}<input id="${side}-dice-${key}" type="number" placeholder="${value}" min="${key === 'skillPowerAdd' ? -10000 : 0.001}" max="${max}" step="${step}" /></label>`).join('') + '</div>';
    $(`${side}-dice`).addEventListener('change',()=>commit(()=> {
      const holder=diceHolder(side);
      holder.diceId=$(`${side}-dice`).value;
      if(holder.diceId!=='none') holder.diceLast=holder.diceId;
    }));
    for (const [key] of diceFields) $(`${side}-dice-${key}`).addEventListener('change',()=>commit(()=>{
      const {own,encounter}=state(), holder=side==='own'?own:encounter;
      holder.diceEffects={...(holder.diceEffects ?? {})};
      const value=number($(`${side}-dice-${key}`));
      if(value===null) delete holder.diceEffects[key]; else holder.diceEffects[key]=value;
    }));
    // 开关关着即“无”；打开后沿用上次选的骰子。
    $(`${side}-dice-ui`).addEventListener('change',event=>{
      if(!event.target.matches('[data-dice-switch]')) return;
      commit(()=>{ const holder=diceHolder(side);
        if(event.target.checked) holder.diceId=validDiceId(holder.diceLast) && holder.diceLast!=='none' ? holder.diceLast : 'game-dice-effect-1';
        else { if(holder.diceId && holder.diceId!=='none') holder.diceLast=holder.diceId; holder.diceId='none'; } });
    });
    $(`${side}-dice-ui`).addEventListener('click',event=>{
      const pick=event.target.closest('[data-dice-pick]'); if(!pick) return;
      commit(()=>{ const holder=diceHolder(side); holder.diceId=pick.dataset.dicePick; holder.diceLast=holder.diceId; });
    });
  }
  function renderDiceUi(side, holder) {
    const id = holder.diceId ?? 'none';
    const on = id !== 'none', summary = diceSummary(holder.diceEffects);
    const pick = (value, label) => `<button type="button" class="dice-chip" data-dice-pick="${value}" aria-pressed="${id===value}">${html(label)}</button>`;
    $(`${side}-dice-ui`).innerHTML = `<label class="switch-label"><input type="checkbox" class="switch" data-dice-switch aria-label="${side==='own'?'我方':'敌方'}骰子" ${on?'checked':''}/></label>`
      + (on ? pick('game-dice-effect-1','双攻 ×1.1') + pick('game-dice-effect-17','威力 +40') + pick('custom', id==='custom' && summary ? summary : '自填') : '<span class="dice-off">无</span>');
    const select=$(`${side}-dice`);
    select.classList.toggle('compat-hidden',!on);
    select.classList.add('dice-selector');
    select.tabIndex=on?0:-1;
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
      const {profile,session}=state(), rows = incoming ? incomingSkillOptions(catalog, session.targetId) : ownLearnset(profile.spiritId);
      return rows.filter(s => damaging(s) || s.id === $(id).value);
    },image:s=>s.iconUrl ?? catalog.assets?.elements?.[s.type],describe:s=>{
      const {profile,session}=state(), user=spirits.get(incoming?session.targetId:profile.spiritId);
      return [category(s), `威力 ${s.basePower ?? '—'}`, user?.types?.includes(s.type) ? '本系' : '', !incoming && knockout(index, s.id) ? '一击倒' : ''].filter(Boolean).join(' · ');
    }}));
    $(id).addEventListener('change',()=>commit(()=>{
      const {own,encounter}=state();
      if(incoming) {encounter.incomingSkillIds[index]=$(id).value;encounter.incomingOverridesList[index]={};encounter.incomingDamages[index]=null;encounter.incomingDamageUnits[index]='total';encounter.incomingPicks[index]=null;}
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
    $(`${prefix}-firstAction`).addEventListener('change',()=>commit(()=>{
      const {own,encounter}=state();
      const holder=incoming?encounter.incomingOverridesList[index]:(own.skillOverrides[own.skillIds[index]]??={});
      if ($(`${prefix}-firstAction`).checked) holder.firstAction=true; else delete holder.firstAction;
    }));
    $(`${prefix}-resetPower`).addEventListener('click',()=>commit(()=>{
      const {own,encounter}=state();
      const holder=incoming?encounter.incomingOverridesList[index]:own.skillOverrides[own.skillIds[index]];
      if (holder) for (const key of ['effectivePower','displayedPower','powerMultiplier','hitCount']) delete holder[key];
    }));
    $(`${prefix}-gear`).addEventListener('click',event=>{
      event.stopPropagation();
      const pop=$(`${prefix}-pop`), open=pop.hidden;
      closePops();
      pop.hidden=!open; $(`${prefix}-gear`).setAttribute('aria-expanded',String(open));
      if(open) pop.querySelector('input')?.focus();
    });
  }
  function closePops() {
    for (const pop of document.querySelectorAll('.pskill-pop:not([hidden])')) {
      pop.hidden = true;
      document.getElementById(pop.id.replace(/-pop$/,'-gear'))?.setAttribute('aria-expanded','false');
    }
  }
  document.addEventListener('click',event=>{ if(!event.target.closest('.pskill-pop,.pskill-gear')) closePops(); });
  document.addEventListener('keydown',event=>{ if(event.key==='Escape') closePops(); });
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
  for(let k=0;k<INCOMING_SLOTS;k++) $(`preview-incoming-unit-${k}`).addEventListener('change',()=>commit(()=>{const {encounter}=state(); encounter.incomingDamageUnits[k]=$(`preview-incoming-unit-${k}`).value;}));
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
  $('own-trait-row').addEventListener('click',event=>{
    const step=event.target.closest('[data-trait-step]'); if(!step) return;
    commit(()=>{const {own,profile}=state(); own.trait.stacks=limitTraitStacks((own.trait.stacks ?? 0)+Number(step.dataset.traitStep),ownTraitInfo(spirits.get(profile.spiritId)));});
  });
  $('own-trait-row').addEventListener('change',event=>{
    if(event.target.id==='own-trait-stacks') commit(()=>{const {own,profile}=state(); own.trait.stacks=limitTraitStacks(number(event.target),ownTraitInfo(spirits.get(profile.spiritId)));});
    if(event.target.id==='own-trait-active') commit(()=>{state().own.trait.active=event.target.checked;});
  });

  const typeIcon = skill => catalog.assets?.elements?.[skill.type] ? `<img class="type-icon" src="${html(catalog.assets.elements[skill.type])}" alt="${html(skill.type)}" title="${html(skill.type)}"/>` : `${html(skill.type)} · `;
  function renderSkillControl(id, metaId, prefix, skillId, overrides) {
    if (!object(overrides)) overrides={};
    const skill=skills.get(skillId), select=$(id);
    // The visible picker searches the catalog; avoid building that full list
    // again inside every hidden select on startup and each measurement edit.
    if (select.options.length !== 1 || select.value !== (skill?.id ?? '')) {
      select.replaceChildren(new Option(skill?.name ?? '选择技能', skill?.id ?? ''));
      select.value=skill?.id ?? '';
    }
    for(const key of ['powerMultiplier','hitCount','displayedPower','effectivePower']) $(`${prefix}-${key}`).value=overrides[key] ?? '';
    const legacy = Object.hasOwn(overrides, 'effectivePower');
    $(`${prefix}-legacyPower`).hidden = !legacy;
    $(`${prefix}-legacyPower-label`).textContent = legacy ? `最终威力 ${powerNumber(overrides.effectivePower)} · 已含系别与觉醒` : '';
    $(`${prefix}-displayedPower`).placeholder = legacy ? '最终威力生效中' : '自动';
    $(`${prefix}-gear`).classList.toggle('is-set', Object.keys(overrides).length > 0);
    const burst=firstActionPowerBonus(skill), manual=legacy || Object.hasOwn(overrides,'displayedPower');
    $(`${prefix}-firstAction-row`).hidden=!burst;
    $(`${prefix}-firstAction`).checked=overrides.firstAction===true;
    $(`${prefix}-firstAction`).disabled=manual;
    $(`${prefix}-firstAction-label`).textContent=manual ? '迸发按手填威力，不额外叠加' : `入场首次行动 · 迸发 +${burst}`;
    $(`${prefix}-gear`).hidden = !skill;
    if(!skill) { $(metaId).innerHTML=''; $(metaId).title=''; return; }
    $(metaId).innerHTML=`${typeIcon(skill)}${category(skill)} · 显示威力 —`;
    $(metaId).title=skill.description ?? '';
    $(`${prefix}-hitCount`).placeholder = String(legacy ? 1 : defaultSkillHitCount(skill));
  }
  function renderDisplayedPower(metaId, prefix, row, autoRow) {
    const skill = skills.get(row?.skillId);
    if (!skill) return;
    const manual = row.powerMode === 'displayed';
    const power = `<b class="pw${manual?' manual':''}">${powerNumber(row.displayedPower)}${manual?' 手填':''}</b>`;
    $(metaId).innerHTML = `${typeIcon(skill)}${category(skill)} · 显示威力 ${power}${row.hitCount > 1 ? ` · ${row.hitCount}连击` : ''}`
      + skillPreviewNotices(row, skill).map(note=>`<span class="preview-model-note">${html(note)}</span>`).join('');
    const auto = autoRow?.skillId === row.skillId && Number.isFinite(autoRow.displayedPower) ? autoRow.displayedPower : null;
    $(`${prefix}-auto`).textContent = auto === null ? '' : `自动 ${powerNumber(auto)}`;
    $(`${prefix}-displayedPower`).placeholder = row.powerMode === 'final' ? '最终威力生效中' : auto === null ? '自动' : powerNumber(auto);
  }
  // 敌方出招只看攻击方性格：减 / 不变 / 加三格。
  function axisGroups(row) {
    const skill = skills.get(row.skillId), rel = skill?.category === 'physical' ? 'physicalAttack' : 'magicalAttack', name = statNames[rel];
    return [
      { key:'down', label:`减${name}`, group:rel, condition:'down', items: row.predictions.filter(p => p.downStat === rel) },
      { key:'neutral', label:`${name}不变`, group:'other', condition:'base', items: row.predictions.filter(p => p.upStat !== rel && p.downStat !== rel) },
      { key:'up', label:`加${name}`, group:rel, condition:'base', items: row.predictions.filter(p => p.upStat === rel) },
    ];
  }
  function axisMarkup(row, obs, pickedKey) {
    if(!row) return `<div class="pcell-note">选择技能</div>`;
    if(row.status!=='estimated' || !row.predictions?.length) return `<div class="pcell-note">${html(shortReason(row.reason))}</div>`;
    const picked = pickedKey ? pickedKey.split(':').slice(0,2).join(':').replace(/^([^:]+)$/,'$1:base') : null;
    return axisGroups(row).map(({key,label,group,condition,items}) => {
      const mark = obs && !obs.invalid ? (items.some(p => observationMatch(p, obs)) ? ' hit' : ' miss') : '';
      const on = picked === `${group}:${condition}`;
      return `<div class="pcell paxis paxis--${key}${mark}${on?' picked':''}" data-nature-group="${group}" data-nature-condition="${condition}" role="button" tabindex="0" aria-pressed="${on}"><strong class="dmg">${range(items.map(p=>p.damage)).replace('–','–<wbr>')}</strong>${hitFormula(row,items)}<span class="axis-label">${label}</span></div>`;
    }).join('');
  }
  function axisEvidence(row, obs) {
    const groups = axisGroups(row), hits = groups.filter(g => g.items.some(p => observationMatch(p, obs)));
    if (!hits.length) return { text: observationDifference(row, obs), tone: 'bad' };
    if (hits.length < groups.length) return { text: `吻合：${hits.map(g => g.label).join('／')}`, tone: 'good' };
    return { text: '伤害吻合，无法区分攻击性格', tone: 'flat' };
  }
  function hitFormula(row, predictions) {
    return row.hitCount > 1 ? `<span class="hit-formula">${range(predictions.map(p=>p.damage/row.hitCount))} × ${row.hitCount} 段</span>` : '';
  }
  function hpStateIcon(hp) {
    const symbol = { down:'↓', neutral:'＝', up:'↑' }[hp.key];
    return `<span class="hp-state-label" data-hp-state="${hp.key}" title="${hp.label}" aria-label="${hp.label}"><img src="./assets/hp-outline.svg" alt=""/><span aria-hidden="true">${symbol}</span></span>`;
  }

  function defenseCellsMarkup(row, obs, format, pickedKey) {
    const skill = skills.get(row.skillId);
    const stat = skill?.category === 'physical' ? 'physicalDefense' : 'magicalDefense';
    const name = statNames[stat];
    const allHits = obs ? row.predictions.filter(p => observationMatch(p, obs, format)) : [];
    if (allHits.length && allHits.every(p => p.damage >= p.hpMax)) obs = null;
    // 防御档只看伤害（±1 按预测伤害判断）；余血吻合与结论栏同用实伤＋余血反推，
    // 不从容错后的预测命中取生命档。只有余血时仍按预测余血对照。
    const damageObs = obs?.damage != null ? { damage: obs.damage } : obs;
    const hpCases = obs?.damage != null && obs.remainingPercent != null
      ? new Set(compareObservedHp({ outgoing: [row], observed: { 0: obs }, format }).matchedPredictions.map(caseId)) : null;
    const hpMatches = p => hpCases ? observationMatch(p, damageObs, format) && hpCases.has(caseId(p)) : observationMatch(p, obs, format);
    const groups = [
      { key: 'down', group: stat, condition: 'down', label: `减${name}`, matches: p => p.downStat === stat },
      { key: 'neutral', group: 'other', condition: 'base', label: `${name}不变`, matches: p => p.upStat !== stat && p.downStat !== stat },
      { key: 'up', group: stat, condition: 'base', label: `加${name}`, matches: p => p.upStat === stat },
    ];
    const hpGroups = [
      { key: 'down', label: '生命↓', matches: p => p.downStat === 'hp' },
      { key: 'neutral', label: '生命不变', matches: p => p.upStat !== 'hp' && p.downStat !== 'hp' },
      { key: 'up', label: '生命↑', matches: p => p.upStat === 'hp' },
    ];
    const display = percentDisplay(format), digits = format === 'round1' ? 1 : 0;
    const mobileLabels = `<div class="mobile-measure-labels" aria-hidden="true"><span>伤害</span><div>${hpGroups.map(hp => `<span>${hpStateIcon(hp)}</span>`).join('')}</div></div>`;
    return mobileLabels + groups.map(group => {
      const entries = row.predictions.filter(group.matches);
      const matching = obs && entries.some(p => observationMatch(p, damageObs, format));
      const mark = obs ? matching ? ' hit' : ' miss' : '';
      const picked = pickedKey === `${group.group}:${group.condition}`;
      const readings = hpGroups.map(hp => {
        const values = entries.filter(hp.matches);
        const hit = obs?.remainingPercent != null && values.some(hpMatches);
        return `<span class="hp-reading${!values.length ? ' impossible' : ''}${hit ? ' matches' : ''}" data-hp-nature="${hp.key}" title="${hp.label}${values.length ? '时的剩余血量' : '：没有这种性格组合'}">${hpStateIcon(hp)}<b>${values.length ? `${range(values.map(p => display(p.remainingPercent)), digits)}%` : '—'}</b></span>`;
      }).join('');
      return `<div class="pcell-stack"><div class="pcell defense-pcell${mark}${picked ? ' picked' : ''}" data-nature-group="${group.group}" data-nature-condition="${group.condition}" data-defense-stat="${stat}" data-defense-band="${group.key}" role="button" tabindex="0" aria-pressed="${picked}"><span class="pcell-label">${group.label}</span><strong class="dmg">${range(entries.map(p => p.damage)).replace('–', '–<wbr>')}</strong>${hitFormula(row, entries)}<div class="hp-readings">${readings}</div></div></div>`;
    }).join('');
  }

  function defenseEvidenceTag(row, obs, format) {
    const matched = row.predictions.filter(p => observationMatch(p, obs, format));
    if (!matched.length) return { text: observationDifference(row, obs, format), tone: 'bad' };
    const skill = skills.get(row.skillId);
    const stat = skill?.category === 'physical' ? 'physicalDefense' : 'magicalDefense';
    const effects = new Set(matched.map(p => p.upStat === stat ? '提高' : p.downStat === stat ? '降低' : '不变'));
    return { text: effects.size === 1 ? `吻合：${statNames[stat]}${[...effects][0]}` : `${statNames[stat]}仍有 ${effects.size} 档吻合`, tone: 'good' };
  }

  function cellsMarkup(row, columns, incoming, obs, format, pickedKey) {
    if(!row) return `<div class="pcell-note">选择技能</div>`;
    if(row.status!=='estimated' || !row.predictions?.length) return `<div class="pcell-note">${html(shortReason(row.reason))}</div>`;
    if (!incoming) return defenseCellsMarkup(row, obs, format, pickedKey);
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
        return `<div class="pcell${mark}${picked?' picked':''}${condition==='down'?' pcell-penalty':''}" data-nature-group="${key}" data-nature-condition="${condition}" role="button" tabindex="0" aria-pressed="${picked}">${conditionLabel?`<span class="condition-label">${conditionLabel}</span>`:''}<strong class="dmg">${range(own.map(p=>p.damage))}</strong>${hitFormula(row,own)}${tail}<span class="pcell-label">${label}${key==='other'?'':'↑'}</span></div>`;
      }).join('')}</div>`;
    }).join('');
  }
  function evidenceTag(row, columns, incoming, obs, format) {
    if (!incoming) return defenseEvidenceTag(row, obs, format);
    const skill = skills.get(row.skillId), same = sameAsOtherColumn(skill, incoming);
    const hits = [];
    for (const [key,label] of columns) {
      const items = row.predictions.filter(p => inColumn(p, key, columns, same));
      if (items.some(p => observationMatch(p, obs, format))) hits.push({ key, label, same: key === same });
    }
    if (!row.predictions.some(p=>observationMatch(p,obs,format))) return { text: observationDifference(row, obs, format), tone: 'bad' };
    if (hits.length === 1 && !hits[0].same) return { text: `吻合：${hits[0].label}↑`, tone: 'good' };
    return { text: '实测吻合，需结合其他招区分', tone: 'good' };
  }
  function coefficientEvidence(result, target) {
    const stage = result.wildStrengthStage ?? target?.wildStrengthStage;
    if (![1, 2, 3].includes(stage)) return '';
    const verified = target?.wildStrengthStageEvidence?.status === 'verified';
    const lines = new Set();
    for (const row of [...(result.outgoing ?? []), ...(result.incomingList ?? [])]) {
      for (const prediction of row?.predictions ?? []) {
        const trace = prediction.wildStatEvidence;
        if (!trace) continue;
        const label = statNames[trace.stat];
        if (trace.kind === 'effective-defense-point') {
          const condition = trace.fixedOutgoingCorrectionMultiplier
            ? `，以克制修正 ×${trace.fixedOutgoingCorrectionMultiplier} 为前提` : '';
          const band = trace.naturePercent === 100 ? `${label}不变` : `${trace.naturePercent === 90 ? '减' : '加'}${label}`;
          lines.add(`${trace.level}级 · ${band}：反推有效防御 ${trace.value}${condition}`);
        } else if (trace.kind === 'source-fit') {
          const scopes = Array.isArray(trace.measuredScopes)
            ? trace.measuredScopes.filter(scope => scope.stat === trace.stat).map(scope => {
              const bands = scope.naturePercents.map(percent => percent === 100 ? `${label}不变` : `${percent < 100 ? '减' : '加'}${label}`).join('／');
              return `${scope.level}级（${bands}）`;
            }).join('；')
            : `${trace.measuredLevels.join('／')}级，${trace.measuredPhysicalDefenseNatures.map(band => ({ neutral:`${label}不变`, up:`加${label}`, down:`减${label}` })[band]).join('／')}`;
          lines.add(`${label}：物种拟合 ×${trace.coefficient}，样本限 ${scopes}`);
          if (!trace.sampleScopeMatches) lines.add(`${label}其余等级或性格沿用该拟合外推`);
        } else {
          lines.add(`${label}：${trace.kind === 'stage-fit' ? '阶位拟合' : '阶位外推'} ×${trace.coefficient}`);
        }
      }
    }
    return `<details class="nature-details coefficient-details"><summary>阶位与系数</summary><p>强度阶位 ${stage} · ${verified ? '包体字段已核对' : '尚无包体确认'}</p>${lines.size ? `<ul>${[...lines].map(line => `<li>${html(line)}</li>`).join('')}</ul>` : ''}<p>攻防沿用经验模型，原始伤害公式尚未还原。</p></details>`;
  }
  function renderVerdict(result, own, encounter, target, format) {
    const { observed, invalid: outgoingInvalid } = readOutgoingObservations(own, format);
    const incomingObserved = Array.from({length:INCOMING_SLOTS},(_,k)=>readIncomingObservation(encounter,k,result.incomingList?.[k]));
    const invalid = outgoingInvalid || incomingObserved.some(obs=>obs?.invalid);
    const hpPredictions = (result.targetHpByLevel ?? []).flatMap(row=>catalog.natures.map(n=>({
      targetLevel:row.level, natureId:n.id, upStat:n.upStat, downStat:n.downStat,
      hpMax:row[n.upStat==='hp'?'up':n.downStat==='hp'?'down':'neutral'],
    })));
    const hpComparison = compareObservedHp({ outgoing:result.outgoing, observed, format, hpPredictions });
    const levels = result.targetLevels ?? [getSession().level];
    let candidates = new Set(levels.flatMap(level => catalog.natures.map(n => `${level}:${n.id}`))), used = 0;
    const evidence = [];
    const axisGroups = Object.fromEntries(['hp','physicalDefense','magicalDefense','physicalAttack','magicalAttack'].map(key => [key, []]));
    const addEvidence = (row, obs, incoming) => {
      if (!obs) return;
      const category = skills.get(row?.skillId)?.category;
      const stat = category === 'physical' ? (incoming ? 'physicalAttack' : 'physicalDefense')
        : category === 'magical' ? (incoming ? 'magicalAttack' : 'magicalDefense') : null;
      const blockAxis = () => { if (stat) axisGroups[stat].push([]); };
      if (obs.invalid) { blockAxis(); evidence.push({ label: row?.skillName || (incoming ? '敌方出招' : '我方出招'), incoming, text:'输入格式有误', tone:'bad' }); return; }
      if (row?.status !== 'estimated') { blockAxis(); evidence.push({ label: row?.skillName || '未选技能', incoming, unavailable:true, text:shortReason(row?.reason), tone:'bad' }); return; }
      const hits = row.predictions.filter(p => observationMatch(p, obs, format));
      // Outgoing knockout observations do not distinguish the target's HP.
      // Incoming displayed damage remains an attack-stat observation even when
      // the hit exceeds our own maximum HP (for example, the recorded 660).
      if (!incoming && hits.length && hits.every(p => p.damage >= p.hpMax)) return;
      const ids = new Set(hits.map(caseId));
      candidates = new Set([...candidates].filter(id => ids.has(id))); used++;
      // Damage measures defense independently of HP; paired raw readings measure
      // HP through compareObservedHp. Percentage-only readings constrain both.
      const statHits = obs.damage == null ? hits : row.predictions.filter(p => observationMatch(p, { damage: obs.damage }, format));
      if (stat) axisGroups[stat].push(statHits.map(caseId));
      if (!incoming && obs.damage == null && obs.remainingPercent != null) axisGroups.hp.push([...ids]);
      const values = [obs.damage == null ? '' : incoming && obs.unit === 'perHit' ? `单段 ${obs.inputDamage} × ${row.hitCount} = ${obs.damage}` : `${incoming ? '总伤' : '伤害'} ${obs.damage}`,
        obs.remainingPercent == null ? '' : `余 ${obs.remainingPercent}%`].filter(Boolean).join(' · ');
      evidence.push({ label: `${row.skillName} ${values}`, matched: hits.length > 0, incoming, ...(incoming ? axisEvidence(row, obs) : evidenceTag(row, OUT_COLUMNS, false, obs, format)) });
    };
    for (let i=0;i<4;i++) addEvidence(result.outgoing?.[i], observed[i], false);
    for (let k=0;k<INCOMING_SLOTS;k++) addEvidence(result.incomingList?.[k], incomingObserved[k], true);
    if (hpComparison.status !== 'empty') {
      const hpCases = hpComparison.matchedPredictions.map(caseId);
      axisGroups.hp.push(hpCases);
      candidates = new Set([...candidates].filter(id => hpCases.includes(id)));
    }
    const axesEvidence = Object.fromEntries(Object.entries(axisGroups).map(([key, groups]) => [key, intersectNatureCases(catalog.natures, levels, groups)]));
    const matching = catalog.natures.filter(n => levels.some(level => candidates.has(`${level}:${n.id}`)));
    const incomplete = evidence.some(e=>e.unavailable);
    const ready = !invalid && !incomplete && used > 0 && matching.length > 0;
    const summary = invalid ? '输入有误' : incomplete ? '有技能未计算' : !used ? '待实测' : !matching.length ? '模型未吻合' : `${matching.length} 个模型候选`;
    const axes = ['hp','physicalDefense','magicalDefense','physicalAttack','magicalAttack'].map(key => {
      const ownEvidence = axesEvidence[key];
      const hpIndependent = key === 'hp' && ownEvidence.used > 0;
      const value = ownEvidence.conflict ? '记录冲突' : ready ? natureAxisState(matching,key)
        : ownEvidence.used ? natureAxisState(ownEvidence.matching,key) : '—';
      return `<div class="nature-axis" data-stat="${key}"><span class="axis-name">${catalog.assets?.stats?.[key]?`<img src="${html(catalog.assets.stats[key])}" alt=""/>`:''}${statNames[key]}${hpIndependent?'<small>血量实测</small>':''}</span><b class="${value==='加'?'up':value==='减'?'down':value==='—'?'empty':''}">${value}</b></div>`;
    }).join('');
    const hpRanges = hpComparison.ranges.map(r=>r.max===null?`≥${r.min}`:r.min===r.max?`${r.min}`:`${r.min}–${r.max}`).join('／');
    const hpText = hpComparison.status === 'empty' ? '' : `<div class="hp-comparison" data-status="${hpComparison.status}"><b>实测总血量 ${hpRanges || '记录互相冲突'}</b><p>${hpComparison.status === 'matched' ? `血量吻合：${[...new Set(hpComparison.matchedPredictions.map(p=>`${p.targetLevel}级 · ${p.upStat==='hp'?'加生命':p.downStat==='hp'?'减生命':'普通'}`))].join('／')}` : hpRanges ? hpComparison.hasHpModel ? '与上方三档血量均不符，请核对目标、异色、等级和本次是否从满血出招。' : '目标血量资料不足，暂无法对照生命性格。' : '各招按独立满血出招计算，请核对实测记录。'}</p><small>由实测伤害与余血反推 · 各招均从满血开始</small></div>`;
    const counts = [false,true].map(incoming=>{
      const rows = evidence.filter(e=>e.incoming===incoming);
      return rows.length ? `${incoming?'敌方':'我方'} ${rows.filter(e=>e.matched).length}/${rows.length} 招吻合` : '';
    }).filter(Boolean).join(' · ');
    const chips = ready ? `<details class="nature-details" ${matching.length <= 5 ? 'open' : ''}><summary>模型候选 · ${matching.length}</summary><div class="nature-chips">${matching.map(n=>`<span>${html(n.name)}<em>${statNames[n.upStat]}↑ ${statNames[n.downStat]}↓</em></span>`).join('')}</div></details>` : '';
    const calibration=WILD_DEFENSE_MODEL.sourceFormCalibrations[target?.wildDefenseRaceStats?.sourcePetbaseId];
    const measured=calibration?.measuredLevels ?? [];
    const matchedLevels=[...new Set([...candidates].map(id=>Number(id.split(':')[0])))];
    // A single selected level cannot establish the level: compare all levels,
    // with at least two distinct physical observations in the measured bands.
    const physicalRows=(result.outgoing ?? []).filter((row,i)=>row.status==='estimated'
      && skills.get(row.skillId)?.category==='physical' && observed[i]?.damage!=null
      && !observed[i].invalid && row.predictions.some(p=>observationMatch(p,observed[i],format)&&p.damage<p.hpMax));
    const distinctPhysical=new Set(physicalRows.map(row=>`${row.skillId}:${row.displayedPower}`)).size;
    const calibratedBands=calibration?.measuredPhysicalDefenseNatures ?? [];
    const measuredNatures=matching.every(n=>calibratedBands.includes(n.upStat==='physicalDefense'?'up':n.downStat==='physicalDefense'?'down':'neutral'));
    const levelMatched=ready && levels.length===3 && distinctPhysical>=2 && matchedLevels.length===1
      && matchedLevels[0]===42 && measured.includes(42) && measuredNatures;
    const levelValue=levelMatched?'42 ✓':levelLabel(encounter.level);
    const levelNote=levelMatched?'与 42 级实测校准相符':measured.includes(encounter.level)?'该等级有物防校准；等级按游戏选择':'按游戏显示选择等级';
    const levelRow=`<div class="verdict-level"><span>等级</span><b${levelMatched?' class="up-ok"':''}>${html(levelValue)}</b><em>${html(levelNote)}</em></div>`;
    $('preview-verdict').innerHTML = `<div class="rail-cap"><span>性格计算</span><span>${html(target?.name ?? '')}</span></div>${levelRow}<div class="verdict-big${invalid || (used && !matching.length) ? ' bad' : !used ? ' empty' : ''}">${summary}</div><p id="preview-comparison" class="verdict-note">${counts || '各招从满血出发，填写实际伤害与余血'}</p>${hpText}<div class="nature-axes">${axes}</div>${chips}${evidence.length?`<div class="evidence">${evidence.map(e=>`<div class="evidence-item"><i class="dot ${e.tone}"></i><div><span>${html(e.label)}</span><b class="${e.tone}">${html(e.text)}</b></div></div>`).join('')}</div>`:''}${coefficientEvidence(result, target)}`;
    $('preview-result-brief').textContent = ready && matching.length === 1 ? `${matching[0].name}（参考）` : summary;
    currentPreview.uiVerdict = { matching, used, invalid, incomplete, hpComparison, evidence, axesEvidence, candidates: [...candidates] };
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
    $('own-trait-row').innerHTML = `<strong>${html(ownSpirit?.traitName ?? '无特性')}</strong>${inner}`;
    $('own-trait-row').title = ownSpirit?.traitDescription ?? '';
    $('wild-trait-row').innerHTML = `<strong>${html(target?.traitName ?? '无特性')}</strong><span class="trait-desc">${html(target?.traitDescription ?? '')}</span>`;
    $('wild-trait-row').title = target?.traitDescription ?? '';
    return info;
  }
  function renderPanel(profile, ownSpirit, info, own) {
    const nature = natures.get(profile.natureId);
    const skillTypes = own.skillIds.map(id => skills.get(id)?.type).filter(Boolean);
    const pct = traitPanelPercents(info, own.trait, skillTypes);
    const stacks = traitControls(info).stack ? own.trait.stacks ?? 0 : 0;
    const head = `${html(profile.name)}${own.panelIncludesDice?'战斗':'基础'}面板 · ${(profile.awakening ?? 0) + 5}★ ${html(nature?.name ?? '普通')}${stacks?` · 特性 ${stacks} 层`:''}`;
    const panel = currentPreview?.ownPanel ?? profile.panel;
    $('preview-panel').innerHTML = `<div class="rail-cap"><span>${head}</span></div><div class="panel-stats">${Object.entries(statNames).map(([key,label])=>`<div class="${nature?.upStat===key?'up':nature?.downStat===key?'down':''}"><span>${label}</span><b>${powerNumber(panel?.[key])}${pct[key]?`<em>+${pct[key]}%</em>`:''}</b></div>`).join('')}</div>`;
  }

  function matchupInput(session, profile, own, encounter, skillIds = own.skillIds) {
    return {targetId:session.targetId,wildStatFormId:session.wildStatFormId,level:session.level,profile:{...profile,panelIncludesDice:own.panelIncludesDice===true},skillIds,skillOverrides:own.skillOverrides,
      incomingSkillIds:encounter.incomingSkillIds,incomingOverridesList:encounter.incomingOverridesList,ownTrait:own.trait,targetShiny:encounter.shiny,
      ownDiceIds:own.diceId==='custom'?[]:[own.diceId ?? 'none'],targetDiceIds:encounter.diceId==='custom'?[]:[encounter.diceId ?? 'none'],
      ownDiceEffects:own.diceId==='custom'?(own.diceEffects ?? {}):{},targetDiceEffects:encounter.diceId==='custom'?(encounter.diceEffects ?? {}):{}};
  }
  // 换上这招后，所有性格、所选等级都满血一发打死，才标“一击倒”。
  function knockout(index, skillId) {
    const key = `${index}:${skillId}`;
    if (koCache.has(key)) return koCache.get(key);
    let ko = false;
    try {
      const {session,profile,own,encounter}=state(), skill=skills.get(skillId);
      if (automatic(skill)) {
        const ids = own.skillIds.map((id,i) => i === index ? skillId : id);
        const row = previewMatchup({...matchupInput(session,profile,own,encounter,ids), incomingSkillIds:[]},catalog,diceCatalog,traitCatalog).outgoing?.[index];
        ko = row?.status === 'estimated' && row.predictions.length > 0 && row.predictions.every(p => p.damage >= p.hpMax);
      }
    } catch { ko = false; }
    koCache.set(key, ko);
    return ko;
  }
  function render() {
    const {session,profile,own,encounter}=state();
    const ownSpirit = spirits.get(profile.spiritId), target = spirits.get(session.targetId);
    const format = encounter.percentFormat ?? 'game0';
    for(let i=0;i<4;i++) {
      renderSkillControl(`preview-skill-${i}`,`preview-skill-meta-${i}`,`preview-condition-${i}`,own.skillIds[i],own.skillOverrides[own.skillIds[i]]);
      const obs=own.observed[i];
      $(`preview-observed-${i}`).value=obs?.damage ?? '';
      $(`preview-remaining-${i}`).value=obs?.remainingPercent ?? '';
    }
    for(let k=0;k<INCOMING_SLOTS;k++) {
      renderSkillControl(`preview-incoming-skill-${k}`,`preview-incoming-meta-${k}`,`preview-incoming-condition-${k}`,encounter.incomingSkillIds[k],encounter.incomingOverridesList[k]);
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
      note.textContent=id==='custom'?'临场攻防倍率计入威力；同项增益按已确认规则叠加。'
        : row ? `${diceDescription(row)} ${row.typeCoefficient?'单一系别按配置文案试算；觉醒沿用当前模型。双系组合需填写最终威力。':row.supported?'攻防加成计入临场威力。':row.unsupportedReason ?? '当前仅展示资料，未接入结算。'}`
          : '骰子资料缺失，请重新选择。';
      renderDiceUi(side, holder);
    }
    const includedAllowed=profile.panelSource==='manual';
    if(!includedAllowed) own.panelIncludesDice=false;
    $('own-dice-panel-included').closest('.dice-panel-source').hidden=(own.diceId??'none')==='none' && !own.panelIncludesDice;
    $('own-dice-panel-included').checked=own.panelIncludesDice===true;
    $('own-dice-panel-included').disabled=!includedAllowed;
    $('own-dice-panel-note').textContent=includedAllowed?'已包含时不再叠加骰子属性；技能威力加值仍单独处理。':'基础面板不含临场增益；技能计算时计入。';
    $('preview-percent-format').value=format;
    $('target-shiny-control').hidden=target?.hasShinyForm !== true;
    $('target-shiny').disabled=target?.hasShinyForm !== true;
    $('target-shiny').checked=encounter.shiny;
    koCache = new Map();
    for(const picker of pickers) picker.refresh();
    const input=matchupInput(session,profile,own,encounter);
    try {currentPreview=previewMatchup(input,catalog,diceCatalog,traitCatalog);} catch(error) {currentPreview={outgoing:[],incoming:null,incomingList:[],warnings:[error.message]};}
    // 手填过的招，另算一份自动值给 ⚙ 弹层对照。
    const anyOverride = own.skillIds.some(id => id && Object.keys(own.skillOverrides[id] ?? {}).length) || encounter.incomingOverridesList.some(o => Object.keys(o ?? {}).length);
    let autoPreview = currentPreview;
    const actionOnly = override => override?.firstAction === true ? {firstAction:true} : {};
    if (anyOverride) try { autoPreview = previewMatchup({...input,
      skillOverrides:Object.fromEntries(Object.entries(input.skillOverrides ?? {}).map(([id,override])=>[id,actionOnly(override)])),
      incomingOverridesList:input.incomingOverridesList.map(actionOnly)},catalog,diceCatalog,traitCatalog); } catch { autoPreview = {}; }
    const { observed } = readOutgoingObservations(own, format);
    for(let i=0;i<4;i++) {
      const obs = observed[i]?.invalid ? null : observed[i];
      renderDisplayedPower(`preview-skill-meta-${i}`, `preview-condition-${i}`, currentPreview.outgoing?.[i], autoPreview.outgoing?.[i]);
      $(`preview-cells-${i}`).innerHTML=cellsMarkup(own.skillIds[i]?currentPreview.outgoing?.[i]:null,OUT_COLUMNS,false,obs,format,own.picked[i]);
      for (const prefix of ['preview-observed','preview-remaining']) {
        const field = $(`${prefix}-${i}`);
        field.classList.toggle('filled',field.value !== '');
        field.classList.toggle('invalid',Boolean(observed[i]?.invalid));
      }
    }
    for(let k=0;k<INCOMING_SLOTS;k++) {
      const row = currentPreview.incomingList?.[k];
      const obs = readIncomingObservation(encounter, k, row);
      renderDisplayedPower(`preview-incoming-meta-${k}`, `preview-incoming-condition-${k}`, currentPreview.incomingList?.[k], autoPreview.incomingList?.[k]);
      $(`preview-incoming-cells-${k}`).innerHTML=axisMarkup(encounter.incomingSkillIds[k]?currentPreview.incomingList?.[k]:null,obs,encounter.incomingPicks[k]);
      $(`preview-incoming-damage-${k}`).classList.toggle('filled',obs?.damage != null);
      $(`preview-incoming-damage-${k}`).classList.toggle('invalid',Boolean(obs?.invalid));
      $(`preview-incoming-unit-${k}`).hidden = !(row?.hitCount > 1);
      $(`preview-incoming-unit-${k}`).value = encounter.incomingDamageUnits[k];
      $(`preview-incoming-unit-label-${k}`).textContent = encounter.incomingDamageUnits[k] === 'perHit' ? '单段' : '总伤';
    }
    const targetHp = currentPreview.targetHpByNature;
    $('target-hp-range').innerHTML = [['down','减生命'],['neutral','普通'],['up','加生命']].map(([key,label]) => `<span data-hp-nature="${key}">${label} <b>${typeof targetHp?.[key] === 'object' ? range([targetHp[key].min,targetHp[key].max]) : targetHp?.[key] ?? '—'}</b></span>`).join('');
    $('preview-target-label').textContent=`${profile.name} → ${target?.name ?? '野生目标'} ${levelLabel(session.level)} 级 · 满血单发`;
    $('preview-incoming-title').textContent=`${target?.name ?? '敌方'} → ${profile.name}`;
    const info = renderTraits(ownSpirit, target, own);
    renderPanel(profile, ownSpirit, info, own);
    renderVerdict(currentPreview, own, encounter, target, format);
  }
  return {render,getResult:()=>currentPreview};
}
