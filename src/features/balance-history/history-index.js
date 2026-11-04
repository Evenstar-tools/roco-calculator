import { mergeEntityChangeInfo } from "../../data/entity-change-history.js";
import { createSpiritSearchIndex } from "../../data/search-index.js";
import { buildSpiritFamilyIndex } from "../../components/spirit-family.js";

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

// Adapt explicit raw/runtime relationships to the existing discovery helper.
// These copies only carry links; every public family member stays the original entity.
function buildFamilies(spirits) {
  const byId = new Map(spirits.map((spirit) => [spirit.id, spirit]));
  const byName = new Map(spirits.filter((spirit) => spirit.fullName ?? spirit.name)
    .map((spirit) => [spirit.fullName ?? spirit.name, spirit.id]));
  const groupOwners = new Map(["familyId", "evolutionGroupId"].map((field) => [field, new Map()]));
  const variants = new Map();
  const linkedSpirits = spirits.map((spirit) => {
    const ids = new Set(spirit.evolutionChainIds ?? []);
    for (const name of spirit.evolutionChainNames ?? []) {
      if (byName.has(name)) ids.add(byName.get(name));
    }
    for (const [field, owners] of groupOwners) {
      const group = spirit[field];
      if (group == null || String(group).trim() === "") continue;
      if (owners.has(group)) ids.add(owners.get(group));
      else owners.set(group, spirit.id);
      // familyId can explicitly identify a member that does not repeat the field.
      if (field === "familyId" && byId.has(group)) ids.add(group);
    }
    // Match the catalog's explicit base-name + form relationship, including forms
    // without dex numbers. A shared dex number alone never creates a relationship.
    if (spirit.baseName) {
      const previous = variants.get(spirit.baseName);
      if (previous && (previous.variantName || spirit.variantName)) ids.add(previous.id);
      else if (!previous) variants.set(spirit.baseName, spirit);
    }
    return { ...spirit, evolutionChainIds: [...ids] };
  });
  const membership = buildSpiritFamilyIndex(linkedSpirits);
  const families = [];
  const familyBySpiritId = new Map();
  for (const spirit of spirits) {
    if (familyBySpiritId.has(spirit.id)) continue;
    const members = membership.get(spirit.id).map((member) => byId.get(member.id));
    const family = { id: spirit.id, representative: spirit, members };
    families.push(family);
    for (const member of members) familyBySpiritId.set(member.id, family);
  }
  return { families, familyBySpiritId };
}

// Compare every item field, including nested values, without depending on object
// insertion order. Array order and distinct labels/notes/skill identities stay intact.
function historyItemIdentity(item) {
  return JSON.stringify(item, (_key, value) => value && typeof value === "object" && !Array.isArray(value)
    ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, value[key]])) : value);
}

// Regroup one batch for reading: stats by spirit (families kept together), skill changes by
// skill with the spirits that use it, learnset by learned skill; identical trait/other
// changes are listed once with every spirit they apply to.
export function groupBatch(entries = [], familyOf = () => null) {
  const stats = new Map(), skills = new Map(), learnset = new Map(), traits = new Map(), other = new Map();
  const take = (map, key, make) => map.get(key) ?? map.set(key, make()).get(key);
  for (const { entity, record, skill } of entries) {
    const own = { stats: [], traits: [], other: [] };
    for (const item of record.items ?? []) {
      const group = classifyHistoryItem(item);
      const [owner, ...rest] = String(item.label ?? "").split("·");
      if (group === "skills" && (skill || rest.length)) {
        const name = skill ? entity.name : owner;
        const card = take(skills, name, () => ({ name, skill: null, items: [], users: [] }));
        const label = skill ? item.label : rest.join("·");
        if (skill) card.skill = entity;
        else if (!card.users.includes(entity)) card.users.push(entity);
        // The same rewrite is sometimes recorded twice (技能效果 and 机制); keep one.
        if (!card.items.some((known) => known.label === label || known.before === item.before && known.after === item.after)) card.items.push({ ...item, label });
      } else if (group === "learnset") {
        const removed = item.after == null;
        const row = take(learnset, `${removed ? "-" : "+"}${removed ? item.before : item.after}`, () => ({ item, removed, entities: [] }));
        if (!row.entities.includes(entity)) row.entities.push(entity);
      } else own[group === "stats" || group === "traits" ? group : "other"].push(item);
    }
    if (own.stats.length) take(stats, familyOf(entity) ?? entity, () => []).push({ entity, items: own.stats,
      total: own.stats.reduce((sum, item) => sum + (item.after - item.before || 0), 0) });
    for (const [map, items] of [[traits, own.traits], [other, own.other]]) {
      if (items.length) take(map, historyItemIdentity(items), () => ({ items, entities: [] })).entities.push(entity);
    }
  }
  const sum = (members) => members.reduce((total, member) => total + member.total, 0);
  return {
    stats: [...stats].map(([owner, members]) => ({ owner, members })).sort((left, right) => sum(right.members) - sum(left.members)),
    skills: [...skills.values()], traits: [...traits.values()], other: [...other.values()],
    learnset: [...learnset.values()].sort((left, right) => left.removed - right.removed || right.entities.length - left.entities.length),
  };
}

function buildFamilyRecords(families, spiritRecords) {
  const familyRecords = new Map();
  for (const family of families) {
    const batches = new Map();
    const memberOrder = new Map(family.members.map((member, index) => [member.id, index]));
    for (const member of family.members) {
      for (const record of spiritRecords.get(member.id) ?? []) {
        const id = record.patch?.id;
        // Unknown patches cannot acquire a common scope merely by sharing a date.
        const key = id != null && String(id).trim() !== "" ? id : record;
        if (!batches.has(key)) batches.set(key, { patch: record.patch, entries: new Map() });
        const batch = batches.get(key);
        for (const item of record.items) {
          const identity = historyItemIdentity(item);
          if (!batch.entries.has(identity)) batch.entries.set(identity, { item, members: new Set() });
          batch.entries.get(identity).members.add(member.id);
        }
      }
    }
    const records = [...batches.values()].map(({ patch, entries }) => {
      const scopesByMembers = new Map();
      for (const { item, members: applicable } of entries.values()) {
        const members = family.members.filter((member) => applicable.has(member.id));
        const key = members.map((member) => memberOrder.get(member.id)).join(",");
        if (!scopesByMembers.has(key)) scopesByMembers.set(key, { members, items: [] });
        scopesByMembers.get(key).items.push(item);
      }
      const scopes = [...scopesByMembers.values()].sort((left, right) => {
        if (left.members.length !== right.members.length) return right.members.length - left.members.length;
        for (let index = 0; index < left.members.length; index += 1) {
          const order = memberOrder.get(left.members[index].id) - memberOrder.get(right.members[index].id);
          if (order) return order;
        }
        return 0;
      });
      return { patch, items: [...entries.values()].map(({ item }) => item), scopes };
    }).sort((left, right) => comparePatches(left.patch, right.patch));
    familyRecords.set(family.id, records);
  }
  return familyRecords;
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
  const patches = [...batches.values()].map(({ patch, ...counts }) => ({
    ...normalizePatch(patch), ...counts,
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
  const { families, familyBySpiritId } = buildFamilies(spirits);
  const familyRecords = buildFamilyRecords(families, spiritRecords);
  const spiritSearch = createSpiritSearchIndex(spirits);
  const spiritById = new Map(spirits.map((spirit) => [spirit.id, spirit]));
  const skillSearch = skills.map((skill) => ({ skill,
    fields: [skill.name, skill.id, ...(skill.aliases ?? [])].filter(Boolean).map((value) => String(value).normalize("NFKC").toLowerCase()),
  }));
  return {
    spirits, skills, patches, seasons, spiritRecords, skillRecords, families, familyBySpiritId, familyRecords,
    searchSpirits(query, limit = 60) {
      return spiritSearch.search(query, Math.max(0, limit)).map(({ id }) => spiritById.get(id));
    },
    searchFamilies(query, limit = 60) {
      const matches = new Set(spiritSearch.search(query, Infinity).map(({ id }) => familyBySpiritId.get(id)));
      return [...matches].slice(0, Math.max(0, limit));
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
