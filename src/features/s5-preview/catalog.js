import { hasCompleteRaceStats } from "../../domain/stat.js";
import { ELEMENT_TYPES } from "../../domain/type-chart.js";

export const S5_PREVIEW_ASSET_URL = "/assets/spirits/s5-preview-silhouette.svg";
export const S5_PREVIEW_TEST_STATS = Object.freeze({
  hp: 100, physicalAttack: 100, magicalAttack: 100,
  physicalDefense: 100, magicalDefense: 100, speed: 100, total: 600,
});

const KEY_PATTERN = /^[a-z0-9][a-z0-9_-]*$/u;
const text = (value) => typeof value === "string" && value.trim().length > 0;
const require = (condition, message) => {
  if (!condition) throw new TypeError(`S5 前瞻目录：${message}`);
};

function localAssetPath(value) {
  return text(value) && value.startsWith("/assets/") &&
    value.split("/").slice(1).every((part) =>
      /^[a-zA-Z0-9_.-]+$/u.test(part) && part !== "." && part !== "..");
}

function httpsUrl(value) {
  if (!text(value)) return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && Boolean(url.hostname);
  } catch {
    return false;
  }
}

export function s5PreviewIds(key) {
  require(typeof key === "string" && KEY_PATTERN.test(key), "候选 key 无效");
  return {
    spiritId: `spirit_preview_s5_${key}`,
    traitId: `trait_preview_s5_${key}`,
  };
}

export function validateS5PreviewCatalog(catalog) {
  require(text(catalog?.catalogId), "缺少 catalogId");
  require(text(catalog?.source?.url) && /^https:\/\//u.test(catalog.source.url), "缺少 HTTPS 来源 URL");
  require(catalog.source.bvid === undefined || text(catalog.source.bvid), "来源 bvid 无效");
  require(Array.isArray(catalog?.entries), "缺少 entries");
  const keys = new Set();
  const names = new Set();
  for (const entry of catalog.entries) {
    s5PreviewIds(entry?.key);
    require(!keys.has(entry.key), `候选 key 重复：${entry.key}`);
    keys.add(entry.key);
    require(text(entry.name) && !names.has(entry.name), `名称缺失或重复：${entry.name ?? entry.key}`);
    names.add(entry.name);
    require(["family", "boss"].includes(entry.kind), `${entry.key} 的 kind 无效`);
    require(entry.baseName === undefined || text(entry.baseName), `${entry.key} 的 baseName 无效`);
    require(text(entry.traitSummary), `${entry.key} 缺少已核实特性摘要`);
    require(text(entry.mechanicKey), `${entry.key} 缺少 mechanicKey`);
    require(entry.types === undefined || Array.isArray(entry.types) && entry.types.length <= 2 &&
      new Set(entry.types).size === entry.types.length && entry.types.every((type) => ELEMENT_TYPES.includes(type)),
    `${entry.key} 的属性无效`);
    if (entry.evidence?.kind === "official-image") {
      require(httpsUrl(entry.evidence.url) && text(entry.evidence.frame), `${entry.key} 缺少官方图片来源及证据图`);
    } else {
      require(typeof entry.evidence?.seconds === "number" && Number.isFinite(entry.evidence.seconds) &&
        entry.evidence.seconds >= 0 && text(entry.evidence.frame), `${entry.key} 缺少视频时间及证据帧`);
    }
    require(Array.isArray(entry.unknowns) && entry.unknowns.every(text), `${entry.key} 的 unknowns 无效`);
    if (entry.asset !== undefined) {
      require(localAssetPath(entry.asset?.localUrl), `${entry.key} 的素材必须使用项目内 assets 路径`);
      require(["reference-silhouette", "official-silhouette", "official-portrait"].includes(entry.asset.kind) && httpsUrl(entry.asset.sourceUrl) &&
        text(entry.asset.sourceFrame), `${entry.key} 的素材缺少 HTTPS 来源及证据帧`);
    }
  }
  return catalog;
}

function ownsPreview(entity, catalogId, key) {
  return entity?.previewIdentity?.catalogId === catalogId && entity.previewIdentity.key === key;
}

/** Web/Windows display overlay. It does not publish a data/rule version or infer combat data. */
export function withS5PreviewCatalog(snapshot, catalog, { assetUrl = S5_PREVIEW_ASSET_URL, useTestRaceStats = false } = {}) {
  validateS5PreviewCatalog(catalog);
  require((snapshot?.meta?.serverId ?? snapshot?.serverId ?? "cn") === "cn", "仅适用于国服参考快照");
  require(["spirits", "traits", "skills", "learnsets"].every((key) => Array.isArray(snapshot?.[key])), "快照集合不完整");
  require(localAssetPath(assetUrl), "剪影必须使用项目内 assets 路径");
  const spirits = [...snapshot.spirits];
  const traits = [...snapshot.traits];
  const learnsets = [...snapshot.learnsets];
  let changed = false;
  for (const entry of catalog.entries) {
    const { spiritId, traitId } = s5PreviewIds(entry.key);
    const existing = spirits.find(({ id }) => id === spiritId);
    const existingTrait = traits.find(({ id }) => id === traitId);
    const existingLearnset = learnsets.find(({ spiritId: id }) => id === spiritId);
    const named = spirits.filter(({ fullName }) => fullName === entry.name);
    require(named.length <= 1, `同名精灵不唯一：${entry.name}`);
    // Exact full names keep a boss candidate separate from its ordinary base.
    const formal = named[0] && hasCompleteRaceStats(named[0].raceStats) &&
      named[0].calculationStatus !== "pending-race-stats" && !named[0].previewIdentity?.formalIdPending;
    if (formal) {
      require(!existing || existing === named[0], `精灵 ID 冲突：${spiritId}`);
      require(!existingTrait || named[0].traitIds?.includes(traitId), `特性 ID 冲突：${traitId}`);
      continue;
    }
    require(!existing || ownsPreview(existing, catalog.catalogId, entry.key), `精灵 ID 冲突：${spiritId}`);
    require(!existingTrait || ownsPreview(existingTrait, catalog.catalogId, entry.key), `特性 ID 冲突：${traitId}`);
    require(!named[0] || named[0] === existing, `同名精灵尚未正式确认：${entry.name}`);
    if (existing) {
      const pendingStats = existing.raceStats === null && existing.calculationStatus === "pending-race-stats";
      const testStats = existing.previewIdentity.raceStatsPlaceholder === true &&
        existing.calculationStatus === "pending-s5-mechanics" && Object.entries(S5_PREVIEW_TEST_STATS)
          .every(([key, value]) => existing.raceStats?.[key] === value);
      require(existing.fullName === entry.name && (pendingStats || testStats) && existingTrait &&
        existingLearnset?.skillIds?.length === 0, `候选记录已漂移：${entry.key}`);
      const typesChanged = JSON.stringify(existing.types) !== JSON.stringify(entry.types ?? []);
      const typesProvenance = entry.types?.length ? catalog.typesProvenance : undefined;
      if (typesChanged || JSON.stringify(existing.previewIdentity.typesProvenance) !== JSON.stringify(typesProvenance) ||
        existing.previewIdentity.mechanicKey !== entry.mechanicKey ||
        existing.traitDescription !== entry.traitSummary || Boolean(existing.previewIdentity.raceStatsPlaceholder) !== useTestRaceStats || entry.asset && (existing.asset?.localUrl !== entry.asset.localUrl ||
        ["localUrl", "kind", "sourceUrl", "sourceFrame"].some((key) =>
          existing.previewIdentity.asset?.[key] !== entry.asset[key]))) {
        spirits[spirits.indexOf(existing)] = {
          ...existing, types: [...(entry.types ?? [])], traitDescription: entry.traitSummary,
          raceStats: useTestRaceStats ? { ...S5_PREVIEW_TEST_STATS } : null,
          calculationStatus: useTestRaceStats ? "pending-s5-mechanics" : "pending-race-stats",
          ...(entry.asset ? { asset: { ...existing.asset, localUrl: entry.asset.localUrl } } : {}),
          previewIdentity: { ...existing.previewIdentity, mechanicKey: entry.mechanicKey, raceStatsPlaceholder: useTestRaceStats,
            typesProvenance: typesProvenance ? { ...typesProvenance } : undefined,
            ...(entry.asset ? { asset: { ...entry.asset } } : {}) },
        };
        changed = true;
      }
      // Existing local overlays may predate the interactive trait adapter.
      // Upgrade its metadata without changing the stable spirit/trait IDs.
      if (existingTrait.previewIdentity?.mechanicKey !== entry.mechanicKey ||
        existingTrait.description !== entry.traitSummary) {
        traits[traits.indexOf(existingTrait)] = {
          ...existingTrait, description: entry.traitSummary,
          previewIdentity: { ...existingTrait.previewIdentity, mechanicKey: entry.mechanicKey },
        };
        changed = true;
      }
      continue;
    }
    require(!existingTrait && !existingLearnset, `候选 ID 存在孤立记录：${entry.key}`);
    const previewIdentity = {
      catalogId: catalog.catalogId, key: entry.key, kind: entry.kind,
      formalIdPending: true, mechanicKey: entry.mechanicKey,
      source: entry.evidence.kind === "official-image"
        ? { url: entry.evidence.url, authority: "official-image" } : { ...catalog.source },
      evidence: { ...entry.evidence },
      unknowns: [...entry.unknowns],
      raceStatsPlaceholder: useTestRaceStats,
      ...(entry.types?.length && catalog.typesProvenance ? { typesProvenance: { ...catalog.typesProvenance } } : {}),
      ...(entry.asset ? { asset: { ...entry.asset } } : {}),
    };
    spirits.push({
      id: spiritId, fullName: entry.name, baseName: entry.baseName ?? entry.name,
      variantName: null, dexNo: null, types: [...(entry.types ?? [])],
      stage: entry.kind === "boss" ? "首领" : "前瞻", sourceCategory: "S5前瞻",
      raceStats: useTestRaceStats ? { ...S5_PREVIEW_TEST_STATS } : null,
      calculationStatus: useTestRaceStats ? "pending-s5-mechanics" : "pending-race-stats",
      traitIds: [traitId], traitName: "前瞻特性", traitDescription: entry.traitSummary,
      asset: { localUrl: entry.asset?.localUrl ?? assetUrl }, previewIdentity,
    });
    traits.push({
      id: traitId, name: "前瞻特性", description: entry.traitSummary,
      provenance: { previewStatus: { adaptationStatus: "description-only" } },
      previewIdentity: { catalogId: catalog.catalogId, key: entry.key, formalIdPending: true,
        mechanicKey: entry.mechanicKey },
    });
    learnsets.push({ spiritId, skillIds: [], defaultSkillIds: [] });
    changed = true;
  }
  return changed ? { ...snapshot, spirits, traits, learnsets } : snapshot;
}

/** Explicit reviewed handoff only; no fuzzy matching, state rewriting or NRC importer changes. */
export function createReviewedS5PreviewIdMap(catalog, formalSnapshot, review) {
  validateS5PreviewCatalog(catalog);
  require((formalSnapshot?.meta?.serverId ?? formalSnapshot?.serverId ?? "cn") === "cn", "正式映射须使用国服数据");
  require(review?.status === "reviewed" && review.catalogId === catalog.catalogId,
    "正式映射尚未审核或目录身份不符");
  require(Array.isArray(review.mappings), "正式映射缺少 mappings");
  const keys = new Set(catalog.entries.map(({ key }) => key));
  const seen = new Set();
  const targets = new Set();
  const spiritIds = {};
  const traitIds = {};
  for (const mapping of review.mappings) {
    require(keys.has(mapping?.key) && !seen.has(mapping.key), `正式映射 key 未知或重复：${mapping?.key}`);
    seen.add(mapping.key);
    const matches = (formalSnapshot?.spirits ?? []).filter(({ id }) => id === mapping.spiritId);
    const formal = matches[0];
    require(matches.length === 1 && hasCompleteRaceStats(formal.raceStats) &&
      formal.calculationStatus !== "pending-race-stats" && !formal.previewIdentity?.formalIdPending,
    `正式映射目标尚未确认：${mapping.spiritId}`);
    require(!targets.has(formal.id), `多个候选映射到同一精灵：${formal.id}`);
    targets.add(formal.id);
    const previous = s5PreviewIds(mapping.key);
    spiritIds[previous.spiritId] = formal.id;
    if (mapping.traitId !== undefined) {
      const trait = (formalSnapshot.traits ?? []).find(({ id }) => id === mapping.traitId);
      require(trait && formal.traitIds?.includes(trait.id) && !trait.previewIdentity?.formalIdPending,
        `正式特性映射与目标精灵不匹配：${mapping.traitId}`);
      traitIds[previous.traitId] = trait.id;
    }
  }
  return { catalogId: catalog.catalogId, spiritIds, traitIds };
}
