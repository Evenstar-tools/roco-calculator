import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { deflateRawSync } from "node:zlib";
import { loadMiniappReleaseData } from "./release-source.mjs";
import { buildCommonSpiritConfig } from "./build-common-spirit-config.mjs";

const scriptPath = fileURLToPath(import.meta.url);
const projectRoot = path.resolve(path.dirname(scriptPath), "../..");
const outputPath = path.join(
  projectRoot,
  "miniapp/src/data/bundled-runtime.json",
);
const compressedOutputPath = path.join(
  projectRoot,
  "miniapp/src/data/bundled-runtime.payload.js",
);
const PUBLIC_SITE_ORIGIN = "https://rococalc.top";
const LOCAL_ASSET_PATTERN = /^\/assets\/(?:skills|spirits)\/[a-zA-Z0-9_./-]+\.(?:png|webp|jpe?g)$/u;

function miniappSkillIconUrl(value) {
  return typeof value === "string" && LOCAL_ASSET_PATTERN.test(value) && !value.includes("..")
    ? `${PUBLIC_SITE_ORIGIN}${value}`
    : value;
}

function displayedChangeInfo(changeInfo) {
  if (!changeInfo) return undefined;
  // EntityChangeHint renders the selected patch and its items, never the Web
  // history timeline. Keep current details; omit only the unrendered archive.
  const { history: _history, ...displayed } = changeInfo;
  return displayed;
}

const { runtime, presets, source, sourceRevision } = await loadMiniappReleaseData({ root: projectRoot });
const manifest = JSON.parse(readFileSync(path.join(source, "public/assets/spirits/manifest.json"), "utf8"));
const imageUrls = new Map(
  (manifest.assets ?? []).map((asset) => [asset.id, asset.sourceUrl]),
);

const spirits = runtime.spirits.map((spirit) => {
  const localImage = spirit.asset?.localUrl ?? spirit.imageUrl;
  // WeChat/Android image cannot rely on Web's SVG silhouette. Keep the native
  // missing-portrait fallback for explicitly incomplete catalog entries.
  const imageUrl = localImage?.endsWith(".svg") ? undefined
    : miniappSkillIconUrl(localImage) ?? imageUrls.get(spirit.id);
  const isPreviewEntry = spirit.changeInfo?.isNew === true &&
    spirit.changeInfo?.patch?.status === "preview" ||
    Boolean(spirit.previewIdentity && spirit.calculationStatus?.startsWith("pending-"));
  if (!isPreviewEntry && !/^https:\/\//u.test(imageUrl ?? "")) {
    throw new Error(`精灵 ${spirit.id} 缺少可用的 HTTPS 图片地址`);
  }
  const raceStats = spirit.raceStats
    ? {
        hp: spirit.raceStats.hp,
        speed: spirit.raceStats.speed,
        physicalAttack: spirit.raceStats.physicalAttack,
        magicalAttack: spirit.raceStats.magicalAttack,
        physicalDefense: spirit.raceStats.physicalDefense,
        magicalDefense: spirit.raceStats.magicalDefense,
      }
    : null;
  return {
    id: spirit.id,
    baseName: spirit.baseName,
    variantName: spirit.variantName,
    fullName: spirit.fullName,
    dexNo: spirit.dexNo,
    stage: spirit.stage,
    sourceCategory: spirit.sourceCategory,
    source: spirit.source,
    ...(spirit.formRole ? { formRole: spirit.formRole } : {}),
    ...(spirit.formRoleEvidence ? { formRoleEvidence: spirit.formRoleEvidence } : {}),
    ...(spirit.evolutionFamilyId ? { evolutionFamilyId: spirit.evolutionFamilyId } : {}),
    ...(spirit.catalogAvailable === false ? { catalogAvailable: false } : {}),
    ...(spirit.provenance?.nrc?.id ? { provenance: { nrc: { id: spirit.provenance.nrc.id } } } : {}),
    searchText: spirit.searchText,
    types: spirit.types,
    raceStats,
    ...(spirit.calculationStatus
      ? { calculationStatus: spirit.calculationStatus }
      : {}),
    ...(spirit.previewIdentity ? { previewIdentity: spirit.previewIdentity } : {}),
    ...(spirit.previewDefaults
      ? {
          previewDefaults: spirit.previewDefaults,
        }
      : {}),
    traitIds: spirit.traitIds,
    traitName: spirit.traitName,
    traitDescription: spirit.traitDescription,
    evolutionChainIds: spirit.evolutionChainIds,
    initials: spirit.initials,
    pinyin: spirit.pinyin,
    ...(Array.isArray(spirit.aliases) && spirit.aliases.length > 0
      ? { aliases: spirit.aliases }
      : {}),
    ...(imageUrl ? { imageUrl } : {}),
    ...(spirit.changeInfo ? { changeInfo: displayedChangeInfo(spirit.changeInfo) } : {}),
  };
});

const skills = runtime.skills.map((skill) => {
  const iconUrl = miniappSkillIconUrl(skill.iconUrl);
  return {
    ...skill,
    ...(skill.changeInfo ? { changeInfo: displayedChangeInfo(skill.changeInfo) } : {}),
    ...(iconUrl ? { iconUrl } : {}),
    searchText: String(skill.searchText ?? "")
      .split("|")
      .slice(-2)
      .join("|"),
  };
});

const skillIndexById = new Map(
  skills.map((skill, index) => [skill.id, index]),
);
const learnsetBySpiritId = new Map(
  runtime.learnsets.map((learnset) => [learnset.spiritId, learnset]),
);
function skillIdsToIndexes(skillIds) {
  return skillIds.map((skillId) => {
    const skillIndex = skillIndexById.get(skillId);
    if (skillIndex == null) {
      throw new Error(`技能表引用不存在的技能 ${skillId}`);
    }
    return skillIndex;
  });
}

const learnsetSkillIndexes = spirits.map((spirit) => {
  const learnset = learnsetBySpiritId.get(spirit.id);
  if (!learnset) throw new Error(`精灵 ${spirit.id} 缺少技能表`);
  return skillIdsToIndexes(learnset.skillIds);
});
const defaultSkillIndexes = Object.fromEntries(
  spirits.flatMap((spirit, spiritIndex) => {
    const defaultSkillIds = learnsetBySpiritId.get(spirit.id)?.defaultSkillIds;
    return Array.isArray(defaultSkillIds)
      ? [[spiritIndex, skillIdsToIndexes(defaultSkillIds)]]
      : [];
  }),
);
const learnsetMetadata = Object.fromEntries(spirits.flatMap((spirit, index) => {
  const { spiritId: _spiritId, skillIds: _skillIds, defaultSkillIds: _defaults, ...metadata } =
    learnsetBySpiritId.get(spirit.id);
  return Object.keys(metadata).length ? [[index, metadata]] : [];
}));

const { learnsets: _learnsets, ...runtimeWithoutLearnsets } = runtime;

const bundledRuntime = {
  ...runtimeWithoutLearnsets,
  meta: { ...runtime.meta, miniappSourceRevision: sourceRevision },
  ...(Object.keys(defaultSkillIndexes).length > 0 ? { defaultSkillIndexes } : {}),
  ...(Object.keys(learnsetMetadata).length > 0 ? { learnsetMetadata } : {}),
  learnsetSkillIndexes,
  skills,
  spirits,
};
const output = `${JSON.stringify(bundledRuntime)}\n`;
writeFileSync(outputPath, output, "utf8");
const compressedOutput = `export default ${JSON.stringify(
  deflateRawSync(Buffer.from(output.trim(), "utf8"), { level: 9 }).toString(
    "base64",
  ),
)};\n`;
writeFileSync(compressedOutputPath, compressedOutput, "utf8");
await buildCommonSpiritConfig(presets, path.join(projectRoot, "miniapp/src/data/common-spirit-config.json"));
process.stdout.write(
  `Built bundled miniapp runtime with ${spirits.length} portraits (${Buffer.byteLength(output)} raw bytes, ${Buffer.byteLength(compressedOutput)} compressed bytes).\n`,
);
