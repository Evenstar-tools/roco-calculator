// @vitest-environment node
import { test } from 'vitest';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { replayCapturedDamage } from '../../scripts/replay-s5-captures.mjs';
import { WILD_DEFENSE_MODEL } from '../../public/tools/s5-nature/wild-defense.mjs';

const fixture = JSON.parse(readFileSync('tests/fixtures/s5-capture-20261107.json', 'utf8'));
const audit = replayCapturedDamage(fixture);

test('all sessions remain in the audit without fitting post-shield hits', () => {
  assert.equal(audit.encounterCount, 11);
  assert.equal(audit.capturedDamageEvents, 22);
  assert.deepEqual(audit.counts, { 'excluded-post-shield': 3, 'model-mismatch': 1,
    'separate-resource-cost': 6, 'conditional-match': 12 });
  assert.deepEqual(audit.rows.filter(r => r.kind === 'incoming').map(r => [r.observed, r.predicted]),
    [[29, 19], [37, 37], [37, 37], [32, 32]]);
  assert.equal(audit.rows.find(r => r.skill === '天旋地转').burst90Candidate.predicted, 29);
  assert.equal(audit.rows[0].observed, 228);
  assert.equal(audit.rows[0].predicted, null);
  assert.equal(audit.rows[0].observedPower, null);
  assert.equal(audit.acceptancePassed, false);
  assert.equal(audit.dynamicPowerComplete, false);
  assert.equal(audit.originalGameFormulaRecovered, false);
  const removed = structuredClone(fixture);
  removed.hits.pop();
  assert.throws(() => replayCapturedDamage(removed), /coverage/);
});

test('replay keeps raw outgoing hits but only compares shield-stage and break-boundary predictions', () => {
  const rows = audit.rows.filter(r => r.kind === 'outgoing' && r.session === '20261107-003806-000353');
  const values = [1331, 205, 223, 446, 223, 582, 582, 718, 110, 110, 332];
  assert.deepEqual(rows.map(r => r.observed), values);
  assert.deepEqual(rows.map(r => r.predicted), [1331, null, 223, 446, null, 582, 582, 718, 110, 110, 332]);
  assert(rows.filter(r => r.phase !== 'post-shield').every(r => r.status === 'conditional-match' && r.formulaVerified === false));
  assert.equal(rows.find(r => r.observed === 446).modelInputs.criticalMultiplier, 2);
});

test('damage result, overkill, resource cost and shield/HP sequence remain distinct', () => {
  assert.deepEqual(audit.rows[0].pools, { hpBefore: 19, hpAfter: 0, hpLoss: 19,
    shieldBefore: 0, shieldAfter: 0, shieldLoss: 0 });
  const rows = audit.rows.filter(r => r.encounter === 7 && r.kind === 'outgoing');
  assert.deepEqual(rows.map(r => [r.observed, r.pools.shieldBefore, r.pools.shieldAfter, r.pools.hpAfter]),
    [[110, 420, 310, 210], [110, 310, 200, 210], [332, 200, 0, 21]]);
  const costs = audit.rows.filter(r => r.kind === 'self_cost');
  assert.deepEqual(costs.map(r => r.observed), [40, 60, 60, 60, 60, 60]);
  assert(costs.every(r => r.predicted === null && r.pools.hpLoss === r.observed));
  assert.equal(audit.syncErrors.length, 0);
  assert(audit.unexplainedPoolChanges.length > 0); // Never invent damage for early snapshot gaps.
});

test('pollution reveal, changed HP maximum and later healing do not backfill the previous hit', () => {
  const hit = fixture.hits.find(h => h.session === '20261107-003806-000353' && h.encounter === 4 && h.kind === 'outgoing');
  assert.equal(hit.target_state_before.blood_id, 11);
  assert.equal(hit.target_state_after.blood_id, 11);
  assert.equal(hit.target_state_before.attributes.max_hp, 140);
  assert.equal(hit.target_revealed_identity_retrospective.identity.blood_id, 23);
  const encounter = fixture.encounters.find(e => e.session === hit.session && e.encounter === 4);
  const reveal = encounter.pool_changes.find(p => p.field === 'max_hp');
  assert.equal(reveal.before, 140);
  assert.equal(reveal.after, 146);
  assert.deepEqual(fixture.heals[0].target_sync, [{ pet_id: 401, hp_change: 36, hp_result: 50 }]);
  const point = WILD_DEFENSE_MODEL.sourceFormCalibrations[3398].physicalDefensePoints[0];
  assert.deepEqual(point.observedPreHitBloodIds, [11, 24]);
  assert.deepEqual(point.observedBloodIds, [23, 24]);
});


test('phase eligibility follows the wild pet shield rather than the damaged player shield', () => {
  assert.deepEqual(audit.phaseCounts, { 'post-shield': 3, 'pre-shield': 7, 'resource-cost': 6, 'shield-break': 6 });
  const pre = audit.rows.filter(row => row.preShieldEligible);
  assert.deepEqual(pre.filter(row => row.kind === 'outgoing').map(row => row.observed), [223, 110, 110]);
  assert.deepEqual(pre.filter(row => row.kind === 'incoming').map(row => row.observed), [29, 37, 37, 32]);
  assert(pre.filter(row => row.kind === 'incoming').every(row => row.wildShieldBefore > 0 && row.pools.shieldBefore === 0));
  assert.deepEqual(audit.rows.filter(row => row.phase === 'shield-break').map(row => row.observed), [1331, 446, 582, 582, 718, 332]);
  assert(audit.rows.filter(row => row.phase !== 'pre-shield').every(row => row.preShieldEligible === false));
  assert.deepEqual(audit.rows.filter(row => row.phase === 'post-shield').map(row => row.observed), [228, 205, 223]);
  assert(audit.rows.filter(row => row.phase === 'post-shield').every(row => row.predicted === null && row.error === null));
  assert.equal(audit.preShieldAudit.damageEvents, 7);
  assert.equal(audit.preShieldAudit.dynamicPowerComplete, false);
  assert.equal(audit.preShieldAudit.acceptancePassed, false);
});

test('unknown shield state does not become a pre-shield sample or a numeric zero', () => {
  const missing = structuredClone(fixture);
  const hit = missing.hits.find(row => row.kind === 'incoming');
  delete hit.caster_state.attributes.shield;
  const result = replayCapturedDamage(missing).rows.find(row => row.id === hit.id);
  assert.equal(result.phase, 'unknown');
  assert.equal(result.wildShieldBefore, null);
  assert.equal(result.preShieldEligible, false);
  assert.equal(result.predicted, null);
  assert.equal(result.status, 'missing-phase');
});


test('a matching pre-shield hit cannot pass while its resource synchronization is unresolved', () => {
  const one = structuredClone(fixture);
  const hit = one.hits.find(row => row.raw_damage === 223 && row.target_state_before.attributes.shield > 0);
  const encounter = one.encounters.find(row => row.session === hit.session && row.encounter === hit.encounter);
  one.hits = [hit]; one.encounters = [encounter];
  one.counts.damage_events = 1; one.counts.encounters = 1;
  encounter.sync_inconsistencies = []; encounter.pool_changes = [];
  assert.equal(replayCapturedDamage(one).preShieldAudit.acceptancePassed, true);
  encounter.sync_inconsistencies.push({ field: 'shield', expected: 139, observed: 140 });
  assert.equal(replayCapturedDamage(one).preShieldAudit.acceptancePassed, false);
  encounter.sync_inconsistencies = [];
  encounter.pool_changes.push({ kind: 'snapshot_gap', field: 'shield', before: 139, after: 140 });
  assert.equal(replayCapturedDamage(one).preShieldAudit.acceptancePassed, false);
});
