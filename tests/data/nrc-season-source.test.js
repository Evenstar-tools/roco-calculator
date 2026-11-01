// @vitest-environment node
import { describe, expect, test, vi } from "vitest";
import { decodeNrcSeasonShard, fetchNrcSeasonSource, parseNrcSeasonSource,
  NRC_SEASON_ADAPTER_TITLE, NRC_SEASON_MANIFEST_TITLE } from "../../scripts/bwiki/nrc-season-source.mjs";

function pack(value, tags = { object_tag: 1, array_tag: 2 }) {
  const fields = [], indexes = new Map();
  const field = key => {
    if (!indexes.has(key)) { fields.push(key); indexes.set(key, fields.length); }
    return indexes.get(key);
  };
  const node = value => Array.isArray(value) ? [tags.array_tag, value.map(node)]
    : value && typeof value === "object" ? [tags.object_tag, Object.entries(value).map(([key, child]) => [field(key), node(child)])]
      : value;
  const tree = node(value);
  return ["dragon-tuples-1", fields, tree];
}
const lua = value => value === null ? "nil" : typeof value !== "object" ? JSON.stringify(value)
  : Array.isArray(value) ? `{${value.map(lua).join(",")}}`
    : `{${Object.entries(value).map(([key, child]) => `[${JSON.stringify(key)}]=${lua(child)}`).join(",")}}`;
function page(title, value, revision = 1) {
  return { title, revisions: [{ revid: revision, timestamp: "2099-01-02T00:00:00Z", slots: { main: { content: `return ${lua(value)}` } } }] };
}
function response(pages) { return { query: { pages }, fetchedAt: "2099-01-02T01:00:00Z" }; }
function fixture() {
  const manifest = { current: { season: "S5", name: "合成测试赛季", last_number: 2 }, seasons: [{
    namespace: "精灵图鉴/S5/数据", codec: "dragon-tuples-1", object_tag: 1, array_tag: 2,
    modules: { Roster: "精灵", Arts: "技能", Gifts: "特性", Aux: "辅助", Links: "关联" },
  }] };
  const base = {
    Catalog: { old: { title: "旧精灵", stats: { hp: 10 } } },
    Skills: { old: { name: "旧技能" } }, Learnsets: { old: { native_skills: ["old"] } }, Evolutions: {},
    Config: { current_version: "s5-fixture", talent_pools: { old: ["旧池"] } }, Index: { titles: { old: "旧精灵" } },
    History: { versions: { old: { date: "2098-01-01" } }, pets: { old: { before: 10 } } },
    Terms: { old: { name: "旧术语" } }, Types: { "普通系": { weak: ["武系"] } },
  };
  const shard = {
    Roster: { fresh: { title: "新精灵", stats: { hp: 20 } } },
    Arts: { fresh: { name: "新技能" } }, Gifts: { trait: { name: "新特性", category: "特性" } },
    Aux: {
      CatalogSeasons: { S5: ["fresh"] }, Config: { talent_pools: { fresh: ["新池"] } },
      History: { versions: { new: { date: "2099-01-02" } }, pets: { fresh: { after: 20 } } },
      Index: { titles: { fresh: "新精灵" } }, Learnsets: { fresh: { native_skills: ["fresh"] } },
      Terms: { fresh: { name: "新术语" } }, Types: { "普通系": { weak: ["龙系"] } },
      SeasonFeatures: { old: { feature_skill_id: "trait" } }, SeasonLearnsets: { old: { native_skills: ["fresh"] } },
    },
    Links: { Targets: { pet: { fresh: "新精灵" } }, Links: { pet: { fresh: "新精灵" }, skill: { fresh: "新技能" } } },
  };
  const responses = () => [
    response(Object.entries(base).map(([name, value], index) => page(`模块:Pets/data/${name}`, value, index + 1))),
    response([page(NRC_SEASON_MANIFEST_TITLE, manifest, 20),
      // Executable remote code is preserved only as a revision reference.
      { title: NRC_SEASON_ADAPTER_TITLE, revisions: [{ revid: 21, slots: { main: { content: "error('must never execute')" } } }] },
      ...Object.entries(shard).map(([name, value], index) => page(`模块:${manifest.seasons[0].namespace}/${manifest.seasons[0].modules[name]}`, pack(value), 30 + index))]),
  ];
  return { manifest, base, shard, responses };
}

describe("NRC season tuple decoder", () => {
  test("preserves nested object/array identity, empty tables, scalars and one-based dictionary indexes", () => {
    const value = { name: "精灵", stats: { hp: 123, speed: 0 }, types: ["幽系", "龙系"], emptyObject: {}, emptyArray: [], bool: false, unknown: null };
    expect(decodeNrcSeasonShard(pack(value))).toEqual(value);
    expect(Array.isArray(decodeNrcSeasonShard(pack(value)).emptyObject)).toBe(false);
    const tags = { object_tag: 4, array_tag: 5 };
    expect(decodeNrcSeasonShard(pack(value, tags), tags)).toEqual(value);
  });
  test.each([
    ["unknown-codec", [], [1, []]],
    ["dragon-tuples-1", ["a"], [3, []]],
    ["dragon-tuples-1", ["a"], [1, [[0, 1]]]],
    ["dragon-tuples-1", ["a"], [1, [[2, 1]]]],
    ["dragon-tuples-1", ["a"], [1, [[1, 1], [1, 2]]]],
    ["dragon-tuples-1", ["a", "a"], [1, []]],
    ["dragon-tuples-1", ["a"], [1, [[1]]]],
  ])("rejects malformed codec, nodes and field indexes: %j", (...args) => {
    expect(() => decodeNrcSeasonShard(args)).toThrow("NRC 赛季来源");
  });
  test("field names remain inert own properties", () => {
    const decoded = decodeNrcSeasonShard(["dragon-tuples-1", ["__proto__", "polluted"], [1, [[1, [1, [[2, true]]]]]]]);
    expect(Object.hasOwn(decoded, "__proto__")).toBe(true);
    expect(decoded.__proto__).toEqual({ polluted: true });
    expect({}.polluted).toBeUndefined();
  });
});

describe("NRC published seasonal merge", () => {
  test("merges every auxiliary module and preserves the adapter's shallow-vs-nested merge distinction", () => {
    const { base, shard, responses } = fixture();
    const raw = responses(), saved = structuredClone(raw);
    const result = parseNrcSeasonSource(raw);
    expect(result.counts).toEqual({ base: { spirits: 1, skills: 1 }, merged: { spirits: 2, skills: 3 } });
    expect(result.modules.Catalog).toEqual({ ...base.Catalog, ...shard.Roster });
    expect(result.modules.Skills).toEqual({ ...base.Skills, ...shard.Arts, ...shard.Gifts });
    expect(result.modules.Config.talent_pools).toEqual({ old: ["旧池"], fresh: ["新池"] });
    expect(result.modules.History.versions).toEqual({ ...base.History.versions, ...shard.Aux.History.versions });
    expect(result.modules.History.pets).toEqual({ ...base.History.pets, ...shard.Aux.History.pets });
    expect(result.modules.Index.titles).toEqual({ fresh: "新精灵" });
    expect(result.modules.Types["普通系"]).toEqual({ weak: ["龙系"] });
    expect(result.modules.Terms).toEqual({ ...base.Terms, ...shard.Aux.Terms });
    expect(result.modules.SeasonFeatures).toEqual(shard.Aux.SeasonFeatures);
    expect(result.modules.SeasonLearnsets).toEqual(shard.Aux.SeasonLearnsets);
    expect(result.modules.SkillSeasons).toEqual({ fresh: "S5", trait: "S5" });
    expect(result.modules.Targets).toEqual(shard.Links.Targets);
    expect(result.modules.Links).toEqual(shard.Links.Links);
    expect(raw).toEqual(saved);
    expect(parseNrcSeasonSource(raw)).toEqual(result);
  });
  test("retains every original revision/URL and the contributing module references without executing adapter Lua", () => {
    const result = parseNrcSeasonSource(fixture().responses());
    expect(result.sources[NRC_SEASON_ADAPTER_TITLE]).toMatchObject({ revision: 21, url: "https://wiki.biligame.com/nrc/index.php?oldid=21" });
    expect(result.sources[NRC_SEASON_MANIFEST_TITLE]).toMatchObject({ revision: 20, fetchedAt: "2099-01-02T01:00:00Z" });
    expect(result.moduleSources.Catalog.map(ref => ref.revision)).toEqual([1, 30]);
    expect(result.moduleSources.Skills.map(ref => ref.revision)).toEqual([2, 31, 32]);
    expect(result.seasons[0]).toMatchObject({ code: "S5", counts: { spirits: 1, skills: 1, traits: 1 } });
  });
  test("multiple manifest seasons use declared order and conflicting exact routes are rejected", () => {
    const { manifest, responses } = fixture();
    const raw = responses();
    const nextSeason = { ...manifest.seasons[0], namespace: "精灵图鉴/S6/数据" };
    manifest.seasons.push(nextSeason);
    manifest.current.season = "S6";
    raw[1].query.pages[0] = page(NRC_SEASON_MANIFEST_TITLE, manifest, 20);
    for (const name of ["Roster", "Arts", "Gifts", "Aux", "Links"]) {
      const value = name === "Roster" ? { fresh: { title: "正式更名" } }
        : name === "Aux" ? { CatalogSeasons: { S6: ["fresh"] } }
          : name === "Links" ? { Targets: { pet: { fresh: "新精灵" } }, Links: {} } : {};
      raw[1].query.pages.push(page(`模块:${nextSeason.namespace}/${nextSeason.modules[name]}`, pack(value), 50));
    }
    expect(parseNrcSeasonSource(raw, { expectedSeason: "S6" }).modules.Catalog.fresh.title).toBe("正式更名");
    raw[1].query.pages.at(-1).revisions[0].slots.main.content = `return ${lua(pack({ Targets: { pet: { fresh: "错误重绑定" } }, Links: {} }))}`;
    expect(() => parseNrcSeasonSource(raw, { expectedSeason: "S6" })).toThrow("路由身份冲突");
  });
  test("rejects missing shards/base modules, duplicate pages, mismatched season and executable data", () => {
    const { responses } = fixture();
    const missing = responses(); missing[1].query.pages.pop();
    expect(() => parseNrcSeasonSource(missing)).toThrow("缺少来源模块");
    const missingBase = responses(); missingBase[0].query.pages.shift();
    expect(() => parseNrcSeasonSource(missingBase)).toThrow("缺少基础模块");
    const duplicate = responses(); duplicate.push(response([duplicate[0].query.pages[0]]));
    expect(() => parseNrcSeasonSource(duplicate)).toThrow("来源页面重复");
    expect(() => parseNrcSeasonSource(responses(), { expectedSeason: "S6" })).toThrow("来源赛季不符");
    const executable = responses(); executable[1].query.pages[2].revisions[0].slots.main.content = "return (function() return {} end)()";
    expect(() => parseNrcSeasonSource(executable)).toThrow("禁止非数据 Lua");
  });
  test("fetch discovers all five shard names from the manifest and returns original response evidence on request", async () => {
    const { responses } = fixture();
    const source = responses(), byTitle = new Map(source.flatMap(item => item.query.pages).map(item => [item.title, item]));
    const fetchImpl = vi.fn(async url => ({ ok: true, json: async () => ({ query: { pages: url.searchParams.get("titles").split("|").map(title => byTitle.get(title)) } }) }));
    const result = await fetchNrcSeasonSource({ fetchImpl, baseModules: Object.keys(fixture().base), includeResponses: true });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(fetchImpl.mock.calls[1][0].searchParams.get("titles").split("|")).toHaveLength(5);
    expect(result.responses).toHaveLength(2);
    expect(result.modules.Catalog.fresh.title).toBe("新精灵");
    expect(fetchImpl.mock.calls[0][0].origin).toBe("https://wiki.biligame.com");
  });
  test("HTTP errors stop retrieval; missing/incorrect revisions never produce a partial merge", async () => {
    const fetchImpl = vi.fn(async () => ({ ok: false, status: 429 }));
    await expect(fetchNrcSeasonSource({ fetchImpl })).rejects.toThrow("HTTP 429");
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const raw = fixture().responses(); raw[0].query.pages[0].revisions[0].revid = null;
    expect(() => parseNrcSeasonSource(raw)).toThrow("来源页面缺失或无修订");
  });
});
