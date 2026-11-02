import { expect, test } from "vitest";
import { buildLearningUpdates } from "../../src/features/skill-query/learning-updates.js";
import { S5_SEASON_ANNOUNCEMENT } from "../../src/features/s5-preview/season-announcement.js";

const patch = { id: "s5-update", seasonId: "S5", date: "2026.10.31" };
const skills = [
  { id: "spread", name: "外附传播", type: "草", category: "status" },
  { id: "poison", name: "投毒", type: "毒", category: "magical" },
];
const addition = (skill) => ({ kind: "learnset", field: "skillIds", skillId: skill.id,
  label: "新增可学习技能", after: skill.name, note: "技能书" });

function familyFixture() {
  const stages = ["一阶", "二阶", "三阶", "首领"];
  const names = ["蹦蹦种子", "蹦蹦草", "蹦蹦花", "蹦蹦果"];
  const variants = ["海神球", "彩玉球", "短毛球", "象牙球"];
  const spirits = stages.flatMap((stage, index) => variants.map((variant, form) => ({
    id: `ball-${index}-${form}`, familyId: "ball", stage,
    fullName: `${names[index]}（${variant}形态）`, dexNo: String(63 + Math.min(index, 2)),
    types: ["草", "毒"], changeInfo: { patch, items: skills.map(addition) },
  })));
  const season = { id: "S5", spirits, skills,
    seasonAnnouncement: { id: S5_SEASON_ANNOUNCEMENT.patch.id },
    learnsets: spirits.map(({ id }) => ({ spiritId: id, skillIds: skills.map(skill => skill.id),
      acquisitions: Object.fromEntries(skills.map(skill => [skill.id, ["技能书"]])),
    })),
  };
  const changes = { gains: spirits.map(({ id }) => ({ spiritId: id, skillIds: skills.map(skill => skill.id) })) };
  return { season, changes };
}

test("海神球等四形态的完整十六成员同更新才合为家族，代表采用最终普通形态", () => {
  const { season, changes } = familyFixture();
  const before = JSON.stringify({ season, changes });
  const rows = buildLearningUpdates(season, changes);
  expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({ isFamily: true, familyId: "ball", spiritId: "ball-2-0",
    hasNewSkills: true, hasLearningChanges: false });
  expect(rows[0].spirit.fullName).toBe("蹦蹦花（海神球形态）");
  expect(rows[0].members).toHaveLength(16);
  expect(rows[0].skills).toEqual(skills);
  expect(rows[0].changeInfo.items).toEqual(skills.map(addition));
  expect(JSON.stringify({ season, changes })).toBe(before);
});

test.each([1, 15])("完整家族仅有 %i 个成员更新时，不能先过滤未更新成员再冒充家族", (count) => {
  const { season, changes } = familyFixture();
  season.spirits.slice(count).forEach(spirit => { delete spirit.changeInfo; });
  changes.gains = changes.gains.slice(0, count);
  const rows = buildLearningUpdates(season, changes);
  expect(rows).toHaveLength(count);
  expect(rows.every(row => !row.isFamily && row.members.length === 1)).toBe(true);
});

test.each(["skills", "changes", "acquisitions"])("家族成员的 %s 不同时不合并，其他相同分支也独立", (difference) => {
  const { season, changes } = familyFixture();
  if (difference === "skills") changes.gains[0].skillIds = ["spread"];
  if (difference === "changes") season.spirits[0].changeInfo.items[0].note = "血脉";
  if (difference === "acquisitions") season.learnsets[0].acquisitions.spread = ["默认学习"];
  const rows = buildLearningUpdates(season, changes);
  expect(rows).toHaveLength(16);
  expect(rows.every(row => !row.isFamily)).toBe(true);
});

test("技能和条目顺序不影响同更新判定，但相似名称没有明确家族身份仍保持独立", () => {
  const { season, changes } = familyFixture();
  changes.gains[0].skillIds.reverse();
  season.spirits[0].changeInfo.items.reverse();
  expect(buildLearningUpdates(season, changes)).toHaveLength(1);
  season.spirits.forEach(spirit => { delete spirit.familyId; });
  const rows = buildLearningUpdates(season, changes);
  expect(rows).toHaveLength(16);
  expect(rows.every(row => !row.isFamily && row.familyId === null)).toBe(true);
});

test("学习调整保留本季补丁层级，同补丁重复去重，上一季和无关种族值不混入", () => {
  const { season } = familyFixture();
  const earlier = { id: "s5-earlier", seasonId: "S5", date: "2026.10.27" };
  const oldItem = { kind: "learnset", label: "血脉技能", before: "旧技能", after: "新技能" };
  season.spirits.forEach(spirit => {
    spirit.changeInfo = { patch, entityId: spirit.id, items: [...skills.map(addition), { kind: "stat", label: "生命", after: 100 }],
      history: [
        { patch, items: skills.map(addition) },
        { patch: earlier, items: [oldItem] },
        { patch: { id: "s4-old", seasonId: "S4" }, items: [oldItem] },
      ],
    };
  });
  const [row] = buildLearningUpdates(season);
  expect(row).toMatchObject({ isFamily: true, hasNewSkills: false, hasLearningChanges: true });
  expect(row.skills).toEqual([]);
  expect(row.changeInfo.items).toEqual(skills.map(addition));
  expect(row.changeInfo.history).toEqual([{ patch: earlier, items: [oldItem] }]);
  // 最新补丁只有非学习改动，仍能显示本季之前的学习调整。
  season.spirits.forEach(spirit => { spirit.changeInfo.items = [{ kind: "stat", label: "生命", after: 100 }];
    spirit.changeInfo.history = [{ patch: earlier, items: [oldItem] }]; });
  expect(buildLearningUpdates(season)[0].changeInfo).toMatchObject({ patch: earlier, items: [oldItem], history: [] });
});

test("图鉴按数值正序、同号普通形态在首领前、缺号保留目录顺序，并保留头像及搜索元数据", () => {
  const spirits = [
    { id: "late", fullName: "后号", aliases: ["目录别名"], types: ["毒"], stage: "二阶", asset: { sourceUrl: "source" } },
    { id: "boss", fullName: "首领", dexNo: "002", stage: "首领" },
    { id: "normal", fullName: "普通", dexNo: "002", stage: "三阶" },
    { id: "unknown-a", fullName: "未编号甲", stage: "首领" },
    { id: "unknown-b", fullName: "未编号乙", stage: "一阶" },
  ];
  const season = { id: "S4", spirits, skills, learnsets: [] };
  const changes = { gains: [...spirits].reverse().map(({ id }) => ({ spiritId: id, skillIds: ["spread"] })) };
  const rows = buildLearningUpdates(season, changes, [{ id: "late", dexNo: "010", aliases: ["搜索别名"],
    assetUrl: "/prepared.png", asset: { localUrl: "/local.png" },
  }]);
  expect(rows.map(row => row.spiritId)).toEqual(["normal", "boss", "late", "unknown-a", "unknown-b"]);
  expect(rows[2].spirit).toMatchObject({ aliases: ["搜索别名", "目录别名"], types: ["毒"],
    assetUrl: "/prepared.png", asset: { localUrl: "/local.png", sourceUrl: "source" } });
  expect(buildLearningUpdates(null, changes)).toEqual([]);
});

test("纯新增不重复归学习途径调整，新增与本季历史血脉调整可同时命中", () => {
  const { season, changes } = familyFixture();
  season.spirits = [season.spirits[0]];
  expect(buildLearningUpdates(season, changes)[0]).toMatchObject({ hasNewSkills: true, hasLearningChanges: false });
  season.spirits[0].changeInfo.history = [{ patch: { id: "s5-earlier", seasonId: "S5" },
    items: [{ kind: "learnset", label: "血脉技能", before: "旧技能", after: "投毒" }],
  }];
  const [mixed] = buildLearningUpdates(season, changes);
  expect(mixed).toMatchObject({ hasNewSkills: true, hasLearningChanges: true });
  expect(mixed.changeInfo.items).toEqual(skills.map(addition));
  expect(mixed.changeInfo.history).toHaveLength(1);
  // 未由新增技能区覆盖的台账不能静默消失在两个类型之外。
  delete season.spirits[0].changeInfo.history;
  expect(buildLearningUpdates(season)[0]).toMatchObject({ hasNewSkills: false, hasLearningChanges: true });
});
