import { fireEvent, render, screen, within, waitFor } from "@testing-library/react";
import { useState } from "react";
import { expect, test, vi } from "vitest";
import DamageComparisonDialog from "../../src/components/DamageComparisonDialog.jsx";
import { createInitialState } from "../../src/state/defaults.js";
import { damageComparisonSourceKey } from "../../src/state/damage-comparison.js";
import { readFileSync } from "node:fs";

test("承伤列表接近底部自动追加，搜索后可继续滚动且不需要按钮", async () => {
  const stats = { hp: 100, physicalAttack: 100, physicalDefense: 100, magicalAttack: 100, magicalDefense: 100, speed: 100 };
  const snapshot = { meta: { id: "scroll-pagination" }, traits: [],
    spirits: Array.from({ length: 132 }, (_, index) => ({ id: `scroll-${index}`, fullName: `精灵${index}`, types: ["火"], raceStats: stats, stage: "首领", sourceCategory: "首领形态" })),
    skills: [{ id: "fire", name: "火焰", basePower: 80, type: "火", category: "magical" }],
  };
  const { container } = render(<DamageComparisonDialog snapshot={snapshot} source={{ state: createInitialState(snapshot), direction: "forward" }} onClose={vi.fn()} />);
  await waitFor(() => expect(container.querySelectorAll(".dc-web-row")).toHaveLength(60));
  const scroll = container.querySelector(".dc-web-scroll");
  Object.defineProperties(scroll, { scrollHeight: { configurable: true, get: () => container.querySelectorAll(".dc-web-row").length * 80 }, clientHeight: { value: 400 } });
  fireEvent.scroll(scroll, { target: { scrollTop: 100 } });
  expect(container.querySelectorAll(".dc-web-row")).toHaveLength(60);
  fireEvent.scroll(scroll, { target: { scrollTop: 4300 } });
  expect(container.querySelectorAll(".dc-web-row")).toHaveLength(120);
  fireEvent.change(screen.getByLabelText("搜索承伤精灵"), { target: { value: "不存在的精灵" } });
  expect(container.querySelectorAll(".dc-web-row")).toHaveLength(0);
  fireEvent.change(screen.getByLabelText("搜索承伤精灵"), { target: { value: "" } });
  fireEvent.scroll(scroll, { target: { scrollTop: 9100 } });
  expect(container.querySelectorAll(".dc-web-row")).toHaveLength(132);
  fireEvent.scroll(scroll, { target: { scrollTop: 10060 } });
  expect(container.querySelectorAll(".dc-web-row")).toHaveLength(132);
  expect(screen.queryByRole("button", { name: /继续显示/ })).not.toBeInTheDocument();
});

test.each(["forward", "reverse"])("%s 首次关联目标星陨冻结，显式取消跨重开保留", async (direction) => {
  const stats = { hp: 100, physicalAttack: 100, physicalDefense: 100, magicalAttack: 100, magicalDefense: 100, speed: 100 };
  const snapshot = { meta: { id: "status-default" }, traits: [], spirits: ["甲", "乙"].map((name) => ({ id: name, fullName: name, types: ["火"], raceStats: stats, stage: "首领" })), skills: [{ id: "fire", name: "火焰", basePower: 80, type: "火", category: "magical" }] };
  const state = createInitialState(snapshot);
  const target = direction === "reverse" ? "attacker" : "defender";
  state.marks[target].negative = { id: "starfall", stacks: 6 };
  state.negativeStatuses[target].freeze = 2;
  const source = { state, direction };
  const onPreferencesChange = vi.fn();
  const view = render(<DamageComparisonDialog snapshot={snapshot} source={source} onPreferencesChange={onPreferencesChange} onClose={vi.fn()} />);
  expect(screen.getByRole("checkbox", { name: "沿用星陨／冻结" })).toBeChecked();
  expect(screen.getByText(/星陨 6 层 · 冻结 2 层/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole("checkbox", { name: "沿用星陨／冻结" }));
  const preferences = onPreferencesChange.mock.lastCall[0];
  view.unmount();
  state.marks[target].negative.stacks = 8;
  render(<DamageComparisonDialog snapshot={snapshot} source={source} preferences={preferences} onClose={vi.fn()} />);
  expect(screen.getByRole("checkbox", { name: "沿用星陨／冻结" })).not.toBeChecked();
});

test("桌面筛选开关控制选项实际显隐且保留选值", () => {
  const style = document.createElement("style");
  style.textContent = readFileSync("src/styles/24-damage-comparison.css", "utf8");
  document.head.append(style);
  try {
    const stats = { hp: 100, physicalAttack: 100, physicalDefense: 100, magicalAttack: 100, magicalDefense: 100, speed: 100 };
    const snapshot = { traits: [], spirits: [{ id: "甲", fullName: "甲", types: ["火"], raceStats: stats, stage: "首领" }], skills: [{ id: "fire", name: "火焰", basePower: 80, type: "火", category: "magical" }] };
    render(<DamageComparisonDialog snapshot={snapshot} source={{ state: createInitialState(snapshot), direction: "forward" }} onClose={vi.fn()} />);
    const toggle = screen.getByRole("button", { name: "筛选", exact: true });
    const options = screen.getByLabelText("承伤耐久模板").closest(".dc-web-options");
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(getComputedStyle(options).display).toBe("none");
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(getComputedStyle(options).display).toBe("flex");
    fireEvent.change(screen.getByLabelText("承伤耐久模板"), { target: { value: "hp-only-v1" } });
    fireEvent.click(toggle);
    expect(getComputedStyle(options).display).toBe("none");
    fireEvent.click(toggle);
    expect(screen.getByLabelText("承伤耐久模板")).toHaveValue("hp-only-v1");
  } finally { style.remove(); }
});

test.each(["starfall", "freeze"])("自动关联随最新 %s 更新，旧自动关闭不挡住关联", (status) => {
  const stats = { hp: 100, physicalAttack: 100, physicalDefense: 100, magicalAttack: 100, magicalDefense: 100, speed: 100 };
  const snapshot = { traits: [], spirits: [{ id: "甲", fullName: "甲", types: ["火"], raceStats: stats, stage: "首领" }], skills: [{ id: "fire", name: "火焰", basePower: 80, type: "火", category: "magical" }] };
  const state = createInitialState(snapshot);
  const source = { state, direction: "forward" };
  state.negativeStatuses.attacker.freeze = 3;
  const onPreferencesChange = vi.fn();
  const view = render(<DamageComparisonDialog snapshot={snapshot} source={source} onPreferencesChange={onPreferencesChange} onClose={vi.fn()} />);
  expect(screen.getByRole("checkbox", { name: "沿用星陨／冻结" })).not.toBeChecked();
  const preferences = onPreferencesChange.mock.lastCall[0];
  view.unmount();
  if (status === "starfall") state.marks.defender.negative = { id: "starfall", stacks: 6 };
  else state.negativeStatuses.defender.freeze = 2;
  const next = render(<DamageComparisonDialog snapshot={snapshot} source={source} preferences={preferences} onClose={vi.fn()} />);
  expect(screen.getByRole("checkbox", { name: "沿用星陨／冻结" })).toBeChecked();
  next.unmount();
  render(<DamageComparisonDialog snapshot={snapshot} source={source} preferences={{ sourceKey: damageComparisonSourceKey(source), inheritTargetStatuses: false }} onClose={vi.fn()} />);
  expect(screen.getByRole("checkbox", { name: "沿用星陨／冻结" })).toBeChecked();
});

test.each([0, 1, 200, 201])("用户预设 %i 条的可见性、无数量阈值和手动选择记忆", async (count) => {
  const stats = { hp: 100, physicalAttack: 100, physicalDefense: 100, magicalAttack: 100, magicalDefense: 100, speed: 100 };
  const snapshot = { meta: { id: "preset-defaults" }, traits: [],
    spirits: ["甲", "乙"].map((name) => ({ id: name, fullName: name, types: ["火"], raceStats: stats, stage: "首领", sourceCategory: "首领形态" })),
    skills: [{ id: "skill", name: "火焰", basePower: 80, type: "火", category: "magical" }],
  };
  const presets = Object.fromEntries(Array.from({ length: count }, (_, index) => [index === 0 ? "乙" : String(index), { natureId: "timid", displayIvs: { hp: 60, magicalAttack: 60, speed: 60, physicalAttack: 0, physicalDefense: 0, magicalDefense: 0 } }]));
  const source = { state: createInitialState(snapshot), direction: "forward", presetsBySpirit: presets };
  const onPreferencesChange = vi.fn();
  const { unmount } = render(<DamageComparisonDialog snapshot={snapshot} source={source} onClose={vi.fn()} onPreferencesChange={onPreferencesChange} />);
  await screen.findByRole("button", { name: "查看乙承伤详情" });
  expect(screen.queryByRole("option", { name: "用户预设" }) !== null).toBe(count > 0);
  expect(screen.getByLabelText("承伤耐久模板")).toHaveValue(count > 0 ? "user-presets" : "standard-hp-v1");
  if (count) {
    fireEvent.change(screen.getByLabelText("承伤耐久模板"), { target: { value: "user-presets" } });
    await screen.findByRole("button", { name: "查看乙承伤详情" });
    fireEvent.click(screen.getByRole("button", { name: "查看乙承伤详情" }));
    expect(screen.getByText(/胆小 · 生命60／魔攻60／速度60个体/)).toBeInTheDocument();
    expect(screen.queryByText(/未配置预设，使用默认分配/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "查看甲承伤详情" }));
    expect(screen.getByText(/未配置预设，使用默认分配：60级 · 生命性格 · 生命／双防各60个体，其余0/)).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("2 只 · 用户预设");
  }
  fireEvent.change(screen.getByLabelText("承伤耐久模板"), { target: { value: "hp-only-v1" } });
  const preferences = onPreferencesChange.mock.lastCall[0];
  unmount();
  render(<DamageComparisonDialog snapshot={snapshot} source={source} preferences={preferences} onClose={vi.fn()} />);
  await screen.findByRole("button", { name: "查看乙承伤详情" });
  expect(screen.getByLabelText("承伤耐久模板")).toHaveValue("hp-only-v1");
});

test("已导入超过200条时替换自动默认，清空配置后不保留失效用户预设", async () => {
  const stats = { hp: 100, physicalAttack: 100, physicalDefense: 100, magicalAttack: 100, magicalDefense: 100, speed: 100 };
  const snapshot = { meta: { id: "preset-change" }, traits: [], spirits: ["甲", "乙"].map((name) => ({ id: name, fullName: name, types: ["火"], raceStats: stats, stage: "首领", sourceCategory: "首领形态" })), skills: [{ id: "skill", name: "火焰", basePower: 80, type: "火", category: "magical" }] };
  const source = { state: createInitialState(snapshot), direction: "forward" };
  const preferences = { sourceKey: damageComparisonSourceKey(source), templateId: "standard-hp-v1", templateExplicit: false };
  const presetsBySpirit = Object.fromEntries(Array.from({ length: 201 }, (_, index) => [String(index), {}]));
  const { unmount } = render(<DamageComparisonDialog snapshot={snapshot} source={{ ...source, presetsBySpirit }} preferences={preferences} onClose={vi.fn()} />);
  expect(screen.getByLabelText("承伤耐久模板")).toHaveValue("user-presets");
  unmount();
  render(<DamageComparisonDialog snapshot={snapshot} source={source} preferences={{ ...preferences, templateId: "user-presets", templateExplicit: true }} onClose={vi.fn()} />);
  expect(screen.queryByRole("option", { name: "用户预设" })).not.toBeInTheDocument();
  expect(screen.getByLabelText("承伤耐久模板")).toHaveValue("standard-hp-v1");
});

test("承伤榜支持搜索、只读展开、切模板和显式代入", async () => {
  const stats = { hp: 100, physicalAttack: 100, physicalDefense: 100, magicalAttack: 100, magicalDefense: 100, speed: 100 };
  const snapshot = { meta: { id: "comparison" }, traits: [],
    spirits: ["甲", "乙"].map((name) => ({ id: name, fullName: name, aliases: [`别名${name}`], types: ["火"], raceStats: stats, stage: "首领", sourceCategory: "首领形态" })),
    skills: [{ id: "skill", name: "火焰", basePower: 80, type: "火", category: "magical" }],
  };
  const source = { state: createInitialState(snapshot), direction: "forward" };
  const before = JSON.stringify(source);
  const onImport = vi.fn(), onClose = vi.fn();
  render(<DamageComparisonDialog snapshot={snapshot} source={source} onClose={onClose} onImport={onImport} />);
  const dialog = within(screen.getByRole("dialog", { name: "承伤对比" }));
  await dialog.findByRole("button", { name: "查看甲承伤详情" });
  fireEvent.change(dialog.getByLabelText("搜索承伤精灵"), { target: { value: "别名乙" } });
  expect(dialog.queryByRole("button", { name: "查看甲承伤详情" })).not.toBeInTheDocument();
  fireEvent.click(dialog.getByRole("button", { name: "查看乙承伤详情" }));
  expect(onImport).not.toHaveBeenCalled();
  expect(JSON.stringify(source)).toBe(before);
  fireEvent.change(dialog.getByLabelText("承伤耐久模板"), { target: { value: "hp-only-v1" } });
  await waitFor(() => expect(dialog.queryByText(/正在计算/)).not.toBeInTheDocument());
  fireEvent.click(dialog.getByRole("button", { name: "代入防守方复算" }));
  expect(onImport).toHaveBeenCalledWith(snapshot.spirits[1], "hp-only-v1", 0, false);
  fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
  expect(onClose).toHaveBeenCalledOnce();
});

test("同一来源记住选择并重算最新条件，换来源或删除技能不会用错旧选择", async () => {
  const stats = { hp: 100, physicalAttack: 100, physicalDefense: 100, magicalAttack: 100, magicalDefense: 100, speed: 100 };
  const snapshot = { meta: { id: "comparison-memory" }, traits: [],
    spirits: ["甲", "乙"].map((name) => ({ id: name, fullName: name, types: ["草"], raceStats: stats, stage: "首领", sourceCategory: "首领形态" })),
    skills: [{ id: "fire", name: "火焰", basePower: 80, type: "火", category: "magical" }, { id: "ice", name: "碎冰冰", basePower: 60, type: "冰", category: "magical" }],
  };
  const initial = createInitialState(snapshot);
  initial.mode = "four";
  initial.sides.defender.nature = "cautious";
  initial.sides.defender.displayIvs = { hp: 60, magicalDefense: 60, physicalDefense: 0, magicalAttack: 0, physicalAttack: 0, speed: 0 };
  const onImport = vi.fn();
  function Host({ source }) {
    const [open, setOpen] = useState(true);
    const [preferences, setPreferences] = useState(null);
    return <><button onClick={() => setOpen(true)}>再次打开</button>{open ? <DamageComparisonDialog
      key={damageComparisonSourceKey(source)} snapshot={snapshot} source={source} preferences={preferences}
      onPreferencesChange={setPreferences} onClose={() => setOpen(false)} onImport={onImport}
    /> : null}</>;
  }
  const { rerender } = render(<Host source={{ state: initial, direction: "forward" }} />);
  let dialog = within(screen.getByRole("dialog"));
  await dialog.findByRole("button", { name: "查看乙承伤详情" });
  expect(dialog.getByRole("checkbox", { name: "沿用星陨／冻结" })).not.toBeChecked();
  expect(within(dialog.getByLabelText("承伤耐久模板")).getAllByRole("option").map((option) => option.textContent)).toEqual(["生命性格满双防个体", "生命性格无双防个体", "中立性格生命个体", "当前防守方配点"]);
  fireEvent.change(dialog.getByLabelText("比较技能"), { target: { value: "1" } });
  fireEvent.change(dialog.getByLabelText("承伤耐久模板"), { target: { value: "current-defense" } });
  fireEvent.click(dialog.getByRole("checkbox", { name: "沿用星陨／冻结" }));
  fireEvent.click(dialog.getByRole("button", { name: "0%至25%", exact: true }));
  fireEvent.change(dialog.getByLabelText("承伤范围上限"), { target: { value: 100 } });
  fireEvent.change(dialog.getByLabelText("搜索承伤精灵"), { target: { value: "乙" } });
  await waitFor(() => expect(dialog.queryByText(/正在计算/)).not.toBeInTheDocument());
  const oldRow = dialog.getByRole("button", { name: "查看乙承伤详情" }).textContent;
  fireEvent.click(dialog.getByRole("button", { name: "关闭承伤对比" }));
  const updated = { ...initial, negativeStatuses: { ...initial.negativeStatuses, defender: { ...initial.negativeStatuses.defender, freeze: 4 } } };
  rerender(<Host source={{ state: updated, direction: "forward" }} />);
  fireEvent.click(screen.getByRole("button", { name: "再次打开" }));
  dialog = within(screen.getByRole("dialog"));
  await dialog.findByRole("button", { name: "查看乙承伤详情" });
  expect(dialog.getByLabelText("比较技能")).toHaveValue("1");
  expect(dialog.getByLabelText("承伤耐久模板")).toHaveValue("current-defense");
  expect(dialog.getByRole("checkbox", { name: "沿用星陨／冻结" })).toBeChecked();
  expect(dialog.getByText("0%–100%")).toBeInTheDocument();
  expect(dialog.getByLabelText("搜索承伤精灵")).toHaveValue("乙");
  expect(dialog.getByRole("button", { name: "查看乙承伤详情" }).textContent).not.toBe(oldRow);
  fireEvent.click(dialog.getByRole("button", { name: "查看乙承伤详情" }));
  expect(dialog.getByText(/慎重 · 生命60／魔防60个体/)).toBeInTheDocument();
  fireEvent.click(dialog.getByRole("button", { name: "代入防守方复算" }));
  expect(onImport).toHaveBeenCalledWith(snapshot.spirits[1], "current-defense", 1, true);
  fireEvent.click(dialog.getByRole("button", { name: "关闭承伤对比" }));
  const removed = { ...updated, sides: { ...updated.sides, attacker: { ...updated.sides.attacker, skills: { ...updated.sides.attacker.skills, four: ["fire", null, null, null] } } } };
  rerender(<Host source={{ state: removed, direction: "forward" }} />);
  fireEvent.click(screen.getByRole("button", { name: "再次打开" }));
  await screen.findByRole("button", { name: "查看乙承伤详情" });
  expect(screen.getByLabelText("比较技能")).toHaveValue("0");
  const switched = { ...updated, sides: { ...updated.sides, attacker: { ...updated.sides.attacker, spiritId: "乙" } } };
  rerender(<Host source={{ state: switched, direction: "forward" }} />);
  await screen.findByRole("button", { name: "查看甲承伤详情" });
  expect(screen.getByLabelText("承伤耐久模板")).toHaveValue("standard-hp-v1");
  expect(screen.getByRole("checkbox", { name: "沿用星陨／冻结" })).toBeChecked();
  expect(initial.negativeStatuses.defender.freeze).toBe(0);
});
