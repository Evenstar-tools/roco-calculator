import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { parseLuaData } from "./parse-lua-data.mjs";
import { NRC_MODULES } from "./nrc-source.mjs";

export const NRC_SEASON_MANIFEST_TITLE = "模块:精灵图鉴/S5/配置";
export const NRC_SEASON_ADAPTER_TITLE = "模块:精灵图鉴/S5";
export const NRC_SEASON_BASE_MODULES = [
  ...NRC_MODULES, "Handbooks", "Terms", "Types", "SkillStoneTopics", "History", "Overview", "TrainingReference",
];
const SHARDS = ["Roster", "Arts", "Gifts", "Aux", "Links"];
const required = (condition, message) => { if (!condition) throw new Error(`NRC 赛季来源：${message}`); };
const table = value => value !== null && typeof value === "object";
const record = value => table(value) && (!Array.isArray(value) || value.length === 0);
const own = (value, key) => Object.hasOwn(value, key);

/** Decode the published tuple format as data only. No Lua code is evaluated. */
export function decodeNrcSeasonShard(packed, season = {}) {
  const codec = season.codec ?? "dragon-tuples-1";
  const objectTag = season.object_tag ?? 1, arrayTag = season.array_tag ?? 2;
  required(codec === "dragon-tuples-1" && Array.isArray(packed) && packed.length === 3 && packed[0] === codec,
    "不支持的赛季资料格式");
  required(Number.isSafeInteger(objectTag) && Number.isSafeInteger(arrayTag) && objectTag !== arrayTag,
    "赛季节点标签无效");
  const fields = packed[1];
  required(Array.isArray(fields) && fields.every(key => typeof key === "string") && new Set(fields).size === fields.length,
    "赛季字段字典无效");
  function decode(value) {
    if (!table(value)) {
      required(value === null || ["string", "boolean"].includes(typeof value) || typeof value === "number" && Number.isFinite(value),
        "赛季值不是纯数据");
      return value;
    }
    required(Array.isArray(value) && value.length === 2 && Array.isArray(value[1]), "无效的赛季资料节点");
    if (value[0] === arrayTag) return value[1].map(decode);
    required(value[0] === objectTag, "无效的赛季资料节点标签");
    const seen = new Set();
    return Object.fromEntries(value[1].map(entry => {
      required(Array.isArray(entry) && entry.length === 2 && Number.isSafeInteger(entry[0]) &&
        entry[0] >= 1 && entry[0] <= fields.length, "无效的赛季字段索引");
      const key = fields[entry[0] - 1];
      required(!seen.has(key), `重复的赛季字段：${key}`);
      seen.add(key);
      return [key, decode(entry[1])];
    }));
  }
  return decode(packed[2]);
}

function indexPages(responses) {
  const pages = new Map();
  for (const response of responses) {
    required(!response?.error && Array.isArray(response?.query?.pages), "来源响应不完整");
    for (const page of response.query.pages) {
      const revision = page.revisions?.[0];
      required(typeof page.title === "string" && !page.missing && Number.isSafeInteger(revision?.revid) && revision.revid > 0 &&
        typeof revision.slots?.main?.content === "string", `来源页面缺失或无修订：${page.title}`);
      required(!pages.has(page.title), `来源页面重复：${page.title}`);
      pages.set(page.title, { page, ref: {
        title: page.title, revision: revision.revid,
        url: `https://wiki.biligame.com/nrc/index.php?oldid=${revision.revid}`,
        ...(revision.timestamp ? { timestamp: revision.timestamp } : {}),
        ...(response.fetchedAt ? { fetchedAt: response.fetchedAt } : {}),
      } });
    }
  }
  return pages;
}

function manifestSeasons(manifest, expectedSeason) {
  required(record(manifest) && record(manifest.current) && typeof manifest.current.season === "string" &&
    (!expectedSeason || manifest.current.season === expectedSeason), "来源赛季不符");
  required(Array.isArray(manifest.seasons) && manifest.seasons.length > 0, "赛季分片清单缺失");
  for (const season of manifest.seasons) {
    required(record(season) && typeof season.namespace === "string" && season.namespace.length > 0 &&
      season.codec === "dragon-tuples-1" && record(season.modules ?? {}), "赛季分片配置无效");
    for (const name of SHARDS) required(typeof (season.modules?.[name] ?? name) === "string" &&
      (season.modules?.[name] ?? name).length > 0, `赛季分片名称无效：${name}`);
  }
  return manifest.seasons;
}
const shardTitle = (season, name) => `模块:${season.namespace}/${season.modules?.[name] ?? name}`;

/** Match the published S5 adapter's lazy merge semantics without running it. */
export function parseNrcSeasonSource(responses, {
  manifestTitle = NRC_SEASON_MANIFEST_TITLE, adapterTitle = NRC_SEASON_ADAPTER_TITLE,
  expectedSeason = "S5", requiredBaseModules = NRC_MODULES,
} = {}) {
  const pages = indexPages(responses);
  const read = title => {
    const item = pages.get(title);
    required(item, `缺少来源模块：${title}`);
    return parseLuaData(item.page.revisions[0].slots.main.content);
  };
  const manifest = read(manifestTitle);
  const seasons = manifestSeasons(manifest, expectedSeason);
  const modules = {}, sources = {}, moduleSources = {}, seasonRecords = [];
  const remember = title => { sources[title] = pages.get(title).ref; return sources[title]; };
  remember(manifestTitle);
  // The adapter's original Lua is evidence only; never pass it to a Lua engine.
  if (pages.has(adapterTitle)) remember(adapterTitle);
  for (const [title] of pages) {
    if (!title.startsWith("模块:Pets/data/")) continue;
    const name = title.slice("模块:Pets/data/".length);
    required(/^[A-Za-z][A-Za-z0-9_]*$/u.test(name), `基础模块名称无效：${title}`);
    const value = read(title);
    required(record(value), `基础模块不是数据表：${title}`);
    modules[name] = value;
    moduleSources[name] = [remember(title)];
  }
  for (const name of requiredBaseModules) required(own(modules, name), `缺少基础模块：${name}`);
  const before = { spirits: Object.keys(modules.Catalog).length, skills: Object.keys(modules.Skills).length };
  modules.Targets = {}; modules.Links = {};
  const extend = (name, values, ref) => {
    required(record(values), `补丁模块不是数据表：${name}`);
    const merged = { ...(modules[name] ?? {}) };
    for (const [key, value] of Object.entries(values)) {
      Object.defineProperty(merged, key, { configurable: true, enumerable: true, writable: true,
        value: ["History", "Config"].includes(name) && table(value)
          ? { ...(merged[key] ?? {}), ...value } : value });
    }
    Object.defineProperty(modules, name, { configurable: true, enumerable: true, writable: true, value: merged });
    moduleSources[name] = [...(moduleSources[name] ?? []), ref];
  };
  const mergeRoutes = (name, values, ref) => {
    required(record(values), `赛季路由不是数据表：${name}`);
    const next = { ...modules[name] };
    for (const [kind, mapping] of Object.entries(values)) {
      required(record(mapping), `赛季路由分类无效：${kind}`);
      const merged = { ...(next[kind] ?? {}) };
      for (const [key, title] of Object.entries(mapping)) {
        required(typeof title === "string" && (!own(merged, key) || merged[key] === title), `赛季路由身份冲突：${key}`);
        Object.defineProperty(merged, key, { configurable: true, enumerable: true, writable: true, value: title });
      }
      Object.defineProperty(next, kind, { configurable: true, enumerable: true, writable: true, value: merged });
    }
    modules[name] = next;
    moduleSources[name] = [...(moduleSources[name] ?? []), ref];
  };
  for (const season of seasons) {
    const shards = {}, refs = {};
    for (const name of SHARDS) {
      const title = shardTitle(season, name);
      shards[name] = decodeNrcSeasonShard(read(title), season);
      required(record(shards[name]), `赛季分片不是数据表：${name}`);
      refs[name] = remember(title);
    }
    extend("Catalog", shards.Roster, refs.Roster);
    extend("Skills", shards.Arts, refs.Arts);
    extend("Skills", shards.Gifts, refs.Gifts);
    for (const [name, values] of Object.entries(shards.Aux)) extend(name, values, refs.Aux);
    const codes = Object.keys(shards.Aux.CatalogSeasons ?? {});
    required(codes.length === 1, "赛季资料须有且仅有一个所属赛季");
    extend("SkillSeasons", Object.fromEntries([...Object.keys(shards.Arts), ...Object.keys(shards.Gifts)]
      .map(key => [key, codes[0]])), refs.Aux);
    mergeRoutes("Targets", shards.Links.Targets, refs.Links);
    mergeRoutes("Links", shards.Links.Links, refs.Links);
    seasonRecords.push({ code: codes[0], namespace: season.namespace, codec: season.codec, sources: refs,
      counts: { spirits: Object.keys(shards.Roster).length, skills: Object.keys(shards.Arts).length,
        traits: Object.keys(shards.Gifts).length, auxiliaryModules: Object.keys(shards.Aux).length } });
  }
  required(seasonRecords.some(season => season.code === manifest.current.season), "当前赛季没有对应分片");
  return { schemaVersion: 1, current: manifest.current, manifest, modules, sources, moduleSources, seasons: seasonRecords,
    counts: { base: before, merged: { spirits: Object.keys(modules.Catalog).length, skills: Object.keys(modules.Skills).length } } };
}

export async function fetchNrcSeasonPages(titles, { fetchImpl = fetch } = {}) {
  const url = new URL("https://wiki.biligame.com/nrc/api.php");
  url.search = new URLSearchParams({ action: "query", format: "json", formatversion: "2", prop: "revisions",
    titles: titles.join("|"), rvprop: "ids|timestamp|content", rvslots: "main" });
  const response = await fetchImpl(url);
  required(response.ok, `资料 API HTTP ${response.status}`);
  const body = await response.json();
  required(!body.error && body.query?.pages?.length === titles.length, "来源响应模块不完整");
  indexPages([body]);
  const returned = new Set(body.query.pages.map(page => page.title));
  required(titles.every(title => returned.has(title)), "来源响应模块名称不符");
  return { ...body, fetchedAt: new Date().toISOString() };
}

export async function fetchNrcSeasonSource({
  fetchImpl = fetch, baseModules = NRC_SEASON_BASE_MODULES, manifestTitle = NRC_SEASON_MANIFEST_TITLE,
  adapterTitle = NRC_SEASON_ADAPTER_TITLE, expectedSeason = "S5", includeResponses = false,
} = {}) {
  const first = await fetchNrcSeasonPages([...new Set([
    ...baseModules.map(name => `模块:Pets/data/${name}`), manifestTitle, adapterTitle,
  ])], { fetchImpl });
  const manifestPage = first.query.pages.find(page => page.title === manifestTitle);
  const manifest = parseLuaData(manifestPage.revisions[0].slots.main.content);
  const seasons = manifestSeasons(manifest, expectedSeason);
  const titles = [...new Set(seasons.flatMap(season => SHARDS.map(name => shardTitle(season, name))))];
  const second = await fetchNrcSeasonPages(titles, { fetchImpl });
  const responses = [first, second];
  return { ...parseNrcSeasonSource(responses, { manifestTitle, adapterTitle, expectedSeason }),
    ...(includeResponses ? { responses } : {}) };
}

async function main() {
  const inputs = []; let output, fetchSource = false;
  const args = process.argv.slice(2);
  for (let index = 0; index < args.length; index += 1) {
    if (args[index] === "--fetch") fetchSource = true;
    else if (["--input", "--output"].includes(args[index])) {
      const flag = args[index], value = args[++index];
      required(value && !value.startsWith("--"), `${flag} 需要路径`);
      if (flag === "--input") inputs.push(value); else output = value;
    } else throw new Error(`未知参数：${args[index]}`);
  }
  required(output && (fetchSource !== (inputs.length > 0)), "须指定 --output，并选择 --fetch 或一个以上 --input");
  const outputPath = path.resolve(output);
  required(!inputs.some(input => path.resolve(input) === outputPath), "输出不能覆盖来源输入");
  const result = fetchSource ? await fetchNrcSeasonSource() : parseNrcSeasonSource(await Promise.all(inputs.map(async input =>
    JSON.parse(await readFile(input, "utf8")))));
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(result, null, 2)}\n`, "utf8");
  console.log(JSON.stringify({ output: outputPath, current: result.current, counts: result.counts, seasons: result.seasons }));
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
