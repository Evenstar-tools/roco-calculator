import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parse } from "@babel/parser";
import traverseModule from "@babel/traverse";
import { load as loadMarkup } from "cheerio";
import releaseConfig from "./release-config.cjs";

const { loadReleaseConfig, preflightErrors, verifyPreflight } = releaseConfig;
const traverse = traverseModule.default ?? traverseModule;

const EXPECTED_MINIAPP_VERSION = "0.2.3";
const EXPECTED_ROOT_VERSION = "1.6.1";
const MAX_MAIN_PACKAGE_BYTES = 2 * 1024 * 1024;
const REQUIRED_DIST_FILES = [
  "app.json",
  "pages/index/index.js",
  "project.config.json",
];
const TEXT_EXTENSIONS = new Set([
  ".bat",
  ".cmd",
  ".css",
  ".cjs",
  ".html",
  ".js",
  ".json",
  ".jsx",
  ".mjs",
  ".ps1",
  ".sh",
  ".ts",
  ".tsx",
  ".wxml",
  ".wxs",
  ".wxss",
  ".yaml",
  ".yml",
]);

const SECRET_PATTERNS = [
  /\bappSecret\b["'`]?\s*[:=]\s*(?:["'`][^"'`\r\n]+["'`]|[^\s,;}]+)/iu,
  /\bsecretKey\b["'`]?\s*[:=]\s*(?:["'`][^"'`\r\n]+["'`]|[^\s,;}]+)/iu,
  /\bprivateKey\b["'`]?\s*[:=]\s*(?:["'`][^"'`\r\n]+["'`]|[^\s,;}]+)/iu,
  /\bopenid\b["'`]?\s*[:=]\s*["'`][^"'`\r\n]+["'`]/iu,
];

const FORBIDDEN_API_PATTERNS = [
  /\b(?:Taro|wx)\s*\.\s*login\s*\(/u,
  /\b(?:Taro|wx)\s*\.\s*getUserInfo\s*\(/u,
  /\b(?:Taro|wx)\s*\.\s*getUserProfile\s*\(/u,
  /\b(?:Taro|wx)\s*\.\s*getPhoneNumber\s*\(/u,
  /\b(?:Taro|wx)\s*\.\s*requestPayment\s*\(/u,
  /\b(?:Taro|wx)\s*\.\s*(?:createBannerAd|createInterstitialAd|createRewardedVideoAd)\s*\(/u,
  /\b(?:Taro|wx)\s*\.\s*(?:getLocation|chooseLocation|openLocation|startLocationUpdate|startLocationUpdateBackground)\s*\(/u,
  /\b(?:Taro|wx)\s*\.\s*(?:addPhoneContact|chooseContact)\s*\(/u,
  /\b(?:Taro|wx)\s*\.\s*(?:chooseImage|chooseMedia|chooseVideo|saveImageToPhotosAlbum)\s*\(/u,
  /\b(?:Taro|wx)\s*\.\s*(?:createCameraContext|getRecorderManager)\s*\(/u,
  /\b(?:Taro|wx)\s*\.\s*uploadFile\s*\(/u,
];

const RELEASE_AUTOMATION_PATTERNS = [
  /\bminiprogram-ci\b/iu,
  /\b(?:ci|project)\s*\.\s*(?:upload|preview)\s*\(/iu,
  /\b(?:taro|wechat|weapp)\s+(?:upload|preview|publish)\b/iu,
];
const FORBIDDEN_API_NAMES = new Set([
  "addPhoneContact",
  "chooseContact",
  "chooseImage",
  "chooseLocation",
  "chooseMedia",
  "chooseVideo",
  "createBannerAd",
  "createCameraContext",
  "createInterstitialAd",
  "createRewardedVideoAd",
  "getLocation",
  "getPhoneNumber",
  "getRecorderManager",
  "getUserInfo",
  "getUserProfile",
  "login",
  "openLocation",
  "requestPayment",
  "saveImageToPhotosAlbum",
  "startLocationUpdate",
  "startLocationUpdateBackground",
  "uploadFile",
]);
const SECRET_NAMES = new Set([
  "appsecret",
  "openid",
  "privatekey",
  "secretkey",
]);
const JAVASCRIPT_EXTENSIONS = new Set([
  ".cjs",
  ".js",
  ".jsx",
  ".mjs",
  ".ts",
  ".tsx",
  ".wxs",
]);

function normalizedString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function validateConfiguration(release, errors) {
  const appId = normalizedString(release.appId);
  errors.push(...preflightErrors(release));
  if (normalizedString(release.distAppId) !== appId) {
    errors.push("产物 AppID 与生产私有配置 AppID 不一致");
  }
}

function validateVersions(release, errors) {
  if (release.miniappVersion !== EXPECTED_MINIAPP_VERSION) {
    errors.push(`小程序版本必须为 ${EXPECTED_MINIAPP_VERSION}`);
  }
  if (release.rootVersion !== EXPECTED_ROOT_VERSION) {
    errors.push(`网页核心版本必须为 ${EXPECTED_ROOT_VERSION}`);
  }
}

function validateArtifacts(release, errors) {
  const distFiles = new Set(
    Array.isArray(release.distFiles)
      ? release.distFiles.map((file) => String(file).replaceAll("\\", "/"))
      : [],
  );
  const missingFiles = REQUIRED_DIST_FILES.filter((file) => !distFiles.has(file));
  if (missingFiles.length > 0) {
    errors.push(`生产产物缺失: ${missingFiles.join(", ")}`);
  }

  if (
    !Number.isFinite(release.mainPackageBytes)
    || release.mainPackageBytes < 0
    || release.mainPackageBytes > MAX_MAIN_PACKAGE_BYTES
  ) {
    errors.push(
      `主包包体必须不超过 2 MiB，当前 ${String(release.mainPackageBytes)} 字节`,
    );
  }

  if (release.artifactEvidence) {
    const evidence = release.artifactEvidence;
    if (
      evidence.fileCount !== distFiles.size
      || evidence.totalBytes !== release.mainPackageBytes
      || !/^[a-f0-9]{64}$/u.test(evidence.manifestSha256 ?? "")
    ) errors.push("产物证据无法复算当前文件数量、包体或 manifest SHA256");
  }
}

export function createArtifactEvidence(files) {
  const rows = files.map((file) => {
    const content = Buffer.isBuffer(file.content)
      ? file.content
      : Buffer.from(file.content ?? "");
    return {
      bytes: content.length,
      path: String(file.path).replaceAll("\\", "/"),
      sha256: createHash("sha256").update(content).digest("hex"),
    };
  }).sort((left, right) => left.path.localeCompare(right.path));
  const manifest = rows.map((row) => (
    `${row.path}\t${row.bytes}\t${row.sha256}`
  )).join("\n");
  return {
    fileCount: rows.length,
    manifestSha256: createHash("sha256").update(manifest).digest("hex"),
    totalBytes: rows.reduce((total, row) => total + row.bytes, 0),
  };
}

function unwrapExpression(node) {
  let current = node;
  while ([
    "ChainExpression",
    "TSAsExpression",
    "TSNonNullExpression",
    "TypeCastExpression",
  ].includes(current?.type)) {
    current = current.expression;
  }
  return current;
}

const UNKNOWN_STATIC_VALUE = Symbol("unknown-static-value");

function staticValue(node, scope, seen = new Set()) {
  const current = unwrapExpression(node);
  if (!current) return UNKNOWN_STATIC_VALUE;
  if (current.type === "StringLiteral") return current.value;
  if (current.type === "NumericLiteral" || current.type === "BooleanLiteral") {
    return current.value;
  }
  if (current.type === "NullLiteral") return null;
  if (current.type === "TemplateLiteral") {
    let value = "";
    for (let index = 0; index < current.quasis.length; index += 1) {
      value += current.quasis[index]?.value?.cooked
        ?? current.quasis[index]?.value?.raw
        ?? "";
      if (index >= current.expressions.length) continue;
      const expression = staticValue(current.expressions[index], scope, seen);
      if (expression === UNKNOWN_STATIC_VALUE) return UNKNOWN_STATIC_VALUE;
      value += String(expression);
    }
    return value;
  }
  if (current.type === "BinaryExpression" && current.operator === "+") {
    const left = staticValue(current.left, scope, seen);
    const right = staticValue(current.right, scope, seen);
    return left === UNKNOWN_STATIC_VALUE || right === UNKNOWN_STATIC_VALUE
      ? UNKNOWN_STATIC_VALUE
      : left + right;
  }
  if (current.type === "Identifier") {
    const binding = scope?.getBinding(current.name);
    if (current.name === "undefined" && !binding) return undefined;
    if (!binding || seen.has(binding) || !binding.path.isVariableDeclarator()) {
      return UNKNOWN_STATIC_VALUE;
    }
    const nextSeen = new Set(seen);
    nextSeen.add(binding);
    return staticValue(binding.path.node.init, binding.path.scope, nextSeen);
  }
  return UNKNOWN_STATIC_VALUE;
}

function staticString(node, scope, seen = new Set()) {
  const value = staticValue(node, scope, seen);
  return value !== UNKNOWN_STATIC_VALUE && typeof value === "string"
    ? value
    : undefined;
}

function memberName(node, scope) {
  const current = unwrapExpression(node);
  if (!current) return undefined;
  if (!current.computed && current.property?.type === "Identifier") {
    return current.property.name;
  }
  return staticString(current.property, scope);
}

function requireSource(node, scope) {
  const current = unwrapExpression(node);
  if (
    !current
    || current.type !== "CallExpression"
    || current.callee?.type !== "Identifier"
    || current.callee.name !== "require"
    || scope?.getBinding("require")
  ) return undefined;
  return staticString(current.arguments[0], scope);
}

function resolveOrigin(node, scope, seen = new Set()) {
  const current = unwrapExpression(node);
  if (!current) return undefined;
  if (current.type === "Identifier") {
    if (current.name === "wx" || current.name === "Taro") {
      return { kind: "wechat" };
    }
    const binding = scope?.getBinding(current.name);
    if (!binding || seen.has(binding)) return undefined;
    const nextSeen = new Set(seen);
    nextSeen.add(binding);
    if (
      (binding.path.isImportDefaultSpecifier()
        || binding.path.isImportNamespaceSpecifier()
        || binding.path.isImportSpecifier())
      && binding.path.parentPath?.isImportDeclaration()
      && binding.path.parentPath.node.source.value === "miniprogram-ci"
    ) return { kind: "release" };
    if (!binding.path.isVariableDeclarator()) return undefined;
    if (binding.path.node.id?.type === "Identifier") {
      const origin = resolveOrigin(
        binding.path.node.init,
        binding.path.scope,
        nextSeen,
      );
      return origin;
    }
    if (binding.path.node.id?.type !== "ObjectPattern") return undefined;
    const property = binding.path.node.id.properties.find((candidate) => (
      candidate.type === "ObjectProperty"
      && candidate.value?.type === "Identifier"
      && candidate.value.name === current.name
    ));
    if (!property) return undefined;
    const origin = resolveOrigin(
      binding.path.node.init,
      binding.path.scope,
      nextSeen,
    );
    const member = property.computed
      ? staticString(property.key, binding.path.scope)
      : property.key?.name ?? property.key?.value;
    return origin && member ? { ...origin, member } : undefined;
  }
  if (requireSource(current, scope) === "miniprogram-ci") {
    return { kind: "release" };
  }
  if (
    current.type === "MemberExpression"
    || current.type === "OptionalMemberExpression"
  ) {
    const origin = resolveOrigin(
      current.object,
      scope,
      seen,
    );
    const member = memberName(current, scope);
    return origin && member ? { ...origin, member } : undefined;
  }
  return undefined;
}

function normalizedSecretName(value) {
  return typeof value === "string"
    ? value.replaceAll(/[_-]/gu, "").toLowerCase()
    : "";
}

function isFixedValue(node, scope) {
  const value = staticValue(node, scope);
  if (value === UNKNOWN_STATIC_VALUE || value === null || value === undefined) {
    return false;
  }
  if (typeof value === "string") return value.length > 0;
  return typeof value === "boolean" || typeof value === "number";
}

function scanJavaScript(text) {
  const findings = { api: false, parse: false, release: false, secret: false };
  let ast;
  try {
    ast = parse(text, {
      allowAwaitOutsideFunction: true,
      allowReturnOutsideFunction: true,
      plugins: ["decorators-legacy", "jsx", "typescript"],
      sourceType: "unambiguous",
    });
  } catch {
    findings.parse = true;
    return findings;
  }

  traverse(ast, {
    enter(nodePath) {
      const { node, scope } = nodePath;
      if (
        node.type === "ImportDeclaration"
        && node.source?.value === "miniprogram-ci"
      ) {
        findings.release = true;
      }
      if (
        (node.type === "CallExpression" || node.type === "OptionalCallExpression")
        && requireSource(node, scope) === "miniprogram-ci"
      ) findings.release = true;

      if (node.type === "CallExpression" || node.type === "OptionalCallExpression") {
        const directCallee = unwrapExpression(node.callee);
        if (
          (directCallee?.type === "MemberExpression"
            || directCallee?.type === "OptionalMemberExpression")
          && directCallee.object?.type === "Identifier"
          && ["ci", "project"].includes(directCallee.object.name)
          && ["preview", "upload"].includes(memberName(directCallee, scope))
        ) findings.release = true;

        const callee = resolveOrigin(node.callee, scope);
        if (callee?.kind === "wechat" && FORBIDDEN_API_NAMES.has(callee.member)) {
          findings.api = true;
        }
        if (
          callee?.kind === "release"
          && (!callee.member || ["preview", "upload"].includes(callee.member))
        ) findings.release = true;
      }

      if (node.type === "VariableDeclarator" && node.id?.type === "Identifier") {
        if (
          SECRET_NAMES.has(normalizedSecretName(node.id.name))
          && isFixedValue(node.init, scope)
        ) findings.secret = true;
      }
      if (node.type === "ObjectProperty") {
        const key = node.computed
          ? staticString(node.key, scope)
          : node.key?.name ?? node.key?.value;
        if (
          SECRET_NAMES.has(normalizedSecretName(key))
          && isFixedValue(node.value, scope)
        ) findings.secret = true;
      }
      if (node.type === "AssignmentExpression") {
        const left = unwrapExpression(node.left);
        const key = left?.type === "Identifier"
          ? left.name
          : memberName(left, scope);
        if (
          SECRET_NAMES.has(normalizedSecretName(key))
          && isFixedValue(node.right, scope)
        ) findings.secret = true;
      }
      if (
        node.type === "LabeledStatement"
        && SECRET_NAMES.has(normalizedSecretName(node.label?.name))
        && node.body?.type === "ExpressionStatement"
        && isFixedValue(node.body.expression, scope)
      ) findings.secret = true;
    },
  });
  return findings;
}

function scanJson(value, findings, key = "") {
  if (SECRET_NAMES.has(normalizedSecretName(key)) && typeof value === "string" && value) {
    findings.secret = true;
  }
  if (Array.isArray(value)) {
    for (const entry of value) scanJson(entry, findings);
  } else if (value && typeof value === "object") {
    for (const [childKey, childValue] of Object.entries(value)) {
      scanJson(childValue, findings, childKey);
    }
  }
}

function scanMarkup(text, findings) {
  const document = loadMarkup(text, { xmlMode: true });
  document("*").each((_index, element) => {
    for (const [name, value] of Object.entries(element.attribs ?? {})) {
      if (
        name.replaceAll("-", "").toLowerCase() === "opentype"
        && ["getphonenumber", "getuserinfo"].includes(value.toLowerCase())
      ) findings.api = true;
    }
  });
}

function scanSourceFile(file) {
  const text = typeof file?.text === "string" ? file.text : "";
  const extension = path.extname(file?.path ?? "").toLowerCase();
  const isJavaScript = JAVASCRIPT_EXTENSIONS.has(extension);
  const findings = { api: false, parse: false, release: false, secret: false };

  if (isJavaScript) {
    Object.assign(findings, scanJavaScript(text));
  } else if (extension === ".json") {
    try {
      scanJson(JSON.parse(text), findings);
    } catch {
      findings.parse = true;
    }
  } else if (extension === ".wxml" || extension === ".html") {
    scanMarkup(text, findings);
  }

  if (
    !isJavaScript
    && SECRET_PATTERNS.some((pattern) => pattern.test(text))
  ) findings.secret = true;
  if (
    !isJavaScript
    && FORBIDDEN_API_PATTERNS.some((pattern) => pattern.test(text))
  ) findings.api = true;
  if (
    !isJavaScript
    && RELEASE_AUTOMATION_PATTERNS.some((pattern) => pattern.test(text))
  ) {
    findings.release = true;
  }
  return findings;
}

function validateSource(release, errors) {
  const sourceFiles = Array.isArray(release?.sourceFiles)
    ? release.sourceFiles
    : [{ path: "inline.js", text: release?.sourceText ?? "" }];
  const findings = sourceFiles.map(scanSourceFile);
  if (findings.some((finding) => finding.secret)) {
    errors.push("源码或产物包含 AppSecret、密钥、私钥或固定 openid 等秘密");
  }
  if (findings.some((finding) => finding.api)) {
    errors.push("源码或产物引用登录、支付、隐私权限或文件上传等禁用 API");
  }
  if (findings.some((finding) => finding.release)) {
    errors.push("源码或脚本包含自动上传、预览或发布能力");
  }
  if (findings.some((finding) => finding.parse)) {
    errors.push("源码或产物存在无法解析并安全扫描的文本文件");
  }
}

export function verifyRelease(release) {
  const errors = [];
  validateConfiguration(release ?? {}, errors);
  validateVersions(release ?? {}, errors);
  validateArtifacts(release ?? {}, errors);
  validateSource(release, errors);

  if (errors.length > 0) {
    throw new Error(`小程序生产发布门禁失败:\n- ${errors.join("\n- ")}`);
  }
  return true;
}

function walkFiles(directory) {
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory, { withFileTypes: true })
    .flatMap((entry) => {
      const absolutePath = path.join(directory, entry.name);
      return entry.isDirectory() ? walkFiles(absolutePath) : [absolutePath];
    });
}

function relativeFileList(directory, files) {
  return files.map((file) => path.relative(directory, file).replaceAll("\\", "/"));
}

function readTextFiles(files, repositoryRoot) {
  return files
    .filter((file) => TEXT_EXTENSIONS.has(path.extname(file).toLowerCase()))
    .map((file) => ({
      path: path.relative(repositoryRoot, file).replaceAll("\\", "/"),
      text: fs.readFileSync(file, "utf8"),
    }));
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function loadReleaseInput(repositoryRoot) {
  const miniappRoot = path.join(repositoryRoot, "miniapp");
  const localConfigFile = path.join(miniappRoot, "local.config.json");
  const config = loadReleaseConfig({ miniappRoot });
  const distRoot = path.join(miniappRoot, "dist");
  const distAbsoluteFiles = walkFiles(distRoot);
  const artifactEvidence = createArtifactEvidence(distAbsoluteFiles.map(
    (file) => ({
      content: fs.readFileSync(file),
      path: path.relative(distRoot, file),
    }),
  ));
  const distProjectConfigFile = path.join(distRoot, "project.config.json");
  const productionSourceFiles = [
    ...walkFiles(path.join(miniappRoot, "src")),
    ...walkFiles(path.join(miniappRoot, "config")),
    ...walkFiles(path.join(repositoryRoot, "scripts")),
    ...walkFiles(path.join(repositoryRoot, ".github")),
    path.join(repositoryRoot, "package.json"),
    path.join(miniappRoot, "package.json"),
    localConfigFile,
    path.join(miniappRoot, "project.private.config.json"),
  ].filter((file) => fs.existsSync(file));

  return {
    ...config,
    artifactEvidence,
    distAppId: fs.existsSync(distProjectConfigFile)
      ? readJson(distProjectConfigFile).appid
      : "",
    distFiles: relativeFileList(distRoot, distAbsoluteFiles),
    mainPackageBytes: artifactEvidence.totalBytes,
    miniappVersion: readJson(path.join(miniappRoot, "package.json")).version,
    rootVersion: readJson(path.join(repositoryRoot, "package.json")).version,
    sourceFiles: readTextFiles(
      [...productionSourceFiles, ...distAbsoluteFiles],
      repositoryRoot,
    ),
  };
}

export function runReleasePreflight(repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
)) {
  const config = loadReleaseConfig({
    miniappRoot: path.join(repositoryRoot, "miniapp"),
  });
  verifyPreflight(config);
  console.log("Miniapp production configuration preflight passed.");
  return true;
}

export function runReleaseCli(repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
)) {
  const release = loadReleaseInput(repositoryRoot);
  verifyRelease(release);
  console.log(
    `Release gate passed: miniapp ${release.miniappVersion}, web ${release.rootVersion}, main package ${release.mainPackageBytes} bytes, artifact manifest SHA256 ${release.artifactEvidence.manifestSha256}.`,
  );
  return true;
}

const invokedFile = process.argv[1]
  ? pathToFileURL(path.resolve(process.argv[1])).href
  : "";

if (import.meta.url === invokedFile) {
  try {
    if (process.argv.includes("--preflight")) runReleasePreflight();
    else runReleaseCli();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
