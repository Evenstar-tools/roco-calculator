import path from "node:path";

const OFFLINE_ORIGIN = "app://calculator";

// React 用 style={{}} 写元素 style 属性；CSP 的 style-src-attr 回退到
// style-src，因此必须放行 'unsafe-inline'。产物 CSS/JS 都是独立文件，
// script-src 不放行 unsafe-inline；源码与样式也没有 data: 图片。
export const HTML_CONTENT_SECURITY_POLICY = [
  "default-src 'self' app:",
  "script-src 'self' app:",
  "style-src 'self' app: 'unsafe-inline'",
  "img-src 'self' app:",
  "font-src 'self' app:",
  "connect-src 'self' app:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join("; ");

export function buildBundledAssetHeaders(mimeType) {
  const headers = { "cache-control": "no-store" };
  if (mimeType === "text/html") {
    headers["content-security-policy"] = HTML_CONTENT_SECURITY_POLICY;
  }
  return headers;
}

export function resolveOfflineAssetPath(requestUrl, clientRoot) {
  if (!String(requestUrl).startsWith(OFFLINE_ORIGIN)) return null;

  const rawPath = String(requestUrl)
    .slice(OFFLINE_ORIGIN.length)
    .split(/[?#]/u, 1)[0];

  let decodedPath;
  try {
    decodedPath = decodeURIComponent(rawPath);
  } catch {
    return null;
  }

  const segments = decodedPath
    .replaceAll("\\", "/")
    .split("/")
    .filter(Boolean);
  if (segments.includes("..")) return null;

  const relativePath = segments.length ? path.join(...segments) : "index.html";
  const resolvedRoot = path.resolve(clientRoot);
  const resolvedPath = path.resolve(resolvedRoot, relativePath);
  if (
    resolvedPath !== resolvedRoot &&
    !resolvedPath.startsWith(`${resolvedRoot}${path.sep}`)
  ) {
    return null;
  }
  return resolvedPath;
}
