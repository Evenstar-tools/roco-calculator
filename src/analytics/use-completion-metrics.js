import { useEffect, useRef, useState } from "react";
import { metrics } from "./metrics.js";

export function calculatorResultKind(configurationReady, result) {
  if (!configurationReady || result?.status !== "exact"
    || !Number.isFinite(result.totalDamage) || !Number.isFinite(result.hpPercent)) return null;
  return result.statusOnly ? "status" : "damage";
}

export function deerResultKind(rows, updating) {
  if (updating || !rows.length || rows.some(({ current }) => !current.lethalKnown
    || !Number.isFinite(current.damage) || !Number.isFinite(current.percent))) return null;
  return rows.some((row) => Number.isFinite(row.minimum)) ? "threshold" : "range_not_reached";
}

// Input objects stay in memory only. A result must belong to the latest user commit,
// not an initial/default state, background restore, or deferred previous input.
export function useCalculationMetrics({ feature, input, resultKind, active = true }) {
  const pending = useRef(null);
  const completed = useRef(false);
  useEffect(() => {
    if (!active) {
      pending.current = null;
      completed.current = false;
      return;
    }
    if (!completed.current && pending.current === input && resultKind) {
      completed.current = true;
      pending.current = null;
      metrics.track("calculation_ready", feature, { result_kind: resultKind });
    }
  }, [active, feature, input, resultKind]);
  return (next, previous, userInitiated = true) => {
    if (!userInitiated) { pending.current = null; return; }
    if (active && !completed.current && next !== previous
      && (pending.current === previous || JSON.stringify(next) !== JSON.stringify(previous))) pending.current = next;
  };
}

export function useLineupMetrics(state, active = true) {
  const [pending, setPending] = useState(null);
  const consumed = useRef(null);
  const lastApplied = useRef({});
  useEffect(() => {
    // A manual edit away from the last applied configuration permits applying it again.
    for (const side of ["attacker", "defender"]) {
      if (lastApplied.current[side] !== JSON.stringify(state.sides[side])) delete lastApplied.current[side];
    }
    if (!active || !pending || consumed.current === pending) return;
    if (state !== pending.expectedState) {
      if (state !== pending.previousState) consumed.current = pending;
      return;
    }
    consumed.current = pending;
    if (lastApplied.current[pending.side] === pending.configuration) return;
    lastApplied.current[pending.side] = pending.configuration;
    metrics.track("lineup_use", "teams", { action: "apply_member", side: pending.side });
  }, [state, pending, active]);
  return (side, committedState) => {
    if (!["attacker", "defender"].includes(side) || !committedState?.sides[side]?.spiritId) return;
    setPending({ side, configuration: JSON.stringify(committedState.sides[side]), expectedState: committedState, previousState: state });
  };
}
