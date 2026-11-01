import { FORM_ROLE_MANIFEST } from "../../../data/form-role-manifest-v1.js";
import { hasCompleteRaceStats } from "../../../domain/stat.js";

const CANDYMO_S5_FORM_IDS = new Map([
  [3168, "spirit_preview_s5_abu"], [5068, "spirit_preview_s5_super-abu"],
  [3822, "spirit_preview_s5_daidailing"], [3823, "spirit_preview_s5_tiaotiaoling"],
  [3824, "spirit_preview_s5_lily-of-valley"],
]);

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
    (revision === 41360 || spirit?.provenance?.nrc?.id) &&
    spirit?.sourceCategory !== "S4前瞻"
  );
}

function resolveRecordedS5FormRole(spirit) {
  const identity = spirit?.previewIdentity;
  if (!/^s5(?:[-_:]|$)/iu.test(identity?.catalogId ?? "") ||
      spirit.id !== `spirit_preview_s5_${identity.key}` ||
      identity.raceStatsPlaceholder !== false || !hasCompleteRaceStats(spirit.raceStats)) return null;
  const evidence = identity.raceStatsEvidence;
  if (evidence?.kind !== "official-image" &&
      !(identity.kind === "boss" && evidence?.kind === "user-confirmed-baseline")) return null;
  if (identity.kind === "boss") {
    return { evolutionFamilyId: null, formRole: "boss", formRoleStatus: "preview" };
  }
  // The public CN subset may omit growth forms; retain the verified source chain.
  const chain = identity.evolutionChainKeys;
  if (identity.kind !== "family" || !Array.isArray(chain) || !chain.includes(identity.key)) return null;
  return {
    evolutionFamilyId: `s5-${chain[0]}`,
    formRole: chain.at(-1) === identity.key ? "final" : "growth",
    formRoleStatus: "preview",
  };
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
  const reviewed = spirit?.formRoleEvidence;
  if (reviewed?.kind === "bwiki-season" && Number.isSafeInteger(reviewed.revision) && reviewed.revision > 0 &&
      /^https:\/\/wiki\.biligame\.com\/nrc\//u.test(reviewed.url ?? "") &&
      ["growth", "final", "boss"].includes(spirit.formRole)) {
    return {
      evolutionFamilyId: spirit.evolutionFamilyId ?? null,
      formRole: spirit.formRole,
      formRoleStatus: "verified",
    };
  }
  if (reviewed?.kind === "candymo-reviewed" && reviewed.reviewId === "s5-candymo-20261101" &&
      reviewed.authority === "third-party-game-data-site" && CANDYMO_S5_FORM_IDS.get(reviewed.sourceId) === spirit.id &&
      reviewed.url === `https://app.candymo.com/pets/${reviewed.sourceId}` &&
      reviewed.apiUrl === `https://api.candymo.com/api/v1/pets/${reviewed.sourceId}` &&
      ["growth", "final", "boss"].includes(spirit.formRole)) {
    return { evolutionFamilyId: spirit.evolutionFamilyId ?? null,
      formRole: spirit.formRole, formRoleStatus: "verified" };
  }
  const sourceId = spirit?.id?.startsWith("cn-placeholder:")
    ? spirit.reference?.sourceId ?? spirit.id.slice("cn-placeholder:".length)
    : spirit?.id;
  const curated = FORM_ROLE_MANIFEST[sourceId];
  if (curated) {
    return {
      evolutionFamilyId: curated.evolutionFamilyId,
      formRole: curated.formRole,
      formRoleStatus: curated.formRoleStatus,
    };
  }
  const recordedS5 = resolveRecordedS5FormRole(spirit);
  if (recordedS5) return recordedS5;
  if (isVerifiedLegacySpirit(spirit, spiritFilterRevision)) {
    return {
      evolutionFamilyId: null,
      formRole: "growth",
      formRoleStatus: "verified",
    };
  }
  return UNKNOWN_FORM_ROLE;
}
