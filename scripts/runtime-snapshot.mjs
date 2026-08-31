#!/usr/bin/env node
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { pinyin } from "pinyin-pro";

const AUDIT_ONLY_KEYS = new Set([
  "acquisitions",
  "actualFingerprint",
  "asset",
  "assetSources",
  "contentSha256",
  "detailUrl",
  "diff",
  "fetchedAt",
  "provenance",
  "reviewedOverrideIds",
  "source",
  "sources",
]);

function compact(value) {
  return String(value ?? "")
    .normalize("NFKC")
    .toLocaleLowerCase("zh-CN")
    .replace(/[\s·（）()_\-/]+/g, "");
}

function pinyinParts(value) {
  return pinyin(String(value ?? ""), {
    toneType: "none",
    type: "array",
  }).filter((part) => /[a-z]/i.test(part));
}

function withoutFormSuffix(value) {
  return String(value ?? "").replace(/[（(][^）)]*[）)]/gu, "");
}

function createSpiritNameResolver(spirits) {
  const exact = new Map();
  const aliases = new Map();
  for (const spirit of spirits) {
    exact.set(compact(spirit.fullName), spirit.id);
    for (const alias of [
      spirit.baseName,
      withoutFormSuffix(spirit.fullName),
    ]) {
      const key = compact(alias);
      if (!key) continue;
      if (!aliases.has(key)) aliases.set(key, spirit.id);
      else if (aliases.get(key) !== spirit.id) aliases.set(key, null);
    }
  }
  return (name) => exact.get(compact(name)) ?? aliases.get(compact(withoutFormSuffix(name))) ?? null;
}

function stripAuditFields(value) {
  if (Array.isArray(value)) return value.map(stripAuditFields);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => !AUDIT_ONLY_KEYS.has(key))
      .map(([key, entry]) => [key, stripAuditFields(entry)]),
  );
}

function prepareSpirit(spirit, resolveSpiritId, localAssetById) {
  const nameParts = pinyinParts(
    [spirit.fullName, spirit.variantName].filter(Boolean).join(" "),
  );
  const stripped = stripAuditFields(spirit);
  const { evolutionChainNames, ...runtimeSpirit } = stripped;
  const evolutionChainIds = [
    ...new Set(
      (evolutionChainNames ?? [])
        .map(resolveSpiritId)
        .filter(Boolean),
    ),
  ];
  if (
    evolutionChainIds.length > 0 &&
    !evolutionChainIds.includes(spirit.id)
  ) {
    evolutionChainIds.push(spirit.id);
  }
  return {
    ...runtimeSpirit,
    ...(localAssetById.get(spirit.id)
      ? { asset: { localUrl: localAssetById.get(spirit.id) } }
      : {}),
    ...(evolutionChainIds.length > 1 ? { evolutionChainIds } : {}),
    initials: nameParts.map((part) => part[0]).join(""),
    pinyin: nameParts.join(""),
  };
}

function prepareSkill(skill) {
  const nameParts = pinyinParts(skill.name);
  const iconUrl = typeof skill.asset?.sourceUrl === "string" &&
    /^https:\/\//u.test(skill.asset.sourceUrl)
    ? skill.asset.sourceUrl
    : null;
  const searchText = [
    skill.name,
    skill.type,
    skill.category,
    nameParts.join(""),
    nameParts.map((part) => part[0]).join(""),
  ]
    .map(compact)
    .join("|");
  return {
    ...stripAuditFields(skill),
    ...(iconUrl ? { iconUrl } : {}),
    searchText,
  };
}

export function buildRuntimeSnapshot(snapshot, assetManifest = null) {
  const resolveSpiritId = createSpiritNameResolver(snapshot.spirits ?? []);
  const localAssetById = new Map(
    (assetManifest?.assets ?? [])
      .filter((asset) => asset?.id && asset?.localFile)
      .map((asset) => [asset.id, asset.localFile]),
  );
  return {
    meta: stripAuditFields(snapshot.meta ?? {}),
    spirits: (snapshot.spirits ?? []).map((spirit) =>
      prepareSpirit(spirit, resolveSpiritId, localAssetById),
    ),
    skills: (snapshot.skills ?? []).map(prepareSkill),
    learnsets: (snapshot.learnsets ?? []).map(({ spiritId, skillIds }) => ({
      spiritId,
      skillIds,
    })),
    traits: (snapshot.traits ?? []).map(stripAuditFields),
    typeChart: stripAuditFields(snapshot.typeChart ?? null),
  };
}

export function writeRuntimeSnapshot(sourcePath, targetPath, manifestPath = null) {
  const snapshot = JSON.parse(readFileSync(sourcePath, "utf8"));
  const assetManifest = manifestPath
    ? JSON.parse(readFileSync(manifestPath, "utf8"))
    : null;
  const runtime = buildRuntimeSnapshot(snapshot, assetManifest);
  mkdirSync(path.dirname(targetPath), { recursive: true });
  writeFileSync(targetPath, JSON.stringify(runtime), "utf8");
  return runtime;
}

const [sourcePath, targetPath, manifestPath] = process.argv.slice(2);
if (!sourcePath || !targetPath) {
  throw new TypeError(
    "Usage: node scripts/runtime-snapshot.mjs <source.json> <target.json>",
  );
}

const runtime = writeRuntimeSnapshot(sourcePath, targetPath, manifestPath);
console.log(
  `runtime spirits=${runtime.spirits.length} skills=${runtime.skills.length}`,
);
