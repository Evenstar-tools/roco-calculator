import { expect, test } from "vitest";
import {
  SPEED_TARGET_PROFILES,
  createSpeedTargets,
} from "../../src/features/team-ability/domain/speed-targets.js";

const raceStats = {
  hp: 100,
  magicalAttack: 100,
  magicalDefense: 100,
  physicalAttack: 100,
  physicalDefense: 100,
  speed: 100,
};

const spirits = [
  {
    fullName: "成长形态",
    id: "growth-form",
    raceStats: { ...raceStats, speed: 200 },
  },
  {
    fullName: "最终形态",
    id: "spirit_db5a2cb398dc0385",
    raceStats,
  },
  {
    fullName: "首领形态",
    id: "boss-form",
    raceStats: { ...raceStats, speed: 80 },
    sourceCategory: "首领形态",
    stage: "首领",
  },
];

test("速度目标只包含已确认最终形态和首领", () => {
  const targets = createSpeedTargets({
    profileId: "neutral-max",
    spirits,
  });

  expect(targets.map((entry) => entry.id)).toEqual([
    "boss-form",
    "spirit_db5a2cb398dc0385",
  ]);
  expect(targets.map((entry) => entry.formRole)).toEqual(["boss", "final"]);
});

test("支持极速、满速、中性0速和最慢四种统一口径", () => {
  expect(Object.keys(SPEED_TARGET_PROFILES)).toEqual([
    "positive-max",
    "neutral-max",
    "neutral-zero",
    "negative-zero",
  ]);

  const speedByProfile = Object.fromEntries(
    Object.keys(SPEED_TARGET_PROFILES).map((profileId) => [
      profileId,
      createSpeedTargets({ profileId, spirits: [spirits[1]] })[0].speed,
    ]),
  );

  expect(speedByProfile["positive-max"]).toBeGreaterThan(
    speedByProfile["neutral-max"],
  );
  expect(speedByProfile["neutral-max"]).toBeGreaterThan(
    speedByProfile["neutral-zero"],
  );
  expect(speedByProfile["neutral-zero"]).toBeGreaterThan(
    speedByProfile["negative-zero"],
  );
});
