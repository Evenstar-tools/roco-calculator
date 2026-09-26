import { useEffect, useRef } from "react";
import { metrics } from "./metrics.js";

// 只统计关闭到打开的转换；重复渲染和 StrictMode 不增加次数。
export function useFeatureMetrics(activeFeatures) {
  const previous = useRef(new Set());
  useEffect(() => {
    const current = new Set(activeFeatures.filter(Boolean));
    for (const feature of current) {
      if (!previous.current.has(feature)) metrics.track("feature_view", feature);
    }
    previous.current = current;
  });
}
