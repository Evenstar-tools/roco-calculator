// Explicit entity metadata keeps historical calculations independent of the live CN season.
export const S3_MIDSEASON_RULESET = "s3-midseason-2026-08-13";
export function usesS3MidseasonRules(entity) {
  return entity?.calculationRuleset === S3_MIDSEASON_RULESET;
}
