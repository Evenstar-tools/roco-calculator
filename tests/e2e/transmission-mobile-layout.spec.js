import {mkdirSync, writeFileSync} from 'node:fs';
import {test,expect} from '@playwright/test';
const output='artifacts/team-transmission-review-20260918';mkdirSync(output,{recursive:true});
test.use({serviceWorkers:'block'});
async function open(page,width,theme,name='测风蝉'){
  await page.setViewportSize({width,height:844});
  await page.addInitScript(()=>localStorage.setItem('rock-calculator.first-run-guide.v1','1'));
  await page.goto('/');await page.getByRole('combobox',{name:'攻击方精灵',exact:true}).waitFor();
  if(await page.locator('html').getAttribute('data-theme')!==theme)await page.getByRole('button',{name:'切换主题',exact:true}).click();
  await page.getByRole('button',{name:'工具箱',exact:true}).click();await page.getByRole('button',{name:'传动计算器',exact:true}).click();
  const dialog=page.getByRole('dialog',{name:'传动计算器',exact:true});
  await dialog.getByRole('combobox',{name:'推演精灵',exact:true}).fill(name);
  await dialog.getByRole('option',{name:new RegExp('^'+name)}).first().click();return dialog;
}
async function bounds(dialog){return dialog.evaluate(n=>{
  const menu=n.querySelector('.skill-picker__options'),body=n.querySelector('.transmission-body');const m=menu.getBoundingClientRect(),b=body.getBoundingClientRect(),v=window.visualViewport;
  const bottom=Math.min(b.bottom,(v?.offsetTop??0)+(v?.height??innerHeight));
  const rows=[...menu.querySelectorAll('[role=option]')].filter(r=>{const q=r.getBoundingClientRect();return q.top>=m.top&&q.bottom<=m.bottom;});
  return{menu:m.toJSON(),body:b.toJSON(),fits:m.left>=b.left&&m.right<=b.right+1&&m.top>=b.top-1&&m.bottom<=bottom+1,rows:rows.map(r=>{const title=r.querySelector('strong'),box=title.getBoundingClientRect();const range=document.createRange();range.selectNodeContents(title);return{name:title.textContent,width:box.width,complete:[...range.getClientRects()].every(t=>t.left>=box.left-1&&t.right<=box.right+1),height:r.getBoundingClientRect().height};})};
});}
for(const width of [320,390,430])for(const theme of ['light','dark']){
 test(`transmission readable menu, keyboard viewport and disabled slots ${width} ${theme}`,async({page})=>{
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  const dialog=await open(page,width,theme);const input=dialog.getByRole('combobox',{name:'初始2号位技能',exact:true});
  await input.scrollIntoViewIfNeeded();await input.focus();
  await expect.poll(async()=> (await bounds(dialog)).fits).toBe(true);
  let geometry=await bounds(dialog);expect(geometry.rows.length).toBeGreaterThan(1);expect(geometry.rows.every(r=>r.complete&&r.width>100&&r.height===72)).toBe(true);
  await page.screenshot({path:`${output}/picker-${width}-${theme}.png`,animations:'disabled'});
  // Simulate a software keyboard shrinking/panning the VISUAL viewport, not the layout viewport.
  await page.evaluate(()=>{const v=window.visualViewport;for(const [k,val]of Object.entries({height:420,offsetTop:60}))Object.defineProperty(v,k,{configurable:true,value:val});v.dispatchEvent(new Event("resize"));});
  await expect.poll(async()=> (await bounds(dialog)).fits).toBe(true);
  geometry=await bounds(dialog);expect(geometry.rows.length).toBeGreaterThan(0);expect(geometry.menu.bottom).toBeLessThanOrEqual(480);
  await input.fill('无');await expect(dialog.getByRole('option',{name:/无风/}).first()).toBeVisible();
  await page.screenshot({path:`${output}/keyboard-simulated-${width}-${theme}.png`,animations:'disabled'});
  await dialog.getByRole('option',{name:/无风/}).first().click();await expect(input).toHaveValue('无风');
  await expect(dialog.getByRole('listbox')).toHaveCount(0);
  await page.evaluate(()=>{const v=window.visualViewport;delete v.height;delete v.offsetTop;v.dispatchEvent(new Event('resize'));});
  await input.press('ArrowDown');await expect(dialog.getByRole('listbox')).toBeVisible();await input.press('Escape');await expect(dialog).toBeVisible();await expect(dialog.getByRole('listbox')).toHaveCount(0);
  await dialog.getByRole('combobox',{name:'推演精灵',exact:true}).fill('圣剑骑士');await dialog.getByRole('option',{name:/^圣剑骑士/}).first().click();
  await dialog.getByRole('button',{name:'开始',exact:true}).click();for(let i=1;i<6;i++)await dialog.getByRole('button',{name:'下一回合',exact:true}).click();
  const slots=dialog.getByRole('list',{name:'当前技能槽位'});await slots.scrollIntoViewIfNeeded();
  await expect(slots.locator('.is-unusable')).toHaveCount(2);await expect(slots.locator('.is-unusable').first()).toContainText('不可使用');
  const contrast=await slots.locator('.is-unusable').first().evaluate(n=>{const s=getComputedStyle(n);const lum=c=>{const values=c.match(/[\d.]+/g).slice(0,3).map(Number).map(x=>{const v=x/255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4;});return values[0]*.2126+values[1]*.7152+values[2]*.0722;};const a=lum(s.color),b=lum(s.backgroundColor);return{ratio:(Math.max(a,b)+.05)/(Math.min(a,b)+.05),opacity:s.opacity};});
  expect(contrast.ratio).toBeGreaterThanOrEqual(4.5);expect(contrast.opacity).toBe('1');
  await page.screenshot({path:`${output}/disabled-${width}-${theme}.png`,animations:'disabled'});
  expect(await dialog.evaluate(n=>n.scrollWidth<=n.clientWidth+1)).toBe(true);expect(errors).toEqual([]);
  writeFileSync(`${output}/geometry-${width}-${theme}.json`,JSON.stringify({geometry,contrast},null,2));
 });
}
