import { createContext, useContext, useEffect, useState } from "react";

const PluginAccessContext = createContext(false);
const SEARCH_INPUTS = 'input[type="search"], input[role="combobox"], input[data-search]';

// Each deliberate entry click grants one navigation; the introduction consumes it.
export function grantPluginEntry() {
  document.cookie = `roco-cn-plugin-entry=1; Max-Age=30; Path=/; SameSite=Strict${location.protocol === "https:" ? "; Secure" : ""}`;
}

export function usePluginAccess() {
  return useContext(PluginAccessContext);
}

export function PluginAccess({ enabled, children }) {
  const [unlocks, setUnlocks] = useState(0);
  const [notice, setNotice] = useState(false);
  useEffect(() => {
    if (!enabled) return undefined;
    const unlock = event => {
      const input = event.target;
      if (event.key !== "Enter" || event.repeat || event.isComposing || event.keyCode === 229 ||
          !(input instanceof HTMLInputElement) || input.disabled || input.readOnly ||
          !input.matches(SEARCH_INPUTS) || input.value !== "龙骑士") return;
      event.preventDefault();
      event.stopPropagation();
      setUnlocks(count => count + 1);
      setNotice(true);
    };
    // Capture before search pickers handle Enter to avoid selecting a search result.
    document.addEventListener("keydown", unlock, true);
    return () => document.removeEventListener("keydown", unlock, true);
  }, [enabled]);
  useEffect(() => {
    if (!notice) return undefined;
    const timer = setTimeout(() => setNotice(false), 2200);
    return () => clearTimeout(timer);
  }, [notice, unlocks]);
  return <PluginAccessContext.Provider value={enabled && unlocks > 0}>
    {children}
    {enabled && notice && <div className="toast" role="status" style={{ zIndex: 3000, pointerEvents: "none" }}>某处的大门已开启</div>}
  </PluginAccessContext.Provider>;
}
