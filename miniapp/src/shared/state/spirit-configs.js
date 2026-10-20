import { normalizeNatureId } from "../domain/natures.js";
import { assertRepositoryEnvironment, createServerStorage, serverStorageKey, storageError } from "./server-storage.js";
import {
  STORAGE_NAMESPACE,
  backupCorruptValue,
  legacyStorageKey,
  trySetItem,
} from "./storage-namespace.js";
import { extractTraitValues } from "./trait-values.js";
import {
  getSpiritSkillSlotCapacity,
  normalizeSkillSlots,
} from "../domain/skill-slot-capacity.js";

const SPIRIT_CONFIG_STORAGE_SUFFIX = "spirit-configs.v2";
const SPIRIT_CONFIG_V1_STORAGE_SUFFIX = "spirit-configs.v1";
export const SPIRIT_CONFIG_STORAGE_KEY =
  serverStorageKey("cn", `${STORAGE_NAMESPACE}.${SPIRIT_CONFIG_STORAGE_SUFFIX}`);
export const SPIRIT_CONFIG_V1_STORAGE_KEY =
  serverStorageKey("cn", `${STORAGE_NAMESPACE}.${SPIRIT_CONFIG_V1_STORAGE_SUFFIX}`);
export const SPIRIT_CONFIG_SCHEMA_VERSION = 2;

const STAT_KEYS = [
  "hp",
  "speed",
  "physicalAttack",
  "magicalAttack",
  "physicalDefense",
  "magicalDefense",
];

function emptyState() {
  return {
    configs: {},
    schemaVersion: SPIRIT_CONFIG_SCHEMA_VERSION,
  };
}

function cloneJson(value) {
  if (value === null || value === undefined) return value;
  if (typeof globalThis.structuredClone === "function") {
    return globalThis.structuredClone(value);
  }
  return JSON.parse(JSON.stringify(value));
}

function skillId(entry) {
  if (typeof entry === "string") return entry;
  return entry?.skillId ?? entry?.id ?? null;
}

export function isUsableDraftConfiguration(config) {
  const nature = Object.hasOwn(config ?? {}, "natureId") ? config.natureId : config?.nature;
  return Boolean(config && (nature === null || (typeof nature === "string" && nature.length > 0)) &&
    config.displayIvs && STAT_KEYS.every((key) => Object.hasOwn(config.displayIvs, key) &&
      (config.displayIvs[key] === null || (Number.isSafeInteger(config.displayIvs[key]) && config.displayIvs[key] >= 0))) &&
    config.skills && Object.hasOwn(config.skills, "single") && Array.isArray(config.skills.four) &&
    config.skills.four.length > 0 && config.skills.four.length <= 32);
}

function sanitizeConfig(
  config,
  updatedAt = config?.updatedAt,
  snapshot = null,
) {
  if (!config?.spiritId) {
    throw new TypeError("精灵配置必须包含 spiritId");
  }
  const capacity = snapshot
    ? getSpiritSkillSlotCapacity(snapshot, config.spiritId)
    : config.skills?.four?.length === 7 ? 7 : 4;
  return {
    displayIvs: Object.fromEntries(
      STAT_KEYS.map((stat) => [stat, Number(config.displayIvs?.[stat]) || 0]),
    ),
    natureId: normalizeNatureId(config.natureId ?? config.nature),
    skills: {
      four: normalizeSkillSlots(config.skills?.four, capacity).map(cloneJson),
      single: cloneJson(config.skills?.single ?? null),
    },
    spiritId: config.spiritId,
    traitValues: snapshot
      ? extractTraitValues(config, snapshot)
      : cloneJson(config.traitValues ?? {}),
    updatedAt,
    ...(typeof config.presetBaseline === "string" ? { presetBaseline: config.presetBaseline } : {}),
  };
}

function repairConfig(config, skillIds) {
  const missing = [config.skills.single, ...config.skills.four].some((entry) => skillId(entry) && !skillIds.has(skillId(entry)));
  return missing ? { ...config, needsRepair: true, repairReason: "技能数据不存在，原始配置已保留" } : config;
}

function validateState(value) {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    value.schemaVersion !== SPIRIT_CONFIG_SCHEMA_VERSION ||
    !value.configs ||
    typeof value.configs !== "object" ||
    Array.isArray(value.configs)
  ) {
    throw new TypeError("精灵配置数据结构无效");
  }
  return value;
}

function validateV1State(value) {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    value.schemaVersion !== 1 ||
    !value.configs ||
    typeof value.configs !== "object" ||
    Array.isArray(value.configs)
  ) {
    throw new TypeError("旧精灵配置数据结构无效");
  }
  return value;
}

export function isCompleteSpiritConfig(config) {
  if (!config || config.needsRepair) return false;
  const natureId = normalizeNatureId(config.natureId ?? config.nature);
  const positiveIvs = STAT_KEYS.filter(
    (stat) => Number(config.displayIvs?.[stat]) > 0,
  ).length;
  const configuredSkills = Array.from(
    { length: 4 },
    (_, index) => config.skills?.four?.[index] ?? null,
  ).filter((entry) => Boolean(skillId(entry))).length;
  return natureId !== "neutral" && positiveIvs >= 3 && configuredSkills >= 2;
}

export function spiritConfigsRepository({
  now = () => new Date().toISOString(),
  storage = globalThis.localStorage,
  serverId = "cn",
} = {}) {
  if (!storage?.getItem || !storage?.setItem || !storage?.removeItem) {
    throw new TypeError("当前环境无法保存精灵配置");
  }
  assertRepositoryEnvironment(serverId);
  storage = createServerStorage(serverId, storage);
  const configKey = serverStorageKey(serverId, `rock-calculator.${SPIRIT_CONFIG_STORAGE_SUFFIX}`);
  const v1Key = serverStorageKey(serverId, `rock-calculator.${SPIRIT_CONFIG_V1_STORAGE_SUFFIX}`);

  let observedRaw;
  function write(state, snapshot = null) {
    assertRepositoryEnvironment(serverId, snapshot);
    const previous = storage.getItem(configKey);
    if (observedRaw !== undefined && previous !== observedRaw) throw storageError("STORAGE_CONFLICT", "另一标签页已更新配置；本标签内容已保留，未覆盖存档");
    if (previous) {
      try { validateState(JSON.parse(previous)); }
      catch { throw storageError("STORAGE_CORRUPT", "原精灵配置损坏；保存已停止，原始内容未覆盖"); }
    }
    const stored = {
      configs: Object.fromEntries(
        Object.entries(state.configs ?? {}).map(([spiritId, config]) => [
          spiritId,
          (serverId === "global" || config.needsRepair) ? cloneJson(config) : sanitizeConfig(config, config?.updatedAt, snapshot),
        ]),
      ),
      schemaVersion: SPIRIT_CONFIG_SCHEMA_VERSION,
    };
    validateState(stored);
    const raw = JSON.stringify(stored);
    if (
      !trySetItem(
        storage,
        configKey,
        raw,
      )
    ) {
      return null;
    }
    observedRaw = raw;
    return stored;
  }

  return {
    clear() {
      storage.removeItem(configKey);
      storage.removeItem(v1Key);
      storage.removeItem(legacyStorageKey(SPIRIT_CONFIG_STORAGE_SUFFIX));
      storage.removeItem(legacyStorageKey(SPIRIT_CONFIG_V1_STORAGE_SUFFIX));
      observedRaw = null;
      return emptyState();
    },
    clearIncomplete(state, snapshot = null) {
      // Draft completeness is not a verified Global game rule.
      if (serverId === "global") return cloneJson(state);
      return write({
        configs: Object.fromEntries(
          Object.entries(state?.configs ?? {}).filter(([, config]) =>
            config.needsRepair || isCompleteSpiritConfig(config),
          ),
        ),
        schemaVersion: SPIRIT_CONFIG_SCHEMA_VERSION,
      }, snapshot);
    },
    load(snapshot) {
      assertRepositoryEnvironment(serverId, snapshot);
      observedRaw = storage.getItem(configKey);
      let corrupted = false;
      const candidates = [
        {
          key: configKey,
          schemaVersion: SPIRIT_CONFIG_SCHEMA_VERSION,
        },
        { key: v1Key, schemaVersion: 1 },
        {
          key: legacyStorageKey(SPIRIT_CONFIG_V1_STORAGE_SUFFIX),
          schemaVersion: 1,
        },
      ];
      for (const source of candidates) {
        const raw = storage.getItem(source.key);
        if (!raw) continue;
        try {
          const decoded = JSON.parse(raw);
          const parsed = decoded?.schemaVersion === SPIRIT_CONFIG_SCHEMA_VERSION
            ? validateState(decoded)
            : validateV1State(decoded);
          const spiritIds = snapshot
            ? new Set((snapshot.spirits ?? []).map((spirit) => spirit.id))
            : null;
          const skillIds = snapshot
            ? new Set((snapshot.skills ?? []).map((skill) => skill.id))
            : null;
          const configs = {};
          for (const [spiritId, storedConfig] of Object.entries(parsed.configs)) {
            const hasMissingSkill = skillIds && [storedConfig.skills?.single, ...(storedConfig.skills?.four ?? [])]
              .some((entry) => (skillId(entry) && !skillIds.has(skillId(entry))) || (serverId === "global" &&
                Object.keys(entry?.memoryBySkill ?? {}).some((id) => !skillIds.has(id))));
            const incompleteDraft = serverId === "global" && !isUsableDraftConfiguration(storedConfig);
            if ((spiritIds && !spiritIds.has(spiritId)) || hasMissingSkill || incompleteDraft) {
              // Check references before normalizing slots, so a future ID is never truncated.
              configs[spiritId] = { ...cloneJson(storedConfig), spiritId, needsRepair: true, repairReason: incompleteDraft ? "配置结构不完整，原始配置已保留" : hasMissingSkill ? "技能数据不存在，原始配置已保留" : "精灵数据不存在，原始配置已保留" };
              continue;
            }
            if (serverId === "global") {
              const config = { ...cloneJson(storedConfig), spiritId };
              delete config.needsRepair;
              delete config.repairReason;
              configs[spiritId] = config;
              continue;
            }
            const config = sanitizeConfig({
              ...storedConfig,
              spiritId,
            }, storedConfig?.updatedAt, snapshot);
            configs[spiritId] = skillIds
              ? repairConfig(config, skillIds)
              : config;
          }
          const restored = {
            configs,
            schemaVersion: SPIRIT_CONFIG_SCHEMA_VERSION,
            ...(corrupted ? { warning: "新精灵配置损坏；已读取旧配置，原始内容保留且停止覆盖保存" } : {}),
          };
          if (parsed.schemaVersion !== SPIRIT_CONFIG_SCHEMA_VERSION && !corrupted) {
            trySetItem(
              storage,
              configKey,
              JSON.stringify(restored),
            );
            observedRaw = storage.getItem(configKey);
          }
          return restored;
        } catch {
          corrupted = true;
          backupCorruptValue(storage, source.key, raw, now());
        }
      }
      if (corrupted) throw storageError("STORAGE_CORRUPT", "精灵配置损坏；原始内容已保留，请先导出恢复或明确清空");
      return emptyState();
    },
    replace(state, snapshot = null) {
      return write(state, snapshot);
    },
    save(state, side, snapshot = null) {
      const config = serverId === "global" ? { ...cloneJson(side), updatedAt: now() }
        : sanitizeConfig({ ...side, presetBaseline: state?.configs?.[side.spiritId]?.presetBaseline }, now(), snapshot);
      return write({
        configs: {
          ...(state?.configs ?? {}),
          [config.spiritId]: config,
        },
        schemaVersion: SPIRIT_CONFIG_SCHEMA_VERSION,
      }, snapshot);
    },
  };
}
