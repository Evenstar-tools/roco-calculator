import { mergeConfig } from "vite";
import { fileURLToPath } from "node:url";
import base from "./vite.config.mjs";
import { s5PreviewPresetsPlugin } from "../scripts/s5-preview-presets.mjs";
import { cnProductionPruningPlugin } from "../scripts/cn-production-pruning.mjs";
import { s5BwikiRuntimePlugin } from "../scripts/s5-bwiki-runtime.mjs";

const local = (path) => fileURLToPath(new URL(path, import.meta.url));
const preview = mergeConfig(base, {
  mode: "pre",
  root: local("../pre/"),
  publicDir: local("../public/"),
  base: "/pre/",
  plugins: [s5PreviewPresetsPlugin(), s5BwikiRuntimePlugin(), cnProductionPruningPlugin({ reviewedS5: true })],
  server: { warmup: { clientFiles: [] } },
  build: {
    target: "es2022",
    outDir: local("../dist/client/"),
    emptyOutDir: true,
    rollupOptions: {
      input: { main: local("../pre/index.html"), deer: local("../pre/dianlu/index.html") },
    },
  },
});
preview.build.rollupOptions.input = { main: local("../pre/index.html"), deer: local("../pre/dianlu/index.html") };
export default preview;
