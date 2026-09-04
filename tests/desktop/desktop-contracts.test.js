import { createHash } from "node:crypto";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, test } from "vitest";

import { createDesktopReleaseAssets } from
  "../../scripts/desktop-release-assets.mjs";
import {
  assertDesktopIdentity,
  assertNoLegacyBrand,
} from "../../scripts/verify-package-branding.mjs";

describe("desktop identity contracts", () => {
  test("uses the standalone 洛克计算器 package identity", async () => {
    const packageJson = JSON.parse(
      await readFile(path.resolve("package.json"), "utf8"),
    );

    expect(() => assertDesktopIdentity(packageJson)).not.toThrow();
    expect(packageJson).toMatchObject({
      author: "洛克计算器",
      name: "rock-calculator",
      build: {
        appId: "cn.rock.calculator",
        artifactName: "洛克计算器-${version}.${ext}",
        nsis: { guid: "5ca658da-1ce6-5199-babe-3d59475e8d1a" },
        productName: "洛克计算器",
      },
    });
    expect(packageJson.version).toMatch(/^\d+\.\d+\.\d+$/u);
  });

  test("sets the matching window title, icon and Windows identity", async () => {
    const desktopMain = await readFile(
      path.resolve("desktop/main.mjs"),
      "utf8",
    );

    expect(desktopMain).toContain(
      'const APP_USER_MODEL_ID = "cn.rock.calculator";',
    );
    expect(desktopMain).toContain('const APP_NAME = "洛克计算器";');
    expect(desktopMain).toContain("app.setName(APP_NAME)");
    expect(desktopMain).toContain(
      'app.commandLine.appendSwitch("disable-direct-composition")',
    );
    expect(desktopMain).toContain('window.once("ready-to-show"');
    expect(desktopMain).toContain('const APP_TITLE = "洛克计算器 · S4前瞻";');
    expect(desktopMain).toContain("icon: getAppIconPath()");
    expect(desktopMain).not.toMatch(/lovepvp/i);
  });

  test("rejects the old brand case-insensitively", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "rock-brand-test-"));
    const file = path.join(directory, "bundle.js");
    await writeFile(file, "legacy LovePvP key", "utf8");

    expect(() => assertNoLegacyBrand([directory])).toThrow(/旧品牌/);
  });

  test("allows the acknowledged third-party reference URL", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "rock-brand-reference-test-"));
    const file = path.join(directory, "bundle.js");
    await writeFile(file, "参考资料：https://lovepvp.top/", "utf8");

    expect(() => assertNoLegacyBrand([directory])).not.toThrow();
  });
});

describe("desktop release artifact contract", () => {
  test("creates only the versioned installer package", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "rock-release-assets-"));
    const sourcePath = path.join(root, "source.exe");
    const outputDirectory = path.join(root, "output");
    const source = Buffer.from("stable desktop installer");
    await writeFile(sourcePath, source);

    const result = await createDesktopReleaseAssets({
      outputDirectory,
      sourcePath,
      version: "9.9.9",
    });

    expect(path.basename(result.versionedPath)).toBe("洛克计算器-9.9.9.exe");
    expect(await readFile(result.versionedPath)).toEqual(source);
    expect(result).not.toHaveProperty("stablePath");

    const checksum = createHash("sha256").update(source).digest("hex");
    expect(await readFile(result.checksumPath, "utf8")).toBe(
      `${checksum}  洛克计算器-9.9.9.exe\n`,
    );
  });
});
