import { spawnSync } from "node:child_process";
import { cpSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, renameSync, symlinkSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const REVISION = /^[a-f0-9]{40}$/u;

export function requireInside(parent, target) {
  const absolute = path.resolve(target);
  const relative = path.relative(path.resolve(parent), absolute);
  if (!relative || relative === ".." || relative.startsWith(".." + path.sep) || path.isAbsolute(relative)) {
    throw new Error("Preview path escapes its allowed directory: " + absolute);
  }
  return absolute;
}

export function readPreviewReleasePin(root, pinFile = "config/preview-release.json") {
  const pin = JSON.parse(readFileSync(requireInside(root, path.join(root, pinFile)), "utf8"));
  if (pin.schemaVersion !== 1 || !REVISION.test(pin.sourceRevision ?? "")) {
    throw new Error("Preview release requires a pinned full 40-character sourceRevision");
  }
  return pin;
}

function execute(command, args, { cwd, allowFailure = false } = {}) {
  const result = spawnSync(command, args, { cwd, stdio: "inherit", env: process.env });
  if (result.error) throw result.error;
  if (result.status !== 0 && !allowFailure) throw new Error("Preview build command failed: " + command + " (exit " + result.status + ")");
  return result.status;
}

export function requirePlainTree(directory) {
  if (!lstatSync(directory).isDirectory() || lstatSync(directory).isSymbolicLink()) {
    throw new Error("Preview artifact directory cannot be a link: " + directory);
  }
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const filename = path.join(directory, entry.name);
    if (entry.isSymbolicLink()) throw new Error("Preview artifact cannot contain links: " + filename);
    if (entry.isDirectory()) requirePlainTree(filename);
    else if (!entry.isFile()) throw new Error("Unexpected preview artifact type: " + filename);
  }
}

export function copyPreviewRelease(root, sourceDirectory) {
  const output = requireInside(root, path.join(root, "output"));
  const source = requireInside(output, sourceDirectory);
  if (!existsSync(source)) throw new Error("Pinned preview source directory is missing");
  requireInside(realpathSync(root), realpathSync(output));
  requireInside(realpathSync(output), realpathSync(source));
  const childDist = requireInside(source, path.join(source, "dist/client"));
  const rootDist = requireInside(root, path.join(root, "dist/client"));
  if (!existsSync(rootDist) || !existsSync(path.join(rootDist, "index.html"))) {
    throw new Error("Stable root must be built before assembling /pre/");
  }
  requireInside(realpathSync(root), realpathSync(rootDist));
  const target = requireInside(rootDist, path.join(rootDist, "pre"));
  if (existsSync(target)) throw new Error("dist/client/pre already exists; rebuild the stable root before assembling preview");
  for (const entry of ["index.html", "dianlu/index.html", "assets", "data/runtime.json"]) {
    if (!existsSync(path.join(childDist, entry))) throw new Error("Preview build is incomplete: missing " + entry);
  }
  requireInside(realpathSync(source), realpathSync(childDist));
  if (existsSync(path.join(childDist, "pre"))) throw new Error("Preview build unexpectedly contains a nested pre directory");
  requirePlainTree(childDist);
  for (const filename of ["index.html", "dianlu/index.html"]) {
    const html = readFileSync(path.join(childDist, filename), "utf8");
    if (!/["']\/pre\/assets\//u.test(html)) throw new Error("Preview HTML does not reference /pre/assets/: " + filename);
  }
  cpSync(childDist, target, { recursive: true, force: false, errorOnExist: true });
  // Retire only the entry; retain archived assets/data and desktop packaging inputs.
  // An external script also works under the desktop app's script-src 'self' CSP.
  writeFileSync(path.join(target, "redirect.js"), 'location.replace("/" + location.search + location.hash);\n', "utf8");
  writeFileSync(path.join(target, "index.html"), `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>洛克计算器</title>
  <script src="/pre/redirect.js"></script>
  <noscript><meta http-equiv="refresh" content="0;url=/"></noscript>
</head>
<body><a href="/">打开计算器</a></body>
</html>
`, "utf8");
  return target;
}

/** Prepare the exact release source for Web and CLI; never copy a dirty checkout. */
export function preparePreviewSource({ root = ROOT, run = execute, mode = "pre", reuse = false, allowFetch = true, pinFile } = {}) {
  if (!["pre", "cn", "miniapp"].includes(mode)) throw new Error("Unsupported pinned source build mode: " + mode);
  root = realpathSync(root);
  const { sourceRevision } = readPreviewReleasePin(root, pinFile);
  const modules = path.join(root, "node_modules");
  const vite = path.join(modules, "vite/bin/vite.js");
  if (!existsSync(vite)) throw new Error("Root dependencies must be installed before the preview build");
  const output = requireInside(root, path.join(root, "output"));
  mkdirSync(output, { recursive: true });
  requireInside(root, realpathSync(output));
  const receipt = path.join(output, (mode === "miniapp" ? "miniapp" : "cli") + "-source-" + sourceRevision + ".json");
  if (reuse && existsSync(receipt)) {
    const cached = JSON.parse(readFileSync(receipt, "utf8"));
    const source = requireInside(output, cached.source);
    requireInside(output, realpathSync(source));
    if (cached.sourceRevision !== sourceRevision || !existsSync(path.join(source, "scripts/s5-bwiki-runtime.mjs"))) {
      throw new Error("Cached CLI release source is incomplete; remove its receipt and retry");
    }
    return { sourceRevision, source };
  }
  const source = mkdtempSync(path.join(output, (mode === "pre" ? "preview" : mode) + "-source-" + sourceRevision + "-"));
  const archive = requireInside(output, source + ".tar");
  const gitOptions = { cwd: root };
  if (run("git", ["cat-file", "-e", sourceRevision + "^{commit}"], { ...gitOptions, allowFailure: true }) !== 0) {
    if (!allowFetch) throw new Error("Pinned CN source is missing locally; fetch origin " + sourceRevision + " before using CLI");
    run("git", ["fetch", "--depth=1", "--no-tags", "--no-write-fetch-head", "origin", sourceRevision], gitOptions);
    run("git", ["cat-file", "-e", sourceRevision + "^{commit}"], gitOptions);
  }
  run("git", ["archive", "--format=tar", "--output=" + archive, sourceRevision], gitOptions);
  run("tar", ["-xf", archive, "-C", source], gitOptions);
  const childModules = requireInside(source, path.join(source, "node_modules"));
  if (existsSync(childModules)) throw new Error("Pinned source unexpectedly includes node_modules");
  symlinkSync(modules, childModules, process.platform === "win32" ? "junction" : "dir");
  if (reuse) {
    // Readers must never observe an empty/partial receipt on parallel first runs.
    const pendingReceipt = source + ".receipt.tmp";
    writeFileSync(pendingReceipt, JSON.stringify({ sourceRevision, source }), "utf8");
    renameSync(pendingReceipt, receipt);
  }
  return { sourceRevision, source };
}

/** Build only a pinned Git archive; never copy a dirty checkout as preview source. */
export function buildPreviewSource({ root = ROOT, run = execute, mode = "pre" } = {}) {
  const { sourceRevision, source } = preparePreviewSource({ root, run, mode });
  const vite = path.join(realpathSync(root), "node_modules/vite/bin/vite.js");
  const childOptions = { cwd: source };
  run(process.execPath, [
    "scripts/runtime-snapshot.mjs", "data/snapshots/current.json",
    "public/data/runtime.json", "public/assets/spirits/manifest.json",
  ], childOptions);
  run(process.execPath, ["scripts/build-skill-query-data.mjs"], childOptions);
  const config = mode === "pre" ? "config/vite.preview.config.mjs" : "config/vite.cn.config.mjs";
  run(process.execPath, [vite, "build", "--config", config, "--mode", mode], childOptions);
  return { sourceRevision, source };
}

export function buildPreviewRelease({ root = ROOT, run = execute } = {}) {
  const { sourceRevision, source } = buildPreviewSource({ root, run });
  const target = copyPreviewRelease(root, source);
  console.log("Preview source " + sourceRevision + " assembled only at " + target);
  return { sourceRevision, source, target };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try { buildPreviewRelease(); }
  catch (error) {
    console.error("Preview release failed: " + error.message);
    process.exitCode = 1;
  }
}
