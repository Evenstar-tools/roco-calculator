import { mergeConfig } from "vite";
import { fileURLToPath } from "node:url";
import base from "./vite.config.mjs";

const local = (path) => fileURLToPath(new URL(path, import.meta.url));
const globalBuild = mergeConfig(base, {
  mode: "global",
  base: "/global-assets/",
  build: { outDir: local("../dist/global/"), emptyOutDir: true },
});
globalBuild.build.rollupOptions.input = {
  english: local("../en/index.html"), japanese: local("../jp/index.html"),
  chinese: local("../global/zh-CN/index.html"), legacyJapanese: local("../global/ja/index.html"),
};
export default globalBuild;
