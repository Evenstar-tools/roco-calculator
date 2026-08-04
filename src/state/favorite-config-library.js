import { NATURES } from "../domain/natures.js";
import { isCompleteSpiritConfig } from "./spirit-configs.js";
import { extractTraitValues } from "./trait-values.js";
import {
  getSpiritSkillSlotCapacity,
  normalizeSkillSlots,
} from "../domain/skill-slot-capacity.js";

export const FAVORITE_CONFIG_LIBRARY_FORMAT =
  "rock-calculator.favorite-config-library";
export const FAVORITE_CONFIG_LIBRARY_SCHEMA_VERSION = 1;
export const FAVORITE_CONFIG_LIBRARY_MAX_ENTRIES = 2000;
export const FAVORITE_CONFIG_LIBRARY_MAX_BYTES = 5 * 1024 * 1024;

const STAT_KEYS = [
  "hp",
  "speed",
  "physicalAttack",
  "magicalAttack",
  "physicalDefense",
  "magicalDefense",
];
const STAT_LABELS = {
  hp: "生命",
  speed: "速度",
  physicalAttack: "物攻",
  magicalAttack: "魔攻",
  physicalDefense: "物防",
  magicalDefense: "魔防",
};
const NATURE_IDS = new Set(NATURES.map((nature) => nature.id));

function cloneJson(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function skillId(value) {
  if (typeof value === "string") return value;
  return value?.skillId ?? value?.id ?? null;
}

function favoriteSpiritIds(favorites) {
  return (favorites ?? [])
    .filter((favorite) =>
      favorite?.kind === "spirit" && typeof favorite.spiritId === "string",
    )
    .map((favorite) => favorite.spiritId);
}

function exportEntry(config, snapshot) {
  const capacity = getSpiritSkillSlotCapacity(snapshot, config.spiritId);
  return {
    spiritId: config.spiritId,
    natureId: config.natureId ?? config.nature,
    displayIvs: Object.fromEntries(
      STAT_KEYS.map((stat) => [stat, Number(config.displayIvs?.[stat])]),
    ),
    skills: normalizeSkillSlots(config.skills?.four, capacity)
      .map((entry) => skillId(entry) || null),
    traitValues: extractTraitValues(config, snapshot),
  };
}

export function buildFavoriteConfigLibrary({
  appVersion,
  favorites,
  now = () => new Date().toISOString(),
  snapshot,
  spiritConfigs,
  versions,
}) {
  const manualSpiritIds = [...new Set(favoriteSpiritIds(favorites))];
  const manualSpiritIdSet = new Set(manualSpiritIds);
  const knownSpiritIds = new Set(
    (snapshot?.spirits ?? []).map((spirit) => spirit.id),
  );
  const autoIncludedSpiritIds = Object.entries(spiritConfigs?.configs ?? {})
    .filter(([spiritId, config]) =>
      knownSpiritIds.has(spiritId) &&
      !manualSpiritIdSet.has(spiritId) &&
      isCompleteSpiritConfig(config),
    )
    .map(([spiritId]) => spiritId);
  const entries = [];
  let manualConfiguredCount = 0;
  let skippedUnconfiguredCount = 0;
  for (const spiritId of manualSpiritIds) {
    const config = spiritConfigs?.configs?.[spiritId];
    if (!config) {
      skippedUnconfiguredCount += 1;
      continue;
    }
    entries.push(exportEntry({ ...config, spiritId }, snapshot));
    manualConfiguredCount += 1;
  }
  for (const spiritId of autoIncludedSpiritIds) {
    const config = spiritConfigs.configs[spiritId];
    entries.push(exportEntry({ ...config, spiritId }, snapshot));
  }
  return {
    autoIncludedCount: autoIncludedSpiritIds.length,
    exportedCount: entries.length,
    manualConfiguredCount,
    skippedUnconfiguredCount,
    library: {
      format: FAVORITE_CONFIG_LIBRARY_FORMAT,
      schemaVersion: FAVORITE_CONFIG_LIBRARY_SCHEMA_VERSION,
      appVersion,
      versions: cloneJson(versions ?? {}),
      exportedAt: now(),
      entryCount: entries.length,
      entries,
    },
  };
}

function parseJson(json) {
  if (typeof json !== "string") {
    throw new TypeError("配置库必须是 JSON 文本");
  }
  let byteLength = 0;
  for (let index = 0; index < json.length; index += 1) {
    const point = json.codePointAt(index);
    byteLength += point <= 0x7f ? 1 : point <= 0x7ff ? 2 : point <= 0xffff ? 3 : 4;
    if (point > 0xffff) index += 1;
    if (byteLength > FAVORITE_CONFIG_LIBRARY_MAX_BYTES) break;
  }
  if (byteLength > FAVORITE_CONFIG_LIBRARY_MAX_BYTES) {
    throw new TypeError("配置库文件不能超过 5 MB");
  }
  try {
    return JSON.parse(json);
  } catch {
    throw new TypeError("配置库 JSON 无法解析");
  }
}

function invalidEntryReasons(raw, capacity) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return ["配置内容不是有效对象"];
  }
  const reasons = [];
  if (typeof raw.spiritId !== "string") reasons.push("缺少有效的精灵 ID");
  if (!NATURE_IDS.has(raw.natureId)) reasons.push(`无法识别性格 ${raw.natureId ?? "空"}`);
  if (!raw.displayIvs || typeof raw.displayIvs !== "object") {
    reasons.push("缺少六项个体配置");
  } else {
    for (const stat of STAT_KEYS) {
      const value = raw.displayIvs[stat];
      if (!Number.isInteger(value) || value < 0 || value > 60) {
        reasons.push(`${STAT_LABELS[stat]}个体 ${value ?? "空"} 不在 0～60`);
      }
    }
  }
  if (!Array.isArray(raw.skills)) {
    reasons.push("技能槽不是数组");
  } else {
    const supportsLegacyFourSlots = capacity > 4 && raw.skills.length === 4;
    if (raw.skills.length !== capacity && !supportsLegacyFourSlots) {
      reasons.push(`技能槽有 ${raw.skills.length} 个，当前形态需要 ${capacity} 个`);
    }
    if (raw.skills.some((value) => value !== null && typeof value !== "string")) {
      reasons.push("技能槽中存在无法识别的内容");
    }
  }
  if (
    !raw.traitValues ||
    typeof raw.traitValues !== "object" ||
    Array.isArray(raw.traitValues)
  ) {
    reasons.push("特性配置格式无效");
  }
  return reasons;
}

function validateAndRepairEntry(raw, snapshot) {
  const capacity = typeof raw?.spiritId === "string"
    ? getSpiritSkillSlotCapacity(snapshot, raw.spiritId)
    : 4;
  const invalidReasons = invalidEntryReasons(raw, capacity);
  if (invalidReasons.length > 0) return { invalid: true, invalidReasons };
  const repairs = [];
  if (capacity > 4 && raw.skills.length === 4) {
    repairs.push(`已保留原四技能，并补齐 ${capacity - 4} 个空技能槽`);
  }
  const skillIds = new Set((snapshot?.skills ?? []).map((skill) => skill.id));
  let missingSkills = 0;
  const missingSkillSlots = [];
  const skills = normalizeSkillSlots(raw.skills, capacity).map((id, index) => {
    if (id && !skillIds.has(id)) {
      missingSkills += 1;
      missingSkillSlots.push({ id, index: index + 1 });
      return null;
    }
    return id;
  });
  const traitValues = extractTraitValues({
    spiritId: raw.spiritId,
    traitValues: raw.traitValues,
    skills: { four: [], single: null },
  }, snapshot);
  let unknownTraitFields = 0;
  const unknownTraitKeys = [];
  for (const [key, rawValue] of Object.entries(raw.traitValues)) {
    if (!Object.hasOwn(traitValues, key) || !Object.is(traitValues[key], rawValue)) {
      delete traitValues[key];
      unknownTraitFields += 1;
      unknownTraitKeys.push(key);
    }
  }
  return {
    entry: {
      spiritId: raw.spiritId,
      natureId: raw.natureId,
      displayIvs: cloneJson(raw.displayIvs),
      skills,
      traitValues,
    },
    missingSkills,
    missingSkillSlots,
    repairs,
    unknownTraitFields,
    unknownTraitKeys,
  };
}

function legacyEntryFromSide(side, snapshot) {
  if (!side?.spiritId) return null;
  const candidate = exportEntry({
    ...side,
    natureId: side.natureId ?? side.nature,
  }, snapshot);
  return validateAndRepairEntry(candidate, snapshot).entry ?? null;
}

function decodeInput(decoded, snapshot) {
  if (Array.isArray(decoded)) {
    const favoriteIds = [];
    const entries = [];
    for (const record of decoded) {
      if (record?.kind === "spirit" && typeof record.spiritId === "string") {
        favoriteIds.push(record.spiritId);
      }
      for (const side of Object.values(record?.state?.sides ?? {})) {
        const entry = legacyEntryFromSide(side, snapshot);
        if (entry) {
          entries.push(entry);
          favoriteIds.push(entry.spiritId);
        }
      }
    }
    return {
      entries,
      favoriteSpiritIds: [...new Set(favoriteIds)],
      format: "legacy-favorites",
      versions: {},
    };
  }
  if (!decoded || decoded.format !== FAVORITE_CONFIG_LIBRARY_FORMAT) {
    throw new TypeError("不是洛克计算器配置库文件");
  }
  if (decoded.schemaVersion !== FAVORITE_CONFIG_LIBRARY_SCHEMA_VERSION) {
    throw new TypeError("不支持此配置库结构版本");
  }
  if (!Array.isArray(decoded.entries)) {
    throw new TypeError("配置库 entries 结构无效");
  }
  return {
    entries: decoded.entries,
    favoriteSpiritIds: decoded.entries.map((entry) => entry?.spiritId),
    format: decoded.format,
    versions: decoded.versions ?? {},
  };
}

export function parseFavoriteConfigLibrary(json, {
  currentVersions = {},
  existingFavorites = [],
  existingSpiritConfigs = { configs: {} },
  snapshot,
} = {}) {
  const decoded = decodeInput(parseJson(json), snapshot);
  if (decoded.entries.length > FAVORITE_CONFIG_LIBRARY_MAX_ENTRIES) {
    throw new TypeError("配置库最多包含 2000 条配置");
  }
  const preview = {
    added: 0,
    overwritten: 0,
    favoritesAdded: 0,
    missingSpirits: 0,
    missingSkills: 0,
    unknownTraitFields: 0,
    invalidEntries: 0,
    duplicateEntries: 0,
    repairedEntries: 0,
  };
  const issueDetails = [];
  const spiritById = new Map(
    (snapshot?.spirits ?? []).map((spirit) => [spirit.id, spirit]),
  );
  const addIssueDetail = ({
    action,
    entryIndex,
    raw,
    reason,
    type,
  }) => {
    const spiritId = typeof raw?.spiritId === "string" ? raw.spiritId : null;
    issueDetails.push({
      action,
      entryIndex,
      reason,
      spiritId,
      spiritName: spiritById.get(spiritId)?.fullName ?? spiritId ?? "无法识别的配置",
      type,
    });
  };
  const knownSpiritIds = new Set(
    (snapshot?.spirits ?? []).map((spirit) => spirit.id),
  );
  const seenSpiritIds = new Set();
  const validBySpirit = new Map();
  for (const [index, raw] of decoded.entries.entries()) {
    const entryIndex = index + 1;
    const spiritId = typeof raw?.spiritId === "string" ? raw.spiritId : null;
    if (spiritId && seenSpiritIds.has(spiritId)) {
      preview.duplicateEntries += 1;
      addIssueDetail({
        action: "导入时采用文件中最后一条有效配置",
        entryIndex,
        raw,
        reason: "同一精灵在文件中出现多次",
        type: "duplicateEntries",
      });
    }
    if (spiritId) seenSpiritIds.add(spiritId);
    if (!spiritId) {
      preview.invalidEntries += 1;
      addIssueDetail({
        action: "已跳过，不会写入",
        entryIndex,
        raw,
        reason: "缺少有效的精灵 ID",
        type: "invalidEntries",
      });
      continue;
    }
    if (!knownSpiritIds.has(spiritId)) {
      preview.missingSpirits += 1;
      addIssueDetail({
        action: "已跳过，不会写入",
        entryIndex,
        raw,
        reason: "当前数据中找不到这个精灵形态",
        type: "missingSpirits",
      });
      continue;
    }
    const validated = validateAndRepairEntry(raw, snapshot);
    if (validated.invalid) {
      preview.invalidEntries += 1;
      addIssueDetail({
        action: validBySpirit.has(spiritId)
          ? "已跳过，继续使用文件中上一条有效配置"
          : "已跳过，不会写入",
        entryIndex,
        raw,
        reason: validated.invalidReasons.join("；"),
        type: "invalidEntries",
      });
      continue;
    }
    validBySpirit.set(spiritId, { entryIndex, raw, validated });
  }
  const entries = [];
  for (const [spiritId, candidate] of validBySpirit) {
    const { entryIndex, raw, validated } = candidate;
    preview.missingSkills += validated.missingSkills;
    preview.unknownTraitFields += validated.unknownTraitFields;
    if (validated.missingSkillSlots.length > 0) {
      addIssueDetail({
        action: "只清空对应技能槽，其他配置正常导入",
        entryIndex,
        raw,
        reason: validated.missingSkillSlots
          .map(({ id, index }) => `第 ${index} 槽技能 ${id} 已失效`)
          .join("；"),
        type: "missingSkills",
      });
    }
    if (validated.unknownTraitKeys.length > 0) {
      addIssueDetail({
        action: "只忽略无法识别的特性字段",
        entryIndex,
        raw,
        reason: `无法识别特性字段：${validated.unknownTraitKeys.join("、")}`,
        type: "unknownTraitFields",
      });
    }
    if (validated.repairs.length > 0) {
      preview.repairedEntries += 1;
      addIssueDetail({
        action: validated.repairs.join("；"),
        entryIndex,
        raw,
        reason: "旧版技能槽结构已兼容当前形态",
        type: "repairedEntries",
      });
    }
    if (existingSpiritConfigs?.configs?.[spiritId]) preview.overwritten += 1;
    else preview.added += 1;
    entries.push(validated.entry);
  }
  const existingFavoriteIds = new Set(favoriteSpiritIds(existingFavorites));
  const favoriteCandidates = decoded.format === FAVORITE_CONFIG_LIBRARY_FORMAT
    ? entries.map((entry) => entry.spiritId)
    : decoded.favoriteSpiritIds;
  const requestedFavorites = [...new Set(favoriteCandidates.filter(
    (spiritId) => knownSpiritIds.has(spiritId),
  ))];
  preview.favoritesAdded = requestedFavorites.filter(
    (spiritId) => !existingFavoriteIds.has(spiritId),
  ).length;
  const warnings = [];
  for (const key of ["data", "rules"]) {
    if (
      decoded.versions?.[key] &&
      currentVersions?.[key] &&
      decoded.versions[key] !== currentVersions[key]
    ) {
      warnings.push(`${key === "data" ? "数据" : "规则"}版本不同，已按当前版本校验`);
    }
  }
  return {
    entries,
    favoriteSpiritIds: requestedFavorites,
    format: decoded.format,
    issueDetails,
    preview,
    warnings,
  };
}

function favoriteRecord(spiritId, snapshot) {
  const spirit = snapshot?.spirits?.find((candidate) => candidate.id === spiritId);
  return {
    fullName: spirit?.fullName ?? spiritId,
    id: `spirit:${spiritId}`,
    kind: "spirit",
    spiritId,
  };
}

export function applyFavoriteConfigLibraryImport({
  favoritesRepository,
  parsed,
  snapshot,
  spiritConfigsRepository,
}) {
  const beforeFavorites = favoritesRepository.list();
  const beforeConfigs = spiritConfigsRepository.load(snapshot);
  const byFavoriteId = new Map(beforeFavorites.map((favorite) => [favorite.id, favorite]));
  for (const spiritId of parsed.favoriteSpiritIds) {
    const record = favoriteRecord(spiritId, snapshot);
    byFavoriteId.set(record.id, record);
  }
  const nextConfigs = cloneJson(beforeConfigs);
  for (const entry of parsed.entries) {
    nextConfigs.configs[entry.spiritId] = {
      displayIvs: cloneJson(entry.displayIvs),
      natureId: entry.natureId,
      skills: { four: cloneJson(entry.skills), single: null },
      spiritId: entry.spiritId,
      traitValues: cloneJson(entry.traitValues),
      updatedAt: new Date().toISOString(),
    };
  }
  const nextFavorites = [...byFavoriteId.values()];
  try {
    const configs = spiritConfigsRepository.replace(nextConfigs, snapshot);
    const favorites = favoritesRepository.replace(nextFavorites);
    return { configs, favorites, preview: parsed.preview };
  } catch (error) {
    try {
      spiritConfigsRepository.replace(beforeConfigs, snapshot);
      favoritesRepository.replace(beforeFavorites);
    } catch {
      // 保留原始写入错误，调用方会提示用户并保留备份。
    }
    throw error;
  }
}
