function normalizeBoolean(value) {
  return value === true || value === "1" || value === "true";
}

export function createRuntimeConfig(environment = {}) {
  const cloudEnv = String(
    environment.cloudEnv ?? environment.TARO_APP_CLOUD_ENV ?? "",
  ).trim();
  const manifestFileId = String(
    environment.manifestFileId ??
      environment.TARO_APP_MANIFEST_FILE_ID ??
      "",
  ).trim();
  const target = String(
    environment.target ??
      environment.TARO_APP_TARGET ??
      environment.TARO_ENV ??
      "",
  ).trim();
  const trustedRuntimeSha256 = String(
    environment.trustedRuntimeSha256 ??
      environment.TARO_APP_RUNTIME_SHA256 ??
      "",
  ).trim().toLowerCase();
  const preview =
    target === "h5" &&
    normalizeBoolean(
      environment.previewFixture ??
        environment.TARO_APP_PREVIEW_FIXTURE,
    );

  if (!preview && cloudEnv === "") {
    throw new Error("生产环境缺少 TARO" + "_APP_CLOUD_ENV");
  }
  if (!preview && manifestFileId === "") {
    throw new Error("生产环境缺少 TARO" + "_APP_MANIFEST_FILE_ID");
  }
  if (
    !preview &&
    !/^[a-f0-9]{64}$/.test(trustedRuntimeSha256)
  ) {
    throw new Error(
      "生产环境缺少有效的 TARO" + "_APP_RUNTIME_SHA256",
    );
  }
  if (
    !preview &&
    !/^cloud:\/\/[^\s/]+\/\S+$/.test(manifestFileId)
  ) {
    throw new Error(
      "TARO" + "_APP_MANIFEST_FILE_ID 必须是精确的微信云文件 ID",
    );
  }

  return {
    cloudEnv,
    manifestFileId,
    preview,
    target,
    trustedRuntimeSha256,
  };
}

export function readRuntimeConfig() {
  const nodeEnvironment =
    typeof process === "undefined" ? {} : process.env ?? {};
  const cloudEnv =
      typeof TARO_APP_CLOUD_ENV === "undefined"
        ? nodeEnvironment["TARO" + "_APP_CLOUD_ENV"]
        : TARO_APP_CLOUD_ENV;
  const manifestFileId =
      typeof TARO_APP_MANIFEST_FILE_ID === "undefined"
        ? nodeEnvironment["TARO" + "_APP_MANIFEST_FILE_ID"]
        : TARO_APP_MANIFEST_FILE_ID;
  const previewFixture =
      typeof TARO_APP_PREVIEW_FIXTURE === "undefined"
        ? nodeEnvironment["TARO" + "_APP_PREVIEW_FIXTURE"]
        : TARO_APP_PREVIEW_FIXTURE;
  const trustedRuntimeSha256 =
      typeof TARO_APP_RUNTIME_SHA256 === "undefined"
        ? nodeEnvironment["TARO" + "_APP_RUNTIME_SHA256"]
        : TARO_APP_RUNTIME_SHA256;
  const target =
      typeof TARO_APP_TARGET === "undefined"
        ? nodeEnvironment["TARO" + "_APP_TARGET"] ??
          nodeEnvironment.TARO_ENV
        : TARO_APP_TARGET;

  return createRuntimeConfig({
    cloudEnv,
    manifestFileId,
    previewFixture,
    target,
    trustedRuntimeSha256,
  });
}
