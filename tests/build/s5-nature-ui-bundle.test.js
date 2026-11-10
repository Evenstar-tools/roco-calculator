// @vitest-environment node
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "@babel/parser";
import { afterEach, expect, test } from "vitest";
import { buildS5NatureUi } from "../../scripts/build-s5-nature-ui.mjs";

const root = fileURLToPath(new URL("../../", import.meta.url));
const outputs = [];

afterEach(async () => {
  for (const directory of outputs.splice(0)) await rm(directory, { recursive: true, force: true });
});

async function output(startup) {
  const directory = await mkdtemp(path.join(tmpdir(), "roco-s5-ui-bundle-"));
  outputs.push(directory);
  if (startup !== undefined) {
    await mkdir(path.join(directory, "tools/s5-nature"), { recursive: true });
    await writeFile(path.join(directory, "tools/s5-nature/web-startup.mjs"), startup, "utf8");
  }
  return directory;
}

test("production tool loads one bundle and minifies compatibility modules without changing exports or sources", async () => {
  const sourceStartup = path.join(root, "public/tools/s5-nature/web-startup.mjs");
  const startup = await readFile(sourceStartup, "utf8");
  const sourceUi = path.join(root, "public/tools/s5-nature/ui.mjs");
  const ui = await readFile(sourceUi, "utf8");
  const outDir = await output(startup);
  const toolDir = path.join(outDir, "tools/s5-nature");
  const sourceHtml = await readFile(path.join(root, "public/tools/s5-nature/index.html"), "utf8");
  const styleNames = [...sourceHtml.matchAll(/data-tool-style="\.\/([\w-]+\.css)"/gu)].map(([, name]) => name);
  await writeFile(path.join(toolDir, "index.html"), sourceHtml, "utf8");
  const sourceStyles = new Map();
  for (const name of styleNames) {
    const css = await readFile(path.join(root, "public/tools/s5-nature", name), "utf8");
    sourceStyles.set(name, css);
    await writeFile(path.join(toolDir, name), css, "utf8");
  }
  const legacy = "// legacy UI retained for existing references\nexport const compatibilityValue = 21 + 21;\n";
  await writeFile(path.join(toolDir, "ui.mjs"), legacy, "utf8");
  await mkdir(path.join(toolDir, "vendor"));
  const vendor = "// retain the exported function and its calculation\nexport function double(value) { return value * 2; }\n";
  for (const name of ["relations.js", "damage.mjs"]) await writeFile(path.join(toolDir, "vendor", name), vendor, "utf8");
  await mkdir(path.join(toolDir, "data"));
  await writeFile(path.join(toolDir, "data", "evidence.json"), '{ "evidence": true }\n', "utf8");
  await writeFile(path.join(outDir, "index.html"), "calculator shell", "utf8");

  const bundleFile = await buildS5NatureUi({ root, outDir });
  const bundleName = path.basename(bundleFile);
  expect(bundleName).toMatch(/^ui-[\w-]+\.js$/u);
  const bundle = await readFile(bundleFile, "utf8");
  const ast = parse(bundle, { sourceType: "module" });
  expect(ast.program.body.some(node => node.type === "ImportDeclaration")).toBe(false);
  expect(bundle).not.toMatch(/\bimport\s*\(/u);
  expect(bundle).toContain("./data/catalog.json");
  expect(bundle.split("\n").length).toBeLessThan(10);
  expect(await readFile(path.join(toolDir, "web-startup.mjs"), "utf8"))
    .toBe(startup.replace(/import\((['"])\.\/ui\.mjs\1\)/u, `import(${JSON.stringify(`./${bundleName}`)})`));
  expect(await readFile(sourceStartup, "utf8")).toBe(startup);
  expect(await readFile(sourceUi, "utf8")).toBe(ui);
  const compressedLegacy = await readFile(path.join(toolDir, "ui.mjs"), "utf8");
  expect(compressedLegacy.length).toBeLessThan(legacy.length);
  expect((await import(`data:text/javascript,${encodeURIComponent(compressedLegacy)}`)).compatibilityValue).toBe(42);
  for (const name of ["relations.js", "damage.mjs"]) {
    const compressed = await readFile(path.join(toolDir, "vendor", name), "utf8");
    expect(compressed.length).toBeLessThan(vendor.length);
    expect((await import(`data:text/javascript,${encodeURIComponent(compressed)}`)).double(21)).toBe(42);
  }
  expect(await readFile(path.join(toolDir, "data", "evidence.json"), "utf8")).toBe('{ "evidence": true }\n');
  expect(await readFile(path.join(outDir, "index.html"), "utf8")).toBe("calculator shell");
  const bundledHtml = await readFile(path.join(toolDir, "index.html"), "utf8");
  const styleReferences = [...bundledHtml.matchAll(/data-tool-style="\.\/([^"]+\.css)"/gu)];
  expect(styleReferences).toHaveLength(1);
  expect(bundledHtml).not.toMatch(/<link\b[^>]*rel="stylesheet"[^>]*\shref=/u);
  const bundledCss = await readFile(path.join(toolDir, styleReferences[0][1]), "utf8");
  expect(bundledCss).toContain(".flow-card");
  expect(bundledCss).toContain(".hp-readings");
  expect(bundledCss).toContain(".picker-anchor");
  for (const [name, css] of sourceStyles) {
    expect(await readFile(path.join(root, "public/tools/s5-nature", name), "utf8")).toBe(css);
    expect(await readdir(toolDir)).not.toContain(name);
  }
  expect((await readdir(toolDir)).sort()).toEqual([bundleName, "assets", "data", "index.html", "ui.mjs", "vendor", "web-startup.mjs"].sort());
});

test("outputs without the CN tool are untouched", async () => {
  const outDir = await output();
  expect(await buildS5NatureUi({ root, outDir })).toBeNull();
  expect(await readdir(outDir)).toEqual([]);
});

test("an unexpected bootstrap fails before redirecting or creating a partial bundle", async () => {
  const startup = "export const startTool = () => import('./unexpected.mjs');\n";
  const outDir = await output(startup);
  await expect(buildS5NatureUi({ root, outDir })).rejects.toThrow("exactly one deferred UI module import");
  expect(await readFile(path.join(outDir, "tools/s5-nature/web-startup.mjs"), "utf8")).toBe(startup);
  expect(await readdir(path.join(outDir, "tools/s5-nature"))).toEqual(["web-startup.mjs"]);
});
