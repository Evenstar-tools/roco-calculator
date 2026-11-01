import { readFileSync } from "node:fs";
import { afterEach, expect, test, vi } from "vitest";
import { buildS5PopularConfigLibrary, s5PreviewPresetsPlugin } from "../../scripts/s5-preview-presets.mjs";
import { withWebPreview } from "../../src/features/s5-preview/with-web-preview.js";
import { parseFavoriteConfigLibrary, applyFavoriteConfigLibraryImport } from "../../src/state/favorite-config-library.js";
import { spiritConfigsRepository } from "../../src/state/spirit-configs.js";
import { createInitialState } from "../../src/state/defaults.js";
import { selectSpirit } from "../../src/state/calculator-session.js";
import { chooseDefaultSkillIds } from "../../src/domain/skill-loadout.js";
import { getNature } from "../../src/domain/natures.js";
import additions from "../../data/presets/s5-popular-configs.json";
import { applyS5Bwiki } from "../../scripts/bwiki/apply-s5-bwiki.mjs";
import { applyS5Candymo } from "../../scripts/bwiki/apply-s5-candymo.mjs";
import { getLegalSkillIds } from "../../src/domain/skill-loadout.js";

const read = (path) => JSON.parse(readFileSync(path, "utf8"));
const legacySnapshot = withWebPreview(read("public/data/runtime.json"));
const base = read("public/data/presets/pvp-popular-configs.json");
const currentSnapshot = applyS5Candymo(withWebPreview(applyS5Bwiki(withWebPreview(read("data/snapshots/current.json")),
  read("data/reviewed/nrc-s5-20261101.json"))), read("data/reviewed/candymo-s5-20261101.json"));
const snapshot = currentSnapshot;
const specs = [
  ["冥古龙", "固执", "HAS"], ["地绡银龙", "胆小", "HCS"],
  ["龙嵴金脉", "固执", "HAS"], ["影子剪纸", "开朗", "HAS"],
  ["滴廿豚", "沉默", "HBD"], ["冬虫夏瓜", "沉默", "HBC"],
  ["刨雪鹅", "沉默", "HBD"], ["圆环鲸羽", "沉默", "HCS"],
  ["沙咔蟹", "固执", "HAS"], ["鸡麻麻", "平和", "HBD"],
  ["阿瓦鲨（柠檬鲨的样子）", "平和", "HAB"], ["阿瓦鲨（虎纹鲨的样子）", "固执", "HAS"],
  ["圣冠布鲁斯", "固执", "HAS"], ["琉璃君主", "沉默", "HBD"],
];
const stats = { H: "hp", A: "physicalAttack", B: "physicalDefense", C: "magicalAttack", D: "magicalDefense", S: "speed" };

afterEach(() => { vi.unstubAllEnvs(); vi.resetModules(); });

test("14份用户推荐按精确形态、性格与三项60录入，未指定技能沿用旧默认", () => {
  const snapshot = legacySnapshot;
  expect(additions.entries).toHaveLength(18);
  expect(additions.entryCount).toBe(18);
  additions.entries.slice(0, 14).forEach((entry, index) => {
    const [name, nature, spread] = specs[index];
    const spirit = snapshot.spirits.find(candidate => candidate.id === entry.spiritId);
    expect(spirit.fullName).toBe(name);
    expect(getNature(entry.natureId).name).toBe(nature);
    expect(entry.displayIvs).toEqual(Object.fromEntries(Object.entries(stats)
      .map(([letter, stat]) => [stat, spread.includes(letter) ? 60 : 0])));
    if (index === 0) {
      expect(entry.skills.map(id => snapshot.skills.find(skill => skill.id === id)?.name))
        .toEqual(["撞鬼", "荒芜之噬", "力量增效", "偷袭"]);
    } else if (index >= 12) {
      expect(entry.skills).toEqual([null, null, null, null]);
    } else {
      expect(entry.skills).toEqual(chooseDefaultSkillIds(snapshot, spirit.id));
    }
  });
});

test("合并库新增18份可导入配置，保留原231份；导入、选中和再检查一致", () => {
  const library = buildS5PopularConfigLibrary();
  expect(library.entryCount).toBe(249);
  expect(library.entries.slice(0, base.entryCount)).toEqual(base.entries);
  const data = new Map();
  const storage = { getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, value), removeItem: key => data.delete(key) };
  const configs = spiritConfigsRepository({ storage });
  let favorites = [];
  const favoritesRepository = { list: () => favorites, replace: value => (favorites = value) };
  const parse = value => parseFavoriteConfigLibrary(JSON.stringify(value), { snapshot, existingSpiritConfigs: configs.load(snapshot) });
  const apply = parsed => applyFavoriteConfigLibraryImport({ parsed, snapshot, spiritConfigsRepository: configs, favoritesRepository });
  apply(parse(base));
  const parsed = parse(library);
  expect(parsed.warnings).toEqual([]);
  expect(parsed.preview).toMatchObject({ added: 18, same: 231, missingSpirits: 0, missingSkills: 0, invalidEntries: 0 });
  apply(parsed);
  const saved = configs.load(snapshot).configs;
  const initialState = createInitialState(snapshot);
  for (const entry of additions.entries) {
    const personalConfiguration = saved[entry.spiritId];
    expect(personalConfiguration).toMatchObject({ natureId: entry.natureId, displayIvs: entry.displayIvs, skills: { four: entry.skills } });
    const { state } = selectSpirit(initialState, { initialState, snapshot, side: "attacker", spiritId: entry.spiritId, personalConfiguration });
    expect(state.sides.attacker).toMatchObject({ nature: entry.natureId, displayIvs: entry.displayIvs });
    expect(state.sides.attacker.skills.four.map(skill => typeof skill === "string" ? skill : skill?.skillId ?? null)).toEqual(entry.skills);
  }
  expect(parse(library).preview).toMatchObject({ added: 0, updated: 0, same: 249 });
  const custom = saved[additions.entries[0].spiritId];
  custom.displayIvs.hp = 17;
  configs.replace({ schemaVersion: 2, configs: saved }, snapshot);
  expect(apply(parse(library)).preview).toMatchObject({ added: 0, updated: 0, preserved: 1 });
  expect(configs.load(snapshot).configs[custom.spiritId].displayIvs.hp).toBe(17);
});

test("预览开发接口和构建资源一致，其他接口与正式库保持原样", async () => {
  const plugin = s5PreviewPresetsPlugin({ snapshotLoader: async () => currentSnapshot });
  let handler;
  plugin.configureServer({ middlewares: { use: callback => { handler = callback; } } });
  const response = { setHeader: vi.fn(), end: vi.fn() };
  const next = vi.fn();
  await handler({ method: "GET", url: "/pre/data/presets/pvp-popular-configs.json?test=1" }, response, next);
  expect(next).not.toHaveBeenCalled();
  expect(JSON.parse(response.end.mock.calls[0][0])).toEqual(buildS5PopularConfigLibrary(currentSnapshot));
  const emitFile = vi.fn();
  await plugin.generateBundle.call({ emitFile });
  expect(emitFile.mock.calls[0][0]).toMatchObject({ fileName: "data/presets/pvp-popular-configs.json", source: response.end.mock.calls[0][0] });
  handler({ method: "GET", url: "/data/global/presets/pvp-popular-configs.json" }, response, next);
  expect(next).toHaveBeenCalledOnce();
  expect(read("public/data/presets/pvp-popular-configs.json")).toEqual(base);
});

test("BWIKI 刷新只修复系统热门模板的非法和空槽，保留性格个体及合法招式", () => {
  const old = buildS5PopularConfigLibrary();
  const library = buildS5PopularConfigLibrary(currentSnapshot);
  expect(library.entryCount).toBe(249);
  for (const entry of library.entries) {
    const previous = old.entries.find(candidate => candidate.spiritId === entry.spiritId);
    const legal = new Set([...getLegalSkillIds(currentSnapshot, entry.spiritId), ...chooseDefaultSkillIds(currentSnapshot, entry.spiritId)]);
    expect(entry).toMatchObject({ natureId: previous.natureId, displayIvs: previous.displayIvs, traitValues: previous.traitValues });
    expect(entry.skills.every(id => id && legal.has(id)), entry.spiritId).toBe(true);
    if (new Set(previous.skills).size === previous.skills.length) {
      expect(new Set(entry.skills).size).toBe(entry.skills.length);
    }
    previous.skills.forEach((id, index) => {
      if (id && legal.has(id)) expect(entry.skills[index]).toBe(id);
    });
  }
  expect(library.entries.filter((entry, index) => JSON.stringify(entry.skills) !== JSON.stringify(old.entries[index].skills))).toHaveLength(6);
  expect(read("public/data/presets/pvp-popular-configs.json")).toEqual(base);
  expect(read("data/presets/s5-popular-configs.json")).toEqual(additions);
});

test("更新系统预设时保留用户手动清空的技能与自定义个体", () => {
  const data = new Map();
  const storage = { getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, value), removeItem: key => data.delete(key) };
  const configs = spiritConfigsRepository({ storage });
  const favoritesRepository = { list: () => [], replace: vi.fn(value => value) };
  const parse = library => parseFavoriteConfigLibrary(JSON.stringify(library), { snapshot: currentSnapshot, existingSpiritConfigs: configs.load(currentSnapshot) });
  const apply = parsed => applyFavoriteConfigLibraryImport({ parsed, snapshot: currentSnapshot, spiritConfigsRepository: configs, favoritesRepository });
  apply(parse(buildS5PopularConfigLibrary()));
  const id = currentSnapshot.spirits.find(spirit => spirit.fullName === "圣冠布鲁斯").id;
  const saved = configs.load(currentSnapshot);
  saved.configs[id].displayIvs.hp = 17;
  saved.configs[id].skills = { four: [null, null, null, null], single: null };
  configs.replace(saved, currentSnapshot);
  const before = structuredClone(configs.load(currentSnapshot).configs[id]);
  const result = apply(parse(buildS5PopularConfigLibrary(currentSnapshot)));
  expect(result.preview.preserved).toBeGreaterThanOrEqual(1);
  expect(configs.load(currentSnapshot).configs[id]).toEqual(before);
  const initial = createInitialState(currentSnapshot);
  expect(selectSpirit(initial, { initialState: initial, snapshot: currentSnapshot, side: "attacker", spiritId: id,
    personalConfiguration: before }).state.sides.attacker.skills.four).toEqual([null, null, null, null]);
});

test("S5显示249份，正式构建仍显示231份", async () => {
  vi.stubEnv("MODE", "pre");
  expect((await import("../../src/data/preset-metadata.js")).POPULAR_CONFIG_COUNT).toBe(249);
  vi.resetModules();
  vi.stubEnv("MODE", "production");
  expect((await import("../../src/data/preset-metadata.js")).POPULAR_CONFIG_COUNT).toBe(231);
});
