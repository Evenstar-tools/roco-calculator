import compressedRuntime from "./bundled-runtime.payload.js";
import { decodeCompressedJson } from "./compressed-json.js";
import { expandBundledRuntime } from "./expand-bundled-runtime.js";

export default expandBundledRuntime(
  decodeCompressedJson(compressedRuntime, "内置计算数据"),
);
