import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";
import { FirstRunGuide } from "../../src/components/FirstRunGuide.jsx";

function renderGuide(props = {}) {
  const actions = {
    onBack: vi.fn(),
    onImport: vi.fn(),
    onNext: vi.fn(),
    onOpenDetailed: vi.fn(),
    onSkip: vi.fn(),
  };
  render(
    <>
      <div data-guide-target="attacker">攻击方目标</div>
      <div data-guide-target="defender">防御方目标</div>
      <div data-guide-target="quick-settings">快捷配置目标</div>
      <div data-guide-target="skills">技能目标</div>
      <div data-guide-target="detailed-mode">具体版目标</div>
      <FirstRunGuide
        importCount={213}
        open
        step={0}
        {...actions}
        {...props}
      />
    </>,
  );
  return actions;
}

function guideRect({ bottom, height, left, right, top, width }) {
  return { bottom, height, left, right, top, width, x: left, y: top };
}

describe("FirstRunGuide", () => {
  test("walks through the real calculator tasks with usable actions", () => {
    const actions = renderGuide();

    expect(screen.getByRole("dialog", { name: "新手引导 1/6" }))
      .toHaveTextContent("先选攻击方");
    expect(screen.getByText("选择本回合出手的精灵"))
      .toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "下一步" }));
    expect(actions.onNext).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole("button", { name: "跳过引导" }));
    expect(actions.onSkip).toHaveBeenCalledOnce();
  });

  test("does not let a beginner leave a required step before completing it", () => {
    const actions = renderGuide({ ready: false });
    const nextButton = screen.getByRole("button", { name: "下一步" });

    expect(nextButton).toBeDisabled();
    expect(nextButton).toHaveAttribute("title", "请先完成当前步骤");
    fireEvent.click(nextButton);
    expect(actions.onNext).not.toHaveBeenCalled();
  });

  test("guides compact settings, skill comparison, and detailed mode before import", () => {
    const actions = renderGuide({ step: 2 });

    expect(screen.getByRole("dialog", { name: "新手引导 3/6" }))
      .toHaveTextContent("选性格和个体");
    expect(screen.getByText("双方先选正面性格；六项个体默认都是 60，可按需取消"))
      .toBeInTheDocument();

    renderGuide({ step: 3 });
    expect(screen.getByRole("dialog", { name: "新手引导 4/6" }))
      .toHaveTextContent("单技能 / 四技能");

    const detailedActions = renderGuide({ step: 4 });
    expect(screen.getByRole("dialog", { name: "新手引导 5/6" }))
      .toHaveTextContent("需要细调时");
    expect(screen.getByRole("button", { name: "前往具体版" }))
      .toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "前往具体版" }));
    expect(detailedActions.onNext).toHaveBeenCalledOnce();
    expect(detailedActions.onOpenDetailed).toHaveBeenCalledOnce();
  });

  test("explains persistent memory before importing popular configurations", () => {
    const actions = renderGuide({ step: 5 });

    expect(screen.getByRole("dialog", { name: "新手引导 6/6" }))
      .toHaveTextContent("导入热门配置");
    expect(screen.getByText("213 只 PVP 精灵配置，安装后离线可用"))
      .toBeInTheDocument();
    expect(screen.getByText("以后修改性格、个体和技能，都会继续记住"))
      .toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "导入并完成" }));
    expect(actions.onImport).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole("button", { name: "上一步" }));
    expect(actions.onBack).toHaveBeenCalledOnce();
  });

  test("keeps the final step open while import fails or is in progress", () => {
    renderGuide({ error: "内置配置无法读取", importing: true, step: 5 });

    expect(screen.getByRole("alert")).toHaveTextContent("内置配置无法读取");
    expect(screen.getByRole("button", { name: "正在导入" })).toBeDisabled();
  });

  test("renders safely when the highlighted target is not available", () => {
    render(
      <FirstRunGuide
        importCount={213}
        onBack={() => {}}
        onImport={() => {}}
        onNext={() => {}}
        onSkip={() => {}}
        open
        step={3}
      />,
    );

    expect(screen.getByRole("dialog", { name: "新手引导 4/6" }))
      .toHaveTextContent("选择双方精灵后，这里会显示四技能伤害");
  });

  test("uses the measured guide card height instead of a fixed positioning guess", () => {
    const originalWidth = globalThis.innerWidth;
    const originalHeight = globalThis.innerHeight;
    Object.defineProperty(globalThis, "innerWidth", { configurable: true, value: 900 });
    Object.defineProperty(globalThis, "innerHeight", { configurable: true, value: 600 });
    const rectSpy = vi.spyOn(Element.prototype, "getBoundingClientRect")
      .mockImplementation(function getGuideRect() {
        if (this.classList?.contains("first-run-guide__card")) {
          return {
            bottom: 170,
            height: 170,
            left: 0,
            right: 340,
            top: 0,
            width: 340,
            x: 0,
            y: 0,
          };
        }
        if (this.dataset?.guideTarget === "skills") {
          return {
            bottom: 580,
            height: 220,
            left: 28,
            right: 848,
            top: 360,
            width: 820,
            x: 28,
            y: 360,
          };
        }
        return {
          bottom: 0,
          height: 0,
          left: 0,
          right: 0,
          top: 0,
          width: 0,
          x: 0,
          y: 0,
        };
      });

    try {
      renderGuide({ step: 3 });
      expect(screen.getByRole("dialog", { name: "新手引导 4/6" }))
        .toHaveStyle({ top: "178px" });
    } finally {
      rectSpy.mockRestore();
      Object.defineProperty(globalThis, "innerWidth", {
        configurable: true,
        value: originalWidth,
      });
      Object.defineProperty(globalThis, "innerHeight", {
        configurable: true,
        value: originalHeight,
      });
    }
  });

  test("brings an off-screen guide target into view when the step changes", () => {
    const target = document.createElement("div");
    target.dataset.guideTarget = "skills";
    target.getBoundingClientRect = () => ({
      bottom: 1040,
      height: 200,
      left: 24,
      right: 824,
      top: 840,
      width: 800,
      x: 24,
      y: 840,
    });
    target.scrollIntoView = vi.fn();
    document.body.append(target);

    try {
      render(
        <FirstRunGuide
          importCount={213}
          onBack={() => {}}
          onImport={() => {}}
          onNext={() => {}}
          onSkip={() => {}}
          open
          step={3}
        />,
      );
      expect(target.scrollIntoView).toHaveBeenCalledWith({
        behavior: "auto",
        block: "center",
        inline: "nearest",
      });
    } finally {
      target.remove();
    }
  });

  test("does not scroll again when the same step only reflows", () => {
    const originalHeight = globalThis.innerHeight;
    Object.defineProperty(globalThis, "innerHeight", { configurable: true, value: 600 });
    const target = document.createElement("div");
    target.dataset.guideTarget = "skills";
    target.getBoundingClientRect = () => ({
      bottom: 1040,
      height: 200,
      left: 24,
      right: 824,
      top: 840,
      width: 800,
      x: 24,
      y: 840,
    });
    target.scrollIntoView = vi.fn();
    document.body.append(target);

    try {
      const { rerender } = render(
        <FirstRunGuide
          importCount={213}
          layoutKey="before"
          onBack={() => {}}
          onImport={() => {}}
          onNext={() => {}}
          onSkip={() => {}}
          open
          step={3}
        />,
      );
      rerender(
        <FirstRunGuide
          importCount={213}
          layoutKey="after"
          onBack={() => {}}
          onImport={() => {}}
          onNext={() => {}}
          onSkip={() => {}}
          open
          step={3}
        />,
      );
      expect(target.scrollIntoView).toHaveBeenCalledTimes(1);
    } finally {
      target.remove();
      Object.defineProperty(globalThis, "innerHeight", {
        configurable: true,
        value: originalHeight,
      });
    }
  });

  test("keeps the first picker dropdown clear by placing its card beside the target", () => {
    const originalWidth = globalThis.innerWidth;
    Object.defineProperty(globalThis, "innerWidth", { configurable: true, value: 1200 });
    const rectSpy = vi.spyOn(Element.prototype, "getBoundingClientRect")
      .mockImplementation(function getGuideRect() {
        if (this.classList?.contains("first-run-guide__card")) {
          return { bottom: 170, height: 170, left: 0, right: 340, top: 0, width: 340, x: 0, y: 0 };
        }
        if (this.dataset?.guideTarget === "attacker") {
          return { bottom: 160, height: 80, left: 24, right: 424, top: 80, width: 400, x: 24, y: 80 };
        }
        return { bottom: 0, height: 0, left: 0, right: 0, top: 0, width: 0, x: 0, y: 0 };
      });

    try {
      renderGuide();
      expect(screen.getByRole("dialog", { name: "新手引导 1/6" }))
        .toHaveStyle({ left: "436px", top: "80px" });
    } finally {
      rectSpy.mockRestore();
      Object.defineProperty(globalThis, "innerWidth", {
        configurable: true,
        value: originalWidth,
      });
    }
  });

  test("highlights only the picker input before a spirit is selected", () => {
    const rectSpy = vi.spyOn(Element.prototype, "getBoundingClientRect")
      .mockImplementation(function getGuideRect() {
        if (this.classList?.contains("first-run-guide__card")) {
          return guideRect({ bottom: 170, height: 170, left: 0, right: 340, top: 0, width: 340 });
        }
        if (this.dataset?.guideTarget === "attacker") {
          return guideRect({ bottom: 116, height: 36, left: 24, right: 424, top: 80, width: 400 });
        }
        return guideRect({ bottom: 0, height: 0, left: 0, right: 0, top: 0, width: 0 });
      });

    try {
      renderGuide();
      expect(document.querySelector(".first-run-guide__spotlight")).toHaveStyle({
        height: "48px",
        left: "18px",
        top: "74px",
        width: "412px",
      });
    } finally {
      rectSpy.mockRestore();
    }
  });

  test("expands over the open spirit list and then includes the selected spirit card", async () => {
    const rectSpy = vi.spyOn(Element.prototype, "getBoundingClientRect")
      .mockImplementation(function getGuideRect() {
        if (this.classList?.contains("first-run-guide__card")) {
          return guideRect({ bottom: 170, height: 170, left: 0, right: 340, top: 0, width: 340 });
        }
        if (this.dataset?.guideTarget === "attacker") {
          return guideRect({ bottom: 116, height: 36, left: 24, right: 424, top: 80, width: 400 });
        }
        if (this.dataset?.guidePart === "options") {
          return guideRect({ bottom: 406, height: 282, left: 24, right: 424, top: 124, width: 400 });
        }
        if (this.dataset?.guidePart === "selection") {
          return guideRect({ bottom: 212, height: 88, left: 24, right: 424, top: 124, width: 400 });
        }
        return guideRect({ bottom: 0, height: 0, left: 0, right: 0, top: 0, width: 0 });
      });

    try {
      const target = document.createElement("div");
      target.dataset.guideTarget = "attacker";
      document.body.append(target);
      const options = document.createElement("div");
      options.dataset.guidePart = "options";
      target.append(options);
      const guideProps = {
        importCount: 213,
        onBack: () => {},
        onImport: () => {},
        onNext: () => {},
        onSkip: () => {},
        open: true,
        step: 0,
      };
      render(<FirstRunGuide {...guideProps} layoutKey="open" />);
      expect(document.querySelector(".first-run-guide__spotlight")).toHaveStyle({
        height: "338px",
        top: "74px",
      });

      options.remove();
      const selection = document.createElement("div");
      selection.dataset.guidePart = "selection";
      target.append(selection);
      fireEvent.scroll(globalThis);
      await vi.waitFor(() => {
        expect(document.querySelector(".first-run-guide__spotlight")).toHaveStyle({
          height: "144px",
          top: "74px",
        });
      });
    } finally {
      document.querySelector('[data-guide-target="attacker"]')?.remove();
      rectSpy.mockRestore();
    }
  });
});
