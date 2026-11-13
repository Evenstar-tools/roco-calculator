import { isWildLevel } from './wild-levels.mjs';
import { calculateDamage } from './vendor/damage.mjs';
import { getAwakeningBonuses, resolveAwakeningType } from './awakening.mjs';
import { wildPanel, targetLevels } from './engine.mjs';
import { resolveWildTarget, missingWildRaceReason } from './wild-forms.mjs';
import { WILD_HP_MODEL, wildTargetShiny, calculateWildHp } from './wild-hp.mjs';
import { resolveWildAttack } from './wild-attack.mjs';
import { resolveWildDefense } from './wild-defense.mjs';
export { SHINY_HP_MULTIPLIER } from './wild-hp.mjs';
import { traitInfo, resolveOwnTrait, diceTraitMultiplier } from './own-trait.mjs';

const STATS = ['hp', 'physicalAttack', 'magicalAttack', 'physicalDefense', 'magicalDefense', 'speed'];
const STAT_LABELS = { hp: '生命', physicalAttack: '物攻', magicalAttack: '魔攻', physicalDefense: '物防', magicalDefense: '魔防', speed: '速度' };
const EFFECT_DEFAULTS = {
  hpMultiplier: 1, physicalAttackMultiplier: 1, magicalAttackMultiplier: 1,
  physicalDefenseMultiplier: 1, magicalDefenseMultiplier: 1, speedMultiplier: 1,
  powerMultiplier: 1, skillPowerAdd: 0, damageMultiplier: 1,
  damageReductionMultiplier: 1, critMultiplier: 1,
};
const OVERRIDE_KEYS = new Set(['effectivePower', 'displayedPower', 'hitCount', 'powerMultiplier', 'firstAction', 'note']);
const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const finite = value => typeof value === 'number' && Number.isFinite(value);
const integer = (value, low, high) => Number.isSafeInteger(value) && value >= low && value <= high;
const has = (value, key) => Object.hasOwn(value, key);
const unique = values => [...new Set(values)];
const TYPE_DICE_COEFFICIENTS = new Map([
  [7, { relation: 'super-effective', value: 2.5 }],
  [8, { relation: 'resistance', value: .4 }],
  [14, { relation: 'super-effective', value: 3.5 }],
  [15, { relation: 'resistance', value: .25 }],
]);

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
  const activeIds = selectedIds.filter(id => id !== 'none');
  if (activeIds.length > 1) throw new RangeError(`${label}目前只支持选择一个实际骰面；多个效果请核对后改用合计手填，不能自动推断叠加规则。`);
  if (manualEffects !== undefined) validateEffects(manualEffects);
  if (activeIds.length && Object.entries(manualEffects ?? {}).some(([key, value]) => value !== EFFECT_DEFAULTS[key])) {
    throw new RangeError(`${label}骰子预设不能与额外手填效果同时叠加；请只保留预设，或将本场所有效果改为合计手填。`);
  }
  const effects = { ...EFFECT_DEFAULTS };
  const warnings = [];
  const typeCoefficientEffects = [];
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
    if (dice && has(dice, 'typeCoefficient')) {
      const expected = TYPE_DICE_COEFFICIENTS.get(dice.gameEffectId);
      const coefficient = dice.typeCoefficient;
      // Exact descriptors only. Legacy catalogs marked these reference-only;
      // the single-relation trial now handles them before scalar effects.
      if (id !== `game-dice-effect-${dice.gameEffectId}` || typeof dice.supported !== 'boolean' || !expected
        || !isObject(coefficient) || Object.keys(coefficient).length !== 2
        || coefficient.relation !== expected.relation || coefficient.value !== expected.value
        || !isObject(dice.effects) || Object.keys(dice.effects).length !== 0) {
        throw new RangeError(`${label}骰子「${dice.name || id}」的系数描述无效，暂不自动核算。`);
      }
      typeCoefficientEffects.push({ id, gameEffectId: dice.gameEffectId, name: dice.name,
        relation: coefficient.relation, value: coefficient.value, side: label });
      warnings.push(`${label}骰子「${dice.name}」按单关系系数试算，觉醒组合沿用当前模型，未完成独立实战验证。`);
      continue;
    }
    if (!dice || dice.supported !== true) throw new RangeError(`${label}骰子「${dice?.name || id}」暂不自动核算：${dice?.unsupportedReason || '实际效果未确认。'}`);
    combine(dice.effects);
    if (dice.requiresConfirmation) warnings.push(dice.supportStatus === 'trial'
      ? `${label}「${dice.name}」按原包单项参数试算；作用阶段及取整仍待本场实战核对。`
      : `${label}「${dice.name}」按已选的人工数值预设估计，请核对本场效果。`);
  }
  if (manualEffects !== undefined) {
    combine(manualEffects);
    if (Object.keys(manualEffects).length) warnings.push(`${label}骰子使用手填的明确数值，乘区及取整仍待实战核对。`);
  }
  return { ids: selectedIds, effects, warnings, typeCoefficientEffects };
}

function withDicePanel(panel, dice, { wildStats = false, panelIncludesDice = false } = {}) {
  if (!isObject(panel)) throw new RangeError('请填写我方实际面板。');
  const result = {};
  for (const stat of STATS) {
    if (!has(panel, stat) || panel[stat] === null || panel[stat] === undefined) continue;
    const preserve = wildStats && ['physicalAttack', 'magicalAttack', 'physicalDefense', 'magicalDefense'].includes(stat);
    if (preserve ? !finite(panel[stat]) || panel[stat] < 1 || panel[stat] > 100000 : !integer(panel[stat], 1, 100000)) throw new RangeError(`${STAT_LABELS[stat]}面板须为正整数。`);
    // Four combat attributes stay at their base values. Dice are ability
    // modifiers resolved in power per hit, without rounding combat panels.
    // Explicit custom HP remains a separate battle pool, not an ability level.
    const value = panel[stat] * (!panelIncludesDice && stat === 'hp' ? dice.effects.hpMultiplier : 1);
    result[stat] = Math.max(1, stat === 'hp' ? Math.round(value) : value);
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

function singleRelationDice(type, attackerDice, defenderDice) {
  // Package order42 descriptions distinguish damage dealt while exploiting a
  // weakness from damage received while resisting. The four dice descriptors
  // specify absolute coefficients, not universal final-damage multipliers.
  // This is a bounded model, not a recovered order42 consumer. In particular,
  // applying the existing awakening fit after it is still an empirical choice.
  const relevant = [...attackerDice.typeCoefficientEffects.filter(row => row.relation === 'super-effective'),
    ...(defenderDice?.typeCoefficientEffects ?? []).filter(row => row.relation === 'resistance')];
  const factors = type.factors.filter(factor => factor !== 1);
  if (type.multiplier === 0 || factors.length === 0 || relevant.length === 0) {
    return { multiplier: type.multiplier, applied: [] };
  }
  if (factors.length > 1 || relevant.length > 1) {
    throw new RangeError('本场骰子与双系、极化／钝化的组合尚未完成验证；请在技能设置中填写已知最终威力。');
  }
  const effect = relevant.find(row => row.relation === (type.multiplier > 1 ? 'super-effective' : 'resistance'));
  return { multiplier: effect?.value ?? type.multiplier, applied: effect ? [effect] : [] };
}

function readOverride(value) {
  if (value === undefined || value === null) return {};
  if (!isObject(value)) throw new RangeError('本次技能覆盖值须为对象。');
  if (Object.keys(value).some(key => !OVERRIDE_KEYS.has(key))) throw new RangeError('本次技能包含未支持的覆盖字段。');
  if (has(value, 'effectivePower') && (!finite(value.effectivePower) || value.effectivePower < 0 || value.effectivePower > 100000)) throw new RangeError('有效威力须为0至100000的有限数字。');
  if (has(value, 'displayedPower') && (!finite(value.displayedPower) || value.displayedPower < 0 || value.displayedPower > 100000)) throw new RangeError('显示威力须为0至100000的有限数字。');
  if (has(value, 'displayedPower') && has(value, 'effectivePower')) throw new RangeError('显示威力与旧最终威力不可同时填写。');
  if (has(value, 'hitCount') && !integer(value.hitCount, 1, 100)) throw new RangeError('本次连击数须为1至100的整数。');
  if (has(value, 'powerMultiplier') && (!finite(value.powerMultiplier) || value.powerMultiplier < 0 || value.powerMultiplier > 100)) throw new RangeError('本次额外威力倍率须为0至100的有限数字。');
  if (has(value, 'firstAction') && typeof value.firstAction !== 'boolean') throw new RangeError('入场首次行动须为布尔值。');
  return value;
}

// The catalog uses power 1 as a placeholder for four variable-power moves.
// Their actual displayed power can still be entered explicitly.
export const canPreviewBasePower = skill => ['physical', 'magical'].includes(skill?.category)
  && finite(skill.basePower) && skill.basePower > 1;

export function defaultSkillHitCount(skill) {
  const count = Number(skill?.description?.match(/造成(?:物理伤害|魔法伤害|物伤|魔伤)[，,]\s*(\d+)连击/)?.[1] ?? 1);
  return integer(count, 1, 100) ? count : 1;
}

// CN DESC_NOTE_CONF 1010 defines burst as the first action after entering.
// SKILL_CONF 7020980 and BUFFBASE_CONF 2093009 give this move +30.
// Full HP alone does not establish that condition; other burst rules remain explicit.
export function firstActionPowerBonus(skill) {
  return skill?.name === '天旋地转' ? 30 : 0;
}

function resolvePower(skill, override, attacker, defender, attackerAwakening, defenderAwakening, dice, catalog, trait = {}, defenderDice) {
  const powerMode = has(override, 'displayedPower') ? 'displayed' : has(override, 'effectivePower') ? 'final' : 'auto';
  const manual = powerMode !== 'auto';
  const hitCount = override.hitCount ?? (powerMode === 'final' ? 1 : defaultSkillHitCount(skill));
  if (!['physical', 'magical'].includes(skill.category)) throw new RangeError('该技能没有明确的物理／魔法直接命中。');
  // supported is the legacy record filter, not a gate on base-power preview.
  // Resolve the current direct hit; optional power/count overrides model triggers.
  if (!manual && !canPreviewBasePower(skill)) throw new RangeError('该技能威力随战况变化，请填写本次显示威力。');
  const firstActionPowerAdd = !manual && override.firstAction === true ? firstActionPowerBonus(skill) : 0;
  let displayedPower = null, typeInteraction = null, typeMultiplier = null, stab = null, power;
  const typeDice = [...dice.typeCoefficientEffects, ...(defenderDice?.typeCoefficientEffects ?? [])];
  if (powerMode === 'final') {
    // Preserve old saved overrides. Never reinterpret them as skill-bar power.
    power = override.effectivePower;
    if (typeDice.length) typeInteraction = { model: 'explicit-final-power-override', formulaVerified: false, recordedDiceEffects: typeDice };
  } else {
    const type = typeContext(skill, defender, catalog);
    const diceType = singleRelationDice(type, dice, defenderDice);
    const mixed = type.multiplier === 1 && type.factors.some(factor => factor !== 1);
    typeInteraction = resolveAwakeningType(type.multiplier, attackerAwakening, defenderAwakening, mixed);
    if (typeDice.length) typeInteraction = { ...typeInteraction,
      multiplier: diceType.multiplier * typeInteraction.correctionMultiplier,
      diceBaseMultiplier: diceType.multiplier, recordedDiceEffects: typeDice, appliedDiceEffects: diceType.applied,
      diceModel: 'single-relation-descriptor-with-existing-awakening-v1',
      formulaVerified: false, approximate: diceType.applied.length > 0 || typeInteraction.approximate,
      diceFormulaRecovered: false, diceInteractionLiveVerified: false };
    typeMultiplier = typeInteraction.multiplier;
    if (powerMode === 'displayed') {
      displayedPower = typeDice.length && type.multiplier === 0 ? 0 : override.displayedPower;
    } else {
      if (!Array.isArray(attacker.types) || !attacker.types.length) throw new RangeError('攻击方属性资料不足。');
      stab = attacker.types.includes(skill.type) ? getAwakeningBonuses(attackerAwakening).sameTypeMultiplier : 1;
      displayedPower = Math.max(0, skill.basePower + firstActionPowerAdd + dice.effects.skillPowerAdd + (trait.fixedPowerAdd ?? 0))
        * dice.effects.powerMultiplier * (trait.powerMultiplier ?? 1) * stab * diceType.multiplier;
    }
    // Game/standard-calculator skill-bar power excludes the PVE correction.
    power = displayedPower * typeInteraction.correctionMultiplier;
  }
  const extra = override.powerMultiplier ?? 1;
  power *= extra;
  if (displayedPower !== null) displayedPower *= extra;
  if (!finite(power) || power < 0 || power > 10000000) throw new RangeError('本次威力超出可核算范围。');
  return { power, displayedPower, powerMode, firstActionPowerAdd, typeMultiplier, typeInteraction, stab, hitCount, manual, notes: [
    ...(powerMode === 'displayed' ? ['按手填显示威力结算，已包含的特性及骰子攻防、威力加成不重复叠加。'] : []),
    ...(powerMode === 'final' ? ['按最终威力口径结算，系别与觉醒不再额外换算；恢复自动后按当前条件试算。'] : []),
    ...(powerMode === 'final' && typeDice.length ? ['本次按显式最终威力绕过骰子系数换算；其与极化／钝化的公式尚未验证。'] : []),
    ...(powerMode !== 'final' && typeInteraction?.appliedDiceEffects?.length
      ? [`骰子系别系数 ${typeInteraction.baseMultiplier} → ${typeInteraction.diceBaseMultiplier}；${powerMode === 'displayed' ? '已含于手填显示威力，不重复添加' : '按单关系结算'}，觉醒沿用当前模型。`] : []),
  ] };
}

function damageEntry(skillId, overrideValue, direction, context) {
  try {
    const { input, catalog, ownSpirit, target, ownDice, targetDice, ownPanel, candidates, ownTrait, ownTraitState, ownSkillTypes } = context;
    const skill = catalog.skills.find(row => row.id === skillId);
    if (!skill) throw new RangeError('请选择已收录的技能。');
    const override = readOverride(overrideValue);
    const incoming = direction === 'incoming';
    if (!incoming && target.wildDefenseRaceStats == null) throw new RangeError(missingWildRaceReason(target, 'defense'));
    if (incoming && target.wildAttackRaceStats == null) throw new RangeError(missingWildRaceReason(target, 'attack'));
    if (incoming && ![1, 2, 3].includes(target.wildStrengthStage)) throw new RangeError('野怪强度阶段缺失或无效，双攻计算需要明确的1至3阶段。');
    const attacker = incoming ? target : ownSpirit;
    const defender = incoming ? ownSpirit : target;
    const attackerDice = incoming ? targetDice : ownDice;
    const defenderDice = incoming ? ownDice : targetDice;
    // 己方特性：出招按攻击方规则，受击按防御方规则；野怪特性不参与。
    const trait = resolveOwnTrait(ownTrait, incoming ? 'defender' : 'attacker', ownTraitState, skill, ownSkillTypes);
    const attackStat = skill.category === 'physical' ? 'physicalAttack' : 'magicalAttack';
    const defenseStat = skill.category === 'physical' ? 'physicalDefense' : 'magicalDefense';
    if (has(override, 'displayedPower') && input.profile.panelIncludesDice === true
      && ownDice.effects[`${incoming ? defenseStat : attackStat}Multiplier`] !== 1) {
      // An integer combat panel cannot recover its original pre-dice value
      // reliably. Dividing it here would invent a rounding rule.
      throw new RangeError('显示威力与已含骰子攻防的我方面板会重复编码同一加成；请恢复未含骰子的基础面板，或清空显示威力使用自动试算。');
    }
    const power = resolvePower(skill, override, attacker, defender, incoming ? 0 : input.profile.awakening, incoming ? input.profile.awakening : 0, attackerDice, catalog, incoming ? {} : trait, defenderDice);
    const needed = incoming ? [defenseStat, 'hp'] : [attackStat];
    if (!needed.every(stat => finite(ownPanel[stat]) && ownPanel[stat] >= 1 && ownPanel[stat] <= 10000000)) throw new RangeError(`请补齐我方${needed.map(stat => STAT_LABELS[stat]).join('、')}实际面板。`);
    const attackMultiplier = diceTraitMultiplier(attackerDice.effects[`${attackStat}Multiplier`], incoming ? 0 : trait.attackStage, trait);
    const defenseMultiplier = diceTraitMultiplier(defenderDice.effects[`${defenseStat}Multiplier`], incoming ? trait.defenseStage : 0, trait);
    const manualDisplay = power.powerMode === 'displayed';
    // Preserve the saved contract of an explicitly supplied combat panel.
    // Never divide its integer value to invent the original base panel.
    const includedAttack = !incoming && input.profile.panelIncludesDice === true ? ownDice.effects[`${attackStat}Multiplier`] : 1;
    const includedDefense = incoming && input.profile.panelIncludesDice === true ? ownDice.effects[`${defenseStat}Multiplier`] : 1;
    const battlePowerMultiplier = manualDisplay ? 1 : (attackMultiplier / includedAttack) / (defenseMultiplier / includedDefense);
    const calculationPower = power.power * battlePowerMultiplier;
    const predictions = candidates.map(candidate => {
      const attackerPanel = incoming ? candidate.panel : ownPanel;
      const defenderPanel = incoming ? ownPanel : candidate.panel;
      const hpMax = defenderPanel.hp;
      const attackerStat = attackerPanel[attackStat];
      const defenderDefense = defenderPanel[defenseStat];
      const damage = calculateDamage({
        attackerStat, defenderDefense,
        displayedPower: calculationPower, level: incoming ? input.level : input.profile.level,
        hitCount: power.hitCount,
        finalDamageMultiplier: attackerDice.effects.damageMultiplier * trait.finalDamageMultiplier,
        damageReductionMultiplier: defenderDice.effects.damageReductionMultiplier * (incoming ? trait.damageReductionMultiplier : 1),
      }).total;
      if (!Number.isSafeInteger(damage) || damage < 0) throw new RangeError('叠加后的伤害超过安全整数范围，请核对倍率。');
      const remainingHp = Math.max(0, hpMax - damage);
      return {
        status: 'estimated',
        natureId: candidate.nature.id, natureName: candidate.nature.name, targetLevel: input.level,
        ...(target.wildStatFormId ? { wildStatFormId: target.wildStatFormId } : {}),
        upStat: candidate.nature.upStat, downStat: candidate.nature.downStat,
        damage, actualLossFromFull: Math.min(hpMax, damage), hpMax, remainingHp,
        remainingPercent: remainingHp * 100 / hpMax, fromFull: true,
        targetHpMax: candidate.panel.hp,
        hpModelName: incoming ? '我方实际面板及已选骰子' : candidate.hpModelName,
        targetHpModelName: candidate.hpModelName,
        attackerStat, defenderDefense,
        baseAttackerStat: attackerPanel[attackStat], baseDefenderDefense: defenderPanel[defenseStat],
        // Evidence describes the pre-dice wild stat resolved by the same model.
        wildStatEvidence: incoming
          ? resolveWildAttack(target.raceStats[attackStat], input.level, candidate.nature, attackStat, target.wildStrengthStage)
          : resolveWildDefense(target.wildDefenseRaceStats[defenseStat], input.level, candidate.nature,
            defenseStat, target.wildStrengthStage, target.wildDefenseRaceStats.sourcePetbaseId),
      };
    });
    const displayRatio = power.powerMode === 'auto'
      // Report the selected modifiers in skill-bar power even when the input
      // combat panel already contains them. This ratio never enters damage.
      ? attackMultiplier / defenseMultiplier : 1;
    return { skillId, skillName: skill.name, direction, status: 'estimated',
      reason: power.notes.join(' '),
      displayedPower: power.displayedPower === null ? null : Number((power.displayedPower * displayRatio).toFixed(10)),
      powerMode: power.powerMode,
      firstActionPowerAdd: power.firstActionPowerAdd,
      effectivePower: calculationPower, hitCount: power.hitCount, typeMultiplier: power.typeMultiplier,
      battleBuffs: { attackMultiplier, defenseMultiplier, powerMultiplier: battlePowerMultiplier,
        applied: !manualDisplay, model: 's5-battle-power-ratio-v1' },
      stab: power.stab, typeInteraction: power.typeInteraction, manualPower: power.manual, predictions };
  } catch (error) {
    return unsupported(skillId, error.message || '该技能当前无法估计。');
  }
}

/**
 * Pure preview; never promotes the experimental wild-stat model to verified.
 * targetId denotes the EXACT selected form. The UI owns family/initial-form
 * selection. displayedPower includes battle boosts but excludes PVE polarization;
 * legacy effectivePower remains final. powerMultiplier is an additional
 * explicit multiplier. A side accepts one selected face or a manual total;
 * duplicate IDs are applied once, but multiple faces are not auto-combined.
 * panelIncludesDice marks an already-adjusted own combat panel. A displayed
 * power override then requires a pre-dice panel for the relevant attack/defense.
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
      targetHpByLevel, targetHpByNature, targetBodyHpByLevel: results.flatMap(result => result.targetBodyHpByLevel),
      targetHpRange: targetHpByNature ? { min: Math.min(...Object.values(targetHpByNature).map(row => row.min)), max: Math.max(...Object.values(targetHpByNature).map(row => row.max)) } : null };
  }
  const skillIds = Array.isArray(input?.skillIds) ? input.skillIds.slice(0, 5) : [];
  const incomingIds = Array.isArray(input?.incomingSkillIds) ? input.incomingSkillIds.slice(0, 4) : input?.incomingSkillId ? [input.incomingSkillId] : [];
  const initial = { calibrationStatus: 'unverified', outgoing: [], incoming: null, incomingList: [], warnings: [], targetHpByNature: null, targetHpRange: null, targetHpByLevel: [], targetBodyHpByLevel: [], targetLevels: [] };
  try {
    if (!isObject(input)) throw new RangeError('请先选择双方精灵与技能。');
    if (input.skillIds !== undefined && !Array.isArray(input.skillIds)) throw new RangeError('技能选择须为数组。');
    if (!Array.isArray(catalog?.spirits) || !Array.isArray(catalog?.skills) || !Array.isArray(catalog?.natures)) throw new RangeError('计算资料尚未就绪。');
    if (!isWildLevel(input.level)) throw new RangeError('野怪等级须为1至60的整数。');
    if (!isObject(input.profile) || !integer(input.profile.level, 1, 60) || !integer(input.profile.awakening, 0, 5)) throw new RangeError('请填写我方1至60级及0至5次觉醒。');
    if (has(input.profile, 'panelIncludesDice') && typeof input.profile.panelIncludesDice !== 'boolean') throw new RangeError('profile.panelIncludesDice 须为布尔值，表示我方面板是否已含骰子属性加成。');
    if (catalog.natures.length !== 30 || new Set(catalog.natures.map(row => row?.id)).size !== 30) throw new RangeError('需要完整且不重复的30种性格资料。');
    const ownSpirit = catalog.spirits.find(row => row.id === input.profile.spiritId);
    const target = resolveWildTarget(catalog.spirits.find(row => row.id === input.targetId), input.wildStatFormId);
    if (!ownSpirit || !target) throw new RangeError('请选择目录中的双方精灵。');
    const ownDice = diceForSide(input.ownDiceIds, input.ownDiceEffects, diceCatalog, '我方');
    const targetDice = diceForSide(input.targetDiceIds, input.targetDiceEffects, diceCatalog, '敌方');
    const panelIncludesDice = input.profile.panelIncludesDice === true;
    const ownPanel = withDicePanel(input.profile.panel, ownDice, { panelIncludesDice });
    const candidates = catalog.natures.map(nature => {
      const panel = wildPanel(target.raceStats, input.level, nature, { shiny: wildTargetShiny(input), attackRaceStats: target.wildAttackRaceStats, defenseRaceStats: target.wildDefenseRaceStats, strengthStage: target.wildStrengthStage });
      return { nature, basePanel: panel, panel: withDicePanel(panel, targetDice, { wildStats: true }),
        hpModelName: WILD_HP_MODEL.confirmedSpecies.includes(target.name) ? '深蓝鲸实测生命曲线' : '生命曲线（统一公式外推）' };
    });
    const targetHpByNature = { neutral: null, up: null, down: null };
    const targetBodyHpByNature = { neutral: null, up: null, down: null };
    for (const { nature, panel } of candidates) {
      const group = nature.upStat === 'hp' ? 'up' : nature.downStat === 'hp' ? 'down' : 'neutral';
      targetHpByNature[group] = panel.hp;
      // Evil Exchange heals the post-shield body, not the ordinary/shiny shield pool.
      targetBodyHpByNature[group] = calculateWildHp(target.raceStats.hp, input.level, nature) / WILD_HP_MODEL.ordinaryMultiplier;
    }
    const targetHpRange = { min: Math.min(...candidates.map(row => row.panel.hp)), max: Math.max(...candidates.map(row => row.panel.hp)) };
    if (input.skillOverrides !== undefined && input.skillOverrides !== null && !isObject(input.skillOverrides)) throw new RangeError('技能覆盖值须按技能编号分别填写。');
    const ownTrait = traitInfo(traitCatalog, ownSpirit.traitName);
    const ownTraitState = isObject(input.ownTrait) ? input.ownTrait : {};
    // The optional fifth row is a comparison slot, not an extra equipped skill.
    const ownSkillTypes = skillIds.slice(0, 4).map(id => catalog.skills.find(row => row.id === id)?.type).filter(Boolean);
    const context = { input, catalog, ownSpirit, target, ownDice, targetDice, ownPanel, candidates, ownTrait, ownTraitState, ownSkillTypes };
    const outgoing = skillIds.map(id => damageEntry(id, isObject(input.skillOverrides) && has(input.skillOverrides, id) ? input.skillOverrides[id] : undefined, 'outgoing', context));
    const incomingOverrides = index => Array.isArray(input.incomingOverridesList) ? input.incomingOverridesList[index] : index === 0 ? input.incomingOverrides : undefined;
    const incomingList = incomingIds.map((id, index) => id ? damageEntry(id, incomingOverrides(index), 'incoming', context) : null);
    const incoming = incomingList[0] ?? null;
    const warnings = unique([...ownDice.warnings, ...targetDice.warnings,
      ...(panelIncludesDice ? ['我方面板已含骰子属性加成，六维数值不重复叠加；技能固定威力仍按所选效果处理。'] : []),
    ]);
    return { ...initial, status: [...outgoing, ...incomingList].some(row => row?.status === 'estimated') ? 'estimated' : 'unsupported',
      outgoing, incoming, incomingList, warnings, ownPanel, ownTrait, ownDiceIds: ownDice.ids, targetDiceIds: targetDice.ids,
      panelIncludesDice,
      diceApplication: { ownPanel: panelIncludesDice ? 'already-included' : 'base-with-battle-hp',
        targetPanel: 'base-with-battle-hp', combatStats: 's5-battle-power-ratio-v1', typeCoefficientEffects: [...ownDice.typeCoefficientEffects, ...targetDice.typeCoefficientEffects] },
      wildStrengthStage: target.wildStrengthStage, wildStrengthStageEvidence: target.wildStrengthStageEvidence,
      targetId: target.id, ownSpiritId: ownSpirit.id, targetLevel: input.level, targetLevels: [input.level], hpModel: WILD_HP_MODEL,
      ...(target.wildStatFormId ? { wildStatFormId: target.wildStatFormId, wildStatFormName: target.wildStatFormName } : {}),
      targetHpByNature, targetHpRange, targetHpByLevel: [{ level: input.level, ...targetHpByNature }],
      targetBodyHpByLevel: [{ level: input.level, ...targetBodyHpByNature }],
      evilExchangeUnavailableReason: targetDice.effects.hpMultiplier !== 1 ? '野怪生命倍率有改动，请在无生命上限增益时测量。' : '' };
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
