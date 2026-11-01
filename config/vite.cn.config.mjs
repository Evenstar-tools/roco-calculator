import { mergeConfig } from "vite";
import { fileURLToPath } from "node:url";
import base from "./vite.config.mjs";
import { s5PreviewPresetsPlugin } from "../scripts/s5-preview-presets.mjs";
import { cnProductionPruningPlugin } from "../scripts/cn-production-pruning.mjs";
import { s5BwikiRuntimePlugin } from "../scripts/s5-bwiki-runtime.mjs";

const local = path => fileURLToPath(new URL(path, import.meta.url));
// Formal CN and /pre share the same reviewed S5 source; storage and asset bases stay separate.
const cn = mergeConfig(base, {
  mode: "cn",
  root: local("../"),
  publicDir: local("../public/"),
  base: "/",
  plugins: [s5PreviewPresetsPlugin(), s5BwikiRuntimePlugin(), cnProductionPruningPlugin({ reviewedS5: true })],
  server: { warmup: { clientFiles: [] } },
  build: { target: "es2022", outDir: local("../dist/client/"), emptyOutDir: true },
});
cn.build.rollupOptions.input = {
  main: local("../index.html"), deer: local("../dianlu/index.html"), china: local("../cn/index.html"),
};
export default cn;
