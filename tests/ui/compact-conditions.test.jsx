import { useState } from "react";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import snapshot from "../../data/snapshots/current.json";
import { CompactConditionDialog, CompactConditionTrigger } from "../../src/components/CompactConditions.jsx";
import { CompactFourSkillEditor } from "../../src/components/CompactSkillEditor.jsx";
import { getSkillSlotConditions } from "../../src/components/skill-condition-inputs.js";
import { getSkillEffectInputs } from "../../src/domain/skill-effects.js";
import { getSkillStatusEffectInputs } from "../../src/domain/skill-status-effects.js";
import { getNegativeStatusInputs } from "../../src/domain/negative-status-rules.js";
import { App } from "../../src/App.jsx";
import { createInitialState } from "../../src/state/defaults.js";
import { FIRST_RUN_GUIDE_STORAGE_KEY } from "../../src/state/first-run-guide.js";
import { createCalculatorSessionStore } from "../../src/runtime/workspace-store.js";

const prefix = "攻击方技能1";
const skillNamed = (name) => snapshot.skills.find((skill) => skill.name === name);
const inputKey = (input) => input.contextKey ?? input.key ?? input.id;
const inputId = (input) => input.id ?? input.key;
const conditions = (skill, context = {}) => getSkillSlotConditions({
  selected: { ...skill, slotContext: context }, selectedSkills: [skill], negativeStatusEnabled: true,
});

test.each(["single", "four"].flatMap((mode) => ["attacker", "defender"].flatMap((side) =>
  ["compact", "detailed"].map((viewMode) => [mode, side, viewMode]))))(
  "下注暗分支 %s %s %s 从满血降为49并立即重算，仅更改自身生命",
  async (mode, side, viewMode) => {
    localStorage.clear();
    localStorage.setItem(FIRST_RUN_GUIDE_STORAGE_KEY, "1");
    const state = createInitialState(snapshot);
    const bet = skillNamed("下注");
    const owner = snapshot.spirits.find((spirit) => spirit.fullName === "恶魔叮");
    state.mode = mode;
    for (const key of ["attacker", "defender"]) {
      state.sides[key].spiritId = owner.id;
      state.sides[key].skills = { single: bet.id, four: [bet.id, null, null, null] };
    }
    const direction = side === "attacker" ? "forward" : "reverse";
    render(<App initialSnapshot={snapshot} initialWorkspace={{ state, activeDirection: direction, viewMode }} />);
    const label = side === "attacker" ? "攻击方" : "防御方";
    const damageBefore = screen.getByTestId("primary-damage").textContent;
    if (viewMode === "compact") {
      fireEvent.click(screen.getByRole("button", { name: mode === "single" ? `${label}当前技能条件` : `${label}技能1条件`, exact: true }));
      fireEvent.change(within(screen.getByRole("dialog")).getByRole("combobox", { name: "选择效果" }), { target: { value: "lowHp" } });
      expect(within(screen.getByRole("dialog")).getByRole("spinbutton", { name: "自身生命百分比" })).toHaveValue(49);
      fireEvent.click(screen.getByRole("button", { name: "关闭条件" }));
      fireEvent.click(screen.getByRole("button", { name: "具体版" }));
    } else if (mode === "single") {
      fireEvent.click(screen.getByRole("button", { name: "低血加威", exact: true }));
    } else {
      fireEvent.change(screen.getByRole("combobox", { name: `${label}技能1选择效果` }), { target: { value: "lowHp" } });
    }
    expect(screen.getByRole("spinbutton", { name: mode === "single" ? "攻击方生命百分比" : `${label}生命百分比`, exact: true })).toHaveValue(49);
    expect(screen.getByTestId("primary-damage").textContent).not.toBe(damageBefore);
    const saved = createCalculatorSessionStore().loadSession();
    const healthDirection = side === "attacker" ? "reverse" : "forward";
    const percentInput = screen.getByRole("spinbutton", { name: mode === "single" ? "攻击方生命百分比" : `${label}生命百分比`, exact: true });
    fireEvent.click(within(percentInput.closest(".health-input")).getByRole("button", { name: "按当前值输入" }));
    const hpInput = within(percentInput.closest(".health-input")).getByRole("spinbutton");
    expect(hpInput).toHaveValue(Math.round(Number(hpInput.max) * 0.49));
    expect(saved.present.directions[healthDirection].currentHp).toBe(Number(hpInput.value));
    expect(saved.present.directions[direction]).toEqual(expect.objectContaining({ currentHp: null, overrides: state.directions[direction].overrides }));
    expect(saved.present.directions[healthDirection].context.currentHpPercent).toBe(49);
    expect(saved.past).toHaveLength(1);
    expect(saved.past[0].state).toEqual(state);
    const otherLabel = side === "attacker" ? "防御方" : "攻击方";
    if (mode === "four") expect(screen.getByRole("spinbutton", { name: `${otherLabel}生命百分比`, exact: true })).toHaveValue(100);
    await Promise.resolve();
    if (mode === "single") fireEvent.click(screen.getByRole("button", { name: "固定加威", exact: true }));
    else fireEvent.change(screen.getByRole("combobox", { name: `${label}技能1选择效果` }), { target: { value: "fixed" } });
    expect(hpInput).toHaveValue(Math.round(Number(hpInput.max) * 0.49));
    fireEvent.click(screen.getByRole("button", { name: /撤回上一步/ }));
    expect(hpInput).toHaveValue(Math.round(Number(hpInput.max) * 0.49));
    fireEvent.click(screen.getByRole("button", { name: /撤回上一步/ }));
    expect(hpInput).toHaveValue(Number(hpInput.max));
  },
);

function Harness({ skill, onChange, onApply, result, initiallyOpen = true, action = true }) {
  const [context, setContext] = useState({});
  const [open, setOpen] = useState(initiallyOpen);
  const model = {
    key: skill.id, title: `${skill.name}条件`, triggerLabel: `${prefix}条件`,
    inputs: conditions(skill, context).dynamicInputs, context, result,
    description: skill.description || "无额外效果。",
    action: action ? { label: "应用变化", hint: "仅点击后应用", onApply } : undefined,
    onChange: (key, value) => {
      onChange?.(key, value);
      setContext((current) => ({ ...current, [key]: value }));
    },
  };
  return <>
    <CompactConditionTrigger model={model} onOpen={() => setOpen(true)} expanded={open} />
    {open ? <CompactConditionDialog model={model} onClose={() => setOpen(false)} /> : null}
  </>;
}

function controlFor(input) {
  if (input.burstSource) return screen.getByRole("checkbox", { name: `${prefix}条件${input.label}（迸发来源）` });
  return screen.getByRole(input.type === "choice" ? "combobox" : input.type === "boolean" ? "checkbox" : "spinbutton", { name: input.label, exact: true });
}

// The source of expected controls is the rule catalog, independent of the compact
// adapter. Every live skill and every declared choice option is exercised.
test.each(snapshot.skills.map((skill) => [skill.name, skill]))("真实技能 %s 的规则控件均可打开并交互", (_name, skill) => {
  const expected = [...getSkillEffectInputs(skill), ...getSkillStatusEffectInputs(skill), ...getNegativeStatusInputs(skill)];
  const { dynamicInputs } = conditions(skill);
  for (const ruleInput of expected) {
    expect(dynamicInputs, `${skill.name}遗漏${ruleInput.label}`).toContainEqual(expect.objectContaining({
      contextKey: inputKey(ruleInput), type: ruleInput.type,
    }));
  }
  const change = vi.fn(), apply = vi.fn();
  render(<Harness skill={skill} onChange={change} onApply={apply} initiallyOpen={false} />);
  fireEvent.click(screen.getByRole("button", { name: `${prefix}条件` }));
  expect(screen.getByRole("dialog", { name: `${skill.name}条件` })).toBeVisible();
  expect(apply).not.toHaveBeenCalled();

  for (const input of dynamicInputs) {
    const dependency = input.visibleWhen ?? input.when;
    if (dependency) {
      const controller = dynamicInputs.find((candidate) => inputId(candidate) === dependency.id || inputKey(candidate) === dependency.contextKey);
      expect(controller, `${skill.name}的${input.label}缺少可操作的分支入口`).toBeDefined();
      fireEvent.change(controlFor(controller), { target: { value: dependency.equals } });
    }
    if (input.burstSource) {
      const summary = screen.getByLabelText(`${prefix}条件选择迸发来源`);
      if (!summary.closest("details").open) fireEvent.click(summary);
      expect(summary.closest("details")).toHaveAttribute("open");
    }
    const control = controlFor(input);
    expect(control).toBeVisible();
    if (input.type === "choice") {
      for (const option of input.options) {
        fireEvent.change(control, { target: { value: option.value } });
        expect(control).toHaveValue(String(option.value));
        expect(change).toHaveBeenLastCalledWith(inputId(input), String(option.value));
      }
    } else if (input.type === "boolean") {
      const original = control.checked;
      fireEvent.click(control);
      expect(change).toHaveBeenLastCalledWith(inputId(input), !original);
      expect(control.checked).toBe(!original);
      fireEvent.click(control);
      expect(change).toHaveBeenLastCalledWith(inputId(input), original);
      expect(control.checked).toBe(original);
    } else {
      const current = Number(control.value);
      const next = current < (input.max ?? Infinity) ? current + 1 : current - 1;
      fireEvent.change(control, { target: { value: String(next) } });
      expect(change).toHaveBeenLastCalledWith(inputId(input), next);
      expect(control).toHaveValue(next);
    }
    expect(apply).not.toHaveBeenCalled();
  }
});

test.each([
  ["驱赶", "steady", "counter", "触发应对"],
  ["友谊满溢", "growth", "counter", "触发应对"],
  ["下注", "fixed", "lowHp", "自身生命百分比"],
])("%s 切换分支后才显示相关条件，切回隐藏且不应用", (name, initial, branch, label) => {
  const apply = vi.fn();
  render(<Harness skill={skillNamed(name)} onApply={apply} />);
  const choice = screen.getByRole("combobox", { name: "选择效果" });
  expect(choice).toHaveValue(initial);
  expect(screen.queryByLabelText(label, { exact: true })).not.toBeInTheDocument();
  fireEvent.change(choice, { target: { value: branch } });
  expect(screen.getByLabelText(label, { exact: true })).toBeVisible();
  fireEvent.change(choice, { target: { value: initial } });
  expect(screen.queryByLabelText(label, { exact: true })).not.toBeInTheDocument();
  expect(apply).not.toHaveBeenCalled();
});

test("撒花的生命与应对条件互斥，轮班仅加威分支显示位置", () => {
  render(<Harness skill={skillNamed("撒花")} />);
  const flowerMode = screen.getByRole("combobox", { name: "选择效果" });
  expect(screen.getByRole("spinbutton", { name: "自身生命百分比" })).toBeVisible();
  expect(screen.queryByRole("checkbox", { name: "触发应对" })).not.toBeInTheDocument();
  fireEvent.change(flowerMode, { target: { value: "heal" } });
  expect(screen.queryByRole("spinbutton", { name: "自身生命百分比" })).not.toBeInTheDocument();
  expect(screen.getByRole("checkbox", { name: "触发应对" })).toBeVisible();
  cleanup();
  render(<Harness skill={skillNamed("轮班")} />);
  expect(screen.getByRole("spinbutton", { name: "技能位置" })).toBeVisible();
  fireEvent.change(screen.getByRole("combobox", { name: "选择效果" }), { target: { value: "drive" } });
  expect(screen.queryByRole("spinbutton", { name: "技能位置" })).not.toBeInTheDocument();
});

test.each([["吹火", "此前使用次数"], ["减压阀", "已使用次数"]])("%s 在条件层内可减、加、重置次数，并保留边界", (name, label) => {
  const apply = vi.fn();
  render(<Harness skill={skillNamed(name)} onApply={apply} />);
  const count = screen.getByRole("spinbutton", { name: label });
  const less = screen.getByRole("button", { name: `${label}减少` });
  const more = screen.getByRole("button", { name: `${label}增加` });
  const reset = screen.getByRole("button", { name: `${label}重置` });
  expect(count).toHaveValue(0);
  expect(less).toBeDisabled();
  fireEvent.click(more);
  expect(count).toHaveValue(1);
  fireEvent.click(less);
  expect(count).toHaveValue(0);
  fireEvent.change(count, { target: { value: "20" } });
  expect(more).toBeDisabled();
  fireEvent.click(less);
  expect(count).toHaveValue(19);
  fireEvent.click(reset);
  expect(count).toHaveValue(0);
  expect(reset).toBeDisabled();
  expect(apply).not.toHaveBeenCalled();
});

test("水泡盾仅打开与勾选条件不会应用，层内动作才应用一次", () => {
  const skill = skillNamed("水泡盾"), apply = vi.fn();
  render(<Harness skill={skill} onApply={apply} initiallyOpen={false} />);
  fireEvent.click(screen.getByRole("button", { name: `${prefix}条件` }));
  fireEvent.click(screen.getByRole("checkbox", { name: "防御应对成功" }));
  expect(apply).not.toHaveBeenCalled();
  const dialog = screen.getByRole("dialog", { name: `${skill.name}条件` });
  fireEvent.click(within(dialog).getByRole("button", { name: "应用变化" }));
  expect(apply).toHaveBeenCalledTimes(1);
});

test.each([["水泡盾", true, "条件"], ["力量增效", true, "使用"], ["蹦跶", false, "详情"], ["甜心续航", false, "详情"], ["火苗", false, "详情"]])(
  "%s 列表入口简短且不触发独立应用行", (name, hasAction, text) => {
    const selected = skillNamed(name), apply = vi.fn(), onOpen = vi.fn();
    const model = {
      key: selected.id, title: `${name}条件`, triggerLabel: `${prefix}条件`, triggerText: text,
      inputs: conditions(selected).dynamicInputs, context: {}, description: selected.description,
      action: hasAction ? { label: "应用变化", onApply: apply } : undefined,
    };
    render(<CompactFourSkillEditor attackerName="稻草守护者" defenderName="目标"
      attackerSkills={[selected]} defenderSkills={[]} attackerSkillChoices={[selected]} defenderSkillChoices={[]}
      attackerResults={[{ status: "exact", totalDamage: 10, hpPercent: 20 }]} defenderResults={[]}
      conditionModels={{ attacker: [model] }} onOpenConditions={onOpen}
      canSkillActivate={() => hasAction} onSkillActivate={apply} onSkillFocus={vi.fn()} onSkillSelect={vi.fn()} />);
    const row = screen.getByRole("group", { name: "攻击方技能1，当前选中" });
    const trigger = within(row).getByRole("button", { name: `${prefix}条件` });
    expect(trigger).toHaveTextContent(text);
    fireEvent.click(trigger);
    expect(onOpen).toHaveBeenCalledTimes(1);
    expect(apply).not.toHaveBeenCalled();
    expect(within(row).queryByText(selected.description)).not.toBeInTheDocument();
    expect(within(row).queryByRole("button", { name: /应用变化|使用技能/ })).not.toBeInTheDocument();
    expect(within(row).getByRole("status")).toHaveTextContent("10");
  },
);
