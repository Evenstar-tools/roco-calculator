import { getSnapshotIndexes } from "./snapshot-indexes.js";
import {
  getSpiritSkillSlotCapacity,
  normalizeSkillSlots,
} from "./skill-slot-capacity.js";

const choiceCache = new WeakMap();

function entryId(entry) {
  if (typeof entry === "string") return entry;
  return entry?.skillId ?? entry?.id ?? null;
}

function isWishPowerExtra(skill) {
  return skill?.id?.startsWith("calculator_wish_power_") ?? false;
}

export function getLegalSkillIds(snapshot, spiritId) {
  return [...new Set([
    ...(getSnapshotIndexes(snapshot).learnsets[spiritId]?.skillIds ?? []),
  ])];
}

export function getSkillChoices(snapshot, spiritId) {
  let choicesBySpirit = choiceCache.get(snapshot);
  if (!choicesBySpirit) {
    choicesBySpirit = new Map();
    choiceCache.set(snapshot, choicesBySpirit);
  }
  const cached = choicesBySpirit.get(spiritId);
  if (cached) return cached;

  const legalIds = getLegalSkillIds(snapshot, spiritId);
  const legalSet = new Set(legalIds);
  const byId = getSnapshotIndexes(snapshot).skills;
  const legal = legalIds
    .map((id) => byId[id])
    .filter(Boolean)
    .map((skill) => ({ ...skill, learnable: true }));
  const other = Object.values(byId)
    .filter((skill) => !legalSet.has(skill.id))
    .map((skill) => ({ ...skill, learnable: false }));
  const choices = [...legal, ...other];
  choicesBySpirit.set(spiritId, choices);
  return choices;
}

export function chooseDefaultSkillIds(snapshot, spiritId) {
  const capacity = getSpiritSkillSlotCapacity(snapshot, spiritId);
  const legalIds = getLegalSkillIds(snapshot, spiritId);
  const byId = getSnapshotIndexes(snapshot).skills;
  const legal = legalIds.map((id) => byId[id]).filter(Boolean);
  const defaultCandidates = legal.filter((skill) => !isWishPowerExtra(skill));
  const damaging = defaultCandidates.filter(
    (skill) =>
      Number.isFinite(skill.basePower) &&
      skill.basePower > 0 &&
      (skill.category === "physical" || skill.category === "magical"),
  );
  const preferredNames = ["风力冲击", "威力冲击", "当头棒喝"];
  const preferred = preferredNames
    .map((name) => damaging.find((skill) => skill.name === name))
    .find(Boolean);
  const ordered = [preferred, ...damaging, ...defaultCandidates].filter(Boolean);
  const chosen = [
    ...new Map(ordered.map((skill) => [skill.id, skill])).values(),
  ]
    .slice(0, capacity)
    .map((skill) => skill.id);
  return normalizeSkillSlots(chosen, capacity);
}

export function reconcileSkillLoadout(currentSkills, legalSkillIds, capacity = 4) {
  const legal = [...new Set(legalSkillIds.filter(Boolean))];
  const legalSet = new Set(legal);
  const used = new Set();
  const currentFour = normalizeSkillSlots(currentSkills?.four, capacity);

  for (const entry of currentFour) {
    const id = entryId(entry);
    if (id && legalSet.has(id)) used.add(id);
  }

  const replacements = legal.filter((id) => !used.has(id));
  const four = currentFour.map((entry) => {
    const id = entryId(entry);
    if (id && legalSet.has(id)) return entry;
    return replacements.shift() ?? null;
  });
  const currentSingleId = entryId(currentSkills?.single);
  const single =
    currentSingleId && legalSet.has(currentSingleId)
      ? currentSkills.single
      : four.find((entry) => entryId(entry)) ?? null;

  return { four, single };
}
