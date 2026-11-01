import { defineConfig } from "vite";
import { manualChunks } from "./chunk-groups.mjs";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import { readFileSync, realpathSync } from "node:fs";

import { buildAttributionPlugin } from "../scripts/build-attribution.mjs";
import { s5PreviewPresetsPlugin } from "../scripts/s5-preview-presets.mjs";
import { cnProductionPruningPlugin } from "../scripts/cn-production-pruning.mjs";

export default defineConfig({
  build: {
    minify: "terser",
    terserOptions: { ecma: 2020, compress: { passes: 3 } },
    outDir: "dist/client",
    rollupOptions: {
      input: {
        main: fileURLToPath(new URL("../index.html", import.meta.url)),
        deer: fileURLToPath(new URL("../dianlu/index.html", import.meta.url)),
        china: fileURLToPath(new URL("../cn/index.html", import.meta.url)),
        globalEnglish: fileURLToPath(new URL("../en/index.html", import.meta.url)),
        globalChinese: fileURLToPath(new URL("../global/zh-CN/index.html", import.meta.url)),
        globalJapanese: fileURLToPath(new URL("../jp/index.html", import.meta.url)),
        globalJapaneseLegacy: fileURLToPath(new URL("../global/ja/index.html", import.meta.url)),
      },
      output: {
        manualChunks,
      },
    },
  },
  optimizeDeps: {
    include: ["react", "react-dom/client"],
  },
  server: {
    fs: { allow: [fileURLToPath(new URL("../", import.meta.url)), realpathSync(fileURLToPath(new URL("../node_modules", import.meta.url)))] },
    host: "0.0.0.0",
    allowedHosts: ["terminal.local"],
    warmup: {
      clientFiles: ["./src/main.jsx"],
    },
  },
  test: {
    // Only the maintained test suite; archived diagnosis scripts are not release tests.
    include: ["tests/**/*.{test,spec}.{js,mjs,cjs,jsx,ts,mts,cts,tsx}"],
    environment: "jsdom",
    setupFiles: fileURLToPath(new URL("./vitest.setup.js", import.meta.url)),
    css: true,
    testTimeout: 15_000,
    exclude: [
      "**/node_modules/**",
      ".tmp/**",
      // Generated/manual diagnostic cases are evidence, not the maintained test suite.
      "tmp/**",
      "output/**",
      "artifacts/**",
      "tests/e2e/**",
      "miniapp/tests/**",
      "dist/**",
    ],
  },
  plugins: [react(), buildAttributionPlugin(), s5PreviewPresetsPlugin(), cnProductionPruningPlugin(), {
    name: "preview-edgeone-redirects",
    configurePreviewServer(server) {
      // Match the deployment's exact, same-origin redirects before Vite's SPA fallback.
      const { redirects } = JSON.parse(readFileSync(new URL("../edgeone.json", import.meta.url), "utf8"));
      server.middlewares.use((request, response, next) => {
        if (!["GET", "HEAD"].includes(request.method)) return next();
        const url = new URL(request.url, "http://preview.local");
        const rule = redirects.find(({ source, destination }) => source === url.pathname && destination.startsWith("/") && !destination.startsWith("//"));
        if (!rule) return next();
        const destination = new URL(rule.destination, url);
        if (!destination.search) destination.search = url.search;
        response.writeHead(rule.statusCode, { Location: destination.pathname + destination.search + destination.hash });
        response.end();
      });
    },
  }],
});
