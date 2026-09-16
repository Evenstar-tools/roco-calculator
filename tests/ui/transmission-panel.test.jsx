import { fireEvent, render, screen, within } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import snapshot from "../../data/snapshots/current.json";
import TransmissionPanel from "../../src/features/transmission/TransmissionPanel.jsx";

const advance = () => fireEvent.click(screen.getByRole("button", { name: screen.getByRole("button", { name: "开始", exact: true }).disabled ? "下一回合" : "开始", exact: true }));
const skill = (name) => snapshot.skills.find((entry) => entry.name === name);
const side = (names) => ({ skills: { four: names.map((name) => ({ skillId: skill(name).id })) } });

test("开始按钮禁用导致焦点移出弹层后Escape仍可关闭", () => {
  const onClose = vi.fn();
  render(<TransmissionPanel snapshot={snapshot} sides={{ attacker: side(["啮合传递", "地刺", "传感器", "主轴"]) }} onClose={onClose} />);
  fireEvent.click(screen.getByRole("button", { name: "载入攻击方技能" }));
  advance();
  expect(screen.getByRole("button", { name: "开始", exact: true })).toBeDisabled();
  fireEvent.keyDown(document, { key: "Escape" });
  expect(onClose).toHaveBeenCalledOnce();
});
test("相关特性列表反向选择最终形态，并重置旧推演", () => {
  render(<TransmissionPanel snapshot={snapshot} onClose={vi.fn()} />);
  const selector = screen.getByLabelText("传动特性");
  expect(within(selector).getAllByRole("option").filter((entry) => entry.value).map((entry) => entry.value)).toEqual(["向心力", "翼轴", "贪心算法", "盲拧", "机械变式", "风速仪", "正位宝剑", "宝剑王牌"]);
  for (const [trait, owner] of [["向心力", "声波缇塔"], ["翼轴", "帕帕斯卡"], ["贪心算法", "贝古斯"], ["机械变式", "权杖-V"], ["风速仪", "测风蝉"], ["正位宝剑", "圣剑-X"], ["宝剑王牌", "圣剑骑士"]]) {
    fireEvent.change(selector, { target: { value: trait } });
    expect(screen.getByLabelText("推演精灵")).toHaveValue(owner);
    expect(selector).toHaveValue(trait);
    expect(screen.getByRole("img", { name: owner })).toBeInTheDocument();
  }
  advance();
  fireEvent.change(selector, { target: { value: "向心力" } });
  expect(screen.queryByRole("list", { name: "当前技能槽位" })).toBeNull();
  expect(screen.getByRole("button", { name: "开始", exact: true })).toBeEnabled();
});
test("开始立即传动，下一回合及撤回恢复完整回合状态", () => {
  const demo = { ...snapshot, skills: ["A", "B", "C", "D"].map((name) => ({ id: name, name, description: "传动1" })) };
  render(<TransmissionPanel snapshot={demo} sides={{ attacker: { skills: { four: ["A", "B", "C", "D"] } } }} onClose={vi.fn()} />);
  fireEvent.click(screen.getByRole("button", { name: "载入攻击方技能" }));
  const back = () => fireEvent.click(screen.getByRole("button", { name: "回到上回合" }));
  const order = () => [...screen.getByRole("list", { name: "当前技能槽位" }).querySelectorAll("strong")].map((entry) => entry.textContent);
  expect(screen.getByRole("button", { name: "下一回合" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "回到上回合" })).toBeDisabled();
  expect(screen.queryByLabelText("计算回合")).toBeNull();
  advance();
  expect(order()).toEqual(["D", "A", "B", "C"]);
  expect(screen.getByRole("button", { name: "开始", exact: true })).toBeDisabled();
  expect(screen.queryByLabelText("初始1号位技能")).toBeNull();
  fireEvent.mouseEnter(screen.getByRole("button", { name: "查看初始配置" }).parentElement);
  expect(within(screen.getByRole("list", { name: "初始配置预览" })).getAllByRole("listitem").map((entry) => entry.textContent)).toEqual(["1A", "2B", "3C", "4D"]);
  fireEvent.mouseLeave(screen.getByRole("button", { name: "查看初始配置" }).parentElement);
  advance();
  expect(order()).toEqual(["C", "D", "A", "B"]);
  back();
  expect(order()).toEqual(["D", "A", "B", "C"]);
  expect(screen.queryByText("第 2 回合 · 开始")).toBeNull();
  advance();
  expect(order()).toEqual(["C", "D", "A", "B"]);
  back(); back();
  expect(screen.getByLabelText("初始1号位技能")).toHaveValue("A");
  expect(screen.getByRole("button", { name: "回到上回合" })).toBeDisabled();
  advance();
  expect(order()).toEqual(["D", "A", "B", "C"]);
});

test("选择精灵自动匹配特性与四技能，换精灵清除上次推演", () => {
  render(<TransmissionPanel snapshot={snapshot} onClose={vi.fn()} />);
  fireEvent.change(screen.getByLabelText("推演精灵"), { target: { value: "声波缇塔" } });
  fireEvent.click(screen.getByRole("option", { name: /^声波缇塔/ }));
  expect(screen.getByLabelText("传动特性")).toHaveValue("向心力");
  const portrait = screen.getByRole("img", { name: "声波缇塔" });
  expect(portrait.getAttribute("src")).toBe(snapshot.spirits.find((entry) => entry.fullName === "声波缇塔").asset.sourceUrl);
  for (let i = 1; i <= 4; i++) expect(screen.getByLabelText(`初始${i}号位技能`).value).not.toBe("");
  advance();
  fireEvent.change(screen.getByLabelText("推演精灵"), { target: { value: "帕帕斯卡" } });
  fireEvent.click(screen.getByRole("option", { name: /^帕帕斯卡/ }));
  expect(screen.getByLabelText("传动特性")).toHaveValue("翼轴");
  expect(screen.queryByRole("list", { name: "当前技能槽位" })).toBeNull();
  expect(screen.getByRole("button", { name: "开始", exact: true })).toBeEnabled();
});
test("轮班额外传动提前标记不支持，正常待机仍可推进", () => {
  render(<TransmissionPanel snapshot={snapshot} sides={{ attacker: side(["轮班", "金属噪音", "齿轮扭矩", "杠杆置换"]) }} onClose={vi.fn()} />);
  fireEvent.click(screen.getByRole("button", { name: "载入攻击方技能" }));
  advance();
  fireEvent.change(screen.getByLabelText("本回合技能"), { target: { value: "1" } });
  expect(within(screen.getByLabelText("轮班选择效果")).getByRole("option", { name: "额外传动（不支持）" })).toBeDisabled();
  fireEvent.change(screen.getByLabelText("轮班选择效果"), { target: { value: "drive" } });
  expect(screen.getByRole("button", { name: "结算行动" })).toBeDisabled();
  expect(screen.queryByLabelText("实战顺序")).toBeNull();
  fireEvent.change(screen.getByLabelText("本回合技能"), { target: { value: "-1" } });
  advance();
  expect(screen.getByRole("heading", { name: "第 2 回合 · 传动后顺序" })).toBeInTheDocument();
});

test("盲拧选项禁用，直接选择对应精灵也不能绕过阻断", () => {
  render(<TransmissionPanel snapshot={snapshot} onClose={vi.fn()} />);
  expect(within(screen.getByLabelText("传动特性")).getByRole("option", { name: "盲拧（不支持）" })).toBeDisabled();
  fireEvent.change(screen.getByLabelText("推演精灵"), { target: { value: "立方人" } });
  fireEvent.click(screen.getByRole("option", { name: /^立方人/ }));
  expect(screen.getByRole("status")).toHaveTextContent("不支持");
  expect(screen.getByRole("button", { name: "开始", exact: true })).toBeDisabled();
  expect(screen.queryByLabelText("实战顺序")).toBeNull();
  fireEvent.change(screen.getByLabelText("传动特性"), { target: { value: "向心力" } });
  expect(screen.queryByRole("status")).toBeNull();
  expect(screen.getByRole("button", { name: "开始", exact: true })).toBeEnabled();
});

test("不支持的技能身份变化在开始前阻断", () => {
  render(<TransmissionPanel snapshot={snapshot} sides={{ attacker: side(["借用", "金属噪音", "齿轮扭矩", "主轴"]) }} onClose={vi.fn()} />);
  fireEvent.click(screen.getByRole("button", { name: "载入攻击方技能" }));
  expect(screen.getByRole("status")).toHaveTextContent("不支持");
  expect(screen.getByRole("button", { name: "开始", exact: true })).toBeDisabled();
});

test.each([["正位宝剑", [0]], ["宝剑王牌", [0, 2]]])("%s仅允许合法槽位行动", (trait, allowed) => {
  render(<TransmissionPanel snapshot={snapshot} onClose={vi.fn()} />);
  fireEvent.change(screen.getByLabelText("传动特性"), { target: { value: trait } });
  advance();
  const actions = within(screen.getByLabelText("本回合技能")).getAllByRole("option").slice(1);
  actions.forEach((option, index) => expect(option.disabled).toBe(!allowed.includes(index)));
});
