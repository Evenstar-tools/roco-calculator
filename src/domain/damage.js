function finiteNumber(value, fallback) {
  if (value === null || value === undefined || value === "") return fallback;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

export function calculateDamage(input) {
  const attackerStat = finiteNumber(input.attackerStat, 0);
  const displayedPower = finiteNumber(input.displayedPower, 0);
  const defenderDefense = finiteNumber(input.defenderDefense, 0);
  const reduction = Math.max(
    0,
    finiteNumber(input.damageReductionMultiplier, 1),
  );
  const hitCount = Math.max(1, Math.floor(finiteNumber(input.hitCount, 1)));
  const finalMultiplier = Math.max(
    0,
    finiteNumber(input.finalDamageMultiplier, 1),
  );
  const level = finiteNumber(input.level, 60);

  if (defenderDefense <= 0) {
    throw new RangeError("defenderDefense must be greater than zero");
  }

  const coefficient = (level * 45 / 100 + 10) / 41;
  const unroundedNumerator =
    attackerStat * displayedPower * reduction * coefficient;
  const numerator = unroundedNumerator;
  const unroundedOneHit = numerator / defenderDefense;
  const oneHit = Math.floor(unroundedOneHit);
  const multiHit = unroundedOneHit * hitCount;
  const total = Math.floor(multiHit * finalMultiplier);

  return {
    coefficient,
    unroundedNumerator,
    numerator,
    oneHit,
    multiHit,
    total,
  };
}
