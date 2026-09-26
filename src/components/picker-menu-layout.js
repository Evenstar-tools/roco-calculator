import { useLayoutEffect } from "react";

// Absolute menus must fit both the visible viewport and every clipping ancestor.
export function getPickerBounds(anchor, boundary) {
  const viewport = window.visualViewport;
  const left = viewport?.offsetLeft ?? 0;
  const top = viewport?.offsetTop ?? 0;
  const bounds = {
    left, top,
    right: left + (viewport?.width ?? (document.documentElement.clientWidth || window.innerWidth)),
    bottom: top + (viewport?.height ?? window.innerHeight),
    clipped: Boolean(boundary),
  };
  const intersect = (box, x = true, y = true) => {
    if (x) { bounds.left = Math.max(bounds.left, box.left); bounds.right = Math.min(bounds.right, box.right); }
    if (y) { bounds.top = Math.max(bounds.top, box.top); bounds.bottom = Math.min(bounds.bottom, box.bottom); }
  };
  if (!anchor.closest('[role="dialog"]')) {
    const header = document.querySelector(".app-header")?.getBoundingClientRect();
    const footer = document.querySelector(".mobile-result-bar")?.getBoundingClientRect();
    if (header?.height && header.top <= bounds.top && header.bottom > bounds.top) bounds.top = header.bottom;
    if (footer?.height && footer.bottom >= bounds.bottom && footer.top < bounds.bottom) bounds.bottom = footer.top;
  }
  if (boundary) intersect(boundary.getBoundingClientRect());
  for (let parent = anchor.parentElement; parent && parent !== document.body; parent = parent.parentElement) {
    const css = getComputedStyle(parent);
    const x = /auto|scroll|hidden|clip/.test(css.overflowX);
    const y = /auto|scroll|hidden|clip/.test(css.overflowY);
    if (!x && !y) continue;
    const box = parent.getBoundingClientRect();
    intersect({ left: box.left + parent.clientLeft, top: box.top + parent.clientTop,
      right: box.left + parent.clientLeft + parent.clientWidth,
      bottom: box.top + parent.clientTop + parent.clientHeight }, x, y);
    bounds.clipped = true;
  }
  return bounds;
}

export function fitPickerMenu(anchor, bounds, height, minWidth = 0) {
  const above = Math.max(0, Math.min(anchor.top, bounds.bottom) - bounds.top - 12);
  const below = Math.max(0, bounds.bottom - Math.max(anchor.bottom, bounds.top) - 12);
  const placement = below >= height || below >= above ? "down" : "up";
  const width = Math.max(0, Math.min(Math.max(minWidth, anchor.width),
    Math.max(minWidth, bounds.right - 8 - anchor.left), bounds.right - bounds.left - 16));
  return {
    placement, width,
    left: Math.max(bounds.left + 8, Math.min(anchor.left, bounds.right - 8 - width)),
    maxHeight: Math.min(height, placement === "up" ? above : below),
  };
}

export function usePickerMenuLayout({ open, anchorRef, menuRef, maxHeight, minWidth = 0, contentKey }) {
  useLayoutEffect(() => {
    if (!open || !anchorRef.current || !menuRef.current) return;
    const anchor = anchorRef.current;
    const menu = menuRef.current;
    let frame;
    function position() {
      const box = anchor.getBoundingClientRect();
      const naturalHeight = menu.scrollHeight ? menu.scrollHeight + 2 : maxHeight;
      const bounds = getPickerBounds(anchor);
      const layout = fitPickerMenu(box, bounds, Math.min(maxHeight, naturalHeight), minWidth);
      const top = Math.max(bounds.top + 8, Math.min(
        layout.placement === "up" ? box.top - 4 - layout.maxHeight : box.bottom + 4,
        bounds.bottom - 8 - layout.maxHeight));
      menu.dataset.placement = layout.placement;
      Object.assign(menu.style, {
        width: `${layout.width}px`, minWidth: "0", right: "auto",
        left: `${layout.left - box.left - anchor.clientLeft}px`,
        maxHeight: `${layout.maxHeight}px`,
        top: `${top - box.top - anchor.clientTop}px`, bottom: "auto",
      });
    }
    function schedule(event) {
      if (event?.target === menu) return;
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(position);
    }
    position();
    window.addEventListener("resize", schedule);
    window.addEventListener("scroll", schedule, true);
    window.visualViewport?.addEventListener("resize", schedule);
    window.visualViewport?.addEventListener("scroll", schedule);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", schedule);
      window.removeEventListener("scroll", schedule, true);
      window.visualViewport?.removeEventListener("resize", schedule);
      window.visualViewport?.removeEventListener("scroll", schedule);
    };
  }, [open, anchorRef, menuRef, maxHeight, minWidth, contentKey]);
}
