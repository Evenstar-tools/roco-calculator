import { defineConfig } from "vite";
import { manualChunks } from "./chunk-groups.mjs";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

import { buildAttributionPlugin } from "../scripts/build-attribution.mjs";

export default defineConfig({
  build: {
    minify: "terser",
    terserOptions: { ecma: 2020, compress: { passes: 3 } },
    outDir: "dist/client",
    rollupOptions: {
      output: {
        manualChunks,
      },
    },
  },
  optimizeDeps: {
    include: ["react", "react-dom/client"],
  },
  server: {
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
  plugins: [react(), buildAttributionPlugin()],
});
