import { getNature } from "../domain/natures.js";

export const LINEUP_IV_STATS = ["hp", "physicalAttack", "magicalAttack", "physicalDefense", "magicalDefense", "speed"];
const valuesFor = (stats) => Object.fromEntries(LINEUP_IV_STATS.map(stat => [stat, stats.includes(stat) ? 60 : 0]));

// 官方 individual/list.json 的 1～6 是属性选择，不是数值。
export function inspectLineupIvs(talents) {
  const ids = (talents ?? []).filter(id => id != null);
  const status = !ids.length ? "missing" : ids.every(id => Number.isInteger(id) && id >= 1 && id <= 6) && new Set(ids).size === ids.length ? "selected" : "unknown";
  return { status, values: valuesFor(status === "selected" ? ids.map(id => LINEUP_IV_STATS[id - 1]) : []) };
}

export function recommendLineupIvs(member, snapshot, presets = []) {
  if (!member || inspectLineupIvs(member.lineupSource?.talents).status !== "missing" || Object.values(member.displayIvs).some(value => value !== 0)) return null;
  const nature = getNature(member.natureId);
  const valid = entry => LINEUP_IV_STATS.every(stat => [0, 60].includes(entry.displayIvs?.[stat])) && Object.values(entry.displayIvs).filter(value => value === 60).length === 3;
  const matching = presets.filter(entry => entry.spiritId === member.spiritId && entry.natureId === member.natureId && valid(entry));
  const overlap = entry => member.skills.four.filter(id => id && entry.skills?.includes(id)).length;
  matching.sort((a, b) => overlap(b) - overlap(a));
  if (matching.length) return { values: { ...matching[0].displayIvs }, reason: "同精灵同性格预设" };
  const skills = member.skills.four.map(id => snapshot.skills.find(skill => skill.id === id));
  const physical = skills.filter(skill => skill?.category === "physical").length;
  const magical = skills.filter(skill => skill?.category === "magical").length;
  const attack = physical > magical ? "physicalAttack" : magical > physical ? "magicalAttack" : null;
  const ordered = [nature.upStat, "hp", attack, "physicalDefense", "magicalDefense", "speed", "physicalAttack", "magicalAttack"];
  const stats = [...new Set(ordered.filter(stat => stat && stat !== nature.downStat))].slice(0, 3);
  return { values: valuesFor(stats), reason: "性格与四技能参考" };
}
