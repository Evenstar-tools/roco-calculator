import { createHash } from "node:crypto";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, test } from "vitest";

import { createDesktopReleaseAssets } from
  "../../scripts/desktop-release-assets.mjs";

describe("desktop release assets", () => {
  test("creates a fixed latest installer alias beside the versioned package", async () => {
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
    expect(path.basename(result.stablePath)).toBe("rock-calculator-latest.exe");
    expect(await readFile(result.versionedPath)).toEqual(source);
    expect(await readFile(result.stablePath)).toEqual(source);

    const checksum = createHash("sha256").update(source).digest("hex");
    expect(await readFile(result.checksumPath, "utf8")).toBe(
      `${checksum}  洛克计算器-9.9.9.exe\n` +
      `${checksum}  rock-calculator-latest.exe\n`,
    );
  });
});
