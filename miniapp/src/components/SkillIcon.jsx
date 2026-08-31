import { useEffect, useState } from "react";
import { Image, View } from "@tarojs/components";
import ElementIcon from "./ElementIcon.jsx";

function isSecureIconUrl(value) {
  return typeof value === "string" && /^https:\/\//u.test(value);
}

export default function SkillIcon({ className = "", skill }) {
  const iconUrl = isSecureIconUrl(skill?.iconUrl) ? skill.iconUrl : null;
  const [loadFailed, setLoadFailed] = useState(false);

  useEffect(() => {
    setLoadFailed(false);
  }, [iconUrl]);

  if (iconUrl && !loadFailed) {
    return (
      <Image
        aria-hidden="true"
        className={["skill-icon", className].filter(Boolean).join(" ")}
        mode="aspectFill"
        onError={() => setLoadFailed(true)}
        src={iconUrl}
      />
    );
  }

  return (
    <View
      aria-hidden="true"
      className={[
        "skill-icon",
        "skill-icon--fallback",
        className,
      ].filter(Boolean).join(" ")}
    >
      <ElementIcon type={skill?.type} />
    </View>
  );
}
