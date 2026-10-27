import catalog from "../../../data/candidates/s5-preview-new-spirits.json";
import { withCalculatorExtras } from "../../data/snapshot-extras.js";
import { withS5PreviewCatalog } from "./catalog.js";
import { applyS5SeasonAnnouncement } from "./season-announcement.js";
import { withPublicResourceUrls } from "../../runtime/public-resource-url.js";

// Keep unfinished S5 records out of the formal snapshot and the miniapp core.
export function withWebPreview(snapshot) {
  const preview = withS5PreviewCatalog(applyS5SeasonAnnouncement(withCalculatorExtras(snapshot)), catalog, { useTestRaceStats: true });
  let changed = false;
  const spirits = preview.spirits.map((spirit) => {
    if (!spirit.changeInfo?.isNew || spirit.previewIdentity?.formalIdPending) return spirit;
    if (!spirit.changeInfo.patch?.id?.startsWith("s4-")) return spirit;
    changed = true;
    return { ...spirit, changeInfo: { ...spirit.changeInfo, isNew: false } };
  });
  return withPublicResourceUrls(changed ? { ...preview, spirits } : preview);
}
