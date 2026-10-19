import { createContext, useContext, useLayoutEffect, useState } from "react";
import { readSeasonThemePreference, writeSeasonThemePreference } from "../state/season-theme.js";
import { getSeasonTheme, getSeasonThemeVariables } from "./season-themes.js";

const SeasonThemeContext = createContext({ preference: "default", season: getSeasonTheme("s4") });

export function SeasonThemeProvider({ children }) {
  const [preference, setPreference] = useState(readSeasonThemePreference);
  const season = getSeasonTheme(preference);

  useLayoutEffect(() => {
    document.documentElement.dataset.season = season.id;
    for (const [key, value] of Object.entries(getSeasonThemeVariables(season.id))) {
      document.documentElement.style.setProperty(key, value);
    }
  }, [season]);

  function changeSeasonTheme(value) {
    setPreference(writeSeasonThemePreference(value));
  }

  return <SeasonThemeContext.Provider value={{ preference, season, onSeasonThemeChange: changeSeasonTheme }}>
    {children}
  </SeasonThemeContext.Provider>;
}

export function useSeasonTheme() {
  return useContext(SeasonThemeContext);
}
