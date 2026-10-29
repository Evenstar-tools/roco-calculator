import s5Presets from "../../data/presets/s5-popular-configs.json" with { type: "json" };

export const BASE_POPULAR_CONFIG_COUNT = 231;
export const POPULAR_CONFIG_COUNT = BASE_POPULAR_CONFIG_COUNT + s5Presets.entryCount;
