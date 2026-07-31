import { DEFAULT_DISPLAY_IV, STAT_KEYS } from "./constants.js";

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

export function normalizeDisplayIv(displayIv) {
  const numeric = Number(displayIv);
  return clamp(Number.isFinite(numeric) ? numeric : 0, 0, 100) / 6;
}

export function statRound(value) {
  return Math.round(value);
}

function roundScaledStat(value, normalizedIv) {
  const floor = Math.floor(value);
  const isZeroIvHalfTie =
    normalizedIv === 0 &&
    Math.abs(value - floor - 0.5) <
      Number.EPSILON * Math.max(100, Math.abs(value));

  if (!isZeroIvHalfTie) return statRound(value);
  return floor % 2 === 0 ? floor + 1 : floor;
}

export function calculatePanelStat({
  kind,
  race,
  displayIv = DEFAULT_DISPLAY_IV,
  natureMultiplier = 1,
}) {
  const normalizedIv = normalizeDisplayIv(displayIv);
  const isHp = kind === "hp";
  const coefficient = isHp ? 1.7 : 1.1;
  const raceValue = Number(race);
  const natureValue = Number(natureMultiplier);
  const scaledValue = coefficient * (raceValue + 3 * normalizedIv);
  const scaled = roundScaledStat(scaledValue, normalizedIv);
  const base = scaled + (isHp ? 70 : 10);

  return Math.round(base * natureValue) + (isHp ? 100 : 50);
}

export function calculateAllPanelStats({
  raceStats,
  displayIvs = {},
  natureMultipliers = {},
}) {
  return Object.fromEntries(
    STAT_KEYS.map((kind) => [
      kind,
      calculatePanelStat({
        kind,
        race: raceStats[kind],
        displayIv: displayIvs[kind] ?? DEFAULT_DISPLAY_IV,
        natureMultiplier: natureMultipliers[kind] ?? 1,
      }),
    ]),
  );
}
