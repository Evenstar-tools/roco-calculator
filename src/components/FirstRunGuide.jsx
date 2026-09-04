import {
  ArrowLeft,
  ArrowRight,
  DownloadSimple,
  SlidersHorizontal,
} from "@phosphor-icons/react";
import { useLayoutEffect, useRef, useState } from "react";

const GUIDE_STEPS = [
  {
    body: "选择本回合出手的精灵",
    placement: "right",
    target: "attacker",
    title: "先选攻击方",
  },
  {
    body: "选择本回合承伤的精灵",
    placement: "left",
    target: "defender",
    title: "再选防御方",
  },
  {
    body: "双方先选正面性格；六项个体默认都是 60，可按需取消",
    target: "quick-settings",
    title: "选性格和个体",
  },
  {
    body: "单技能看一招细节；四技能直接比较双方伤害",
    missingBody: "选择双方精灵后，这里会显示四技能伤害",
    target: "skills",
    title: "单技能 / 四技能",
  },
  {
    body: "具体版可调整完整性格、面板、特性与战斗条件",
    target: "detailed-mode",
    title: "需要细调时",
  },
  {
    body: "以后修改性格、个体和技能，都会继续记住",
    target: null,
    title: "导入热门配置",
  },
];

function clamp(value, minimum, maximum) {
  return Math.min(Math.max(value, minimum), Math.max(minimum, maximum));
}

function targetElement(targetName) {
  if (!targetName) return null;
  const element = document.querySelector(`[data-guide-target="${targetName}"]`);
  return element instanceof Element ? element : null;
}

function rectUnion(first, second) {
  if (!second || second.width <= 0 || second.height <= 0) return first;
  const left = Math.min(first.left, second.left);
  const top = Math.min(first.top, second.top);
  const right = Math.max(first.right, second.right);
  const bottom = Math.max(first.bottom, second.bottom);
  return {
    bottom,
    height: bottom - top,
    left,
    right,
    top,
    width: right - left,
    x: left,
    y: top,
  };
}

function targetRoot(element, targetName) {
  const root = element.closest?.(`[data-guide-root="${targetName}"]`);
  return root instanceof Element ? root : element;
}

function targetPart(element, targetName, part) {
  const root = targetRoot(element, targetName);
  const match = root.querySelector?.(`[data-guide-part="${part}"]`);
  return match instanceof Element ? match : null;
}

function targetRect(targetName) {
  const element = targetElement(targetName);
  if (!element) return null;
  let rect = element.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return null;
  const options = targetPart(element, targetName, "options");
  if (options) return rectUnion(rect, options.getBoundingClientRect());
  const selection = targetPart(element, targetName, "selection");
  if (selection) rect = rectUnion(rect, selection.getBoundingClientRect());
  return rect;
}

function cardPosition(rect, cardHeight, finalStep, placement = "auto") {
  const viewportWidth = globalThis.innerWidth ?? 1280;
  const viewportHeight = globalThis.innerHeight ?? 720;
  const cardWidth = Math.min(340, viewportWidth - 24);
  const measuredHeight = cardHeight > 0 ? cardHeight : 180;
  if (finalStep || !rect) {
    return {
      left: clamp(viewportWidth - cardWidth - 22, 12, viewportWidth - cardWidth - 12),
      top: clamp(82, 12, viewportHeight - measuredHeight - 12),
      width: cardWidth,
    };
  }
  const sideTop = clamp(
    rect.top,
    12,
    viewportHeight - measuredHeight - 12,
  );
  if (
    placement === "right" &&
    rect.right + 12 + cardWidth <= viewportWidth - 12
  ) {
    return {
      left: rect.right + 12,
      top: sideTop,
      width: cardWidth,
    };
  }
  if (placement === "left" && rect.left - 12 - cardWidth >= 12) {
    return {
      left: rect.left - cardWidth - 12,
      top: sideTop,
      width: cardWidth,
    };
  }
  const below = rect.bottom + 12;
  const above = rect.top - measuredHeight - 12;
  const fitsBelow = below + measuredHeight <= viewportHeight - 12;
  const fitsAbove = above >= 12;
  const preferredLeft = rect.left + rect.width / 2 > viewportWidth / 2
    ? rect.right - cardWidth
    : rect.left;
  return {
    left: clamp(preferredLeft, 12, viewportWidth - cardWidth - 12),
    top: fitsBelow
      ? below
      : fitsAbove
        ? above
        : clamp(above, 12, viewportHeight - measuredHeight - 12),
    width: cardWidth,
  };
}

function needsAlignment(rect, cardHeight) {
  const viewportHeight = globalThis.innerHeight ?? 720;
  const mobile = (globalThis.innerWidth ?? 1280) <= 620;
  const visibleBottom = mobile
    ? viewportHeight - Math.max(cardHeight, 180) - 28
    : viewportHeight - 20;
  return rect.bottom <= 12 || rect.top >= visibleBottom;
}

export function FirstRunGuide({
  error = "",
  importCount = 224,
  importing = false,
  layoutKey,
  onBack,
  onImport,
  onNext,
  onOpenDetailed,
  onSkip,
  open,
  ready = true,
  step = 0,
}) {
  const safeStep = clamp(step, 0, GUIDE_STEPS.length - 1);
  const content = GUIDE_STEPS[safeStep];
  const importStep = safeStep === GUIDE_STEPS.length - 1;
  const detailedStep = safeStep === GUIDE_STEPS.length - 2;
  const cardRef = useRef(null);
  const frameRef = useRef(null);
  const alignedStepRef = useRef(null);
  const [layout, setLayout] = useState({
    card: cardPosition(null, 0, false),
    rect: null,
  });

  useLayoutEffect(() => {
    if (!open) return undefined;
    const measure = () => {
      const rect = targetRect(content.target);
      const cardHeight = cardRef.current?.getBoundingClientRect().height ?? 0;
      setLayout({
        card: cardPosition(rect, cardHeight, importStep, content.placement),
        rect,
      });
    };
    const update = () => {
      if (frameRef.current !== null) return;
      frameRef.current = globalThis.requestAnimationFrame?.(() => {
        frameRef.current = null;
        measure();
      }) ?? null;
      if (frameRef.current === null) measure();
    };
    const target = targetElement(content.target);
    const observationRoot = target
      ? targetRoot(target, content.target)
      : null;
    const cardHeight = cardRef.current?.getBoundingClientRect().height ?? 0;
    const rect = target?.getBoundingClientRect();
    if (
      alignedStepRef.current !== safeStep &&
      rect?.width > 0 &&
      rect?.height > 0 &&
      needsAlignment(rect, cardHeight)
    ) {
      target.scrollIntoView?.({
        behavior: "auto",
        block: "center",
        inline: "nearest",
      });
    }
    alignedStepRef.current = safeStep;
    measure();
    globalThis.addEventListener?.("resize", update);
    globalThis.addEventListener?.("scroll", update, true);
    const observer = globalThis.ResizeObserver
      ? new ResizeObserver(update)
      : null;
    if (target) observer?.observe(target);
    const options = target
      ? targetPart(target, content.target, "options")
      : null;
    const selection = target
      ? targetPart(target, content.target, "selection")
      : null;
    if (options) observer?.observe(options);
    if (selection) observer?.observe(selection);
    if (cardRef.current) observer?.observe(cardRef.current);
    const mutationObserver = globalThis.MutationObserver && observationRoot
      ? new MutationObserver(update)
      : null;
    mutationObserver?.observe(observationRoot, {
      attributes: true,
      childList: true,
      subtree: true,
    });
    return () => {
      if (frameRef.current !== null) {
        globalThis.cancelAnimationFrame?.(frameRef.current);
        frameRef.current = null;
      }
      observer?.disconnect();
      mutationObserver?.disconnect();
      globalThis.removeEventListener?.("resize", update);
      globalThis.removeEventListener?.("scroll", update, true);
    };
  }, [content.placement, content.target, importStep, layoutKey, open, safeStep]);

  if (!open) return null;
  const body = layout.rect || !content.missingBody
    ? content.body
    : content.missingBody;

  return (
    <div className="first-run-guide">
      {layout.rect ? (
        <div
          aria-hidden="true"
          className={`first-run-guide__spotlight${
            content.target === "attacker" || content.target === "defender"
              ? " first-run-guide__spotlight--picker"
              : ""
          }`}
          key={content.target}
          style={{
            height: layout.rect.height + 12,
            left: layout.rect.left - 6,
            top: layout.rect.top - 6,
            width: layout.rect.width + 12,
          }}
        />
      ) : (
        <div aria-hidden="true" className="first-run-guide__veil" />
      )}
      <section
        aria-label={`新手引导 ${safeStep + 1}/${GUIDE_STEPS.length}`}
        aria-live="polite"
        className={`first-run-guide__card${importStep ? " first-run-guide__card--import" : ""}`}
        ref={cardRef}
        role="dialog"
        style={layout.card}
      >
        <header className="first-run-guide__progress">
          <span>{safeStep + 1} / {GUIDE_STEPS.length}</span>
          <span aria-hidden="true" className="first-run-guide__dots">
            {GUIDE_STEPS.map((_, index) => (
              <i className={index === safeStep ? "is-active" : ""} key={index} />
            ))}
          </span>
        </header>
        <h2>{content.title}</h2>
        {importStep ? (
          <div className="first-run-guide__library">
            <DownloadSimple aria-hidden="true" size={22} weight="bold" />
            <span>{importCount} 只 PVP 精灵配置，安装后离线可用</span>
          </div>
        ) : null}
        <p>{body}</p>
        {error && !/permission denied/i.test(error) ? (
          <p className="first-run-guide__error" role="alert">{error}</p>
        ) : null}
        <footer className="first-run-guide__actions">
          <button className="first-run-guide__skip" onClick={onSkip} type="button">
            跳过引导
          </button>
          <span />
          {safeStep > 0 ? (
            <button className="secondary-action" onClick={onBack} type="button">
              <ArrowLeft aria-hidden="true" size={15} />
              上一步
            </button>
          ) : null}
          {importStep ? (
            <button
              aria-label={importing ? "正在导入" : "导入并完成"}
              className="primary-action"
              disabled={importing}
              onClick={onImport}
              type="button"
            >
              <DownloadSimple aria-hidden="true" size={16} weight="bold" />
              {importing ? "正在导入" : "导入并完成"}
            </button>
          ) : detailedStep ? (
            <button
              className="primary-action"
              onClick={() => {
                onOpenDetailed?.();
                onNext?.();
              }}
              type="button"
            >
              <SlidersHorizontal aria-hidden="true" size={15} weight="bold" />
              前往具体版
            </button>
          ) : (
            <button
              className="primary-action"
              disabled={!ready}
              onClick={onNext}
              title={ready ? undefined : "请先完成当前步骤"}
              type="button"
            >
              下一步
              <ArrowRight aria-hidden="true" size={15} />
            </button>
          )}
        </footer>
      </section>
    </div>
  );
}
