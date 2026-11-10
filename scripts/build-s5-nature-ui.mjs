import { existsSync } from "node:fs";
import { readFile, readdir, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { minify } from "terser";
import { build } from "vite";

async function minifyCompatibilityModules(toolDir) {
  for (const directory of [toolDir, path.join(toolDir, "vendor")]) {
    if (!existsSync(directory)) continue;
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      if (!entry.isFile() || entry.name === "web-startup.mjs" ||
          !(entry.name.endsWith(".mjs") || (directory !== toolDir && entry.name.endsWith(".js")))) continue;
      const filename = path.join(directory, entry.name);
      const result = await minify(await readFile(filename, "utf8"), { module: true, ecma: 2022 });
      if (typeof result.code !== "string") throw new Error(`S5 module minification failed: ${entry.name}`);
      await writeFile(filename, result.code, "utf8");
    }
  }
}

/** Publish one active UI bundle while keeping calculation modules and the startup gate. */
export async function buildS5NatureUi({ root, outDir }) {
  const toolDir = path.join(outDir, "tools/s5-nature");
  const startupFile = path.join(toolDir, "web-startup.mjs");
  if (!existsSync(startupFile)) return null;

  const startup = await readFile(startupFile, "utf8");
  const htmlFile = path.join(toolDir, "index.html");
  const html = existsSync(htmlFile) ? await readFile(htmlFile, "utf8") : null;
  const styleTags = html ? [...html.matchAll(/<link\b[^>]*data-tool-style="\.\/([\w-]+\.css)"[^>]*>/gu)] : [];
  const uiFile = path.join(root, "public/tools/s5-nature/ui.mjs");
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
    plugins: [{
      name: "s5-tool-styles",
      transform(code, id) {
        if (path.resolve(id) !== path.resolve(uiFile) || !styleTags.length) return null;
        // Keep the HTML's cascade order; Vite bundles/minifies these styles once.
        return { code: styleTags.map(([, name]) => `import ${JSON.stringify(`./${name}`)};`).join("\n") + "\n" + code, map: null };
      },
    }],
    build: {
      target: "es2022",
      minify: "terser",
      outDir: toolDir,
      emptyOutDir: false,
      copyPublicDir: false,
      rolldownOptions: {
        input: uiFile,
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
  if (styleTags.length) {
    const styles = (Array.isArray(result) ? result : [result])
      .flatMap(output => output.output ?? [])
      .filter(asset => asset.type === "asset" && asset.fileName.endsWith(".css"));
    if (styles.length !== 1) throw new Error("S5 UI build must generate exactly one stylesheet");
    let bundledHtml = html;
    for (const [index, [tag]] of styleTags.entries()) {
      bundledHtml = bundledHtml.replace(tag, index === 0
        ? `<link rel="stylesheet" data-tool-style="./${styles[0].fileName}" />` : "");
    }
    await writeFile(htmlFile, bundledHtml, "utf8");
    for (const [, name] of styleTags) await unlink(path.join(toolDir, name));
  }
  // These entry/view modules are already in the bundle. Keep calculation modules
  // available, but do not ship a second copy of the retired unbundled interface.
  for (const name of ["ui.mjs", "player-flow.mjs", "matchup-ui.mjs", "picker.mjs"]) {
    const file = path.join(toolDir, name);
    if (existsSync(file)) await unlink(file);
  }
  await minifyCompatibilityModules(toolDir);
  await writeFile(startupFile, startup.replace(uiImport, () => `import(${JSON.stringify(`./${bundleName}`)})`), "utf8");
  return bundleFile;
}
