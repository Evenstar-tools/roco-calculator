import { readFileSync } from "node:fs";
import { expect, test } from "vitest";
import { unpackCatalog } from "../../src/features/skill-query/catalog.js";
import { buildGlobalSkillQueryCatalog } from "../../scripts/localization/build-global-snapshot.mjs";

const read = (file) => JSON.parse(readFileSync(file, "utf8"));
const keys = ["hp", "physicalAttack", "magicalAttack", "physicalDefense", "magicalDefense", "speed"];
const stats = (hp) => ({ hp, physicalAttack: 80, magicalAttack: 90, physicalDefense: 70, magicalDefense: 60, speed: 100 });
const verified = (spirit) => spirit.calculationStatus !== "pending-race-stats" &&
  !spirit.previewIdentity?.raceStatsPlaceholder && keys.every((key) => Number.isInteger(spirit.raceStats?.[key]) && spirit.raceStats[key] > 0);

test("packed race stats stay with their season and form, while old catalog rows remain valid", () => {
  const old = stats(100), current = stats(120), evolved = stats(150);
  const packed = { schemaVersion: 1, sharedSkills: [], sharedRelations: [], methodTexts: [],
    sharedSpirits: [
      ["s", "精灵", [], "一阶", "family", [], old],
      ["s", "精灵", [], "一阶", "family", [], current],
      ["evolved", "进化形态", [], "二阶", "family", [], evolved],
      ["legacy-five", "旧资料", [], "一阶", "legacy"],
      ["legacy-six", "旧资料", [], "一阶", "legacy", []],
    ],
    seasons: [{ id: "S3", skills: [], spirits: [0, 3, 4], relations: [] },
      { id: "S4", skills: [], spirits: [1, 2], relations: [] }],
  };
  const { seasons } = unpackCatalog(packed);
  expect(seasons[0].spirits[0].raceStats).toEqual(old);
  expect(seasons[1].spirits.map((spirit) => spirit.raceStats)).toEqual([current, evolved]);
  for (const spirit of seasons[0].spirits.slice(1)) expect(spirit).not.toHaveProperty("raceStats");
});

test("generated CN catalog preserves each historical snapshot rather than current-season values", () => {
  const catalog = unpackCatalog(read("public/data/skill-query/catalog.json"));
  const manifest = read("data/skill-query/seasons.json");
  for (const entry of manifest.seasons) {
    const source = new Map(read(entry.snapshot).spirits.map((spirit) => [spirit.id, spirit]));
    const season = catalog.seasons.find(({ id }) => id === entry.id);
    for (const spirit of season.spirits) {
      const original = source.get(spirit.id);
      expect(spirit.raceStats, `${entry.id}: ${spirit.fullName}`)
        .toEqual(verified(original) ? original.raceStats : undefined);
    }
  }
});

test("Global query retains its adopted S3 stats and no CN-only IDs or seasons", () => {
  const snapshot = read("data/snapshots/global/s3-midseason.json");
  const catalog = unpackCatalog(read("public/data/global/skill-query/catalog.json"));
  expect(catalog.serverId).toBe("global");
  expect(catalog.currentSeason).toBe("S3");
  expect(catalog.seasons.map(({ id }) => id)).toEqual(["S3"]);
  const originals = new Map(snapshot.spirits.map((spirit) => [spirit.id, spirit]));
  expect(catalog.seasons[0].spirits.map(({ id }) => id)).toEqual(snapshot.spirits.map(({ id }) => id));
  for (const spirit of catalog.seasons[0].spirits) {
    const original = originals.get(spirit.id);
    expect(spirit.raceStats, spirit.fullName).toEqual(verified(original) ? original.raceStats : undefined);
  }
});

test("query generation omits incomplete and artificial stats but keeps verified stats with pending mechanics", () => {
  const spirits = [
    { id: "known", fullName: "已知", raceStats: stats(100), calculationStatus: "pending-s5-mechanics" },
    { id: "pending", fullName: "待确认", raceStats: stats(100), calculationStatus: "pending-race-stats" },
    { id: "test", fullName: "测试占位", raceStats: stats(100), previewIdentity: { raceStatsPlaceholder: true } },
    { id: "partial", fullName: "不完整", raceStats: { hp: 100 } },
    { id: "missing", fullName: "无数据" },
  ];
  const catalog = buildGlobalSkillQueryCatalog({ spirits, skills: [], traits: [], learnsets: [] }, { spirits, skills: [] });
  const [known, ...omitted] = unpackCatalog(catalog).seasons[0].spirits;
  expect(known.raceStats).toEqual(stats(100));
  for (const spirit of omitted) expect(spirit).not.toHaveProperty("raceStats");
});
