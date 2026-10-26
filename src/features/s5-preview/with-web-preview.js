import { IS_PREVIEW_BUILD } from "../../runtime/preview-channel.js";
import catalog from "../../../data/candidates/s5-preview-new-spirits.json";
import { withCalculatorExtras } from "../../data/snapshot-extras.js";
import { withS5PreviewCatalog } from "./catalog.js";
import { withPublicResourceUrls } from "../../runtime/public-resource-url.js";

// Keep unfinished S5 records out of the formal snapshot and the miniapp core.
export function withWebPreview(snapshot) {
  const displayCatalog = IS_PREVIEW_BUILD ? { ...catalog, entries: catalog.entries.map((entry) =>
    entry.asset?.kind === "reference-silhouette" ? { ...entry, asset: undefined } : entry) } : catalog;
  return withPublicResourceUrls(withS5PreviewCatalog(withCalculatorExtras(snapshot), displayCatalog));
}
