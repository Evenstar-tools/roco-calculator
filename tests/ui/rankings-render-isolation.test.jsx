import { fireEvent, render, screen } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import RankingsPanel from "../../src/components/RankingsPanel.jsx";
import { SpeedOverview } from "../../src/components/AbilityWorkbench.jsx";

vi.mock("../../src/components/AbilityWorkbench.jsx", () => ({
  SpeedOverview: vi.fn(({ onBack }) => <button type="button" onClick={onBack}>return from speed</button>),
}));
const snapshot = { meta: { id: "render-isolation" }, spirits: [], skills: [], traits: [], learnsets: [] };

test("visited rankings ignore unrelated callback changes and call the latest close handler", () => {
  const first = vi.fn();
  const latest = vi.fn();
  const { rerender } = render(<RankingsPanel kind="speed" snapshot={snapshot} onClose={first} />);
  const renders = SpeedOverview.mock.calls.length;
  for (let i = 0; i < 5; i += 1) {
    rerender(<RankingsPanel kind="speed" snapshot={snapshot} onClose={() => latest()} />);
  }
  expect(SpeedOverview).toHaveBeenCalledTimes(renders);
  fireEvent.click(screen.getByRole("button", { name: "return from speed" }));
  expect(latest).toHaveBeenCalledTimes(1);
  expect(first).not.toHaveBeenCalled();
  rerender(<RankingsPanel kind={null} snapshot={snapshot} onClose={() => latest()} />);
  expect(SpeedOverview).toHaveBeenCalledTimes(renders);
  rerender(<RankingsPanel kind="speed" snapshot={snapshot} onClose={() => latest()} />);
  expect(SpeedOverview).toHaveBeenCalledTimes(renders);
});
