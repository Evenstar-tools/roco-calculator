import { createContext, useContext } from "react";
import { getServerRelease } from "../domain/server-environment.js";
import { IS_S5_CN_BUILD } from "./preview-channel.js";

function runtimeRelease(serverId) {
  const release = getServerRelease(serverId);
  // Preserve the saved calculation contract; this identifies the current reviewed catalog.
  return serverId === "cn" && IS_S5_CN_BUILD ? { ...release, seasonId: "S5", seasonLabel: "S5" } : release;
}

const RuntimeContext = createContext({ serverId: "cn", locale: "zh-CN", release: runtimeRelease("cn") });

export function RuntimeProvider({ serverId = "cn", locale = "zh-CN", onLocaleChange, onServerChange, onShareConflict, shareRequestId = 0, seasonThemeId, seasonPreview = false, seasonThemePreference = "default", onSeasonThemeChange, children }) {
  return <RuntimeContext.Provider value={{ serverId, locale, release: runtimeRelease(serverId), onLocaleChange, onServerChange, onShareConflict, shareRequestId, seasonThemeId, seasonPreview, seasonThemePreference, onSeasonThemeChange }}>
    {children}
  </RuntimeContext.Provider>;
}

export function useRuntime() { return useContext(RuntimeContext); }
