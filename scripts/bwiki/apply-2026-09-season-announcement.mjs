#!/usr/bin/env node
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { isDeepStrictEqual } from "node:util";

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

const CURRENT_PATCH = Object.freeze({
  id: "s4-preview-2026-09-10",
  label: "S4 前瞻调整",
  date: "2026.09.10",
  status: "preview",
});

const STAT_LABELS = Object.freeze({
  hp: "精力",
  speed: "速度",
  physicalAttack: "物攻",
  magicalAttack: "魔攻",
  physicalDefense: "物防",
  magicalDefense: "魔防",
});

const DESCRIPTION_ONLY_TRAITS = new Set([
  "地脉馈赠",
  "鼓气",
  "三鼓作气",
  "展翅",
  "大雪球",
  "上锁",
]);

const DESCRIPTION_ONLY_SKILLS = new Set([
  "截拳",
  "毒雾",
  "撒娇",
  "吨位压制",
  "星痕",
  "薄纱环",
]);

const RACE_STAT_PATCHES = Object.freeze([
  { id: "spirit_07b444210032f19b", fullName: "加油蟹", fields: { physicalAttack: [[108], 92], magicalAttack: [[108], 92], speed: [[95], 100] } },
  { id: "spirit_190dc8281c5049b1", fullName: "加油蟹（单只海葵的样子）", fields: { physicalAttack: [[155], 130], magicalAttack: [[61], 58] } },
  { id: "spirit_8e02f5b94a74428b", fullName: "烈火守护", fields: { physicalAttack: [[117], 79], magicalAttack: [[49], 13], physicalDefense: [[135], 110] } },
  { id: "spirit_fbd420db80dc3a39", fullName: "火羽", fields: { hp: [[94], 78], physicalAttack: [[82], 65], magicalAttack: [[100], 81], physicalDefense: [[72], 61], magicalDefense: [[121], 106] } },
  { id: "spirit_275dd104cb33f7c4", fullName: "卡拉波斯", fields: { hp: [[103], 117], physicalAttack: [[107], 81], magicalAttack: [[34], 23], physicalDefense: [[65], 82], magicalDefense: [[51], 68], speed: [[100], 85] } },
  { id: "spirit_24ff0f0e3504e1ca", fullName: "声波缇塔", fields: { physicalDefense: [[122], 113], magicalDefense: [[92], 85], speed: [[90], 105] } },
  { id: "spirit_40bee517b3857b1d", fullName: "游蛇魔使", fields: { hp: [[105], 83], physicalAttack: [[110], 112], speed: [[105], 130] } },
  { id: "spirit_9113b86360b2a162", fullName: "夜游魔", fields: { hp: [[126], 132], physicalAttack: [[99], 103], magicalAttack: [[98], 101], physicalDefense: [[97], 100], magicalDefense: [[123], 127] } },
  { id: "spirit_0573dd499a17d300", fullName: "布克棱岩", fields: { hp: [[120], 130], physicalAttack: [[135], 144], magicalAttack: [[49], 54], physicalDefense: [[159], 168], magicalDefense: [[150], 159] } },
  { id: "spirit_3fb98e0a461b35c8", fullName: "迷嶂布莱克", fields: { hp: [[125], 136], physicalAttack: [[139], 148], magicalAttack: [[52], 57], physicalDefense: [[164], 173], magicalDefense: [[154], 163] } },
  { id: "spirit_93e6120c353ab24b", fullName: "深渊蛙", fields: { physicalAttack: [[130], 143], magicalAttack: [[51], 60], physicalDefense: [[106], 116], magicalDefense: [[78], 87] } },
  { id: "spirit_2e7dd5cabd9695cb", fullName: "红绒十字", fields: { hp: [[112], 137], physicalAttack: [[47], 42], magicalAttack: [[122], 108] } },
  { id: "spirit_3c13248ddfa2a129", fullName: "半朽蜜果灵", fields: { hp: [[115], 128], physicalAttack: [[43], 54], magicalAttack: [[120], 138] } },
  { id: "spirit_db6b6d95ebcaa2e3", fullName: "稻草守护者", fields: { hp: [[116], 128], physicalAttack: [[88, 89], 96], magicalAttack: [[88], 96], physicalDefense: [[112], 121], magicalDefense: [[112], 121] } },
  { id: "spirit_77a7d75ef5d795a1", fullName: "克莱因龙", fields: { hp: [[90], 100], physicalAttack: [[45], 50], magicalAttack: [[122], 131] } },
  { id: "spirit_8e0dba092c6f9912", fullName: "怒目怂猫", fields: { physicalAttack: [[132], 136], magicalAttack: [[126], 130] } },
  { id: "spirit_765e2b577e6118df", fullName: "烟花伯爵", fields: { hp: [[76], 95], physicalAttack: [[44], 55], magicalAttack: [[111], 129], physicalDefense: [[62], 73], magicalDefense: [[97], 111] } },
  { id: "spirit_16b76c39e12ca79d", fullName: "铠甲虫", fields: { hp: [[122], 132], physicalAttack: [[88], 95], magicalAttack: [[39], 43], physicalDefense: [[121], 128], magicalDefense: [[77], 82] } },
  { id: "spirit_765165af4a4e54de", fullName: "花衣蝶", fields: { hp: [[122], 132], physicalAttack: [[67], 72], magicalAttack: [[72], 77], physicalDefense: [[84], 89], magicalDefense: [[94], 100] } },
  { id: "spirit_a339a9ece5b78fc4", fullName: "炽心勇狮", fields: { physicalAttack: [[51], 62], magicalAttack: [[111], 126] } },
  { id: "spirit_c0b03ac594c86309", fullName: "饮雪狂兽", fields: { physicalAttack: [[85], 110], magicalAttack: [[24], 40] } },
  { id: "spirit_2b2a9041fef7f98b", fullName: "徘徊爪爪", fields: { physicalAttack: [[78], 100], magicalAttack: [[14], 27] } },
  { id: "spirit_3a0b383ca1a11675", fullName: "音速犬", fields: { physicalAttack: [[128], 116], magicalAttack: [[46], 38] } },
  { id: "spirit_41a9a2fb4a1d89c0", fullName: "风暴战犬", fields: { physicalAttack: [[128], 116], magicalAttack: [[46], 38] } },
  { id: "spirit_698ad3439af7d73a", fullName: "春花兔", fields: { hp: [[79], 102], physicalAttack: [[85], 73], magicalAttack: [[95], 74] } },
  { id: "spirit_e0fd67c2b0e5c25a", fullName: "星光狮（月光能量的样子）", fields: { physicalAttack: [[95], 107], magicalAttack: [[107], 95] } },
  { id: "spirit_906f78a278f66fb9", fullName: "爵士鹿", fields: { physicalDefense: [[108], 120], magicalDefense: [[79], 97] } },
  { id: "spirit_7d22156a66708de3", fullName: "波普鹿", fields: { physicalAttack: [[79], 81], physicalDefense: [[108], 125], magicalDefense: [[79], 101], speed: [[120], 125] } },
  { id: "spirit_faed11065c114c00", fullName: "巨鼓象", fields: { physicalDefense: [[173], 153], magicalDefense: [[80], 56] } },
]);

const TRAIT_PATCHES = Object.freeze([
  { id: "trait_c1611e0f2ee58193", name: "威慑", fields: { description: [["打断敌方时，被打断的技能进入2回合冷却。"], "打断对手技能时，获得双攻+30%，被打断的技能进入2回合冷却。"] } },
  { id: "trait_632d5defc31b16ee", name: "高浓生物碱", fields: { description: [["使用技能时，敌方获得2层中毒。"], "使用草系技能时，敌方获得3层中毒。"] } },
  { id: "trait_f3f7497cc9d16d1a", name: "地脉馈赠", fields: { description: [["突破能量上限并立即回复10能量，入场前己方精灵每放1次地系技能，回复3能量。"], "突破能量上限并立即回复10能量，入场前己方精灵每使用1次地系技能，回复3能量。"] } },
  { id: "trait_5b5f3097136cd6af", name: "鼓气", fields: { description: [["使用能耗为3的技能时，获得攻防+20%。"], "使用能耗为3的技能时，获得双攻和双防+20%。"] } },
  { id: "trait_6f0891936e934711", name: "三鼓作气", fields: { description: [["使用能耗为3的技能后，获得攻防永久+20%。"], "使用能耗为3的技能后，获得双攻和双防永久+20%。"] } },
  { id: "trait_dbcf8cadeb3d4989", name: "展翅", fields: { description: [["在场时，自己携带的普通系技能变为翼系技能，若后于对手行动，自己受到的伤害+25%。"], "在场时，自己携带的普通系技能变为翼系技能，若后于敌方行动，自己受到的伤害+25%。"] } },
  { id: "trait_b7d63d4abf49503f", name: "大雪球", fields: { description: [["自己使用2次不同的冰系技能后，对手获得4层冻结，随后特性重置。"], "自己使用2次不同的冰系技能后，敌方获得4层冻结，随后特性重置。"] } },
  { id: "trait_1e52c367a184112a", name: "上锁", fields: { description: [["对手本回合使用的技能，冷却1回合。"], "敌方本回合使用的技能，冷却1回合。"] } },
]);

const SKILL_PATCHES = Object.freeze([
  { id: "skill_a3c2050b5f470df3", name: "超声波", fields: { description: [["自己获得全技能威力+30，选择：本次能耗-1或应对防御时改为全技能威力永久+50。"], "自己获得全技能威力+20，选择：本次能耗-1或应对防御时改为全技能威力永久+20。"] } },
  { id: "skill_162f11ceb70955d2", name: "远程访问", fields: { cost: [[2], 1] } },
  { id: "skill_0ebb81353e4ecea0", name: "暗箱操作", fields: { description: [["自己获得双攻和双防-100%，应对防御：改为敌方获得双攻和双防-100%。"], "自己获得双攻和双防-50%，应对防御：改为敌方获得双攻和双防-120%。"] } },
  { id: "skill_3491d62ec7b41367", name: "撕咬", fields: { basePower: [[30], 20] } },
  { id: "skill_7493c1e48121d954", name: "趁火打劫", fields: { basePower: [[35], 40] } },
  { id: "skill_1f1798619ec1665a", name: "流星火雨", fields: { basePower: [[75], 85], description: [["造成物伤，每次击败敌方，本技能威力永久+75。"], "造成物伤，每次击败敌方，本技能威力永久+85。"] } },
  { id: "skill_d4dddfc511487134", name: "蓄能轰击", fields: { basePower: [[130], 120], description: [["造成魔伤，每使用1次普通系技能，本技能能耗永久-2。"], "造成魔伤，每使用1次其他普通系技能，本技能能耗永久-2。"] } },
  { id: "skill_e7190f67c1436b31", name: "四维降解", fields: { basePower: [[100], 110] } },
  { id: "skill_e01509f59dbc4412", name: "草虫冲击", fields: { basePower: [[80], 75], description: [["造成物伤，若敌方本回合更换精灵，本次威力+50且无视敌方系别抵抗。"], "造成物伤，若敌方本回合更换精灵，本次威力+90且无视敌方系别抵抗。"] } },
  { id: "skill_81fc9d5acbe7cff4", name: "赤子之心", fields: { description: [["自己获得萌化：全技能能耗永久-3。"], "自己获得萌化：全技能能耗永久-2。"] } },
  { id: "skill_f299a496d784ca41", name: "雪原狩猎", fields: { basePower: [[80], 85], description: [["造成物伤，天气为暴风雪时，本次技能威力+50%"], "造成物伤，天气为暴风雪时，本次技能威力+50。"] } },
  { id: "skill_7557b6b5d0679ea5", name: "轴承支撑", fields: { cost: [[3], 6] } },
  { id: "skill_1d9f1ae3c5d3e1ab", name: "孢子爆散", fields: { description: [["造成物伤，1连击，每次使用后，本技能连击数永久+2。"], "造成物伤，2连击，每次使用后，本技能连击数永久+2。"] } },
  { id: "skill_808e1f607ccd30fa", name: "超导", fields: { basePower: [[95], 90], description: [["造成魔伤，迸发：本技能能耗-1。"], "造成魔伤，迸发：本次能耗-2。"] } },
  { id: "skill_f327d11c4fd7e0d6", name: "截拳", fields: { description: [["造成物伤，应对状态：额外造成打断，回复该技能能耗的能量。"], "造成物伤，应对状态：造成打断，回复被打断技能能耗的能量。"] } },
  { id: "skill_e6ea0fbb90847402", name: "毒雾", fields: { description: [["将敌方所有增益，转化成中毒。"], "将敌方所有增益，转化为相同层数的中毒。"] } },
  { id: "skill_ee0a123988e4be1e", name: "撒娇", fields: { description: [["造成魔伤，3连击。自己获得萌化：威力永久+10。"], "造成魔伤，3连击。自己获得萌化：全技能威力永久+10。"] } },
  { id: "skill_f97cf2e23c6efabe", name: "吨位压制", fields: { description: [["造成物伤，敌方体重越低，威力越高。"], "造成物伤，敌方体重越低，本次技能威力越高。"] } },
  { id: "skill_6194bbf8e0904193", name: "星痕", fields: { description: [["造成魔伤，若对手有印记，本次技能威力+40。"], "造成魔伤，若敌方有印记，本次技能威力+40。"] } },
  { id: "skill_75d2f819add5e4fa", name: "薄纱环", fields: { description: [["选择：对手随机获得1种负面印记或自己随机获得1种正面印记。"], "选择：敌方随机获得1种负面印记或自己随机获得1种正面印记。"] } },
]);

const ANNOUNCEMENT_ACQUISITION = "解锁：赛季公告新增学习面";
const LEARNSET_PATCHES = Object.freeze([
  ["spirit_6d78e04a6736155b", "鸭吉吉（蓬松的样子）", "skill_839c477ec1f9b98a", "加固", ANNOUNCEMENT_ACQUISITION],
  ["spirit_35643e306cb87bad", "鸭吉吉（急急急鸭）", "skill_839c477ec1f9b98a", "加固", ANNOUNCEMENT_ACQUISITION],
  ["spirit_4b1d7354d6b9e310", "鸭吉吉（燃了鸭）", "skill_839c477ec1f9b98a", "加固", ANNOUNCEMENT_ACQUISITION],
  ["spirit_39d8b867216c267d", "鸭吉吉（紧实的样子）", "skill_ca2b8d247670d95a", "热身运动", ANNOUNCEMENT_ACQUISITION],
  ["spirit_cf730244912ada6a", "鸭吉吉（等一等鸭）", "skill_ca2b8d247670d95a", "热身运动", ANNOUNCEMENT_ACQUISITION],
  ["spirit_946f5527d5bee7f4", "鸭吉吉（起来鸭）", "skill_ca2b8d247670d95a", "热身运动", ANNOUNCEMENT_ACQUISITION],
  ["spirit_275dd104cb33f7c4", "卡拉波斯", "skill_5b4d21e36f02d1c9", "血气", ANNOUNCEMENT_ACQUISITION],
  ["spirit_3ba0ecc3da584c40", "蝎子王", "skill_a3cda3d9a2bcb243", "地刺", ANNOUNCEMENT_ACQUISITION],
  ["spirit_7d94980b59e9598d", "梦悠悠（穿旧睡衣的样子）", "skill_1d7df104c2853832", "嘲弄", ANNOUNCEMENT_ACQUISITION],
  ["spirit_7650ed24af7eea6e", "梦悠悠（穿星星睡衣的样子）", "skill_1d7df104c2853832", "嘲弄", ANNOUNCEMENT_ACQUISITION],
  ["spirit_37ea034163f3e376", "深蓝鲸", "skill_d457bb1dce36b046", "洗礼", ANNOUNCEMENT_ACQUISITION],
  ["spirit_24ff0f0e3504e1ca", "声波缇塔", "skill_f823b9ac0a20e60d", "蒸汽进行曲", ANNOUNCEMENT_ACQUISITION],
  ["spirit_3c13248ddfa2a129", "半朽蜜果灵", "skill_d0a829433030626d", "入梦", ANNOUNCEMENT_ACQUISITION],
  ["spirit_6d33a16d98f35c14", "梦想三三", "skill_004571bc89bd5faf", "追打", ANNOUNCEMENT_ACQUISITION],
  ["spirit_38995924fb931da3", "绅士鸡", "skill_a52aca8607fb6062", "叠势", ANNOUNCEMENT_ACQUISITION],
  ["spirit_de22accf29301363", "针叶巡林", "skill_83ffc9574e945e4f", "回旋踢", "解锁：Lv.50"],
  ["spirit_8e0dba092c6f9912", "怒目怂猫", "skill_f3275519c1b5f9c1", "芳香诱引", ANNOUNCEMENT_ACQUISITION],
  ["spirit_c81d428eaaa8e87b", "星云旅者", "skill_c20997a4545a7fd4", "超导加速", ANNOUNCEMENT_ACQUISITION],
  ["spirit_9113b86360b2a162", "夜游魔", "skill_8f87cd4c14187c54", "试飞", ANNOUNCEMENT_ACQUISITION],
  ["spirit_ec7062cf16b55b35", "珀尔鼬", "skill_6cfcf6e8186f638d", "加油", ANNOUNCEMENT_ACQUISITION],
  ["spirit_53a5e4ccea57fdd0", "立方人", "skill_5a0e55497774d6a3", "轮班", ANNOUNCEMENT_ACQUISITION],
  ["spirit_8de88e249e9a78f0", "格兰球", "skill_36daddc54d5080ac", "吹散", ANNOUNCEMENT_ACQUISITION],
  ["spirit_28ae7d1286fad58b", "蒲公英娃娃", "skill_305cb943265a8e8f", "撒花", ANNOUNCEMENT_ACQUISITION],
  ["spirit_59367d8effdf8a49", "森巨人", "skill_964a2b195a78a538", "后发制人", ANNOUNCEMENT_ACQUISITION],
  ["spirit_77a7d75ef5d795a1", "克莱因龙", "skill_20d28dfa458aa691", "守护咒", ANNOUNCEMENT_ACQUISITION],
  ["spirit_5ee78de2be28a163", "圣羽翼王", "skill_7338c2b2619d877c", "俯冲猛击", ANNOUNCEMENT_ACQUISITION],
  ["spirit_2e7dd5cabd9695cb", "红绒十字", "skill_6d6245d6cf0059c7", "捧杀", ANNOUNCEMENT_ACQUISITION],
  ["spirit_704f8b90c87b1bf6", "古啦多", "skill_943c1082aab118b1", "毒液渗透", "解锁：Lv.50"],
  ["spirit_57fff877bf40ffd4", "荆棘电环", "skill_d1c28ec80c85cf57", "惊雷", ANNOUNCEMENT_ACQUISITION],
  ["spirit_e0fd67c2b0e5c25a", "星光狮（月光能量的样子）", "skill_50d37932783c1b9d", "电弧", ANNOUNCEMENT_ACQUISITION],
  ["spirit_520c19c877338dd4", "风滚暮虫（枯叶的样子）", "skill_9b95db92bf2684a4", "掩护", ANNOUNCEMENT_ACQUISITION],
  ["spirit_47eda2b0ce0bbe10", "风滚暮虫（金黄的样子）", "skill_9b95db92bf2684a4", "掩护", ANNOUNCEMENT_ACQUISITION],
]);

const ANNOUNCEMENT_SOURCE = Object.freeze({
  title: "洛克王国赛季更新帖｜战斗机制与平衡性调整（校对文本）",
  url: "https://my.feishu.cn/docx/KnSddeY5DovSkpxqEh8cIZTvnod",
  revision: 11,
  fetchedAt: "2026-09-02T11:53:00.000+08:00",
  sha256: "70982676ee52e8cbd45661298b865c855d36edfb569f5bb442efc1c742e490d7",
});

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function recalculateRaceTotal(raceStats) {
  return [
    "hp",
    "speed",
    "physicalAttack",
    "magicalAttack",
    "physicalDefense",
    "magicalDefense",
  ].reduce((total, key) => total + raceStats[key], 0);
}

function requireSpirit(snapshot, id, fullName) {
  const matches = snapshot.spirits.filter((candidate) => candidate.id === id);
  if (matches.length !== 1 || matches[0].fullName !== fullName) {
    throw new Error(`2026-09 赛季公告补丁缺少精灵：${fullName} (${id})`);
  }
  return matches[0];
}

function requireNamedById(collection, id, name, kind) {
  const matches = collection.filter((candidate) => candidate.id === id);
  if (matches.length !== 1 || matches[0].name !== name) {
    throw new Error(`2026-09 赛季公告补丁缺少${kind}：${name} (${id})`);
  }
  return matches[0];
}

function applyCheckedFields(target, fields, context) {
  for (const [field, [expectedOldValues, value]] of Object.entries(fields)) {
    const actual = target[field];
    if (actual !== value && !expectedOldValues.includes(actual)) {
      throw new Error(
        `2026-09 赛季公告补丁基线漂移：${context}.${field}=${actual}，预期 ${expectedOldValues.join("/")} 或目标 ${value}`,
      );
    }
    target[field] = value;
  }
}

function requireLearnset(snapshot, spiritId, fullName) {
  const matches = snapshot.learnsets.filter((candidate) => candidate.spiritId === spiritId);
  if (matches.length !== 1) {
    throw new Error(`2026-09 赛季公告补丁缺少学习集：${fullName} (${spiritId})`);
  }
  return matches[0];
}

function replaceSourceByUrl(sources, source) {
  const next = [...(sources ?? [])];
  const index = next.findIndex(({ url }) => url === source.url);
  if (index === -1) next.push({ ...source });
  else next[index] = { ...source };
  return next;
}

function buildCurrentPatchChanges(snapshot) {
  const spiritEntries = new Map();
  const skillEntries = new Map();
  const addSpiritItem = (entityId, entityName, item) => {
    const entry = spiritEntries.get(entityId) ?? {
      entityId,
      entityName,
      items: [],
    };
    entry.items.push(item);
    spiritEntries.set(entityId, entry);
  };

  for (const patch of RACE_STAT_PATCHES) {
    for (const [field, [beforeValues, after]] of Object.entries(patch.fields)) {
      addSpiritItem(patch.id, patch.fullName, {
        kind: "stat",
        field,
        label: STAT_LABELS[field] ?? field,
        before: beforeValues[0],
        after,
      });
    }
  }

  for (const patch of TRAIT_PATCHES) {
    const descriptionOnly = DESCRIPTION_ONLY_TRAITS.has(patch.name);
    const [beforeValues, after] = patch.fields.description;
    for (const owner of snapshot.spirits.filter(({ traitIds }) =>
      traitIds?.includes(patch.id)
    )) {
      addSpiritItem(owner.id, owner.fullName, {
        kind: descriptionOnly ? "wording" : "trait",
        label: `特性·${patch.name}`,
        before: beforeValues[0],
        after,
        ...(descriptionOnly ? { note: "仅文案调整，效果不变" } : {}),
      });
    }
  }

  for (const patch of SKILL_PATCHES) {
    const descriptionOnly = DESCRIPTION_ONLY_SKILLS.has(patch.name);
    const entry = {
      entityId: patch.id,
      entityName: patch.name,
      descriptionOnly,
      items: Object.entries(patch.fields).map(([field, [beforeValues, after]]) => ({
        kind: field === "description"
          ? (descriptionOnly ? "wording" : "mechanic")
          : "stat",
        field,
        label: field === "basePower"
          ? "威力"
          : field === "cost"
            ? "能耗"
            : (descriptionOnly ? "文案" : "机制"),
        before: beforeValues[0],
        after,
        ...(descriptionOnly ? { note: "仅文案调整，效果不变" } : {}),
      })),
    };
    skillEntries.set(patch.id, entry);
  }

  for (const [spiritId, fullName, , skillName] of LEARNSET_PATCHES) {
    addSpiritItem(spiritId, fullName, {
      kind: "learnset",
      label: "新增可学习技能",
      after: skillName,
    });
  }

  for (const entry of snapshot.currentPatchChanges?.spirits ?? []) {
    if (!spiritEntries.has(entry.entityId)) spiritEntries.set(entry.entityId, entry);
  }
  for (const entry of snapshot.currentPatchChanges?.skills ?? []) {
    if (!skillEntries.has(entry.entityId)) skillEntries.set(entry.entityId, entry);
  }

  return {
    patch: {
      ...CURRENT_PATCH,
      sourceUrl: ANNOUNCEMENT_SOURCE.url,
    },
    spirits: [...spiritEntries.values()],
    skills: [...skillEntries.values()],
  };
}

function mergeCurrentPatchChanges(snapshot) {
  const generated = buildCurrentPatchChanges(snapshot);
  const existing = snapshot.currentPatchChanges;
  if (!existing) return generated;

  const preserveOtherEntries = (generatedEntries, existingEntries) => {
    const generatedIds = new Set(
      generatedEntries.map(({ entityId }) => entityId),
    );
    return [
      ...generatedEntries,
      ...(existingEntries ?? []).filter(
        ({ entityId }) => !generatedIds.has(entityId),
      ),
    ];
  };

  return {
    ...existing,
    ...generated,
    spirits: preserveOtherEntries(
      generated.spirits,
      existing.spirits,
    ),
    skills: preserveOtherEntries(generated.skills, existing.skills),
  };
}

export function apply2026SeptemberSeasonAnnouncement(snapshot) {
  const next = structuredClone(snapshot);
  for (const patch of RACE_STAT_PATCHES) {
    const spirit = requireSpirit(next, patch.id, patch.fullName);
    applyCheckedFields(spirit.raceStats, patch.fields, `${patch.fullName}.raceStats`);
    spirit.raceStats.total = recalculateRaceTotal(spirit.raceStats);
    spirit.provenance = {
      ...spirit.provenance,
      raceStats: { ...ANNOUNCEMENT_SOURCE },
    };
  }
  for (const patch of TRAIT_PATCHES) {
    const trait = requireNamedById(next.traits, patch.id, patch.name, "特性");
    applyCheckedFields(trait, patch.fields, `${patch.name}.trait`);
    trait.provenance = { ...trait.provenance };
    for (const field of Object.keys(patch.fields)) {
      trait.provenance[field] = { ...ANNOUNCEMENT_SOURCE };
    }
  }
  for (const patch of SKILL_PATCHES) {
    const skill = requireNamedById(next.skills, patch.id, patch.name, "技能");
    applyCheckedFields(skill, patch.fields, `${patch.name}.skill`);
    skill.provenance = { ...skill.provenance };
    for (const field of Object.keys(patch.fields)) {
      skill.provenance[field] = { ...ANNOUNCEMENT_SOURCE };
    }
  }
  for (const [spiritId, fullName, skillId, skillName, acquisition] of LEARNSET_PATCHES) {
    requireSpirit(next, spiritId, fullName);
    requireNamedById(next.skills, skillId, skillName, "技能");
    const learnset = requireLearnset(next, spiritId, fullName);
    if (!learnset.skillIds.includes(skillId)) learnset.skillIds.push(skillId);
    learnset.acquisitions ??= {};
    learnset.acquisitions[skillId] ??= [];
    if (!learnset.acquisitions[skillId].includes(acquisition)) {
      learnset.acquisitions[skillId].push(acquisition);
    }
    learnset.sources = [
      ...(learnset.sources ?? []).filter(
        (source) => source.url !== ANNOUNCEMENT_SOURCE.url,
      ),
      { ...ANNOUNCEMENT_SOURCE },
    ];
    learnset.provenance = {
      ...learnset.provenance,
      skillIds: { ...ANNOUNCEMENT_SOURCE },
      acquisitions: { ...ANNOUNCEMENT_SOURCE },
    };
  }

  next.meta = {
    ...next.meta,
    seasonAnnouncementCandidate: {
      status: "candidate",
      source: { ...ANNOUNCEMENT_SOURCE },
      counts: {
        raceStats: 29,
        substantiveTraits: 2,
        descriptionOnlyTraits: 6,
        skillEntities: 14,
        descriptionOnlySkills: 6,
        learnsetPairs: 32,
      },
      baselineConflicts: [
        {
          entity: "稻草守护者",
          field: "raceStats.physicalAttack",
          snapshotValue: 88,
          announcementPreviousValue: 89,
          targetValue: 96,
          resolution: "仅该字段容忍快照旧值88或公告旧值89，并统一应用公告目标96",
        },
      ],
      pending: ["新精灵", "新特性", "新技能及适配资料"],
    },
    sources: replaceSourceByUrl(
      next.meta.sources,
      ANNOUNCEMENT_SOURCE,
    ),
    contentSha256: null,
  };
  const currentPatchChanges = mergeCurrentPatchChanges(next);
  if (!isDeepStrictEqual(next.currentPatchChanges, currentPatchChanges)) {
    next.currentPatchChanges = currentPatchChanges;
  }
  next.meta.contentSha256 = sha256(JSON.stringify(next));
  return next;
}

async function main() {
  const sourcePath = path.join(PROJECT_ROOT, "data", "snapshots", "current.json");
  const snapshot = JSON.parse(await readFile(sourcePath, "utf8"));
  const patched = apply2026SeptemberSeasonAnnouncement(snapshot);
  await writeFile(sourcePath, `${JSON.stringify(patched, null, 2)}\n`, "utf8");
  console.log(
    `公告 revision 11 候选补丁已写入：raceStats=29 traits=8 skills=20 learnsets=32 contentSha256=${patched.meta.contentSha256}`,
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
