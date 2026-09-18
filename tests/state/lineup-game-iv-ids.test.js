import { expect, test, vi } from 'vitest';
import snapshot from '../../data/snapshots/current.json';
import mapping from '../../public/data/lineup-code-map.json';
import fixture from '../fixtures/lineup-iv-user-20260918.json';
import { decodeLineupCode, encodeLineupCode, exportLineupCode, importLineupCode } from '../../src/state/lineup-code.js';
import { inspectLineupIvs, LINEUP_IV_STATS } from '../../src/state/lineup-ivs.js';
import { TEAM_STORAGE_KEY, teamPresetsRepository } from '../../src/state/team-presets.js';
const values = stats => Object.fromEntries(LINEUP_IV_STATS.map(stat => [stat, stats.includes(stat) ? 60 : 0]));
const empty = () => values([]);
function oldStore(transform = m => m) {
  const team = importLineupCode(fixture.url, snapshot, mapping);
  team.id='existing';team.createdAt='2026-09-18';team.updatedAt='2026-09-18';
  team.members=team.members.map((m,i)=>transform({...m,ivsPending:true,displayIvs:empty()},i));
  const data=new Map([[TEAM_STORAGE_KEY,JSON.stringify({schemaVersion:1,activeTeamId:team.id,teams:[team]})]]);
  const storage={getItem:k=>data.get(k)??null,setItem:vi.fn((k,v)=>data.set(k,v))};
  return {store:teamPresetsRepository({storage}),storage};
}
test('the supplied QR restores all six members and 18 selected stats without substituting presets',()=>{
  const raw=decodeLineupCode(fixture.url);const team=importLineupCode(fixture.url,snapshot,mapping);
  expect(raw.members.map(m=>m.talents)).toEqual(fixture.members.map(m=>m.talents));
  team.members.forEach((m,i)=>{
    expect(snapshot.spirits.find(s=>s.id===m.spiritId).fullName).toBe(fixture.members[i].name);
    expect(m.displayIvs).toEqual(values(fixture.members[i].stats));
    expect(m.ivsPending).toBeUndefined();
  });
  expect(exportLineupCode(team,snapshot,mapping).code).toBe(fixture.code);
});
test.each([[79,'hp'],[80,'physicalAttack'],[81,'magicalAttack'],[82,'physicalDefense'],[83,'magicalDefense'],[84,'speed']])('game attribute %i selects %s',(id,stat)=>{
  expect(inspectLineupIvs([id,null,null])).toEqual({status:'selected',values:values([stat])});
});
test.each([[79,79,84],[1,79,84],[78,80,84],[79,80,85],[79,80,81,84],['79',80,84]].map(ids => [ids]))('invalid or duplicate selections remain unknown: %j',ids=>{
  expect(inspectLineupIvs(ids)).toEqual({status:'unknown',values:empty()});
});
test('edited selections use game IDs while untouched source fields roundtrip exactly',()=>{
  const team=importLineupCode(fixture.url,snapshot,mapping);
  team.members[0].displayIvs=values(['hp','physicalDefense','magicalDefense']);
  const raw=decodeLineupCode(exportLineupCode(team,snapshot,mapping).code);
  expect(raw.members[0].talents).toEqual([79,82,83]);
  expect(raw.members.slice(1)).toEqual(decodeLineupCode(fixture.code).members.slice(1));
  const legacy=decodeLineupCode(fixture.code);legacy.members[0].talents=[1,2,6];
  const code=encodeLineupCode(legacy);
  expect(exportLineupCode(importLineupCode(code,snapshot,mapping),snapshot,mapping).code).toBe(code);
});
test('refresh recovers old pending-zero members without writing on read, then persists on normal save',()=>{
  const {store,storage}=oldStore();const loaded=store.load(snapshot);
  loaded.teams[0].members.forEach((m,i)=>{expect(m.displayIvs).toEqual(values(fixture.members[i].stats));expect(m.ivsPending).toBeUndefined();});
  expect(storage.setItem).not.toHaveBeenCalled();
  expect(exportLineupCode(loaded.teams[0],snapshot,mapping).code).toBe(fixture.code);
  store.rename(loaded,'existing','重命名');
  expect(store.load(snapshot).teams[0].members).toEqual(loaded.teams[0].members);
});
test('recovery preserves manually edited IVs, intentionally cleared values, unknown and missing sources',()=>{
  const {store}=oldStore((m,i)=>{
    if(i===0)m.displayIvs.hp=30;
    if(i===1)delete m.ivsPending;
    if(i===2)m.lineupSource.talents=[80,80,80];
    if(i===3)m.lineupSource.talents=[null,null,null];
    if(i===4)delete m.lineupSource;
    return m;
  });
  const state=store.load(snapshot),m=state.teams[0].members;
  expect(m[0].displayIvs.hp).toBe(30);expect(m[0].ivsPending).toBe(true);
  expect(m[1].displayIvs).toEqual(empty());expect(m[1].ivsPending).toBeUndefined();
  for(const i of [2,3,4]){expect(m[i].displayIvs).toEqual(empty());expect(m[i].ivsPending).toBe(true);}
  expect(m[5].displayIvs).toEqual(values(fixture.members[5].stats));
  store.updateMember(state,'existing',5,{...m[5],displayIvs:empty()});
  expect(store.load(snapshot).teams[0].members[5].displayIvs).toEqual(empty());
  expect(store.load(snapshot).teams[0].members[5].ivsPending).toBeUndefined();
});
