import { getServerRelease } from "../domain/server-environment.js";
import { publicResourceUrl } from "./public-resource-url.js";

// Begin the selected region's data transfer alongside the lazy calculator code.
// The normal loader still owns validation, cancellation and retry handling.
export function preloadServerSnapshot(serverId, { document = globalThis.document } = {}) {
  if (!document?.head) return;
  const release = getServerRelease(serverId);
  if (!release.capabilities.calculate || !release.dataURL) return;
  const href = publicResourceUrl(release.dataURL);
  if ([...document.head.querySelectorAll('link[rel="preload"][as="fetch"]')]
    .some((link) => link.getAttribute("href") === href)) return;
  const link = document.createElement("link");
  link.rel = "preload";
  link.setAttribute("as", "fetch");
  link.href = href;
  link.crossOrigin = "anonymous";
  document.head.append(link);
}
