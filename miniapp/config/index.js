const fs = require("node:fs");
const path = require("node:path");
const { defineConfig } = require("@tarojs/cli");

function readLocalConfig() {
  const filePath = path.resolve(__dirname, "..", "local.config.json");

  if (!fs.existsSync(filePath)) {
    return {};
  }

  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

module.exports = defineConfig(async (merge, { mode }) => {
  const localConfig = readLocalConfig();
  const cloudEnv =
    process.env.TARO_APP_CLOUD_ENV ?? localConfig.cloudEnv ?? "";
  const manifestFileId =
    process.env.TARO_APP_MANIFEST_FILE_ID ?? localConfig.manifestFileId ?? "";
  const runtimeSha256 =
    process.env.TARO_APP_RUNTIME_SHA256 ??
    localConfig.runtimeSha256 ??
    "";
  const target = process.env.TARO_ENV ?? "";
  const previewRequested =
    process.env.TARO_APP_PREVIEW_FIXTURE === "1" ||
    process.env.TARO_APP_PREVIEW_FIXTURE === "true";
  const previewFixture = previewRequested && target === "h5";

  if (mode === "production" && !previewFixture) {
    if (!cloudEnv) {
      throw new Error("生产构建缺少 TARO_APP_CLOUD_ENV");
    }
    if (!manifestFileId) {
      throw new Error("生产构建缺少 TARO_APP_MANIFEST_FILE_ID");
    }
    if (!/^[a-f0-9]{64}$/i.test(runtimeSha256)) {
      throw new Error("生产构建缺少有效的 TARO_APP_RUNTIME_SHA256");
    }
    if (!/^cloud:\/\/[^\s/]+\/\S+$/.test(manifestFileId)) {
      throw new Error(
        "TARO_APP_MANIFEST_FILE_ID 必须是精确的微信云文件 ID"
      );
    }
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
