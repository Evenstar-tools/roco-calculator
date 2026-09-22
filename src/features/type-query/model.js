import { ELEMENT_TYPES, getTypeMultiplier } from "../../domain/type-chart.js";
import { resolveSpiritFormRole } from "../team-ability/domain/spirit-form-role.js";

function normalizeTypes(types) {
  return [...new Set(types.filter((type) => ELEMENT_TYPES.includes(type)))].slice(0, 2);
}

export function toggleQueryType(types, type) {
  const current = normalizeTypes(types);
  if (current.includes(type)) return current.filter((item) => item !== type);
  return normalizeTypes([...current, type]);
}

export function findFinalDualTypeSpirits(spirits, selectedTypes, { spiritFilterRevision } = {}) {
  const types = normalizeTypes(selectedTypes);
  if (types.length !== 2 || !Array.isArray(spirits)) return [];
  return spirits
    .filter((spirit) =>
      Array.isArray(spirit?.types)
        && spirit.types.length === 2
        && types.every((type) => spirit.types.includes(type))
        && resolveSpiritFormRole(spirit, { spiritFilterRevision }).formRole === "final",
    )
    .filter((spirit, index, matches) => matches.findIndex(({ id }) => id === spirit.id) === index)
    .sort((left, right) => (left.fullName ?? "").localeCompare(right.fullName ?? "", "zh-CN"));
}

export function buildTypeQuery(selectedTypes, chart) {
  const types = normalizeTypes(selectedTypes);
  if (!types.length) return { types, defense: [], offense: [] };
  return {
    types,
    defense: ELEMENT_TYPES.map((type) => ({
      type,
      multiplier: getTypeMultiplier(type, types, chart),
      parts: types.map((defender) => ({
        type: defender,
        multiplier: getTypeMultiplier(type, [defender], chart),
      })),
    })),
    offense: ELEMENT_TYPES.map((type) => {
      const parts = types.map((attacker) => ({
        type: attacker,
        multiplier: getTypeMultiplier(attacker, [type], chart),
      }));
      return { type, multiplier: Math.max(...parts.map((part) => part.multiplier)), parts };
    }),
  };
}
