import { resolveSpiritFormRole } from "./spirit-form-role.js";

const MINGGULONG_LEVELS = [99, 89, 79, 69];
const SUPER_ABU_LEVELS = [99, 90, 80, 70];

function rankingLevels(spirit) {
  const identity = spirit.previewIdentity;
  if (!/^s5(?:[-_:]|$)/iu.test(identity?.catalogId ?? "")) return null;
  if (identity.key === "minggulong" && identity.mechanicKey === "minggulong") return MINGGULONG_LEVELS;
  if (identity.key === "super-abu" && identity.mechanicKey === "super-abu") return SUPER_ABU_LEVELS;
  return null;
}

export function resolveRankingFormRole(spirit, options = {}) {
  const form = resolveSpiritFormRole(spirit, options);
  // Level variants must not bypass the shared recorded-data eligibility check.
  if (rankingLevels(spirit) === MINGGULONG_LEVELS &&
      ["final", "boss"].includes(form.formRole)) {
    return { evolutionFamilyId: "s5-minggulong", formRole: "final", formRoleStatus: "preview" };
  }
  return form;
}

/** Ranking configurations keep the catalog identity separate from the level. */
export function createRankingLevelVariants(spirit, { includeLevelVariants = true } = {}) {
  const levels = (includeLevelVariants && rankingLevels(spirit)) || [60];
  return levels.map(level => ({
    id: level === 60 ? spirit.id : `${spirit.id}:level:${level}`,
    level,
    name: level === 60 ? spirit.fullName : `${spirit.fullName} · ${level}级`,
  }));
}
