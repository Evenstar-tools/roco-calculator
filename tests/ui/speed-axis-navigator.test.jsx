import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { useRef } from "react";
import SpeedAxisNavigator from "../../src/components/SpeedAxisNavigator.jsx";

const items = [300, 200, 200, 100, 80].map((value, index) => ({ key: `tier-${index}`, value }));
let frames, observers, frameId;

beforeEach(() => {
  frames = new Map();
  observers = [];
  frameId = 0;
  vi.stubGlobal("requestAnimationFrame", (callback) => {
    frames.set(++frameId, callback);
    return frameId;
  });
  vi.stubGlobal("cancelAnimationFrame", (id) => frames.delete(id));
  vi.stubGlobal("ResizeObserver", class {
    constructor(callback) { this.callback = callback; observers.push(this); }
    observe = vi.fn();
    disconnect = vi.fn();
  });
});
afterEach(() => vi.unstubAllGlobals());

const flush = () => act(() => {
  const pending = [...frames.values()];
  frames.clear();
  pending.forEach((callback) => callback());
});
const metric = (overrides = {}) => ({
  height: 160, width: 500, header: 30, top: 0, heights: [40, 140, 60, 180, 60], writes: [], ...overrides,
});

function Harness({ data = items, metrics, hidden = false }) {
  const scrollRef = useRef(null);
  const attach = (node) => {
    scrollRef.current = node;
    if (!node) return;
    Object.defineProperties(node, {
      clientHeight: { configurable: true, get: () => metrics.height },
      clientWidth: { configurable: true, get: () => metrics.width },
      scrollHeight: { configurable: true, get: () => metrics.header + metrics.heights.slice(0, data.length).reduce((sum, height) => sum + height, 0) },
      scrollTop: { configurable: true, get: () => metrics.top, set: (value) => { metrics.top = value; metrics.writes.push(value); } },
    });
    node.getBoundingClientRect = () => ({ top: 100, bottom: 100 + metrics.height, height: metrics.height, width: metrics.width });
    node.querySelector("table").getBoundingClientRect = () => ({ height: node.scrollHeight, width: metrics.width });
    node.querySelector("thead").getBoundingClientRect = () => ({ top: 100, bottom: 100 + metrics.header, height: metrics.header });
    node.querySelectorAll("tbody tr").forEach((row, index) => {
      row.getBoundingClientRect = () => {
        const offset = metrics.heights.slice(0, index).reduce((sum, height) => sum + height, 0);
        const top = 100 + metrics.header + offset - metrics.top;
        return { top, bottom: top + metrics.heights[index], height: metrics.heights[index] };
      };
    });
  };
  return <div hidden={hidden}>
    <SpeedAxisNavigator scrollRef={scrollRef} items={data} label="速度定位" />
    <div ref={attach} data-testid="scroll"><table><thead><tr><th>速度</th></tr></thead>
      <tbody>{data.map((item) => <tr key={item.key} data-speed-nav-key={item.key}><th>{item.value}</th></tr>)}</tbody>
    </table></div>
  </div>;
}

const currentRow = (container) => container.querySelector("[data-speed-axis-current]");
const slider = () => screen.getByRole("slider", { name: "速度定位" });
const moveTo = (index, length = items.length) => fireEvent.change(slider(), { target: { value: length - 1 - index } });
const manuallyScroll = (metrics, top) => {
  metrics.top = top;
  fireEvent.scroll(screen.getByTestId("scroll"));
  flush();
};

test("初次挂载和首次尺寸通知只同步已有定位，不覆盖父组件滚动", () => {
  const metrics = metric({ top: 200 });
  const { container } = render(<Harness metrics={metrics} />);
  expect(metrics.writes).toEqual([]);
  expect(metrics.top).toBe(200);
  expect(slider()).toHaveAttribute("aria-valuetext", "200");
  expect(currentRow(container)).toHaveAttribute("data-speed-nav-key", "tier-2");
  act(() => observers[0].callback());
  expect(metrics.writes).toEqual([]);
});

test("原生反向滑块定位真实不等高行，减去表头且保留重复数值的独立key", () => {
  const metrics = metric();
  const { container } = render(<Harness metrics={metrics} />);
  expect(slider()).toHaveValue("4");
  expect(slider()).toHaveAttribute("aria-orientation", "vertical");
  moveTo(1);
  expect(metrics.top).toBe(40);
  expect(currentRow(container)).toHaveAttribute("data-speed-nav-key", "tier-1");
  expect(slider()).toHaveAttribute("aria-valuetext", "200");
  moveTo(2);
  expect(metrics.top).toBe(180);
  expect(currentRow(container)).toHaveAttribute("data-speed-nav-key", "tier-2");
  expect(slider()).toHaveValue("2");
  expect(slider()).toHaveAttribute("aria-valuetext", "200");
  const tickValues = [...container.querySelectorAll(".speed-axis-nav__ticks span")].map((node) => node.textContent);
  expect(tickValues.length).toBeLessThanOrEqual(5);
  expect(new Set(tickValues).size).toBe(tickValues.length);
});

test("底部不足一屏时保留程序选择档位，之后手动滚动继续双向同步", () => {
  const metrics = metric();
  const { container } = render(<Harness metrics={metrics} />);
  moveTo(4);
  expect(metrics.top).toBe(350);
  expect(slider()).toHaveAttribute("aria-valuetext", "80");
  fireEvent.scroll(screen.getByTestId("scroll"));
  flush();
  expect(currentRow(container)).toHaveAttribute("data-speed-nav-key", "tier-4");
  expect(slider()).toHaveAttribute("aria-valuetext", "80");
  manuallyScroll(metrics, 200);
  expect(currentRow(container)).toHaveAttribute("data-speed-nav-key", "tier-2");
  expect(slider()).toHaveAttribute("aria-valuetext", "200");
  manuallyScroll(metrics, 0);
  expect(currentRow(container)).toHaveAttribute("data-speed-nav-key", "tier-0");
  expect(slider()).toHaveValue("4");
});

test.each([false, true])("头像文字切换改变表格行高后同步可见速度，不保留旧滚动锁，重建items=%s", (rebuildItems) => {
  const data = [300, 241, 214, 100, 80].map((value, index) => ({ key: `tier-${index}`, value }));
  const metrics = metric();
  const { container, rerender } = render(<Harness data={data} metrics={metrics} />);
  moveTo(2);
  expect(metrics.top).toBe(180);
  expect(slider()).toHaveAttribute("aria-valuetext", "214");
  const writes = metrics.writes.length;
  metrics.heights[0] = 100;
  metrics.heights[1] = 180;
  if (rebuildItems) rerender(<Harness data={data.map((item) => ({ ...item }))} metrics={metrics} />);
  act(() => observers.at(-1).callback());
  expect(observers.at(-1).observe).toHaveBeenCalledWith(container.querySelector("table"));
  expect(metrics.top).toBe(180);
  expect(metrics.writes).toHaveLength(writes);
  expect(currentRow(container)).toHaveAttribute("data-speed-nav-key", "tier-1");
  expect(slider()).toHaveAttribute("aria-valuetext", "241");
  moveTo(4);
  fireEvent.scroll(screen.getByTestId("scroll"));
  flush();
  act(() => observers.at(-1).callback());
  expect(currentRow(container)).toHaveAttribute("data-speed-nav-key", "tier-4");
  expect(slider()).toHaveAttribute("aria-valuetext", "80");
});

test.each([false, true])("容器重排先触发滚动也保留原档位，重建items=%s", (rebuildItems) => {
  const data = [300, 241, 214, 100, 80].map((value, index) => ({ key: `tier-${index}`, value }));
  const metrics = metric();
  const { container, rerender } = render(<Harness data={data} metrics={metrics} />);
  moveTo(2);
  expect(metrics.top).toBe(180);
  metrics.width = 800;
  metrics.height = 220;
  metrics.heights[0] = 100;
  metrics.heights[1] = 180;
  // Layout can clamp or anchor the native scroll offset before ResizeObserver.
  metrics.top = 100;
  if (rebuildItems) rerender(<Harness data={data.map((item) => ({ ...item }))} metrics={metrics} />);
  fireEvent.scroll(screen.getByTestId("scroll"));
  flush();
  expect(metrics.top).toBe(280);
  expect(currentRow(container)).toHaveAttribute("data-speed-nav-key", "tier-2");
  expect(slider()).toHaveAttribute("aria-valuetext", "214");
  act(() => observers.at(-1).callback());
  expect(metrics.top).toBe(280);
  expect(slider()).toHaveAttribute("aria-valuetext", "214");

  metrics.width = 500;
  metrics.height = 160;
  metrics.heights[0] = 40;
  metrics.heights[1] = 140;
  metrics.top = 240;
  if (rebuildItems) rerender(<Harness data={data.map((item) => ({ ...item }))} metrics={metrics} />);
  fireEvent.scroll(screen.getByTestId("scroll"));
  flush();
  act(() => observers.at(-1).callback());
  expect(metrics.top).toBe(180);
  expect(currentRow(container)).toHaveAttribute("data-speed-nav-key", "tier-2");
  expect(slider()).toHaveAttribute("aria-valuetext", "214");
});

test("方向键逐档、Page十档、Home首档End末档，边界不越界", () => {
  const data = Array.from({ length: 15 }, (_, index) => ({ key: String(index), value: 300 - index * 10 }));
  const metrics = metric({ heights: Array.from({ length: 15 }, () => 60) });
  const { container } = render(<Harness data={data} metrics={metrics} />);
  for (const [key, index] of [
    ["ArrowDown", 1], ["ArrowRight", 2], ["ArrowUp", 1], ["ArrowLeft", 0],
    ["ArrowLeft", 0], ["PageDown", 10], ["PageDown", 14], ["PageUp", 4],
    ["End", 14], ["ArrowDown", 14], ["Home", 0],
  ]) {
    fireEvent.keyDown(slider(), { key });
    expect(currentRow(container)).toHaveAttribute("data-speed-nav-key", String(index));
    expect(slider()).toHaveAttribute("aria-valuetext", String(data[index].value));
  }
});

test("ResizeObserver按当前key保留锚点，隐藏视图不滚动，卸载清理监听与标记", () => {
  const metrics = metric();
  const { container, unmount } = render(<Harness metrics={metrics} />);
  moveTo(2);
  metrics.heights[0] = 80;
  metrics.width = 800;
  act(() => observers[0].callback());
  expect(metrics.top).toBe(220);
  expect(slider()).toHaveAttribute("aria-valuetext", "200");
  const before = metrics.writes.length;
  const scroll = screen.getByTestId("scroll");
  scroll.parentElement.hidden = true;
  metrics.height = 0;
  act(() => observers[0].callback());
  expect(metrics.writes).toHaveLength(before);
  scroll.parentElement.hidden = false;
  metrics.height = 220;
  act(() => observers[0].callback());
  expect(metrics.top).toBe(220);
  const marked = currentRow(container);
  fireEvent.scroll(scroll);
  expect(frames.size).toBe(1);
  unmount();
  expect(observers[0].disconnect).toHaveBeenCalled();
  expect(frames.size).toBe(0);
  expect(marked).not.toHaveAttribute("data-speed-axis-current");
});

test("首次从隐藏视图展开仅读取父组件位置，筛选空档和单档安全", () => {
  const metrics = metric({ height: 0, top: 200 });
  const { rerender, container } = render(<Harness hidden metrics={metrics} />);
  metrics.height = 160;
  rerender(<Harness metrics={metrics} />);
  act(() => observers[0].callback());
  expect(metrics.writes).toEqual([]);
  expect(currentRow(container)).toHaveAttribute("data-speed-nav-key", "tier-2");
  rerender(<Harness data={[items[2]]} metrics={metrics} />);
  expect(slider()).toBeDisabled();
  expect(slider()).toHaveAttribute("aria-valuetext", "200");
  rerender(<Harness data={[]} metrics={metrics} />);
  expect(screen.queryByRole("slider")).toBeNull();
  expect(container.querySelector(".speed-axis-nav")).toBeNull();
  expect(container.querySelector("[data-speed-axis-current]")).toBeNull();
});
