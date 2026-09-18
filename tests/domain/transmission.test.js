import { describe, expect, test } from "vitest";
import snapshot from "../../data/snapshots/current.json";
import { baseDrive, observedOrder, resolveAction, settleLayers, startRound } from "../../src/features/transmission/engine.js";

const named = (name) => snapshot.skills.find((skill) => skill.name === name);
const plain = "ABCD".split("").map((name) => ({ id: name, name, description: "" }));
const order = (result) => result.slots.map((skill) => skill.name).join("");

describe("传动公开示例逐项对照", () => {
  const cases = { "0000": "ABCD", "0001": "DBCA", "0010": "ABDC", "0100": "ACBD", "1000": "BACD", "0101": "DCBA", "1010": "BADC", "0011": "DBAC", "0110": "ADBC", "1100": "CABD", "1001": "DACB", "0111": "DABC", "1011": "DABC", "1101": "DABC", "1110": "DABC", "1111": "DABC" };
  for (const [mask, expected] of Object.entries(cases)) test(mask, () => expect(order(settleLayers(plain, [...mask].map(Number)))).toBe(expected));
  test("逐层携带剩余层数，不在新位置重复领取特性", () => {
    const slots = ["齿轮切开", "金属噪音", "啮合传递", "齿轮扭矩"].map(named);
    const result = startRound(slots, "向心力");
    expect(result.sources.map((source) => source.total)).toEqual([2, 1, 1, 0]);
    expect(result.steps.map((step) => step.slots.map((skill) => skill.name))).toEqual([
      ["齿轮扭矩", "齿轮切开", "金属噪音", "啮合传递"],
      ["齿轮扭矩", "金属噪音", "齿轮切开", "啮合传递"],
    ]);
  });
});

test.each(snapshot.skills.filter((skill) => baseDrive(skill) > 0).map((skill) => [skill.name, skill]))("%s 的基础层数在回合开始触发", (_, skill) => {
  const result = startRound([skill, ...plain.slice(1)]);
  expect(result.steps).toHaveLength(baseDrive(skill));
  expect(result.slots[baseDrive(skill)]).toBe(skill);
});
test.each(["翼轴", "贪心算法"])("%s 只给初始1号位加层", (trait) => {
  expect(startRound(plain, trait).sources.map((source) => source.total)).toEqual([1, 0, 0, 0]);
});
test("连续回合重新计算特性与回环", () => {
  let slots = [named("械斗"), ...plain.slice(1)];
  for (let i = 0; i < 4; i += 1) slots = startRound(slots).slots;
  expect(slots[0].name).toBe("械斗");
});
test.each(["主轴", "锁芯"])("%s 固定，剩余槽位构成环", (name) => {
  const slots = [plain[0], named(name), plain[2], plain[3]];
  expect(settleLayers(slots, [1, 2, 0, 0]).slots).toEqual([plain[2], named(name), plain[0], plain[3]]);
  expect(() => observedOrder(slots, "2134")).toThrow("固定位置");
});
test("杠杆置换首尾相邻，并阻断固定槽冲突", () => {
  const slots = [named("杠杆置换"), ...plain.slice(1)];
  expect(resolveAction(slots, 0, "").slots).toEqual([slots[0], slots[3], slots[2], slots[1]]);
  slots[1] = named("主轴");
  expect(resolveAction(slots, 0, "").issue).toContain("冲突");
});
test("轮班加威不在行动时再结算基础传动，额外传动按层移动到正确位置", () => {
  const slots = [named("轮班"), ...plain.slice(1)];
  expect(resolveAction(slots, 0, "", "power").slots).toBe(slots);
  expect(order(resolveAction(slots, 0, "", "drive"))).toBe("B" + named("轮班").name + "CD");
  expect(resolveAction(slots, 0, "有求必应", "power").executions.map((entry) => entry.branch)).toEqual(["power", "drive"]);
  expect(order(resolveAction(slots, 0, "有求必应", "power"))).toBe("B" + named("轮班").name + "CD");
  expect(resolveAction(slots, 0, "一意孤行", "drive").executions.map((entry) => entry.branch)).toEqual(["drive", "drive"]);
  expect(order(resolveAction(slots, 0, "一意孤行", "drive"))).toBe("BC" + named("轮班").name + "D");
});

test("某一回合使用轮班额外传动后，下回合开始传动落在正确槽位", () => {
  const initial = [named("轮班"), named("金属噪音"), named("齿轮扭矩"), named("倾泻")];
  const afterStart = startRound(initial, "翼轴");
  expect(afterStart.slots.map((skill) => skill.name)).toEqual(["金属噪音", "齿轮扭矩", "轮班", "倾泻"]);
  const afterAction = resolveAction(afterStart.slots, 2, "翼轴", "drive");
  expect(afterAction.issue).toBeUndefined();
  expect(afterAction.slots.map((skill) => skill.name)).toEqual(["金属噪音", "齿轮扭矩", "倾泻", "轮班"]);
  const nextRound = startRound(afterAction.slots, "翼轴");
  expect(nextRound.slots.map((skill) => skill.name)).toEqual(["轮班", "金属噪音", "倾泻", "齿轮扭矩"]);
});
test("未确认机制不返回伪造顺序", () => {
  expect(startRound(plain, "盲拧").slots).toBeUndefined();
  expect(startRound(plain, "翻垃圾桶").slots).toBeUndefined();
  expect(resolveAction([named("过山车"), ...plain.slice(1)], 0, "").slots).toBeUndefined();
  expect(observedOrder(plain, "2,4,1,3")).toEqual([plain[1], plain[3], plain[0], plain[2]]);
  for (const text of ["1111", "123", "1235", "abcd"]) expect(() => observedOrder(plain, text)).toThrow();
});

test.each(["借用", "取念", "复写"])("%s 身份未确定时不伪造回合结果", (name) => {
  expect(startRound([named(name), ...plain.slice(1)]).slots).toBeUndefined();
});
test.each(["镜像反射", "隐藏条款", "过山车"])("%s 不能以原技能排列冒充身份变化", (name) => {
  const result = resolveAction([named(name), ...plain.slice(1)], 0, "");
  expect(result.slots).toBeUndefined();
  expect(result.allowObserved).not.toBe(true);
});
test.each(["裁决", "滋养", "点燃", "净化", "夺目"])("%s 保留明确能力边界", (trait) => {
  expect(startRound(plain, trait).issue).toContain("替换或新增");
});

test.each([["正位宝剑", [0]], ["宝剑王牌", [0, 2]]])("%s引擎结算同样阻断非法槽位", (trait, allowed) => {
  plain.forEach((_, index) => expect(Boolean(resolveAction(plain, index, trait).issue)).toBe(!allowed.includes(index)));
  expect(resolveAction(plain, -1, trait).issue).toBeUndefined();
});
