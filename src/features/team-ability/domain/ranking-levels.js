import { resolveSpiritFormRole } from "./spirit-form-role.js";

const MINGGULONG_LEVELS = [99, 89, 79, 69];

function isPreviewMinggulong(spirit) {
  const identity = spirit.previewIdentity;
  return identity?.key === "minggulong" && identity.mechanicKey === "minggulong" &&
    /^s5(?:[-_:]|$)/iu.test(identity.catalogId ?? "");
}

export function resolveRankingFormRole(spirit, options = {}) {
  // This requested preview entry is absent from the pinned S4 form manifest.
  if (options.includeLevelVariants !== false && isPreviewMinggulong(spirit)) {
    return { evolutionFamilyId: "s5-minggulong", formRole: "final", formRoleStatus: "preview" };
  }
  return resolveSpiritFormRole(spirit, options);
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
