import { localizeGlobalCatalog } from "../../runtime/global-entity-localization.js";
import { withS5AnnouncementCatalog } from "./s5-announcement-catalog.js";

const preparedCatalogs = new WeakMap();
const missingSnapshot = {};
const nullSnapshot = {};

// Keep preparation across panel mounts without retaining old catalogs or snapshots.
export function prepareSkillQueryCatalog(catalog, snapshot, serverId = "cn", locale = "zh-CN") {
  if (!catalog) return { canonicalData: catalog, data: catalog };
  let snapshots = preparedCatalogs.get(catalog);
  if (!snapshots) {
    snapshots = new WeakMap();
    preparedCatalogs.set(catalog, snapshots);
  }
  const snapshotKey = snapshot === null ? nullSnapshot : snapshot ?? missingSnapshot;
  let environments = snapshots.get(snapshotKey);
  if (!environments) {
    environments = new Map();
    snapshots.set(snapshotKey, environments);
  }
  const key = JSON.stringify([serverId, locale]);
  if (environments.has(key)) return environments.get(key);

  const canonicalData = withS5AnnouncementCatalog(catalog, snapshot);
  const data = serverId !== "global" || !canonicalData ? canonicalData : {
    ...canonicalData,
    seasons: canonicalData.seasons.map((season) => {
      const display = localizeGlobalCatalog({ ...season, meta: { serverId: "global" } }, locale);
      return {
        ...display,
        spirits: display.spirits.filter(entry => entry.catalogAvailable !== false),
        skills: display.skills.filter(entry => entry.catalogAvailable !== false),
      };
    }),
  };
  const prepared = { canonicalData, data };
  environments.set(key, prepared);
  return prepared;
}
