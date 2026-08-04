import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  build: {
    outDir: "dist/client",
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes("node_modules")) return undefined;
          if (id.includes("react")) return "react-vendor";
          if (id.includes("@phosphor-icons")) return "icons";
          if (id.includes("pinyin-pro")) return "pinyin";
          return "vendor";
        },
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
    environment: "jsdom",
    setupFiles: "./vitest.setup.js",
    css: true,
    testTimeout: 15_000,
    exclude: [
      "**/node_modules/**",
      ".tmp/**",
      "e2e/**",
      "miniapp/tests/**",
      "dist/**",
    ],
  },
  plugins: [react()],
});
