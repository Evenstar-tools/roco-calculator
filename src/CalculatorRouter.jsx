import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { metrics } from "./analytics/metrics.js";
import { App } from "./App.jsx";
import { applyPageMetadata, DEER_PAGE_METADATA, HOME_PAGE_METADATA } from "./seo/page-metadata.js";

const DeerPage = lazy(() => import("./features/deer/DeerPage.jsx"));
const isDeerPath = () => /^\/dianlu\/?$/.test(window.location.pathname);

export function CalculatorRouter({ initialSnapshot = null, active = true, onOpenGlobal }) {
  const [route, setRoute] = useState(() => ({ deer: isDeerPath(), input: window.history.state?.deerInput ?? null }));
  const [homeVisited, setHomeVisited] = useState(() => !isDeerPath() || !!window.history.state?.deerInput);
  const [initialWorkspace] = useState(() => window.history.state?.deerInput ?? null);
  const homeScroll = useRef(0);
  useEffect(() => {
    function onPopState() {
      const deer = isDeerPath();
      if (!deer) setHomeVisited(true);
      setRoute({ deer, input: window.history.state?.deerInput ?? null });
    }
    // 同页切服使用 pushState；重新激活时同步真实路径，避免沿用电鹿页面。
    if (active) onPopState();
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, [active]);
  useEffect(() => {
    if (active) applyPageMetadata(route.deer ? DEER_PAGE_METADATA : HOME_PAGE_METADATA);
  }, [route.deer, active]);
  useEffect(() => {
    if (!active) return;
    window.scrollTo(0, route.deer ? 0 : homeScroll.current);
    metrics.route(route.deer ? "deer" : "calculator");
  }, [route.deer, active]);
  function openDeer(input) {
    homeScroll.current = window.scrollY;
    const copy = structuredClone(input);
    window.history.pushState({ deerInput: copy }, "", "/dianlu/");
    setRoute({ deer: true, input: copy });
  }
  function returnHome(event) {
    event.preventDefault();
    if (route.input && window.history.length > 1) {
      window.history.back();
    } else {
      window.history.pushState(null, "", "/");
      setHomeVisited(true);
      setRoute({ deer: false, input: null });
    }
  }
  return <>
    {homeVisited && <div hidden={route.deer} inert={route.deer || undefined}><App initialSnapshot={initialSnapshot} initialWorkspace={initialWorkspace} onOpenDeer={openDeer} active={active && !route.deer} onOpenGlobal={onOpenGlobal} /></div>}
    {active && route.deer && <Suspense fallback={<p role="status">正在加载电鹿斩杀线…</p>}><DeerPage initialState={route.input?.state} onReturn={returnHome} /></Suspense>}
  </>;
}
