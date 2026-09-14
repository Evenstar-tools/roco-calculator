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

export function speedMatchReasons(target, search) {
  const reasons = [];
  if (target.speed === search.value) reasons.push("实际速度");
  if (target.spirit.raceStats.speed === search.value) reasons.push("种族速度");
  if (Number(target.spirit.dexNo) === search.value) reasons.push("图鉴号");
  if ([target.name, ...(target.spirit.aliases ?? [])].some(value => String(value).normalize("NFKC").toLowerCase().includes(search.text))) reasons.push("名称 / 别名");
  return reasons;
}

export function speedMatchSummary(targets, value) {
  return ["实际速度", "种族速度", "图鉴号", "名称 / 别名"].flatMap(reason => {
    const matches = targets.filter(target => target.matchReasons?.includes(reason));
    if (!matches.length) return [];
    const names = [...new Set(matches.map(target => target.name))];
    const detail = reason === "实际速度" ? `${matches.length} 个配置` : names.length <= 3 ? names.join("、") : `${names.slice(0, 2).join("、")}等 ${names.length} 只`;
    return [`${reason} ${value}：${detail}`];
  }).join("；");
}

export function createSpeedRanking({ snapshot, profiles = DEFAULT_RANKING_PROFILES, query = "", queryMode = "text" }) {
  const targets = Object.keys(SPEED_TARGET_PROFILES).flatMap((profileId) => [
    ...(profiles.includes(profileId) ? createSpeedTargets({ profileId, spirits: snapshot.spirits, spiritFilterRevision: snapshot.meta?.revisions?.spiritFilter }) : []),
    ...(profiles.includes("special") ? createSpeedSpecialTargets({ profileId, snapshot }) : []),
  ]);
  const search = speedQuery(query, queryMode);
  if (queryMode === "auto" && search.kind === "actual" && !search.invalid && search.text) {
    const matches = targets.map(target => ({ ...target, matchReasons: speedMatchReasons(target, search) })).filter(target => target.matchReasons.length);
    return groupSpeedTargets(matches.length ? matches : targets);
  }
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

export const BASE_SPEED_PROFILES = ["neutral-zero", "neutral-max", "positive-max"];

export function createBaseSpeedGroups({ snapshot, query = "" }) {
  const bySpirit = new Map();
  for (const profileId of BASE_SPEED_PROFILES) {
    for (const target of createSpeedTargets({ profileId, spirits: snapshot.spirits, spiritFilterRevision: snapshot.meta?.revisions?.spiritFilter })) {
      if (!bySpirit.has(target.spiritId)) bySpirit.set(target.spiritId, { spirit: target.spirit, targets: {} });
      bySpirit.get(target.spiritId).targets[profileId] = target;
    }
  }
  const search = query.normalize("NFKC").trim().toLowerCase();
  const groups = new Map();
  for (const member of bySpirit.values()) {
    const base = member.spirit.raceStats.speed;
    if (search && !([member.spirit.fullName, member.spirit.dexNo, member.spirit.searchText, ...(member.spirit.aliases ?? [])].some(value => String(value ?? "").normalize("NFKC").toLowerCase().includes(search)) || /^\d+$/.test(search) && (base === Number(search) || Object.values(member.targets).some(target => target.speed === Number(search))))) continue;
    const values = BASE_SPEED_PROFILES.map(id => member.targets[id].speed);
    const key = [base, ...values].join(":");
    if (!groups.has(key)) groups.set(key, { key, base, values, members: [] });
    groups.get(key).members.push(member);
  }
  return [...groups.values()].sort((a, b) => b.base - a.base);
}
