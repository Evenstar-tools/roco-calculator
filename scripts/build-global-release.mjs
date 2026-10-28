import { spawnSync } from "node:child_process";
import { cpSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, symlinkSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const REVISION = /^[a-f0-9]{40}$/u;
const ENTRIES = ["en/index.html", "jp/index.html", "global/zh-CN/index.html", "global/ja/index.html"];
const MANIFESTS = ["manifest-global-en.webmanifest", "manifest-global-ja.webmanifest", "manifest-global-zh-CN.webmanifest"];

export function requireInside(parent, target) {
  const absolute = path.resolve(target);
  const relative = path.relative(path.resolve(parent), absolute);
  if (!relative || relative === ".." || relative.startsWith(".." + path.sep) || path.isAbsolute(relative)) {
    throw new Error("Global path escapes its allowed directory: " + absolute);
  }
  return absolute;
}

export function readGlobalReleasePin(root) {
  const pin = JSON.parse(readFileSync(path.join(root, "config/global-release.json"), "utf8"));
  if (pin.schemaVersion !== 1 || !REVISION.test(pin.sourceRevision ?? "")) {
    throw new Error("Global release requires a pinned full 40-character sourceRevision");
  }
  return pin;
}

function execute(command, args, { cwd, allowFailure = false } = {}) {
  const result = spawnSync(command, args, { cwd, stdio: "inherit", env: process.env });
  if (result.error) throw result.error;
  if (result.status !== 0 && !allowFailure) throw new Error("Global build command failed: " + command + " (exit " + result.status + ")");
  return result.status;
}

function requirePlainTree(directory) {
  if (!lstatSync(directory).isDirectory() || lstatSync(directory).isSymbolicLink()) {
    throw new Error("Global artifact directory cannot be a link: " + directory);
  }
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const filename = path.join(directory, entry.name);
    if (entry.isSymbolicLink()) throw new Error("Global artifact cannot contain links: " + filename);
    if (entry.isDirectory()) requirePlainTree(filename);
    else if (!entry.isFile()) throw new Error("Unexpected global artifact type: " + filename);
  }
}

function requireSafeDestination(rootDist, filename) {
  const parts = filename.split("/");
  let current = rootDist;
  for (const [index, part] of parts.entries()) {
    current = requireInside(rootDist, path.join(current, part));
    const stat = lstatSync(current, { throwIfNoEntry: false });
    if (!stat) continue;
    if (stat.isSymbolicLink()) throw new Error("Global destination cannot be a link: " + current);
    const expected = index === parts.length - 1 ? stat.isFile() : stat.isDirectory();
    if (!expected) throw new Error("Unexpected global destination type: " + current);
  }
}

function requireIsolatedAssets(html, filename) {
  let buildReferences = 0;
  for (const tag of html.match(/<(?:script|link)\b[^>]*>/giu) ?? []) {
    const attributes = new Map([...tag.matchAll(/([\w-]+)\s*=\s*(["'])(.*?)\2/gu)].map((match) => [match[1].toLowerCase(), match[3]]));
    const script = /^<script\b/iu.test(tag);
    const reference = attributes.get(script ? "src" : "href");
    if (!reference) continue;
    const rel = (attributes.get("rel") ?? "").toLowerCase().split(/\s+/u);
    if (!script && !rel.some((value) => ["stylesheet", "modulepreload"].includes(value)) && !/\.(?:js|css)(?:[?#]|$)/u.test(reference)) continue;
    const url = new URL(reference, "https://global-build.invalid");
    if (!reference.startsWith("/global-assets/assets/") || !url.pathname.startsWith("/global-assets/assets/") || /%2f|%5c|%2e/iu.test(reference)) {
      throw new Error("Global HTML does not reference isolated assets: " + filename + " (" + reference + ")");
    }
    buildReferences += 1;
  }
  if (!buildReferences) throw new Error("Global HTML does not reference isolated assets: " + filename);
}

export function copyGlobalRelease(root, sourceDirectory) {
  const output = requireInside(root, path.join(root, "output"));
  const source = requireInside(output, sourceDirectory);
  if (!existsSync(source)) throw new Error("Pinned global source directory is missing");
  requireInside(realpathSync(root), realpathSync(output));
  requireInside(realpathSync(output), realpathSync(source));
  const childDist = requireInside(source, path.join(source, "dist/global"));
  const rootDist = requireInside(root, path.join(root, "dist/client"));
  if (!existsSync(rootDist) || !existsSync(path.join(rootDist, "index.html"))) {
    throw new Error("Stable root must be built before assembling /global-assets/");
  }
  requireInside(realpathSync(root), realpathSync(rootDist));
  const target = requireInside(rootDist, path.join(rootDist, "global-assets"));
  if (lstatSync(target, { throwIfNoEntry: false })) throw new Error("dist/client/global-assets already exists; rebuild the stable root before assembling global");
  for (const entry of [...ENTRIES, ...MANIFESTS, "assets", "data/global-runtime.json", "data/global/skill-query/catalog.json"]) {
    const stat = lstatSync(path.join(childDist, entry), { throwIfNoEntry: false });
    if (!stat || (entry === "assets" ? !stat.isDirectory() : !stat.isFile())) {
      throw new Error("Global build is incomplete: missing or invalid " + entry);
    }
  }
  requireInside(realpathSync(source), realpathSync(childDist));
  requirePlainTree(childDist);
  for (const filename of ENTRIES) requireIsolatedAssets(readFileSync(path.join(childDist, filename), "utf8"), filename);
  for (const filename of [...ENTRIES, ...MANIFESTS]) requireSafeDestination(rootDist, filename);
  cpSync(childDist, target, { recursive: true, force: false, errorOnExist: true });
  for (const filename of [...ENTRIES, ...MANIFESTS]) {
    mkdirSync(path.dirname(path.join(rootDist, filename)), { recursive: true });
    cpSync(path.join(childDist, filename), path.join(rootDist, filename));
  }
  return target;
}

/** Build only a pinned Git archive; never copy a dirty checkout as global source. */
export function buildGlobalRelease({ root = ROOT, run = execute } = {}) {
  root = realpathSync(root);
  const { sourceRevision } = readGlobalReleasePin(root);
  const modules = path.join(root, "node_modules");
  const vite = path.join(modules, "vite/bin/vite.js");
  if (!existsSync(vite)) throw new Error("Root dependencies must be installed before the global build");
  const output = requireInside(root, path.join(root, "output"));
  mkdirSync(output, { recursive: true });
  requireInside(root, realpathSync(output));
  const source = mkdtempSync(path.join(output, "global-source-" + sourceRevision + "-"));
  const archive = requireInside(output, source + ".tar");
  const gitOptions = { cwd: root };
  if (run("git", ["cat-file", "-e", sourceRevision + "^{commit}"], { ...gitOptions, allowFailure: true }) !== 0) {
    run("git", ["fetch", "--depth=1", "--no-tags", "--no-write-fetch-head", "origin", sourceRevision], gitOptions);
    run("git", ["cat-file", "-e", sourceRevision + "^{commit}"], gitOptions);
  }
  run("git", ["archive", "--format=tar", "--output=" + archive, sourceRevision], gitOptions);
  run("tar", ["-xf", archive, "-C", source], gitOptions);
  const childModules = requireInside(source, path.join(source, "node_modules"));
  if (existsSync(childModules)) throw new Error("Pinned source unexpectedly includes node_modules");
  symlinkSync(modules, childModules, process.platform === "win32" ? "junction" : "dir");
  const childOptions = { cwd: source };
  run(process.execPath, [vite, "build", "--config", "config/vite.global.config.mjs", "--mode", "global"], childOptions);
  const target = copyGlobalRelease(root, source);
  console.log("Global source " + sourceRevision + " assembled only at " + target);
  return { sourceRevision, source, target };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try { buildGlobalRelease(); }
  catch (error) {
    console.error("Global release failed: " + error.message);
    process.exitCode = 1;
  }
}
