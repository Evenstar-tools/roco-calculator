import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { build } from "vite";

/** Bundle only the deployed CN tool; its readable modules and startup gate stay intact. */
export async function buildS5NatureUi({ root, outDir }) {
  const toolDir = path.join(outDir, "tools/s5-nature");
  const startupFile = path.join(toolDir, "web-startup.mjs");
  if (!existsSync(startupFile)) return null;

  const startup = await readFile(startupFile, "utf8");
  const uiImport = /import\((['"])\.\/ui\.mjs\1\)/gu;
  if ([...startup.matchAll(uiImport)].length !== 1) {
    throw new Error("S5 startup must have exactly one deferred UI module import");
  }

  const result = await build({
    root,
    configFile: false,
    publicDir: false,
    base: "./",
    logLevel: "error",
    build: {
      target: "es2022",
      minify: "terser",
      outDir: toolDir,
      emptyOutDir: false,
      copyPublicDir: false,
      rolldownOptions: {
        input: path.join(root, "public/tools/s5-nature/ui.mjs"),
        output: { format: "es", entryFileNames: "ui-[hash].js", codeSplitting: false },
      },
    },
  });

  // Publish the new import only after the complete bundle has been written.
  const entries = (Array.isArray(result) ? result : [result])
    .flatMap(output => output.output ?? [])
    .filter(chunk => chunk.type === "chunk" && chunk.isEntry);
  if (entries.length !== 1) throw new Error("S5 UI build must generate exactly one entry chunk");
  const bundleName = entries[0].fileName;
  const bundleFile = path.join(toolDir, bundleName);
  if (!existsSync(bundleFile)) throw new Error("S5 UI bundle was not generated");
  await writeFile(startupFile, startup.replace(uiImport, () => `import(${JSON.stringify(`./${bundleName}`)})`), "utf8");
  return bundleFile;
}
