// @vitest-environment node
import { createServer } from "node:http";
import { afterEach, describe, expect, test } from "vitest";
import { DEPLOYED_WEB_ENTRIES, DEPLOYED_WEB_PORTRAITS, verifyDeployedWeb } from "../../scripts/verify-deployed-web.mjs";

const servers = [];
const png = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
async function fixture(overrides = {}) {
  const files = {
    ...Object.fromEntries(DEPLOYED_WEB_ENTRIES.map((entry) => [entry, {
      type: "text/html", body: '<script type="module" src="/assets/main.js"></script><link rel="stylesheet" href="/assets/main.css">',
    }])),
    ...Object.fromEntries(DEPLOYED_WEB_PORTRAITS.map((entry) => [entry, { type: "image/png", body: png }])),
    "/assets/main.js": { type: "application/javascript", body: 'import "./shared.js"; export { value } from "./reexport.js"; const open = () => import("./tool.js"); const __vite__mapDeps = (i, m = ["assets/tool.css"]) => i.map(n => m[n]); const portrait = "/assets/spirits/not-crawled.png";' },
    "/assets/shared.js": { type: "text/javascript", body: "export const shared = true;" },
    "/assets/reexport.js": { type: "text/javascript", body: "export const value = 1;" },
    "/assets/tool.js": { type: "text/javascript", body: 'import "./shared.js"; export default 1;' },
    "/assets/main.css": { type: "text/css", body: '@import "./theme.css"; .portrait { background: url("./background.png"); } .remote { background: url("https://outside.invalid/never-requested.png"); }' },
    "/assets/theme.css": { type: "text/css", body: "body { color: black; }" },
    "/assets/tool.css": { type: "text/css", body: ".tool { display: block; }" },
    "/assets/background.png": { type: "image/png", body: png },
    ...overrides,
  };
  const requests = [];
  const server = createServer((request, response) => {
    requests.push(request.url);
    const file = files[request.url];
    if (!file) { response.writeHead(404, { "content-type": "text/html" }); response.end("missing"); return; }
    response.writeHead(file.status ?? 200, { "content-type": file.type, ...file.headers });
    if (file.delayMs) {
      const timer = setTimeout(() => response.end(file.body), file.delayMs);
      response.on("close", () => clearTimeout(timer));
    } else response.end(file.body);
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  servers.push(server);
  return { origin: `http://127.0.0.1:${server.address().port}`, requests, files };
}
afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => new Promise((resolve) => { server.closeAllConnections(); server.close(resolve); })));
});

describe("deployed Web resource verification", () => {
  test("follows all formal entries, static/dynamic imports, Vite CSS and CSS resources without crawling the portrait catalog", async () => {
    const site = await fixture();
    const result = await verifyDeployedWeb({ origin: site.origin, concurrency: 2 });
    expect(result.ok).toBe(true);
    expect(result.failures).toEqual([]);
    expect(site.requests).toEqual(expect.arrayContaining([...DEPLOYED_WEB_ENTRIES, ...DEPLOYED_WEB_PORTRAITS, "/assets/tool.js", "/assets/tool.css", "/assets/theme.css", "/assets/background.png", "/assets/reexport.js"]));
    expect(site.requests.filter((url) => url === "/assets/shared.js")).toHaveLength(1);
    expect(site.requests).not.toContain("/assets/spirits/not-crawled.png");
  });

  test("reports a missing dynamic chunk together with its importer", async () => {
    const site = await fixture({ "/assets/tool.js": undefined });
    const result = await verifyDeployedWeb({ origin: site.origin });
    expect(result.ok).toBe(false);
    expect(result.failures).toEqual([expect.objectContaining({
      url: `${site.origin}/assets/tool.js`, reason: "HTTP 404", from: [`${site.origin}/assets/main.js`],
    })]);
  });

  test("follows absolute URLs only when they belong to the deployment origin", async () => {
    const site = await fixture();
    site.files["/assets/main.js"].body = `import "${site.origin}/assets/tool.js"; import "https://outside.invalid/never-requested.js";`;
    site.files["/assets/main.css"].body = `body { background: url("${site.origin}/assets/background.png"); }`;
    const result = await verifyDeployedWeb({ origin: site.origin });
    expect(result.ok).toBe(true);
    expect(site.requests).toEqual(expect.arrayContaining(["/assets/tool.js", "/assets/background.png"]));
  });

  test.each(["text/html", "application/javascript"])("rejects HTML masquerading as a successful JS response with %s", async (type) => {
    const site = await fixture({ "/assets/tool.js": { type, body: "<!doctype html><html>fallback page</html>" } });
    const result = await verifyDeployedWeb({ origin: site.origin });
    expect(result.ok).toBe(false);
    expect(result.failures).toEqual([expect.objectContaining({ url: `${site.origin}/assets/tool.js`, reason: "HTML returned for js" })]);
  });

  test("checks both known portraits even when JS never references them", async () => {
    const site = await fixture({ [DEPLOYED_WEB_PORTRAITS[0]]: { type: "text/plain", body: png } });
    const result = await verifyDeployedWeb({ origin: site.origin });
    expect(result.ok).toBe(false);
    expect(result.failures).toEqual([expect.objectContaining({
      url: site.origin + DEPLOYED_WEB_PORTRAITS[0], reason: "expected image/png, received text/plain", from: ["portrait regression probe"],
    })]);
  });

  test("rejects cross-origin redirects without following them", async () => {
    const site = await fixture({ "/assets/tool.js": { status: 302, type: "text/plain", headers: { location: "https://outside.invalid/tool.js" }, body: "" } });
    const result = await verifyDeployedWeb({ origin: site.origin });
    expect(result.ok).toBe(false);
    expect(result.failures[0].reason).toContain("cross-origin redirect");
  });

  test("stops a stalled resource at the configured timeout", async () => {
    const site = await fixture({ "/assets/tool.js": { type: "text/javascript", body: "export default 1", delayMs: 1000 } });
    const result = await verifyDeployedWeb({ origin: site.origin, timeoutMs: 100 });
    expect(result.ok).toBe(false);
    expect(result.failures).toEqual([expect.objectContaining({ url: `${site.origin}/assets/tool.js`, reason: "request timed out after 100ms" })]);
  });
});
