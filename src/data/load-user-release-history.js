import { FEATURED_USER_RELEASE } from "./user-release-notes.js";
import { publicResourceUrl } from "../runtime/public-resource-url.js";

const pending = new Map();
const cached = new Map();
const historyUrl = () => publicResourceUrl("/data/user-release-notes.json");

export const getCachedUserReleaseHistory = () => cached.get(historyUrl()) ?? null;

export function loadUserReleaseHistory() {
  const url = historyUrl();
  if (!pending.has(url)) pending.set(url, fetch(url)
    .then(response => {
      if (!response.ok) throw new Error("版本记录加载失败");
      return response.json();
    })
    .then(releases => {
      if (!Array.isArray(releases) || !releases.length ||
          releases[0].version !== FEATURED_USER_RELEASE.version ||
          releases.some(release => !release || typeof release.version !== "string" || typeof release.title !== "string")) {
        throw new Error("版本记录加载失败");
      }
      cached.set(url, releases);
      return releases;
    })
    .catch(error => { pending.delete(url); throw error; }));
  return pending.get(url);
}
