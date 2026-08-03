import { getNatureMultipliers } from "./domain/natures.js";

export function buildCombatState(state) {
  return {
    ...state,
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
