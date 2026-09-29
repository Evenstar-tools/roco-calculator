import { useEffect, useRef } from "react";
import { metrics } from "./metrics.js";

// 只统计关闭到打开的转换；重复渲染和 StrictMode 不增加次数。
export function useFeatureMetrics(activeFeatures) {
  const previous = useRef(new Set());
  const visited = useRef(new Set());
  const initialized = useRef(false);
  useEffect(() => {
    const current = new Set(activeFeatures.filter(Boolean));
    for (const feature of current) {
      if (!previous.current.has(feature)) {
        metrics.track("feature_view", feature, { entry_source: !initialized.current ? "initial" : visited.current.has(feature) ? "reopen" : "navigate" });
        visited.current.add(feature);
      }
    }
    previous.current = current;
    initialized.current = true;
  });
}
