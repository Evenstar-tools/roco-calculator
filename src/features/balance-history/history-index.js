import { mergeEntityChangeInfo } from "../../data/entity-change-history.js";
import { createSpiritSearchIndex } from "../../data/search-index.js";

const indexes = new WeakMap();
const STAT_FIELDS = new Set(["hp", "physicalAttack", "physicalDefense", "magicalAttack", "magicalDefense", "speed"]);
const SKILL_FIELDS = new Set(["basePower", "cost", "description"]);

export function classifyHistoryItem(item) {
  if (item?.kind === "learnset") return "learnset";
  if (item?.kind === "trait" ||
      (item?.kind === "wording" && /^特性·/u.test(item.label ?? ""))) return "traits";
  if (item?.kind === "stat" && STAT_FIELDS.has(item.field)) return "stats";
  if (["stat", "mechanic", "wording"].includes(item?.kind) &&
      (SKILL_FIELDS.has(item.field) || /(?:威力|能耗|技能效果)$/u.test(item.label ?? ""))) return "skills";
  return "other";
}

const dateKey = (patch) => String(patch?.displayDate ?? patch?.date ?? "").replace(/\D/gu, "");
const comparePatches = (left, right) => dateKey(right).localeCompare(dateKey(left)) ||
  String(right?.id ?? "").localeCompare(String(left?.id ?? ""));
const normalizePatch = (patch) => {
  const seasonNumber = patch?.id?.match(/^s([1-9])-/iu)?.[1];
  const seasonId = patch?.seasonId ?? (seasonNumber ? `S${seasonNumber}` : null);
  return { ...patch, ...(seasonId ? { seasonId } : {}) };
};

function mergePatch(previous, incoming) {
  return { ...incoming, ...Object.fromEntries(Object.entries(previous)
    .filter(([, value]) => value != null)) };
}

function entityRecords(entity) {
  const info = mergeEntityChangeInfo(entity.changeInfo, null);
  const records = new Map();
  function append(record) {
    if (!record) return;
    const items = (record.items ?? []).filter((item) => item && item.kind !== "new");
    if (items.length) {
      // Missing IDs stay independent in the entity view; do not invent a batch.
      const key = record.patch?.id ?? record;
      const existing = records.get(key);
      const merged = existing
        ? mergeEntityChangeInfo(existing, { patch: record.patch, items })
        : { patch: record.patch, items };
      records.set(key, { patch: merged.patch, items: merged.items });
    }
    for (const historical of record.history ?? []) append(historical);
  }
  append(info);
  return [...records.values()];
}

function buildIndex(snapshot) {
  const global = snapshot?.meta?.serverId === "global";
  const spirits = global ? [] : snapshot?.spirits ?? [];
  const skills = global ? [] : snapshot?.skills ?? [];
  const spiritRecords = new Map();
  const skillRecords = new Map();
  const batches = new Map();
  for (const [entities, recordsById, countField] of [[spirits, spiritRecords, "spiritCount"], [skills, skillRecords, "skillCount"]]) {
    for (const entity of entities) {
      const records = entityRecords(entity);
      recordsById.set(entity.id, records);
      for (const record of records) {
        const id = record.patch?.id;
        if (id == null) continue;
        if (!batches.has(id)) batches.set(id, { patch: {}, spiritCount: 0, skillCount: 0 });
        const batch = batches.get(id);
        batch.patch = mergePatch(batch.patch, record.patch);
        batch[countField] += 1;
      }
    }
  }
  const patches = [...batches.values()].map(({ patch, spiritCount, skillCount }) => ({
    ...normalizePatch(patch), spiritCount, skillCount,
  })).sort(comparePatches);
  const patchById = new Map(patches.map((patch) => [patch.id, patch]));
  for (const records of [...spiritRecords.values(), ...skillRecords.values()]) {
    for (const record of records) {
      const metadata = patchById.get(record.patch?.id);
      const { spiritCount: _spirits, skillCount: _skills, ...patch } = metadata ?? normalizePatch(record.patch);
      record.patch = patch;
    }
    records.sort((left, right) => comparePatches(left.patch, right.patch));
  }
  const seasons = [...new Set(patches.map((patch) => patch.seasonId).filter(Boolean))]
    .sort((left, right) => Number(right.slice(1)) - Number(left.slice(1)));
  const spiritSearch = createSpiritSearchIndex(spirits);
  const spiritById = new Map(spirits.map((spirit) => [spirit.id, spirit]));
  const skillSearch = skills.map((skill) => ({ skill,
    fields: [skill.name, skill.id, ...(skill.aliases ?? [])].filter(Boolean).map((value) => String(value).normalize("NFKC").toLowerCase()),
  }));
  return {
    spirits, skills, patches, seasons, spiritRecords, skillRecords,
    searchSpirits(query, limit = 60) {
      return spiritSearch.search(query, Math.max(0, limit)).map(({ id }) => spiritById.get(id));
    },
    searchSkills(query, limit = 60) {
      const needle = String(query ?? "").normalize("NFKC").trim().toLowerCase();
      return skillSearch.filter(({ fields }) => !needle || fields.some((field) => field.includes(needle)))
        .slice(0, Math.max(0, limit)).map(({ skill }) => skill);
    },
  };
}

// Imported only by the feature; the first open builds once for each snapshot.
export function getBalanceHistoryIndex(snapshot) {
  if (!snapshot || typeof snapshot !== "object") return buildIndex(null);
  if (!indexes.has(snapshot)) indexes.set(snapshot, buildIndex(snapshot));
  return indexes.get(snapshot);
}
