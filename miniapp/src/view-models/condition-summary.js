function differs(value, defaultValue) {
  if (value === undefined || value === null || value === "") return false;
  return !Object.is(value, defaultValue);
}

function activeMarkCount(marks) {
  return Object.values(marks ?? {}).filter(
    (slot) => slot?.id && Number(slot.stacks) > 0,
  ).length;
}

export function createConditionSummary({
  direction,
  state,
  traitViews,
}) {
  const directionState = state.directions[direction] ?? {};
  const context = directionState.context ?? {};
  const labels = [];

  const rainTurns = Math.max(
    0,
    Math.floor(Number(context.weatherRainTurns) || 0),
  );
  if (rainTurns > 0) labels.push(`雨天 ${rainTurns} 回合`);
  if (directionState.currentHp !== null && directionState.currentHp !== undefined) {
    labels.push(`目标 HP ${Math.max(0, Number(directionState.currentHp) || 0)}`);
  }
  const reduction = Number(directionState.reduction);
  if (Number.isFinite(reduction) && reduction !== 1) {
    labels.push(`减伤 ${Math.round((1 - reduction) * 100)}%`);
  }
  const finalMultiplier = Number(directionState.finalDamageMultiplier);
  if (Number.isFinite(finalMultiplier) && finalMultiplier !== 1) {
    labels.push(`终伤 ×${Number(finalMultiplier.toFixed(2))}`);
  }
  const activeTraits = Object.values(traitViews ?? {}).reduce((count, view) => {
    if (!view) return count;
    const values = state.sides[view.ownerSide]?.traitValues ?? {};
    return count + (view.controls ?? []).filter((control) => {
      const value = control.scope === "battle"
        ? context[control.id]
        : values[control.canonicalKey];
      return differs(value, control.defaultValue);
    }).length;
  }, 0);
  if (activeTraits > 0) labels.push(`特性 ${activeTraits}`);

  const activeMarks = Object.values(state.marks ?? {}).reduce(
    (count, marks) => count + activeMarkCount(marks),
    0,
  );
  if (activeMarks > 0) labels.push(`印记 ${activeMarks}`);

  return {
    count: labels.length,
    labels,
  };
}
