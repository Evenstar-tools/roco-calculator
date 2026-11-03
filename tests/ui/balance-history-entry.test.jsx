import { readFileSync } from "node:fs";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { App } from "../../src/App.jsx";
import { RuntimeProvider } from "../../src/runtime/RuntimeContext.jsx";
import { UNVERIFIED_GLOBAL_SNAPSHOT } from "../../src/runtime/unverified-snapshot.js";
import { createCalculatorSessionStore } from "../../src/runtime/workspace-store.js";
import { withWebPreview } from "../../src/features/s5-preview/with-web-preview.js";
import { createInitialState } from "../../src/state/defaults.js";
import { FIRST_RUN_GUIDE_STORAGE_KEY } from "../../src/state/first-run-guide.js";

const balanceHistoryLoad = vi.hoisted(() => ({ imports: 0, renders: 0 }));

// This boundary stub verifies App wiring; the panel's real search and history
// behavior is exercised by its own UI tests.
vi.mock("../../src/features/balance-history/BalanceHistoryPanel.jsx", async () => {
  balanceHistoryLoad.imports += 1;
  const { useState } = await import("react");
  return {
    default: function BalanceHistoryPanel({ snapshot, open, onClose }) {
      balanceHistoryLoad.renders += 1;
      const [query, setQuery] = useState("");
      return open && <section role="dialog" aria-label="平衡调整回顾">
        <span>{snapshot.meta.id}</span>
        <input aria-label="回顾检索测试" value={query} onChange={event => setQuery(event.target.value)} />
        <button type="button" onClick={onClose}>关闭回顾测试</button>
      </section>;
    },
  };
});

const snapshot = withWebPreview(JSON.parse(readFileSync("data/snapshots/current.json", "utf8")));
const spirits = snapshot.spirits.filter(spirit => ["花衣蝶", "银月狼王"].includes(spirit.fullName));

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem(FIRST_RUN_GUIDE_STORAGE_KEY, "1");
  vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ({ entries: [] }) })));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

test("国服回顾只在点击后加载，关闭重开保留检索且不改变当前双方配置", async () => {
  expect(spirits).toHaveLength(2);
  const state = createInitialState({ ...snapshot, spirits });
  state.sides.attacker.displayIvs.hp = 42;
  state.sides.defender.displayIvs.speed = 37;
  state.directions.forward.reduction = 0.6;
  const originalState = JSON.stringify(state);
  createCalculatorSessionStore().saveSession({ present: state, past: [], future: [] });
  render(<App initialSnapshot={snapshot} initialWorkspace={{ state, viewMode: "detailed" }} />);
  await act(async () => {});
  const originalStorage = JSON.stringify(localStorage);
  const attacker = screen.getByRole("combobox", { name: "攻击方精灵" }).value;
  const defender = screen.getByRole("combobox", { name: "防御方精灵" }).value;
  expect(balanceHistoryLoad.imports).toBe(0);

  fireEvent.click(screen.getByRole("button", { name: "工具箱" }));
  const entry = screen.getByRole("button", { name: "平衡调整回顾" });
  await act(async () => {
    fireEvent.pointerEnter(entry);
    fireEvent.focus(entry);
  });
  expect(balanceHistoryLoad.imports).toBe(0);
  fireEvent.click(entry);
  const dialog = await screen.findByRole("dialog", { name: "平衡调整回顾" });
  expect(balanceHistoryLoad.imports).toBe(1);
  expect(screen.queryByRole("navigation", { name: "工具箱" })).not.toBeInTheDocument();
  expect(within(dialog).getByText(snapshot.meta.id)).toBeInTheDocument();
  fireEvent.change(within(dialog).getByLabelText("回顾检索测试"), { target: { value: "花衣蝶" } });
  fireEvent.click(within(dialog).getByRole("button", { name: "关闭回顾测试" }));
  expect(screen.queryByRole("dialog", { name: "平衡调整回顾" })).not.toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: "工具箱" }));
  fireEvent.click(screen.getByRole("button", { name: "平衡调整回顾" }));
  const reopened = await screen.findByRole("dialog", { name: "平衡调整回顾" });
  expect(within(reopened).getByLabelText("回顾检索测试")).toHaveValue("花衣蝶");
  expect(balanceHistoryLoad.imports).toBe(1);
  fireEvent.click(within(reopened).getByRole("button", { name: "关闭回顾测试" }));
  expect(screen.getByRole("combobox", { name: "攻击方精灵" })).toHaveValue(attacker);
  expect(screen.getByRole("combobox", { name: "防御方精灵" })).toHaveValue(defender);
  expect(JSON.stringify(localStorage)).toBe(originalStorage);
  expect(JSON.stringify(state)).toBe(originalState);
});

test("国际服 App 不提供或挂载国服平衡调整回顾", () => {
  const previousRenders = balanceHistoryLoad.renders;
  render(<RuntimeProvider serverId="global"><App initialSnapshot={UNVERIFIED_GLOBAL_SNAPSHOT} /></RuntimeProvider>);
  fireEvent.click(screen.getByRole("button", { name: "工具箱" }));
  expect(screen.queryByRole("button", { name: "平衡调整回顾" })).not.toBeInTheDocument();
  expect(screen.queryByRole("dialog", { name: "平衡调整回顾" })).not.toBeInTheDocument();
  expect(balanceHistoryLoad.renders).toBe(previousRenders);
});
