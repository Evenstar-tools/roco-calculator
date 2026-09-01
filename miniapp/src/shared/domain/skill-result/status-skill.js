import { getDefaultHitCount } from "../skill-effects.js";
import { resolveTraitMultipliers } from "../traits.js";
import {
  abilityAdjustedStat,
  finiteNumber,
  traitAdjustedSpeed,
} from "./numeric.js";
import { formulaStep, unresolvedResult } from "./results.js";

export function statusOrDefenseSkillResult({
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
}) {
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
