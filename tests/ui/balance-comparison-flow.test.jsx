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

test("只保留种族值编辑，结果一个数；恢复官方后可找回上次手调", async () => {
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
  await user.click(within(panel).getByRole("button", { name: "恢复官方种族值" }));
  expect(custom).not.toBeChecked();
  expect(screen.getByTestId("primary-damage")).toHaveTextContent(initialDamage);
  await user.click(within(panel).getByRole("button", { name: "恢复上次手调值" }));
  expect(custom).toBeChecked();
  expect(within(panel).getByRole("spinbutton", { name: "试算物攻种族值" })).toHaveValue(200);
  expect(screen.getByTestId("primary-damage")).toHaveTextContent(customDamage);
  expect(Object.values(localStorage).join(" ")).not.toContain("balance-custom:");
  await user.keyboard("{Escape}");
  await user.click(screen.getByRole("button", { name: "关闭种族值试算" }));
  expect(screen.getByTestId("primary-damage")).toHaveTextContent(initialDamage);
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
  await user.click(screen.getByRole("button", { name: "关闭种族值试算" }));
  expect(screen.queryByRole("region", { name: "更新前后对比" })).not.toBeInTheDocument();
  app.unmount();
  render(<App initialSnapshot={snapshot} />);
  expect(screen.getByRole("spinbutton", { name: "防御方当前生命" })).toHaveValue(Math.round(officialMax / 2));
});
