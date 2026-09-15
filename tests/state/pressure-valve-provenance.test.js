import { test, expect } from "vitest";
import { readFileSync } from "node:fs";
import { withCalculatorExtras } from "../../src/data/snapshot-extras.js";
import { createInitialState } from "../../src/state/defaults.js";
import { applyBattleActivation } from "../../src/state/battle-activation.js";
import { buildCalculatorViewModel } from "../../src/domain/calculator-view-model.js";

const snapshot = withCalculatorExtras(JSON.parse(readFileSync("public/data/runtime.json", "utf8")));
const skill = name => snapshot.skills.find(entry => entry.name === name).id;
function setup() {
  const state = createInitialState(snapshot);
  state.mode = "four";
  state.sides.attacker.spiritId = snapshot.spirits.find(s => s.fullName === "摇铃魔偶").id;
  state.sides.defender.spiritId = snapshot.spirits.find(s => s.fullName === "圣草迪莫").id;
  state.sides.attacker.skills.four = ["羽化加速", "热身运动", "减压阀", "午夜噪音"].map(skill);
  return state;
}
const view = state => buildCalculatorViewModel({ snapshot, state, activeDirection: "forward" }).calculation.forward.results;

test("被动与羽化加速均具名，修复来源不改变已复现伤害", () => {
  const state = setup();
  expect(view(state)[3].totalDamage).toBe(355);
  expect(view(state)[3].gainSummary).toBe("减压阀·被动 +10");
  const next = applyBattleActivation({ side: "attacker", skillIndex: 0, snapshot, state }).state;
  const before = JSON.stringify(next);
  const result = view(next)[3];
  expect(result.totalDamage).toBe(595);
  expect(result.gainSummary).toBe("羽化加速×1 · 减压阀·被动 +10");
  expect(result.gainSources.fixed.map(source => source.amount)).toEqual([20, 10]);
  expect(JSON.stringify(next)).toBe(before);
});

test("手调使用次数与两侧相邻槽位，手动增益共存，移除后不留被动来源", () => {
  const state = setup();
  state.sides.attacker.skills.four = [skill("午夜噪音"), { skillId: skill("减压阀"), context: { pressureValveUseCount: 2 } }, skill("午夜噪音"), skill("羽化加速")];
  state.directions.forward.overrides.fixedPowerAddsBySlot = { 1: 7 };
  state.directions.forward.overrides.gainSources = { "fixedPowerAddsBySlot.1": { value: 7, sources: [{ kind: "manual", id: "manual", name: "手动", count: 0, amount: 7 }] } };
  for (const index of [0, 2]) {
    const result = view(state)[index];
    expect(result.gainSummary).toContain("减压阀·被动 +50（使用2次）");
    expect(result.gainSummary).not.toContain("未记录");
  }
  expect(view(state)[0].gainSummary).toContain("手动");
  state.sides.attacker.skills.four[1] = skill("热身运动");
  expect(view(state)[0].gainSummary).toBe("手动");
});

test("两个减压阀相邻加成合并，真正缺来源的旧数值仍提示未记录", () => {
  const state = setup();
  state.sides.attacker.skills.four = [skill("减压阀"), skill("午夜噪音"), skill("减压阀"), skill("午夜噪音")];
  for (const index of [1, 3]) {
    const result = view(state)[index];
    expect(result.gainSummary).toBe("减压阀·被动 +10");
    expect(result.gainSources.fixed.reduce((sum, source) => sum + source.amount, 0)).toBe(20);
  }
  state.directions.forward.overrides.fixedPowerAddsBySlot = { 2: 7 };
  expect(view(state)[1].gainSummary).toBe("未记录 · 减压阀·被动 +10");
});

test("主动使用增强被动，手调后接着累计，撤回快照可恢复", () => {
  const initial = setup();
  const use = state => applyBattleActivation({ side: "attacker", skillIndex: 2, snapshot, state });
  const first = use(initial);
  expect(first.applied).toBe(true);
  expect(first.state.sides.attacker.skills.four[2].context.pressureValveUseCount).toBe(1);
  expect(view(first.state)[3].gainSummary).toBe("减压阀·被动 +30（使用1次）");
  expect(view(first.state)[2].usageSummary).toMatchObject({ count: 1, appliedEffects: ["相邻技能威力+30"] });
  const second = use(first.state);
  expect(view(second.state)[3].gainSummary).toBe("减压阀·被动 +50（使用2次）");
  expect(view(first.state)[3].gainSummary).toBe("减压阀·被动 +30（使用1次）");
  expect(view(initial)[3].gainSummary).toBe("减压阀·被动 +10");
  second.state.sides.attacker.skills.four[2].context.pressureValveUseCount = 5;
  const sixth = use(second.state);
  expect(view(sixth.state)[2].usageSummary.count).toBe(6);
  expect(view(sixth.state)[3].gainSummary).toBe("减压阀·被动 +130（使用6次）");
  sixth.state.sides.attacker.skills.four[2].context.pressureValveUseCount = 0;
  expect(view(sixth.state)[2].usageSummary).toBeUndefined();
  sixth.state.sides.attacker.skills.four[2].context.pressureValveUseCount = 20;
  expect(use(sixth.state).applied).toBe(false);
});
