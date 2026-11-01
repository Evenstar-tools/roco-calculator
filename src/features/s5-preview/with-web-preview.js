import { withS5OfficialVideoSkills } from "./official-video.js";
import catalog from "../../../data/candidates/s5-preview-new-spirits.json";
import { withCalculatorExtras } from "../../data/snapshot-extras.js";
import { withS5PreviewCatalog } from "./catalog.js";
import { applyS5SeasonAnnouncement } from "./season-announcement.js";
import { withPublicResourceUrls } from "../../runtime/public-resource-url.js";
import { restoreS5RuntimeRelations } from "../../data/s5-runtime-relations.js";

// Keep unfinished S5 records out of the formal snapshot and the miniapp core.
export function withWebPreview(snapshot) {
  snapshot = restoreS5RuntimeRelations(snapshot);
  if (snapshot.meta?.s5NrcSync?.complete === true) return withPublicResourceUrls(withCalculatorExtras(snapshot));
  const preview = withS5PreviewCatalog(applyS5SeasonAnnouncement(withCalculatorExtras(snapshot)), catalog, { useTestRaceStats: true });
  let changed = false;
  const spirits = preview.spirits.map((spirit) => {
    if (!spirit.changeInfo?.isNew || spirit.previewIdentity?.formalIdPending) return spirit;
    if (!spirit.changeInfo.patch?.id?.startsWith("s4-")) return spirit;
    changed = true;
    return { ...spirit, changeInfo: { ...spirit.changeInfo, isNew: false } };
  });
  return withPublicResourceUrls(withS5OfficialVideoSkills(changed ? { ...preview, spirits } : preview));
}
