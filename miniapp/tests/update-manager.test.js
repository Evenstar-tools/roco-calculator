import { describe, expect, test, vi } from "vitest";
import { setupUpdateManager } from "../src/platform/update-manager.js";

function createUpdateManager() {
  const handlers = {};
  return {
    applyUpdate: vi.fn(),
    handlers,
    onCheckForUpdate: vi.fn((handler) => {
      handlers.check = handler;
    }),
    onUpdateFailed: vi.fn((handler) => {
      handlers.failed = handler;
    }),
    onUpdateReady: vi.fn((handler) => {
      handlers.ready = handler;
    }),
  };
}

describe("miniapp update manager", () => {
  test("does nothing outside the WeChat miniapp runtime", () => {
    const platform = {
      getUpdateManager: vi.fn(),
      showModal: vi.fn(),
    };

    expect(setupUpdateManager({ environment: "h5", platform }))
      .toBe("unsupported");
    expect(platform.getUpdateManager).not.toHaveBeenCalled();
  });

  test("lets the user postpone a ready update without interrupting the calculator", async () => {
    const updateManager = createUpdateManager();
    const platform = {
      getUpdateManager: vi.fn(() => updateManager),
      showModal: vi.fn(async () => ({ cancel: true, confirm: false })),
    };

    expect(setupUpdateManager({ environment: "weapp", platform }))
      .toBe("listening");
    await updateManager.handlers.ready();

    expect(platform.showModal).toHaveBeenCalledWith({
      cancelText: "稍后再说",
      confirmText: "立即更新",
      content: "新版本已经准备好。立即更新会重启小程序；也可以稍后再说，当前计算不会受影响。",
      title: "发现新版本",
    });
    expect(updateManager.applyUpdate).not.toHaveBeenCalled();
  });

  test("restarts into the downloaded package only after explicit confirmation", async () => {
    const updateManager = createUpdateManager();
    const platform = {
      getUpdateManager: vi.fn(() => updateManager),
      showModal: vi.fn(async () => ({ cancel: false, confirm: true })),
    };

    setupUpdateManager({ environment: "weapp", platform });
    await updateManager.handlers.ready();

    expect(updateManager.applyUpdate).toHaveBeenCalledOnce();
  });

  test("explains how to recover when the new package cannot be downloaded", async () => {
    const updateManager = createUpdateManager();
    const platform = {
      getUpdateManager: vi.fn(() => updateManager),
      showModal: vi.fn(async () => ({ confirm: true })),
    };

    setupUpdateManager({ environment: "weapp", platform });
    await updateManager.handlers.failed();

    expect(platform.showModal).toHaveBeenCalledWith({
      confirmText: "知道了",
      content: "新版本下载失败。请彻底关闭小程序后重新打开，当前版本仍可继续使用。",
      showCancel: false,
      title: "暂时无法更新",
    });
  });
});
