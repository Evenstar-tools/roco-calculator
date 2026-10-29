import { readFileSync } from "node:fs";

const presetFile = "data/presets/pvp-popular-configs.json";
const readJson = (path) => JSON.parse(readFileSync(new URL(path, import.meta.url), "utf8"));

// CN and preview serve the same merged library at their existing endpoint.
// The base file and independently pinned Global build remain unchanged.
export function buildS5PopularConfigLibrary() {
  const base = readJson(`../public/${presetFile}`);
  const additions = readJson("../data/presets/s5-popular-configs.json");
  const entries = [...new Map([...base.entries, ...additions.entries]
    .map((entry) => [entry.spiritId, entry])).values()];
  return { ...base, exportedAt: additions.exportedAt, entryCount: entries.length, entries };
}

export function s5PreviewPresetsPlugin() {
  const source = () => `${JSON.stringify(buildS5PopularConfigLibrary(), null, 2)}\n`;
  return {
    name: "s5-preview-presets",
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        const pathname = request.url?.split("?")[0];
        if (!["GET", "HEAD"].includes(request.method) ||
          ![`/${presetFile}`, `/pre/${presetFile}`].includes(pathname)) return next();
        try {
          response.setHeader("Content-Type", "application/json; charset=utf-8");
          response.setHeader("Cache-Control", "no-store");
          response.end(request.method === "HEAD" ? undefined : source());
        } catch (error) { next(error); }
      });
    },
    generateBundle() {
      this.emitFile({ type: "asset", fileName: presetFile, source: source() });
    },
  };
}
