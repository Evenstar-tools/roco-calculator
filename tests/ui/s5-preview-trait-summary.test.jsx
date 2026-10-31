import { useState } from "react";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import { S5PreviewTraitSummary } from "../../src/components/S5PreviewTraitSummary.jsx";
import { SingleSkillEditor } from "../../src/components/SingleSkillEditor.jsx";
import { FourSkillEditor } from "../../src/components/FourSkillEditor.jsx";
import { getTraitView } from "../../src/domain/calculator-view-model.js";
import { linkEnemyCostTraitControls } from "../../src/domain/trait-runtime.js";

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

test("烈冰钻条件只在持有者栏展示，自动模式隐藏手填耗能", () => {
  const attack = traitView("boss-ice-bruce");
  const defense = traitView("boss-ice-bruce", "defender");
  render(<SingleSkillEditor hitCount={1} selectedSkill={skill} skills={[skill]}
    attackerTrait={attack} defenderTrait={defense}
    traitContext={{ ...withValues(attack, { enemyTotalSkillCostAuto: false, enemyTotalSkillCost: 3 }),
      ...withValues(defense, { enemyTotalSkillCost: 16 }) }} />);
  expect(screen.getAllByRole("spinbutton", { name: "敌方技能总能耗" })).toHaveLength(1);
  expect(screen.getByRole("status", { name: "攻击特性当前效果" })).toHaveTextContent("威力 +30%");
  expect(screen.queryByRole("status", { name: "防御特性当前效果" })).toBeNull();
});

test("烈冰钻无选技能时仍说明自动耗能未知，手填后才展示已确认增益", () => {
  const trait = traitView("boss-ice-bruce");
  const { rerender } = render(<S5PreviewTraitSummary trait={trait} owner
    context={withValues(trait, { enemyTotalSkillCost: null })} />);
  const summary = screen.getByRole("status", { name: "攻击特性当前效果" });
  expect(summary).toHaveAttribute("data-status", "pending");
  expect(summary).toHaveTextContent("对手有技能能耗待确认");
  expect(summary).not.toHaveTextContent("威力 +");
  rerender(<S5PreviewTraitSummary trait={trait} owner context={withValues(trait, {
    enemyTotalSkillCostAuto: false, enemyTotalSkillCost: 16,
  })} />);
  expect(summary).toHaveAttribute("data-status", "ready");
  expect(summary).toHaveTextContent("威力 +160%");
  expect(summary).toHaveTextContent("速度 +75");
});

test("双方烈冰钻自动模式隐藏手填框，摘要仍分别显示已知总耗8与16", () => {
  const attack = traitView("boss-ice-bruce");
  const defense = traitView("boss-ice-bruce", "defender");
  const forward = linkEnemyCostTraitControls(linkEnemyCostTraitControls({}, attack.inputs, 8), defense.inputs, 16);
  const reverse = linkEnemyCostTraitControls(linkEnemyCostTraitControls({}, attack.inputs, 16), defense.inputs, 8);
  const { container } = render(<FourSkillEditor attackerName="圣冠甲" defenderName="圣冠乙"
    attackerSkills={[skill]} defenderSkills={[skill]} skills={[skill]}
    attackerTrait={attack} attackerDefenseTrait={defense} attackerTraitContext={forward}
    defenderTrait={attack} defenderDefenseTrait={defense} defenderTraitContext={reverse} />);
  const own = within(container.querySelector(".four-skill-side--attacker")).getByRole("status", { name: "攻击特性当前效果" });
  const other = within(container.querySelector(".four-skill-side--defender")).getByRole("status", { name: "攻击特性当前效果" });
  expect(own).toHaveAttribute("data-status", "ready");
  expect(own).toHaveTextContent("总能耗 8；威力 +80%");
  expect(own).not.toHaveTextContent("速度 +75");
  expect(other).toHaveAttribute("data-status", "ready");
  expect(other).toHaveTextContent("总能耗 16；威力 +160%");
  expect(other).toHaveTextContent("速度 +75");
  expect(screen.queryByRole("spinbutton", { name: "敌方技能总能耗" })).not.toBeInTheDocument();
  expect(screen.queryByText(/能耗待确认/u)).not.toBeInTheDocument();
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


test.each([["gold-vein-dragon", "过充电", "已聚能至少1次"],
  ["underground-silver-dragon", "碎银", "此前累计消耗能量"]])("%s沿用特性计数，不再展示相同技能输入", (key, name, inputLabel) => {
  const attack = traitView(key);
  const selected = { ...skill, name };
  render(<SingleSkillEditor hitCount={1} selectedSkill={selected} skills={[selected]}
    attackerTrait={attack} attackerTraits={[attack.previewTraitEntity]} />);
  expect(screen.queryByRole("spinbutton", { name: inputLabel })).toBeNull();
  expect(screen.queryByRole("checkbox", { name: inputLabel })).toBeNull();
  expect(screen.getByRole("spinbutton", { name: key === "gold-vein-dragon" ? "聚能次数" : "累计消耗能量" })).toBeInTheDocument();
});
