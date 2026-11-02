import { supportsS5PreviewBattleLevel } from "../shared/domain/battle-level.js";
import { getSpirit, getTraitView } from "../shared/domain/calculator-view-model.js";
import { correctS5PreviewLevelInputs } from "../shared/features/s5-preview/level-input-migration.js";
import { canonicalTraitControlKey, extractTraitValues } from "../shared/state/trait-values.js";

// Product defaults belong to the miniapp state, not the shared trait control:
// changing that control's default would also change its persisted identifier.
export function withMiniappBattleLevelDefaults(snapshot, state) {
  let next = state;
  const migrated = correctS5PreviewLevelInputs(state);
  for (const [sideKey, outgoing, incoming] of [
    ["attacker", "forward", "reverse"], ["defender", "reverse", "forward"],
  ]) {
    const side = state.sides?.[sideKey];
    if (!supportsS5PreviewBattleLevel(snapshot, side)) continue;
    const spirit = getSpirit(snapshot, side);
    const controls = ["attacker", "defender"].map(role =>
      getTraitView(snapshot, spirit, role)?.inputs.find(input => input.contextKey.endsWith("S5BattleLevel")));
    if (!controls[0]) continue;
    const key = canonicalTraitControlKey(controls[0]);
    if (Object.hasOwn(side.traitValues ?? {}, key)) continue;
    const saved = extractTraitValues(correctS5PreviewLevelInputs(side), snapshot);
    let level = saved[key];
    if (level === undefined) {
      const entries = [side.skills?.single, ...(side.skills?.four ?? [])]
        .filter(entry => entry && typeof entry === "object");
      for (const entry of entries) {
        for (const context of [entry.context, ...Object.values(entry.memoryBySkill ?? {}).map(memory => memory?.context)]) {
          if (!context) continue;
          const old = correctS5PreviewLevelInputs({ sides: { attacker: side }, directions: {
            forward: { context }, reverse: { context },
          } });
          // Only a migrated old value is relevant here; current skill values
          // have already been extracted above with their existing precedence.
          if (old.directions.forward.context !== context) {
            level = old.directions.forward.context[controls[0].id] ?? level;
          }
        }
      }
    }
    for (const [index, direction] of [outgoing, incoming].entries()) {
      const control = controls[index];
      if (level !== undefined || !control) continue;
      const context = migrated.directions?.[direction]?.context ?? {};
      const contextKey = [control.id, `${control.source}.${control.contextKey}`, control.contextKey]
        .find(candidate => Object.hasOwn(context, candidate));
      if (contextKey !== undefined) level = context[contextKey];
    }
    next = { ...next, sides: { ...next.sides, [sideKey]: {
      ...side, traitValues: { ...side.traitValues, [key]: level ?? 99 },
    } } };
  }
  return next;
}
