function finiteNumber(value, fallback) {
  if (value === null || value === undefined || value === "") return fallback;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

export const DAMAGE_ROUNDING_POLICY = Object.freeze({
  calculationPower: "preserve",
  damageNumerator: "round-half-up",
  displayedPower: "round-half-up",
  effectiveSkillPower: "floor",
  finalOneHitDamage: "floor",
  hitCount: "floor-then-multiply",
  oneHitDamage: "floor",
});

export function floorEffectiveSkillPower(value) {
  return Math.floor(finiteNumber(value, 0));
}

export function roundDisplayedPower(value) {
  return Math.round(finiteNumber(value, 0));
}

export function roundDamageNumerator(value) {
  return Math.round(finiteNumber(value, 0));
}

export function floorOneHitDamage(value) {
  return Math.floor(finiteNumber(value, 0));
}

export function normalizeDamageHitCount(value) {
  return Math.max(1, Math.floor(finiteNumber(value, 1)));
}

export function calculateDamage(input) {
  const attackerStat = finiteNumber(input.attackerStat, 0);
  const displayedPower = finiteNumber(input.displayedPower, 0);
  const defenderDefense = finiteNumber(input.defenderDefense, 0);
  const reduction = Math.max(
    0,
    finiteNumber(input.damageReductionMultiplier, 1),
  );
  const hitCount = normalizeDamageHitCount(input.hitCount);
  const finalMultiplier = Math.max(
    0,
    finiteNumber(input.finalDamageMultiplier, 1),
  );
  const level = finiteNumber(input.level, 60);

  if (defenderDefense <= 0) {
    throw new RangeError("defenderDefense must be greater than zero");
  }

  const coefficient = (level * 45 / 100 + 10) / 41;
  const unroundedNumerator = attackerStat * displayedPower * coefficient;
  const numerator = roundDamageNumerator(unroundedNumerator);
  const unroundedOneHit = numerator / defenderDefense * reduction;
  const oneHit = floorOneHitDamage(unroundedOneHit);
  const multiHit = oneHit * hitCount;
  const finalOneHit = floorOneHitDamage(oneHit * finalMultiplier);
  const total = finalOneHit * hitCount;

  return {
    coefficient,
    unroundedNumerator,
    numerator,
    unroundedOneHit,
    oneHit,
    finalOneHit,
    multiHit,
    total,
  };
}
