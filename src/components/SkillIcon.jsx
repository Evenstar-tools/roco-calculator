import { useEffect, useRef, useState } from "react";
import { useCalculatorLocale } from "../i18n/calculator-text.js";
import { ElementIcon } from "./ElementIcon.jsx";
import { getWishPowerIconUrl } from "../data/wish-power-icons.js";
import { publicResourceUrl } from "../runtime/public-resource-url.js";
import { reportImageFailure } from "../runtime/chunk-recovery.js";

const RETRY_DELAYS = [1000, 3000, 8000];
const RECOVERABLE_ICON_RE = /^\/(?:global-assets\/)?assets\/skills\/(?:skill_(?:[a-f0-9]{16}|preview_s5_[a-z0-9][a-z0-9_-]*)\.(?:png|webp)|wish-power\/77000(?:0[1-57-9]|1[0-9])\.png)$/u;

function recoverySource(src) {
  try {
    const url = new URL(src, window.location.href);
    // 只刷新 SW 明确认可的单张本地图，不改外链或已有查询参数。
    if (url.origin !== window.location.origin || !/^https?:$/u.test(url.protocol) ||
        url.username || url.password || url.search || !RECOVERABLE_ICON_RE.test(url.pathname)) return src;
    return `${url.pathname}?image-retry=1${url.hash}`;
  } catch {
    return src;
  }
}

function secureIconUrl(value) {
  if (typeof value !== "string") return null;
  if (/^https:\/\//u.test(value)) return value;
  const url = publicResourceUrl(value);
  const root = publicResourceUrl("/assets/skills/");
  return url.startsWith(root) && /^skill_(?:[a-f0-9]{16}|preview_s5_[a-z0-9][a-z0-9_-]*)\.png$/u.test(url.slice(root.length)) ? url : null;
}

export function SkillIcon({ className = "", label = false, loading = "eager", skill, size = 28 }) {
  const { tc, entityName } = useCalculatorLocale();
  const iconUrl = getWishPowerIconUrl(skill) ?? secureIconUrl(skill?.iconUrl);
  // 切换技能时清掉旧图的失败状态、计时器和重试预算，包括 A → B → A。
  return <SkillIconImage key={iconUrl} iconUrl={iconUrl} className={className} label={label}
    alt={label ? tc("{name}图标", { name: entityName("skill", skill) || tc("技能") }) : ""}
    loading={loading} size={size} type={skill?.type} />;
}

function SkillIconImage({ alt, className, iconUrl, label, loading, size, type }) {
  const [load, setLoad] = useState({ attempt: 0, waiting: false, failed: false, reconnect: 0 });
  const timer = useRef(null);
  useEffect(() => () => clearTimeout(timer.current), []);
  useEffect(() => {
    if (!load.waiting && !load.failed) return undefined;
    const retry = () => {
      clearTimeout(timer.current);
      timer.current = null;
      setLoad((previous) => ({ attempt: 0, waiting: false, failed: false, reconnect: previous.reconnect + 1 }));
    };
    window.addEventListener("online", retry);
    return () => window.removeEventListener("online", retry);
  }, [load.waiting, load.failed]);

  function handleError() {
    if (timer.current !== null) return;
    if (load.attempt >= RETRY_DELAYS.length) {
      reportImageFailure();
      setLoad((previous) => ({ ...previous, failed: true }));
      return;
    }
    setLoad((previous) => ({ ...previous, waiting: true }));
    timer.current = setTimeout(() => {
      timer.current = null;
      setLoad((previous) => ({ ...previous, attempt: previous.attempt + 1, waiting: false }));
    }, RETRY_DELAYS[load.attempt] * (0.75 + Math.random() / 2));
  }

  const classes = ["skill-icon", className].filter(Boolean).join(" ");
  const recovering = load.attempt > 0 || load.reconnect > 0;

  if (iconUrl && !load.waiting && !load.failed) {
    return (
      <img
        key={`${load.reconnect}-${load.attempt}`}
        alt={alt}
        className={classes}
        height={size}
        decoding="async"
        loading={recovering ? "eager" : loading}
        onError={handleError}
        src={recovering ? recoverySource(iconUrl) : iconUrl}
        width={size}
      />
    );
  }

  return (
    <span
      aria-hidden={label ? undefined : "true"}
      className={`${classes} skill-icon--fallback`}
      style={{ height: size, width: size }}
    >
      <ElementIcon label={label} size={Math.max(16, Math.round(size * 0.68))} type={type} />
    </span>
  );
}
