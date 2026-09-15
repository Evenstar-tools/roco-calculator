import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import { parseFavoriteConfigLibrary, applyFavoriteConfigLibraryImport } from "../../src/state/favorite-config-library.js";
import { presetConfigKey } from "../../src/state/preset-baseline.js";
import { spiritConfigsRepository } from "../../src/state/spirit-configs.js";
import { withCalculatorExtras } from "../../src/data/snapshot-extras.js";

const snapshot = withCalculatorExtras(JSON.parse(readFileSync("public/data/runtime.json", "utf8")));
const latest = JSON.parse(readFileSync("public/data/presets/pvp-popular-configs.json", "utf8"));
const history = JSON.parse(readFileSync("public/data/presets/pvp-preset-history.json", "utf8")).entries;
const old = history.find((entry) => latest.entries.some((next) => next.spiritId === entry.spiritId && presetConfigKey(next, snapshot) !== presetConfigKey(entry, snapshot)));
const incoming = latest.entries.find((entry) => entry.spiritId === old.spiritId);
const local = (entry) => ({ ...structuredClone(entry), skills: { four: entry.skills, single: null } });
function preview(config, historicalEntries = history) {
  return parseFavoriteConfigLibrary(JSON.stringify({ ...latest, entries: [incoming], entryCount: 1 }), {
    snapshot, historicalEntries, existingSpiritConfigs: { configs: config ? { [old.spiritId]: config } : {} },
  });
}
function apply(parsed, config) {
  let state = { configs: config ? { [old.spiritId]: config } : {} };
  return applyFavoriteConfigLibraryImport({ parsed, snapshot,
    spiritConfigsRepository: { load: () => state, replace: (next) => (state = next) },
    favoritesRepository: { list: () => [], replace: (next) => next },
  });
}
describe("预设最小更新策略", () => {
  test("历史旧预设更新而不是全部保留", () => {
    const parsed = preview(local(old));
    expect(parsed.preview).toMatchObject({ updated: 1, preserved: 0, different: 1, added: 0 });
    const result = apply(parsed, local(old));
    expect(result.configs.configs[old.spiritId].skills.four).toEqual(incoming.skills);
    expect(result.configs.configs[old.spiritId].presetBaseline).toBe(presetConfigKey(incoming, snapshot));
  });
  test("没有历史匹配的手改项保留", () => {
    const custom = local(old);
    custom.displayIvs.hp = 17;
    expect(preview(custom).preview).toMatchObject({ updated: 0, preserved: 1 });
    expect(apply(preview(custom), custom).configs.configs[old.spiritId]).toEqual(custom);
  });
  test("有基准后不再用其他历史版本掩盖手改", () => {
    const custom = { ...local(old), presetBaseline: presetConfigKey(incoming, snapshot) };
    expect(preview(custom).preview).toMatchObject({ updated: 0, preserved: 1 });
  });
  test("基准相符无需历史文件也能更新；预览后手改仍保留", () => {
    const config = { ...local(old), presetBaseline: presetConfigKey(old, snapshot) };
    const parsed = preview(config, []);
    expect(parsed.preview.updated).toBe(1);
    config.displayIvs.hp = 17;
    expect(apply(parsed, config).preview).toMatchObject({ updated: 0, preserved: 1 });
  });
  test("相同跳过、新增建立基准、缺少历史不冒险覆盖", () => {
    expect(preview(local(incoming)).preview).toMatchObject({ same: 1, updated: 0 });
    expect(apply(preview(null), null).configs.configs[old.spiritId].presetBaseline).toBe(presetConfigKey(incoming, snapshot));
    expect(preview(local(old), []).preview).toMatchObject({ updated: 0, preserved: 1 });
  });
  test("保存手改及重新载入保留原导入基准", () => {
    const data = new Map();
    const storage = { getItem: (key) => data.get(key) ?? null, setItem: (key, value) => data.set(key, value), removeItem: (key) => data.delete(key) };
    const repo = spiritConfigsRepository({ storage });
    const config = { ...local(old), presetBaseline: presetConfigKey(old, snapshot) };
    const state = repo.replace({ schemaVersion: 2, configs: { [old.spiritId]: config } }, snapshot);
    repo.save(state, { ...local(incoming) }, snapshot);
    expect(repo.load(snapshot).configs[old.spiritId].presetBaseline).toBe(config.presetBaseline);
  });
});
