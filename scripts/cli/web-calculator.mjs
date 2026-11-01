import path from "node:path";

/** Resolve all calculation modules from the same source revision as the Web data. */
export async function loadWebCalculator(server, sourceRoot) {
  const load = (relative) => server.ssrLoadModule(path.resolve(sourceRoot, relative).replaceAll("\\", "/"));
  // These modules share circular domain/state dependencies. Finish one SSR
  // evaluation before requesting another root to avoid runner wait cycles.
  const balance = await load("src/features/balance-comparison/model.js");
  const defaults = await load("src/state/defaults.js");
  const weather = await load("src/state/weather.js");
  const levels = await load("src/domain/battle-level.js");
  const traits = await load("src/domain/s5-preview-traits.js");
  const traitValues = await load("src/state/trait-values.js");
  const session = await load("src/state/calculator-session.js");
  const presentation = await load("src/domain/result-presentation.js");

  return function calculateWebMatchup(snapshot, battle) {
    if (battle.level != null && Number(battle.level) !== 60) {
      throw new Error("网页口径不支持顶层 level 非60；特殊等级精灵请填写 attacker.level 或 defender.level");
    }
    const initial = defaults.createInitialState(snapshot);
    let state = {
      ...initial, ...battle,
      marks: battle.marks ?? initial.marks,
      calculationOptions: { ...initial.calculationOptions, ...battle.calculationOptions },
      negativeStatuses: { ...initial.negativeStatuses, ...battle.negativeStatuses },
      sides: Object.fromEntries(["attacker", "defender"].map(side => [side, {
        ...initial.sides[side], ...battle.sides[side],
      }])),
      directions: Object.fromEntries(["forward", "reverse"].map(direction => [direction, {
        ...initial.directions[direction], ...battle.directions[direction],
        context: { ...battle.directions[direction]?.context },
        overrides: { ...battle.directions[direction]?.overrides },
      }])),
    };

    for (const [sideKey, outgoing] of [["attacker", "forward"], ["defender", "reverse"]]) {
      const side = state.sides[sideKey];
      if (Object.keys(side.traitValues ?? {}).length) {
        for (const direction of ["forward", "reverse"]) {
          const role = direction === outgoing ? "attacker" : "defender";
          state.directions[direction].context = {
            ...traitValues.materializeTraitContext(side.traitValues, snapshot, side.spiritId, role),
            ...state.directions[direction].context,
          };
        }
      }
      if (side.level === undefined) continue;
      const variable = levels.supportsS5PreviewBattleLevel(snapshot, side) && !side.ignoreTraits;
      if (!variable) {
        if (side.level !== 60) throw new Error(`${sideKey}.level 仅支持原生特殊等级特性；普通精灵或禁用特性时只能为60`);
        continue;
      }
      const spirit = snapshot.spirits.find(entry => entry.id === side.spiritId);
      const trait = snapshot.traits.find(entry => spirit.traitIds?.includes(entry.id) &&
        entry.previewIdentity?.key === spirit.previewIdentity?.key);
      const control = traits.getS5PreviewTraitInputs(trait)?.find(input => input.contextKey.endsWith("BattleLevel"));
      if (!control) throw new Error(`${sideKey}.level 的当前等级控制未接入`);
      state = session.updateMirroredTraitContext(state, { direction: outgoing, key: control.id, value: side.level }).state;
    }
    if (battle.weather !== undefined) state = weather.synchronizeWeather(state, battle.weather);

    const output = {};
    for (const direction of ["forward", "reverse"]) {
      const view = balance.buildBalanceComparison({ snapshot, state, activeDirection: direction }).afterView;
      const raw = view.calculation[direction];
      const enrich = result => result ? { ...result, damagePresentation: presentation.damagePresentation(result) } : result;
      output[direction] = {
        ...raw,
        results: view.result.results.slice(0, raw.results.length).map(enrich),
        selectedResult: enrich(view.result.selectedResult),
      };
      output.versions ??= view.calculation.versions;
    }
    return output;
  };
}
