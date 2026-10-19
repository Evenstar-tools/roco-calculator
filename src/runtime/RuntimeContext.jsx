import { createContext, useContext } from "react";
import { getServerRelease } from "../domain/server-environment.js";

const RuntimeContext = createContext({ serverId: "cn", locale: "zh-CN", release: getServerRelease("cn") });

export function RuntimeProvider({ serverId = "cn", locale = "zh-CN", onLocaleChange, onServerChange, onShareConflict, shareRequestId = 0, seasonThemeId, seasonPreview = false, seasonThemePreference = "default", onSeasonThemeChange, children }) {
  return <RuntimeContext.Provider value={{ serverId, locale, release: getServerRelease(serverId), onLocaleChange, onServerChange, onShareConflict, shareRequestId, seasonThemeId, seasonPreview, seasonThemePreference, onSeasonThemeChange }}>
    {children}
  </RuntimeContext.Provider>;
}

export function useRuntime() { return useContext(RuntimeContext); }
