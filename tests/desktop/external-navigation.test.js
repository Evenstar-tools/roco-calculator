import { describe, expect, test } from "vitest";
import preloadNavigation from "../../desktop/preload.cjs";
import * as externalNavigation from "../../desktop/external-navigation.mjs";

const {
  createWindowOpenHandler,
  handleWillNavigate,
} = externalNavigation;
const { installExternalLinkInterceptor } = preloadNavigation;

describe("desktop external navigation", () => {
  test.each([
    "https://github.com/zhangzeyu99-web/rock-calculator/releases/latest",
    "http://example.com/help",
    "mailto:1215583051@qq.com",
  ])("opens supported external links in the system handler: %s", (url) => {
    const openedUrls = [];
    const handler = createWindowOpenHandler((nextUrl) => {
      openedUrls.push(nextUrl);
    });

    expect(handler({ url })).toEqual({ action: "deny" });
    expect(openedUrls).toEqual([url]);
  });

  test.each([
    "app://calculator/",
    "file:///C:/Windows/System32/calc.exe",
    "javascript:alert(1)",
    "not a url",
  ])("does not pass unsupported links to the operating system: %s", (url) => {
    const openedUrls = [];
    const handler = createWindowOpenHandler((nextUrl) => {
      openedUrls.push(nextUrl);
    });

    expect(handler({ url })).toEqual({ action: "deny" });
    expect(openedUrls).toEqual([]);
  });

  test("intercepts same-window external navigation and keeps the app loaded", () => {
    const prevented = [];
    const openedUrls = [];
    const event = { preventDefault: () => prevented.push(true) };
    const url = "mailto:1215583051@qq.com";

    handleWillNavigate(event, url, (nextUrl) => openedUrls.push(nextUrl));

    expect(prevented).toEqual([true]);
    expect(openedUrls).toEqual([url]);
  });

  test("allows navigation inside the bundled app origin", () => {
    const prevented = [];
    const openedUrls = [];
    const event = { preventDefault: () => prevented.push(true) };

    handleWillNavigate(
      event,
      "app://calculator/settings",
      (nextUrl) => openedUrls.push(nextUrl),
    );

    expect(prevented).toEqual([]);
    expect(openedUrls).toEqual([]);
  });

  test("routes real anchor clicks through the desktop bridge", () => {
    document.body.innerHTML = `
      <a href="https://wiki.biligame.com/rocom/" target="_blank">
        <span>BWIKI</span>
      </a>
    `;
    const openedUrls = [];
    const removeListener = installExternalLinkInterceptor(
      document,
      (url) => openedUrls.push(url),
    );
    const event = new MouseEvent("click", { bubbles: true, cancelable: true });

    document.querySelector("span").dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
    expect(openedUrls).toEqual(["https://wiki.biligame.com/rocom/"]);
    removeListener();
  });

  test("leaves unsupported anchor protocols inside Chromium", () => {
    document.body.innerHTML = `
      <a href="app://calculator/settings"><span>settings</span></a>
    `;
    const openedUrls = [];
    const removeListener = installExternalLinkInterceptor(
      document,
      (url) => openedUrls.push(url),
    );
    const event = new MouseEvent("click", { bubbles: true, cancelable: true });
    let preventedByInterceptor = null;
    document.addEventListener(
      "click",
      (nextEvent) => {
        preventedByInterceptor = nextEvent.defaultPrevented;
        nextEvent.preventDefault();
      },
      { once: true },
    );

    document.querySelector("span").dispatchEvent(event);

    expect(preventedByInterceptor).toBe(false);
    expect(openedUrls).toEqual([]);
    removeListener();
  });
});
