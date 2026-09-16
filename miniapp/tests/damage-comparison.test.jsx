import { act, fireEvent, render, screen, within, waitFor } from "@testing-library/react";
import { expect, test } from "vitest";
import BattleWorkspace from "../src/components/BattleWorkspace.jsx";
import { createCalculatorStore } from "../src/state/calculator-store.js";
import { createInitialState } from "../src/shared/state/defaults.js";
import DamageComparisonSheet from "../src/components/DamageComparisonSheet.jsx";

test("无预设标记直接显示，详情使用中立性格生命60双防0", async () => {
  const stats = { hp: 100, physicalAttack: 100, physicalDefense: 100, magicalAttack: 100, magicalDefense: 100, speed: 100 };
  const snapshot = { meta: { id: "fallback-mini" }, traits: [], spirits: ["source", "target"].map((id) => ({ id, fullName: id, types: ["草"], raceStats: stats, stage: "首领", sourceCategory: "首领形态" })), skills: [{ id: "hit", name: "测试", type: "普通", category: "magical", basePower: 80 }] };
  const source = { state: createInitialState(snapshot), direction: "forward", presetsBySpirit: { source: { natureId: "timid", displayIvs: { hp: 60, speed: 60 } } } };
  render(<DamageComparisonSheet snapshot={snapshot} source={source} />);
  const row = await screen.findByRole("button", { name: "查看target承伤详情" });
  expect(within(row).getByText("无预设")).toBeVisible();
  expect(within(screen.getByRole("button", { name: "查看source承伤详情" })).queryByText("无预设")).not.toBeInTheDocument();
  fireEvent.click(row);
  expect(screen.getByText(/未配置预设，使用默认分配：60级 · 中立性格 · 生命60个体，双防及其余0/)).toBeInTheDocument();
});

test("冻结蓝条同步实伤拆分、满条筛选与免疫", async () => {
  const stats = { hp: 100, physicalAttack: 100, physicalDefense: 100, magicalAttack: 100, magicalDefense: 100, speed: 100 };
  const snapshot = { meta: { id: "freeze-mini" }, traits: [], spirits: [["source", "普通"], ["target", "草"], ["ice", "冰"]].map(([id, type]) => ({ id, fullName: id, types: [type], raceStats: stats, stage: "首领", sourceCategory: "首领形态" })), skills: [{ id: "hit", name: "测试", type: "普通", category: "magical", basePower: 320 }] };
  const state = createInitialState(snapshot);
  state.negativeStatuses.defender.freeze = 4;
  render(<DamageComparisonSheet snapshot={snapshot} source={{ state, direction: "forward" }} />);
  const row = await screen.findByRole("button", { name: "查看target承伤详情" });
  expect(row).toHaveTextContent("100.2%");
  expect(row).toHaveTextContent("冻结击倒");
  expect(within(row).getByRole("img", { name: "伤害80.2%＋冻结20%" }).firstChild).toHaveStyle({ width: "20%" });
  fireEvent.click(screen.getByRole("button", { name: "≥100%", exact: true }));
  expect(screen.getByRole("button", { name: "查看target承伤详情" })).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "查看ice承伤详情" })).not.toBeInTheDocument();
  fireEvent.click(row);
  expect(screen.getByText(/冻结斩杀≤89 HP/)).toBeInTheDocument();
});

test("范围可选75%以上，触底自动追加目标且没有手动加载入口", async () => {
  const stats = { hp: 100, physicalAttack: 100, physicalDefense: 100, magicalAttack: 100, magicalDefense: 100, speed: 100 };
  const snapshot = { meta: { id: "range-pagination" }, traits: [], spirits: Array.from({ length: 72 }, (_, index) => ({ id: String(index), fullName: `目标${index}`, types: ["火"], raceStats: stats, stage: "首领", sourceCategory: "首领形态" })), skills: [{ id: "fire", name: "火焰", basePower: 80, type: "火", category: "magical" }] };
  const { container } = render(<DamageComparisonSheet snapshot={snapshot} source={{ state: createInitialState(snapshot), direction: "forward" }} />);
  await waitFor(() => expect(container.querySelectorAll(".dc-row")).toHaveLength(60));
  fireEvent.scroll(container.querySelector(".dc-scroll"));
  expect(container.querySelectorAll(".dc-row")).toHaveLength(72);
  expect(screen.queryByRole("button", { name: /继续显示/ })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: /未纳入/ })).not.toBeInTheDocument();
  fireEvent.change(screen.getByLabelText("承伤范围下限"), { target: { value: "75" } });
  expect(screen.getByText("承伤范围 ≥75%")).toBeInTheDocument();
  expect(screen.getByLabelText("承伤范围上限")).toHaveValue("125");
});

test("已有星陨冻结自动关联，手动取消后重开仍保持取消，筛选可反复开关", async () => {
  const stats = { hp: 100, physicalAttack: 100, physicalDefense: 100, magicalAttack: 100, magicalDefense: 100, speed: 100 };
  const snapshot = { meta: { id: "auto-status" }, traits: [], spirits: ["甲", "乙"].map((name) => ({ id: name, fullName: name, types: ["火"], raceStats: stats, stage: "首领" })), skills: [{ id: "fire", name: "火焰", basePower: 80, type: "火", category: "magical" }] };
  const state = createInitialState(snapshot);
  state.marks.defender.negative = { id: "starfall", stacks: 6 };
  state.negativeStatuses.defender.freeze = 2;
  render(<BattleWorkspace damageComparisonEnabled snapshot={snapshot} store={createCalculatorStore(snapshot, state)} />);
  fireEvent.click(screen.getByRole("button", { name: "承伤对比" }));
  let dialog = within(screen.getByRole("dialog", { name: "承伤对比" }));
  expect(dialog.queryByLabelText("耐久模板")).not.toBeInTheDocument();
  fireEvent.click(dialog.getByRole("button", { name: "筛选" }));
  expect(dialog.getByRole("checkbox", { name: "沿用星陨／冻结" })).toHaveAttribute("aria-checked", "true");
  expect(dialog.getByText(/星陨 6 层 · 冻结 2 层/)).toBeInTheDocument();
  fireEvent.click(dialog.getByRole("checkbox", { name: "沿用星陨／冻结" }));
  fireEvent.click(dialog.getByRole("button", { name: "筛选" }));
  expect(dialog.queryByLabelText("耐久模板")).not.toBeInTheDocument();
  fireEvent.click(dialog.getByRole("button", { name: "关闭", exact: true }));
  fireEvent.click(screen.getByRole("button", { name: "承伤对比" }));
  dialog = within(screen.getByRole("dialog", { name: "承伤对比" }));
  fireEvent.click(dialog.getByRole("button", { name: "筛选" }));
  expect(dialog.getByRole("checkbox", { name: "沿用星陨／冻结" })).toHaveAttribute("aria-checked", "false");
});

test("导入超过200条默认使用各自预设，代入和撤回保留配点", async () => {
  const stats = { hp: 100, physicalAttack: 100, physicalDefense: 100, magicalAttack: 100, magicalDefense: 100, speed: 100 };
  const snapshot = { meta: { id: "comparison-presets" }, traits: [], spirits: ["甲", "乙"].map((name) => ({ id: name, fullName: name, types: ["火"], raceStats: stats, stage: "首领", sourceCategory: "首领形态" })), skills: [{ id: "skill", name: "火焰", basePower: 80, type: "火", category: "magical" }] };
  const store = createCalculatorStore(snapshot);
  const before = store.getState();
  const preset = { natureId: "timid", displayIvs: { hp: 60, magicalAttack: 60, speed: 60, physicalDefense: 0, magicalDefense: 0, physicalAttack: 0 } };
  const presets = Object.fromEntries(Array.from({ length: 201 }, (_, i) => [i ? String(i) : "乙", preset]));
  render(<BattleWorkspace damageComparisonEnabled snapshot={snapshot} store={store} configPresetsBySpirit={presets} />);
  fireEvent.click(screen.getByRole("button", { name: "承伤对比" }));
  const dialog = within(screen.getByRole("dialog", { name: "承伤对比" }));
  await dialog.findByRole("button", { name: "查看乙承伤详情" });
  expect(dialog.getByText(/只 · 用户预设/)).toBeInTheDocument();
  fireEvent.click(dialog.getByRole("button", { name: "筛选" }));
  expect(dialog.getByLabelText("耐久模板")).toHaveValue("4");
  fireEvent.click(dialog.getByRole("button", { name: "查看乙承伤详情" }));
  expect(dialog.getByText(/胆小 · 生命60／魔攻60／速度60个体/)).toBeInTheDocument();
  fireEvent.click(dialog.getByRole("button", { name: "代入防守方复算" }));
  expect(store.getState().sides.defender).toMatchObject({ nature: "timid", displayIvs: preset.displayIvs });
  fireEvent.click(screen.getByRole("button", { name: "撤回代入" }));
  expect(store.getState()).toEqual(before);
});

test("承伤榜只读浏览，代入后恢复模板并支持未开启快捷撤回时撤回", async () => {
  const stats = { hp: 100, physicalAttack: 100, physicalDefense: 100, magicalAttack: 100, magicalDefense: 100, speed: 100 };
  const snapshot = { meta: { id: "comparison" }, traits: [],
    spirits: ["甲", "乙"].map((name) => ({ id: name, fullName: name, types: ["火"], raceStats: stats, stage: "首领", sourceCategory: "首领形态" })),
    skills: [{ id: "skill", name: "火焰", basePower: 80, type: "火", category: "magical" }],
    learnsets: ["甲", "乙"].map((spiritId) => ({ spiritId, skillIds: ["skill"] })),
  };
  const store = createCalculatorStore(snapshot);
  const before = store.getState();
  render(<BattleWorkspace damageComparisonEnabled snapshot={snapshot} store={store} />);
  fireEvent.click(screen.getByRole("button", { name: "承伤对比" }));
  const dialog = within(screen.getByRole("dialog", { name: "承伤对比" }));
  await dialog.findByRole("button", { name: "查看甲承伤详情" });
  fireEvent.input(dialog.getByRole("textbox", { name: "搜索承伤精灵" }), { target: { value: "乙" } });
  expect(dialog.queryByRole("button", { name: "查看甲承伤详情" })).not.toBeInTheDocument();
  expect(dialog.getByRole("button", { name: "查看乙承伤详情" })).toBeInTheDocument();
  fireEvent.input(dialog.getByRole("textbox", { name: "搜索承伤精灵" }), { target: { value: "" } });
  fireEvent.click(await dialog.findByRole("button", { name: "查看甲承伤详情" }));
  expect(store.getState()).toBe(before);
  fireEvent.click(dialog.getByRole("button", { name: "代入防守方复算" }));
  expect(screen.queryByRole("dialog", { name: "承伤对比" })).not.toBeInTheDocument();
  expect(store.getState().sides.defender).toMatchObject({ spiritId: "甲", nature: "grounded" });
  expect(store.getState().sides.defender).not.toHaveProperty("ignoreTraits");
  fireEvent.click(screen.getByRole("button", { name: "撤回代入" }));
  expect(store.getState()).toEqual(before);
});

test("承伤选择关闭重开保留，沿用最新冻结和自定义配点且代入可撤回", async () => {
  const stats = { hp: 100, physicalAttack: 100, physicalDefense: 100, magicalAttack: 100, magicalDefense: 100, speed: 100 };
  const snapshot = { meta: { id: "comparison-memory" }, traits: [],
    spirits: ["甲", "乙"].map((name) => ({ id: name, fullName: name, types: ["草"], raceStats: stats, stage: "首领", sourceCategory: "首领形态" })),
    skills: [{ id: "fire", name: "火焰", basePower: 80, type: "火", category: "magical" }, { id: "ice", name: "碎冰冰", basePower: 60, type: "冰", category: "magical" }],
  };
  const initial = createInitialState(snapshot);
  initial.mode = "four";
  initial.sides.defender.nature = "cautious";
  initial.sides.defender.displayIvs = { hp: 60, physicalDefense: 0, magicalDefense: 60, physicalAttack: 0, magicalAttack: 0, speed: 0 };
  const store = createCalculatorStore(snapshot, initial);
  render(<BattleWorkspace damageComparisonEnabled snapshot={snapshot} store={store} />);
  const open = async () => {
    fireEvent.click(screen.getByRole("button", { name: "承伤对比" }));
    const dialog = within(screen.getByRole("dialog", { name: "承伤对比" }));
    await dialog.findByRole("button", { name: "查看乙承伤详情" });
    return dialog;
  };
  let dialog = await open();
  fireEvent.click(dialog.getByRole("button", { name: "筛选" }));
  expect(dialog.getByRole("checkbox", { name: "沿用星陨／冻结" })).toHaveAttribute("aria-checked", "false");
  expect(within(dialog.getByLabelText("耐久模板")).getAllByRole("option").map((option) => option.textContent)).toEqual(["生命性格满双防个体", "生命性格无双防个体", "中立性格生命个体", "当前防守方配点"]);
  fireEvent.change(dialog.getByLabelText("技能"), { target: { value: "1" } });
  fireEvent.change(dialog.getByLabelText("耐久模板"), { target: { value: "3" } });
  fireEvent.click(dialog.getByRole("checkbox", { name: "沿用星陨／冻结" }));
  fireEvent.change(dialog.getByLabelText("承伤范围上限"), { target: { value: "100" } });
  fireEvent.input(dialog.getByRole("textbox", { name: "搜索承伤精灵" }), { target: { value: "乙" } });
  await waitFor(() => expect(dialog.queryByText(/正在计算/)).not.toBeInTheDocument());
  const previousRow = dialog.getByRole("button", { name: "查看乙承伤详情" }).textContent;
  fireEvent.click(dialog.getByRole("button", { name: "关闭", exact: true }));
  expect(store.getState()).toBe(initial);
  act(() => store.dispatch({ type: "state/replace", value: { ...initial, negativeStatuses: { ...initial.negativeStatuses, defender: { ...initial.negativeStatuses.defender, freeze: 4 } } } }));
  const beforeImport = store.getState();
  dialog = await open();
  expect(dialog.getByLabelText("技能")).toHaveValue("1");
  expect(dialog.getByLabelText("耐久模板")).toHaveValue("3");
  expect(dialog.getByRole("checkbox", { name: "沿用星陨／冻结" })).toHaveAttribute("aria-checked", "true");
  expect(dialog.getByLabelText("承伤范围上限")).toHaveValue("100");
  expect(dialog.getByRole("textbox", { name: "搜索承伤精灵" })).toHaveValue("乙");
  expect(dialog.getByText(/星陨 0 层 · 冻结 4 层/)).toBeInTheDocument();
  expect(dialog.getByRole("button", { name: "查看乙承伤详情" }).textContent).not.toBe(previousRow);
  fireEvent.click(dialog.getByRole("button", { name: "查看乙承伤详情" }));
  expect(dialog.getByText(/慎重 · 生命60／魔防60个体/)).toBeInTheDocument();
  fireEvent.click(dialog.getByRole("button", { name: "代入防守方复算" }));
  expect(store.getState().negativeStatuses.defender.freeze).toBe(4);
  expect(store.getState().sides.defender.displayIvs).toEqual(initial.sides.defender.displayIvs);
  fireEvent.click(screen.getByRole("button", { name: "撤回代入" }));
  expect(store.getState()).toEqual(beforeImport);
});
