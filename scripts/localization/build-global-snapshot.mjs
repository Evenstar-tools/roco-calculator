import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { applyS3MidseasonBalance } from "../bwiki/apply-s3-midseason-balance.mjs";
import { buildRuntimeSnapshot } from "../runtime-snapshot.mjs";
import { S3_MIDSEASON_RULESET } from "../../src/domain/season-rules.js";
import { localizeGlobalCatalog } from "../../src/runtime/global-entity-localization.js";
import { withCalculatorExtras } from "../../src/data/snapshot-extras.js";
import { familyIds, unpackCatalog } from "../../src/features/skill-query/catalog.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
export const GLOBAL_BASELINE_VERSION = "global-s3-midseason-2026-08-13";
const PREFIX = "cn-placeholder:"; // Existing Global save/share IDs stay valid.
const sourcePath = "data/snapshots/seasons/s3-2026-07-15.json";
const read = async (relative) => JSON.parse(await readFile(path.join(ROOT, relative), "utf8"));

function remap(value, ids) {
  if (typeof value === "string") return ids.get(value) ?? value;
  if (Array.isArray(value)) return value.map((entry) => remap(entry, ids));
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value).map(([key, entry]) => [ids.get(key) ?? key, remap(entry, ids)]));
}

export function buildGlobalSnapshot(s3Opening) {
  if (s3Opening.meta?.id !== "s3-2026-07-15") throw new Error("Global baseline requires the explicit S3 opening snapshot");
  const midseason = withCalculatorExtras(applyS3MidseasonBalance(s3Opening));
  const entities = [...midseason.spirits, ...midseason.skills, ...midseason.traits];
  const ids = new Map(entities.map(({ id }) => [id, PREFIX + id]));
  if (ids.size !== entities.length) throw new Error("Duplicate baseline entity ID");
  const snapshot = remap(midseason, ids);
  snapshot.meta = {
    ...snapshot.meta, serverId: "global", id: GLOBAL_BASELINE_VERSION,
    dataVersion: GLOBAL_BASELINE_VERSION, rulesVersion: GLOBAL_BASELINE_VERSION,
    seasonId: "S3", status: "verified", canonicalLocale: "zh-CN",
    calculationBaseline: { serverId: "cn", id: midseason.meta.id, rulesVersion: midseason.meta.rulesVersion,
      adoption: "user-approved-s3-midseason", sourcePath,
      patchModule: "scripts/bwiki/apply-s3-midseason-balance.mjs" },
    clientTextVersion: "1.61.0.91",
  };
  delete snapshot.meta.contentSha256;
  for (const [kind, originals] of [["spirits", midseason.spirits], ["skills", midseason.skills], ["traits", midseason.traits]]) {
    snapshot[kind] = snapshot[kind].map((entry, index) => ({ ...entry, calculationRuleset: S3_MIDSEASON_RULESET, reference: { sourceId: originals[index].id } }));
  }
  const display = localizeGlobalCatalog(snapshot, "zh-CN");
  for (const kind of ["spirits", "skills"]) snapshot[kind] = snapshot[kind].map((entity, index) => ({
    ...entity, aliases: display[kind][index].aliases ?? [],
    ...(kind === "skills" ? { searchText: display[kind][index].searchText ?? "" } : {}),
  }));
  const spiritIds = new Set(snapshot.spirits.map(({ id }) => id));
  const skillIds = new Set(snapshot.skills.map(({ id }) => id));
  const traitIds = new Set(snapshot.traits.map(({ id }) => id));
  if (snapshot.spirits.some((spirit) => spirit.traitIds.some((id) => !traitIds.has(id))) ||
      snapshot.learnsets.some((entry) => !spiritIds.has(entry.spiritId) || entry.skillIds.some((id) => !skillIds.has(id)))) {
    throw new Error("Global remapping contains a dangling entity reference");
  }
  return snapshot;
}

// Same schema/transport format as the existing query catalog; one adopted baseline.
export function buildGlobalSkillQueryCatalog(snapshot, runtime) {
  const families = familyIds(snapshot.spirits);
  const skillIds = new Map(snapshot.skills.map(({ id }, index) => [id, index]));
  const spiritIds = new Map(snapshot.spirits.map(({ id }, index) => [id, index]));
  const runtimeSpirits = new Map(runtime.spirits.map((spirit) => [spirit.id, spirit]));
  const runtimeSkills = new Map(runtime.skills.map((skill) => [skill.id, skill]));
  const methodTexts = [];
  const methodIds = new Map();
  const intern = (text) => {
    if (!methodIds.has(text)) { methodIds.set(text, methodTexts.length); methodTexts.push(text); }
    return methodIds.get(text);
  };
  const season = {
    id: "S3", methodTexts,
    spirits: snapshot.spirits.map((spirit) => {
      const view = runtimeSpirits.get(spirit.id);
      return { id: spirit.id, fullName: spirit.fullName, baseName: spirit.baseName, variantName: spirit.variantName,
        types: spirit.types, stage: spirit.stage, familyId: families.get(spirit.id),
        asset: view.asset, reference: spirit.reference, aliases: view.aliases, pinyin: view.pinyin, initials: view.initials };
    }),
    skills: snapshot.skills.map((skill) => ({ id: skill.id, name: skill.name, type: skill.type, category: skill.category,
      cost: skill.cost, basePower: skill.basePower, description: skill.description, introducedSeason: null,
      reference: skill.reference, iconUrl: runtimeSkills.get(skill.id).iconUrl, searchText: runtimeSkills.get(skill.id).searchText })),
    relations: snapshot.learnsets.map((entry) => [spiritIds.get(entry.spiritId), entry.skillIds.map((id) =>
      [skillIds.get(id), ...(entry.acquisitions?.[id] ?? []).map(intern)])]),
  };
  const catalog = { schemaVersion: 1, serverId: "global", dataVersion: GLOBAL_BASELINE_VERSION,
    rulesVersion: GLOBAL_BASELINE_VERSION, currentSeason: "S3", seasons: [season] };
  const readback = unpackCatalog(catalog);
  if (readback.seasons[0].learnsets.length !== snapshot.learnsets.length || readback.seasons[0].learnsets.some((entry, index) =>
    entry.spiritId !== snapshot.learnsets[index].spiritId || JSON.stringify(entry.skillIds) !== JSON.stringify(snapshot.learnsets[index].skillIds))) {
    throw new Error("Global query transport does not preserve learning relations");
  }
  return catalog;
}

export function buildGlobalPopularPresets(source, snapshot) {
  const entityIds = new Map([...snapshot.spirits, ...snapshot.skills, ...snapshot.traits]
    .map((entity) => [entity.reference.sourceId, entity.id]));
  const excluded = [];
  const entries = [];
  const references = (value) => {
    if (typeof value === "string") return /^(?:spirit_|skill_|trait_|calculator_wish_power_)/u.test(value) ? [value] : [];
    if (Array.isArray(value)) return value.flatMap(references);
    if (!value || typeof value !== "object") return [];
    return Object.entries(value).flatMap(([key, entry]) => [...references(key), ...references(entry)]);
  };
  for (const [index, entry] of source.entries.entries()) {
    const missing = [...new Set(references(entry).filter((id) => !entityIds.has(id)))];
    if (missing.length) excluded.push({ index, spiritId: entry.spiritId, missingReferences: missing });
    else entries.push(remap(entry, entityIds));
  }
  return {
    library: { ...source, serverId: "global", versions: { data: GLOBAL_BASELINE_VERSION, rules: GLOBAL_BASELINE_VERSION },
      entryCount: entries.length, entries },
    audit: { baseline: GLOBAL_BASELINE_VERSION, source: "public/data/presets/pvp-popular-configs.json",
      included: entries.length, excluded },
  };
}

async function main() {
  const baseline = await read(sourcePath);
  const manifest = await read("public/assets/spirits/manifest.json");
  const snapshot = buildGlobalSnapshot(baseline);
  const manifestGlobal = { ...manifest, assets: manifest.assets.map((entry) => ({ ...entry, id: PREFIX + entry.id })) };
  const runtime = buildRuntimeSnapshot(snapshot, manifestGlobal);
  // Runtime preparation builds a CN search string; retain all official language aliases as well.
  runtime.skills = runtime.skills.map((skill) => ({ ...skill,
    searchText: [skill.searchText, ...(skill.aliases ?? [])].filter(Boolean).join(" ") }));
  const catalog = buildGlobalSkillQueryCatalog(snapshot, runtime);
  const presets = buildGlobalPopularPresets(await read("public/data/presets/pvp-popular-configs.json"), snapshot);
  const outputs = [
    ["data/snapshots/global/s3-midseason.json", snapshot],
    ["public/data/global-runtime.json", runtime],
    ["public/data/global/skill-query/catalog.json", catalog],
    ["public/data/global/presets/pvp-popular-configs.json", presets.library],
    ["data/localization/global/popular-presets-audit.json", presets.audit],
  ];
  const checkOnly = process.argv.includes("--check");
  for (const [target, value] of outputs) {
    const destination = path.join(ROOT, target);
    const content = JSON.stringify(value) + "\n";
    if (!checkOnly) { await mkdir(path.dirname(destination), { recursive: true }); await writeFile(destination, content, "utf8"); }
    if (await readFile(destination, "utf8") !== content) throw new Error(`Stale Global data: ${target}`);
  }
  console.log(JSON.stringify({ version: GLOBAL_BASELINE_VERSION, spirits: snapshot.spirits.length,
    skills: snapshot.skills.length, traits: snapshot.traits.length, learnsets: snapshot.learnsets.length, checkOnly }));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
