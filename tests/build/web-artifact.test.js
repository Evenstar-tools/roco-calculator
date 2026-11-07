import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { afterEach, expect, test } from "vitest";
import { extractWebReferences, resolveWebReference, verifyWebArtifact } from "../../scripts/verify-web-artifact.mjs";

const roots = [];
afterEach(() => {
  const parent = path.resolve(".tmp");
  for (const root of roots.splice(0)) {
    if (path.dirname(root) !== parent || !path.basename(root).startsWith("web-artifact-test-")) throw new Error("Invalid fixture cleanup path");
    rmSync(root, { recursive: true, force: true });
  }
});
function fixture(files) {
  mkdirSync(".tmp", { recursive: true });
  const root = mkdtempSync(path.resolve(".tmp/web-artifact-test-"));
  roots.push(root);
  for (const [name, content] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(root, name)), { recursive: true });
    writeFileSync(path.join(root, name), content, "utf8");
  }
  return root;
}
const entries = ["index.html", "en/index.html"];
const files = {
  "data/runtime.json": JSON.stringify({ spirits: [{ id: "CN spirit", asset: { localUrl: "/assets/spirits/spirit_e0332c3637a510c6.png" } }] }),
  "global-assets/data/global-runtime.json": JSON.stringify({ spirits: [{ id: "Global spirit", asset: { localUrl: "/assets/spirits/spirit_e0332c3637a510c6.png" } }] }),
  "index.html": '<script type="module" src="/assets/main.js"></script>',
  "en/index.html": '<script type="module" src="/global-assets/assets/main.js"></script>',
  "assets/main.js": 'export const open=()=>import("./TypeQueryPanel-C0dTPZ0b.js");',
  "assets/TypeQueryPanel-C0dTPZ0b.js": 'import "./main.js"; export const ready=true;',
  "global-assets/assets/main.js": 'const __vite__mapDeps=(i,m=__vite__mapDeps,d=(m.f||(m.f=["assets/tool.css"])))=>i.map(i=>d[i]); export const portrait="/global-assets/assets/spirits/spirit_e0332c3637a510c6.png";',
  "global-assets/assets/tool.css": 'body{background:url("./background.png?v=2#image")}',
  "global-assets/assets/background.png": "background",
  "global-assets/assets/spirits/spirit_e0332c3637a510c6.png": "global portrait",
  "assets/spirits/spirit_e0332c3637a510c6.png": "CN copy",
};
test("final artifact follows dynamic imports, Vite preload CSS and CSS images with cycles", () => {
  expect(verifyWebArtifact({ distRoot: fixture(files), entries }).ok).toBe(true);
});
test("missing TypeQueryPanel dynamic chunk fails even when the entry and core exist", () => {
  const incomplete = { ...files };
  delete incomplete["assets/TypeQueryPanel-C0dTPZ0b.js"];
  expect(() => verifyWebArtifact({ distRoot: fixture(incomplete), entries })).toThrow("/assets/TypeQueryPanel-C0dTPZ0b.js");
});
test("missing Global portrait fails even when the same CN portrait exists", () => {
  const incomplete = { ...files };
  delete incomplete["global-assets/assets/spirits/spirit_e0332c3637a510c6.png"];
  expect(() => verifyWebArtifact({ distRoot: fixture(incomplete), entries })).toThrow("/global-assets/assets/spirits/spirit_e0332c3637a510c6.png");
});
test("runtime portrait bindings are checked at the Global mount even without a JS image literal", () => {
  const incomplete = { ...files, "global-assets/assets/main.js": "export const ready=true;" };
  delete incomplete["global-assets/assets/spirits/spirit_e0332c3637a510c6.png"];
  expect(() => verifyWebArtifact({ distRoot: fixture(incomplete), entries })).toThrow("/global-assets/assets/spirits/spirit_e0332c3637a510c6.png");
});
test("Vite preload paths use the application mount and CSS URLs use the stylesheet directory", () => {
  const refs = extractWebReferences('const __vite__mapDeps=(i,m=["assets/tool.css"])=>i.map(n=>m[n]);', "/global-assets/assets/core.js", { kind: "js" });
  expect(resolveWebReference(refs[0], "/global-assets/assets/core.js")).toBe("/global-assets/assets/tool.css");
  const incomplete = { ...files };
  delete incomplete["global-assets/assets/background.png"];
  expect(() => verifyWebArtifact({ distRoot: fixture(incomplete), entries })).toThrow("/global-assets/assets/background.png");
});
test("exact filename case is checked on Windows too", () => {
  const wrongCase = { ...files, "assets/main.js": 'import "./typequerypanel-C0dTPZ0b.js";' };
  expect(() => verifyWebArtifact({ distRoot: fixture(wrongCase), entries })).toThrow("/assets/typequerypanel-C0dTPZ0b.js");
});

test("S5 deferred styles and inline startup imports remain in the full artifact graph", () => {
  const toolFiles = { ...files,
    "tools/s5-nature/index.html": '<link rel="stylesheet" data-tool-style="./matchup.css"><script type="module">import { startTool } from "./web-startup.mjs"; await startTool();</script>',
    "tools/s5-nature/web-startup.mjs": 'export const startTool = () => import("./ui.mjs");',
    "tools/s5-nature/ui.mjs": 'import "./engine.mjs";',
    "tools/s5-nature/engine.mjs": 'export const ready = true;',
    "tools/s5-nature/matchup.css": 'body { color: black; }',
  };
  const options = { entries: ['tools/s5-nature/index.html'] };
  const result = verifyWebArtifact({ ...options, distRoot: fixture(toolFiles) });
  expect(result.counts.js).toBe(3);
  expect(result.counts.css).toBe(1);
  for (const resource of ['web-startup.mjs', 'ui.mjs', 'engine.mjs', 'matchup.css']) {
    const incomplete = { ...toolFiles };
    delete incomplete[`tools/s5-nature/${resource}`];
    expect(() => verifyWebArtifact({ ...options, distRoot: fixture(incomplete) }))
      .toThrow(`/tools/s5-nature/${resource}`);
  }
});
