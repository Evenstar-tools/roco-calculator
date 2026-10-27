import { readFileSync } from "node:fs";
import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, test } from "vitest";
import { App } from "../../src/App.jsx";
import { createInitialState } from "../../src/state/defaults.js";
import { FIRST_RUN_GUIDE_STORAGE_KEY } from "../../src/state/first-run-guide.js";
import { createCalculatorSessionStore } from "../../src/runtime/workspace-store.js";

const snapshot = JSON.parse(readFileSync("public/data/runtime.json", "utf8"));
const fire = snapshot.spirits.find(({ fullName }) => fullName === "烈火守护");
const wolf = snapshot.spirits.find(({ fullName }) => fullName === "银月狼王");
const bite = snapshot.skills.find(({ name }) => name === "撕咬");
const wolfHit = snapshot.skills.find(({ name }) => name === "见招拆招");

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem(FIRST_RUN_GUIDE_STORAGE_KEY, "1");
});

function workspace() {
  const state = createInitialState(snapshot);
  state.mode = "four";
  for (const side of Object.values(state.sides)) {
    side.spiritId = fire.id;
    side.skills = { single: bite.id, four: [bite.id, null, null, null] };
  }
  return { state, viewMode: "compact", activeDirection: "forward" };
}

function selectSide(initial, side, spirit, skill) {
  initial.state.sides[side].spiritId = spirit.id;
  initial.state.sides[side].skills = { single: skill.id, four: [skill.id, null, null, null] };
}

async function openAttackChanges(user) {
  await user.click(screen.getAllByRole("button", { name: "查看烈火守护本期改动" })[0]);
  return screen.getByRole("dialog", { name: "烈火守护本期改动" });
}

function sideCard(side) {
  return screen.getByRole("combobox", { name: `${side}精灵` }).closest(".spirit-picker").querySelector(".spirit-card");
}

test("只保留卡片上的实际修改，结果一个数；恢复当前后可找回上次修改", async () => {
  const user = userEvent.setup();
  const initial = workspace();
  selectSide(initial, "defender", wolf, wolfHit);
  const official = structuredClone(snapshot.spirits.find(({ id }) => id === fire.id).raceStats);
  render(<App initialSnapshot={snapshot} initialWorkspace={initial} />);
  const initialDamage = screen.getByTestId("primary-damage").textContent;
  const panel = await openAttackChanges(user);
  expect(within(panel).queryByRole("checkbox", { name: /对比/u })).not.toBeInTheDocument();
  expect(within(panel).queryByRole("combobox", { name: "对比调整记录" })).not.toBeInTheDocument();
  const custom = within(panel).getByRole("checkbox", { name: "自定义种族值" });
  await user.click(custom);
  expect(screen.queryByLabelText("自定义种族值摘要")).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "关闭种族值试算" })).not.toBeInTheDocument();
  expect(screen.queryByRole("region", { name: "更新前后对比" })).not.toBeInTheDocument();
  expect(screen.getByTestId("primary-damage")).toHaveTextContent(initialDamage);
  const attack = within(panel).getByRole("spinbutton", { name: "试算物攻种族值" });
  fireEvent.change(attack, { target: { value: "200" } });
  expect(attack).toHaveValue(200);
  const customDamage = screen.getByTestId("primary-damage").textContent;
  expect(customDamage).not.toBe(initialDamage);
  expect(customDamage).toMatch(/^\d+$/u);
  expect(document.querySelector(".balance-damage, .balance-summary, .balance-inline")).toBeNull();
  expect(screen.getByLabelText("自定义种族值摘要")).toHaveTextContent("79 → 200");
  expect(screen.getByRole("button", { name: "查看全精灵承伤（官方值）" })).toBeInTheDocument();
  expect(snapshot.spirits.find(({ id }) => id === fire.id).raceStats).toEqual(official);
  await user.click(within(panel).getByRole("button", { name: "恢复当前" }));
  expect(custom).not.toBeChecked();
  expect(screen.getByTestId("primary-damage")).toHaveTextContent(initialDamage);
  await user.click(within(panel).getByRole("button", { name: "恢复上次修改" }));
  expect(custom).toBeChecked();
  expect(within(panel).getByRole("spinbutton", { name: "试算物攻种族值" })).toHaveValue(200);
  expect(screen.getByTestId("primary-damage")).toHaveTextContent(customDamage);
  expect(Object.values(localStorage).join(" ")).not.toContain("balance-custom:");
  await user.keyboard("{Escape}");
  await user.click(within(sideCard("攻击方")).getByRole("button", { name: "恢复当前" }));
  expect(screen.getByTestId("primary-damage")).toHaveTextContent(initialDamage);
  expect(screen.queryByLabelText("自定义种族值摘要")).not.toBeInTheDocument();
});

test("烈火守护一键应用改动前六维，两侧相同精灵各自生效并随交换移动", async () => {
  const user = userEvent.setup();
  render(<App initialSnapshot={snapshot} initialWorkspace={workspace()} />);
  const initialDamage = screen.getByTestId("primary-damage").textContent;
  const panel = await openAttackChanges(user);
  await user.click(within(panel).getByRole("button", { name: "应用改动前" }));
  expect(within(panel).getByRole("checkbox", { name: "自定义种族值" })).not.toBeChecked();
  expect(within(panel).queryByRole("spinbutton")).not.toBeInTheDocument();
  expect(screen.getByTestId("primary-damage").textContent).not.toBe(initialDamage);
  const changed = within(sideCard("攻击方")).getByLabelText("自定义种族值摘要");
  expect(changed).toHaveTextContent("改动前");
  expect(changed).toHaveTextContent("物攻 79 → 117");
  expect(changed).toHaveTextContent("魔攻 13 → 49");
  expect(changed).toHaveTextContent("物防 110 → 135");
  expect(within(sideCard("防御方")).queryByLabelText("自定义种族值摘要")).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "关闭种族值试算" })).not.toBeInTheDocument();
  await user.keyboard("{Escape}");
  await user.click(screen.getByRole("button", { name: "交换双方完整配置" }));
  expect(within(sideCard("攻击方")).queryByLabelText("自定义种族值摘要")).not.toBeInTheDocument();
  expect(within(sideCard("防御方")).getByLabelText("自定义种族值摘要")).toHaveTextContent("物攻 79 → 117");
  const attackPanel = await openAttackChanges(user);
  await user.click(within(attackPanel).getByRole("button", { name: "应用改动前" }));
  expect(screen.getAllByLabelText("自定义种族值摘要")).toHaveLength(2);
  await user.click(within(attackPanel).getByRole("button", { name: "恢复当前" }));
  expect(within(sideCard("攻击方")).queryByLabelText("自定义种族值摘要")).not.toBeInTheDocument();
  expect(within(sideCard("防御方")).getByLabelText("自定义种族值摘要")).toHaveTextContent("物防 110 → 135");
  await user.keyboard("{Escape}");
  await user.click(within(sideCard("防御方")).getByRole("button", { name: "恢复当前" }));
  expect(screen.queryByLabelText("自定义种族值摘要")).not.toBeInTheDocument();
  expect(screen.getByTestId("primary-damage")).toHaveTextContent(initialDamage);
});

test("多次改动切换只查看，各期历史六维可应用并一键返回", async () => {
  const user = userEvent.setup();
  const historySnapshot = structuredClone(snapshot);
  const spirit = historySnapshot.spirits.find(({ id }) => id === fire.id);
  const oldRecord = spirit.changeInfo;
  spirit.raceStats = { ...spirit.raceStats, hp: 120, physicalAttack: 90, total: spirit.raceStats.total + 26 };
  spirit.changeInfo = { ...oldRecord,
    patch: { id: "test-s5-race-update", label: "S5 种族值调整", date: "2026.11.05" },
    items: [
      { kind: "stat", field: "hp", label: "生命", before: 105, after: 120 },
      { kind: "stat", field: "physicalAttack", label: "物攻", before: 79, after: 90 },
    ],
    history: [oldRecord],
  };
  render(<App initialSnapshot={historySnapshot} initialWorkspace={workspace()} />);
  const initialDamage = screen.getByTestId("primary-damage").textContent;
  const panel = await openAttackChanges(user);
  const latestTab = within(panel).getByRole("tab", { name: "S5 种族值调整" });
  const olderTab = within(panel).getByRole("tab", { name: "S4 新站正式资料" });
  expect(within(panel).getByRole("tabpanel")).toHaveTextContent("2026.11.05");
  expect(within(panel).getAllByRole("button", { name: "应用改动前" })).toHaveLength(1);
  await user.click(within(panel).getByRole("button", { name: "应用改动前" }));
  expect(within(sideCard("攻击方")).getByLabelText("自定义种族值摘要")).toHaveTextContent("物攻 90 → 79");
  expect(within(panel).getByRole("button", { name: "恢复当前" })).toBeInTheDocument();
  const latestDamage = screen.getByTestId("primary-damage").textContent;
  const latestSummary = within(sideCard("攻击方")).getByLabelText("自定义种族值摘要").textContent;
  await user.click(olderTab);
  expect(within(panel).getByRole("tabpanel")).toHaveTextContent("2026.09.10");
  expect(screen.getByTestId("primary-damage")).toHaveTextContent(latestDamage);
  expect(within(sideCard("攻击方")).getByLabelText("自定义种族值摘要").textContent).toBe(latestSummary);
  await user.click(within(panel).getByRole("button", { name: "应用改动前" }));
  const summary = within(sideCard("攻击方")).getByLabelText("自定义种族值摘要");
  expect(summary).toHaveTextContent("生命 120 → 105");
  expect(summary).toHaveTextContent("物攻 90 → 117");
  expect(summary).toHaveTextContent("魔攻 13 → 49");
  expect(summary).toHaveTextContent("物防 110 → 135");
  const olderDamage = screen.getByTestId("primary-damage").textContent;
  const olderSummary = summary.textContent;
  await user.click(latestTab);
  expect(within(panel).getByRole("button", { name: "应用改动前" })).toBeInTheDocument();
  expect(screen.getByTestId("primary-damage")).toHaveTextContent(olderDamage);
  expect(within(sideCard("攻击方")).getByLabelText("自定义种族值摘要").textContent).toBe(olderSummary);
  expect(within(panel).getByRole("checkbox", { name: "自定义种族值" })).not.toBeChecked();
  await user.click(olderTab);
  await user.click(within(panel).getByRole("button", { name: "恢复当前" }));
  expect(screen.queryByLabelText("自定义种族值摘要")).not.toBeInTheDocument();
  expect(screen.getByTestId("primary-damage")).toHaveTextContent(initialDamage);
  expect(historySnapshot.spirits.find(({ id }) => id === fire.id).raceStats.physicalAttack).toBe(90);
});

test("纯新增精灵也只提供种族值编辑，不生成缺少调整前资料提示", async () => {
  const user = userEvent.setup();
  const initial = workspace();
  selectSide(initial, "attacker", wolf, wolfHit);
  selectSide(initial, "defender", wolf, wolfHit);
  render(<App initialSnapshot={snapshot} initialWorkspace={initial} />);
  await user.click(screen.getAllByRole("button", { name: "编辑银月狼王试算种族值" })[0]);
  const panel = screen.getByRole("dialog", { name: "银月狼王种族值试算" });
  await user.click(within(panel).getByRole("checkbox", { name: "自定义种族值" }));
  expect(within(panel).getByRole("spinbutton", { name: "试算物攻种族值" })).toBeVisible();
  expect(screen.queryByText("当前不可对比")).not.toBeInTheDocument();
  expect(screen.queryByRole("region", { name: "更新前后对比" })).not.toBeInTheDocument();
});

test("试算输入保持焦点，拒绝无效草稿，清除当前配置同时清除试算", async () => {
  const user = userEvent.setup();
  render(<App initialSnapshot={snapshot} initialWorkspace={workspace()} />);
  await user.hover(screen.getAllByRole("button", { name: "查看烈火守护本期改动" })[0]);
  const panel = screen.getByRole("dialog", { name: "烈火守护本期改动" });
  await user.click(within(panel).getByRole("checkbox", { name: "自定义种族值" }));
  const attack = within(panel).getByRole("spinbutton", { name: "试算物攻种族值" });
  await user.clear(attack);
  expect(attack).toHaveAttribute("aria-invalid", "true");
  await user.type(attack, "123");
  expect(attack).toHaveFocus();
  expect(attack).toHaveValue(123);
  expect(screen.getByLabelText("自定义种族值摘要")).toHaveTextContent("79 → 123");
  await user.keyboard("{Escape}");
  await user.click(screen.getByRole("button", { name: "打开菜单" }));
  await user.click(screen.getByRole("button", { name: "清除当前页配置" }));
  expect(screen.queryByLabelText("自定义种族值摘要")).not.toBeInTheDocument();
  expect(screen.queryByRole("region", { name: "更新前后对比" })).not.toBeInTheDocument();
});

test("自定义生命下百分比输入按官方尺度存档，关闭或重新载入不混入试算生命", async () => {
  const user = userEvent.setup();
  const app = render(<App initialSnapshot={snapshot} initialWorkspace={workspace()} />);
  const officialMax = Number(screen.getByRole("spinbutton", { name: "防御方当前生命" }).value);
  await user.click(screen.getAllByRole("button", { name: "查看烈火守护本期改动" })[1]);
  const panel = screen.getByRole("dialog", { name: "烈火守护本期改动" });
  await user.click(within(panel).getByRole("checkbox", { name: "自定义种族值" }));
  fireEvent.change(within(panel).getByRole("spinbutton", { name: "试算生命种族值" }), { target: { value: "200" } });
  await user.keyboard("{Escape}");
  const rail = screen.getByLabelText("伤害结果", { selector: ".result-rail" });
  await user.click(within(rail).getByRole("button", { name: "按百分比输入" }));
  fireEvent.change(within(rail).getByRole("spinbutton", { name: "防御方生命百分比" }), { target: { value: "50" } });
  const saved = createCalculatorSessionStore().loadSession().present;
  expect(saved.directions.forward.currentHp).toBe(Math.round(officialMax / 2));
  expect(saved.directions.forward.context.currentHpPercent).toBe(50);
  expect(JSON.stringify(saved)).not.toContain("balance-custom:");
  await user.click(within(sideCard("防御方")).getByRole("button", { name: "恢复当前" }));
  expect(screen.queryByRole("region", { name: "更新前后对比" })).not.toBeInTheDocument();
  app.unmount();
  render(<App initialSnapshot={snapshot} />);
  expect(screen.getByRole("spinbutton", { name: "防御方当前生命" })).toHaveValue(Math.round(officialMax / 2));
});
