import { createContext, useContext, useEffect, useLayoutEffect, useState } from "react";
import { readClassicCalculatorColorsSetting, readLastRandomSeasonTheme, readSeasonThemePreference, writeClassicCalculatorColorsSetting, writeLastRandomSeasonTheme, writeSeasonThemePreference } from "../state/season-theme.js";
import { getSeasonTheme, getSeasonThemeVariables, normalizeSeasonThemePreference, pickRandomSeasonThemeId } from "./season-themes.js";

const SeasonThemeContext = createContext({ preference: "default", season: getSeasonTheme("s4"), classicCalculatorColorsEnabled: false });

function createSelection(preference, excludeId) {
  return { preference, themeId: preference === "random" ? pickRandomSeasonThemeId(Math.random, excludeId) : getSeasonTheme(preference).id };
}

export function SeasonThemeProvider({ children }) {
  const [selection, setSelection] = useState(() => createSelection(readSeasonThemePreference(), readLastRandomSeasonTheme()));
  const [classicCalculatorColorsEnabled, setClassicCalculatorColorsEnabled] = useState(readClassicCalculatorColorsSetting);
  const { preference, themeId } = selection;
  const season = getSeasonTheme(themeId);

  useLayoutEffect(() => {
    document.documentElement.dataset.season = season.id;
    for (const [key, value] of Object.entries(getSeasonThemeVariables(season.id))) {
      document.documentElement.style.setProperty(key, value);
    }
  }, [season]);

  useLayoutEffect(() => {
    document.documentElement.dataset.classicCalculatorColors = String(classicCalculatorColorsEnabled);
  }, [classicCalculatorColorsEnabled]);

  useEffect(() => {
    writeClassicCalculatorColorsSetting(classicCalculatorColorsEnabled);
  }, [classicCalculatorColorsEnabled]);

  useEffect(() => {
    writeSeasonThemePreference(preference);
    if (preference === "random") writeLastRandomSeasonTheme(themeId);
  }, [preference, themeId]);

  function changeSeasonTheme(value) {
    setSelection(createSelection(normalizeSeasonThemePreference(value), themeId));
  }

  return <SeasonThemeContext.Provider value={{ preference, season, onSeasonThemeChange: changeSeasonTheme,
    classicCalculatorColorsEnabled, onClassicCalculatorColorsChange: setClassicCalculatorColorsEnabled }}>
    {children}
  </SeasonThemeContext.Provider>;
}

export function useSeasonTheme() {
  return useContext(SeasonThemeContext);
}
