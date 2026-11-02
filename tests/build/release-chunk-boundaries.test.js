// @vitest-environment node
import { expect, test } from 'vitest';
import { manualChunks as chunk } from '../../config/chunk-groups.mjs';
test('spreadsheet compression stays with its sole lazy consumer on Windows and POSIX', () => {
  for (const root of ['D:/project', '/project']) {
    for (const p of ['/src/features/damage-comparison/export-xlsx.js', '/node_modules/fflate/esm/browser.js']) {
      expect(chunk(root + p)).toBe('xlsx-export');
      expect(chunk((root + p).replaceAll('/', '\\'))).toBe('xlsx-export');
    }
  }
});
test('QR and feature pages are not merged into the export bundle', () => {
  expect(chunk('/project/node_modules/zxing-wasm/reader.js')).toBe('qr-reader');
  expect(chunk('/project/src/components/AbilityWorkbench.jsx')).toBeUndefined();
});

test('calculator entry compresses with its engine without merging lazy tool entries', () => {
  for (const p of ['/project/src/App.jsx', 'D:/project/src/App.jsx']) {
    expect(chunk(p)).toBe('calculator-core');
    expect(chunk(p.replaceAll('/', '\\'))).toBe('calculator-core');
  }
  for (const p of ['/src/components/TeamDrawer.jsx', '/src/components/RankingsPanel.jsx', '/src/features/skill-query/SkillQueryPanel.jsx', '/src/features/deer/DeerPage.jsx']) {
    expect(chunk('/project' + p)).toBeUndefined();
  }
});
