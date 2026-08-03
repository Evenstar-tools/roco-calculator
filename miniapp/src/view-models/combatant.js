import {
  QUICK_STATS,
  STAT_LABELS,
  getNature,
  getNatureMultipliers,
} from "../shared/domain/natures.js";
import { calculateAllPanelStats } from "../shared/domain/stat.js";

export function clampDisplayIv(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return Math.min(60, Math.max(0, Math.round(numeric)));
}

export function createCombatantView(snapshot, side) {
  const spirit = (snapshot?.spirits ?? []).find(
    (candidate) => candidate.id === side?.spiritId,
  );
  const nature = getNature(side?.nature);

  if (!spirit) {
    return {
      nature,
      spirit: null,
      stats: [],
    };
  }

  const hasCompleteRaceStats =
    spirit.raceStats &&
    QUICK_STATS.every((key) =>
      Number.isFinite(Number(spirit.raceStats[key])),
    );
  if (!hasCompleteRaceStats) {
    return {
      nature,
      spirit,
      stats: [],
    };
  }

  const displayIvs = Object.fromEntries(
    QUICK_STATS.map((key) => [
      key,
      clampDisplayIv(side?.displayIvs?.[key]),
    ]),
  );
  const panelStats = calculateAllPanelStats({
    raceStats: spirit.raceStats,
    displayIvs,
    natureMultipliers: getNatureMultipliers(nature.id),
  });

  return {
    nature,
    spirit,
    stats: QUICK_STATS.map((key) => ({
      displayIv: displayIvs[key],
      key,
      label: STAT_LABELS[key],
      panel: panelStats[key],
      race: Number(spirit.raceStats[key]),
    })),
  };
}
