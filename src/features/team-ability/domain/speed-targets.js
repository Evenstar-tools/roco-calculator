import { calculateAllPanelStats, hasCompleteRaceStats } from "../../../domain/stat.js";
import { resolveSpiritFormRole } from "./spirit-form-role.js";

const EMPTY_DISPLAY_IVS = Object.freeze({
  hp: 0,
  magicalAttack: 0,
  magicalDefense: 0,
  physicalAttack: 0,
  physicalDefense: 0,
  speed: 0,
});

export const SPEED_TARGET_PROFILES = Object.freeze({
  "positive-max": Object.freeze({
    displayIv: 60,
    id: "positive-max",
    label: "极速",
    natureMultiplier: 1.2,
  }),
  "neutral-max": Object.freeze({
    displayIv: 60,
    id: "neutral-max",
    label: "满速",
    natureMultiplier: 1,
  }),
  "positive-zero": Object.freeze({
    displayIv: 0,
    id: "positive-zero",
    label: "仅速度性格",
    natureMultiplier: 1.2,
  }),
  "neutral-zero": Object.freeze({
    displayIv: 0,
    id: "neutral-zero",
    label: "无速度",
    natureMultiplier: 1,
  }),
  "negative-zero": Object.freeze({
    displayIv: 0,
    id: "negative-zero",
    label: "减速度",
    natureMultiplier: 0.9,
  }),
});

function compareSpeedTargets(left, right) {
  return right.speed - left.speed ||
    left.name.localeCompare(right.name, "zh-CN") ||
    left.id.localeCompare(right.id);
}

export function createSpeedTargets({
  profileId = "positive-max",
  spiritFilterRevision,
  spirits = [],
} = {}) {
  const profile = SPEED_TARGET_PROFILES[profileId];
  if (!profile) {
    const error = new TypeError(`未知速度目标口径：${String(profileId)}`);
    error.code = "INVALID_SPEED_TARGET_PROFILE";
    throw error;
  }

  return spirits
    .flatMap((spirit) => {
      if (!hasCompleteRaceStats(spirit?.raceStats)) return [];
      const form = resolveSpiritFormRole(spirit, { spiritFilterRevision });
      if (form.formRole !== "final" && form.formRole !== "boss") return [];
      const speed = calculateAllPanelStats({
        displayIvs: { ...EMPTY_DISPLAY_IVS, speed: profile.displayIv },
        natureMultipliers: { speed: profile.natureMultiplier },
        raceStats: spirit.raceStats,
      }).speed;
      return [{
        formRole: form.formRole,
        id: spirit.id,
        name: spirit.fullName,
        qualifier: `${spirit.raceStats.speed}种族·${profile.label}`,
        speed,
        spirit,
      }];
    })
    .sort(compareSpeedTargets);
}

export function groupSpeedTargets(targets = []) {
  return [...targets].sort(compareSpeedTargets).reduce((groups, target) => {
    const lastGroup = groups.at(-1);
    if (lastGroup?.speed === target.speed) {
      lastGroup.targets.push(target);
      return groups;
    }
    groups.push({ speed: target.speed, targets: [target] });
    return groups;
  }, []);
}

export function findNearestSpeedTarget(targets, speed) {
  return [...targets].sort((left, right) =>
    Math.abs(left.speed - speed) - Math.abs(right.speed - speed) ||
    left.speed - right.speed ||
    left.id.localeCompare(right.id),
  )[0] ?? null;
}
