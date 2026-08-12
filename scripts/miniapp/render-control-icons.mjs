import { createRequire } from "node:module";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  ArrowCircleUp,
  ArrowsLeftRight,
  CaretRight,
  CheckCircle,
} from "@phosphor-icons/react/ssr";

const require = createRequire(import.meta.url);
const sharp = require("sharp");

const outputDir = resolve("miniapp/src/assets/icons");
const color = "#273342";
const success = "#14805e";
const icons = [
  ["arrows-left-right.png", ArrowsLeftRight, { color, weight: "bold" }],
  ["caret-right.png", CaretRight, { color, weight: "bold" }],
  ["status-up.png", ArrowCircleUp, { color: success, weight: "fill" }],
  ["status-check.png", CheckCircle, { color: success, weight: "fill" }],
];

await mkdir(outputDir, { recursive: true });

for (const [filename, Icon, props] of icons) {
  const svg = renderToStaticMarkup(
    React.createElement(Icon, {
      ...props,
      "aria-hidden": true,
      size: 96,
    }),
  );
  await sharp(Buffer.from(svg))
    .png({ compressionLevel: 9, palette: false })
    .toFile(resolve(outputDir, filename));
  console.log(`Rendered ${filename} from @phosphor-icons/react`);
}
