import { createContext, useContext, useEffect, useState } from "react";

export const PRESET_BROWSE_STORAGE_KEY = "rock-calculator.settings.preset-browse.v1";
const PresetBrowseContext = createContext({ enabled: false, spiritIds: new Set(), loading: false, error: "", setEnabled: () => {} });

export function PresetBrowseProvider({ children }) {
  const [enabled, updateEnabled] = useState(() => {
    try { return localStorage.getItem(PRESET_BROWSE_STORAGE_KEY) === "1"; } catch { return false; }
  });
  const [catalog, setCatalog] = useState({ spiritIds: new Set(), loading: true, error: "" });

  useEffect(() => {
    if (!enabled) return undefined;
    const controller = new AbortController();
    let active = true;
    fetch("/data/presets/pvp-popular-configs.json", { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error("预设读取失败，请关闭后重试");
        const library = await response.json();
        if (!Array.isArray(library.entries)) throw new Error("预设格式无效，请关闭后重试");
        return new Set(library.entries.map((entry) => entry.spiritId));
      })
      .then((spiritIds) => { if (active) setCatalog({ spiritIds, loading: false, error: "" }); })
      .catch((error) => {
        if (active) setCatalog({ spiritIds: new Set(), loading: false, error: error.message });
      });
    return () => { active = false; controller.abort(); };
  }, [enabled]);

  function setEnabled(next) {
    updateEnabled(next);
    if (next) setCatalog({ spiritIds: new Set(), loading: true, error: "" });
    try { localStorage.setItem(PRESET_BROWSE_STORAGE_KEY, next ? "1" : "0"); } catch { /* 当前会话仍可使用开关。 */ }
  }

  return <PresetBrowseContext.Provider value={{ ...catalog, enabled, setEnabled }}>{children}</PresetBrowseContext.Provider>;
}

export function usePresetBrowseMode() {
  return useContext(PresetBrowseContext);
}
