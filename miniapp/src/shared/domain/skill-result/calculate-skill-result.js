import {
  resolveBaronGreed,
  resolveBaronGreedHitSequence,
} from "../baron-greed.js";
import { resolveBloodlineMagicHealing } from "../bloodline-magic.js";
import { resolveClownTrickDamage } from "../clown-trick.js";
import {
  calculateDamage,
  floorEffectiveSkillPower,
  normalizeDamageHitCount,
  roundDisplayedPower,
} from "../damage.js";
import {
  normalizeMarkSlot,
  resolveSourceMarkEffects,
  starfallStacksFromMarkSlot,
  targetNegativeMarkSettlement,
} from "../marks.js";
import { resolvePowerOverride } from "../power-override.js";
import {
  getDefaultHitCount,
  getEditableHitCountInput,
  getSkillEffectInputs,
  hasDeclaredHitCount,
} from "../skill-effects.js";
import { resolveSkillPower } from "../skill-rules.js";
import {
  getTraitEffectInputs,
  resolveBeastFlowerBloodlineTrait,
  resolveContractShapeTrait,
} from "../trait-effects.js";
import {
  resolveGlobalFixedHitCount,
  resolveTraitHitCountBonus,
} from "../trait-hit-count.js";
import { resolveTraitMultipliers } from "../traits.js";
import { projectTraitRuntimeContext } from "../trait-runtime.js";
import { projectTriggerContext } from "../trigger-controls.js";
import { getTypeMultiplier } from "../type-chart.js";
import { entryDetails, statKeysForCategory } from "./loadout.js";
import {
  abilityAdjustedStat,
  abilityLevelMultiplier,
  asMultiplierList,
  finiteNumber,
  normalizedPower,
  product,
  traitAdjustedSpeed,
} from "./numeric.js";
import {
  emptySlotResult,
  formulaStep,
  unresolvedResult,
} from "./results.js";
import { starfallDamage } from "./starfall.js";
import { statusOrDefenseSkillResult } from "./status-skill.js";

function resolvesBurstTrigger({ context, skill, traits }) {
  const skillControls = getSkillEffectInputs(skill).filter(
    (control) => control.contextKey === "burstTriggered",
  );
  if (skillControls.some(
    (control) =>
      projectTriggerContext(context, [control]).burstTriggered === true,
  )) return true;
  return (traits ?? []).some((trait) => {
    const controls = getTraitEffectInputs(trait, "attacker").filter(
      (control) => control.contextKey === "burstTriggered",
    );
    return controls.length > 0 &&
      projectTraitRuntimeContext(context, trait, controls).burstTriggered === true;
  });
}

export function calculateSkillResult({
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
  if (skill.calculationStatus === "pending-skill-data") {
    return unresolvedResult(skill, {
      status: "unsupported",
      reason: "技能参数待确认，暂不可计算",
      source: skill.provenance?.previewStatus ?? skill.provenance,
    });
  }

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
  const editableHitCountInput = getEditableHitCountInput(skill);
  const hitCountMaximum = editableHitCountInput
    ? editableHitCountInput.max ?? Number.POSITIVE_INFINITY
    : 99;
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
      hitCountMaximum,
      Math.max(
        1,
        Math.floor(
          (baseHitCount + automaticAdd) *
            (1 + persistentHitCountPercentAdd),
        ),
      ),
    );
  if (skill.category === "status" || skill.category === "defense") {
    return statusOrDefenseSkillResult({
      attacker,
      attackerBloodline,
      attackerContract,
      automaticHitCountAdd,
      baronGreedFor,
      clownTrickFor,
      context,
      defender,
      defenderBloodline,
      defenderContract,
      defenderCurrentHp,
      details,
      direction,
      directionOverrides,
      fixedHitCount,
      mode,
      rawAutomaticHitCountAdd,
      resolveHitCount,
      skill,
      slotOverrides,
      traitHitCount,
    });
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

  const costResolution = resolveSkillPower(skill, context);
  const resolvedSkillCost = finiteNumber(
    costResolution.resolvedCost,
    skill.cost,
  );
  const skillForCostConditions = Object.is(resolvedSkillCost, skill.cost)
    ? skill
    : { ...skill, cost: resolvedSkillCost };

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
      skill: { ...skillForCostConditions, category },
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
    powerResolution.ruleSource ?? costResolution.ruleSource,
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
    skillCost: finiteNumber(
      powerResolution.resolvedCost,
      costResolution.resolvedCost,
      skill.cost,
    ),
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
