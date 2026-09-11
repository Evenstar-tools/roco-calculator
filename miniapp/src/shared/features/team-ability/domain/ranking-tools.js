import { createSpeedTargets, createSpeedSpecialTargets, groupSpeedTargets, SPEED_TARGET_PROFILES } from "./speed-targets.js";

export const RANKING_METRIC_LABELS = Object.freeze({ combined: "综合耐久", physical: "物理耐久", magical: "魔法耐久" });
export const DEFAULT_RANKING_PROFILES = Object.freeze(["positive-max", "neutral-max"]);

export function createSpeedRanking({ snapshot, profiles = DEFAULT_RANKING_PROFILES, query = "" }) {
  const targets = Object.keys(SPEED_TARGET_PROFILES).flatMap((profileId) => [
    ...(profiles.includes(profileId) ? createSpeedTargets({ profileId, spirits: snapshot.spirits, spiritFilterRevision: snapshot.meta?.revisions?.spiritFilter }) : []),
    ...(profiles.includes("special") ? createSpeedSpecialTargets({ profileId, snapshot }) : []),
  ]);
  const search = query.normalize("NFKC").trim().toLowerCase();
  return groupSpeedTargets(targets.filter((target) => !search || [target.name, target.qualifier, target.spirit.dexNo, target.spirit.searchText, ...(target.spirit.aliases ?? [])].some((value) => String(value ?? "").normalize("NFKC").toLowerCase().includes(search))));
}

export function multiplierSummary(attackType, selected, bins) {
  if (!attackType) return "标准耐久";
  const selection = bins.filter((value) => selected.includes(value));
  return `${attackType}系 · ${selection.length === bins.length ? "全部倍率" : selection.length ? selection.map((value) => `×${value}`).join(" / ") : "未选倍率"}`;
}

export function multiplierTone(value) {
  return value < 1 ? "resist" : value === 1 ? "normal" : value === 2 ? "weak" : "severe";
}
