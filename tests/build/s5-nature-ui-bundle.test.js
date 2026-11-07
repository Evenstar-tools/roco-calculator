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

test("production tool loads one minified module while preserving its worker gate and readable files", async () => {
  const sourceStartup = path.join(root, "public/tools/s5-nature/web-startup.mjs");
  const startup = await readFile(sourceStartup, "utf8");
  const outDir = await output(startup);
  const toolDir = path.join(outDir, "tools/s5-nature");
  const legacy = "// legacy UI retained for existing references\n";
  await writeFile(path.join(toolDir, "ui.mjs"), legacy, "utf8");
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
  expect(await readFile(path.join(toolDir, "ui.mjs"), "utf8")).toBe(legacy);
  expect(await readFile(path.join(outDir, "index.html"), "utf8")).toBe("calculator shell");
  expect((await readdir(toolDir)).sort()).toEqual([bundleName, "ui.mjs", "web-startup.mjs"].sort());
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
