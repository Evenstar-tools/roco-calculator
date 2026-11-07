// Field fits use the ordinary family's strength-stage-3 defense races. Prefer
// measurements for the exact source form; strength-stage coefficients are the
// fallback, not proof that different species have identical defenses.
// Observed effective-defense points match only their recorded level/nature band
// and source mapping. The fallback keeps its original fractional growth model.
export const WILD_DEFENSE_MODEL = Object.freeze({
  id: 's5-source-defense-v4',
  source: 'user-authorized-encounter-formula-handoff-20261106',
  kind: 'empirical-formula',
  raceStrengthStage: 3,
  coefficientStrengthStage: 'source-form',
  baseTail: 11,
  rounding: 'none',
  shinyMultiplier: 1,
  originalGameFormulaRecovered: false,
  liveObservationSource: 'pve-live-20261107-003806-000353',
  evidenceRevision: '20261108-whale-rounded-defense',
  observedPointScope: 'shield-start observations, including separately marked breaking hits; source-form, level, defense-nature band, race and strength-stage; blood and awakening are not runtime-matched',
  coefficients: Object.freeze({
    1: Object.freeze({ physicalDefense: 1.806, magicalDefense: 1.806 }),
    2: Object.freeze({ physicalDefense: 1.65725, magicalDefense: 1.6005 }),
    3: Object.freeze({ physicalDefense: 1.38531, magicalDefense: 1.335 }),
  }),
  sourceFormCalibrations: Object.freeze({
    // 小翼龙: 42-level neutral defense gives 684/540/99; defense-up with
    // enemy defense dice x1.3 gives 207. Common c interval:
    // (1.642778499942017, 1.6430539157811885]. Other levels retain the
    // existing growth expression; they are not additional field samples.
    3209: Object.freeze({ physicalDefense: 1.643,
      measuredLevels: Object.freeze([42]),
      measuredPhysicalDefenseNatures: Object.freeze(['neutral', 'up']) }),
    // Whale A: positive physical-defense nature confirmed by the user; level41
    // follows the independent full-health HP intersection508. Neutral ground
    // hits249/193 constrain D to(202.724,203.51295336787564]; fire124 cross-checks
    // the current K1.8. This representative effective divisor is not a recovered
    // raw integer panel. Keep this direct observation ahead of the later fit.
    3381: Object.freeze({
      physicalDefensePoints: Object.freeze([
        Object.freeze({ level: 41, naturePercent: 110, raceDefense: 125, strengthStage: 3,
          effectiveDefense: 203, interval: Object.freeze([202.724, 203.51295336787564]),
          intervalBounds: '(lower,upper]', evidencePhase: 'full-health-encounter',
          sampleId: 'whale-a-paired-20261107', valueMeaning: 'effective-damage-divisor',
          rawPanelVerified: false, levelEvidence: 'independent-hp-intersection508',
          positiveNatureConfirmed: true, negativeNatureConfirmed: false,
          conditions: 'PA312; ten-star249 interpreted as ground-spike; seven-star PA312 carried forward; no extra damage modifiers assumed' }),
      ]),
      roundedDefenseFit: Object.freeze({
        coefficient: 1.38, strengthStage: 3,
        raceStats: Object.freeze({ physicalDefense: 125, magicalDefense: 141 }),
        rounding: 'round-half-up-base-nature-final',
        kind: 'empirical-formula', valueMeaning: 'effective-damage-divisor',
        rawPanelVerified: false,
        natureBandEvidence: 'inverse-damage-fit-except-user-confirmed-level41-physical-defense-up',
        measuredScopes: Object.freeze([
          Object.freeze({ level: 41, stat: 'physicalDefense', naturePercents: Object.freeze([100, 110]) }),
          Object.freeze({ level: 42, stat: 'physicalDefense', naturePercents: Object.freeze([90, 100, 110]) }),
          Object.freeze({ level: 43, stat: 'physicalDefense', naturePercents: Object.freeze([100]) }),
          Object.freeze({ level: 41, stat: 'magicalDefense', naturePercents: Object.freeze([100]) }),
          Object.freeze({ level: 43, stat: 'magicalDefense', naturePercents: Object.freeze([100]) }),
        ]),
        // A176/P176 ->138 at level42 remains a mismatch (this fit gives134).
        // A181 gives138, but that conditional replay cannot replace its record.
        conflictingSample: Object.freeze({ level: 42, stat: 'magicalDefense', naturePercent: 100,
          attackerStat: 176, displayedPower: 176, observedDamage: 138, fittedDamage: 134 }),
      }),
      formulaVerified: false }),
    // Only super-effective observations exist here; D174 is conditional on K1.8.
    3398: Object.freeze({
      physicalDefensePoints: Object.freeze([
        Object.freeze({ level: 42, naturePercent: 100, raceDefense: 76, strengthStage: 1,
          effectiveDefense: 174, interval: Object.freeze([173.8627787307, 174.1615120275]),
          intervalBounds: '(lower,upper]', evidencePhase: 'shield-break', fixedOutgoingCorrectionMultiplier: 1.8,
          encounters: Object.freeze([4, 5]), observedBloodIds: Object.freeze([23, 24]),
          // Encounter 4 reveals pollution only after the hit (blood11 ->23).
          // Keep hit-time evidence separate from retrospective form/blood IDs.
          observedPreHitBloodIds: Object.freeze([11, 24]) }),
      ]),
      formulaVerified: false }),
    // Exact source/level/nature points only; magical defense keeps its prior model.
    3444: Object.freeze({
      physicalDefensePoints: Object.freeze([
        Object.freeze({ level: 42, naturePercent: 100, raceDefense: 85, strengthStage: 3,
          // Ground360 ->1331 starts on the shield and breaks it; conditional on K1.8.
          // The later fire205 is post-shield and supplies no defense/type constraint.
          effectiveDefense: 137, interval: Object.freeze([136.9759759760, 137.0788880541]),
          intervalBounds: '(lower,upper]', evidencePhase: 'shield-break',
          fixedOutgoingCorrectionMultiplier: 1.8, observedDamage: 1331,
          encounters: Object.freeze([1]), observedBloodIds: Object.freeze([9]) }),
        Object.freeze({ level: 43, naturePercent: 90, raceDefense: 85, strengthStage: 3,
          effectiveDefense: 126, interval: Object.freeze([125.6964285714, 126.2600896861]),
          intervalBounds: '(lower,upper]', evidencePhase: 'pre-shield', encounters: Object.freeze([2]), observedBloodIds: Object.freeze([13]) }),
      ]),
      formulaVerified: false }),
    // Fire100 ->110 remains within the shield and only gives (253.6577,255.9636].
    // The narrower point uses the later breaking hit dark300 ->332, conditional
    // on intervening effects not changing effective defense. Ground360 ->718 is
    // another breaking hit with K1.8, not an independent recovery of either D or K.
    3802: Object.freeze({
      physicalDefensePoints: Object.freeze([
        Object.freeze({ level: 43, naturePercent: 100, raceDefense: 127, strengthStage: 1,
          effectiveDefense: 254, interval: Object.freeze([253.6576576577, 254.4216867470]),
          intervalBounds: '(lower,upper]', evidencePhase: 'pre-shield-and-break',
          preShieldInterval: Object.freeze([253.6576576577, 255.9636363636]),
          boundaryAssumption: 'intervening effects do not change effective defense',
          encounters: Object.freeze([6, 7]), observedBloodIds: Object.freeze([24]) }),
      ]),
      formulaVerified: false }),
  }),
});

const STATS = ['hp', 'physicalAttack', 'magicalAttack', 'physicalDefense', 'magicalDefense', 'speed'];
const DEFENSE_STATS = ['physicalDefense', 'magicalDefense'];

export function resolveWildDefense(raceDefense, level, nature, stat, strengthStage, sourcePetbaseId) {
  if (!Number.isInteger(raceDefense) || raceDefense < 1 || raceDefense > 1000) {
    throw new RangeError('防御种族值缺失或超出范围。');
  }
  if (![41, 42, 43].includes(level)) throw new RangeError('野生等级仅支持41、42、43。');
  if (!DEFENSE_STATS.includes(stat)) throw new RangeError('野怪防御仅支持物防或魔防。');
  if (!STATS.includes(nature?.upStat) || !STATS.includes(nature?.downStat) || nature.upStat === nature.downStat) {
    throw new RangeError('性格的增强项和削弱项必须是不同的六维属性。');
  }
  if (![1, 2, 3].includes(strengthStage)) throw new RangeError('野怪强度阶段资料缺失。');
  const base = 10 + raceDefense * (level + 50) / 100;
  const naturePercent = nature.upStat === stat ? 110 : nature.downStat === stat ? 90 : 100;
  const calibration = WILD_DEFENSE_MODEL.sourceFormCalibrations[sourcePetbaseId];
  const observed = stat === 'physicalDefense' && calibration?.physicalDefensePoints?.find(point =>
    point.level === level && point.naturePercent === naturePercent
    && point.raceDefense === raceDefense && point.strengthStage === strengthStage);
  const evidence = { stat, strengthStage, sourcePetbaseId, level, naturePercent,
    formulaVerified: false };
  if (observed) return { ...evidence, ...observed, value: observed.effectiveDefense,
    kind: 'effective-defense-point', coefficient: null };
  const roundedFit = calibration?.roundedDefenseFit;
  if (roundedFit?.strengthStage === strengthStage && roundedFit.raceStats[stat] === raceDefense) {
    const roundedBase = Math.round(base);
    const roundedNature = Math.round(roundedBase * naturePercent / 100);
    return { ...evidence,
      value: Math.round((roundedNature + WILD_DEFENSE_MODEL.baseTail) * roundedFit.coefficient),
      kind: 'source-fit', coefficient: roundedFit.coefficient,
      rounding: roundedFit.rounding, roundedBase, roundedNature,
      valueMeaning: roundedFit.valueMeaning, rawPanelVerified: false,
      natureBandEvidence: roundedFit.natureBandEvidence, measuredScopes: roundedFit.measuredScopes,
      sampleScopeMatches: roundedFit.measuredScopes.some(scope => scope.level === level
        && scope.stat === stat && scope.naturePercents.includes(naturePercent)) };
  }
  const coefficient = calibration?.[stat]
    ?? WILD_DEFENSE_MODEL.coefficients[strengthStage][stat];
  const sourceFit = calibration?.[stat] !== undefined;
  const measuredLevels = sourceFit ? calibration.measuredLevels : undefined;
  const measuredPhysicalDefenseNatures = sourceFit ? calibration.measuredPhysicalDefenseNatures : undefined;
  const natureBand = naturePercent === 110 ? 'up' : naturePercent === 90 ? 'down' : 'neutral';
  return { ...evidence, value: coefficient * (base * naturePercent / 100 + WILD_DEFENSE_MODEL.baseTail),
    kind: sourceFit ? 'source-fit' : 'stage-extrapolation', coefficient,
    ...(sourceFit ? { measuredLevels, measuredPhysicalDefenseNatures,
      sampleScopeMatches: measuredLevels?.includes(level) === true
        && measuredPhysicalDefenseNatures?.includes(natureBand) === true } : {}) };
}

export function calculateWildDefense(...args) {
  return resolveWildDefense(...args).value;
}
