import { createHash } from "node:crypto";
import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

export async function createDesktopReleaseAssets({
  outputDirectory,
  sourcePath,
  version,
}) {
  const versionedFileName = `洛克计算器-${version}.exe`;
  const stableFileName = "rock-calculator-latest.exe";
  const versionedPath = path.join(outputDirectory, versionedFileName);
  const stablePath = path.join(outputDirectory, stableFileName);
  const checksumPath = path.join(outputDirectory, "SHA256SUMS.txt");

  await mkdir(outputDirectory, { recursive: true });
  await copyFile(sourcePath, versionedPath);
  await copyFile(sourcePath, stablePath);

  const checksum = createHash("sha256")
    .update(await readFile(versionedPath))
    .digest("hex");
  await writeFile(
    checksumPath,
    `${checksum}  ${versionedFileName}\n` +
      `${checksum}  ${stableFileName}\n`,
    "utf8",
  );

  return { checksum, checksumPath, stablePath, versionedPath };
}
