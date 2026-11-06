import { pathToFileURL } from "node:url";
import { extractWebReferences, resolveWebReference } from "./verify-web-artifact.mjs";

export const DEPLOYED_WEB_ENTRIES = Object.freeze([
  "/", "/cn/", "/dianlu/", "/en/", "/jp/", "/global/zh-CN/", "/global/ja/",
  "/tools/s5-nature/index.html",
]);
export const DEPLOYED_WEB_PORTRAITS = Object.freeze([
  "/global-assets/assets/spirits/spirit_e0332c3637a510c6.png",
  "/assets/spirits/spirit_4509a6b87740551b.png",
]);

function responseProblem(kind, response, bytes, requestedUrl) {
  const type = (response.headers.get("content-type") ?? "").split(";", 1)[0].trim().toLowerCase();
  const html = /^\s*(?:<!doctype\s+html\b|<html\b)/i.test(new TextDecoder().decode(bytes.subarray(0, 256)));
  if (kind !== "html" && (html || type === "text/html")) return `HTML returned for ${kind}`;
  const allowed = {
    html: /^(?:text\/html|application\/xhtml\+xml)$/,
    js: /^(?:text|application)\/(?:javascript|ecmascript|x-javascript)$/,
    css: /^text\/css$/,
    wasm: /^application\/wasm$/,
  };
  if (allowed[kind] && !allowed[kind].test(type)) return `expected ${kind} content type, received ${type || "(missing)"}`;
  if (new URL(requestedUrl).pathname.toLowerCase().endsWith(".png")) {
    if (type !== "image/png") return `expected image/png, received ${type || "(missing)"}`;
    const signature = [137, 80, 78, 71, 13, 10, 26, 10];
    if (!signature.every((value, index) => bytes[index] === value)) return "invalid PNG response";
  }
  return null;
}

async function fetchSameOrigin(url, origin, timeoutMs) {
  const signal = AbortSignal.timeout(timeoutMs);
  for (let redirects = 0; redirects <= 5; redirects++) {
    const response = await fetch(url, { redirect: "manual", signal });
    if (![301, 302, 303, 307, 308].includes(response.status)) return response;
    const location = response.headers.get("location");
    await response.body?.cancel();
    if (!location) throw new Error("redirect has no Location");
    url = new URL(location, url).href;
    if (new URL(url).origin !== origin) throw new Error(`cross-origin redirect: ${url}`);
  }
  throw new Error("too many redirects");
}

export async function verifyDeployedWeb({
  origin = "https://rococalc.top",
  entries = DEPLOYED_WEB_ENTRIES,
  portraits = DEPLOYED_WEB_PORTRAITS,
  concurrency = 4,
  timeoutMs = 15_000,
  maxResources = 512,
} = {}) {
  const base = new URL(origin);
  if (!/^https?:$/.test(base.protocol) || base.pathname !== "/" || base.search || base.hash) throw new Error("origin must be an HTTP(S) origin without a path");
  if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 16) throw new Error("concurrency must be between 1 and 16");
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1) throw new Error("timeoutMs must be positive");
  if (!Number.isInteger(maxResources) || maxResources < 1) throw new Error("maxResources must be positive");
  const resources = new Map();
  const queue = [];
  const errors = [];
  const add = (path, kind, from) => {
    const url = new URL(path, base);
    if (url.origin !== base.origin) return;
    url.hash = "";
    const previous = resources.get(url.href);
    if (previous) { previous.from.add(from); return; }
    if (queue.length >= maxResources) {
      if (!errors.length) errors.push({ url: url.href, reason: `resource limit (${maxResources}) exceeded`, from: [from] });
      return;
    }
    const resource = { url: url.href, kind, from: new Set([from]) };
    resources.set(url.href, resource);
    queue.push(resource);
  };
  for (const path of entries) add(path, "html", "formal entry");
  for (const path of portraits) add(path, "image", "portrait regression probe");
  const counts = {};
  async function inspect(resource) {
    counts[resource.kind] = (counts[resource.kind] ?? 0) + 1;
    try {
      const response = await fetchSameOrigin(resource.url, base.origin, timeoutMs);
      if (!response.ok) {
        await response.body?.cancel();
        resource.problem = `HTTP ${response.status}`;
        return;
      }
      const bytes = new Uint8Array(await response.arrayBuffer());
      resource.problem = responseProblem(resource.kind, response, bytes, resource.url);
      if (resource.problem || !["html", "js", "css"].includes(resource.kind)) return;
      const resourcePath = new URL(response.url).pathname;
      const references = extractWebReferences(new TextDecoder().decode(bytes), resourcePath, { kind: resource.kind });
      if (resource.kind === "html" && !references.some((ref) => ref.kind === "js")) {
        resource.problem = "entry contains no script references";
        return;
      }
      for (const ref of references) {
        // Remote verification follows the code graph and CSS resources, not the entire portrait catalog.
        if (ref.via === "js-image") continue;
        if (resource.kind !== "css" && !["js", "css", "wasm"].includes(ref.kind)) continue;
        let target = resolveWebReference(ref, resourcePath);
        // The file gate cannot identify a deployment's absolute URLs; the HTTP gate knows its origin.
        if (!target && /^(?:https?:)?\/\//iu.test(ref.specifier)) {
          const absolute = new URL(ref.specifier, response.url);
          if (absolute.origin === base.origin) target = absolute.href;
        }
        if (target) add(target, ref.kind, response.url);
      }
    } catch (error) {
      resource.problem = error.name === "TimeoutError" ? `request timed out after ${timeoutMs}ms` : error.message;
    }
  }
  for (let cursor = 0; cursor < queue.length;) {
    const batch = queue.slice(cursor, cursor + concurrency);
    cursor += batch.length;
    await Promise.all(batch.map(inspect));
  }
  const failures = [...errors, ...queue.filter((item) => item.problem).map((item) => ({
    url: item.url, reason: item.problem, from: [...item.from],
  }))];
  return { ok: failures.length === 0, origin: base.origin, checked: queue.length, counts, failures };
}

async function main(args) {
  let origin = "https://rococalc.top";
  for (let index = 0; index < args.length; index++) {
    if (args[index] !== "--origin" || !args[index + 1]) throw new Error("Usage: node scripts/verify-deployed-web.mjs [--origin URL]");
    origin = args[++index];
  }
  const result = await verifyDeployedWeb({ origin });
  console.log(`${result.ok ? "PASS" : "FAIL"} deployed Web ${result.origin}: ${result.checked} resources checked`);
  for (const failure of result.failures) {
    console.error(`- ${failure.reason}: ${failure.url}\n  referenced by ${failure.from.slice(0, 2).join(", ")}`);
  }
  if (!result.ok) process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2)).catch((error) => { console.error(error.message); process.exitCode = 1; });
}
