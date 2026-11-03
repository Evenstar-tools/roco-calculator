import { useEffect, useRef, useState } from "react";

export function useDeferredPortraits(scrollRef, contents) {
  const portraitObserver = useRef(null);
  const [loadedPortraits, setLoadedPortraits] = useState(() => new Set());
  const observePortraits = typeof IntersectionObserver === "function";
  useEffect(() => {
    if (!observePortraits) return undefined;
    const root = scrollRef.current;
    let active = true;
    const observer = new IntersectionObserver((entries) => {
      if (!active) return;
      const sources = [];
      for (const entry of entries) {
        const source = entry.target.dataset.deferredPortrait;
        if (!entry.isIntersecting || !source || !root.contains(entry.target) || entry.target.closest("[hidden]")) continue;
        sources.push(source);
        observer.unobserve(entry.target);
      }
      if (sources.length) setLoadedPortraits((current) => {
        if (sources.every(source => current.has(source))) return current;
        return new Set([...current, ...sources]);
      });
    }, { root, rootMargin: "256px 0px" });
    portraitObserver.current = observer;
    return () => {
      active = false;
      observer.disconnect();
      portraitObserver.current = null;
    };
  }, [observePortraits, scrollRef]);
  useEffect(() => {
    const observer = portraitObserver.current;
    if (!observer) return undefined;
    const targets = [...scrollRef.current.querySelectorAll("[data-deferred-portrait]")];
    targets.forEach(target => observer.observe(target));
    return () => targets.forEach(target => observer.unobserve(target));
  }, [contents, observePortraits, scrollRef]);
  return {
    isDeferred: source => Boolean(source && observePortraits && !loadedPortraits.has(source)),
    loading: observePortraits ? "eager" : "lazy",
  };
}
