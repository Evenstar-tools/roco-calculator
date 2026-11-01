import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { readImageDimensions } from "./sync-assets.mjs";

const EVIDENCE = "data/reviewed/nrc-s5-20261101.json";
const BINDINGS = "data/reviewed/nrc-trait-icons.json";
const readJson = async file => JSON.parse(await readFile(file, "utf8"));
const exists = file => access(file).then(() => true, () => false);
const fileKey = title => title.replace(/^(?:File|文件):/iu, "").replaceAll(" ", "_");

export function createTraitIconPlan(evidence, snapshots) {
  const byName = new Map();
  const sourceRecords = evidence.modules?.Skills ?? Object.fromEntries((evidence.bindings ?? []).map(entry =>
    [entry.nrcIds[0], { category: "特性", name: entry.name, icon: entry.sourceFile }]));
  for (const [id, raw] of Object.entries(sourceRecords)) {
    if (raw.category !== "特性") continue;
    if (!/^Feature_\d+\.png$/u.test(raw.icon)) throw new Error(`特性图标文件未核验：${raw.name}`);
    const previous = byName.get(raw.name);
    if (previous && previous.sourceFile !== raw.icon) throw new Error(`同名特性图标冲突：${raw.name}`);
    byName.set(raw.name, { name: raw.name, sourceFile: raw.icon,
      nrcIds: [...(previous?.nrcIds ?? []), id] });
  }
  const traits = snapshots.flatMap(snapshot => snapshot.traits ?? []);
  const bindings = [], missing = [];
  for (const trait of traits) {
    const source = byName.get(trait.name);
    if (source) bindings.push({ id: trait.id, ...(trait.reference?.sourceId ? { sourceId: trait.reference.sourceId } : {}), ...source });
    else if (!trait.iconUrl) missing.push({ id: trait.id, name: trait.name });
  }
  const assets = [...new Set(bindings.map(entry => entry.sourceFile))].sort().map(sourceFile => ({
    sourceFile, localUrl: `/assets/traits/${sourceFile}`,
    names: [...new Set(bindings.filter(entry => entry.sourceFile === sourceFile).map(entry => entry.name))],
  }));
  const sources = evidence.moduleSources?.Skills ?? evidence.sources;
  const includesS5 = bindings.some(entry => entry.nrcIds.some(id => id.startsWith("dc5g_")));
  return { schemaVersion: 1, evidence: evidence.modules ? EVIDENCE : sources[0]?.url ?? evidence.evidence,
    sources: sources.filter(source => includesS5 || source.title === "模块:Pets/data/Skills"),
    bindings: [...new Map(bindings.map(entry => [entry.id, entry])).values()], assets,
    missing: [...new Map(missing.map(entry => [entry.id, entry])).values()] };
}

export async function resolveTraitIconUrls(records, { fetchImpl = fetch } = {}) {
  const body = new URLSearchParams({ action: "query", format: "json", formatversion: "2",
    prop: "imageinfo", iiprop: "url|size", titles: records.map(record => `File:${record.sourceFile}`).join("|") });
  const response = await fetchImpl("https://wiki.biligame.com/nrc/api.php", { method: "POST", body,
    signal: AbortSignal.timeout(20000), headers: { accept: "application/json",
      "content-type": "application/x-www-form-urlencoded", "user-agent": "rock-calculator/1.0 trait asset sync" } });
  if (!response.ok) throw new Error(`BWIKI 特性图片 API HTTP ${response.status}；保留已同步资料，停止请求`);
  const payload = await response.json();
  if (payload.error || !Array.isArray(payload.query?.pages)) throw new Error("BWIKI 特性图片响应不完整");
  const sources = new Map(payload.query.pages.map(page => [fileKey(page.title), page.imageinfo?.[0]]));
  return records.map(record => {
    const source = sources.get(record.sourceFile);
    if (!source?.url) return { ...record, unavailable: true };
    const parsed = new URL(source.url);
    if (parsed.protocol !== "https:" || parsed.hostname !== "patchwiki.biligame.com") throw new Error(`图片地址未核验：${record.sourceFile}`);
    return { ...record, sourceUrl: source.url, width: source.width, height: source.height };
  });
}

export function createTraitIconLookup(plan) {
  const available = new Map(plan.assets.filter(asset => asset.sourceUrl && asset.bytes > 0)
    .map(asset => [asset.sourceFile, asset.localUrl]));
  const ids = {}, names = {};
  for (const entry of plan.bindings) {
    const url = available.get(entry.sourceFile);
    if (!url) continue;
    ids[entry.id] = url;
    if (entry.sourceId) ids[entry.sourceId] = url;
    names[entry.name] = url;
  }
  return { ids, names };
}

export async function syncTraitIcons(plan, { root = process.cwd(), previous, fetchImpl = fetch,
  saveProgress = async () => {} } = {}) {
  const records = plan.assets.map(asset => {
    const cached = previous?.assets.find(entry => entry.sourceFile === asset.sourceFile && entry.sourceUrl);
    return cached ? { ...cached, ...asset } : asset;
  });
  const pending = records.filter(asset => !asset.sourceUrl);
  for (let start = 0; start < pending.length; start += 25) {
    const resolved = await resolveTraitIconUrls(pending.slice(start, start + 25), { fetchImpl });
    for (const record of resolved) Object.assign(records.find(entry => entry.sourceFile === record.sourceFile), record);
    await saveProgress({ ...plan, assets: records });
  }
  for (let start = 0; start < records.length; start += 4) {
    await Promise.all(records.slice(start, start + 4).map(async record => {
      if (!record.sourceUrl) return;
      if (!/^\/assets\/traits\/Feature_\d+\.png$/u.test(record.localUrl)) throw new Error(`非法特性资源路径：${record.localUrl}`);
      const output = path.join(root, "public", record.localUrl.slice(1));
      let buffer;
      if (record.bytes > 0 && await exists(output)) buffer = await readFile(output);
      else {
        const response = await fetchImpl(record.sourceUrl, { signal: AbortSignal.timeout(20000) });
        if (!response.ok) throw new Error(`特性图片下载 HTTP ${response.status}：${record.sourceFile}`);
        buffer = Buffer.from(await response.arrayBuffer());
        readImageDimensions(buffer);
        await mkdir(path.dirname(output), { recursive: true });
        await writeFile(output, buffer);
      }
      Object.assign(record, readImageDimensions(buffer), { bytes: buffer.length });
    }));
    await saveProgress({ ...plan, assets: records });
  }
  return { ...plan, assets: records };
}

async function main() {
  const option = name => process.argv.find(arg => arg.startsWith(`${name}=`))?.slice(name.length + 1);
  const evidence = await readJson(option("--evidence") ?? EVIDENCE);
  const snapshots = await Promise.all((option("--snapshots") ?? "data/snapshots/current.json,public/data/global-runtime.json").split(",").map(readJson));
  if (process.argv.includes("--s5")) {
    const { createServer } = await import("vite");
    const runtimeModule = new URL("../s5-bwiki-runtime.mjs", import.meta.url).href;
    const { buildS5BwikiSnapshot } = await import(/* @vite-ignore */ runtimeModule);
    const server = await createServer({ configFile: false, logLevel: "error",
      server: { middlewareMode: true, watch: null, ws: false } });
    try { snapshots.push(await buildS5BwikiSnapshot({ previewLoader: server })); }
    finally { await server.close(); }
  }
  let plan = createTraitIconPlan(evidence, snapshots);
  if (process.argv.includes("--assets")) {
    const previous = await exists(BINDINGS) ? await readJson(BINDINGS) : null;
    const saveProgress = current => writeFile(BINDINGS, `${JSON.stringify(current, null, 2)}\n`, "utf8");
    plan = await syncTraitIcons(plan, { previous, saveProgress });
    await writeFile("src/data/trait-icons.json", `${JSON.stringify(createTraitIconLookup(plan))}\n`, "utf8");
  }
  console.log(JSON.stringify({ traits: plan.bindings.length, assets: plan.assets.length,
    available: plan.assets.filter(asset => asset.bytes > 0).length, missing: plan.missing,
    unavailableFiles: plan.assets.filter(asset => asset.unavailable).map(asset => asset.sourceFile) }));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
