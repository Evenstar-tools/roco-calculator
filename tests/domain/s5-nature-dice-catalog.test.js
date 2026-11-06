// @vitest-environment node
import { test } from 'vitest';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildDiceCatalog } from '../../scripts/pve/build-dice-catalog.mjs';

const text = readFileSync('public/tools/s5-nature/data/dice.json', 'utf8');
const catalog = JSON.parse(text);
const game = catalog.dice.filter(row => Number.isInteger(row.gameEffectId));
const effect = id => game.find(row => row.gameEffectId === id);

test('all 40 original effects and four gameplay types retain distinct IDs and original evidence', () => {
  assert.equal(game.length, 40);
  assert.equal(new Set(game.map(row => row.id)).size, 40);
  assert.deepEqual(game.map(row => row.gameEffectId).sort((a, b) => a - b), Array.from({ length: 40 }, (_, i) => i + 1));
  assert.equal(new Set(catalog.dice.map(row => row.id)).size, catalog.dice.length);
  assert.equal(catalog.diceTypes.length, 4);
  assert.deepEqual(catalog.diceTypes.map(row => row.gameDiceId).sort(), [101, 102, 103, 104]);
  assert.deepEqual(catalog.diceTypes.map(row => row.diceType).sort(), [1, 2, 3, 4]);
  assert(catalog.diceTypes.every(row => row.supportStatus === 'reference'));
  for (const row of game) {
    assert.equal(row.originalConfig.id, row.gameEffectId);
    assert.equal(row.originalConfig.buff_id, row.buffId);
    assert.deepEqual(row.evidenceRefs.filter(ref => ref.table === 'BUFFBASE_CONF').map(ref => ref.recordId), row.originalConfig.buffBases.map(base => base.id));
    assert.equal(row.evidenceStatus, 'original-config-not-live-verified');
    assert.equal(row.formulaVerified, false);
    assert.equal(row.availability.currentlyObtainable, null);
    assert.equal(row.availability.faceConfigReferenceCount, row.originalConfig.faceConfigReferenceCount);
    assert.equal(row.requiresConfirmation, true);
  }
  assert.equal(effect(1).availability.faceConfigReferenceCount, 0);
  assert.equal(effect(39).availability.faceConfigReferenceCount, 0);
});

test('all-stat effects have exactly five attributes and never apply HP', () => {
  for (const [id, multiplier] of [[19, 1.3], [33, 2]]) {
    const row = effect(id);
    assert.equal(row.supported, true);
    assert.equal(row.supportStatus, 'trial');
    assert.deepEqual(row.effects, {
      physicalAttackMultiplier: multiplier, magicalAttackMultiplier: multiplier,
      physicalDefenseMultiplier: multiplier, magicalDefenseMultiplier: multiplier, speedMultiplier: multiplier,
    });
    assert.equal(Object.hasOwn(row.effects, 'hpMultiplier'), false);
  }
  for (const row of game) assert.equal(Object.hasOwn(row.effects, 'hpMultiplier'), false);
});

test('resistance and super-effective coefficients are reference-only, not global scalar effects', () => {
  for (const [id, relation, value] of [[7, 'super-effective', 2.5], [8, 'resistance', .4], [14, 'super-effective', 3.5], [15, 'resistance', .25]]) {
    const row = effect(id);
    assert.deepEqual(row.typeCoefficient, { relation, value });
    assert.equal(row.supported, false);
    assert.deepEqual(row.effects, {});
    assert.match(row.unsupportedReason, /双属性.*极化.*钝化/);
  }
  assert.equal(effect(31).supported, false, 'conditional super-effective damage is not universal damage');
});

test('repeated cost and fixed-speed base records are preserved rather than deduplicated or mis-scaled', () => {
  assert.deepEqual(effect(18).originalConfig.buff.buff_base_ids, [2032007, 2032007, 2032007]);
  assert.deepEqual(effect(18).originalConfig.buffBases.map(row => row.id), [2032007, 2032007, 2032007]);
  assert.deepEqual(effect(36).originalConfig.buffBases.map(row => row.id), Array(5).fill(2001010));
  assert.deepEqual(effect(36).originalConfig.originalAttributeLinks.map(row => row.rawParams[2][0]), Array(5).fill(10));
  assert.equal(effect(18).supported, false);
  assert.equal(effect(36).supported, false);
  assert.deepEqual(effect(36).effects, {});
  assert.deepEqual(effect(4).effects, { speedMultiplier: 1.5 });
});

test('only explicit scalar mappings support trial; event effects do not silently become no-op supported entries', () => {
  assert.deepEqual(game.filter(row => row.supported).map(row => row.gameEffectId), [1, 2, 3, 4, 11, 12, 13, 17, 19, 33, 35, 37]);
  assert.deepEqual(effect(11).effects, { skillPowerAdd: 20 });
  assert.deepEqual(effect(17).effects, { skillPowerAdd: 40 });
  assert.deepEqual(effect(12).effects, { physicalAttackMultiplier: 2 });
  assert.deepEqual(effect(13).effects, { magicalAttackMultiplier: 2 });
  assert.deepEqual(effect(35).effects, { physicalDefenseMultiplier: 1.2, magicalDefenseMultiplier: 1.2 });
  assert.deepEqual(effect(37).effects, { physicalAttackMultiplier: 1.15 });
  for (const row of game.filter(row => !row.supported)) {
    assert.equal(row.supportStatus, 'unsupported');
    assert.ok(row.unsupportedReason.length > 10);
    assert.deepEqual(row.effects, {});
  }
});

test('legacy neutral, manual, unresolved and resource IDs remain usable without leaking private filesystem paths', () => {
  const byId = id => catalog.dice.find(row => row.id === id);
  assert.equal(byId('none').supported, true);
  assert.deepEqual(byId('manual-power-plus-40').effects, { skillPowerAdd: 40 });
  assert.equal(byId('manual-power-plus-40').aliasOf, 'game-dice-effect-17');
  assert.equal(byId('manual-power-plus-40').legacyAlias, true);
  assert.equal(byId('unresolved-all-stats-plus-30').supported, false);
  assert.equal(byId('unresolved-all-stats-plus-30').aliasOf, 'game-dice-effect-19');
  assert.match(byId('unresolved-all-stats-plus-30').description, /不含生命/);
  assert.doesNotMatch(byId('unresolved-all-stats-plus-30').description, /范围待核对|范围未知|没有确认/);
  assert.equal(byId('unresolved-all-stats-plus-30').knownParameters[0].stats.length, 5);
  assert.equal(catalog.dice.filter(row => row.id.startsWith('resource-dice-')).length, 7);
  assert.doesNotMatch(text, /[A-Za-z]:[\\/]|Users[\\/](?:Administrator|ADMINI)/u);
});

test('generator can replay from retained original records and fails closed when a mapping loses evidence', () => {
  const source = { sourceSnapshotDate: '2026-11-06', records: game.map(row => structuredClone(row.originalConfig)),
    diceItems: catalog.diceTypes.map(row => structuredClone(row.originalConfig)) };
  assert.deepEqual(buildDiceCatalog(source, catalog).dice.filter(row => row.gameEffectId), game);
  source.records.find(row => row.id === 19).originalAttributeLinks.pop();
  const rebuilt = buildDiceCatalog(source, catalog).dice.find(row => row.gameEffectId === 19);
  assert.equal(rebuilt.supported, false);
  assert.deepEqual(rebuilt.effects, {});
  assert.throws(() => buildDiceCatalog({ ...source, records: source.records.slice(1) }, catalog), /40 unique/);
});
