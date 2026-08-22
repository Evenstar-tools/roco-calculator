import { describe, expect, test } from "vitest";
import snapshot from "../../public/data/current.json";
import { calculateMatchup } from "../../src/domain/calculate.js";
import {
  getDefaultHitCount,
  hasDeclaredHitCount,
} from "../../src/domain/skill-effects.js";
import { calculateAllPanelStats } from "../../src/domain/stat.js";

const BARON_ID = "spirit_67dcbe51f817669a";
const BONE_DRAGON_ID = "spirit_2c2d72d3c0bbe704";
const BITE_ID = "skill_3491d62ec7b41367";
const FALCON_SCALE_ID = "skill_a554a40d70692788";

const baronIvs = {
  hp: 0,
  speed: 60,
  physicalAttack: 60,
  magicalAttack: 0,
  physicalDefense: 0,
  magicalDefense: 60,
};
const boneDragonIvs = {
  hp: 60,
  speed: 0,
  physicalAttack: 60,
  magicalAttack: 0,
  physicalDefense: 60,
  magicalDefense: 0,
};
const hasty = { speed: 1.2, magicalAttack: 0.9 };
const peaceful = { hp: 1.2, magicalAttack: 0.9 };

function spirit(id) {
  return snapshot.spirits.find((candidate) => candidate.id === id);
}

function side(spiritId, displayIvs, natureMultipliers, skillId) {
  return {
    spiritId,
    displayIvs,
    natureMultipliers,
    skills: {
      single: skillId,
      four: [skillId, null, null, null],
    },
  };
}

describe("恶魔男爵逐击吸血实战回归", () => {
  test("开朗 ads 男爵羽化后吃平和 hab 骨龙隼鳞，再用撕咬逐击结算", () => {
    const baronStats = calculateAllPanelStats({
      raceStats: spirit(BARON_ID).raceStats,
      displayIvs: baronIvs,
      natureMultipliers: hasty,
    });
    const boneDragonStats = calculateAllPanelStats({
      raceStats: spirit(BONE_DRAGON_ID).raceStats,
      displayIvs: boneDragonIvs,
      natureMultipliers: peaceful,
    });
    const input = {
      mode: "four",
      level: 60,
      sides: {
        attacker: side(BARON_ID, baronIvs, hasty, BITE_ID),
        defender: side(
          BONE_DRAGON_ID,
          boneDragonIvs,
          peaceful,
          FALCON_SCALE_ID,
        ),
      },
      directions: {
        forward: {
          currentHp: boneDragonStats.hp,
          overrides: { fixedPowerAdd: 20 },
          selectedSkillIndex: 0,
        },
        reverse: {
          currentHp: baronStats.hp,
          selectedSkillIndex: 0,
        },
      },
    };

    const falconScale = calculateMatchup(snapshot, input).reverse.selectedResult;
    input.directions.reverse.currentHp = Math.max(
      0,
      baronStats.hp - falconScale.totalDamage,
    );
    const bite = calculateMatchup(snapshot, input).forward.selectedResult;

    expect(baronStats.hp).toBe(369);
    expect(boneDragonStats.hp).toBe(490);
    expect(falconScale.totalDamage).toBe(222);
    expect(input.directions.reverse.currentHp).toBe(147);
    expect(bite).toMatchObject({
      hitCount: 5,
      hitDamages: [127, 127, 127, 127, 140],
      mainDamage: 648,
      postAttackEffects: {
        attackLevelStageAdd: 1,
        source: "贪得无厌",
      },
      totalDamage: 648,
    });
    expect(bite.traitSettlements.at(-1).text).toContain(
      "逐击 127/127/127/127/140",
    );
  });

  test("没有贪得无厌时，多段技能仍保持每段同伤害", () => {
    const fixture = {
      ...snapshot,
      spirits: snapshot.spirits.map((candidate) =>
        candidate.id === BARON_ID
          ? { ...candidate, traitIds: [] }
          : candidate,
      ),
    };
    const result = calculateMatchup(fixture, {
      mode: "four",
      level: 60,
      sides: {
        attacker: side(BARON_ID, baronIvs, hasty, BITE_ID),
        defender: side(
          BONE_DRAGON_ID,
          boneDragonIvs,
          peaceful,
          FALCON_SCALE_ID,
        ),
      },
      directions: {
        forward: { currentHp: 490, selectedSkillIndex: 0 },
        reverse: { currentHp: 147, selectedSkillIndex: 0 },
      },
    }).forward.selectedResult;

    expect(result.hitCount).toBe(5);
    expect(new Set(result.hitDamages).size).toBe(1);
    expect(result.totalDamage).toBe(
      result.hitDamages[0] * result.hitCount,
    );
  });

  test("所有明确多段攻击技能均走逐击整数结算", () => {
    const multiHitSkills = snapshot.skills.filter(
      (skill) =>
        ["physical", "magical"].includes(skill.category) &&
        hasDeclaredHitCount(skill) &&
        getDefaultHitCount(skill) > 1,
    );
    const failures = [];

    for (const skill of multiHitSkills) {
      const result = calculateMatchup(snapshot, {
        mode: "four",
        level: 60,
        sides: {
          attacker: side(BARON_ID, baronIvs, hasty, skill.id),
          defender: side(
            BONE_DRAGON_ID,
            boneDragonIvs,
            peaceful,
            FALCON_SCALE_ID,
          ),
        },
        directions: {
          forward: { currentHp: 490, selectedSkillIndex: 0 },
          reverse: { currentHp: 198, selectedSkillIndex: 0 },
        },
      }).forward.selectedResult;
      const hitDamages = result?.hitDamages ?? [];
      const isValid =
        result &&
        hitDamages.length === result.hitCount &&
        hitDamages.every(
          (damage) => Number.isInteger(damage) && damage >= 0,
        ) &&
        result.mainDamage === hitDamages.reduce(
          (sum, damage) => sum + damage,
          0,
        ) &&
        (skill.category !== "physical" ||
          hitDamages.every(
            (damage, index) => index === 0 || damage >= hitDamages[index - 1],
          )) &&
        (skill.category !== "magical" || new Set(hitDamages).size === 1);

      if (!isValid) {
        failures.push({
          category: skill.category,
          hitCount: result?.hitCount,
          hitDamages,
          mainDamage: result?.mainDamage,
          name: skill.name,
        });
      }
    }

    expect(multiHitSkills.length).toBeGreaterThanOrEqual(30);
    expect(failures).toEqual([]);
  });
});
