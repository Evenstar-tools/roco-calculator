import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const scriptRoot = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptRoot, "..", "..");
const miniappRoot = path.join(repositoryRoot, "miniapp");
const distRoot = path.join(miniappRoot, "dist");
const requireFromMiniapp = createRequire(path.join(miniappRoot, "package.json"));
const CleanCSS = requireFromMiniapp("clean-css");
const { minify: minifyJavaScript } = requireFromMiniapp("terser");

function walkFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const absolutePath = path.join(directory, entry.name);
    return entry.isDirectory() ? walkFiles(absolutePath) : [absolutePath];
  });
}

let savedBytes = 0;
for (const file of walkFiles(distRoot)) {
  const extension = path.extname(file).toLowerCase();
  const original = fs.readFileSync(file, "utf8");
  let optimized = original;

  if (extension === ".wxss" && Buffer.byteLength(original) > 1024) {
    const output = new CleanCSS({ level: 1, rebase: false }).minify(original);
    if (output.errors.length > 0) {
      throw new Error(`WXSS 压缩失败 ${file}: ${output.errors.join("; ")}`);
    }
    optimized = output.styles;
  } else if (extension === ".js" && Buffer.byteLength(original) > 1024) {
    const output = await minifyJavaScript(original, {
      compress: { passes: 2 },
      mangle: false,
      format: { comments: false },
    });
    if (!output.code) {
      throw new Error(`JavaScript 压缩失败 ${file}`);
    }
    optimized = output.code;
  } else if (extension === ".wxml") {
    optimized = original.replace(/>\s+</gu, "><").trim();
  } else if (extension === ".json") {
    optimized = JSON.stringify(JSON.parse(original));
  }

  if (optimized === original) continue;
  fs.writeFileSync(file, optimized, "utf8");
  savedBytes += Buffer.byteLength(original) - Buffer.byteLength(optimized);
}

console.log(`微信产物压缩完成，减少 ${savedBytes} 字节。`);
