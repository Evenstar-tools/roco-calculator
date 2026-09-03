import { FORM_ROLE_MANIFEST } from "../../../data/form-role-manifest-v1.js";

const UNKNOWN_FORM_ROLE = Object.freeze({
  evolutionFamilyId: null,
  formRole: "unknown",
  formRoleStatus: "manual",
});

function isVerifiedLegacySpirit(spirit, spiritFilterRevision) {
  const revision =
    spirit?.source?.title === "精灵筛选"
      ? Number(spirit.source.revision)
      : Number(spiritFilterRevision);
  return (
    revision === 41360 &&
    spirit?.sourceCategory !== "S4前瞻"
  );
}

export function resolveSpiritFormRole(spirit, { spiritFilterRevision } = {}) {
  if (
    spirit?.stage === "首领" &&
    spirit?.sourceCategory === "首领形态"
  ) {
    return {
      evolutionFamilyId: null,
      formRole: "boss",
      formRoleStatus: "verified",
    };
  }
  const curated = FORM_ROLE_MANIFEST[spirit?.id];
  if (curated) {
    return {
      evolutionFamilyId: curated.evolutionFamilyId,
      formRole: curated.formRole,
      formRoleStatus: curated.formRoleStatus,
    };
  }
  if (isVerifiedLegacySpirit(spirit, spiritFilterRevision)) {
    return {
      evolutionFamilyId: null,
      formRole: "growth",
      formRoleStatus: "verified",
    };
  }
  return UNKNOWN_FORM_ROLE;
}
