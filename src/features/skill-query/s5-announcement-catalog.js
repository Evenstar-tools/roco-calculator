import {
  S5_SEASON_ANNOUNCEMENT,
  createS5AnnouncementQuerySeason,
} from "../s5-preview/season-announcement.js";

// 仅在已加载并核验的正式 S4 目录上投影；不写回 loader 的共享缓存。
export function withS5AnnouncementCatalog(catalog, snapshot) {
  if (!catalog || (catalog.serverId ?? "cn") !== "cn" || catalog.currentSeason !== "S4" ||
      snapshot?.seasonAnnouncement?.id !== S5_SEASON_ANNOUNCEMENT.patch.id ||
      catalog.seasons.some(({ id }) => id === "S5")) return catalog;
  const current = catalog.seasons.find(({ id }) => id === "S4");
  if (!current) return catalog;
  const projected = createS5AnnouncementQuerySeason(current);
  const changesFor = (entities) => new Map((entities ?? [])
    .filter(({ changeInfo }) => changeInfo)
    .map(({ id, changeInfo }) => [id, changeInfo]));
  const spiritChanges = changesFor(snapshot.spirits);
  const skillChanges = changesFor(snapshot.skills);
  const season = { ...projected,
    // compact 目录不含改动台账；普通查询保留快照中的本轮及历史记录。
    spirits: projected.spirits.map((spirit) => spiritChanges.has(spirit.id)
      ? { ...spirit, changeInfo: spiritChanges.get(spirit.id) } : spirit),
    skills: projected.skills.map((skill) => skillChanges.has(skill.id)
      ? { ...skill, changeInfo: skillChanges.get(skill.id) } : skill),
  };
  return {
    ...catalog,
    currentSeason: "S5",
    seasons: [...catalog.seasons, season],
  };
}

// 汇总页只消费本轮组；普通查询直接使用完整 changeInfo。
export function querySeasonChangeInfo(season, changeInfo) {
  if (season?.id !== "S5" || season.seasonAnnouncement?.id !== S5_SEASON_ANNOUNCEMENT.patch.id) return changeInfo;
  const current = [changeInfo, ...(changeInfo?.history ?? [])]
    .find((group) => group?.patch?.id === S5_SEASON_ANNOUNCEMENT.patch.id);
  return current ? { ...current, history: [] } : null;
}
