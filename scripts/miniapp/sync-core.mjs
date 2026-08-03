import {
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  mirrorPathFor,
  normalizeManifest,
  SHARED_SOURCE_MANIFEST,
} from "./shared-source-manifest.mjs";

export function syncSharedCore({
  manifest = SHARED_SOURCE_MANIFEST,
  sourceRoot = process.cwd(),
  targetRoot = path.join(sourceRoot, "miniapp/src/shared"),
} = {}) {
  const resolvedSourceRoot = path.resolve(sourceRoot);
  const resolvedTargetRoot = path.resolve(targetRoot);
  const { shared } = normalizeManifest(manifest);

  for (const directory of ["domain", "state"]) {
    rmSync(path.join(resolvedTargetRoot, directory), {
      force: true,
      recursive: true,
    });
  }

  for (const sourcePath of shared) {
    const mirrorPath = mirrorPathFor(sourcePath).replace(
      /^miniapp\/src\/shared\//,
      "",
    );
    const destination = path.join(resolvedTargetRoot, mirrorPath);
    mkdirSync(path.dirname(destination), { recursive: true });
    writeFileSync(
      destination,
      readFileSync(path.join(resolvedSourceRoot, sourcePath)),
    );
  }

  return [...shared];
}

const scriptPath = fileURLToPath(import.meta.url);

if (process.argv[1] && path.resolve(process.argv[1]) === scriptPath) {
  const sourceRoot = path.resolve(path.dirname(scriptPath), "../..");
  const files = syncSharedCore({ sourceRoot });
  process.stdout.write(`Synced ${files.length} shared core files.\n`);
}
