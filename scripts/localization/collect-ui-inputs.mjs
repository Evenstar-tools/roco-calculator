#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parse } from '@babel/parser';

const CHINESE = /[\u3400-\u9fff]/u;
const ATTRIBUTES = new Set(['title', 'placeholder', 'aria-label']);
const SKIP_AST_FIELDS = new Set(['loc', 'start', 'end', 'leadingComments', 'innerComments', 'trailingComments', 'comments', 'tokens', 'extra']);
const args = process.argv.slice(2);
const rootFlag = args.indexOf('--root');
if (args.length && (rootFlag !== 0 || args.length !== 2)) {
  process.stderr.write(JSON.stringify({ error: 'Usage: node collect-ui-inputs.mjs [--root project-root]' }) + '\n');
  process.exit(1);
}
const root = path.resolve(rootFlag === 0 ? args[1] : fileURLToPath(new URL('../../', import.meta.url)));
const toRelative = (file) => path.relative(root, file).replaceAll('\\', '/');
const astCache = new Map();

async function readAst(file) {
  if (!astCache.has(file)) {
    const source = await fs.readFile(file, 'utf8');
    astCache.set(file, { source, lines: source.split(/\r?\n/), ast: parse(source, { sourceType: 'unambiguous', plugins: ['jsx'], errorRecovery: false }) });
  }
  return astCache.get(file);
}

function walk(node, visitor, ancestors = []) {
  if (!node || typeof node !== 'object' || typeof node.type !== 'string') return;
  visitor(node, ancestors);
  const next = [...ancestors, node];
  for (const [key, value] of Object.entries(node)) {
    if (SKIP_AST_FIELDS.has(key)) continue;
    if (Array.isArray(value)) {
      for (const child of value) walk(child, visitor, next);
    } else if (value && typeof value === 'object') walk(value, visitor, next);
  }
}

// Only complete literal alternatives. An interpolated template or concatenation
// remains dynamic; we never turn fragments into a fabricated full message.
function staticAlternatives(node) {
  if (!node) return [];
  if (node.type === 'StringLiteral') return [{ text: node.value, node }];
  if (node.type === 'TemplateLiteral' && node.expressions.length === 0) {
    return [{ text: node.quasis[0]?.value.cooked ?? node.quasis[0]?.value.raw ?? '', node }];
  }
  if (node.type === 'ConditionalExpression') {
    return [...staticAlternatives(node.consequent), ...staticAlternatives(node.alternate)];
  }
  if (node.type === 'LogicalExpression') {
    return [...staticAlternatives(node.left), ...staticAlternatives(node.right)];
  }
  if (node.type === 'ParenthesizedExpression') return staticAlternatives(node.expression);
  return [];
}

function unresolvedBranches(node) {
  if (!node) return ['missing-argument'];
  if (node.type === 'StringLiteral' || (node.type === 'TemplateLiteral' && node.expressions.length === 0)) return [];
  if (node.type === 'ConditionalExpression') return [...unresolvedBranches(node.consequent), ...unresolvedBranches(node.alternate)];
  if (node.type === 'LogicalExpression') return [...unresolvedBranches(node.left), ...unresolvedBranches(node.right)];
  if (node.type === 'ParenthesizedExpression') return unresolvedBranches(node.expression);
  return [node.type];
}

function calleeName(node) {
  if (node?.type === 'Identifier') return node.name;
  if (node?.type === 'MemberExpression' || node?.type === 'OptionalMemberExpression') {
    if (!node.computed && node.property.type === 'Identifier') return node.property.name;
  }
  return null;
}

function rootObjectName(node) {
  if (node?.type === 'Identifier') return node.name;
  if (node?.type === 'MemberExpression' || node?.type === 'OptionalMemberExpression') return rootObjectName(node.object);
  return null;
}

function excludedContext(ancestors) {
  return ancestors.some((parent) => {
    if (parent.type === 'CallExpression' || parent.type === 'OptionalCallExpression') {
      return ['console', 'logger', 'debug'].includes(rootObjectName(parent.callee));
    }
    return parent.type === 'JSXElement' && ['script', 'style'].includes(parent.openingElement.name?.name);
  });
}

function cleanJsxText(value) {
  const lines = value.split(/\r\n|\n|\r/);
  let lastNonEmpty = 0;
  for (let i = 0; i < lines.length; i++) if (/[^ \t]/.test(lines[i])) lastNonEmpty = i;
  return lines.map((line, i) => {
    let text = line.replaceAll('\t', ' ');
    if (i !== 0) text = text.replace(/^ +/, '');
    if (i !== lines.length - 1) text = text.replace(/ +$/, '');
    if (text && i !== lastNonEmpty) text += ' ';
    return text;
  }).join('').trim();
}

async function listFiles(dir) {
  const children = (await fs.readdir(dir, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name));
  const result = [];
  for (const child of children) {
    const full = path.join(dir, child.name);
    if (child.isDirectory()) {
      if (['data', 'assets', '__tests__', '__mocks__', 'debug', 'debugger'].includes(child.name.toLowerCase())) continue;
      result.push(...await listFiles(full));
    } else if (/\.(?:js|jsx)$/.test(child.name) && !/\.(?:test|spec)\./.test(child.name)) result.push(full);
  }
  return result;
}

function makeReference(file, node, context, lines) {
  return {
    file: toRelative(file), context, line: node.loc?.start.line ?? null,
    column: node.loc?.start.column ?? null,
    excerpt: lines[(node.loc?.start.line ?? 1) - 1]?.trim().slice(0, 500) ?? '',
  };
}

function addGrouped(map, zh, ref, extra = {}) {
  const stableKey = JSON.stringify([ref.file, ref.context, zh]);
  if (!map.has(stableKey)) map.set(stableKey, { stableKey, zh, file: ref.file, context: ref.context, sourceRefs: [], ...extra });
  const row = map.get(stableKey);
  if (!row.sourceRefs.some((item) => item.line === ref.line && item.column === ref.column)) row.sourceRefs.push(ref);
}

async function collectDefinitions(messagesFile) {
  const { ast } = await readAst(messagesFile);
  const imports = new Map();
  const order = [];
  walk(ast, (node) => {
    if (node.type === 'ImportDeclaration') {
      for (const specifier of node.specifiers) imports.set(specifier.local.name, { file: path.resolve(path.dirname(messagesFile), node.source.value), exportName: specifier.imported?.name ?? 'default' });
    }
    if (node.type === 'VariableDeclarator' && node.id.name === 'UI_MESSAGES' && node.init?.type === 'ObjectExpression') {
      for (const property of node.init.properties) if (property.type === 'SpreadElement' && property.argument.type === 'Identifier') order.push(property.argument.name);
    }
  });
  const definitions = [];
  for (const binding of order) {
    const imported = imports.get(binding);
    if (!imported) throw new Error(`Missing imported message module: ${binding}`);
    const { ast: moduleAst } = await readAst(imported.file);
    const occurrences = new Map();
    walk(moduleAst, (node) => {
      if (node.type !== 'CallExpression' || node.callee.type !== 'MemberExpression' || node.callee.object?.name !== 'Object' || node.callee.property?.name !== 'fromEntries') return;
      const argument = node.arguments[0];
      const entries = argument?.type === 'ArrayExpression' ? argument : argument?.callee?.object;
      if (entries?.type !== 'ArrayExpression') return;
      for (const entry of entries.elements) {
        if (entry?.type !== 'ArrayExpression' || entry.elements.length !== 3 || !entry.elements.every((element) => element?.type === 'StringLiteral')) continue;
        const [zh, en, ja] = entry.elements.map((element) => element.value);
        const occurrence = (occurrences.get(zh) ?? 0) + 1;
        occurrences.set(zh, occurrence);
        definitions.push({ definitionId: JSON.stringify([toRelative(imported.file), imported.exportName, zh, occurrence]),
          zh, key: zh, en, ja, module: toRelative(imported.file), exportName: imported.exportName,
          line: entry.loc.start.line, occurrence, mergeIndex: definitions.length, effective: false, overridesDefinitionId: null });
      }
    });
  }
  const latest = new Map();
  for (const definition of definitions) {
    const prior = latest.get(definition.zh);
    if (prior) { prior.effective = false; definition.overridesDefinitionId = prior.definitionId; }
    definition.effective = true;
    latest.set(definition.zh, definition);
  }
  return definitions;
}

try {
  const messagesFile = path.join(root, 'src/i18n/messages.js');
  const { UI_MESSAGES: registeredMessages } = await import(pathToFileURL(messagesFile));
  const definitions = await collectDefinitions(messagesFile);
  const effectiveDefinitions = definitions.filter((row) => row.effective);
  if (effectiveDefinitions.length !== Object.keys(registeredMessages).length || effectiveDefinitions.some((row) => registeredMessages[row.zh]?.en !== row.en || registeredMessages[row.zh]?.ja !== row.ja)) {
    throw new Error('AST definition extraction does not reproduce current UI_MESSAGES merge; update the collector before trusting coverage.');
  }
  const files = await listFiles(path.join(root, 'src'));
  const calls = new Map();
  const visible = new Map();
  const dynamicCalls = [];
  for (const file of files) {
    const { ast, lines } = await readAst(file);
    walk(ast, (node, ancestors) => {
      if (excludedContext(ancestors)) return;
      if (node.type === 'CallExpression' || node.type === 'OptionalCallExpression') {
        const name = calleeName(node.callee);
        if (name !== 't' && name !== 'translateUi') return;
        const source = node.arguments[name === 't' ? 0 : 1];
        const alternatives = staticAlternatives(source);
        const unresolved = unresolvedBranches(source);
        if (unresolved.length) dynamicCalls.push({ ...makeReference(file, node, `${name}-dynamic-call`, lines), expressionType: source?.type ?? 'missing-argument', unresolvedBranchTypes: [...new Set(unresolved)], collectedStaticAlternatives: alternatives.length });
        for (const alternative of alternatives) {
          if (!CHINESE.test(alternative.text)) continue;
          addGrouped(calls, alternative.text, makeReference(file, alternative.node, `${name}-call`, lines), { registered: Object.hasOwn(registeredMessages, alternative.text) });
        }
      } else if (node.type === 'JSXText') {
        const zh = cleanJsxText(node.value);
        if (CHINESE.test(zh)) addGrouped(visible, zh, makeReference(file, node, 'jsx-text', lines), { registered: Object.hasOwn(registeredMessages, zh) });
      } else if (node.type === 'JSXAttribute' && ATTRIBUTES.has(node.name?.name)) {
        const value = node.value?.type === 'JSXExpressionContainer' ? node.value.expression : node.value;
        for (const alternative of staticAlternatives(value)) {
          if (!CHINESE.test(alternative.text)) continue;
          addGrouped(visible, alternative.text, makeReference(file, alternative.node, `jsx-attribute:${node.name.name}`, lines), { registered: Object.hasOwn(registeredMessages, alternative.text) });
        }
      } else if (node.type === 'JSXExpressionContainer' && ancestors.at(-1)?.type !== 'JSXAttribute') {
        for (const alternative of staticAlternatives(node.expression)) {
          if (!CHINESE.test(alternative.text)) continue;
          addGrouped(visible, alternative.text, makeReference(file, alternative.node, 'jsx-expression-text', lines), { registered: Object.hasOwn(registeredMessages, alternative.text) });
        }
      }
    });
  }
  const staticCalls = [...calls.values()];
  const visibleText = [...visible.values()];
  const result = {
    schemaVersion: 1, projectRoot: root,
    scope: 'Read-only static Web/desktop source inventory; excludes src/data, assets, test/mock/debug directories, comments, console/logger/debug call contexts and script/style JSX. Does not prove full runtime coverage.',
    stableKeyPolicy: 'registeredMessages retains the exact Chinese source key; occurrence records use JSON([relativeFile, contextKind, zh]). Line/column are evidence only.',
    limitations: ['Dynamic identifiers, interpolated templates, concatenation and runtime-generated labels are not resolved.', 'JSX text can be a fragment separated by expression children; do not mechanically translate fragments into full sentences.', 'Bare visible text already present in UI_MESSAGES still needs a future t(...) integration review; it is listed separately.', 'Client-official entity translations are outside this scan; ordinary business-data strings are not collected.'],
    registeredMessages, definitions, staticRegisteredCalls: staticCalls.filter((row) => row.registered),
    missingRegisteredCalls: staticCalls.filter((row) => !row.registered),
    unregisteredVisibleText: visibleText.filter((row) => !row.registered),
    registeredButUnwrappedVisibleText: visibleText.filter((row) => row.registered),
    unresolvedDynamicCalls: dynamicCalls,
    summary: { sourceFiles: files.length, registeredMessages: Object.keys(registeredMessages).length, definitions: definitions.length,
      overrides: definitions.filter((row) => row.overridesDefinitionId).length,
      missingRegisteredCalls: staticCalls.filter((row) => !row.registered).length,
      unregisteredVisibleText: visibleText.filter((row) => !row.registered).length,
      registeredButUnwrappedVisibleText: visibleText.filter((row) => row.registered).length,
      unresolvedDynamicCalls: dynamicCalls.length },
  };
  process.stdout.write(JSON.stringify(result, null, 2) + '\n');
} catch (error) {
  process.stderr.write(JSON.stringify({ error: error.message, name: error.name }) + '\n');
  process.exitCode = 1;
}
