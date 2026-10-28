import { expect, test } from "vitest";
import { createPlaceholderQueryCatalog } from "../../src/features/skill-query/placeholder-catalog.js";
import { querySpiritFamilies, skillMatchesQuery, spiritSkills } from "../../src/features/skill-query/query-model.js";
import { globalPlaceholderCatalog } from "../fixtures/global-placeholder-catalog.js";

test("reference query preserves namespaced IDs and explicit relationships without numerical or acquisition rules", () => {
  const snapshot = globalPlaceholderCatalog();
  snapshot.spirits[0].asset = { localUrl: "/assets/spirits/first.png" };
  snapshot.spirits[0].evolutionChainIds = [snapshot.spirits[1].id];
  snapshot.learnsets[0].acquisitions = { [snapshot.skills[0].id]: ["Lv. 60", "血脉"] };
  const before = structuredClone(snapshot);
  const catalog = createPlaceholderQueryCatalog(snapshot);
  expect(catalog.placeholderSource).toEqual(snapshot.meta.placeholderSource);
  expect(catalog).not.toHaveProperty("currentSeason");
  expect(catalog.spirits[0]).toMatchObject({ id: "cn-placeholder:first", asset: snapshot.spirits[0].asset });
  expect(catalog.spirits[0].familyId).toBe(catalog.spirits[1].familyId);
  expect(catalog.skills[0]).toMatchObject({ id: "cn-placeholder:first-skill", name: "中文技能一" });
  for (const key of ["basePower", "cost", "ruleId", "ruleParams", "reference", "introducedSeason"]) expect(catalog.skills[0]).not.toHaveProperty(key);
  expect(catalog.learnsets[0]).not.toHaveProperty("acquisitions");
  // A family match must not claim that every form learns the selected skills.
  const families = querySpiritFamilies(catalog, { skillIds: [catalog.skills[0].id, catalog.skills[1].id] });
  expect(families[0].members.map(({ id }) => id)).toEqual(["cn-placeholder:first"]);
  expect(spiritSkills(catalog, "cn-placeholder:second").map(({ id }) => id)).toEqual(["cn-placeholder:second-skill"]);
  catalog.spirits[0].asset.localUrl = "/changed.png";
  expect(snapshot).toEqual(before);
});

test("similar Chinese names without explicit evolution IDs stay separate", () => {
  const snapshot = globalPlaceholderCatalog();
  for (const spirit of snapshot.spirits) { spirit.baseName = "同名精灵"; spirit.variantName = "同名分支"; }
  const catalog = createPlaceholderQueryCatalog(snapshot);
  expect(catalog.spirits[0].familyId).not.toBe(catalog.spirits[1].familyId);
});

test.each([
  (snapshot) => { snapshot.meta.serverId = "cn"; },
  (snapshot) => { delete snapshot.meta.placeholderSource; },
  (snapshot) => { snapshot.meta.placeholderSource.dataVersion = "unknown"; },
  (snapshot) => { snapshot.spirits[0].id = "first"; },
  (snapshot) => { snapshot.skills[0].ruleId = "cn-rule"; },
  (snapshot) => { snapshot.learnsets[0].skillIds.push("cn-placeholder:missing"); },
])("rejects data without the explicit reference contract %i", (mutate) => {
  const snapshot = globalPlaceholderCatalog();
  mutate(snapshot);
  expect(() => createPlaceholderQueryCatalog(snapshot)).toThrow();
});

test("localized reference query keeps multilingual names searchable without exposing unavailable catalog entries", () => {
  const snapshot = globalPlaceholderCatalog();
  snapshot.skills[0].name = "Scratch";
  snapshot.skills[0].aliases = ["抓挠", "スクラッチ"];
  snapshot.skills[0].searchText = "Scratch 抓挠 スクラッチ";
  snapshot.skills[1].catalogAvailable = false;
  snapshot.spirits[1].catalogAvailable = false;
  const before = structuredClone(snapshot);
  const catalog = createPlaceholderQueryCatalog(snapshot);
  expect(catalog.skills.map(({ id }) => id)).toEqual([snapshot.skills[0].id]);
  expect(catalog.spirits.map(({ id }) => id)).toEqual([snapshot.spirits[0].id]);
  expect(catalog.learnsets).toEqual([{ spiritId: snapshot.spirits[0].id, skillIds: [snapshot.skills[0].id] }]);
  for (const query of ["scratch", "抓挠", "スクラッチ"]) expect(skillMatchesQuery(catalog.skills[0], query)).toBe(true);
  expect(skillMatchesQuery(catalog.skills[0], "no match")).toBe(false);
  expect(snapshot).toEqual(before);
});
