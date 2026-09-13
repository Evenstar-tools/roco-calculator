import { expect, test } from "vitest";
import snapshot from "../../public/data/runtime.json";
import { createInitialState } from "../../src/state/defaults.js";
import { patchFourSkill, selectSingleSkill, updateGlobalRain, updateGlobalWeather, updateMirroredTraitContext } from "../../src/state/calculator-session.js";
import { calculatorReducer } from "../../src/state/reducer.js";
import { getTraitEffectInputs, resolveTraitEffectRule } from "../../src/domain/trait-effects.js";
import { getSkillEffectInputs } from "../../src/domain/skill-effects.js";
import { projectTriggerContext } from "../../src/domain/trigger-controls.js";

const hunt = snapshot.skills.find((skill) => skill.name === "雪原狩猎");
const soul = snapshot.traits.find((trait) => trait.name === "冰雪魂魄");
const huntControl = getSkillEffectInputs(hunt)[0];
const soulControl = getTraitEffectInputs(soul, "attacker")[0];

function initial() {
  const state = createInitialState(snapshot);
  for (const side of Object.values(state.sides)) {
    side.skills.single = { skillId: hunt.id, context: { [huntControl.id]: false } };
    side.skills.four[0] = { skillId: hunt.id, context: { [huntControl.id]: false } };
  }
  return state;
}

function expectBlizzard(state, enabled) {
  for (const direction of Object.values(state.directions)) {
    expect(direction.context.weatherBlizzard).toBe(enabled);
    expect(projectTriggerContext(direction.context, [soulControl]).blizzardWeather).toBe(enabled);
  }
  for (const side of Object.values(state.sides)) {
    for (const entry of [side.skills.single, side.skills.four[0]]) {
      expect(projectTriggerContext(entry.context, [huntControl]).blizzardWeather).toBe(enabled);
    }
  }
}

test("选择暴风雪同步双方单技能、四技能及冰雪魂魄，切换雨天一并取消", () => {
  const snow = updateGlobalWeather(initial(), "blizzard").state;
  expectBlizzard(snow, true);
  const rain = updateGlobalWeather(snow, "rain").state;
  expectBlizzard(rain, false);
  expect(rain.directions.forward.context.weatherRainTurns).toBe(8);
});

test("单技能从完整上下文勾选暴风雪，覆盖原有雨天；取消同步所有控件", () => {
  const rain = updateGlobalWeather(initial(), "rain").state;
  const snow = calculatorReducer(rain, { type: "direction/update", direction: "reverse",
    value: { context: { ...rain.directions.reverse.context, [huntControl.id]: true } } });
  expectBlizzard(snow, true);
  expect(snow.directions.forward.context.weatherRainTurns).toBe(0);
  const cleared = calculatorReducer(snow, { type: "direction/update", direction: "reverse",
    value: { context: { ...snow.directions.reverse.context, [huntControl.id]: false } } });
  expectBlizzard(cleared, false);
});

test("四技能控件与 Web / 小程序特性控件都能双向驱动天气", () => {
  const snow = patchFourSkill(initial(), { side: "attacker", index: 0, snapshot,
    patch: { context: { [huntControl.id]: true } } }).state;
  expectBlizzard(snow, true);
  const cleared = updateMirroredTraitContext(snow, { direction: "forward", key: soulControl.id, value: false }).state;
  expectBlizzard(cleared, false);
  const miniSnow = calculatorReducer(cleared, { type: "battle/set-trait-control",
    direction: "reverse", key: soulControl.id, value: true });
  expectBlizzard(miniSnow, true);
});

test("流沙统治者是全局沙暴条件，与暴风雪、雷鸣和雨天互斥", () => {
  const sandControl = getTraitEffectInputs(snapshot.traits.find((trait) => trait.name === "流沙统治者"))[0];
  expect(sandControl.scope).toBe("battle");
  const snow = updateGlobalWeather(initial(), "blizzard").state;
  const sand = updateMirroredTraitContext(snow, { direction: "forward", key: sandControl.id, value: true }).state;
  expectBlizzard(sand, false);
  expect(sand.directions.reverse.context.weatherSandstorm).toBe(true);
  const thunder = updateGlobalWeather(sand, "thunder").state;
  expect(thunder.directions.forward.context[sandControl.id]).toBe(false);
  expect(thunder.directions.reverse.context.weatherThunder).toBe(true);
  const rain = updateGlobalRain(thunder, 3).state;
  expect(rain.directions.reverse.context.weatherThunder).toBe(false);
  expect(rain.directions.reverse.context.weatherRainTurns).toBe(3);
});

test("换技能或恢复旧槽位记忆不能改变当前天气", () => {
  const snow = updateGlobalWeather(initial(), "blizzard").state;
  const other = snapshot.skills.find((skill) => skill.id !== hunt.id);
  const switched = selectSingleSkill(snow, { direction: "forward", side: "attacker", skillId: other.id, snapshot }).state;
  const back = selectSingleSkill(switched, { direction: "forward", side: "attacker", skillId: hunt.id, snapshot }).state;
  expectBlizzard(back, true);
});

test("雨天触发得寸进尺，非天气水系环境独立保留，不制造第二种天气", () => {
  const trait = snapshot.traits.find((value) => value.name === "得寸进尺");
  const controls = getTraitEffectInputs(trait);
  const rainControl = controls.find((value) => value.contextKey === "rainWeather");
  const waterControl = controls.find((value) => value.contextKey === "traitActivated");
  const rain = updateMirroredTraitContext(initial(), { direction: "forward", key: rainControl.id, value: true }).state;
  expect(rain.directions.reverse.context.weatherRainTurns).toBe(8);
  const input = { attacker: {}, defender: {}, skill: { category: "physical", type: "普通" } };
  expect(resolveTraitEffectRule(trait, "attacker", { ...input, context: rain.directions.forward.context }).attackMultiplier).toBe(2);
  const water = updateMirroredTraitContext(rain, { direction: "forward", key: waterControl.id, value: true }).state;
  const snow = updateGlobalWeather(water, "blizzard").state;
  expect(snow.directions.forward.context[rainControl.id]).toBe(false);
  expect(snow.directions.forward.context[waterControl.id]).toBe(true);
  expect(resolveTraitEffectRule(trait, "attacker", { ...input, context: snow.directions.forward.context }).attackMultiplier).toBe(2);
});

test("撤销恢复整场天气，不丢失其他条件；单独开启雷鸣也会取消雨天", () => {
  const base = initial();
  base.directions.forward.context.customCondition = 7;
  const rain = updateGlobalRain(base, 3).state;
  const snow = updateGlobalWeather(rain, "blizzard").state;
  const restored = calculatorReducer(snow, { type: "state/replace", value: rain });
  expectBlizzard(restored, false);
  expect(restored.directions.forward.context).toMatchObject({ weatherRainTurns: 3, customCondition: 7 });
  const thunder = calculatorReducer(restored, { direction: "reverse", type: "direction/update",
    value: { context: { weatherThunder: true } } });
  expect(thunder.directions.forward.context).toMatchObject({ weatherThunder: true, weatherRainTurns: 0 });
});
