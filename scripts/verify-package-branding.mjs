import { extractAll } from "@electron/asar";
import {
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const LEGACY_BRAND = Buffer.from("lovepvp", "ascii");

function filesUnder(target) {
  if (!statSync(target).isDirectory()) return [target];
  return readdirSync(target, { withFileTypes: true }).flatMap((entry) =>
    filesUnder(path.join(target, entry.name)),
  );
}

function containsLegacyBrand(file) {
  return readFileSync(file).toString("latin1").toLowerCase().includes(
    LEGACY_BRAND.toString("latin1"),
  );
}

export function assertNoLegacyBrand(targets) {
  const offenders = targets.flatMap(filesUnder).filter(containsLegacyBrand);
  if (offenders.length > 0) {
    throw new Error(`桌面包仍包含旧品牌文本：\n${offenders.join("\n")}`);
  }
}

export function assertDesktopIdentity(packageJson) {
  const identity = {
    name: packageJson.name,
    appId: packageJson.build?.appId,
    productName: packageJson.build?.productName,
    artifactName: packageJson.build?.artifactName,
    shortcutName: packageJson.build?.nsis?.shortcutName,
    uninstallDisplayName: packageJson.build?.nsis?.uninstallDisplayName,
  };
  if (
    identity.name !== "rock-calculator" ||
    identity.appId !== "cn.rock.calculator" ||
    identity.productName !== "洛克计算器" ||
    Object.values(identity).some((value) => /lovepvp/i.test(String(value)))
  ) {
    throw new Error(`桌面应用标识不完整：${JSON.stringify(identity)}`);
  }
}

export function verifySourceBundle(projectRoot) {
  const packageJsonPath = path.join(projectRoot, "package.json");
  assertDesktopIdentity(JSON.parse(readFileSync(packageJsonPath, "utf8")));
  assertNoLegacyBrand([
    packageJsonPath,
    path.join(projectRoot, "desktop"),
    path.join(projectRoot, "dist", "client"),
  ]);
}

export function verifyPackagedBundle(projectRoot) {
  const resources = path.join(projectRoot, "release", "win-unpacked", "resources");
  const asarPath = path.join(resources, "app.asar");
  const extracted = mkdtempSync(path.join(tmpdir(), "rock-calculator-asar-"));
  try {
    extractAll(asarPath, extracted);
    assertNoLegacyBrand([extracted, path.join(resources, "client")]);
  } finally {
    rmSync(extracted, { force: true, recursive: true });
  }
}

const isDirectRun = process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isDirectRun) {
  const projectRoot = process.cwd();
  if (process.argv.includes("--packaged")) verifyPackagedBundle(projectRoot);
  else verifySourceBundle(projectRoot);
  console.log("桌面包品牌检查通过");
}
