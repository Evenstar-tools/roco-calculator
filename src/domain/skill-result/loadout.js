import { calculateAllPanelStats } from "../stat.js";
import { getInheritedDamageTraits } from "../trait-effects.js";
import { finiteNumber } from "./numeric.js";

function resolveNatureMultipliers(side, snapshot) {
  if (side.natureMultipliers) return side.natureMultipliers;
  if (side.nature?.multipliers) return side.nature.multipliers;
  if (side.nature && typeof side.nature === "object") return side.nature;
  if (typeof side.nature === "string" && Array.isArray(snapshot.natures)) {
    return (
      snapshot.natures.find(
        (nature) => nature.id === side.nature || nature.name === side.nature,
      )?.multipliers ?? {}
    );
  }
  return {};
}

export function skillEntriesForMode(side, mode) {
  if (mode === "four") {
    const entries = side.skills?.four ?? side.fourSkills ?? [];
    return Array.from(
      { length: Math.max(4, entries.length) },
      (_, index) => entries[index] ?? null,
    );
  }
  const single = side.skills?.single ?? side.singleSkill ?? side.skill ?? null;
  return [Array.isArray(single) ? (single[0] ?? null) : single];
}

export function resolveSkillEntity(entry, skillsById) {
  if (!entry) return null;
  if (typeof entry === "string") return skillsById[entry] ?? null;
  if (entry.skill && typeof entry.skill === "object") return entry.skill;
  const skillId = entry.skillId ?? entry.id;
  return skillsById[skillId] ?? (entry.category ? entry : null);
}

export function resolveEmbeddedDamageSkill(skill) {
  if (skill?.name !== "硬门") return skill;
  return {
    ...skill,
    basePower: 90,
    category: "physical",
    type: "武",
  };
}

export function isAdjacentPowerSkill(skill) {
  return skill?.name === "六自由度" || skill?.name === "钢钻";
}

export function entryDetails(entry) {
  return entry && typeof entry === "object" ? entry : {};
}

export function pressureValveFixedPowerAdds(entries, skillsById) {
  if (entries.length < 4) return {};
  const additions = {};
  entries.slice(0, 4).forEach((entry, index) => {
    if (resolveSkillEntity(entry, skillsById)?.name !== "减压阀") return;
    const useCount = Math.max(
      0,
      Math.floor(Number(entryDetails(entry).context?.pressureValveUseCount) || 0),
    );
    const bonus = 10 + useCount * 20;
    for (const adjacentIndex of [(index + 3) % 4, (index + 1) % 4]) {
      const skillPosition = adjacentIndex + 1;
      additions[skillPosition] = (additions[skillPosition] ?? 0) + bonus;
    }
  });
  return additions;
}

function carriedSkillEntries(side, mode) {
  const four = side.skills?.four ?? side.fourSkills;
  if (Array.isArray(four) && four.some(Boolean)) {
    return Array.from(
      { length: Math.max(4, four.length) },
      (_, index) => four[index] ?? null,
    );
  }
  return skillEntriesForMode(side, mode);
}

function collectCarriedSkills(side, mode, skillsById) {
  return carriedSkillEntries(side, mode)
    .map((entry) => resolveSkillEntity(entry, skillsById))
    .filter(Boolean);
}

export function resolveCombatant(
  snapshot,
  side,
  mode,
  indexes,
) {
  const spirit =
    indexes.spirits[side.spiritId] ??
    side.spirit ??
    (side.raceStats ? side : null);
  if (!spirit) {
    throw new Error(`Unknown spirit: ${side.spiritId ?? "missing"}`);
  }

  const panelStats =
    side.panelStats ??
    calculateAllPanelStats({
      raceStats: spirit.raceStats,
      displayIvs: side.displayIvs,
      natureMultipliers: resolveNatureMultipliers(side, snapshot),
    });
  const traitIds = side.traitIds ?? spirit.traitIds ?? [];
  const traits = [
    ...(side.traits ?? []),
    ...traitIds
      .map((traitId) => indexes.traits[traitId])
      .filter(Boolean),
    ...getInheritedDamageTraits(spirit),
  ];
  const carriedSkills = collectCarriedSkills(side, mode, indexes.skills);

  return {
    ...side,
    spirit,
    types: side.types ?? spirit.types ?? [],
    panelStats,
    traits,
    skillTypes: carriedSkills.map((skill) => skill.type).filter(Boolean),
    totalSkillCost: carriedSkills.reduce(
      (total, skill) => total + (finiteNumber(skill.cost) ?? 0),
      0,
    ),
  };
}

export function statKeysForCategory(category, panelStats = {}) {
  if (category === "physical") {
    return { attack: "physicalAttack", defense: "physicalDefense" };
  }
  if (category === "magical") {
    return { attack: "magicalAttack", defense: "magicalDefense" };
  }
  if (category === "dual") {
    return Number(panelStats.physicalAttack) >=
      Number(panelStats.magicalAttack)
      ? { attack: "physicalAttack", defense: "physicalDefense" }
      : { attack: "magicalAttack", defense: "magicalDefense" };
  }
  return null;
}
