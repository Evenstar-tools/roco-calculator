import { createHash } from "node:crypto";

export const BWIKI_ROOT = "https://wiki.biligame.com";

export function cleanText(value) {
  return String(value ?? "")
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function stableId(prefix, ...parts) {
  const identity = parts.map(cleanText).join("\u241f");
  const digest = createHash("sha256").update(identity).digest("hex").slice(0, 16);
  return `${prefix}_${digest}`;
}

export function sha256Hex(value) {
  return createHash("sha256").update(value).digest("hex");
}

export function splitFullName(fullName) {
  const match = cleanText(fullName).match(/^(.+?)（(.+?)）$/u);
  return match
    ? { baseName: match[1], variantName: match[2] }
    : { baseName: cleanText(fullName), variantName: null };
}

export function absoluteBwikiUrl(value) {
  if (!value) return null;
  return new URL(value, BWIKI_ROOT).href;
}

export function originalPatchwikiUrl(value) {
  if (!value) return null;
  const url = new URL(value, BWIKI_ROOT);
  const marker = "/images/rocom/thumb/";
  if (!url.pathname.includes(marker)) return url.href;
  const originalPath = url.pathname.replace(marker, "/images/rocom/").replace(/\/[^/]+$/u, "");
  return `${url.origin}${originalPath}`;
}

export function sourceRef(source = {}) {
  return {
    title: source.title ?? null,
    url: source.url ?? null,
    revision: source.revision ?? null,
    fetchedAt: source.fetchedAt ?? null,
    sha256: source.sha256 ?? null,
  };
}

export function toInteger(value) {
  const text = cleanText(value);
  return /^-?\d+$/u.test(text) ? Number.parseInt(text, 10) : null;
}
