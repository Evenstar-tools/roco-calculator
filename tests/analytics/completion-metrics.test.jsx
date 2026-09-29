import { StrictMode } from "react";
import { act, renderHook } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { metrics } from "../../src/analytics/metrics.js";
import { calculatorResultKind, deerResultKind, useCalculationMetrics, useLineupMetrics } from "../../src/analytics/use-completion-metrics.js";

afterEach(() => vi.restoreAllMocks());

test("completion excludes initialization, invalid and stale results; counts once per active visit", () => {
  const track = vi.spyOn(metrics, "track").mockImplementation(() => {});
  const initial = { value: 0 };
  const hook = renderHook((props) => useCalculationMetrics({ feature: "calculator", ...props }), {
    initialProps: { input: initial, active: true, resultKind: "damage" }, wrapper: StrictMode,
  });
  expect(track).not.toHaveBeenCalled();
  const next = { value: 1 };
  act(() => hook.result.current(next, initial));
  hook.rerender({ input: initial, active: true, resultKind: "damage" }); // old deferred result
  hook.rerender({ input: next, active: true, resultKind: null });
  expect(track).not.toHaveBeenCalled();
  const latest = { value: 2 };
  act(() => hook.result.current(latest, next));
  hook.rerender({ input: next, active: true, resultKind: "damage" });
  expect(track).not.toHaveBeenCalled();
  hook.rerender({ input: latest, active: true, resultKind: "damage" });
  hook.rerender({ input: latest, active: true, resultKind: "damage" });
  expect(track).toHaveBeenCalledTimes(1);
  hook.rerender({ input: latest, active: false, resultKind: "damage" });
  hook.rerender({ input: latest, active: true, resultKind: "damage" });
  expect(track).toHaveBeenCalledTimes(1); // re-entry alone is not a completed calculation
  const restored = { value: 3 };
  act(() => hook.result.current(restored, latest, false)); // background restore
  hook.rerender({ input: restored, active: true, resultKind: "damage" });
  expect(track).toHaveBeenCalledTimes(1);
  const edited = { value: 4 };
  act(() => hook.result.current(edited, restored));
  hook.rerender({ input: edited, active: true, resultKind: "status" });
  expect(track).toHaveBeenCalledTimes(2);
  expect(track).toHaveBeenLastCalledWith("calculation_ready", "calculator", { result_kind: "status" });
});

test("unchanged input and clicks without a committed result never complete", () => {
  const track = vi.spyOn(metrics, "track").mockImplementation(() => {});
  const input = { value: 1 };
  const hook = renderHook((props) => useCalculationMetrics({ feature: "deer", ...props }), {
    initialProps: { input, resultKind: "threshold" },
  });
  const same = { value: 1 };
  act(() => hook.result.current(same, input));
  hook.rerender({ input: same, resultKind: "threshold" });
  expect(track).not.toHaveBeenCalled();
});

test("readiness requires finite exact rendered output; known no-KO-range is completed, unknown is not", () => {
  expect(calculatorResultKind(false, { status: "exact", totalDamage: 1, hpPercent: 1 })).toBeNull();
  for (const result of [null, { status: "unsupported", totalDamage: 1, hpPercent: 1 }, { status: "exact", totalDamage: NaN, hpPercent: 1 }]) {
    expect(calculatorResultKind(true, result)).toBeNull();
  }
  expect(calculatorResultKind(true, { status: "exact", totalDamage: 0, hpPercent: 0 })).toBe("damage");
  const row = { minimum: null, current: { lethalKnown: true, damage: 0, percent: 0 } };
  expect(deerResultKind([row], false)).toBe("range_not_reached");
  expect(deerResultKind([{ ...row, minimum: 4 }], false)).toBe("threshold");
  expect(deerResultKind([row], true)).toBeNull();
  expect(deerResultKind([], false)).toBeNull();
  expect(deerResultKind([{ ...row, current: { ...row.current, lethalKnown: false } }], false)).toBeNull();
});

test("lineup event waits for matching committed side; repeated unchanged apply is deduplicated", () => {
  const track = vi.spyOn(metrics, "track").mockImplementation(() => {});
  const empty = { sides: { attacker: { spiritId: null }, defender: { spiritId: null } } };
  const next = { sides: { ...empty.sides, attacker: { spiritId: "private-spirit", nature: "neutral" } } };
  const hook = renderHook(({ state }) => useLineupMetrics(state), { initialProps: { state: empty }, wrapper: StrictMode });
  act(() => hook.result.current("attacker", empty));
  expect(track).not.toHaveBeenCalled();
  act(() => hook.result.current("attacker", next));
  expect(track).not.toHaveBeenCalled();
  hook.rerender({ state: next });
  expect(track).toHaveBeenCalledTimes(1);
  act(() => hook.result.current("attacker", structuredClone(next)));
  hook.rerender({ state: structuredClone(next) });
  expect(track).toHaveBeenCalledTimes(1);
  const edited = { sides: { ...next.sides, attacker: { ...next.sides.attacker, nature: "adamant" } } };
  hook.rerender({ state: edited });
  act(() => hook.result.current("attacker", next));
  hook.rerender({ state: next });
  expect(track).toHaveBeenCalledTimes(2);
  expect(track).toHaveBeenLastCalledWith("lineup_use", "teams", { action: "apply_member", side: "attacker" });
  expect(JSON.stringify(track.mock.calls)).not.toContain("private-spirit");
});

test("superseded lineup application is never counted by a later unrelated restore", () => {
  const track = vi.spyOn(metrics, "track").mockImplementation(() => {});
  const initial = { sides: { attacker: { spiritId: "a" }, defender: {} } };
  const applied = { sides: { attacker: { spiritId: "b" }, defender: {} } };
  const superseded = { sides: { attacker: { spiritId: "c" }, defender: {} } };
  const hook = renderHook(({ state }) => useLineupMetrics(state), { initialProps: { state: initial } });
  act(() => hook.result.current("attacker", applied));
  hook.rerender({ state: superseded });
  hook.rerender({ state: applied });
  expect(track).not.toHaveBeenCalled();
});
