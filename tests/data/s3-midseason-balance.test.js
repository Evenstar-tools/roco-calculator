import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";

const snapshot = JSON.parse(readFileSync("public/data/current.json", "utf8"));

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
  test("发布 594 精灵的季中离线快照", () => {
    expect(snapshot.meta).toMatchObject({
      id: "s3-2026-08-13-midseason",
      rulesVersion: "2026-08-13",
      seasonId: "S3季中",
      snapshotVersion: 2,
    });
    expect(snapshot.spirits).toHaveLength(594);
    expect(snapshot.learnsets).toHaveLength(594);
  });

  test.each([
    [
      "宝藏小狐",
      "spirit_5f3eaa6f91c32c93",
      {
        hp: 77,
        speed: 80,
        physicalAttack: 81,
        magicalAttack: 33,
        physicalDefense: 99,
        magicalDefense: 73,
        total: 443,
      },
    ],
    [
      "宝藏沙狐",
      "spirit_ad25e8d39ea8f904",
      {
        hp: 96,
        speed: 100,
        physicalAttack: 101,
        magicalAttack: 41,
        physicalDefense: 124,
        magicalDefense: 91,
        total: 553,
      },
    ],
  ])("补齐 %s 的种族值、图片和学习集", (name, id, raceStats) => {
    const entry = spirit(name);
    expect(entry).toMatchObject({
      id,
      fullName: name,
      types: ["普通"],
      raceStats,
      traitIds: ["trait_ba4ac1cdf7e7fb85"],
    });
    expect(entry.asset.sourceUrl).toMatch(/^https:\/\//u);

    const learnset = snapshot.learnsets.find(
      (candidate) => candidate.spiritId === id,
    );
    expect(learnset.skillIds.length).toBeGreaterThan(10);
    expect(learnset.skillIds.every((skillId) =>
      snapshot.skills.some((candidate) => candidate.id === skillId)
    )).toBe(true);
  });

  test("补齐博物特性并记录可核验来源", () => {
    expect(trait("博物")).toMatchObject({
      id: "trait_ba4ac1cdf7e7fb85",
      description: "在场时，识破精灵的变化效果，解除其伪装。",
    });
  });

  test.each([
    ["炮米花", { hp: 115, magicalAttack: 100, magicalDefense: 110, physicalAttack: 99, physicalDefense: 110, total: 609 }],
    ["障眼魔", { hp: 134, magicalDefense: 110, physicalDefense: 96, total: 616 }],
    ["流明坎德拉", { hp: 121, magicalAttack: 104, physicalAttack: 96, total: 657 }],
    ["友爱星飞", { hp: 122, magicalAttack: 116, physicalAttack: 37, total: 558 }],
    ["饮雪狂兽", { magicalAttack: 24, physicalAttack: 85, total: 552 }],
  ])("更新 %s 的种族值", (name, expected) => {
    expect(spirit(name)?.raceStats).toMatchObject(expected);
  });

  test.each([
    ["雪灵兽", { hp: 62, speed: 75, physicalAttack: 51, magicalAttack: 14, physicalDefense: 67, magicalDefense: 62, total: 331 }],
    ["幻雪兽", { hp: 83, speed: 100, physicalAttack: 68, magicalAttack: 19, physicalDefense: 89, magicalDefense: 82, total: 441 }],
    ["友爱天天", { hp: 97, speed: 76, physicalAttack: 30, magicalAttack: 93, physicalDefense: 70, magicalDefense: 80, total: 446 }],
    ["芽眼魔", { hp: 80, speed: 45, physicalAttack: 62, magicalAttack: 59, physicalDefense: 58, magicalDefense: 66, total: 370 }],
    ["叶眼魔", { hp: 107, speed: 60, physicalAttack: 82, magicalAttack: 78, physicalDefense: 77, magicalDefense: 88, total: 492 }],
    ["苞米仔", { hp: 92, speed: 60, physicalAttack: 79, magicalAttack: 80, physicalDefense: 88, magicalDefense: 88, total: 487 }],
    ["守夜烛", { hp: 97, speed: 84, physicalAttack: 76, magicalAttack: 83, physicalDefense: 86, magicalDefense: 98, total: 524 }],
  ])("同步 BWIKI 当前筛选页的 %s 种族值", (name, expected) => {
    expect(spirit(name)?.raceStats).toEqual(expected);
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
