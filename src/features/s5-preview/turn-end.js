import { resolveBattleSpirit } from "../../domain/battle-form.js";
import { getEffectiveTraits } from "../../domain/effective-traits.js";
import { canonicalTraitControlKey } from "../../domain/trait-runtime.js";
import { sanitizeTriggerValues } from "../../domain/trigger-controls.js";
import { getS5PreviewTraitEvaluation } from "../../domain/s5-preview-traits.js";
import { rememberSingleSkill, updateMirroredTraitContext } from "../../state/calculator-session.js";
import { getGoldChargeCountInput } from "./charge-input-migration.js";
import { getSilverEnergySpentInput } from "./energy-input-migration.js";
import { getS5PreviewTurnEndInputs } from "./turn-end-inputs.js";

const directionFor = side => side === "attacker" ? "forward" : "reverse";
const counterFor = key => key === "gold-vein-dragon" ? getGoldChargeCountInput() : getSilverEnergySpentInput();
function traitsFor(state, snapshot, side) {
  const configured = state.sides[side];
  const spirit = resolveBattleSpirit(snapshot, configured);
  return getEffectiveTraits(snapshot, { ...configured, spirit });
}
function evaluationFor(state, side, trait) {
  const current = state.directions[directionFor(side)];
  return getS5PreviewTraitEvaluation(trait, "attacker", { ...current.context, ...current.overrides?.context });
}
function writeOwnerValues(state, side, trait, entries) {
  if (trait.acquired) {
    const owner = state.sides[side];
    return { ...state, sides: { ...state.sides, [side]: { ...owner,
      acquiredTraitValues: { ...owner.acquiredTraitValues, [trait.id]: {
        ...owner.acquiredTraitValues?.[trait.id],
        ...Object.fromEntries(entries.map(([control, value]) => [canonicalTraitControlKey(control), value])),
      } },
    } } };
  }
  return entries.reduce((next, [control, value]) => updateMirroredTraitContext(next, {
    direction: directionFor(side), key: control.id, value,
  }).state, state);
}

// Editing a cumulative counter preserves the already applied part. Missing
// settled values identify old saves, whose former current total stays applied.
export function updateS5PreviewTurnEndCounter(state, { side, snapshot, control, value, traitId } = {}) {
  const key = control?.contextKey?.endsWith("S5ChargeCount") ? "gold-vein-dragon"
    : control?.contextKey?.endsWith("S5EnergySpent") ? "underground-silver-dragon" : null;
  if (!key) return null;
  const trait = traitsFor(state, snapshot, side).find(item => item.previewIdentity?.mechanicKey === key && (!traitId || item.id === traitId));
  if (!trait) return null;
  const counter = counterFor(key);
  const count = sanitizeTriggerValues({ [counter.id]: value }, [counter])[counter.id];
  const evaluation = evaluationFor(state, side, trait);
  const settled = Math.min(count, evaluation?.settledCount ?? 0);
  return writeOwnerValues(state, side, trait, [[counter, count], [getS5PreviewTurnEndInputs(key)[0], settled]]);
}

// This is an explicit confirmation of the owner's pending stat increments,
// not a battle scheduler. Repeated clicks with no new count are a no-op.
export function applyS5PreviewStatTurnEnd(state, { side, snapshot } = {}) {
  let next = state;
  let added = 0;
  for (const trait of traitsFor(state, snapshot, side)) {
    const key = trait.previewIdentity?.mechanicKey;
    const settledControl = getS5PreviewTurnEndInputs(key)[0];
    if (!settledControl) continue;
    const evaluation = evaluationFor(state, side, trait);
    if (evaluation?.calcStatus !== "ready" || !evaluation.pendingCount) continue;
    next = writeOwnerValues(next, side, trait, [[settledControl, evaluation.totalCount]]);
    added += evaluation.pendingCount;
    if (!trait.acquired) next = rememberSingleSkill(next, { side, direction: directionFor(side), snapshot }).state;
  }
  return { state: next, applied: next !== state, added };
}
