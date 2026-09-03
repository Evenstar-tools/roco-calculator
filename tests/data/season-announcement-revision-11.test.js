import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import { apply2026SeptemberSeasonAnnouncement } from "../../scripts/bwiki/apply-2026-09-season-announcement.mjs";

const baseline = JSON.parse(readFileSync("data/snapshots/current.json", "utf8"));
const ANNOUNCEMENT_URL = "https://my.feishu.cn/docx/KnSddeY5DovSkpxqEh8cIZTvnod";

const RACE_STAT_TARGETS = [
  ["加油蟹", { hp: 116, speed: 100, physicalAttack: 92, magicalAttack: 92, physicalDefense: 128, magicalDefense: 128, total: 656 }],
  ["加油蟹（单只海葵的样子）", { hp: 116, speed: 95, physicalAttack: 130, magicalAttack: 58, physicalDefense: 128, magicalDefense: 128, total: 655 }],
  ["烈火守护", { hp: 105, speed: 65, physicalAttack: 79, magicalAttack: 13, physicalDefense: 110, magicalDefense: 93, total: 465 }],
  ["火羽", { hp: 78, speed: 120, physicalAttack: 65, magicalAttack: 81, physicalDefense: 61, magicalDefense: 106, total: 511 }],
  ["卡拉波斯", { hp: 117, speed: 85, physicalAttack: 81, magicalAttack: 23, physicalDefense: 82, magicalDefense: 68, total: 456 }],
  ["声波缇塔", { hp: 92, speed: 105, physicalAttack: 124, magicalAttack: 48, physicalDefense: 113, magicalDefense: 85, total: 567 }],
  ["游蛇魔使", { hp: 83, speed: 130, physicalAttack: 112, magicalAttack: 104, physicalDefense: 103, magicalDefense: 103, total: 635 }],
  ["夜游魔", { hp: 132, speed: 55, physicalAttack: 103, magicalAttack: 101, physicalDefense: 100, magicalDefense: 127, total: 618 }],
  ["布克棱岩", { hp: 130, speed: 70, physicalAttack: 144, magicalAttack: 54, physicalDefense: 168, magicalDefense: 159, total: 725 }],
  ["迷嶂布莱克", { hp: 136, speed: 70, physicalAttack: 148, magicalAttack: 57, physicalDefense: 173, magicalDefense: 163, total: 747 }],
  ["深渊蛙", { hp: 113, speed: 110, physicalAttack: 143, magicalAttack: 60, physicalDefense: 116, magicalDefense: 87, total: 629 }],
  ["红绒十字", { hp: 137, speed: 90, physicalAttack: 42, magicalAttack: 108, physicalDefense: 100, magicalDefense: 127, total: 604 }],
  ["半朽蜜果灵", { hp: 128, speed: 110, physicalAttack: 54, magicalAttack: 138, physicalDefense: 84, magicalDefense: 106, total: 620 }],
  ["稻草守护者", { hp: 128, speed: 55, physicalAttack: 96, magicalAttack: 96, physicalDefense: 121, magicalDefense: 121, total: 617 }],
  ["克莱因龙", { hp: 100, speed: 100, physicalAttack: 50, magicalAttack: 131, physicalDefense: 83, magicalDefense: 105, total: 569 }],
  ["怒目怂猫", { hp: 92, speed: 95, physicalAttack: 136, magicalAttack: 130, physicalDefense: 111, magicalDefense: 95, total: 659 }],
  ["烟花伯爵", { hp: 95, speed: 95, physicalAttack: 55, magicalAttack: 129, physicalDefense: 73, magicalDefense: 111, total: 558 }],
  ["铠甲虫", { hp: 132, speed: 75, physicalAttack: 95, magicalAttack: 43, physicalDefense: 128, magicalDefense: 82, total: 555 }],
  ["花衣蝶", { hp: 132, speed: 100, physicalAttack: 72, magicalAttack: 77, physicalDefense: 89, magicalDefense: 100, total: 570 }],
  ["炽心勇狮", { hp: 137, speed: 80, physicalAttack: 62, magicalAttack: 126, physicalDefense: 88, magicalDefense: 130, total: 623 }],
  ["饮雪狂兽", { hp: 104, speed: 125, physicalAttack: 110, magicalAttack: 40, physicalDefense: 111, magicalDefense: 103, total: 593 }],
  ["徘徊爪爪", { hp: 95, speed: 125, physicalAttack: 100, magicalAttack: 27, physicalDefense: 109, magicalDefense: 95, total: 551 }],
  ["音速犬", { hp: 85, speed: 120, physicalAttack: 116, magicalAttack: 38, physicalDefense: 101, magicalDefense: 82, total: 542 }],
  ["风暴战犬", { hp: 85, speed: 120, physicalAttack: 116, magicalAttack: 38, physicalDefense: 101, magicalDefense: 82, total: 542 }],
  ["春花兔", { hp: 102, speed: 105, physicalAttack: 73, magicalAttack: 74, physicalDefense: 103, magicalDefense: 90, total: 547 }],
  ["星光狮（月光能量的样子）", { hp: 80, speed: 125, physicalAttack: 107, magicalAttack: 95, physicalDefense: 90, magicalDefense: 120, total: 617 }],
  ["爵士鹿", { hp: 92, speed: 120, physicalAttack: 77, magicalAttack: 20, physicalDefense: 120, magicalDefense: 97, total: 526 }],
  ["波普鹿", { hp: 92, speed: 125, physicalAttack: 81, magicalAttack: 21, physicalDefense: 125, magicalDefense: 101, total: 545 }],
  ["巨鼓象", { hp: 130, speed: 80, physicalAttack: 107, magicalAttack: 70, physicalDefense: 153, magicalDefense: 56, total: 596 }],
];

const TRAIT_DESCRIPTION_TARGETS = [
  ["威慑", "打断对手技能时，获得双攻+30%，被打断的技能进入2回合冷却。"],
  ["高浓生物碱", "使用草系技能时，敌方获得3层中毒。"],
  ["地脉馈赠", "突破能量上限并立即回复10能量，入场前己方精灵每使用1次地系技能，回复3能量。"],
  ["鼓气", "使用能耗为3的技能时，获得双攻和双防+20%。"],
  ["三鼓作气", "使用能耗为3的技能后，获得双攻和双防永久+20%。"],
  ["展翅", "在场时，自己携带的普通系技能变为翼系技能，若后于敌方行动，自己受到的伤害+25%。"],
  ["大雪球", "自己使用2次不同的冰系技能后，敌方获得4层冻结，随后特性重置。"],
  ["上锁", "敌方本回合使用的技能，冷却1回合。"],
];

const SKILL_TARGETS = [
  ["超声波", { cost: 2, basePower: 0, description: "自己获得全技能威力+20，选择：本次能耗-1或应对防御时改为全技能威力永久+20。" }],
  ["远程访问", { cost: 1, basePower: 0, description: "使敌方精灵返场。" }],
  ["暗箱操作", { cost: 1, basePower: 0, description: "自己获得双攻和双防-50%，应对防御：改为敌方获得双攻和双防-120%。" }],
  ["撕咬", { cost: 3, basePower: 20, description: "造成物伤，3连击，若自己的生命低于50%，本次技能连击数+2。" }],
  ["趁火打劫", { cost: 3, basePower: 40, description: "造成物伤，2连击，若击败敌方，本技能连击数永久+2。" }],
  ["流星火雨", { cost: 3, basePower: 85, description: "造成物伤，每次击败敌方，本技能威力永久+85。" }],
  ["蓄能轰击", { cost: 6, basePower: 120, description: "造成魔伤，每使用1次其他普通系技能，本技能能耗永久-2。" }],
  ["四维降解", { cost: 7, basePower: 110, description: "造成魔伤，敌方每有1层印记，本技能能耗-1。" }],
  ["草虫冲击", { cost: 3, basePower: 75, description: "造成物伤，若敌方本回合更换精灵，本次威力+90且无视敌方系别抵抗。" }],
  ["赤子之心", { cost: 2, basePower: 0, description: "自己获得萌化：全技能能耗永久-2。" }],
  ["雪原狩猎", { cost: 3, basePower: 85, description: "造成物伤，天气为暴风雪时，本次技能威力+50。" }],
  ["轴承支撑", { cost: 6, basePower: 0, description: "主动：本技能被动永久额外-1能耗，被动：两侧技能能耗-1，传动1。" }],
  ["孢子爆散", { cost: 3, basePower: 30, description: "造成物伤，2连击，每次使用后，本技能连击数永久+2。" }],
  ["超导", { cost: 3, basePower: 90, description: "造成魔伤，迸发：本次能耗-2。" }],
  ["截拳", { cost: 3, basePower: 85, description: "造成物伤，应对状态：造成打断，回复被打断技能能耗的能量。" }],
  ["毒雾", { cost: 7, basePower: 0, description: "将敌方所有增益，转化为相同层数的中毒。" }],
  ["撒娇", { cost: 3, basePower: 30, description: "造成魔伤，3连击。自己获得萌化：全技能威力永久+10。" }],
  ["吨位压制", { cost: 3, basePower: 160, description: "造成物伤，敌方体重越低，本次技能威力越高。" }],
  ["星痕", { cost: 3, basePower: 90, description: "造成魔伤，若敌方有印记，本次技能威力+40。" }],
  ["薄纱环", { cost: 3, basePower: 0, description: "选择：敌方随机获得1种负面印记或自己随机获得1种正面印记。" }],
];

const ANNOUNCEMENT_ACQUISITION = "解锁：赛季公告新增学习面";
const LEARNSET_TARGETS = [
  ["鸭吉吉（蓬松的样子）", "加固", ANNOUNCEMENT_ACQUISITION],
  ["鸭吉吉（急急急鸭）", "加固", ANNOUNCEMENT_ACQUISITION],
  ["鸭吉吉（燃了鸭）", "加固", ANNOUNCEMENT_ACQUISITION],
  ["鸭吉吉（紧实的样子）", "热身运动", ANNOUNCEMENT_ACQUISITION],
  ["鸭吉吉（等一等鸭）", "热身运动", ANNOUNCEMENT_ACQUISITION],
  ["鸭吉吉（起来鸭）", "热身运动", ANNOUNCEMENT_ACQUISITION],
  ["卡拉波斯", "血气", ANNOUNCEMENT_ACQUISITION],
  ["蝎子王", "地刺", ANNOUNCEMENT_ACQUISITION],
  ["梦悠悠（穿旧睡衣的样子）", "嘲弄", ANNOUNCEMENT_ACQUISITION],
  ["梦悠悠（穿星星睡衣的样子）", "嘲弄", ANNOUNCEMENT_ACQUISITION],
  ["深蓝鲸", "洗礼", ANNOUNCEMENT_ACQUISITION],
  ["声波缇塔", "蒸汽进行曲", ANNOUNCEMENT_ACQUISITION],
  ["半朽蜜果灵", "入梦", ANNOUNCEMENT_ACQUISITION],
  ["梦想三三", "追打", ANNOUNCEMENT_ACQUISITION],
  ["绅士鸡", "叠势", ANNOUNCEMENT_ACQUISITION],
  ["针叶巡林", "回旋踢", "解锁：Lv.50"],
  ["怒目怂猫", "芳香诱引", ANNOUNCEMENT_ACQUISITION],
  ["星云旅者", "超导加速", ANNOUNCEMENT_ACQUISITION],
  ["夜游魔", "试飞", ANNOUNCEMENT_ACQUISITION],
  ["珀尔鼬", "加油", ANNOUNCEMENT_ACQUISITION],
  ["立方人", "轮班", ANNOUNCEMENT_ACQUISITION],
  ["格兰球", "吹散", ANNOUNCEMENT_ACQUISITION],
  ["蒲公英娃娃", "撒花", ANNOUNCEMENT_ACQUISITION],
  ["森巨人", "后发制人", ANNOUNCEMENT_ACQUISITION],
  ["克莱因龙", "守护咒", ANNOUNCEMENT_ACQUISITION],
  ["圣羽翼王", "俯冲猛击", ANNOUNCEMENT_ACQUISITION],
  ["红绒十字", "捧杀", ANNOUNCEMENT_ACQUISITION],
  ["古啦多", "毒液渗透", "解锁：Lv.50"],
  ["荆棘电环", "惊雷", ANNOUNCEMENT_ACQUISITION],
  ["星光狮（月光能量的样子）", "电弧", ANNOUNCEMENT_ACQUISITION],
  ["风滚暮虫（枯叶的样子）", "掩护", ANNOUNCEMENT_ACQUISITION],
  ["风滚暮虫（金黄的样子）", "掩护", ANNOUNCEMENT_ACQUISITION],
];

const SKILL_PROVENANCE_FIELDS = {
  超声波: ["description"],
  远程访问: ["cost"],
  暗箱操作: ["description"],
  撕咬: ["basePower"],
  趁火打劫: ["basePower"],
  流星火雨: ["basePower", "description"],
  蓄能轰击: ["basePower", "description"],
  四维降解: ["basePower"],
  草虫冲击: ["basePower", "description"],
  赤子之心: ["description"],
  雪原狩猎: ["basePower", "description"],
  轴承支撑: ["cost"],
  孢子爆散: ["description"],
  超导: ["basePower", "description"],
  截拳: ["description"],
  毒雾: ["description"],
  撒娇: ["description"],
  吨位压制: ["description"],
  星痕: ["description"],
  薄纱环: ["description"],
};

function spirit(snapshot, name) {
  return snapshot.spirits.find((candidate) => candidate.fullName === name);
}

function skill(snapshot, name) {
  return snapshot.skills.find((candidate) => candidate.name === name);
}

function trait(snapshot, name) {
  return snapshot.traits.find((candidate) => candidate.name === name);
}

function learnset(snapshot, spiritName) {
  const spiritId = spirit(snapshot, spiritName)?.id;
  return snapshot.learnsets.find((candidate) => candidate.spiritId === spiritId);
}

describe("2026-09 赛季公告 revision 11 数据候选补丁", () => {
  test("在内存副本更新公告已确认的加油蟹种族值，不改正式赛季身份", () => {
    const before = JSON.stringify(baseline);
    const patched = apply2026SeptemberSeasonAnnouncement(baseline);

    expect(spirit(patched, "加油蟹")?.raceStats).toMatchObject({
      physicalAttack: 92,
      magicalAttack: 92,
      speed: 100,
      total: 656,
    });
    expect(patched.meta).toMatchObject({
      id: baseline.meta.id,
      seasonId: baseline.meta.seasonId,
      rulesVersion: baseline.meta.rulesVersion,
      snapshotVersion: baseline.meta.snapshotVersion,
    });
    expect(JSON.stringify(baseline)).toBe(before);
    expect(patched).not.toBe(baseline);
  });

  test.each(RACE_STAT_TARGETS)("精确更新 %s 的六项种族值与总和", (name, raceStats) => {
    const patched = apply2026SeptemberSeasonAnnouncement(baseline);
    expect(spirit(patched, name)?.raceStats).toEqual(raceStats);
  });

  test.each(TRAIT_DESCRIPTION_TARGETS)("更新特性 %s 的公告描述", (name, description) => {
    const patched = apply2026SeptemberSeasonAnnouncement(baseline);
    expect(trait(patched, name)?.description).toBe(description);
  });

  test.each(SKILL_TARGETS)("更新技能 %s 的实体字段", (name, expected) => {
    const patched = apply2026SeptemberSeasonAnnouncement(baseline);
    expect(skill(patched, name)).toMatchObject(expected);
  });

  test.each(LEARNSET_TARGETS)("只给 %s 新增 %s 学习面", (spiritName, skillName, acquisition) => {
    const patched = apply2026SeptemberSeasonAnnouncement(baseline);
    const skillId = skill(patched, skillName)?.id;
    const entry = learnset(patched, spiritName);

    expect(entry?.skillIds).toContain(skillId);
    expect(entry?.acquisitions?.[skillId]).toContain(acquisition);
  });

  test("不把月光形态改动扩散到星光形态或鸭吉吉国王", () => {
    const patched = apply2026SeptemberSeasonAnnouncement(baseline);
    const starLightName = "星光狮（星光能量的样子）";
    const electricArcId = skill(patched, "电弧").id;
    expect(spirit(patched, starLightName)?.raceStats).toEqual(
      spirit(baseline, starLightName)?.raceStats,
    );
    expect(learnset(patched, starLightName)?.skillIds).not.toContain(electricArcId);

    const fortifyId = skill(patched, "加固").id;
    const warmUpId = skill(patched, "热身运动").id;
    for (const king of patched.spirits.filter((candidate) =>
      candidate.fullName.startsWith("鸭吉吉国王（"))) {
      const entry = patched.learnsets.find((candidate) => candidate.spiritId === king.id);
      const baselineEntry = baseline.learnsets.find((candidate) => candidate.spiritId === king.id);
      expect(entry).toEqual(baselineEntry);
      expect(entry.skillIds.includes(fortifyId)).toBe(baselineEntry.skillIds.includes(fortifyId));
      expect(entry.skillIds.includes(warmUpId)).toBe(baselineEntry.skillIds.includes(warmUpId));
    }
  });

  test("记录 revision 11 候选来源、字段 provenance 和稻草守护者基线差异", () => {
    const patched = apply2026SeptemberSeasonAnnouncement(baseline);
    const sourceMatch = { url: ANNOUNCEMENT_URL, revision: 11 };

    expect(patched.meta.seasonAnnouncementCandidate).toMatchObject({
      status: "candidate",
      source: {
        ...sourceMatch,
        sha256: "70982676ee52e8cbd45661298b865c855d36edfb569f5bb442efc1c742e490d7",
      },
      counts: {
        raceStats: 29,
        substantiveTraits: 2,
        descriptionOnlyTraits: 6,
        skillEntities: 14,
        descriptionOnlySkills: 6,
        learnsetPairs: 32,
      },
      baselineConflicts: [{
        entity: "稻草守护者",
        field: "raceStats.physicalAttack",
        snapshotValue: 88,
        announcementPreviousValue: 89,
        targetValue: 96,
      }],
    });
    expect(patched.meta.sources.filter((source) => source.url === ANNOUNCEMENT_URL)).toHaveLength(1);

    for (const [name] of RACE_STAT_TARGETS) {
      expect(spirit(patched, name).provenance.raceStats).toMatchObject(sourceMatch);
    }
    for (const [name] of TRAIT_DESCRIPTION_TARGETS) {
      expect(trait(patched, name).provenance.description).toMatchObject(sourceMatch);
    }
    for (const [name] of SKILL_TARGETS) {
      for (const field of SKILL_PROVENANCE_FIELDS[name]) {
        expect(skill(patched, name).provenance[field]).toMatchObject(sourceMatch);
      }
    }
    for (const [spiritName] of LEARNSET_TARGETS) {
      expect(learnset(patched, spiritName).provenance).toMatchObject({
        skillIds: sourceMatch,
        acquisitions: sourceMatch,
      });
    }
  });

  test("32 组学习面是相对基线的全部精确新增关系", () => {
    const withoutAnnouncementLearnsets = structuredClone(baseline);
    for (const [spiritName, skillName] of LEARNSET_TARGETS) {
      const skillId = skill(withoutAnnouncementLearnsets, skillName).id;
      const entry = learnset(withoutAnnouncementLearnsets, spiritName);
      entry.skillIds = entry.skillIds.filter((candidate) => candidate !== skillId);
      delete entry.acquisitions?.[skillId];
      entry.sources = (entry.sources ?? []).filter(
        (source) => source.url !== ANNOUNCEMENT_URL,
      );
    }
    const patched = apply2026SeptemberSeasonAnnouncement(
      withoutAnnouncementLearnsets,
    );
    const additions = [];
    for (const patchedLearnset of patched.learnsets) {
      const baselineLearnset = withoutAnnouncementLearnsets.learnsets.find(
        (candidate) => candidate.spiritId === patchedLearnset.spiritId,
      );
      for (const skillId of patchedLearnset.skillIds.filter(
        (candidate) => !baselineLearnset.skillIds.includes(candidate),
      )) {
        additions.push(`${patchedLearnset.spiritId}:${skillId}`);
      }
    }
    const expected = LEARNSET_TARGETS.map(([spiritName, skillName]) =>
      `${spirit(baseline, spiritName).id}:${skill(baseline, skillName).id}`,
    );
    expect(additions.sort()).toEqual(expected.sort());
  });

  test("重算 contentSha256，重复应用结果完全幂等", () => {
    const patched = apply2026SeptemberSeasonAnnouncement(baseline);
    expect(patched).toEqual(baseline);
    const hashInput = structuredClone(patched);
    hashInput.meta.contentSha256 = null;
    const expectedHash = createHash("sha256")
      .update(JSON.stringify(hashInput))
      .digest("hex");

    expect(patched.meta.contentSha256).toBe(expectedHash);
    expect(apply2026SeptemberSeasonAnnouncement(patched)).toEqual(patched);
  });

  test("只为稻草守护者物攻显式容忍公告旧值 89 与快照旧值 88", () => {
    const announcementOld = structuredClone(baseline);
    spirit(announcementOld, "稻草守护者").raceStats.physicalAttack = 89;
    expect(
      spirit(apply2026SeptemberSeasonAnnouncement(announcementOld), "稻草守护者")
        .raceStats.physicalAttack,
    ).toBe(96);

    const unexpected = structuredClone(baseline);
    spirit(unexpected, "稻草守护者").raceStats.physicalAttack = 90;
    expect(() => apply2026SeptemberSeasonAnnouncement(unexpected)).toThrow(
      /稻草守护者\.raceStats\.physicalAttack=90.*88\/89.*96/u,
    );
  });
});
