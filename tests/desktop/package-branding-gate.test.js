import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, test } from "vitest";
import {
  assertDesktopIdentity,
  assertNoLegacyBrand,
} from "../../scripts/verify-package-branding.mjs";

describe("desktop package branding gate", () => {
  test("rejects the old brand case-insensitively", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "rock-brand-test-"));
    const file = path.join(directory, "bundle.js");
    await writeFile(file, "legacy LovePvP key", "utf8");
    expect(() => assertNoLegacyBrand([directory])).toThrow(/旧品牌/);
  });

  test("requires the current product, app and package identity", () => {
    expect(() => assertDesktopIdentity({
      name: "rock-calculator",
      build: {
        appId: "cn.rock.calculator",
        artifactName: "洛克计算器${ext}",
        productName: "洛克计算器",
        nsis: {
          shortcutName: "洛克计算器",
          uninstallDisplayName: "洛克计算器",
        },
      },
    })).not.toThrow();
  });
});
