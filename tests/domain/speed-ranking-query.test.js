import { expect, test } from "vitest";
import { createSpeedRanking, speedQuery, speedReference, speedBadge } from "../../src/features/team-ability/domain/ranking-tools.js";

const snapshot = { spirits: [100, 125].map((speed) => ({ id: String(speed), fullName: `测试${speed}`, dexNo: speed, stage: "首领", sourceCategory: "首领形态", raceStats: { speed, hp: 100, physicalAttack: 100, magicalAttack: 100, physicalDefense: 100, magicalDefense: 100 }, aliases: ["苹果"] })) };
test("数字速度查询与名称图鉴查询明确区分", () => {
  expect(speedQuery("２６７")).toMatchObject({ kind: "actual", value: 267 });
  for (const query of ["-1", "1.5", "99999999999999999999"]) expect(speedQuery(query).invalid).toBe(true);
  expect(createSpeedRanking({ snapshot, query: "267", queryMode: "auto" })).toEqual(createSpeedRanking({ snapshot }));
  expect(createSpeedRanking({ snapshot, query: "125", queryMode: "base" }).flatMap((g) => g.targets).every((t) => t.spirit.raceStats.speed === 125)).toBe(true);
  expect(createSpeedRanking({ snapshot, query: "苹果", queryMode: "auto" })).toEqual(createSpeedRanking({ snapshot }));
  expect(createSpeedRanking({ snapshot, query: "125", queryMode: "text" }).flatMap((g) => g.targets)).toHaveLength(2);
});
test("无同速时只插入基准标记，计数以配置为单位且不修改原榜", () => {
  const groups = [{ speed: 280, targets: [{}, {}] }, { speed: 260, targets: [{}] }];
  expect(speedReference(groups, 267)).toMatchObject({ faster: 2, equal: 0, slower: 1, groups: [{ speed: 280 }, { speed: 267, targets: [] }, { speed: 260 }] });
  expect(groups).toHaveLength(2);
  expect(speedReference(groups, 280).groups).toBe(groups);
  expect(speedBadge({ profileId: "positive-max", specialLabel: "条件" })).toBe("极·特");
});
