import { createHash } from "node:crypto";
import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import packageJson from "../package.json" with { type: "json" };

const projectRoot = process.cwd();
const version = packageJson.version;
const fileName = `洛克计算器-${version}.exe`;
const sourcePath = path.join(projectRoot, "release", fileName);
const outputDirectory = path.join(projectRoot, "installers", `v${version}`);
const outputPath = path.join(outputDirectory, fileName);
const checksumPath = path.join(outputDirectory, "SHA256SUMS.txt");

await mkdir(outputDirectory, { recursive: true });
await copyFile(sourcePath, outputPath);
const checksum = createHash("sha256")
  .update(await readFile(outputPath))
  .digest("hex");
await writeFile(checksumPath, `${checksum}  ${fileName}\n`, "utf8");
console.log(outputPath);
console.log(checksumPath);
