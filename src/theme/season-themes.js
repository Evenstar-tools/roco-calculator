import { publicResourceUrl } from "../runtime/public-resource-url.js";

import { IS_PREVIEW_BUILD } from "../runtime/preview-channel.js";

const freezeTheme = (theme) => Object.freeze({
  ...theme,
  scene: publicResourceUrl(theme.scene),
  character: theme.character ? Object.freeze({ ...theme.character, src: publicResourceUrl(theme.character.src) }) : null,
});

// Presentation assets only. A theme never selects a catalog, ruleset or server.
export const SEASON_THEMES = Object.freeze({
  neutral: freezeTheme({ id: "neutral", scene: null, character: null }),
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
  s5: freezeTheme({
    id: "s5", sourceName: "圣龙宝藏", scene: "/assets/season/s5-dragon-treasure.webp",
    character: { src: "/assets/season/s5-minggulong.webp", width: 472, height: 385 },
  }),
});

const PREVIEW_IDS = new Set(["s1", "s2", "s3", "s4", "s5"]);
const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

export const SELECTABLE_SEASON_THEMES = Object.freeze([...PREVIEW_IDS].map((id) => SEASON_THEMES[id]));

export function normalizeSeasonThemePreference(value) {
  return value === "random" || PREVIEW_IDS.has(value) ? value : "default";
}

export function pickRandomSeasonThemeId(random = Math.random, excludeId) {
  const candidates = SELECTABLE_SEASON_THEMES.filter(({ id }) => id !== excludeId);
  return candidates[Math.floor(random() * candidates.length)].id;
}

export function resolveSeasonPreviewId({ search = "", hostname = "" } = {}) {
  const requested = new URLSearchParams(search).get("seasonPreview");
  return LOOPBACK_HOSTS.has(hostname.toLowerCase()) && PREVIEW_IDS.has(requested) ? requested : null;
}

export function resolveSeasonThemeId({ serverId = "cn", preference = "default", randomThemeId, search = "", hostname = "" } = {}) {
  const preview = resolveSeasonPreviewId({ search, hostname });
  if (preview) return preview;
  if (preference === "random" && PREVIEW_IDS.has(randomThemeId)) return randomThemeId;
  if (PREVIEW_IDS.has(preference)) return preference;
  return serverId === "cn" ? (IS_PREVIEW_BUILD ? "s5" : "s4") : "neutral";
}

export function getSeasonTheme(id) {
  return Object.hasOwn(SEASON_THEMES, id) ? SEASON_THEMES[id] : SEASON_THEMES.neutral;
}

export function getSeasonThemeVariables(id) {
  const theme = getSeasonTheme(id);
  return {
    "--season-scene-image": theme.scene ? `url("${theme.scene}")` : "none",
    "--season-character-image": theme.character ? `url("${theme.character.src}")` : "none",
  };
}
