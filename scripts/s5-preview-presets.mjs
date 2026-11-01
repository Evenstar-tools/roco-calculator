import { readFileSync } from "node:fs";
import { chooseDefaultSkillIds, getLegalSkillIds, reconcileSkillLoadout } from "../src/domain/skill-loadout.js";

const presetFile = "data/presets/pvp-popular-configs.json";
const readJson = (path) => JSON.parse(readFileSync(new URL(path, import.meta.url), "utf8"));

// The preview serves the same endpoint as CN, with its own additions. Formal CN
// and Global keep their public files, and every existing preset consumer agrees.
export function buildS5PopularConfigLibrary(snapshot) {
  const base = readJson(`../public/${presetFile}`);
  const additions = readJson("../data/presets/s5-popular-configs.json");
  const entries = [...new Map([...base.entries, ...additions.entries]
    .map((entry) => [entry.spiritId, entry])).values()].map(entry => {
    if (!snapshot) return entry;
    const preferred = chooseDefaultSkillIds(snapshot, entry.spiritId);
    const legal = [...new Set([...preferred, ...getLegalSkillIds(snapshot, entry.spiritId)].filter(Boolean))];
    const skills = reconcileSkillLoadout({ four: entry.skills }, legal, entry.skills.length).four;
    return skills.every((id, index) => id === entry.skills[index]) ? entry : { ...entry, skills };
  });
  return { ...base, exportedAt: additions.exportedAt, entryCount: entries.length, entries };
}

export function s5PreviewPresetsPlugin({ snapshotLoader } = {}) {
  let server;
  const source = async () => {
    const load = snapshotLoader ?? (async () => {
      const { buildS5BwikiSnapshot } = await import("./s5-bwiki-runtime.mjs");
      return buildS5BwikiSnapshot({ previewLoader: server });
    });
    return `${JSON.stringify(buildS5PopularConfigLibrary(await load()), null, 2)}\n`;
  };
  return {
    name: "s5-preview-presets",
    configureServer(viteServer) {
      server = viteServer;
      server.middlewares.use((request, response, next) => {
        const pathname = request.url?.split("?")[0];
        if (!["GET", "HEAD"].includes(request.method) ||
          ![`/${presetFile}`, `/pre/${presetFile}`].includes(pathname)) return next();
        return source().then(body => {
          response.setHeader("Content-Type", "application/json; charset=utf-8");
          response.setHeader("Cache-Control", "no-store");
          response.end(request.method === "HEAD" ? undefined : body);
        }).catch(next);
      });
    },
    async generateBundle() {
      this.emitFile({ type: "asset", fileName: presetFile, source: await source() });
    },
  };
}
