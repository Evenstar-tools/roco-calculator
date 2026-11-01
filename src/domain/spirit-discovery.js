// Discovery rules never delete entities or saved configurations.
export function isSpiritDiscoveryHidden(spirit) {
  return spirit?.catalogAvailable === false ||
    spirit?.id === "spirit_preview_s5_boss-abu" ||
    spirit?.previewIdentity?.key === "boss-abu" ||
    spirit?.fullName === "圣龙阿布";
}

export function isSpiritSearchOnly(spirit) {
  return spirit?.previewIdentity?.catalogId?.startsWith("candymo-hidden-") === true ||
    spirit?.previewIdentity?.raceStatsPlaceholder === true ||
    spirit?.calculationStatus === "pending-race-stats";
}

export function canRecommendSpirit(spirit) {
  return !isSpiritDiscoveryHidden(spirit) && !isSpiritSearchOnly(spirit);
}
