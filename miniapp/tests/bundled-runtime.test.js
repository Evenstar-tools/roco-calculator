import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, test } from "vitest";
import { expandBundledRuntime } from "../src/data/expand-bundled-runtime.js";
import decodedBundledRuntime from "../src/data/bundled-runtime.js";

const miniappRoot = process.cwd();
const bundledRuntimePath = path.join(
  miniappRoot,
  "src/data/bundled-runtime.json",
);
const publicRuntimePath = path.join(
  miniappRoot,
  "../public/data/runtime.json",
);

describe("bundled miniapp runtime", () => {
  test("keeps every public spirit and preserves its portrait contract", () => {
    expect(existsSync(bundledRuntimePath)).toBe(true);
    if (!existsSync(bundledRuntimePath)) return;

    const payload = JSON.parse(readFileSync(bundledRuntimePath, "utf8"));
    const bundled = expandBundledRuntime(payload);
    const publicRuntime = JSON.parse(readFileSync(publicRuntimePath, "utf8"));

    expect(bundled.spirits).toHaveLength(publicRuntime.spirits.length);
    const bundledLearnsets = new Map(
      bundled.learnsets.map((learnset) => [learnset.spiritId, learnset.skillIds]),
    );
    for (const learnset of publicRuntime.learnsets) {
      expect(bundledLearnsets.get(learnset.spiritId)).toEqual(
        expect.arrayContaining(learnset.skillIds),
      );
    }
    const bundledSpirits = new Map(
      bundled.spirits.map((spirit) => [spirit.id, spirit]),
    );
    const bundledTraits = new Map(
      bundled.traits.map((trait) => [trait.id, trait]),
    );
    const bundledSkills = new Map(
      bundled.skills.map((skill) => [skill.id, skill]),
    );
    const raceStatKeys = [
      "hp",
      "speed",
      "physicalAttack",
      "magicalAttack",
      "physicalDefense",
      "magicalDefense",
    ];
    for (const spirit of publicRuntime.spirits) {
      expect(bundledSpirits.get(spirit.id)?.previewDefaults).toEqual(
        spirit.previewDefaults,
      );
      if (spirit.calculationStatus === "pending-race-stats") {
        expect(bundledSpirits.get(spirit.id)).toMatchObject({
          calculationStatus: "pending-race-stats",
          raceStats: null,
        });
        continue;
      }
      expect(
        Object.fromEntries(raceStatKeys.map((key) => [
          key,
          bundledSpirits.get(spirit.id)?.raceStats?.[key],
        ])),
      ).toEqual(
        Object.fromEntries(raceStatKeys.map((key) => [key, spirit.raceStats[key]])),
      );
    }
    for (const trait of publicRuntime.traits) {
      expect(bundledTraits.get(trait.id)?.description).toBe(trait.description);
    }
    for (const skill of publicRuntime.skills) {
      expect(bundledSkills.get(skill.id)).toMatchObject({
        basePower: skill.basePower,
        category: skill.category,
        cost: skill.cost,
        description: skill.description,
        name: skill.name,
        type: skill.type,
      });
    }
    const bundledSkillIds = new Set(bundled.skills.map((skill) => skill.id));
    expect(bundled.learnsets.every((learnset) =>
      learnset.skillIds.every((skillId) => bundledSkillIds.has(skillId))
    )).toBe(true);
    expect(bundled.spirits.every((spirit) =>
      /^https:\/\//u.test(spirit.imageUrl) ||
      (spirit.changeInfo?.isNew === true &&
        spirit.changeInfo?.patch?.status === "preview")
    )).toBe(true);
    expect(
      bundled.spirits.find(
        (spirit) => spirit.id === "spirit_db5a2cb398dc0385",
      )?.imageUrl,
    ).toBe(
      "https://patchwiki.biligame.com/images/rocom/3/3c/jksy80nru0voaobly2uguh0rtydx2wa.png",
    );
  }, 30_000);

  test("decodes the compressed runtime without losing records", () => {
    const bundled = expandBundledRuntime(
      JSON.parse(readFileSync(bundledRuntimePath, "utf8")),
    );

    expect(decodedBundledRuntime).toEqual(bundled);
  });

  test("keeps secure skill icons and resolves preview assets through the production site", () => {
    const bundled = expandBundledRuntime(
      JSON.parse(readFileSync(bundledRuntimePath, "utf8")),
    );
    const publicRuntime = JSON.parse(readFileSync(publicRuntimePath, "utf8"));
    const publicIconCount = publicRuntime.skills.filter(
      (skill) => /^(?:https:\/\/|\/assets\/skills\/)/u.test(skill.iconUrl ?? ""),
    ).length;
    const bundledIconCount = bundled.skills.filter(
      (skill) => /^https:\/\//u.test(skill.iconUrl ?? ""),
    ).length;

    expect(bundledIconCount).toBe(publicIconCount);
    expect(bundled.skills.filter(
      (skill) => /^https:\/\/rococalc\.top\/assets\/skills\/skill_[a-f0-9]{16}\.png$/u.test(skill.iconUrl ?? ""),
    )).toHaveLength(26);
    expect(bundled.skills.some(
      (skill) => skill.name === "愿力冲击" && !skill.iconUrl,
    )).toBe(true);
  });

  test("bundles all searchable Wish Power variants used by the calculator", () => {
    const bundled = expandBundledRuntime(
      JSON.parse(readFileSync(bundledRuntimePath, "utf8")),
    );
    const wishPowerSkills = bundled.skills.filter(
      (skill) => skill.name === "愿力冲击",
    );

    expect(wishPowerSkills).toHaveLength(18);
    expect(wishPowerSkills.every(
      (skill) => skill.pickerVisibility === "search-only",
    )).toBe(true);
    expect(new Set(wishPowerSkills.map((skill) => skill.type)).size).toBe(18);
  });

  test("keeps only pinyin search aliases in the bundled skill payload", () => {
    const bundled = expandBundledRuntime(
      JSON.parse(readFileSync(bundledRuntimePath, "utf8")),
    );

    expect(bundled.skills.every((skill) => {
      const aliases = String(skill.searchText ?? "").split("|");
      return aliases.length <= 2 && aliases.every((alias) => /^[a-zü]+$/u.test(alias));
    })).toBe(true);
  });

  test("expands compact learnset indexes into the calculator contract", () => {
    expect(expandBundledRuntime({
      defaultSkillIndexes: { 0: [0] },
      learnsetSkillIndexes: [[1, 0], []],
      skills: [{ id: "skill-a" }, { id: "skill-b" }],
      spirits: [{ id: "spirit-a" }, { id: "spirit-b" }],
    })).toEqual({
      learnsets: [
        {
          defaultSkillIds: ["skill-a"],
          spiritId: "spirit-a",
          skillIds: ["skill-b", "skill-a"],
        },
        { spiritId: "spirit-b", skillIds: [] },
      ],
      skills: [{ id: "skill-a" }, { id: "skill-b" }],
      spirits: [{ id: "spirit-a" }, { id: "spirit-b" }],
    });
  });

  test("keeps the explicit S4 preview quartet order after compact expansion", () => {
    const bundled = expandBundledRuntime(
      JSON.parse(readFileSync(bundledRuntimePath, "utf8")),
    );
    const spirit = bundled.spirits.find(({ fullName }) => fullName === "月使鹭纳");
    const learnset = bundled.learnsets.find(
      ({ spiritId }) => spiritId === spirit.id,
    );
    const skillsById = new Map(bundled.skills.map((skill) => [skill.id, skill]));

    expect(
      learnset.defaultSkillIds.map((skillId) => skillsById.get(skillId)?.name),
    ).toEqual(["惊鸿一瞥", "月影交错", "打雪仗", "羽翼庇护"]);
  });
});
