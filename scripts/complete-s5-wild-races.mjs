// Complete the reviewed S5 wild-stat export without choosing an arbitrary
// evolution branch or promoting unreleased/template records to live data.
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const STAT_FIELDS = Object.freeze({ hp: 'hp_max_race', physicalAttack: 'phy_attack_race',
  magicalAttack: 'spe_attack_race', physicalDefense: 'phy_defence_race',
  magicalDefense: 'spe_defence_race', speed: 'speed_race' });
const complete = stats => Object.keys(STAT_FIELDS).every(key => Number.isInteger(stats?.[key]) && stats[key] > 0);
const races = row => Object.fromEntries(Object.entries(STAT_FIELDS).map(([key, field]) => [key, row[field]]));
const sameRaces = (stats, row) => Object.entries(STAT_FIELDS).every(([key, field]) => stats?.[key] === row[field]);
const boss = row => row?.stage === 4 || row?.is_boss === 1;
const placeholder = spirit => spirit.sourceCategory === '未开放' || spirit.previewIdentity?.raceStatsPlaceholder === true;
const sorted = values => [...new Set(values)].sort((a, b) => a - b);
const candidateId = form => Number(form.id?.replace(/^petbase-/u, ''));

function sourceEvidence(row) {
  return { id: row.id, name: row.name, stage: row.stage, strengthStage: row.stength_stage,
    raceStats: races(row), evolutionPetbaseIds: row.evolution_pet_id ?? [],
    bossPetbaseIds: row.bosspetbase_id_arry ?? [], degeneratePetbaseId: row.degenerate_pet_id ?? null,
    legalPetbase: row.legal_petbase ?? null };
}

function formName(row, spirits, sourceSpirit) {
  let matches = spirits.filter(spirit => !placeholder(spirit) && spirit.stage !== '首领'
    && [spirit.name, spirit.baseName].includes(row.name) && sameRaces(spirit.raceStats, row));
  const sameVariant = sourceSpirit?.variantName
    ? matches.filter(spirit => spirit.variantName === sourceSpirit.variantName) : [];
  if (sameVariant.length) matches = sameVariant;
  const names = [...new Set(matches.map(spirit => spirit.name))];
  return names.length === 1 ? names[0] : `${row.name}（包体 ${row.id}）`;
}

function statEntries(source, form, name) {
  return {
    attackRaceStats: { sourcePetbaseId: source.id, attackPetbaseId: source.id, attackFormName: source.name,
      physicalAttack: source.phy_attack_race, magicalAttack: source.spe_attack_race, resolution: 'selected-form' },
    defenseRaceStats: { sourcePetbaseId: source.id, defensePetbaseId: source.id, defenseFormName: source.name,
      physicalDefense: source.phy_defence_race, magicalDefense: source.spe_defence_race, resolution: 'selected-form' },
  };
}

function updateMapMeta(data, spiritCount) {
  const missingByReason = {};
  for (const row of Object.values(data.missing)) missingByReason[row.code] = (missingByReason[row.code] ?? 0) + 1;
  const mapped = Object.keys(data.bySpiritId).length;
  const branchSelectable = Object.keys(data.candidatesBySpiritId).filter(id => !data.bySpiritId[id]).length;
  data.meta.counts = { ...data.meta.counts, spirits: spiritCount, mapped, branchSelectable,
    missing: Object.keys(data.missing).length, available: mapped + branchSelectable, missingByReason };
  data.meta.completion = { source: 'PETBASE_CONF', evidence: 'data/reviewed/s5-wild-race-completion-20261107.json',
    branchPolicy: 'selected-form-stats;legacy-evolution-ids-only', bossPolicy: 'unique-ordinary-stage3-parent' };
  // Provenance identifies the table, never a workstation-specific source path.
  if (Object.hasOwn(data.meta, 'packageDataPath')) data.meta.packageDataPath = 'PETBASE_CONF.json';
}

export function completeS5WildRaces(inputCatalog, inputAttack, inputDefense, petbase) {
  if (!Array.isArray(inputCatalog?.spirits) || !inputAttack?.bySpiritId || !inputAttack?.missing
    || !inputDefense?.bySpiritId || !inputDefense?.missing || !inputDefense?.strengthStageBySpiritId) {
    throw new TypeError('Expected the S5 catalog and both original wild-race maps.');
  }
  const rows = Array.isArray(petbase) ? petbase : Object.values(petbase ?? {});
  const byId = new Map(rows.map(row => [row.id, row]));
  if (!rows.length || byId.size !== rows.length) throw new Error('PETBASE_CONF must contain unique source IDs.');
  const usedRows = new Map();
  const reverse = new Map();
  for (const row of rows) {
    if (!Number.isInteger(row.degenerate_pet_id)) continue;
    if (!reverse.has(row.degenerate_pet_id)) reverse.set(row.degenerate_pet_id, []);
    reverse.get(row.degenerate_pet_id).push(row.id);
  }
  const ordinaryForms = source => {
    const found = [], queue = [source.id], visited = new Set();
    while (queue.length) {
      const id = queue.shift();
      if (visited.has(id)) continue;
      visited.add(id);
      const row = byId.get(id);
      if (!row || boss(row)) continue;
      usedRows.set(row.id, row);
      if (row.stength_stage === 3) { found.push(row); continue; }
      queue.push(...(row.evolution_pet_id?.length ? row.evolution_pet_id : reverse.get(id) ?? []));
    }
    return found.some(row => row.legal_petbase === 1) ? found.filter(row => row.legal_petbase === 1) : found;
  };
  const catalog = structuredClone(inputCatalog), attack = structuredClone(inputAttack), defense = structuredClone(inputDefense);
  attack.candidatesBySpiritId ??= {};
  defense.candidatesBySpiritId ??= {};
  const spirits = new Map(catalog.spirits.map(spirit => [spirit.id, spirit]));
  const branchIds = new Set([
    ...Object.keys(attack.missing).filter(id => attack.missing[id].code === 'ambiguous-attack-races'),
    ...Object.keys(defense.missing).filter(id => defense.missing[id].code === 'ambiguous-defense-races'),
    ...Object.keys(attack.candidatesBySpiritId), ...Object.keys(defense.candidatesBySpiritId),
  ]);
  const branches = [];
  for (const id of branchIds) {
    const spirit = spirits.get(id);
    if (!spirit || placeholder(spirit) || !complete(spirit.raceStats)) throw new Error(`Unconfirmed branch source: ${id}`);
    const prior = attack.candidatesBySpiritId[id] ?? defense.candidatesBySpiritId[id] ?? spirit.wildStatForms;
    const missing = attack.missing[id]?.code === 'ambiguous-attack-races' ? attack.missing[id] : defense.missing[id];
    const sourceIds = sorted(missing?.sourcePetbaseIds ?? prior?.map(form => form.attackRaceStats.sourcePetbaseId) ?? []);
    const formIds = sorted(missing?.candidates?.map(form => form.petbaseId) ?? prior?.map(candidateId) ?? []);
    if (sourceIds.length !== 1 || formIds.length < 2) throw new Error(`Branch identity is not uniquely anchored: ${id}`);
    const source = byId.get(sourceIds[0]);
    if (!source || !sameRaces(spirit.raceStats, source) || ![1, 2, 3].includes(source.stength_stage)) {
      throw new Error(`Branch source races or strength changed: ${id}`);
    }
    if (JSON.stringify(sorted(ordinaryForms(source).map(form => form.id))) !== JSON.stringify(formIds)) {
      throw new Error(`Branch forms do not match the source's ordinary evolution graph: ${id}`);
    }
    const forms = formIds.map(formId => byId.get(formId));
    if (forms.some(form => !form || boss(form) || form.stength_stage !== 3 || !complete(races(form)))) {
      throw new Error(`Branch has an incomplete or nonordinary stage-3 form: ${id}`);
    }
    let names = forms.map(form => formName(form, catalog.spirits, spirit));
    names = names.map((name, index) => names.filter(other => other === name).length > 1 ? `${name}（包体 ${forms[index].id}）` : name);
    const choices = forms.map((form, index) => ({ id: `petbase-${form.id}`, name: names[index],
      ...statEntries(source, form, names[index]) }));
    // Evolution IDs remain provenance/migration data. Both combat directions
    // use the source form, so choosing a future branch cannot change defense.
    attack.bySpiritId[id] ??= structuredClone(choices[0].attackRaceStats);
    attack.candidatesBySpiritId[id] = structuredClone(choices);
    delete attack.missing[id];
    spirit.wildAttackRaceStats = structuredClone(attack.bySpiritId[id]);
    defense.bySpiritId[id] = structuredClone(choices[0].defenseRaceStats);
    spirit.wildDefenseRaceStats = structuredClone(defense.bySpiritId[id]);
    spirit.legacyWildStatFormIds = choices.map(form => form.id);
    delete spirit.wildStatForms;
    delete defense.candidatesBySpiritId[id];
    delete defense.missing[id];
    if (spirit.wildStrengthStage !== source.stength_stage || defense.strengthStageBySpiritId[id] !== source.stength_stage) {
      throw new Error(`Do not change the branch source strength stage: ${id}`);
    }
    branches.push({ spiritId: id, name: spirit.name, source: sourceEvidence(source),
      forms: forms.map((form, index) => ({ displayName: names[index], ...sourceEvidence(form) })) });
  }

  const bossIds = new Set([
    ...Object.keys(attack.missing).filter(id => attack.missing[id].code === 'strength-stage-3-not-found'),
    ...Object.keys(attack.bySpiritId).filter(id => attack.bySpiritId[id].resolution === 'boss-parent-stage3'),
  ]);
  const bossParents = [];
  for (const id of bossIds) {
    const spirit = spirits.get(id);
    const ids = attack.missing[id]?.sourcePetbaseIds ?? [attack.bySpiritId[id]?.sourcePetbaseId];
    const source = ids.length === 1 ? byId.get(ids[0]) : null;
    if (!spirit || placeholder(spirit) || !source || !boss(source) || !sameRaces(spirit.raceStats, source)) {
      throw new Error(`Boss source identity is not uniquely confirmed: ${id}`);
    }
    const parents = rows.filter(row => !boss(row) && row.stength_stage === 3 && row.legal_petbase === 1
      && row.bosspetbase_id_arry?.includes(source.id) && sameRaces(spirit.raceStats, row));
    if (parents.length !== 1) throw new Error(`Boss requires one exact ordinary stage-3 parent: ${id}`);
    const parent = parents[0], name = formName(parent, catalog.spirits, spirit);
    usedRows.set(source.id, source);
    usedRows.set(parent.id, parent);
    const entries = statEntries(source, parent, name);
    for (const [data, kind] of [[attack, 'attack'], [defense, 'defense']]) {
      const entry = { ...entries[`${kind}RaceStats`], resolution: kind === 'attack' ? 'boss-parent-stage3' : 'selected-form', ordinaryParentPetbaseId: parent.id };
      if (kind === 'attack' && data.bySpiritId[id] && JSON.stringify(data.bySpiritId[id]) !== JSON.stringify(entry)) throw new Error(`Existing boss mapping changed: ${id}`);
      data.bySpiritId[id] = entry;
      delete data.missing[id];
      spirit[`wild${kind[0].toUpperCase()}${kind.slice(1)}RaceStats`] = structuredClone(entry);
    }
    if (spirit.wildStrengthStage !== source.stength_stage || defense.strengthStageBySpiritId[id] !== source.stength_stage) {
      throw new Error(`Do not change the boss source strength stage: ${id}`);
    }
    bossParents.push({ spiritId: id, name: spirit.name, source: sourceEvidence(source), parent: sourceEvidence(parent) });
  }

  const pending = [];
  for (const spirit of catalog.spirits) {
    const unavailable = placeholder(spirit) || !complete(spirit.raceStats);
    if (unavailable) {
      spirit.wildDataStatus = 'unavailable';
      pending.push({ spiritId: spirit.id, name: spirit.name,
        reason: spirit.previewIdentity?.raceStatsPlaceholder ? 'unconfirmed-race-placeholder' : 'unreleased-race-stats' });
      if (attack.bySpiritId[spirit.id] || defense.bySpiritId[spirit.id] || spirit.wildStatForms?.length) {
        throw new Error(`Unconfirmed record must stay unavailable: ${spirit.id}`);
      }
    }
  }
  updateMapMeta(attack, catalog.spirits.length);
  updateMapMeta(defense, catalog.spirits.length);
  const available = catalog.spirits.filter(spirit => spirit.wildDataStatus !== 'unavailable'
    && (attack.bySpiritId[spirit.id] || attack.candidatesBySpiritId[spirit.id])
    && (defense.bySpiritId[spirit.id] || defense.candidatesBySpiritId[spirit.id])).length;
  const counts = { spirits: catalog.spirits.length, available, branchSelectable: defense.meta.counts.branchSelectable, bossParentMapped: bossParents.length,
    unavailable: pending.length, attack: attack.meta.counts, defense: defense.meta.counts };
  catalog.meta.wildRaceCompletion = { source: 'PETBASE_CONF',
    evidence: 'data/reviewed/s5-wild-race-completion-20261107.json', available, branchSelectable: defense.meta.counts.branchSelectable, unavailable: pending.length };
  const evidence = { schemaVersion: 1, reviewedAt: '2026-11-07', source: { table: 'PETBASE_CONF',
    kind: 'decoded-game-configuration', catalogSourceRevision: catalog.meta.sourceRevision },
    policy: { attackRace: 'selected-form', defenseRaceStrengthStage: 'source-form', coefficientStrengthStage: 'source-form',
      branches: 'selected-form-stats;legacy-evolution-ids-only', unreleased: 'unavailable' },
    counts, branches, bossParents, pending,
    packageRecords: [...usedRows.values()].sort((a, b) => a.id - b.id).map(sourceEvidence) };
  return { catalog, attack, defense, evidence };
}

async function writeJson(path, value) {
  let original = '';
  try { original = await readFile(path, 'utf8'); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  const newline = original.includes('\r\n') ? '\r\n' : '\n';
  const bom = original.startsWith('\uFEFF') ? '\uFEFF' : '';
  await writeFile(path, bom + (JSON.stringify(value, null, 2) + '\n').replaceAll('\n', newline), 'utf8');
}

async function main(args) {
  const options = { '--catalog': 'public/tools/s5-nature/data/catalog.json',
    '--attack-map': 'public/tools/s5-nature/data/wild-attack-races.json',
    '--defense-map': 'public/tools/s5-nature/data/wild-defense-races.json',
    '--evidence': 'data/reviewed/s5-wild-race-completion-20261107.json', '--petbase': '' };
  for (let i = 0; i < args.length; i += 2) {
    if (!Object.hasOwn(options, args[i]) || !args[i + 1]) throw new Error('Expected --catalog/--attack-map/--defense-map/--evidence/--petbase <path>.');
    options[args[i]] = args[i + 1];
  }
  if (!options['--petbase']) throw new Error('Supply decoded PETBASE_CONF.json with --petbase.');
  const read = async path => JSON.parse((await readFile(path, 'utf8')).replace(/^\uFEFF/u, ''));
  const [catalog, attack, defense, petbase] = await Promise.all([
    read(options['--catalog']), read(options['--attack-map']), read(options['--defense-map']), read(options['--petbase'])]);
  const result = completeS5WildRaces(catalog, attack, defense, petbase);
  await writeJson(options['--catalog'], result.catalog);
  await writeJson(options['--attack-map'], result.attack);
  await writeJson(options['--defense-map'], result.defense);
  await writeJson(options['--evidence'], result.evidence);
  console.log(JSON.stringify(result.evidence.counts));
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) await main(process.argv.slice(2));
