import { getSnapshotIndexes } from "./snapshot-indexes.js";

export const DEFAULT_SKILL_SLOT_CAPACITY = 4;
export const EXTRA_SKILL_SLOT_CAPACITY = 7;

function hasExtraSkillSlots(trait) {
  const name = trait?.displayName ?? trait?.name;
  return name === "夺目" || /额外获得三个[^。]*技能/.test(trait?.description ?? "");
}

export function getSpiritSkillSlotCapacity(snapshot, spiritId) {
  const indexes = getSnapshotIndexes(snapshot);
  const spirit = indexes.spirits[spiritId];
  if (!spirit) return DEFAULT_SKILL_SLOT_CAPACITY;
  if (spirit.traitName === "夺目") return EXTRA_SKILL_SLOT_CAPACITY;
  const traits = (spirit.traitIds ?? [])
    .map((traitId) => indexes.traits[traitId])
    .filter(Boolean);
  return traits.some(hasExtraSkillSlots)
    ? EXTRA_SKILL_SLOT_CAPACITY
    : DEFAULT_SKILL_SLOT_CAPACITY;
}

export function normalizeSkillSlots(entries, capacity = DEFAULT_SKILL_SLOT_CAPACITY) {
  const normalizedCapacity = Number(capacity) === EXTRA_SKILL_SLOT_CAPACITY
    ? EXTRA_SKILL_SLOT_CAPACITY
    : DEFAULT_SKILL_SLOT_CAPACITY;
  return Array.from(
    { length: normalizedCapacity },
    (_, index) => entries?.[index] ?? null,
  );
}
