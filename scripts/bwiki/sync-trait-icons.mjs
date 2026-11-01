import { access, mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { readImageDimensions } from "./sync-assets.mjs";

const EVIDENCE = "data/reviewed/nrc-s5-20261101.json";
const BINDINGS = "data/reviewed/nrc-trait-icons.json";
export const TRAIT_ICON_PROFILE = "webp-128-q95";
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
    sourceFile, localUrl: `/assets/traits/${sourceFile.replace(/\.png$/u, ".webp")}`,
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

/** 44px UI icon at almost 3x density; retain the source identity and alpha. */
export async function optimizeTraitIcon(sourceBuffer) {
  const source = readImageDimensions(sourceBuffer);
  const scale = Math.min(1, 128 / Math.max(source.width, source.height));
  const width = Math.max(1, Math.round(source.width * scale));
  const height = Math.max(1, Math.round(source.height * scale));
  const buffer = await new Promise((resolve, reject) => {
    const child = spawn("ffmpeg", ["-hide_banner", "-loglevel", "error", "-f", "image2pipe", "-i", "pipe:0",
      "-vf", `scale=${width}:${height}:flags=lanczos`, "-c:v", "libwebp", "-quality", "95",
      "-compression_level", "6", "-f", "webp", "pipe:1"], { windowsHide: true });
    const chunks = [], errors = [];
    child.stdout.on("data", chunk => chunks.push(chunk));
    child.stderr.on("data", chunk => errors.push(chunk));
    child.on("error", error => reject(new Error(`特性素材优化需要 ffmpeg/libwebp：${error.message}`)));
    child.on("close", code => code === 0 ? resolve(Buffer.concat(chunks))
      : reject(new Error(`特性素材优化失败：${Buffer.concat(errors).toString("utf8")}`)));
    child.stdin.on("error", reject);
    child.stdin.end(sourceBuffer);
  });
  if (buffer.toString("ascii", 0, 4) !== "RIFF" || buffer.toString("ascii", 8, 12) !== "WEBP") throw new Error("特性素材优化没有生成 WebP");
  return { buffer, width, height, sourceWidth: source.width, sourceHeight: source.height, profile: TRAIT_ICON_PROFILE };
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
      if (!/^\/assets\/traits\/Feature_\d+\.webp$/u.test(record.localUrl) || !/^Feature_\d+\.png$/u.test(record.sourceFile)) throw new Error(`非法特性资源路径：${record.localUrl}`);
      const output = path.join(root, "public", record.localUrl.slice(1));
      const original = path.join(root, "public/assets/traits", record.sourceFile);
      let buffer;
      if (record.profile === TRAIT_ICON_PROFILE && record.bytes > 0 && await exists(output)) buffer = await readFile(output);
      else {
        let sourceBuffer;
        if (await exists(original)) sourceBuffer = await readFile(original);
        else {
          const response = await fetchImpl(record.sourceUrl, { signal: AbortSignal.timeout(20000) });
          if (!response.ok) throw new Error(`特性图片下载 HTTP ${response.status}：${record.sourceFile}`);
          sourceBuffer = Buffer.from(await response.arrayBuffer());
        }
        const optimized = await optimizeTraitIcon(sourceBuffer);
        ({ buffer } = optimized);
        const { buffer: _buffer, ...metadata } = optimized;
        Object.assign(record, metadata);
        await mkdir(path.dirname(output), { recursive: true });
        await writeFile(output, buffer);
      }
      // Only remove the exact replaced trait source, after the usable WebP exists.
      if (await exists(original)) await unlink(original);
      Object.assign(record, { bytes: buffer.length });
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
