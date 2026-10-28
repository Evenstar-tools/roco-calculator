import { describe, expect, test } from 'vitest';
import { readFileSync } from 'node:fs';
import snapshot from '../../public/data/global-runtime.json';
import { buildGlobalSnapshot, buildGlobalPopularPresets } from '../../scripts/localization/build-global-snapshot.mjs';
import { applyS3MidseasonBalance } from '../../scripts/bwiki/apply-s3-midseason-balance.mjs';
import { withCalculatorExtras } from '../../src/data/snapshot-extras.js';
import { getGlobalEntityText, getGlobalEntityTextByName, localizeGlobalCatalog, localizeGlobalSpirit } from '../../src/runtime/global-entity-localization.js';
import { createProductInitialState, selectSpirit, reduceSessionAction, selectFourSkill, patchFourSkill } from '../../src/state/calculator-session.js';
import { buildCalculatorViewModel, getTraitView } from '../../src/domain/calculator-view-model.js';
import { getTraitEffectInputs } from '../../src/domain/trait-effects.js';
import { resolveSkillStatusActivation } from '../../src/domain/skill-status-effects.js';
import { applyBattleActivation } from '../../src/state/battle-activation.js';
import { resolveNegativeStatusApplications } from '../../src/domain/negative-status-rules.js';
import { chooseDefaultSkillIds } from '../../src/domain/skill-loadout.js';

const read = (file) => JSON.parse(readFileSync(new URL('../../' + file, import.meta.url), 'utf8'));
const opening = read('data/snapshots/seasons/s3-2026-07-15.json');
const entryId = (entry) => typeof entry === 'string' ? entry : entry?.skillId;

function configured() {
  const initial = createProductInitialState(snapshot);
  let state = initial;
  for (const [side, name] of [['attacker', '迪莫'], ['defender', '火花']]) {
    const spirit = snapshot.spirits.find((entry) => entry.fullName === name);
    state = selectSpirit(state, { initialState: initial, side, snapshot, spiritId: spirit.id }).state;
  }
  return state;
}

describe('Global S3 calculation and display separation', () => {
  test('all adopted race values, skill values and trait bindings remain exactly S3 midseason', () => {
    const cn = withCalculatorExtras(applyS3MidseasonBalance(opening));
    const global = buildGlobalSnapshot(opening);
    for (const kind of ['spirits', 'skills', 'traits']) {
      expect(global[kind]).toHaveLength(cn[kind].length);
      global[kind].forEach((entry, index) => {
        const original = cn[kind][index];
        expect(entry.id).toBe('cn-placeholder:' + original.id);
        if (kind === 'spirits') {
          expect(entry.raceStats).toEqual(original.raceStats);
          expect(entry.traitIds).toEqual(original.traitIds.map((id) => 'cn-placeholder:' + id));
        } else {
          expect(entry.name).toBe(original.name);
          expect(entry.description).toBe(original.description);
          for (const field of ['basePower', 'cost', 'category', 'ruleId']) expect(entry[field]).toEqual(original[field]);
        }
      });
    }
    expect(global.spirits).toHaveLength(592);
  });

  test('locale switching changes display only, keeps official aliases and canonical S3 trait binding', () => {
    const before = JSON.stringify(snapshot);
    const english = localizeGlobalCatalog(snapshot, 'en');
    const japanese = localizeGlobalCatalog(snapshot, 'ja');
    expect(english.spirits[0].fullName).toBe('Dimo');
    expect(japanese.spirits[0].fullName).toBe('ディーモ');
    for (const display of [english, japanese]) {
      expect(display.spirits.map((s) => s.id)).toEqual(snapshot.spirits.map((s) => s.id));
      expect(display.skills.every((s) => s.catalogAvailable !== false)).toBe(true);
      expect(display.skills[0].aliases).toEqual(expect.arrayContaining(['抓挠', 'Scratch', 'ひっかく']));
      const spirit = display.spirits[0];
      expect(spirit.reference.traits.map((t) => t.id)).toEqual(spirit.traitIds);
    }
    expect(localizeGlobalCatalog(snapshot, 'en')).toBe(english);
    expect(JSON.stringify(snapshot)).toBe(before);
    expect(localizeGlobalSpirit(snapshot.spirits[0], 'en').reference.traits[0].name).toBe(english.spirits[0].reference.traits[0].name);
    expect(getGlobalEntityTextByName('skill', '抓挠', 'name', 'en')).toBe('Scratch');
    expect(getGlobalEntityText('skill', 'calculator_wish_power_normal', 'name', 'ja')).toBe('願いの波動');
  });

  test('selecting real Global spirits produces default four skills, panels, traits and calculated damage', () => {
    let state = configured();
    expect(state.sides.attacker.nature).toBe('neutral');
    expect(Object.values(state.sides.attacker.displayIvs)).toEqual(Array(6).fill(60));
    expect(state.sides.attacker.skills.four.every(Boolean)).toBe(true);
    const spirit = snapshot.spirits.find((s) => s.id === state.sides.attacker.spiritId);
    expect(getTraitView(snapshot, spirit)?.name).toBe('最好的伙伴');
    let view = buildCalculatorViewModel({ snapshot, state, activeDirection: 'forward' });
    expect(view.configurationReady).toBe(true);
    expect(view.calculation.forward.results.some((r) => r.status === 'exact' && r.totalDamage > 0)).toBe(true);
    const scratch = snapshot.skills.find((s) => s.name === '抓挠');
    state = selectFourSkill(state, { side: 'attacker', index: 0, skillId: scratch.id, snapshot }).state;
    state = patchFourSkill(state, { side: 'attacker', index: 0, patch: { hitCount: 2 }, snapshot }).state;
    expect(entryId(state.sides.attacker.skills.four[0])).toBe(scratch.id);
    expect(state.sides.attacker.skills.four[0].hitCount).toBe(2);
    state = reduceSessionAction(state, { type: 'direction/update', direction: 'forward', value: { overrides: { attackLevelStage: 5 } } }, { serverId: 'global' }).state;
    view = buildCalculatorViewModel({ snapshot, state, activeDirection: 'forward' });
    expect(view.environment.attackLevelStage).toBe(5);
    expect(view.calculation.forward.results[0].status).toBe('exact');
  });

  test.each(['孢子', '撒娇', '光度换算'])('%s uses the same battle result as the unprefixed S3 baseline', (mechanism) => {
    const cn = withCalculatorExtras(applyS3MidseasonBalance(opening));
    const initial = createProductInitialState(snapshot);
    let state = configured();
    if (mechanism === '光度换算') {
      const caster = snapshot.spirits.find((entry) => entry.fullName === '流明坎德拉');
      state = selectSpirit(state, { initialState: initial, side: 'attacker', snapshot, spiritId: caster.id }).state;
    }
    const skill = snapshot.skills.find((entry) => mechanism === '光度换算'
      ? entry.type === '光' && entry.category === 'magical' && entry.basePower > 0 : entry.name === mechanism);
    state = selectFourSkill(state, { side: 'attacker', index: 0, skillId: skill.id, snapshot }).state;
    if (mechanism === '光度换算') {
      const trait = snapshot.traits.find((entry) => entry.name === mechanism);
      state.directions.forward.context = Object.fromEntries(getTraitEffectInputs(trait, 'attacker')
        .map((input) => [input.id, input.contextKey === 'attackerTraitStacks' ? 2 : input.defaultValue]));
    } else if (mechanism === '撒娇') {
      const effect = resolveSkillStatusActivation(skill, {});
      expect(effect.deltas.ownFixedPower).toBe(10);
      state.directions.forward.overrides.fixedPowerAdd = effect.deltas.ownFixedPower;
    } else {
      expect(resolveNegativeStatusApplications({ skill, context: {} }).stacks.parasitism).toBe(3);
      state.calculationOptions.includeNegativeStatusSettlement = true;
      state = applyBattleActivation({ side: 'attacker', skillIndex: 0, snapshot, state }).state;
    }
    const unprefix = (value) => {
      if (typeof value === 'string') return value.replace(/^cn-placeholder:/u, '');
      if (Array.isArray(value)) return value.map(unprefix);
      if (!value || typeof value !== 'object') return value;
      return Object.fromEntries(Object.entries(value).map(([key, item]) => [unprefix(key), unprefix(item)]));
    };
    const cnState = { ...unprefix(state), versions: { data: cn.meta.id, rules: cn.meta.rulesVersion } };
    const result = (data, battle) => buildCalculatorViewModel({ snapshot: data, state: battle, activeDirection: 'forward' }).result.selectedResult;
    const international = result(snapshot, state);
    const original = result(cn, cnState);
    expect(international.status).toBe('exact');
    for (const field of ['totalDamage', 'effectivePower', 'hitCount', 'hpPercent']) expect(international[field]).toEqual(original[field]);
    expect(international.negativeStatusApplications.stacks).toEqual(original.negativeStatusApplications.stacks);
  });

  test('default skills exclude namespaced wish-power extras and preset export drops every foreign reference', () => {
    for (const spirit of snapshot.spirits) expect(chooseDefaultSkillIds(snapshot, spirit.id).filter(Boolean).some((id) => id.includes('calculator_wish_power_'))).toBe(false);
    const { library, audit } = buildGlobalPopularPresets(read('public/data/presets/pvp-popular-configs.json'), snapshot);
    expect(library.entryCount).toBe(213);
    expect(audit.excluded).toHaveLength(18);
    const spiritIds = new Set(snapshot.spirits.map((s) => s.id));
    const skillIds = new Set(snapshot.skills.map((s) => s.id));
    for (const entry of library.entries) {
      expect(spiritIds.has(entry.spiritId)).toBe(true);
      expect(entry.skills.every((id) => skillIds.has(id))).toBe(true);
    }
  });
});
