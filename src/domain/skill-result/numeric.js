
export function finiteNumber(...values) {
  for (const value of values) {
    if (value === null || value === undefined || value === "") continue;
    const numeric = Number(value);
    if (Number.isFinite(numeric)) return numeric;
  }
  return undefined;
}

export function product(values) {
  return values.reduce((result, value) => {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? result * numeric : result;
  }, 1);
}

export function normalizedPower(value) {
  return Number(Number(value).toFixed(12));
}

export function asMultiplierList(value) {
  if (Array.isArray(value)) return value;
  return value === undefined ? [] : [value];
}

export function clampAbilityStage(value) {
  return Math.min(99, Math.max(-99, Number(value) || 0));
}

export function abilityLevelMultiplier(attackStage, defenseStage) {
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

export function abilityAdjustedStat(value, stage) {
  const percent = clampAbilityStage(stage) * 10;
  const numerator = 1 + Math.max(percent, 0) / 100;
  const denominator = 1 + Math.max(-percent, 0) / 100;
  return Number(value) * numerator / denominator;
}

export function traitAdjustedSpeed(value, stage, flatBonus = 0) {
  const base = Number(value) || 0;
  const percent = clampAbilityStage(stage) * 10;
  return base + Math.floor(base * percent / 100) + (Number(flatBonus) || 0);
}
