import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

// JSDOM lacks media/orientation APIs used by AppHeader portrait layout.
if (typeof window !== "undefined") {
  if (!window.matchMedia) {
    window.matchMedia = (media) => ({
      media,
      matches: false,
      onchange: null,
      addListener() {},
      removeListener() {},
      addEventListener() {},
      removeEventListener() {},
      dispatchEvent() {
        return false;
      },
    });
  }
  if (!window.screen) window.screen = {};
  if (!window.screen.orientation) {
    window.screen.orientation = {
      type: "landscape-primary",
      angle: 0,
      addEventListener() {},
      removeEventListener() {},
      dispatchEvent() {
        return false;
      },
    };
  }
}

afterEach(() => {
  cleanup();
});
