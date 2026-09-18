import { calculateMatchup } from "../../domain/calculate.js";
import { getTraitView } from "../../domain/calculator-view-model.js";
import { getEffectiveTraits } from "../../domain/effective-traits.js";
import { getTraitEffectRule } from "../../domain/trait-effects.js";
import { getNatureMultipliers } from "../../domain/natures.js";
import { calculateAllPanelStats } from "../../domain/stat.js";
import { calculateFreezeThreshold, calculateNegativeStatusSettlement } from "../../domain/negative-status.js";
import { chooseDefaultSkillIds } from "../../domain/skill-loadout.js";
import { createInitialState } from "../../state/defaults.js";
import { canonicalTraitControlKey, materializeTraitContext } from "../../state/trait-values.js";
import { applyBattleActivation } from "../../state/battle-activation.js";
import { updateGlobalWeather } from "../../state/calculator-session.js";

const zeroIvs = { hp: 0, physicalAttack: 0, magicalAttack: 0, physicalDefense: 0, magicalDefense: 0, speed: 0 };
export const DEER_NAMES = ["波普鹿", "爵士鹿"];
export const DEFENSE_TEMPLATES = [
  { id: "tank", label: "满耐久", nature: "silent", displayIvs: { ...zeroIvs, hp: 60, physicalDefense: 60, magicalDefense: 60 } },
  { id: "hp", label: "生命", nature: "neutral", displayIvs: { ...zeroIvs, hp: 60 } },
  { id: "physical", label: "生命物防", nature: "silent", displayIvs: { ...zeroIvs, hp: 60, physicalDefense: 60 } },
  { id: "none", label: "无耐久", nature: "neutral", displayIvs: { ...zeroIvs } },
];
export const DEER_VARIANTS = [
  { id: "arc", name: "电弧", label: "电弧 · 普通", context: { burstTriggered: false }, note: "可切换离子火花；威力相同，能耗不同" },
  { id: "burst", name: "电弧", label: "电弧 · 迸发", context: { burstTriggered: true }, condition: "需触发迸发" },
  { id: "bet-light", name: "下注", label: "下注 · 明", context: { betMode: "fixed" }, note: "本次加威40；出招后自身失去10%最大生命" },
  { id: "bet-dark", name: "下注", label: "下注 · 暗", context: { betMode: "lowHp" }, condition: "生命＜50%加威", note: "按实际自身生命计算；未低于50%时不加威" },
  { id: "stone", name: "裂石", label: "裂石 · 普通", context: {} },
  { id: "stone-counter", name: "裂石", label: "裂石 · 应对状态", context: { counterTriggered: true }, condition: "需应对状态", note: "本击按原物防；命中后物防−80%，影响后续先发" },
  { id: "light", name: "光刃", label: "光刃", context: {} },
  { id: "discharge", name: "通电", label: "通电", context: {} },
  { id: "first", name: "先发制人", label: "先发制人", context: {} },
];

export function panelFor(snapshot, side) {
  const spirit = snapshot.spirits.find((entry) => entry.id === side.spiritId);
  return calculateAllPanelStats({ raceStats: spirit.raceStats, displayIvs: side.displayIvs, natureMultipliers: getNatureMultipliers(side.nature) });
}

export function getDeerSpeedComparison(calculation) {
  const forward = calculation.forward?.results?.[0]?.combatPanel;
  const reverse = calculation.reverse?.results?.[0]?.combatPanel;
  const attacker = forward?.attacker?.speed ?? reverse?.defender?.speed;
  const defender = reverse?.attacker?.speed ?? forward?.defender?.speed;
  if (!Number.isFinite(attacker) || !Number.isFinite(defender)) {
    return { state: "unknown", label: "速度待确认", attacker: null, defender: null };
  }
  const state = attacker > defender ? "faster" : attacker === defender ? "tie" : "slower";
  return { state, label: { faster: "可以先手", tie: "需要拼速", slower: "无法先手" }[state], attacker, defender };
}

export function getDeerDefenseLimitations(snapshot, side) {
  if (side.ignoreTraits) return [];
  const spirit = snapshot.spirits.find((entry) => entry.id === side.spiritId);
  const ids = new Set([...(spirit?.traitIds ?? []), ...(side.acquiredTraitIds ?? [])]);
  const names = [spirit?.traitName, ...snapshot.traits.filter((trait) => ids.has(trait.id)).map((trait) => trait.name)];
  return [...new Set(names.filter((name) => ["不死鸟", "化茧"].includes(name)))];
}

export function hasDeerDefenseTrait(snapshot, side) {
  const spirit = snapshot.spirits.find((entry) => entry.id === side.spiritId);
  if (!spirit) return false;
  // 按支持的防守规则判断，不以当前层数或开关判断，避免关闭后失去恢复入口。
  const traits = getEffectiveTraits(snapshot, { ...side, spirit, ignoreTraits: false });
  return traits.some((trait) => {
    if (["铭记于月亮", "不死鸟", "化茧"].includes(trait.name)) return true;
    if (["reduce_matching_skill_type", "reduce_matching_skill_type_strong", "reduce_off_type", "damage_reduction_multiplier", "final_damage_multiplier"].includes(trait.ruleId)) return true;
    const rule = getTraitEffectRule(trait, "defender");
    return ["attack_defense_percent", "split_attack_defense_percent", "defense_percent", "physical_defense_percent", "fixed_power_physical_defense", "weekend_attack_weekday_defense_percent", "damage_reduction_percent", "final_damage_percent"].includes(rule?.kind);
  });
}


function deerStackScanLimit(stackControl, setupStacks = 0) {
  if (Number.isFinite(stackControl?.max)) return Math.max(0, Math.floor(stackControl.max));
  return Math.max(0, Math.floor(Number(setupStacks) || 0), 99);
}

export function createDeerSetup(snapshot, currentState = null) {
  if (currentState) {
    const setup = createDeerSetup(snapshot);
    setup.state = structuredClone(currentState);
    setup.attackPreset = "current";
    setup.defenseTemplate = "current";
    const context = setup.state.directions.forward.context;
    const attacker = snapshot.spirits.find((spirit) => spirit.id === setup.state.sides.attacker.spiritId);
    const stackControl = getTraitView(snapshot, attacker, "attacker").inputs.find((input) => input.contextKey === "attackerTraitStacks");
    const traits = materializeTraitContext(setup.state.sides.attacker.traitValues, snapshot, attacker.id, "attacker");
    const stackCap = Number.isFinite(stackControl.max) ? stackControl.max : null;
    const rawStacks = Math.floor(Number(context[stackControl.id] ?? traits[stackControl.id] ?? stackControl.defaultValue) || 0);
    setup.stacks = Math.max(0, stackCap == null ? rawStacks : Math.min(stackCap, rawStacks));
    for (const [side, direction, key] of [["attacker", "reverse", "attackerHp"], ["defender", "forward", "defenderHp"]]) {
      if (!setup.state.sides[side].spiritId) continue;
      const maxHp = panelFor(snapshot, setup.state.sides[side]).hp;
      setup[key] = Math.max(1, Math.min(100, (setup.state.directions[direction].currentHp ?? maxHp) / maxHp * 100));
    }
    setup.weather = context.weatherBlizzard ? "blizzard" : context.weatherSandstorm ? "sandstorm" : context.weatherThunder ? "thunder" : context.weatherRainTurns > 0 ? "rain" : "none";
    setup.freeze = setup.state.negativeStatuses.defender.freeze ?? 0;
    const mark = setup.state.marks.defender.negative;
    setup.starfall = mark.id === "starfall" ? mark.stacks : 0;
    setup.reduction = (1 - setup.state.directions.forward.reduction) * 100;
    return setup;
  }
  const state = createInitialState(snapshot);
  const attacker = snapshot.spirits.find((spirit) => spirit.fullName === "波普鹿");
  const defender = snapshot.spirits.find((spirit) => spirit.fullName === "银月狼王") ?? snapshot.spirits[0];
  for (const [key, spirit] of [["attacker", attacker], ["defender", defender]]) {
    if (!spirit) throw new Error("当前数据缺少电鹿，请更新数据后重试");
    state.sides[key].spiritId = spirit.id;
    const four = chooseDefaultSkillIds(snapshot, spirit.id);
    state.sides[key].skills = { four, single: four[0] ?? null };
  }
  Object.assign(state.sides.attacker, { nature: "cheerful", displayIvs: { ...zeroIvs, hp: 60, physicalAttack: 60, speed: 60 } });
  Object.assign(state.sides.defender, { nature: "silent", displayIvs: { ...DEFENSE_TEMPLATES[0].displayIvs } });
  return { state, stacks: 1, attackerHp: 100, defenderHp: 100, defenseTemplate: "tank", attackPreset: "standard", freeze: 0, starfall: 0, weather: "none", reduction: 0, showFollowup: true, normalElectric: "电弧" };
}

export function applyDeerPreset(side, preset) {
  return {
    ...side,
    nature: preset.natureId ?? preset.nature ?? "neutral",
    displayIvs: { ...zeroIvs, ...preset.displayIvs },
    traitValues: { ...(preset.traitValues ?? side.traitValues) },
    ...(preset.skills ? { skills: Array.isArray(preset.skills) ? { four: [...preset.skills], single: preset.skills[0] } : structuredClone(preset.skills) } : {}),
  };
}

// 只编排共享内核的输入和两次出招，伤害公式与取整仍由 calculateMatchup 决定。
export function buildDeerInput(snapshot, setup, variant, stacks) {
  const state = structuredClone(setup.state);
  state.mode = "single";
  const name = variant.id === "arc" ? setup.normalElectric ?? "电弧" : variant.name;
  const skill = snapshot.skills.find((entry) => entry.name === name);
  if (!skill) throw new Error(`缺少技能数据：${name}`);
  const attackerSpirit = snapshot.spirits.find((entry) => entry.id === state.sides.attacker.spiritId);
  const attackerControls = getTraitView(snapshot, attackerSpirit, "attacker")?.inputs ?? [];
  const stackControl = attackerControls.find((input) => input.contextKey === "attackerTraitStacks");
  if (!stackControl) throw new Error("攻击方不是支持入场层数的电鹿");
  state.sides.attacker.traitValues[canonicalTraitControlKey(stackControl)] = stacks;
  state.sides.attacker.skills.single = { skillId: skill.id, context: { ...variant.context } };
  for (const key of ["attacker", "defender"]) {
    const side = state.sides[key];
    side.natureMultipliers = getNatureMultipliers(side.nature);
    side.panelStats = panelFor(snapshot, side);
  }
  for (const [direction, source, target] of [["forward", "attacker", "defender"], ["reverse", "defender", "attacker"]]) {
    const targetPercent = target === "attacker" ? setup.attackerHp : setup.defenderHp;
    state.directions[direction].currentHp = Math.max(1, Math.round(state.sides[target].panelStats.hp * targetPercent / 100));
    state.directions[direction].context = {
      ...materializeTraitContext(state.sides[source].traitValues, snapshot, state.sides[source].spiritId, "attacker"),
      ...materializeTraitContext(state.sides[target].traitValues, snapshot, state.sides[target].spiritId, "defender"),
      ...state.directions[direction].context,
      currentHpPercent: targetPercent,
      weather: setup.weather,
    };
  }
  state.directions.forward.context[stackControl.id] = stacks;
  state.directions.forward.context.enemyFreezeStacks = setup.freeze;
  state.directions.forward.reduction = 1 - setup.reduction / 100;
  if (setup.starfall > 0 || state.marks.defender.negative.id === "starfall") {
    state.marks.defender.negative = { id: setup.starfall > 0 ? "starfall" : "none", stacks: setup.starfall };
  }
  state.negativeStatuses.defender.freeze = setup.freeze;
  return updateGlobalWeather(state, setup.weather).state;
}

export function evaluateDeerAttack(snapshot, setup, variant, stacks) {
  const input = buildDeerInput(snapshot, setup, variant, stacks);
  const calculation = calculateMatchup(snapshot, input);
  const first = calculation.forward.results[0];
  const defender = snapshot.spirits.find((entry) => entry.id === input.sides.defender.spiritId);
  const maxHp = input.sides.defender.panelStats.hp;
  const targetHp = input.directions.forward.currentHp;
  const freeze = calculateFreezeThreshold({ maxHp, stacks: setup.freeze, types: defender.types });
  const exact = first.status === "exact" && Number.isFinite(first.totalDamage);
  const defenseLimitations = getDeerDefenseLimitations(snapshot, input.sides.defender);
  const lethalKnown = exact && defenseLimitations.length === 0;
  const electrified = variant.id === "discharge" && setup.dischargeElectrified
    ? calculateNegativeStatusSettlement({ enabled: true, statuses: { electrified: 2 }, defender: { maxHp, currentHp: maxHp, types: defender.types }, typeChart: snapshot.typeChart }).breakdown.find((entry) => entry.id === "electrified")
    : null;
  const damage = exact ? first.totalDamage + (electrified?.damage ?? 0) : null;
  const lethal = lethalKnown && damage + freeze.thresholdHp >= targetHp;
  let followup = null;
  let nextState = null;
  let followupReason = "";
  if (lethalKnown && setup.showFollowup && variant.id !== "first" && !lethal) {
    nextState = applyBattleActivation({ calculation, snapshot, state: input, side: "attacker", skillIndex: 0, skillMode: "single" }).state;
    if (electrified) nextState.negativeStatuses.defender.electrified = 0;
    const remaining = Math.max(0, targetHp - damage);
    nextState.directions.forward.currentHp = remaining;
    nextState.directions.forward.context.currentHpPercent = remaining / maxHp * 100;
    if (variant.id === "stone-counter") {
      // 本页的候选及补刀均为物理技能：只在下一击输入中施加物防下降。
      nextState.directions.forward.overrides.defenseLevelStage = Math.max(-99, (Number(nextState.directions.forward.overrides.defenseLevelStage) || 0) - 8);
    }
    if (variant.id === "bet-light") {
      const selfMaxHp = nextState.sides.attacker.panelStats.hp;
      const selfHp = Math.max(0, nextState.directions.reverse.currentHp - Math.floor(selfMaxHp * 0.1));
      nextState.directions.reverse.currentHp = selfHp;
      nextState.directions.reverse.context.currentHpPercent = selfHp / selfMaxHp * 100;
      if (selfHp === 0) followupReason = "下注后自身生命耗尽，无法接先发";
    }
    if (!followupReason) {
      const firstStrike = snapshot.skills.find((skill) => skill.name === "先发制人");
      nextState.sides.attacker.skills.single = { skillId: firstStrike.id, context: {} };
      followup = calculateMatchup(snapshot, nextState).forward.results[0];
    }
  }
  const comboDamage = exact && (lethal || followup?.status === "exact") ? damage + (lethal ? 0 : followup.totalDamage) : null;
  return {
    speed: getDeerSpeedComparison(calculation),
    defenseLimitations, lethalKnown,
    stacks, damage, electrified, first, followup, nextState, followupReason, maxHp, targetHp, freeze,
    lethal, comboDamage, comboLethal: comboDamage !== null && comboDamage + freeze.thresholdHp >= targetHp,
    percent: exact ? damage / maxHp * 100 : null,
    remainingHp: lethalKnown ? (lethal ? 0 : Math.max(0, targetHp - damage)) : null,
  };
}

export function calculateDeerRows(snapshot, setup) {
  const attacker = snapshot.spirits.find((spirit) => spirit.id === setup.state.sides.attacker.spiritId);
  const stackControl = getTraitView(snapshot, attacker, "attacker").inputs.find((input) => input.contextKey === "attackerTraitStacks");
  return DEER_VARIANTS.map((variant) => {
    const scanLimit = deerStackScanLimit(stackControl, setup.stacks);
    const byStack = Array.from({ length: scanLimit + 1 }, (_, stacks) => evaluateDeerAttack(snapshot, setup, variant, stacks));
    const name = variant.id === "arc" ? setup.normalElectric : variant.name;
    return {
      ...variant,
      ...(variant.id === "discharge" && setup.dischargeElectrified ? { condition: "含一次引电" } : {}),
      label: variant.id === "arc" && name === "离子火花" ? "离子火花" : variant.label,
      skill: snapshot.skills.find((skill) => skill.name === name),
      byStack,
      current: byStack[setup.stacks],
      minimum: byStack.find((entry) => entry.lethal)?.stacks ?? null,
      comboMinimum: variant.id === "first" ? null : byStack.find((entry) => entry.comboLethal)?.stacks ?? null,
    };
  });
}
