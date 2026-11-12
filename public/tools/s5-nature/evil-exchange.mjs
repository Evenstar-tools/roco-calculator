import { isWildLevel } from './wild-levels.mjs';
export const EVIL_EXCHANGE_SKILL_ID = 'skill_34907641b22d0f70';
export function exchangeRowEnabled(saved, ownSpiritId) {
  return saved?.enabled === true || (ownSpiritId === 'spirit_684f5cd1fec1df27' && saved?.ownSpiritId !== ownSpiritId);
}

const STATS = new Set(['hp', 'physicalAttack', 'magicalAttack', 'physicalDefense', 'magicalDefense', 'speed']);
const positiveInteger = value => Number.isSafeInteger(value) && value > 0;

function percentBasisPoints(value) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 100) return null;
  const basisPoints = Math.round(value * 100);
  return basisPoints / 100 === value ? basisPoints : null;
}

// Full-health user, with an explicitly supplied exact target percentage.
// A rounded UI HP percentage does not establish this exact internal percentage.
// The player-facing default instead uses evilExchangeHealingRange below.
// hp is the target's body HP; ordinary/shiny shield scaling does not enter here.
export function evilExchangeHealing(hp, targetPercent = 10) {
  if (!positiveInteger(hp)) throw new RangeError('最大生命值必须为正安全整数。');
  const basisPoints = percentBasisPoints(targetPercent);
  if (basisPoints === null) throw new RangeError('野怪剩余比例须为0至100的数值，最多两位小数。');
  return Number((BigInt(hp) * BigInt(10000 - basisPoints) + 9999n) / 10000n);
}

export function evilExchangeHealingRange(hp, targetPercent = 10, percentMode = 'display') {
  if (!positiveInteger(hp)) throw new RangeError('最大生命值必须为正安全整数。');
  if (percentMode === 'exact') {
    const healing = evilExchangeHealing(hp, targetPercent);
    return { min: healing, max: healing };
  }
  if (percentMode !== 'display' || !Number.isInteger(targetPercent) || targetPercent < 0 || targetPercent > 100) {
    throw new RangeError('血条显示值须为0至100的整数。');
  }
  const maxHp = BigInt(hp), percent = BigInt(targetPercent);
  // Client HP display: ceil in (0,99], floor above 99; full HP alone shows100.
  // Invert that display to actual integer HP, then heal to full. Never round
  // an observed "10%" into a claim that the hidden ratio is exactly0.1.
  const low = targetPercent === 0 ? 0n : targetPercent === 100 ? maxHp : maxHp * (percent - 1n) / 100n + 1n;
  const high = targetPercent === 99 ? maxHp - 1n : maxHp * percent / 100n;
  return low > high ? null : { min: Number(maxHp - high), max: Number(maxHp - low) };
}

function readHealing(value) {
  if (value == null || (typeof value === 'string' && value.trim() === '')) return { used: false };
  if (typeof value === 'string') {
    if (!/^\d+$/.test(value.trim())) return { used: true, invalid: true };
    value = Number(value.trim());
  }
  return positiveInteger(value) ? { used: true, healing: value } : { used: true, invalid: true };
}

function modelPredictions(hpByLevel, natures, targetPercent, percentMode) {
  if (!Array.isArray(hpByLevel) || hpByLevel.length === 0 || !Array.isArray(natures) || natures.length === 0) return [];
  const levels = new Set(), natureIds = new Set();
  for (const row of hpByLevel) {
    if (!isWildLevel(row?.level) || levels.has(row.level)
      || !['down', 'neutral', 'up'].every(band => {
        const values = Array.isArray(row[band]) ? row[band] : [row[band]];
        return values.length > 0 && values.every(positiveInteger);
      })) return [];
    levels.add(row.level);
  }
  for (const nature of natures) {
    if (!nature || !((typeof nature.id === 'string' && nature.id.trim() !== '') || Number.isSafeInteger(nature.id))
      || natureIds.has(String(nature.id)) || !STATS.has(nature.upStat) || !STATS.has(nature.downStat)
      || nature.upStat === nature.downStat) return [];
    natureIds.add(String(nature.id));
  }
  return hpByLevel.flatMap(row => natures.flatMap(nature => {
    const hpValues = row[nature.upStat === 'hp' ? 'up' : nature.downStat === 'hp' ? 'down' : 'neutral'];
    return [...new Set(Array.isArray(hpValues) ? hpValues : [hpValues])].flatMap(hpMax => {
      const range = evilExchangeHealingRange(hpMax, targetPercent, percentMode);
      if (!range) return [];
      return [{ targetLevel: row.level, natureId: nature.id, upStat: nature.upStat,
        downStat: nature.downStat, hpMax, healingMin: range.min, healingMax: range.max,
        ...(range.min === range.max ? { healing: range.min } : {}) }];
    });
  }));
}

export function compareEvilExchange({ healing, hpByLevel, natures, targetPercent = 10, percentMode = 'exact' } = {}) {
  const observed = readHealing(healing);
  const empty = { used: observed.used, invalid: Boolean(observed.invalid),
    status: 'unused', candidates: [], matching: [], predictions: [] };
  if (!observed.used) return empty;
  const basisPoints = percentBasisPoints(targetPercent);
  if (basisPoints === null || !['exact', 'display'].includes(percentMode)
    || (percentMode === 'display' && !Number.isInteger(targetPercent))) {
    return { ...empty, invalid: true, status: 'invalid', reason: 'invalid-target-percent' };
  }
  if (basisPoints === 10000) return { ...empty, invalid: false, status: 'unavailable', reason: 'no-healing' };
  if (observed.invalid) return { ...empty, status: 'invalid' };
  const predictions = modelPredictions(hpByLevel, natures, targetPercent, percentMode);
  if (!predictions.length) return { ...empty, status: 'unavailable' };
  const matched = predictions.filter(prediction => observed.healing >= prediction.healingMin && observed.healing <= prediction.healingMax);
  const ids = new Set(matched.map(prediction => prediction.natureId));
  return { ...empty, status: matched.length ? 'matched' : 'conflict', predictions,
    candidates: [...new Set(matched.map(prediction => `${prediction.targetLevel}:${prediction.natureId}`))],
    matching: natures.filter(nature => ids.has(nature.id)) };
}
