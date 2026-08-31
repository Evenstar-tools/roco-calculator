import { createHash } from "node:crypto";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, test } from "vitest";

import { createDesktopReleaseAssets } from
  "../../scripts/desktop-release-assets.mjs";

describe("desktop release assets", () => {
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
