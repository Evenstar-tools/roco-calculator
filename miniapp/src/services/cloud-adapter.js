function assertCloudFileId(fileId, fieldName) {
  if (
    typeof fileId !== "string" ||
    fileId !== fileId.trim() ||
    !/^cloud:\/\/[^\s/]+\/\S+$/.test(fileId)
  ) {
    throw new TypeError(`${fieldName} 必须是精确的微信云文件 ID`);
  }
}

function readCloudFile(taro, fileId) {
  return taro.cloud
    .downloadFile({ fileID: fileId })
    .then(({ tempFilePath }) => {
      if (!tempFilePath) {
        throw new Error(`云文件下载失败：${fileId}`);
      }

      return new Promise((resolve, reject) => {
        taro.getFileSystemManager().readFile({
          filePath: tempFilePath,
          encoding: "utf8",
          success(result) {
            resolve(
              typeof result.data === "string"
                ? result.data
                : String(result.data),
            );
          },
          fail: reject,
        });
      });
    });
}

export function createCloudAdapter(taro, { cloudEnv, manifestFileId }) {
  if (!taro?.cloud || typeof taro.cloud.downloadFile !== "function") {
    throw new TypeError("当前运行环境不支持微信云开发");
  }
  if (typeof cloudEnv !== "string" || cloudEnv.trim() === "") {
    throw new TypeError("cloudEnv 不能为空");
  }
  assertCloudFileId(manifestFileId, "manifestFileId");

  taro.cloud.init({ env: cloudEnv });

  return {
    async downloadManifest() {
      const manifestText = await readCloudFile(taro, manifestFileId);
      return JSON.parse(manifestText);
    },
    async downloadRuntime(fileId) {
      assertCloudFileId(fileId, "runtimeFileId");
      return readCloudFile(taro, fileId);
    },
  };
}
