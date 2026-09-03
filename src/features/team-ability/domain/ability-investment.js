import { STAT_KEYS } from "../../../domain/constants.js";

export const BINARY_60_MAX3_RULESET_ID = "binary-60-max3-v1";

const MAX_ACTIVE_STATS = 3;

function assertSupportedRuleset(rulesetId) {
  if (rulesetId === BINARY_60_MAX3_RULESET_ID) return;
  const error = new TypeError(`未知能力投资规则：${String(rulesetId)}`);
  error.code = "UNSUPPORTED_ABILITY_RULESET";
  throw error;
}

export function validateAbilityInvestment({
  values = {},
  rulesetId = BINARY_60_MAX3_RULESET_ID,
} = {}) {
  assertSupportedRuleset(rulesetId);
  const activeStats = STAT_KEYS.filter(
    (stat) => Number.isFinite(values[stat]) && values[stat] > 0,
  );
  const violations = [];

  for (const stat of STAT_KEYS) {
    const value = values[stat];
    if (!Number.isFinite(value) || value < 0 || value > 60) {
      violations.push({ code: "OUT_OF_RANGE", stat, value });
      continue;
    }
    if (value !== 0 && value !== 60) {
      violations.push({
        code: "UNSUPPORTED_INVESTMENT_VALUE",
        stat,
        value,
      });
    }
  }
  if (activeStats.length > MAX_ACTIVE_STATS) {
    violations.push({
      code: "OVER_INVESTED_DIMENSIONS",
      maxActiveStats: MAX_ACTIVE_STATS,
      activeStats: [...activeStats],
    });
  }

  return {
    rulesetId,
    valid: violations.length === 0,
    activeStats,
    activeCount: activeStats.length,
    remainingSlots: Math.max(0, MAX_ACTIVE_STATS - activeStats.length),
    maxActiveStats: MAX_ACTIVE_STATS,
    violations,
  };
}

export function transitionAbilityInvestment({
  values = {},
  stat,
  selected,
  rulesetId = BINARY_60_MAX3_RULESET_ID,
} = {}) {
  assertSupportedRuleset(rulesetId);
  if (!STAT_KEYS.includes(stat)) {
    const error = new TypeError(`未知能力维度：${String(stat)}`);
    error.code = "UNKNOWN_ABILITY_STAT";
    throw error;
  }

  const currentValidation = validateAbilityInvestment({ values, rulesetId });
  const isCurrentlyActive =
    Number.isFinite(values[stat]) && values[stat] > 0;
  if (
    selected === true &&
    !isCurrentlyActive &&
    currentValidation.activeCount >= MAX_ACTIVE_STATS
  ) {
    return {
      changed: false,
      reason: "OVER_INVESTED_DIMENSIONS",
      values: { ...values },
      validation: currentValidation,
    };
  }

  const nextValue = selected === true ? 60 : 0;
  const nextValues = { ...values, [stat]: nextValue };
  return {
    changed: values[stat] !== nextValue,
    reason: null,
    values: nextValues,
    validation: validateAbilityInvestment({ values: nextValues, rulesetId }),
  };
}
