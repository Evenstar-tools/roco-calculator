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
const DECLARED_RELEASE_PATCHES = Object.freeze({
  "src/domain/baron-greed.js": Object.freeze({
    mirrorHash: "27db5f973104a9e7e3423b5d925d30d9d3ce4f2adb2e8daf59091fdbf60e2452",
    reason: "保留贪得无厌结算、吸血后自损顺序与物攻等级说明",
  }),
  "src/domain/calculate.js": Object.freeze({
    mirrorHash: "17679b3424fd698093dcb7cb409f3f477f3db4a121176dc9212af6004156b079",
    reason: "保留显示威力、实际攻防面板、听桥继承、虫群奉献与减压阀相邻结算补丁",
  }),
  "src/domain/clown-trick.js": Object.freeze({
    mirrorHash: "3f2bc2be7147963bd68a506481040c052cd83804b34a421b33e0c02294f878ec",
    reason: "保留下注先吸血后扣除自身生命的已验收结算顺序",
  }),
  "src/domain/contract-shape.js": Object.freeze({
    mirrorHash: "04682363912d83aeb97c301c92e5db4d5128ff2104ad1a82ea89dbbd37fdff3a",
    reason: "保留契约的形状14种咕噜球效果对应关系与结算语义",
  }),
  "src/domain/marks.js": Object.freeze({
    mirrorHash: "7ae356e5f9623674c6834494843e36781c932145b1ddddf24dd4146347545e99",
    reason: "保留风起印记的已验收威力结算补丁",
  }),
  "src/domain/negative-status-rules.js": Object.freeze({
    mirrorHash: "ac5f192d99c5c7ab5a79844c250081beac67900924522365b942474d09678660",
    reason: "保留虫群中毒奉献结算补丁",
  }),
  "src/domain/power-override.js": Object.freeze({
    mirrorHash: "61baf83aa3f8acafd8218de495c6cee2ae8e46695c1e113700d1a55f2c01810a",
    reason: "保留 v1.5.7 后已验收的威力覆盖语义",
  }),
  "src/domain/skill-effects.js": Object.freeze({
    mirrorHash: "705b42e8dc2e7f9a8d079915ace11daa1f37139eb139bbad868a00a334c10f70",
    reason: "保留迸发联动、虫群奉献、体重挡位、啃咬与飞断最新技能输入语义",
  }),
  "src/domain/skill-rules.js": Object.freeze({
    mirrorHash: "36a2a2e92b41fbbf44343f9939c1aa362f00b1fc5809f622cc89dc2dcef0b4b8",
    reason: "保留显示威力覆盖、虫群奉献、体重挡位与最终伤害倍率规则语义",
  }),
  "src/domain/skill-status-effects.js": Object.freeze({
    mirrorHash: "692be3b976e05cf4fd544bb74b5956770d75ea98e130b77199678aec442d889d",
    reason: "保留减压阀已使用次数输入与状态技能适配语义",
  }),
  "src/domain/trait-effects.js": Object.freeze({
    mirrorHash: "e1ef3d9481dd183d7c2b1b24d85444636cba5eda1da99697306f340cebee7211",
    reason: "保留迸发默认开启、特性层数上限与最新特性输入语义",
  }),
  "src/state/calculator-session.js": Object.freeze({
    mirrorHash: "b297cccc2e1761d43ec6bf0d0f77873d4b44c389ec010ebe1dfb93fc4766e696",
    reason: "保留 v1.5.7 后已验收的威力输入状态管理",
  }),
  "src/state/battle-activation.js": Object.freeze({
    mirrorHash: "99bd26b9e5437fddca002b50a2bc354db0fb41d4c6c9bc5f8e8d35b6df9e0ef2",
    reason: "保留贪得无厌加攻与自身最终生命同步写回",
  }),
});

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

function readAtRef(repositoryRoot, reference, relativePath) {
  try {
    return git(repositoryRoot, ["show", `${reference}:${relativePath}`]);
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

function manifestAtRef(repositoryRoot, releaseRef, manifestOverride) {
  if (manifestOverride) {
    return { drift: [], manifest: normalizeManifest(manifestOverride) };
  }
  const source = readAtRef(
    repositoryRoot,
    releaseRef,
    SHARED_SOURCE_MANIFEST_PATH,
  );
  if (source === null) {
    return {
      drift: [{
        releaseRef,
        sourcePath: SHARED_SOURCE_MANIFEST_PATH,
        type: "missing-release-manifest",
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
        releaseRef,
        sourcePath: SHARED_SOURCE_MANIFEST_PATH,
        type: "invalid-release-manifest",
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

export function getReleaseCoreDrift({
  allowedReleasePatches = {},
  manifest,
  mirrorScope = "working-tree",
  releaseRef,
  repositoryRoot = process.cwd(),
} = {}) {
  if (!releaseRef) {
    throw new Error("releaseRef is required");
  }
  if (!VALID_SCOPES.has(mirrorScope)) {
    throw new Error(`Unknown mirror scope: ${mirrorScope}`);
  }
  const scoped = manifestAtRef(repositoryRoot, releaseRef, manifest);
  const drift = [...scoped.drift];
  if (!scoped.manifest) return drift;

  for (const sourcePath of scoped.manifest.shared) {
    const mirrorPath = mirrorPathFor(sourcePath);
    const releaseSource = readAtRef(repositoryRoot, releaseRef, sourcePath);
    const mirror = readAtScope(repositoryRoot, mirrorScope, mirrorPath);
    if (releaseSource === null) {
      drift.push({
        mirrorPath,
        releaseRef,
        sourcePath,
        type: "missing-release-source",
      });
      continue;
    }
    if (mirror === null) {
      drift.push({
        mirrorPath,
        releaseRef,
        sourcePath,
        type: "missing-mirror",
      });
      continue;
    }
    if (!releaseSource.equals(mirror)) {
      const mirrorHash = hash(mirror);
      const allowedPatch = allowedReleasePatches[sourcePath];
      if (allowedPatch?.mirrorHash === mirrorHash) continue;
      drift.push({
        mirrorHash,
        mirrorPath,
        releaseRef,
        sourceHash: hash(releaseSource),
        sourcePath,
        type: "release-content-mismatch",
      });
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

export function assertReleaseCoreMatches(options) {
  const drift = getReleaseCoreDrift(options);
  if (drift.length > 0) {
    const details = drift.map((entry) => {
      const paths = [entry.sourcePath, entry.mirrorPath]
        .filter(Boolean)
        .join(" -> ");
      const hashes = entry.sourceHash
        ? ` (${entry.sourceHash} != ${entry.mirrorHash})`
        : "";
      return `[${entry.releaseRef}] ${entry.type}: ${paths}${hashes}`;
    });
    throw new Error(`Declared release core drift detected:\n${details.join("\n")}`);
  }
}

function declaredReleaseRef(repositoryRoot) {
  const versionSource = readFileSync(
    path.join(repositoryRoot, "miniapp/src/version.js"),
    "utf8",
  );
  const match = versionSource.match(
    /export const WEB_CORE_VERSION = ["']([^"']+)["'];/u,
  );
  if (!match) {
    throw new Error("WEB_CORE_VERSION is missing from miniapp/src/version.js");
  }
  return `v${match[1]}`;
}

const scriptPath = fileURLToPath(import.meta.url);

if (process.argv[1] && path.resolve(process.argv[1]) === scriptPath) {
  try {
    const repositoryRoot = path.resolve(path.dirname(scriptPath), "../..");
    const releaseRef = declaredReleaseRef(repositoryRoot);
    assertCoreMatches({ repositoryRoot });
    assertReleaseCoreMatches({
      allowedReleasePatches: DECLARED_RELEASE_PATCHES,
      releaseRef,
      repositoryRoot,
    });
    process.stdout.write(
      `Shared core matches working tree, index, HEAD, and ${releaseRef}.\n`,
    );
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}
