import { readFileSync } from "node:fs";
import { afterEach, expect, test, vi } from "vitest";
import { buildS5PopularConfigLibrary, s5PreviewPresetsPlugin } from "../../scripts/s5-preview-presets.mjs";
import { withCnRecommendedSpirits } from "../../src/features/s5-preview/with-cn-recommended.js";
import { parseFavoriteConfigLibrary, applyFavoriteConfigLibraryImport } from "../../src/state/favorite-config-library.js";
import { spiritConfigsRepository } from "../../src/state/spirit-configs.js";
import { createInitialState } from "../../src/state/defaults.js";
import { selectSpirit } from "../../src/state/calculator-session.js";
import { chooseDefaultSkillIds } from "../../src/domain/skill-loadout.js";
import { getNature } from "../../src/domain/natures.js";
import additions from "../../data/presets/s5-popular-configs.json";

const read = (path) => JSON.parse(readFileSync(path, "utf8"));
const snapshot = withCnRecommendedSpirits(read("public/data/runtime.json"));
const base = read("public/data/presets/pvp-popular-configs.json");
const specs = [
  ["冥古龙", "固执", "HAS"], ["地绡银龙", "胆小", "HCS"],
  ["龙嵴金脉", "固执", "HAS"], ["影子剪纸", "开朗", "HAS"],
  ["滴廿豚", "沉默", "HBD"], ["冬虫夏瓜", "沉默", "HBC"],
  ["刨雪鹅", "沉默", "HBD"], ["圆环鲸羽", "沉默", "HCS"],
  ["沙咔蟹", "固执", "HAS"], ["鸡麻麻", "平和", "HBD"],
  ["阿瓦鲨（柠檬鲨的样子）", "平和", "HAB"], ["阿瓦鲨（虎纹鲨的样子）", "固执", "HAS"],
  ["冰钻布鲁斯（首领化）", "固执", "HAS"], ["琉璃水母（首领化）", "沉默", "HBD"],
];
const stats = { H: "hp", A: "physicalAttack", B: "physicalDefense", C: "magicalAttack", D: "magicalDefense", S: "speed" };

afterEach(() => { vi.unstubAllEnvs(); vi.resetModules(); });

test("14份用户推荐按精确形态、性格与三项60录入，未指定技能沿用旧默认", () => {
  expect(additions.entries).toHaveLength(14);
  expect(additions.entryCount).toBe(14);
  additions.entries.forEach((entry, index) => {
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

test("合并库新增14份可导入配置，保留原231份；导入、选中和再检查一致", () => {
  const library = buildS5PopularConfigLibrary();
  expect(library.entryCount).toBe(245);
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
  expect(parsed.preview).toMatchObject({ added: 14, same: 231, missingSpirits: 0, missingSkills: 0, invalidEntries: 0 });
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
  expect(parse(library).preview).toMatchObject({ added: 0, updated: 0, same: 245 });
  const custom = saved[additions.entries[0].spiritId];
  custom.displayIvs.hp = 17;
  configs.replace({ schemaVersion: 2, configs: saved }, snapshot);
  expect(apply(parse(library)).preview).toMatchObject({ added: 0, updated: 0, preserved: 1 });
  expect(configs.load(snapshot).configs[custom.spiritId].displayIvs.hp).toBe(17);
});

test("预览开发接口和构建资源一致，其他接口与正式库保持原样", () => {
  const plugin = s5PreviewPresetsPlugin();
  let handler;
  plugin.configureServer({ middlewares: { use: callback => { handler = callback; } } });
  const response = { setHeader: vi.fn(), end: vi.fn() };
  const next = vi.fn();
  handler({ method: "GET", url: "/pre/data/presets/pvp-popular-configs.json?test=1" }, response, next);
  expect(next).not.toHaveBeenCalled();
  expect(JSON.parse(response.end.mock.calls[0][0])).toEqual(buildS5PopularConfigLibrary());
  const emitFile = vi.fn();
  plugin.generateBundle.call({ emitFile });
  expect(emitFile.mock.calls[0][0]).toMatchObject({ fileName: "data/presets/pvp-popular-configs.json", source: response.end.mock.calls[0][0] });
  handler({ method: "GET", url: "/data/global/presets/pvp-popular-configs.json" }, response, next);
  expect(next).toHaveBeenCalledOnce();
  expect(read("public/data/presets/pvp-popular-configs.json")).toEqual(base);
});

test("S5和普通版均显示245份", async () => {
  vi.stubEnv("MODE", "pre");
  expect((await import("../../src/data/preset-metadata.js")).POPULAR_CONFIG_COUNT).toBe(245);
  vi.resetModules();
  vi.stubEnv("MODE", "production");
  expect((await import("../../src/data/preset-metadata.js")).POPULAR_CONFIG_COUNT).toBe(245);
});
