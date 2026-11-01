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

test.each(["Gear", "Star", "ArrowCounterClockwise"])("%s keeps regular/bold/fill SVG nodes unchanged, including both favorite states", name => {
  const filename = `node_modules/@phosphor-icons/react/dist/defs/${name}.es.js`;
  const code = readFileSync(filename, "utf8");
  const result = pruneCnProductionModule(code, `D:/project/${filename}`);
  expect(weightEntries(result)).toEqual(weightEntries(code).filter(([weight]) => CN_ICON_WEIGHTS.includes(weight)));
  expect(weightEntries(result).map(([weight]) => weight).sort()).toEqual([...CN_ICON_WEIGHTS].sort());
  expect(pruneCnProductionModule(code, `D:/project/${filename.replace("/defs/", "/csr/")}`)).toBeNull();
});

test("all application icon weight usages stay within retained styles, including dynamic alternatives", () => {
  const files = directory => readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const filename = path.join(directory, entry.name);
    return entry.isDirectory() ? files(filename) : filename.endsWith(".jsx") ? [filename] : [];
  });
  const alternatives = node => {
    if (node.type === "StringLiteral") return [node.value];
    if (node.type === "JSXExpressionContainer") return alternatives(node.expression);
    if (node.type === "ConditionalExpression") return [...alternatives(node.consequent), ...alternatives(node.alternate)];
    throw new Error("Review new dynamic icon weight before pruning: " + node.type);
  };
  function visit(node, filename) {
    if (!node || typeof node !== "object") return;
    if (node.type === "JSXAttribute" && node.name.name === "weight") {
      expect(alternatives(node.value).every(weight => CN_ICON_WEIGHTS.includes(weight)), filename).toBe(true);
    }
    for (const child of Object.values(node)) {
      if (Array.isArray(child)) child.forEach(item => visit(item, filename));
      else if (child && typeof child === "object") visit(child, filename);
    }
  }
  files("src").forEach(filename => visit(parse(readFileSync(filename, "utf8"), { sourceType: "module", plugins: ["jsx"] }), filename));
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
  const events = [];
  const compile = result.replace(/^import .*;\n/gmu, "").replace("export function", "function") + "\nreturn withWebPreview;";
  const apply = new Function("restoreS5RuntimeRelations", "withCalculatorExtras", "withPublicResourceUrls", compile)(
    value => { events.push("restore"); return { ...value, restored: true }; },
    value => { events.push("extras"); return { ...value, wishes: true }; },
    value => { events.push("urls"); return value; },
  );
  const snapshot = { meta: { s5NrcSync: { complete: true } }, spirits: [{ id: "bruce", raceStats: { speed: 90 } }] };
  expect(apply(snapshot)).toEqual({ ...snapshot, restored: true, wishes: true });
  expect(events).toEqual(["restore", "extras", "urls"]);
  expect(() => apply({ meta: {} })).toThrow("S5资料尚未完整加载");
});
