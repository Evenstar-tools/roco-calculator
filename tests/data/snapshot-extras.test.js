import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import { withCalculatorExtras } from "../../src/data/snapshot-extras.js";

describe("withCalculatorExtras", () => {
  test("adds all 18 typed Wish Power variants without mutating the snapshot count", () => {
    const snapshot = {
      meta: { counts: { skills: 553 } },
      skills: [{ id: "fixture", name: "测试技能" }],
    };
    const enriched = withCalculatorExtras(snapshot);
    const wishPower = enriched.skills.filter(
      (skill) => skill.name === "愿力冲击",
    );

    expect(wishPower).toHaveLength(18);
    expect(new Set(wishPower.map((skill) => skill.id))).toHaveProperty(
      "size",
      18,
    );
    expect(new Set(wishPower.map((skill) => skill.type))).toHaveProperty(
      "size",
      18,
    );
    expect(enriched.meta.counts.skills).toBe(553);
    expect(snapshot.skills).toHaveLength(1);
  });

  test("does not duplicate variants already present in a later snapshot", () => {
    const snapshot = withCalculatorExtras({ meta: {}, skills: [] });

    expect(withCalculatorExtras(snapshot).skills).toHaveLength(
      snapshot.skills.length,
    );
  });

  test("makes every Wish Power variant cost 2 and learnable for non-boss spirits", () => {
    const snapshot = {
      meta: {},
      spirits: [
        { id: "spirit_regular", stage: "二阶" },
        { id: "spirit_boss", stage: "首领" },
      ],
      skills: [],
      learnsets: [
        { spiritId: "spirit_regular", skillIds: ["regular_skill"] },
        { spiritId: "spirit_boss", skillIds: ["boss_skill"] },
      ],
    };

    const enriched = withCalculatorExtras(snapshot);
    const wishPowerIds = enriched.skills
      .filter((skill) => skill.name === "愿力冲击")
      .map((skill) => skill.id);
    const regularLearnset = enriched.learnsets.find(
      ({ spiritId }) => spiritId === "spirit_regular",
    );
    const bossLearnset = enriched.learnsets.find(
      ({ spiritId }) => spiritId === "spirit_boss",
    );

    expect(
      enriched.skills
        .filter((skill) => wishPowerIds.includes(skill.id))
        .every((skill) => skill.cost === 2),
    ).toBe(true);
    expect(regularLearnset.skillIds).toEqual(
      expect.arrayContaining(wishPowerIds),
    );
    expect(bossLearnset.skillIds).not.toEqual(
      expect.arrayContaining(wishPowerIds),
    );
    expect(snapshot.learnsets[0].skillIds).toEqual(["regular_skill"]);
  });

  test("gives Dimo boss forms only the Wish Power type named by their trait", () => {
    const snapshot = {
      meta: {},
      spirits: [
        {
          id: "spirit_dimo_light_boss",
          stage: "首领",
          traitIds: ["trait_judgement"],
        },
        {
          id: "spirit_other_boss",
          stage: "首领",
          traitIds: ["trait_other"],
        },
      ],
      skills: [],
      traits: [
        {
          id: "trait_judgement",
          description: "造成克制伤害后，首个技能替换为光系愿力冲击。",
        },
        {
          id: "trait_other",
          description: "攻击时，技能威力+100%。",
        },
      ],
      learnsets: [
        { spiritId: "spirit_dimo_light_boss", skillIds: [] },
        { spiritId: "spirit_other_boss", skillIds: [] },
      ],
    };

    const enriched = withCalculatorExtras(snapshot);
    const lightBoss = enriched.learnsets.find(
      ({ spiritId }) => spiritId === "spirit_dimo_light_boss",
    );
    const otherBoss = enriched.learnsets.find(
      ({ spiritId }) => spiritId === "spirit_other_boss",
    );

    expect(lightBoss.skillIds).toEqual(["calculator_wish_power_light"]);
    expect(otherBoss.skillIds).toEqual([]);
  });

  test("keeps the real S3 roster aligned with regular and trait-specific boss Wish Power rules", () => {
    const snapshot = JSON.parse(
      readFileSync("data/snapshots/current.json", "utf8"),
    );
    const enriched = withCalculatorExtras(snapshot);
    const wishPowerIds = enriched.skills
      .filter((skill) => skill.name === "愿力冲击")
      .map((skill) => skill.id);
    const spiritsById = new Map(
      enriched.spirits.map((spirit) => [spirit.id, spirit]),
    );
    const traitsById = new Map(
      enriched.traits.map((trait) => [trait.id, trait]),
    );

    expect(wishPowerIds).toHaveLength(18);
    for (const learnset of enriched.learnsets) {
      const spirit = spiritsById.get(learnset.spiritId);
      const learnedWishPower = learnset.skillIds.filter((skillId) =>
        wishPowerIds.includes(skillId),
      );
      const traitDescription = (spirit.traitIds ?? [])
        .map((traitId) => traitsById.get(traitId)?.description ?? "")
        .join("\n");
      const bossWishPowerType = traitDescription.match(
        /替换为([^，。；\s]+)系愿力冲击/,
      )?.[1];

      if (spirit.stage !== "首领") {
        expect(learnedWishPower).toHaveLength(18);
      } else if (bossWishPowerType) {
        expect(learnedWishPower).toEqual([
          enriched.skills.find(
            (skill) =>
              skill.name === "愿力冲击" && skill.type === bossWishPowerType,
          ).id,
        ]);
      } else {
        expect(learnedWishPower).toHaveLength(0);
      }
    }
  });
});
