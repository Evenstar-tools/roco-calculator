import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { isDeepStrictEqual } from "node:util";

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
        .then(exports => {
          const { USER_RELEASE_NOTES, FEATURED_USER_RELEASE } = exports;
          if (!Array.isArray(USER_RELEASE_NOTES) || !USER_RELEASE_NOTES.length ||
              USER_RELEASE_NOTES[0].version !== FEATURED_USER_RELEASE?.version) {
            throw new Error("Invalid maintained release history");
          }
          return { releases: USER_RELEASE_NOTES, exports };
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
      const { exports } = await readHistory();
      const entries = Object.entries(exports).filter(([name]) => name !== "USER_RELEASE_NOTES")
        .sort(([left], [right]) => left === "FEATURED_USER_RELEASE" ? -1 : right === "FEATURED_USER_RELEASE" ? 1 : 0);
      const aliases = new Map();
      const code = entries.map(([name, value]) => {
        if (aliases.has(value)) return `export const ${name} = ${aliases.get(value)};`;
        const json = JSON.stringify(value);
        if (json === undefined || !isDeepStrictEqual(JSON.parse(json), value)) {
          throw new Error(`Release export must be losslessly JSON serializable: ${name}`);
        }
        aliases.set(value, name);
        const expression = value !== null && typeof value === "object" && Object.isFrozen(value)
          ? `/* @__PURE__ */ Object.freeze(${json})` : json;
        return `export const ${name} = ${expression};`;
      }).join("\n");
      return { code, map: null };
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
