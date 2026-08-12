const fs = require("node:fs");
const path = require("node:path");

const ENVIRONMENT_FIELDS = {
  appId: ["TARO_APP_ID", "APP_ID", "appId"],
  cloudEnv: ["TARO_APP_CLOUD_ENV", "CLOUD_ENV", "cloudEnv"],
  manifestFileId: [
    "TARO_APP_MANIFEST_FILE_ID",
    "MANIFEST_FILE_ID",
    "manifestFileId",
  ],
  runtimeSha256: [
    "TARO_APP_RUNTIME_SHA256",
    "RUNTIME_SHA256",
    "runtimeSha256",
  ],
};

function firstEnvironmentValue(environment, names) {
  for (const name of names) {
    if (environment[name] !== undefined) return environment[name];
  }
  return undefined;
}

function loadReleaseConfig({ miniappRoot, environment = process.env }) {
  const localConfigFile = path.join(miniappRoot, "local.config.json");
  const localConfig = fs.existsSync(localConfigFile)
    ? JSON.parse(fs.readFileSync(localConfigFile, "utf8"))
    : {};
  const projectConfigFile = path.join(miniappRoot, "project.config.json");
  const projectConfig = fs.existsSync(projectConfigFile)
    ? JSON.parse(fs.readFileSync(projectConfigFile, "utf8"))
    : {};

  return Object.fromEntries(Object.entries(ENVIRONMENT_FIELDS).map(
    ([field, names]) => [
      field,
      firstEnvironmentValue(environment, names)
        ?? localConfig[field]
        ?? (field === "appId" ? projectConfig.appid : undefined)
        ?? "",
    ],
  ));
}

function normalizedString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function preflightErrors(config) {
  const errors = [];
  const appId = normalizedString(config?.appId);
  if (!/^wx[a-f0-9]{16}$/.test(appId) || appId === "wx0000000000000000") {
    errors.push("appId 缺失、为 touristappid/示例值或格式无效");
  }

  return errors;
}

function verifyPreflight(config) {
  const errors = preflightErrors(config);
  if (errors.length > 0) {
    throw new Error(`小程序生产配置预检失败:\n- ${errors.join("\n- ")}`);
  }
  return true;
}

function applyTaroAppId(config, environment = process.env) {
  const appId = normalizedString(config?.appId);
  if (appId) environment.TARO_APP_ID = appId;
  return environment;
}

module.exports = {
  applyTaroAppId,
  loadReleaseConfig,
  preflightErrors,
  verifyPreflight,
};
