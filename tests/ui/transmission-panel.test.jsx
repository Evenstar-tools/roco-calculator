import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import snapshot from "../../data/snapshots/current.json";
import popularConfigs from "../../public/data/presets/pvp-popular-configs.json";
import TransmissionPanel from "../../src/features/transmission/TransmissionPanel.jsx";

const roundButton = () => screen.getByRole("button", { name: /^(开始|推演下一回合)$/ });
const advance = () => fireEvent.click(roundButton());
const actionSelector = () => screen.getByLabelText("本回合行动");
const selectAction = (value) => fireEvent.change(actionSelector(), { target: { value } });
const historyEntries = () => [...document.querySelectorAll(".transmission-history > li")];
const skill = (name) => snapshot.skills.find((entry) => entry.name === name);
const side = (names) => ({ skills: { four: names.map((name) => ({ skillId: skill(name).id })) } });
const currentOrder = () => [...screen.getByRole("list", { name: "当前技能槽位" }).querySelectorAll("strong")].map((entry) => entry.textContent);
const initialOrder = () => Array.from({ length: 4 }, (_, index) => screen.getByLabelText(`初始${index + 1}号位技能`).value);
const traitSelector = () => screen.getByRole("combobox", { name: "传动特性" });
const traitOptions = () => screen.getByRole("listbox", { name: "传动特性选项" });
const chooseTrait = (name) => {
  fireEvent.click(traitSelector());
  fireEvent.click(within(traitOptions()).getByRole("option", { name: new RegExp(`^${name}(?:（|$)`) }));
};
const nativeSide = (owner, names) => ({ ...side(names), spiritId: snapshot.spirits.find((entry) => entry.fullName === owner).id });
const originalAnimate = Object.getOwnPropertyDescriptor(Element.prototype, "animate");

afterEach(() => {
  vi.restoreAllMocks();
  if (originalAnimate) Object.defineProperty(Element.prototype, "animate", originalAnimate);
  else delete Element.prototype.animate;
});

function mockMotion(reduced = false) {
  const animations = [];
  Object.defineProperty(Element.prototype, "animate", { configurable: true, value: vi.fn(function (frames) {
    let resolve;
    const finished = new Promise((done) => { resolve = done; });
    const animation = { finished, resolve, cancel: vi.fn(), frames, instance: Number(this.dataset.instance) };
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

test("开始后复用同一个推进按钮，焦点移出弹层仍可Escape关闭", () => {
  const onClose = vi.fn();
  render(<TransmissionPanel snapshot={snapshot} sides={{ attacker: side(["啮合传递", "地刺", "传感器", "主轴"]) }} onClose={onClose} />);
  fireEvent.click(screen.getByRole("button", { name: "载入攻击方技能" }));
  const button = roundButton();
  advance();
  expect(roundButton()).toBe(button);
  expect(button).toHaveTextContent("推演下一回合");
  fireEvent.keyDown(document, { key: "Escape" });
  expect(onClose).toHaveBeenCalledOnce();
});
test("相关特性列表反向选择最终形态，并重置旧推演", () => {
  render(<TransmissionPanel snapshot={snapshot} onClose={vi.fn()} />);
  const selector = traitSelector();
  fireEvent.click(selector);
  expect(within(traitOptions()).getAllByRole("option").map((entry) => entry.getAttribute("aria-label"))).toEqual(["向心力", "翼轴", "贪心算法", "盲拧（不支持）", "机械变式（仅顺序）", "风速仪", "正位宝剑", "宝剑王牌", "有求必应", "一意孤行"]);
  fireEvent.keyDown(selector, { key: "Escape" });
  for (const [trait, owner] of [["向心力", "声波缇塔"], ["翼轴", "帕帕斯卡"], ["贪心算法", "贝古斯"], ["机械变式", "权杖-V"], ["风速仪", "测风蝉"], ["正位宝剑", "圣剑-X"], ["宝剑王牌", "圣剑骑士"], ["有求必应", "加尔"], ["一意孤行", "黑化加尔"]]) {
    fireEvent.click(selector);
    const option = within(traitOptions()).getByRole("option", { name: new RegExp(`^${trait}(?:（|$)`) });
    const portrait = within(option).getByRole("img", { name: owner });
    expect(portrait.getAttribute("src")).toBe(snapshot.spirits.find((entry) => entry.fullName === owner).asset.sourceUrl);
    fireEvent.click(option);
    expect(screen.getByLabelText("推演精灵")).toHaveValue(owner);
    expect(selector).toHaveValue(trait);
    expect(within(document.querySelector(".transmission-spirit .spirit-card")).getByRole("img", { name: owner })).toBeInTheDocument();
  }
  advance();
  chooseTrait("向心力");
  expect(screen.queryByRole("list", { name: "当前技能槽位" })).toBeNull();
  expect(screen.getByRole("button", { name: "开始", exact: true })).toBeEnabled();
});

test("特性头像选择支持方向键和首尾定位，Escape只关闭下拉", () => {
  const onClose = vi.fn();
  render(<TransmissionPanel snapshot={snapshot} onClose={onClose} />);
  const selector = traitSelector();
  selector.focus();
  fireEvent.keyDown(selector, { key: "ArrowDown" });
  expect(selector).toHaveAttribute("aria-expanded", "true");
  fireEvent.keyDown(selector, { key: "Home" });
  fireEvent.keyDown(selector, { key: "ArrowDown" });
  fireEvent.keyDown(selector, { key: "Enter" });
  expect(selector).toHaveValue("翼轴");
  expect(screen.getByLabelText("推演精灵")).toHaveValue("帕帕斯卡");
  expect(selector).toHaveAttribute("aria-expanded", "false");

  fireEvent.click(selector);
  fireEvent.keyDown(selector, { key: "End" });
  fireEvent.keyDown(selector, { key: "ArrowUp" });
  fireEvent.keyDown(selector, { key: "Enter" });
  expect(selector).toHaveValue("有求必应");
  expect(screen.getByLabelText("推演精灵")).toHaveValue("加尔");

  fireEvent.click(selector);
  fireEvent.keyDown(selector, { key: "Home" });
  for (let i = 0; i < 3; i++) fireEvent.keyDown(selector, { key: "ArrowDown" });
  fireEvent.keyDown(selector, { key: "Enter" });
  expect(selector).toHaveValue("机械变式");
  expect(screen.getByLabelText("推演精灵")).toHaveValue("权杖-V");

  fireEvent.click(selector);
  fireEvent.keyDown(selector, { key: "Escape" });
  expect(screen.queryByRole("listbox", { name: "传动特性选项" })).toBeNull();
  expect(selector).toHaveFocus();
  expect(onClose).not.toHaveBeenCalled();
  expect(screen.getByRole("dialog", { name: "传动计算器" })).toBeInTheDocument();
  fireEvent.keyDown(selector, { key: "Escape" });
  expect(onClose).toHaveBeenCalledOnce();
});
test("开始立即传动，下一回合及撤回恢复完整回合状态", () => {
  const demo = { ...snapshot, skills: ["A", "B", "C", "D"].map((name) => ({ id: name, name, description: "传动1" })) };
  render(<TransmissionPanel snapshot={demo} sides={{ attacker: { skills: { four: ["A", "B", "C", "D"] } } }} onClose={vi.fn()} />);
  fireEvent.click(screen.getByRole("button", { name: "载入攻击方技能" }));
  const back = () => fireEvent.click(screen.getByRole("button", { name: "回到上回合" }));
  const order = () => [...screen.getByRole("list", { name: "当前技能槽位" }).querySelectorAll("strong")].map((entry) => entry.textContent);
  expect(screen.queryByRole("button", { name: "推演下一回合", exact: true })).toBeNull();
  expect(roundButton()).toHaveTextContent("开始");
  expect(screen.getByRole("button", { name: "回到上回合" })).toBeDisabled();
  expect(screen.queryByLabelText("计算回合")).toBeNull();
  advance();
  expect(order()).toEqual(["D", "A", "B", "C"]);
  expect(screen.queryByRole("button", { name: "开始", exact: true })).toBeNull();
  expect(roundButton()).toHaveTextContent("推演下一回合");
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
  const portrait = within(document.querySelector(".transmission-spirit .spirit-card")).getByRole("img", { name: "声波缇塔" });
  expect(portrait.getAttribute("src")).toBe(snapshot.spirits.find((entry) => entry.fullName === "声波缇塔").asset.sourceUrl);
  for (let i = 1; i <= 4; i++) expect(screen.getByLabelText(`初始${i}号位技能`).value).not.toBe("");
  advance();
  fireEvent.change(screen.getByLabelText("推演精灵"), { target: { value: "帕帕斯卡" } });
  fireEvent.click(screen.getByRole("option", { name: /^帕帕斯卡/ }));
  expect(screen.getByLabelText("传动特性")).toHaveValue("翼轴");
  expect(screen.queryByRole("list", { name: "当前技能槽位" })).toBeNull();
  expect(screen.getByRole("button", { name: "开始", exact: true })).toBeEnabled();
});

test("选精灵与按特性选精灵都读取外面同一份预设，推演不修改预设", () => {
  const owner = snapshot.spirits.find((entry) => entry.fullName === "帕帕斯卡");
  const preset = popularConfigs.entries.find((entry) => entry.spiritId === owner.id);
  const configuration = { ...preset, skills: { four: preset.skills.map((skillId) => ({ skillId })) } };
  const original = structuredClone(configuration);
  const getSpiritConfiguration = vi.fn((id) => id === owner.id ? configuration : undefined);
  render(<TransmissionPanel snapshot={snapshot} getSpiritConfiguration={getSpiritConfiguration} onClose={vi.fn()} />);
  fireEvent.change(screen.getByLabelText("推演精灵"), { target: { value: owner.fullName } });
  fireEvent.click(screen.getByRole("option", { name: /^帕帕斯卡/ }));
  const expected = ["钢铁洪流", "倾泻", "轴承支撑", "轮班"];
  expect(initialOrder()).toEqual(expected);
  expect(getSpiritConfiguration).toHaveBeenCalledWith(owner.id);
  advance();
  chooseTrait("向心力");
  expect(initialOrder().every(Boolean)).toBe(true);
  chooseTrait("翼轴");
  expect(initialOrder()).toEqual(expected);
  fireEvent.click(screen.getByRole("button", { name: "清空初始1号位技能" }));
  expect(initialOrder()[0]).toBe("");
  expect(configuration).toEqual(original);
});

test("记忆配置中的空槽、重复和技能顺序原样带入，不被自动补齐", () => {
  const four = [skill("轮班").id, null, { id: skill("轮班").id }, { skillId: skill("钢铁洪流").id }];
  render(<TransmissionPanel snapshot={snapshot} getSpiritConfiguration={() => ({ skills: { four } })} onClose={vi.fn()} />);
  chooseTrait("翼轴");
  expect(initialOrder()).toEqual(["轮班", "", "轮班", "钢铁洪流"]);
  expect(roundButton()).toBeDisabled();
});
test("杠杆置换保留行动入口，一次推进交换相邻技能后进入下回合", () => {
  render(<TransmissionPanel snapshot={snapshot} sides={{ attacker: side(["金属噪音", "齿轮扭矩", "杠杆置换", "倾泻"]) }} onClose={vi.fn()} />);
  fireEvent.click(screen.getByRole("button", { name: "载入攻击方技能" }));
  advance();
  expect(screen.queryByLabelText("本回合轮班")).toBeNull();
  selectAction("2:power");
  expect(screen.queryByLabelText("轮班选择效果")).toBeNull();
  expect(screen.queryByRole("button", { name: "结算行动" })).toBeNull();
  advance();
  expect(currentOrder()).toEqual(["金属噪音", "倾泻", "杠杆置换", "齿轮扭矩"]);
  expect(screen.getByRole("heading", { name: "第 2 回合 · 传动后顺序" })).toBeInTheDocument();
});

test("轮班两分支直接选择，一次推进并清除行动选择", () => {
  render(<TransmissionPanel snapshot={snapshot} sides={{ attacker: side(["轮班", "金属噪音", "齿轮扭矩", "杠杆置换"]) }} onClose={vi.fn()} />);
  fireEvent.click(screen.getByRole("button", { name: "载入攻击方技能" }));
  advance();
  expect(within(actionSelector()).getByRole("option", { name: /轮班 · 加威/ })).toBeEnabled();
  expect(within(actionSelector()).getByRole("option", { name: /轮班 · 额外传动/ })).toBeEnabled();
  selectAction("1:drive");
  expect(roundButton()).toHaveTextContent(/^推演下一回合$/);
  expect(screen.queryByLabelText("轮班选择效果")).toBeNull();
  expect(screen.queryByRole("button", { name: "结算行动" })).toBeNull();
  advance();
  expect(screen.getByRole("heading", { name: "第 2 回合 · 传动后顺序" })).toBeInTheDocument();
  expect(actionSelector()).toHaveValue("idle");
  expect(historyEntries()[1]).toHaveTextContent("第 1 回合 · 轮班 · 额外传动 · 使用后");
  expect(historyEntries()[2]).toHaveTextContent("第 2 回合 · 开始");
});

test.each([
  ["drive", ["倾泻", "轮班", "轴承支撑", "钢铁洪流"], ["倾泻", "钢铁洪流", "轮班", "轴承支撑"]],
  ["power", ["轮班", "倾泻", "轴承支撑", "钢铁洪流"], ["倾泻", "钢铁洪流", "轮班", "轴承支撑"]],
])("帕帕斯卡翼轴轮班 %s 一次推进保存两步，撤回完整恢复行动选择", (branch, afterAction, nextRound) => {
  render(<TransmissionPanel snapshot={snapshot} sides={{ attacker: nativeSide("帕帕斯卡", ["钢铁洪流", "倾泻", "轴承支撑", "轮班"]) }} onClose={vi.fn()} />);
  fireEvent.click(screen.getByRole("button", { name: "载入攻击方技能" }));
  advance();
  const before = ["轮班", "倾泻", "轴承支撑", "钢铁洪流"];
  expect(currentOrder()).toEqual(before);
  selectAction(`0:${branch}`);
  if (branch === "power") expect(screen.getByText("加威仅记录顺序，不计算伤害与能耗。")).toBeInTheDocument();
  advance();
  expect(currentOrder()).toEqual(nextRound);
  expect(actionSelector()).toHaveValue("idle");
  expect(historyEntries()).toHaveLength(3);
  expect(historyEntries()[1].querySelector("p").textContent).toBe(afterAction.map((name, i) => `${i + 1}. ${name}`).join(" → "));
  expect(historyEntries()[1].querySelector("strong")).toHaveTextContent("使用后");
  expect(historyEntries()[2].querySelector("strong")).toHaveTextContent("第 2 回合 · 开始");
  fireEvent.click(screen.getByRole("button", { name: "回到上回合" }));
  expect(currentOrder()).toEqual(before);
  expect(actionSelector()).toHaveValue(`0:${branch}`);
  expect(historyEntries()).toHaveLength(1);
  expect(screen.getByRole("heading", { name: "第 1 回合 · 传动后顺序" })).toBeInTheDocument();
  advance();
  expect(currentOrder()).toEqual(nextRound);
  expect(historyEntries()).toHaveLength(3);
});

test("风速仪合并轮班与回合传动跨印记阈值，撤回累计和两步记录", () => {
  render(<TransmissionPanel snapshot={snapshot} sides={{ attacker: nativeSide("测风蝉", ["广播", "无风", "齿轮切开", "轮班"]) }} onClose={vi.fn()} />);
  fireEvent.click(screen.getByRole("button", { name: "载入攻击方技能" }));
  advance();
  expect(screen.getByText("已累计传动数 2，风起印记 ×0")).toBeInTheDocument();
  const wheel = () => within(actionSelector()).getByRole("option", { name: /轮班 · 额外传动/ }).value;
  selectAction(wheel());
  advance();
  expect(screen.getByText("已累计传动数 5，风起印记 ×0")).toBeInTheDocument();
  expect(historyEntries()[1]).toHaveTextContent("累计传动 +1 → 3（风起印记 ×0）");
  expect(historyEntries()[2]).toHaveTextContent("累计传动 +2 → 5（风起印记 ×0）");
  const before = currentOrder(), selected = wheel();
  selectAction(selected);
  advance();
  expect(screen.getByText("已累计传动数 8，风起印记 ×1")).toBeInTheDocument();
  expect(historyEntries()).toHaveLength(5);
  expect(historyEntries()[3]).toHaveTextContent("累计传动 +1 → 6（风起印记 ×0）");
  expect(historyEntries()[4]).toHaveTextContent("累计传动 +2 → 8（风起印记 ×1）");
  fireEvent.click(screen.getByRole("button", { name: "回到上回合" }));
  expect(currentOrder()).toEqual(before);
  expect(actionSelector()).toHaveValue(selected);
  expect(screen.getByText("已累计传动数 5，风起印记 ×0")).toBeInTheDocument();
  expect(historyEntries()).toHaveLength(3);
  selectAction("idle");
  advance();
  expect(screen.getByText("已累计传动数 7，风起印记 ×0")).toBeInTheDocument();
});

test("盲拧选项禁用，直接选择对应精灵也不能绕过阻断", () => {
  render(<TransmissionPanel snapshot={snapshot} onClose={vi.fn()} />);
  fireEvent.click(traitSelector());
  const unsupported = within(traitOptions()).getByRole("option", { name: "盲拧（不支持）" });
  expect(unsupported).toHaveAttribute("aria-disabled", "true");
  expect(within(unsupported).getByRole("img", { name: "立方人" })).toBeInTheDocument();
  fireEvent.click(unsupported);
  expect(traitSelector()).toHaveValue("");
  expect(screen.getByLabelText("推演精灵")).toHaveValue("");
  fireEvent.keyDown(traitSelector(), { key: "Escape" });
  fireEvent.change(screen.getByLabelText("推演精灵"), { target: { value: "立方人" } });
  fireEvent.click(screen.getByRole("option", { name: /^立方人/ }));
  expect(screen.getByRole("status")).toHaveTextContent("不支持");
  expect(screen.getByRole("button", { name: "开始", exact: true })).toBeDisabled();
  expect(screen.queryByLabelText("实战顺序")).toBeNull();
  chooseTrait("向心力");
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
  for (const option of within(actionSelector()).getAllByRole("option", { name: /轮班/ })) expect(option).toBeDisabled();
});

test("风速仪累计传动与风起印记，并显示各号位传动数", () => {
  const skills = ["广播", "无风", "齿轮切开", "翼击"].map((name) => skill(name));
  const owner = snapshot.spirits.find((entry) => entry.fullName === "测风蝉");
  render(<TransmissionPanel snapshot={snapshot} sides={{ attacker: { spiritId: owner.id, skills: { four: skills.map((entry) => ({ skillId: entry.id })) } } }} onClose={vi.fn()} />);
  fireEvent.click(screen.getByRole("button", { name: "载入攻击方技能" }));
  expect(screen.getByLabelText("传动特性")).toHaveValue("风速仪");
  expect(screen.getByText(/1\s*号位-\d+/)).toBeInTheDocument();
  expect(document.querySelector(".transmission-drive-by-slot")).toBeNull();
  expect(screen.getByText("已累计传动数 0，风起印记 ×0")).toBeInTheDocument();
  advance();
  for (const [index, slot] of within(screen.getByRole("list", { name: "当前技能槽位" })).getAllByRole("listitem").entries()) {
    expect(slot.querySelector(".transmission-slot-number")).toHaveTextContent(new RegExp(`${index + 1}\\s*号位-\\d+`));
  }
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
  const option = () => within(actionSelector()).getByRole("option", { name: /轮班 · 额外传动/ });
  selectAction(option().value);
  advance();
  expect(option()).toBeDisabled();
  expect(option()).toHaveTextContent("冷却");
  advance();
  expect(option()).toBeEnabled();
  fireEvent.click(screen.getByRole("button", { name: "回到上回合" }));
  expect(option()).toBeDisabled();
  advance();
  expect(option()).toBeEnabled();
});

test("重复轮班可以指定第二张，历史保留该张行动后的独立顺序", () => {
  render(<TransmissionPanel snapshot={snapshot} sides={{ attacker: side(["轮班", "金属噪音", "齿轮扭矩", "轮班"]) }} onClose={vi.fn()} />);
  fireEvent.click(screen.getByRole("button", { name: "载入攻击方技能" }));
  advance();
  expect(currentOrder()).toEqual(["轮班", "轮班", "齿轮扭矩", "金属噪音"]);
  expect(within(actionSelector()).getAllByRole("option", { name: /轮班 · 额外传动/ })).toHaveLength(2);
  selectAction("1:drive");
  advance();
  expect(historyEntries()[1].querySelector("p")).toHaveTextContent("1. 轮班 → 2. 齿轮扭矩 → 3. 轮班 → 4. 金属噪音");
});

test("一意孤行重复轮班的行动与下回合动效串联保留实例身份，撤回不丢选项", async () => {
  const motion = mockMotion();
  render(<TransmissionPanel snapshot={snapshot} sides={{ attacker: nativeSide("黑化加尔", ["轮班", "金属噪音", "齿轮扭矩", "轮班"]) }} onClose={vi.fn()} />);
  fireEvent.click(screen.getByRole("button", { name: "载入攻击方技能" }));
  advance();
  await motion.finish();
  const before = ["轮班", "轮班", "齿轮扭矩", "金属噪音"];
  expect(currentOrder()).toEqual(before);
  const previousAnimations = motion.animations.length;
  selectAction("1:drive");
  advance();
  expect(currentOrder()).toEqual(["轮班", "轮班", "金属噪音", "齿轮扭矩"]);
  expect(historyEntries()[1].querySelector("p")).toHaveTextContent("1. 轮班 → 2. 齿轮扭矩 → 3. 金属噪音 → 4. 轮班");
  expect(roundButton()).toBeDisabled();
  await motion.finish();
  const moves = motion.animations.slice(previousAnimations);
  expect(moves.filter((animation) => animation.instance === 1).map((animation) => animation.frames.map((frame) => frame.transform))).toEqual([
    ["translate(200px, 0px)", "translate(0px, 84px)"],
    ["translate(0px, 84px)", "translate(200px, 84px)"],
    ["translate(200px, 84px)", "translate(0px, 0px)"],
  ]);
  expect(moves.filter((animation) => animation.instance === 0).map((animation) => animation.frames.map((frame) => frame.transform))).toEqual([
    ["translate(0px, 0px)", "translate(200px, 0px)"],
  ]);
  for (const option of within(actionSelector()).getAllByRole("option", { name: /轮班/ })) expect(option).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "回到上回合" }));
  expect(currentOrder()).toEqual(before);
  expect(actionSelector()).toHaveValue("1:drive");
  expect(historyEntries()).toHaveLength(1);
  for (const option of within(actionSelector()).getAllByRole("option", { name: /轮班/ })) expect(option).toBeEnabled();
});

test("杠杆置换邻接固定技能时禁用，不能绕过引擎阻断", () => {
  render(<TransmissionPanel snapshot={snapshot} sides={{ attacker: side(["杠杆置换", "主轴", "金属噪音", "倾泻"]) }} onClose={vi.fn()} />);
  fireEvent.click(screen.getByRole("button", { name: "载入攻击方技能" }));
  advance();
  const selector = screen.getByLabelText("本回合行动");
  expect(within(selector).getByRole("option", { name: /杠杆置换/ })).toBeDisabled();
  fireEvent.change(selector, { target: { value: "0:power" } });
  expect(screen.getByRole("status")).toHaveTextContent("固定槽位的冲突规则未确认");
  expect(roundButton()).toBeDisabled();
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
  if (mode === "关闭") fireEvent.click(screen.getByRole("button", { name: "传动动效" }));
  advance();
  expect(currentOrder()).toEqual(["C", "D", "A", "B"]);
  expect(screen.getByText("已累计传动数 8，风起印记 ×1")).toBeInTheDocument();
  if (mode === "开启") {
    expect(roundButton()).toBeDisabled();
    advance();
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

test("图标动效开关提示当前状态，播放中关闭不改结果并可再次开启", async () => {
  const motion = mockMotion();
  renderWindMotion();
  const toggle = screen.getByRole("button", { name: "传动动效" });
  expect(roundButton()).toHaveTextContent(/^开始$/);
  expect(toggle.textContent).toBe("");
  expect(toggle).toHaveAttribute("aria-pressed", "true");
  expect(toggle.title).toContain("已开启");
  advance();
  expect(roundButton()).toHaveTextContent(/^推演下一回合$/);
  expect(roundButton()).toBeDisabled();
  const oldAnimations = [...motion.animations];
  expect(oldAnimations.length).toBeGreaterThan(0);
  fireEvent.click(toggle);
  expect(roundButton()).toBeEnabled();
  expect(toggle).toHaveAttribute("aria-pressed", "false");
  expect(toggle.title).toContain("已关闭");
  expect(oldAnimations.every((animation) => animation.cancel.mock.calls.length > 0)).toBe(true);
  await motion.finish();
  expect(screen.getByRole("list", { name: "当前技能槽位" })).toHaveAttribute("aria-busy", "false");
  expect(currentOrder()).toEqual(["C", "D", "A", "B"]);
  expect(screen.getByText("已累计传动数 8，风起印记 ×1")).toBeInTheDocument();
  expect(screen.getByText("逐步记录 · 1 条")).toBeInTheDocument();
  fireEvent.click(toggle);
  expect(toggle).toHaveAttribute("aria-pressed", "true");
  expect(toggle.title).toContain("已开启");
  advance();
  expect(motion.animations.length).toBeGreaterThan(oldAnimations.length);
  expect(screen.getByRole("list", { name: "当前技能槽位" })).toHaveAttribute("aria-busy", "true");
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
