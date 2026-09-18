import { mkdirSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import { gzipSync } from 'node:zlib';
import { afterEach, expect, test } from 'vitest';
import { reportBundleAttribution } from '../../scripts/report-bundle-attribution.mjs';

const roots = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });
function fixture(files) {
  mkdirSync('.tmp', { recursive: true });
  const root = mkdtempSync(path.resolve('.tmp/attribution-test-'));
  roots.push(root);
  for (const [name, content] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(root, name)), { recursive: true });
    writeFileSync(path.join(root, name), content);
  }
  return root;
}
const html = '<script type="module" src="/assets/main.js"></script><link rel="stylesheet" href="/assets/main.css">';
const files = {
  'index.html': html,
  'assets/main.js': "import './shared.js'; export * from './export.js'; export const later=()=>import('./lazy.js');",
  'assets/shared.js': "import './main.js'; export const shared=1;",
  'assets/export.js': 'export const value=2;',
  'assets/lazy.js': 'export const lazy=3;',
  'assets/main.css': 'body { margin: 0; }',
  'sw.js': "self.addEventListener('fetch',()=>{});",
};
test('static closure handles cycles and reexports without counting dynamic imports', () => {
  const result = reportBundleAttribution({ distRoot: fixture(files) });
  expect(result.assets.filter(a => a.initial).map(a => a.file).sort()).toEqual(['assets/export.js', 'assets/main.css', 'assets/main.js', 'assets/shared.js']);
  expect(result.initial.jsGzipBytes + result.deferred.jsGzipBytes).toBe(result.total.jsGzipBytes);
  expect(result.total.jsGzipBytes).toBe(Object.entries(files).filter(([n]) => n.endsWith('.js')).reduce((sum, [, text]) => sum + gzipSync(text).length, 0));
});
test('HTML modulepreload belongs to initial delivery even when there is no static import', () => {
  const root = fixture({ ...files, 'index.html': html + '<link rel="modulepreload" href="/assets/lazy.js">' });
  expect(reportBundleAttribution({ distRoot: root }).assets.find(a => a.file === 'assets/lazy.js').initial).toBe(true);
});
test('external resources are not silently assigned a local byte count', () => {
  const root = fixture({ ...files, 'index.html': html + '<script src="https://example.test/vendor.js"></script>' });
  expect(reportBundleAttribution({ distRoot: root }).initial.files).toBe(4);
});
test('missing static assets fail instead of understating first-load bytes', () => {
  const root = fixture({ ...files, 'assets/main.js': "import './missing.js';" });
  expect(() => reportBundleAttribution({ distRoot: root })).toThrow('Missing initial/static');
});
test('build traversal is rejected', () => {
  const root = fixture({ ...files, 'assets/main.js': "import '../../outside.js';" });
  expect(() => reportBundleAttribution({ distRoot: root })).toThrow('escapes build directory');
});
