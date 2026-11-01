import { IS_S5_CN_BUILD } from "../runtime/preview-channel.js";
import s5Presets from "../../data/presets/s5-popular-configs.json" with { type: "json" };

export const POPULAR_CONFIG_COUNT = 231 + (IS_S5_CN_BUILD ? s5Presets.entryCount : 0);
