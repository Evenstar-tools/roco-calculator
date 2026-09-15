import { calculateAllPanelStats } from "../stat.js";
import { reducedSkillCost } from "../refraction.js";
import { getEffectiveTraits } from "../effective-traits.js";
import { pressureValveUseCount } from "../skill-status-effects.js";

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
  return Object.fromEntries(Object.entries(pressureValvePowerSources(entries, skillsById))
    .map(([slot, sources]) => [slot, sources.reduce((sum, source) => sum + source.amount, 0)]));
}

export function pressureValvePowerSources(entries, skillsById) {
  if (entries.length < 4) return {};
  const additions = {};
  entries.slice(0, 4).forEach((entry, index) => {
    const skill = resolveSkillEntity(entry, skillsById);
    if (skill?.name !== "减压阀") return;
    const useCount = pressureValveUseCount(skill, entryDetails(entry).context);
    const bonus = 10 + useCount * 20;
    const sources = [{ kind: "skill", id: `${skill.id}:${index}:passive`, name: `减压阀·被动 +${bonus}${useCount ? `（使用${useCount}次）` : ""}`, count: 0, amount: bonus }];
    for (const adjacentIndex of [(index + 3) % 4, (index + 1) % 4]) {
      const skillPosition = adjacentIndex + 1;
      additions[skillPosition] = [...(additions[skillPosition] ?? []), ...sources];
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

export function carriedSkillTotalCost(side, mode, skillsById, costOverrides) {
  return collectCarriedSkills(side, mode, skillsById).reduce(
    (total, skill) => total + (reducedSkillCost(skill.cost, costOverrides) ?? 0), 0,
  );
}

export function resolveCombatant(
  snapshot,
  side,
  mode,
  indexes,
  costOverrides,
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
  const traits = getEffectiveTraits(snapshot, { ...side, spirit });
  const carriedSkills = collectCarriedSkills(side, mode, indexes.skills);

  return {
    ...side,
    spirit,
    types: side.types ?? spirit.types ?? [],
    panelStats,
    traits,
    skillTypes: carriedSkills.map((skill) => skill.type).filter(Boolean),
    totalSkillCost: carriedSkillTotalCost(side, mode, indexes.skills, costOverrides),
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
