async page => {
  // 在电鹿页已选择防御方后，通过 playwright-cli run-code --filename 执行。
  const results = [];
  for (const width of [1112, 320]) {
    await page.setViewportSize({ width, height: 900 });
    for (const name of ['通电', '光刃']) {
      const button = page.getByRole('button', { name: `查看${name}详情`, exact: true });
      if (await button.getAttribute('aria-expanded') !== 'true') await button.click();
      const detail = page.locator('.deer-detail');
      const geometry = await detail.locator('td').evaluate(el => {
        const box = el.getBoundingClientRect();
        const text = el.querySelector('p').getBoundingClientRect();
        const grid = el.querySelector('.deer-layer-grid').getBoundingClientRect();
        return { left: text.left - box.left, right: box.right - grid.right, aligned: Math.abs(text.left - grid.left) < 1, overflow: document.documentElement.scrollWidth > innerWidth };
      });
      const expected = width === 320 ? 12 : 20;
      if (Math.abs(geometry.left - expected) > 1 || Math.abs(geometry.right - expected) > 1 || !geometry.aligned || geometry.overflow) throw Error(JSON.stringify({ width, name, geometry }));
      results.push({ width, name, ...geometry });
      if (name === '通电') {
        await detail.screenshot({ path: `output/playwright/deer-detail-spacing-${width}.png` });
        await page.getByRole('button', { name: '切换主题' }).click();
        await detail.screenshot({ path: `output/playwright/deer-detail-spacing-${width}-dark.png` });
        await page.getByRole('button', { name: '切换主题' }).click();
      }
    }
  }
  await page.setViewportSize({ width: 1112, height: 900 });
  await page.getByRole('button', { name: '查看通电详情', exact: true }).click();
  return results;
}
