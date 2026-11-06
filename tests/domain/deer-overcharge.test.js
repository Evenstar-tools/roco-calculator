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
const variants = [
  { id: "overcharge", label: "过充电 · 未强化", power: 65 },
  { id: "overcharge-charged", label: "过充电 · 已强化", power: 95 },
];

function setupFor(name = "波普鹿", source = current) {
  const setup = createDeerSetup(source);
  setup.state.sides.attacker.spiritId = source.spirits.find(spirit => spirit.fullName === name).id;
  return setup;
}

function variantFor(setup, id, source = current) {
  return deerVariantsFor(source, setup).find(variant => variant.id === id);
}

function evaluate(setup, id, stacks = setup.stacks, source = current) {
  return evaluateDeerAttack(source, setup, variantFor(setup, id, source), stacks);
}

describe("电鹿过充电", () => {
  test.each(["波普鹿", "爵士鹿"])("%s首两行分别展示未强化与已强化，固定65/95威力且与入场层数独立", name => {
    expect(overcharge).toMatchObject({ name: "过充电", type: "电", category: "physical", cost: 2, basePower: 65 });
    const setup = setupFor(name);
    expect(deerVariantsFor(current, setup).slice(0, 2).map(({ id, label }) => ({ id, label })))
      .toEqual(variants.map(({ id, label }) => ({ id, label })));
    const before = structuredClone(setup);
    for (const { id, power } of variants) {
      const damages = [0, 1, 5].map(stacks => {
        const result = evaluate(setup, id, stacks);
        expect(result.first).toMatchObject({ status: "exact", staticPower: power, skillCost: 2 });
        expect(evaluate(setup, id, stacks)).toEqual(result);
        return result.damage;
      });
      expect(damages[1]).toBeGreaterThan(damages[0]);
      expect(damages[2]).toBeGreaterThan(damages[1]);
    }
    expect(setup).toEqual(before);
  });

  test.each(["single", "four"])("%s导入旧高次数及布尔的普通键、稳定键、方向与技能槽覆盖，两行仍分别为65/95", mode => {
    for (const [input, value, zero] of [[control, 1000, 0], [legacyControl, true, false]]) {
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
        const setupBefore = structuredClone(setup);
        for (const { id, power } of variants) {
          expect(evaluate(setup, id).first.staticPower, origin).toBe(power);
        }
        expect(setup, origin).toEqual(setupBefore);
        expect(state, origin).toEqual(before);
      }
    }
  });

  test("两行摘要、逐层明细和连招阈值各自一致，冻结数据缓存保持强化状态隔离", () => {
    const source = freezeSnapshot(structuredClone(current));
    const setup = setupFor("波普鹿", source);
    setup.state.directions.forward.overrides.context = { [control.id]: 1000, [legacyControl.id]: true };
    const before = structuredClone(setup);
    const summary = calculateDeerSummaryRows(source, setup, { reuse: true });
    const fullRows = variants.map(({ id }) => calculateDeerRow(source, setup, variantFor(setup, id, source)));
    for (const full of fullRows) {
      expect(summary.find(row => row.id === full.id))
        .toMatchObject({ current: full.current, minimum: full.minimum, comboMinimum: full.comboMinimum });
      expect(full.current).toEqual(evaluate(setup, full.id, setup.stacks, source));
      expect(full.minimum).not.toBeNull();
      expect(full.comboMinimum).not.toBeNull();
      expect(full.comboMinimum).toBeLessThanOrEqual(full.minimum);
      expect(full.byStack[full.minimum].lethal).toBe(true);
      if (full.minimum > 0) expect(full.byStack[full.minimum - 1].lethal).toBe(false);
      expect(full.byStack[full.comboMinimum].comboLethal).toBe(true);
      if (full.comboMinimum > 0) expect(full.byStack[full.comboMinimum - 1].comboLethal).toBe(false);
    }
    expect(fullRows.map(row => row.current.first.staticPower)).toEqual([65, 95]);
    expect(fullRows[1].current.damage).toBeGreaterThan(fullRows[0].current.damage);
    expect(fullRows[1].minimum).toBeLessThan(fullRows[0].minimum);
    expect(fullRows[1].comboMinimum).toBeLessThan(fullRows[0].comboMinimum);
    summary.find(row => row.id === "overcharge").current.damage = -1;
    const cached = calculateDeerSummaryRows(source, setup, { reuse: true });
    expect(cached.find(row => row.id === "overcharge").current).toEqual(fullRows[0].current);
    expect(cached.find(row => row.id === "overcharge-charged").current).toEqual(fullRows[1].current);
    expect(setup).toEqual(before);
  }, 30_000);

  test("两行均不附带引电，先发补刀不继承强化，其他技能不受导入聚能条件影响", () => {
    const setup = { ...setupFor(), stacks: 0, dischargeElectrified: true };
    const imported = structuredClone(setup);
    imported.state.directions.forward.overrides.context = { [control.id]: 1000, [legacyControl.id]: true };
    const before = structuredClone(imported);
    for (const { id, power } of variants) {
      const result = evaluate(imported, id);
      expect(result.electrified).toBeNull();
      expect(result.damage).toBe(result.first.totalDamage);
      expect(result.first.staticPower).toBe(power);
      expect(result.followup).toMatchObject({ status: "exact", staticPower: 55, skillCost: 2 });
      expect(result.comboDamage).toBe(result.damage + result.followup.totalDamage);
    }
    for (const variant of DEER_VARIANTS) {
      const actual = evaluateDeerAttack(current, imported, variant, 0);
      const baseline = evaluateDeerAttack(current, setup, variant, 0);
      // 下一状态保留各自导入的条件；本断言比较技能与连招结算。
      expect({ ...actual, nextState: null }).toEqual({ ...baseline, nextState: null });
    }
    expect(imported).toEqual(before);
  });

  test.each(["波普鹿", "爵士鹿"])("旧数据的%s不显示不存在的两行过充电候选", name => {
    const legacy = withCalculatorExtras(snapshot);
    expect(legacy.skills.some(skill => skill.name === "过充电")).toBe(false);
    const rows = deerVariantsFor(legacy, setupFor(name, legacy));
    expect(rows.some(row => variants.some(variant => variant.id === row.id))).toBe(false);
    expect(rows).toHaveLength(name === "爵士鹿" ? DEER_VARIANTS.length + 1 : DEER_VARIANTS.length);
  });
});
