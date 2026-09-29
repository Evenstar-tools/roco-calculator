import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import snapshot from "../../data/snapshots/current.json";
import TransmissionPanel from "../../src/features/transmission/TransmissionPanel.jsx";

const advance = () => fireEvent.click(screen.getByRole("button", { name: screen.getByRole("button", { name: "开始", exact: true }).disabled ? "下一回合" : "开始", exact: true }));
const skill = (name) => snapshot.skills.find((entry) => entry.name === name);
const side = (names) => ({ skills: { four: names.map((name) => ({ skillId: skill(name).id })) } });
const currentOrder = () => [...screen.getByRole("list", { name: "当前技能槽位" }).querySelectorAll("strong")].map((entry) => entry.textContent);
const nativeSide = (owner, names) => ({ ...side(names), spiritId: snapshot.spirits.find((entry) => entry.fullName === owner).id });
const originalAnimate = Object.getOwnPropertyDescriptor(Element.prototype, "animate");

afterEach(() => {
  vi.restoreAllMocks();
  if (originalAnimate) Object.defineProperty(Element.prototype, "animate", originalAnimate);
  else delete Element.prototype.animate;
});

function mockMotion(reduced = false) {
  const animations = [];
  Object.defineProperty(Element.prototype, "animate", { configurable: true, value: vi.fn(() => {
    let resolve;
    const finished = new Promise((done) => { resolve = done; });
    const animation = { finished, resolve, cancel: vi.fn() };
    animations.push(animation);
    return animation;
  }) });
  vi.spyOn(window, "matchMedia").mockReturnValue({ matches: reduced, addEventListener: vi.fn(), removeEventListener: vi.fn() });
  const getRect = Element.prototype.getBoundingClientRect;
  vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(function () {
    const index = this.parentElement?.classList.contains("transmission-slots") ? [...this.parentElement.children].indexOf(this) : 0;
    if (this.classList.contains("transmission-slots") || this.parentElement?.classList.contains("transmission-slots")) {
      const x = index % 2 * 200, y = Math.floor(index / 2) * 84;
      return { x, y, left: x, top: y, right: x + 198, bottom: y + 80, width: 198, height: 80, toJSON() {} };
    }
    return getRect.call(this);
  });
  return {
    animations,
    async finish() {
      let completed = 0;
      while (completed < animations.length) {
        const pending = animations.slice(completed);
        completed = animations.length;
        await act(async () => { pending.forEach((animation) => animation.resolve()); });
      }
    },
  };
}

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
  expect(within(selector).getAllByRole("option").filter((entry) => entry.value).map((entry) => entry.value)).toEqual(["向心力", "翼轴", "贪心算法", "盲拧", "机械变式", "风速仪", "正位宝剑", "宝剑王牌", "有求必应", "一意孤行"]);
  for (const [trait, owner] of [["向心力", "声波缇塔"], ["翼轴", "帕帕斯卡"], ["贪心算法", "贝古斯"], ["机械变式", "权杖-V"], ["风速仪", "测风蝉"], ["正位宝剑", "圣剑-X"], ["宝剑王牌", "圣剑骑士"], ["有求必应", "加尔"], ["一意孤行", "黑化加尔"]]) {
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
test("杠杆置换有行动入口并交换相邻技能，不显示轮班分支", () => {
  render(<TransmissionPanel snapshot={snapshot} sides={{ attacker: side(["金属噪音", "齿轮扭矩", "杠杆置换", "倾泻"]) }} onClose={vi.fn()} />);
  fireEvent.click(screen.getByRole("button", { name: "载入攻击方技能" }));
  advance();
  expect(screen.queryByText("本回合轮班（可选）")).toBeNull();
  expect(screen.queryByLabelText("本回合轮班")).toBeNull();
  fireEvent.change(screen.getByLabelText("本回合行动"), { target: { value: "2" } });
  expect(screen.queryByLabelText("轮班选择效果")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "结算行动" }));
  expect(currentOrder()).toEqual(["金属噪音", "倾泻", "杠杆置换", "齿轮扭矩"]);
});

test("有轮班时显示行动区，额外传动可结算并进入下一回合", () => {
  render(<TransmissionPanel snapshot={snapshot} sides={{ attacker: side(["轮班", "金属噪音", "齿轮扭矩", "杠杆置换"]) }} onClose={vi.fn()} />);
  fireEvent.click(screen.getByRole("button", { name: "载入攻击方技能" }));
  advance();
  expect(screen.getByText("本回合行动（可选）")).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText("本回合行动"), { target: { value: "1" } });
  expect(within(screen.getByLabelText("轮班选择效果")).getByRole("option", { name: "额外传动" })).toBeEnabled();
  fireEvent.change(screen.getByLabelText("轮班选择效果"), { target: { value: "drive" } });
  expect(screen.getByRole("button", { name: "结算行动" })).toBeEnabled();
  fireEvent.click(screen.getByRole("button", { name: "结算行动" }));
  expect(screen.getByText(/轮班 · 额外传动/)).toBeInTheDocument();
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

test.each([["正位宝剑", "圣剑-X", ["金属噪音", "轮班", "齿轮扭矩", "倾泻"]], ["宝剑王牌", "圣剑骑士", ["金属噪音", "齿轮扭矩", "轮班", "倾泻"]]])("%s下轮班不在合法槽位时不可使用", (trait, ownerName, skills) => {
  const owner = snapshot.spirits.find((entry) => entry.fullName === ownerName);
  render(<TransmissionPanel snapshot={snapshot} sides={{ attacker: { spiritId: owner.id, skills: { four: skills.map((name) => ({ skillId: skill(name).id })) } } }} onClose={vi.fn()} />);
  fireEvent.click(screen.getByRole("button", { name: "载入攻击方技能" }));
  expect(screen.getByLabelText("传动特性")).toHaveValue(trait);
  advance();
  expect(screen.getByText("本回合轮班（可选）")).toBeInTheDocument();
  expect(within(screen.getByLabelText("本回合轮班")).getByRole("option", { name: /^使用/ })).toBeDisabled();
});

test("风速仪累计传动与风起印记，并显示各号位传动数", () => {
  const skills = ["广播", "无风", "齿轮切开", "翼击"].map((name) => skill(name));
  const owner = snapshot.spirits.find((entry) => entry.fullName === "测风蝉");
  render(<TransmissionPanel snapshot={snapshot} sides={{ attacker: { spiritId: owner.id, skills: { four: skills.map((entry) => ({ skillId: entry.id })) } } }} onClose={vi.fn()} />);
  fireEvent.click(screen.getByRole("button", { name: "载入攻击方技能" }));
  expect(screen.getByLabelText("传动特性")).toHaveValue("风速仪");
  expect(screen.getByText(/1号位-\d+/)).toBeInTheDocument();
  expect(screen.getByText("已累计传动数 0，风起印记 ×0")).toBeInTheDocument();
  advance();
  const wind = screen.getByText(/已累计传动数 \d+，风起印记 ×\d+/);
  expect(wind).toBeInTheDocument();
  expect(wind.textContent).not.toBe("已累计传动数 0，风起印记 ×0");
});

test("正位宝剑不可用槽位标记为灰", () => {
  const owner = snapshot.spirits.find((entry) => entry.fullName === "圣剑-X");
  const skills = ["金属噪音", "轮班", "齿轮扭矩", "倾泻"].map((name) => skill(name));
  render(<TransmissionPanel snapshot={snapshot} sides={{ attacker: { spiritId: owner.id, skills: { four: skills.map((entry) => ({ skillId: entry.id })) } } }} onClose={vi.fn()} />);
  fireEvent.click(screen.getByRole("button", { name: "载入攻击方技能" }));
  expect(screen.getByLabelText("传动特性")).toHaveValue("正位宝剑");
  const blocked = document.querySelectorAll('.transmission-config > .is-unusable');
  expect(blocked.length).toBe(3);
});

test.each([["加尔", "有求必应"], ["黑化加尔", "一意孤行"]])("%s原生特性轮班冷却随回合和撤回恢复", (owner, trait) => {
  render(<TransmissionPanel snapshot={snapshot} sides={{ attacker: nativeSide(owner, ["轮班", "金属噪音", "齿轮扭矩", "倾泻"]) }} onClose={vi.fn()} />);
  fireEvent.click(screen.getByRole("button", { name: "载入攻击方技能" }));
  expect(screen.getByLabelText("传动特性")).toHaveValue(trait);
  advance();
  const option = () => within(screen.getByLabelText("本回合轮班")).getByRole("option", { name: /使用.*轮班/ });
  fireEvent.change(screen.getByLabelText("本回合轮班"), { target: { value: option().value } });
  fireEvent.change(screen.getByLabelText("轮班选择效果"), { target: { value: "drive" } });
  fireEvent.click(screen.getByRole("button", { name: "结算行动" }));
  advance();
  expect(option()).toBeDisabled();
  expect(option()).toHaveTextContent("冷却");
  advance();
  expect(option()).toBeEnabled();
  fireEvent.click(screen.getByRole("button", { name: "回到上回合" }));
  expect(option()).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "结算行动" }));
  advance();
  expect(option()).toBeEnabled();
});

test("重复轮班可以指定第二张，额外传动不移动第一张", () => {
  render(<TransmissionPanel snapshot={snapshot} sides={{ attacker: side(["轮班", "金属噪音", "齿轮扭矩", "轮班"]) }} onClose={vi.fn()} />);
  fireEvent.click(screen.getByRole("button", { name: "载入攻击方技能" }));
  advance();
  expect(currentOrder()).toEqual(["轮班", "轮班", "齿轮扭矩", "金属噪音"]);
  const selector = screen.getByLabelText("本回合轮班");
  expect(within(selector).getAllByRole("option", { name: /使用.*轮班/ })).toHaveLength(2);
  fireEvent.change(selector, { target: { value: "1" } });
  fireEvent.change(screen.getByLabelText("轮班选择效果"), { target: { value: "drive" } });
  fireEvent.click(screen.getByRole("button", { name: "结算行动" }));
  expect(currentOrder()).toEqual(["轮班", "齿轮扭矩", "轮班", "金属噪音"]);
});

test("杠杆置换邻接固定技能时禁用，不能绕过引擎阻断", () => {
  render(<TransmissionPanel snapshot={snapshot} sides={{ attacker: side(["杠杆置换", "主轴", "金属噪音", "倾泻"]) }} onClose={vi.fn()} />);
  fireEvent.click(screen.getByRole("button", { name: "载入攻击方技能" }));
  advance();
  const selector = screen.getByLabelText("本回合行动");
  expect(within(selector).getByRole("option", { name: /杠杆置换/ })).toBeDisabled();
  fireEvent.change(selector, { target: { value: "0" } });
  expect(screen.getByRole("status")).toHaveTextContent("固定槽位的冲突规则未确认");
  expect(screen.getByRole("button", { name: "结算行动" })).toBeDisabled();
  expect(currentOrder()).toEqual(["杠杆置换", "主轴", "金属噪音", "倾泻"]);
});

function renderWindMotion() {
  const demo = { ...snapshot, skills: ["A", "B", "C", "D"].map((name) => ({ id: name, name, description: "传动2" })) };
  const owner = snapshot.spirits.find((entry) => entry.fullName === "测风蝉");
  const view = render(<TransmissionPanel snapshot={demo} sides={{ attacker: { spiritId: owner.id, skills: { four: ["A", "B", "C", "D"] } } }} onClose={() => view.unmount()} />);
  fireEvent.click(screen.getByRole("button", { name: "载入攻击方技能" }));
  return view;
}

test.each(["开启", "关闭", "减少动态效果"])("动效%s不改变多层终态或重复累计风速仪", async (mode) => {
  const motion = mockMotion(mode === "减少动态效果");
  renderWindMotion();
  if (mode === "关闭") fireEvent.click(screen.getByRole("checkbox", { name: "传动动效" }));
  advance();
  expect(currentOrder()).toEqual(["C", "D", "A", "B"]);
  expect(screen.getByText("已累计传动数 8，风起印记 ×1")).toBeInTheDocument();
  if (mode === "开启") {
    expect(screen.getByRole("button", { name: "下一回合" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "下一回合" }));
    expect(screen.getByText("已累计传动数 8，风起印记 ×1")).toBeInTheDocument();
  } else expect(motion.animations).toHaveLength(0);
  await motion.finish();
  expect(screen.getByRole("list", { name: "当前技能槽位" })).toHaveAttribute("aria-busy", "false");
  advance();
  await motion.finish();
  expect(currentOrder()).toEqual(["A", "B", "C", "D"]);
  expect(screen.getByText("已累计传动数 16，风起印记 ×2")).toBeInTheDocument();
  expect(screen.getByText("逐步记录 · 3 条")).toBeInTheDocument();
});

test.each(["跳过动效", "重置推演", "回到上回合", "竖排", "关闭传动计算器"])("播放时%s取消旧轨迹，迟到完成不覆盖状态", async (control) => {
  const motion = mockMotion();
  renderWindMotion();
  advance();
  const oldAnimations = [...motion.animations];
  expect(oldAnimations.length).toBeGreaterThan(0);
  fireEvent.click(screen.getByRole("button", { name: control, exact: true }));
  expect(oldAnimations.every((animation) => animation.cancel.mock.calls.length > 0)).toBe(true);
  if (control === "关闭传动计算器") {
    await motion.finish();
    expect(screen.queryByRole("dialog", { name: "传动计算器" })).toBeNull();
    return;
  }
  const restored = ["重置推演", "回到上回合"].includes(control);
  if (restored) {
    expect(screen.getByLabelText("初始1号位技能")).toHaveValue("A");
    expect(screen.getByText("已累计传动数 0，风起印记 ×0")).toBeInTheDocument();
  }
  advance();
  await act(async () => { oldAnimations.forEach((animation) => animation.resolve()); });
  expect(screen.getByRole("list", { name: "当前技能槽位" })).toHaveAttribute("aria-busy", "true");
  await motion.finish();
  expect(currentOrder()).toEqual(restored ? ["C", "D", "A", "B"] : ["A", "B", "C", "D"]);
  expect(screen.getByText(restored ? "已累计传动数 8，风起印记 ×1" : "已累计传动数 16，风起印记 ×2")).toBeInTheDocument();
  expect(screen.getByText(restored ? "逐步记录 · 1 条" : "逐步记录 · 3 条")).toBeInTheDocument();
});
