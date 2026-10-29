import { DEFAULT_DISPLAY_IV, STAT_KEYS } from "./constants.js";

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

export function normalizeDisplayIv(displayIv) {
  const numeric = Number(displayIv);
  return clamp(Number.isFinite(numeric) ? numeric : 0, 0, 100) / 6;
}

// 基础能力是游戏面板生成规则；战斗强化和伤害截断另行处理。
export function statRound(value) {
  return Math.round(value);
}

// HP/速度沿用既有规则，不凭双防的新证据扩改未确认的半点边界。
function roundLegacyScaledStat(value, normalizedIv) {
  const floor = Math.floor(value);
  const isZeroIvHalfTie = normalizedIv === 0 &&
    Math.abs(value - floor - 0.5) < Number.EPSILON * Math.max(100, Math.abs(value));
  return isZeroIvHalfTie ? floor + 1 : statRound(value);
}

export function hasCompleteRaceStats(raceStats) {
  return Boolean(
    raceStats &&
      STAT_KEYS.every(
        (kind) => Number.isInteger(raceStats[kind]) && raceStats[kind] > 0,
      ),
  );
}

export function calculatePanelStat({
  kind,
  race,
  displayIv = DEFAULT_DISPLAY_IV,
  natureMultiplier = 1,
  level = 60,
}) {
  const numericLevel = Number(level);
  if (!Number.isSafeInteger(numericLevel) || numericLevel < 1) {
    throw new RangeError("level must be a positive integer");
  }
  const normalizedIv = normalizeDisplayIv(displayIv);
  const isHp = kind === "hp";
  if (isHp || kind === "speed") {
    const scaled = roundLegacyScaledStat(
      ((isHp ? 2 * numericLevel + 50 : numericLevel + 50) / 100) *
        (Number(race) + 3 * normalizedIv),
      normalizedIv,
    );
    return statRound((scaled + (isHp ? numericLevel + 10 : 10)) * Number(natureMultiplier)) +
      (isHp ? 100 : 50);
  }
  // 显式非60级使用S5试算候选，60级保留既有单精度与逐步取整。
  // 双攻双防的单精度百分比缩放不能折叠成双精度乘法：半点边界会改变。
  const qualifiedRace = Math.fround(Number(race) + 3 * normalizedIv);
  const racePercent = Math.fround(qualifiedRace / 100);
  const scaled = Math.fround(racePercent * (numericLevel + 50));
  const base = statRound(scaled) + 10;
  const natureAdjusted = Math.fround(base * Math.fround(Number(natureMultiplier)));
  return statRound(natureAdjusted) + 50;
}

export function calculateAllPanelStats({
  raceStats,
  displayIvs = {},
  natureMultipliers = {},
  level = 60,
}) {
  if (!hasCompleteRaceStats(raceStats)) {
    throw new TypeError("种族值待确认");
  }
  return Object.fromEntries(
    STAT_KEYS.map((kind) => [
      kind,
      calculatePanelStat({
        kind,
        race: raceStats[kind],
        displayIv: displayIvs[kind] ?? DEFAULT_DISPLAY_IV,
        natureMultiplier: natureMultipliers[kind] ?? 1,
        level,
      }),
    ]),
  );
}
