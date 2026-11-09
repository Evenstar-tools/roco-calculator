// Reuse only the attack export's exact source-form identity. The defense model
// consumes that selected form's own races, never a later evolution's races.
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { WILD_DEFENSE_MODEL } from '../public/tools/s5-nature/wild-defense.mjs';

export function buildWildDefenseRaceData(catalog, attackData, petbase) {
  if (!Array.isArray(catalog?.spirits) || !attackData?.bySpiritId || !attackData?.missing) {
    throw new TypeError('Expected catalog and the exact-match wild attack export.');
  }
  const byId = new Map((Array.isArray(petbase) ? petbase : Object.values(petbase)).map(row => [row.id, row]));
  const bySpiritId = {}, strengthStageBySpiritId = {}, missing = {};
  for (const spirit of catalog.spirits) {
    const attack = attackData.bySpiritId[spirit.id], unresolved = attackData.missing[spirit.id];
    const sourceIds = attack ? attack.sourcePetbaseIds ?? [attack.sourcePetbaseId] : unresolved?.sourcePetbaseIds ?? [];
    const sourceRows = sourceIds.map(id => byId.get(id));
    const stages = [...new Set(sourceRows.map(row => row?.stength_stage))];
    const stage = sourceRows.length && sourceRows.every(Boolean) && stages.length === 1 && [1, 2, 3].includes(stages[0]) ? stages[0] : null;
    strengthStageBySpiritId[spirit.id] = stage;
    const fail = (code, reason, details = {}) => { missing[spirit.id] = { name: spirit.name, code, reason, ...details }; };
    if (!sourceIds.length) {
      fail(unresolved?.code ?? 'attack-source-record-missing', unresolved?.reason ?? '缺少包体精确匹配记录。');
      continue;
    }
    if (stage === null) {
      fail('source-strength-stage-not-unique', '包体源形态没有唯一的强度阶段。', { sourcePetbaseIds: sourceIds });
      continue;
    }
    if (sourceRows.some(row => !Number.isInteger(row.phy_defence_race) || row.phy_defence_race <= 0 || !Number.isInteger(row.spe_defence_race) || row.spe_defence_race <= 0)) {
      fail('incomplete-defense-races', '当前形态包体记录缺少完整双防。', { sourcePetbaseIds: sourceIds });
      continue;
    }
    if (new Set(sourceRows.map(row => `${row.phy_defence_race}/${row.spe_defence_race}`)).size !== 1) {
      fail('ambiguous-source-defense-races', '当前形态的包体源记录双防不一致。', {
        sourcePetbaseIds: sourceIds,
        candidates: sourceRows.map(row => ({ petbaseId: row.id, name: row.name, physicalDefense: row.phy_defence_race, magicalDefense: row.spe_defence_race })),
      });
      continue;
    }
    const selected = sourceRows[0];
    if (selected.phy_defence_race !== spirit.raceStats?.physicalDefense || selected.spe_defence_race !== spirit.raceStats?.magicalDefense) {
      fail('source-defense-races-mismatch', '当前形态目录双防与包体源记录不一致。', { sourcePetbaseIds: sourceIds });
      continue;
    }
    const entry = {
      sourcePetbaseId: sourceIds[0], defensePetbaseId: selected.id, defenseFormName: selected.name,
      physicalDefense: selected.phy_defence_race, magicalDefense: selected.spe_defence_race,
      resolution: 'selected-form',
    };
    if (sourceIds.length > 1) Object.assign(entry, {
      sourcePetbaseIds: sourceIds, defensePetbaseIds: sourceIds,
      defenseFormNames: [...new Set(sourceRows.map(row => row.name))],
    });
    bySpiritId[spirit.id] = entry;
  }
  const missingByReason = {};
  for (const row of Object.values(missing)) missingByReason[row.code] = (missingByReason[row.code] ?? 0) + 1;
  return {
    meta: {
      schemaVersion: 1, source: 'PETBASE_CONF', strengthField: 'stength_stage', raceStrengthStage: 'source-form',
      coefficientStrengthStage: 'source-form', matching: attackData.meta.matching,
      catalogSourceRevision: catalog.meta.sourceRevision,
      counts: { spirits: catalog.spirits.length, mapped: Object.keys(bySpiritId).length, missing: Object.keys(missing).length, missingByReason },
    },
    bySpiritId, strengthStageBySpiritId, missing,
  };
}

export function attachWildDefenseRaceStats(catalog, data) {
  return { ...catalog, meta: { ...catalog.meta, wildDefenseModel: WILD_DEFENSE_MODEL },
    spirits: catalog.spirits.map(spirit => {
      const next = { ...spirit,
        wildDefenseRaceStats: data.bySpiritId[spirit.id] ?? null,
        wildStrengthStage: data.strengthStageBySpiritId[spirit.id] ?? null,
      };
      if (next.wildDefenseRaceStats?.resolution === 'selected-form') {
        if (spirit.wildStatForms?.length) next.legacyWildStatFormIds = spirit.wildStatForms.map(form => form.id);
        delete next.wildStatForms;
      }
      return next;
    }),
  };
}

async function main(args) {
  const options = { '--catalog': 'public/tools/s5-nature/data/catalog.json', '--attack-map': 'public/tools/s5-nature/data/wild-attack-races.json',
    '--petbase': '', '--out': 'public/tools/s5-nature/data/wild-defense-races.json' };
  for (let i = 0; i < args.length; i += 2) {
    if (!Object.hasOwn(options, args[i]) || !args[i + 1]) throw new Error('Expected --catalog/--attack-map/--petbase/--out <path>.');
    options[args[i]] = args[i + 1];
  }
  if (!options['--petbase']) throw new Error('Supply the decoded PETBASE_CONF.json with --petbase.');
  const parse = async path => JSON.parse((await readFile(path, 'utf8')).replace(/^\uFEFF/, ''));
  const [catalog, attack, petbase] = await Promise.all([parse(options['--catalog']), parse(options['--attack-map']), parse(options['--petbase'])]);
  const result = buildWildDefenseRaceData(catalog, attack, petbase);
  await writeFile(options['--out'], `${JSON.stringify(result, null, 2)}\n`, 'utf8');
  // Preserve the catalog's existing newline style when attaching only these fields.
  const catalogText = await readFile(options['--catalog'], 'utf8');
  const newline = catalogText.includes('\r\n') ? '\r\n' : '\n';
  await writeFile(options['--catalog'], `${JSON.stringify(attachWildDefenseRaceStats(catalog, result), null, 2)}\n`.replaceAll('\n', newline), 'utf8');
  console.log(JSON.stringify(result.meta.counts));
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) await main(process.argv.slice(2));
