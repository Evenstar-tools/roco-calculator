import { afterEach, expect, test, vi } from "vitest";
import { publicResourceUrl, withPublicResourceUrls } from "../../src/runtime/public-resource-url.js";
import { loadServerSnapshot } from "../../src/runtime/load-snapshot.js";

afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.resetModules(); });

test("root builds retain public URLs and object identity", () => {
  const value = { spirits: [{ id: "one", asset: { localUrl: "/assets/spirits/one.png" } }] };
  expect(publicResourceUrl("/assets/spirits/one.png", "/")).toBe("/assets/spirits/one.png");
  expect(withPublicResourceUrls(value, "/")).toBe(value);
});

test.each([
  ["/data/runtime.json", "/pre/data/runtime.json"],
  ["/assets/ui/team-actions.svg#copy", "/pre/assets/ui/team-actions.svg#copy"],
  ["/assets/icon.png?version=2", "/pre/assets/icon.png?version=2"],
  ["/pre/assets/icon.png", "/pre/assets/icon.png"],
  ["https://example.com/icon.png", "https://example.com/icon.png"],
  ["//cdn.example.com/icon.png", "//cdn.example.com/icon.png"],
  ["data:image/png;base64,abc", "data:image/png;base64,abc"],
  ["blob:local-id", "blob:local-id"], ["./icon.png", "./icon.png"], [null, null],
])("mount point resolves %s without altering external or already mounted files", (input, expected) => {
  expect(publicResourceUrl(input, "/pre/")).toBe(expected);
});

test("URL projection handles nested asset fields without mutating identities or evidence", () => {
  const evidence = { asset: { localUrl: "/assets/original.png" } };
  const source = { meta: { id: "same-version" },
    spirits: [{ id: "one", asset: { localUrl: "/assets/spirits/one.png", sourceUrl: "https://example.com/one.png" }, previewIdentity: evidence }],
    skills: [{ id: "skill", iconUrl: "/assets/skills/skill_1234567890abcdef.png" }],
  };
  const result = withPublicResourceUrls(source, "/pre/");
  expect(result.spirits[0].asset.localUrl).toBe("/pre/assets/spirits/one.png");
  expect(result.skills[0].iconUrl).toBe("/pre/assets/skills/skill_1234567890abcdef.png");
  expect(result.meta).toBe(source.meta);
  expect(result.spirits[0].previewIdentity).toBe(evidence);
  expect(result.spirits[0].asset.sourceUrl).toBe("https://example.com/one.png");
  expect(source.spirits[0].asset.localUrl).toBe("/assets/spirits/one.png");
  expect(withPublicResourceUrls(result, "/pre/")).toBe(result);
});

test("runtime fetch and its display assets both use the isolated build mount", async () => {
  vi.stubEnv("BASE_URL", "/pre/");
  const snapshot = { meta: { id: "s4-2026-09-10", rulesVersion: "s4-2026-09-10" },
    spirits: [{ id: "one", asset: { localUrl: "/assets/spirits/one.png" } }] };
  const fetcher = vi.fn(async () => ({ ok: true, json: async () => snapshot }));
  const result = await loadServerSnapshot("cn", { fetcher });
  expect(fetcher).toHaveBeenCalledWith("/pre/data/runtime.json", { signal: undefined });
  expect(result.spirits[0].asset.localUrl).toBe("/pre/assets/spirits/one.png");
  expect(result.meta).toBe(snapshot.meta);
});

test("skill-query fetch and catalog portraits stay within the isolated mount", async () => {
  vi.stubEnv("BASE_URL", "/pre/");
  const value = { schemaVersion: 1, serverId: "cn", dataVersion: "s4-2026-09-10", rulesVersion: "s4-2026-09-10", currentSeason: "S4",
    seasons: [{ id: "S4", skills: [], spirits: [{ id: "one", asset: { localUrl: "/assets/spirits/one.png" } }], relations: [], methodTexts: [] }] };
  const fetcher = vi.fn(async () => ({ ok: true, json: async () => value }));
  vi.stubGlobal("fetch", fetcher);
  const { loadSkillCatalog } = await import("../../src/features/skill-query/load-catalog.js");
  const result = await loadSkillCatalog("cn");
  expect(fetcher).toHaveBeenCalledWith("/pre/data/skill-query/catalog.json");
  expect(result.seasons[0].spirits[0].asset.localUrl).toBe("/pre/assets/spirits/one.png");
});

test("new Web preview overlay also projects its newly attached portrait paths", async () => {
  vi.stubEnv("BASE_URL", "/pre/");
  const { withWebPreview } = await import("../../src/features/s5-preview/with-web-preview.js");
  const result = withWebPreview({ meta: { id: "fixture" }, spirits: [], skills: [], traits: [], learnsets: [] });
  const spirit = result.spirits.find(entry => entry.previewIdentity?.key === "abu");
  expect(spirit.asset.localUrl).toMatch(/^\/pre\/assets\//u);
  expect(spirit.previewIdentity.asset?.localUrl ?? "/assets/").toMatch(/^\/assets\//u);
  const { S5_PREVIEW_TEST_STATS } = await import("../../src/features/s5-preview/catalog.js");
  expect(spirit.raceStats).toEqual(S5_PREVIEW_TEST_STATS);
  expect(spirit.calculationStatus).toBe("pending-s5-mechanics");
});
