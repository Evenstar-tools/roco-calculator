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
    mirrorHash: "862900da5f0cdf265097d12e4b82ca9b0f49a06ccbced04d4957ee5f0030c57b",
    reason: "保留贪得无厌结算、吸血后自损顺序与物攻等级说明，并清理未使用变量",
  }),
  "src/domain/calculator-view-model.js": Object.freeze({
    mirrorHash: "660a9799630ee33b16dbaca5ad2277b40701f6870a9785fdf12816035b6a0076",
    reason: "同步迸发来源与重组印记的计算展示参数，并移除已下线的技能能耗覆盖展示字段",
  }),
  "src/domain/calculate.js": Object.freeze({
    mirrorHash: "61eca5ae03503afade6c7cb28010a6a11d7e7e6f7875ba663f8d4f460019b957",
    reason: "保留统一取整入口、有效技能威力向下取整、显示威力、实际攻防面板、听桥继承、虫群奉献、减压阀相邻结算与多维击打读取目标星陨印记补丁；计算核心已拆分为 skill-result 子模块，calculate.js 只保留 calculateMatchup 门面",
  }),
  "src/domain/clown-trick.js": Object.freeze({
    mirrorHash: "3f2bc2be7147963bd68a506481040c052cd83804b34a421b33e0c02294f878ec",
    reason: "保留下注先吸血后扣除自身生命的已验收结算顺序",
  }),
  "src/domain/damage.js": Object.freeze({
    mirrorHash: "eabf3f10a1b31c7f33e0172b2107b1988cc078b49e350363c41449f17847ab94",
    reason: "保留统一伤害取整策略、最终单段伤害与连击顺序",
  }),
  "src/domain/contract-shape.js": Object.freeze({
    mirrorHash: "04682363912d83aeb97c301c92e5db4d5128ff2104ad1a82ea89dbbd37fdff3a",
    reason: "保留契约的形状14种咕噜球效果对应关系与结算语义",
  }),
  "src/domain/marks.js": Object.freeze({
    mirrorHash: "48630f4ddc4d0a4e6d50f19ab02e3ecc11bccbde10369c8ea98972f6cf2db432",
    reason: "保留风起、星陨、蓄电与重组印记的最新读取语义",
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
    mirrorHash: "0077a7d235e1abdd7db6756aa2885436b012707d0c2ee842a22c66b39880195e",
    reason: "保留迸发联动、虫群奉献、体重挡位、啃咬与飞断最新技能输入语义；虫鸣输入直接驱动连击数，最少为1且不设业务上限，并接受连击增益",
  }),
  "src/domain/skill-result/calculate-skill-result.js": Object.freeze({
    mirrorHash: "c06b283728b49ad6b48d7f88eed7ac2fff41f878fb8403c1b62024469c18d6d4",
    reason: "同步虫鸣连击、迸发来源、星陨与重组额外伤害，并补齐重组独立伤害字段、结算备注与公式明细",
  }),
  "src/domain/skill-result/results.js": Object.freeze({
    mirrorHash: "466a2c86624706ce3b8260b4a5f7e94719a45648ef75acc1c0b6d4d5fa23c828",
    reason: "合并连续技能结果时保留重组追加伤害，确保总伤害明细可核对",
  }),
  "src/domain/skill-result/starfall.js": Object.freeze({
    mirrorHash: "9c852d3d8bfc78f3a8817833a68302de1267145df5b0b608fc6c6a7c7067bf7c",
    reason: "统一星陨与重组额外伤害的显示威力和实际威力取整",
  }),
  "src/domain/skill-rules.js": Object.freeze({
    mirrorHash: "8c010ba2d2d7346de3f167c9296a9415f15f7062bc68df9086d1799007347eda",
    reason: "保留显示威力覆盖、虫群奉献、体重挡位与最终伤害倍率规则语义",
  }),
  "src/domain/skill-status-effects.js": Object.freeze({
    mirrorHash: "0c78c22eb8e58a26b715dfe98ae81a1d6ff3824d24a6fa2f267a6eeeaac14359",
    reason: "保留状态技能重复触发，并补齐重组普通与应对防御两档状态写入",
  }),
  "src/domain/trait-effects.js": Object.freeze({
    mirrorHash: "26fa87354f6bd6727d1a5e2f84236b4d9ae0b9445df5d04b06b234e8a6fb5aeb",
    reason: "保留迸发默认开启、特性层数上限与最新特性输入语义；全神贯注未行动时物攻加成 100%，每次行动衰减 20%",
  }),
  "src/state/calculator-session.js": Object.freeze({
    mirrorHash: "9bf74823d3e66ad826f0a82f8cdcd5b0a60e40ad9ec5b785283ffeefed71a6e0",
    reason: "保留威力输入状态管理并停止延续已下线的技能能耗覆盖；按技能记忆状态触发次数，能力等级公式引用 domain/skill-result/numeric.js 单一权威",
  }),
  "src/state/battle-activation.js": Object.freeze({
    mirrorHash: "c045d4efac5a74e21af98612f111883712b0bc67981d1cb240f24d1922634662",
    reason: "保留既有战斗结算，并支持重组倍率状态直接替换而非重复累加；槽增益缺省为空映射，保证状态触发可分享",
  }),
  "src/state/reducer.js": Object.freeze({
    mirrorHash: "134b98a11bfe71961af92aa4919017e3105f1bd14dd25ce56698a937d19796c1",
    reason: "允许按技能保存和清除可选的状态触发次数",
  }),
  "src/state/spirit-configs.js": Object.freeze({
    mirrorHash: "21265aee8a7bf7ef5fd8c2fae58993c978490171c18c071197936097e511a24a",
    reason: "统一写入配额降级与损坏备份处理",
  }),
  "src/state/storage-namespace.js": Object.freeze({
    mirrorHash: "af92e9c51a67b8f29b58265df312eb4133fbe3e7f52fdc065667f9779cf13e8a",
    reason: "新增 trySetItem 与损坏备份工具，统一存储配额降级",
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

export function runCoreDriftCheck({
  allowedReleasePatches = DECLARED_RELEASE_PATCHES,
  currentOnly = false,
  manifest,
  repositoryRoot = process.cwd(),
} = {}) {
  assertCoreMatches({ manifest, repositoryRoot });
  if (currentOnly) return { releaseRef: null };

  const releaseRef = declaredReleaseRef(repositoryRoot);
  assertReleaseCoreMatches({
    allowedReleasePatches,
    manifest,
    releaseRef,
    repositoryRoot,
  });
  return { releaseRef };
}

const scriptPath = fileURLToPath(import.meta.url);

if (process.argv[1] && path.resolve(process.argv[1]) === scriptPath) {
  try {
    const repositoryRoot = path.resolve(path.dirname(scriptPath), "../..");
    const args = process.argv.slice(2);
    const unknownArgs = args.filter((argument) => argument !== "--current-only");
    if (unknownArgs.length > 0) {
      throw new Error(`Unknown arguments: ${unknownArgs.join(", ")}`);
    }
    const { releaseRef } = runCoreDriftCheck({
      currentOnly: args.includes("--current-only"),
      repositoryRoot,
    });
    process.stdout.write(
      releaseRef
        ? `Shared core matches working tree, index, HEAD, and ${releaseRef}.\n`
        : "Shared core matches working tree, index, and HEAD.\n",
    );
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}
