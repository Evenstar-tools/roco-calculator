// @vitest-environment node
import { existsSync, readFileSync } from "node:fs";
import { expect, test } from "vitest";
import { unpackCatalog } from "../../src/features/skill-query/catalog.js";
import { localizeGlobalCatalog } from "../../src/runtime/global-entity-localization.js";
import { getTraitIconUrl } from "../../src/data/trait-icons.js";

const read = file => JSON.parse(readFileSync(file, "utf8"));

test("all historical CN and localized Global query spirits resolve complete traits; Global ships its own icons", () => {
  const cn = unpackCatalog(read("public/data/skill-query/catalog.json"));
  const global = unpackCatalog(read("public/data/global/skill-query/catalog.json"));
  const seasons = [...cn.seasons, ...["zh-CN", "en", "ja"].flatMap(locale => global.seasons.map(season =>
    localizeGlobalCatalog({ ...season, meta: { serverId: "global" } }, locale)))];
  for (const season of seasons) {
    const traits = new Map(season.traits.map(trait => [trait.id, trait]));
    for (const spirit of season.spirits.filter(spirit => spirit.catalogAvailable !== false)) {
      const label = `${season.id}: ${spirit.fullName}`;
      expect(spirit.traitIds.length, label).toBeGreaterThan(0);
      for (const id of spirit.traitIds) {
        const trait = traits.get(id);
        expect(trait?.name?.trim(), label).toBeTruthy();
        expect(trait?.description?.trim(), label).toBeTruthy();
        // The Global source does not ship CN-only seasonal art.
        if (season.meta?.serverId === "global") {
          const icon = getTraitIconUrl(trait);
          expect(icon, label).toBeTruthy();
          expect(existsSync(`public${icon}`), label).toBe(true);
        }
      }
    }
  }
});

test("S3 missing text is supplemented from its historical source without rewriting the archived snapshot or other season text", () => {
  const id = "trait_731c315f1c469260";
  const archived = read("data/snapshots/seasons/s3-2026-07-15.json");
  expect(archived.traits.find(trait => trait.id === id).description).toBe("");
  const catalog = unpackCatalog(read("public/data/skill-query/catalog.json"));
  const old = catalog.seasons.find(season => season.id === "S3").traits.find(trait => trait.id === id);
  expect(old).toMatchObject({ name: "留学生", description: "自己全技能能耗+2，可以学习全部攻击技能石。" });
  const current = read("data/snapshots/current.json");
  const s4 = catalog.seasons.find(season => season.id === "S4");
  for (const trait of s4.traits) expect(trait.description).toBe(current.traits.find(entry => entry.id === trait.id).description);
});
