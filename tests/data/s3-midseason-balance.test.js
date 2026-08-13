import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";

const snapshot = JSON.parse(
  readFileSync("public/data/current.json", "utf8"),
);

function spirit(name) {
  return snapshot.spirits.find((candidate) => candidate.fullName === name);
}

function skill(name) {
  return snapshot.skills.find((candidate) => candidate.name === name);
}

function trait(name) {
  return snapshot.traits.find((candidate) => candidate.name === name);
}

describe("S3 季中 8 月 13 日平衡补丁", () => {
  test.each([
    ["炮米花", { hp: 115, magicalAttack: 100, magicalDefense: 110, physicalAttack: 99, physicalDefense: 110, total: 609 }],
    ["障眼魔", { hp: 134, magicalDefense: 110, physicalDefense: 96, total: 616 }],
    ["流明坎德拉", { hp: 121, magicalAttack: 104, physicalAttack: 96, total: 657 }],
    ["友爱星飞", { hp: 122, magicalAttack: 116, physicalAttack: 37, total: 558 }],
    ["饮雪狂兽", { magicalAttack: 24, physicalAttack: 85, total: 552 }],
  ])("更新 %s 的种族值", (name, expected) => {
    expect(spirit(name)?.raceStats).toMatchObject(expected);
  });

  test("更新孢子、撒娇和示弱", () => {
    expect(skill("孢子")).toMatchObject({
      cost: 3,
      description: "敌方获得3层寄生。",
    });
    expect(skill("撒娇")).toMatchObject({
      basePower: 30,
      description: "造成魔伤，3连击。自己获得萌化：威力永久+10。",
    });
    expect(skill("示弱")).toMatchObject({
      cost: 2,
      description: "自己获得萌化：速度永久+130。",
    });
  });

  test("更新光度换算与冰雪魂魄说明", () => {
    expect(trait("光度换算")?.description).toContain("光系技能威力永久+30");
    expect(trait("冰雪魂魄")?.description).toBe(
      "天气为暴风雪时，冰系技能威力+100%。",
    );
  });

  test("记录寄生机制和徽章试炼例外，不把 PVE 数值混入 PVP", () => {
    expect(snapshot.meta.balancePatch).toMatchObject({
      effectiveDate: "2026-08-13",
      label: "S3季中",
      parasitismEndTurnDrainPercent: 2,
      pvpSporeStacks: 3,
      trialSporeStacks: 6,
    });
  });
});
