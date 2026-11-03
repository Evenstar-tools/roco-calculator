import { getInheritedDamageTraits } from "./trait-effects.js";
import { s5FamilyTraitIdentity } from "../features/s5-preview/family-trait-identity.js";
import {
  canAcquireMoonMemoryTrait,
  hasMoonMemoryTrait,
  MOON_MEMORY_TRAIT_LIMIT,
} from "./moon-memory.js";

const traitIndexCache = new WeakMap();

function traitIndex(traits) {
  const cached = traitIndexCache.get(traits);
  if (cached) return cached;
  const index = Object.fromEntries(traits.map(trait => [trait.id, trait]));
  // Mutable records may change their IDs even when the surrounding array is frozen.
  if (Object.isFrozen(traits) && traits.every(Object.isFrozen)) traitIndexCache.set(traits, index);
  return index;
}

function traitKey(trait) {
  return s5FamilyTraitIdentity(trait) ?? String(trait?.id ?? trait?.name ?? "").trim();
}

function appendUnique(target, seen, trait) {
  if (!trait) return;
  const key = traitKey(trait);
  if (!key || seen.has(key)) return;
  seen.add(key);
  target.push(trait);
}

export function getEffectiveTraits(snapshot, side = {}) {
  if (side.ignoreTraits === true) return [];
  const spirit = side.spirit ?? null;
  const traitsById = traitIndex(snapshot?.traits ?? []);
  const result = [];
  const nativeTraits = [];
  const seen = new Set();
  const nativeSeen = new Set();

  for (const trait of side.traits ?? []) {
    appendUnique(result, seen, trait);
  }
  for (const traitId of spirit?.traitIds ?? []) {
    const trait = traitsById[traitId];
    appendUnique(nativeTraits, nativeSeen, trait);
    appendUnique(result, seen, trait);
  }
  if (nativeTraits.length === 0 && String(spirit?.traitName ?? "").trim()) {
    const fallbackTrait = {
      description: spirit.traitDescription,
      name: spirit.traitName,
    };
    appendUnique(nativeTraits, nativeSeen, fallbackTrait);
    appendUnique(result, seen, fallbackTrait);
  }
  for (const traitId of side.traitIds ?? []) {
    appendUnique(result, seen, traitsById[traitId]);
  }
  const canAcquireTraits = hasMoonMemoryTrait(nativeTraits);
  if (canAcquireTraits) {
    for (const traitId of (side.acquiredTraitIds ?? []).slice(
      0,
      MOON_MEMORY_TRAIT_LIMIT,
    )) {
      const trait = traitsById[traitId];
      if (!canAcquireMoonMemoryTrait(trait) || seen.has(traitKey(trait))) continue;
      appendUnique(result, seen, {
        ...trait,
        acquired: true,
        runtimeInputValues: {
          ...(side.acquiredTraitValues?.[traitId] ?? {}),
        },
      });
    }
  }
  for (const trait of getInheritedDamageTraits(spirit)) {
    appendUnique(result, seen, trait);
  }

  return result;
}
