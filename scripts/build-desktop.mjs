import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import {
  verifyPackagedBundle,
  verifySourceBundle,
} from "./verify-package-branding.mjs";

const projectRoot = process.cwd();
const builderCli = path.join(
  projectRoot,
  "node_modules",
  "electron-builder",
  "out",
  "cli",
  "cli.js",
);
const outputDirectory = path.join(projectRoot, "release");
const extractedElectron = path.join(outputDirectory, "win-unpacked.tmp");
const electronVersion = JSON.parse(
  readFileSync(path.join(projectRoot, "node_modules", "electron", "package.json"), "utf8"),
).version;

verifySourceBundle(projectRoot);

function runBuilder(argumentsList) {
  const result = spawnSync(process.execPath, [builderCli, ...argumentsList], {
    cwd: projectRoot,
    env: process.env,
    stdio: "inherit",
  });
  return result.status ?? 1;
}

const baseArguments = ["--win", "nsis"];
function isReusableElectron(directory) {
  const versionPath = path.join(directory, "version");
  if (
    !existsSync(path.join(directory, "electron.exe")) ||
    !existsSync(path.join(directory, "resources.pak")) ||
    !existsSync(versionPath)
  ) {
    return false;
  }
  return readFileSync(versionPath, "utf8").trim() === electronVersion;
}

const hasReusableElectron = isReusableElectron(extractedElectron);

if (hasReusableElectron) {
  const status = runBuilder([
      ...baseArguments,
      `--config.electronDist=${extractedElectron}`,
      `--config.directories.output=${outputDirectory}`,
    ]);
  if (status === 0) verifyPackagedBundle(projectRoot);
  process.exit(status);
}

const initialStatus = runBuilder(baseArguments);
if (initialStatus === 0) {
  verifyPackagedBundle(projectRoot);
  process.exit(0);
}

const extractionCompleted = isReusableElectron(extractedElectron);
if (!extractionCompleted) process.exit(initialStatus);

const retryStatus = runBuilder([
    ...baseArguments,
    `--config.electronDist=${extractedElectron}`,
    `--config.directories.output=${outputDirectory}`,
  ]);
if (retryStatus === 0) verifyPackagedBundle(projectRoot);
process.exit(retryStatus);
