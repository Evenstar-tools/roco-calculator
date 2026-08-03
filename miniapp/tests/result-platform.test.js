import { describe, expect, test, vi } from "vitest";
import {
  RESULT_TRIGGER_ID,
  restoreResultContext,
} from "../src/platform/result-interaction.js";

describe("result interaction platform adapter", () => {
  test("uses real element focus for H5 without native page scrolling", () => {
    const trigger = { focus: vi.fn() };
    const platform = {
      nextTick: vi.fn(),
      pageScrollTo: vi.fn(),
      showToast: vi.fn(),
    };

    expect(restoreResultContext({ platform, trigger })).toBe(
      "h5-focus",
    );
    expect(trigger.focus).toHaveBeenCalledOnce();
    expect(platform.nextTick).not.toHaveBeenCalled();
  });

  test("restores WeApp context with a stable selector and native announcement", () => {
    let scheduled;
    const platform = {
      nextTick: vi.fn((callback) => {
        scheduled = callback;
      }),
      pageScrollTo: vi.fn(),
      showToast: vi.fn(),
    };

    expect(
      restoreResultContext({ platform, trigger: null }),
    ).toBe("weapp-context");
    expect(platform.nextTick).toHaveBeenCalledOnce();
    scheduled();
    expect(platform.pageScrollTo).toHaveBeenCalledWith({
      duration: 0,
      selector: `#${RESULT_TRIGGER_ID}`,
    });
    expect(platform.showToast).toHaveBeenCalledWith({
      duration: 1500,
      icon: "none",
      title: "已关闭伤害结果，已返回结果栏",
    });
  });
});
