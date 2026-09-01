import { readFileSync } from "node:fs";
import path from "node:path";

const STYLES_ROOT = path.join(process.cwd(), "src");

/**
 * 读取 Web 端全量样式文本。
 * src/styles.css 已拆分为 @import 聚合器,按 import 顺序拼接分片,
 * 拼接结果与拆分前的单文件逐字节一致,原有字符串断言无需调整。
 */
export function readWebStyles() {
  const aggregator = readFileSync(path.join(STYLES_ROOT, "styles.css"), "utf8");
  const imports = [...aggregator.matchAll(/@import\s+"\.\/(.+?)";/g)].map(
    (match) => match[1],
  );
  if (imports.length === 0) {
    return aggregator;
  }
  return imports
    .map((relative) => readFileSync(path.join(STYLES_ROOT, relative), "utf8"))
    .join("");
}
