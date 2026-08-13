import { NATURES } from "../shared/domain/natures.js";
import { extractTraitValues } from "../shared/state/trait-values.js";

export const MINIAPP_CONFIG_LIBRARY_KEY =
  "rock-calculator.miniapp.config-library.v1";

const FORMAT = "rock-calculator.favorite-config-library";
const SCHEMA_VERSION = 1;
const NATURE_IDS = new Set(NATURES.map((nature) => nature.id));
const STAT_KEYS = [
  "hp",
  "speed",
  "physicalAttack",
  "magicalAttack",
  "physicalDefense",
  "magicalDefense",
];

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function emptyLibrary() {
  return { entries: [], schemaVersion: SCHEMA_VERSION };
}

function decodeLibrary(json) {
  const decoded = typeof json === "string" ? JSON.parse(json) : json;
  if (
    decoded?.format !== FORMAT ||
    decoded?.schemaVersion !== SCHEMA_VERSION ||
    !Array.isArray(decoded.entries)
  ) {
    throw new TypeError("常用精灵配置文件结构无效");
  }
  return decoded;
}

function sanitizeEntry(raw, snapshot, knownSpirits, knownSkills) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { invalid: true };
  }
  if (!knownSpirits.has(raw.spiritId)) {
    return { missingSpirit: true };
  }
  if (
    !NATURE_IDS.has(raw.natureId) ||
    !raw.displayIvs ||
    typeof raw.displayIvs !== "object" ||
    !Array.isArray(raw.skills) ||
    ![4, 7].includes(raw.skills.length)
  ) {
    return { invalid: true };
  }
  const displayIvs = {};
  for (const stat of STAT_KEYS) {
    const value = raw.displayIvs[stat];
    if (!Number.isInteger(value) || value < 0 || value > 60) {
      return { invalid: true };
    }
    displayIvs[stat] = value;
  }
  let missingSkills = 0;
  const skills = raw.skills.map((skillId) => {
    if (skillId === null) return null;
    if (typeof skillId === "string" && knownSkills.has(skillId)) {
      return skillId;
    }
    missingSkills += 1;
    return null;
  });
  const traitValues = extractTraitValues({
    spiritId: raw.spiritId,
    traitValues: raw.traitValues ?? {},
    skills: { four: [], single: null },
  }, snapshot);
  return {
    entry: {
      displayIvs,
      natureId: raw.natureId,
      skills,
      spiritId: raw.spiritId,
      traitValues,
    },
    missingSkills,
  };
}

export function parseBundledConfigLibrary(json, {
  existingEntries = [],
  favoriteIds = [],
  snapshot,
} = {}) {
  const decoded = decodeLibrary(json);
  const knownSpirits = new Set(
    (snapshot?.spirits ?? []).map((spirit) => spirit.id),
  );
  const knownSkills = new Set(
    (snapshot?.skills ?? []).map((skill) => skill.id),
  );
  const existingIds = new Set(
    existingEntries.map((entry) => entry.spiritId),
  );
  const existingFavoriteIds = new Set(favoriteIds);
  const bySpirit = new Map();
  const preview = {
    added: 0,
    duplicateEntries: 0,
    favoritesAdded: 0,
    invalidEntries: 0,
    missingSkills: 0,
    missingSpirits: 0,
    overwritten: 0,
  };

  for (const raw of decoded.entries) {
    const sanitized = sanitizeEntry(
      raw,
      snapshot,
      knownSpirits,
      knownSkills,
    );
    if (sanitized.missingSpirit) {
      preview.missingSpirits += 1;
      continue;
    }
    if (sanitized.invalid) {
      preview.invalidEntries += 1;
      continue;
    }
    if (bySpirit.has(sanitized.entry.spiritId)) {
      preview.duplicateEntries += 1;
    }
    bySpirit.set(sanitized.entry.spiritId, sanitized.entry);
    preview.missingSkills += sanitized.missingSkills;
  }

  const entries = [...bySpirit.values()];
  for (const entry of entries) {
    if (existingIds.has(entry.spiritId)) preview.overwritten += 1;
    else preview.added += 1;
    if (!existingFavoriteIds.has(entry.spiritId)) {
      preview.favoritesAdded += 1;
    }
  }

  return {
    entries,
    favoriteSpiritIds: entries.map((entry) => entry.spiritId),
    preview,
  };
}

export function expandBundledConfigLibrary(library) {
  return {
    ...library,
    entries: (library?.entries ?? []).map((entry) => {
      if (!Array.isArray(entry)) {
        return { ...entry, traitValues: entry.traitValues ?? {} };
      }
      const [
        spiritId,
        natureId,
        [
          hp,
          speed,
          physicalAttack,
          magicalAttack,
          physicalDefense,
          magicalDefense,
        ],
        skills,
        traitValues,
      ] = entry;
      return {
        displayIvs: {
          hp,
          magicalAttack,
          magicalDefense,
          physicalAttack,
          physicalDefense,
          speed,
        },
        natureId,
        skills,
        spiritId,
        traitValues: traitValues ?? {},
      };
    }),
  };
}

export function configPresetsBySpirit(entries = []) {
  return Object.fromEntries(entries.map((entry) => [
    entry.spiritId,
    {
      ...cloneJson(entry),
      skills: {
        four: cloneJson(entry.skills),
        single: entry.skills.find(Boolean) ?? null,
      },
    },
  ]));
}

export function createConfigLibraryRepository({
  favoritesRepository,
  storage,
}) {
  if (
    !storage ||
    typeof storage.get !== "function" ||
    typeof storage.set !== "function" ||
    typeof storage.remove !== "function"
  ) {
    throw new TypeError("配置库仓库需要同步 storage");
  }

  function load(snapshot, { repair = true } = {}) {
    const stored = storage.get(MINIAPP_CONFIG_LIBRARY_KEY);
    if (stored === undefined || stored === null || stored === "") {
      return emptyLibrary();
    }
    try {
      const decoded = typeof stored === "string" ? JSON.parse(stored) : stored;
      const parsed = parseBundledConfigLibrary({
        entries: decoded.entries,
        format: FORMAT,
        schemaVersion: SCHEMA_VERSION,
      }, { snapshot });
      return { entries: parsed.entries, schemaVersion: SCHEMA_VERSION };
    } catch {
      if (repair) storage.remove(MINIAPP_CONFIG_LIBRARY_KEY);
      return emptyLibrary();
    }
  }

  return {
    commit(parsed, snapshot) {
      if (!favoritesRepository) {
        throw new TypeError("配置库导入仓库尚未就绪");
      }
      const beforeLibrary = storage.get(MINIAPP_CONFIG_LIBRARY_KEY);
      const beforeFavorites = favoritesRepository.list();
      const favoriteIds = [...new Set([
        ...beforeFavorites,
        ...parsed.favoriteSpiritIds,
      ])];
      const envelope = {
        entries: cloneJson(parsed.entries),
        schemaVersion: SCHEMA_VERSION,
      };
      try {
        storage.set(MINIAPP_CONFIG_LIBRARY_KEY, envelope);
        const favorites = favoritesRepository.replace(favoriteIds);
        return {
          entries: load(snapshot).entries,
          favorites,
          preview: parsed.preview,
          schemaVersion: SCHEMA_VERSION,
        };
      } catch (error) {
        if (beforeLibrary === undefined) {
          storage.remove(MINIAPP_CONFIG_LIBRARY_KEY);
        } else {
          storage.set(MINIAPP_CONFIG_LIBRARY_KEY, beforeLibrary);
        }
        favoritesRepository.replace(beforeFavorites);
        throw error;
      }
    },

    load,

    preview(json, snapshot) {
      return parseBundledConfigLibrary(json, {
        existingEntries: load(snapshot, { repair: false }).entries,
        favoriteIds: favoritesRepository?.list?.() ?? [],
        snapshot,
      });
    },
  };
}
