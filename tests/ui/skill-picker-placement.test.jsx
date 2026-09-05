import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, test, vi } from "vitest";
import {
  resolveSkillMenuLayout,
  SkillPicker,
} from "../../src/components/SkillPicker.jsx";

const skills = Array.from({ length: 40 }, (_, index) => ({
  basePower: 40,
  category: "physical",
  cost: 1,
  id: `skill-${index + 1}`,
  name: `技能${index + 1}`,
  type: "普通",
}));

const originalInnerHeight = window.innerHeight;

afterEach(() => {
  Object.defineProperty(window, "innerHeight", {
    configurable: true,
    value: originalInnerHeight,
  });
  vi.restoreAllMocks();
});

function setViewportHeight(value) {
  Object.defineProperty(window, "innerHeight", {
    configurable: true,
    value,
  });
}

function rect(top, bottom) {
  return {
    bottom,
    height: bottom - top,
    left: 0,
    right: 400,
    top,
    width: 400,
    x: 0,
    y: top,
    toJSON() {},
  };
}

test("chooses the roomier direction and limits height to the viewport", () => {
  expect(resolveSkillMenuLayout({
    inputBottom: 614,
    inputTop: 574,
    viewportHeight: 900,
  })).toEqual({ maxHeight: 360, placement: "up" });
  expect(resolveSkillMenuLayout({
    inputBottom: 54,
    inputTop: 20,
    viewportHeight: 300,
  })).toEqual({ maxHeight: 234, placement: "down" });
  expect(resolveSkillMenuLayout({
    inputBottom: 184,
    inputTop: 150,
    viewportHeight: 320,
  })).toEqual({ maxHeight: 138, placement: "up" });
});

test("remeasures on resize, scroll, and reopen while keyboard navigation uses the limited height", async () => {
  const user = userEvent.setup();
  setViewportHeight(900);
  render(
    <div data-testid="scroll-host">
      <SkillPicker
        ariaLabel="选择技能"
        onSelect={vi.fn()}
        selected={skills[0]}
        skills={skills}
      />
    </div>,
  );
  const picker = screen.getByRole("combobox", { name: "选择技能" });
  let currentRect = rect(574, 614);
  vi.spyOn(picker, "getBoundingClientRect")
    .mockImplementation(() => currentRect);

  await user.click(picker);
  let listbox = screen.getByRole("listbox");
  await waitFor(() => {
    expect(listbox).toHaveAttribute("data-placement", "up");
    expect(listbox).toHaveStyle({ maxHeight: "360px" });
  });

  currentRect = rect(20, 54);
  setViewportHeight(210);
  fireEvent(window, new Event("resize"));
  await waitFor(() => {
    expect(listbox).toHaveAttribute("data-placement", "down");
    expect(listbox).toHaveStyle({ maxHeight: "144px" });
  });
  for (let index = 0; index < 8; index += 1) {
    await user.keyboard("{ArrowDown}");
  }
  const activeId = picker.getAttribute("aria-activedescendant");
  expect(activeId).toBeTruthy();
  const activeOption = document.getElementById(activeId);
  expect(activeOption).toBeInTheDocument();
  const activeBottom = Number(activeOption.getAttribute("aria-posinset")) * 42;
  expect(activeBottom).toBeLessThanOrEqual(listbox.scrollTop + 144);

  currentRect = rect(300, 334);
  setViewportHeight(400);
  fireEvent.scroll(screen.getByTestId("scroll-host"));
  await waitFor(() => {
    expect(listbox).toHaveAttribute("data-placement", "up");
    expect(listbox).toHaveStyle({ maxHeight: "288px" });
  });

  await user.keyboard("{Escape}");
  expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  currentRect = rect(20, 54);
  setViewportHeight(500);
  fireEvent.blur(picker, { relatedTarget: document.body });
  fireEvent.focus(picker);
  listbox = screen.getByRole("listbox");
  await waitFor(() => {
    expect(listbox).toHaveAttribute("data-placement", "down");
    expect(listbox).toHaveStyle({ maxHeight: "360px" });
  });
});
