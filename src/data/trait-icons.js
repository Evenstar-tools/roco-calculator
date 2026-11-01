import icons from "./trait-icons.json";

const LOCAL_TRAIT_ICON = /^\/(?:pre\/|global-assets\/)?assets\/traits\/[\w-]+\.(?:png|webp)$/u;

/** Presentation only: never replace a region or season's trait text or rules. */
export function getTraitIconUrl(trait) {
  if (!trait) return "";
  if (LOCAL_TRAIT_ICON.test(trait.iconUrl ?? "")) return trait.iconUrl;
  return icons.ids[trait.id] ?? icons.ids[trait.reference?.sourceId]
    ?? icons.names[trait.name] ?? "";
}
