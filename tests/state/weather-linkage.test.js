import { expect, test } from "vitest";
import snapshot from "../../public/data/runtime.json";
import { createInitialState } from "../../src/state/defaults.js";
import { applyConfiguration, migrateSharedConfiguration, patchFourSkill, replaceConfiguration, selectSingleSkill, updateGlobalRain, updateGlobalWeather, updateMirroredTraitContext } from "../../src/state/calculator-session.js";
import { calculatorReducer } from "../../src/state/reducer.js";
import { getTraitEffectInputs, resolveTraitEffectRule } from "../../src/domain/trait-effects.js";
import { getSkillEffectInputs } from "../../src/domain/skill-effects.js";
import { normalizeTriggerControls, projectTriggerContext } from "../../src/domain/trigger-controls.js";
import { currentWeather } from "../../src/state/weather.js";
import { decodeShareState, encodeShareState } from "../../src/state/share.js";
import { canonicalTraitControlKey, extractTraitValues } from "../../src/state/trait-values.js";
import { withWebPreview } from "../../src/features/s5-preview/with-web-preview.js";
import { getS5PreviewTraitEvaluation } from "../../src/domain/s5-preview-traits.js";

const dreamTrait = { previewIdentity: { catalogId: "s5-weather-test", mechanicKey: "lily-of-valley" } };
const dreamControls = ["attacker", "defender"].map((role) =>
  getTraitEffectInputs(dreamTrait, role).find((input) => input.contextKey.endsWith("DreamActive")),
);

const whaleTrait = { previewIdentity: { catalogId: "s5-weather-test", mechanicKey: "jingyu" } };
const gooseTrait = { previewIdentity: { catalogId: "s5-weather-test", mechanicKey: "doulie" } };
const whaleSnow = getTraitEffectInputs(whaleTrait).find(input => input.contextKey.endsWith("SnowActive"));
const gooseTriggered = getTraitEffectInputs(gooseTrait).find(input => input.contextKey.endsWith("SnowTriggered"));
const gooseTurns = getTraitEffectInputs(gooseTrait).find(input => input.contextKey.endsWith("SnowTurnsRemaining"));

test("鲸羽只读真实全场暴风雪，特性天气与全局互斥且双向同步", () => {
  const evaluate = state => getS5PreviewTraitEvaluation(whaleTrait, "attacker", state.directions.forward.context);
  const snow = updateGlobalWeather(initial(), "blizzard").state;
  expect(evaluate(snow)).toMatchObject({ effects: [], summary: expect.stringContaining("回合末待适配") });
  expect(projectTriggerContext(snow.directions.forward.context, [whaleSnow])[whaleSnow.contextKey]).toBe(true);
  expect(whaleSnow.scope).toBe("battle");
  const rain = updateGlobalWeather(snow, "rain").state;
  expect(evaluate(rain).effects).toEqual([]);
  const fromTrait = updateMirroredTraitContext(rain, { direction: "forward", key: whaleSnow.id, value: true }).state;
  expectBlizzard(fromTrait, true);
  expect(fromTrait.directions.reverse.context.weatherRainTurns).toBe(0);
  const dream = updateGlobalWeather(fromTrait, "dream").state;
  expect(evaluate(dream).effects).toEqual([]);
  expect(evaluate({ directions: { forward: { context: { [whaleSnow.id]: true, attackerTraitS5FreezeApplicationConfirmed: true } } } }).effects).toEqual([]);
  expect(getS5PreviewTraitEvaluation(whaleTrait, "attacker", { weatherBlizzard: true, weatherRainTurns: 3 }).effects).toEqual([]);
  expect(getTraitEffectInputs(whaleTrait)).toHaveLength(1);
});

test("豆粒鹅确认触发同步5回合全场雪天，手调剩余生效且0回合不回弹", async () => {
  const rain = updateGlobalWeather(initial(), "rain").state;
  const snow = updateMirroredTraitContext(rain, { direction: "forward", key: gooseTriggered.id, value: true }).state;
  expectBlizzard(snow, true);
  for (const direction of Object.values(snow.directions)) {
    expect(direction.context.weatherTurns).toBe(5);
    expect(direction.context.weatherRainTurns).toBe(0);
  }
  expect(getS5PreviewTraitEvaluation(gooseTrait, "attacker", snow.directions.forward.context).summary).toContain("剩余 5 回合");
  const three = updateMirroredTraitContext(snow, { direction: "forward", key: gooseTurns.id, value: 3 }).state;
  expect(three.directions.reverse.context.weatherTurns).toBe(3);
  const afterRefresh = migrateSharedConfiguration(await decodeShareState(await encodeShareState(three), three.versions), three.versions, snapshot);
  expect(afterRefresh.directions.forward.context.weatherTurns).toBe(3);
  const clear = updateMirroredTraitContext(three, { direction: "forward", key: gooseTurns.id, value: 0 }).state;
  expectBlizzard(clear, false);
  expect(currentWeather(clear.directions.reverse.context)).toBe("none");
  expect(clear.directions.forward.context.weatherTurns).toBe(0);
  const resumed = updateMirroredTraitContext(clear, { direction: "forward", key: gooseTurns.id, value: 3 }).state;
  expectBlizzard(resumed, true);
  expect(resumed.directions.forward.context.weatherTurns).toBe(3);
  expect(resumed.directions.reverse.context.weatherTurns).toBe(3);
  expect(getS5PreviewTraitEvaluation(gooseTrait, "attacker", resumed.directions.forward.context).summary).toContain("剩余 3 回合");
});

test.each(["rain", "dream"])("豆粒鹅本局已触发历史保留，改%s天气不被0到正数的旧历史抢回", weather => {
  const snow = updateMirroredTraitContext(initial(), { direction: "forward", key: gooseTriggered.id, value: true }).state;
  const cleared = updateMirroredTraitContext(snow, { direction: "forward", key: gooseTurns.id, value: 0 }).state;
  const other = updateGlobalWeather(cleared, weather).state;
  const evaluation = getS5PreviewTraitEvaluation(gooseTrait, "attacker", other.directions.forward.context);
  expect(evaluation.summary).toContain("本局雪天已触发；当前未处于雪天");
  expect(evaluation.effects).toEqual([]);
  const editHistory = updateMirroredTraitContext(other, { direction: "forward", key: gooseTurns.id, value: 3 }).state;
  expect(currentWeather(editHistory.directions.forward.context)).toBe(weather);
  expect(currentWeather(editHistory.directions.reverse.context)).toBe(weather);
});

test("双方都有豆粒鹅时，确认触发读取实际持有方的回合输入", () => {
  const reverseInputs = getTraitEffectInputs(gooseTrait, "defender");
  const reverseTurns = reverseInputs.find(input => input.contextKey.endsWith("SnowTurnsRemaining"));
  const reverseTrigger = reverseInputs.find(input => input.contextKey.endsWith("SnowTriggered"));
  let state = updateMirroredTraitContext(initial(), { direction: "forward", key: gooseTurns.id, value: 2 }).state;
  state = updateMirroredTraitContext(state, { direction: "forward", key: reverseTurns.id, value: 4 }).state;
  const snow = updateMirroredTraitContext(state, { direction: "forward", key: reverseTrigger.id, value: true }).state;
  expect(snow.directions.forward.context.weatherTurns).toBe(4);
  expect(snow.directions.reverse.context.weatherTurns).toBe(4);
});

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

test("得寸进尺只保留雨天勾选，开关和切换天气同步取消特性", () => {
  const trait = snapshot.traits.find((value) => value.name === "得寸进尺");
  const controls = getTraitEffectInputs(trait);
  const rainControl = controls.find((value) => value.contextKey === "rainWeather");
  expect(controls).toHaveLength(1);
  expect(rainControl.label).toBe("雨天");
  const rain = updateMirroredTraitContext(initial(), { direction: "forward", key: rainControl.id, value: true }).state;
  expect(rain.directions.reverse.context.weatherRainTurns).toBe(8);
  const input = { attacker: {}, defender: {}, skill: { category: "physical", type: "普通" } };
  expect(resolveTraitEffectRule(trait, "attacker", { ...input, context: rain.directions.forward.context })).toMatchObject({ powerPercentAdd: 1, attackLevelBonus: 0 });
  const cleared = updateMirroredTraitContext(rain, { direction: "forward", key: rainControl.id, value: false }).state;
  expect(cleared.directions.reverse.context.weatherRainTurns).toBe(0);
  expect(resolveTraitEffectRule(trait, "attacker", { ...input, context: cleared.directions.forward.context })).toMatchObject({ powerPercentAdd: 0, attackLevelBonus: 0 });
  const snow = updateGlobalWeather(rain, "blizzard").state;
  expect(snow.directions.forward.context[rainControl.id]).toBe(false);
  expect(resolveTraitEffectRule(trait, "attacker", { ...input, context: snow.directions.forward.context })).toMatchObject({ powerPercentAdd: 0, attackLevelBonus: 0 });
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


function expectDream(state, enabled) {
  for (const direction of Object.values(state.directions)) {
    expect(direction.context.weatherDream).toBe(enabled);
    for (const control of dreamControls) {
      expect(projectTriggerContext(direction.context, [control])[control.contextKey]).toBe(enabled);
    }
  }
  for (const side of Object.values(state.sides)) {
    for (const entry of [side.skills.single, side.skills.four[0]]) {
      for (const control of dreamControls) {
        expect(entry.context[control.id]).toBe(enabled);
      }
    }
  }
}

test("萌系占位天气同步铃兰双方控件，与正式天气互斥且不虚构持续回合", () => {
  const dream = updateGlobalWeather(updateGlobalRain(initial(), 3).state, "dream").state;
  expectDream(dream, true);
  expectBlizzard(dream, false);
  for (const direction of Object.values(dream.directions)) {
    expect(currentWeather(direction.context)).toBe("dream");
    expect(direction.context).toMatchObject({ weatherRainTurns: 0, weatherThunder: false,
      weatherSandstorm: false, weatherBlizzard: false, weatherTurns: 0 });
  }
  for (const weather of ["rain", "thunder", "sandstorm", "blizzard", "none"]) {
    const changed = updateGlobalWeather(dream, weather).state;
    expectDream(changed, false);
    expect(currentWeather(changed.directions.reverse.context)).toBe(weather);
  }
});

test("铃兰规范控件、旧上下文字段与天气双向联动，取消后同步清除全场", () => {
  for (const control of dreamControls) {
    for (const key of [control.id, control.contextKey]) {
      const dream = updateMirroredTraitContext(updateGlobalWeather(initial(), "thunder").state,
        { direction: "reverse", key, value: true }).state;
      expectDream(dream, true);
      expect(dream.directions.forward.context.weatherThunder).toBe(false);
      const cleared = updateMirroredTraitContext(dream, { direction: "forward", key, value: false }).state;
      expectDream(cleared, false);
      expect(currentWeather(cleared.directions.reverse.context)).toBe("none");
    }
  }
  const raw = calculatorReducer(initial(), { type: "battle/set-trait-control",
    direction: "reverse", key: dreamControls[1].id, value: true });
  expectDream(raw, true);
});

test("切雨与清空动作取消萌系天气，旧技能槽、旧记忆和无关修改不能复活", () => {
  const dream = updateGlobalWeather(initial(), "dream").state;
  const staleEntry = { ...dream.sides.attacker.skills.single,
    context: { ...dream.sides.attacker.skills.single.context, weatherDream: true },
    memoryBySkill: { [hunt.id]: { context: { weatherDream: true, [dreamControls[0].id]: true } } } };
  const other = snapshot.skills.find((skill) => skill.id !== hunt.id);
  dream.sides.attacker.skills.single = { ...staleEntry, skillId: other.id };
  dream.sides.attacker.skills.four[0] = { ...staleEntry, skillId: other.id };
  const rain = calculatorReducer(dream, { type: "battle/set-rain", value: 3 });
  expectDream(rain, false);
  expect(rain.sides.attacker.skills.single.memoryBySkill[hunt.id].context).toMatchObject({
    weatherDream: false, [dreamControls[0].id]: false,
  });
  const oldSlot = calculatorReducer(rain, { type: "side/set-four-skill", side: "attacker", index: 0, value: staleEntry });
  expectDream(oldSlot, false);
  const selected = selectSingleSkill(oldSlot, { direction: "forward", side: "attacker", skillId: hunt.id, snapshot }).state;
  expectDream(selected, false);
  expect(currentWeather(selected.directions.forward.context)).toBe("rain");
  const cleared = updateGlobalRain(dream, 0).state;
  expectDream(cleared, false);
  expect(currentWeather(cleared.directions.forward.context)).toBe("none");
});

test("萌系天气经真实分享协议与配置迁移往返保留，恢复时重归一化旧槽位", async () => {
  const dream = updateGlobalWeather(initial(), "dream").state;
  const hash = await encodeShareState(dream);
  const decoded = await decodeShareState(hash, dream.versions);
  const migrated = migrateSharedConfiguration(decoded, dream.versions, snapshot);
  const restored = replaceConfiguration(initial(), migrated, { remember: false, source: "share" }).state;
  expectDream(restored, true);
  expect(restored.directions.forward.context.weatherTurns).toBe(0);
  // 刷新/导入的全场天气为准，历史技能里的相反条件不能覆盖它。
  const refreshed = JSON.parse(JSON.stringify(restored));
  refreshed.sides.attacker.skills.single.context[dreamControls[0].id] = false;
  const normalized = migrateSharedConfiguration(refreshed, dream.versions, snapshot);
  expectDream(normalized, true);
});


test("萌系天气属于本场，个人配置提取及新旧铃兰配置应用不能重新带回天气", () => {
  const preview = withWebPreview(snapshot);
  const base = createInitialState(preview);
  base.sides.attacker.spiritId = "spirit_preview_s5_lily-of-valley";
  const dream = updateGlobalWeather(base, "dream").state;
  const configuration = structuredClone(dream.sides.attacker);
  configuration.traitValues = extractTraitValues(configuration, preview);
  expect(dreamControls.every((control) => control.scope === "battle")).toBe(true);
  expect(Object.keys(configuration.traitValues).some((key) => key.includes("DreamActive"))).toBe(false);
  const [legacyControl] = normalizeTriggerControls([{ contextKey: "attackerTraitS5DreamActive",
    label: "当前处于梦境", type: "boolean", defaultValue: false, scope: "direction" }], { source: "attackerTrait" });
  const legacy = structuredClone(configuration);
  legacy.traitValues[canonicalTraitControlKey(legacyControl)] = true;
  legacy.skills.single.context[legacyControl.id] = true;
  legacy.skills.single.context[legacyControl.contextKey] = true;
  legacy.skills.single.memoryBySkill = { [legacy.skills.single.skillId]: {
    context: { [legacyControl.id]: true },
  } };
  expect(Object.keys(extractTraitValues(legacy, preview)).some((key) => key.includes("DreamActive"))).toBe(false);
  const rain = updateGlobalWeather(dream, "rain").state;
  // 旧会话/分享中的规范字段仍可识别，只有个人配置不得携带天气。
  const legacySession = updateMirroredTraitContext(rain, {
    direction: "forward", key: legacyControl.id, value: true,
  }).state;
  expectDream(legacySession, true);
  for (const personal of [configuration, legacy]) {
    const applied = applyConfiguration(rain, personal, {
      initialState: createInitialState(preview), remember: false, side: "attacker", snapshot: preview, source: "personal",
    }).state;
    for (const direction of Object.values(applied.directions)) {
      expect(currentWeather(direction.context)).not.toBe("dream");
      expect(direction.context.weatherDream).not.toBe(true);
    }
  }
});
