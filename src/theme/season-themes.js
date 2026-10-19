const freezeTheme = (theme) => Object.freeze({
  ...theme,
  character: Object.freeze(theme.character),
});

// Presentation only: selecting a theme never changes the current season's data or rules.
export const SEASON_THEMES = Object.freeze({
  s1: freezeTheme({
    id: "s1", sourceName: "暗夜拾光", scene: "/assets/season/s1-night-discovery.webp",
    character: { src: "/assets/season/s1-longxipaer.webp", width: 512, height: 512 },
  }),
  s2: freezeTheme({
    id: "s2", sourceName: "狂欢怪谈", scene: "/assets/season/s2-carnival.webp",
    character: { src: "/assets/season/s2-jimufangzhou.webp", width: 512, height: 512 },
  }),
  s3: freezeTheme({
    id: "s3", sourceName: "铅字幻梦", scene: "/assets/season/s3-storybook.webp",
    character: { src: "/assets/season/s3-jiaer.webp", width: 512, height: 512 },
  }),
  s4: freezeTheme({
    id: "s4", sourceName: "月涌狂想", scene: "/assets/season/s4-moon-night.webp",
    character: { src: "/assets/season/s4-silver-wolf.webp", width: 486, height: 406 },
    ornaments: "orbit-star",
  }),
});

export const SELECTABLE_SEASON_THEMES = Object.freeze(Object.values(SEASON_THEMES));

export function normalizeSeasonThemePreference(value) {
  return Object.hasOwn(SEASON_THEMES, value) ? value : "default";
}

export function getSeasonTheme(id) {
  return Object.hasOwn(SEASON_THEMES, id) ? SEASON_THEMES[id] : SEASON_THEMES.s4;
}

export function getSeasonThemeVariables(id) {
  const theme = getSeasonTheme(id);
  return {
    "--season-scene-image": `url("${theme.scene}")`,
    "--season-character-image": `url("${theme.character.src}")`,
  };
}
