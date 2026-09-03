import { expect, test } from "vitest";
import {
  SPEED_TARGET_PROFILES,
  createSpeedTargets,
  groupSpeedTargets,
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
  {
    fullName: "同速首领",
    id: "boss-same-speed",
    raceStats,
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
    "boss-same-speed",
    "spirit_db5a2cb398dc0385",
    "boss-form",
  ]);
  expect(targets.map((entry) => entry.formRole)).toEqual(["boss", "final", "boss"]);
  expect(targets[0].qualifier).toBe("100种族·满速");
});

test("竖排速度表按速度分档并收纳全部同速精灵", () => {
  const groups = groupSpeedTargets(createSpeedTargets({
    profileId: "positive-max",
    spirits,
  }));

  expect(groups.map((group) => group.speed)).toEqual(
    [...groups.map((group) => group.speed)].sort((left, right) => right - left),
  );
  expect(groups[0].targets.map((entry) => entry.id)).toEqual([
    "boss-same-speed",
    "spirit_db5a2cb398dc0385",
  ]);
  expect(groups.flatMap((group) => group.targets).some((entry) => entry.id === "growth-form"))
    .toBe(false);
});

test("支持 Excel 速度线的五种标准口径", () => {
  expect(Object.keys(SPEED_TARGET_PROFILES)).toEqual([
    "positive-max",
    "neutral-max",
    "positive-zero",
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
    speedByProfile["positive-zero"],
  );
  expect(speedByProfile["positive-zero"]).toBeGreaterThan(
    speedByProfile["neutral-zero"],
  );
  expect(speedByProfile["neutral-zero"]).toBeGreaterThan(
    speedByProfile["negative-zero"],
  );
});

test("速度排行榜按速度从高到低排列", () => {
  const targets = createSpeedTargets({
    profileId: "positive-max",
    spirits,
  });

  expect(targets.map((entry) => entry.id)).toEqual([
    "boss-same-speed",
    "spirit_db5a2cb398dc0385",
    "boss-form",
  ]);
});
