import compressedConfig from "./common-spirit-config.payload.js";
import { decodeCompressedJson } from "./compressed-json.js";

export default decodeCompressedJson(compressedConfig, "内置常用精灵配置");
