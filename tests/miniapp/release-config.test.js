import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, test } from "vitest";

import releaseConfig from "../../scripts/miniapp/release-config.cjs";
import { runReleasePreflight } from "../../scripts/miniapp/verify-release.mjs";

const {
  applyTaroAppId,
  loadReleaseConfig,
  verifyPreflight,
} = releaseConfig;

const temporaryDirectories = [];
const validLocalConfig = {
  appId: "wx1234567890abcdef",
  cloudEnv: "cloud-prod-1a2b",
  manifestFileId: "cloud://cloud-prod-1a2b/data/manifest.json",
  runtimeSha256: "a".repeat(64),
};

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    fs.rmSync(directory, { force: true, recursive: true });
  }
});

function createMiniappRoot(config = validLocalConfig) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "miniapp-preflight-"));
  temporaryDirectories.push(root);
  const miniappRoot = path.join(root, "miniapp");
  fs.mkdirSync(miniappRoot, { recursive: true });
  if (config !== null) {
    fs.writeFileSync(
      path.join(miniappRoot, "local.config.json"),
      JSON.stringify(config),
    );
  }
  return { miniappRoot, root };
}

describe("miniapp production configuration preflight", () => {
  test("loads ignored local config and wires its AppID into Taro", () => {
    const { miniappRoot } = createMiniappRoot();
    const config = loadReleaseConfig({ environment: {}, miniappRoot });
    const taroEnvironment = {};

    applyTaroAppId(config, taroEnvironment);

    expect(config).toEqual(validLocalConfig);
    expect(taroEnvironment).toEqual({ TARO_APP_ID: validLocalConfig.appId });
  });

  test("uses the imported project AppID when no local release config exists", () => {
    const { miniappRoot } = createMiniappRoot(null);
    fs.writeFileSync(
      path.join(miniappRoot, "project.config.json"),
      JSON.stringify({ appid: validLocalConfig.appId }),
    );

    expect(loadReleaseConfig({ environment: {}, miniappRoot }).appId).toBe(
      validLocalConfig.appId,
    );
  });

  test("requires only the AppID for a bundled-data production build", () => {
    expect(() => verifyPreflight({})).toThrow(/appId/u);
    expect(() => verifyPreflight({
      appId: validLocalConfig.appId,
    })).not.toThrow();
  });

  test("runs preflight without requiring build artifacts", () => {
    const { root } = createMiniappRoot();
    expect(runReleasePreflight(root)).toBe(true);
  });

  test("uploads only the compiled mini-program instead of development sources", () => {
    const projectConfig = JSON.parse(fs.readFileSync(
      path.resolve("miniapp/project.config.json"),
      "utf8",
    ));

    expect(projectConfig.miniprogramRoot).toBe("dist/");
    expect(projectConfig.packOptions.ignore).toContainEqual({
      type: "folder",
      value: "src",
    });
  });
});
