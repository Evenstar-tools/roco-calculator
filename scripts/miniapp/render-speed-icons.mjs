import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Eye, EyeSlash } from "@phosphor-icons/react/ssr";
import { chromium } from "@playwright/test";

const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 96, height: 96 } });
  for (const [name, Icon] of [["eye", Eye], ["eye-slash", EyeSlash]]) {
    await page.setContent(`<style>body{margin:0;background:transparent}svg{display:block}</style>${renderToStaticMarkup(React.createElement(Icon, { size: 96, color: "#273342" }))}`);
    await page.screenshot({ path: `miniapp/src/assets/icons/${name}.png`, omitBackground: true });
  }
} finally { await browser.close(); }
