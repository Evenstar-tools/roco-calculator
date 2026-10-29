import { entryCount as s5Count } from "../../data/presets/s5-popular-configs.json";

export const POPULAR_CONFIG_COUNT = 231 + (import.meta.env?.MODE === "pre" ? s5Count : 0);
