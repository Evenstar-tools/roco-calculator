import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";

// 旧公告/截图导入器的冻结输入，避免让历史补丁测试依赖不断更新的活动快照。
export function readS4PreviewSnapshot() {
  return JSON.parse(gunzipSync(readFileSync("tests/fixtures/s4-preview-2026-09-09.json.gz")).toString("utf8"));
}
