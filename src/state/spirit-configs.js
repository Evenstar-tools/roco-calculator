import { normalizeNatureId } from "../domain/natures.js";
import {
  STORAGE_NAMESPACE,
  finishStorageMigration,
  legacyStorageKey,
  readStorageWithLegacy,
} from "./storage-namespace.js";

const SPIRIT_CONFIG_STORAGE_SUFFIX = "spirit-configs.v1";
export const SPIRIT_CONFIG_STORAGE_KEY =
  `${STORAGE_NAMESPACE}.${SPIRIT_CONFIG_STORAGE_SUFFIX}`;
export const SPIRIT_CONFIG_SCHEMA_VERSION = 1;

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

function sanitizeConfig(config, updatedAt = config?.updatedAt) {
  if (!config?.spiritId) {
    throw new TypeError("精灵配置必须包含 spiritId");
  }
  return {
    displayIvs: Object.fromEntries(
      STAT_KEYS.map((stat) => [stat, Number(config.displayIvs?.[stat]) || 0]),
    ),
    natureId: normalizeNatureId(config.natureId ?? config.nature),
    skills: {
      four: Array.from(
        { length: 4 },
        (_, index) => cloneJson(config.skills?.four?.[index] ?? null),
      ),
      single: cloneJson(config.skills?.single ?? null),
    },
    spiritId: config.spiritId,
    updatedAt,
  };
}

function repairConfig(config, skillIds) {
  return {
    ...config,
    skills: {
      four: config.skills.four.map((entry) =>
        skillId(entry) && !skillIds.has(skillId(entry)) ? null : entry,
      ),
      single:
        skillId(config.skills.single) &&
        !skillIds.has(skillId(config.skills.single))
          ? null
          : config.skills.single,
    },
  };
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

export function isCompleteSpiritConfig(config) {
  if (!config) return false;
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
} = {}) {
  if (!storage?.getItem || !storage?.setItem || !storage?.removeItem) {
    throw new TypeError("当前环境无法保存精灵配置");
  }

  function write(state) {
    const stored = {
      configs: Object.fromEntries(
        Object.entries(state.configs ?? {}).map(([spiritId, config]) => [
          spiritId,
          sanitizeConfig(config),
        ]),
      ),
      schemaVersion: SPIRIT_CONFIG_SCHEMA_VERSION,
    };
    validateState(stored);
    storage.setItem(SPIRIT_CONFIG_STORAGE_KEY, JSON.stringify(stored));
    return stored;
  }

  return {
    clear() {
      storage.removeItem(SPIRIT_CONFIG_STORAGE_KEY);
      storage.removeItem(legacyStorageKey(SPIRIT_CONFIG_STORAGE_SUFFIX));
      return emptyState();
    },
    load(snapshot) {
      const { key, raw } = readStorageWithLegacy(
        storage,
        SPIRIT_CONFIG_STORAGE_KEY,
        SPIRIT_CONFIG_STORAGE_SUFFIX,
      );
      if (!raw) return emptyState();
      try {
        const parsed = validateState(JSON.parse(raw));
        finishStorageMigration(
          storage,
          SPIRIT_CONFIG_STORAGE_KEY,
          key,
          raw,
        );
        const spiritIds = snapshot
          ? new Set((snapshot.spirits ?? []).map((spirit) => spirit.id))
          : null;
        const skillIds = snapshot
          ? new Set((snapshot.skills ?? []).map((skill) => skill.id))
          : null;
        const configs = {};
        for (const [spiritId, storedConfig] of Object.entries(parsed.configs)) {
          if (spiritIds && !spiritIds.has(spiritId)) continue;
          const config = sanitizeConfig({
            ...storedConfig,
            spiritId,
          });
          configs[spiritId] = skillIds
            ? repairConfig(config, skillIds)
            : config;
        }
        return {
          configs,
          schemaVersion: SPIRIT_CONFIG_SCHEMA_VERSION,
        };
      } catch {
        return emptyState();
      }
    },
    save(state, side) {
      const config = sanitizeConfig(side, now());
      return write({
        configs: {
          ...(state?.configs ?? {}),
          [config.spiritId]: config,
        },
        schemaVersion: SPIRIT_CONFIG_SCHEMA_VERSION,
      });
    },
  };
}
