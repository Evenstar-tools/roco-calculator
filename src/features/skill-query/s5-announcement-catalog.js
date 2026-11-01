import {
  S5_SEASON_ANNOUNCEMENT,
  createS5AnnouncementQuerySeason,
} from "../s5-preview/season-announcement.js";
import { familyIds } from "./catalog.js";

function isS5Entry(entry) {
  return /^s5(?:[-_:]|$)/iu.test(entry.previewIdentity?.catalogId ?? "") ||
    entry.introducedSeason === "S5" ||
    entry.provenance?.nrc && entry.provenance.nrc.status !== "legacy-unconfirmed" ||
    entry.changeInfo?.isNew && entry.changeInfo.patch?.seasonId === "S5";
}

function currentSnapshotSeason(projected, snapshot) {
  const merge = (original, current, acceptNew) => {
    const entries = new Map(original.map(entry => [entry.id, entry]));
    for (const entry of current ?? []) {
      if (entries.has(entry.id)) entries.set(entry.id, { ...entries.get(entry.id), ...entry });
      else if (acceptNew(entry)) entries.set(entry.id, { ...entry });
    }
    return [...entries.values()];
  };
  // Calculator-only wish-power variants and historical aliases are not new
  // season skills. Every reviewed S5 identity uses the already loaded entity.
  const previousSkillIds = new Set(projected.skills.map(skill => skill.id));
  const skills = merge(projected.skills, snapshot.skills, entry =>
    entry.pickerVisibility !== "search-only" && isS5Entry(entry),
  ).map(skill => ({ ...skill,
    introducedSeason: skill.introducedSeason ??
      (previousSkillIds.has(skill.id) ? null : "S5"),
  }));
  const spirits = merge(projected.spirits, snapshot.spirits, entry => Boolean(entry.fullName));
  const byId = new Map(spirits.map(spirit => [spirit.id, spirit]));
  const previousFamilies = new Map();
  for (const spirit of projected.spirits) {
    if (!spirit.familyId) continue;
    const names = previousFamilies.get(spirit.familyId) ?? [];
    names.push(spirit.fullName);
    previousFamilies.set(spirit.familyId, names);
  }
  const families = familyIds(spirits.map(spirit => ({ ...spirit,
    evolutionChainNames: spirit.evolutionChainNames ?? spirit.evolutionChainIds
      ?.map(id => byId.get(id)?.fullName).filter(Boolean) ?? previousFamilies.get(spirit.familyId),
  })));
  const skillsById = new Set(skills.map(skill => skill.id));
  const previousPools = new Map(projected.learnsets.map(entry => [entry.spiritId, entry]));
  const pools = new Map(previousPools);
  for (const entry of snapshot.learnsets ?? []) {
    if (!byId.has(entry.spiritId)) continue;
    const skillIds = [...new Set(entry.skillIds ?? [])].filter(id => skillsById.has(id));
    const previous = previousPools.get(entry.spiritId);
    pools.set(entry.spiritId, { ...entry, skillIds,
      // Runtime data strips ordinary acquisition text. Retain known methods
      // only for relations that still exist; explicit current methods win.
      acquisitions: Object.fromEntries(skillIds.map(id => [id,
        entry.acquisitions && (Object.hasOwn(entry.acquisitions, id) || entry.acquisitionsPartial !== true)
          ? entry.acquisitions[id] ?? [] : previous?.acquisitions?.[id] ?? [],
      ])),
    });
  }
  return { ...projected, skills,
    traits: snapshot.traits ?? projected.traits ?? [],
    spirits: spirits.map(spirit => ({ ...spirit, familyId: families.get(spirit.id) })),
    learnsets: [...pools.values()],
  };
}

// 仅在已加载并核验的正式 S4 目录上投影；不写回 loader 的共享缓存。
export function withS5AnnouncementCatalog(catalog, snapshot) {
  if (!catalog || (catalog.serverId ?? "cn") !== "cn" || catalog.currentSeason !== "S4" ||
      (snapshot?.meta?.serverId ?? "cn") !== "cn" ||
      (snapshot?.seasonAnnouncement?.id !== S5_SEASON_ANNOUNCEMENT.patch.id && snapshot?.meta?.s5NrcSync?.complete !== true) ||
      catalog.seasons.some(({ id }) => id === "S5")) return catalog;
  const current = catalog.seasons.find(({ id }) => id === "S4");
  if (!current) return catalog;
  const projected = currentSnapshotSeason(createS5AnnouncementQuerySeason(current), snapshot);
  const changesFor = (entities) => new Map((entities ?? [])
    .filter(({ changeInfo }) => changeInfo)
    .map(({ id, changeInfo }) => [id, changeInfo]));
  const spiritChanges = changesFor(snapshot.spirits);
  const skillChanges = changesFor(snapshot.skills);
  const season = { ...projected,
    ...(snapshot.meta?.s5NrcSync?.complete === true ? {
      label: "S5", announcementNote: "新技能学习面与学习途径调整",
    } : {}),
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

// 汇总页保留本季各补丁的独立记录；普通查询仍消费跨季完整台账。
export function querySeasonChangeInfo(season, changeInfo) {
  if (season?.id !== "S5" || season.seasonAnnouncement?.id !== S5_SEASON_ANNOUNCEMENT.patch.id) return changeInfo;
  const groups = [changeInfo, ...(changeInfo?.history ?? [])].filter(group => {
    const patch = group?.patch;
    return patch?.seasonId ? patch.seasonId === season.id : /^s5(?:[-_:]|$)/iu.test(patch?.id ?? "");
  });
  const [current, ...history] = groups;
  return current ? { ...current, history } : null;
}
