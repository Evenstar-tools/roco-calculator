import { createContext, useContext, useEffect, useLayoutEffect, useState } from "react";
import { readClassicCalculatorColorsSetting, readLastRandomSeasonTheme, readSeasonThemePreference, writeClassicCalculatorColorsSetting, writeLastRandomSeasonTheme, writeSeasonThemePreference } from "../state/season-theme.js";
import { getSeasonTheme, getSeasonThemeVariables, normalizeSeasonThemePreference, pickRandomSeasonThemeId, resolveSeasonThemeId } from "./season-themes.js";

const SeasonThemeContext = createContext({ preference: "default", season: getSeasonTheme("s4"), classicCalculatorColorsEnabled: false });

function createSelection(serverId, preference, excludeId) {
  return { preference, themeId: resolveSeasonThemeId({ serverId, preference,
    randomThemeId: preference === "random" ? pickRandomSeasonThemeId(Math.random, excludeId) : undefined }) };
}

export function SeasonThemeProvider({ children, serverId = "cn", active = true,
  seasonThemeId, preference: controlledPreference, onSeasonThemeChange }) {
  const controlled = seasonThemeId !== undefined && controlledPreference !== undefined;
  const [selection, setSelection] = useState(() => controlled ? null
    : createSelection(serverId, readSeasonThemePreference(serverId), readLastRandomSeasonTheme(serverId)));
  const [classicCalculatorColorsEnabled, setClassicCalculatorColorsEnabled] = useState(() => readClassicCalculatorColorsSetting(serverId));
  const preference = controlled ? controlledPreference : selection.preference;
  const themeId = controlled ? seasonThemeId : selection.themeId;
  const season = getSeasonTheme(themeId);

  useLayoutEffect(() => {
    if (!active) return;
    document.documentElement.dataset.season = season.id;
    for (const [key, value] of Object.entries(getSeasonThemeVariables(season.id))) {
      document.documentElement.style.setProperty(key, value);
    }
    document.documentElement.dataset.classicCalculatorColors = String(classicCalculatorColorsEnabled);
  }, [active, season, classicCalculatorColorsEnabled]);

  useEffect(() => {
    writeClassicCalculatorColorsSetting(classicCalculatorColorsEnabled, serverId);
  }, [classicCalculatorColorsEnabled, serverId]);

  useEffect(() => {
    if (controlled) return;
    writeSeasonThemePreference(preference, serverId);
    if (preference === "random") writeLastRandomSeasonTheme(themeId, serverId);
  }, [controlled, preference, themeId, serverId]);

  function changeSeasonTheme(value) {
    if (controlled) { onSeasonThemeChange?.(value); return; }
    setSelection(createSelection(serverId, normalizeSeasonThemePreference(value), themeId));
  }

  return <SeasonThemeContext.Provider value={{ preference, season, onSeasonThemeChange: changeSeasonTheme,
    classicCalculatorColorsEnabled, onClassicCalculatorColorsChange: setClassicCalculatorColorsEnabled }}>
    {children}
  </SeasonThemeContext.Provider>;
}

export function useSeasonTheme() { return useContext(SeasonThemeContext); }
