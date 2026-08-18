import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, test } from "vitest";

import {
  createArtifactEvidence,
  runReleaseCli,
  verifyRelease,
} from "../../scripts/miniapp/verify-release.mjs";

const validRelease = {
  appId: "wx1234567890abcdef",
  artifactEvidence: {
    fileCount: 3,
    manifestSha256: "b".repeat(64),
    totalBytes: 1024,
  },
  cloudEnv: "cloud-prod-1a2b",
  distAppId: "wx1234567890abcdef",
  distFiles: [
    "app.json",
    "pages/index/index.js",
    "project.config.json",
  ],
  mainPackageBytes: 1024,
  manifestFileId: "cloud://cloud-prod-1a2b/data/manifest.json",
  miniappVersion: "0.2.4",
  rootVersion: "1.5.7",
  runtimeSha256: "a".repeat(64),
  sourceText: "Taro.cloud.downloadFile({ fileID: manifestFileId })",
};

const temporaryDirectories = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    fs.rmSync(directory, { force: true, recursive: true });
  }
});

function createReleaseFixture(localConfig) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "miniapp-release-gate-"));
  temporaryDirectories.push(root);
  fs.mkdirSync(path.join(root, "miniapp", "dist", "pages", "index"), {
    recursive: true,
  });
  fs.mkdirSync(path.join(root, "miniapp", "src"), { recursive: true });
  fs.writeFileSync(
    path.join(root, "package.json"),
    JSON.stringify({ version: "1.5.7" }),
  );
  fs.writeFileSync(
    path.join(root, "miniapp", "package.json"),
    JSON.stringify({ version: "0.2.4" }),
  );
  fs.writeFileSync(
    path.join(root, "miniapp", "local.config.json"),
    JSON.stringify(localConfig),
  );
  fs.writeFileSync(path.join(root, "miniapp", "dist", "app.json"), "{}");
  fs.writeFileSync(
    path.join(root, "miniapp", "dist", "project.config.json"),
    JSON.stringify({ appid: localConfig.appId }),
  );
  fs.writeFileSync(
    path.join(root, "miniapp", "dist", "pages", "index", "index.js"),
    "Taro.cloud.downloadFile({})",
  );
  return root;
}

function writeFixtureFile(root, relativePath, text) {
  const file = path.join(root, ...relativePath.split("/"));
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text);
}

describe("miniapp production release gate", () => {
  test("creates deterministic evidence from sorted artifact hashes", () => {
    expect(createArtifactEvidence([
      { content: Buffer.from("beta"), path: "b.txt" },
      { content: Buffer.from("alpha"), path: "a.txt" },
    ])).toEqual({
      fileCount: 2,
      manifestSha256: "a1c875d2440204411d05c685be4c74b31a14190d7bc477cb8a668f8137ca8eaa",
      totalBytes: 9,
    });
  });

  test.each([
    "",
    "touristappid",
    "wx0000000000000000",
    "wx123",
  ])("rejects unusable AppID %j", (appId) => {
    expect(() => verifyRelease({ ...validRelease, appId })).toThrow(/AppID/u);
  });

  test.each(["", "touristappid", "wxfedcba9876543210"])(
    "rejects a built project AppID that does not match private config: %j",
    (distAppId) => {
      expect(() => verifyRelease({ ...validRelease, distAppId }))
        .toThrow(/产物 AppID/u);
    },
  );

  test("allows production release without paid cloud configuration", () => {
    expect(verifyRelease({
      ...validRelease,
      cloudEnv: "",
      manifestFileId: "",
      runtimeSha256: "",
    })).toBe(true);
  });

  test.each([
    ["miniappVersion", "0.1.0", /0\.2\.4/u],
    ["rootVersion", "1.4.6", /1\.5\.7/u],
  ])("rejects an unexpected %s", (key, value, message) => {
    expect(() => verifyRelease({ ...validRelease, [key]: value }))
      .toThrow(message);
  });

  test.each(["app.json", "pages/index/index.js"])(
    "requires the production artifact %s",
    (missingFile) => {
      expect(() => verifyRelease({
        ...validRelease,
        distFiles: validRelease.distFiles.filter((file) => file !== missingFile),
      })).toThrow(/产物/u);
    },
  );

  test("rejects an oversized main package", () => {
    expect(() => verifyRelease({
      ...validRelease,
      mainPackageBytes: 2 * 1024 * 1024 + 1,
    })).toThrow(/包体/u);
  });

  test("rejects artifact evidence that cannot reproduce the package totals", () => {
    expect(() => verifyRelease({
      ...validRelease,
      artifactEvidence: {
        ...validRelease.artifactEvidence,
        totalBytes: 1023,
      },
    })).toThrow(/产物证据/u);
  });

  test.each([
    "appSecret='abc123'",
    "const config = { secretKey: 'abc123' }",
    "privateKey: `abc123`",
    "const openid = 'oFixedUserIdentity'",
  ])("rejects a fixed secret or identity: %s", (sourceText) => {
    expect(() => verifyRelease({ ...validRelease, sourceText }))
      .toThrow(/秘密/u);
  });

  test("allows an empty identity field in a framework component schema", () => {
    expect(() => verifyRelease({
      ...validRelease,
      sourceText: [
        "const empty = '';",
        "const componentSchema = { openid: empty };",
        "function later() { const empty = getRuntimeValue() }",
      ].join("\n"),
    })).not.toThrow();
  });

  test("rejects a fixed identity despite an inaccessible inner shadow", () => {
    const sourceText = [
      "const identity = 'oFixedUserIdentity';",
      "function unrelated() { const identity = ''; return identity }",
      "const config = { openid: identity };",
    ].join("\n");

    expect(() => verifyRelease({ ...validRelease, sourceText }))
      .toThrow(/秘密/u);
  });

  test.each([
    'const openid = `dummy-${"fixed"}`;',
    'const openid = `dummy-${"fi" + "xed"}`;',
  ])("rejects a fixed identity assembled in a static template: %s", (sourceText) => {
    expect(() => verifyRelease({ ...validRelease, sourceText }))
      .toThrow(/秘密/u);
  });

  test("allows a template identity with a dynamic expression", () => {
    const sourceText = [
      "const suffix = getRuntimeIdentity();",
      "const openid = `dummy-${suffix}`;",
    ].join("\n");

    expect(() => verifyRelease({ ...validRelease, sourceText })).not.toThrow();
  });

  test("allows an identity alias resolved by a runtime call", () => {
    const sourceText = [
      "const runtimeIdentity = getRuntimeIdentity();",
      "const config = { openid: runtimeIdentity };",
    ].join("\n");

    expect(() => verifyRelease({ ...validRelease, sourceText })).not.toThrow();
  });

  test("allows a secret-key alias resolved from a runtime member", () => {
    const sourceText = [
      "const runtimeKey = process.env.RUNTIME_KEY;",
      "const config = { secretKey: runtimeKey };",
    ].join("\n");

    expect(() => verifyRelease({ ...validRelease, sourceText })).not.toThrow();
  });

  test.each([
    "Taro.login()",
    "wx.requestPayment({})",
    "wx.getLocation({})",
    "Taro.chooseMedia({})",
    "wx.createCameraContext()",
    "wx.getRecorderManager()",
  ])("rejects a forbidden sensitive API: %s", (sourceText) => {
    expect(() => verifyRelease({ ...validRelease, sourceText }))
      .toThrow(/禁用 API/u);
  });

  test.each([
    "wx['lo' + 'gin']()",
    "const api = Taro; api['get' + 'Location']({})",
    "const { login: authenticate } = wx; authenticate()",
    "wx.getUserInfo({})",
    "Taro?.['getUser' + 'Info']?.({})",
  ])("rejects a computed or aliased sensitive API: %s", (sourceText) => {
    expect(() => verifyRelease({ ...validRelease, sourceText }))
      .toThrow(/禁用 API/u);
  });

  test.each([
    "const config = { ['app' + 'Secret']: 'fixed-secret' }",
    "const key = 'private' + 'Key'; const config = { [key]: 'fixed-key' }",
    "config['secret' + 'Key'] = 'fixed-key'",
  ])("rejects a computed fixed secret key: %s", (sourceText) => {
    expect(() => verifyRelease({ ...validRelease, sourceText }))
      .toThrow(/秘密/u);
  });

  test("rejects WXML phone-number authorization", () => {
    expect(() => verifyRelease({
      ...validRelease,
      sourceFiles: [{
        path: "pages/index/index.wxml",
        text: '<button open-type="getPhoneNumber">授权</button>',
      }],
    })).toThrow(/禁用 API/u);
  });

  test.each([
    "import ci from 'miniprogram-ci'",
    "ci.upload({ version: '0.1.1' })",
    "ci.preview({ version: '0.1.1' })",
  ])("rejects automated upload or preview code: %s", (sourceText) => {
    expect(() => verifyRelease({ ...validRelease, sourceText }))
      .toThrow(/上传|预览|发布/u);
  });

  test("rejects aliased miniprogram-ci upload assembled from strings", () => {
    const sourceText = [
      "const packageName = 'miniprogram' + '-ci';",
      "const releaseClient = require(packageName);",
      "const ship = releaseClient['up' + 'load'];",
      "ship({});",
    ].join("\n");
    expect(() => verifyRelease({ ...validRelease, sourceText }))
      .toThrow(/上传|发布/u);
  });

  test("rejects a release module despite an inaccessible inner shadow", () => {
    const sourceText = [
      "const moduleName = 'miniprogram-ci';",
      "function unrelated() { const moduleName = 'safe-module'; return moduleName }",
      "const releaseClient = require(moduleName);",
      "releaseClient.upload({});",
    ].join("\n");

    expect(() => verifyRelease({ ...validRelease, sourceText }))
      .toThrow(/上传|发布/u);
  });

  test("rejects an AppSecret accidentally added to ignored local config", () => {
    const root = createReleaseFixture({
      appId: validRelease.appId,
      appSecret: "must-not-enter-a-frontend-build",
      cloudEnv: validRelease.cloudEnv,
      manifestFileId: validRelease.manifestFileId,
      runtimeSha256: validRelease.runtimeSha256,
    });

    expect(() => runReleaseCli(root)).toThrow(/秘密/u);
  });

  test.each([
    [
      "miniapp/project.private.config.json",
      JSON.stringify({ appSecret: "must-not-be-stored-here" }),
      /秘密/u,
    ],
    [
      "scripts/release.mjs",
      "import ci from 'miniprogram-ci'; ci.upload({});",
      /上传|发布/u,
    ],
    [
      "scripts/release.ps1",
      "npx miniprogram-ci preview --project miniapp",
      /预览|发布/u,
    ],
    [
      ".github/workflows/release.yml",
      "steps:\n  - run: npx miniprogram-ci upload --project miniapp",
      /上传|发布/u,
    ],
    [
      ".github/actions/publish/action.yml",
      [
        "runs:",
        "  using: composite",
        "  steps:",
        "    - shell: bash",
        "      run: npx miniprogram-ci upload --project miniapp",
      ].join("\n"),
      /上传|发布/u,
    ],
  ])("scans release-sensitive file %s", (relativePath, text, message) => {
    const root = createReleaseFixture(validRelease);
    writeFixtureFile(root, relativePath, text);

    expect(() => runReleaseCli(root)).toThrow(message);
  });

  test("does not flag the release scanner's own detection definitions", () => {
    const root = createReleaseFixture(validRelease);
    writeFixtureFile(
      root,
      "scripts/miniapp/verify-release.mjs",
      "const blocked = ['miniprogram-ci', 'appSecret=abc'];",
    );

    expect(runReleaseCli(root)).toBe(true);
  });

  test("scans executable upload code added to the release scanner itself", () => {
    const root = createReleaseFixture(validRelease);
    writeFixtureFile(
      root,
      "scripts/miniapp/verify-release.mjs",
      "import ci from 'miniprogram-ci'; ci.upload({});",
    );

    expect(() => runReleaseCli(root)).toThrow(/上传|发布/u);
  });

  test("accepts a complete v0.2.4 production artifact contract", () => {
    expect(verifyRelease(validRelease)).toBe(true);
  });
});
