import {
  existsSync,
  readFileSync,
  realpathSync,
  statSync,
} from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ALLOWED_STATUSES = new Set(["通过", "部分", "待验证"]);
const EXPECTED_COLUMNS = ["需求", "状态", "实现证据", "验收证据", "剩余差距"];
const OBSOLETE_UI_CLAIMS = [
  "1 选择精灵",
  "2 选择性格",
  "3 选择技能",
  "开始计算",
  "完整技能配置",
  "单技能参数配置",
  "单技能快捷计算",
  "三个主步骤",
];
const SAFE_NEGATION_SUFFIXES = [
  "没有",
  "不存在",
  "已删除",
  "已移除",
  "已取消",
  "不再显示",
  "不再展示",
  "不再保留",
  "不再提供",
  "无需",
  "不使用",
];
const DOUBLE_NEGATION_PREFIXES = ["并非", "不是", "不能说"];

function issue(line, code, message) {
  return { line, code, message };
}

function hasImmediateSafeNegation(prefix) {
  const normalized = prefix.replace(/\s+/g, "");
  const suffix = SAFE_NEGATION_SUFFIXES.find((candidate) =>
    normalized.endsWith(candidate),
  );
  if (!suffix) return false;
  const beforeSuffix = normalized.slice(0, -suffix.length);
  return !DOUBLE_NEGATION_PREFIXES.some((candidate) =>
    beforeSuffix.endsWith(candidate),
  );
}

function cellsFor(line) {
  const trimmed = line.trim();
  if (!trimmed.startsWith("|") || !trimmed.endsWith("|")) return null;
  return trimmed.slice(1, -1)
    .split("|")
    .map((cell) => cell.trim());
}

function isSeparatorRow(cells) {
  return cells.every((cell) => /^:?-{3,}:?$/.test(cell));
}

function codeTokens(cell) {
  return [...cell.matchAll(/`([^`]+)`/g)].map((match) => match[1].trim());
}

function looksLikePath(token) {
  return (
    !/\s/.test(token) &&
    !token.startsWith("npm") &&
    !token.startsWith("npx") &&
    /[\\/]/.test(token) &&
    /\.[a-z0-9]+$/i.test(token)
  );
}

function normalizeEvidencePath(token) {
  return token.replaceAll("\\", "/").replace(/^\.\//, "");
}

function isOutsideRepository(repositoryRoot, relativePath) {
  if (path.isAbsolute(relativePath)) return true;
  const resolvedPath = path.resolve(repositoryRoot, relativePath);
  return isResolvedPathOutside(repositoryRoot, resolvedPath);
}

function isResolvedPathOutside(repositoryRoot, resolvedPath) {
  const relation = path.relative(repositoryRoot, resolvedPath);
  return relation === ".." || relation.startsWith(`..${path.sep}`) || path.isAbsolute(relation);
}

function validateRepositoryFile(repositoryRoot, relativePath) {
  if (isOutsideRepository(repositoryRoot, relativePath)) {
    return {
      code: "evidence-outside-repository",
      message: `证据路径必须位于仓库内：${relativePath}`,
    };
  }
  const candidatePath = path.resolve(repositoryRoot, relativePath);
  if (!existsSync(candidatePath)) {
    return { code: "missing-path", message: `引用路径不存在：${relativePath}` };
  }
  const realRepositoryRoot = realpathSync(repositoryRoot);
  const realEvidencePath = realpathSync(candidatePath);
  if (isResolvedPathOutside(realRepositoryRoot, realEvidencePath)) {
    return {
      code: "evidence-outside-repository",
      message: `证据真实路径位于仓库外：${relativePath}`,
    };
  }
  if (!statSync(realEvidencePath).isFile()) {
    return { code: "evidence-not-file", message: `证据必须是普通文件：${relativePath}` };
  }
  return null;
}

function parseCommand(command, { packageScripts, repositoryRoot }) {
  const npmRun = command.match(/^npm\s+run\s+([^\s]+)(?:\s+--(?:\s+.*)?)?$/);
  if (npmRun) {
    if (!packageScripts[npmRun[1]]) {
      return { code: "unknown-script", message: `npm script 不存在：${npmRun[1]}` };
    }
    return null;
  }

  const npmTest = command.match(/^npm\s+test(?:\s+--\s+(.+))?$/);
  if (npmTest) {
    if (!packageScripts.test) {
      return { code: "unknown-script", message: "npm script 不存在：test" };
    }
    if (npmTest[1]) {
      const referencedPaths = npmTest[1]
        .split(/\s+/)
        .filter(looksLikePath)
        .map(normalizeEvidencePath);
      for (const referencedPath of referencedPaths) {
        const pathIssue = validateRepositoryFile(repositoryRoot, referencedPath);
        if (pathIssue) return pathIssue;
      }
    }
    return null;
  }

  const vitest = command.match(/^npx\s+vitest\s+run(?:\s+(.+))?$/);
  if (vitest) {
    const referencedPaths = (vitest[1] ?? "")
      .split(/\s+/)
      .filter(looksLikePath)
      .map(normalizeEvidencePath);
    for (const referencedPath of referencedPaths) {
      const pathIssue = validateRepositoryFile(repositoryRoot, referencedPath);
      if (pathIssue) return pathIssue;
    }
    return null;
  }

  return { code: "unrecognized-command", message: `无法解析验收命令：${command}` };
}

function parseEntries(lines, issues) {
  const headerIndex = lines.findIndex((line) => {
    const cells = cellsFor(line);
    return cells?.join("|") === EXPECTED_COLUMNS.join("|");
  });
  if (headerIndex < 0) {
    issues.push(issue(1, "missing-table", "缺少标准验收矩阵表头"));
    return [];
  }

  const separator = cellsFor(lines[headerIndex + 1] ?? "");
  if (!separator || separator.length !== EXPECTED_COLUMNS.length || !isSeparatorRow(separator)) {
    issues.push(issue(headerIndex + 2, "malformed-table", "验收矩阵分隔行格式错误"));
    return [];
  }

  const entries = [];
  let tableEndIndex = lines.length;
  for (let index = headerIndex + 2; index < lines.length; index += 1) {
    if (!lines[index].trim()) {
      tableEndIndex = index;
      break;
    }
    const trimmed = lines[index].trim();
    if (!trimmed.startsWith("|") || !trimmed.endsWith("|")) {
      issues.push(issue(index + 1, "malformed-row", "验收条目必须以管道符开始并结束"));
      continue;
    }
    const cells = cellsFor(lines[index]);
    if (cells.length !== EXPECTED_COLUMNS.length) {
      issues.push(issue(index + 1, "malformed-row", "验收条目必须包含五列"));
      continue;
    }
    entries.push({
      line: index + 1,
      requirement: cells[0],
      status: cells[1],
      implementationEvidence: cells[2],
      verificationEvidence: cells[3],
      gap: cells[4],
    });
  }
  for (let index = tableEndIndex + 1; index < lines.length; index += 1) {
    const cells = cellsFor(lines[index]);
    if (
      cells?.length === EXPECTED_COLUMNS.length &&
      (cells.join("|") === EXPECTED_COLUMNS.join("|") ||
        ALLOWED_STATUSES.has(cells[1]))
    ) {
      issues.push(issue(index + 1, "truncated-table", "验收矩阵被空行提前截断"));
      break;
    }
  }
  if (entries.length === 0) {
    issues.push(issue(headerIndex + 3, "empty-matrix", "验收矩阵没有条目"));
  }
  return entries;
}

function validateEvidenceCell({ cell, line, packageScripts, repositoryRoot }, issues) {
  const tokens = codeTokens(cell);
  if (tokens.length === 0) {
    issues.push(issue(line, "empty-evidence", "证据列必须包含反引号包裹的路径或命令"));
    return { commands: [], paths: [] };
  }

  const paths = [];
  const commands = [];
  for (const token of tokens) {
    if (looksLikePath(token)) {
      const relativePath = normalizeEvidencePath(token);
      paths.push(relativePath);
      const pathIssue = validateRepositoryFile(repositoryRoot, relativePath);
      if (pathIssue) issues.push(issue(line, pathIssue.code, pathIssue.message));
      continue;
    }
    if (/^(?:npm|npx)\s/.test(token)) {
      commands.push(token);
      const commandIssue = parseCommand(token, { packageScripts, repositoryRoot });
      if (commandIssue) issues.push(issue(line, commandIssue.code, commandIssue.message));
      continue;
    }
    issues.push(issue(line, "unrecognized-evidence", `无法解析证据：${token}`));
  }
  return { commands, paths };
}

export function verifyAcceptanceMatrix({
  content,
  repositoryRoot = process.cwd(),
} = {}) {
  const issues = [];
  const lines = String(content ?? "").replaceAll("\r\n", "\n").split("\n");
  const packagePath = path.join(repositoryRoot, "package.json");
  const packageScripts = existsSync(packagePath)
    ? JSON.parse(readFileSync(packagePath, "utf8")).scripts ?? {}
    : {};

  for (const match of String(content ?? "").matchAll(/(?<![\d.])\d+\s*(?:个|项|条)?\s*(?:测试|用例|tests?)(?:\s*(?:通过|passed))?/gi)) {
    const line = String(content).slice(0, match.index).split(/\r?\n/).length;
    issues.push(issue(line, "hardcoded-test-total", `禁止固定测试总数：${match[0]}`));
  }
  for (const match of String(content ?? "").matchAll(/(?<![\d.])\d+\s*\/\s*\d+\s*(?:通过|passed|tests?)/gi)) {
    const line = String(content).slice(0, match.index).split(/\r?\n/).length;
    issues.push(issue(line, "hardcoded-test-total", `禁止固定测试总数：${match[0]}`));
  }
  for (const match of String(content ?? "").matchAll(/(?:测试|用例|tests?)\s*(?:通过|passed)?\s*[:：]?\s*\d+\s*(?:个|项|条|tests?)?/gi)) {
    const line = String(content).slice(0, match.index).split(/\r?\n/).length;
    issues.push(issue(line, "hardcoded-test-total", `禁止固定测试总数：${match[0]}`));
  }
  lines.forEach((lineText, lineIndex) => {
    for (const phrase of OBSOLETE_UI_CLAIMS) {
      let phraseIndex = lineText.indexOf(phrase);
      while (phraseIndex >= 0) {
        const prefix = lineText.slice(0, phraseIndex);
        if (!hasImmediateSafeNegation(prefix)) {
          issues.push(issue(lineIndex + 1, "obsolete-ui-claim", `包含过期 UI 声明：${phrase}`));
          break;
        }
        phraseIndex = lineText.indexOf(phrase, phraseIndex + phrase.length);
      }
    }
  });
  lines.forEach((lineText, lineIndex) => {
    if (
      /https?:\/\/(?:www\.)?figma\.com\//i.test(lineText) ||
      /node-id=\d+[-:]\d+/i.test(lineText) ||
      /(?:figma|节点)[^\n]{0,40}`?\d+:\d+`?/i.test(lineText)
    ) {
      issues.push(issue(lineIndex + 1, "stale-figma-evidence", "禁止引用旧 Figma 节点或链接"));
    }
  });
  for (const match of String(content ?? "").matchAll(/https?:\/\/(?:127\.0\.0\.1|localhost):\d+/gi)) {
    const line = String(content).slice(0, match.index).split(/\r?\n/).length;
    issues.push(issue(line, "stale-local-url", `禁止记录本地预览地址：${match[0]}`));
  }
  for (const match of String(content ?? "").matchAll(/`([^`]+\.(?:png|jpe?g|webp))`/gi)) {
    if (/(?:^|[\\/_-])(?:old|before|baseline|v\d+[._-]\d+)/i.test(match[1])) {
      const line = String(content).slice(0, match.index).split(/\r?\n/).length;
      issues.push(issue(line, "stale-screenshot", `禁止引用旧版或基线截图：${match[1]}`));
    }
  }

  const entries = parseEntries(lines, issues);
  for (const entry of entries) {
    if (!entry.requirement) issues.push(issue(entry.line, "empty-requirement", "需求不能为空"));
    if (!ALLOWED_STATUSES.has(entry.status)) {
      issues.push(issue(entry.line, "invalid-status", `未知状态：${entry.status || "空"}`));
    }
    if (!entry.gap) issues.push(issue(entry.line, "empty-gap", "剩余差距不能为空"));

    const implementation = validateEvidenceCell({
      cell: entry.implementationEvidence,
      line: entry.line,
      packageScripts,
      repositoryRoot,
    }, issues);
    const verification = validateEvidenceCell({
      cell: entry.verificationEvidence,
      line: entry.line,
      packageScripts,
      repositoryRoot,
    }, issues);

    if (entry.status === "通过") {
      if (implementation.paths.length === 0) {
        issues.push(issue(entry.line, "missing-implementation-evidence", "通过项必须包含实现文件证据"));
      }
      const hasAutomatedEvidence = verification.paths.some((entryPath) =>
        /^(?:tests|e2e|miniapp\/tests)\//.test(entryPath),
      );
      const hasCurrentManualEvidence = verification.paths.some((entryPath) =>
        /^\.superpowers\/sdd\/2026-07-31-calculator-overall-optimization\/screenshots\//.test(entryPath),
      );
      if (!hasAutomatedEvidence && !hasCurrentManualEvidence) {
        issues.push(issue(entry.line, "missing-verification-evidence", "通过项必须包含自动测试或本轮人工证据"));
      }
    }
  }

  return { entries, issues, valid: issues.length === 0 };
}

function runCli() {
  const repositoryRoot = process.cwd();
  const matrixPath = path.resolve(repositoryRoot, process.argv[2] ?? "docs/acceptance-matrix.md");
  if (!existsSync(matrixPath)) {
    console.error(`验收矩阵不存在：${path.relative(repositoryRoot, matrixPath)}`);
    process.exitCode = 1;
    return;
  }
  const result = verifyAcceptanceMatrix({
    content: readFileSync(matrixPath, "utf8"),
    repositoryRoot,
  });
  if (result.valid) {
    console.log(`验收矩阵校验通过：${result.entries.length} 项`);
    return;
  }
  for (const entry of result.issues) {
    console.error(`第 ${entry.line} 行 [${entry.code}] ${entry.message}`);
  }
  process.exitCode = 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runCli();
}
