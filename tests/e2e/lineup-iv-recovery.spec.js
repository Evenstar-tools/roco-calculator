import { mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { resetUiuxStorage } from './helpers/uiux-helpers.js';
import { importLineupCode } from '../../src/state/lineup-code.js';
const fixture=JSON.parse(readFileSync('tests/fixtures/lineup-iv-user-20260918.json','utf8'));
const snapshot=JSON.parse(readFileSync('public/data/runtime.json','utf8'));
const mapping=JSON.parse(readFileSync('public/data/lineup-code-map.json','utf8'));
const expected=importLineupCode(fixture.url,snapshot,mapping);
const key='rock-calculator.teams.v1';
const out=process.env.IV_FIX_EVIDENCE_DIR??'artifacts/lineup-iv-fix-20260918/local';mkdirSync(out,{recursive:true});
test.use({serviceWorkers:'block'});
async function open(page,width){
  await page.setViewportSize({width,height:width>700?1000:844});
  await resetUiuxStorage(page);await page.goto('/');
  await expect(page.getByRole('button',{name:'打开队伍',exact:true})).toBeVisible();
  if(await page.locator('html').getAttribute('data-theme')!=='light')await page.getByRole('button',{name:'切换主题',exact:true}).click();
  await page.getByRole('button',{name:'打开队伍',exact:true}).click();
  return page.getByRole('dialog',{name:'队伍',exact:true});
}
for(const width of [1440,390]){
 test(`actual user QR restores all selected IVs through preview save refresh and export ${width}`,async({page})=>{
  const external=[];const errors=[];page.on('pageerror',e=>errors.push(e.message));
  const drawer=await open(page,width);
  // Decoding must only use locally shipped resources, never upload the image or follow its URL.
  await page.route('**/*',async route=>{
    if(new URL(route.request().url()).origin!==new URL(page.url()).origin){external.push({url:route.request().url(),type:route.request().resourceType()});return route.abort();}
    return route.continue();
  });
  const importer=drawer.getByRole('button',{name:'导入阵容',exact:true});
  if(await importer.count())await importer.click();else await drawer.getByRole('button',{name:'导入已有阵容',exact:true}).click();
  await page.getByLabel('上传配队图',{exact:true}).setInputFiles(path.resolve('tests/fixtures/lineup-images/user-iv-20260918.png'));
  await expect(page.getByText('已解析 6 位精灵 · 24 个技能')).toBeVisible();
  await expect(page.locator('.team-exchange__iv-values')).toHaveCount(6);
  expect(await page.locator('.team-exchange__iv-values').allTextContents()).toEqual([
    '生命／物攻／速度 · 各 60，非原始数值','生命／物攻／速度 · 各 60，非原始数值',
    '生命／物攻／魔防 · 各 60，非原始数值','物攻／物防／速度 · 各 60，非原始数值',
    '生命／物攻／速度 · 各 60，非原始数值','生命／魔攻／速度 · 各 60，非原始数值',
  ]);
  await page.screenshot({path:`${out}/qr-preview-${width}.png`});
  await page.getByRole('checkbox',{name:/已确认个体处理/}).check();
  await page.getByRole('button',{name:'保存并调整个体',exact:true}).click();
  const saved=await page.evaluate(k=>JSON.parse(localStorage.getItem(k)),key);
  expect(saved.teams).toHaveLength(1);
  expect(saved.teams[0].members.map(m=>m.displayIvs)).toEqual(expected.members.map(m=>m.displayIvs));
  expect(saved.teams[0].members.every(m=>!m.ivsPending)).toBe(true);
  await expect(drawer.locator('.team-slot__identity .team-iv-pending')).toHaveCount(0);
  await page.screenshot({path:`${out}/restored-team-${width}.png`});
  await page.reload();await page.getByRole('button',{name:'打开队伍',exact:true}).click();
  await page.getByRole('button',{name:'导出阵容',exact:true}).click();
  await expect(page.getByLabel('阵容代码')).toHaveValue(fixture.code);
  // Some existing skill portraits use BWIKI URLs; they were blocked, not sent.
  expect(external.every(r=>r.type==="image" && new URL(r.url).origin==="https://patchwiki.biligame.com" && !new URL(r.url).search)).toBe(true);expect(errors).toEqual([]);
 });
 test(`old pending roster recovers and replace clears only search, including cancel ${width}`,async({page})=>{
  await resetUiuxStorage(page);
  const stale={schemaVersion:1,activeTeamId:'old',teams:[{...expected,id:'old',createdAt:'2026-09-18',updatedAt:'2026-09-18',members:expected.members.map(m=>({...m,ivsPending:true,displayIvs:Object.fromEntries(Object.keys(m.displayIvs).map(k=>[k,0]))}))}]};
  await page.addInitScript(({key,stale})=>{if(!sessionStorage.getItem('iv-fixture')){localStorage.setItem(key,JSON.stringify(stale));sessionStorage.setItem('iv-fixture','1');}},{key,stale});
  const drawer=await open(page,width);
  await expect(drawer.locator('.team-slot__identity .team-iv-pending')).toHaveCount(0);
  const unchanged=await page.evaluate(k=>localStorage.getItem(k),key);
  for(const fromAnalysis of [false,true]){
    if(fromAnalysis)await drawer.getByRole('button',{name:'能力分析',exact:true}).click();
    await drawer.getByRole('button',{name:'更换精灵',exact:true}).click();
    const input=drawer.getByRole('combobox',{name:'成员精灵',exact:true});
    await expect(input).toBeFocused();await expect(input).toHaveValue('');
    await expect(input).toHaveAttribute('aria-expanded','true');
    await expect(drawer.getByRole('heading',{name:'1号位 · 冰钻布鲁斯'})).toBeVisible();
    expect(await page.evaluate(k=>localStorage.getItem(k),key)).toBe(unchanged);
    await page.screenshot({path:`${out}/replace-blank-${width}-${fromAnalysis}.png`});
    await input.press('Escape');await expect(drawer).toBeVisible();await expect(input).toHaveValue('冰钻布鲁斯');
  }
  await drawer.getByRole('button',{name:'更换精灵',exact:true}).click();
  const input=drawer.getByRole('combobox',{name:'成员精灵',exact:true});
  await expect(input).toHaveValue('');await input.fill('水灵');
  await drawer.getByRole('option',{name:/^水灵/}).first().click();
  await expect(drawer.getByRole('heading',{name:'1号位 · 水灵'})).toBeVisible();
  const saved=await page.evaluate(k=>JSON.parse(localStorage.getItem(k)),key);
  expect(saved.teams[0].members.slice(1).map(m=>m.displayIvs)).toEqual(expected.members.slice(1).map(m=>m.displayIvs));
 });
}
