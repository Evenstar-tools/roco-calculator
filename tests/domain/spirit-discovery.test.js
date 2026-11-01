import { expect, test } from "vitest";
import { canRecommendSpirit, isSpiritDiscoveryHidden, isSpiritSearchOnly } from "../../src/domain/spirit-discovery.js";

test.each([
  { previewIdentity: { catalogId: "candymo-hidden-20261101" } },
  { previewIdentity: { raceStatsPlaceholder: true } },
  { calculationStatus: "pending-race-stats" },
])("未开放与占位仅搜索，不推荐或修改身份 %j", spirit => {
  const before = structuredClone(spirit);
  expect(isSpiritDiscoveryHidden(spirit)).toBe(false);
  expect(isSpiritSearchOnly(spirit)).toBe(true);
  expect(canRecommendSpirit(spirit)).toBe(false);
  expect(spirit).toEqual(before);
});

test.each([
  { fullName: "冥古龙", previewIdentity: { catalogId: "s5-20261022", formalIdPending: true, raceStatsPlaceholder: false } },
  { fullName: "超能阿布", previewIdentity: { key: "super-abu", raceStatsPlaceholder: false } },
  { id: "cn-placeholder:legacy-global-reference", catalogAvailable: true },
])("正式新精灵与国际服既有资料不会因预览ID或地区引用被误隐藏 %j", spirit => {
  expect(isSpiritDiscoveryHidden(spirit)).toBe(false);
  expect(isSpiritSearchOnly(spirit)).toBe(false);
  expect(canRecommendSpirit(spirit)).toBe(true);
});

test.each([
  { fullName: "圣龙阿布" },
  { id: "spirit_preview_s5_boss-abu", fullName: "Localized name" },
  { previewIdentity: { key: "boss-abu" } },
  { catalogAvailable: false },
])("显式隐藏或地区不可用记录不进入任何发现入口 %j", spirit => {
  expect(isSpiritDiscoveryHidden(spirit)).toBe(true);
  expect(canRecommendSpirit(spirit)).toBe(false);
});
