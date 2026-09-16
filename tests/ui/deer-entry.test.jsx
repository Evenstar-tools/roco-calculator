import { readFileSync } from "node:fs";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { CalculatorRouter } from "../../src/CalculatorRouter.jsx";
import { SpiritStep } from "../../src/components/SpiritStep.jsx";
import DeerPage, { DeerWorkspace } from "../../src/features/deer/DeerPage.jsx";
import { spiritConfigsRepository } from "../../src/state/spirit-configs.js";
import { createDeerSetup } from "../../src/features/deer/deer-model.js";
import { withCalculatorExtras } from "../../src/data/snapshot-extras.js";

const snapshot = withCalculatorExtras(JSON.parse(readFileSync("public/data/runtime.json", "utf8")));
beforeEach(() => {
  localStorage.setItem("rock-calculator.first-run-guide.v1", "1");
  vi.stubGlobal("scrollTo", vi.fn());
  vi.stubGlobal("fetch", vi.fn(async (url) => ({ ok: true, json: async () => String(url).includes("presets/") ? { entries: [] } : snapshot })));
});
afterEach(() => {
  window.history.replaceState(null, "", "/");
  vi.unstubAllGlobals();
});

test("攻击方电鹿才显示入口，防御方和其他精灵不显示", () => {
  const open = vi.fn();
  const deer = snapshot.spirits.find((spirit) => spirit.fullName === "波普鹿");
  const other = snapshot.spirits.find((spirit) => spirit.fullName === "银月狼王");
  const props = { spirits: [deer, other], onOpenDeer: open };
  const { rerender } = render(<SpiritStep {...props} attacker={deer} defender={deer} />);
  expect(screen.getAllByRole("button", { name: "电鹿斩杀线 →" })).toHaveLength(1);
  fireEvent.click(screen.getByRole("button", { name: "电鹿斩杀线 →" }));
  expect(open).toHaveBeenCalledOnce();
  rerender(<SpiritStep {...props} attacker={other} defender={deer} />);
  expect(screen.queryByRole("button", { name: "电鹿斩杀线 →" })).not.toBeInTheDocument();
});

test.each([false, true])("直接打开时使用预设，用户预设优先于内置：%s", async (hasUserPreset) => {
  const side = createDeerSetup(snapshot).state.sides.defender;
  const repository = spiritConfigsRepository();
  repository.clear();
  const builtin = { spiritId: side.spiritId, natureId: "silent", displayIvs: { hp: 60, physicalDefense: 60, magicalDefense: 60 }, skills: side.skills };
  if (hasUserPreset) repository.save({ configs: {} }, { ...side, nature: "cheerful", displayIvs: { ...side.displayIvs, hp: 42 } }, snapshot);
  vi.stubGlobal("fetch", vi.fn(async (url) => ({ ok: true, json: async () => String(url).includes("presets/") ? { entries: [builtin] } : snapshot })));
  const before = JSON.stringify(localStorage);
  render(<DeerPage />);
  const defense = await screen.findByRole("region", { name: "防御方配置" });
  expect(within(defense).getByRole("button", { name: "精灵预设", exact: true })).toHaveAttribute("aria-pressed", "true");
  expect(within(defense).getByText(hasUserPreset ? /开朗 · 生命42/ : /沉默 · 生命60/)).toBeInTheDocument();
  expect(JSON.stringify(localStorage)).toBe(before);
  repository.clear();
});

test("主页带入当前配置不被默认精灵预设覆盖，可主动取用预设", () => {
  const source = createDeerSetup(snapshot).state;
  source.sides.defender.displayIvs.hp = 42;
  const presets = { [source.sides.defender.spiritId]: { natureId: "cheerful", displayIvs: { hp: 60 } } };
  render(<DeerWorkspace snapshot={snapshot} initialState={source} presets={presets} />);
  expect(screen.getByText(/当前配置 · 沉默 · 生命42/)).toBeInTheDocument();
  const presetButton = screen.getByRole("button", { name: "精灵预设", exact: true });
  expect(presetButton).toHaveAttribute("aria-pressed", "false");
  fireEvent.click(presetButton);
  expect(screen.getByText(/开朗 · 生命60/)).toBeInTheDocument();
  expect(source.sides.defender.displayIvs.hp).toBe(42);
});

test("没有防御方不代入默认对手，选好后出现八技能", () => {
  const source = createDeerSetup(snapshot).state;
  source.sides.defender.spiritId = null;
  render(<DeerWorkspace snapshot={snapshot} initialState={source} />);
  expect(screen.getByRole("status")).toHaveTextContent("请选择防御方");
  expect(screen.queryByRole("region", { name: "技能斩杀线" })).not.toBeInTheDocument();
  fireEvent.change(screen.getByLabelText("防御方精灵"), { target: { value: "银月狼王" } });
  fireEvent.click(screen.getByRole("option", { name: /银月狼王/ }));
  expect(screen.getByRole("region", { name: "技能斩杀线" })).toBeInTheDocument();
});

test("卡片入口带入当前对局，专页手调后返回保持主页现场", async () => {
  const source = createDeerSetup(snapshot).state;
  source.sides.defender.displayIvs.hp = 42;
  source.sides.defender.ignoreTraits = true;
  const original = JSON.stringify(source);
  window.history.replaceState({ deerInput: { state: source, viewMode: "detailed" } }, "", "/");
  render(<CalculatorRouter initialSnapshot={snapshot} />);
  const homeAttack = screen.getByLabelText("攻击方精灵").value;
  const homeDefense = screen.getByLabelText("防御方精灵").value;
  const beforeStorage = JSON.stringify(localStorage);
  fireEvent.click(screen.getByRole("button", { name: "电鹿斩杀线 →" }));
  expect(window.location.pathname).toBe("/dianlu");
  await screen.findByRole("region", { name: "技能斩杀线" });
  expect(screen.getByText(/当前配置 · 沉默 · 生命42/)).toBeInTheDocument();
  expect(screen.getByLabelText("防守特性")).not.toBeChecked();
  fireEvent.click(screen.getByRole("button", { name: "无耐久", exact: true }));
  expect(screen.getAllByRole("link", { name: "返回主站" })).toHaveLength(1);
  expect(screen.getByRole("link", { name: "返回主站" }).closest("header")).toHaveClass("app-header--tool");
  expect(screen.getByRole("link", { name: "返回主站" }).parentElement).toHaveClass("app-header__actions");
  expect(screen.getByRole("link", { name: "返回主站" }).previousElementSibling).toHaveAttribute("aria-label", "切换主题");
  fireEvent.click(screen.getByRole("link", { name: "返回主站" }));
  await waitFor(() => expect(window.location.pathname).toBe("/"));
  expect(screen.getByLabelText("攻击方精灵")).toHaveValue(homeAttack);
  expect(screen.getByLabelText("防御方精灵")).toHaveValue(homeDefense);
  expect(screen.getByRole("button", { name: "具体版", exact: true })).toHaveAttribute("aria-pressed", "true");
  expect(JSON.stringify(localStorage)).toBe(beforeStorage);
  expect(JSON.stringify(source)).toBe(original);
  fireEvent.click(screen.getByRole("button", { name: "电鹿斩杀线 →" }));
  const defense = await screen.findByRole("region", { name: "防御方配置" });
  expect(within(defense).getByText(/当前配置 · 沉默 · 生命42/)).toBeInTheDocument();
});
