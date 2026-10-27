import { createPackage } from "@electron/asar";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { expect, test } from "vitest";
import { verifyPackagedBundle } from "../../scripts/verify-package-branding.mjs";

test("桌面打包门禁验证两频道图标，并拒绝遗漏已构建的预览入口", async () => {
  const root = mkdtempSync(path.join(tmpdir(), "desktop-preview-package-"));
  const resources = path.join(root, "release/win-unpacked/resources");
  const client = path.join(resources, "client");
  const skillId = "skill_0000000000000004";
  const runtime = JSON.stringify({ skills: [{ id: skillId, name: "预览技能", iconUrl: `/assets/skills/${skillId}.png` }] });
  const png = Buffer.from("89504e470d0a1a0a", "hex");
  for (const prefix of ["", "pre"]) {
    const channel = path.join(client, prefix);
    mkdirSync(path.join(channel, "data"), { recursive: true });
    mkdirSync(path.join(channel, "assets/skills"), { recursive: true });
    writeFileSync(path.join(channel, "index.html"), '<div id="root"></div>', "utf8");
    writeFileSync(path.join(channel, "data/runtime.json"), runtime, "utf8");
    writeFileSync(path.join(channel, `assets/skills/${skillId}.png`), png);
  }
  const sourcePreview = path.join(root, "dist/client/pre/index.html");
  mkdirSync(path.dirname(sourcePreview), { recursive: true });
  writeFileSync(sourcePreview, '<div id="root"></div>', "utf8");
  const app = path.join(root, "app");
  mkdirSync(app);
  writeFileSync(path.join(app, "package.json"), JSON.stringify({ name: "rock-calculator" }), "utf8");
  await createPackage(app, path.join(resources, "app.asar"));

  expect(() => verifyPackagedBundle(root)).not.toThrow();
  const previewIcon = path.join(client, `pre/assets/skills/${skillId}.png`);
  writeFileSync(previewIcon, "broken", "utf8");
  expect(() => verifyPackagedBundle(root)).toThrow("损坏：预览技能");
  writeFileSync(previewIcon, png);
  rmSync(path.join(client, "pre/index.html"));
  expect(() => verifyPackagedBundle(root)).toThrow("桌面包缺少预览入口");
});
