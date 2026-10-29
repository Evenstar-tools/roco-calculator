import { resolveSpiritFormRole } from "./spirit-form-role.js";

const MINGGULONG_LEVELS = [99, 89, 79, 69];

function isPreviewMinggulong(spirit) {
  const identity = spirit.previewIdentity;
  return identity?.key === "minggulong" && identity.mechanicKey === "minggulong" &&
    /^s5(?:[-_:]|$)/iu.test(identity.catalogId ?? "");
}

export function resolveRankingFormRole(spirit, options = {}) {
  const form = resolveSpiritFormRole(spirit, options);
  // Level variants must not bypass the shared recorded-data eligibility check.
  if (options.includeLevelVariants !== false && isPreviewMinggulong(spirit) &&
      ["final", "boss"].includes(form.formRole)) {
    return { evolutionFamilyId: "s5-minggulong", formRole: "final", formRoleStatus: "preview" };
  }
  return form;
}

/** Ranking configurations keep the catalog identity separate from the level. */
export function createRankingLevelVariants(spirit, { includeLevelVariants = true } = {}) {
  const levels = includeLevelVariants && isPreviewMinggulong(spirit) ? MINGGULONG_LEVELS : [60];
  return levels.map(level => ({
    id: level === 60 ? spirit.id : `${spirit.id}:level:${level}`,
    level,
    name: level === 60 ? spirit.fullName : `${spirit.fullName} · ${level}级`,
  }));
}
