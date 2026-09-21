import { expect, test } from "vitest";
import { getBossBloodlineConflicts, getSkillChoices } from "../../src/domain/skill-loadout.js";
import { buildRuntimeSnapshot } from "../../scripts/runtime-snapshot.mjs";

const snapshot = {
  spirits: [{ id: "pet", fullName: "普通形态" }, { id: "boss", fullName: "首领形态", stage: "首领" }],
  skills: ["blood", "native", "stone", "unknown"].map(id => ({ id, name: id })),
  learnsets: ["pet", "boss"].map(spiritId => ({ spiritId,
    skillIds: ["blood", "native", "stone", "unknown"], acquisitions: {
      blood: ["普通系血脉 Lv.15"], native: ["火系血脉 Lv.15", "默认学习 Lv.1"],
      stone: ["水系血脉 Lv.15", "技能石"], unknown: [],
    },
  })),
};
const member = { spiritId: "pet", bloodlineType: "boss", skills: { four: ["blood", { skillId: "native" }, { id: "stone" }, null] } };

test("仅血脉途径标记特殊来源，有自学或技能石途径的不误报", () => {
  const choices = getSkillChoices(snapshot, "pet");
  expect(choices.find(skill => skill.id === "blood")).toMatchObject({ bloodlineSkill: true, learnable: true });
  for (const id of ["native", "stone", "unknown"]) expect(choices.find(skill => skill.id === id).bloodlineSkill).not.toBe(true);
});

test("首领血脉与首领形态都检测冲突，兼容技能对象、不修改原配置", () => {
  const before = JSON.stringify(member);
  expect(getBossBloodlineConflicts(snapshot, member).map(skill => skill.id)).toEqual(["blood"]);
  expect(getBossBloodlineConflicts(snapshot, { ...member, bloodlineType: "normal" })).toEqual([]);
  expect(getBossBloodlineConflicts(snapshot, { ...member, spiritId: "boss", bloodlineType: "normal", skills: { four: [{ id: "blood" }, { skillId: "blood" }] } }).map(skill => skill.id)).toEqual(["blood"]);
  expect(getBossBloodlineConflicts(snapshot, { ...member, skills: { four: ["native", "missing", "stone"] } })).toEqual([]);
  expect(getBossBloodlineConflicts(snapshot, null)).toEqual([]);
  expect(JSON.stringify(member)).toBe(before);
});

test("压缩运行数据保留血脉依赖，生产页面与完整快照结果一致", () => {
  const runtime = buildRuntimeSnapshot(snapshot);
  expect(runtime.learnsets[0].acquisitions).toBeUndefined();
  expect(runtime.learnsets[0].bloodlineSkillIds).toEqual(["blood"]);
  expect(getSkillChoices(runtime, "pet").filter(skill => skill.bloodlineSkill).map(skill => skill.id)).toEqual(["blood"]);
  expect(getBossBloodlineConflicts(runtime, member).map(skill => skill.id)).toEqual(["blood"]);
});
