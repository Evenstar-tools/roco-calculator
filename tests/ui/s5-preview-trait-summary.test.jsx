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

test("等级调整后攻击摘要只显示等级，承伤摘要保留在防守方向", () => {
  const trait = traitView("minggulong");
  const { rerender } = render(<S5PreviewTraitSummary trait={trait} />);
  const summary = screen.getByRole("status", { name: "攻击特性当前效果" });
  expect(summary).toHaveAttribute("data-status", "ready");
  expect(summary).toHaveTextContent("99");
  expect(summary).not.toHaveTextContent("等级系数");
  expect(summary).not.toHaveTextContent("承伤 +40%");
  rerender(<S5PreviewTraitSummary trait={trait} context={withValues(trait, {
    attackerTraitS5BattleLevel: 60,
  })} />);
  expect(summary).toHaveAttribute("data-status", "ready");
  expect(summary).toHaveTextContent("60");
  expect(summary).not.toHaveTextContent("承伤 +40%");
  expect(summary).not.toHaveTextContent("不能套用固定60级核心");
  rerender(<S5PreviewTraitSummary trait={trait} context={withValues(trait, {
    attackerTraitS5BattleLevel: 40,
  })} />);
  expect(summary).toHaveTextContent("当前等级 40");
  expect(summary).not.toHaveTextContent("承伤 +40%");
});

test("阿布按方向显示等级与承伤，不给所有技能标通用增伤", () => {
  const trait = traitView("abu");
  const { rerender } = render(<S5PreviewTraitSummary trait={trait} context={withValues(trait, {
    attackerTraitS5BattleLevel: 79,
  })} />);
  const summary = screen.getByRole("status", { name: "攻击特性当前效果" });
  expect(summary).toHaveTextContent("当前等级 79");
  expect(summary).not.toHaveTextContent("等级系数");
  expect(summary).not.toHaveTextContent("承伤 +40%");
  const defense = traitView("abu", "defender");
  rerender(<S5PreviewTraitSummary trait={defense} role="defender" context={withValues(defense, {
    defenderTraitS5BattleLevel: 79,
  })} />);
  expect(screen.getByRole("status", { name: "防御特性当前效果" })).not.toHaveTextContent("等级系数");
  expect(screen.getByRole("status", { name: "防御特性当前效果" })).toHaveTextContent("承伤 +40%");
});

test("单技能攻击类特性不出现在对方防御卡，切换方向才编辑该方增益", () => {
  const attack = traitView("gold-vein-dragon");
  const defense = traitView("underground-silver-dragon", "defender");
  function Editor({ reverse = false }) {
    const [context, setContext] = useState({});
    return <SingleSkillEditor hitCount={1} selectedSkill={skill} skills={[skill]}
      attackerTrait={reverse ? traitView("underground-silver-dragon") : attack}
      defenderTrait={reverse ? traitView("gold-vein-dragon", "defender") : defense} traitContext={context}
      onHitCountChange={vi.fn()} onSkillSelect={vi.fn()}
      onTraitContextChange={(key, value) => setContext(previous => ({ ...previous, [key]: value }))} />;
  }
  const { rerender } = render(<Editor />);
  const attackSummary = screen.getByRole("status", { name: "攻击特性当前效果" });
  expect(screen.queryByRole("status", { name: "防御特性当前效果" })).not.toBeInTheDocument();
  expect(screen.queryByRole("spinbutton", { name: "累计消耗能量" })).not.toBeInTheDocument();
  fireEvent.change(screen.getByRole("spinbutton", { name: "聚能次数" }), { target: { value: "2" } });
  expect(attackSummary).toHaveTextContent("聚能 2 次 · 物攻能力等级 +10");
  rerender(<Editor reverse />);
  expect(screen.queryByRole("spinbutton", { name: "聚能次数" })).not.toBeInTheDocument();
  fireEvent.change(screen.getByRole("spinbutton", { name: "累计消耗能量" }), { target: { value: "9" } });
  expect(screen.getByRole("status", { name: "攻击特性当前效果" })).toHaveTextContent("魔攻 +90%");
  expect(screen.queryByRole("status", { name: "防御特性当前效果" })).not.toBeInTheDocument();
});

test("四技能纯攻击增益仅在精灵自身列，两个方向不重复显示对方魔攻或聚能", () => {
  const goldAttack = traitView("gold-vein-dragon");
  const goldDefense = traitView("gold-vein-dragon", "defender");
  const silverAttack = traitView("underground-silver-dragon");
  const silverDefense = traitView("underground-silver-dragon", "defender");
  const forward = {
    ...withValues(goldAttack, { attackerTraitS5ChargeCount: 2 }),
    ...withValues(silverDefense, { defenderTraitS5EnergySpent: 8 }),
  };
  const reverse = {
    ...withValues(silverAttack, { attackerTraitS5EnergySpent: 8 }),
    ...withValues(goldDefense, { defenderTraitS5ChargeCount: 2 }),
  };
  const { container } = render(<FourSkillEditor attackerName="金脉" defenderName="银龙"
    attackerSkills={[skill]} defenderSkills={[skill]} skills={[skill]}
    attackerTrait={goldAttack} attackerDefenseTrait={silverDefense} attackerTraitContext={forward}
    defenderTrait={silverAttack} defenderDefenseTrait={goldDefense} defenderTraitContext={reverse} />);
  const attackSide = within(container.querySelector(".four-skill-side--attacker"));
  const defenseSide = within(container.querySelector(".four-skill-side--defender"));
  expect(attackSide.getByRole("status", { name: "攻击特性当前效果" })).toHaveTextContent("物攻能力等级 +10");
  expect(defenseSide.getByRole("status", { name: "攻击特性当前效果" })).toHaveTextContent("魔攻 +80%");
  expect(attackSide.queryByRole("spinbutton", { name: "累计消耗能量" })).not.toBeInTheDocument();
  expect(defenseSide.queryByRole("spinbutton", { name: "聚能次数" })).not.toBeInTheDocument();
  expect(screen.queryByRole("status", { name: "防御特性当前效果" })).not.toBeInTheDocument();
  expect(screen.getAllByRole("spinbutton", { name: "累计消耗能量" })).toHaveLength(1);
  expect(screen.getAllByRole("spinbutton", { name: "聚能次数" })).toHaveLength(1);
});

test("冰钻首领防御栏只保留速度条件和速度摘要，威力仍在自身攻击栏", () => {
  const attack = traitView("boss-ice-bruce");
  const defense = traitView("boss-ice-bruce", "defender");
  render(<SingleSkillEditor hitCount={1} selectedSkill={skill} skills={[skill]}
    attackerTrait={attack} defenderTrait={defense}
    traitContext={{ ...withValues(attack, { attackerTraitS5CurrentPowerBonus: 30 }),
      ...withValues(defense, { defenderTraitS5CurrentPowerBonus: 80, defenderTraitS5OpponentTotalCost: 20 }) }} />);
  expect(screen.getAllByRole("spinbutton", { name: "当前累计已生效威力增益（手动）" })).toHaveLength(1);
  expect(screen.getByRole("status", { name: "攻击特性当前效果" })).toHaveTextContent("威力 +30%");
  expect(screen.getByRole("status", { name: "防御特性当前效果" })).toHaveTextContent(/^速度 \+50$/);
});

test.each(["egg-wrap", "minggulong", "abu"])("%s保留真正影响防御的输入与摘要", key => {
  render(<SingleSkillEditor hitCount={1} selectedSkill={skill} skills={[skill]}
    defenderTrait={traitView(key, "defender")} />);
  expect(screen.getByRole("status", { name: "防御特性当前效果" })).toBeInTheDocument();
  expect(key === "egg-wrap" ? screen.getByRole("checkbox", { name: "特性触发" })
    : screen.getByRole("spinbutton", { name: "当前等级" })).toBeInTheDocument();
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
