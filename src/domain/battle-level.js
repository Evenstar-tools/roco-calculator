import { resolveBattleSpirit } from "./battle-form.js";
import { getS5PreviewTraitInputs, getS5PreviewTraitEvaluation } from "./s5-preview-traits.js";
import { usesS3MidseasonRules } from "./season-rules.js";

const LEVEL_KEYS = new Set(["minggulong", "abu", "boss-abu", "super-abu"]);

function levelTrait(snapshot, side) {
  if (!side) return null;
  const spirit = resolveBattleSpirit(snapshot, side);
  // A battle form keeps its original trait when the form has a different one.
  // Validate the identity of that native owner, not the current stat form.
  const traitSource = spirit?.battleFormTraitRetained ? spirit.traitSourceSpirit : spirit;
  const identity = traitSource?.previewIdentity;
  if (!identity || !/^s5(?:[-_:]|$)/iu.test(identity.catalogId ?? "") || !LEVEL_KEYS.has(identity.key)) return null;
  const mechanicKey = identity.key === "minggulong" ? "minggulong"
    : identity.key === "super-abu" && identity.mechanicKey === "super-abu" ? "super-abu" : "abu";
  if (identity.mechanicKey !== mechanicKey) return null;
  // Only the spirit's own catalog trait opts in. Acquired traits, names and
  // arbitrary context keys cannot unlock a level control for another spirit.
  return (snapshot.traits ?? []).find(trait => spirit.traitIds?.includes(trait.id) &&
    traitSource.traitIds?.includes(trait.id) &&
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

export function getS5SkillBattleLevelChange(skill) {
  return !usesS3MidseasonRules(skill) && skill?.s5LevelChangeRule === "saint-dragon-slash" ? -5 : 0;
}

export function getS5SkillBattleLevelControl(snapshot, state, sideKey, skill) {
  if (!getS5SkillBattleLevelChange(skill) ||
      getS5PreviewBattleLevelEvaluation(snapshot, state, sideKey)?.calcStatus !== "ready") return null;
  return getS5PreviewTraitInputs(levelTrait(snapshot, state.sides[sideKey]), "attacker")
    ?.find(control => control.contextKey.endsWith("BattleLevel")) ?? null;
}

/** Initial Web preview level; the unknown Minggulong minimum stays guarded. */
export function resolveS5PreviewBattleLevel(snapshot, state, sideKey) {
  const evaluation = getS5PreviewBattleLevelEvaluation(snapshot, state, sideKey);
  const level = evaluation?.currentLevel;
  const maximum = evaluation?.mechanicKey === "minggulong" ? 99 : 150;
  return Number.isSafeInteger(level) && level >= 1 && level <= maximum ? level : 60;
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
