import { resolveBattleSpirit } from "./battle-form.js";
import { getS5PreviewTraitEvaluation } from "./s5-preview-traits.js";

const LEVEL_KEYS = new Set(["minggulong", "abu", "boss-abu", "super-abu"]);

function levelTrait(snapshot, side) {
  if (!side) return null;
  const spirit = resolveBattleSpirit(snapshot, side);
  const identity = spirit?.previewIdentity;
  if (!identity || !/^s5(?:[-_:]|$)/iu.test(identity.catalogId ?? "") || !LEVEL_KEYS.has(identity.key)) return null;
  const mechanicKey = identity.key === "minggulong" ? "minggulong" : "abu";
  if (identity.mechanicKey !== mechanicKey) return null;
  // Only the spirit's own catalog trait opts in. Acquired traits, names and
  // arbitrary context keys cannot unlock a level control for another spirit.
  return (snapshot.traits ?? []).find(trait => spirit.traitIds?.includes(trait.id) &&
    trait.previewIdentity?.catalogId === identity.catalogId &&
    trait.previewIdentity?.key === identity.key &&
    trait.previewIdentity?.mechanicKey === mechanicKey) ?? null;
}

/** Whether this catalog spirit owns the level mechanic, even when ignored. */
export function supportsS5PreviewBattleLevel(snapshot, side) {
  return levelTrait(snapshot, side) !== null;
}

export function getS5PreviewBattleLevelEvaluation(snapshot, state, sideKey) {
  const side = state?.sides?.[sideKey];
  if (side?.ignoreTraits === true) return null;
  const trait = levelTrait(snapshot, side);
  if (!trait) return null;
  const direction = sideKey === "attacker" ? "forward" : "reverse";
  return getS5PreviewTraitEvaluation(trait, "attacker", state?.directions?.[direction]?.context);
}

/** Initial Web preview level; the unknown Minggulong minimum stays guarded. */
export function resolveS5PreviewBattleLevel(snapshot, state, sideKey) {
  const level = getS5PreviewBattleLevelEvaluation(snapshot, state, sideKey)?.currentLevel;
  return Number.isSafeInteger(level) && level >= 1 && level <= 99 ? level : 60;
}

/** Derived input only: do not persist this projection into the session. */
export function withS5PreviewBattleLevels(snapshot, state) {
  const sides = { ...state.sides };
  for (const sideKey of ["attacker", "defender"]) {
    const side = state.sides[sideKey];
    if (!side) continue;
    sides[sideKey] = { ...side, level: resolveS5PreviewBattleLevel(snapshot, state, sideKey) };
    if (levelTrait(snapshot, side)) delete sides[sideKey].panelStats;
  }
  return { ...state, sides };
}
