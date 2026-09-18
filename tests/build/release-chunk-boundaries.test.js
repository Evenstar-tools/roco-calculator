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
