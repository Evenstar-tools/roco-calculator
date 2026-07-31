import { RULES_VERSION } from "./constants.js";
import { calculateDamage } from "./damage.js";
import { getDefaultHitCount } from "./skill-effects.js";
import { resolveSkillPower } from "./skill-rules.js";
import { calculateAllPanelStats } from "./stat.js";
import { getInheritedDamageTraits } from "./trait-effects.js";
import {
  normalizeMarkSlot,
  resolveSourceMarkEffects,
  targetNegativeMarkSettlement,
} from "./marks.js";
import { resolveTraitMultipliers } from "./traits.js";
import { getTypeMultiplier } from "./type-chart.js";

function indexById(items = []) {
  if (!Array.isArray(items)) return items ?? {};
  return Object.fromEntries(items.map((item) => [item.id, item]));
}

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

function asMultiplierList(value) {
  if (Array.isArray(value)) return value;
  return value === undefined ? [] : [value];
}

function abilityLevelMultiplier(attackStage, defenseStage) {
  const attackPercent = Number(attackStage) * 10;
  const defensePercent = Number(defenseStage) * 10;
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
  const percent = Number(stage) * 10;
  const numerator = 1 + Math.max(percent, 0) / 100;
  const denominator = 1 + Math.max(-percent, 0) / 100;
  return Number(value) * numerator / denominator;
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
    return Array.from({ length: 4 }, (_, index) => entries[index] ?? null);
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

function entryDetails(entry) {
  return entry && typeof entry === "object" ? entry : {};
}

function carriedSkillEntries(side, mode) {
  const four = side.skills?.four ?? side.fourSkills;
  if (Array.isArray(four) && four.some(Boolean)) {
    return Array.from({ length: 4 }, (_, index) => four[index] ?? null);
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
  const displayedPower = Math.round(calculationPower);
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
}) {
  if (!skill) return emptySlotResult();

  const details = entryDetails(entry);
  const directionOverrides = direction.overrides ?? {};
  const slotOverrides = details.overrides ?? {};
  const usesDisplayedPower =
    mode === "single" && directionOverrides.powerMode === "displayed";
  const sourceNegativeMark = normalizeMarkSlot(
    sourceMarks?.negative,
    "negative",
  );
  const markedAttackerSpeed =
    Number(attacker.panelStats.speed) -
    (sourceNegativeMark.id === "slow"
      ? sourceNegativeMark.stacks * 10
      : 0);
  const context = {
    attackerSpeed: markedAttackerSpeed,
    defenderSpeed: defender.panelStats.speed,
    attackerPhysicalDefense: attacker.panelStats.physicalDefense,
    defenderPhysicalDefense: defender.panelStats.physicalDefense,
    enemyTotalSkillCost: defender.totalSkillCost,
    skillPosition,
    ...direction.context,
    ...details.context,
    ...directionOverrides.context,
    ...slotOverrides.context,
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
  const sourceMarkEffects = resolveSourceMarkEffects({
    actedBeforeEnemy: context.actedBeforeEnemy,
    attackerSpeed: attacker.panelStats.speed,
    defenderSpeed: defender.panelStats.speed,
    marks: sourceMarks,
    side: sourceSide,
    skill,
  });
  const basePowerOverride = finiteNumber(
    slotOverrides.basePower,
    slotOverrides.basePowerOverride,
    details.basePowerOverride,
    mode === "single" ? directionOverrides.basePower : undefined,
    mode === "single" ? directionOverrides.basePowerOverride : undefined,
  );
  if (basePowerOverride !== undefined) {
    context.basePowerOverride = basePowerOverride;
  }

  const traitResolution = resolveTraitMultipliers({
    attackerTraits: usesDisplayedPower ? [] : attacker.traits,
    defenderTraits: defender.traits,
    skill,
    attacker,
    defender,
    context,
  });
  if (traitResolution.status !== "exact") {
    return unresolvedResult(skill, traitResolution);
  }

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

  const powerResolution = usesDisplayedPower
    ? {
        status: "exact",
        steps: [],
        value:
          finiteNumber(directionOverrides.displayedPower, skill.basePower) ?? 0,
      }
    : resolveSkillPower(skill, context);
  if (powerResolution.status !== "exact") {
    return unresolvedResult(skill, powerResolution);
  }

  const fixedPowerAdd = usesDisplayedPower
    ? 0
    : finiteNumber(
        slotOverrides.fixedPowerAdd,
        details.fixedPowerAdd,
        directionOverrides.fixedPowerAdd,
        direction.fixedPowerAdd,
      ) ?? 0;
  const markFixedPowerAdd = usesDisplayedPower
    ? 0
    : sourceMarkEffects.fixedPowerAdd;
  const percentageAdds = usesDisplayedPower
    ? []
    : [
        ...asMultiplierList(direction.skillPowerPercentAdds),
        ...asMultiplierList(directionOverrides.skillPowerPercentAdds),
        ...asMultiplierList(details.skillPowerPercentAdds),
        ...asMultiplierList(slotOverrides.skillPowerPercentAdds),
        ...(traitResolution.powerPercentAdd === 0
          ? []
          : [traitResolution.powerPercentAdd]),
        ...(sourceMarkEffects.powerPercentAdd === 0
          ? []
          : [sourceMarkEffects.powerPercentAdd]),
      ];
  const powerAfterFixed = powerResolution.value + fixedPowerAdd;
  const powerAfterMarkFixed = powerAfterFixed + markFixedPowerAdd;
  const powerAfterTraitFixed =
    powerAfterMarkFixed + traitResolution.fixedPowerAdd;
  const effectivePower =
    powerAfterTraitFixed *
    (1 + percentageAdds.reduce((sum, value) => sum + (Number(value) || 0), 0));
  const traitAdjustedPower = effectivePower;

  const statKeys = statKeysForCategory(skill.category, attacker.panelStats);
  if (!statKeys) {
    return unresolvedResult(skill, {
      status: "unsupported",
      reason: `技能分类 ${skill.category} 的攻防取值规则尚未验证`,
      source: skill.provenance,
    });
  }

  const baseAttackerStat = finiteNumber(
    slotOverrides.attackerStat,
    directionOverrides.attackerStat,
    attacker.panelStats[statKeys.attack],
  );
  const attackerStat = baseAttackerStat;
  const defenderDefense = finiteNumber(
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
  const hasStageInput =
    attackLevelStage !== undefined ||
    defenseLevelStage !== undefined ||
    traitResolution.attackLevelBonus !== 0 ||
    traitResolution.defenseLevelBonus !== 0;
  const attackDefenseLevelMultiplier = hasStageInput
    ? abilityLevelMultiplier(
        (attackLevelStage ?? 0) + traitResolution.attackLevelBonus,
        (defenseLevelStage ?? 0) + traitResolution.defenseLevelBonus,
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
    !usesDisplayedPower && weatherRainTurns > 0 && skill.type === "水"
      ? 1.75
      : 1;
  const powerAfterStab = traitAdjustedPower * stabMultiplier;
  const powerAfterType =
    powerAfterStab * (usesDisplayedPower ? 1 : typeMultiplier);
  const powerAfterWeather = powerAfterType * weatherMultiplier;
  const powerAfterLevels =
    powerAfterWeather *
    (usesDisplayedPower ? 1 : attackDefenseLevelMultiplier);
  const powerAfterOther =
    powerAfterLevels * (usesDisplayedPower ? 1 : otherPowerMultiplier);
  const displayedPower = Math.round(powerAfterOther);
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
  const hitCount =
    finiteNumber(
      powerResolution.hitCount,
      slotOverrides.hitCount,
      details.hitCount,
      mode === "single" ? direction.hitCount : undefined,
      getDefaultHitCount(skill),
    ) ?? 1;
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
  const mainDamage = calculateDamage({
    attackerStat,
    displayedPower: powerAfterOther,
    defenderDefense,
    damageReductionMultiplier,
    hitCount,
    finalDamageMultiplier,
    level,
  });
  const targetNegativeMark = normalizeMarkSlot(
    targetMarks?.negative,
    "negative",
  );
  const legacyStarfallStacks =
    !targetNegativeMark.id && !targetMarks
      ? Math.max(0, Math.floor(Number(direction.starfallStacks) || 0))
      : 0;
  const starfallStacks =
    targetNegativeMark.id === "starfall"
      ? targetNegativeMark.stacks
      : legacyStarfallStacks;
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
    attackDefenseLevelMultiplier,
    otherPowerMultiplier,
  });
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
  const totalDamage = mainDamage.total + additionalDamage.total;
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
  const powerFormulaSteps = usesDisplayedPower
    ? [
        formulaStep(
          "游戏内显示威力",
          powerResolution.value,
          powerResolution.value,
          powerResolution.value,
          "battle-input",
        ),
        formulaStep(
          "本系",
          stabMultiplier,
          powerResolution.value,
          powerAfterStab,
          "automatic",
        ),
      ]
    : [
        ...powerResolution.steps,
        formulaStep(
          "基础威力",
          skill.basePower,
          skill.basePower,
          powerResolution.value,
          skill.provenance?.basePower ?? skill.provenance ?? "snapshot-skill",
        ),
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
          traitResolution.fixedPowerAdd,
          powerAfterMarkFixed,
          powerAfterTraitFixed,
          traitResolution.fixedPowerAdd === 0
            ? "default"
            : "reviewed-trait:interactive-effect-v1",
        ),
        formulaStep(
          "技能威力百分比",
          percentageAdds,
          powerAfterTraitFixed,
          effectivePower,
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
          powerAfterOther,
          "direction-state",
        ),
        formulaStep(
          "显示威力",
          { method: "round" },
          powerAfterOther,
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
    ...(usesDisplayedPower ? traitResolution.steps : []),
    formulaStep(
      "等级系数与攻防比",
      {
        level,
        coefficient: mainDamage.coefficient,
        attackerStat,
        calculationPower: powerAfterOther,
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
        hitCount: Math.max(1, Math.floor(Number(hitCount) || 1)),
        finalDamageMultiplier,
        oneHitAfterFinal: Math.floor(
          mainDamage.oneHit * finalDamageMultiplier,
        ),
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
  ];
  const sources = [
    skill.provenance,
    snapshot.typeChart?.source,
    ...traitResolution.sources,
  ].filter(Boolean);

  return {
    skillId: skill.id,
    skillName: skill.name,
    skillPower: Math.round(traitAdjustedPower),
    effectivePower: displayedPower,
    hitCount: Math.max(1, Math.floor(Number(hitCount) || 1)),
    totalDamage,
    mainDamage: mainDamage.total,
    additionalDamage: additionalDamage.total,
    markSettlements,
    hpPercent,
    lethal: currentHp <= totalDamage,
    status: "exact",
    formulaSteps,
    sources,
    warnings: traitResolution.warnings,
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
  const results = entries.map((entry, index) =>
    calculateSkillResult({
      snapshot,
      mode,
      skill: resolveSkillEntity(entry, skillsById),
      entry,
      direction,
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
  const selectedIndex =
    mode === "four"
      ? Math.min(
          results.length - 1,
          Math.max(0, Math.floor(Number(direction.selectedSkillIndex) || 0)),
        )
      : 0;

  return {
    results,
    selectedResult: results[selectedIndex] ?? emptySlotResult(),
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
  const indexes = {
    spirits: indexById(snapshot.spirits),
    skills: indexById(snapshot.skills),
    traits: indexById(snapshot.traits),
  };
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
  const forward = calculateDirection({
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
  const reverse = calculateDirection({
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

  return {
    forward,
    reverse,
    versions: {
      data: snapshot.meta.id,
      rules: snapshot.meta.rulesVersion ?? RULES_VERSION,
    },
  };
}
