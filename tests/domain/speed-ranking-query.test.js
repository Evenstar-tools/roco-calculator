import { expect, test } from "vitest";
import { readFileSync } from "node:fs";
import { applyS5Bwiki } from "../../scripts/bwiki/apply-s5-bwiki.mjs";
import { createBaseSpeedGroups, createSpeedRanking, speedQuery, speedReference, speedBadge } from "../../src/features/team-ability/domain/ranking-tools.js";
import { SPEED_TARGET_PROFILES } from "../../src/features/team-ability/domain/speed-targets.js";
import { createDurabilityRanking, STANDARD_DURABILITY_TEMPLATES } from "../../src/features/team-ability/domain/durability-ranking.js";
import { canRecommendSpirit } from "../../src/domain/spirit-discovery.js";

const snapshot = { spirits: [100, 125].map((speed) => ({ id: String(speed), fullName: `测试${speed}`, dexNo: speed, stage: "首领", sourceCategory: "首领形态", raceStats: { speed, hp: 100, physicalAttack: 100, magicalAttack: 100, physicalDefense: 100, magicalDefense: 100 }, aliases: ["苹果"] })) };
test("数字速度查询与名称图鉴查询明确区分", () => {
  expect(speedQuery("２６７")).toMatchObject({ kind: "actual", value: 267 });
  for (const query of ["-1", "1.5", "99999999999999999999"]) expect(speedQuery(query).invalid).toBe(true);
  expect(createSpeedRanking({ snapshot, query: "267", queryMode: "auto" }).flatMap(group => group.targets).every(target => target.speed === 267)).toBe(true);
  expect(createSpeedRanking({ snapshot, query: "125", queryMode: "base" }).flatMap((g) => g.targets).every((t) => t.spirit.raceStats.speed === 125)).toBe(true);
  expect(createSpeedRanking({ snapshot, query: "苹果", queryMode: "auto" })).toEqual(createSpeedRanking({ snapshot }));
  expect(createSpeedRanking({ snapshot, query: "125", queryMode: "text" }).flatMap((g) => g.targets)).toHaveLength(4);
});
test("无同速时只插入基准标记，计数以配置为单位且不修改原榜", () => {
  const groups = [{ speed: 280, targets: [{}, {}] }, { speed: 260, targets: [{}] }];
  expect(speedReference(groups, 267)).toMatchObject({ faster: 2, equal: 0, slower: 1, groups: [{ speed: 280 }, { speed: 267, targets: [] }, { speed: 260 }] });
  expect(groups).toHaveLength(2);
  expect(speedReference(groups, 280).groups).toBe(groups);
  expect(speedBadge({ profileId: "positive-max", specialLabel: "条件" })).toBe("极·特");
});


test("种族总览唯一归档且培养数值与实速目标一致", () => {
  const groups = createBaseSpeedGroups({ snapshot });
  expect(groups.flatMap(group => group.members)).toHaveLength(snapshot.spirits.length);
  for (const group of groups) for (const member of group.members) {
    for (const [id, target] of Object.entries(member.targets)) {
      const actual = createSpeedRanking({ snapshot, profiles: [id] }).flatMap(item => item.targets).find(item => item.spiritId === member.spirit.id);
      expect(target.speed).toBe(actual.speed);
    }
  }
  expect(createBaseSpeedGroups({ snapshot, query: "125" }).map(group => group.base)).toEqual([125]);
  expect(createBaseSpeedGroups({ snapshot, query: "不存在" })).toEqual([]);
});

test("统一数字搜索合并种族、图鉴与实速命中，文字仍支持别名", () => {
  const mixed = { spirits: snapshot.spirits.map((spirit, index) => ({ ...spirit, dexNo: index === 0 ? 267 : 9 })) };
  const rows = createSpeedRanking({ snapshot: mixed, query: "２６７", queryMode: "auto" }).flatMap(group => group.targets);
  expect(new Set(rows.map(target => target.spiritId))).toEqual(new Set(["100", "125"]));
  expect(createSpeedRanking({ snapshot: mixed, query: "苹果", queryMode: "auto" }).flatMap(group => group.targets)).toHaveLength(8);
  expect(createBaseSpeedGroups({ snapshot: mixed, query: "267" }).flatMap(group => group.members)).toHaveLength(2);
});

test("麦田主题五族外观不重复进入速度和耐久榜，原版、异属性形态及目录保留", () => {
  const read = file => JSON.parse(readFileSync(file, "utf8"));
  const data = applyS5Bwiki(read("data/snapshots/current.json"), read("data/reviewed/nrc-s5-20261101.json"));
  const families = [
    ["看守麦田的样子", ["护主犬", "音速犬", "风暴战犬"]],
    ["称量的样子", ["公平鸽"]],
    ["搬运果实的样子", ["奔波鼠", "流浪鼠"]],
    ["果壳铃的样子", ["花怨鳗", "鳗尾兽"]],
    ["暖和的样子", ["稻草人", "稻草守护者"]],
  ];
  const names = families.flatMap(([variant, bases]) => bases.map(base => `${base}（${variant}）`));
  const duplicates = data.spirits.filter(spirit => names.includes(spirit.fullName));
  expect(duplicates).toHaveLength(10);
  for (const spirit of duplicates) {
    const original = data.spirits.find(entry => entry.fullName === spirit.baseName);
    expect(spirit.raceStats).toEqual(original.raceStats);
    expect(spirit.traitIds).toEqual(original.traitIds);
    expect(canRecommendSpirit(spirit)).toBe(true);
  }
  const duplicateIds = new Set(duplicates.map(spirit => spirit.id));
  const rows = createSpeedRanking({ snapshot: data, profiles: [...Object.keys(SPEED_TARGET_PROFILES), "special"] }).flatMap(group => group.targets);
  const members = createBaseSpeedGroups({ snapshot: data }).flatMap(group => group.members);
  expect(rows.some(row => duplicateIds.has(row.spiritId))).toBe(false);
  expect(members.some(member => duplicateIds.has(member.spirit.id))).toBe(false);
  for (const name of ["音速犬", "风暴战犬", "公平鸽", "流浪鼠", "鳗尾兽", "稻草守护者"]) {
    expect(rows.some(row => row.name === name)).toBe(true);
    expect(members.some(member => member.name === name)).toBe(true);
  }
  expect(rows.some(row => row.name === "乌拉塔（极昼的样子）")).toBe(true);
  for (const templateId of Object.keys(STANDARD_DURABILITY_TEMPLATES)) {
    for (const sortBy of ["physical", "magical", "combined"]) {
      for (const includePassiveVariants of [false, true]) {
        const options = { templateId, sortBy, includePassiveVariants, traits: data.traits,
          spiritFilterRevision: data.meta.revisions?.spiritFilter };
        const durability = createDurabilityRanking({ ...options, spirits: data.spirits });
        const originalsOnly = createDurabilityRanking({ ...options,
          spirits: data.spirits.filter(spirit => !duplicateIds.has(spirit.id)) });
        expect(durability.rows.some(row => duplicateIds.has(row.spiritId))).toBe(false);
        expect(durability.rows).toEqual(originalsOnly.rows);
        expect(durability.counts.excludedByReason.COSMETIC_DUPLICATE).toBe(10);
        for (const name of ["音速犬", "风暴战犬", "公平鸽", "流浪鼠", "鳗尾兽", "稻草守护者", "乌拉塔（极昼的样子）"]) {
          expect(durability.rows.some(row => row.name === name)).toBe(true);
        }
      }
    }
  }
  expect(data.spirits.filter(spirit => duplicateIds.has(spirit.id))).toHaveLength(10);
});
