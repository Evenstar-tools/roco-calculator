// Pure build grouping policy; importable in tests without loading Vite configuration.
export function manualChunks(id) {
          // Session transitions and calculation roots are initial dependencies; compress the shared form runtime together.
          const normalized = id.replaceAll("\\", "/");
          if (normalized.includes("aegis-web-sdk")) return "analytics-sdk";
          if (normalized.endsWith("/src/domain/snapshot-indexes.js") ||
              normalized.endsWith("/src/state/calculator-session.js") ||
              normalized.endsWith("/src/domain/skill-result/loadout.js")) return "calculator-core";
          // This tiny shared icon already depends on react-vendor; avoid a separate entry-time chunk.
          if (normalized.endsWith("/src/components/ElementIcon.jsx")) return "react-vendor";
          // fflate has one consumer: keep it with the lazy spreadsheet exporter.
          if (normalized.endsWith("/src/features/damage-comparison/export-xlsx.js") ||
              normalized.includes("/node_modules/fflate/")) return "xlsx-export";
          if (!id.includes("node_modules")) return undefined;
          if (id.includes("zxing-wasm")) return "qr-reader";
          if (id.includes("react")) return "react-vendor";
          if (id.includes("@phosphor-icons")) return "icons";
          if (id.includes("pinyin-pro")) return "pinyin";
          return "vendor";
        }
