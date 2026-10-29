import { parse } from "@babel/parser";

export const CN_ICON_WEIGHTS = Object.freeze(["regular", "bold", "fill"]);

// The root production build serves CN; Global is assembled from its separate pin.
// Keep source translations and development builds intact, and retain all used icons.
export function pruneCnProductionModule(code, id) {
  const filename = id.replaceAll("\\", "/");
  if (filename.endsWith("/src/i18n/messages.js")) {
    const imports = parse(code, { sourceType: "module" }).program.body.filter(node =>
      node.type === "ImportDeclaration" && /^\.\/[\w-]+-messages\.js$/u.test(node.source.value));
    return imports.reduceRight((result, node) => {
      if (node.specifiers.length !== 1 || node.specifiers[0].type !== "ImportSpecifier") {
        throw new Error("Unexpected CN translation import: " + node.source.value);
      }
      return result.slice(0, node.start) + `const ${node.specifiers[0].local.name} = {};` + result.slice(node.end);
    }, code);
  }
  if (!/\/node_modules\/@phosphor-icons\/react\/dist\/defs\/[^/]+\.es\.js$/u.test(filename)) return null;
  const declarations = parse(code, { sourceType: "module" }).program.body
    .filter(node => node.type === "VariableDeclaration").flatMap(node => node.declarations);
  const weights = declarations.find(node => node.init?.type === "NewExpression" && node.init.callee.name === "Map")?.init.arguments[0];
  if (weights?.type !== "ArrayExpression" || weights.elements.some(node => node?.type !== "ArrayExpression" || node.elements[0]?.type !== "StringLiteral")) {
    throw new Error("Unexpected Phosphor weight map: " + id);
  }
  const retained = weights.elements.filter(node => CN_ICON_WEIGHTS.includes(node.elements[0].value));
  if (retained.length !== CN_ICON_WEIGHTS.length) throw new Error("Missing supported Phosphor weight: " + id);
  return code.slice(0, weights.start) + "[" + retained.map(node => code.slice(node.start, node.end)).join(",") + "]" + code.slice(weights.end);
}

export function cnProductionPruningPlugin() {
  return {
    name: "cn-production-pruning",
    apply: "build",
    enforce: "pre",
    transform(code, id) {
      const result = pruneCnProductionModule(code, id);
      return result === null ? null : { code: result, map: null };
    },
  };
}
