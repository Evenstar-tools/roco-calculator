import { resolveBattleSpirit } from "../../domain/battle-form.js";
import { getEffectiveTraits } from "../../domain/effective-traits.js";
import { canonicalTraitControlKey } from "../../domain/trait-runtime.js";
import { getS5PreviewTraitEvaluation } from "../../domain/s5-preview-traits.js";
import { rememberSingleSkill, updateMirroredTraitContext } from "../../state/calculator-session.js";
import { getS5PreviewTurnEndInputs } from "./turn-end-inputs.js";
import { getSilverEnergySpentInput } from "./energy-input-migration.js";

// Capture the displayed, settled cost before a use changes discounts or context.
export function prepareS5EnergyUse(state, { snapshot, side, result }) {
  const configured = state.sides[side];
  const spirit = resolveBattleSpirit(snapshot, configured);
  const trait = getEffectiveTraits(snapshot, { ...configured, spirit })
    .find(item => item.previewIdentity?.mechanicKey === "underground-silver-dragon");
  if (!trait || !Number.isSafeInteger(result?.skillCost) || result.skillCost < 0) return null;
  const direction = side === "attacker" ? "forward" : "reverse";
  const current = state.directions[direction];
  const evaluated = getS5PreviewTraitEvaluation(trait, "attacker", {
    ...current.context, ...current.overrides?.context,
  });
  if (evaluated?.calcStatus !== "ready" || !Number.isSafeInteger(evaluated.energySpent)) return null;
  const total = evaluated.energySpent + result.skillCost;
  if (!Number.isSafeInteger(total)) return null;
  return { side, direction, snapshot, traitId: trait.id, acquired: trait.acquired === true,
    cost: result.skillCost, total, settledCount: evaluated.settledCount };
}

// Called once for an accepted use, never during rendering, selection or cancel.
export function applyS5EnergyUse(state, use) {
  if (!use || use.cost === 0) return state;
  const control = getSilverEnergySpentInput("attacker");
  if (!use.acquired) {
    const settled = updateMirroredTraitContext(state, {
      direction: use.direction, key: getS5PreviewTurnEndInputs("underground-silver-dragon")[0].id, value: use.settledCount,
    }).state;
    const next = updateMirroredTraitContext(settled, {
      direction: use.direction, key: control.id, value: use.total,
    }).state;
    // Match manual trait edits: preserve the counter in the owner's saved config.
    return rememberSingleSkill(next, {
      direction: use.direction, side: use.side, snapshot: use.snapshot,
    }).state;
  }
  const side = state.sides[use.side];
  return { ...state, sides: { ...state.sides, [use.side]: { ...side,
    acquiredTraitValues: { ...side.acquiredTraitValues, [use.traitId]: {
      ...side.acquiredTraitValues?.[use.traitId], [canonicalTraitControlKey(control)]: use.total,
      [canonicalTraitControlKey(getS5PreviewTurnEndInputs("underground-silver-dragon")[0])]: use.settledCount,
    } },
  } } };
}
