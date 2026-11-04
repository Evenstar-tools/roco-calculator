import { parse } from "@babel/parser";

export const CN_ICON_WEIGHTS = Object.freeze(["regular", "bold", "fill"]);

// Reviewed direct JSX usages; aliases/spreads and unlisted icons keep the fallback.
// The source coverage test fails when a new usage needs a previously omitted style.
const CN_ICON_WEIGHTS_BY_NAME = {
  Shuffle: ["regular"],
  EyeSlash: ["regular"],
  ArrowSquareOut: ["regular"],
  Sun: ["regular"],
  ArrowsOut: ["regular"],
  ArrowsIn: ["regular"],
  Eye: ["regular"],
  Wrench: ["regular"],
  Toolbox: ["regular"],
  Question: ["regular"],
  BookOpen: ["regular"],
  Trash: ["regular"],
  Moon: ["regular"],
  LockSimpleOpen: ["regular"],
  PencilSimple: ["regular"],
  UploadSimple: ["regular"],
  Copy: ["regular"],
  LockSimple: ["regular"],
  Check: ["regular"],
  ArrowRight: ["regular"],
  Minus: ["regular"],
  CaretRight: ["regular"],
  Gear: ["regular"],
  Speedometer: ["regular"],
  ClockCounterClockwise: ["regular"],
  Shapes: ["regular"],
  MagnifyingGlass: ["regular"],
  Table: ["regular"],
  SquaresFour: ["fill"],
  ShieldWarning: ["fill"],
  CheckCircle: ["fill"],
  ArrowFatDown: ["fill"],
  Pause: ["fill"],
  ArrowFatUp: ["fill"],
  ArrowsClockwise: ["bold"],
  CheckSquareOffset: ["bold"],
  List: ["bold"],
  DotsThree: ["bold"],
  ArrowUp: ["bold"],
  Equals: ["bold"],
  UsersThree: ["regular", "fill"],
  Lightning: ["regular", "fill"],
  MagicWand: ["regular", "fill"],
  Star: ["regular", "fill"],
  ShieldCheck: ["regular", "fill"],
  Info: ["regular", "fill"],
  Crosshair: ["regular", "bold"],
  X: ["regular", "bold"],
  ArrowCounterClockwise: ["regular", "bold"],
  ArrowsLeftRight: ["regular", "bold"],
  DownloadSimple: ["regular", "bold"],
  Plus: ["regular", "bold"],
  ArrowLeft: ["regular", "bold"],
};

// The root production build serves CN; Global is assembled from its separate pin.
// Keep source translations and development builds intact, and retain all used icons.
export function pruneCnProductionModule(code, id, { reviewedS5 = false } = {}) {
  const filename = id.replaceAll("\\", "/");
  if (filename.endsWith("/src/i18n/calculator-messages.js")) {
    // CN renders the source Chinese text; this table contains only EN/JA translations.
    return "export const calculatorMessages = {};";
  }
  if (reviewedS5 && filename.endsWith("/src/features/s5-preview/mechanics.js")) {
    // The reviewed browser reducer enumerates keys only; event adapters keep their code.
    const declaration = parse(code, { sourceType: "module" }).program.body
      .find(node => node.type === "ExportNamedDeclaration" &&
        node.declaration?.declarations?.[0]?.id?.name === "S5_PREVIEW_MECHANICS")?.declaration.declarations[0];
    const initializer = declaration?.init;
    const metadata = initializer?.arguments?.[0];
    if (initializer?.type !== "CallExpression" || initializer.callee.type !== "MemberExpression" ||
        initializer.callee.object.name !== "Object" || initializer.callee.property.name !== "freeze" ||
        metadata?.type !== "ObjectExpression" || metadata.properties.some(property =>
          property.type !== "ObjectProperty" || property.computed ||
          !["Identifier", "StringLiteral"].includes(property.key.type) || property.value.type !== "ObjectExpression")) {
      throw new Error("Unexpected S5 mechanics metadata: " + id);
    }
    const keysOnly = "{" + metadata.properties.map(property => code.slice(property.key.start, property.key.end) + ":{}").join(",") + "}";
    return code.slice(0, metadata.start) + keysOnly + code.slice(metadata.end);
  }
  if (reviewedS5 && filename.endsWith("/src/features/s5-preview/with-web-preview.js")) {
    // The build emits a complete reviewed snapshot. Do not ship the older fallback
    // catalog again in JS or let it overwrite current data after a release.
    return `import { withCalculatorExtras } from "../../data/snapshot-extras.js";
import { withPublicResourceUrls } from "../../runtime/public-resource-url.js";
import { restoreS5RuntimeRelations } from "../../data/s5-runtime-relations.js";
export function withWebPreview(snapshot) {
  const restored = restoreS5RuntimeRelations(snapshot);
  if (restored.meta?.s5NrcSync?.complete !== true) throw new Error("S5资料尚未完整加载，请刷新重试。");
  return withPublicResourceUrls(withCalculatorExtras(restored));
}`;
  }

  if (filename.endsWith("/src/data/global-entity-text.js")) {
    const exports = parse(code, { sourceType: "module" }).program.body;
    return exports.map(node => {
      const name = node.declaration?.declarations?.[0]?.id?.name;
      if (name === "GLOBAL_ENTITY_TEXT_META") return code.slice(node.start, node.end);
      if (name === "GLOBAL_ENTITY_TEXT") return "export const GLOBAL_ENTITY_TEXT = { spirit: {}, skill: {}, trait: {} };";
      if (name === "GLOBAL_CLIENT_TRAIT_TEXT") return "export const GLOBAL_CLIENT_TRAIT_TEXT = {};";
      throw new Error("Unexpected Global display catalog export in CN build: " + name);
    }).join("\n");
  }
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
  const icon = filename.match(/\/node_modules\/@phosphor-icons\/react\/dist\/defs\/([^/]+)\.es\.js$/u);
  if (!icon) return null;
  const declarations = parse(code, { sourceType: "module" }).program.body
    .filter(node => node.type === "VariableDeclaration").flatMap(node => node.declarations);
  const weights = declarations.find(node => node.init?.type === "NewExpression" && node.init.callee.name === "Map")?.init.arguments[0];
  if (weights?.type !== "ArrayExpression" || weights.elements.some(node => node?.type !== "ArrayExpression" || node.elements[0]?.type !== "StringLiteral")) {
    throw new Error("Unexpected Phosphor weight map: " + id);
  }
  const supported = Object.hasOwn(CN_ICON_WEIGHTS_BY_NAME, icon[1]) ? CN_ICON_WEIGHTS_BY_NAME[icon[1]] : CN_ICON_WEIGHTS;
  const retained = weights.elements.filter(node => supported.includes(node.elements[0].value));
  if (retained.length !== supported.length) throw new Error("Missing supported Phosphor weight: " + id);
  return code.slice(0, weights.start) + "[" + retained.map(node => code.slice(node.start, node.end)).join(",") + "]" + code.slice(weights.end);
}

export function cnProductionPruningPlugin(options = {}) {
  return {
    name: "cn-production-pruning",
    apply: "build",
    enforce: "pre",
    transform(code, id) {
      const result = pruneCnProductionModule(code, id, options);
      return result === null ? null : { code: result, map: null };
    },
  };
}
