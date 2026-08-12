const path = require("node:path");
const { defineConfig } = require("@tarojs/cli");
const {
  applyTaroAppId,
  loadReleaseConfig,
  verifyPreflight,
} = require("../../scripts/miniapp/release-config.cjs");

module.exports = defineConfig(async (merge, { mode }) => {
  const releaseConfig = loadReleaseConfig({
    environment: process.env,
    miniappRoot: path.resolve(__dirname, ".."),
  });
  const { cloudEnv, manifestFileId, runtimeSha256 } = releaseConfig;
  applyTaroAppId(releaseConfig, process.env);
  const target = process.env.TARO_ENV ?? "";
  const previewRequested =
    process.env.TARO_APP_PREVIEW_FIXTURE === "1" ||
    process.env.TARO_APP_PREVIEW_FIXTURE === "true";
  const previewFixture = previewRequested && target === "h5";

  if (mode === "production" && !previewFixture) {
    verifyPreflight(releaseConfig);
  }

  const baseConfig = {
    projectName: "rock-calculator-miniapp",
    date: "2026-07-29",
    designWidth: 390,
    deviceRatio: {
      390: 2
    },
    sourceRoot: "src",
    outputRoot: "dist",
    framework: "react",
    compiler: "vite",
    cache: {
      enable: true
    },
    defineConstants: {
      TARO_APP_CLOUD_ENV: JSON.stringify(cloudEnv),
      TARO_APP_MANIFEST_FILE_ID: JSON.stringify(manifestFileId),
      TARO_APP_RUNTIME_SHA256: JSON.stringify(
        runtimeSha256.toLowerCase()
      ),
      TARO_APP_TARGET: JSON.stringify(target),
      TARO_APP_PREVIEW_FIXTURE: JSON.stringify(
        previewFixture ? "1" : "0"
      )
    },
    mini: {
      postcss: {
        pxtransform: {
          enable: true,
          config: {}
        },
        cssModules: {
          enable: false,
          config: {
            namingPattern: "module",
            generateScopedName: "[name]__[local]___[hash:base64:5]"
          }
        }
      }
    },
    h5: {
      publicPath: "/",
      staticDirectory: "static"
    }
  };

  const environmentConfig =
    mode === "development" ? require("./dev") : require("./prod");

  return merge({}, baseConfig, environmentConfig);
});
