import { expect, test, vi } from "vitest";
import * as calculation from "../../src/domain/calculate.js";
import { buildCalculatorViewModel, getSpirit, getTraitView } from "../../src/domain/calculator-view-model.js";
import { createProductInitialState } from "../../src/state/calculator-session.js";
import { globalPlaceholderCatalog } from "../fixtures/global-placeholder-catalog.js";

test("Global placeholder selections can be edited without computing panels or damage, even if stats accidentally appear", () => {
  const snapshot = globalPlaceholderCatalog();
  const state = createProductInitialState(snapshot);
  state.sides.attacker.spiritId = snapshot.spirits[0].id;
  state.sides.defender.spiritId = snapshot.spirits[1].id;
  const compute = vi.spyOn(calculation, "calculateMatchup");
  try {
    for (const addStats of [false, true]) {
      if (addStats) for (const spirit of snapshot.spirits) spirit.raceStats = {
        hp: 100, physicalAttack: 100, magicalAttack: 100, physicalDefense: 100, magicalDefense: 100, speed: 100,
      };
      const view = buildCalculatorViewModel({ snapshot, state, activeDirection: "forward", serverId: "global" });
      expect(view.configurationEditable).toBe(true);
      expect(view.configurationReady).toBe(false);
      expect(view.result).toBeNull();
      expect(view.sides.attacker.panelStats).toBeNull();
      expect(view.sides.defender.health).toBeNull();
      expect(view.skills.selectedSingle).toBeNull();
      expect(view.skills.attackerChoices.map(skill => skill.name)).toContain("中文技能一");
      expect(view.calculation.forward.selectedResult.totalDamage).toBeNull();
    }
    expect(compute).not.toHaveBeenCalled();
  } finally { compute.mockRestore(); }
});


test("Global references keep stored battle-form fields without applying CN forms or inherited traits", () => {
  const snapshot = globalPlaceholderCatalog();
  snapshot.spirits[0].baseName = "棋契陛下";
  snapshot.spirits[0].variantName = "棋绮后分支";
  const side = { spiritId: snapshot.spirits[0].id, battleForm: { spiritId: snapshot.spirits[1].id, branchId: snapshot.spirits[0].id } };
  const before = structuredClone(side);
  expect(getSpirit(snapshot, side)).toBe(snapshot.spirits[0]);
  expect(getTraitView(snapshot, snapshot.spirits[0])).toBeNull();
  expect(side).toEqual(before);
});
