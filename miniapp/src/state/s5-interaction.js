import { buildCombatState } from "../shared/build-combat-state.js";
import { getTraitView } from "../shared/domain/calculator-view-model.js";
import { resolveBattleSpirit } from "../shared/domain/battle-form.js";
import { canonicalTraitControlKey } from "../shared/state/trait-values.js";

// Web S5 actions write mirrored direction context; the miniapp persists owner
// traitValues. Copy only values actually changed by the shared action so the
// next materialization cannot restore an old counter over the accepted use.
export function applyMiniappS5Interaction(state, snapshot, apply) {
  const before = buildCombatState(state, snapshot);
  const next = apply(before);
  if (!next || next === before) return state;
  const sides = { ...next.sides };
  for (const side of ["attacker", "defender"]) {
    const direction = side === "attacker" ? "forward" : "reverse";
    const spirit = resolveBattleSpirit(snapshot, next.sides[side]);
    const controls = spirit ? getTraitView(snapshot, spirit, "attacker")?.inputs ?? [] : [];
    const values = { ...next.sides[side].traitValues };
    for (const control of controls) {
      if (control.scope === "battle" || control.action) continue;
      const context = next.directions[direction].context ?? {};
      if (Object.hasOwn(context, control.id) &&
          !Object.is(context[control.id], before.directions[direction].context?.[control.id])) {
        values[canonicalTraitControlKey(control)] = context[control.id];
      }
    }
    sides[side] = { ...sides[side], traitValues: values };
  }
  return { ...next, sides };
}
