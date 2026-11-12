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
// The default is the freshly broken-shield 10% condition; a rounded UI HP
// percentage by itself does not establish that exact internal percentage.
// hp is the target's body HP; ordinary/shiny shield scaling does not enter here.
export function evilExchangeHealing(hp, targetPercent = 10) {
  if (!positiveInteger(hp)) throw new RangeError('最大生命值必须为正安全整数。');
  const basisPoints = percentBasisPoints(targetPercent);
  if (basisPoints === null) throw new RangeError('野怪剩余比例须为0至100的数值，最多两位小数。');
  return Number((BigInt(hp) * BigInt(10000 - basisPoints) + 9999n) / 10000n);
}

function readHealing(value) {
  if (value == null || (typeof value === 'string' && value.trim() === '')) return { used: false };
  if (typeof value === 'string') {
    if (!/^\d+$/.test(value.trim())) return { used: true, invalid: true };
    value = Number(value.trim());
  }
  return positiveInteger(value) ? { used: true, healing: value } : { used: true, invalid: true };
}

function modelPredictions(hpByLevel, natures, targetPercent) {
  if (!Array.isArray(hpByLevel) || hpByLevel.length === 0 || !Array.isArray(natures) || natures.length === 0) return [];
  const levels = new Set(), natureIds = new Set();
  for (const row of hpByLevel) {
    if (!isWildLevel(row?.level) || levels.has(row.level)
      || !['down', 'neutral', 'up'].every(band => positiveInteger(row[band]))) return [];
    levels.add(row.level);
  }
  for (const nature of natures) {
    if (!nature || !((typeof nature.id === 'string' && nature.id.trim() !== '') || Number.isSafeInteger(nature.id))
      || natureIds.has(String(nature.id)) || !STATS.has(nature.upStat) || !STATS.has(nature.downStat)
      || nature.upStat === nature.downStat) return [];
    natureIds.add(String(nature.id));
  }
  return hpByLevel.flatMap(row => natures.map(nature => {
    const hpMax = row[nature.upStat === 'hp' ? 'up' : nature.downStat === 'hp' ? 'down' : 'neutral'];
    return { targetLevel: row.level, natureId: nature.id, upStat: nature.upStat,
      downStat: nature.downStat, hpMax, healing: evilExchangeHealing(hpMax, targetPercent) };
  }));
}

export function compareEvilExchange({ healing, hpByLevel, natures, targetPercent = 10 } = {}) {
  const observed = readHealing(healing);
  const empty = { used: observed.used, invalid: Boolean(observed.invalid),
    status: 'unused', candidates: [], matching: [], predictions: [] };
  if (!observed.used) return empty;
  const basisPoints = percentBasisPoints(targetPercent);
  if (basisPoints === null) return { ...empty, invalid: true, status: 'invalid', reason: 'invalid-target-percent' };
  if (basisPoints === 10000) return { ...empty, invalid: false, status: 'unavailable', reason: 'no-healing' };
  if (observed.invalid) return { ...empty, status: 'invalid' };
  const predictions = modelPredictions(hpByLevel, natures, targetPercent);
  if (!predictions.length) return { ...empty, status: 'unavailable' };
  const matched = predictions.filter(prediction => prediction.healing === observed.healing);
  const ids = new Set(matched.map(prediction => prediction.natureId));
  return { ...empty, status: matched.length ? 'matched' : 'conflict', predictions,
    candidates: matched.map(prediction => `${prediction.targetLevel}:${prediction.natureId}`),
    matching: natures.filter(nature => ids.has(nature.id)) };
}
