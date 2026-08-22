import { ELEMENT_TYPES, getTypeMultiplier } from "./type-chart.js";

function resolveMember(member, slotIndex, spiritById) {
  if (!member || member.needsRepair) return null;
  const spirit = spiritById.get(member.spiritId);
  if (!spirit || !Array.isArray(spirit.types) || spirit.types.length === 0) {
    return null;
  }
  return {
    assetUrl: spirit.asset?.localUrl ?? null,
    name: spirit.fullName ?? spirit.name ?? "未知精灵",
    slotIndex,
    spiritId: spirit.id,
    types: spirit.types,
  };
}

export function analyzeTeamDefensiveTypes({
  members = [],
  spirits = [],
  typeChart,
} = {}) {
  const spiritById = new Map(spirits.map((spirit) => [spirit.id, spirit]));
  const configuredMembers = members
    .map((member, index) => resolveMember(member, index, spiritById))
    .filter(Boolean);
  const occupiedCount = members.filter(Boolean).length;

  const rows = ELEMENT_TYPES.map((type, order) => {
    const matchups = configuredMembers.map((member) => ({
      ...member,
      multiplier: getTypeMultiplier(type, member.types, typeChart),
    }));
    const weakMembers = matchups.filter(({ multiplier }) => multiplier > 1);
    const resistantMembers = matchups.filter(
      ({ multiplier }) => multiplier > 0 && multiplier < 1,
    );
    const immuneMembers = matchups.filter(({ multiplier }) => multiplier === 0);

    return {
      immuneMembers,
      immunityCount: immuneMembers.length,
      neutralCount: matchups.filter(({ multiplier }) => multiplier === 1)
        .length,
      order,
      resistanceCount: resistantMembers.length,
      resistantMembers,
      type,
      weakCount: weakMembers.length,
      weakMembers,
    };
  });

  const riskRows = rows
    .filter(({ weakCount }) => weakCount > 0)
    .sort(
      (left, right) =>
        right.weakCount - left.weakCount ||
        right.weakMembers.filter(({ multiplier }) => multiplier === 3).length -
          left.weakMembers.filter(({ multiplier }) => multiplier === 3).length ||
        left.resistanceCount - right.resistanceCount ||
        left.order - right.order,
    );

  return {
    configuredCount: configuredMembers.length,
    riskRows,
    rows,
    skippedCount: occupiedCount - configuredMembers.length,
  };
}
