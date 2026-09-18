import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { expect, test } from 'vitest';
import { prepareZXingModule, readBarcodes } from 'zxing-wasm/reader';
import fixture from '../fixtures/lineup-iv-user-20260918.json';
import mapping from '../../public/data/lineup-code-map.json';
import snapshot from '../../data/snapshots/current.json';
import { importLineupCode, exportLineupCode } from '../../src/state/lineup-code.js';
test('actual supplied image QR imports all six allocations and roundtrips its original code', async () => {
 const require=createRequire(path.resolve('package.json'));
 prepareZXingModule({overrides:{wasmBinary:readFileSync(require.resolve('zxing-wasm/reader/zxing_reader.wasm'))}});
 const image=readFileSync('tests/fixtures/lineup-images/user-iv-20260918.png');
 const results=await readBarcodes(image,{formats:['QRCode'],tryHarder:true,maxNumberOfSymbols:8});
 const urls=[...new Set(results.filter(r=>r.isValid&&r.text).map(r=>r.text))];
 expect(urls).toHaveLength(1);
 const url=new URL(urls[0]);
 expect(url.searchParams.get('shareData')).toBe(fixture.code);
 expect(url.searchParams.get('name')).toBe('云云云榜一');
 const imported=importLineupCode(urls[0],snapshot,mapping);
 imported.members.forEach((member,index)=>{
   expect(member.ivsPending).toBeUndefined();
   const selected=Object.entries(member.displayIvs).filter(([,v])=>v===60).map(([k])=>k).sort();
   expect(selected).toEqual([...fixture.members[index].stats].sort());
 });
 expect(exportLineupCode(imported,snapshot,mapping).code).toBe(fixture.code);
});
