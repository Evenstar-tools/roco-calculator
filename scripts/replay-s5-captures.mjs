// Audit recorded outcomes against the actual PVE preview. A numerical match is
// conditional on the empirical wild-stat model, never proof of the game formula.
import fs from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { previewMatchup } from '../public/tools/s5-nature/matchup-preview.mjs';

const fixtureUrl = new URL('../tests/fixtures/s5-capture-20261107.json', import.meta.url);
const catalogUrl = new URL('../public/tools/s5-nature/data/catalog.json', import.meta.url);
const read = url => JSON.parse(fs.readFileSync(url, 'utf8'));
const statKeys = { hp: 'max_hp', physicalAttack: 'physical_attack', magicalAttack: 'magical_attack',
  physicalDefense: 'physical_defense', magicalDefense: 'magical_defense', speed: 'speed' };
const loss = (before, after) => Number.isFinite(before) && Number.isFinite(after) ? before - after : null;

function replayHit(hit, fixture, catalog) {
  const before = hit.target_state_before?.attributes ?? {}, after = hit.target_state_after?.attributes ?? {};
  const result = { id: hit.id, session: hit.session, encounter: hit.encounter, pointer: hit.event_pointer,
    kind: hit.kind, skill: fixture.skill_names[hit.skill_config_id] ?? null,
    observed: hit.raw_damage, predicted: null, error: null, observedPower: hit.observed_power,
    pools: { hpBefore: before.hp ?? null, hpAfter: after.hp ?? null, hpLoss: loss(before.hp, after.hp),
      shieldBefore: before.shield ?? null, shieldAfter: after.shield ?? null,
      shieldLoss: loss(before.shield, after.shield) },
    formulaVerified: false, limitations: [], status: 'missing-input' };
  if (hit.kind === 'self_cost') return { ...result, status: 'separate-resource-cost',
    limitations: ['Self-cost is recorded independently; not fitted with the ordinary damage formula.'] };
  if (!['outgoing', 'incoming'].includes(hit.kind)) return { ...result, limitations: ['Unsupported damage channel.'] };
  const incoming = hit.kind === 'incoming';
  const wild = incoming ? hit.caster_state : hit.target_state_before;
  const own = incoming ? hit.target_state_before : hit.caster_state;
  const encounter = fixture.encounters.find(e => e.session === hit.session && e.encounter === hit.encounter);
  const finalWild = encounter?.final_states.find(pet => pet.pet_id === wild?.pet_id);
  const sourceId = wild?.base_conf_id === 9006 ? finalWild?.base_conf_id : wild?.base_conf_id;
  const target = catalog.spirits.find(s => s.wildDefenseRaceStats?.sourcePetbaseId === sourceId);
  const attacker = catalog.spirits.find(s => s.wildDefenseRaceStats?.sourcePetbaseId === own?.base_conf_id);
  const natureName = fixture.nature_names[wild?.nature_id];
  const nature = catalog.natures.find(n => n.name === natureName);
  const skill = catalog.skills.find(s => s.name === result.skill);
  const missing = [];
  if (!target || !attacker || !nature || !skill) missing.push('species, nature or skill identity');
  if (!Number.isInteger(own?.inspire_lv)) missing.push('own awakening (not saved in the early capture)');
  if (!Number.isInteger(hit.raw_damage) || typeof hit.critical !== 'boolean') missing.push('damage or critical flag');
  if (!incoming && !Number.isFinite(hit.observed_power)) missing.push('target-specific skill power');
  if (missing.length) return { ...result, limitations: missing };
  if (wild.base_conf_id === 9006) result.limitations.push('Species identity is retrospective; hit-time state is preserved.');
  result.limitations.push('Enemy combat stats are hidden; attack/defense are empirical model values.');
  const powerObserved = Number.isFinite(hit.observed_power);
  if (!powerObserved) result.limitations.push('Dynamic target power was not saved; static automatic power is a conditional comparison.');
  const profile = { spiritId: attacker.id, level: own.level, awakening: own.inspire_lv,
    panel: Object.fromEntries(Object.entries(statKeys).map(([key, raw]) => [key, own.attributes[raw]])) };
  const input = { targetId: target.id, level: wild.level, profile,
    skillIds: incoming ? [] : [skill.id], incomingSkillIds: incoming ? [skill.id] : [] };
  if (powerObserved) {
    if (incoming) input.incomingOverridesList = [{ displayedPower: hit.observed_power }];
    else input.skillOverrides = { [skill.id]: { displayedPower: hit.observed_power } };
  }
  const preview = previewMatchup(input, catalog);
  const entry = incoming ? preview.incoming : preview.outgoing[0];
  const predicted = entry?.predictions?.find(p => p.natureId === nature.id);
  if (!predicted || entry.hitCount !== 1) return { ...result, limitations: [...result.limitations,
    entry?.reason || 'No supported single-hit prediction.'] };
  // The only captured critical pair is 223 ->446. Keep that assumption explicit.
  const criticalMultiplier = hit.critical ? 2 : 1;
  if (hit.critical) result.limitations.push('Critical x2 is supported by the captured 223/446 pair; not a recovered universal rule.');
  result.predicted = predicted.damage * criticalMultiplier;
  result.error = result.predicted - result.observed;
  result.status = result.error === 0 ? 'conditional-match' : 'model-mismatch';
  result.target = target.name;
  result.targetLevel = wild.level;
  result.nature = natureName;
  result.modelInputs = { attackerStat: predicted.attackerStat, defenderDefense: predicted.defenderDefense,
    displayedPower: entry.displayedPower, effectivePower: entry.effectivePower,
    correction: entry.typeInteraction?.correctionMultiplier, criticalMultiplier,
    powerSource: powerObserved ? 'recorded-target-power' : 'automatic-static-power' };
  // Diagnostic only: burst activation is observed, but enemy final power is not.
  // Do not silently substitute this branch for the actual automatic preview.
  if (incoming && hit.skill_config_id === 7020980 && !powerObserved) {
    const burst = previewMatchup({ ...input, incomingOverridesList: [{ displayedPower: 45 }] }, catalog).incoming;
    result.burst90Candidate = { predicted: burst.predictions.find(p => p.natureId === nature.id).damage,
      displayedPower: 45, assumption: '(base60 + burst30) * ordinary resistance0.5; dynamic power unavailable' };
  }
  return result;
}

export function replayCapturedDamage(fixture = read(fixtureUrl), catalog = read(catalogUrl)) {
  if (fixture.counts.damage_events !== fixture.hits.length || fixture.counts.encounters !== fixture.encounters.length) {
    throw new RangeError('Capture fixture coverage differs from its recorded inventory.');
  }
  const rows = fixture.hits.map(hit => replayHit(hit, fixture, catalog));
  const counts = Object.fromEntries([...new Set(rows.map(r => r.status))]
    .map(status => [status, rows.filter(r => r.status === status).length]));
  const syncErrors = fixture.encounters.flatMap(e => e.sync_inconsistencies);
  const unexplainedPoolChanges = fixture.encounters.flatMap(e => e.pool_changes.filter(p => p.kind === 'snapshot_gap')
    .map(p => ({ session: e.session, encounter: e.encounter, ...p })));
  const numericallyComplete = !rows.some(r => ['model-mismatch', 'missing-input'].includes(r.status));
  const dynamicPowerComplete = fixture.hits.filter(h => h.kind !== 'self_cost').every(h => Number.isFinite(h.observed_power));
  return { scope: fixture.scope, counts, capturedDamageEvents: rows.length,
    encounterCount: fixture.encounters.length, emptySessions: fixture.empty_sessions,
    recordedHealing: fixture.heals, unexplainedPoolChanges, syncErrors,
    numericallyComplete, dynamicPowerComplete, originalGameFormulaRecovered: false,
    acceptancePassed: numericallyComplete && dynamicPowerComplete && syncErrors.length === 0 && unexplainedPoolChanges.length === 0,
    rows };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2);
  if (args.length && !(args.length === 2 && args[0] === '--out')) {
    console.error('Usage: node scripts/replay-s5-captures.mjs [--out report.json]');
    process.exitCode = 2;
  } else {
    const result = replayCapturedDamage();
    if (args[1]) fs.writeFileSync(args[1], `${JSON.stringify(result, null, 2)}\n`, 'utf8');
    console.log(JSON.stringify({ fixture: fileURLToPath(fixtureUrl), counts: result.counts,
      acceptancePassed: result.acceptancePassed, originalGameFormulaRecovered: false,
      unresolved: result.rows.filter(r => ['model-mismatch', 'missing-input'].includes(r.status)) }, null, 2));
    // Fail closed: a regression suite can pass while this whole-record gate fails.
    if (!result.acceptancePassed) process.exitCode = 1;
  }
}
