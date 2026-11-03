import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { parse } from "@babel/parser";
import { load } from "cheerio";

export const DEFAULT_WEB_ENTRIES = Object.freeze([
  "index.html", "cn/index.html", "dianlu/index.html", "en/index.html", "jp/index.html",
  "global/zh-CN/index.html", "global/ja/index.html",
]);
const PORTRAIT_DATA = [
  { url: "/data/runtime.json", base: "/" },
  { url: "/global-assets/data/global-runtime.json", base: "/global-assets/" },
];

function resourceKind(specifier) {
  const extension = specifier.split(/[?#]/u, 1)[0].match(/\.([a-z0-9]+)$/iu)?.[1]?.toLowerCase();
  if (["js", "mjs", "cjs"].includes(extension)) return "js";
  if (extension === "css") return "css";
  if (extension === "wasm") return "wasm";
  if (["png", "jpg", "jpeg", "webp", "avif", "gif", "svg", "ico"].includes(extension)) return "image";
  if (extension === "html") return "html";
  return "asset";
}

function walk(node, visit) {
  if (!node || typeof node !== "object") return;
  if (Array.isArray(node)) { for (const item of node) walk(item, visit); return; }
  if (typeof node.type === "string") visit(node);
  for (const [key, value] of Object.entries(node)) {
    if (!["loc", "start", "end", "extra", "comments", "tokens"].includes(key) && value && typeof value === "object") walk(value, visit);
  }
}

function literal(node) {
  if (node?.type === "StringLiteral") return node.value;
  if (node?.type === "TemplateLiteral" && node.expressions.length === 0) return node.quasis[0].value.cooked;
  return null;
}

function decodeCss(value) {
  return value.replace(/\\(?:([0-9a-f]{1,6})\s?|([\s\S]))/giu, (_, hex, escaped) => hex ? String.fromCodePoint(parseInt(hex, 16) || 0xfffd) : escaped);
}

/** Shared by the local artifact gate and the post-deployment HTTP gate. */
export function extractWebReferences(text, resourcePath, { kind = resourceKind(resourcePath) } = {}) {
  const references = new Map();
  const add = (specifier, via, base = "relative", forcedKind) => {
    if (typeof specifier !== "string" || !specifier.trim()) return;
    const ref = { specifier: specifier.trim(), kind: forcedKind ?? resourceKind(specifier), via, base };
    references.set(JSON.stringify(ref), ref);
  };
  if (kind === "html") {
    const $ = load(text);
    $("script[src]").each((_, element) => add($(element).attr("src"), "html", "relative", "js"));
    $("link[href]").each((_, element) => {
      const rel = ($(element).attr("rel") ?? "").toLowerCase().split(/\s+/u);
      if (rel.some((item) => ["stylesheet", "modulepreload", "preload"].includes(item))) {
        const forcedKind = rel.includes("stylesheet") ? "css" : rel.includes("modulepreload") ? "js" : undefined;
        add($(element).attr("href"), "html", "relative", forcedKind);
      }
    });
  } else if (kind === "js") {
    const ast = parse(text, { sourceType: "unambiguous" });
    walk(ast, (node) => {
      if (["ImportDeclaration", "ExportNamedDeclaration", "ExportAllDeclaration"].includes(node.type)) add(literal(node.source), "import");
      if (node.type === "ImportExpression") add(literal(node.source), "import");
      if (node.type === "CallExpression" && node.callee?.type === "Import") add(literal(node.arguments[0]), "import");
      if (node.type === "NewExpression" && node.callee?.name === "URL" && node.arguments[1]?.type === "MemberExpression" && node.arguments[1].object?.type === "MetaProperty" && node.arguments[1].object.meta?.name === "import" && node.arguments[1].property?.name === "url") {
        const value = literal(node.arguments[0]);
        add(value, resourceKind(value ?? "") === "image" ? "js-image" : "import");
      }
      if (node.type === "VariableDeclarator" && node.id?.name === "__vite__mapDeps") {
        walk(node.init, (child) => { const value = literal(child); if (value) add(value, "vite-preload", "application"); });
      }
      const value = literal(node);
      if (value && /^\/(?:assets|global-assets\/assets)\//u.test(value) && resourceKind(value) === "image") add(value, "js-image");
    });
  } else if (kind === "css") {
    const css = text.replace(/\/\*[\s\S]*?\*\//gu, "");
    const urls = /url\(\s*(?:"((?:\\.|[^"\\])*)"|'((?:\\.|[^'\\])*)'|((?:\\.|[^)\\])*?))\s*\)/giu;
    for (const match of css.matchAll(urls)) add(decodeCss(match[1] ?? match[2] ?? match[3]), "css-url");
    for (const match of css.matchAll(/@import\s+(?:"((?:\\.|[^"\\])*)"|'((?:\\.|[^'\\])*)')/giu)) add(decodeCss(match[1] ?? match[2]), "css-url", "relative", "css");
  }
  return [...references.values()];
}

/** Resolve to a same-origin URL path. Vite's assets/... tables are relative to the application mount. */
export function resolveWebReference(ref, resourcePath) {
  const specifier = ref.specifier.trim();
  if (!specifier || /^(?:[a-z][a-z\d+.-]*:|\/\/|#)/iu.test(specifier)) return null;
  const source = new URL(resourcePath, "https://artifact.invalid");
  let base = source;
  if (ref.base === "application") {
    const assets = source.pathname.indexOf("/assets/");
    if (assets < 0) throw new Error("Cannot resolve Vite application mount for " + resourcePath);
    base = new URL(source.pathname.slice(0, assets + 1), source.origin);
  }
  const target = new URL(specifier, base);
  if (target.origin !== source.origin) return null;
  return target.pathname + target.search;
}

export function verifyWebArtifact({ distRoot = "dist/client", entries = DEFAULT_WEB_ENTRIES } = {}) {
  distRoot = path.resolve(distRoot);
  const files = new Set();
  function inventory(directory, prefix = "") {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const relative = prefix + entry.name;
      if (entry.isSymbolicLink()) throw new Error("Artifact cannot contain links: " + relative);
      if (entry.isDirectory()) inventory(path.join(directory, entry.name), relative + "/");
      else if (entry.isFile()) files.add("/" + relative);
      else throw new Error("Invalid artifact file: " + relative);
    }
  }
  inventory(distRoot);
  const queue = entries.map((entry) => ({ url: "/" + entry.replace(/^\//u, ""), kind: "html", from: "formal entry" }));
  queue.push(...PORTRAIT_DATA.map((data) => ({ ...data, kind: "portrait-data", from: "runtime portrait bindings" })));
  const visited = new Set();
  const counts = {};
  for (let cursor = 0; cursor < queue.length; cursor++) {
    const resource = queue[cursor];
    const pathname = decodeURIComponent(new URL(resource.url, "https://artifact.invalid").pathname);
    if (!files.has(pathname)) throw new Error("Missing Web artifact: " + pathname + " (referenced by " + resource.from + ")");
    if (visited.has(pathname)) continue;
    visited.add(pathname);
    counts[resource.kind] = (counts[resource.kind] ?? 0) + 1;
    if (resource.kind === "portrait-data") {
      const snapshot = JSON.parse(readFileSync(path.join(distRoot, pathname.slice(1)), "utf8"));
      if (!Array.isArray(snapshot.spirits) || !snapshot.spirits.length) throw new Error("Runtime portrait data contains no spirits: " + pathname);
      for (const spirit of snapshot.spirits) {
        const localUrl = spirit.asset?.localUrl;
        // Match withPublicResourceUrls: Global data keeps /assets/ URLs on disk
        // and projects display resources into its own mount at runtime.
        if (typeof localUrl !== "string" || !localUrl.startsWith("/assets/")) continue;
        queue.push({ url: resource.base + localUrl.slice(1), kind: "image", from: pathname + " (" + spirit.id + ")" });
      }
      continue;
    }
    if (!["html", "js", "css"].includes(resource.kind)) continue;
    const text = readFileSync(path.join(distRoot, pathname.slice(1)), "utf8");
    const refs = extractWebReferences(text, pathname, { kind: resource.kind });
    if (resource.kind === "html" && !refs.some((ref) => ref.kind === "js")) throw new Error("Web entry contains no script references: " + pathname);
    for (const ref of refs) {
      const url = resolveWebReference(ref, pathname);
      if (url) queue.push({ url, kind: ref.kind, from: pathname });
    }
  }
  return { ok: true, entries: entries.length, checked: visited.size, counts };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    if (process.argv.length > 2) throw new Error("Usage: node scripts/verify-web-artifact.mjs");
    const result = verifyWebArtifact();
    console.log("PASS final Web artifact: " + result.entries + " entries, " + result.checked + " referenced resources checked");
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
