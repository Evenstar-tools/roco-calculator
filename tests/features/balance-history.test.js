import { expect, test } from "vitest";
import { classifyHistoryItem, getBalanceHistoryIndex } from "../../src/features/balance-history/history-index.js";

const oldPatch = { id: "s4-2026-09-10", date: "2026.09.10", fetchedAt: "2028-01-01" };
const newPatch = { id: "s5-2026-10-31", date: "2026.10.31", displayDate: "2026.11.05" };
const hp = { kind: "stat", field: "hp", label: "生命", before: 122, after: 132 };
const power = { kind: "stat", field: "basePower", label: "四维降解·威力", before: 100, after: 110 };

function fixture() {
  return {
    meta: { serverId: "cn" },
    spirits: [
      { id: "butterfly", fullName: "花衣蝶", dexNo: "101", aliases: ["花蝶"], pinyin: "huayidie", initials: "hyd",
        asset: { localUrl: "/assets/spirits/butterfly.png" }, changeInfo: {
          patch: oldPatch, items: [{ ...hp, label: "精力" }, hp, power, { ...power, label: "另一技能·威力" }, { ...hp, after: 133 }, { kind: "new" }],
          history: [
            { patch: newPatch, items: [{ kind: "trait", label: "特性说明", before: "旧说明", after: "新说明" }] },
            { patch: oldPatch, items: [hp] },
            { patch: { id: "s4-other", date: "2026.10.15" }, items: [{ kind: "learnset", label: "新增可学习技能", after: "反击拳" }] },
          ],
        } },
      { id: "no-history", fullName: "音速犬", dexNo: "002", aliases: ["火狗"], pinyin: "yinsuquan", initials: "ysq" },
      { id: "new-only", fullName: "新精灵", changeInfo: { patch: { id: "s6-new-only", date: "2027.01.01" }, items: [{ kind: "new", label: "新增精灵" }] } },
      { id: "empty", fullName: "空历史", changeInfo: { patch: { id: "s7-empty", date: "2027.02.01" }, items: [] } },
    ],
    skills: [
      { id: "skill-one", name: "四维降解", aliases: ["降解"], changeInfo: {
        patch: { ...newPatch, seasonId: "S5", label: "圣龙宝藏", sourceUrl: "https://example.test/revision" }, items: [power],
      } },
      { id: "skill-two", name: "蹦跶", aliases: ["Bounce"] },
    ],
    // Knowing a skill now must not attach its earlier changes to this spirit.
    learnsets: [{ spiritId: "no-history", skillIds: ["skill-one"] }],
  };
}

test("六维只包含明确的种族值字段，四维降解威力归技能", () => {
  for (const field of ["hp", "physicalAttack", "physicalDefense", "magicalAttack", "magicalDefense", "speed"]) {
    expect(classifyHistoryItem({ kind: "stat", field })).toBe("stats");
  }
  expect(classifyHistoryItem(power)).toBe("skills");
  expect(classifyHistoryItem({ kind: "stat", field: "cost", label: "能耗" })).toBe("skills");
  expect(classifyHistoryItem({ kind: "mechanic", field: "description", label: "薄纱环·技能效果" })).toBe("skills");
  expect(classifyHistoryItem({ kind: "learnset", field: "skillIds" })).toBe("learnset");
  expect(classifyHistoryItem({ kind: "trait", field: "description" })).toBe("traits");
  expect(classifyHistoryItem({ kind: "mechanic", field: "hp", label: "生命" })).toBe("other");
  expect(classifyHistoryItem({ kind: "stat", field: "total", label: "总和" })).toBe("other");
  expect(classifyHistoryItem(null)).toBe("other");
});

test.each(["特性·地脉馈赠", "特性·鼓气"])("明确的特性文案调整 %s 归特性并保留效果不变说明", (label) => {
  const wording = { kind: "wording", label, before: "旧文案", after: "新文案", note: "仅文案调整，效果不变" };
  const snapshot = fixture();
  snapshot.spirits[0].changeInfo.items = [wording];
  const original = structuredClone(snapshot);
  const record = getBalanceHistoryIndex(snapshot).spiritRecords.get("butterfly").find(({ patch }) => patch.id === oldPatch.id);
  const preserved = record.items.find((item) => item.kind === "wording");
  expect(classifyHistoryItem(preserved)).toBe("traits");
  expect(preserved).toEqual(wording);
  expect(preserved.note).toBe("仅文案调整，效果不变");
  expect(classifyHistoryItem({ ...wording, label: "普通文字调整" })).toBe("other");
  expect(snapshot).toEqual(original);
});

test("规范HP、保留不同技能同值和冲突，并按来源展示日期整理独立批次", () => {
  const snapshot = fixture();
  const original = structuredClone(snapshot);
  const index = getBalanceHistoryIndex(snapshot);
  const records = index.spiritRecords.get("butterfly");
  expect(records.map(({ patch }) => patch.id)).toEqual([newPatch.id, "s4-other", oldPatch.id]);
  expect(records[2].items).toEqual([hp, power, { ...power, label: "另一技能·威力" }, { ...hp, after: 133 }]);
  expect(records[0].patch).toMatchObject({ ...newPatch, label: "圣龙宝藏", sourceUrl: "https://example.test/revision", seasonId: "S5" });
  expect(index.patches.map(({ id }) => id)).toEqual([newPatch.id, "s4-other", oldPatch.id]);
  expect(index.patches[0]).toMatchObject({ ...newPatch, spiritCount: 1, skillCount: 1, seasonId: "S5" });
  expect(index.patches[2]).toMatchObject({ ...oldPatch, spiritCount: 1, skillCount: 0, seasonId: "S4" });
  expect(index.seasons).toEqual(["S5", "S4"]);
  expect(snapshot).toEqual(original);
  expect(index.spirits).toBe(snapshot.spirits);
  expect(index.skills).toBe(snapshot.skills);
});

test("同一天不同patch ID、跨日期及明确seasonId不被合并或改写", () => {
  const snapshot = { spirits: [{ id: "first", fullName: "甲", changeInfo: {
    patch: { id: "s4-first", date: "2026.10.15", seasonId: "S3" }, items: [hp], history: [
      { patch: { id: "s4-second", date: "2026.10.15" }, items: [hp] },
      { patch: { id: "s4-third", date: "2026.10.14" }, items: [hp] },
    ],
  } }], skills: [] };
  const index = getBalanceHistoryIndex(snapshot);
  expect(index.spiritRecords.get("first")).toHaveLength(3);
  expect(index.patches).toHaveLength(3);
  expect(index.patches.find(({ id }) => id === "s4-first").seasonId).toBe("S3");
  expect(index.patches.at(-1).date).toBe("2026.10.14");
});

test("空及纯新增条目不创建批次，当前学习面不反推历史", () => {
  const index = getBalanceHistoryIndex(fixture());
  for (const id of ["no-history", "new-only", "empty"]) expect(index.spiritRecords.get(id)).toEqual([]);
  expect(index.skillRecords.get("skill-two")).toEqual([]);
  expect(index.patches.some(({ id }) => id === "s6-new-only" || id === "s7-empty")).toBe(false);
  expect(index.spirits).toHaveLength(4);
});

test("精灵复用姓名别名编号拼音索引，含无历史实体；技能支持名称别名ID和全量查询", () => {
  const snapshot = fixture();
  const index = getBalanceHistoryIndex(snapshot);
  for (const query of ["花衣蝶", "花蝶", "101", "huayidie", "hyd"]) {
    expect(index.searchSpirits(query)[0]).toBe(snapshot.spirits[0]);
  }
  expect(index.searchSpirits("火狗")[0]).toBe(snapshot.spirits[1]);
  expect(index.searchSpirits("不存在")).toEqual([]);
  expect(index.searchSpirits("", Infinity)).toEqual(snapshot.spirits);
  expect(index.searchSpirits("", 1)).toHaveLength(1);
  for (const query of ["四维降解", "降解", "skill-one"]) expect(index.searchSkills(query)[0]).toBe(snapshot.skills[0]);
  expect(index.searchSkills("bounce")[0]).toBe(snapshot.skills[1]);
  expect(index.searchSkills("不存在")).toEqual([]);
  expect(index.searchSkills("", Infinity)).toEqual(snapshot.skills);
  expect(index.searchSkills("", 1)).toHaveLength(1);
});

test("同一快照缓存同一索引，独立快照不混用", () => {
  const snapshot = fixture();
  const index = getBalanceHistoryIndex(snapshot);
  expect(getBalanceHistoryIndex(snapshot)).toBe(index);
  expect(getBalanceHistoryIndex(structuredClone(snapshot))).not.toBe(index);
});

test("Global拒绝读取国服历史并返回可复用空结构", () => {
  const snapshot = { meta: { serverId: "global" }, get spirits() { throw new Error("must not read Global entities"); } };
  const index = getBalanceHistoryIndex(snapshot);
  expect(index.spirits).toEqual([]);
  expect(index.skills).toEqual([]);
  expect(index.patches).toEqual([]);
  expect(index.seasons).toEqual([]);
  expect(index.spiritRecords.size).toBe(0);
  expect(index.skillRecords.size).toBe(0);
  expect(index.families).toEqual([]);
  expect(index.familyBySpiritId.size).toBe(0);
  expect(index.familyRecords.size).toBe(0);
  expect(index.searchSpirits("")).toEqual([]);
  expect(index.searchSkills("")).toEqual([]);
  expect(index.searchFamilies("")).toEqual([]);
  expect(getBalanceHistoryIndex(snapshot)).toBe(index);
});

const familyTrait = { kind: "trait", label: "特性·花香", before: "旧效果", after: "新效果" };
const memberIds = scope => scope.members.map(member => member.id).sort();

function familyFixture() {
  return { meta: { serverId: "cn" }, skills: [], spirits: [
    { id: "seed", fullName: "小芽", baseName: "小芽", dexNo: "099", evolutionChainIds: ["bloom"],
      changeInfo: { patch: oldPatch, items: [familyTrait, power] } },
    { id: "bloom", fullName: "花枝", baseName: "花枝", dexNo: "100", evolutionChainNames: ["花冠"],
      changeInfo: { patch: oldPatch, items: [Object.fromEntries(Object.entries(familyTrait).reverse()), { ...power }] } },
    { id: "crown", fullName: "花冠", baseName: "花冠", dexNo: "101", aliases: ["冠冠"], pinyin: "huaguan", initials: "hg",
      changeInfo: { patch: oldPatch, items: [familyTrait, hp] } },
    { id: "outsider", fullName: "花外族", baseName: "花外族", dexNo: "101",
      changeInfo: { patch: oldPatch, items: [familyTrait] } },
  ] };
}

test("明确链ID和单向链名连接家族，同图鉴号外族独立，共同、部分和独有改动各显示一次", () => {
  const snapshot = familyFixture();
  const original = structuredClone(snapshot);
  const index = getBalanceHistoryIndex(snapshot);
  const family = index.familyBySpiritId.get("seed");
  expect(index.families).toHaveLength(2);
  expect(family.members.map(member => member.id).sort()).toEqual(["bloom", "crown", "seed"]);
  expect(family.members).toContain(family.representative);
  for (const id of ["seed", "bloom", "crown"]) expect(index.familyBySpiritId.get(id)).toBe(family);
  expect(index.familyBySpiritId.get("outsider")).not.toBe(family);
  expect(index.familyBySpiritId.get("outsider").members).toEqual([snapshot.spirits[3]]);
  const records = index.familyRecords.get(family.id);
  expect(records).toHaveLength(1);
  const record = records[0];
  expect(record.patch.id).toBe(oldPatch.id);
  expect(record.items).toHaveLength(3);
  expect(record.scopes).toHaveLength(3);
  expect(record.scopes.find(scope => scope.members.length === 3).items).toEqual([familyTrait]);
  expect(record.scopes.find(scope => memberIds(scope).join() === "bloom,seed").items).toEqual([power]);
  expect(record.scopes.find(scope => memberIds(scope).join() === "crown").items).toEqual([hp]);
  expect(classifyHistoryItem(record.items.find(item => item.field === "basePower"))).toBe("skills");
  expect(classifyHistoryItem(record.items.find(item => item.field === "hp"))).toBe("stats");
  expect(snapshot).toEqual(original);
});

test("家族按完整规范条目去重，HP同义合并，不吞不同技能、备注或冲突值", () => {
  const snapshot = familyFixture();
  snapshot.spirits[0].changeInfo.items.push({ ...hp, label: "精力" },
    { ...power, label: "另一技能·威力" }, { ...power, note: "仅适用特殊形态" }, { ...power, after: 111 });
  snapshot.spirits[1].changeInfo.items.push({ ...hp });
  const original = structuredClone(snapshot);
  const index = getBalanceHistoryIndex(snapshot);
  const family = index.familyBySpiritId.get("seed");
  const record = index.familyRecords.get(family.id)[0];
  const common = record.scopes.find(scope => scope.members.length === 3);
  expect(common.items).toEqual(expect.arrayContaining([familyTrait, hp]));
  expect(record.items.filter(item => item.field === "hp")).toEqual([hp]);
  const powers = record.items.filter(item => item.field === "basePower");
  expect(powers).toHaveLength(4);
  expect(powers).toEqual(expect.arrayContaining([power, { ...power, label: "另一技能·威力" },
    { ...power, note: "仅适用特殊形态" }, { ...power, after: 111 }]));
  expect(record.scopes.find(scope => memberIds(scope).join() === "bloom,seed").items).toEqual([power]);
  expect(record.scopes.find(scope => memberIds(scope).join() === "seed").items).toHaveLength(3);
  expect(snapshot).toEqual(original);
});

test("家族未改动成员仍在适用范围分母中，部分成员的相同改动不冒充全家族", () => {
  const snapshot = familyFixture();
  delete snapshot.spirits[2].changeInfo;
  const index = getBalanceHistoryIndex(snapshot);
  const family = index.familyBySpiritId.get("crown");
  expect(family.members).toHaveLength(3);
  const record = index.familyRecords.get(family.id)[0];
  expect(record.scopes).toHaveLength(1);
  expect(memberIds(record.scopes[0])).toEqual(["bloom", "seed"]);
  expect(record.scopes[0].items).toEqual(expect.arrayContaining([familyTrait, power]));
  expect(index.spiritRecords.get("crown")).toEqual([]);
});

test("家族检索覆盖所有成员含无记录成员，去重后限量且不污染快照缓存", () => {
  const snapshot = familyFixture();
  snapshot.spirits.push({ id: "quiet", fullName: "静芽", aliases: ["休眠芽"], pinyin: "jingya", initials: "jy", evolutionChainIds: ["seed"] });
  const original = structuredClone(snapshot);
  const index = getBalanceHistoryIndex(snapshot);
  const family = index.familyBySpiritId.get("seed");
  for (const query of ["花冠", "冠冠", "huaguan", "hg", "静芽", "休眠芽", "jingya", "jy"]) {
    expect(index.searchFamilies(query)).toEqual([family]);
  }
  expect(index.familyBySpiritId.get("quiet")).toBe(family);
  expect(index.spiritRecords.get("quiet")).toEqual([]);
  expect(index.searchFamilies("花", 2)).toHaveLength(2);
  expect(index.searchFamilies("花", 1)).toHaveLength(1);
  expect(index.searchFamilies("花", 0)).toEqual([]);
  expect(index.searchFamilies("不存在")).toEqual([]);
  expect(getBalanceHistoryIndex(snapshot).familyRecords).toBe(index.familyRecords);
  expect(getBalanceHistoryIndex(snapshot).families).toBe(index.families);
  const independent = getBalanceHistoryIndex(structuredClone(snapshot));
  expect(independent.familyBySpiritId.get("seed")).not.toBe(family);
  expect(snapshot).toEqual(original);
});

test("家族内缺少patch ID的相同日期条目不跨成员拼成一次更新", () => {
  const snapshot = familyFixture();
  for (const spirit of snapshot.spirits.slice(0, 2)) spirit.changeInfo.history = [
    { patch: { date: "2026.08.01" }, items: [familyTrait] },
  ];
  const index = getBalanceHistoryIndex(snapshot);
  const family = index.familyBySpiritId.get("seed");
  const unknown = index.familyRecords.get(family.id).filter(record => !record.patch?.id);
  expect(unknown).toHaveLength(2);
  expect(unknown.map(record => record.scopes.flatMap(scope => memberIds(scope)).sort()).sort()).toEqual([["bloom"], ["seed"]]);
  for (const record of unknown) expect(record.items).toEqual([familyTrait]);
  expect(index.patches).toHaveLength(1);
});
