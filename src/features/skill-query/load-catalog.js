import { unpackCatalog } from "./catalog.js";

let pending;
let cached;

export const getCachedCatalog = () => cached ?? null;

// 菜单预取和面板共用同一次请求；失败后清除，重试不能复用失败的 Promise。
export function loadSkillCatalog() {
  if (!pending) pending = fetch(`${import.meta.env.BASE_URL}data/skill-query/catalog.json`)
    .then((response) => {
      if (!response.ok) throw new Error("技能资料加载失败");
      return response.json();
    })
    .then((value) => { cached = unpackCatalog(value); return cached; })
    .catch((error) => { pending = null; throw error; });
  return pending;
}
