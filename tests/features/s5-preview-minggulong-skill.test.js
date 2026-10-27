import { readFileSync } from "node:fs";
import { expect, test } from "vitest";
import { withWebPreview } from "../../src/features/s5-preview/with-web-preview.js";
import { getLegalSkillIds, getSkillChoices } from "../../src/domain/skill-loadout.js";
import { buildBalanceComparison } from "../../src/features/balance-comparison/model.js";
import { createInitialState } from "../../src/state/defaults.js";
import { migrateSharedConfiguration } from "../../src/state/calculator-session.js";
import { selectShareableInputs } from "../../src/state/share.js";
import { getSkillStatusEffect, resolveSkillStatusActivation } from "../../src/domain/skill-status-effects.js";

const original = JSON.parse(readFileSync("public/data/runtime.json", "utf8"));
const snapshot = withWebPreview(original);
const mingId = "spirit_preview_s5_minggulong";
const skillId = "skill_preview_s5_barren-devour";
const description = "初始等级+39，回合结束时等级-10，低于80级时受到伤害+40%。";

test("用户图示特性名与原文同时接到冥古龙卡片和原生特性", () => {
  const spirit = snapshot.spirits.find(entry => entry.id === mingId);
  expect(spirit).toMatchObject({ traitName: "恶龙的奢望", traitDescription: description });
  expect(snapshot.traits.find(trait => spirit.traitIds.includes(trait.id)))
    .toMatchObject({ name: "恶龙的奢望", description, previewIdentity: { mechanicKey: "minggulong" } });
  expect(original.spirits.some(entry => entry.id === mingId)).toBe(false);
});

test("荒芜之噬接入冥古龙家族图示配招，其余家族不继承", () => {
  const skill = snapshot.skills.find(entry => entry.id === skillId);
  expect(skill).toMatchObject({ name: "荒芜之噬", type: "龙", category: "physical", cost: 5, basePower: 130,
    description: "造成物伤，若击败敌方，自己等级+20。",
    iconUrl: "/assets/skills/skill_preview_s5_barren-devour.png" });
  expect(readFileSync(`public${skill.iconUrl}`).subarray(1, 4).toString("ascii")).toBe("PNG");
  expect(getLegalSkillIds(snapshot, mingId)).toContain(skillId);
  expect(getSkillChoices(snapshot, mingId).find(entry => entry.id === skillId).learnable).toBe(true);
  expect(snapshot.learnsets.find(entry => entry.spiritId === mingId))
    .toMatchObject({ defaultSkillIds: expect.arrayContaining([skillId]), acquisitions: { [skillId]: ["专属技能"] } });
  expect(getLegalSkillIds(snapshot, "spirit_preview_s5_little-ming-dragon")).toContain(skillId);
  for (const key of ["abu", "boss-abu", "super-abu", "gold-vein-dragon"]) {
    expect(getLegalSkillIds(snapshot, `spirit_preview_s5_${key}`)).not.toContain(skillId);
  }
  expect(withWebPreview(snapshot)).toBe(snapshot);
  expect(original.skills.some(entry => entry.name === skill.name)).toBe(false);
});

test("130龙系物伤沿当前99级计算，击败后+20不提前施加且分享恢复保持", () => {
  const state = createInitialState(snapshot);
  state.mode = "single";
  state.sides.attacker.spiritId = mingId;
  state.sides.attacker.skills.single = skillId;
  state.sides.defender.spiritId = snapshot.spirits.find(entry => entry.fullName === "迪莫").id;
  const before = structuredClone(state);
  const view = buildBalanceComparison({ snapshot, state }).afterView;
  const result = view.calculation.forward.selectedResult;
  expect(result.status).toBe("exact");
  expect(result.totalDamage).toBeGreaterThan(0);
  expect(result.formulaSteps.find(entry => entry.label === "等级系数与攻防比").input.level).toBe(99);
  expect(view.sides.attacker.combatLevel).toBe(99);
  const skill = snapshot.skills.find(entry => entry.id === skillId);
  expect(getSkillStatusEffect(skill)).toBeNull();
  expect(resolveSkillStatusActivation(skill, { defeatedEnemy: true })).toBeNull();
  const plain = { ...snapshot, skills: snapshot.skills.map(entry => entry.id === skillId ? { ...entry, description: "造成物伤。" } : entry) };
  expect(buildBalanceComparison({ snapshot: plain, state }).afterView.calculation.forward.selectedResult.totalDamage).toBe(result.totalDamage);
  const restored = migrateSharedConfiguration(selectShareableInputs(state), state.versions, snapshot);
  expect(restored.sides.attacker.skills.single).toBe(skillId);
  expect(buildBalanceComparison({ snapshot, state: restored }).afterView.calculation.forward.selectedResult.totalDamage).toBe(result.totalDamage);
  expect(state).toEqual(before);
});
