import { readFileSync } from "node:fs";
import { expect, test } from "vitest";
import { createDurabilityRanking } from "../../src/features/team-ability/domain/durability-ranking.js";
import { createSpeedTargetCatalog } from "../../src/features/team-ability/domain/ranking-tools.js";

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
  const speed = createSpeedTargetCatalog({ snapshot });
  expect(snapshot.spirits.some(spirit => spirit.fullName === "超能阿布" || spirit.previewIdentity?.key === "super-abu")).toBe(false);
  for (const entry of [...durability.rows, ...durability.immuneRows, ...speed]) {
    expect(entry.level).toBe(60);
    expect(snapshot.spirits).toContain(entry.spirit);
    expect(entry.name).not.toMatch(/(?:超能阿布|(?:70|80|90|99)级)/u);
  }
  expect(durability.rows.length).toBeGreaterThan(0);
  expect(speed.length).toBeGreaterThan(0);
  expect(JSON.stringify(snapshot)).toBe(before);
});
