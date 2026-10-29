/** Resolve public files within this build's mount point without changing external URLs. */
export function publicResourceUrl(value, base = import.meta.env?.BASE_URL ?? "/") {
  if (typeof value !== "string" || !value.startsWith("/") || value.startsWith("//")) return value;
  if (!base || base === "/") return value;
  const prefix = `${base.replace(/\/+$/u, "")}/`;
  if (value.startsWith(prefix)) return value;
  return `${prefix}${value.slice(1)}`;
}

const RESOURCE_FIELDS = new Set(["assetUrl", "iconUrl", "imageUrl", "localUrl", "publicPath", "path"]);
const EVIDENCE_FIELDS = new Set(["previewIdentity", "provenance", "changeInfo"]);

/** Project display URLs only; IDs, versions and source/evidence records stay untouched. */
export function withPublicResourceUrls(value, base = import.meta.env?.BASE_URL ?? "/") {
  if (!base || base === "/" || !value || typeof value !== "object") return value;
  function project(current, field = "") {
    if (typeof current === "string") {
      return RESOURCE_FIELDS.has(field) && current.startsWith("/assets/")
        ? publicResourceUrl(current, base) : current;
    }
    if (!current || typeof current !== "object") return current;
    let changed = false;
    const entries = Object.entries(current).map(([key, child]) => {
      const next = EVIDENCE_FIELDS.has(key) ? child : project(child, key);
      if (next !== child) changed = true;
      return [key, next];
    });
    if (!changed) return current;
    return Array.isArray(current) ? entries.map(([, child]) => child) : Object.fromEntries(entries);
  }
  return project(value);
}
