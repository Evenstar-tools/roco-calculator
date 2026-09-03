import {
  BINARY_60_MAX3_RULESET_ID,
  validateAbilityInvestment,
} from "./ability-investment.js";
import { STAT_KEYS } from "../../../domain/constants.js";
import { calculateDurability } from "./durability.js";
import { getNatureMultipliers } from "../../../domain/natures.js";
import {
  calculateAllPanelStats,
  hasCompleteRaceStats,
} from "../../../domain/stat.js";

const DURABILITY_OBJECTIVES = Object.freeze([
  "physical",
  "magical",
  "combined",
]);

function panelStatsFor(configuration, displayIvs = configuration.displayIvs) {
  return calculateAllPanelStats({
    raceStats: configuration.raceStats,
    displayIvs,
    natureMultipliers: getNatureMultipliers(
      configuration.natureId ?? configuration.nature,
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
  const currentSpeed = panelStatsFor(configuration).speed + normalizedSpeedBonus;
  const investedSpeed = panelStatsFor(configuration, {
    ...configuration.displayIvs,
    speed: 60,
  }).speed + normalizedSpeedBonus;

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
  if (mode === "unlocked") return { flatBonus, mode, targetSpeed: null };
  if (mode === "keep") {
    return {
      flatBonus,
      mode,
      targetSpeed: panelStatsFor(current).speed + flatBonus,
      requiredInvestment: current.displayIvs.speed,
    };
  }
  if (mode === "at-least") {
    return {
      flatBonus,
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
    return values.speed === speedConstraint.requiredInvestment;
  }
  return panel.speed + speedConstraint.flatBonus >= speedConstraint.targetSpeed;
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

export function recommendDurabilityBuilds({
  current,
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
  if (!currentValidation.valid) {
    return {
      status: "invalid-configuration",
      rulesetId,
      snapshotId,
      primaryObjective,
      candidatesEvaluated: 0,
      results: Object.fromEntries(
        DURABILITY_OBJECTIVES.map((key) => [key, null]),
      ),
      conflicts: [
        {
          code: "INVALID_INVESTMENT",
          violations: currentValidation.violations,
        },
      ],
    };
  }
  if (!hasCompleteRaceStats(current?.raceStats)) {
    return {
      status: "invalid-configuration",
      rulesetId,
      snapshotId,
      primaryObjective,
      candidatesEvaluated: 0,
      results: Object.fromEntries(
        DURABILITY_OBJECTIVES.map((key) => [key, null]),
      ),
      conflicts: [{ code: "INVALID_RACE_STATS" }],
    };
  }

  const locks = normalizeLockedDimensions(current, lockedDimensions);
  const normalizedSpeedConstraint = normalizeSpeedConstraint(
    speedConstraint,
    current,
  );
  const allValues = enumerateLegalInvestmentValues();
  const candidates = allValues.flatMap((values) => {
    if (!candidateMatchesLocks(values, locks)) return [];
    const panel = panelStatsFor(current, values);
    if (!candidateMatchesSpeed(values, panel, normalizedSpeedConstraint)) {
      return [];
    }
    const durability = calculateDurability({
      maxHp: panel.hp,
      physicalDefense: panel.physicalDefense,
      magicalDefense: panel.magicalDefense,
    });
    return [
      {
        values,
        panel,
        effectiveSpeed: panel.speed + normalizedSpeedConstraint.flatBonus,
        durability,
        natureId: current.natureId ?? current.nature ?? "neutral",
        changedDimensions: changedDimensions(current.displayIvs, values),
        speedRedundancy:
          normalizedSpeedConstraint.mode === "at-least"
            ? panel.speed + normalizedSpeedConstraint.flatBonus - normalizedSpeedConstraint.targetSpeed
            : 0,
        stableKey: stableInvestmentKey(values),
      },
    ];
  });

  const results = Object.fromEntries(
    DURABILITY_OBJECTIVES.map((key) => {
      const best = [...candidates].sort(compareCandidates(key))[0];
      return [key, best ? { objective: key, ...best } : null];
    }),
  );

  if (candidates.length === 0) {
    let conflict = {
      code: "NO_LEGAL_BUILD",
      lockedDimensions: Object.fromEntries(locks),
      speedConstraint: normalizedSpeedConstraint,
    };
    if (normalizedSpeedConstraint.mode === "at-least") {
      const maximumSpeed = panelStatsFor(current, {
        ...current.displayIvs,
        speed: 60,
      }).speed + normalizedSpeedConstraint.flatBonus;
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
    return {
      status: "no-solution",
      rulesetId,
      snapshotId,
      primaryObjective,
      candidatesEvaluated: allValues.length,
      results,
      conflicts: [conflict],
    };
  }

  return {
    status: "ok",
    rulesetId,
    snapshotId,
    primaryObjective,
    candidatesEvaluated: allValues.length,
    candidatesEligible: candidates.length,
    results,
    conflicts: [],
  };
}
