import { getNature } from "../domain/natures.js";

export const LINEUP_IV_STATS = ["hp", "physicalAttack", "magicalAttack", "physicalDefense", "magicalDefense", "speed"];
const valuesFor = (stats) => Object.fromEntries(LINEUP_IV_STATS.map(stat => [stat, stats.includes(stat) ? 60 : 0]));

// Game lineup fields use attribute IDs 79–84; 1–6 are legacy picker ordinals.
// Verified against the supplied QR and Module:LineupData/Game (2026-09-18).
// These select stats, not numeric IV amounts. Preserve unknown/duplicate fields.
export function inspectLineupIvs(talents) {
  if (talents != null && !Array.isArray(talents)) return { status: "unknown", values: valuesFor([]) };
  const ids = (talents ?? []).filter(id => id != null);
  const stats = ids.map(id => Number.isInteger(id)
    ? LINEUP_IV_STATS[id >= 79 && id <= 84 ? id - 79 : id - 1]
    : undefined);
  const status = !ids.length ? "missing"
    : ids.length <= 3 && stats.every(Boolean) && new Set(stats).size === stats.length ? "selected" : "unknown";
  return { status, values: valuesFor(status === "selected" ? stats : []) };
}

// Repair only the old importer failure state. User-edited IVs are never replaced.
export function recoverPendingLineupIvs(member) {
  if (member?.ivsPending !== true || !member.lineupSource ||
      !LINEUP_IV_STATS.every(stat => Number(member.displayIvs?.[stat] ?? 0) === 0)) return member;
  const decoded = inspectLineupIvs(member.lineupSource.talents);
  if (decoded.status !== "selected") return member;
  const repaired = { ...member, displayIvs: decoded.values };
  delete repaired.ivsPending;
  return repaired;
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
