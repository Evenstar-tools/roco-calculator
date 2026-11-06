import { describe, expect, test } from "vitest";
import snapshot from "../../data/snapshots/current.json";
import { withCalculatorExtras } from "../../src/data/snapshot-extras.js";
import { getSkillEffectInputs } from "../../src/domain/skill-effects.js";
import {
  DEER_VARIANTS,
  calculateDeerRow,
  calculateDeerSummaryRows,
  createDeerSetup,
  deerVariantsFor,
  evaluateDeerAttack,
} from "../../src/features/deer/deer-model.js";
import { withWebPreview } from "../../src/features/s5-preview/with-web-preview.js";
import { freezeSnapshot } from "../../src/runtime/load-snapshot.js";

const current = withWebPreview(withCalculatorExtras(snapshot));
const overcharge = current.skills.find(skill => skill.name === "过充电");
const control = getSkillEffectInputs(overcharge).find(input => input.contextKey === "s5OverchargeChargeCount");
const legacyControl = { contextKey: "s5OverchargeActivated", id: "skill.s5OverchargeActivated.c6cd7071" };

function setupFor(name = "波普鹿", source = current) {
  const setup = createDeerSetup(source);
  setup.state.sides.attacker.spiritId = source.spirits.find(spirit => spirit.fullName === name).id;
  return setup;
}

function overchargeVariant(setup, source = current) {
  return deerVariantsFor(source, setup).find(variant => variant.id === "overcharge");
}

function evaluate(setup, stacks = setup.stacks, source = current) {
  return evaluateDeerAttack(source, setup, overchargeVariant(setup, source), stacks);
}

describe("电鹿过充电", () => {
  test.each(["波普鹿", "爵士鹿"])("%s首行过充电每次聚能加30威力，费用不变且与入场层数独立", name => {
    expect(overcharge).toMatchObject({ name: "过充电", type: "电", category: "physical", cost: 2, basePower: 65 });
    const setup = setupFor(name);
    expect(setup.overchargeCount).toBe(0);
    expect(deerVariantsFor(current, setup)[0].id).toBe("overcharge");
    for (const count of [0, 1, 2, 10, 1000]) {
      setup.overchargeCount = count;
      const before = structuredClone(setup);
      const damages = [0, 1, 5].map(stacks => {
        const result = evaluate(setup, stacks);
        expect(result.first).toMatchObject({ status: "exact", staticPower: 65 + count * 30, skillCost: 2 });
        expect(evaluate(setup, stacks)).toEqual(result);
        return result.damage;
      });
      expect(damages[1]).toBeGreaterThan(damages[0]);
      expect(damages[2]).toBeGreaterThan(damages[1]);
      expect(setup).toEqual(before);
    }
  });

  test.each(["single", "four"])("%s导入新次数和旧布尔的普通键、稳定键、方向与技能槽覆盖，可以清零并继续累加", mode => {
    for (const [input, value, zero, importedCount] of [[control, 2, 0, 2], [legacyControl, true, false, 1]]) {
      for (const origin of ["direction", "stable-direction", "direction-override", "slot", "slot-override"]) {
        const state = setupFor().state;
        state.mode = mode;
        const entry = { skillId: overcharge.id, context: {} };
        state.sides.attacker.skills = mode === "single"
          ? { single: entry, four: [{ skillId: overcharge.id, context: { [input.id]: zero } }, null, null, null] }
          : { single: { skillId: overcharge.id, context: { [input.id]: zero } }, four: [null, null, entry, null] };
        if (origin === "direction") state.directions.forward.context[input.contextKey] = value;
        if (origin === "stable-direction") Object.assign(state.directions.forward.context,
          { [input.contextKey]: zero, [input.id]: value });
        if (origin === "direction-override") {
          entry.context[input.id] = zero;
          state.directions.forward.overrides.context = { [input.id]: value };
        }
        if (origin === "slot") {
          state.directions.forward.context[input.id] = zero;
          entry.context[input.id] = value;
        }
        if (origin === "slot-override") {
          state.directions.forward.overrides.context = { [input.id]: zero };
          entry.overrides = { context: { [input.id]: value } };
        }
        const before = structuredClone(state);
        const setup = createDeerSetup(current, state);
        expect(setup.overchargeCount, origin).toBe(importedCount);
        expect(evaluate(setup).first.staticPower, origin).toBe(65 + importedCount * 30);
        setup.overchargeCount = 0;
        expect(evaluate(setup).first.staticPower, origin).toBe(65);
        setup.overchargeCount = 10;
        expect(evaluate(setup).first.staticPower, origin).toBe(365);
        expect(state, origin).toEqual(before);
      }
      const inactive = setupFor().state;
      inactive.mode = mode;
      inactive.sides.attacker.skills = { single: overcharge.id, four: [overcharge.id, null, null, null] };
      Object.assign(inactive.directions.forward.context, { [input.contextKey]: value, [input.id]: zero });
      expect(createDeerSetup(current, inactive).overchargeCount).toBe(0);
    }
  });

  test("聚能0、1、2、10次持续加威，同步当前伤害和逐层连招阈值且缓存不会沿用旧次数", () => {
    const source = freezeSnapshot(structuredClone(current));
    const setup = setupFor("波普鹿", source);
    const before = structuredClone(setup);
    const rows = [];
    for (const count of [0, 1, 2, 10]) {
      const adjusted = { ...setup, overchargeCount: count };
      const full = calculateDeerRow(source, adjusted, overchargeVariant(adjusted, source));
      const summary = calculateDeerSummaryRows(source, adjusted, { reuse: true }).find(row => row.id === "overcharge");
      expect(summary).toMatchObject({ current: full.current, minimum: full.minimum, comboMinimum: full.comboMinimum });
      expect(full.current).toEqual(evaluate(adjusted, adjusted.stacks, source));
      expect(full.minimum).not.toBeNull();
      expect(full.comboMinimum).not.toBeNull();
      expect(full.comboMinimum).toBeLessThanOrEqual(full.minimum);
      expect(full.byStack[full.minimum].lethal).toBe(true);
      if (full.minimum > 0) expect(full.byStack[full.minimum - 1].lethal).toBe(false);
      expect(full.byStack[full.comboMinimum].comboLethal).toBe(true);
      if (full.comboMinimum > 0) expect(full.byStack[full.comboMinimum - 1].comboLethal).toBe(false);
      rows.push(full);
    }
    expect(rows[1].current.damage).toBeGreaterThan(rows[0].current.damage);
    expect(rows[1].minimum).toBeLessThan(rows[0].minimum);
    expect(rows[1].comboMinimum).toBeLessThan(rows[0].comboMinimum);
    expect(rows.map(row => row.current.first.staticPower)).toEqual([65, 95, 125, 365]);
    expect(rows[2].current.damage).toBeGreaterThan(rows[1].current.damage);
    expect(rows[3].current.damage).toBeGreaterThan(rows[2].current.damage);
    expect(rows[3].minimum).toBeLessThan(rows[1].minimum);
    expect(calculateDeerSummaryRows(source, setup, { reuse: true }).find(row => row.id === "overcharge").current)
      .toEqual(rows[0].current);
    expect(setup).toEqual(before);
  }, 30_000);

  test("过充电不附带引电，先发补刀不继承永久加威，其余候选不受聚能次数影响", () => {
    const setup = { ...setupFor(), stacks: 0, overchargeCount: 1, dischargeElectrified: true };
    const before = structuredClone(setup);
    const result = evaluate(setup);
    expect(result.electrified).toBeNull();
    expect(result.damage).toBe(result.first.totalDamage);
    expect(result.first.staticPower).toBe(95);
    expect(result.followup).toMatchObject({ status: "exact", staticPower: 55, skillCost: 2 });
    expect(result.comboDamage).toBe(result.damage + result.followup.totalDamage);
    for (const variant of DEER_VARIANTS) {
      expect(evaluateDeerAttack(current, setup, variant, 0))
        .toEqual(evaluateDeerAttack(current, { ...setup, overchargeCount: 0 }, variant, 0));
    }
    expect(setup).toEqual(before);
  });

  test.each(["波普鹿", "爵士鹿"])("旧数据的%s不显示不存在的过充电候选", name => {
    const legacy = withCalculatorExtras(snapshot);
    expect(legacy.skills.some(skill => skill.name === "过充电")).toBe(false);
    const variants = deerVariantsFor(legacy, setupFor(name, legacy));
    expect(variants.some(variant => variant.id === "overcharge")).toBe(false);
    expect(variants).toHaveLength(name === "爵士鹿" ? DEER_VARIANTS.length + 1 : DEER_VARIANTS.length);
  });
});
