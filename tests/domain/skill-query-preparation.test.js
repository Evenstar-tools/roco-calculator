import { beforeEach, expect, test, vi } from "vitest";

const { project, localize } = vi.hoisted(() => ({ project: vi.fn(), localize: vi.fn() }));
vi.mock("../../src/features/skill-query/s5-announcement-catalog.js", () => ({ withS5AnnouncementCatalog: project }));
vi.mock("../../src/runtime/global-entity-localization.js", () => ({ localizeGlobalCatalog: localize }));

import { prepareSkillQueryCatalog } from "../../src/features/skill-query/prepare-catalog.js";

const catalogFixture = () => ({
  currentSeason: "S3",
  seasons: [{
    id: "S3",
    spirits: [{ id: "spirit" }, { id: "unavailable-spirit", catalogAvailable: false }],
    skills: [{ id: "skill" }, { id: "unavailable-skill", catalogAvailable: false }],
    traits: [{ id: "trait", description: "Season trait" }],
  }],
});

beforeEach(() => {
  project.mockReset().mockImplementation(catalog => ({ ...catalog }));
  localize.mockReset().mockImplementation((season, locale) => ({ ...season, locale }));
});

test("reopening with the same inputs reuses preparation and display identity", () => {
  const catalog = catalogFixture();
  const snapshot = {};
  const first = prepareSkillQueryCatalog(catalog, snapshot, "global", "en");
  const second = prepareSkillQueryCatalog(catalog, snapshot, "global", "en");
  expect(second).toBe(first);
  expect(second.canonicalData).toBe(first.canonicalData);
  expect(second.data).toBe(first.data);
  expect(project).toHaveBeenCalledTimes(1);
  expect(localize).toHaveBeenCalledTimes(1);
  expect(localize).toHaveBeenCalledWith(expect.objectContaining({ meta: { serverId: "global" } }), "en");
});

test("catalog, snapshot, region and locale each isolate cached preparation", () => {
  const catalog = catalogFixture();
  const snapshot = {};
  const cn = prepareSkillQueryCatalog(catalog, snapshot, "cn", "zh-CN");
  const en = prepareSkillQueryCatalog(catalog, snapshot, "global", "en");
  const jp = prepareSkillQueryCatalog(catalog, snapshot, "global", "ja");
  const nextSnapshot = prepareSkillQueryCatalog(catalog, {}, "global", "en");
  const nextCatalog = prepareSkillQueryCatalog(catalogFixture(), snapshot, "global", "en");
  expect(new Set([cn, en, jp, nextSnapshot, nextCatalog]).size).toBe(5);
  expect(cn.data).toBe(cn.canonicalData);
  expect(en.data.seasons[0].locale).toBe("en");
  expect(jp.data.seasons[0].locale).toBe("ja");
  expect(project).toHaveBeenCalledTimes(5);
  expect(localize).toHaveBeenCalledTimes(4);
  expect(prepareSkillQueryCatalog(catalog, snapshot, "global", "en")).toBe(en);
});

test("missing and null snapshots are supported without aliasing real snapshots", () => {
  const catalog = catalogFixture();
  const missing = prepareSkillQueryCatalog(catalog, undefined);
  const empty = prepareSkillQueryCatalog(catalog, null);
  const actual = prepareSkillQueryCatalog(catalog, {});
  expect(prepareSkillQueryCatalog(catalog, undefined)).toBe(missing);
  expect(prepareSkillQueryCatalog(catalog, null)).toBe(empty);
  expect(new Set([missing, empty, actual]).size).toBe(3);
  expect(project).toHaveBeenCalledTimes(3);
  expect(localize).not.toHaveBeenCalled();
});

test("global availability filtering does not alter source or canonical catalog", () => {
  const catalog = catalogFixture();
  const original = structuredClone(catalog);
  Object.freeze(catalog);
  Object.freeze(catalog.seasons[0]);
  Object.freeze(catalog.seasons[0].spirits);
  Object.freeze(catalog.seasons[0].skills);
  const snapshot = Object.freeze({ meta: { serverId: "global" } });
  const { canonicalData, data } = prepareSkillQueryCatalog(catalog, snapshot, "global", "en");
  expect(data.seasons[0].spirits.map(({ id }) => id)).toEqual(["spirit"]);
  expect(data.seasons[0].skills.map(({ id }) => id)).toEqual(["skill"]);
  expect(data.seasons[0].traits).toBe(catalog.seasons[0].traits);
  expect(canonicalData).toEqual(original);
  expect(catalog).toEqual(original);
  expect(snapshot).toEqual({ meta: { serverId: "global" } });
});

test.each(["projection", "localization"])("failed %s is not cached and can be retried", (phase) => {
  const catalog = catalogFixture();
  const snapshot = {};
  (phase === "projection" ? project : localize).mockImplementationOnce(() => { throw new Error("temporary failure"); });
  expect(() => prepareSkillQueryCatalog(catalog, snapshot, "global", "en")).toThrow("temporary failure");
  const recovered = prepareSkillQueryCatalog(catalog, snapshot, "global", "en");
  expect(recovered.data.seasons[0].spirits).toEqual([{ id: "spirit" }]);
  expect(prepareSkillQueryCatalog(catalog, snapshot, "global", "en")).toBe(recovered);
  expect(project).toHaveBeenCalledTimes(2);
});

test("an unloaded catalog remains unloaded without running preparation", () => {
  expect(prepareSkillQueryCatalog(null, {})).toEqual({ canonicalData: null, data: null });
  expect(prepareSkillQueryCatalog(undefined, {})).toEqual({ canonicalData: undefined, data: undefined });
  expect(project).not.toHaveBeenCalled();
  expect(localize).not.toHaveBeenCalled();
});
