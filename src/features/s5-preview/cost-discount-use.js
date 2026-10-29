import { resolveBattleSpirit } from "../../domain/battle-form.js";
import { getEffectiveTraits } from "../../domain/effective-traits.js";
import { getS5PreviewTraitEvaluation, getS5PreviewTraitInputs } from "../../domain/s5-preview-traits.js";
import { canonicalTraitControlKey } from "../../domain/trait-runtime.js";
import { rememberSingleSkill, updateMirroredTraitContext } from "../../state/calculator-session.js";

// Capture one confirmed use; selection/rendering must not arm or spend a discount.
export function prepareS5DiscountUse(state, { snapshot, side, skill, result }) {
  if (!skill?.type || !Number.isSafeInteger(result?.skillCost) || result.skillCost < 0) return null;
  const configured = state.sides[side];
  const spirit = resolveBattleSpirit(snapshot, configured);
  const trait = getEffectiveTraits(snapshot, { ...configured, spirit })
    .find(item => item.previewIdentity?.mechanicKey === "crab-coconut");
  if (!trait) return null;
  const direction = side === "attacker" ? "forward" : "reverse";
  const current = state.directions[direction];
  const evaluated = getS5PreviewTraitEvaluation(trait, "attacker", { ...current.context, ...current.overrides?.context });
  const armed = evaluated?.effects.some(effect => effect.kind === "next-grass-cost-discount");
  const next = skill.type === "水";
  if (evaluated?.calcStatus !== "ready" || armed === next) return null;
  return { side, direction, snapshot, traitId: trait.id, acquired: trait.acquired === true,
    control: getS5PreviewTraitInputs(trait)[0], value: next };
}

export function applyS5DiscountUse(state, use) {
  if (!use) return state;
  if (!use.acquired) {
    const next = updateMirroredTraitContext(state, {
      direction: use.direction, key: use.control.id, value: use.value,
    }).state;
    return rememberSingleSkill(next, { direction: use.direction, side: use.side, snapshot: use.snapshot }).state;
  }
  const side = state.sides[use.side];
  return { ...state, sides: { ...state.sides, [use.side]: { ...side,
    acquiredTraitValues: { ...side.acquiredTraitValues, [use.traitId]: {
      ...side.acquiredTraitValues?.[use.traitId], [canonicalTraitControlKey(use.control)]: use.value,
    } },
  } } };
}
