import { existsSync } from "node:fs";
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
const hasReusableElectron =
  existsSync(path.join(extractedElectron, "electron.exe")) &&
  existsSync(path.join(extractedElectron, "resources.pak"));

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

const extractionCompleted =
  existsSync(path.join(extractedElectron, "electron.exe")) &&
  existsSync(path.join(extractedElectron, "resources.pak"));
if (!extractionCompleted) process.exit(initialStatus);

const retryStatus = runBuilder([
    ...baseArguments,
    `--config.electronDist=${extractedElectron}`,
    `--config.directories.output=${outputDirectory}`,
  ]);
if (retryStatus === 0) verifyPackagedBundle(projectRoot);
process.exit(retryStatus);
