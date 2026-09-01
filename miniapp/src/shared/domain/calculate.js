import { RULES_VERSION } from "./constants.js";
import {
  calculateDamage,
  floorEffectiveSkillPower,
  normalizeDamageHitCount,
  roundDisplayedPower,
} from "./damage.js";
import {
  buildChoiceSkillSequence,
  supportsChoiceTrait,
} from "./choice-skill-sequence.js";
import {
  getDefaultHitCount,
  getSkillEffectInputs,
  hasDeclaredHitCount,
} from "./skill-effects.js";
import { resolveSkillPower } from "./skill-rules.js";
import { calculateAllPanelStats } from "./stat.js";
import {
  getTraitEffectInputs,
  getInheritedDamageTraits,
  resolveBeastFlowerBloodlineTrait,
  resolveContractShapeTrait,
} from "./trait-effects.js";
import {
  normalizeMarkSlot,
  starfallStacksFromMarkSlot,
  resolveSourceMarkEffects,
  targetNegativeMarkSettlement,
} from "./marks.js";
import { resolveTraitMultipliers } from "./traits.js";
import { getTypeMultiplier } from "./type-chart.js";
import { getSnapshotIndexes } from "./snapshot-indexes.js";
import { findDirectTraitDamageRule } from "./trait-damage.js";
import {
  resolveGlobalFixedHitCount,
  resolveTraitHitCountBonus,
} from "./trait-hit-count.js";
import {
  galeTurbineCompanionIndex,
  isDamageSkill,
  isGaleTurbine,
  resolveWingExtensionSkill,
} from "./wing-extension.js";
import {
  hasClownTrickTrait,
  resolveClownTrickDamage,
} from "./clown-trick.js";
import {
  resolveBaronGreed,
  resolveBaronGreedHitSequence,
} from "./baron-greed.js";
import { resolveBloodlineMagicHealing } from "./bloodline-magic.js";
import { resolvePowerOverride } from "./power-override.js";
import { projectTriggerContext } from "./trigger-controls.js";

function finiteNumber(...values) {
  for (const value of values) {
    if (value === null || value === undefined || value === "") continue;
    const numeric = Number(value);
    if (Number.isFinite(numeric)) return numeric;
  }
  return undefined;
}

function product(values) {
  return values.reduce((result, value) => {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? result * numeric : result;
  }, 1);
}

function resolvesBurstTrigger({ context, skill, traits }) {
  const controls = [
    ...getSkillEffectInputs(skill),
    ...(traits ?? []).flatMap((trait) =>
      getTraitEffectInputs(trait, "attacker"),
    ),
  ].filter((control) => control.contextKey === "burstTriggered");
  return controls.some(
    (control) =>
      projectTriggerContext(context, [control]).burstTriggered === true,
  );
}

function normalizedPower(value) {
  return Number(Number(value).toFixed(12));
}

function asMultiplierList(value) {
  if (Array.isArray(value)) return value;
  return value === undefined ? [] : [value];
}

function clampAbilityStage(value) {
  return Math.min(99, Math.max(-99, Number(value) || 0));
}

function abilityLevelMultiplier(attackStage, defenseStage) {
  const attackPercent = clampAbilityStage(attackStage) * 10;
  const defensePercent = clampAbilityStage(defenseStage) * 10;
  const numerator =
    1 +
    Math.max(attackPercent, 0) / 100 +
    Math.max(-defensePercent, 0) / 100;
  const denominator =
    1 +
    Math.max(-attackPercent, 0) / 100 +
    Math.max(defensePercent, 0) / 100;
  return numerator / denominator;
}

function abilityAdjustedStat(value, stage) {
  const percent = clampAbilityStage(stage) * 10;
  const numerator = 1 + Math.max(percent, 0) / 100;
  const denominator = 1 + Math.max(-percent, 0) / 100;
  return Number(value) * numerator / denominator;
}

function traitAdjustedSpeed(value, stage, flatBonus = 0) {
  const base = Number(value) || 0;
  const percent = clampAbilityStage(stage) * 10;
  return base + Math.floor(base * percent / 100) + (Number(flatBonus) || 0);
}

function resolveNatureMultipliers(side, snapshot) {
  if (side.natureMultipliers) return side.natureMultipliers;
  if (side.nature?.multipliers) return side.nature.multipliers;
  if (side.nature && typeof side.nature === "object") return side.nature;
  if (typeof side.nature === "string" && Array.isArray(snapshot.natures)) {
    return (
      snapshot.natures.find(
        (nature) => nature.id === side.nature || nature.name === side.nature,
      )?.multipliers ?? {}
    );
  }
  return {};
}

function skillEntriesForMode(side, mode) {
  if (mode === "four") {
    const entries = side.skills?.four ?? side.fourSkills ?? [];
    return Array.from(
      { length: Math.max(4, entries.length) },
      (_, index) => entries[index] ?? null,
    );
  }
  const single = side.skills?.single ?? side.singleSkill ?? side.skill ?? null;
  return [Array.isArray(single) ? (single[0] ?? null) : single];
}

function resolveSkillEntity(entry, skillsById) {
  if (!entry) return null;
  if (typeof entry === "string") return skillsById[entry] ?? null;
  if (entry.skill && typeof entry.skill === "object") return entry.skill;
  const skillId = entry.skillId ?? entry.id;
  return skillsById[skillId] ?? (entry.category ? entry : null);
}

function resolveEmbeddedDamageSkill(skill) {
  if (skill?.name !== "硬门") return skill;
  return {
    ...skill,
    basePower: 90,
    category: "physical",
    type: "武",
  };
}

function isAdjacentPowerSkill(skill) {
  return skill?.name === "六自由度" || skill?.name === "钢钻";
}

function entryDetails(entry) {
  return entry && typeof entry === "object" ? entry : {};
}

function pressureValveFixedPowerAdds(entries, skillsById) {
  if (entries.length < 4) return {};
  const additions = {};
  entries.slice(0, 4).forEach((entry, index) => {
    if (resolveSkillEntity(entry, skillsById)?.name !== "减压阀") return;
    const useCount = Math.max(
      0,
      Math.floor(Number(entryDetails(entry).context?.pressureValveUseCount) || 0),
    );
    const bonus = 10 + useCount * 20;
    for (const adjacentIndex of [(index + 3) % 4, (index + 1) % 4]) {
      const skillPosition = adjacentIndex + 1;
      additions[skillPosition] = (additions[skillPosition] ?? 0) + bonus;
    }
  });
  return additions;
}

function carriedSkillEntries(side, mode) {
  const four = side.skills?.four ?? side.fourSkills;
  if (Array.isArray(four) && four.some(Boolean)) {
    return Array.from(
      { length: Math.max(4, four.length) },
      (_, index) => four[index] ?? null,
    );
  }
  return skillEntriesForMode(side, mode);
}

function collectCarriedSkills(side, mode, skillsById) {
  return carriedSkillEntries(side, mode)
    .map((entry) => resolveSkillEntity(entry, skillsById))
    .filter(Boolean);
}

function resolveCombatant(
  snapshot,
  side,
  mode,
  indexes,
) {
  const spirit =
    indexes.spirits[side.spiritId] ??
    side.spirit ??
    (side.raceStats ? side : null);
  if (!spirit) {
    throw new Error(`Unknown spirit: ${side.spiritId ?? "missing"}`);
  }

  const panelStats =
    side.panelStats ??
    calculateAllPanelStats({
      raceStats: spirit.raceStats,
      displayIvs: side.displayIvs,
      natureMultipliers: resolveNatureMultipliers(side, snapshot),
    });
  const traitIds = side.traitIds ?? spirit.traitIds ?? [];
  const traits = [
    ...(side.traits ?? []),
    ...traitIds
      .map((traitId) => indexes.traits[traitId])
      .filter(Boolean),
    ...getInheritedDamageTraits(spirit),
  ];
  const carriedSkills = collectCarriedSkills(side, mode, indexes.skills);

  return {
    ...side,
    spirit,
    types: side.types ?? spirit.types ?? [],
    panelStats,
    traits,
    skillTypes: carriedSkills.map((skill) => skill.type).filter(Boolean),
    totalSkillCost: carriedSkills.reduce(
      (total, skill) => total + (finiteNumber(skill.cost) ?? 0),
      0,
    ),
  };
}

function statKeysForCategory(category, panelStats = {}) {
  if (category === "physical") {
    return { attack: "physicalAttack", defense: "physicalDefense" };
  }
  if (category === "magical") {
    return { attack: "magicalAttack", defense: "magicalDefense" };
  }
  if (category === "dual") {
    return Number(panelStats.physicalAttack) >=
      Number(panelStats.magicalAttack)
      ? { attack: "physicalAttack", defense: "physicalDefense" }
      : { attack: "magicalAttack", defense: "magicalDefense" };
  }
  return null;
}

function formulaStep(label, input, before, after, source) {
  return {
    label,
    input,
    before,
    after,
    value: String(after),
    source,
  };
}

function unresolvedResult(skill, resolution, partial = {}) {
  return {
    skillId: skill?.id ?? null,
    skillName: skill?.name ?? null,
    totalDamage: null,
    hpPercent: null,
    lethal: false,
    status: resolution.status,
    inputs: resolution.inputs ?? [],
    reason: resolution.reason,
    formulaSteps: resolution.steps ?? [],
    sources: [resolution.source].filter(Boolean),
    ...partial,
  };
}

function emptySlotResult() {
  return unresolvedResult(null, {
    status: "unsupported",
    reason: "未选择技能",
  });
}

function entryWithContext(entry, context) {
  if (typeof entry === "string") {
    return { context, skillId: entry };
  }
  return { ...(entry ?? {}), context };
}

function choiceTraitName(attacker) {
  return attacker.traits
    .map((trait) => trait?.displayName ?? trait?.name)
    .find(supportsChoiceTrait) ?? null;
}

function mergeChoiceTraitResults(
  results,
  traitName,
  defender,
  currentHp,
  executionPlan = [],
) {
  if (results.length < 2 || results.some((result) => result.status !== "exact")) {
    return results[0];
  }
  const [first, second] = results;
  const totalDamage = results.reduce(
    (total, result) => total + result.totalDamage,
    0,
  );
  const resultExecutions = results.map((result, index) => ({
    damage: result.totalDamage,
    label: index === 0 ? "第一段" : "第二段",
    power: result.skillPower,
  }));
  const firstUsesResponse = executionPlan[0]?.responseTriggered === true;
  return {
    ...first,
    additionalDamage: results.reduce(
      (total, result) => total + result.additionalDamage,
      0,
    ),
    traitDamage: results.reduce(
      (total, result) => total + (Number(result.traitDamage) || 0),
      0,
    ),
    choiceTraitSequence: {
      executions: resultExecutions,
      text: `${traitName}：第一段 ${first.totalDamage} + 第二段 ${second.totalDamage} = ${totalDamage}${firstUsesResponse ? "（仅第一段触发应对）" : ""}`,
      traitName,
    },
    formulaSteps: results.flatMap((result, index) =>
      result.formulaSteps.map((step) => ({
        ...step,
        label: `${index === 0 ? "第一段" : "第二段"} · ${step.label}`,
      })),
    ),
    hpPercent: (totalDamage / Math.max(1, defender.panelStats.hp)) * 100,
    lethal: currentHp <= totalDamage,
    mainDamage: results.reduce(
      (total, result) => total + result.mainDamage,
      0,
    ),
    markSettlements: results.flatMap(
      (result) => result.markSettlements ?? [],
    ),
    traitSettlements: results.flatMap(
      (result) => result.traitSettlements ?? [],
    ),
    totalDamage,
    warnings: [...new Set(results.flatMap((result) => result.warnings ?? []))],
  };
}

function mergeGaleTurbineResults({
  companionResult,
  currentHp,
  defender,
  turbineResult,
}) {
  if (
    companionResult?.status !== "exact" ||
    turbineResult?.status !== "exact"
  ) {
    return turbineResult;
  }
  const totalDamage = companionResult.totalDamage + turbineResult.totalDamage;
  const executions = [companionResult, turbineResult].map((result) => ({
    damage: result.totalDamage,
    label: result.skillName,
    power: result.skillPower,
    skillName: result.skillName,
  }));
  return {
    ...turbineResult,
    additionalDamage:
      companionResult.additionalDamage + turbineResult.additionalDamage,
    traitDamage:
      (Number(companionResult.traitDamage) || 0) +
      (Number(turbineResult.traitDamage) || 0),
    choiceTraitSequence: {
      executions,
      text: `${companionResult.skillName} ${companionResult.totalDamage} + 疾风涡轮 ${turbineResult.totalDamage} = ${totalDamage}`,
      traitName: "展翅",
    },
    formulaSteps: [companionResult, turbineResult].flatMap((result) =>
      result.formulaSteps.map((step) => ({
        ...step,
        label: `${result.skillName} · ${step.label}`,
      })),
    ),
    hpPercent: (totalDamage / Math.max(1, defender.panelStats.hp)) * 100,
    lethal: currentHp <= totalDamage,
    mainDamage: companionResult.mainDamage + turbineResult.mainDamage,
    traitSettlements: [
      ...(companionResult.traitSettlements ?? []),
      ...(turbineResult.traitSettlements ?? []),
    ],
    sources: [...new Set([
      ...(companionResult.sources ?? []),
      ...(turbineResult.sources ?? []),
      "reviewed-trait:wing-extension-v1",
    ])],
    totalDamage,
  };
}

function starfallDamage({
  stacks,
  skill,
  attackerStat,
  defenderDefense,
  defenderTypes,
  typeChart,
  damageReductionMultiplier,
  finalDamageMultiplier,
  level,
  attackDefenseLevelMultiplier,
  otherPowerMultiplier,
}) {
  const stackCount = Math.max(0, Math.floor(Number(stacks) || 0));
  if (stackCount === 0 || skill.type === "幻") {
    return {
      total: 0,
      power: 0,
      displayedPower: 0,
      typeMultiplier: 1,
      arithmetic: null,
    };
  }

  const power = stackCount ** 2 + 24 * stackCount - 24;
  const typeMultiplier = getTypeMultiplier("幻", defenderTypes, typeChart);
  const calculationPower =
    power *
    typeMultiplier *
    attackDefenseLevelMultiplier *
    otherPowerMultiplier;
  const displayedPower = roundDisplayedPower(calculationPower);
  const arithmetic = calculateDamage({
    attackerStat,
    displayedPower: calculationPower,
    defenderDefense,
    damageReductionMultiplier,
    hitCount: 1,
    finalDamageMultiplier,
    level,
  });

  return {
    total: arithmetic.total,
    power,
    displayedPower,
    typeMultiplier,
    arithmetic,
  };
}

function calculateSkillResult({
  snapshot,
  mode,
  skill,
  entry,
  direction,
  attacker,
  attackerCurrentHp,
  attackerHpPercent,
  defender,
  defenderCurrentHp,
  defenderHpPercent,
  level,
  skillPosition,
  sourceMarks,
  sourceSide,
  targetMarks,
  targetSide,
  lockedPower,
}) {
  if (!skill) return emptySlotResult();

  const details = entryDetails(entry);
  const directionOverrides = direction.overrides ?? {};
  const slotOverrides = details.overrides ?? {};
  const usesLockedPower = finiteNumber(lockedPower) !== undefined;
  const sourceNegativeMark = normalizeMarkSlot(
    sourceMarks?.negative,
    "negative",
  );
  const rawContext = {
    ...direction.context,
    ...details.context,
    ...directionOverrides.context,
    ...slotOverrides.context,
  };
  const attackerBloodline = resolveBeastFlowerBloodlineTrait({
    traits: attacker.traits,
    role: "attacker",
    context: rawContext,
    skill,
  });
  const defenderBloodline = resolveBeastFlowerBloodlineTrait({
    traits: defender.traits,
    role: "defender",
    context: rawContext,
    skill,
  });
  const attackerContract = resolveContractShapeTrait({
    traits: attacker.traits,
    role: "attacker",
    context: rawContext,
    skill,
  });
  const defenderContract = resolveContractShapeTrait({
    traits: defender.traits,
    role: "defender",
    context: rawContext,
    skill,
  });
  const attackerSpeed =
    Number(attacker.panelStats.speed) * attackerContract.ownerSpeedMultiplier +
    (finiteNumber(directionOverrides.attackerSpeedFlat) ?? 0) +
    attackerBloodline.ownerSpeedFlat +
    defenderBloodline.targetSpeedFlat +
    attackerContract.ownerSpeedFlat +
    defenderContract.targetSpeedFlat;
  const defenderSpeed =
    Number(defender.panelStats.speed) * defenderContract.ownerSpeedMultiplier +
    (finiteNumber(directionOverrides.defenderSpeedFlat) ?? 0) +
    defenderBloodline.ownerSpeedFlat +
    attackerBloodline.targetSpeedFlat +
    defenderContract.ownerSpeedFlat +
    attackerContract.targetSpeedFlat;
  const markedAttackerSpeed =
    attackerSpeed -
    (sourceNegativeMark.id === "slow"
      ? sourceNegativeMark.stacks * 10
      : 0);
  const enemyStarfallMarks = starfallStacksFromMarkSlot(targetMarks?.negative);
  const enemyStarfallInputId = getSkillEffectInputs(skill).find(
    (input) => input.contextKey === "enemyStarfallMarks",
  )?.id;
  const context = {
    attackerSpeed: markedAttackerSpeed,
    defenderSpeed,
    attackerPhysicalDefense: attacker.panelStats.physicalDefense,
    defenderPhysicalDefense: defender.panelStats.physicalDefense,
    enemyTotalSkillCost: defender.totalSkillCost,
    skillPosition,
    ...rawContext,
    enemyStarfallMarks,
    ...(enemyStarfallInputId
      ? { [enemyStarfallInputId]: enemyStarfallMarks }
      : {}),
    attackerHpPercent:
      finiteNumber(attackerHpPercent) ??
      (Math.min(
          attacker.panelStats.hp,
          Math.max(
            0,
            finiteNumber(
              attackerCurrentHp,
              attacker.currentHp,
              attacker.panelStats.hp,
            ) ?? 0,
          ),
        ) /
          Math.max(1, attacker.panelStats.hp)) *
        100,
    defenderHpPercent:
      finiteNumber(defenderHpPercent) ??
      (Math.min(
          defender.panelStats.hp,
          Math.max(
            0,
            finiteNumber(
              defenderCurrentHp,
              defender.currentHp,
              defender.panelStats.hp,
            ) ?? 0,
          ),
        ) /
          Math.max(1, defender.panelStats.hp)) *
        100,
  };
  const attackerMaximumHp = Math.max(0, Number(attacker.panelStats.hp) || 0);
  const normalizedAttackerCurrentHp = Math.min(
    attackerMaximumHp,
    Math.max(
      0,
      finiteNumber(
        attackerCurrentHp,
        attacker.currentHp,
        attackerMaximumHp,
      ) ?? 0,
    ),
  );
  const defenderMaximumHp = Math.max(0, Number(defender.panelStats.hp) || 0);
  const normalizedDefenderCurrentHp = Math.min(
    defenderMaximumHp,
    Math.max(
      0,
      finiteNumber(
        defenderCurrentHp,
        defender.currentHp,
        defenderMaximumHp,
      ) ?? 0,
    ),
  );
  const bloodlineMagicHealing = resolveBloodlineMagicHealing({
    context,
    maximumHp: attackerMaximumHp,
  });
  const bloodlineHealingSources = bloodlineMagicHealing.active
    ? [
        {
          amount: bloodlineMagicHealing.healing,
          label: bloodlineMagicHealing.sourceLabel,
        },
      ]
    : [];
  const clownTrickFor = (mainDamage) => resolveClownTrickDamage({
    attackerTraits: attacker.traits,
    attackerCurrentHp: normalizedAttackerCurrentHp,
    attackerMaximumHp,
    context,
    mainDamage,
    externalHealingSources: bloodlineHealingSources,
    persistentLifestealPercent: directionOverrides.lifestealPercent,
    skill,
    targetCurrentHp: normalizedDefenderCurrentHp,
  });
  const baronGreedFor = (mainDamage) => resolveBaronGreed({
    attackerTraits: attacker.traits,
    attackerCurrentHp: normalizedAttackerCurrentHp,
    attackerMaximumHp,
    context,
    mainDamage,
    persistentLifestealPercent: directionOverrides.lifestealPercent,
    skill,
    targetCurrentHp: normalizedDefenderCurrentHp,
  });
  const traitHitCount = resolveTraitHitCountBonus({
    traits: attacker.traits,
    context,
    skill,
  });
  const fixedHitCount = resolveGlobalFixedHitCount({
    attackerTraits: attacker.traits,
    defenderTraits: defender.traits,
    context,
    skill,
  });
  const declaredHitCount = hasDeclaredHitCount(skill);
  const persistentHitCountAdd = declaredHitCount
    ? finiteNumber(directionOverrides.hitCountAdd) ?? 0
    : 0;
  const persistentHitCountPercentAdd = declaredHitCount
    ? Math.max(0, finiteNumber(directionOverrides.hitCountPercentAdd) ?? 0)
    : 0;
  const bloodlineHitCountAdd = declaredHitCount
    ? attackerBloodline.hitCountAdd + defenderBloodline.targetHitCountAdd
    : 0;
  const contractHitCountAdd = declaredHitCount
    ? attackerContract.hitCountAdd + defenderContract.targetHitCountAdd
    : 0;
  const rawAutomaticHitCountAdd = Math.floor(
    persistentHitCountAdd +
      bloodlineHitCountAdd +
      contractHitCountAdd +
      traitHitCount.hitCountAdd,
  );
  const automaticHitCountAdd = fixedHitCount ? 0 : rawAutomaticHitCountAdd;
  const resolveHitCount = (baseHitCount, automaticAdd) =>
    Math.min(
      99,
      Math.max(
        1,
        Math.floor(
          (baseHitCount + automaticAdd) *
            (1 + persistentHitCountPercentAdd),
        ),
      ),
    );
  if (skill.category === "status" || skill.category === "defense") {
    const baseHitCount =
      finiteNumber(
        slotOverrides.hitCount,
        details.hitCount,
        mode === "single" ? direction.hitCount : undefined,
        getDefaultHitCount(skill),
      ) ?? 1;
    const panelTraitResolution = resolveTraitMultipliers({
      attackerTraits: attacker.traits,
      defenderTraits: defender.traits,
      skill: { ...skill, category: "physical" },
      attacker,
      defender,
      context,
    });
    const panelTrait =
      panelTraitResolution.status === "exact"
        ? panelTraitResolution
        : {
            attackLevelBonus: 0,
            attackerSpeedFlatBonus: 0,
            attackerSpeedLevelBonus: 0,
            defenseLevelBonus: 0,
            defenderSpeedFlatBonus: 0,
            defenderSpeedLevelBonus: 0,
          };
    const attackLevelStage =
      finiteNumber(
        slotOverrides.attackLevelStage,
        directionOverrides.attackLevelStage,
        direction.attackLevelStage,
      ) ?? 0;
    const defenseLevelStage =
      finiteNumber(
        slotOverrides.defenseLevelStage,
        directionOverrides.defenseLevelStage,
        direction.defenseLevelStage,
      ) ?? 0;
    const statusAttackStageFor = (category) =>
      attackLevelStage +
      panelTrait.attackLevelBonus +
      attackerBloodline.attackLevelBonusByCategory[category] +
      defenderBloodline.targetAttackLevelBonusByCategory[category] +
      attackerContract.attackLevelBonusByCategory[category] +
      defenderContract.targetAttackLevelBonusByCategory[category];
    const statusDefenseStageFor = (category) =>
      defenseLevelStage +
      panelTrait.defenseLevelBonus +
      defenderBloodline.defenseLevelBonusByCategory[category] +
      attackerBloodline.targetDefenseLevelBonusByCategory[category] +
      defenderContract.defenseLevelBonusByCategory[category] +
      attackerContract.targetDefenseLevelBonusByCategory[category];
    const combatPanel = {
      attacker: {
        magicalAttack: Math.round(
          abilityAdjustedStat(
            attacker.panelStats.magicalAttack,
            statusAttackStageFor("magical"),
          ),
        ),
        physicalAttack: Math.round(
          abilityAdjustedStat(
            attacker.panelStats.physicalAttack,
            statusAttackStageFor("physical"),
          ),
        ),
        speed: traitAdjustedSpeed(
          context.attackerSpeed,
          panelTrait.attackerSpeedLevelBonus,
          panelTrait.attackerSpeedFlatBonus,
        ),
      },
      defender: {
        magicalDefense: Math.round(
          abilityAdjustedStat(
            defender.panelStats.magicalDefense,
            statusDefenseStageFor("magical"),
          ),
        ),
        physicalDefense: Math.round(
          abilityAdjustedStat(
            defender.panelStats.physicalDefense,
            statusDefenseStageFor("physical"),
          ),
        ),
        speed: traitAdjustedSpeed(
          context.defenderSpeed,
          panelTrait.defenderSpeedLevelBonus,
          panelTrait.defenderSpeedFlatBonus,
        ),
      },
    };
    const clownTrick = clownTrickFor(0);
    if (clownTrick.active) {
      const maximumHp = Math.max(0, Number(defender.panelStats.hp) || 0);
      const currentHp = Math.min(
        maximumHp,
        Math.max(
          0,
          finiteNumber(
            defenderCurrentHp,
            defender.currentHp,
            maximumHp,
          ) ?? 0,
        ),
      );
      const hitCount =
        fixedHitCount?.hitCount ??
        resolveHitCount(baseHitCount, automaticHitCountAdd);
      return {
        additionalDamage: 0,
        automaticHitCountAdd,
        combatPanel,
        effectivePower: 0,
        formulaSteps: [
          formulaStep(
            "戏耍特性伤害",
            {
              actualHealing: clownTrick.actualHealing,
              missingHp: clownTrick.missingHp,
              requestedHealing: clownTrick.requestedHealing,
            },
            0,
            clownTrick.damage,
            "reviewed-trait:clown-trick-v1",
          ),
        ],
        hitCount,
        hpPercent: maximumHp > 0 ? clownTrick.damage / maximumHp * 100 : 0,
        lethal: currentHp <= clownTrick.damage,
        mainDamage: 0,
        markSettlements: [],
        skillId: skill.id,
        skillName: skill.name,
        skillPower: 0,
        sources: ["reviewed-trait:clown-trick-v1"],
        status: "exact",
        totalDamage: clownTrick.damage,
        traitDamage: clownTrick.damage,
        traitSettlements: [clownTrick.settlement].filter(Boolean),
        typeLabel: "无·特性",
        typeMultiplier: 1,
        warnings: [],
      };
    }
    const baronGreed = baronGreedFor(0);
    if (baronGreed.active) {
      const hitCount =
        fixedHitCount?.hitCount ??
        resolveHitCount(baseHitCount, automaticHitCountAdd);
      return {
        additionalDamage: 0,
        automaticHitCountAdd,
        combatPanel,
        effectivePower: 0,
        formulaSteps: [
          formulaStep(
            "贪得无厌溢出回复",
            {
              missingHp: baronGreed.missingHp,
              requestedHealing: baronGreed.requestedHealing,
            },
            0,
            baronGreed.attackLevelStageAdd,
            "reviewed-trait:baron-greed-v2",
          ),
        ],
        hitCount,
        hpPercent: 0,
        lethal: false,
        mainDamage: 0,
        markSettlements: [],
        postAttackEffects: {
          attackLevelStageAdd: baronGreed.attackLevelStageAdd,
          source: "贪得无厌",
        },
        skillId: skill.id,
        skillName: skill.name,
        skillPower: 0,
        sources: ["reviewed-trait:baron-greed-v2"],
        status: "exact",
        totalDamage: 0,
        traitDamage: 0,
        traitSettlements: [baronGreed.settlement].filter(Boolean),
        typeLabel: skill.type,
        typeMultiplier: 1,
        warnings: [],
      };
    }
    return unresolvedResult(
      skill,
      {
        reason: "非伤害技能不计算伤害",
        source: skill.provenance,
        status: "unsupported",
        steps: [
          ...traitHitCount.steps,
          ...(fixedHitCount
            ? [{
                after: fixedHitCount.hitCount,
                before: resolveHitCount(baseHitCount, rawAutomaticHitCountAdd),
                input: { fixedHitCount: fixedHitCount.hitCount },
                label: fixedHitCount.traitName,
                source: fixedHitCount.sources[0],
              }]
            : []),
        ],
      },
      {
        automaticHitCountAdd,
        combatPanel,
        hitCount:
          fixedHitCount?.hitCount ??
          resolveHitCount(baseHitCount, automaticHitCountAdd),
        sources: [
          ...traitHitCount.sources,
          ...(fixedHitCount?.sources ?? []),
        ],
      },
    );
  }
  const sourceMarkEffects = resolveSourceMarkEffects({
    actedBeforeEnemy: context.actedBeforeEnemy,
    attackerSpeed,
    burstTriggered: resolvesBurstTrigger({
      context: rawContext,
      skill,
      traits: attacker.traits,
    }),
    defenderSpeed,
    marks: sourceMarks,
    side: sourceSide,
    skill,
  });
  const legacyBasePower = finiteNumber(
    slotOverrides.basePower,
    slotOverrides.basePowerOverride,
    details.basePowerOverride,
    mode === "single" ? directionOverrides.basePower : undefined,
    mode === "single" ? directionOverrides.basePowerOverride : undefined,
  );
  const powerOverride = resolvePowerOverride({
    current:
      slotOverrides.powerOverride ??
      details.powerOverride ??
      (mode === "single" ? directionOverrides.powerOverride : undefined),
    legacyBasePower,
    legacyDisplayedPower: finiteNumber(
      slotOverrides.displayedPower,
      details.displayedPower,
      mode === "single" ? directionOverrides.displayedPower : undefined,
    ),
    legacyPowerMode:
      slotOverrides.powerMode ??
      details.powerMode ??
      (mode === "single" ? directionOverrides.powerMode : undefined),
  });
  if (powerOverride.mode === "legacy-base") {
    context.basePowerOverride = powerOverride.value;
  }

  const attackLevelStage = finiteNumber(
    slotOverrides.attackLevelStage,
    directionOverrides.attackLevelStage,
    direction.attackLevelStage,
  );
  const defenseLevelStage = finiteNumber(
    slotOverrides.defenseLevelStage,
    directionOverrides.defenseLevelStage,
    direction.defenseLevelStage,
  );
  const traitResolutionForCategory = (category) =>
    resolveTraitMultipliers({
      attackerTraits: attacker.traits,
      defenderTraits: defender.traits,
      skill: { ...skill, category },
      attacker,
      defender,
      context,
    });
  const categoryTraitResolutions = {
    magical: traitResolutionForCategory("magical"),
    physical: traitResolutionForCategory("physical"),
  };
  const attackStageForCategory = (category) => {
    const categoryResolution = categoryTraitResolutions[category];
    return (
      (attackLevelStage ?? 0) +
      (categoryResolution?.status === "exact"
        ? categoryResolution.attackLevelBonus
        : 0) +
      attackerBloodline.attackLevelBonusByCategory[category] +
      defenderBloodline.targetAttackLevelBonusByCategory[category] +
      attackerContract.attackLevelBonusByCategory[category] +
      defenderContract.targetAttackLevelBonusByCategory[category]
    );
  };
  const resolvedSkillCategory =
    skill.category === "dual"
      ? abilityAdjustedStat(
          attacker.panelStats.physicalAttack,
          attackStageForCategory("physical"),
        ) >=
        abilityAdjustedStat(
          attacker.panelStats.magicalAttack,
          attackStageForCategory("magical"),
        )
        ? "physical"
        : "magical"
      : skill.category;
  const traitResolution =
    categoryTraitResolutions[resolvedSkillCategory] ??
    traitResolutionForCategory(resolvedSkillCategory);
  if (traitResolution.status !== "exact") {
    return unresolvedResult(skill, traitResolution);
  }

  context.attackerSpeed = traitAdjustedSpeed(
    context.attackerSpeed,
    traitResolution.attackerSpeedLevelBonus,
    traitResolution.attackerSpeedFlatBonus,
  );
  context.defenderSpeed = traitAdjustedSpeed(
    context.defenderSpeed,
    traitResolution.defenderSpeedLevelBonus,
    traitResolution.defenderSpeedFlatBonus,
  );

  context.attackerPhysicalDefense = Math.round(
    abilityAdjustedStat(
      attacker.panelStats.physicalDefense,
      traitResolution.attackerDefenseLevelBonus,
    ),
  );
  context.defenderPhysicalDefense = Math.round(
    abilityAdjustedStat(
      defender.panelStats.physicalDefense,
      traitResolution.defenderDefenseLevelBonus,
    ),
  );

  const powerResolution = usesLockedPower
    ? {
        status: "exact",
        steps: [],
        value: finiteNumber(lockedPower) ?? 0,
      }
    : resolveSkillPower(skill, context);
  if (powerResolution.status !== "exact") {
    return unresolvedResult(skill, powerResolution);
  }

  const baseFixedPowerAdd = finiteNumber(
    slotOverrides.fixedPowerAdd,
    details.fixedPowerAdd,
    directionOverrides.fixedPowerAdd,
    direction.fixedPowerAdd,
  ) ?? 0;
  const scopedFixedPowerAdd = finiteNumber(
    directionOverrides.fixedPowerAddsBySlot?.[skillPosition],
    0,
  ) ?? 0;
  const fixedPowerAdd = baseFixedPowerAdd + scopedFixedPowerAdd;
  const markFixedPowerAdd = sourceMarkEffects.fixedPowerAdd;
  const skillPercentageAdds = asMultiplierList(
    powerResolution.powerPercentAdds,
  );
  const statusPercentageAdds = [
    ...asMultiplierList(direction.skillPowerPercentAdds),
    ...asMultiplierList(directionOverrides.skillPowerPercentAdds),
    ...asMultiplierList(details.skillPowerPercentAdds),
    ...asMultiplierList(slotOverrides.skillPowerPercentAdds),
    ...asMultiplierList(
      directionOverrides.skillPowerPercentAddsBySlot?.[skillPosition],
    ),
  ];
  const traitPercentageAdds =
    traitResolution.powerPercentAdd === 0
      ? []
      : [traitResolution.powerPercentAdd];
  const nonMarkPercentageAdds = [
    ...skillPercentageAdds,
    ...statusPercentageAdds,
    ...traitPercentageAdds,
  ];
  const hiddenPanelPowerPercentAdd =
    sourceMarkEffects.hiddenPanelPowerPercentAdd ?? 0;
  const visibleMarkPowerPercentAdd =
    sourceMarkEffects.powerPercentAdd - hiddenPanelPowerPercentAdd;
  const visiblePercentageAdds = [
    ...nonMarkPercentageAdds,
    ...(visibleMarkPowerPercentAdd === 0 ? [] : [visibleMarkPowerPercentAdd]),
  ];
  const percentageAdds = [
    ...visiblePercentageAdds,
    ...(hiddenPanelPowerPercentAdd === 0
      ? []
      : [hiddenPanelPowerPercentAdd]),
  ];
  const powerAfterFixed = powerResolution.value + fixedPowerAdd;
  const powerAfterMarkFixed = powerAfterFixed + markFixedPowerAdd;
  const traitFixedPowerAdd = traitResolution.fixedPowerAdd;
  const powerAfterTraitFixed =
    powerAfterMarkFixed + traitFixedPowerAdd;
  const bloodlineFixedPowerAdd = attackerBloodline.fixedPowerAdd;
  const powerAfterBloodlineFixed =
    powerAfterTraitFixed + bloodlineFixedPowerAdd;
  const contractFixedPowerAdd = attackerContract.fixedPowerAdd;
  const powerAfterContractFixed =
    powerAfterBloodlineFixed + contractFixedPowerAdd;
  const automaticActualPower =
    powerAfterContractFixed *
    (1 + percentageAdds.reduce((sum, value) => sum + (Number(value) || 0), 0));
  const automaticStaticPower =
    powerAfterFixed *
    (1 + [...skillPercentageAdds, ...statusPercentageAdds].reduce(
      (sum, value) => sum + (Number(value) || 0),
      0,
    ));
  const staticPowerOverride = powerOverride.mode === "static";
  const staticPower = normalizedPower(
    staticPowerOverride
      ? powerOverride.value
      : Math.floor(automaticStaticPower),
  );
  const manualPowerAfterMarkFixed = staticPower + markFixedPowerAdd;
  const manualPowerAfterTraitFixed =
    manualPowerAfterMarkFixed + traitFixedPowerAdd;
  const manualPowerAfterBloodlineFixed =
    manualPowerAfterTraitFixed + bloodlineFixedPowerAdd;
  const manualPowerAfterContractFixed =
    manualPowerAfterBloodlineFixed + contractFixedPowerAdd;
  const manualVisiblePercentageAdds = [
    ...traitPercentageAdds,
    ...(visibleMarkPowerPercentAdd === 0 ? [] : [visibleMarkPowerPercentAdd]),
  ];
  const manualPercentageAdds = [
    ...manualVisiblePercentageAdds,
    ...(hiddenPanelPowerPercentAdd === 0
      ? []
      : [hiddenPanelPowerPercentAdd]),
  ];
  const manualActualPower =
    manualPowerAfterContractFixed *
    (1 + manualPercentageAdds.reduce(
      (sum, value) => sum + (Number(value) || 0),
      0,
    ));
  const actualPower = floorEffectiveSkillPower(
    staticPowerOverride ? manualActualPower : automaticActualPower,
  );
  const traitAdjustedPower = actualPower;

  const baseCombatPanel = {
    attacker: {
      magicalAttack: Math.round(
        abilityAdjustedStat(
          attacker.panelStats.magicalAttack,
          attackStageForCategory("magical"),
        ),
      ),
      physicalAttack: Math.round(
        abilityAdjustedStat(
          attacker.panelStats.physicalAttack,
          attackStageForCategory("physical"),
        ),
      ),
      speed: context.attackerSpeed,
    },
    defender: {
      magicalDefense: Math.round(
        abilityAdjustedStat(
          defender.panelStats.magicalDefense,
          (defenseLevelStage ?? 0) + traitResolution.defenseLevelBonus,
        ),
      ),
      physicalDefense: Math.round(
        abilityAdjustedStat(
          defender.panelStats.physicalDefense,
          (defenseLevelStage ?? 0) + traitResolution.defenseLevelBonus,
        ),
      ),
      speed: context.defenderSpeed,
    },
  };

  const statKeys = statKeysForCategory(
    resolvedSkillCategory,
    attacker.panelStats,
  );
  if (!statKeys) {
    return unresolvedResult(skill, {
      status: "unsupported",
      reason: `技能分类 ${skill.category} 的攻防取值规则尚未验证`,
      source: skill.provenance,
    }, { combatPanel: baseCombatPanel });
  }

  const baseAttackerStat = finiteNumber(
    slotOverrides.attackerStat,
    directionOverrides.attackerStat,
    attacker.panelStats[statKeys.attack],
  );
  const baseDefenderDefense = finiteNumber(
    slotOverrides.defenderDefense,
    directionOverrides.defenderDefense,
    defender.panelStats[statKeys.defense],
  );
  const stabMultiplier =
    finiteNumber(
      slotOverrides.stabMultiplier,
      slotOverrides.stab,
      directionOverrides.stabMultiplier,
      directionOverrides.stab,
      direction.stabMultiplier,
      direction.stab,
    ) ?? (attacker.types.includes(skill.type) ? 1.25 : 1);
  const resolvedTypeMultiplier =
    finiteNumber(
      slotOverrides.typeMultiplier,
      slotOverrides.typeEffectivenessMultiplier,
      slotOverrides.typeEffectiveness,
      directionOverrides.typeMultiplier,
      directionOverrides.typeEffectivenessMultiplier,
      directionOverrides.typeEffectiveness,
      direction.typeMultiplier,
      direction.typeEffectiveness,
    ) ??
    getTypeMultiplier(skill.type, defender.types, snapshot.typeChart);
  const typeMultiplier =
    powerResolution.ignoreResistance && resolvedTypeMultiplier < 1
      ? 1
      : resolvedTypeMultiplier;
  const categoryKey =
    statKeys.attack === "magicalAttack" ? "magical" : "physical";
  const bloodlineAttackLevelBonus =
    attackerBloodline.attackLevelBonusByCategory[categoryKey] +
    defenderBloodline.targetAttackLevelBonusByCategory[categoryKey];
  const bloodlineDefenseLevelBonus =
    defenderBloodline.defenseLevelBonusByCategory[categoryKey] +
    attackerBloodline.targetDefenseLevelBonusByCategory[categoryKey];
  const contractAttackLevelBonus =
    attackerContract.attackLevelBonusByCategory[categoryKey] +
    defenderContract.targetAttackLevelBonusByCategory[categoryKey];
  const contractDefenseLevelBonus =
    defenderContract.defenseLevelBonusByCategory[categoryKey] +
    attackerContract.targetDefenseLevelBonusByCategory[categoryKey];
  const hasStageInput =
    attackLevelStage !== undefined ||
    defenseLevelStage !== undefined ||
    traitResolution.attackLevelBonus !== 0 ||
    traitResolution.defenseLevelBonus !== 0 ||
    bloodlineAttackLevelBonus !== 0 ||
    bloodlineDefenseLevelBonus !== 0 ||
    contractAttackLevelBonus !== 0 ||
    contractDefenseLevelBonus !== 0;
  const totalAttackLevelStage =
    (attackLevelStage ?? 0) +
    traitResolution.attackLevelBonus +
    bloodlineAttackLevelBonus +
    contractAttackLevelBonus;
  const totalDefenseLevelStage =
    (defenseLevelStage ?? 0) +
    traitResolution.defenseLevelBonus +
    bloodlineDefenseLevelBonus +
    contractDefenseLevelBonus;
  const attackDefenseLevelMultiplier = hasStageInput
    ? abilityLevelMultiplier(
        totalAttackLevelStage,
        totalDefenseLevelStage,
      )
    : finiteNumber(
        slotOverrides.attackDefenseLevelMultiplier,
        directionOverrides.attackDefenseLevelMultiplier,
        direction.attackDefenseLevelMultiplier,
      ) ??
      product([
        finiteNumber(direction.attackLevelMultiplier) ?? 1,
        finiteNumber(direction.defenseLevelMultiplier) ?? 1,
      ]);
  const usesActualCombatPanelForDamage = hasStageInput;
  const attackerStat = usesActualCombatPanelForDamage
    ? Math.round(abilityAdjustedStat(baseAttackerStat, totalAttackLevelStage))
    : baseAttackerStat;
  const defenderDefense = usesActualCombatPanelForDamage
    ? Math.round(
        abilityAdjustedStat(baseDefenderDefense, totalDefenseLevelStage),
      )
    : baseDefenderDefense;
  const otherPowerMultiplier =
    product([
      ...asMultiplierList(direction.otherPowerMultipliers),
      ...asMultiplierList(directionOverrides.otherPowerMultipliers),
      ...asMultiplierList(details.otherPowerMultipliers),
      ...asMultiplierList(slotOverrides.otherPowerMultipliers),
    ]);
  const weatherRainTurns = Math.min(
    8,
    Math.max(0, Math.floor(finiteNumber(context.weatherRainTurns) ?? 0)),
  );
  const weatherMultiplier =
    weatherRainTurns > 0 && skill.type === "水" ? 1.75 : 1;
  const powerAfterStab = traitAdjustedPower * stabMultiplier;
  const powerAfterType = powerAfterStab * typeMultiplier;
  const powerAfterWeather = powerAfterType * weatherMultiplier;
  const powerAfterLevels = powerAfterWeather * attackDefenseLevelMultiplier;
  const automaticPanelPower = powerAfterLevels * otherPowerMultiplier;
  const panelPower = powerOverride.mode === "panel"
    ? powerOverride.value
    : roundDisplayedPower(automaticPanelPower);
  const calculationPower = usesActualCombatPanelForDamage
    ? powerOverride.mode === "panel"
      ? panelPower / attackDefenseLevelMultiplier
      : powerAfterWeather * otherPowerMultiplier
    : panelPower;
  const displayedPower = panelPower;
  const damageReductionMultiplier =
    Math.max(0, finiteNumber(direction.reduction) ?? 1) *
    traitResolution.damageReductionMultiplier *
    Math.max(
      0,
      finiteNumber(
        slotOverrides.damageReductionMultiplier,
        directionOverrides.damageReductionMultiplier,
      ) ?? 1,
    );
  const baseHitCount =
    finiteNumber(
      powerResolution.hitCount,
      slotOverrides.hitCount,
      details.hitCount,
      mode === "single" ? direction.hitCount : undefined,
      getDefaultHitCount(skill),
    ) ?? 1;
  const hitCount =
    fixedHitCount?.hitCount ??
    resolveHitCount(baseHitCount, automaticHitCountAdd);
  const fixedHitCountSteps = fixedHitCount
    ? [
        {
          after: fixedHitCount.hitCount,
          before: resolveHitCount(baseHitCount, rawAutomaticHitCountAdd),
          input: { fixedHitCount: fixedHitCount.hitCount },
          label: fixedHitCount.traitName,
          source: fixedHitCount.sources[0],
        },
      ]
    : [];
  const finalDamageMultiplier =
    Math.max(
      0,
      finiteNumber(
        slotOverrides.finalDamageMultiplier,
        directionOverrides.finalDamageMultiplier,
        direction.finalDamageMultiplier,
      ) ?? 1,
    ) *
    traitResolution.finalDamageMultiplier *
    Math.max(
      0,
      finiteNumber(powerResolution.finalDamageMultiplier) ?? 1,
    );
  const baseMainDamage = calculateDamage({
    attackerStat,
    displayedPower: calculationPower,
    defenderDefense,
    damageReductionMultiplier,
    hitCount,
    finalDamageMultiplier,
    level,
  });
  const hitArithmetic = [];
  const baronGreedSequence = hitCount > 1
    ? resolveBaronGreedHitSequence({
        attackerCurrentHp: normalizedAttackerCurrentHp,
        attackerMaximumHp,
        attackerTraits: attacker.traits,
        calculateHit: ({ attackLevelStageAdd }) => {
          const sequentialAttackerStat =
            usesActualCombatPanelForDamage &&
            resolvedSkillCategory === "physical"
              ? Math.round(
                  abilityAdjustedStat(
                    baseAttackerStat,
                    totalAttackLevelStage + attackLevelStageAdd,
                  ),
                )
              : attackerStat;
          const sequentialLevelMultiplier = resolvedSkillCategory === "physical"
            ? hasStageInput
              ? abilityLevelMultiplier(
                  totalAttackLevelStage + attackLevelStageAdd,
                  totalDefenseLevelStage,
                )
              : attackDefenseLevelMultiplier *
                abilityLevelMultiplier(attackLevelStageAdd, 0)
            : attackDefenseLevelMultiplier;
          const sequentialPower = usesActualCombatPanelForDamage
            ? calculationPower
            : calculationPower *
              sequentialLevelMultiplier /
              Math.max(Number.EPSILON, attackDefenseLevelMultiplier);
          const arithmetic = calculateDamage({
            attackerStat: sequentialAttackerStat,
            displayedPower: sequentialPower,
            defenderDefense,
            damageReductionMultiplier,
            hitCount: 1,
            finalDamageMultiplier,
            level,
          });
          hitArithmetic.push(arithmetic);
          return arithmetic;
        },
        context,
        hitCount,
        persistentLifestealPercent: directionOverrides.lifestealPercent,
        skill,
        targetCurrentHp: normalizedDefenderCurrentHp,
      })
    : null;
  const hasSequentialBaronSettlement =
    baronGreedSequence?.hitDamages?.length === hitCount;
  const mainDamage = hasSequentialBaronSettlement
    ? {
        ...hitArithmetic[0],
        multiHit: baronGreedSequence.totalDamage,
        total: baronGreedSequence.totalDamage,
      }
    : baseMainDamage;
  const targetNegativeMark = normalizeMarkSlot(
    targetMarks?.negative,
    "negative",
  );
  const legacyStarfallStacks =
    !targetNegativeMark.id && !targetMarks
      ? Math.max(0, Math.floor(Number(direction.starfallStacks) || 0))
      : 0;
  const baseStarfallStacks =
    targetNegativeMark.id === "starfall"
      ? targetNegativeMark.stacks
      : legacyStarfallStacks;
  const starfallStacks = Math.min(
    99,
    Math.max(
      0,
      baseStarfallStacks +
        attackerBloodline.targetStarfallStacksAdd +
        attackerContract.targetStarfallStacksAdd,
    ),
  );
  const additionalDamage = starfallDamage({
    stacks: starfallStacks,
    skill,
    attackerStat,
    defenderDefense,
    defenderTypes: defender.types,
    typeChart: snapshot.typeChart,
    damageReductionMultiplier,
    finalDamageMultiplier,
    level,
    attackDefenseLevelMultiplier: usesActualCombatPanelForDamage
      ? 1
      : attackDefenseLevelMultiplier,
    otherPowerMultiplier,
  });
  const clownTrick = clownTrickFor(mainDamage.total);
  const baronGreed = hasSequentialBaronSettlement
    ? baronGreedSequence
    : baronGreedFor(mainDamage.total);
  const targetMarkSettlement = targetNegativeMarkSettlement({
    additionalDamage: additionalDamage.total,
    markSlot:
      targetNegativeMark.id === "starfall" || targetNegativeMark.id
        ? targetNegativeMark
        : legacyStarfallStacks > 0
          ? { id: "starfall", stacks: legacyStarfallStacks }
          : null,
    side: targetSide,
    skill,
  });
  const markSettlements = [
    ...sourceMarkEffects.settlements,
    ...(targetMarkSettlement ? [targetMarkSettlement] : []),
  ];
  const traitSettlements = [
    attackerBloodline,
    defenderBloodline,
    attackerContract,
    defenderContract,
  ]
    .filter(({ active, settlement }) => active && settlement)
    .map(({ settlement, traitId }) => ({
      ...settlement,
      traitId,
      text:
        settlement.bloodlineType === "illusion" &&
        settlement.status === "applied"
          ? `${settlement.text} · 追加 ${additionalDamage.total} 伤害`
          : settlement.effectiveBallType === "sand" &&
              settlement.status === "applied"
            ? `${settlement.text} · 追加 ${additionalDamage.total} 伤害`
          : settlement.text,
    }));
  if (clownTrick.settlement) {
    traitSettlements.push(clownTrick.settlement);
  }
  if (baronGreed.settlement) {
    traitSettlements.push(baronGreed.settlement);
  }
  const totalDamage =
    mainDamage.total + additionalDamage.total + clownTrick.damage;
  const currentHp = Math.min(
    defender.panelStats.hp,
    Math.max(
      0,
      finiteNumber(
        direction.currentHp,
        defender.currentHp,
        defender.panelStats.hp,
      ) ?? 0,
    ),
  );
  const maximumHp = Math.max(0, Number(defender.panelStats.hp) || 0);
  const hpPercent = maximumHp > 0 ? totalDamage / maximumHp * 100 : 0;
  const panelPowerOverride = powerOverride.mode === "panel";
  const powerFormulaSteps = panelPowerOverride
    ? [
        formulaStep(
          "手动显示威力",
          powerOverride.value,
          powerOverride.value,
          panelPower,
          "battle-input",
        ),
      ]
    : staticPowerOverride
    ? [
        formulaStep(
          "手动静态威力",
          powerOverride.value,
          powerOverride.value,
          staticPower,
          "battle-input",
        ),
        formulaStep(
          "外部固定威力",
          {
            bloodline: bloodlineFixedPowerAdd,
            contract: contractFixedPowerAdd,
            mark: markFixedPowerAdd,
            trait: traitFixedPowerAdd,
          },
          staticPower,
          manualPowerAfterContractFixed,
          "automatic",
        ),
        formulaStep(
          "外部威力加成",
          manualPercentageAdds,
          manualPowerAfterContractFixed,
          actualPower,
          manualPercentageAdds.length === 0 ? "default" : "battle-input",
        ),
        formulaStep(
          "本系",
          stabMultiplier,
          traitAdjustedPower,
          powerAfterStab,
          "automatic",
        ),
        formulaStep(
          "属性克制",
          defender.types,
          powerAfterStab,
          powerAfterType,
          snapshot.typeChart?.source ?? "builtin-type-chart-v1",
        ),
        formulaStep(
          "天气",
          {
            multiplier: weatherMultiplier,
            remainingTurns: weatherRainTurns,
            weather: weatherRainTurns > 0 ? "雨天" : "无天气",
          },
          powerAfterType,
          powerAfterWeather,
          weatherRainTurns > 0 ? "battle-weather:rain-v1" : "default",
        ),
        formulaStep(
          "攻防等级",
          attackDefenseLevelMultiplier,
          powerAfterWeather,
          powerAfterLevels,
          "direction-state",
        ),
        formulaStep(
          "其他威力乘区",
          otherPowerMultiplier,
          powerAfterLevels,
          automaticPanelPower,
          "direction-state",
        ),
        formulaStep(
          "显示威力",
          { method: "round" },
          automaticPanelPower,
          panelPower,
          "damage-formula-v1",
        ),
      ]
    : [
        ...(usesLockedPower
          ? [
              formulaStep(
                "继承显示威力",
                powerResolution.value,
                powerResolution.value,
                powerResolution.value,
                "listen-bridge-counter-v1",
              ),
            ]
          : [
              ...powerResolution.steps,
              formulaStep(
                "基础威力",
                skill.basePower,
                skill.basePower,
                powerResolution.value,
                skill.provenance?.basePower ??
                  skill.provenance ??
                  "snapshot-skill",
              ),
            ]),
        formulaStep(
          "固定威力增加",
          fixedPowerAdd,
          powerResolution.value,
          powerAfterFixed,
          fixedPowerAdd === 0 ? "default" : "battle-input",
        ),
        formulaStep(
          "印记固定威力",
          markFixedPowerAdd,
          powerAfterFixed,
          powerAfterMarkFixed,
          markFixedPowerAdd === 0 ? "default" : "reviewed-mark-system-v1",
        ),
        formulaStep(
          "特性固定威力",
          traitFixedPowerAdd,
          powerAfterMarkFixed,
          powerAfterTraitFixed,
          traitFixedPowerAdd === 0
            ? "default"
            : "reviewed-trait:interactive-effect-v1",
        ),
        ...(bloodlineFixedPowerAdd === 0
          ? []
          : [
              formulaStep(
                `${attackerBloodline.label}血脉`,
                `+${bloodlineFixedPowerAdd} 固定威力`,
                powerAfterTraitFixed,
                powerAfterBloodlineFixed,
                "reviewed-trait:beast-flower-bloodline-v1",
              ),
            ]),
        ...(contractFixedPowerAdd === 0
          ? []
          : [
              formulaStep(
                attackerContract.label,
                `+${contractFixedPowerAdd} 固定威力`,
                powerAfterBloodlineFixed,
                powerAfterContractFixed,
                "reviewed-trait:contract-shape-v1",
              ),
            ]),
        formulaStep(
          "技能威力百分比",
          percentageAdds,
          powerAfterContractFixed,
          actualPower,
          percentageAdds.length === 0 ? "default" : "battle-input",
        ),
        formulaStep(
          "本系",
          stabMultiplier,
          traitAdjustedPower,
          powerAfterStab,
          "automatic",
        ),
        formulaStep(
          "属性克制",
          defender.types,
          powerAfterStab,
          powerAfterType,
          snapshot.typeChart?.source ?? "builtin-type-chart-v1",
        ),
        formulaStep(
          "天气",
          {
            multiplier: weatherMultiplier,
            remainingTurns: weatherRainTurns,
            weather: weatherRainTurns > 0 ? "雨天" : "无天气",
          },
          powerAfterType,
          powerAfterWeather,
          weatherRainTurns > 0
            ? "battle-weather:rain-v1"
            : "default",
        ),
        formulaStep(
          "攻防等级",
          attackDefenseLevelMultiplier,
          powerAfterWeather,
          powerAfterLevels,
          "direction-state",
        ),
        ...traitResolution.steps,
        formulaStep(
          "其他威力乘区",
          otherPowerMultiplier,
          powerAfterLevels,
          automaticPanelPower,
          "direction-state",
        ),
        formulaStep(
          "显示威力",
          { method: "round" },
          automaticPanelPower,
          displayedPower,
          "damage-formula-v1",
        ),
      ];
  const formulaSteps = [
    formulaStep(
      "攻击面板",
      statKeys.attack,
      attacker.panelStats[statKeys.attack],
      attackerStat,
      "panel-stat",
    ),
    ...powerFormulaSteps,
    ...traitHitCount.steps,
    ...fixedHitCountSteps,
    formulaStep(
      "等级系数与攻防比",
      {
        level,
        coefficient: mainDamage.coefficient,
        attackerStat,
        calculationPower,
        damageReductionMultiplier,
        defenderDefense,
        displayedPower,
        roundedNumerator: mainDamage.numerator,
        unroundedNumerator: mainDamage.unroundedNumerator,
        unroundedOneHit: mainDamage.unroundedOneHit,
      },
      mainDamage.unroundedNumerator,
      mainDamage.oneHit,
      "damage-formula-v1",
    ),
    formulaStep(
      "减伤、连击与最终倍率",
      {
        damageReductionMultiplier,
        hitCount: normalizeDamageHitCount(hitCount),
        finalDamageMultiplier,
        oneHitAfterFinal: mainDamage.finalOneHit,
      },
      mainDamage.oneHit,
      mainDamage.total,
      "damage-formula-v1",
    ),
    formulaStep(
      "星陨追加伤害",
      {
        stacks: starfallStacks,
        power: additionalDamage.power,
        typeMultiplier: additionalDamage.typeMultiplier,
      },
      mainDamage.total,
      additionalDamage.total,
      "reviewed-rule:starfall-v1",
    ),
    ...(clownTrick.active
      ? [
          formulaStep(
            "戏耍特性伤害",
            {
              actualHealing: clownTrick.actualHealing,
              lifestealPercent: clownTrick.lifestealPercent,
              missingHp: clownTrick.missingHp,
              requestedHealing: clownTrick.requestedHealing,
            },
            mainDamage.total + additionalDamage.total,
            clownTrick.damage,
            "reviewed-trait:clown-trick-v1",
          ),
        ]
      : []),
    ...(baronGreed.active
      ? [
          formulaStep(
            "贪得无厌溢出回复",
            {
              hitDamages: baronGreed.hitDamages,
              lifestealPercent: baronGreed.effectiveLifestealPercent,
              missingHp: baronGreed.missingHp,
              overflowHealing: baronGreed.overflowHealing,
              requestedHealing: baronGreed.requestedHealing,
            },
            mainDamage.total,
            baronGreed.attackLevelStageAdd,
            "reviewed-trait:baron-greed-v2",
          ),
        ]
      : []),
  ];
  const sources = [
    skill.provenance,
    snapshot.typeChart?.source,
    ...traitResolution.sources,
    ...traitHitCount.sources,
    ...(fixedHitCount?.sources ?? []),
    ...(attackerBloodline.active || defenderBloodline.active
      ? ["reviewed-trait:beast-flower-bloodline-v1"]
      : []),
    ...(attackerContract.active || defenderContract.active
      ? ["reviewed-trait:contract-shape-v1"]
      : []),
    ...(clownTrick.active ? ["reviewed-trait:clown-trick-v1"] : []),
    ...(baronGreed.active ? ["reviewed-trait:baron-greed-v2"] : []),
  ].filter(Boolean);

  const attackStageFor = (category) => attackStageForCategory(category);
  const defenseStageFor = (category) =>
    (defenseLevelStage ?? 0) +
    (categoryTraitResolutions[category]?.status === "exact"
      ? categoryTraitResolutions[category].defenseLevelBonus
      : 0) +
    defenderBloodline.defenseLevelBonusByCategory[category] +
    attackerBloodline.targetDefenseLevelBonusByCategory[category] +
    defenderContract.defenseLevelBonusByCategory[category] +
    attackerContract.targetDefenseLevelBonusByCategory[category];
  const combatPanel = {
    attacker: {
      ...baseCombatPanel.attacker,
      magicalAttack: Math.round(
        abilityAdjustedStat(
          attacker.panelStats.magicalAttack,
          attackStageFor("magical"),
        ),
      ),
      physicalAttack: Math.round(
        abilityAdjustedStat(
          attacker.panelStats.physicalAttack,
          attackStageFor("physical"),
        ),
      ),
      speed: context.attackerSpeed,
    },
    defender: {
      ...baseCombatPanel.defender,
      magicalDefense: Math.round(
        abilityAdjustedStat(
          defender.panelStats.magicalDefense,
          defenseStageFor("magical"),
        ),
      ),
      physicalDefense: Math.round(
        abilityAdjustedStat(
          defender.panelStats.physicalDefense,
          defenseStageFor("physical"),
        ),
      ),
      speed: context.defenderSpeed,
    },
  };

  return {
    skillId: skill.id,
    skillName: skill.name,
    resolvedPower: powerResolution.value,
    staticPower,
    staticPowerPercentAdds: staticPowerOverride
      ? []
      : [...skillPercentageAdds, ...statusPercentageAdds],
    actualPower,
    displayPower: panelPower,
    panelPower,
    powerSource: powerOverride.source,
    donationPoisonStacks: powerResolution.donationPoisonStacks,
    skillCost: finiteNumber(powerResolution.resolvedCost) ?? skill.cost,
    skillPower: actualPower,
    effectivePower: panelPower,
    automaticHitCountAdd,
    hitCount: normalizeDamageHitCount(hitCount),
    hitDamages: hasSequentialBaronSettlement
      ? baronGreed.hitDamages
      : Array.from(
          { length: normalizeDamageHitCount(hitCount) },
          () => mainDamage.finalOneHit,
        ),
    totalDamage,
    mainDamage: mainDamage.total,
    additionalDamage: additionalDamage.total,
    traitDamage: clownTrick.damage,
    combatPanel,
    markSettlements,
    traitSettlements,
    postAttackEffects: baronGreed.active
      ? {
          attackLevelStageAdd: baronGreed.attackLevelStageAdd,
          selfCurrentHpAfterSettlement:
            baronGreed.currentHpAfterSettlement,
          selfDamageAfterHealing: baronGreed.selfDamageAfterHealing,
          source: "贪得无厌",
        }
      : undefined,
    hpPercent,
    lethal: currentHp <= totalDamage,
    status: "exact",
    formulaSteps,
    sources,
    typeLabel: skill.type,
    typeMultiplier,
    warnings: traitResolution.warnings,
  };
}

function calculateDirectTraitDamageResult({
  attacker,
  defender,
  direction,
  level,
  rule,
}) {
  if (!rule) return null;
  const skill = {
    basePower: rule.basePower,
    category: rule.category,
    id: rule.id,
    name: rule.name,
    type: "无",
  };
  const traitResolution = resolveTraitMultipliers({
    attackerTraits: [],
    defenderTraits: defender.traits,
    skill,
    attacker,
    defender,
    context: direction.context ?? {},
  });
  if (traitResolution.status !== "exact") {
    return unresolvedResult(skill, traitResolution, {
      category: rule.category,
      sourceKind: "trait",
      typeLabel: rule.typeLabel,
    });
  }

  const directionOverrides = direction.overrides ?? {};
  const baseAttackerStat = finiteNumber(
    directionOverrides.attackerStat,
    attacker.panelStats.physicalAttack,
  );
  const baseDefenderDefense = finiteNumber(
    directionOverrides.defenderDefense,
    defender.panelStats.physicalDefense,
  );
  const attackLevelStage =
    finiteNumber(directionOverrides.attackLevelStage, direction.attackLevelStage) ??
    0;
  const defenseLevelStage =
    finiteNumber(directionOverrides.defenseLevelStage, direction.defenseLevelStage) ??
    0;
  const totalAttackLevelStage =
    attackLevelStage + traitResolution.attackLevelBonus;
  const totalDefenseLevelStage =
    defenseLevelStage + traitResolution.defenseLevelBonus;
  const attackDefenseLevelMultiplier = abilityLevelMultiplier(
    totalAttackLevelStage,
    totalDefenseLevelStage,
  );
  const attackerStat = Math.round(
    abilityAdjustedStat(baseAttackerStat, totalAttackLevelStage),
  );
  const defenderDefense = Math.round(
    abilityAdjustedStat(baseDefenderDefense, totalDefenseLevelStage),
  );
  const displayedPower = rule.basePower * attackDefenseLevelMultiplier;
  const calculationPower = rule.basePower;
  const damageReductionMultiplier =
    Math.max(0, finiteNumber(direction.reduction) ?? 1) *
    traitResolution.damageReductionMultiplier *
    Math.max(
      0,
      finiteNumber(directionOverrides.damageReductionMultiplier) ?? 1,
    );
  const finalDamageMultiplier =
    Math.max(
      0,
      finiteNumber(
        directionOverrides.finalDamageMultiplier,
        direction.finalDamageMultiplier,
      ) ?? 1,
    ) * traitResolution.finalDamageMultiplier;
  const hitCount = Math.min(
    99,
    Math.max(1, Math.floor(Number(direction.traitDamageHitCount) || 1)),
  );
  const damage = calculateDamage({
    attackerStat,
    displayedPower: calculationPower,
    defenderDefense,
    damageReductionMultiplier,
    hitCount,
    finalDamageMultiplier,
    level,
  });
  const maximumHp = Math.max(0, Number(defender.panelStats.hp) || 0);
  const currentHp = Math.min(
    maximumHp,
    Math.max(
      0,
      finiteNumber(direction.currentHp, defender.currentHp, maximumHp) ?? 0,
    ),
  );

  return {
    additionalDamage: 0,
    category: rule.category,
    effectivePower: rule.basePower,
    formulaSteps: [
      formulaStep(
        "特性威力",
        { basePower: rule.basePower, type: rule.typeLabel },
        rule.basePower,
        rule.basePower,
        rule.id,
      ),
      formulaStep(
        "攻防能力等级",
        attackDefenseLevelMultiplier,
        rule.basePower,
        displayedPower,
        "direction-state",
      ),
      formulaStep(
        "每段伤害",
        {
          attackerStat,
          defenderDefense,
          damageReductionMultiplier,
          finalDamageMultiplier,
          roundedNumerator: damage.numerator,
        },
        damage.unroundedOneHit,
        damage.oneHit,
        "damage-formula-v1",
      ),
      formulaStep(
        "连击总伤害",
        { hitCount },
        damage.oneHit,
        damage.total,
        "damage-formula-v1",
      ),
    ],
    hitCount,
    hpPercent: maximumHp > 0 ? damage.total / maximumHp * 100 : 0,
    lethal: currentHp <= damage.total,
    mainDamage: damage.total,
    skillId: rule.id,
    skillName: rule.name,
    skillPower: rule.basePower,
    sourceKind: "trait",
    sources: [rule.id, ...traitResolution.sources],
    status: "exact",
    totalDamage: damage.total,
    traitDamage: 0,
    typeLabel: rule.typeLabel,
    typeMultiplier: 1,
    warnings: traitResolution.warnings,
    weatherMultiplier: 1,
  };
}

function calculateDirection({
  snapshot,
  mode,
  direction,
  attackerSide,
  attacker,
  attackerCurrentHp,
  attackerHpPercent,
  defender,
  defenderCurrentHp,
  defenderHpPercent,
  skillsById,
  level,
  sourceMarks,
  sourceSide,
  targetMarks,
  targetSide,
}) {
  const entries = skillEntriesForMode(attackerSide, mode);
  const pressureValveAdds = mode === "four"
    ? pressureValveFixedPowerAdds(entries, skillsById)
    : {};
  const existingFixedPowerAdds = direction.overrides?.fixedPowerAddsBySlot ?? {};
  const directionWithPressureValve = Object.keys(pressureValveAdds).length > 0
    ? {
        ...direction,
        overrides: {
          ...direction.overrides,
          fixedPowerAddsBySlot: Object.fromEntries(
            [...new Set([
              ...Object.keys(existingFixedPowerAdds),
              ...Object.keys(pressureValveAdds),
            ])].map((skillPosition) => [
              skillPosition,
              (Number(existingFixedPowerAdds[skillPosition]) || 0) +
                (Number(pressureValveAdds[skillPosition]) || 0),
            ]),
          ),
        },
      }
    : direction;
  const traitName = choiceTraitName(attacker);
  const currentHp = Math.min(
    defender.panelStats.hp,
    Math.max(
      0,
      finiteNumber(
        defenderCurrentHp,
        defender.currentHp,
        defender.panelStats.hp,
      ) ?? 0,
    ),
  );
  const preliminaryResults = entries.map((entry, index) => {
    const skill = resolveEmbeddedDamageSkill(
      resolveWingExtensionSkill({
        skill: resolveSkillEntity(entry, skillsById),
        traits: attacker.traits,
      }),
    );
    const details = entryDetails(entry);
    const sequence = buildChoiceSkillSequence({
      context: details.context,
      skill,
      sproutStacks:
        sourceMarks?.positive?.id === "sprout"
          ? sourceMarks.positive.stacks
          : 0,
      traitName,
    });
    const executions =
      mode === "four" &&
      skill &&
      skill.category !== "status" &&
      skill.category !== "defense"
        ? sequence.executions
        : [{ context: details.context }];
    const passResults = executions.map((execution) =>
      calculateSkillResult({
        snapshot,
        mode,
        skill,
        entry: entryWithContext(entry, execution.context),
        direction: directionWithPressureValve,
        attacker,
        attackerCurrentHp,
        attackerHpPercent,
        defender,
        defenderCurrentHp,
        defenderHpPercent,
        level,
        skillPosition: mode === "four" ? index + 1 : undefined,
        sourceMarks,
        sourceSide,
        targetMarks,
        targetSide,
      }),
    );
    const companionIndex =
      mode === "four" && isGaleTurbine(skill)
        ? galeTurbineCompanionIndex(details.context, entries.length)
        : null;
    const companionEntry =
      companionIndex !== null && companionIndex !== index
        ? entries[companionIndex]
        : null;
    const companionSkill = resolveWingExtensionSkill({
      skill: resolveSkillEntity(companionEntry, skillsById),
      traits: attacker.traits,
    });
    if (
      companionIndex !== null &&
      companionSkill?.type === "翼" &&
      isDamageSkill(companionSkill)
    ) {
      const companionResult = calculateSkillResult({
        snapshot,
        mode,
        skill: companionSkill,
        entry: companionEntry,
        direction: directionWithPressureValve,
        attacker,
        attackerCurrentHp,
        attackerHpPercent,
        defender,
        defenderCurrentHp,
        defenderHpPercent,
        level,
        skillPosition: companionIndex + 1,
        sourceMarks,
        sourceSide,
        targetMarks,
        targetSide,
      });
      return mergeGaleTurbineResults({
        companionResult,
        currentHp,
        defender,
        turbineResult: passResults[0],
      });
    }
    return passResults.length > 1
      ? mergeChoiceTraitResults(
          passResults,
          traitName,
          defender,
          currentHp,
          executions,
        )
      : passResults[0];
  });
  const results = preliminaryResults.map((result, index) => {
    const entry = entries[index];
    const skill = resolveEmbeddedDamageSkill(
      resolveWingExtensionSkill({
        skill: resolveSkillEntity(entry, skillsById),
        traits: attacker.traits,
      }),
    );
    if (mode !== "four" || !isAdjacentPowerSkill(skill)) return result;

    const adjacent = (adjacentIndex) => {
      if (adjacentIndex < 0 || adjacentIndex >= entries.length) return null;
      const adjacentEntry = entries[adjacentIndex];
      const adjacentSkill = resolveEmbeddedDamageSkill(
        resolveWingExtensionSkill({
          skill: resolveSkillEntity(adjacentEntry, skillsById),
          traits: attacker.traits,
        }),
      );
      if (!adjacentSkill) return { name: "空技能槽", power: 0 };
      if (adjacentSkill.category === "status" || adjacentSkill.category === "defense") {
        return { name: adjacentSkill.name, power: 0 };
      }
      if (isAdjacentPowerSkill(adjacentSkill)) return null;
      const adjacentResult = preliminaryResults[adjacentIndex];
      if (
        adjacentResult?.status !== "exact" ||
        !Number.isFinite(Number(adjacentResult.effectivePower))
      ) return null;
      return {
        name: adjacentSkill.name,
        power: Number(adjacentResult.effectivePower),
      };
    };

    const fourSlotIndex = (offset) =>
      index < 4 && entries.length >= 4
        ? (index + offset + 4) % 4
        : index + offset;
    const left = adjacent(fourSlotIndex(-1));
    const right = adjacent(fourSlotIndex(1));
    const details = entryDetails(entry);
    return calculateSkillResult({
      snapshot,
      mode,
      skill,
      entry: entryWithContext(entry, {
        ...details.context,
        ...(left
          ? {
              adjacentLeftDisplayedPower: left.power,
              adjacentLeftSkillName: left.name,
            }
          : {}),
        ...(right
          ? {
              adjacentRightDisplayedPower: right.power,
              adjacentRightSkillName: right.name,
            }
          : {}),
      }),
      direction: directionWithPressureValve,
      attacker,
      attackerCurrentHp,
      attackerHpPercent,
      defender,
      defenderCurrentHp,
      defenderHpPercent,
      level,
      skillPosition: index + 1,
      sourceMarks,
      sourceSide,
      targetMarks,
      targetSide,
    });
  });
  const selectedIndex =
    mode === "four"
      ? Math.min(
          results.length - 1,
          Math.max(0, Math.floor(Number(direction.selectedSkillIndex) || 0)),
        )
      : 0;
  const traitResult =
    mode === "four"
      ? calculateDirectTraitDamageResult({
          attacker,
          defender,
          direction,
          level,
          rule: findDirectTraitDamageRule(attacker.traits),
        })
      : null;
  const bloodlineMagicHealing = resolveBloodlineMagicHealing({
    context: direction.context,
    maximumHp: attacker.panelStats.hp,
  });
  const bloodlineSettlement =
    bloodlineMagicHealing.active && hasClownTrickTrait(attacker.traits)
      ? resolveClownTrickDamage({
          attackerTraits: attacker.traits,
          attackerCurrentHp,
          attackerMaximumHp: attacker.panelStats.hp,
          context: direction.context,
          externalHealingSources: [
            {
              amount: bloodlineMagicHealing.healing,
              label: bloodlineMagicHealing.sourceLabel,
            },
          ],
          mainDamage: 0,
          persistentLifestealPercent: 0,
          skill: null,
        })
      : null;
  const bloodlineResult = bloodlineSettlement?.active
    ? {
        additionalDamage: 0,
        combatPanel: results.find((result) => result?.combatPanel)?.combatPanel,
        effectivePower: 0,
        formulaSteps: [
          formulaStep(
            "血脉魔法回复",
            `${attacker.panelStats.hp} × 50%`,
            bloodlineMagicHealing.healing,
            bloodlineMagicHealing.healing,
            "bloodline-magic:photosynthetic-healing-v1",
          ),
          formulaStep(
            "戏耍特性伤害",
            {
              actualHealing: bloodlineSettlement.actualHealing,
              missingHp: bloodlineSettlement.missingHp,
              requestedHealing: bloodlineSettlement.requestedHealing,
            },
            bloodlineSettlement.requestedHealing,
            bloodlineSettlement.damage,
            "reviewed-trait:clown-trick-v1",
          ),
        ],
        hitCount: 1,
        hpPercent:
          defender.panelStats.hp > 0
            ? (bloodlineSettlement.damage / defender.panelStats.hp) * 100
            : 0,
        lethal: currentHp <= bloodlineSettlement.damage,
        mainDamage: 0,
        skillId: "bloodline:photosynthetic-healing",
        skillName: "戏耍·光合治愈",
        skillPower: 0,
        sourceKind: "bloodline",
        sources: [
          "bloodline-magic:photosynthetic-healing-v1",
          "reviewed-trait:clown-trick-v1",
        ],
        status: "exact",
        totalDamage: bloodlineSettlement.damage,
        traitDamage: bloodlineSettlement.damage,
        traitSettlements: bloodlineSettlement.settlement
          ? [bloodlineSettlement.settlement]
          : [],
        typeLabel: "无·血脉",
        typeMultiplier: 1,
        warnings: [],
      }
    : null;
  const selectedResult =
    direction.selectedDamageSource === "trait" && traitResult
      ? traitResult
      : direction.selectedDamageSource === "bloodline" && bloodlineResult
        ? bloodlineResult
        : results[selectedIndex] ?? emptySlotResult();

  return {
    bloodlineResult,
    results,
    selectedResult,
    traitResult,
  };
}

function selectedAttackForCounter({ direction, directionResult, side, skillsById }) {
  const index = Math.max(
    0,
    Math.floor(Number(direction?.selectedSkillIndex) || 0),
  );
  const entry = side?.skills?.four?.[index];
  const skill = resolveSkillEntity(entry, skillsById);
  const result = directionResult?.results?.[index];
  if (
    !skill ||
    !["physical", "magical", "dual"].includes(skill.category) ||
    result?.status !== "exact" ||
    !Number.isFinite(result.panelPower)
  ) return null;
  return { result, skill };
}

function withListenBridgeCounters({
  snapshot,
  direction,
  directionResult,
  ownerSide,
  owner,
  ownerCurrentHp,
  ownerHpPercent,
  opponent,
  opponentCurrentHp,
  opponentHpPercent,
  sourceAttack,
  skillsById,
  level,
  sourceMarks,
  sourceSide,
  targetMarks,
  targetSide,
}) {
  if (!sourceAttack || !ownerSide?.skills?.four) return directionResult;
  let changed = false;
  const results = directionResult.results.map((result, index) => {
    const entry = ownerSide.skills.four[index];
    const skill = resolveSkillEntity(entry, skillsById);
    if (skill?.name !== "听桥") return result;
    changed = true;
    return {
      ...calculateSkillResult({
        snapshot,
        mode: "four",
        skill: {
          ...skill,
          basePower: sourceAttack.result.panelPower,
          category: "physical",
          type: "武",
        },
        entry: {
          skillId: skill.id,
          hitCount: 1,
          context: {},
          overrides: {},
        },
        direction,
        attacker: owner,
        attackerCurrentHp: ownerCurrentHp,
        attackerHpPercent: ownerHpPercent,
        defender: opponent,
        defenderCurrentHp: opponentCurrentHp,
        defenderHpPercent: opponentHpPercent,
        level,
        skillPosition: index + 1,
        sourceMarks,
        sourceSide,
        targetMarks,
        targetSide,
        lockedPower: sourceAttack.result.panelPower,
      }),
      reflectedPower: sourceAttack.result.panelPower,
      reflectedSourceSkillId: sourceAttack.skill.id,
      reflectedSourceSkillName: sourceAttack.skill.name,
    };
  });
  if (!changed) return directionResult;
  const selectedIndex = Math.min(
    results.length - 1,
    Math.max(0, Math.floor(Number(direction.selectedSkillIndex) || 0)),
  );
  return {
    ...directionResult,
    results,
    selectedResult:
      direction.selectedDamageSource === "trait" && directionResult.traitResult
        ? directionResult.traitResult
        : direction.selectedDamageSource === "bloodline" &&
            directionResult.bloodlineResult
          ? directionResult.bloodlineResult
          : results[selectedIndex] ?? emptySlotResult(),
  };
}

export function calculateMatchup(snapshot, battleInput) {
  const mode = battleInput.mode === "four" ? "four" : "single";
  const sides = battleInput.sides ?? {
    attacker: battleInput.attacker,
    defender: battleInput.defender,
  };
  const directions = battleInput.directions ?? {
    forward: battleInput.forward,
    reverse: battleInput.reverse,
  };
  const indexes = getSnapshotIndexes(snapshot);
  const attacker = resolveCombatant(
    snapshot,
    sides.attacker,
    mode,
    indexes,
  );
  const defender = resolveCombatant(
    snapshot,
    sides.defender,
    mode,
    indexes,
  );
  const level = finiteNumber(battleInput.level) ?? 60;
  const marks = battleInput.marks ?? null;
  const baseForward = calculateDirection({
    snapshot,
    mode,
    direction: directions.forward ?? {},
    attackerSide: sides.attacker,
    attacker,
    attackerCurrentHp: directions.reverse?.currentHp,
    attackerHpPercent: directions.reverse?.context?.currentHpPercent,
    defender,
    defenderCurrentHp: directions.forward?.currentHp,
    defenderHpPercent: directions.forward?.context?.currentHpPercent,
    skillsById: indexes.skills,
    level,
    sourceMarks: marks?.attacker,
    sourceSide: "attacker",
    targetMarks: marks?.defender,
    targetSide: "defender",
  });
  const baseReverse = calculateDirection({
    snapshot,
    mode,
    direction: directions.reverse ?? {},
    attackerSide: sides.defender,
    attacker: defender,
    attackerCurrentHp: directions.forward?.currentHp,
    attackerHpPercent: directions.forward?.context?.currentHpPercent,
    defender: attacker,
    defenderCurrentHp: directions.reverse?.currentHp,
    defenderHpPercent: directions.reverse?.context?.currentHpPercent,
    skillsById: indexes.skills,
    level,
    sourceMarks: marks?.defender,
    sourceSide: "defender",
    targetMarks: marks?.attacker,
    targetSide: "attacker",
  });

  const forwardSourceAttack = mode === "four" ? selectedAttackForCounter({
    direction: directions.forward ?? {},
    directionResult: baseForward,
    side: sides.attacker,
    skillsById: indexes.skills,
  }) : null;
  const reverseSourceAttack = mode === "four" ? selectedAttackForCounter({
    direction: directions.reverse ?? {},
    directionResult: baseReverse,
    side: sides.defender,
    skillsById: indexes.skills,
  }) : null;
  const forward = withListenBridgeCounters({
    snapshot,
    direction: directions.forward ?? {},
    directionResult: baseForward,
    ownerSide: sides.attacker,
    owner: attacker,
    ownerCurrentHp: directions.reverse?.currentHp,
    ownerHpPercent: directions.reverse?.context?.currentHpPercent,
    opponent: defender,
    opponentCurrentHp: directions.forward?.currentHp,
    opponentHpPercent: directions.forward?.context?.currentHpPercent,
    sourceAttack: reverseSourceAttack,
    skillsById: indexes.skills,
    level,
    sourceMarks: marks?.attacker,
    sourceSide: "attacker",
    targetMarks: marks?.defender,
    targetSide: "defender",
  });
  const reverse = withListenBridgeCounters({
    snapshot,
    direction: directions.reverse ?? {},
    directionResult: baseReverse,
    ownerSide: sides.defender,
    owner: defender,
    ownerCurrentHp: directions.forward?.currentHp,
    ownerHpPercent: directions.forward?.context?.currentHpPercent,
    opponent: attacker,
    opponentCurrentHp: directions.reverse?.currentHp,
    opponentHpPercent: directions.reverse?.context?.currentHpPercent,
    sourceAttack: forwardSourceAttack,
    skillsById: indexes.skills,
    level,
    sourceMarks: marks?.defender,
    sourceSide: "defender",
    targetMarks: marks?.attacker,
    targetSide: "attacker",
  });

  return {
    forward,
    reverse,
    versions: {
      data: snapshot.meta.id,
      rules: snapshot.meta.rulesVersion ?? RULES_VERSION,
    },
  };
}
