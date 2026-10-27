import { useState } from "react";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import { S5PreviewTraitSummary } from "../../src/components/S5PreviewTraitSummary.jsx";
import { SingleSkillEditor } from "../../src/components/SingleSkillEditor.jsx";
import { FourSkillEditor } from "../../src/components/FourSkillEditor.jsx";
import { getTraitView } from "../../src/domain/calculator-view-model.js";

const skill = { id: "hit", name: "测试技能", type: "普", category: "physical", basePower: 60, cost: 1 };

function traitView(mechanicKey, role = "attacker") {
  const trait = {
    id: `s5-${mechanicKey}`, name: "前瞻特性", description: "完整特性说明保留在原有提示中。",
    previewIdentity: { catalogId: "s5-ui-fixture", mechanicKey },
  };
  const snapshot = { traits: [trait] };
  const view = getTraitView(snapshot, { traitIds: [trait.id] }, role);
  expect(view.previewTraitEntity).toBe(trait);
  return view;
}

function withValues(trait, values) {
  return Object.fromEntries(trait.inputs
    .filter(input => Object.hasOwn(values, input.contextKey))
    .map(input => [input.id, values[input.contextKey]]));
}

test("正式特性不额外显示S5摘要", () => {
  const { container } = render(<S5PreviewTraitSummary trait={{ previewTraitEntity: { name: "正式特性" } }} />);
  expect(container).toBeEmptyDOMElement();
});

test("等级未核验显示具体原因，改为可支持等级后摘要同步且原因消失", () => {
  const trait = traitView("minggulong");
  const { rerender } = render(<S5PreviewTraitSummary trait={trait} />);
  const summary = screen.getByRole("status", { name: "攻击特性当前效果" });
  expect(summary).toHaveAttribute("data-status", "pending");
  expect(summary).toHaveTextContent("99");
  expect(summary).toHaveTextContent("不能套用固定60级核心");
  rerender(<S5PreviewTraitSummary trait={trait} context={withValues(trait, {
    attackerTraitS5CurrentLevel: 60,
  })} />);
  expect(summary).toHaveAttribute("data-status", "ready");
  expect(summary).toHaveTextContent("60");
  expect(summary).toHaveTextContent("承伤 +40%");
  expect(summary).not.toHaveTextContent("不能套用固定60级核心");
});

test("单技能复用现有控件，攻防摘要分别读取各自当前生效值", () => {
  const attack = traitView("gold-vein-dragon");
  const defense = traitView("underground-silver-dragon", "defender");
  function Editor() {
    const [context, setContext] = useState({});
    return <SingleSkillEditor hitCount={1} selectedSkill={skill} skills={[skill]}
      attackerTrait={attack} defenderTrait={defense} traitContext={context}
      onHitCountChange={vi.fn()} onSkillSelect={vi.fn()}
      onTraitContextChange={(key, value) => setContext(previous => ({ ...previous, [key]: value }))} />;
  }
  render(<Editor />);
  const attackSummary = screen.getByRole("status", { name: "攻击特性当前效果" });
  const defenseSummary = screen.getByRole("status", { name: "防御特性当前效果" });
  expect(attackSummary).toHaveTextContent("双攻增益未生效");
  expect(defenseSummary).toHaveTextContent("魔攻 +0%");
  fireEvent.click(screen.getByRole("checkbox", { name: "聚能后双攻增益当前生效" }));
  fireEvent.change(screen.getByRole("spinbutton", { name: "当前已生效双攻增益" }), { target: { value: "75" } });
  expect(attackSummary).toHaveTextContent("当前已生效双攻 +75%");
  expect(defenseSummary).toHaveTextContent("魔攻 +0%");
  fireEvent.change(screen.getByRole("spinbutton", { name: "当前累计已生效魔攻增益" }), { target: { value: "90" } });
  expect(defenseSummary).toHaveTextContent("魔攻 +90%");
  expect(attackSummary).toHaveTextContent("双攻 +75%");
  fireEvent.click(screen.getByRole("checkbox", { name: "聚能后双攻增益当前生效" }));
  expect(attackSummary).toHaveTextContent("双攻增益未生效");
  expect(defenseSummary).toHaveTextContent("魔攻 +90%");
});

test("四技能两个方向的防守摘要读取对方owner，角色参数不串", () => {
  const goldAttack = traitView("gold-vein-dragon");
  const goldDefense = traitView("gold-vein-dragon", "defender");
  const silverAttack = traitView("underground-silver-dragon");
  const silverDefense = traitView("underground-silver-dragon", "defender");
  const forward = {
    ...withValues(goldAttack, { attackerTraitS5AttackBuffActive: true, attackerTraitS5CurrentAttackBonus: 25 }),
    ...withValues(silverDefense, { defenderTraitS5CurrentMagicalAttackBonus: 75 }),
  };
  const reverse = {
    ...withValues(silverAttack, { attackerTraitS5CurrentMagicalAttackBonus: 75 }),
    ...withValues(goldDefense, { defenderTraitS5AttackBuffActive: true, defenderTraitS5CurrentAttackBonus: 25 }),
  };
  const { container } = render(<FourSkillEditor attackerName="金脉" defenderName="银龙"
    attackerSkills={[skill]} defenderSkills={[skill]} skills={[skill]}
    attackerTrait={goldAttack} attackerDefenseTrait={silverDefense} attackerTraitContext={forward}
    defenderTrait={silverAttack} defenderDefenseTrait={goldDefense} defenderTraitContext={reverse} />);
  const attackSide = within(container.querySelector(".four-skill-side--attacker"));
  const defenseSide = within(container.querySelector(".four-skill-side--defender"));
  expect(attackSide.getByRole("status", { name: "攻击特性当前效果" })).toHaveTextContent("双攻 +25%");
  expect(attackSide.getByRole("status", { name: "防御特性当前效果" })).toHaveTextContent("魔攻 +75%");
  expect(defenseSide.getByRole("status", { name: "攻击特性当前效果" })).toHaveTextContent("魔攻 +75%");
  expect(defenseSide.getByRole("status", { name: "防御特性当前效果" })).toHaveTextContent("双攻 +25%");
});

test("没有控件的候选仍显示摘要，未知机制原因不重复堆叠", () => {
  const trait = traitView("unmapped-mechanic");
  const defense = traitView("unmapped-mechanic", "defender");
  expect(trait.inputs).toHaveLength(0);
  render(<FourSkillEditor attackerName="候选" defenderName="对手"
    attackerSkills={[]} defenderSkills={[]} skills={[]}
    attackerTrait={trait} attackerDefenseTrait={defense} />);
  for (const role of ["攻击", "防御"]) {
    const summary = screen.getByRole("status", { name: `${role}特性当前效果` });
    expect(summary).toHaveAttribute("data-status", "pending");
    expect(summary).toHaveTextContent(/^该S5特性的规则尚未接入$/);
  }
});
