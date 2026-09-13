import { readFile, writeFile } from "node:fs/promises";
import { minify } from "terser";

const target = process.argv[2] ?? "dist/client/sw.js";
const source = await readFile(target, "utf8");
const result = await minify(source, { ecma: 2020, toplevel: true, compress: { passes: 2 } });
if (!result.code) throw new Error("离线缓存脚本压缩失败");
await writeFile(target, result.code, "utf8");
