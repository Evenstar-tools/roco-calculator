import { calculateDamage, roundDisplayedPower } from "../damage.js";
import { getTypeMultiplier } from "../type-chart.js";

export function starfallDamage({
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
