import {readFileSync, mkdirSync, writeFileSync} from 'node:fs';
import {test, expect} from '@playwright/test';
const output='artifacts/web-investment-clip-fix-20260918';
const snapshot=JSON.parse(readFileSync('public/data/runtime.json','utf8'));
const spirit=snapshot.spirits.find(item=>item.fullName==='音速犬');
const member={spiritId:spirit.id,natureId:'neutral',skills:{four:[null,null,null,null],single:null},displayIvs:{hp:60,physicalAttack:0,physicalDefense:60,magicalAttack:0,magicalDefense:60,speed:0}};
mkdirSync(output,{recursive:true});
test.use({serviceWorkers:'block'});
async function open(page,width,theme){
 await page.setViewportSize({width,height:900});
 await page.addInitScript(m=>{
  localStorage.setItem('rock-calculator.first-run-guide.v1','1');
  localStorage.setItem('rock-calculator.teams.v1',JSON.stringify({schemaVersion:1,activeTeamId:'stat-clip',teams:[{id:'stat-clip',name:'六维完整显示验收',createdAt:'2026-09-18',updatedAt:'2026-09-18',members:[m,null,null,null,null,null]}]}));
 },member);
 await page.goto('/');
 await page.getByRole('combobox',{name:'攻击方精灵',exact:true}).waitFor();
 if(await page.locator('html').getAttribute('data-theme')!==theme)await page.getByRole('button',{name:'切换主题',exact:true}).click();
 await page.getByRole('button',{name:'打开队伍',exact:true}).click();
 await page.getByRole('dialog',{name:'队伍',exact:true}).getByRole('button',{name:'能力分析',exact:true}).click();
 const grid=page.locator('.ability-investments');
 await grid.scrollIntoViewIfNeeded();
 await page.evaluate(()=>document.fonts.ready);
 return grid;
}
async function contents(grid){
 return grid.evaluate(node=>{
  const cards=[...node.children];
  return {columns:getComputedStyle(node).gridTemplateColumns.split(' ').length,cards:cards.map(button=>{
   const boundary=button.getBoundingClientRect();
   return {label:button.getAttribute('aria-label'),width:boundary.width,parts:[...button.querySelectorAll('.ability-investments__label > span,.ability-investments__value,.ability-investments__iv small,.ability-investments__iv strong')].map(el=>{
    const r=el.getBoundingClientRect(),range=document.createRange();range.selectNodeContents(el);
    const textRects=[...range.getClientRects()];
    const textFits=textRects.every(t=>t.left>=r.left-1&&t.right<=r.right+1&&t.top>=r.top-1&&t.bottom<=r.bottom+1);
    return {text:el.textContent.trim(),fontSize:parseFloat(getComputedStyle(el).fontSize),overflow:el.scrollWidth-el.clientWidth,textFits,insideCard:r.left>=boundary.left-1&&r.right<=boundary.right+1};
   })};})};
 });
}
function assertContents(geometry){
 expect(geometry.cards).toHaveLength(6);
 for(const card of geometry.cards){
  expect(card.parts.every(p=>p.textFits&&p.insideCard&&p.overflow<=1),JSON.stringify(card)).toBe(true);
  expect(card.parts[1].fontSize).toBeGreaterThanOrEqual(17);
  expect(card.parts[0].fontSize).toBeGreaterThanOrEqual(12);
 }
}
for(const width of [320,390,1424])for(const theme of ['light','dark']){
 test(`six stats remain complete ${width} ${theme}`,async({page})=>{
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  const grid=await open(page,width,theme);
  const geometry=await contents(grid);assertContents(geometry);
  await grid.screenshot({path:`${output}/source-${width}-${theme}.png`});
  writeFileSync(`${output}/source-${width}-${theme}.json`,JSON.stringify(geometry,null,2));
  const selected=grid.locator('button[aria-pressed="true"]').first();const name=await selected.getAttribute('aria-label');
  const stat=name.match(/^取消(.+)个体值/)[1];await selected.click();
  await expect(grid.getByRole('button',{name:`选择${stat}个体值，当前0`,exact:true})).toHaveAttribute('aria-pressed','false');
  assertContents(await contents(grid));expect(errors).toEqual([]);
 });
}
for(const containerWidth of [270,190])for(const theme of ['light','dark']){
 test(`narrow container and long numbers ${containerWidth} ${theme}`,async({page})=>{
  const grid=await open(page,1424,theme);
  // Exercise the real widget in a narrow host, as used by the proposed desktop sidebar.
  await page.addStyleTag({content:`.ability-draft-controls{display:block!important;width:${containerWidth}px!important;max-width:${containerWidth}px!important;box-sizing:border-box!important}.ability-investment-panel{width:100%!important;min-width:0!important}`});
  await grid.screenshot({path:output+'/actual-'+containerWidth+'-'+theme+'.png'});
  await grid.evaluate(node=>[...node.querySelectorAll('.ability-investments__value')].forEach(el=>{el.textContent='9,999';}));
  const geometry=await contents(grid);assertContents(geometry);
  expect(geometry.columns).toBe(containerWidth===270?2:1);
  await grid.screenshot({path:`${output}/narrow-${containerWidth}-${theme}.png`});
  writeFileSync(`${output}/narrow-${containerWidth}-${theme}.json`,JSON.stringify(geometry,null,2));
 });
}

for(const width of [270,190])for(const theme of ['light','dark']){
 test('speed selectors do not escape '+width+' '+theme,async({page})=>{
  await open(page,1424,theme);
  const speed=page.locator('.ability-speed');
  await speed.evaluate((el,w)=>{el.style.width=w+'px';el.style.maxWidth=w+'px';},width);
  await speed.scrollIntoViewIfNeeded();
  const result=await speed.evaluate(el=>{
   const card=el.getBoundingClientRect();
   return [...el.querySelectorAll('.ability-speed__controls,.ability-speed__profile-picker,.ability-speed__target-picker,.ability-speed__target-input')].map(n=>{
    const r=n.getBoundingClientRect();return {selector:n.className,width:r.width,fits:r.left>=card.left-1&&r.right<=card.right+1};
   });
  });
  expect(result.every(r=>r.fits),JSON.stringify(result)).toBe(true);
  await speed.locator('.ability-section__title').screenshot({path:output+'/speed-'+width+'-'+theme+'.png'});
 });
}
