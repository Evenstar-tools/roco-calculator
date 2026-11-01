import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { beforeAll, describe, expect, test } from "vitest";
import { getReleaseData, releaseSource } from "./release-source.js";
import { getMiniappRuntimeBindingErrors } from "../../scripts/miniapp/verify-runtime-bindings.mjs";
import { expandBundledRuntime } from "../src/data/expand-bundled-runtime.js";
import decodedBundledRuntime from "../src/data/bundled-runtime.js";
import { createDurabilityRanking } from "../src/shared/features/team-ability/domain/durability-ranking.js";
import { createSpeedRanking } from "../src/shared/features/team-ability/domain/ranking-tools.js";

const miniappRoot = process.cwd();
const bundledRuntimePath = path.join(
  miniappRoot,
  "src/data/bundled-runtime.json",
);
let publicRuntime;
beforeAll(async () => { publicRuntime = (await getReleaseData()).runtime; }, 30_000);

describe("bundled miniapp runtime", () => {
  test("发布门禁同时拒绝错误源码、头像、技能与学习面，不拿旧 Web 数据替代 S5", () => {
    const payload = JSON.parse(readFileSync(bundledRuntimePath, "utf8"));
    const options = { runtime: publicRuntime, payload, sourceRevision: releaseSource.sourceRevision,
      sourceRoot: releaseSource.source };
    expect(getMiniappRuntimeBindingErrors(options)).toEqual([]);
    payload.meta.miniappSourceRevision = "old-s4";
    payload.spirits[0].imageUrl = "https://rococalc.top/assets/spirits/wrong.png";
    payload.skills[0].basePower += 1;
    payload.learnsetSkillIndexes[0].reverse();
    const failures = getMiniappRuntimeBindingErrors(options).join("；");
    for (const subject of ["源码版本", "头像", "技能资料", "技能关系"]) expect(failures).toContain(subject);
  });
  test("小程序与网页的耐久及速度排行保持一致", () => {
    const bundled = expandBundledRuntime(JSON.parse(readFileSync(bundledRuntimePath, "utf8")));
    const web = publicRuntime;
    for (const attackType of ["", "火", "水"]) {
      const options = { attackType, multipliers: [0.25, 0.5], typeChart: web.typeChart };
      const project = (snapshot) => createDurabilityRanking({ ...options, spirits: snapshot.spirits, spiritFilterRevision: snapshot.meta?.revisions?.spiritFilter }).rows.map((row) => [row.spiritId, row.filteredRank, row.durability.display]);
      expect(project(bundled)).toEqual(project(web));
    }
    const projectSpeed = (snapshot) => createSpeedRanking({ snapshot }).map((group) => [group.speed, group.targets.map((target) => [target.spiritId, target.profileId])]);
    expect(projectSpeed(bundled)).toEqual(projectSpeed(web));
  });
  test("keeps every public spirit and preserves its portrait contract", () => {
    expect(existsSync(bundledRuntimePath)).toBe(true);
    if (!existsSync(bundledRuntimePath)) return;

    const payload = JSON.parse(readFileSync(bundledRuntimePath, "utf8"));
    const bundled = expandBundledRuntime(payload);

    expect(bundled.spirits).toHaveLength(publicRuntime.spirits.length);
    const bundledLearnsets = new Map(
      bundled.learnsets.map((learnset) => [learnset.spiritId, learnset]),
    );
    for (const learnset of publicRuntime.learnsets) {
      expect(bundledLearnsets.get(learnset.spiritId)).toEqual(learnset);
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
      expect(bundledSpirits.get(spirit.id)?.previewIdentity).toEqual(spirit.previewIdentity);
      expect(bundledSpirits.get(spirit.id)?.calculationStatus).toEqual(spirit.calculationStatus);
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
      (spirit.previewIdentity && spirit.calculationStatus?.startsWith("pending-"))
    )).toBe(true);
    expect(
      bundled.spirits.find(
        (spirit) => spirit.id === "spirit_db5a2cb398dc0385",
      )?.imageUrl,
    ).toBe(
      `https://rococalc.top${publicRuntime.spirits.find(({ id }) => id === "spirit_db5a2cb398dc0385").asset.localUrl}`,
    );
    expect(bundled.meta).toMatchObject({ seasonId: "S5", miniappSourceRevision: releaseSource.sourceRevision });
  }, 30_000);

  test("decodes the compressed runtime without losing records", () => {
    const bundled = expandBundledRuntime(
      JSON.parse(readFileSync(bundledRuntimePath, "utf8")),
    );

    expect(decodedBundledRuntime).toEqual(bundled);
  });

  test("小程序仅省略未显示的历史时间线，保留每个精灵和技能当前改动全文", () => {
    const bundled = expandBundledRuntime(JSON.parse(readFileSync(bundledRuntimePath, "utf8")));
    for (const collection of ["spirits", "skills"]) {
      const entries = new Map(bundled[collection].map(entry => [entry.id, entry]));
      for (const entry of publicRuntime[collection]) {
        if (!entry.changeInfo) continue;
        const { history: _history, ...displayed } = entry.changeInfo;
        expect(entries.get(entry.id).changeInfo).toEqual(displayed);
        expect(entries.get(entry.id).changeInfo).not.toHaveProperty("history");
      }
    }
  });

  test("keeps secure skill icons and resolves preview assets through the production site", () => {
    const bundled = expandBundledRuntime(
      JSON.parse(readFileSync(bundledRuntimePath, "utf8")),
    );
    const publicIconCount = publicRuntime.skills.filter(
      (skill) => /^(?:https:\/\/|\/assets\/skills\/)/u.test(skill.iconUrl ?? ""),
    ).length;
    const bundledIconCount = bundled.skills.filter(
      (skill) => /^https:\/\//u.test(skill.iconUrl ?? ""),
    ).length;

    expect(bundledIconCount).toBe(publicIconCount);
    expect(bundled.skills.filter(
      (skill) => /^https:\/\/rococalc\.top\/assets\/skills\//u.test(skill.iconUrl ?? ""),
    )).toHaveLength(publicRuntime.skills.filter(skill => skill.iconUrl?.startsWith("/assets/skills/")).length);
    expect(bundled.skills.some(({ name }) => name === "麦芒")).toBe(true);
    expect(bundled.skills.find(({ name }) => name === "冰锋横扫")?.basePower).toBe(1);
    for (const name of ["拖拉机", "麦芒"]) {
      const skill = bundled.skills.find((entry) => entry.name === name);
      expect(skill?.iconUrl).toBe(`https://rococalc.top/assets/skills/${skill?.id}.png`);
    }
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

  test("preserves calculator community aliases without changing official names", () => {
    const bundled = expandBundledRuntime(
      JSON.parse(readFileSync(bundledRuntimePath, "utf8")),
    );
    const waterBlue = bundled.spirits.find(
      (spirit) => spirit.id === "spirit_77c2085d2f6e8e87",
    );

    expect(waterBlue).toMatchObject({
      aliases: ["塑料袋", "大牌姐"],
      fullName: "水蓝蓝",
    });
    expect(
      bundled.spirits.find(
        (spirit) => spirit.id === "spirit_cd669a9720f51fe4",
      ),
    ).toMatchObject({
      aliases: ["UFO", "扫地机器人"],
      fullName: "食尘短绒",
    });
    expect(
      bundled.spirits.filter((spirit) => spirit.aliases?.includes("苹果"))
        .map((spirit) => spirit.fullName).sort(),
    ).toEqual(["半朽蜜果灵", "蜜果骸"]);
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
