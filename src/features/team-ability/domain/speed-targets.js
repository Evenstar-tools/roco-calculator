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
    description: "极速：速度个体60、加速性格",
    displayIv: 60,
    id: "positive-max",
    label: "极速",
    natureMultiplier: 1.2,
  }),
  "neutral-max": Object.freeze({
    description: "满速：速度个体60、中性性格",
    displayIv: 60,
    id: "neutral-max",
    label: "满速",
    natureMultiplier: 1,
  }),
  "neutral-zero": Object.freeze({
    description: "中性0速：速度个体0、中性性格",
    displayIv: 0,
    id: "neutral-zero",
    label: "中性0速",
    natureMultiplier: 1,
  }),
  "negative-zero": Object.freeze({
    description: "最慢：速度个体0、减速性格",
    displayIv: 0,
    id: "negative-zero",
    label: "最慢",
    natureMultiplier: 0.9,
  }),
});

export function createSpeedTargets({
  profileId = "neutral-max",
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
        speed,
        spirit,
      }];
    })
    .sort((left, right) =>
      left.speed - right.speed ||
      left.name.localeCompare(right.name, "zh-CN") ||
      left.id.localeCompare(right.id),
    );
}

export function findNearestSpeedTarget(targets, speed) {
  return [...targets].sort((left, right) =>
    Math.abs(left.speed - speed) - Math.abs(right.speed - speed) ||
    left.speed - right.speed ||
    left.id.localeCompare(right.id),
  )[0] ?? null;
}
