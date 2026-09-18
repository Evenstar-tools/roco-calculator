import {
  BINARY_60_MAX3_RULESET_ID,
  validateAbilityInvestment,
} from "./ability-investment.js";
import { STAT_KEYS } from "../../../domain/constants.js";
import { calculateDurability } from "./durability.js";
import { getNatureMultipliers, getQuickNatureId } from "../../../domain/natures.js";
import {
  calculateAllPanelStats,
  hasCompleteRaceStats,
} from "../../../domain/stat.js";

const DURABILITY_OBJECTIVES = Object.freeze([
  "physical",
  "magical",
  "combined",
]);

function panelStatsFor(configuration, displayIvs = configuration.displayIvs, natureId) {
  return calculateAllPanelStats({
    raceStats: configuration.raceStats,
    displayIvs,
    natureMultipliers: getNatureMultipliers(
      natureId ?? configuration.natureId ?? configuration.nature,
    ),
  });
}

function resolveTargetSpeed(target) {
  const targetSpeed = Number(
    typeof target === "object" && target !== null
      ? (target.speed ?? target.targetSpeed)
      : target,
  );
  if (Number.isFinite(targetSpeed) && targetSpeed > 0) return targetSpeed;
  const error = new TypeError("速度目标必须是有限正数");
  error.code = "INVALID_SPEED_TARGET";
  throw error;
}

export function analyzeSpeedBreakpoints({
  configuration,
  speedBonus = 0,
  speedBonusForSpeed,
  target,
  rulesetId = BINARY_60_MAX3_RULESET_ID,
  snapshotId = null,
} = {}) {
  const validation = validateAbilityInvestment({
    values: configuration?.displayIvs,
    rulesetId,
  });
  const targetSpeed = resolveTargetSpeed(target);
  if (!validation.valid) {
    return {
      rulesetId,
      snapshotId,
      status: "INVALID_INVESTMENT",
      currentSpeed: null,
      investedSpeed: null,
      targetSpeed,
      needsSpeedInvestment: false,
      validation,
      conflicts: [
        {
          code: "INVALID_INVESTMENT",
          violations: validation.violations,
        },
      ],
    };
  }
  if (!hasCompleteRaceStats(configuration?.raceStats)) {
    return {
      rulesetId,
      snapshotId,
      status: "INVALID_CONFIGURATION",
      currentSpeed: null,
      investedSpeed: null,
      targetSpeed,
      needsSpeedInvestment: false,
      validation,
      conflicts: [{ code: "INVALID_RACE_STATS" }],
    };
  }
  const normalizedSpeedBonus = Number.isFinite(Number(speedBonus))
    ? Number(speedBonus)
    : 0;
  const speedOptions = { flatBonus: normalizedSpeedBonus, speedBonusForSpeed };
  const currentSpeed = effectiveSpeedFor(panelStatsFor(configuration).speed, speedOptions);
  const investedSpeed = effectiveSpeedFor(panelStatsFor(configuration, {
    ...configuration.displayIvs,
    speed: 60,
  }).speed, speedOptions);

  let status = "REQUIRES_SPEED_INVESTMENT";
  if (currentSpeed >= targetSpeed) {
    status = "CURRENTLY_REACHED";
  } else if (investedSpeed < targetSpeed) {
    status = "UNREACHABLE_WITH_SPEED_INVESTMENT";
  } else if (
    configuration.displayIvs.speed !== 60 &&
    validation.remainingSlots === 0
  ) {
    status = "NO_INVESTMENT_SLOT";
  }

  return {
    rulesetId,
    snapshotId,
    status,
    currentSpeed,
    investedSpeed,
    ...(normalizedSpeedBonus === 0 ? {} : { speedBonus: normalizedSpeedBonus }),
    targetSpeed,
    needsSpeedInvestment: status === "REQUIRES_SPEED_INVESTMENT",
    validation,
  };
}

function countSetBits(value) {
  let remaining = value;
  let count = 0;
  while (remaining > 0) {
    count += remaining & 1;
    remaining >>>= 1;
  }
  return count;
}

function enumerateLegalInvestmentValues() {
  const candidates = [];
  const combinationCount = 2 ** STAT_KEYS.length;
  for (let mask = 0; mask < combinationCount; mask += 1) {
    if (countSetBits(mask) > 3) continue;
    candidates.push(
      Object.fromEntries(
        STAT_KEYS.map((stat, index) => [
          stat,
          (mask & (1 << index)) === 0 ? 0 : 60,
        ]),
      ),
    );
  }
  return candidates;
}

function resolvePrimaryObjective(objective) {
  if (objective == null) return "combined";
  if (DURABILITY_OBJECTIVES.includes(objective)) return objective;
  const error = new TypeError(`未知耐久目标：${String(objective)}`);
  error.code = "INVALID_DURABILITY_OBJECTIVE";
  throw error;
}

function defaultLockedDimensions(current, lockedDimensions) {
  if (lockedDimensions !== undefined) return lockedDimensions;
  return ["physicalAttack", "magicalAttack"].filter(
    (stat) => current.displayIvs[stat] === 60,
  );
}

function normalizeLockedDimensions(current, lockedDimensions) {
  const requested = defaultLockedDimensions(current, lockedDimensions);
  const entries = Array.isArray(requested)
    ? requested.map((stat) => [stat, current.displayIvs[stat]])
    : Object.entries(requested ?? {}).map(([stat, value]) => [
        stat,
        typeof value === "boolean" ? (value ? 60 : 0) : value,
      ]);
  for (const [stat] of entries) {
    if (!STAT_KEYS.includes(stat)) {
      const error = new TypeError(`未知锁定维度：${String(stat)}`);
      error.code = "UNKNOWN_LOCKED_DIMENSION";
      throw error;
    }
  }
  return new Map(entries);
}

function effectiveSpeedFor(speed, constraint) {
  const bonus = typeof constraint.speedBonusForSpeed === "function"
    ? constraint.speedBonusForSpeed(speed) : constraint.flatBonus;
  if (!Number.isFinite(bonus)) throw new TypeError("速度修正必须是有限数值");
  return speed + bonus;
}

function normalizeSpeedConstraint(speedConstraint, current) {
  const raw =
    typeof speedConstraint === "string"
      ? { mode: speedConstraint }
      : (speedConstraint ?? { mode: "unlocked" });
  const aliases = {
    none: "unlocked",
    target: "at-least",
    atLeast: "at-least",
  };
  const mode = aliases[raw.mode] ?? raw.mode ?? "unlocked";
  const flatBonus = Number.isFinite(Number(raw.flatBonus)) ? Number(raw.flatBonus) : 0;
  const speedBonusForSpeed = raw.speedBonusForSpeed;
  if (mode === "unlocked") return { flatBonus, speedBonusForSpeed, mode, targetSpeed: null };
  if (mode === "keep") {
    return {
      flatBonus,
      speedBonusForSpeed,
      mode,
      targetSpeed: effectiveSpeedFor(panelStatsFor(current).speed, { flatBonus, speedBonusForSpeed }),
      requiredInvestment: current.displayIvs.speed,
    };
  }
  if (mode === "at-least") {
    return {
      flatBonus,
      speedBonusForSpeed,
      mode,
      targetSpeed: resolveTargetSpeed(raw.targetSpeed ?? raw.speed),
    };
  }
  const error = new TypeError(`未知速度约束：${String(mode)}`);
  error.code = "INVALID_SPEED_CONSTRAINT";
  throw error;
}

function stableInvestmentKey(values) {
  return STAT_KEYS.map((stat) => (values[stat] === 60 ? "1" : "0")).join("");
}

function changedDimensions(currentValues, candidateValues) {
  return STAT_KEYS.filter(
    (stat) => currentValues[stat] !== candidateValues[stat],
  );
}

function candidateMatchesLocks(values, locks) {
  for (const [stat, value] of locks) {
    if (values[stat] !== value) return false;
  }
  return true;
}

function candidateMatchesSpeed(values, panel, speedConstraint) {
  if (speedConstraint.mode === "unlocked") return true;
  if (speedConstraint.mode === "keep") {
    if (values.speed !== speedConstraint.requiredInvestment) return false;
  }
  return effectiveSpeedFor(panel.speed, speedConstraint) >= speedConstraint.targetSpeed;
}

function compareCandidates(objective) {
  return (left, right) => {
    const scoreDifference =
      right.durability.display[objective] - left.durability.display[objective];
    if (scoreDifference !== 0) return scoreDifference;
    const changeDifference =
      left.changedDimensions.length - right.changedDimensions.length;
    if (changeDifference !== 0) return changeDifference;
    const speedDifference = left.speedRedundancy - right.speedRedundancy;
    if (speedDifference !== 0) return speedDifference;
    return left.stableKey.localeCompare(right.stableKey);
  };
}

// Revalidate the final configuration at the application boundary; never trust cached display numbers.
export function isDurabilityBuildApplicable({ current, candidate, speedConstraint, lockedDimensions, rulesetId = BINARY_60_MAX3_RULESET_ID } = {}) {
  if (!hasCompleteRaceStats(current?.raceStats) ||
      !validateAbilityInvestment({ values: current?.displayIvs, rulesetId }).valid ||
      !validateAbilityInvestment({ values: candidate?.values, rulesetId }).valid) return false;
  const panel = panelStatsFor(current, candidate.values, candidate.natureId);
  return candidateMatchesLocks(candidate.values, normalizeLockedDimensions(current, lockedDimensions)) &&
    candidateMatchesSpeed(candidate.values, panel, normalizeSpeedConstraint(speedConstraint, current));
}

export function recommendDurabilityBuilds({
  current,
  compareDefensiveNatures = false,
  objective,
  speedConstraint,
  lockedDimensions,
  rulesetId = BINARY_60_MAX3_RULESET_ID,
  snapshotId = null,
} = {}) {
  const primaryObjective = resolvePrimaryObjective(objective);
  const currentValidation = validateAbilityInvestment({
    values: current?.displayIvs,
    rulesetId,
  });
  const invalidConflict = !currentValidation.valid
    ? { code: "INVALID_INVESTMENT", violations: currentValidation.violations }
    : !hasCompleteRaceStats(current?.raceStats) ? { code: "INVALID_RACE_STATS" } : null;
  if (invalidConflict) {
    return {
      status: "invalid-configuration", rulesetId, snapshotId, primaryObjective,
      candidatesEvaluated: 0,
      results: Object.fromEntries(DURABILITY_OBJECTIVES.map((key) => [key, null])),
      conflicts: [invalidConflict],
    };
  }

  const locks = normalizeLockedDimensions(current, lockedDimensions);
  const normalizedSpeedConstraint = normalizeSpeedConstraint(
    speedConstraint,
    current,
  );
  const allValues = enumerateLegalInvestmentValues();
  const defensiveStats = { combined: "hp", physical: "physicalDefense", magical: "magicalDefense" };
  const compareNatures = compareDefensiveNatures &&
    Object.values(defensiveStats).every((stat) => current.displayIvs[stat] === 60);
  const natureByObjective = Object.fromEntries(DURABILITY_OBJECTIVES.map((key) => [key,
    compareNatures ? getQuickNatureId(defensiveStats[key], "defender") : (current.natureId ?? current.nature ?? "neutral"),
  ]));
  const natureIds = [...new Set(Object.values(natureByObjective))];
  // Pick the final nature BEFORE checking locks/speed. Share candidate work for equal natures.
  const results = Object.fromEntries(DURABILITY_OBJECTIVES.map((key) => [key, null]));
  const comparisons = Object.fromEntries(DURABILITY_OBJECTIVES.map((key) => [key, compareCandidates(key)]));
  let candidatesEligible = 0;
  // Stream candidates: retain only each objective's best build, not every allocated panel.
  for (const natureId of natureIds) {
    const objectives = DURABILITY_OBJECTIVES.filter((key) => natureByObjective[key] === natureId);
    for (const values of allValues) {
      if (!candidateMatchesLocks(values, locks)) continue;
      const panel = panelStatsFor(current, values, natureId);
      if (!candidateMatchesSpeed(values, panel, normalizedSpeedConstraint)) continue;
      candidatesEligible += 1;
      const effectiveSpeed = effectiveSpeedFor(panel.speed, normalizedSpeedConstraint);
      const candidate = {
        values, panel, natureId, effectiveSpeed,
        durability: calculateDurability({ maxHp: panel.hp, physicalDefense: panel.physicalDefense, magicalDefense: panel.magicalDefense }),
        changedDimensions: changedDimensions(current.displayIvs, values),
        speedRedundancy: normalizedSpeedConstraint.mode === "at-least" ? effectiveSpeed - normalizedSpeedConstraint.targetSpeed : 0,
        stableKey: stableInvestmentKey(values),
      };
      for (const key of objectives) {
        if (!results[key] || comparisons[key](candidate, results[key]) < 0) {
          results[key] = { ...candidate, values: { ...values }, objective: key };
        }
      }
    }
  }

  const summary = {
    rulesetId, snapshotId, primaryObjective,
    candidatesEvaluated: allValues.length * natureIds.length, results,
  };
  if (candidatesEligible === 0) {
    let conflict = {
      code: "NO_LEGAL_BUILD",
      lockedDimensions: Object.fromEntries(locks),
      speedConstraint: normalizedSpeedConstraint,
    };
    if (normalizedSpeedConstraint.mode === "at-least") {
      const maximumSpeed = Math.max(...natureIds.map((natureId) => effectiveSpeedFor(panelStatsFor(current, {
        ...current.displayIvs, speed: 60,
      }, natureId).speed, normalizedSpeedConstraint)));
      if (maximumSpeed < normalizedSpeedConstraint.targetSpeed) {
        conflict = {
          code: "SPEED_TARGET_UNREACHABLE",
          targetSpeed: normalizedSpeedConstraint.targetSpeed,
          maximumSpeed,
        };
      } else {
        const lockedActiveStats = STAT_KEYS.filter(
          (stat) => locks.get(stat) === 60,
        );
        if (
          lockedActiveStats.length >= 3 &&
          locks.get("speed") !== 60
        ) {
          conflict = {
            code: "NO_INVESTMENT_SLOT_FOR_SPEED",
            targetSpeed: normalizedSpeedConstraint.targetSpeed,
            lockedActiveStats,
          };
        } else if (locks.has("speed") && locks.get("speed") !== 60) {
          conflict = {
            code: "LOCKED_SPEED_BELOW_TARGET",
            targetSpeed: normalizedSpeedConstraint.targetSpeed,
            lockedSpeedInvestment: locks.get("speed"),
          };
        }
      }
    }
    return { ...summary, status: "no-solution", conflicts: [conflict] };
  }
  return { ...summary, status: "ok", candidatesEligible, conflicts: [] };
}
