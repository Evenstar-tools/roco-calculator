import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  esbuild: {
    jsx: "automatic"
  },
  resolve: {
    alias: {
      "@tarojs/components": fileURLToPath(
        new URL("./tests/mocks/taro-components.jsx", import.meta.url)
      ),
      "@tarojs/taro": fileURLToPath(
        new URL("./tests/mocks/taro.js", import.meta.url)
      )
    }
  },
  test: {
    environment: "jsdom",
    setupFiles: [
      fileURLToPath(new URL("./vitest.setup.js", import.meta.url))
    ]
  }
});
