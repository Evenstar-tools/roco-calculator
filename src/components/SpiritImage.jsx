import { useCallback, useEffect, useRef, useState } from "react";
import { useLocale } from "../i18n/LocaleContext.jsx";
import { localizeToolText } from "../i18n/useToolLocale.js";
import { reportImageFailure } from "../runtime/chunk-recovery.js";

const RETRY_DELAYS = [1000, 3000, 8000];
const STABLE_PORTRAIT_RE = /^\/(?:global-assets\/)?assets\/spirits\/spirit_[a-f0-9]{16}\.(?:png|webp)$/;

function recoverySource(src) {
  try {
    const url = new URL(src, window.location.href);
    // 与 SW 的单张精灵图恢复协议一致；外链和其他查询参数保持原样。
    if (!/^https?:$/.test(url.protocol) || url.origin !== window.location.origin ||
        url.username || url.password || url.search || !STABLE_PORTRAIT_RE.test(url.pathname)) return src;
    return `${url.pathname}?image-retry=1${url.hash}`;
  } catch {
    return src;
  }
}

/** 精灵头像：失败后自动重试，仍失败时显示名字；网络恢复时再试一次。 */
export function SpiritImage({ decoding = "async", loading = "eager", ...props }) {
  return <SpiritImageContent key={props.src} {...props} decoding={decoding} loading={loading} />;
}

function SpiritImageContent({ src, name, className, style, showLoadingName = false, ...props }) {
  const { locale } = useLocale();
  const [stored, setStored] = useState({ src, attempt: 0, box: null });
  const timer = useRef(null);
  const [imageReady, setImageReady] = useState(false);
  const captureImage = useCallback((image) => {
    if (showLoadingName && image?.complete && image.naturalWidth > 0) setImageReady(true);
  }, [showLoadingName]);
  const load = stored.src === src ? stored : { src, attempt: 0, box: null };
  const showingPlaceholder = Boolean(load.box);
  const recovering = load.attempt > 0 || load.recovering;

  useEffect(() => () => clearTimeout(timer.current), []);
  useEffect(() => {
    if (!showingPlaceholder) return undefined;
    const retry = () => setStored({ src, attempt: 0, box: null, recovering: true });
    window.addEventListener("online", retry);
    return () => window.removeEventListener("online", retry);
  }, [showingPlaceholder, src]);

  function handleError(event) {
    if (showLoadingName) setImageReady(false);
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

  const label = (showLoadingName || load.box) && name ? localizeToolText(name, locale) : "";
  if (load.box) {
    return <span className={["spirit-image-fallback", className].filter(Boolean).join(" ")} title={label} aria-hidden={showLoadingName || undefined}
      style={{ ...style, ...(load.box.width ? { width: load.box.width, height: load.box.height } : {}) }}>{label}</span>;
  }
  const image = <img key={load.attempt} {...props} className={className} style={style} src={recovering ? recoverySource(src) : src} data-load-retrying={recovering ? "" : undefined} ref={showLoadingName ? captureImage : undefined}
    onLoad={(event) => { if (showLoadingName) setImageReady(true); props.onLoad?.(event); }} onError={handleError} />;
  if (!showLoadingName) return image;
  return <span className={["spirit-image-frame", className].filter(Boolean).join(" ")} style={style} aria-hidden="true">
    {!imageReady ? <span className="spirit-image-fallback">{label}</span> : null}
    {image}
  </span>;
}
