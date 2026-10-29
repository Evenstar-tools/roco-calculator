import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { parse } from "@babel/parser";
import { expect, test } from "vitest";
import { CN_ICON_WEIGHTS, cnProductionPruningPlugin, pruneCnProductionModule } from "../../scripts/cn-production-pruning.mjs";

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
