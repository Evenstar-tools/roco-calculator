import { useEffect, useRef, useState } from "react";
import { useLocale } from "../i18n/LocaleContext.jsx";
import { reportImageFailure } from "../runtime/chunk-recovery.js";

const RETRY_DELAYS = [1000, 3000, 8000];

/** 精灵头像：失败后自动重试，仍失败时显示名字；网络恢复时再试一次。 */
export function SpiritImage({ src, name, className, style, ...props }) {
  const { t } = useLocale();
  const [stored, setStored] = useState({ src, attempt: 0, box: null });
  const timer = useRef(null);
  const load = stored.src === src ? stored : { src, attempt: 0, box: null };
  const showingPlaceholder = Boolean(load.box);

  useEffect(() => () => clearTimeout(timer.current), []);
  useEffect(() => {
    if (!showingPlaceholder) return undefined;
    const retry = () => setStored({ src, attempt: 0, box: null });
    window.addEventListener("online", retry);
    return () => window.removeEventListener("online", retry);
  }, [showingPlaceholder, src]);

  function handleError(event) {
    const image = event.currentTarget;
    // 空 alt 的失败图片会塌成零宽内联元素，这里保住版面占位。
    image.dataset.loadRetrying = "";
    if (load.attempt < RETRY_DELAYS.length) {
      const attempt = load.attempt + 1;
      clearTimeout(timer.current);
      // 加入抖动，避免同屏几十张图同时重试。
      timer.current = setTimeout(() => setStored({ src, attempt, box: null }), RETRY_DELAYS[load.attempt] * (0.75 + Math.random() / 2));
      return;
    }
    const { width, height } = image.getBoundingClientRect();
    reportImageFailure();
    setStored({ src, attempt: load.attempt, box: { width, height } });
  }

  if (load.box) {
    const label = name ? t(name) : "";
    return <span className={["spirit-image-fallback", className].filter(Boolean).join(" ")} title={label}
      style={{ ...style, ...(load.box.width ? { width: load.box.width, height: load.box.height } : {}) }}>{label}</span>;
  }
  return <img key={load.attempt} {...props} className={className} style={style} src={src} data-load-retrying={load.attempt ? "" : undefined} onError={handleError} />;
}
