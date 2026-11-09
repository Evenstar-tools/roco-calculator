// Audit the original (intentionally misspelled) PETBASE_CONF.stength_stage.
// Display/evolution stage is a separate field; no fitted coefficient is proved here.
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const ARTIFACT = 'data/reviewed/s5-strength-stage-audit-20261107.json';
const STAT_FIELDS = Object.freeze({ hp: 'hp_max_race', physicalAttack: 'phy_attack_race',
  magicalAttack: 'spe_attack_race', physicalDefense: 'phy_defence_race',
  magicalDefense: 'spe_defence_race', speed: 'speed_race' });
const DISPLAY_STAGES = Object.freeze({ 一阶: 1, 二阶: 2, 三阶: 3, 首领: 4 });
const unique = values => [...new Set(values)].sort((a, b) => a - b);
const rowsOf = value => Array.isArray(value) ? value : Object.values(value ?? {});
const sameRaces = (spirit, row) => row && Object.entries(STAT_FIELDS)
  .every(([key, field]) => Number.isInteger(spirit.raceStats?.[key]) && spirit.raceStats[key] === row[field]);
const namesOf = spirit => [spirit.name, spirit.baseName, ...(spirit.aliases ?? []), ...(spirit.formerNames ?? [])].filter(Boolean);
const sourceIds = entry => entry ? unique(entry.sourcePetbaseIds ?? [entry.sourcePetbaseId]) : [];
const isBoss = row => row.stage === 4 || row.is_boss === 1;

function projectRecord(row) {
  return { id: row.id, name: row.name, stage: row.stage ?? null, stength_stage: row.stength_stage ?? null,
    legal_petbase: row.legal_petbase ?? null, is_boss: row.is_boss ?? null,
    ...Object.fromEntries(Object.values(STAT_FIELDS).map(field => [field, row[field] ?? null])),
    evolution_pet_id: row.evolution_pet_id ?? [], bosspetbase_id_arry: row.bosspetbase_id_arry ?? [] };
}

// Keep the source row set portable, including anomalous/NPC records. Filtering it
// down to expected successes would conceal ambiguous identities on regeneration.
export function strengthSourceProvenance(manifest, decodeAudit, installedPakNames) {
  const table = decodeAudit?.tables?.PETBASE_CONF;
  if (!table || table.allIndexedRowsFullyConsumed !== true || table.missingLocalizationIndices?.length) {
    throw new Error('PETBASE_CONF requires complete row consumption and resolved localization.');
  }
  const scans = Object.values(manifest?.indexAudit ?? {}).flat();
  const inspectedPakNames = [...new Set(scans.map(row => row.pak))].sort();
  if (!inspectedPakNames.length || !manifest.clientReadOnly) throw new Error('A read-only overlay inventory is required.');
  if (installedPakNames && JSON.stringify([...installedPakNames].sort()) !== JSON.stringify(inspectedPakNames)) {
    throw new Error('Installed pak inventory differs from the extraction inventory; refresh the source before auditing.');
  }
  const role = path => path.includes('/BinConf/') ? 'schema' : path.includes('/BinDataCompressed/') ? 'data'
    : path.includes('/dev_CN/') ? 'locale-dev_CN' : 'locale-zh_Hans';
  const files = (manifest.files ?? []).filter(row => row.path?.endsWith('/PETBASE_CONF.non') || row.path?.endsWith('/PETBASE_CONF.bytes'))
    .map(row => ({ role: role(row.path), pak: row.pak, path: row.path, storedEntryPath: row.storedEntryPath ?? row.path,
      mountPoint: row.mountPoint ?? null, customStrategy: row.customStrategy ?? null }));
  const dataFile = files.find(row => row.role === 'data');
  if (!dataFile) throw new Error('Missing final PETBASE_CONF numerical-data provenance.');
  return { table: 'PETBASE_CONF', rowCount: table.rowCount, allIndexedRowsFullyConsumed: true,
    missingLocalizationCount: 0, inspectedPakNames, installedInventoryMatched: !!installedPakNames,
    inspectedThroughOverlay: Math.max(...inspectedPakNames.map(name => Number(name.match(/_(\d+)_P\.pak$/u)?.[1] ?? -1))),
    files, numericalDataPak: dataFile.pak, historicalZeroOverlayIsCurrentNumericalSource: /_0_P\.pak$/u.test(dataFile.pak),
    note: 'Newest numerical table, schema and locale are selected separately after mount-point-aware overlay resolution; a surviving _0_P locale does not make _0_P numerical data current.' };
}

export function auditS5StrengthStages(catalog, attack, defense, petbase, provenance) {
  if (!Array.isArray(catalog?.spirits) || !attack?.bySpiritId || !defense?.bySpiritId || !defense?.strengthStageBySpiritId) {
    throw new TypeError('Expected the complete encounter catalog and both wild-race maps.');
  }
  const packageRecords = rowsOf(petbase).map(projectRecord).sort((a, b) => a.id - b.id);
  const byId = new Map(packageRecords.map(row => [row.id, row]));
  if (byId.size !== packageRecords.length || packageRecords.length !== provenance?.rowCount) {
    throw new Error('PETBASE_CONF row count/IDs differ from the fully decoded source.');
  }
  const children = row => row.evolution_pet_id.map(id => byId.get(id)).filter(child => child && !isBoss(child));
  const parents = new Map();
  for (const row of packageRecords.filter(row => !isBoss(row))) for (const child of children(row)) {
    if (!parents.has(child.id)) parents.set(child.id, []);
    parents.get(child.id).push(row.id);
  }
  function evolutionEvidence(source) {
    const bossParentIds = packageRecords.filter(row => !isBoss(row) && row.bosspetbase_id_arry.includes(source.id)).map(row => row.id);
    if (isBoss(source)) return { kind: 'boss', ordinaryParentIds: bossParentIds };
    const pending = [source.id], visited = new Set();
    while (pending.length) {
      const id = pending.pop();
      if (visited.has(id)) continue;
      visited.add(id);
      const row = byId.get(id);
      pending.push(...children(row).map(child => child.id), ...(parents.get(id) ?? []));
    }
    const family = [...visited].map(id => byId.get(id));
    const stageSlots = unique(family.map(row => row.stage));
    return { kind: stageSlots.length === 1 ? 'single-form' : stageSlots.length === 2 ? 'two-stage-family' : 'three-stage-family',
      ordinaryStageSlots: stageSlots, ordinaryFamilySize: family.length,
      branching: family.some(row => children(row).length > 1),
      sourceChildIds: children(source).map(row => row.id), sourceParentIds: parents.get(source.id) ?? [],
      sourceBossIds: source.bosspetbase_id_arry.filter(id => isBoss(byId.get(id) ?? {})) };
  }
  const entries = catalog.spirits.map(spirit => {
    const id = spirit.id;
    const branchForms = [...(attack.candidatesBySpiritId?.[id] ?? []), ...(defense.candidatesBySpiritId?.[id] ?? []), ...(spirit.wildStatForms ?? [])];
    const mappings = [attack.bySpiritId[id], defense.bySpiritId[id], ...branchForms.flatMap(form => [form.attackRaceStats, form.defenseRaceStats])].filter(Boolean);
    const referenceSets = mappings.map(sourceIds);
    const referencedIds = unique(referenceSets.flat());
    const nativeDefense = defense.bySpiritId[id];
    const defenseRacePetbaseIds = nativeDefense ? unique(nativeDefense.defensePetbaseIds ?? [nativeDefense.defensePetbaseId]) : [];
    const legacyDefenseBranchIds = unique((spirit.legacyWildStatFormIds ?? [])
      .map(formId => Number(/^petbase-(\d+)$/u.exec(formId)?.[1])).filter(Number.isInteger));
    const primaryId = attack.bySpiritId[id]?.sourcePetbaseId ?? defense.bySpiritId[id]?.sourcePetbaseId
      ?? branchForms[0]?.attackRaceStats?.sourcePetbaseId ?? null;
    const referenced = referencedIds.map(sourceId => byId.get(sourceId));
    const identityNames = namesOf(spirit);
    const exact = packageRecords.filter(row => identityNames.includes(row.name) && sameRaces(spirit, row));
    const legal = exact.filter(row => row.legal_petbase === 1);
    const identityCandidates = legal.length ? legal : exact;
    const expectedStages = unique(referenced.filter(Boolean).map(row => row.stength_stage));
    const expected = referenced.length && referenced.every(Boolean) && expectedStages.length === 1
      && [1, 2, 3].includes(expectedStages[0]) ? expectedStages[0] : null;
    const unavailable = spirit.wildDataStatus === 'unavailable' || spirit.sourceCategory === '未开放'
      || spirit.previewIdentity?.raceStatsPlaceholder === true
      || !Object.keys(STAT_FIELDS).every(key => Number.isInteger(spirit.raceStats?.[key]) && spirit.raceStats[key] > 0);
    const issues = [];
    if (!unavailable) {
      if (!referenced.length || referenced.some(row => !row)) issues.push('source-id-missing');
      if (referenced.some(row => row && (!identityNames.includes(row.name) || !sameRaces(spirit, row)))) issues.push('source-name-or-six-races-mismatch');
      if (referenceSets.some(ids => JSON.stringify(ids) !== JSON.stringify(referencedIds))) issues.push('source-ids-disagree-between-maps-or-branches');
      if (expected === null) issues.push('source-strength-stage-not-unique-or-invalid');
      if (spirit.wildStrengthStage !== expected) issues.push('catalog-strength-stage-mismatch');
      if (defense.strengthStageBySpiritId[id] !== expected) issues.push('defense-map-strength-stage-mismatch');
      if (JSON.stringify(defenseRacePetbaseIds) !== JSON.stringify(referencedIds)
        || nativeDefense?.physicalDefense !== spirit.raceStats.physicalDefense
        || nativeDefense?.magicalDefense !== spirit.raceStats.magicalDefense) issues.push('defense-race-not-selected-form');
      if (byId.get(primaryId)?.stage !== DISPLAY_STAGES[spirit.stage]) issues.push('display-stage-primary-source-mismatch');
      if (identityCandidates.some(row => row.stength_stage !== expected)) issues.push('exact-identity-candidates-disagree-on-strength');
    }
    const status = unavailable ? 'unconfirmed' : issues.length ? 'mismatch' : 'verified';
    const reason = unavailable ? spirit.previewIdentity?.raceStatsPlaceholder === true ? 'unconfirmed-race-placeholder'
      : 'unreleased-or-incomplete-race-stats' : null;
    const source = byId.get(primaryId);
    return { spiritId: id, name: spirit.name, sourceCategory: spirit.sourceCategory ?? null,
      catalogDisplayStage: spirit.stage, displayStageValue: DISPLAY_STAGES[spirit.stage] ?? null,
      catalogStrengthStage: spirit.wildStrengthStage ?? null, defenseMapStrengthStage: defense.strengthStageBySpiritId[id] ?? null,
      status, reason, issues, sourcePetbaseId: primaryId, sourcePetbaseIds: referencedIds,
      identityCandidateIds: identityCandidates.map(row => row.id),
      sourceIdentityEvidence: referenced.filter(Boolean).map(row => ({ petbaseId: row.id,
        matchedNameFields: ['name', 'baseName', 'aliases', 'formerNames'].filter(key => Array.isArray(spirit[key]) ? spirit[key].includes(row.name) : spirit[key] === row.name),
        sixRaceStatsMatch: sameRaces(spirit, row), packageDisplayStage: row.stage, packageStrengthStage: row.stength_stage })),
      expectedStrengthStage: unavailable ? null : expected,
      displayStageDiffersFromStrength: !unavailable && DISPLAY_STAGES[spirit.stage] !== expected,
      evolution: source ? evolutionEvidence(source) : null,
      defenseRacePetbaseIds, legacyDefenseBranchIds,
      unconfirmedIdentityMatchesAreNotPromotionEvidence: unavailable && identityCandidates.length > 0 };
  });
  const counts = { catalog: entries.length, verified: 0, unconfirmed: 0, mismatched: 0, byStrengthStage: { 1: 0, 2: 0, 3: 0 },
    displayStageDiffersFromStrength: 0, boss: 0, branchingTargets: 0 };
  for (const row of entries) {
    counts[row.status === 'mismatch' ? 'mismatched' : row.status]++;
    if (row.status !== 'verified') continue;
    counts.byStrengthStage[row.expectedStrengthStage]++;
    if (row.displayStageDiffersFromStrength) counts.displayStageDiffersFromStrength++;
    if (row.evolution.kind === 'boss') counts.boss++;
    if (row.evolution.branching) counts.branchingTargets++;
  }
  return { schemaVersion: 1, auditDate: '2026-11-07',
    scope: 'Every catalog source identity and original strength-stage field; not proof of wild damage coefficients or final formulas.',
    strengthField: 'stength_stage', displayStageField: 'stage', defenseRaceSource: 'selected-form', legacyDefenseBranchUse: 'session-migration-only',
    source: provenance, counts, entries,
    sourceAnomalies: packageRecords.filter(row => ![1, 2, 3].includes(row.stength_stage)).map(row => ({ petbaseId: row.id,
      name: row.name, stage: row.stage, stength_stage: row.stength_stage, action: 'preserved-not-inferred' })),
    packageRecords };
}

export function applyAuditMetadata(catalog, audit) {
  const result = structuredClone(catalog);
  const entries = new Map(audit.entries.map(row => [row.spiritId, row]));
  const sources = new Map(audit.packageRecords.map(row => [row.id, row]));
  if (entries.size !== catalog.spirits.length || audit.counts.mismatched) throw new Error('Only a complete audit without mismatches may attach verified metadata.');
  for (const spirit of result.spirits) {
    const row = entries.get(spirit.id);
    if (!row || row.name !== spirit.name || (row.status === 'verified' && (row.expectedStrengthStage !== spirit.wildStrengthStage
      || !sameRaces(spirit, sources.get(row.sourcePetbaseId)) || spirit.wildDataStatus === 'unavailable'))) {
      throw new Error(`Catalog changed since the stage audit: ${spirit.name}`);
    }
    spirit.wildStrengthStageEvidence = { source: 'PETBASE_CONF', field: 'stength_stage',
      ...(row.status === 'verified' ? { petbaseId: row.sourcePetbaseId, status: 'verified' }
        : { status: 'unconfirmed', reason: row.reason }) };
  }
  result.meta.strengthStageAudit = { source: 'PETBASE_CONF', field: 'stength_stage', artifact: ARTIFACT,
    counts: { catalog: audit.counts.catalog, verified: audit.counts.verified, unconfirmed: audit.counts.unconfirmed, mismatched: audit.counts.mismatched },
    damageFormulaVerified: false };
  return result;
}

async function main(args) {
  const options = { '--catalog': 'public/tools/s5-nature/data/catalog.json', '--attack-map': 'public/tools/s5-nature/data/wild-attack-races.json',
    '--defense-map': 'public/tools/s5-nature/data/wild-defense-races.json', '--petbase': '', '--manifest': '', '--decode-audit': '', '--pak-root': '', '--out': ARTIFACT };
  let apply = false, offline = false;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--apply') { apply = true; continue; }
    if (args[i] === '--offline') { offline = true; continue; }
    if (!Object.hasOwn(options, args[i]) || !args[i + 1]) throw new Error('Expected --catalog/--attack-map/--defense-map/--petbase/--manifest/--decode-audit/--pak-root/--out <path>, --offline or --apply.');
    options[args[i]] = args[++i];
  }
  const parse = async path => JSON.parse((await readFile(path, 'utf8')).replace(/^\uFEFF/u, ''));
  const [catalog, attack, defense] = await Promise.all(['--catalog', '--attack-map', '--defense-map'].map(key => parse(options[key])));
  let audit;
  if (offline) {
    // Re-audit today's catalog/maps against the portable original fields. The
    // stored counts/entries are not reused, and no installed client is needed.
    const portable = await parse(ARTIFACT);
    audit = auditS5StrengthStages(catalog, attack, defense, portable.packageRecords, portable.source);
  } else {
    if (!options['--petbase'] || !options['--manifest'] || !options['--decode-audit']) {
      throw new Error('Use --offline with the reviewed repository source, or supply --petbase, --manifest and --decode-audit for a fresh client audit.');
    }
    const [petbase, manifest, decodeAudit] = await Promise.all(['--petbase', '--manifest', '--decode-audit'].map(key => parse(options[key])));
    const installedPakNames = (await readdir(options['--pak-root'] || manifest.pakRoot))
      .filter(name => /^pakchunk4-WindowsNoEditor(?:_\d+_P)?\.pak$/u.test(name));
    audit = auditS5StrengthStages(catalog, attack, defense, petbase, strengthSourceProvenance(manifest, decodeAudit, installedPakNames));
  }
  await writeFile(options['--out'], `${JSON.stringify(audit, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify(audit.counts));
  if (audit.counts.mismatched) {
    console.error(`Strength-stage audit mismatch: ${audit.entries.filter(row => row.status === 'mismatch').map(row => `${row.name} (${row.issues.join(', ')})`).join('; ')}`);
    process.exitCode = 1;
    return;
  }
  if (apply) {
    const text = await readFile(options['--catalog'], 'utf8'), newline = text.includes('\r\n') ? '\r\n' : '\n';
    const latestCatalog = JSON.parse(text.replace(/^\uFEFF/u, ''));
    await writeFile(options['--catalog'], (text.startsWith('\uFEFF') ? '\uFEFF' : '')
      + `${JSON.stringify(applyAuditMetadata(latestCatalog, audit), null, 2)}\n`.replaceAll('\n', newline), 'utf8');
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) await main(process.argv.slice(2));
