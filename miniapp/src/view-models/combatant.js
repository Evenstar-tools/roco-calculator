import {
  QUICK_STATS,
  STAT_LABELS,
  getNature,
  getNatureMultipliers,
} from "../shared/domain/natures.js";
import { resolveBattleSpirit } from "../shared/domain/battle-form.js";
import { resolveS5PreviewBattleLevel } from "../shared/domain/battle-level.js";
import { materializeTraitContext } from "../shared/state/trait-values.js";
import {
  calculateAllPanelStats,
  hasCompleteRaceStats,
} from "../shared/domain/stat.js";

export function clampDisplayIv(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return Math.min(60, Math.max(0, Math.round(numeric)));
}

export function createCombatantView(snapshot, side) {
  const spirit = resolveBattleSpirit(snapshot, side);
  const nature = getNature(side?.nature);

  if (!spirit) {
    return {
      nature,
      spirit: null,
      stats: [],
    };
  }

  if (!hasCompleteRaceStats(spirit.raceStats)) {
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
    level: side.level ?? resolveS5PreviewBattleLevel(snapshot, {
      sides: { attacker: side },
      directions: { forward: { context: materializeTraitContext(side.traitValues, snapshot, side.spiritId, "attacker") } },
    }, "attacker"),
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
