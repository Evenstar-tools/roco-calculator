import { execFileSync } from "node:child_process";
import {
  existsSync,
  readFileSync,
  readdirSync,
} from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  getManifestCoverage,
  mirrorPathFor,
  normalizeManifest,
  parseManifestSource,
  SHARED_SOURCE_MANIFEST_PATH,
} from "./shared-source-manifest.mjs";

const VALID_SCOPES = new Set(["working-tree", "index", "HEAD"]);

function hash(content) {
  return createHash("sha256").update(content).digest("hex");
}

function git(repositoryRoot, args) {
  return execFileSync("git", args, {
    cwd: repositoryRoot,
    stdio: ["ignore", "pipe", "pipe"],
  });
}

function readAtScope(repositoryRoot, scope, relativePath) {
  if (scope === "working-tree") {
    const absolutePath = path.join(repositoryRoot, relativePath);
    return existsSync(absolutePath) ? readFileSync(absolutePath) : null;
  }
  try {
    return git(repositoryRoot, [
      "show",
      scope === "index" ? `:${relativePath}` : `HEAD:${relativePath}`,
    ]);
  } catch {
    return null;
  }
}

function listFilesRecursively(root, relative = "") {
  const absolute = path.join(root, relative);
  if (!existsSync(absolute)) return [];
  return readdirSync(absolute, { withFileTypes: true }).flatMap((entry) => {
    const child = path.posix.join(relative.replaceAll("\\", "/"), entry.name);
    return entry.isDirectory()
      ? listFilesRecursively(root, child)
      : [child];
  });
}

function listMirrors(repositoryRoot, scope) {
  const roots = [
    "miniapp/src/shared/domain",
    "miniapp/src/shared/state",
  ];
  if (scope === "working-tree") {
    return roots
      .flatMap((root) =>
        listFilesRecursively(path.join(repositoryRoot, root)).map(
          (relativePath) => path.posix.join(root, relativePath),
        ),
      )
      .sort();
  }
  const output = scope === "index"
    ? git(repositoryRoot, ["ls-files", "-z", "--", ...roots])
    : git(repositoryRoot, [
        "ls-tree",
        "-r",
        "-z",
        "--name-only",
        "HEAD",
        "--",
        ...roots,
      ]);
  return output.toString("utf8").split("\0").filter(Boolean).sort();
}

function listDomainSources(repositoryRoot, scope) {
  const root = "src/domain";
  if (scope === "working-tree") {
    return listFilesRecursively(path.join(repositoryRoot, root))
      .filter((relativePath) => relativePath.endsWith(".js"))
      .map((relativePath) => path.posix.join(root, relativePath))
      .sort();
  }
  const output = scope === "index"
    ? git(repositoryRoot, ["ls-files", "-z", "--", root])
    : git(repositoryRoot, [
        "ls-tree",
        "-r",
        "-z",
        "--name-only",
        "HEAD",
        "--",
        root,
      ]);
  return output
    .toString("utf8")
    .split("\0")
    .filter((sourcePath) => sourcePath.endsWith(".js"))
    .sort();
}

function manifestAtScope(repositoryRoot, scope, manifestOverride) {
  if (manifestOverride) {
    return { drift: [], manifest: normalizeManifest(manifestOverride) };
  }
  const source = readAtScope(
    repositoryRoot,
    scope,
    SHARED_SOURCE_MANIFEST_PATH,
  );
  if (source === null) {
    return {
      drift: [{
        scope,
        sourcePath: SHARED_SOURCE_MANIFEST_PATH,
        type: "missing-manifest",
      }],
      manifest: null,
    };
  }
  try {
    return {
      drift: [],
      manifest: parseManifestSource(source.toString("utf8")),
    };
  } catch (error) {
    return {
      drift: [{
        message: error.message,
        scope,
        sourcePath: SHARED_SOURCE_MANIFEST_PATH,
        type: "invalid-manifest",
      }],
      manifest: null,
    };
  }
}

function coverageDrift(repositoryRoot, scope, manifest) {
  const coverage = getManifestCoverage({
    actualDomain: listDomainSources(repositoryRoot, scope),
    hasSource: (sourcePath) =>
      readAtScope(repositoryRoot, scope, sourcePath) !== null,
    manifest,
    repositoryRoot,
  });
  return [
    ...coverage.duplicates.map((sourcePath) => ({
      scope,
      sourcePath,
      type: "duplicate-classification",
    })),
    ...coverage.unclassified.map((sourcePath) => ({
      scope,
      sourcePath,
      type: "unclassified-source",
    })),
    ...coverage.missing.map((sourcePath) => ({
      scope,
      sourcePath,
      type: "missing-classified-source",
    })),
  ];
}

export function getCoreDrift({
  manifest,
  repositoryRoot = process.cwd(),
  scopes = ["working-tree", "index", "HEAD"],
} = {}) {
  const drift = [];

  for (const scope of scopes) {
    if (!VALID_SCOPES.has(scope)) {
      throw new Error(`Unknown drift scope: ${scope}`);
    }
    const scoped = manifestAtScope(repositoryRoot, scope, manifest);
    drift.push(...scoped.drift);
    if (!scoped.manifest) continue;
    const expectedMirrors = new Map(
      scoped.manifest.shared.map((sourcePath) => [
        mirrorPathFor(sourcePath),
        sourcePath,
      ]),
    );
    drift.push(...coverageDrift(repositoryRoot, scope, scoped.manifest));
    const actualMirrors = listMirrors(repositoryRoot, scope);
    for (const mirrorPath of actualMirrors) {
      if (!expectedMirrors.has(mirrorPath)) {
        drift.push({ mirrorPath, scope, type: "extra-mirror" });
      }
    }
    for (const [mirrorPath, sourcePath] of expectedMirrors) {
      const source = readAtScope(repositoryRoot, scope, sourcePath);
      const mirror = readAtScope(repositoryRoot, scope, mirrorPath);
      if (source === null) {
        drift.push({ mirrorPath, scope, sourcePath, type: "missing-source" });
      }
      if (mirror === null) {
        drift.push({ mirrorPath, scope, sourcePath, type: "missing-mirror" });
      }
      if (source !== null && mirror !== null && !source.equals(mirror)) {
        drift.push({
          mirrorHash: hash(mirror),
          mirrorPath,
          scope,
          sourceHash: hash(source),
          sourcePath,
          type: "content-mismatch",
        });
      }
    }
  }

  return drift;
}

export function assertCoreMatches(options) {
  const drift = getCoreDrift(options);
  if (drift.length > 0) {
    const details = drift.map((entry) => {
      const paths = [entry.sourcePath, entry.mirrorPath]
        .filter(Boolean)
        .join(" -> ");
      const hashes = entry.sourceHash
        ? ` (${entry.sourceHash} != ${entry.mirrorHash})`
        : "";
      return `[${entry.scope}] ${entry.type}: ${paths}${hashes}`;
    });
    throw new Error(`Shared core drift detected:\n${details.join("\n")}`);
  }
}

const scriptPath = fileURLToPath(import.meta.url);

if (process.argv[1] && path.resolve(process.argv[1]) === scriptPath) {
  try {
    assertCoreMatches({ repositoryRoot: path.resolve(path.dirname(scriptPath), "../..") });
    process.stdout.write("Shared core matches in working tree, index, and HEAD.\n");
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}
