const FAMILY_MECHANICS = new Set([
  "minggulong", "underground-silver-dragon", "gold-vein-dragon",
]);

// Only these officially confirmed S5 families share one ability across forms.
// Keep the original IDs and stored values; this key only controls deduplication.
export function s5FamilyTraitIdentity(trait) {
  const identity = trait?.previewIdentity;
  if (typeof identity?.catalogId !== "string" || !/^s5(?:[-_:]|$)/iu.test(identity.catalogId) ||
      !FAMILY_MECHANICS.has(identity.mechanicKey)) return null;
  return `s5-family:${identity.mechanicKey}`;
}

export function preferredS5FamilyTraitId(trait) {
  return s5FamilyTraitIdentity(trait) ? `trait_preview_s5_${trait.previewIdentity.mechanicKey}` : null;
}
