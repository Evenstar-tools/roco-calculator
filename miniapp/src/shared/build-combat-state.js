import { getNatureMultipliers } from "./domain/natures.js";
import { materializeTraitContext } from "./state/trait-values.js";

function directionTraitContext(state, snapshot, direction) {
  const attackerSide =
    direction === "reverse" ? state.sides.defender : state.sides.attacker;
  const defenderSide =
    direction === "reverse" ? state.sides.attacker : state.sides.defender;
  return {
    ...materializeTraitContext(
      attackerSide.traitValues,
      snapshot,
      attackerSide.spiritId,
      "attacker",
    ),
    ...materializeTraitContext(
      defenderSide.traitValues,
      snapshot,
      defenderSide.spiritId,
      "defender",
    ),
  };
}

export function buildCombatState(state, snapshot) {
  return {
    ...state,
    directions: Object.fromEntries(
      Object.entries(state.directions).map(([direction, value]) => [
        direction,
        {
          ...value,
          context: {
            ...(value.context ?? {}),
            ...directionTraitContext(state, snapshot, direction),
          },
        },
      ]),
    ),
    sides: Object.fromEntries(
      Object.entries(state.sides).map(([key, side]) => [
        key,
        {
          ...side,
          natureMultipliers: getNatureMultipliers(side.nature),
        },
      ]),
    ),
  };
}
