import { test } from 'vitest';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { wildPanel, solve, predictObservation } from '../../public/tools/s5-nature/engine.mjs';
import { previewMatchup } from '../../public/tools/s5-nature/matchup-preview.mjs';
import { analyzeHealth, compareFieldSamples } from '../../public/tools/s5-nature/calibration.mjs';
import { formatGamePercent } from '../../public/tools/s5-nature/hp-inverse.mjs';
import { WILD_HP_MODEL, wildTargetShiny } from '../../public/tools/s5-nature/wild-hp.mjs';

const catalog=JSON.parse(readFileSync('public/tools/s5-nature/data/catalog.json','utf8'));
const dice=JSON.parse(readFileSync('public/tools/s5-nature/data/dice.json','utf8'));
const species=name=>catalog.spirits.find(row=>row.name===name);
const nature=(up,down)=>catalog.natures.find(row=>row.upStat===up&&row.downStat===down);
const hpNatures={up:nature('hp','magicalDefense'),neutral:nature('physicalAttack','magicalAttack'),down:nature('physicalAttack','hp')};
// User-confirmed absolute HP by freeze settlement. 41↓462 is retained from the
// previously supplied table; the other eight values were reaffirmed together.
const observedWhale=[
  {level:41,normal:{up:554,neutral:508,down:462},shiny:{up:831,neutral:762,down:693}},
  {level:42,normal:{up:564,neutral:516,down:468},shiny:{up:846,neutral:774,down:702}},
  {level:43,normal:{up:570,neutral:522,down:474},shiny:{up:855,neutral:783,down:711}},
];
const inputFor=(name,level,shiny=false)=>({targetId:species(name).id,level,targetShiny:shiny,
  profile:{spiritId:species('罗隐').id,level:60,awakening:0,panel:{hp:403,physicalAttack:312,magicalAttack:136,physicalDefense:183,magicalDefense:170,speed:143}},
  skillIds:[catalog.skills.find(row=>row.name==='火焰切割').id],ownDiceIds:[],targetDiceIds:[]});
const fullLoss=damage=>({id:'measured-full-loss',direction:'hp',damage,beforeFull:true,beforePercent:100,afterPercent:0,percentDigits:0,percentMode:'game',context:'clean',defeated:true,reduction:1});

test('user whale HP table is reproduced exactly in wildPanel and preview, including final shiny ×1.5',()=>{
  for(const row of observedWhale) for(const [kind,n] of Object.entries(hpNatures)) for(const shiny of [false,true]) {
    const expected=row[shiny?'shiny':'normal'][kind];
    assert.equal(wildPanel(species('深蓝鲸').raceStats,row.level,n,{shiny}).hp,expected,`panel ${row.level}/${kind}/${shiny}`);
    const preview=previewMatchup(inputFor('深蓝鲸',row.level,shiny),catalog,dice);
    assert.equal(preview.outgoing[0].predictions.find(p=>p.natureId===n.id).hpMax,expected,`preview ${row.level}/${kind}/${shiny}`);
  }
});

test('other species use the same calibrated formula as extrapolation, without a second +22',()=>{
  const rows=[['可爱猿',41,446,410,374],['可爱猿',42,454,416,378],['小翼龙',42,352,324,296],['火焰猿',41,640,586,532],['火焰猿',42,652,596,540],['火焰猿',43,660,604,548]];
  for(const [name,level,up,neutral,down] of rows) {
    const preview=previewMatchup(inputFor(name,level),catalog,dice);
    for(const [kind,expected] of Object.entries({up,neutral,down})) {
      assert.equal(wildPanel(species(name).raceStats,level,hpNatures[kind]).hp,expected);
      assert.equal(preview.outgoing[0].predictions.find(p=>p.natureId===hpNatures[kind].id).hpMax,expected);
    }
  }
});

test('HP and shiny status preserve current attacks, defenses, direct damage, and own HP',()=>{
  const input=inputFor('可爱猿',42);
  const base=previewMatchup(input,catalog,dice);
  const up=base.outgoing[0].predictions.find(row=>row.natureId===hpNatures.up.id);
  assert.equal(up.damage,102);
  assert.equal(up.hpMax,454);
  assert.equal(base.ownPanel.hp,403);
  const attackRaceStats=species('可爱猿').wildAttackRaceStats;
  const strengthStage=species('可爱猿').wildStrengthStage;
  const normal=wildPanel(species('可爱猿').raceStats,42,hpNatures.neutral,{attackRaceStats,strengthStage});
  assert.deepEqual({...normal,hp:undefined},{hp:undefined,physicalAttack:336,magicalAttack:157,physicalDefense:89,magicalDefense:72,speed:43});
  const shiny=wildPanel(species('可爱猿').raceStats,42,hpNatures.neutral,{shiny:true,attackRaceStats,strengthStage});
  assert.deepEqual({...shiny,hp:undefined},{...normal,hp:undefined});
  assert.equal(previewMatchup({...input,targetShiny:true},catalog,dice).outgoing[0].predictions.find(row=>row.natureId===hpNatures.up.id).damage,102);
});

test('record solver and health matching share calibrated HP and all existing target shiny flags',()=>{
  for(const shinyFlags of [{},{targetShiny:true},{preview:{targetShiny:true}},{preview:{shiny:true}},{encounter:{shiny:true}}]) {
    const expected=Object.keys(shinyFlags).length?831:554;
    const session={targetId:species('深蓝鲸').id,level:41,profiles:[],observations:[fullLoss(expected)],...shinyFlags};
    const matched=solve(session,catalog);
    assert.equal(matched.candidates.length,5);
    assert(matched.candidates.every(row=>row.nature.upStat==='hp'&&row.panel.hp===expected));
    assert.equal(predictObservation(session,session.observations[0],hpNatures.up,catalog).hpMax,expected);
    const health=analyzeHealth(session,catalog);
    assert.deepEqual(health.ranges,[{min:expected,max:expected}]);
    assert.equal(health.naturePreview.length,5);
    assert(health.naturePreview.every(row=>row.upStat==='hp'));
  }
  assert.equal(wildTargetShiny({targetShiny:false,encounter:{shiny:true}}),false,'explicit current false overrides an older nested flag');
  assert.equal(WILD_HP_MODEL.source,'user-confirmed-whale-hp-table');
  assert.equal(WILD_HP_MODEL.kind,'calibrated-formula');
  assert.equal(Object.hasOwn(WILD_HP_MODEL,'fitCount'),false);
});

test('independent two-player ape HP sequence agrees with446 without certifying outgoing damage',()=>{
  // This separate user observation is from a two-player encounter. The103/206
  // losses are inputs, not claimed predictions from the unchanged damage core.
  const max=wildPanel(species('可爱猿').raceStats,41,hpNatures.up).hp;
  assert.equal(max,446);
  assert.deepEqual([103,309,412].map(loss=>formatGamePercent((max-loss)*100/max)),[77,31,8]);
});

test('target HP summary is independent of valid moves and matches shiny/dice final prediction denominators',()=>{
  const input=inputFor('可爱猿',42);
  for(const skillIds of [[],['missing-skill'],[catalog.skills.find(row=>row.name==='困兽').id]]) {
    const result=previewMatchup({...input,skillIds},catalog,dice);
    assert.deepEqual(result.targetHpByNature,{neutral:416,up:454,down:378});
    assert.deepEqual(result.targetHpRange,{min:378,max:454});
  }
  const result=previewMatchup({...input,targetShiny:true,targetDiceEffects:{hpMultiplier:1.3}},catalog,dice);
  assert.deepEqual(result.targetHpByNature,{neutral:811,up:885,down:737});
  assert.deepEqual(result.targetHpRange,{min:737,max:885});
  assert.equal(result.ownPanel.hp,403);
  for(const row of result.outgoing[0].predictions) {
    const group=row.upStat==='hp'?'up':row.downStat==='hp'?'down':'neutral';
    assert.equal(row.hpMax,result.targetHpByNature[group]);
    assert.equal(row.targetHpMax,row.hpMax);
    assert.equal(row.remainingPercent,Math.max(0,row.hpMax-row.damage)*100/row.hpMax);
  }
});


test('browser catalog transport preserves every spirit, skill and learning relation', async () => {
  const { packS5RuntimeRelations } = await import('../../src/data/s5-runtime-relations.js');
  const { restoreS5RuntimeRelations } = await import('../../public/tools/s5-nature/vendor/s5-runtime-relations.js');
  const source = JSON.parse(readFileSync('public/tools/s5-nature/data/catalog.json', 'utf8'));
  const restored = restoreS5RuntimeRelations(JSON.parse(JSON.stringify(packS5RuntimeRelations(source))));
  assert.deepEqual(restored, source);
});

test('historical incoming comparisons use the skill defense axis, including equal wrong-axis values', () => {
  const fieldData = JSON.parse(readFileSync('public/tools/s5-nature/data/field-samples.json', 'utf8'));
  const physical = fieldData.entries.find(row => row.defenderDefense != null);
  // Controlled comparison fixture: the known 137 magic-defense panel checks
  // field selection only. This does not certify a damage formula or nature.
  const magical = {
    id: 'magic-defense-axis-fixture', targetId: species('伊雷龙').id, level: 43,
    direction: 'incoming', skillId: catalog.skills.find(row => row.name === '升龙咆哮').id,
    damage: 660, stat: 'magicalAttack', defenderName: '罗隐',
    defenderLevel: 60, defenderAwakening: 5, defenderDefense: 137, referenceOnly: true,
  };
  const compare = (sample, physicalDefense, magicalDefense) => {
    const session = {
      targetId: sample.targetId, level: sample.level,
      profiles: [{ id: 'receiver', spiritId: species('罗隐').id, level: sample.defenderLevel,
        awakening: sample.defenderAwakening, panel: { physicalDefense, magicalDefense } }],
      observations: [{ profileId: 'receiver', direction: 'incoming', skillId: sample.skillId,
        damage: sample.damage, context: 'clean' }],
    };
    const matched = compareFieldSamples(session, catalog, { entries: [sample] })[0].matches[0];
    assert.equal(matched.referenceOnly, true, 'matching configuration must preserve reference status');
    return matched.configurationMatches;
  };
  assert.deepEqual([
    compare(magical, 183, 137), compare(magical, 137, 170),
    compare(physical, physical.defenderDefense, 137), compare(physical, 137, physical.defenderDefense),
  ], [true, false, true, false]);
});

test('historical poison readings with unknown layers remain references even after a confirmed five-layer observation', () => {
  const fieldData = JSON.parse(readFileSync('public/tools/s5-nature/data/field-samples.json', 'utf8'));
  const sample = fieldData.entries.find(row => row.id === 'image-2-whale-hp-01-damage-1');
  assert.match(sample.notes, /中毒层数未知/);
  const session = {
    targetId: sample.targetId, level: sample.level, profiles: [],
    observations: [{ direction: 'poison', damage: sample.damage, context: 'clean',
      poison: { confirmed: true, layers: 5, multiplier: 1 } }],
  };
  const result = compareFieldSamples(session, catalog, fieldData)[0].matches.find(row => row.id === sample.id);
  assert.equal(result.referenceOnly, true);
  assert.equal(result.notes, sample.notes);
  assert.equal(result.configurationMatches, false, 'current layer count cannot fill unknown historical layers');
});

test('Evil Exchange uses post-shield body HP for all levels, independently of shiny shield scaling',()=>{
  const normal=previewMatchup(inputFor('深蓝鲸','all'),catalog,dice);
  const shiny=previewMatchup(inputFor('深蓝鲸','all',true),catalog,dice);
  const expected=[{level:41,neutral:254,up:277,down:231},{level:42,neutral:258,up:282,down:234},{level:43,neutral:261,up:285,down:237}];
  assert.deepEqual(normal.targetBodyHpByLevel,expected);
  assert.deepEqual(shiny.targetBodyHpByLevel,expected);
  assert.deepEqual(shiny.targetBodyHpCandidatesByLevel,normal.targetBodyHpCandidatesByLevel);
  assert.deepEqual(normal.targetBodyHpCandidatesByLevel[0].neutral,[254,255,256,257,258,259,260]);
  assert.deepEqual(normal.targetBodyHpCandidatesByLevel[2].up,[285,286,287,288,289,290,292,293]);
  assert.equal(shiny.targetHpByLevel[2].up,855);
  // A shield-pool override is not proof of an equal post-shield body change.
  const custom=previewMatchup({...inputFor('深蓝鲸',43,true),targetDiceEffects:{hpMultiplier:1.3}},catalog,dice);
  assert.deepEqual(custom.targetBodyHpByLevel,[expected[2]]);
  assert.deepEqual(custom.targetBodyHpCandidatesByLevel,[normal.targetBodyHpCandidatesByLevel[2]]);
  assert.match(custom.evilExchangeUnavailableReason,/生命倍率/);
});
