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
  test("keeps every public spirit and gives each one a remote portrait", () => {
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
    const bundledSkillIds = new Set(bundled.skills.map((skill) => skill.id));
    expect(bundled.learnsets.every((learnset) =>
      learnset.skillIds.every((skillId) => bundledSkillIds.has(skillId))
    )).toBe(true);
    expect(bundled.spirits.every((spirit) =>
      /^https:\/\//u.test(spirit.imageUrl)
    )).toBe(true);
    expect(
      bundled.spirits.find(
        (spirit) => spirit.id === "spirit_db5a2cb398dc0385",
      )?.imageUrl,
    ).toBe(
      "https://patchwiki.biligame.com/images/rocom/3/3c/jksy80nru0voaobly2uguh0rtydx2wa.png",
    );
  });

  test("decodes the compressed runtime without losing records", () => {
    const bundled = expandBundledRuntime(
      JSON.parse(readFileSync(bundledRuntimePath, "utf8")),
    );

    expect(decodedBundledRuntime.meta.id).toBe(bundled.meta.id);
    expect(decodedBundledRuntime.spirits).toHaveLength(bundled.spirits.length);
    expect(decodedBundledRuntime.skills).toHaveLength(bundled.skills.length);
    expect(decodedBundledRuntime.traits).toHaveLength(bundled.traits.length);
    expect(decodedBundledRuntime.learnsets).toHaveLength(bundled.learnsets.length);
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
      learnsetSkillIndexes: [[1, 0], []],
      skills: [{ id: "skill-a" }, { id: "skill-b" }],
      spirits: [{ id: "spirit-a" }, { id: "spirit-b" }],
    })).toEqual({
      learnsets: [
        { spiritId: "spirit-a", skillIds: ["skill-b", "skill-a"] },
        { spiritId: "spirit-b", skillIds: [] },
      ],
      skills: [{ id: "skill-a" }, { id: "skill-b" }],
      spirits: [{ id: "spirit-a" }, { id: "spirit-b" }],
    });
  });
});
