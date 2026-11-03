import { cpSync, existsSync, lstatSync, mkdirSync, readFileSync, realpathSync, rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { buildPreviewSource, requireInside, requirePlainTree } from "./build-preview-release.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const REQUIRED = ["index.html", "dianlu/index.html", "assets", "data/runtime.json"];

function requirePlainPath(root, target) {
  const absolute = requireInside(root, target);
  let current = root;
  for (const part of path.relative(root, absolute).split(path.sep)) {
    current = path.join(current, part);
    const stat = lstatSync(current, { throwIfNoEntry: false });
    if (stat?.isSymbolicLink()) throw new Error("CN artifact path cannot contain links: " + current);
    if (stat && current !== absolute && !stat.isDirectory()) throw new Error("CN artifact parent is not a directory: " + current);
  }
  return absolute;
}

function requireCompleteArtifact(directory) {
  for (const entry of REQUIRED) {
    const stat = lstatSync(path.join(directory, entry), { throwIfNoEntry: false });
    if (!stat || (entry === "assets" ? !stat.isDirectory() : !stat.isFile())) {
      throw new Error("CN build is incomplete: missing or invalid " + entry);
    }
  }
}

function requireRootAssets(html, filename) {
  let references = 0;
  for (const tag of html.match(/<(?:script|link)\b[^>]*>/giu) ?? []) {
    const attributes = new Map([...tag.matchAll(/([\w-]+)\s*=\s*(["'])(.*?)\2/gu)].map((match) => [match[1].toLowerCase(), match[3]]));
    const script = /^<script\b/iu.test(tag);
    const reference = attributes.get(script ? "src" : "href");
    if (!reference) continue;
    const rel = (attributes.get("rel") ?? "").toLowerCase().split(/\s+/u);
    if (!script && !rel.some((value) => ["stylesheet", "modulepreload"].includes(value)) && !/\.(?:js|css)(?:[?#]|$)/u.test(reference)) continue;
    const url = new URL(reference, "https://cn-build.invalid");
    if (!reference.startsWith("/assets/") || !url.pathname.startsWith("/assets/") || /%2f|%5c|%2e/iu.test(reference)) {
      throw new Error("CN HTML must reference root /assets/: " + filename + " (" + reference + ")");
    }
    references += 1;
  }
  if (!references) throw new Error("CN HTML must reference root /assets/: " + filename);
}

/** Replace only the known build output, after validating the complete pinned artifact. */
export function copyCnRelease(root, sourceDirectory) {
  root = realpathSync(root);
  const output = requirePlainPath(root, path.join(root, "output"));
  const source = requireInside(output, sourceDirectory);
  if (!existsSync(source)) throw new Error("Pinned CN source directory is missing");
  requirePlainPath(root, source);
  requireInside(realpathSync(output), realpathSync(source));
  const childDist = requirePlainPath(source, path.join(source, "dist/client"));
  requireCompleteArtifact(childDist);
  requirePlainTree(childDist);
  if (["pre", "global-assets"].some((entry) => existsSync(path.join(childDist, entry)))) {
    throw new Error("CN build must not contain assembled preview or global output");
  }
  for (const filename of ["index.html", "dianlu/index.html"]) {
    requireRootAssets(readFileSync(path.join(childDist, filename), "utf8"), filename);
  }
  const serviceWorker = requirePlainPath(root, path.join(root, "public/sw.js"));
  if (!lstatSync(serviceWorker, { throwIfNoEntry: false })?.isFile()) throw new Error("Release service worker is missing");
  // The sitemap describes the assembled CN + Global site, not the CN source pin.
  const sitemap = requirePlainPath(root, path.join(root, "public/sitemap.xml"));
  if (!lstatSync(sitemap, { throwIfNoEntry: false })?.isFile()) throw new Error("Release sitemap is missing");
  const target = requirePlainPath(root, path.join(root, "dist/client"));
  if (existsSync(target)) {
    requirePlainTree(target);
    try { requireCompleteArtifact(target); }
    catch { throw new Error("Refusing to replace an unrecognized dist/client directory"); }
    // Both lexical and resolved targets must remain the exact build directory.
    if (realpathSync(target) !== target) throw new Error("CN build destination resolves outside dist/client");
    rmSync(target, { recursive: true });
  }
  mkdirSync(path.dirname(target), { recursive: true });
  cpSync(childDist, target, { recursive: true, force: false, errorOnExist: true });
  cpSync(serviceWorker, path.join(target, "sw.js"));
  cpSync(sitemap, path.join(target, "sitemap.xml"));
  return target;
}

export function buildCnRelease({ root = ROOT, run } = {}) {
  const { sourceRevision, source } = buildPreviewSource({ root, run, mode: "cn" });
  const target = copyCnRelease(root, source);
  console.log("CN source " + sourceRevision + " assembled at " + target);
  return { sourceRevision, source, target };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try { buildCnRelease(); }
  catch (error) {
    console.error("CN release failed: " + error.message);
    process.exitCode = 1;
  }
}
