import { readFileSync } from "node:fs";
import { expect, test } from "vitest";
import { unpackCatalog } from "../../src/features/skill-query/catalog.js";
import { querySeasonChangeInfo, withS5AnnouncementCatalog } from "../../src/features/skill-query/s5-announcement-catalog.js";
import { applyS5SeasonAnnouncement, S5_SEASON_ANNOUNCEMENT } from "../../src/features/s5-preview/season-announcement.js";

const loadCatalog = () => unpackCatalog(JSON.parse(readFileSync("public/data/skill-query/catalog.json", "utf8")));
const snapshot = { seasonAnnouncement: { id: S5_SEASON_ANNOUNCEMENT.patch.id } };
function freeze(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) freeze(child);
  }
  return value;
}

test("公告投影需要本轮快照标记与正式 S4 目录，保留缓存和历史资料", () => {
  const catalog = freeze(loadCatalog());
  expect(withS5AnnouncementCatalog(catalog)).toBe(catalog);
  expect(withS5AnnouncementCatalog(catalog, { seasonAnnouncement: { id: "other-patch" } })).toBe(catalog);
  const projected = withS5AnnouncementCatalog(catalog, snapshot);
  expect(projected).not.toBe(catalog);
  expect(projected.currentSeason).toBe("S5");
  expect(catalog.currentSeason).toBe("S4");
  expect(catalog.seasons.some(({ id }) => id === "S5")).toBe(false);
  for (const original of catalog.seasons) {
    expect(projected.seasons.find(({ id }) => id === original.id)).toBe(original);
  }
  const s5 = projected.seasons.find(({ id }) => id === "S5");
  expect(s5.skills.filter(({ changeInfo }) => changeInfo?.patch?.id === snapshot.seasonAnnouncement.id)).toHaveLength(10);
  expect(s5.skills.some(({ introducedSeason }) => introducedSeason === "S5")).toBe(false);
  expect(withS5AnnouncementCatalog(projected, snapshot)).toBe(projected);
});

test("正式 S5 目录及非 S4 目录不重放前瞻公告", () => {
  const catalog = loadCatalog();
  const formal = { ...catalog, currentSeason: "S5", seasons: [...catalog.seasons, { id: "S5" }] };
  expect(withS5AnnouncementCatalog(formal, snapshot)).toBe(formal);
  expect(withS5AnnouncementCatalog({ ...catalog, currentSeason: "S3" }, snapshot).currentSeason).toBe("S3");
});

test("精灵完整公告提示只进入 S5，正式 S4 详情不受种族值和特性提示影响", () => {
  const catalog = freeze(loadCatalog());
  const s4 = catalog.seasons.find(({ id }) => id === "S4");
  const spirit = s4.spirits.find(({ fullName }) => fullName === "冰钻布鲁斯");
  const changeInfo = { patch: S5_SEASON_ANNOUNCEMENT.patch, entityName: spirit.fullName,
    items: [{ kind: "stat", label: "物攻", before: 101, after: 90 }],
  };
  const data = withS5AnnouncementCatalog(catalog, { ...snapshot, spirits: [{ id: spirit.id, changeInfo }] });
  expect(data.seasons.find(({ id }) => id === "S5").spirits.find(({ id }) => id === spirit.id).changeInfo).toBe(changeInfo);
  expect(data.seasons.find(({ id }) => id === "S4").spirits.find(({ id }) => id === spirit.id)).toBe(spirit);
  expect(spirit.changeInfo).not.toBe(changeInfo);
});

test("真实 S4 烈火守护及技能旧台账进入 S5 普通查询，旧日期不变且不计入 S5 汇总", () => {
  const catalog = freeze(loadCatalog());
  const original = freeze(JSON.parse(readFileSync("data/snapshots/current.json", "utf8")));
  const full = applyS5SeasonAnnouncement(original);
  const data = withS5AnnouncementCatalog(catalog, full);
  const s5 = data.seasons.find(({ id }) => id === "S5");
  const fire = s5.spirits.find(({ fullName }) => fullName === "烈火守护");
  const bite = s5.skills.find(({ name }) => name === "撕咬");
  expect(fire.changeInfo.items).toEqual(original.currentPatchChanges.spirits.find(({ entityId }) => entityId === fire.id).items);
  expect(fire.changeInfo.patch.date).toBe("2026.09.10");
  expect(bite.changeInfo.patch.date).toBe("2026.09.10");
  expect(bite.changeInfo.items).toContainEqual(expect.objectContaining({ before: 30, after: 20 }));
  expect(querySeasonChangeInfo(s5, fire.changeInfo)).toBeNull();
  expect(querySeasonChangeInfo(s5, bite.changeInfo)).toBeNull();
  expect(s5.skills.filter((skill) => querySeasonChangeInfo(s5, skill.changeInfo)?.items.length)).toHaveLength(10);
  expect(data.seasons.find(({ id }) => id === "S4")).toBe(catalog.seasons.find(({ id }) => id === "S4"));
  expect(catalog.seasons.find(({ id }) => id === "S4").skills.find(({ id }) => id === bite.id).changeInfo).toBeUndefined();
});
