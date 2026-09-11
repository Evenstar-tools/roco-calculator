import { createSpeedTargets, createSpeedSpecialTargets, groupSpeedTargets, SPEED_TARGET_PROFILES } from "./speed-targets.js";

export const RANKING_METRIC_LABELS = Object.freeze({ combined: "综合耐久", physical: "物理耐久", magical: "魔法耐久" });
export const DEFAULT_RANKING_PROFILES = Object.freeze(["positive-max", "neutral-max"]);

export function speedQuery(query, mode = "auto") {
  const text = query.normalize("NFKC").trim().toLowerCase();
  const numeric = /^\d+$/.test(text) && Number.isSafeInteger(Number(text));
  const kind = mode === "text" || (mode === "auto" && !/^[+\-\d.]/.test(text)) ? "text" : mode === "base" ? "base" : "actual";
  return { text, kind, value: numeric ? Number(text) : null, invalid: Boolean(text && kind !== "text" && !numeric) };
}

export function speedReference(groups, value) {
  if (value === null) return null;
  const counts = { faster: 0, equal: 0, slower: 0 };
  for (const group of groups) counts[group.speed > value ? "faster" : group.speed === value ? "equal" : "slower"] += group.targets.length;
  return { ...counts, value, groups: groups.some((group) => group.speed === value) ? groups : [...groups, { speed: value, targets: [] }].sort((a, b) => b.speed - a.speed) };
}

export function speedBadge(target) {
  return `${({ "positive-max": "极", "neutral-max": "满", "positive-zero": "性", "neutral-zero": "无", "negative-zero": "减" })[target.profileId] ?? ""}${target.specialLabel ? "·特" : ""}`;
}

export function createSpeedRanking({ snapshot, profiles = DEFAULT_RANKING_PROFILES, query = "", queryMode = "text" }) {
  const targets = Object.keys(SPEED_TARGET_PROFILES).flatMap((profileId) => [
    ...(profiles.includes(profileId) ? createSpeedTargets({ profileId, spirits: snapshot.spirits, spiritFilterRevision: snapshot.meta?.revisions?.spiritFilter }) : []),
    ...(profiles.includes("special") ? createSpeedSpecialTargets({ profileId, snapshot }) : []),
  ]);
  const search = speedQuery(query, queryMode);
  return groupSpeedTargets(targets.filter((target) => !search.invalid && (!search.text || (search.kind === "actual" ? true : search.kind === "base" ? target.spirit.raceStats.speed === search.value : [target.name, target.qualifier, target.spirit.dexNo, target.spirit.searchText, ...(target.spirit.aliases ?? [])].some((value) => String(value ?? "").normalize("NFKC").toLowerCase().includes(search.text))))));
}

export function multiplierSummary(attackType, selected, bins) {
  if (!attackType) return "标准耐久";
  const selection = bins.filter((value) => selected.includes(value));
  return `${attackType}系 · ${selection.length === bins.length ? "全部倍率" : selection.length ? selection.map((value) => `×${value}`).join(" / ") : "未选倍率"}`;
}

export function multiplierTone(value) {
  return value < 1 ? "resist" : value === 1 ? "normal" : value === 2 ? "weak" : "severe";
}
