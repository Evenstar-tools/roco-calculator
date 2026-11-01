export const IS_PREVIEW_BUILD = import.meta.env.MODE === "pre";
export const IS_S5_CN_BUILD = IS_PREVIEW_BUILD || import.meta.env.MODE === "cn";

export function previewRoute(path = "/") {
  return IS_PREVIEW_BUILD ? `/pre${path === "/" ? "/" : path}` : path;
}

export function unprefixedRoute(path) {
  return IS_PREVIEW_BUILD && /^\/pre(?:\/|$)/.test(path) ? path.slice(4) || "/" : path;
}
