import path from "node:path";
import packageJson from "../package.json" with { type: "json" };
import { createDesktopReleaseAssets } from "./desktop-release-assets.mjs";

const projectRoot = process.cwd();
const version = packageJson.version;
const sourcePath = path.join(projectRoot, "release", `洛克计算器-${version}.exe`);
const outputDirectory = path.join(projectRoot, "installers", `v${version}`);
const result = await createDesktopReleaseAssets({
  outputDirectory,
  sourcePath,
  version,
});

console.log(result.versionedPath);
console.log(result.stablePath);
console.log(result.checksumPath);
