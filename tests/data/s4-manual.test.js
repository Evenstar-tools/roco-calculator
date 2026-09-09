import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import { applyS4Manual } from "../../scripts/bwiki/apply-s4-manual.mjs";
import { validateSnapshot } from "../../scripts/bwiki/validate.mjs";
import { matchesSource, spiritSkills, querySpiritFamilies } from "../../src/features/skill-query/query-model.js";
import { getLegalSkillIds, chooseDefaultSkillIds } from "../../src/domain/skill-loadout.js";
import { unpackCatalog } from "../../src/features/skill-query/catalog.js";
import { readS4PreviewSnapshot } from "../fixtures/s4-preview-snapshot.js";

const read = (path) => JSON.parse(readFileSync(path, "utf8"));
const evidence = read("data/reviewed/s4-manual-2026-09-09.json");
const current = read("data/snapshots/current.json");
const categories = { 自学: "default", 血脉: "血脉", 技能石: "技能石" };

describe("S4 正式手册学习面", () => {
  test("未获 BWIKI 印证的麦芒和冰锋零威力不能由旧截图证据重新写入", () => {
    const staleEvidence = structuredClone(evidence);
    staleEvidence.standaloneSkills.push({ name: "麦芒", cost: 5, damageClass: "物理", element: "草",
      basePower: 105, description: "截图候选", imageIndex: 2, spiritBinding: null });
    staleEvidence.corrections.push({ name: "冰锋横扫", type: "冰", cost: 4, basePower: 0, imageIndex: 6 });
    const result = applyS4Manual(readS4PreviewSnapshot(), staleEvidence);
    expect(result.skills.some(({ name }) => name === "麦芒")).toBe(false);
    expect(result.skills.find(({ name }) => name === "冰锋横扫")?.basePower).toBe(1);
    expect(result.skills.find(({ id }) => id === "skill_f7eea4de117d30ed")?.name).toBe("引力偏转");
    expect(result.learnsets.find(({ spiritId }) => spiritId === "spirit_d8e175477972f74d").skillIds)
      .toContain("skill_15fb272dc50faf16");
    expect(applyS4Manual(result, staleEvidence)).toEqual(result);
  });
  test("活动快照与生成查询目录完整回读 10 个编号、463 条分类关系", () => {
    const season = unpackCatalog(read("public/data/skill-query/catalog.json")).seasons.find(({ id }) => id === "S4");
    let count = 0;
    for (const record of evidence.spirits) {
      expect(Number(current.spirits.find(({ id }) => id === record.spiritId)?.dexNo)).toBe(record.dexNo);
      const entry = current.learnsets.find(({ spiritId }) => spiritId === record.spiritId);
      const rows = spiritSkills(season, record.spiritId);
      expect(getLegalSkillIds(current, record.spiritId)).toEqual(entry.skillIds);
      expect(rows.length).toBeGreaterThan(4);
      expect(rows.map(({ id }) => id).sort()).toEqual([...entry.skillIds].sort());
      for (const [category, filter] of Object.entries(categories)) {
        const filtered = rows.filter(({ methods }) => methods.some((text) => matchesSource(text, filter)));
        expect(filtered.map(({ name }) => name).sort()).toEqual([...record.learnsets[category]].sort());
        count += filtered.length;
      }
      expect(Object.values(entry.acquisitions).flat().some((text) => /Lv\./i.test(text))).toBe(true);
      expect(entry.sources).toEqual([expect.objectContaining({ revision: 7271 })]);
      expect(chooseDefaultSkillIds(current, record.spiritId).filter(Boolean).every((id) => entry.skillIds.includes(id))).toBe(true);
    }
    expect(count).toBe(463);
    const wolf = evidence.spirits.find(({ name }) => name === "银月狼王");
    const particle = season.skills.find(({ name }) => name === "粒子对撞");
    expect(querySpiritFamilies(season, { skillIds: [particle.id], source: "default" }).some(({ members }) =>
      members.some(({ id }) => id === wolf.spiritId))).toBe(true);
  });

  test("正式更名沿用 ID；明确绑定迁移，不臆造别名或麦芒归属", () => {
    expect(current.skills.find(({ id }) => id === "skill_f7eea4de117d30ed")?.name).toBe("引力偏转");
    expect(current.skills.some(({ name }) => name === "引力旋转")).toBe(false);
    expect(current.skills.find(({ name }) => name === "冰锋横扫")).toMatchObject({ type: "冰", cost: 4, basePower: 1 });
    const maimang = current.skills.find(({ name }) => name === "麦芒");
    expect(maimang).toMatchObject({ basePower: 105, cost: 5, type: "草", category: "physical" });
    expect(evidence.pending.map(({ name }) => name)).toEqual(["麦芒", "冰锋横扫"]);
    expect(evidence.standaloneSkills.some(({ name }) => name === "麦芒")).toBe(false);
    expect(evidence.corrections.some(({ name }) => name === "冰锋横扫")).toBe(false);
    const tractor = current.skills.find(({ name }) => name === "拖拉机");
    expect(tractor).toMatchObject({ type: "机械", category: "physical", cost: 3, basePower: 85,
      description: "造成物伤，位于1号位时，先手+1。传动1。" });
    expect(current.learnsets.some(({ skillIds }) => skillIds.includes(tractor.id))).toBe(true);
    for (const skill of [tractor]) {
      const png = readFileSync(`public${skill.asset.sourceUrl}`);
      expect(png.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
      expect([png.readUInt32BE(16), png.readUInt32BE(20)]).toEqual([128, 128]);
      expect(skill.asset.status).toBe("screenshot-crop");
    }
    const namesFor = (name) => {
      const record = evidence.spirits.find((entry) => entry.name === name);
      const ids = current.learnsets.find(({ spiritId }) => spiritId === record.spiritId).skillIds;
      return current.skills.filter(({ id }) => ids.includes(id)).map(({ name }) => name);
    };
    expect(namesFor("摇铃魔偶")).toContain("午夜噪音");
    expect(namesFor("摇铃魔偶")).not.toContain("午夜爆音");
    expect(namesFor("智辉章脑")).toEqual(expect.arrayContaining(["涌泉", "落雨"]));
    expect(namesFor("智辉章脑")).not.toEqual(expect.arrayContaining(["水波术"]));
    expect(namesFor("智辉章脑")).not.toContain("降雨");
    expect(current.skills.some(({ name }) => name === "午夜爆音")).toBe(true);
  });

  test("重复覆盖幂等、校验通过且非目标精灵和学习面不变", () => {
    const result = applyS4Manual(current, evidence);
    expect(result).toEqual(current);
    expect(validateSnapshot(result).ok).toBe(true);
    const ids = new Set(evidence.spirits.map(({ spiritId }) => spiritId));
    expect(result.spirits.filter(({ id }) => !ids.has(id))).toEqual(current.spirits.filter(({ id }) => !ids.has(id)));
    expect(result.learnsets.filter(({ spiritId }) => !ids.has(spiritId))).toEqual(current.learnsets.filter(({ spiritId }) => !ids.has(spiritId)));
  });

  test("来源错误、重复归属和已存在同名实体会阻断", () => {
    const current = readS4PreviewSnapshot();
    const broken = structuredClone(evidence);
    broken.spirits[0].raceStats.生命++;
    expect(() => applyS4Manual(current, broken)).toThrow("种族值不匹配");
    const duplicated = structuredClone(evidence);
    duplicated.spirits[0].learnsets.自学.push("防御");
    expect(() => applyS4Manual(current, duplicated)).toThrow("463");
    const collision = structuredClone(current);
    collision.skills.push({ id: "other", name: "引力偏转" });
    expect(() => applyS4Manual(collision, evidence)).toThrow("同名技能");
  });
});
