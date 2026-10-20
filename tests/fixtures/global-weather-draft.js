import { createProductInitialState } from "../../src/state/calculator-session.js";
import { UNVERIFIED_GLOBAL_SNAPSHOT } from "../../src/runtime/unverified-snapshot.js";

export function weatherDraft() {
  const state = createProductInitialState(UNVERIFIED_GLOBAL_SNAPSHOT);
  for (const side of Object.values(state.sides)) {
    side.nature = null;
    side.displayIvs = Object.fromEntries(Object.keys(side.displayIvs).map(key => [key, null]));
  }
  state.directions.forward.context = { weatherRainTurns: 42, weatherThunder: true, foreignParameter: "keep" };
  state.directions.reverse.context = { weatherRainTurns: 21, foreignParameter: "other" };
  state.sides.attacker.skills.four[0] = { skillId: "global-unknown", context: { rainWeather: false, custom: 17 } };
  return state;
}
