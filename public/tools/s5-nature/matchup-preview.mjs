import { calculateDamage } from './vendor/damage.mjs';
import { getAwakeningBonuses, resolveAwakeningType } from './awakening.mjs';
import { wildPanel, targetLevels } from './engine.mjs';
import { WILD_HP_MODEL, wildTargetShiny } from './wild-hp.mjs';
export { SHINY_HP_MULTIPLIER } from './wild-hp.mjs';
import { traitInfo, resolveOwnTrait, applyAttackStage, applyDefenseStage } from './own-trait.mjs';

const STATS = ['hp', 'physicalAttack', 'magicalAttack', 'physicalDefense', 'magicalDefense', 'speed'];
const STAT_LABELS = { hp: '生命', physicalAttack: '物攻', magicalAttack: '魔攻', physicalDefense: '物防', magicalDefense: '魔防', speed: '速度' };
const EFFECT_DEFAULTS = {
  hpMultiplier: 1, physicalAttackMultiplier: 1, magicalAttackMultiplier: 1,
  physicalDefenseMultiplier: 1, magicalDefenseMultiplier: 1, speedMultiplier: 1,
  powerMultiplier: 1, skillPowerAdd: 0, damageMultiplier: 1,
  damageReductionMultiplier: 1, critMultiplier: 1,
};
const OVERRIDE_KEYS = new Set(['effectivePower', 'hitCount', 'powerMultiplier', 'note']);
const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const finite = value => typeof value === 'number' && Number.isFinite(value);
const integer = (value, low, high) => Number.isSafeInteger(value) && value >= low && value <= high;
const has = (value, key) => Object.hasOwn(value, key);
const unique = values => [...new Set(values)];

function unsupported(skillId, reason) {
  return { skillId: typeof skillId === 'string' ? skillId : null, status: 'unsupported', reason, predictions: [] };
}

function validateEffects(effects) {
  if (!isObject(effects)) throw new RangeError('骰子数值必须是独立的效果对象。');
  for (const [key, value] of Object.entries(effects)) {
    if (!has(EFFECT_DEFAULTS, key)) throw new RangeError(`未支持骰子字段 ${key}，请先核对效果。`);
    if (key === 'skillPowerAdd') {
      if (!finite(value) || value < -10000 || value > 10000) throw new RangeError('骰子固定威力变化须为−10000至10000的有限数字。');
    } else if (!finite(value) || value < (STATS.some(stat => key === `${stat}Multiplier`) ? 0.001 : 0) || value > 100) {
      throw new RangeError('骰子倍率超出可核算范围。');
    }
    if (key === 'critMultiplier' && value !== 1) throw new RangeError('骰子涉及暴击倍率，但本击是否暴击尚未确认，暂不自动核算。');
  }
}

function diceForSide(ids, manualEffects, diceCatalog, label) {
  if (ids !== undefined && !Array.isArray(ids)) throw new RangeError(`${label}骰子选择须为数组。`);
  if (Array.isArray(ids) && ids.length > 64) throw new RangeError(`${label}骰子选择过多，请核对导入数据。`);
  const selectedIds = unique(ids ?? []);
  if (selectedIds.some(id => typeof id !== 'string' || !id)) throw new RangeError(`${label}骰子编号无效。`);
  const effects = { ...EFFECT_DEFAULTS };
  const warnings = [];
  const combine = values => {
    validateEffects(values);
    for (const [key, value] of Object.entries(values)) {
      effects[key] = key === 'skillPowerAdd' ? effects[key] + value : effects[key] * value;
      if (!Number.isFinite(effects[key]) || Math.abs(effects[key]) > 1000000) throw new RangeError('叠加后的骰子数值超出可核算范围。');
    }
  };
  for (const id of selectedIds) {
    if (id === 'none') continue;
    const dice = diceCatalog?.dice?.find(row => row?.id === id);
    if (!dice || dice.supported !== true) throw new RangeError(`${label}骰子「${dice?.name || id}」的实际效果未确认，暂不自动核算。`);
    combine(dice.effects);
    if (dice.requiresConfirmation) warnings.push(`${label}「${dice.name}」按已选的人工数值预设估计，请核对本场效果。`);
  }
  if (manualEffects !== undefined) {
    combine(manualEffects);
    if (Object.keys(manualEffects).length) warnings.push(`${label}骰子使用手填的明确数值，乘区及取整仍待实战核对。`);
  }
  return { ids: selectedIds, effects, warnings };
}

function withDicePanel(panel, dice) {
  if (!isObject(panel)) throw new RangeError('请填写我方实际面板。');
  const result = {};
  for (const stat of STATS) {
    if (!has(panel, stat) || panel[stat] === null || panel[stat] === undefined) continue;
    if (!integer(panel[stat], 1, 100000)) throw new RangeError(`${STAT_LABELS[stat]}面板须为正整数。`);
    result[stat] = Math.max(1, Math.round(panel[stat] * dice.effects[`${stat}Multiplier`]));
  }
  return result;
}

function typeContext(skill, defender, catalog) {
  const chart = catalog.typeChart;
  const row = chart?.types?.indexOf(skill.type);
  if (!Array.isArray(chart?.types) || !Array.isArray(defender.types) || !defender.types.length || row < 0) throw new RangeError('属性关系资料不足。');
  const factors = unique(defender.types).map(type => {
    const column = chart.types.indexOf(type);
    const factor = chart.matrix?.[row]?.[column];
    if (column < 0 || !finite(factor) || factor < 0) throw new RangeError('属性关系资料不足。');
    return factor;
  });
  const raw = factors.reduce((product, factor) => product * factor, 1);
  const multiplier = raw === 0 ? 0 : raw >= 4 ? 3 : raw <= .25 ? .25 : raw;
  return { multiplier, factors };
}

function readOverride(value) {
  if (value === undefined || value === null) return {};
  if (!isObject(value)) throw new RangeError('本次技能覆盖值须为对象。');
  if (Object.keys(value).some(key => !OVERRIDE_KEYS.has(key))) throw new RangeError('本次技能包含未支持的覆盖字段。');
  if (has(value, 'effectivePower') && (!finite(value.effectivePower) || value.effectivePower < 0 || value.effectivePower > 100000)) throw new RangeError('有效威力须为0至100000的有限数字。');
  if (has(value, 'hitCount') && !integer(value.hitCount, 1, 100)) throw new RangeError('本次连击数须为1至100的整数。');
  if (has(value, 'powerMultiplier') && (!finite(value.powerMultiplier) || value.powerMultiplier < 0 || value.powerMultiplier > 100)) throw new RangeError('本次额外威力倍率须为0至100的有限数字。');
  return value;
}

function resolvePower(skill, override, attacker, defender, attackerAwakening, defenderAwakening, dice, catalog, trait = {}) {
  const manual = has(override, 'effectivePower');
  if (!['physical', 'magical'].includes(skill.category)) throw new RangeError('该技能没有明确的物理／魔法直接命中，暂不自动估计。');
  if (!manual && skill.supported !== true) throw new RangeError('该技能含条件、状态或多段机制；请明确填写本次有效威力与连击后再估计直接命中。');
  if (!manual && (!finite(skill.basePower) || skill.basePower <= 0)) throw new RangeError('技能基础威力资料不足。');
  let power;
  let typeMultiplier = null;
  let typeInteraction = null;
  let stab = null;
  if (manual) {
    // This is the FINAL power used by the formula, as in the calculator's
    // manual effective-power input. Do not apply STAB/type/power dice twice.
    power = override.effectivePower;
  } else {
    if (!Array.isArray(attacker.types) || !attacker.types.length) throw new RangeError('攻击方属性资料不足。');
    const type = typeContext(skill, defender, catalog);
    const mixedRelation = type.multiplier === 1 && type.factors.some(factor => factor !== 1);
    typeInteraction = resolveAwakeningType(type.multiplier, attackerAwakening, defenderAwakening, mixedRelation);
    typeMultiplier = typeInteraction.multiplier;
    stab = attacker.types.includes(skill.type) ? getAwakeningBonuses(attackerAwakening).sameTypeMultiplier : 1;
    power = Math.max(0, skill.basePower + dice.effects.skillPowerAdd + (trait.fixedPowerAdd ?? 0)) * dice.effects.powerMultiplier * (trait.powerMultiplier ?? 1) * stab * typeMultiplier;
  }
  power *= override.powerMultiplier ?? 1;
  if (!finite(power) || power < 0 || power > 10000000) throw new RangeError('本次有效威力超出可核算范围。');
  return { power, typeMultiplier, typeInteraction, stab, hitCount: override.hitCount ?? 1, manual, notes: [
    ...(manual ? ['手填最终有效威力，已跳过自动本系、克制和威力骰乘区。'] : []),
    ...(has(override, 'powerMultiplier') ? ['已追加本次明确填写的威力倍率。'] : []),
    ...(has(override, 'hitCount') ? ['逐击向下取整后按手填连击数相加。'] : []),
    ...(manual && !skill.supported ? ['仅估计本次直接命中，不包含回血、状态和其他追加结算。'] : []),
  ] };
}

function damageEntry(skillId, overrideValue, direction, context) {
  try {
    const { input, catalog, ownSpirit, target, ownDice, targetDice, ownPanel, candidates, ownTrait, ownTraitState, ownSkillTypes } = context;
    const skill = catalog.skills.find(row => row.id === skillId);
    if (!skill) throw new RangeError('请选择已收录的技能。');
    const override = readOverride(overrideValue);
    const incoming = direction === 'incoming';
    const attacker = incoming ? target : ownSpirit;
    const defender = incoming ? ownSpirit : target;
    const attackerDice = incoming ? targetDice : ownDice;
    const defenderDice = incoming ? ownDice : targetDice;
    // 己方特性：出招按攻击方规则，受击按防御方规则；野怪特性不参与。
    const trait = resolveOwnTrait(ownTrait, incoming ? 'defender' : 'attacker', ownTraitState, skill, ownSkillTypes);
    const power = resolvePower(skill, override, attacker, defender, incoming ? 0 : input.profile.awakening, incoming ? input.profile.awakening : 0, attackerDice, catalog, incoming ? {} : trait);
    const attackStat = skill.category === 'physical' ? 'physicalAttack' : 'magicalAttack';
    const defenseStat = skill.category === 'physical' ? 'physicalDefense' : 'magicalDefense';
    const needed = incoming ? [defenseStat, 'hp'] : [attackStat];
    if (!needed.every(stat => integer(ownPanel[stat], 1, 10000000))) throw new RangeError(`请补齐我方${needed.map(stat => STAT_LABELS[stat]).join('、')}实际面板。`);
    const predictions = candidates.map(candidate => {
      const attackerPanel = incoming ? candidate.panel : ownPanel;
      const defenderPanel = incoming ? ownPanel : candidate.panel;
      const hpMax = defenderPanel.hp;
      const attackerStat = incoming ? attackerPanel[attackStat] : applyAttackStage(attackerPanel[attackStat], trait);
      const defenderDefense = incoming ? applyDefenseStage(defenderPanel[defenseStat], trait) : defenderPanel[defenseStat];
      const damage = calculateDamage({
        attackerStat, defenderDefense,
        displayedPower: power.power, level: incoming ? input.level : input.profile.level,
        hitCount: power.hitCount,
        finalDamageMultiplier: attackerDice.effects.damageMultiplier * trait.finalDamageMultiplier,
        damageReductionMultiplier: defenderDice.effects.damageReductionMultiplier * (incoming ? trait.damageReductionMultiplier : 1),
      }).total;
      if (!Number.isSafeInteger(damage) || damage < 0) throw new RangeError('叠加后的伤害超过安全整数范围，请核对倍率。');
      const remainingHp = Math.max(0, hpMax - damage);
      return {
        status: 'estimated',
        natureId: candidate.nature.id, natureName: candidate.nature.name, targetLevel: input.level,
        upStat: candidate.nature.upStat, downStat: candidate.nature.downStat,
        damage, actualLossFromFull: Math.min(hpMax, damage), hpMax, remainingHp,
        remainingPercent: remainingHp * 100 / hpMax, fromFull: true,
        targetHpMax: candidate.panel.hp,
        hpModelName: incoming ? '我方实际面板及已选骰子' : candidate.hpModelName,
        targetHpModelName: candidate.hpModelName,
        attackerStat, defenderDefense,
      };
    });
    return { skillId, skillName: skill.name, direction, status: 'estimated',
      reason: ['按当前野怪假说预估，尚未通过伤害实战校准。', ...power.notes].join(' '),
      effectivePower: power.power, hitCount: power.hitCount, typeMultiplier: power.typeMultiplier,
      stab: power.stab, typeInteraction: power.typeInteraction, manualPower: power.manual, predictions };
  } catch (error) {
    return unsupported(skillId, error.message || '该技能当前无法估计。');
  }
}

/**
 * Pure preview; never promotes the experimental wild-stat model to verified.
 * targetId denotes the EXACT selected form. The UI owns family/initial-form
 * selection. effectivePower is final, while powerMultiplier is an additional
 * explicit multiplier. Duplicate dice IDs on one side are applied only once.
 */
export function previewMatchup(input, catalog, diceCatalog, traitCatalog) {
  if (input?.level === 'all') {
    const levels = targetLevels('all');
    const results = levels.map(level => previewMatchup({ ...input, level }, catalog, diceCatalog, traitCatalog));
    const mergeEntry = entries => entries[0] ? { ...entries[0], predictions: entries.flatMap(entry => entry?.predictions ?? []) } : null;
    const outgoing = results[0].outgoing.map((_, index) => mergeEntry(results.map(result => result.outgoing[index])));
    const incomingList = results[0].incomingList.map((_, index) => mergeEntry(results.map(result => result.incomingList[index])));
    const targetHpByLevel = results.flatMap(result => result.targetHpByLevel);
    const targetHpByNature = targetHpByLevel.length === levels.length
      ? Object.fromEntries(['neutral', 'up', 'down'].map(key => [key, {
        min: Math.min(...targetHpByLevel.map(row => row[key])), max: Math.max(...targetHpByLevel.map(row => row[key])),
      }])) : null;
    return { ...results[0], targetLevel: 'all', targetLevels: levels, outgoing, incomingList, incoming: incomingList[0] ?? null,
      targetHpByLevel, targetHpByNature,
      targetHpRange: targetHpByNature ? { min: Math.min(...Object.values(targetHpByNature).map(row => row.min)), max: Math.max(...Object.values(targetHpByNature).map(row => row.max)) } : null };
  }
  const skillIds = Array.isArray(input?.skillIds) ? input.skillIds.slice(0, 4) : [];
  const incomingIds = Array.isArray(input?.incomingSkillIds) ? input.incomingSkillIds.slice(0, 4) : input?.incomingSkillId ? [input.incomingSkillId] : [];
  const initial = { calibrationStatus: 'unverified', outgoing: [], incoming: null, incomingList: [], warnings: [], targetHpByNature: null, targetHpRange: null, targetHpByLevel: [], targetLevels: [] };
  try {
    if (!isObject(input)) throw new RangeError('请先选择双方精灵与技能。');
    if (input.skillIds !== undefined && !Array.isArray(input.skillIds)) throw new RangeError('技能选择须为数组。');
    if (!Array.isArray(catalog?.spirits) || !Array.isArray(catalog?.skills) || !Array.isArray(catalog?.natures)) throw new RangeError('计算资料尚未就绪。');
    if (!integer(input.level, 41, 43)) throw new RangeError('野生等级须为41至43。');
    if (!isObject(input.profile) || !integer(input.profile.level, 1, 60) || !integer(input.profile.awakening, 0, 5)) throw new RangeError('请填写我方1至60级及0至5次觉醒。');
    if (catalog.natures.length !== 30 || new Set(catalog.natures.map(row => row?.id)).size !== 30) throw new RangeError('需要完整且不重复的30种性格资料。');
    const ownSpirit = catalog.spirits.find(row => row.id === input.profile.spiritId);
    const target = catalog.spirits.find(row => row.id === input.targetId);
    if (!ownSpirit || !target) throw new RangeError('请选择目录中的双方精灵。');
    const ownDice = diceForSide(input.ownDiceIds, input.ownDiceEffects, diceCatalog, '我方');
    const targetDice = diceForSide(input.targetDiceIds, input.targetDiceEffects, diceCatalog, '敌方');
    const ownPanel = withDicePanel(input.profile.panel, ownDice);
    const candidates = catalog.natures.map(nature => {
      const panel = wildPanel(target.raceStats, input.level, nature, { shiny: wildTargetShiny(input) });
      return { nature, panel: withDicePanel(panel, targetDice),
        hpModelName: WILD_HP_MODEL.confirmedSpecies.includes(target.name) ? '深蓝鲸实测生命曲线' : '生命曲线（统一公式外推）' };
    });
    const targetHpByNature = { neutral: null, up: null, down: null };
    for (const { nature, panel } of candidates) {
      const group = nature.upStat === 'hp' ? 'up' : nature.downStat === 'hp' ? 'down' : 'neutral';
      targetHpByNature[group] = panel.hp;
    }
    const targetHpRange = { min: Math.min(...candidates.map(row => row.panel.hp)), max: Math.max(...candidates.map(row => row.panel.hp)) };
    if (input.skillOverrides !== undefined && input.skillOverrides !== null && !isObject(input.skillOverrides)) throw new RangeError('技能覆盖值须按技能编号分别填写。');
    const ownTrait = traitInfo(traitCatalog, ownSpirit.traitName);
    const ownTraitState = isObject(input.ownTrait) ? input.ownTrait : {};
    const ownSkillTypes = skillIds.map(id => catalog.skills.find(row => row.id === id)?.type).filter(Boolean);
    const context = { input, catalog, ownSpirit, target, ownDice, targetDice, ownPanel, candidates, ownTrait, ownTraitState, ownSkillTypes };
    const outgoing = skillIds.map(id => damageEntry(id, isObject(input.skillOverrides) && has(input.skillOverrides, id) ? input.skillOverrides[id] : undefined, 'outgoing', context));
    const incomingOverrides = index => Array.isArray(input.incomingOverridesList) ? input.incomingOverridesList[index] : index === 0 ? input.incomingOverrides : undefined;
    const incomingList = incomingIds.map((id, index) => id ? damageEntry(id, incomingOverrides(index), 'incoming', context) : null);
    const incoming = incomingList[0] ?? null;
    const warnings = unique([...ownDice.warnings, ...targetDice.warnings]);
    return { ...initial, status: [...outgoing, ...incomingList].some(row => row?.status === 'estimated') ? 'estimated' : 'unsupported',
      outgoing, incoming, incomingList, warnings, ownPanel, ownTrait, ownDiceIds: ownDice.ids, targetDiceIds: targetDice.ids,
      targetId: target.id, ownSpiritId: ownSpirit.id, targetLevel: input.level, targetLevels: [input.level], hpModel: WILD_HP_MODEL,
      targetHpByNature, targetHpRange, targetHpByLevel: [{ level: input.level, ...targetHpByNature }] };
  } catch (error) {
    const reason = error.message || '当前输入无法预估。';
    return { ...initial, status: 'unsupported', reason,
      outgoing: skillIds.map(id => unsupported(id, reason)),
      incoming: incomingIds[0] ? unsupported(incomingIds[0], reason) : null,
      incomingList: incomingIds.map(id => id ? unsupported(id, reason) : null),
      warnings: [reason] };
  }
}

/** Preserve all +/- nature rows while providing a compact six-group view. */
export function groupPredictions(predictions) {
  if (!Array.isArray(predictions)) return [];
  return STATS.flatMap(upStat => {
    const rows = predictions.filter(row => row?.upStat === upStat && finite(row.damage) && finite(row.remainingPercent) && finite(row.hpMax));
    if (!rows.length) return [];
    const range = key => ({ min: Math.min(...rows.map(row => row[key])), max: Math.max(...rows.map(row => row[key])) });
    return [{ upStat, label: STAT_LABELS[upStat], count: rows.length, damage: range('damage'),
      remainingPercent: range('remainingPercent'), hpMax: range('hpMax'), predictions: rows }];
  });
}
