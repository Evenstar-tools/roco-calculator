import { fireEvent, render, screen, within, waitFor } from "@testing-library/react";
import { useState } from "react";
import { expect, test, vi } from "vitest";
import DamageComparisonDialog from "../../src/components/DamageComparisonDialog.jsx";
import { createInitialState } from "../../src/state/defaults.js";
import { damageComparisonSourceKey } from "../../src/state/damage-comparison.js";

test.each([0, 1, 200, 201])("用户预设 %i 条的可见性、默认阈值和手动选择记忆", async (count) => {
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
  expect(screen.getByLabelText("承伤耐久模板")).toHaveValue(count > 200 ? "user-presets" : "standard-hp-v1");
  if (count) {
    fireEvent.change(screen.getByLabelText("承伤耐久模板"), { target: { value: "user-presets" } });
    await screen.findByRole("button", { name: "查看乙承伤详情" });
    fireEvent.click(screen.getByRole("button", { name: "查看乙承伤详情" }));
    expect(screen.getByText(/胆小 · 生命60／魔攻60／速度60个体/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "查看甲承伤详情" }));
    expect(screen.getByText(/未存预设 · 60级 · 生命性格/)).toBeInTheDocument();
  }
  fireEvent.change(screen.getByLabelText("承伤耐久模板"), { target: { value: "standard-magical-v1" } });
  const preferences = onPreferencesChange.mock.lastCall[0];
  unmount();
  render(<DamageComparisonDialog snapshot={snapshot} source={source} preferences={preferences} onClose={vi.fn()} />);
  await screen.findByRole("button", { name: "查看乙承伤详情" });
  expect(screen.getByLabelText("承伤耐久模板")).toHaveValue("standard-magical-v1");
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
  fireEvent.change(dialog.getByLabelText("承伤耐久模板"), { target: { value: "standard-magical-v1" } });
  await waitFor(() => expect(dialog.queryByText(/正在计算/)).not.toBeInTheDocument());
  fireEvent.click(dialog.getByRole("button", { name: "代入防守方复算" }));
  expect(onImport).toHaveBeenCalledWith(snapshot.spirits[1], "standard-magical-v1", 0, false);
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
  expect(within(dialog.getByLabelText("承伤耐久模板")).getAllByRole("option")).toHaveLength(5);
  fireEvent.change(dialog.getByLabelText("比较技能"), { target: { value: "1" } });
  fireEvent.change(dialog.getByLabelText("承伤耐久模板"), { target: { value: "current-defense" } });
  fireEvent.click(dialog.getByRole("checkbox", { name: "沿用星陨／冻结" }));
  fireEvent.click(dialog.getByRole("button", { name: "未击倒", exact: true }));
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
  expect(dialog.getByRole("button", { name: "未击倒", exact: true })).toHaveAttribute("aria-pressed", "true");
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
  expect(screen.getByRole("checkbox", { name: "沿用星陨／冻结" })).not.toBeChecked();
  expect(initial.negativeStatuses.defender.freeze).toBe(0);
});
