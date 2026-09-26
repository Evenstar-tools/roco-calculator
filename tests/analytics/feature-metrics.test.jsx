import { StrictMode } from "react";
import { renderHook } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import { useFeatureMetrics } from "../../src/analytics/use-feature-metrics.js";
import { metrics } from "../../src/analytics/metrics.js";

test("feature opens count once through strict effects and rerenders, then again after reopening", () => {
  const track = vi.spyOn(metrics, "track").mockImplementation(() => {});
  try {
    const hook = renderHook(({ open }) => useFeatureMetrics([open && "skills"]), {
      initialProps: { open: true }, wrapper: StrictMode,
    });
    hook.rerender({ open: true });
    expect(track).toHaveBeenCalledTimes(1);
    hook.rerender({ open: false });
    hook.rerender({ open: true });
    expect(track).toHaveBeenCalledTimes(2);
    expect(track).toHaveBeenLastCalledWith("feature_view", "skills");
  } finally { track.mockRestore(); }
});
