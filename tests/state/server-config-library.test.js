// @vitest-environment jsdom

import { beforeEach, expect, test } from "vitest";
import { applyFavoriteConfigLibraryImport, buildFavoriteConfigLibrary, parseFavoriteConfigLibrary } from "../../src/state/favorite-config-library.js";
import { favoritesRepository } from "../../src/state/favorites.js";
import { spiritConfigsRepository } from "../../src/state/spirit-configs.js";
import { teamPresetsRepository } from "../../src/state/team-presets.js";

const globalSnapshot = { meta: { serverId: "global", id: null, rulesVersion: null }, spirits: [], skills: [], traits: [], learnsets: [] };
beforeEach(() => localStorage.clear());

test("Global JSON libraries preserve unknown IDs and manual values, and refuse unlabelled CN imports", () => {
  const config = { spiritId: "unknown-global", skills: { four: ["unknown-skill"] }, parameters: { nativeValue: 14.99 }, customField: ["kept"] };
  const exported = buildFavoriteConfigLibrary({ serverId: "global", snapshot: globalSnapshot,
    favorites: [{ id: "spirit:unknown-global", kind: "spirit", spiritId: "unknown-global" }], spiritConfigs: { configs: { "unknown-global": config } } });
  const parsed = parseFavoriteConfigLibrary(JSON.stringify(exported.library), { serverId: "global", snapshot: globalSnapshot });
  const result = applyFavoriteConfigLibraryImport({ serverId: "global", parsed, snapshot: globalSnapshot,
    favoritesRepository: favoritesRepository(undefined, { serverId: "global" }), spiritConfigsRepository: spiritConfigsRepository({ serverId: "global" }) });
  expect(result.configs.configs[config.spiritId]).toEqual(config);
  expect(result.configs.configs[config.spiritId].displayIvs).toBeUndefined();
  expect(favoritesRepository().list()).toEqual([]);
  expect(() => parseFavoriteConfigLibrary(JSON.stringify(exported.library), { serverId: "cn", snapshot: { spirits: [], skills: [] } })).toThrow(expect.objectContaining({ code: "SERVER_MISMATCH" }));
  const legacy = { ...exported.library }; delete legacy.serverId;
  expect(() => parseFavoriteConfigLibrary(JSON.stringify(legacy), { serverId: "global", snapshot: globalSnapshot })).toThrow(expect.objectContaining({ code: "SERVER_MISMATCH" }));
});

test("Global empty-team creation, rename, duplicate and deletion stay separate from CN", () => {
  let sequence = 0;
  const global = teamPresetsRepository({ serverId: "global", idFactory: () => `team-${++sequence}` });
  let state = global.create(global.load(globalSnapshot), "Global team");
  expect(state.teams[0].members).toEqual(Array(6).fill(null));
  state = global.rename(state, state.activeTeamId, "Renamed");
  state = global.duplicate(state, state.activeTeamId);
  expect(state.teams).toHaveLength(2);
  state = global.remove(state, state.activeTeamId);
  expect(state.teams[0].name).toBe("Renamed");
  expect(teamPresetsRepository().load({ spirits: [], skills: [] }).teams).toEqual([]);
});


test("Global favorites-only export imports without adding defaults or losing unknown references", () => {
  const favorite = { id: "spirit:cn-placeholder:only-favorite", kind: "spirit", spiritId: "cn-placeholder:only-favorite" };
  const exported = buildFavoriteConfigLibrary({ serverId: "global", snapshot: globalSnapshot, favorites: [favorite], spiritConfigs: { configs: {} } });
  expect(exported.exportedCount).toBe(0);
  const parsed = parseFavoriteConfigLibrary(JSON.stringify(exported.library), { serverId: "global", snapshot: globalSnapshot });
  const favorites = favoritesRepository(undefined, { serverId: "global" });
  const result = applyFavoriteConfigLibraryImport({ serverId: "global", parsed, snapshot: globalSnapshot,
    favoritesRepository: favorites, spiritConfigsRepository: spiritConfigsRepository({ serverId: "global" }) });
  expect(result.configs.configs).toEqual({});
  expect(favorites.list()).toEqual([favorite]);
  expect(favoritesRepository().list()).toEqual([]);
});
