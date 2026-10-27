import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import { getSkillEffectRule } from "../../src/domain/skill-effects.js";
import { getDefenseSkillReductionPercent } from "../../src/domain/skill-status-effects.js";
import { buildRuntimeSnapshot } from "../../scripts/runtime-snapshot.mjs";
import {
  applyS5SeasonAnnouncement, S5_SEASON_ANNOUNCEMENT as notice,
} from "../../src/features/s5-preview/season-announcement.js";

const load = path => JSON.parse(readFileSync(path, "utf8"));
const runtime = load("public/data/runtime.json");
const raw = load("data/snapshots/current.json");
const named = (items, name) => items.find(item => (item.fullName ?? item.name) === name);
const learning = (snapshot, name) => snapshot.learnsets.find(item => item.spiritId === named(snapshot.spirits, name).id);
const skillId = name => named(runtime.skills, name).id;

describe("S5公告投影", () => {
  test("17组47项种族值只更新具名形态，保留原快照及真实ID", () => {
    const before = structuredClone(runtime);
    const result = applyS5SeasonAnnouncement(runtime);
    expect(notice.raceStats).toHaveLength(17);
    expect(notice.raceStats.flatMap(item => Object.keys(item.fields))).toHaveLength(47);
    for (const entry of notice.raceStats) {
      const spirit = named(result.spirits, entry.name);
      expect(spirit.id).toBe(named(runtime.spirits, entry.name).id);
      for (const [field, [old, updated]] of Object.entries(entry.fields)) {
        expect(named(runtime.spirits, entry.name).raceStats[field]).toBe(old);
        expect(spirit.raceStats[field]).toBe(updated);
        expect(spirit.changeInfo.items).toContainEqual(expect.objectContaining({ kind: "stat", field, before: old, after: updated }));
      }
      expect(spirit.raceStats.total).toBe(["hp", "physicalAttack", "magicalAttack", "physicalDefense", "magicalDefense", "speed"]
        .reduce((sum, key) => sum + spirit.raceStats[key], 0));
      expect(spirit.changeInfo).toMatchObject({ isNew: false, patch: { seasonId: "S5", date: "预计 2026.11.05" } });
    }
    for (const name of ["幽影树（突变的样子）", "岚鸟（秋天的样子）"]) {
      expect(named(result.spirits, name).raceStats).toEqual(named(runtime.spirits, name).raceStats);
    }
    expect(result.meta).toBe(runtime.meta);
    expect(result.spirits.map(({ id }) => id)).toEqual(runtime.spirits.map(({ id }) => id));
    expect(result.skills.map(({ id }) => id)).toEqual(runtime.skills.map(({ id }) => id));
    expect(runtime).toEqual(before);
    expect(applyS5SeasonAnnouncement(result)).toBe(result);
  });

  test("10项技能参数、三项特性同步，未接入效果不伪装已支持", () => {
    const result = applyS5SeasonAnnouncement(runtime);
    expect(notice.skills).toHaveLength(10);
    for (const entry of notice.skills) {
      const skill = named(result.skills, entry.name);
      for (const [field, [, after]] of Object.entries(entry.fields)) expect(skill[field]).toBe(after);
      expect(skill.changeInfo.isNew).toBe(false);
      if (entry.pending) expect(skill.s5StatusEffectPending).toBe(entry.pending);
    }
    expect(named(result.skills, "暖阳")).toMatchObject({ basePower: 65, ruleId: "stack_scaled", ruleParams: { perStack: 60 } });
    expect(getSkillEffectRule(named(result.skills, "暖阳")).ruleParams.perStack).toBe(60);
    expect(getSkillEffectRule(named(runtime.skills, "暖阳")).ruleParams.perStack).toBe(40);
    expect(getDefenseSkillReductionPercent(named(result.skills, "暖气"))).toBe(80);
    expect(getDefenseSkillReductionPercent(named(runtime.skills, "暖气"))).toBe(70);
    for (const entry of notice.traits) {
      const trait = named(result.traits, entry.name);
      expect(trait.description).toBe(entry.after);
      for (const owner of result.spirits.filter(item => item.traitIds?.includes(trait.id))) {
        expect(owner.changeInfo.items).toContainEqual(expect.objectContaining({ kind: "trait", before: entry.before, after: entry.after }));
      }
    }
    expect(named(result.traits, "换碟")).toMatchObject({ s5PendingSkillNames: ["广播"], s5PendingReason: expect.stringContaining("尚未公布") });
  });

  test.each([["raw", raw], ["runtime", runtime]])("%s学习面迁移仅替换血脉途径，保留其它学习来源", (_kind, snapshot) => {
    const before = structuredClone(snapshot);
    const result = applyS5SeasonAnnouncement(snapshot);
    expect(notice.learnsets).toHaveLength(11);
    expect(notice.bloodlines.flatMap(({ spirits }) => spirits)).toHaveLength(15);
    for (const entry of notice.learnsets) {
      expect(learning(result, entry.spirit).skillIds).toContain(skillId(entry.skill));
      expect(learning(result, entry.spirit).acquisitions[skillId(entry.skill)])
        .toContain(entry.method ?? "公告新增；具体学习途径待公布");
    }
    expect(learning(result, "卷毛鸭").acquisitions[skillId("回旋踢")]).toContain("默认学习 Lv.48");
    for (const entry of notice.bloodlines) {
      for (const name of entry.spirits) {
        const original = learning(snapshot, name);
        const updated = learning(result, name);
        const old = skillId(entry.before);
        const next = skillId(entry.after);
        const onlyBloodline = original.acquisitions?.[old]
          ? original.acquisitions[old].every(method => method.startsWith(`${entry.type}系血脉`))
          : original.bloodlineSkillIds.includes(old);
        expect(updated.skillIds.includes(old)).toBe(!onlyBloodline);
        expect(updated.skillIds).toContain(next);
        expect(updated.acquisitions[next]).toContain(`${entry.type}系血脉 Lv.15`);
        expect(updated.acquisitions[old]?.some(method => method.startsWith(`${entry.type}系血脉`)) ?? false).toBe(false);
        expect(updated.bloodlineSkillIds).not.toContain(old);
        if (updated.defaultSkillIds) expect(updated.defaultSkillIds.every(id => updated.skillIds.includes(id))).toBe(true);
      }
    }
    expect(snapshot).toEqual(before);
    if (snapshot.currentPatchChanges) {
      expect(result.currentPatchChanges.patch).toBe(notice.patch);
      expect(result.currentPatchChanges.skills.filter(entry => entry.patch.id === notice.patch.id)).toHaveLength(10);
      const emitted = buildRuntimeSnapshot(result);
      expect(named(emitted.spirits, "烈火守护").changeInfo).toEqual(named(runtime.spirits, "烈火守护").changeInfo);
      expect(named(emitted.spirits, "森巨人").changeInfo.history[0]).toEqual(named(runtime.spirits, "森巨人").changeInfo);
    }
  });

  test("原技能还有技能石来源时只撤血脉，不误删技能与默认携带", () => {
    const snapshot = structuredClone(raw);
    const original = learning(snapshot, "森巨人");
    original.acquisitions[skillId("贯手")].push("技能石");
    original.defaultSkillIds = [skillId("贯手")];
    const updated = learning(applyS5SeasonAnnouncement(snapshot), "森巨人");
    expect(updated.acquisitions[skillId("贯手")]).toEqual(["技能石"]);
    expect(updated.skillIds).toContain(skillId("贯手"));
    expect(updated.defaultSkillIds).toEqual([skillId("贯手")]);
    expect(updated.bloodlineSkillIds).not.toContain(skillId("贯手"));
  });

  test("正式S5和国际服不重放前瞻；基线发生漂移时拒绝静默覆盖", () => {
    for (const meta of [{ ...runtime.meta, seasonId: "S5" }, { ...runtime.meta, serverId: "global" }]) {
      const snapshot = { ...runtime, meta };
      expect(applyS5SeasonAnnouncement(snapshot)).toBe(snapshot);
    }
    const snapshot = structuredClone(runtime);
    named(snapshot.skills, "蹦跶").basePower = 999;
    expect(() => applyS5SeasonAnnouncement(snapshot)).toThrow("S5公告基线不符：蹦跶.basePower");
  });

  test("新公告不清空旧改动：未变化精灵保留原记录，同一精灵分补丁累积且不改旧日期", () => {
    const result = applyS5SeasonAnnouncement(runtime);
    const fire = named(result.spirits, "烈火守护");
    expect(fire.changeInfo).toBe(named(runtime.spirits, "烈火守护").changeInfo);
    expect(fire.changeInfo.patch.date).toBe("2026.09.10");
    expect(fire.changeInfo.items).toContainEqual(expect.objectContaining({ field: "physicalAttack", before: 117, after: 79 }));
    const giant = named(result.spirits, "森巨人");
    expect(giant.changeInfo.patch).toBe(notice.patch);
    expect(giant.changeInfo.history).toEqual([named(runtime.spirits, "森巨人").changeInfo]);
    expect(giant.changeInfo.history[0].items).toContainEqual(expect.objectContaining({ kind: "learnset", after: "后发制人" }));
    for (const [kind, entries] of [["spirits", runtime.spirits], ["skills", runtime.skills]]) {
      for (const previous of entries.filter(entity => entity.changeInfo)) {
        const updated = result[kind].find(entity => entity.id === previous.id).changeInfo;
        expect([updated, ...(updated.history ?? [])]).toContainEqual(previous.changeInfo);
      }
    }
    const { seasonAnnouncement: _marker, ...withoutMarker } = result;
    const repeated = applyS5SeasonAnnouncement(withoutMarker);
    expect(named(repeated.spirits, "森巨人").changeInfo).toEqual(giant.changeInfo);
  });
});
