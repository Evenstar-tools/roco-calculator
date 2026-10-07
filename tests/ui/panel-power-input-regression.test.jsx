import { fireEvent, render, screen } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import { PowerDraftInput } from "../../src/components/PowerDraftInput.jsx";
import { SingleSkillEditor } from "../../src/components/SingleSkillEditor.jsx";
import { FourSkillEditor } from "../../src/components/FourSkillEditor.jsx";
import { FormulaAudit } from "../../src/components/AdvancedOptions.jsx";

const bat = { id: "bat", name: "蝙蝠", type: "恶", category: "physical", basePower: 65, cost: 2 };
const other = { ...bat, id: "other", name: "啃咬" };
const result = { staticPower: 65, panelPower: 260, inputs: [] };

test("手动显示威力的过程把输入260放在显示行，不误标静态值65", () => {
  const { container } = render(<FormulaAudit result={{
    status: "exact", skillName: "蝙蝠", staticPower: 65, effectivePower: 260,
    hitCount: 1, totalDamage: 388,
    staticPowerPercentAdds: [0.5],
    staticPowerSourceAdds: { inheritedBurst: 10, mark: 5 },
    gainSources: { fixed: [{ kind: "skill", name: "技能固定", amount: 20 }] },
    formulaSteps: [
      { label: "攻击面板", input: "physicalAttack", after: 270 },
      { label: "手动显示威力", before: 260, after: 260 },
      { label: "等级系数与攻防比", input: { attackerStat: 270, calculationPower: 260, defenderDefense: 163, displayedPower: 260, coefficient: 37 / 41 }, after: 388 },
      { label: "减伤、连击与最终倍率", input: { hitCount: 1 }, after: 388 },
    ],
  }} />);
  const rows = container.querySelectorAll(".formula-audit__row");
  expect(rows[0]).not.toHaveTextContent("手动显示威力");
  expect(rows[0]).toHaveTextContent(/^静态威力规则值65=结果65$/);
  expect(rows[1]).toHaveTextContent("手动显示威力260");
  expect(rows[2]).toHaveTextContent("物攻270");
  expect(rows[2]).toHaveTextContent("威力260");
  expect(rows[2]).toHaveTextContent("物防163");
});

test.each(["static", "panel"])("只查看 %s 威力不产生手动覆盖", (mode) => {
  const onCommit = vi.fn();
  const onClear = vi.fn();
  render(<PowerDraftInput ariaLabel="威力" mode={mode} value={65} onCommit={onCommit} onClear={onClear} />);
  const input = screen.getByRole("spinbutton", { name: "威力" });
  fireEvent.focus(input);
  fireEvent.keyDown(input, { key: "Enter" });
  fireEvent.blur(input);
  expect(onCommit).not.toHaveBeenCalled();
  expect(onClear).not.toHaveBeenCalled();
});

test("合法输入、箭头和清空只提交一次，Escape 取消不产生覆盖", () => {
  const onCommit = vi.fn();
  const onClear = vi.fn();
  render(<PowerDraftInput ariaLabel="威力" value={65} onCommit={onCommit} onClear={onClear} />);
  const input = screen.getByRole("spinbutton", { name: "威力" });
  fireEvent.focus(input);
  fireEvent.change(input, { target: { value: "70" } });
  fireEvent.keyDown(input, { key: "Escape" });
  fireEvent.blur(input);
  expect(input).toHaveValue(65);
  expect(onCommit).not.toHaveBeenCalled();

  fireEvent.focus(input);
  fireEvent.change(input, { target: { value: "70" } });
  fireEvent.keyDown(input, { key: "Enter" });
  fireEvent.blur(input);
  expect(onCommit.mock.calls).toEqual([[70]]);
  fireEvent.focus(input);
  fireEvent.keyDown(input, { key: "ArrowUp" });
  fireEvent.blur(input);
  expect(onCommit.mock.calls).toEqual([[70], [66]]);
  fireEvent.focus(input);
  fireEvent.change(input, { target: { value: "" } });
  fireEvent.keyDown(input, { key: "Enter" });
  fireEvent.blur(input);
  expect(onClear).toHaveBeenCalledOnce();
});

test("编辑中切换口径丢弃旧草稿，不把静态输入提交为显示威力", () => {
  const onCommit = vi.fn();
  const view = render(<PowerDraftInput ariaLabel="威力" mode="static" value={65} onCommit={onCommit} />);
  const input = screen.getByRole("spinbutton", { name: "威力" });
  fireEvent.focus(input);
  fireEvent.change(input, { target: { value: "70" } });
  view.rerender(<PowerDraftInput ariaLabel="威力" mode="panel" value={260} onCommit={onCommit} />);
  fireEvent.blur(input);
  expect(onCommit).not.toHaveBeenCalled();
  expect(input).toHaveValue(260);
});

test("普通自动结果更新不冲掉正在编辑的草稿，非法值不能提交", () => {
  const onCommit = vi.fn();
  const view = render(<PowerDraftInput ariaLabel="威力" mode="panel" value={260} onCommit={onCommit} />);
  const input = screen.getByRole("spinbutton", { name: "威力" });
  fireEvent.focus(input);
  fireEvent.change(input, { target: { value: "270" } });
  view.rerender(<PowerDraftInput ariaLabel="威力" mode="panel" value={280} onCommit={onCommit} />);
  expect(input).toHaveValue(270);
  fireEvent.blur(input);
  expect(onCommit.mock.calls).toEqual([[270]]);
  fireEvent.focus(input);
  fireEvent.change(input, { target: { value: "1.5" } });
  fireEvent.blur(input);
  expect(onCommit).toHaveBeenCalledOnce();
  expect(screen.getByRole("alert")).toHaveTextContent("显示威力只能填整数");
  fireEvent.focus(input);
  fireEvent.keyDown(input, { key: "Enter" });
  fireEvent.blur(input);
  expect(onCommit).toHaveBeenCalledOnce();
});

test("恢复自动取消未提交草稿，不在失焦时重新生成手动覆盖", () => {
  const onCommit = vi.fn();
  const onClear = vi.fn();
  render(<PowerDraftInput ariaLabel="威力" value={65} isManual onCommit={onCommit} onClear={onClear} />);
  const input = screen.getByRole("spinbutton", { name: "威力" });
  fireEvent.focus(input);
  fireEvent.change(input, { target: { value: "70" } });
  fireEvent.click(screen.getByRole("button", { name: "恢复自动威力" }));
  fireEvent.blur(input);
  expect(onClear).toHaveBeenCalledOnce();
  expect(onCommit).not.toHaveBeenCalled();
});

function editor(kind, { skill = bat, mode = "static", currentResult = result, onCommit }) {
  if (kind === "single") {
    return <SingleSkillEditor selectedSkill={skill} skills={[bat, other]} result={currentResult}
      hitCount={1} powerOverride={null} powerDisplayMode={mode} onPowerOverrideChange={onCommit} />;
  }
  return <FourSkillEditor attackerName="龙息帕尔" defenderName="水灵" skills={[bat, other]}
    attackerSkills={[skill, null, null, null]} defenderSkills={[null, null, null, null]}
    attackerResults={[currentResult]} powerDisplayMode={mode} onSkillPowerChange={onCommit} />;
}

const powerLabel = (kind, mode = "static") => `${kind === "four" ? "攻击方技能1" : ""}${mode === "panel" ? "显示威力" : "静态威力"}`;

test.each(["single", "four"])("%s 真实编辑器查看威力不写覆盖，换技能丢弃旧草稿", (kind) => {
  const onCommit = vi.fn();
  const view = render(editor(kind, { onCommit }));
  let input = screen.getByRole("spinbutton", { name: powerLabel(kind) });
  fireEvent.focus(input);
  fireEvent.blur(input);
  expect(onCommit).not.toHaveBeenCalled();
  fireEvent.focus(input);
  fireEvent.change(input, { target: { value: "70" } });
  view.rerender(editor(kind, { skill: other, onCommit }));
  input = screen.getByRole("spinbutton", { name: powerLabel(kind) });
  expect(input).toHaveValue(65);
  fireEvent.blur(input);
  expect(onCommit).not.toHaveBeenCalled();
});

test.each(["single", "four"])("%s 真实编辑器切换口径不提交旧草稿，正常数值更新保留草稿", (kind) => {
  const onCommit = vi.fn();
  const view = render(editor(kind, { onCommit }));
  let input = screen.getByRole("spinbutton", { name: powerLabel(kind) });
  fireEvent.focus(input);
  fireEvent.change(input, { target: { value: "70" } });
  view.rerender(editor(kind, { mode: "panel", onCommit }));
  input = screen.getByRole("spinbutton", { name: powerLabel(kind, "panel") });
  expect(input).toHaveValue(260);
  fireEvent.blur(input);
  expect(onCommit).not.toHaveBeenCalled();
  fireEvent.focus(input);
  fireEvent.change(input, { target: { value: "270" } });
  view.rerender(editor(kind, { mode: "panel", currentResult: { ...result, panelPower: 280 }, onCommit }));
  expect(input).toHaveValue(270);
  fireEvent.blur(input);
  expect(onCommit).toHaveBeenCalledOnce();
  expect(onCommit.mock.calls[0].at(-1)).toEqual({ mode: "panel", value: 270 });
});
