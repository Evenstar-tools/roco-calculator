import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export const USER_RELEASE_HISTORY_ASSET = "data/user-release-notes.json";

// The maintained JS remains the only source; the browser requests older records
// only when opening history, while the latest notice stays synchronous.
export function userReleaseHistoryPlugin() {
  const root = fileURLToPath(new URL("../", import.meta.url));
  let base;
  let production;
  let previousCode;
  let pending;
  let revision = 0;
  const sourceFile = () => path.join(root, "src/data/user-release-notes.js");
  function readHistory() {
    const code = readFileSync(sourceFile(), "utf8");
    if (code !== previousCode) {
      previousCode = code;
      pending = import(`${pathToFileURL(sourceFile()).href}?history=${++revision}`)
        .then(({ USER_RELEASE_NOTES, FEATURED_USER_RELEASE }) => {
          if (!Array.isArray(USER_RELEASE_NOTES) || !USER_RELEASE_NOTES.length ||
              USER_RELEASE_NOTES[0].version !== FEATURED_USER_RELEASE?.version) {
            throw new Error("Invalid maintained release history");
          }
          return { releases: USER_RELEASE_NOTES, featured: FEATURED_USER_RELEASE };
        }).catch(error => { previousCode = undefined; throw error; });
    }
    return pending;
  }
  return {
    name: "user-release-history",
    enforce: "pre",
    configResolved(config) { base = config.base; production = config.command === "build"; },
    async transform(_code, id) {
      if (!production || id.replaceAll("\\", "/") !== sourceFile().replaceAll("\\", "/")) return null;
      const { featured } = await readHistory();
      return { code: `export const FEATURED_USER_RELEASE = Object.freeze(${JSON.stringify(featured)});\nexport const CURRENT_USER_RELEASE = FEATURED_USER_RELEASE;`, map: null };
    },
    async generateBundle() {
      const { releases } = await readHistory();
      this.emitFile({ type: "asset", fileName: USER_RELEASE_HISTORY_ASSET, source: JSON.stringify(releases) });
    },
    configureServer(server) {
      server.middlewares.use(async (request, response, next) => {
        const pathname = new URL(request.url, "http://localhost").pathname;
        if (pathname !== `/${USER_RELEASE_HISTORY_ASSET}` && pathname !== `${base}${USER_RELEASE_HISTORY_ASSET}`) return next();
        try {
          const { releases } = await readHistory();
          response.setHeader("Content-Type", "application/json; charset=utf-8");
          response.setHeader("Cache-Control", "no-cache");
          response.end(JSON.stringify(releases));
        } catch (error) { next(error); }
      });
    },
  };
}
