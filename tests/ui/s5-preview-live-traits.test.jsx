import { readFileSync } from "node:fs";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, expect, test } from "vitest";
import { App } from "../../src/App.jsx";
import { withWebPreview } from "../../src/features/s5-preview/with-web-preview.js";
import { createInitialState } from "../../src/state/defaults.js";
import { FIRST_RUN_GUIDE_STORAGE_KEY } from "../../src/state/first-run-guide.js";

beforeEach(() => { localStorage.clear(); localStorage.setItem(FIRST_RUN_GUIDE_STORAGE_KEY, "1"); });
const snapshot = withWebPreview(JSON.parse(readFileSync("public/data/runtime.json", "utf8")));
function setup(key, mode = "four", skillName = "撕咬", negative = false, configure = () => {}) {
  const state = createInitialState(snapshot);
  state.mode = mode;
  state.calculationOptions.includeNegativeStatusSettlement = negative;
  state.sides.attacker.spiritId = `spirit_preview_s5_${key}`;
  state.sides.defender.spiritId = snapshot.spirits.find(s => s.fullName === "迪莫").id;
  const bite = snapshot.skills.find(s => s.name === skillName);
  for (const side of Object.values(state.sides)) side.skills = { single: bite?.id ?? null, four: [bite?.id ?? null, null, null, null] };
  configure(state);
  render(<App initialSnapshot={snapshot} initialWorkspace={{ state, activeDirection: "forward", viewMode: "compact" }} />);
}
const primary = () => Number(screen.getByTestId("primary-damage").textContent);

test.each(["single", "four"])("%s冥古龙仅有当前等级框，按钮与键盘每次10级且79/80边界即时同步", mode => {
  setup("minggulong", mode);
  if (mode === "four") fireEvent.click(screen.getByRole("button", { name: "具体版", exact: true }));
  const level = screen.getByRole("spinbutton", { name: "当前等级", exact: true });
  expect(level).toHaveValue(99);
  expect(screen.queryByRole("spinbutton", { name: /起始等级|已结束回合数/u })).not.toBeInTheDocument();
  const decrease = screen.getByRole("button", { name: "当前等级减少10", exact: true });
  const increase = screen.getByRole("button", { name: "当前等级增加10", exact: true });
  const summaryRole = mode === "four" ? "防御特性当前效果" : "攻击特性当前效果";
  const at99 = primary();
  expect(increase).toBeDisabled();
  fireEvent.click(decrease);
  expect(level).toHaveValue(89);
  expect(screen.getAllByRole("status", { name: summaryRole })[0]).not.toHaveTextContent("承伤 +40%");
  fireEvent.click(decrease);
  expect(level).toHaveValue(79);
  expect(screen.getAllByRole("status", { name: summaryRole })[0]).toHaveTextContent("承伤 +40%");
  expect(primary()).toBeLessThan(at99);
  fireEvent.keyDown(level, { key: "ArrowUp" });
  expect(level).toHaveValue(89);
  fireEvent.keyDown(level, { key: "ArrowDown" });
  expect(level).toHaveValue(79);
  fireEvent.change(level, { target: { value: "80" } });
  expect(screen.getAllByRole("status", { name: summaryRole })[0]).not.toHaveTextContent("承伤 +40%");
  fireEvent.click(decrease);
  expect(level).toHaveValue(70);
  fireEvent.click(increase);
  expect(level).toHaveValue(80);
});

test.each(["single", "four"])("精简%s聚能次数在回合末增加物攻，归零移除增益", mode => {
  setup("gold-vein-dragon", mode);
  const before = primary();
  const count = screen.getByRole("spinbutton", { name: "聚能次数" });
  expect(count).toHaveValue(0);
  expect(screen.queryByRole("checkbox", { name: "聚能后双攻增益当前生效" })).not.toBeInTheDocument();
  expect(screen.queryByRole("spinbutton", { name: "当前已生效双攻增益" })).not.toBeInTheDocument();
  fireEvent.change(count, { target: { value: "1" } });
  expect(primary()).toBe(before);
  expect(screen.getAllByText(/待回合结束 1 次/u).length).toBeGreaterThan(0);
  fireEvent.click(screen.getAllByRole("button", { name: "回合结束", exact: true })[0]);
  const once = primary();
  expect(once).toBeGreaterThan(before);
  fireEvent.click(screen.getAllByRole("button", { name: "回合结束", exact: true })[0]);
  expect(primary()).toBe(once);
  expect(screen.getAllByText("聚能 1 次 · 物攻能力等级 +5").length).toBeGreaterThan(0);
  fireEvent.change(count, { target: { value: "2" } });
  expect(primary()).toBe(once);
  fireEvent.click(screen.getAllByRole("button", { name: "回合结束", exact: true })[0]);
  expect(primary()).toBeGreaterThan(once);
  expect(screen.getAllByText("聚能 2 次 · 物攻能力等级 +10").length).toBeGreaterThan(0);
  fireEvent.change(count, { target: { value: "0" } });
  expect(primary()).toBe(before);
});

test.each([["abu", "single"], ["boss-abu", "four"], ["super-abu", "four"]])("%s %s仅用当前等级，步进2级、80承伤边界与99上限同步", (key, mode) => {
  setup(key, mode);
  if (mode === "four") fireEvent.click(screen.getByRole("button", { name: "具体版", exact: true }));
  const level = screen.getByRole("spinbutton", { name: "当前等级", exact: true });
  const increase = screen.getByRole("button", { name: "当前等级增加2", exact: true });
  const decrease = screen.getByRole("button", { name: "当前等级减少2", exact: true });
  const summary = () => screen.getAllByRole("status", { name: mode === "four" ? "防御特性当前效果" : "攻击特性当前效果" })[0];
  expect(level).toHaveValue(60);
  expect(screen.queryByRole("spinbutton", { name: /起始等级|3能耗.*次数/u })).not.toBeInTheDocument();
  const at60 = primary();
  expect(at60).toBeGreaterThan(0);
  fireEvent.click(increase);
  expect(level).toHaveValue(62);
  expect(primary()).toBeGreaterThan(at60);
  fireEvent.click(decrease);
  expect(level).toHaveValue(60);
  expect(primary()).toBe(at60);
  fireEvent.keyDown(level, { key: "ArrowUp" });
  expect(level).toHaveValue(62);
  fireEvent.keyDown(level, { key: "ArrowDown" });
  expect(level).toHaveValue(60);
  fireEvent.change(level, { target: { value: "78" } });
  expect(summary()).toHaveTextContent("承伤 +40%");
  fireEvent.click(increase);
  expect(level).toHaveValue(80);
  expect(summary()).not.toHaveTextContent("承伤 +40%");
  fireEvent.change(level, { target: { value: "79" } });
  expect(summary()).toHaveTextContent("承伤 +40%");
  fireEvent.change(level, { target: { value: "98" } });
  fireEvent.click(increase);
  expect(level).toHaveValue(99);
  expect(increase).toBeDisabled();
  fireEvent.click(decrease);
  expect(level).toHaveValue(97);
});


test("精简四技能本次确认与原生取消/重用共用状态，摘要和结算同时回填", () => {
  setup("watermelon-bug", "four", "捆缚", true);
  const type = screen.getByRole("combobox", { name: "本次已使用技能系别" });
  fireEvent.change(type, { target: { value: "bug" } });
  expect(type).toHaveValue("bug");
  expect(screen.getAllByText("本次虫系技能使用后：对手寄生 +1层").length).toBeGreaterThan(0);
  const applied = primary();
  expect(applied).toBeGreaterThan(0);
  fireEvent.click(screen.getByRole("button", { name: "攻击方技能1取消使用" }));
  expect(type).toHaveValue("none");
  expect(screen.getAllByText("未确认本次使用系别，无额外施加").length).toBeGreaterThan(0);
  expect(screen.getByTestId("primary-damage")).toHaveTextContent("—");
  fireEvent.click(screen.getByRole("button", { name: "攻击方技能1使用状态" }));
  expect(type).toHaveValue("bug");
  expect(primary()).toBe(applied);
});


test.each(["single", "four"])("%s萌系天气与铃兰共用状态，明确回合结束才挂寄生，撤回与上限有效", async mode => {
  setup("lily-of-valley", mode, "撕咬", true);
  fireEvent.click(screen.getByRole("button", { name: "具体版", exact: true }));
  fireEvent.click(screen.getByRole("button", { name: "高级选项" }));
  const weather = screen.getByRole("combobox", { name: "天气", exact: true });
  const turnEnd = screen.getAllByRole("button", { name: "回合结束 · 对手寄生+3" })[0];
  const parasite = screen.getByRole("spinbutton", { name: "防御方寄生层数" });
  expect(turnEnd).toBeDisabled();
  fireEvent.change(weather, { target: { value: "dream" } });
  expect(screen.getAllByRole("checkbox", { name: "萌系天气（占位）" })[0]).toBeChecked();
  expect(turnEnd).toBeEnabled();
  expect(parasite).toHaveValue(0);
  await Promise.resolve();
  fireEvent.click(turnEnd);
  expect(parasite).toHaveValue(3);
  const after = primary();
  await Promise.resolve();
  fireEvent.click(turnEnd);
  expect(parasite).toHaveValue(6);
  expect(primary()).toBeGreaterThan(after);
  await Promise.resolve();
  fireEvent.click(screen.getByRole("button", { name: /撤回上一步/u }));
  expect(parasite).toHaveValue(3);
  // Changing weather never removes layers already applied by an explicit turn.
  fireEvent.change(weather, { target: { value: "rain" } });
  expect(turnEnd).toBeDisabled();
  expect(screen.getAllByRole("checkbox", { name: "萌系天气（占位）" })[0]).not.toBeChecked();
  expect(parasite).toHaveValue(3);
  fireEvent.click(screen.getAllByRole("checkbox", { name: "萌系天气（占位）" })[0]);
  expect(weather).toHaveValue("dream");
  fireEvent.change(parasite, { target: { value: "98" } });
  fireEvent.click(turnEnd);
  expect(parasite).toHaveValue(99);
  fireEvent.click(turnEnd);
  expect(parasite).toHaveValue(99);
});

test.each(["single", "four"])("%s蛋包蛋只需特性触发一个勾选，双防及受击伤害同步且可取消", mode => {
  setup("egg-wrap", mode);
  const trigger = screen.getByRole("checkbox", { name: "特性触发", exact: true });
  expect(screen.queryByRole("checkbox", { name: "入场时己方有萌化精灵" })).not.toBeInTheDocument();
  expect(screen.queryByRole("checkbox", { name: "本次入场双防增益当前生效" })).not.toBeInTheDocument();
  const before = primary();
  fireEvent.click(trigger);
  expect(trigger).toBeChecked();
  expect(screen.getAllByText("双防 +50%").length).toBeGreaterThan(0);
  // This owner is the attacker: its outgoing physical damage is unaffected.
  expect(primary()).toBe(before);
  fireEvent.click(trigger);
  expect(trigger).not.toBeChecked();
  expect(screen.getAllByText("特性未触发").length).toBeGreaterThan(0);
});

test("无技能也同步回合末聚能后的物攻与能力等级栏，手调加减不重复计入特性", () => {
  setup("gold-vein-dragon", "four", null);
  fireEvent.click(screen.getByRole("button", { name: "具体版", exact: true }));
  const panel = screen.getByRole("group", { name: "攻击方能力", exact: true });
  const count = screen.getAllByRole("spinbutton", { name: "聚能次数" })[0];
  for (const [times, expected, stage] of [[1, 355, 5], [2, 474, 10]]) {
    fireEvent.change(count, { target: { value: String(times) } });
    if (times === 1) expect(within(panel).queryByRole("button", { name: /物攻最终值/u })).not.toBeInTheDocument();
    else expect(within(panel).getByRole("button", { name: /物攻最终值355，基础值237/u })).toBeInTheDocument();
    fireEvent.click(screen.getAllByRole("button", { name: "回合结束", exact: true })[0]);
    expect(within(panel).queryByRole("button", { name: /魔攻最终值/u })).not.toBeInTheDocument();
    for (const stat of ["物攻"]) {
      expect(within(panel).getByRole("button", { name: new RegExp(`${stat}最终值${expected}，基础值237`) })).toBeInTheDocument();
    }
    expect(within(panel).getByText(`物攻 ${stage}层 · +${stage * 10}%`)).toBeInTheDocument();
    expect(within(panel).getByText("魔攻 0层 · 0%")).toBeInTheDocument();
  }
  fireEvent.click(within(panel).getByRole("button", { name: "攻击方等级加一" }));
  expect(within(panel).getByText("物攻 11层 · +110%")).toBeInTheDocument();
  expect(within(panel).getByText("魔攻 1层 · +10%")).toBeInTheDocument();
  expect(within(panel).getByRole("button", { name: /物攻最终值497，基础值237/u })).toBeInTheDocument();
  fireEvent.click(within(panel).getByRole("button", { name: "攻击方等级减一" }));
  expect(within(panel).getByText("物攻 10层 · +100%")).toBeInTheDocument();
  expect(within(panel).getByText("魔攻 0层 · 0%")).toBeInTheDocument();
  fireEvent.change(count, { target: { value: "0" } });
  expect(within(panel).getByText("0层 · 0%")).toBeInTheDocument();
  expect(within(panel).queryByRole("button", { name: /物攻最终值/u })).not.toBeInTheDocument();
});


test.each([['single', 'compact'], ['four', 'compact'], ['four', 'detailed']])("%s %s银龙记录本次能耗且到回合末才增加魔攻，可撤回", async (mode, view) => {
  const skill = snapshot.skills.find(item => item.name === "光球");
  setup("underground-silver-dragon", mode, "光球");
  if (view === "detailed") fireEvent.click(screen.getByRole("button", { name: "具体版", exact: true }));
  const input = () => screen.getAllByRole("spinbutton", { name: "累计消耗能量", exact: true })[0];
  const use = () => screen.getByRole("button", { name: mode === "single" ? "使用技能" : "攻击方技能1使用技能", exact: true });
  const end = () => screen.getAllByRole("button", { name: "回合结束", exact: true })[0];
  expect(input()).toHaveValue(0);
  expect(screen.queryByRole("spinbutton", { name: "已结算数量" })).not.toBeInTheDocument();
  expect(screen.queryByRole("checkbox", { name: "回合结束", exact: true })).not.toBeInTheDocument();
  const before = primary();
  fireEvent.click(use());
  expect(input()).toHaveValue(skill.cost);
  expect(primary()).toBe(before);
  expect(screen.getAllByRole("status", { name: "攻击特性当前效果" })[0]).toHaveTextContent(`待回合结束 ${skill.cost} 点`);
  await Promise.resolve();
  fireEvent.click(end());
  const once = primary();
  expect(once).toBeGreaterThan(before);
  fireEvent.click(end());
  expect(primary()).toBe(once);
  await Promise.resolve();
  fireEvent.click(use());
  expect(input()).toHaveValue(skill.cost * 2);
  expect(primary()).toBe(once);
  await Promise.resolve();
  fireEvent.click(end());
  expect(primary()).toBeGreaterThan(once);
  await Promise.resolve();
  fireEvent.click(screen.getByRole("button", { name: /撤回上一步/u }));
  expect(input()).toHaveValue(skill.cost * 2);
  expect(primary()).toBe(once);
  fireEvent.change(input(), { target: { value: "10" } });
  expect(primary()).toBe(once);
  fireEvent.click(use());
  expect(input()).toHaveValue(10 + skill.cost);
  fireEvent.change(input(), { target: { value: "0" } });
  expect(primary()).toBe(before);
});


test.each(["single", "four"])("%s银龙取消状态使用不再次耗能", mode => {
  const defense = snapshot.skills.find(skill => skill.name === "捆缚");
  setup("underground-silver-dragon", mode, "捆缚", true);
  const input = () => screen.getAllByRole("spinbutton", { name: "累计消耗能量", exact: true })[0];
  fireEvent.click(screen.getByRole("button", { name: mode === "single" ? "使用状态" : "攻击方技能1使用状态", exact: true }));
  expect(input()).toHaveValue(defense.cost);
  fireEvent.click(screen.getByRole("button", { name: mode === "single" ? "取消使用" : "攻击方技能1取消使用", exact: true }));
  expect(input()).toHaveValue(defense.cost);
});

test.each(["single", "four"])("%s银龙零费技能不增加消耗", mode => {
  setup("underground-silver-dragon", mode, "魔法增效");
  const input = () => screen.getAllByRole("spinbutton", { name: "累计消耗能量", exact: true })[0];
  fireEvent.click(screen.getByRole("button", { name: mode === "single" ? "使用技能" : "攻击方技能1使用技能", exact: true }));
  expect(input()).toHaveValue(0);
});


test.each(["single", "four"])("%s银龙使用按折射减费后的实际能耗累计", mode => {
  setup("underground-silver-dragon", mode, "光球", false, state => {
    state.directions.forward.overrides.refractionStatuses = [{ type: "水", label: "全技能能耗-1" }];
  });
  const input = () => screen.getAllByRole("spinbutton", { name: "累计消耗能量", exact: true })[0];
  fireEvent.click(screen.getByRole("button", { name: mode === "single" ? "使用技能" : "攻击方技能1使用技能", exact: true }));
  expect(input()).toHaveValue(1);
  expect(screen.getAllByRole("status", { name: "攻击特性当前效果" })[0]).toHaveTextContent("魔攻 +0%");
  expect(screen.getAllByRole("status", { name: "攻击特性当前效果" })[0]).toHaveTextContent("待回合结束 1 点");
});

test("四技能状态技能连续使用也逐次撤回能耗与自身增益", async () => {
  setup("underground-silver-dragon", "four", "力量增效");
  const input = () => screen.getAllByRole("spinbutton", { name: "累计消耗能量", exact: true })[0];
  const use = () => screen.getByRole("button", { name: "攻击方技能1使用技能", exact: true });
  fireEvent.click(use());
  expect(input()).toHaveValue(1);
  await Promise.resolve();
  fireEvent.click(use());
  expect(input()).toHaveValue(2);
  await Promise.resolve();
  fireEvent.click(screen.getByRole("button", { name: /撤回上一步/u }));
  expect(input()).toHaveValue(1);
});


test.each([["single", "compact"], ["four", "compact"], ["four", "detailed"]])("%s %s热身没有攻击技能槽时仍可取消，取消不重复累计能耗", async (mode, view) => {
  setup("underground-silver-dragon", mode, "热身");
  if (view === "detailed") fireEvent.click(screen.getByRole("button", { name: "具体版", exact: true }));
  const input = () => screen.getAllByRole("spinbutton", { name: "累计消耗能量", exact: true })[0];
  const use = () => screen.getByRole("button", { name: mode === "single" ? "使用技能" : "攻击方技能1使用技能", exact: true });
  fireEvent.click(use());
  expect(input()).toHaveValue(1);
  await Promise.resolve();
  fireEvent.click(use());
  expect(input()).toHaveValue(1);
  if (mode === "four") expect(screen.getByText("热身的状态已解除")).toBeInTheDocument();
  await Promise.resolve();
  fireEvent.click(use());
  expect(input()).toHaveValue(2);
});
