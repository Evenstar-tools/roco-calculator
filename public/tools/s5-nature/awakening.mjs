// INSPIRE_LEVEL_CONF main data is from _3_P; the _4_P ROW data matches it.
// attr_type93/94 are cumulative values: 4500,9000,13500,18000,22500.
// PETBASE_CONF gives Luoyin's stone_enhance/demon_enhance baseline2500.
// type_enhance_data is [1500,1500] at every step. With the user-confirmed
// five-star25% and ten-star100% endpoints, each awakening adds15 percentage
// points to the own-type bonus. It does not multiply the old1.25 by2.
// Main/ROW and all installed overlays through _12_P were checked in
// output/pve-awakening-formula-audit-20261106/latest-awakening-verification.json.
// These percentages do NOT define the polarization/dulling damage formula.
export const AWAKENING_SOURCE = Object.freeze({
  kind: 'local-game-pak-and-user-confirmed-endpoints',
  pak: 'pakchunk4-WindowsNoEditor_3_P.pak',
  tables: Object.freeze(['PETBASE_CONF', 'INSPIRE_LEVEL_CONF']),
  basisPointScale: 10000,
  newerOverlaysVerified: true,
  verifiedThroughPak: 'pakchunk4-WindowsNoEditor_12_P.pak',
  rowPak: 'pakchunk4-WindowsNoEditor_4_P.pak',
  newerOverlayVerificationScope: 'INSPIRE_LEVEL_CONF main and ROW only; both match the retained five-row data.',
  verificationEvidence: 'output/pve-awakening-formula-audit-20261106/latest-awakening-verification.json',
  typeInteractionFormulaVerified: false,
});

export const AWAKENING_LEVELS = Object.freeze([
  [5, 0, 25, 0, 0],
  [6, 1, 40, 45, 45],
  [7, 2, 55, 90, 90],
  [8, 3, 70, 135, 135],
  [9, 4, 85, 180, 180],
  [10, 5, 100, 225, 225],
].map(([totalStars, awakening, sameTypeBonusPercent, polarizationPercent, dullingPercent]) => Object.freeze({
  totalStars, awakening, sameTypeBonusPercent,
  sameTypeMultiplier: (100 + sameTypeBonusPercent) / 100,
  polarizationPercent, dullingPercent,
})));

export function getAwakeningBonuses(awakening) {
  if (!Number.isInteger(awakening) || awakening < 0 || awakening >= AWAKENING_LEVELS.length) {
    throw new RangeError('觉醒次数须为0至5，对应总星级5至10星。');
  }
  return AWAKENING_LEVELS[awakening];
}

// Ratio bounds cross-checked against two original video demonstrations/tables.
// This is not recovered game code; double-type interactions remain an extension.
export const TYPE_INTERACTION_MODEL = Object.freeze({
  id: 's5-monotone-type-fit-v3',
  basis: 'relation-bounds-preserving-high-star-samples',
  formulaVerified: false,
  evidence: 'docs/maintenance/s5-dulling-continuity-fix-20261107.md',
});

/** Apply awakening AFTER the calculator has combined the defender's types.
 * Keep full precision here; only the damage core owns damage rounding.
 * Immune and neutral relations stay unchanged. Both sides at equal awakening
 * recover the original relation. Higher dulling never creates negative damage.
 */
export function resolveAwakeningType(baseMultiplier, attackerAwakening, defenderAwakening, mixedRelation = false) {
  if (typeof baseMultiplier !== 'number' || !Number.isFinite(baseMultiplier) || baseMultiplier < 0 || baseMultiplier > 3) {
    throw new RangeError('合成后的属性倍率须为0至3的有限数字。');
  }
  const attacker = getAwakeningBonuses(attackerAwakening);
  const defender = getAwakeningBonuses(defenderAwakening);
  const ratio = (100 + attacker.polarizationPercent) / (100 + defender.dullingPercent);
  const modeled = (attackerAwakening > 0 || defenderAwakening > 0) && (mixedRelation || (baseMultiplier !== 0 && baseMultiplier !== 1));
  // Wild P/D are zero (user-confirmed): preview applies only our polarization
  // on outgoing hits and only our dulling on incoming hits. Keep the existing
  // high-star anchors, but use one bound per relation at every level: switching
  // rules at eight stars made higher dulling increase damage. Low-star values
  // are consistency extrapolations, not newly measured calibration points.
  const lowerBound = baseMultiplier > 1 ? .72 : .6;
  const correctionMultiplier = baseMultiplier === 0 || baseMultiplier === 1 ? 1
    : Math.max(lowerBound, Math.min(1.8, ratio));
  const multiplier = baseMultiplier * correctionMultiplier;
  return {
    multiplier, baseMultiplier, correctionMultiplier,
    polarizationPercent: attacker.polarizationPercent, dullingPercent: defender.dullingPercent,
    model: modeled ? TYPE_INTERACTION_MODEL.id : 'calculator-type-chart',
    approximate: modeled,
    formulaVerified: !modeled,
  };
}
