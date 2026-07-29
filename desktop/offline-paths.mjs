import path from "node:path";

const OFFLINE_ORIGIN = "app://calculator";

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
