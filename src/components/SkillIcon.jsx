import { useState } from "react";
import { ElementIcon } from "./ElementIcon.jsx";
import { getWishPowerIconUrl } from "../data/wish-power-icons.js";
import { publicResourceUrl } from "../runtime/public-resource-url.js";

function secureIconUrl(value) {
  if (typeof value !== "string") return null;
  if (/^https:\/\//u.test(value)) return value;
  const url = publicResourceUrl(value);
  const root = publicResourceUrl("/assets/skills/");
  return url.startsWith(root) && /^skill_[a-f0-9]{16}\.png$/u.test(url.slice(root.length)) ? url : null;
}

export function SkillIcon({ className = "", label = false, skill, size = 28 }) {
  const iconUrl = getWishPowerIconUrl(skill?.id) ?? secureIconUrl(skill?.iconUrl);
  const [failedUrl, setFailedUrl] = useState(null);
  const loadFailed = iconUrl !== null && failedUrl === iconUrl;

  const classes = ["skill-icon", className].filter(Boolean).join(" ");

  if (iconUrl && !loadFailed) {
    return (
      <img
        alt={label ? `${skill?.name ?? "技能"}图标` : ""}
        className={classes}
        height={size}
        loading="lazy"
        onError={() => setFailedUrl(iconUrl)}
        src={iconUrl}
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
      <ElementIcon label={label} size={Math.max(16, Math.round(size * 0.68))} type={skill?.type} />
    </span>
  );
}
