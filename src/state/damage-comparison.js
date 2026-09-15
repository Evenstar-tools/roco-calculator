import { buildDamageComparisonInput } from "../domain/skill-damage-ranking.js";

export function captureDamageComparison(state, direction, presetsBySpirit = {}) {
  const presets = Object.fromEntries(Object.entries(presetsBySpirit).map(([id, config]) => [id, {
    natureId: config.natureId ?? config.nature, displayIvs: config.displayIvs,
    skills: config.skills, traitValues: config.traitValues,
  }]));
  return JSON.parse(JSON.stringify({ state, direction, presetsBySpirit: presets }));
}

export function damageComparisonSourceKey(source) {
  const side = source.direction === "reverse" ? "defender" : "attacker";
  return `${source.direction}:${source.state.mode}:${source.state.sides[side].spiritId}`;
}

export function importDamageComparisonCandidate(options) {
  const { state, direction = "forward" } = options;
  const next = buildDamageComparisonInput({ ...options, ignoreTraits: false });
  const targetSide = direction === "reverse" ? "attacker" : "defender";
  const sourceSide = targetSide === "attacker" ? "defender" : "attacker";
  const { ignoreTraits: _ignore, panelStats: _panel, ...candidate } = next.sides[targetSide];
  const { natureMultipliers: _nature, ...source } = next.sides[sourceSide];
  return {
    ...next,
    calculationOptions: options.inheritTargetStatuses && next.negativeStatuses[targetSide].freeze > 0
      ? { ...state.calculationOptions, includeNegativeStatusSettlement: true }
      : state.calculationOptions,
    sides: { ...next.sides, [sourceSide]: source, [targetSide]: candidate },
  };
}
