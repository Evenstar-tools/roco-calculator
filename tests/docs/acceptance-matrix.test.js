import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, test } from "vitest";
import { verifyAcceptanceMatrix } from "../../scripts/verify-acceptance.mjs";

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const matrixPath = path.join(repositoryRoot, "docs/acceptance-matrix.md");
const temporaryDirectories = [];

function verify(content) {
  return verifyAcceptanceMatrix({ content, repositoryRoot });
}

function issueCodes(result) {
  return result.issues.map((issue) => issue.code);
}

function fixtureMatrix({ implementation = "src/App.jsx", verification = "tests/example.test.js" } = {}) {
  return [
    "# 验收矩阵",
    "",
    "| 需求 | 状态 | 实现证据 | 验收证据 | 剩余差距 |",
    "| --- | --- | --- | --- | --- |",
    `| 测试能力 | 通过 | \`${implementation}\` | \`${verification}\` | 无 |`,
  ].join("\n");
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { force: true, recursive: true });
  }
});

describe("acceptance matrix release gate", () => {
  test("wires the gate into CI, Web build, and inherited desktop packaging without recursion", () => {
    const packageJson = JSON.parse(
      readFileSync(path.join(repositoryRoot, "package.json"), "utf8"),
    );
    const ci = readFileSync(
      path.join(repositoryRoot, ".github/workflows/ci.yml"),
      "utf8",
    );

    expect(packageJson.scripts["acceptance:verify"]).toBe(
      "node scripts/verify-acceptance.mjs",
    );
    expect(packageJson.scripts.build).toContain("npm run acceptance:verify");
    expect(packageJson.scripts["desktop:pack"]).toContain("npm run build");
    expect(packageJson.scripts["acceptance:verify"]).not.toMatch(
      /npm run (?:build|desktop:pack)/,
    );
    expect(ci).toContain("run: npm run acceptance:verify");
  });

  test("accepts the current repository matrix", () => {
    const result = verify(readFileSync(matrixPath, "utf8"));

    expect(result.issues).toEqual([]);
    expect(result.entries.length).toBeGreaterThan(0);
  });

  test("rejects a referenced file that no longer exists", () => {
    const content = readFileSync(matrixPath, "utf8").replace(
      "`src/components/SpiritPicker.jsx`",
      "`src/components/MissingSpiritPicker.jsx`",
    );

    expect(issueCodes(verify(content))).toContain("missing-path");
  });

  test("rejects evidence paths outside the repository", () => {
    const content = readFileSync(matrixPath, "utf8").replace(
      "`src/components/SpiritPicker.jsx`",
      "`../outside/evidence.js`",
    );

    expect(issueCodes(verify(content))).toContain("evidence-outside-repository");
  });

  test("rejects unknown status values", () => {
    const content = readFileSync(matrixPath, "utf8").replace(
      "| 通过 |",
      "| 已完成 |",
    );

    expect(issueCodes(verify(content))).toContain("invalid-status");
  });

  test.each([
    "共 443 个测试通过。",
    "测试通过 443 项。",
    "443 项测试通过。",
    "用例 443 个。",
    "passed 443 tests.",
  ])("rejects hard-coded test totals: %s", (claim) => {
    const content = `${readFileSync(matrixPath, "utf8")}\n${claim}\n`;

    expect(issueCodes(verify(content))).toContain("hardcoded-test-total");
  });

  test("rejects obsolete UI claims, historical steps, and local preview ports", () => {
    const content = `${readFileSync(matrixPath, "utf8")}\n1 选择精灵，exactly 三个主步骤，访问 http://127.0.0.1:4173。\n`;
    const codes = issueCodes(verify(content));

    expect(codes).toContain("obsolete-ui-claim");
    expect(codes).toContain("stale-local-url");
  });

  test("allows explicit statements that obsolete controls are absent", () => {
    const content = `${readFileSync(matrixPath, "utf8")}\n当前没有开始计算按钮。\n`;

    expect(verify(content).issues).toEqual([]);
  });

  test.each([
    "当前不存在开始计算按钮。",
    "已删除开始计算按钮。",
    "已移除开始计算按钮。",
    "已取消开始计算按钮。",
    "不再显示开始计算按钮。",
    "不再 展示 开始计算按钮。",
    "不再保留开始计算按钮。",
    "不再提供开始计算按钮。",
    "无需开始计算按钮。",
    "不使用开始计算按钮。",
  ])("allows only a fixed negation immediately before the obsolete phrase: %s", (claim) => {
    const content = `${readFileSync(matrixPath, "utf8")}\n${claim}\n`;

    expect(verify(content).issues).toEqual([]);
  });

  test("does not let an earlier negated clause hide a later obsolete UI claim", () => {
    const content = `${readFileSync(matrixPath, "utf8")}\n当前没有旧入口，但仍保留开始计算按钮。\n`;

    expect(issueCodes(verify(content))).toContain("obsolete-ui-claim");
  });

  test("checks every occurrence when one obsolete phrase is repeated", () => {
    const content = `${readFileSync(matrixPath, "utf8")}\n当前没有开始计算按钮，但重新保留开始计算按钮。\n`;

    expect(issueCodes(verify(content))).toContain("obsolete-ui-claim");
  });

  test.each([
    "当前没有旧入口：现保留开始计算按钮。",
    "当前没有旧入口; still has 开始计算按钮。",
    "当前没有旧入口. Still has 开始计算按钮。",
    "当前没有旧入口；现保留开始计算按钮。",
    "当前没有旧入口。现保留开始计算按钮。",
    "当前没有旧入口？现保留开始计算按钮。",
    "当前没有旧入口！现保留开始计算按钮。",
    "当前没有旧入口，但仍保留开始计算按钮。",
  ])("rejects an obsolete claim after an earlier unrelated negation: %s", (claim) => {
    const content = `${readFileSync(matrixPath, "utf8")}\n${claim}\n`;

    expect(issueCodes(verify(content))).toContain("obsolete-ui-claim");
  });

  test.each([
    "并非没有开始计算按钮。",
    "不是没有开始计算按钮。",
    "不能说没有开始计算按钮。",
  ])("rejects a double negation immediately before the obsolete phrase: %s", (claim) => {
    const content = `${readFileSync(matrixPath, "utf8")}\n${claim}\n`;

    expect(issueCodes(verify(content))).toContain("obsolete-ui-claim");
  });

  test("rejects the historical exactly-three-main-steps claim by itself", () => {
    const content = `${readFileSync(matrixPath, "utf8")}\n当前流程 exactly 三个主步骤。\n`;

    expect(issueCodes(verify(content))).toContain("obsolete-ui-claim");
  });

  test.each([
    "旧 Figma 节点 `2:2`。",
    "设计稿：https://www.figma.com/design/example?node-id=2-2",
    "历史节点 node-id=2-2。",
  ])("rejects stale Figma evidence: %s", (claim) => {
    const content = `${readFileSync(matrixPath, "utf8")}\n${claim}\n`;

    expect(issueCodes(verify(content))).toContain("stale-figma-evidence");
  });

  test("rejects old-version and baseline screenshot evidence", () => {
    const content = `${readFileSync(matrixPath, "utf8")}\n旧证据：\`docs/images/v1.2-old.png\`、\`screenshots/baseline-desktop.png\`。\n`;

    expect(issueCodes(verify(content))).toContain("stale-screenshot");
  });

  test("rejects a passing row without implementation and verification evidence", () => {
    const content = [
      "# 验收矩阵",
      "",
      "| 需求 | 状态 | 实现证据 | 验收证据 | 剩余差距 |",
      "| --- | --- | --- | --- | --- |",
      "| 空证据能力 | 通过 |  |  | 无 |",
    ].join("\n");
    const codes = issueCodes(verify(content));

    expect(codes).toContain("missing-implementation-evidence");
    expect(codes).toContain("missing-verification-evidence");
  });

  test("rejects malformed rows and commands that are not repository scripts", () => {
    const content = [
      "# 验收矩阵",
      "",
      "| 需求 | 状态 | 实现证据 | 验收证据 | 剩余差距 |",
      "| --- | --- | --- | --- | --- |",
      "| 命令证据 | 部分 | `src/App.jsx` | `npm run missing:script` | 未覆盖全部场景 |",
      "| 少一列 | 待验证 | `src/App.jsx` |",
    ].join("\n");
    const codes = issueCodes(verify(content));

    expect(codes).toContain("unknown-script");
    expect(codes).toContain("malformed-row");
  });

  test.each([
    "少了首尾管道 | 通过 | `src/App.jsx` | `tests/domain/damage.test.js` | 无 |",
    "| 少了尾管道 | 通过 | `src/App.jsx` | `tests/domain/damage.test.js` | 无",
  ])("does not silently truncate the table at a malformed middle row", (brokenRow) => {
    const content = [
      "# 验收矩阵",
      "",
      "| 需求 | 状态 | 实现证据 | 验收证据 | 剩余差距 |",
      "| --- | --- | --- | --- | --- |",
      "| 第一项 | 通过 | `src/App.jsx` | `tests/domain/damage.test.js` | 无 |",
      brokenRow,
      "| 后续项 | 通过 | `src/App.jsx` | `tests/domain/calculate.test.js` | 无 |",
      "",
      "## 后续章节",
    ].join("\n");
    const result = verify(content);

    expect(issueCodes(result)).toContain("malformed-row");
    expect(result.entries.map((entry) => entry.requirement)).toContain("后续项");
  });

  test("does not silently truncate the table at a blank middle row", () => {
    const content = [
      "# 验收矩阵",
      "",
      "| 需求 | 状态 | 实现证据 | 验收证据 | 剩余差距 |",
      "| --- | --- | --- | --- | --- |",
      "| 第一项 | 通过 | `src/App.jsx` | `tests/domain/damage.test.js` | 无 |",
      "",
      "| 后续项 | 通过 | `src/App.jsx` | `tests/domain/calculate.test.js` | 无 |",
      "",
      "## 后续章节",
    ].join("\n");
    const result = verify(content);

    expect(issueCodes(result)).toContain("truncated-table");
    expect(result.entries.map((entry) => entry.requirement)).not.toContain("后续项");
  });

  test("rejects a directory even when the evidence path exists", () => {
    const root = mkdtempSync(path.join(os.tmpdir(), "rock-acceptance-directory-"));
    temporaryDirectories.push(root);
    mkdirSync(path.join(root, "src"), { recursive: true });
    mkdirSync(path.join(root, "tests/example.test.js"), { recursive: true });
    writeFileSync(path.join(root, "src/App.jsx"), "export {};\n");
    writeFileSync(path.join(root, "package.json"), JSON.stringify({ scripts: {} }));

    expect(
      issueCodes(
        verifyAcceptanceMatrix({
          content: fixtureMatrix(),
          repositoryRoot: root,
        }),
      ),
    ).toContain("evidence-not-file");
  });

  test("rejects a repository link that resolves to evidence outside the repository", () => {
    const root = mkdtempSync(path.join(os.tmpdir(), "rock-acceptance-link-"));
    const outside = mkdtempSync(path.join(os.tmpdir(), "rock-acceptance-outside-"));
    temporaryDirectories.push(root, outside);
    mkdirSync(path.join(root, "src"), { recursive: true });
    mkdirSync(path.join(root, "tests"), { recursive: true });
    writeFileSync(path.join(root, "src/App.jsx"), "export {};\n");
    writeFileSync(path.join(outside, "outside.test.js"), "export {};\n");
    writeFileSync(path.join(root, "package.json"), JSON.stringify({ scripts: {} }));
    symlinkSync(
      outside,
      path.join(root, "tests/linked"),
      process.platform === "win32" ? "junction" : "dir",
    );

    expect(
      issueCodes(
        verifyAcceptanceMatrix({
          content: fixtureMatrix({ verification: "tests/linked/outside.test.js" }),
          repositoryRoot: root,
        }),
      ),
    ).toContain("evidence-outside-repository");
  });
});
