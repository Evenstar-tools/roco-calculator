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
  return {
    commonConfig: { bundleId: null, entrySignatures: {} },
    entries: [],
    schemaVersion: SCHEMA_VERSION,
  };
}

function normalizedEntry(entry) {
  return {
    displayIvs: Object.fromEntries(STAT_KEYS.map((stat) => [
      stat,
      entry?.displayIvs?.[stat],
    ])),
    natureId: entry?.natureId,
    skills: Array.isArray(entry?.skills) ? entry.skills : [],
    spiritId: entry?.spiritId,
    traitValues: Object.fromEntries(
      Object.entries(entry?.traitValues ?? {}).sort(([left], [right]) => (
        left.localeCompare(right)
      )),
    ),
  };
}

export function configEntrySignature(entry) {
  const text = JSON.stringify(normalizedEntry(entry));
  let fnv = 2166136261;
  let djb = 5381;
  for (let index = 0; index < text.length; index += 1) {
    const code = text.charCodeAt(index);
    fnv = Math.imul(fnv ^ code, 16777619) >>> 0;
    djb = (Math.imul(djb, 33) ^ code) >>> 0;
  }
  return `${fnv.toString(16).padStart(8, "0")}${djb
    .toString(16)
    .padStart(8, "0")}`;
}

export function configLibraryBundleId(library) {
  const versions = library?.versions ?? {};
  return [
    library?.exportedAt ?? "unknown-export",
    library?.appVersion ?? "unknown-app",
    versions.data ?? "unknown-data",
    versions.rules ?? "unknown-rules",
    Array.isArray(library?.entries)
      ? library.entries.length
      : library?.entryCount ?? 0,
  ].join("|");
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
    bundleId: configLibraryBundleId(decoded),
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
      const validSpiritIds = new Set(parsed.entries.map((entry) => entry.spiritId));
      const storedSignatures = decoded.commonConfig?.entrySignatures;
      const entrySignatures = Object.fromEntries(Object.entries(
        storedSignatures && typeof storedSignatures === "object"
          ? storedSignatures
          : {},
      ).filter(([spiritId, signature]) => (
        validSpiritIds.has(spiritId) && typeof signature === "string"
      )));
      return {
        commonConfig: {
          bundleId: typeof decoded.commonConfig?.bundleId === "string"
            ? decoded.commonConfig.bundleId
            : null,
          entrySignatures,
        },
        entries: parsed.entries,
        schemaVersion: SCHEMA_VERSION,
      };
    } catch {
      if (repair) storage.remove(MINIAPP_CONFIG_LIBRARY_KEY);
      return emptyLibrary();
    }
  }

  return {
    commit(parsed, snapshot, { legacyEntrySignatures = {} } = {}) {
      if (!favoritesRepository) {
        throw new TypeError("配置库导入仓库尚未就绪");
      }
      const beforeLibrary = storage.get(MINIAPP_CONFIG_LIBRARY_KEY);
      const beforeFavorites = favoritesRepository.list();
      const currentLibrary = load(snapshot, { repair: false });
      const currentBySpirit = new Map(
        currentLibrary.entries.map((entry) => [entry.spiritId, entry]),
      );
      const nextEntries = [];
      const nextEntrySignatures = {};
      let added = 0;
      let overwritten = 0;
      let preserved = 0;
      for (const bundledEntry of parsed.entries) {
        const spiritId = bundledEntry.spiritId;
        const existingEntry = currentBySpirit.get(spiritId);
        const previousSignature =
          currentLibrary.commonConfig.entrySignatures[spiritId]
          ?? legacyEntrySignatures[spiritId];
        const canReplace = !existingEntry || (
          previousSignature
          && configEntrySignature(existingEntry) === previousSignature
        );
        if (!existingEntry) added += 1;
        else if (canReplace) overwritten += 1;
        else preserved += 1;
        nextEntries.push(cloneJson(canReplace ? bundledEntry : existingEntry));
        nextEntrySignatures[spiritId] = configEntrySignature(bundledEntry);
        currentBySpirit.delete(spiritId);
      }
      for (const existingEntry of currentBySpirit.values()) {
        nextEntries.push(cloneJson(existingEntry));
      }
      const favoriteIds = [...new Set([
        ...beforeFavorites,
        ...parsed.favoriteSpiritIds,
      ])];
      const envelope = {
        commonConfig: {
          bundleId: parsed.bundleId,
          entrySignatures: nextEntrySignatures,
        },
        entries: nextEntries,
        schemaVersion: SCHEMA_VERSION,
      };
      try {
        storage.set(MINIAPP_CONFIG_LIBRARY_KEY, envelope);
        const favorites = favoritesRepository.replace(favoriteIds);
        const library = load(snapshot);
        return {
          commonConfig: library.commonConfig,
          entries: library.entries,
          favorites,
          preview: {
            ...parsed.preview,
            added,
            overwritten,
            preserved,
          },
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
