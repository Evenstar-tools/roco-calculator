import { describe, expect, test } from "vitest";
import { applyS3MidseasonCatalog } from "../../scripts/bwiki/apply-s3-midseason-catalog.mjs";

const source = Object.freeze({
  title: "精灵筛选",
  url: "https://wiki.biligame.com/rocom/精灵筛选",
  revision: 41360,
  fetchedAt: "2026-08-13T00:00:00.000Z",
  sha256: "a".repeat(64),
});

function snapshot() {
  return {
    meta: {
      id: "s3-base",
      counts: { spirits: 1, skills: 1, learnsets: 1, traits: 0 },
      diff: { previousSnapshot: null, spiritsAdded: 0, spiritsRemoved: 0 },
      sources: [source],
    },
    spirits: [{ id: "spirit_old", fullName: "旧精灵", traitIds: [] }],
    skills: [{ id: "skill_known", name: "已知技能" }],
    learnsets: [{ spiritId: "spirit_old", skillIds: ["skill_known"] }],
    traits: [],
  };
}

function catalog(skillName = "已知技能") {
  const detailSource = {
    ...source,
    title: "宝藏小狐",
    revision: 42863,
    sha256: "b".repeat(64),
  };
  return {
    source,
    entries: [
      {
        spirit: {
          id: "spirit_fox",
          fullName: "宝藏小狐",
          traitIds: ["trait_museum"],
          provenance: { identity: source },
        },
        detail: {
          source: detailSource,
          evolutionNames: ["宝藏小狐", "宝藏沙狐"],
          trait: {
            name: "博物",
            description: "识破变化效果。",
            provenance: detailSource,
          },
          skills: [{ name: skillName, acquisition: ["等级1"] }],
        },
      },
    ],
  };
}

describe("S3 季中目录补丁", () => {
  test("补齐精灵、特性和学习集并保持重复执行不产生重复项", () => {
    const first = applyS3MidseasonCatalog(snapshot(), catalog());
    const second = applyS3MidseasonCatalog(first, catalog());

    expect(second.spirits.map((entry) => entry.fullName)).toEqual([
      "旧精灵",
      "宝藏小狐",
    ]);
    expect(second.traits).toContainEqual(expect.objectContaining({
      id: "trait_museum",
      name: "博物",
      description: "识破变化效果。",
    }));
    expect(second.learnsets).toContainEqual(expect.objectContaining({
      spiritId: "spirit_fox",
      skillIds: ["skill_known"],
      acquisitions: { skill_known: ["等级1"] },
    }));
    expect(second.meta.counts).toMatchObject({
      spirits: 2,
      learnsets: 2,
      traits: 1,
    });
    expect(second.meta.diff).toMatchObject({
      previousSnapshot: "s3-base",
      spiritsAdded: 1,
      spiritsRemoved: 0,
    });
  });

  test("详情页引用当前技能库不存在的技能时拒绝生成快照", () => {
    expect(() => applyS3MidseasonCatalog(snapshot(), catalog("缺失技能")))
      .toThrow("宝藏小狐引用未知技能：缺失技能");
  });
});
