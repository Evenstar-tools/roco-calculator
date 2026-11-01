const MOON_MEMORY_TRAIT_NAME = "铭记于月亮";

export const MOON_MEMORY_TRAIT_LIMIT = 5;

export function canAcquireMoonMemoryTrait(trait) {
  return Boolean(trait) && trait.previewIdentity?.mechanicKey !== "unreleased" &&
    !trait.previewIdentity?.catalogId?.startsWith("candymo-hidden-");
}

function traitName(trait) {
  return String(trait?.displayName ?? trait?.name ?? "").trim();
}

export function hasMoonMemoryTrait(traits = []) {
  return traits.some((trait) => traitName(trait) === MOON_MEMORY_TRAIT_NAME);
}
