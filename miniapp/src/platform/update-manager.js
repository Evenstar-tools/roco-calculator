const UPDATE_READY_MODAL = {
  cancelText: "稍后再说",
  confirmText: "立即更新",
  content: "新版本已经准备好。立即更新会重启小程序；也可以稍后再说，当前计算不会受影响。",
  title: "发现新版本",
};

const UPDATE_FAILED_MODAL = {
  confirmText: "知道了",
  content: "新版本下载失败。请彻底关闭小程序后重新打开，当前版本仍可继续使用。",
  showCancel: false,
  title: "暂时无法更新",
};

export function setupUpdateManager({ environment, platform }) {
  if (environment !== "weapp" || typeof platform?.getUpdateManager !== "function") {
    return "unsupported";
  }

  const updateManager = platform.getUpdateManager();

  updateManager.onUpdateReady(async () => {
    const result = await platform.showModal(UPDATE_READY_MODAL);
    if (result?.confirm) {
      updateManager.applyUpdate();
    }
  });

  updateManager.onUpdateFailed(() => platform.showModal(UPDATE_FAILED_MODAL));

  return "listening";
}
