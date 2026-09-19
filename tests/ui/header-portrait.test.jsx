import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { useState } from "react";
import { AppHeader } from "../../src/components/AppHeader.jsx";

afterEach(() => vi.unstubAllGlobals());
test("仅窄屏竖向合并模式按钮，点击双向切换，尺寸变化恢复双按钮", () => {
  let change;
  const media = { matches: true, addEventListener: (_, fn) => { change = fn; }, removeEventListener: vi.fn() };
  vi.stubGlobal("matchMedia", () => media);
  function Harness() { const [mode, setMode] = useState("compact"); return <AppHeader viewMode={mode} onViewModeChange={setMode} />; }
  render(<Harness />);
  expect(document.querySelector(".app-header__title-short")).toHaveTextContent("S4「月涌狂想」");
  const group = within(screen.getByRole("group", { name: "界面模式" }));
  expect(group.getAllByRole("button")).toHaveLength(1);
  expect(group.getByRole("button")).toHaveStyle({ height: "38px", minHeight: "38px" });
  fireEvent.click(group.getByRole("button", { name: "当前精简版，切换到具体版" }));
  expect(group.getByRole("button", { name: "当前具体版，切换到精简版" })).toBeVisible();
  fireEvent.click(group.getByRole("button"));
  expect(group.getByRole("button", { name: "当前精简版，切换到具体版" })).toBeVisible();
  act(() => { media.matches = false; change(); });
  expect(group.getAllByRole("button")).toHaveLength(2);
  expect(group.getByRole("button", { name: "精简版" })).toHaveAttribute("aria-pressed", "true");
});

test.each([
  [390, 844, 1],
  [620, 900, 1],
  [621, 900, 2],
  [1280, 1600, 2],
  [1440, 900, 2],
  [600, 400, 2],
])("%i×%i 的标题栏保留 %i 个模式按钮", (width, height, count) => {
  vi.stubGlobal("matchMedia", (query) => ({
    matches: (!query.includes("max-width") || width <= 620) && height >= width,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }));
  render(<AppHeader />);
  expect(within(screen.getByRole("group", { name: "界面模式" })).getAllByRole("button"))
    .toHaveLength(count);
});
