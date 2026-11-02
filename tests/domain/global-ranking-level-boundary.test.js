import { readFileSync } from "node:fs";
import { expect, test } from "vitest";
import { createDurabilityRanking } from "../../src/features/team-ability/domain/durability-ranking.js";
import { createSpeedTargetCatalog, DEFAULT_RANKING_PROFILES } from "../../src/features/team-ability/domain/ranking-tools.js";

test("Global rankings keep the recorded S3 catalog without S5 level entries", () => {
  const snapshot = JSON.parse(readFileSync("public/data/global-runtime.json", "utf8"));
  const before = JSON.stringify(snapshot);
  const durability = createDurabilityRanking({
    spirits: snapshot.spirits,
    traits: snapshot.traits,
    typeChart: snapshot.typeChart,
    spiritFilterRevision: snapshot.meta.revisions.spiritFilter,
    includePassiveVariants: true,
  });
  const speed = createSpeedTargetCatalog({ snapshot, profiles: [...DEFAULT_RANKING_PROFILES, "special"] });
  expect(snapshot.spirits.some(spirit => spirit.fullName === "超能阿布" || spirit.previewIdentity?.key === "super-abu")).toBe(false);
  for (const entry of [...durability.rows, ...durability.immuneRows, ...speed]) {
    expect(entry.level ?? 60).toBe(60);
    expect(snapshot.spirits).toContain(entry.spirit);
    expect(entry.name).not.toMatch(/(?:超能阿布|(?:70|80|90|99)级)/u);
  }
  expect(durability.rows.length).toBeGreaterThan(0);
  expect(speed.length).toBeGreaterThan(0);
  expect(JSON.stringify(snapshot)).toBe(before);
});

test.each([
  ["ordinary identity", undefined],
  ["Global catalog identity", { catalogId: "global-s3", key: "abu", mechanicKey: "abu" }],
  ["unknown identity key", { catalogId: "s5-test", key: "unknown", mechanicKey: "abu" }],
  ["mismatched mechanic", { catalogId: "s5-test", key: "abu", mechanicKey: "super-abu" }],
])("%s does not acquire S5 incoming-damage adjustments", (_label, previewIdentity) => {
  const spirit = {
    id: "global-boundary-test", fullName: "Global boundary test", stage: "首领", sourceCategory: "首领形态",
    raceStats: { hp: 100, physicalAttack: 100, magicalAttack: 100, physicalDefense: 100, magicalDefense: 100, speed: 100 },
    previewIdentity,
  };
  const ranking = createDurabilityRanking({ spirits: [spirit], includeLevelVariants: false });
  expect(ranking.rows).toHaveLength(1);
  const [row] = ranking.rows;
  expect(row.level).toBe(60);
  expect(row.incomingDamageMultiplier).toBe(1);
  expect(row.panelStats).toEqual(row.basePanelStats);
  expect(row.durability).toEqual(row.panelDurability);
});
