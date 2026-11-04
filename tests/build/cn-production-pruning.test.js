import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { parse } from "@babel/parser";
import { expect, test } from "vitest";
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
