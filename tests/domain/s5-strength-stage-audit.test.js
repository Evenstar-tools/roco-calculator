import { test } from 'vitest';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmdirSync, unlinkSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { auditS5StrengthStages, applyAuditMetadata, strengthSourceProvenance } from '../../scripts/audit-s5-strength-stages.mjs';

const read = path => JSON.parse(readFileSync(path, 'utf8'));
const catalog = read('public/tools/s5-nature/data/catalog.json');
const attack = read('public/tools/s5-nature/data/wild-attack-races.json');
const defense = read('public/tools/s5-nature/data/wild-defense-races.json');
const audit = read('data/reviewed/s5-strength-stage-audit-20261107.json');
const named = name => catalog.spirits.find(row => row.name === name);
const entry = name => audit.entries.find(row => row.name === name);
const regenerate = (c = catalog, a = attack, d = defense, rows = audit.packageRecords) =>
  auditS5StrengthStages(c, a, d, rows, audit.source);

test('all 694 identities regenerate offline from the full portable 1302-row source projection', () => {
  assert.deepEqual(regenerate(), audit);
  assert.equal(audit.packageRecords.length, 1302);
  assert.equal(audit.entries.length, catalog.spirits.length);
  assert.equal(audit.counts.verified, 666);
  assert.equal(audit.counts.unconfirmed, 28);
  assert.equal(audit.counts.mismatched, 0);
  assert.deepEqual(audit.counts.byStrengthStage, { 1: 115, 2: 212, 3: 339 });
  assert(!/[A-Z]:[\\/]/u.test(JSON.stringify(audit)));
  for (const row of audit.entries.filter(row => row.status === 'verified')) {
    assert(row.sourceIdentityEvidence.every(source => source.matchedNameFields.length && source.sixRaceStatsMatch), row.name);
    assert.equal(row.catalogStrengthStage, row.expectedStrengthStage, row.name);
    assert.equal(row.defenseMapStrengthStage, row.expectedStrengthStage, row.name);
    assert.deepEqual(row.issues, [], row.name);
  }
});

test('display stage remains independent for single, two-form, three-form and season-legendary entries', () => {
  for (const [name, display, strength, family] of [
    ['迪莫', '一阶', 3, 'single-form'], ['深蓝鲸', '一阶', 3, 'single-form'], ['锤头鹳', '一阶', 3, 'single-form'],
    ['伊雷龙', '一阶', 2, 'two-stage-family'], ['伊兰亚龙', '二阶', 3, 'two-stage-family'],
    ['火花', '一阶', 1, 'three-stage-family'], ['阿布', '一阶', 3, 'single-form'],
    ['冥古龙', '二阶', 3, 'two-stage-family'],
  ]) {
    const row = entry(name);
    assert.equal(row.catalogDisplayStage, display, name);
    assert.equal(row.expectedStrengthStage, strength, name);
    assert.equal(row.evolution.kind, family, name);
  }
  assert.equal(audit.counts.displayStageDiffersFromStrength, 313);
  const altered = structuredClone(catalog), dimo = altered.spirits.find(row => row.name === '迪莫');
  dimo.wildStrengthStage = 1;
  const result = regenerate(altered).entries.find(row => row.spiritId === dimo.id);
  assert.equal(result.expectedStrengthStage, 3);
  assert(result.issues.includes('catalog-strength-stage-mismatch'));
});

test('boss source strength is not replaced with its parent stage; branch sources keep their own stage', () => {
  assert.equal(audit.entries.filter(row => row.status === 'verified' && row.evolution.kind === 'boss').length, 68);
  const fruit = audit.entries.filter(row => row.status === 'verified' && row.evolution.kind === 'boss' && row.expectedStrengthStage === 1);
  assert.deepEqual(fruit.map(row => row.sourcePetbaseId), [5004, 5033, 5034, 5035]);
  assert(fruit.every(row => row.displayStageValue === 4 && row.evolution.ordinaryParentIds.length === 1));
  assert.equal(entry('超能阿布').sourcePetbaseId, 5068);
  assert.equal(entry('超能阿布').expectedStrengthStage, 3);
  assert.equal(entry('乐乐鲨').expectedStrengthStage, 2);
  assert(entry('棋棋（白子）').defenseBranchIds.length > 1);
  assert.equal(entry('棋棋（白子）').expectedStrengthStage, 2);
});

test('wrong source IDs, changed six stats and a map using a different stage cannot receive verified metadata', () => {
  const a = structuredClone(attack), d = structuredClone(defense), c = structuredClone(catalog);
  a.bySpiritId[named('迪莫').id].sourcePetbaseId = 99999999;
  assert(regenerate(catalog, a).entries.find(row => row.name === '迪莫').issues.includes('source-id-missing'));
  c.spirits.find(row => row.name === '迪莫').raceStats.hp++;
  assert(regenerate(c).entries.find(row => row.name === '迪莫').issues.includes('source-name-or-six-races-mismatch'));
  d.strengthStageBySpiritId[named('伊雷龙').id] = 1;
  const badAudit = regenerate(catalog, attack, d);
  assert(badAudit.entries.find(row => row.name === '伊雷龙').issues.includes('defense-map-strength-stage-mismatch'));
  assert.throws(() => applyAuditMetadata(catalog, badAudit), /without mismatches/u);
});

test('the 28 unconfirmed entries stay unconfirmed even when template values have a matching package row', () => {
  const pending = audit.entries.filter(row => row.status === 'unconfirmed');
  assert.equal(pending.length, 28);
  assert.equal(entry('圣龙阿布').reason, 'unconfirmed-race-placeholder');
  const fake = { ...audit.packageRecords.find(row => row.id === 3004), id: 99999999, name: '圣龙阿布',
    hp_max_race: 100, phy_attack_race: 100, spe_attack_race: 100, phy_defence_race: 100, spe_defence_race: 100, speed_race: 100 };
  const next = auditS5StrengthStages(catalog, attack, defense, [...audit.packageRecords, fake], { ...audit.source, rowCount: 1303 });
  const row = next.entries.find(item => item.name === '圣龙阿布');
  assert.equal(row.status, 'unconfirmed');
  assert.equal(row.expectedStrengthStage, null);
  assert.equal(row.unconfirmedIdentityMatchesAreNotPromotionEvidence, true);
  const result = applyAuditMetadata(catalog, next);
  assert.equal(result.spirits.find(spirit => spirit.name === '圣龙阿布').wildStrengthStageEvidence.status, 'unconfirmed');
});

test('original missing strength values are preserved as anomalies instead of being inferred from stage', () => {
  assert.deepEqual(audit.sourceAnomalies.map(row => [row.petbaseId, row.stength_stage, row.action]), [
    [8010, null, 'preserved-not-inferred'], [440317, null, 'preserved-not-inferred'],
  ]);
  const original = audit.packageRecords.find(row => row.id === 3004);
  const rows = audit.packageRecords.map(row => row.id === original.id ? { ...row, stength_stage: null } : row);
  const result = regenerate(catalog, attack, defense, rows).entries.find(row => row.name === '迪莫');
  assert.equal(result.expectedStrengthStage, null);
  assert(result.issues.includes('source-strength-stage-not-unique-or-invalid'));
});

test('the numerical source is overlay 6 after inspection through 12; the overlay-0 locale is not a numerical source', () => {
  assert.equal(audit.source.installedInventoryMatched, true);
  assert.equal(audit.source.inspectedThroughOverlay, 12);
  assert.equal(audit.source.numericalDataPak, 'pakchunk4-WindowsNoEditor_6_P.pak');
  assert.equal(audit.source.historicalZeroOverlayIsCurrentNumericalSource, false);
  const manifest = { clientReadOnly: true, indexAudit: { all: audit.source.inspectedPakNames.map(pak => ({ pak })) }, files: audit.source.files };
  const decoded = { tables: { PETBASE_CONF: { rowCount: 1302, allIndexedRowsFullyConsumed: true, missingLocalizationIndices: [] } } };
  assert.deepEqual(strengthSourceProvenance(manifest, decoded, audit.source.inspectedPakNames), audit.source);
  assert.throws(() => strengthSourceProvenance(manifest, decoded, [...audit.source.inspectedPakNames, 'pakchunk4-WindowsNoEditor_13_P.pak']), /refresh the source/u);
});

test('metadata application changes no numerical or model fields, stays idempotent and refuses stale evidence', () => {
  const before = structuredClone(catalog);
  const attached = applyAuditMetadata(catalog, audit);
  assert.deepEqual(applyAuditMetadata(attached, audit), attached);
  assert.deepEqual(catalog, before);
  const strip = value => {
    const copy = structuredClone(value);
    delete copy.meta.strengthStageAudit;
    for (const spirit of copy.spirits) delete spirit.wildStrengthStageEvidence;
    return copy;
  };
  assert.deepEqual(strip(attached), strip(catalog));
  assert.equal(attached.meta.strengthStageAudit.damageFormulaVerified, false);
  for (const spirit of attached.spirits) assert.equal(spirit.wildStrengthStageEvidence.status, entry(spirit.name).status);
  const stale = structuredClone(catalog);
  stale.spirits.find(row => row.name === '迪莫').raceStats.hp++;
  assert.throws(() => applyAuditMetadata(stale, audit), /Catalog changed/u);
});

test('the actual offline CLI rechecks current inputs, applies metadata and rejects a changed map without writing the catalog', () => {
  const directory = mkdtempSync(join(tmpdir(), 'roco-strength-audit-'));
  const resultPath = join(directory, 'audit.json'), catalogPath = join(directory, 'catalog.json'), mapPath = join(directory, 'defense.json');
  try {
    const clean = structuredClone(catalog);
    delete clean.meta.strengthStageAudit;
    for (const spirit of clean.spirits) delete spirit.wildStrengthStageEvidence;
    writeFileSync(catalogPath, JSON.stringify(clean), 'utf8');
    const cli = ['scripts/audit-s5-strength-stages.mjs', '--offline', '--catalog', catalogPath, '--out', resultPath, '--apply'];
    const success = spawnSync(process.execPath, cli, { encoding: 'utf8' });
    assert.equal(success.status, 0, success.stderr);
    assert.deepEqual(JSON.parse(success.stdout), audit.counts);
    assert.deepEqual(read(resultPath), audit);
    assert.deepEqual(read(catalogPath), applyAuditMetadata(clean, audit));
    const priorCatalog = readFileSync(catalogPath, 'utf8');
    const changed = structuredClone(defense);
    changed.strengthStageBySpiritId[named('伊雷龙').id] = 1;
    writeFileSync(mapPath, JSON.stringify(changed), 'utf8');
    const rejected = spawnSync(process.execPath, [...cli, '--defense-map', mapPath], { encoding: 'utf8' });
    assert.equal(rejected.status, 1);
    assert.equal(JSON.parse(rejected.stdout).mismatched, 1);
    assert.match(rejected.stderr, /伊雷龙 \(defense-map-strength-stage-mismatch\)/u);
    assert.equal(readFileSync(catalogPath, 'utf8'), priorCatalog);
    assert.equal(read(resultPath).entries.find(row => row.name === '伊雷龙').status, 'mismatch');
  } finally {
    for (const path of [resultPath, catalogPath, mapPath]) if (existsSync(path)) unlinkSync(path);
    rmdirSync(directory);
  }
});
