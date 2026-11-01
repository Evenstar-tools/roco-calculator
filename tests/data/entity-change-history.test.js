import { expect, test } from "vitest";
import { deduplicateS5ChangeInfo, mergeEntityChangeInfo as mergeHistory } from "../../src/data/entity-change-history.js";

const mergeEntityChangeInfo = (previous, incoming) => deduplicateS5ChangeInfo(mergeHistory(previous, incoming));

const stats = { kind: "stat", field: "hp", label: "生命", before: 144, after: 164 };
const announcement = {
  patch: { id: "s5-season-announcement-2026-11-05", seasonId: "S5", date: "预计 2026.11.05" },
  items: [stats,
    { kind: "trait", label: "特性·示例", before: "旧效果", after: "新效果" },
    { kind: "learnset", label: "武系血脉技能", before: "贯手", after: "反击拳" },
  ],
};
const reviewed = {
  patch: { id: "s5-2026-10-31", seasonId: "S5", date: "2026.10.31", displayDate: "2026.11.05" },
  items: [stats,
    { kind: "trait", field: "traitDescription", label: "特性说明", before: "旧效果", after: "新效果" },
    { kind: "learnset", field: "skillIds", label: "新增可学习技能", after: "反击拳", note: "血脉技能 · 武血脉 Lv.15" },
    { kind: "learnset", field: "skillIds", label: "移除可学习技能", before: "贯手", note: "血脉技能 · 武血脉 Lv.15" },
    { kind: "learnset", field: "skillIds", label: "新增可学习技能", after: "筑梦", note: "技能书" },
  ],
};

test("同次 S5 公告被正式记录完整覆盖时去重，保留正式补充和独立历史", () => {
  const older = { patch: { id: "s4", date: "2026.09.10" }, items: [stats] };
  const preview = { ...announcement, history: [older] };
  const expected = { ...reviewed, history: [older] };
  expect(mergeEntityChangeInfo(preview, reviewed)).toEqual(expected);
  expect(mergeEntityChangeInfo(reviewed, preview)).toEqual(expected);
  expect(mergeEntityChangeInfo(expected, preview)).toEqual(expected);
  expect(announcement.items).toHaveLength(3);
  expect(reviewed.items).toHaveLength(5);
});

test.each([
  { items: [...reviewed.items, { kind: "stat", field: "speed", before: 10, after: 20 }], extra: true },
  { items: reviewed.items.map(item => item === stats ? { ...item, after: 165 } : item) },
  { items: reviewed.items.filter(item => item.before !== "贯手") },
  { items: reviewed.items.map(item => item.note ? { ...item, note: "血脉技能 · 地血脉 Lv.15" } : item) },
  { patch: { ...reviewed.patch, id: "s5-other-patch" } },
  { patch: { ...reviewed.patch, displayDate: "2026.11.12" } },
])("未覆盖、冲突、不同途径或不同批次保留各自记录 %#", variant => {
  const preview = variant.extra ? { ...announcement, items: [...announcement.items,
    { kind: "stat", field: "speed", before: 20, after: 30 }] } : announcement;
  const merged = mergeEntityChangeInfo(preview, { ...reviewed, ...variant });
  expect([merged, ...(merged.history ?? [])].map(record => record.patch.id))
    .toEqual([variant.patch?.id ?? reviewed.patch.id, announcement.patch.id]);
});

test("威力标签差异可去重，单独导入公告仍保留", () => {
  const power = { kind: "stat", field: "basePower", before: 70, after: 65 };
  const preview = { ...announcement, items: [{ ...power, label: "基础威力" }] };
  const release = { ...reviewed, items: [{ ...power, label: "威力" }] };
  expect(mergeEntityChangeInfo(preview, release)).toEqual(release);
  expect(mergeEntityChangeInfo(null, preview)).toBe(preview);
});
