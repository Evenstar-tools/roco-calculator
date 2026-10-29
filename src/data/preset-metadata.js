import s5Presets from "../../data/presets/s5-popular-configs.json" with { type: "json" };

export const POPULAR_CONFIG_COUNT = 231 + (import.meta.env?.MODE === "pre" ? s5Presets.entryCount : 0);
