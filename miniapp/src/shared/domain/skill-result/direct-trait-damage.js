import { calculateDamage } from "../damage.js";
import { resolveTraitMultipliers } from "../traits.js";
import {
  abilityAdjustedStat,
  abilityLevelMultiplier,
  finiteNumber,
} from "./numeric.js";
import { formulaStep, unresolvedResult } from "./results.js";

export function calculateDirectTraitDamageResult({
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
