import { existsSync, readFileSync, readdirSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';
import { parse } from '@babel/parser';

function walk(root, relative = '') {
  return readdirSync(path.join(root, relative), { withFileTypes: true }).flatMap((entry) => {
    if (entry.isSymbolicLink()) throw new Error('Symlink is not a build asset: ' + entry.name);
    const name = path.posix.join(relative, entry.name);
    return entry.isDirectory() ? walk(root, name) : [name];
  });
}

function localAsset(specifier, importer) {
  if (!specifier || /^(?:[a-z][a-z0-9+.-]*:|\/\/|#)/i.test(specifier)) return null;
  const clean = specifier.split(/[?#]/)[0];
  const name = path.posix.normalize(clean.startsWith('/') ? clean.slice(1) : path.posix.join(path.posix.dirname(importer), clean));
  if (name === '..' || name.startsWith('../')) throw new Error('Asset escapes build directory: ' + specifier);
  return name;
}

// Actual per-file gzip sizes. Source-module gzip cannot be assigned additively.
export function reportBundleAttribution({ distRoot = 'dist/client' } = {}) {
  const root = path.resolve(distRoot);
  const names = walk(root);
  const assets = names.filter((name) => /\.(?:js|css)$/.test(name)).map((name) => {
    const content = readFileSync(path.join(root, name));
    const imports = [];
    if (name.endsWith('.js')) {
      const ast = parse(content.toString('utf8'), { sourceType: 'unambiguous' });
      for (const node of ast.program.body) {
        if (['ImportDeclaration', 'ExportNamedDeclaration', 'ExportAllDeclaration'].includes(node.type) && node.source) {
          const target = localAsset(node.source.value, name);
          if (target) imports.push(target);
        }
      }
    }
    return { file: name, rawBytes: content.length, gzipBytes: gzipSync(content).length, imports };
  });
  const byName = new Map(assets.map((entry) => [entry.file, entry]));
  const initial = new Set();
  const html = readFileSync(path.join(root, 'index.html'), 'utf8');
  const visit = (name) => {
    if (initial.has(name)) return;
    const asset = byName.get(name);
    if (!asset) throw new Error('Missing initial/static build asset: ' + name);
    initial.add(name);
    asset.imports.forEach(visit);
  };
  for (const match of html.matchAll(/(?:src|href)\s*=\s*["']([^"']+)["']/g)) {
    const name = localAsset(match[1], 'index.html');
    if (name && /\.(js|css)$/.test(name)) visit(name);
  }
  const summarize = (entries) => entries.reduce((total, entry) => {
    const prefix = entry.file.endsWith('.js') ? 'js' : 'css';
    total[prefix + 'RawBytes'] += entry.rawBytes;
    total[prefix + 'GzipBytes'] += entry.gzipBytes;
    total.files += 1;
    return total;
  }, { files: 0, jsRawBytes: 0, jsGzipBytes: 0, cssRawBytes: 0, cssGzipBytes: 0 });
  const entries = assets.map((asset) => ({ ...asset, initial: initial.has(asset.file) })).sort((a, b) => b.gzipBytes - a.gzipBytes || a.file.localeCompare(b.file));
  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    distRoot: root,
    initialDefinition: 'index.html scripts/styles/modulepreloads plus transitive static JS imports; excludes dynamic imports, data, images, WASM and service-worker precaching',
    total: summarize(entries),
    initial: summarize(entries.filter((entry) => entry.initial)),
    deferred: summarize(entries.filter((entry) => !entry.initial)),
    assets: entries,
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const distRoot = process.argv[2] ?? 'dist/client';
  const output = process.argv[3] ?? 'output/analysis-phase1/bundle-attribution.json';
  if (!existsSync(distRoot)) throw new Error('Build directory not found: ' + distRoot);
  const report = reportBundleAttribution({ distRoot });
  mkdirSync(path.dirname(output), { recursive: true });
  writeFileSync(output, JSON.stringify(report, null, 2) + '\n', 'utf8');
  const kib = (value) => (value / 1024).toFixed(2) + ' KiB';
  console.log('Total JS gzip: ' + kib(report.total.jsGzipBytes));
  console.log('Initial static JS gzip: ' + kib(report.initial.jsGzipBytes));
  console.log('Initial CSS gzip: ' + kib(report.initial.cssGzipBytes));
  console.log('Largest chunks:\n' + report.assets.slice(0, 10).map((asset) => asset.file + ' ' + kib(asset.gzipBytes) + (asset.initial ? ' initial' : ' deferred')).join('\n'));
  console.log('Report: ' + path.resolve(output));
}
