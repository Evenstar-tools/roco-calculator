import { calculateDamage } from "../damage.js";
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
  powerOverride,
}) {
  const stackCount = Math.max(0, Math.floor(Number(stacks) || 0));
  if (stackCount === 0 || (powerOverride === undefined && skill.type === "幻")) {
    return {
      total: 0,
      power: 0,
    };
  }

  const power = Number.isFinite(Number(powerOverride))
    ? Number(powerOverride)
    : stackCount ** 2 + 24 * stackCount - 24;
  const typeMultiplier = getTypeMultiplier("幻", defenderTypes, typeChart);
  const calculationPower =
    power *
    typeMultiplier *
    attackDefenseLevelMultiplier *
    otherPowerMultiplier;
  const total = calculateDamage({
    attackerStat,
    displayedPower: calculationPower,
    defenderDefense,
    damageReductionMultiplier,
    hitCount: 1,
    finalDamageMultiplier,
    level,
  }).total;
  return {
    total,
    power,
    typeMultiplier,
  };
}
