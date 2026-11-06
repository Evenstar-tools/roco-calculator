import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { parse } from "@babel/parser";
import { expect, test } from "vitest";
import { translateUi } from "../../src/i18n/messages.js";
import { CN_ICON_WEIGHTS, cnProductionPruningPlugin, pruneCnProductionModule } from "../../scripts/cn-production-pruning.mjs";

test("CN preview excludes official Global display records while preserving export contracts and metadata", () => {
  const code = readFileSync("src/data/global-entity-text.js", "utf8");
  const result = pruneCnProductionModule(code, "D:/project/src/data/global-entity-text.js");
  const declarations = source => parse(source, { sourceType: "module" }).program.body;
  const original = declarations(code);
  const pruned = declarations(result);
  expect(pruned.map(node => node.declaration.declarations[0].id.name))
    .toEqual(original.map(node => node.declaration.declarations[0].id.name));
  expect(result).toContain(code.slice(original[0].start, original[0].end));
  expect(result).toContain("{ spirit: {}, skill: {}, trait: {} }");
  expect(result.length).toBeLessThan(2000);
});

test("only the root production locale aggregation drops unreachable English/Japanese dictionaries", () => {
  const code = readFileSync("src/i18n/messages.js", "utf8");
  const result = pruneCnProductionModule(code, "D:/project/src/i18n/messages.js");
  expect(result).not.toMatch(/^import /mu);
  expect(result).toContain("const commonMessages = {};");
  expect(result.slice(result.indexOf("export const UI_MESSAGES"))).toBe(code.slice(code.indexOf("export const UI_MESSAGES")));
  for (const filename of ["src/i18n/common-messages.js", "src/runtime/WebEntry.jsx", "src/features/s5-preview/with-cn-recommended.js"]) {
    expect(pruneCnProductionModule(readFileSync(filename, "utf8"), `D:/project/${filename}`)).toBeNull();
  }
  expect(cnProductionPruningPlugin().apply).toBe("build");
});

function weightEntries(code) {
  const variable = parse(code, { sourceType: "module" }).program.body.find(node => node.type === "VariableDeclaration");
  return variable.declarations[0].init.arguments[0].elements.map(node => [node.elements[0].value, code.slice(node.start, node.end)]);
}

test.each([
  ["Sword", CN_ICON_WEIGHTS],
  ["Gear", ["regular"]],
  ["Lightning", ["regular", "fill"]],
  ["Star", ["regular", "fill"]],
  ["ArrowCounterClockwise", ["regular", "bold"]],
  ["EyeSlash", ["regular"]],
  ["ArrowSquareOut", ["regular"]],
  ["ArrowFatUp", ["fill"]],
  ["List", ["bold"]],
  ["DotsThree", ["bold"]],
])("%s keeps its used SVG nodes unchanged, including favorite and dynamic states", (name, retained) => {
  const filename = `node_modules/@phosphor-icons/react/dist/defs/${name}.es.js`;
  const code = readFileSync(filename, "utf8");
  const result = pruneCnProductionModule(code, `D:/project/${filename}`);
  expect(weightEntries(result)).toEqual(weightEntries(code).filter(([weight]) => retained.includes(weight)));
  expect(weightEntries(result).map(([weight]) => weight).sort()).toEqual([...retained].sort());
  expect(pruneCnProductionModule(code, `D:/project/${filename.replace("/defs/", "/csr/")}`)).toBeNull();
});

function applicationIconWeights(code, filename) {
  const ast = parse(code, { sourceType: "module", plugins: ["jsx"] });
  const imports = new Map();
  const usages = new Map();
  for (const node of ast.program.body) {
    if (node.type !== "ImportDeclaration" || !node.source.value.startsWith("@phosphor-icons/react")) continue;
    expect(node.source.value, filename).toBe("@phosphor-icons/react");
    for (const specifier of node.specifiers) {
      expect(specifier.type, filename).toBe("ImportSpecifier");
      expect(specifier.imported.name, `Review icon context defaults: ${filename}`).not.toBe("IconContext");
      imports.set(specifier.local.name, specifier.imported.name);
      usages.set(specifier.imported.name, new Set());
    }
  }
  const record = (local, weights) => weights.forEach(weight => usages.get(imports.get(local)).add(weight));
  const alternatives = node => {
    if (node.type === "StringLiteral") return [node.value];
    if (node.type === "JSXExpressionContainer") return alternatives(node.expression);
    if (node.type === "ConditionalExpression") return [...alternatives(node.consequent), ...alternatives(node.alternate)];
    throw new Error("Review new dynamic icon weight before pruning: " + node.type);
  };
  function visit(node) {
    if (!node || typeof node !== "object") return;
    // Component aliases, registries and other indirection cannot safely narrow styles.
    if (node.type === "Identifier" && imports.has(node.name)) record(node.name, CN_ICON_WEIGHTS);
    if (node.type === "JSXOpeningElement" && imports.has(node.name.name)) {
      const weight = node.attributes.find(attribute => attribute.name?.name === "weight");
      record(node.name.name, node.attributes.some(attribute => attribute.type === "JSXSpreadAttribute")
        ? CN_ICON_WEIGHTS : weight ? alternatives(weight.value) : ["regular"]);
    }
    if (node.type === "JSXAttribute" && node.name.name === "weight") {
      expect(alternatives(node.value).every(weight => CN_ICON_WEIGHTS.includes(weight)), filename).toBe(true);
    }
    for (const child of Object.values(node)) {
      if (Array.isArray(child)) child.forEach(visit);
      else if (child && typeof child === "object") visit(child);
    }
  }
  ast.program.body.filter(node => node.type !== "ImportDeclaration").forEach(visit);
  return usages;
}

function expectRetainedIconWeights(usages, filename) {
  for (const [name, used] of usages) {
    const file = `node_modules/@phosphor-icons/react/dist/defs/${name}.es.js`;
    const retained = weightEntries(pruneCnProductionModule(readFileSync(file, "utf8"), `D:/project/${file}`))
      .map(([weight]) => weight);
    expect([...used].filter(weight => !retained.includes(weight)), `${filename}: ${name} must retain every used style`).toEqual([]);
  }
}

test("application JSX, aliases and spread props never request a pruned icon style", () => {
  const files = directory => readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const filename = path.join(directory, entry.name);
    return entry.isDirectory() ? files(filename) : /\.[cm]?[jt]sx?$/u.test(filename) ? [filename] : [];
  });
  for (const filename of files("src")) {
    expectRetainedIconWeights(applicationIconWeights(readFileSync(filename, "utf8"), filename), filename);
  }
});

test("source coverage catches new aliases, spreads and unsupported weights before silently losing icons", () => {
  const source = body => `import { Shuffle as RandomIcon } from "@phosphor-icons/react"; ${body}`;
  for (const body of [
    'const view = <RandomIcon weight="fill" />;',
    'const Icon = RandomIcon; const view = <Icon />;',
    'const view = <RandomIcon {...props} />;',
  ]) {
    expect(() => expectRetainedIconWeights(applicationIconWeights(source(body), "fixture"), "fixture")).toThrow();
  }
  expect(() => applicationIconWeights(source('const view = <RandomIcon weight="thin" />;'), "fixture")).toThrow();
  expect(() => expectRetainedIconWeights(applicationIconWeights(
    'import { Sword } from "@phosphor-icons/react"; const Icon = Sword; const view = <Icon {...props} />;', "fixture"), "fixture")).not.toThrow();
});


test("CN calculator dictionary pruning retains Chinese interpolation in the shared formatter", () => {
  const file = "src/i18n/calculator-messages.js";
  const code = readFileSync(file, "utf8");
  expect(pruneCnProductionModule(code, `D:/project/${file}`)).toBe("export const calculatorMessages = {};");
  const declarations = parse(code, { sourceType: "module" }).program.body;
  expect(declarations.map(node => node.declaration.declarations[0].id.name)).toEqual(["calculatorMessages"]);
  const formatter = readFileSync("src/i18n/calculator-text.js", "utf8");
  expect(pruneCnProductionModule(formatter, "D:/project/src/i18n/calculator-text.js")).toBeNull();
});

test("reviewed CN tool formatter keeps the exact Chinese branch and interpolation", () => {
  const filename = "src/i18n/useToolLocale.js";
  const code = readFileSync(filename, "utf8");
  expect(pruneCnProductionModule(code, `D:/project/${filename}`)).toBeNull();
  const result = pruneCnProductionModule(code, `D:/project/${filename}`, { reviewedS5: true });
  expect(result).toBe(code.replace('if (locale === "zh-CN") return translateUi(locale, source, values);',
    'return translateUi("zh-CN", source, values);'));
  const format = source => new Function("translateUi", source.slice(source.indexOf("export function localizeToolText"),
    source.indexOf("export function useToolLocale")).replace("export function", "function") + ";return localizeToolText;")(
    (locale, text, values) => {
      expect(locale).toBe("zh-CN");
      return text.replace(/\{([^}]+)\}/g, (token, name) => Object.hasOwn(values, name) ? String(values[name]) : token);
    });
  for (const source of [null, undefined, 0, false, "", "龙骑士", "伤害{amount}，{missing}", "{amount}% × {hits}"]) {
    const values = { amount: 130, hits: 2 };
    expect(format(result)(source, "zh-CN", values)).toEqual(format(code)(source, "zh-CN", values));
  }
});

test("reviewed CN calculator formatter preserves nonstrings, recursion and placeholder values", () => {
  const filename = "src/i18n/calculator-text.js";
  const code = readFileSync(filename, "utf8");
  const branch = 'if (locale === "zh-CN" || !source || depth > 8) return source;';
  expect(pruneCnProductionModule(code, `D:/project/${filename}`)).toBeNull();
  const result = pruneCnProductionModule(code, `D:/project/${filename}`, { reviewedS5: true });
  const declaration = source => parse(source, { sourceType: "module" }).program.body
    .find(node => node.declaration?.id?.name === "translateCalculatorText").declaration;
  // The earlier recursive renderer must stay unchanged.
  expect(result.slice(declaration(result).start, declaration(result).end))
    .toBe(code.slice(declaration(code).start, declaration(code).end).replace(branch, "return source;"));
  const format = source => {
    const node = declaration(source);
    return new Function("translateUi", source.slice(node.start, node.end) + ";return translateCalculatorText;")(translateUi);
  };
  const before = format(code);
  const after = format(result);
  const object = { name: "龙骑士" };
  for (const source of [null, undefined, 0, false, object]) {
    expect(after(source)).toBe(source);
    expect(after(source, "zh-CN", { v0: "文本" })).toBe(source);
  }
  expect(after("龙骑士")).toBe("龙骑士");
  expect(after("", "zh-CN", {})).toBe("");
  expect(after("伤害{v0}，{missing}", "zh-CN", { v0: 130 })).toBe("伤害130，{missing}");
  expect(after("{v0}／{v1}／{v2}", "zh-CN", { v0: 0, v1: false, v2: null })).toBe("0／false／null");
  // Substitution strings are processed without passing the outer values recursively.
  expect(after("{v0}／{v1}", "zh-CN", { v0: "{v1}", v1: "已冻结" })).toBe("{v1}／已冻结");
  for (const depth of [0, 7, 8, 9]) {
    const args = ["当前：{v0}｜{v1}", "zh-CN", { v0: "冰封 · 伤害", v1: "{v0}" }, depth];
    expect(after(...args)).toBe(before(...args));
    expect(after("威力+20　能耗-1", "zh-CN", undefined, depth)).toBe(before("威力+20　能耗-1", "zh-CN", undefined, depth));
  }
  expect(() => pruneCnProductionModule(code.replace(branch, "return source;"), `D:/project/${filename}`, { reviewedS5: true }))
    .toThrow("Review CN calculator locale before pruning");
});

test("reviewed CN calculator hook keeps Chinese display priorities and ignores Global canonical fallbacks", () => {
  const filename = "src/i18n/calculator-text.js";
  const code = readFileSync(filename, "utf8");
  expect(pruneCnProductionModule(code, `D:/project/${filename}`, { reviewedS5: false })).toBeNull();
  const result = pruneCnProductionModule(code, `D:/project/${filename}`, { reviewedS5: true });
  const declarations = source => parse(source, { sourceType: "module" }).program.body
    .filter(node => node.type === "ExportNamedDeclaration").map(node => node.declaration);
  expect(declarations(result).map(node => node.id.name)).toEqual(declarations(code).map(node => node.id.name));
  const hook = source => {
    const declaration = declarations(source).find(node => node.id.name === "useCalculatorLocale");
    return new Function("useLocale", "useMemo", "translateCalculatorText", "localizeType", "entityText",
      source.slice(declaration.start, declaration.end) + ";return useCalculatorLocale;")(
      () => ({ locale: "zh-CN" }),
      (factory, dependencies) => { expect(dependencies).toEqual(["zh-CN"]); return factory(); },
      (...args) => args,
      (...args) => args,
      new Proxy({}, { get() { throw new Error("Chinese display must not query Global canonical text"); } }),
    )();
  };
  const before = hook(code);
  const after = hook(result);
  expect(Object.keys(after)).toEqual(Object.keys(before));
  expect(after.locale).toBe("zh-CN");
  expect(after.tc("伤害{v0}", { v0: 130 })).toEqual(["伤害{v0}", "zh-CN", { v0: 130 }]);
  expect(after.typeLabel("电")).toEqual(["电", "zh-CN"]);
  for (const name of [undefined, null, "", "雷", { name: "原展示值" }]) {
    expect(after.markLabel(name)).toBe(name);
    expect(after.markLabel(name)).toBe(before.markLabel(name));
  }
  const fixtures = [
    [undefined, "", ""],
    [null, "", ""],
    [{}, "", ""],
    [{ displayName: "展示名", fullName: "全名", name: "简称", description: "展示说明" }, "展示名", "展示说明"],
    [{ displayName: "", fullName: "全名", name: "简称", description: "" }, "", ""],
    [{ displayName: null, fullName: "全名", name: "简称", description: null }, "全名", ""],
    [{ displayName: null, fullName: null, name: "简称" }, "简称", ""],
    [{ name: "继承展示名", description: "继承展示说明", previewTraitEntity: {
      name: "canonical name", description: "canonical description", inheritedFrom: "source",
    } }, "继承展示名", "继承展示说明"],
  ];
  for (const kind of ["spirit", "skill", "trait"]) {
    for (const [entity, name, description] of fixtures) {
      expect(after.entityName(kind, entity)).toBe(name);
      expect(after.entityDescription(kind, entity)).toBe(description);
      expect(after.entityName(kind, entity)).toBe(before.entityName(kind, entity));
      expect(after.entityDescription(kind, entity)).toBe(before.entityDescription(kind, entity));
    }
  }
  for (const branch of [
    'locale === "zh-CN" ? name : translateCalculatorText(name + "印记", locale)',
    'if (locale === "zh-CN") return entity?.displayName ?? entity?.fullName ?? entity?.name ?? "";',
    'if (locale === "zh-CN") return entity?.description ?? "";',
  ]) {
    expect(() => pruneCnProductionModule(code.replace(branch, ""), `D:/project/${filename}`, { reviewedS5: true }))
      .toThrow("Review CN calculator locale before pruning");
  }
});

test("reviewed CN removes only unreachable matcher declarations and retains missing-text exports", () => {
  const filename = "src/i18n/calculator-text.js";
  const code = readFileSync(filename, "utf8");
  const result = pruneCnProductionModule(code, `D:/project/${filename}`, { reviewedS5: true });
  const statements = source => parse(source, { sourceType: "module" }).program.body;
  const topLevelVariables = source => statements(source).filter(node => node.type === "VariableDeclaration")
    .flatMap(node => node.declarations.map(declaration => declaration.id.name));
  expect(topLevelVariables(code)).toEqual(["missing", "translatedStrings", "escape", "patterns"]);
  expect(topLevelVariables(result)).toEqual(["missing"]);
  const preserved = source => statements(source).filter(node => node.type === "ImportDeclaration" ||
    (node.type === "VariableDeclaration" && node.declarations[0].id.name === "missing") ||
    ["getMissingCalculatorTexts", "clearMissingCalculatorTexts"].includes(node.declaration?.id?.name))
    .map(node => source.slice(node.start, node.end));
  expect(preserved(result)).toEqual(preserved(code));
  // Evaluate the whole module without EN/JA tables: no matcher initializer may execute.
  const executable = statements(result).filter(node => node.type !== "ImportDeclaration")
    .map(node => result.slice((node.declaration ?? node).start, node.end)).join("\n");
  const api = new Function("translateUi", executable +
    ";return { translateCalculatorText, getMissingCalculatorTexts, clearMissingCalculatorTexts };")(translateUi);
  expect(api.translateCalculatorText("伤害{v0}", "zh-CN", { v0: "130" })).toBe("伤害130");
  expect(api.getMissingCalculatorTexts()).toEqual([]);
  expect(api.clearMissingCalculatorTexts()).toBeUndefined();
  expect(api.getMissingCalculatorTexts()).toEqual([]);
  for (const changed of [
    code.replace("const escape =", "const escapeMatcher ="),
    code.replace("const escape =", "let escape ="),
  ]) {
    expect(() => pruneCnProductionModule(changed, `D:/project/${filename}`, { reviewedS5: true }))
      .toThrow("Review CN calculator matchers before pruning");
  }
  for (const changed of [
    code + "\nexport const matcherCount = patterns.length;",
    code.replace('if (typeof source !== "string")', 'patterns; if (typeof source !== "string")'),
    code.replace("markLabel: (name) =>", "markLabel: (name = translatedStrings) =>"),
  ]) {
    expect(() => pruneCnProductionModule(changed, `D:/project/${filename}`, { reviewedS5: true }))
      .toThrow("Review CN calculator matcher use before pruning");
  }
});

test("reviewed S5 production consumes the complete transport without the old preview overlay", () => {
  const file = "src/features/s5-preview/with-web-preview.js";
  const code = readFileSync(file, "utf8");
  expect(pruneCnProductionModule(code, `D:/project/${file}`)).toBeNull();
  const result = pruneCnProductionModule(code, `D:/project/${file}`, { reviewedS5: true });
  expect(result).not.toContain("s5-preview-new-spirits");
  expect(result).not.toContain("applyS5SeasonAnnouncement");
  expect(result).not.toContain("candymo-hidden-spirits-20261101.json");
  expect(result).not.toContain("withS5PreviewCatalog");
  const events = [];
  const compile = result.replace(/^import .*;\n/gmu, "").replace("export function", "function") + "\nreturn withWebPreview;";
  const apply = new Function("restoreS5RuntimeRelations", "withCalculatorExtras", "withPublicResourceUrls", compile)(
    value => { events.push("restore"); return { ...value, restored: true }; },
    value => { events.push("extras"); return { ...value, wishes: true }; },
    value => { events.push("urls"); return value; },
  );
  const snapshot = { meta: { s5NrcSync: { complete: true } }, spirits: [{ id: "bruce", raceStats: { speed: 90 } }],
    traits: [], skills: [], learnsets: [] };
  const projected = apply(snapshot);
  expect(projected).toMatchObject({ restored: true, wishes: true });
  expect(projected.spirits[0]).toBe(snapshot.spirits[0]);
  expect(projected.spirits).toBe(snapshot.spirits);
  expect(events).toEqual(["restore", "extras", "urls"]);
  expect(() => apply({ meta: {} })).toThrow("S5资料尚未完整加载");
});

const MECHANICS_MODULE = "src/features/s5-preview/mechanics.js";

function expectKeysOnlyMechanicsConsumer(code, filename) {
  const ast = parse(code, { sourceType: "module", plugins: ["jsx"] });
  const target = path.resolve(MECHANICS_MODULE);
  const isMechanics = source => typeof source === "string" &&
    (path.resolve(path.dirname(filename), source) === target || /\/s5-preview\/mechanics(?:\.js)?$/u.test(source));
  const imported = new Set();
  for (const node of ast.program.body) {
    if (node.type !== "ImportDeclaration" || !isMechanics(node.source.value)) continue;
    expect(node.specifiers.length, filename).toBeGreaterThan(0);
    for (const specifier of node.specifiers) {
      expect(specifier.type, filename).toBe("ImportSpecifier");
      expect(specifier.imported.name, filename).toBe("S5_PREVIEW_MECHANICS");
      imported.add(specifier.local.name);
    }
  }
  function visit(node, parent) {
    if (!node || typeof node !== "object") return;
    if ((node.type === "ExportNamedDeclaration" || node.type === "ExportAllDeclaration" || node.type === "ImportExpression") &&
        isMechanics(node.source?.value)) throw new Error("Review S5 mechanics consumer before pruning: " + filename);
    if (node.type === "CallExpression" && node.callee.type === "Import" && isMechanics(node.arguments[0]?.value)) {
      throw new Error("Review dynamic S5 mechanics consumer before pruning: " + filename);
    }
    if (node.type === "Identifier" && imported.has(node.name)) {
      expect(parent?.type, filename).toBe("CallExpression");
      expect(parent.arguments, filename).toEqual([node]);
      expect(parent.callee.type, filename).toBe("MemberExpression");
      expect(parent.callee.computed, filename).toBe(false);
      expect(parent.callee.object.name, filename).toBe("Object");
      expect(parent.callee.property.name, filename).toBe("keys");
    }
    for (const child of Object.values(node)) {
      if (Array.isArray(child)) child.forEach(entry => visit(entry, node));
      else if (child && typeof child === "object") visit(child, node);
    }
  }
  ast.program.body.filter(node => node.type !== "ImportDeclaration").forEach(node => visit(node, null));
}

test("reviewed S5 removes unused mechanics metadata while keeping frozen keys and other exports unchanged", () => {
  const code = readFileSync(MECHANICS_MODULE, "utf8");
  expect(pruneCnProductionModule(code, `D:/project/${MECHANICS_MODULE}`)).toBeNull();
  const result = pruneCnProductionModule(code, `D:/project/${MECHANICS_MODULE}`, { reviewedS5: true });
  const declaration = source => parse(source, { sourceType: "module" }).program.body[0];
  const original = declaration(code);
  const pruned = declaration(result);
  const metadata = (source, node) => new Function("return " + source.slice(node.declaration.declarations[0].init.start, node.declaration.declarations[0].init.end))();
  const values = metadata(result, pruned);
  expect(Object.isFrozen(values)).toBe(true);
  expect(Object.keys(values)).toEqual(Object.keys(metadata(code, original)));
  expect(Object.values(values).every(value => value && Object.keys(value).length === 0)).toBe(true);
  expect(result.slice(pruned.end)).toBe(code.slice(original.end));
});

test("all browser mechanics consumers use only Object.keys before reviewed S5 metadata pruning", () => {
  const files = directory => readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const filename = path.join(directory, entry.name);
    return entry.isDirectory() ? files(filename) : /\.[cm]?[jt]sx?$/u.test(filename) ? [filename] : [];
  });
  for (const filename of files("src")) expectKeysOnlyMechanicsConsumer(readFileSync(filename, "utf8"), filename);
});

test("mechanics source coverage rejects metadata reads and new adapter imports before pruning", () => {
  const source = body => `import { S5_PREVIEW_MECHANICS as mechanics } from "../features/s5-preview/mechanics.js"; ${body}`;
  expect(() => expectKeysOnlyMechanicsConsumer(source("Object.keys(mechanics);"), "src/state/fixture.js")).not.toThrow();
  for (const body of ["mechanics.abu.name;", "Object.values(mechanics);", "const alias = mechanics;"]) {
    expect(() => expectKeysOnlyMechanicsConsumer(source(body), "src/state/fixture.js")).toThrow();
  }
  for (const code of [
    'import { reduceS5Preview } from "../features/s5-preview/mechanics.js";',
    'import * as mechanics from "../features/s5-preview/mechanics.js";',
    'export * from "../features/s5-preview/mechanics.js";',
    'import("../features/s5-preview/mechanics.js");',
  ]) expect(() => expectKeysOnlyMechanicsConsumer(code, "src/state/fixture.js")).toThrow();
});
