import { decompressFromBase64 } from "lz-string";
import compressedRuntime from "./bundled-runtime.payload.js";
import { expandBundledRuntime } from "./expand-bundled-runtime.js";

const runtimeText = decompressFromBase64(compressedRuntime);

if (!runtimeText) {
  throw new Error("内置计算数据解压失败");
}

export default expandBundledRuntime(JSON.parse(runtimeText));
