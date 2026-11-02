import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { SkillIcon } from "../../src/components/SkillIcon.jsx";

const skill = { id: "skill_test", name: "筑梦", type: "萌", iconUrl: "/assets/skills/skill_preview_s5_bwiki_test.png" };
const image = (container) => container.querySelector("img.skill-icon");
const waitForRetry = () => act(() => { vi.advanceTimersByTime(12_000); });

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllEnvs(); });

test("selected/tool icons load immediately while long lists can retain lazy loading", () => {
  const { container, rerender } = render(<SkillIcon skill={skill} />);
  expect(image(container)).toHaveAttribute("loading", "eager");
  rerender(<SkillIcon skill={skill} loading="lazy" />);
  expect(image(container)).toHaveAttribute("loading", "lazy");
});

test.each([
  skill,
  { ...skill, iconUrl: "/assets/skills/skill_0123456789abcdef.png" },
  { ...skill, id: "calculator_wish_power_moe", iconUrl: undefined },
])("a failed skill image retries through the single-image recovery URL: $id", (entry) => {
  const { container } = render(<SkillIcon skill={entry} label />);
  const first = image(container);
  const src = first.getAttribute("src");
  fireEvent.error(first);
  expect(container.querySelector(".skill-icon--fallback")).not.toBeNull();
  waitForRetry();
  expect(image(container)).not.toBe(first);
  expect(image(container)).toHaveAttribute("src", `${src}?image-retry=1`);
  fireEvent.load(image(container));
  expect(container.querySelector(".skill-icon--fallback")).toBeNull();
});

test("retries are bounded, then reconnecting restores the image without reloading the page", () => {
  const { container } = render(<SkillIcon skill={skill} />);
  for (let attempt = 0; attempt < 3; attempt += 1) {
    fireEvent.error(image(container));
    waitForRetry();
  }
  fireEvent.error(image(container));
  waitForRetry();
  expect(image(container)).toBeNull();
  expect(vi.getTimerCount()).toBe(0);
  fireEvent.online(window);
  expect(image(container)).toHaveAttribute("src", `${skill.iconUrl}?image-retry=1`);
});

test("changing skills cancels the old retry and returning to a failed skill starts fresh", () => {
  const other = { ...skill, id: "skill_other", iconUrl: "/assets/skills/skill_abcdef0123456789.png" };
  const { container, rerender } = render(<SkillIcon skill={skill} />);
  fireEvent.error(image(container));
  rerender(<SkillIcon skill={other} />);
  waitForRetry();
  expect(image(container)).toHaveAttribute("src", other.iconUrl);
  rerender(<SkillIcon skill={skill} />);
  expect(image(container)).toHaveAttribute("src", skill.iconUrl);
});

test("reconnecting during a retry cancels the old timer instead of starting a duplicate request", () => {
  const { container } = render(<SkillIcon skill={skill} />);
  fireEvent.error(image(container));
  fireEvent.online(window);
  const recovered = image(container);
  expect(recovered).toHaveAttribute("src", `${skill.iconUrl}?image-retry=1`);
  waitForRetry();
  expect(image(container)).toBe(recovered);
  expect(vi.getTimerCount()).toBe(0);
});

test("external HTTPS icons retry without rewriting the third-party URL", () => {
  const external = { ...skill, iconUrl: "https://example.test/skill.png?version=1" };
  const { container, unmount } = render(<SkillIcon skill={external} />);
  fireEvent.error(image(container));
  waitForRetry();
  expect(image(container)).toHaveAttribute("src", external.iconUrl);
  fireEvent.error(image(container));
  unmount();
  expect(vi.getTimerCount()).toBe(0);
});

test.each([
  skill,
  { id: "cn-placeholder:calculator_wish_power_fire", name: "Wishpower Blast", type: "火",
    reference: { sourceId: "calculator_wish_power_fire" }, iconUrl: "/assets/skills/wish-power/7700003.png" },
])("international mounted skills use their own image cache recovery path: $id", (skill) => {
  vi.stubEnv("BASE_URL", "/global-assets/");
  const { container } = render(<SkillIcon skill={skill} />);
  fireEvent.error(image(container));
  waitForRetry();
  expect(image(container)).toHaveAttribute("src", `/global-assets${skill.iconUrl}?image-retry=1`);
});
