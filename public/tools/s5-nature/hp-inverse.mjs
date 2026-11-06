const HP_DIRECTIONS = new Set(['hp', 'outgoing', 'poison']);
const MAX_SAFE_BIGINT = BigInt(Number.MAX_SAFE_INTEGER);

function safeInteger(value, minimum = 0) {
  return Number.isSafeInteger(value) && value >= minimum;
}

function floorDiv(numerator, denominator) {
  const quotient = numerator / denominator;
  return numerator < 0n && numerator % denominator !== 0n ? quotient - 1n : quotient;
}

function ceilDiv(numerator, denominator) {
  return -floorDiv(-numerator, denominator);
}

function percentage(value, digits) {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 100) {
    throw new RangeError('生命百分比必须是 0 至 100 的有限数字。');
  }
  const scale = 10 ** digits;
  const shown = Math.round(value * scale);
  if (shown / scale !== value) throw new RangeError('生命百分比与选择的小数精度不符。');
  return { shown: BigInt(shown), denominator: BigInt(100 * scale) };
}

// Client UMG_Battle_HP_C.GetPercentForShow: ceil positive percentages,
// except the (99, 100] band, which is floored. Input is percent, not a ratio.
export function formatGamePercent(value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new RangeError('百分比必须是有限数字。');
  const clamped = Math.min(100, Math.max(0, value));
  // A ratio such as 28/100*100 can acquire a few floating-point ULPs.
  const nearest = Math.round(clamped);
  const percent = Math.abs(clamped - nearest) <= Number.EPSILON * Math.max(1, clamped) * 4 ? nearest : clamped;
  return percent > 99 ? Math.floor(percent) : percent > 0 ? Math.max(1, Math.ceil(percent)) : 0;
}

// Return every integer HP that displays this percentage, including boundary ties.
function percentageInterval(maximumHp, value, mode) {
  if (!value) return [0, maximumHp];
  const hp = BigInt(maximumHp);
  let low;
  let high;
  if (mode === 'game') {
    if (value.shown === 0n) return [0, 0];
    if (value.shown === 100n) return [maximumHp, maximumHp];
    if (value.shown === 99n) return [Number(floorDiv(98n * hp, 100n) + 1n), maximumHp - 1];
    low = floorDiv((value.shown - 1n) * hp, 100n) + 1n;
    high = floorDiv(value.shown * hp, 100n);
  } else if (mode === 'floor') {
    low = ceilDiv(value.shown * hp, value.denominator);
    high = ceilDiv((value.shown + 1n) * hp, value.denominator) - 1n;
  } else {
    low = ceilDiv((2n * value.shown - 1n) * hp, 2n * value.denominator);
    high = ceilDiv((2n * value.shown + 1n) * hp, 2n * value.denominator) - 1n;
  }
  return [Math.max(0, Number(low)), Math.min(maximumHp, Number(high))];
}

function isPresent(value) {
  return value !== null && value !== undefined;
}

function explicitBreak(observation) {
  return observation.hpChainBreak === true || observation.chainBreak === true ||
    observation.blocked === true || observation.status === 'blocked';
}

function compileObservations(observations) {
  const events = [];
  const blocked = [];
  const notes = [];
  let usedCount = 0;

  observations.forEach((observation, index) => {
    const id = typeof observation?.id === 'string' ? observation.id : null;
    const block = reason => {
      blocked.push({ index, id, reason, chainReset: true });
      events.push({ reset: true });
    };
    if (!observation || typeof observation !== 'object') {
      block('观测记录缺失，已中断剩余生命链。');
      return;
    }
    if (observation.context !== 'clean') {
      block('观测状态未确认，已中断剩余生命链。');
      return;
    }
    if (explicitBreak(observation)) {
      block(observation.blockedReason || '该记录可能包含额外回血或扣血，已中断剩余生命链。');
      return;
    }
    if (observation.direction === 'incoming') return;
    if (!HP_DIRECTIONS.has(observation.direction)) {
      block('记录方向不支持生命上限反推，已中断剩余生命链。');
      return;
    }
    if (!safeInteger(observation.damage)) {
      block('请填写非负整数的实际扣血，不能用未验证的理论伤害代替。');
      return;
    }
    if (isPresent(observation.beforeFull) && typeof observation.beforeFull !== 'boolean') {
      block('受击前真实满血标记必须是布尔值。');
      return;
    }
    if (isPresent(observation.defeated) && typeof observation.defeated !== 'boolean') {
      block('倒下标记必须是布尔值。');
      return;
    }

    const hasPercent = (isPresent(observation.beforePercent) && observation.beforeFull !== true) || isPresent(observation.afterPercent);
    if (hasPercent && ![0, 1].includes(observation.percentDigits)) {
      block('请选择整数或一位小数的生命百分比精度。');
      return;
    }
    if (hasPercent && !['game', 'round', 'floor'].includes(observation.percentMode)) {
      block('请选择百分比显示算法：游戏整数显示、四舍五入或向下取整。');
      return;
    }
    if (hasPercent && observation.percentMode === 'game' && observation.percentDigits !== 0) {
      block('游戏百分比只显示整数，请将小数精度设为整数。');
      return;
    }
    if (observation.beforeFull === true && isPresent(observation.beforePercent) && observation.beforePercent !== 100) {
      block('已确认受击前满血，但扣血前百分比未填写 100%。');
      return;
    }

    let before;
    let after;
    try {
      before = observation.beforeFull === true ? null : percentage(observation.beforePercent, observation.percentDigits);
      after = percentage(observation.afterPercent, observation.percentDigits);
    } catch (error) {
      block(error.message);
      return;
    }

    let poisonRange = null;
    if (observation.direction === 'poison') {
      const multiplier = observation.poison?.typeMultiplier;
      if (observation.poison?.immune === true || multiplier === 0 || multiplier?.numerator === 0) {
        block('毒伤免疫或 0 倍率不能反推生命上限。');
        return;
      }
      if (observation.poison?.confirmed === true) {
        const poison = invertPoisonTick(observation.damage, observation.poison);
        if (poison.status === 'unconfirmed') {
          block([...poison.missing.map(key => `缺少 ${key}`), ...poison.blocked].join('；'));
          return;
        }
        poisonRange = poison.range;
        if (poison.status === 'conflict') poisonRange = { min: 1, max: 0 };
      } else {
        notes.push({ index, id, reason: '毒伤条件尚未确认，本条仅按已知实际扣血传播生命区间。' });
      }
    }

    usedCount++;
    events.push({
      damage: observation.damage,
      before,
      after,
      beforeFull: observation.beforeFull === true,
      defeated: observation.defeated === true,
      mode: observation.percentMode,
      poisonRange,
    });
  });
  return { events, blocked, notes, usedCount };
}

function allowsMaximumHp(maximumHp, events) {
  let low = 1;
  let high = maximumHp;
  for (const event of events) {
    if (event.reset) {
      low = 1;
      high = maximumHp;
      continue;
    }
    if (event.poisonRange && (maximumHp < event.poisonRange.min || maximumHp > event.poisonRange.max)) return false;

    const before = event.beforeFull
      ? [maximumHp, maximumHp]
      : percentageInterval(maximumHp, event.before, event.mode);
    low = Math.max(low, before[0], event.damage, 1);
    high = Math.min(high, before[1]);
    if (low > high) return false;

    low -= event.damage;
    high -= event.damage;
    const after = event.defeated ? [0, 0] : [0, maximumHp];
    const displayedAfter = percentageInterval(maximumHp, event.after, event.mode);
    low = Math.max(low, after[0], displayedAfter[0]);
    high = Math.min(high, after[1], displayedAfter[1]);
    if (low > high) return false;
  }
  return true;
}

function normalizeCandidateRanges(ranges) {
  if (!Array.isArray(ranges)) throw new TypeError('生命候选区间必须是数组。');
  const sorted = ranges.map(range => {
    if (!range || !safeInteger(range.min, 1) || !safeInteger(range.max, 1) || range.min > range.max) {
      throw new RangeError('生命候选区间必须由正安全整数的 min / max 构成。');
    }
    return { min: range.min, max: range.max };
  }).sort((left, right) => left.min - right.min);
  const merged = [];
  for (const range of sorted) {
    const previous = merged.at(-1);
    if (previous && range.min - previous.max <= 1) previous.max = Math.max(previous.max, range.max);
    else merged.push(range);
  }
  return merged;
}

/**
 * Infer integer maximum HP from observed losses without any species/stat model.
 * Each candidate maximum HP carries one integer remaining-HP interval, never a
 * set of individual HP points. A blocked event resets this interval while all
 * earlier maximum-HP constraints remain in force.
 *
 * beforePercent:100 is a displayed percentage. Only beforeFull:true confirms
 * actual full HP. capped/truncated mean the result reaches the search boundary;
 * max is then a searched bound, not a proven global upper bound.
 *
 * candidateRanges optionally supplies exhaustive finite maximum-HP candidates
 * already obtained analytically (for example from explicit poison conditions).
 * Those intervals replace the default 1..maxHp search, including above maxHp;
 * an empty array means no candidates. Callers must not pass arbitrary partial
 * search windows as if they were exhaustive evidence.
 */
export function invertHpObservations(observations, { maxHp = 10000, candidateRanges } = {}) {
  if (!Array.isArray(observations)) throw new TypeError('观测记录必须是数组。');
  if (!safeInteger(maxHp, 1)) throw new RangeError('搜索生命上限必须是正的安全整数。');
  const analyticCandidates = candidateRanges !== undefined;
  const searchRanges = analyticCandidates ? normalizeCandidateRanges(candidateRanges) : [{ min: 1, max: maxHp }];
  const { events, blocked, notes, usedCount } = compileObservations(observations);
  const result = {
    status: 'empty', ranges: [], min: null, max: null, count: 0,
    usedCount, blocked, notes, upperBoundSearched: searchRanges.at(-1)?.max ?? 0, capped: false, truncated: false,
  };
  if (!usedCount) return result;

  for (const range of searchRanges) {
    for (let maximumHp = range.min; maximumHp <= range.max; maximumHp++) {
      if (!allowsMaximumHp(maximumHp, events)) continue;
      const previous = result.ranges.at(-1);
      if (previous && previous.max === maximumHp - 1) previous.max = maximumHp;
      else result.ranges.push({ min: maximumHp, max: maximumHp });
      result.count++;
    }
  }
  if (!result.count) return { ...result, status: 'conflict' };
  result.min = result.ranges[0].min;
  result.max = result.ranges.at(-1).max;
  result.capped = !analyticCandidates && result.max === maxHp;
  result.truncated = result.capped;
  result.status = result.count === 1 ? 'unique' : 'range';
  return result;
}

function positiveRational(value) {
  return value && typeof value === 'object' &&
    safeInteger(value.numerator, 1) && safeInteger(value.denominator, 1);
}

/**
 * Invert explicitly specified equal poison ticks. Damage is the observed total
 * for repeatCount ticks; rounding is applied to each tick before summation.
 * Rational factors are supplied as {numerator,denominator}, never decimal floats.
 */
export function invertPoisonTick(damage, options = {}) {
  const result = {
    status: 'unconfirmed', range: null, min: null, max: null, count: 0,
    missing: [], blocked: [],
    assumptions: ['按最大生命乘每层比例、层数和属性倍率，每次取整后累加 repeatCount 次；不包含额外上限或其他伤害。'],
  };
  if (!options || typeof options !== 'object' || Array.isArray(options)) {
    return { ...result, blocked: ['请显式提供毒层数、比例、属性倍率、取整方式和跳字次数。'] };
  }
  for (const key of ['layers', 'percentPerLayer', 'typeMultiplier', 'rounding', 'repeatCount']) {
    if (!isPresent(options[key])) result.missing.push(key);
  }
  if (!safeInteger(damage)) result.blocked.push('实际毒扣血必须是非负安全整数。');
  if (isPresent(options.layers) && !safeInteger(options.layers, 1)) result.blocked.push('毒层数必须是明确的正整数。');
  if (isPresent(options.repeatCount) && !safeInteger(options.repeatCount, 1)) result.blocked.push('跳字次数必须是明确的正整数。');
  if (isPresent(options.percentPerLayer) && !positiveRational(options.percentPerLayer)) {
    result.blocked.push('每层毒比例必须是正有理数 {numerator,denominator}。');
  }
  if (isPresent(options.typeMultiplier) && !positiveRational(options.typeMultiplier)) {
    result.blocked.push('属性倍率必须是正有理数；免疫或 0 倍率不能反推生命上限。');
  }
  if (isPresent(options.rounding) && !['floor', 'round', 'ceil'].includes(options.rounding)) {
    result.blocked.push('毒伤取整算法尚未确认。');
  }
  if (result.missing.length || result.blocked.length) return result;

  if (damage % options.repeatCount !== 0) return { ...result, status: 'conflict' };
  const perTick = BigInt(damage / options.repeatCount);
  const numerator = BigInt(options.layers) * BigInt(options.percentPerLayer.numerator) * BigInt(options.typeMultiplier.numerator);
  const denominator = BigInt(options.percentPerLayer.denominator) * BigInt(options.typeMultiplier.denominator);
  let minimum;
  let maximum;
  if (options.rounding === 'floor') {
    minimum = ceilDiv(perTick * denominator, numerator);
    maximum = ceilDiv((perTick + 1n) * denominator, numerator) - 1n;
  } else if (options.rounding === 'ceil') {
    minimum = floorDiv((perTick - 1n) * denominator, numerator) + 1n;
    maximum = floorDiv(perTick * denominator, numerator);
  } else {
    minimum = ceilDiv((2n * perTick - 1n) * denominator, 2n * numerator);
    maximum = ceilDiv((2n * perTick + 1n) * denominator, 2n * numerator) - 1n;
  }
  minimum = minimum < 1n ? 1n : minimum;
  if (minimum > maximum) return { ...result, status: 'conflict' };
  if (maximum > MAX_SAFE_BIGINT) {
    return { ...result, blocked: ['反推结果超出安全整数范围，请缩小显式比例参数。'] };
  }
  result.min = Number(minimum);
  result.max = Number(maximum);
  result.count = result.max - result.min + 1;
  result.range = { min: result.min, max: result.max };
  result.status = result.count === 1 ? 'unique' : 'range';
  return result;
}
