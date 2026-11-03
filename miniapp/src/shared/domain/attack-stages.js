const number = value => Number.isFinite(Number(value)) ? Number(value) : 0;
const clamp = value => Math.min(99, Math.max(-99, Math.floor(number(value))));

export function postAttackStageChanges(effects = {}) {
  // Keep the legacy result field readable without treating this named trait as a dual-attack gain.
  const amount = Math.max(0, Math.floor(number(effects?.attackLevelStageAdd)));
  return effects?.source === "贪得无厌"
    ? { attack: 0, physical: amount }
    : { attack: amount, physical: 0 };
}

// The common stage remains the one manual control. Category offsets represent
// settled single-stat effects; only their sum with the common stage is capped.
export function applyAttackStageChanges(overrides = {}, changes = {}) {
  const common = number(overrides.attackLevelStage) + number(changes.attack);
  const doublePositive = value => changes.doublePositive && value > 0 ? value * 2 : value;
  const attackLevelStage = clamp(doublePositive(common));
  const categoryOffset = category => {
    const previous = number(overrides[`${category}AttackLevelStageAdd`]);
    const added = number(changes[category]);
    if (!added && !changes.doublePositive) return previous;
    return clamp(doublePositive(clamp(common + previous + added))) - attackLevelStage;
  };
  return {
    attackLevelStage,
    physicalAttackLevelStageAdd: categoryOffset("physical"),
    magicalAttackLevelStageAdd: categoryOffset("magical"),
  };
}

export function positiveAttackStageGains(before = {}, after = {}) {
  const attack = Math.max(0, clamp(after.attackLevelStage) - clamp(before.attackLevelStage));
  const gain = category => Math.max(0,
    clamp(number(after.attackLevelStage) + number(after[`${category}AttackLevelStageAdd`])) -
    clamp(number(before.attackLevelStage) + number(before[`${category}AttackLevelStageAdd`])),
  ) - attack;
  return { attack, physicalAttack: gain("physical"), magicalAttack: gain("magical") };
}
