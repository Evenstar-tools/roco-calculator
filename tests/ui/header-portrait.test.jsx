import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { useState } from "react";
import { AppHeader } from "../../src/components/AppHeader.jsx";

afterEach(() => vi.unstubAllGlobals());
test("仅竖屏合并模式按钮，点击双向切换，旋转恢复双按钮", () => {
  let change;
  const media = { matches: true, addEventListener: (_, fn) => { change = fn; }, removeEventListener: vi.fn() };
  vi.stubGlobal("matchMedia", () => media);
  function Harness() { const [mode, setMode] = useState("compact"); return <AppHeader viewMode={mode} onViewModeChange={setMode} />; }
  render(<Harness />);
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
