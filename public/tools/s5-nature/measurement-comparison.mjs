import { formatGamePercent } from './hp-inverse.mjs';

// Each group represents one observation; empty groups remain conflicts.
// Keep level in every key so observations from different levels cannot combine.
export function intersectNatureCases(natures, levels, groups = []) {
  let candidates = new Set(levels.flatMap(level => natures.map(n => `${level}:${n.id}`)));
  for (const group of groups) {
    const ids = new Set(group);
    candidates = new Set([...candidates].filter(id => ids.has(id)));
  }
  return {
    candidates: [...candidates],
    matching: natures.filter(n => levels.some(level => candidates.has(`${level}:${n.id}`))),
    used: groups.length,
    conflict: groups.length > 0 && candidates.size === 0,
  };
}

const FORMATS = new Set(['game0', 'round0', 'floor0', 'round1']);
const MAX_HP = Number.MAX_SAFE_INTEGER;
const ceilDiv = (numerator, denominator) => (numerator + denominator - 1n) / denominator;

function displayPercent(hp, damage, format) {
  const percent = (hp - damage) * 100 / hp;
  if (format === 'game0') return formatGamePercent(percent);
  if (format === 'floor0') return Math.floor(percent + 1e-9);
  if (format === 'round1') return Math.round((percent + 1e-9) * 10) / 10;
  return Math.round(percent + 1e-9);
}

// Analytical full-health intervals, before floating-point display stabilization.
// A null upper bound is deliberately open: 99% in game/floor mode cannot
// establish a finite maximum HP. It must never become a search-limit estimate.
function analyticBounds(damage, percent, format) {
  const loss = BigInt(damage);
  if (format === 'game0') {
    if (percent === 99) return { min: loss * 50n + 1n, max: null };
    const shown = BigInt(percent);
    return { min: loss * 100n / (101n - shown) + 1n, max: loss * 100n / (100n - shown) };
  }
  if (format === 'floor0') {
    const shown = BigInt(percent);
    return { min: ceilDiv(loss * 100n, 100n - shown),
      max: percent === 99 ? null : ceilDiv(loss * 100n, 99n - shown) - 1n };
  }
  const scale = format === 'round1' ? 10 : 1;
  const shown = BigInt(Math.round(percent * scale));
  const total = BigInt(200 * scale);
  return { min: ceilDiv(loss * total, total - 2n * shown + 1n),
    max: ceilDiv(loss * total, total - 2n * shown - 1n) - 1n };
}

// Use the analytical endpoint as a pivot, then find the actual display boundary.
// At most 53 comparisons, even for enormous HP: no per-HP scan or arbitrary cap.
function firstHp(damage, endpoint, accepts) {
  let low = damage + 1, high = MAX_HP;
  if (low > high || !accepts(high)) return null;
  const pivot = Number(endpoint > BigInt(MAX_HP) ? BigInt(MAX_HP) : endpoint);
  if (pivot >= low && pivot <= high) {
    if (accepts(pivot)) high = pivot;
    else low = pivot + 1;
  }
  while (low < high) {
    const middle = low + Math.floor((high - low) / 2);
    if (accepts(middle)) high = middle;
    else low = middle + 1;
  }
  return low;
}

function observedRange(damage, percent, format) {
  const bounds = analyticBounds(damage, percent, format);
  const min = firstHp(damage, bounds.min, hp => displayPercent(hp, damage, format) >= percent);
  if (min === null || displayPercent(min, damage, format) !== percent) return null;
  if (bounds.max === null) return { min, max: null };
  const above = firstHp(damage, bounds.max + 1n, hp => displayPercent(hp, damage, format) > percent);
  return { min, max: above === null ? null : above - 1 };
}

/**
 * Compare independent full-health hits using observed loss and remaining HP%.
 * Damage predictions never enter the inversion or determine its matches.
 * max:null means no finite upper bound is established. Separate full-health
 * observations constrain the same maximum HP; they are not consecutive hits.
 * hpPredictions is independent of move support. Only undefined falls back to
 * outgoing move predictions; [] explicitly means no HP model is available.
 */
export function compareObservedHp({ outgoing = [], observed = {}, format = 'game0', hpPredictions } = {}) {
  if (!FORMATS.has(format)) throw new RangeError('血量显示格式无效。');
  const supplied = hpPredictions === undefined ? outgoing.flatMap(row => row?.predictions ?? []) : hpPredictions;
  const hpModel = (Array.isArray(supplied) ? supplied : []).filter(prediction =>
    Number.isSafeInteger(prediction?.hpMax) && prediction.hpMax > 0);
  const hasHpModel = hpModel.length > 0;
  const rows = [];
  let intersection;
  for (const [key, observation] of Object.entries(observed ?? {})) {
    const index = Number(key), damage = observation?.damage, remainingPercent = observation?.remainingPercent;
    if (!Number.isInteger(index) || index < 0 || index > 3 || observation?.invalid
      || !Number.isSafeInteger(damage) || damage <= 0 || damage >= MAX_HP
      || !Number.isFinite(remainingPercent) || remainingPercent <= 0 || remainingPercent >= 100
      || (format === 'round1' ? Math.round(remainingPercent * 10) / 10 !== remainingPercent : !Number.isInteger(remainingPercent))) continue;
    const range = observedRange(damage, remainingPercent, format);
    rows.push({ index, skillName: outgoing[index]?.skillName ?? `技能 ${index + 1}`,
      damage, remainingPercent, min: range?.min ?? null, max: range?.max ?? null });
    if (intersection === null || range === null) intersection = null;
    else if (intersection === undefined) intersection = range;
    else {
      const min = Math.max(intersection.min, range.min);
      const upper = Math.min(intersection.max ?? Infinity, range.max ?? Infinity);
      intersection = min > upper ? null : { min, max: upper === Infinity ? null : upper };
    }
  }
  if (!rows.length) return { rows, status: 'empty', ranges: [], matchedPredictions: [], hasHpModel };
  const ranges = intersection ? [intersection] : [];
  const matchedPredictions = [], seen = new Set();
  if (intersection) for (const prediction of hpModel) {
    const hp = prediction.hpMax, key = `${prediction.targetLevel}:${prediction.natureId}`;
    if (seen.has(key) || !Number.isSafeInteger(hp) || hp < intersection.min
      || (intersection.max !== null && hp > intersection.max)
      || !rows.every(observation => displayPercent(hp, observation.damage, format) === observation.remainingPercent)) continue;
    seen.add(key);
    matchedPredictions.push(prediction);
  }
  return { rows, status: matchedPredictions.length ? 'matched' : 'conflict', ranges, matchedPredictions, hasHpModel };
}
