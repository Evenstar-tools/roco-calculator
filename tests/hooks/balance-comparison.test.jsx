import { readFileSync } from "node:fs";
import { act, renderHook } from "@testing-library/react";
import { expect, test } from "vitest";
import { createInitialState } from "../../src/state/defaults.js";
import { useBalanceComparison } from "../../src/features/balance-comparison/useBalanceComparison.js";

test("重新载入不同生命个体的同名配置，不复用此前的百分比输入模式", () => {
  const snapshot = JSON.parse(readFileSync("public/data/runtime.json", "utf8"));
  const fire = snapshot.spirits.find(({ fullName }) => fullName === "烈火守护");
  const state = createInitialState(snapshot);
  state.sides.attacker.spiritId = fire.id;
  state.sides.defender.spiritId = fire.id;
  state.directions.forward.currentHp = 200;
  state.directions.forward.context.currentHpPercent = 50;
  const args = { snapshot, state, activeDirection: "forward" };
  const { result, rerender } = renderHook((props) => useBalanceComparison(props), { initialProps: args });
  act(() => {
    result.current.setCustom("defender", fire.id, true);
    result.current.setStat("defender", fire.id, "hp", 200);
    result.current.setHpInputMode("forward", "percent");
    result.current.rememberHpBasis("forward", 200, 50, state.sides.defender);
  });
  expect(result.current.afterView.result.defenderHp).not.toBe(200);
  const imported = structuredClone(state);
  imported.sides.defender.displayIvs.hp = 0;
  rerender({ ...args, state: imported });
  expect(result.current.afterView.result.defenderHp).toBe(200);
  act(() => result.current.stop());
  expect(result.current.active).toBe(false);
  expect(result.current.afterView.result.defenderHp).toBe(200);
});
