import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { test, expect } from '@playwright/test';
const out = 'artifacts/v2.2.1-ui';
mkdirSync(out, { recursive: true });
test.use({ serviceWorkers: 'block', launchOptions: { ignoreDefaultArgs: ['--hide-scrollbars'], args: ['--disable-features=OverlayScrollbar'] } });
async function home(page, width, theme) {
  await page.setViewportSize({ width, height: width > 1000 ? 1000 : 844 });
  await page.addInitScript(() => localStorage.setItem('rock-calculator.first-run-guide.v1', '1'));
  await page.goto('/');
  await page.getByRole('combobox', { name: '攻击方精灵', exact: true }).waitFor();
  if (await page.locator('html').getAttribute('data-theme') !== theme) await page.getByRole('button', { name: '切换主题', exact: true }).click();
}
for (const theme of ['light', 'dark']) {
  test(`native skill scrollbar stays open during hold, drag and selection ${theme}`, async ({ page }) => {
    await home(page, 1424, theme);
    for (const [side, name] of [['攻击方', '音速犬'], ['防御方', '水灵']]) {
      await page.getByRole('combobox', { name: side + '精灵', exact: true }).fill(name);
      await page.getByRole('option', { name: new RegExp('^' + name) }).first().click();
    }
    const mode = page.getByRole('group', { name: '界面模式' }).getByRole('button', { name: '具体版', exact: true });
    if (await mode.count()) await mode.click();
    const input = page.getByRole('combobox', { name: '攻击方技能1', exact: true });
    await input.click();
    const list = page.locator('.skill-picker__options:visible');
    await expect(list).toBeVisible();
    const bounds = await list.boundingBox();
    const gutter = await list.evaluate(n => n.offsetWidth - n.clientWidth);
    expect(gutter).toBeGreaterThan(5);
    const x = bounds.x + bounds.width - gutter / 2;
    await page.mouse.move(x, bounds.y + 23);
    await page.mouse.down();
    await page.waitForTimeout(650);
    await expect(list).toBeVisible();
    await page.mouse.move(x, bounds.y + bounds.height * .65, { steps: 16 });
    await expect.poll(() => list.evaluate(n => n.scrollTop)).toBeGreaterThan(500);
    const down = await list.evaluate(n => n.scrollTop);
    await page.mouse.move(x, bounds.y + bounds.height * .3, { steps: 16 });
    await expect.poll(() => list.evaluate(n => n.scrollTop)).toBeLessThan(down);
    await page.mouse.up();
    await expect(list).toBeVisible();
    const up = await list.evaluate(n => n.scrollTop);
    await page.screenshot({ path: `${out}/scrollbar-${theme}-after.png`, animations: 'disabled' });
    const chosen = await list.evaluate(n => {
      const box = n.getBoundingClientRect();
      const item = [...n.querySelectorAll('[role=option]')].find(e => { const b=e.getBoundingClientRect(); return b.top >= box.top+5 && b.bottom <= box.bottom-5; });
      return { id: item.id, name: item.querySelector('strong').textContent };
    });
    await page.locator(`[id="${chosen.id}"]`).click();
    await expect(input).toHaveValue(chosen.name);
    await expect(input).toBeFocused();
    await expect(list).toHaveCount(0);
    // Wheel input, Escape and reopening still work; no simulated scrollTop assignment.
    await input.press('ArrowDown');
    await expect(list).toBeVisible();
    const r=await list.boundingBox();await page.mouse.move(r.x+60,r.y+100);await page.mouse.wheel(0,420);
    await expect.poll(() => list.evaluate(n => n.scrollTop)).toBeGreaterThan(0);
    await input.press('Escape');await expect(list).toHaveCount(0);
    await input.press('ArrowDown');await page.getByRole('button',{name:'工具箱',exact:true}).click();await expect(list).toHaveCount(0);
    writeFileSync(`${out}/native-drag-${theme}.json`,JSON.stringify({heldMs:650,down,up,chosen,gutter},null,2));
  });
}
const runtime = JSON.parse(readFileSync('public/data/runtime.json', 'utf8'));
const spirit = runtime.spirits.find(s => s.fullName === '音速犬');
const member = { spiritId: spirit.id, natureId: 'neutral', skills: { four: [null,null,null,null], single:null }, displayIvs:{ hp:60,physicalAttack:0,magicalAttack:0,physicalDefense:60,magicalDefense:60,speed:0 } };
for (const width of [320,390,700,1024,1424]) for (const theme of ['light','dark']) {
  test(`saved summary is legible and grouped ${width} ${theme}`, async ({ page }) => {
    await page.addInitScript(m=>localStorage.setItem('rock-calculator.teams.v1',JSON.stringify({schemaVersion:1,activeTeamId:'v221',teams:[{id:'v221',name:'验收队伍',createdAt:'2026-09-18',updatedAt:'2026-09-18',members:[m,null,null,null,null,null]}]})), member);
    await home(page,width,theme);
    await page.getByRole('button',{name:'打开队伍',exact:true}).click();
    const drawer=page.getByRole('dialog',{name:'队伍',exact:true});
    await drawer.getByRole('button',{name:'能力分析',exact:true}).click();
    const summary=drawer.getByRole('region',{name:'已保存配置摘要'});
    await summary.evaluate(n=>n.scrollIntoView({block:'start'}));
    await page.evaluate(()=>document.fonts.ready);
    await expect.poll(async()=>summary.evaluate(n=>{
      const r=n.getBoundingClientRect(),heading=n.querySelector('strong');
      const h=heading.getBoundingClientRect();
      return n.contains(document.elementFromPoint(r.left+16,h.top+h.height/2));
    })).toBe(true);
    await expect(summary).toContainText('已保存配置');
    expect(await summary.locator('b').allTextContents()).toEqual(['192','35,306','74,664','66,978']);
    const parts=await summary.evaluate(n=>[...n.querySelectorAll('strong,small,b')].map(e=>{
      const b=e.getBoundingClientRect(),host=n.getBoundingClientRect(),r=document.createRange();r.selectNodeContents(e);
      return {text:e.textContent,inside:b.left>=host.left&&b.right<=host.right+1,complete:[...r.getClientRects()].every(t=>t.left>=b.left-1&&t.right<=b.right+1&&t.bottom<=b.bottom+1),font:parseFloat(getComputedStyle(e).fontSize)};
    }));
    expect(parts.every(e=>e.inside&&e.complete)).toBe(true);
    expect(await summary.locator('b').evaluateAll(nodes => [...new Set(nodes.map(n => getComputedStyle(n).fontSize))])).toEqual(['18px']);
    expect(await summary.locator('small').evaluateAll(nodes => [...new Set(nodes.map(n => getComputedStyle(n).fontSize))])).toEqual(['12px']);
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
    await summary.screenshot({path:`${out}/summary-card-${width}-${theme}-after.png`});
    await page.screenshot({path:`${out}/summary-${width}-${theme}-after.png`,animations:'disabled'});
    writeFileSync(`${out}/summary-${width}-${theme}.json`,JSON.stringify({box:await summary.boundingBox(),parts},null,2));
    // Editing the draft must not silently change the saved-configuration baseline.
    await drawer.getByText('手动微调',{exact:true}).click();
    const saved=await summary.innerText();await drawer.getByLabel('能力分析性格').click();await drawer.getByRole('treeitem',{name:'生命增益 +20%'}).click();await drawer.getByRole('treeitem',{name:'踏实（+生命 -速度）'}).click();await expect(summary).toHaveText(saved, { useInnerText: true });
  });
}
