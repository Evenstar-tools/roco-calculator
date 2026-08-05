import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, test } from "vitest";

describe("desktop package branding", () => {
  test("uses the standalone 洛克计算器 identity that refreshes Windows icons", async () => {
    const packageJson = JSON.parse(
      await readFile(path.resolve("package.json"), "utf8"),
    );

    expect(packageJson).toMatchObject({
      author: "洛克计算器",
      name: "rock-calculator",
      version: "1.4.5",
    });
    expect(packageJson.build).toMatchObject({
      appId: "cn.rock.calculator",
      artifactName: "洛克计算器-${version}.${ext}",
      nsis: {
        guid: "5ca658da-1ce6-5199-babe-3d59475e8d1a",
      },
      productName: "洛克计算器",
    });
  });

  test("sets an explicit window icon and matching Windows application identity", async () => {
    const desktopMain = await readFile(
      path.resolve("desktop/main.mjs"),
      "utf8",
    );

    expect(desktopMain).toContain(
      'const APP_USER_MODEL_ID = "cn.rock.calculator";',
    );
    expect(desktopMain).toContain("icon: getAppIconPath()");
    expect(desktopMain).not.toMatch(/lovepvp/i);
  });
});
