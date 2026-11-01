import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { readImageDimensions } from "./sync-assets.mjs";

const EVIDENCE = "data/reviewed/nrc-s5-20261101.json";
const BINDINGS = "data/reviewed/s5-bwiki-assets-20261101.json";
const read = async file => JSON.parse(await readFile(file, "utf8"));
const exists = file => access(file).then(() => true, () => false);
const fileKey = title => title.replace(/^(?:File|文件):/iu, "").replaceAll(" ", "_");

function resolver(snapshot, kind) {
  const entries = snapshot[kind] ?? [];
  return (nrcId, raw) => {
    const name = raw.title ?? raw.name;
    const named = entries.filter(entry => (entry.fullName ?? entry.name) === name);
    // This BWIKI revision reassigned ordinal source IDs. A matching old ID
    // without the same entity name is never a valid identity binding.
    const exact = named.filter(entry => entry.provenance?.nrc?.id === nrcId);
    const matches = exact.length ? exact : named;
    if (matches.length > 1) throw new Error(`本地身份不唯一：${nrcId} ${raw.title ?? raw.name}`);
    return matches[0] ?? null;
  };
}

export function createS5WebAssetPlan(evidence, snapshot, baseSnapshot) {
  const baseIds = new Set((baseSnapshot.spirits ?? []).map(entry => entry.provenance?.nrc?.id));
  const spiritFor = resolver(snapshot, "spirits");
  const skillFor = resolver(snapshot, "skills");
  const spirits = Object.entries(evidence.modules.Catalog).filter(([id]) =>
    evidence.modules.SeasonFeatures?.[id] || !baseIds.has(id),
  ).map(([nrcId, raw]) => {
    if (!/^pet_\d+$/u.test(nrcId) || !raw.image?.head) throw new Error(`头像来源不完整：${nrcId}`);
    return { nrcId, id: spiritFor(nrcId, raw)?.id ?? null, name: raw.title ?? raw.name,
      gameId: raw.game_id ?? null, sourceFile: raw.image.head,
      localUrl: `/assets/spirits/s5-preview/nrc-${nrcId}.png` };
  });
  const skills = Object.entries(evidence.modules.SkillSeasons ?? {})
    .filter(([id, season]) => season === "S5" && evidence.modules.Skills[id]?.category !== "特性")
    .map(([nrcId]) => {
      const raw = evidence.modules.Skills[nrcId];
      if (!/^dc5a_[a-f0-9]+$/u.test(nrcId) || !raw.icon) throw new Error(`技能图标来源不完整：${nrcId}`);
      return { nrcId, id: skillFor(nrcId, raw)?.id ?? null, name: raw.name,
        gameId: raw.game_id ?? null, sourceFile: raw.icon,
        localUrl: `/assets/skills/skill_preview_s5_bwiki_${nrcId}.png` };
    });
  return { schemaVersion: 1, checkedAt: "2026-11-01", evidence: EVIDENCE,
    sources: evidence.moduleSources, spirits, skills };
}

export function mergeS5LineupMapping(mapping, evidence, snapshot) {
  const result = structuredClone(mapping);
  result.skillAliases ??= {};
  result.skillExportIds ??= {};
  const previouslyMappedSkills = new Set(Object.values(mapping.skills));
  const missing = [];
  for (const [kind, records] of [["spirits", evidence.modules.Catalog], ["skills", evidence.modules.Skills]]) {
    const localFor = resolver(snapshot, kind);
    for (const [nrcId, raw] of Object.entries(records)) {
      if (kind === "skills" && raw.category === "特性") continue;
      if (!Number.isSafeInteger(raw.game_id) || raw.game_id <= 0) continue;
      const local = localFor(nrcId, raw);
      if (!local) { missing.push({ kind, nrcId, name: raw.title ?? raw.name, gameId: raw.game_id }); continue; }
      const previous = result[kind][raw.game_id];
      if (previous && previous !== local.id && result.skillAliases[previous] !== local.id) {
        throw new Error(`游戏 ID 冲突：${kind} ${raw.game_id} ${previous} / ${local.id}`);
      }
      result[kind][raw.game_id] = local.id;
      if (kind === "skills" && !result.skillExportIds[local.id] && !previouslyMappedSkills.has(local.id)) {
        result.skillExportIds[local.id] = raw.game_id;
      }
    }
  }
  result.sources.s5Completion = { checkedAt: "2026-11-01", evidence: EVIDENCE,
    sources: { Catalog: evidence.moduleSources.Catalog, Skills: evidence.moduleSources.Skills } };
  return { mapping: result, missing };
}

export async function resolveS5AssetUrls(records, { fetchImpl = fetch } = {}) {
  const filenames = [...new Set(records.map(entry => entry.sourceFile))];
  const urls = new Map();
  for (let start = 0; start < filenames.length; start += 25) {
    const url = new URL("https://wiki.biligame.com/nrc/api.php");
    url.search = new URLSearchParams({ action: "query", format: "json", formatversion: "2",
      prop: "imageinfo", iiprop: "url|size", titles: filenames.slice(start, start + 25).map(name => `File:${name}`).join("|") });
    const response = await fetchImpl(url, { signal: AbortSignal.timeout(20000) });
    if (!response.ok) throw new Error(`BWIKI 图片资料 HTTP ${response.status}`);
    const payload = await response.json();
    for (const page of payload.query?.pages ?? []) {
      const info = page.imageinfo?.[0];
      if (!info?.url) continue;
      const source = new URL(info.url);
      if (source.protocol !== "https:" || source.hostname !== "patchwiki.biligame.com") throw new Error(`图片地址未核验：${page.title}`);
      urls.set(fileKey(page.title), { sourceUrl: info.url, width: info.width, height: info.height });
    }
  }
  return records.map(record => {
    const source = urls.get(fileKey(record.sourceFile));
    if (!source) throw new Error(`BWIKI 图片缺失：${record.name} ${record.sourceFile}`);
    return { ...record, ...source };
  });
}

export async function downloadS5WebAssets(plan, { root = process.cwd(), previous, fetchImpl = fetch } = {}) {
  const previousAssets = [...(previous?.spirits ?? []), ...(previous?.skills ?? [])];
  const records = await resolveS5AssetUrls([...plan.spirits, ...plan.skills], { fetchImpl });
  const completed = [];
  for (let start = 0; start < records.length; start += 4) {
    completed.push(...await Promise.all(records.slice(start, start + 4).map(async record => {
      if (!/^\/assets\/(?:spirits\/s5-preview\/nrc-pet_\d+|skills\/skill_preview_s5_bwiki_dc5a_[a-f0-9]+)\.png$/u.test(record.localUrl)) {
        throw new Error(`非本轮 Web 资源路径：${record.localUrl}`);
      }
      const output = path.join(root, "public", record.localUrl.slice(1));
      const reused = previousAssets.find(entry => entry.sourceFile === record.sourceFile && entry.sourceUrl === record.sourceUrl && entry.localUrl === record.localUrl);
      let buffer;
      if (reused && await exists(output)) buffer = await readFile(output);
      else {
        const response = await fetchImpl(record.sourceUrl, { signal: AbortSignal.timeout(20000) });
        if (!response.ok) throw new Error(`图片下载 HTTP ${response.status}：${record.name}`);
        buffer = Buffer.from(await response.arrayBuffer());
        readImageDimensions(buffer);
        await mkdir(path.dirname(output), { recursive: true });
        await writeFile(output, buffer);
      }
      // Preserve the exact source pixels and alpha; no resizing or redrawing.
      return { ...record, ...readImageDimensions(buffer), bytes: buffer.length };
    })));
  }
  const byId = new Map(completed.map(entry => [entry.nrcId, entry]));
  return { ...plan, spirits: plan.spirits.map(entry => byId.get(entry.nrcId)), skills: plan.skills.map(entry => byId.get(entry.nrcId)) };
}

async function main() {
  const argument = key => process.argv.find(value => value.startsWith(`${key}=`))?.slice(key.length + 1);
  const evidence = await read(EVIDENCE);
  const base = await read("data/snapshots/current.json");
  const snapshotPath = argument("--snapshot");
  const snapshot = snapshotPath ? await read(snapshotPath) : base;
  let plan = createS5WebAssetPlan(evidence, snapshot, base);
  if (process.argv.includes("--assets")) {
    const previous = await exists(BINDINGS) ? await read(BINDINGS) : null;
    plan = await downloadS5WebAssets(plan, { previous });
    await writeFile(BINDINGS, `${JSON.stringify(plan, null, 2)}\n`, "utf8");
  }
  let mapping;
  if (process.argv.includes("--mapping")) {
    if (!snapshotPath) throw new Error("更新阵容码必须提供本轮完整 --snapshot");
    mapping = mergeS5LineupMapping(await read("public/data/lineup-code-map.json"), evidence, snapshot);
    if (mapping.missing.length) throw new Error(`阵容码仍有 ${mapping.missing.length} 项本地身份缺失：${JSON.stringify(mapping.missing)}`);
    await writeFile("public/data/lineup-code-map.json", `${JSON.stringify(mapping.mapping, null, 2)}\n`, "utf8");
  }
  console.log(JSON.stringify({ spirits: plan.spirits.length, skills: plan.skills.length,
    unresolvedIdentities: [...plan.spirits, ...plan.skills].filter(entry => !entry.id).length,
    bindings: process.argv.includes("--assets") ? BINDINGS : null,
    lineupMapping: mapping ? { spirits: Object.keys(mapping.mapping.spirits).length, skills: Object.keys(mapping.mapping.skills).length } : null }));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
