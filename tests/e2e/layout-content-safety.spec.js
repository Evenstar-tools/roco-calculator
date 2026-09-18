import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
const data = JSON.parse(readFileSync('public/data/runtime.json', 'utf8'));
const names = ['音速犬','水灵','迪莫','伊兰亚龙','火神','梦悠悠（穿星星睡衣的样子）'];
const members = names.map(name => ({
  spiritId: data.spirits.find(s => s.fullName === name).id,
  natureId: 'neutral', skills: { four: [null,null,null,null], single: null },
  displayIvs: { hp: 60, physicalAttack: 0, magicalAttack: 0, physicalDefense: 60, magicalDefense: 60, speed: 0 },
}));
test.use({ serviceWorkers: 'block' });
for (const [width,height] of [[320,844],[390,844],[700,844],[844,390],[1024,768],[1424,900]]) {
  for (const theme of ['light','dark']) {
    test(`content remains legible ${width}x${height} ${theme}`, async ({page}) => {
      await page.setViewportSize({width,height});
      await page.addInitScript(m => {
        localStorage.setItem('rock-calculator.first-run-guide.v1','1');
        localStorage.setItem('rock-calculator.teams.v1', JSON.stringify({schemaVersion:1,activeTeamId:'content-test',teams:[{id:'content-test',name:'布局验收',createdAt:'2026-09-18',updatedAt:'2026-09-18',members:m}]}));
      }, members);
      await page.goto('/');
      await page.getByRole('combobox',{name:'攻击方精灵',exact:true}).waitFor();
      if (await page.locator('html').getAttribute('data-theme') !== theme) await page.getByRole('button',{name:'切换主题',exact:true}).click();
      await page.getByRole('button',{name:'打开队伍',exact:true}).click();
      const drawer = page.getByRole('dialog',{name:'队伍',exact:true});
      await drawer.getByRole('button',{name:'能力分析',exact:true}).click();
      const tiles = drawer.locator('.ability-investments');
      await tiles.scrollIntoViewIfNeeded();
      const issues = await drawer.evaluate(node => {
        const bad = [];
        for (const e of node.querySelectorAll('.team-roster strong,.ability-investments__label > span,.ability-investments__value,.ability-investments__iv strong,.ability-section__title h4')) {
          if (e.checkVisibility({checkVisibilityCSS:true}) && e.scrollWidth > e.clientWidth + 1) bad.push(e.textContent.trim());
        }
        const control = node.querySelector('.ability-speed__controls').getBoundingClientRect();
        const section = node.querySelector('.ability-speed').getBoundingClientRect();
        if (control.right > section.right + 1 || control.left < section.left - 1) bad.push('speed controls overflow');
        if (document.documentElement.scrollWidth > innerWidth + 1) bad.push('page overflow');
        return bad;
      });
      expect(issues).toEqual([]);
      const input = drawer.getByRole('combobox',{name:'速度目标精灵'});
      await input.fill('梦悠悠');
      const choices = drawer.getByRole('listbox',{name:'速度目标候选'});
      await expect(choices).toBeVisible();
      expect(await choices.evaluate(n => { const b=n.getBoundingClientRect();return b.left>=0 && b.right<=innerWidth; })).toBe(true);
      await choices.getByRole('option').first().click();
      await expect(drawer.locator('.ability-speed__selected-target')).toContainText('梦悠悠');
      await drawer.getByRole('button',{name:'编辑'+names[5],exact:true}).click();
      const heading=drawer.locator('.team-workbench__identity h3');
      await expect(heading).toContainText(names[5]);
      expect(await heading.evaluate(n=>n.scrollWidth<=n.clientWidth+1)).toBe(true);
      if (height < 550) {
        expect(await drawer.locator('.team-drawer__editor-pane').evaluate(n=>n.clientHeight)).toBeGreaterThan(200);
        expect(await drawer.locator('.team-drawer__content').evaluate(n=>getComputedStyle(n).overflowY)).toBe('auto');
      }
    });
  }
}
