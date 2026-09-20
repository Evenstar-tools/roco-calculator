import { readFileSync } from "node:fs";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { expect, test } from "vitest";
import { withCalculatorExtras } from "../../src/data/snapshot-extras.js";
import { DeerWorkspace } from "../../src/features/deer/DeerPage.jsx";
import { AppHeader } from "../../src/components/AppHeader.jsx";
import { createDeerSetup } from "../../src/features/deer/deer-model.js";
import userEvent from "@testing-library/user-event";
import { getTraitView } from "../../src/domain/calculator-view-model.js";

const snapshot = withCalculatorExtras(JSON.parse(readFileSync("public/data/runtime.json", "utf8")));
const skillRow = (name) => screen.getByRole("button", { name, exact: true }).closest("tr");

test.each(["满月砣（下弦的样子）", "满月砣（上弦的样子）", "波普鹿"])("%s非防守特性隐藏，不修改带入状态", (name) => {
  const source = createDeerSetup(snapshot).state;
  source.sides.defender.spiritId = snapshot.spirits.find((entry) => entry.fullName === name).id;
  const before = JSON.stringify(source);
  render(<DeerWorkspace snapshot={snapshot} initialState={source} />);
  expect(screen.queryByRole("region", { name: "防守特性设置" })).not.toBeInTheDocument();
  expect(screen.getByRole("region", { name: "速度对比" })).toBeInTheDocument();
  expect(JSON.stringify(source)).toBe(before);
});

test("秩序鱿墨保留防御开关和减伤参数，电系不变、非电系联动", () => {
  const source = createDeerSetup(snapshot).state;
  source.sides.defender.spiritId = snapshot.spirits.find((entry) => entry.fullName === "秩序鱿墨").id;
  render(<DeerWorkspace snapshot={snapshot} initialState={source} />);
  expect(screen.getByRole("region", { name: "防守特性设置" })).toHaveTextContent("绝对秩序");
  expect(screen.getByLabelText("减伤比例")).toHaveValue(50);
  const arc = skillRow("电弧 · 普通").textContent;
  const bet = skillRow("下注 · 明").textContent;
  fireEvent.change(screen.getByLabelText("减伤比例"), { target: { value: "75" } });
  expect(skillRow("电弧 · 普通")).toHaveTextContent(arc);
  expect(skillRow("下注 · 明").textContent).not.toBe(bet);
  fireEvent.click(screen.getByLabelText("防守特性"));
  expect(screen.getByLabelText("防守特性")).not.toBeChecked();
  expect(screen.getByLabelText("减伤比例")).toBeDisabled();
  expect(screen.getByLabelText("减伤比例")).toHaveValue(75);
  const disabled = skillRow("下注 · 明").textContent;
  fireEvent.click(screen.getByLabelText("防守特性"));
  expect(skillRow("下注 · 明").textContent).not.toBe(disabled);
  fireEvent.change(screen.getByLabelText("减伤比例"), { target: { value: "50" } });
  expect(skillRow("下注 · 明")).toHaveTextContent(bet);
});

test.each([["rain", "雨天"], ["thunder", "雷暴"], ["sandstorm", "沙尘暴"], ["blizzard", "暴风雪"]])("%s天气摘要注明不计天气伤害，展开说明保留联动边界", (value, label) => {
  render(<DeerWorkspace snapshot={snapshot} />);
  const conditions = screen.getByRole("button", { name: /战斗条件/ });
  fireEvent.click(conditions);
  fireEvent.change(screen.getByLabelText("天气"), { target: { value } });
  expect(screen.getByText("天气仅用于内核已支持的技能／特性联动，不计天气本身的回合末伤害。")).toBeInTheDocument();
  expect(conditions).toHaveTextContent(`${label}（不计天气伤害）`);
  fireEvent.click(conditions);
  expect(conditions).toHaveTextContent(`${label}（不计天气伤害）`);
  fireEvent.click(conditions);
  expect(screen.getByLabelText("天气")).toHaveValue(value);
  fireEvent.change(screen.getByLabelText("天气"), { target: { value: "none" } });
  expect(conditions).not.toHaveTextContent("不计天气伤害");
});

test("有预设默认精灵预设，第四项可重新应用，切换无预设精灵默认生命", () => {
  const wolf = snapshot.spirits.find((entry) => entry.fullName === "银月狼王");
  const squirrel = snapshot.spirits.find((entry) => entry.fullName === "蹦床松鼠");
  const presets = { [wolf.id]: { natureId: "cheerful", displayIvs: { hp: 42, speed: 60 }, traitValues: {} } };
  const before = JSON.stringify(presets);
  render(<DeerWorkspace snapshot={snapshot} presets={presets} />);
  const defense = screen.getByRole("region", { name: "防御方配置" });
  const presetButton = within(defense).getByRole("button", { name: "精灵预设", exact: true });
  expect(presetButton).toHaveAttribute("aria-pressed", "true");
  expect(within(defense).getByText(/开朗 · 生命42/)).toBeInTheDocument();
  expect(within(defense).queryByRole("button", { name: "无耐久", exact: true })).not.toBeInTheDocument();
  expect(within(defense).queryByRole("button", { name: "读取已存预设" })).not.toBeInTheDocument();
  fireEvent.click(within(defense).getByRole("button", { name: "生命", exact: true }));
  expect(within(defense).getByText(/普通 · 生命60/)).toBeInTheDocument();
  fireEvent.click(presetButton);
  expect(within(defense).getByText(/开朗 · 生命42/)).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText("防御方精灵"), { target: { value: squirrel.fullName } });
  fireEvent.click(screen.getByRole("option", { name: new RegExp(squirrel.fullName) }));
  expect(within(defense).getByRole("button", { name: "生命", exact: true })).toHaveAttribute("aria-pressed", "true");
  expect(within(defense).getByRole("button", { name: "无耐久", exact: true })).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText("防御方精灵"), { target: { value: wolf.fullName } });
  fireEvent.click(screen.getByRole("option", { name: new RegExp(wolf.fullName) }));
  expect(within(defense).getByRole("button", { name: "精灵预设", exact: true })).toHaveAttribute("aria-pressed", "true");
  expect(within(defense).getByText(/开朗 · 生命42/)).toBeInTheDocument();
  expect(JSON.stringify(presets)).toBe(before);
});

test("切换防御方不会清掉攻击方带入的自定义每层加成", () => {
  const setup = createDeerSetup(snapshot);
  const attacker = snapshot.spirits.find((entry) => entry.id === setup.state.sides.attacker.spiritId);
  const control = getTraitView(snapshot, attacker).inputs.find((entry) => entry.contextKey === "attackerTraitEffect");
  setup.state.directions.forward.context[control.id] = 55;
  render(<DeerWorkspace snapshot={snapshot} initialState={setup.state} />);
  expect(screen.getByText(/每层双攻＋55%/)).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText("防御方精灵"), { target: { value: "蹦床松鼠" } });
  fireEvent.click(screen.getByRole("option", { name: /蹦床松鼠/ }));
  fireEvent.click(screen.getByRole("button", { name: "满耐久", exact: true }));
  expect(screen.getByText(/每层双攻＋55%/)).toBeInTheDocument();
});

test("保命未适配提示、斩杀待确认及一键禁用，关闭后恢复", () => {
  const setup = createDeerSetup(snapshot);
  setup.state.sides.defender.spiritId = snapshot.spirits.find((entry) => entry.fullName === "火羽").id;
  render(<DeerWorkspace snapshot={snapshot} initialState={setup.state} />);
  expect(screen.getByRole("region", { name: "防守特性设置" })).toHaveTextContent("保命效果未计入");
  expect(screen.getByRole("button", { name: "一键填层数" })).toBeDisabled();
  fireEvent.click(screen.getByLabelText("显示先发补刀"));
  expect(skillRow("下注 · 明")).toHaveTextContent("理论伤害");
  expect(skillRow("下注 · 明")).not.toHaveTextContent("可击倒");
  fireEvent.click(screen.getByRole("button", { name: "查看下注 · 明详情" }));
  expect(document.querySelectorAll('.deer-layer-grid [data-lethal="true"]')).toHaveLength(0);
  expect(document.querySelector('.deer-layer-grid')).not.toHaveTextContent("未击倒");
  fireEvent.click(screen.getByLabelText("防守特性"));
  expect(screen.getByRole("button", { name: "一键填层数" })).toBeEnabled();
});

test("耐久模板不清空能量或带入的方向特性覆盖", () => {
  render(<DeerWorkspace snapshot={snapshot} />);
  fireEvent.change(screen.getByLabelText("防御方精灵"), { target: { value: "蹦床松鼠" } });
  fireEvent.click(screen.getByRole("option", { name: /蹦床松鼠/ }));
  fireEvent.change(screen.getByLabelText("当前能量"), { target: { value: "5" } });
  for (const name of ["满耐久", "生命", "生命物防", "无耐久"]) {
    fireEvent.click(screen.getByRole("button", { name, exact: true }));
    expect(screen.getByLabelText("当前能量")).toHaveValue(5);
  }
});

test("能力等级支持负数和清空重填，折叠摘要保留非默认条件", async () => {
  const user = userEvent.setup();
  render(<DeerWorkspace snapshot={snapshot} />);
  fireEvent.click(screen.getByRole("button", { name: /战斗条件/ }));
  const input = screen.getByLabelText("攻击能力等级");
  await user.clear(input);
  await user.type(input, "-2");
  await user.tab();
  expect(input).toHaveValue(-2);
  fireEvent.change(screen.getByLabelText("自身HP"), { target: { value: "49" } });
  fireEvent.change(screen.getByLabelText("敌方冻结"), { target: { value: "4" } });
  fireEvent.click(screen.getByRole("button", { name: /战斗条件/ }));
  const summary = screen.getByRole("button", { name: /战斗条件/ });
  expect(summary).toHaveTextContent("自身HP 49%");
  expect(summary).toHaveTextContent("攻击等级 -2");
  expect(summary).toHaveTextContent("冻结 4层");
  expect(skillRow("电弧 · 普通")).toHaveTextContent(/当前 \d+ 层伤害/);
  expect(skillRow("电弧 · 普通")).toHaveTextContent("蓝色：冻结 20%");
});

test("速度提示随个体调整切换先手、拼速和无法先手，不混入技能先制度", () => {
  const setup = createDeerSetup(snapshot);
  setup.state.sides.defender = structuredClone(setup.state.sides.attacker);
  setup.state.sides.attacker.displayIvs.speed = 30;
  setup.state.sides.defender.displayIvs.speed = 0;
  render(<DeerWorkspace snapshot={snapshot} initialState={setup.state} />);
  const speed = screen.getByRole("region", { name: "速度对比" });
  const attacker = screen.getByRole("region", { name: "攻击方配置" });
  expect(attacker.nextElementSibling).toBe(speed);
  expect(attacker.parentElement).toHaveClass("deer-config-column");
  expect(screen.getAllByRole("region", { name: "速度对比" })).toHaveLength(1);
  expect(speed).toHaveTextContent("可以先手");
  expect(speed).toHaveTextContent("同先制度");
  const defense = screen.getByRole("region", { name: "防御方配置" });
  fireEvent.click(within(defense).getByRole("button", { name: "手调配置" }));
  fireEvent.change(within(defense).getByLabelText("速度个体"), { target: { value: "30" } });
  expect(speed).toHaveTextContent("需要拼速");
  fireEvent.change(within(defense).getByLabelText("速度个体"), { target: { value: "60" } });
  expect(speed).toHaveTextContent("无法先手");
  fireEvent.click(screen.getByLabelText("显示先发补刀"));
  expect(speed).toHaveTextContent("无法先手");
});

test("银月狼王可直接配置吞噬特性，关闭防守特性也禁用吞噬参数", () => {
  render(<DeerWorkspace snapshot={snapshot} />);
  const baseline = skillRow("电弧 · 普通").textContent;
  fireEvent.change(screen.getByRole("combobox", { name: "搜索已吞噬特性" }), { target: { value: "蹦床松鼠" } });
  fireEvent.click(screen.getByRole("option", { name: /蹦床松鼠 · 囤积/ }));
  fireEvent.click(screen.getByRole("button", { name: "查看囤积条件与效果" }));
  fireEvent.change(screen.getByLabelText("囤积 · 当前能量"), { target: { value: "5" } });
  expect(skillRow("电弧 · 普通").textContent).not.toBe(baseline);
  expect(screen.getByRole("button", { name: /战斗条件/ })).toHaveAttribute("aria-expanded", "false");
  fireEvent.click(screen.getByLabelText("防守特性"));
  expect(screen.getByLabelText("囤积 · 当前能量")).toBeDisabled();
  expect(screen.getByRole("combobox", { name: "搜索已吞噬特性" })).toBeDisabled();
  expect(skillRow("电弧 · 普通").textContent).toBe(baseline);
});

test("囤积能量直接可见并影响伤害，关闭不计入但保留参数，换宠不串值", () => {
  render(<DeerWorkspace snapshot={snapshot} />);
  fireEvent.change(screen.getByLabelText("防御方精灵"), { target: { value: "蹦床松鼠" } });
  fireEvent.click(screen.getByRole("option", { name: /蹦床松鼠/ }));
  const panel = screen.getByRole("region", { name: "防守特性设置" });
  expect(within(panel).getByText("囤积")).toBeInTheDocument();
  expect(within(panel).getByText("每有1能量，获得双防+10%。")).toBeInTheDocument();
  expect(screen.getByLabelText("当前能量")).toHaveValue(0);
  expect(screen.getByLabelText("每点双防")).toHaveValue(10);
  const baseline = skillRow("电弧 · 普通").textContent;
  fireEvent.change(screen.getByLabelText("当前能量"), { target: { value: "5" } });
  const boosted = skillRow("电弧 · 普通").textContent;
  expect(boosted).not.toBe(baseline);
  fireEvent.click(screen.getByLabelText("防守特性"));
  expect(screen.getByLabelText("当前能量")).toBeDisabled();
  expect(screen.getByLabelText("当前能量")).toHaveValue(5);
  expect(panel).toHaveTextContent("已关闭 · 参数保留，不参与计算");
  expect(skillRow("电弧 · 普通").textContent).toBe(baseline);
  fireEvent.click(screen.getByLabelText("防守特性"));
  expect(skillRow("电弧 · 普通").textContent).toBe(boosted);
  fireEvent.change(screen.getByLabelText("防御方精灵"), { target: { value: "圣草迪莫" } });
  fireEvent.click(screen.getByRole("option", { name: /圣草迪莫/ }));
  expect(screen.queryByLabelText("当前能量")).not.toBeInTheDocument();
  expect(screen.getByLabelText("触发层数")).toHaveValue(0);
});

test("条件型防守特性的触发开关不藏入战斗条件", () => {
  render(<DeerWorkspace snapshot={snapshot} />);
  const target = snapshot.spirits.find((spirit) => spirit.traitName === "游弋" && spirit.raceStats?.hp);
  fireEvent.change(screen.getByLabelText("防御方精灵"), { target: { value: target.fullName } });
  fireEvent.click(screen.getByRole("option", { name: new RegExp(target.fullName) }));
  const before = skillRow("电弧 · 普通").textContent;
  fireEvent.click(screen.getByLabelText("正在蓄力"));
  expect(skillRow("电弧 · 普通").textContent).not.toBe(before);
  expect(screen.getByRole("button", { name: /战斗条件/ })).toHaveAttribute("aria-expanded", "false");
});

test("攻击方底部只保留特性层数并配特性说明，血量移入战斗条件", () => {
  render(<DeerWorkspace snapshot={snapshot} />);
  const attacker = screen.getByRole("region", { name: "攻击方配置" });
  const bottom = attacker.querySelector(".deer-side-bottom");
  expect(within(bottom).getByLabelText("特性层数")).toBeInTheDocument();
  expect(within(bottom).getByText(/超级电池 · 每层双攻＋40%/)).toBeInTheDocument();
  expect(attacker.querySelector(".deer-picker small")).not.toBeInTheDocument();
  expect(within(attacker).queryByLabelText("自身HP")).not.toBeInTheDocument();
  expect(screen.getByLabelText("目标HP")).toHaveValue(100);
  fireEvent.click(screen.getByRole("button", { name: /战斗条件/ }));
  fireEvent.change(screen.getByLabelText("自身HP"), { target: { value: "49" } });
  fireEvent.click(screen.getByRole("button", { name: /战斗条件/ }));
  fireEvent.click(screen.getByRole("button", { name: /战斗条件/ }));
  expect(screen.getByLabelText("自身HP")).toHaveValue(49);
});

test("不开先发合并裂石，开启后拆分普通和应对，单击伤害与配置不变", () => {
  render(<DeerWorkspace snapshot={snapshot} />);
  const toggle = screen.getByLabelText("显示先发补刀");
  expect(toggle).not.toBeChecked();
  expect(screen.queryByRole("button", { name: "裂石 · 应对状态", exact: true })).not.toBeInTheDocument();
  const cells = within(skillRow("裂石")).getAllByRole("cell");
  const minimum = cells[2].textContent;
  const damage = cells[3].textContent;
  const stacks = screen.getByLabelText("特性层数").value;
  fireEvent.click(toggle);
  expect(screen.getAllByRole("row")).toHaveLength(10);
  for (const name of ["裂石 · 普通", "裂石 · 应对状态"]) {
    const splitCells = within(skillRow(name)).getAllByRole("cell");
    expect(splitCells[2].textContent).toBe(minimum);
    expect(splitCells[4].textContent).toBe(damage);
  }
  fireEvent.click(screen.getByRole("button", { name: "查看裂石 · 应对状态详情" }));
  fireEvent.click(toggle);
  expect(screen.getByRole("button", { name: "裂石", exact: true })).toHaveAttribute("aria-expanded", "true");
  expect(screen.getByText(/应对状态不改变本击伤害/)).toBeInTheDocument();
  expect(screen.queryByRole("columnheader", { name: "接先发最低" })).not.toBeInTheDocument();
  expect(screen.getByLabelText("特性层数").value).toBe(stacks);
});

test("零层可填，10层内未达则禁用且不改变已填层数", () => {
  render(<DeerWorkspace snapshot={snapshot} />);
  fireEvent.change(screen.getByLabelText("目标HP"), { target: { value: "1" } });
  fireEvent.click(screen.getByRole("button", { name: "一键填层数" }));
  expect(screen.getByLabelText("特性层数")).toHaveValue(0);
  fireEvent.change(screen.getByLabelText("目标HP"), { target: { value: "100" } });
  fireEvent.click(screen.getByRole("button", { name: /战斗条件/ }));
  fireEvent.change(screen.getByLabelText("防守技能减伤"), { target: { value: "100" } });
  expect(screen.getByRole("button", { name: "一键填层数" })).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "一键填层数" }));
  expect(screen.getByLabelText("特性层数")).toHaveValue(0);
});

test("附带条件的最低技能明确提示条件，不替用户开启", () => {
  render(<DeerWorkspace snapshot={snapshot} />);
  fireEvent.change(screen.getByLabelText("防御方精灵"), { target: { value: "圣水迪莫" } });
  fireEvent.click(screen.getByRole("option", { name: /圣水迪莫/ }));
  fireEvent.click(screen.getByRole("button", { name: "满耐久", exact: true }));
  fireEvent.click(screen.getByRole("button", { name: "一键填层数" }));
  expect(screen.getByLabelText("特性层数")).toHaveValue(3);
  expect(skillRow("电弧 · 迸发")).toHaveAttribute("aria-selected", "true");
  expect(screen.getByRole("status")).toHaveTextContent("需触发迸发；条件未自动变更");
  expect(skillRow("电弧 · 普通")).not.toHaveAttribute("aria-selected", "true");
});

test("默认合并裂石、原样控件和返回入口，配置折叠", () => {
  render(<DeerWorkspace snapshot={snapshot} />);
  expect(screen.getByRole("link", { name: "返回主站" })).toHaveAttribute("href", "/");
  expect(screen.getByRole("link", { name: "返回主站" }).closest("header")).toHaveClass("app-header--tool");
  expect(screen.getAllByRole("row")).toHaveLength(9);
  expect(screen.getAllByRole("button", { name: "手调配置" })).toHaveLength(2);
  expect(screen.queryByLabelText("防御方性格")).not.toBeInTheDocument();
  expect(screen.getByLabelText("攻击方物攻个体加点")).toBeChecked();
  expect(document.querySelector(".deer-scenery")).toHaveAttribute("aria-hidden", "true");
  expect(document.querySelector(".deer-scenery-portrait")).toHaveAttribute("alt", "");
  expect(document.querySelector(".deer-scenery-portrait")).toHaveAttribute("src", "/assets/deer/bopulu-background-v2.webp");
  expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("洛克计算器 · 电鹿斩杀线");
  expect(document.querySelector(".app-header__season")).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "打开队伍" })).not.toBeInTheDocument();
});

test("计算器主页仍保留赛季顶栏，电鹿页不混入赛季插画", () => {
  const { rerender } = render(<AppHeader />);
  expect(document.querySelector(".app-header__season-wolf")).toHaveAttribute("src", "/assets/season/s4-silver-wolf.webp");
  rerender(<AppHeader pageTitle="电鹿斩杀线" />);
  expect(document.querySelector(".app-header__season")).not.toBeInTheDocument();
  expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("洛克计算器 · 电鹿斩杀线");
  expect(screen.getByRole("button", { name: "切换主题" })).toBeInTheDocument();
});

test("独立电鹿页恢复深色设置，切换主题后保留设置", () => {
  const key = "rock-calculator.settings.theme.v1";
  localStorage.setItem(key, "dark");
  render(<DeerWorkspace snapshot={snapshot} />);
  expect(document.documentElement).toHaveAttribute("data-theme", "dark");
  fireEvent.click(screen.getByRole("button", { name: "切换主题" }));
  expect(document.documentElement).toHaveAttribute("data-theme", "light");
  expect(localStorage.getItem(key)).toBe("light");
  fireEvent.click(screen.getByRole("button", { name: "切换主题" }));
  expect(document.documentElement).toHaveAttribute("data-theme", "dark");
  localStorage.removeItem(key);
  document.documentElement.dataset.theme = "light";
});

test("四种模板直接改变伤害，手调显示自定义，不覆盖本地收藏", () => {
  const before = JSON.stringify(localStorage);
  render(<DeerWorkspace snapshot={snapshot} />);
  const base = skillRow("电弧 · 普通").textContent;
  fireEvent.click(screen.getByRole("button", { name: "无耐久", exact: true }));
  expect(skillRow("电弧 · 普通").textContent).not.toBe(base);
  const defense = screen.getByRole("region", { name: "防御方配置" });
  fireEvent.click(within(defense).getByRole("button", { name: "手调配置" }));
  fireEvent.click(screen.getByLabelText("防御方性格"));
  fireEvent.click(screen.getByRole("treeitem", { name: "生命增益 +20%" }));
  fireEvent.click(screen.getByRole("treeitem", { name: "沉默（+生命 -物攻）" }));
  fireEvent.change(within(defense).getByLabelText("生命个体"), { target: { value: "42" } });
  expect(within(defense).getByText(/自定义 · 沉默 · 生命42/)).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "无耐久", exact: true })).toHaveAttribute("aria-pressed", "false");
  expect(JSON.stringify(localStorage)).toBe(before);
});

test("技能详情展示11层实算，暗注49%与50%边界联动", () => {
  render(<DeerWorkspace snapshot={snapshot} />);
  const at100 = skillRow("下注 · 暗").textContent;
  expect(screen.queryByLabelText("自身HP")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: /战斗条件/ }));
  fireEvent.change(screen.getByLabelText("自身HP"), { target: { value: "50" } });
  expect(skillRow("下注 · 暗").textContent).toBe(at100);
  fireEvent.change(screen.getByLabelText("自身HP"), { target: { value: "49" } });
  expect(skillRow("下注 · 暗").textContent).not.toBe(at100);
  fireEvent.click(screen.getByRole("button", { name: "查看下注 · 暗详情" }));
  expect(document.querySelectorAll(".deer-layer-grid > div")).toHaveLength(100);
  expect(screen.getByText(/实际威力 185/)).toBeInTheDocument();
  fireEvent.click(screen.getByLabelText("显示先发补刀"));
  expect(screen.getByRole("columnheader", { name: "接先发最低" })).toBeInTheDocument();
});

test("支持更换非首领电鹿和搜索敌方，特性与能力控制可展开", () => {
  render(<DeerWorkspace snapshot={snapshot} />);
  fireEvent.change(screen.getByLabelText("攻击方精灵"), { target: { value: "爵士鹿" } });
  fireEvent.click(screen.getByRole("option", { name: /爵士鹿/ }));
  expect(screen.getByText(/每层双攻＋30%/)).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText("防御方精灵"), { target: { value: "圣草迪莫" } });
  fireEvent.click(screen.getByRole("option", { name: /圣草迪莫/ }));
  expect(screen.getByLabelText("触发层数")).toBeInTheDocument();
  const before = skillRow("电弧 · 普通").textContent;
  fireEvent.change(screen.getByLabelText("触发层数"), { target: { value: "4" } });
  expect(skillRow("电弧 · 普通").textContent).not.toBe(before);
  fireEvent.click(screen.getByRole("button", { name: /战斗条件/ }));
  expect(screen.getByLabelText("防御能力等级")).toBeInTheDocument();
});
