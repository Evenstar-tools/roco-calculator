import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { metrics } from "./analytics/metrics.js";
import { App } from "./App.jsx";

const DeerPage = lazy(() => import("./features/deer/DeerPage.jsx"));
const isDeerPath = () => /^\/dianlu\/?$/.test(window.location.pathname);

export function CalculatorRouter({ initialSnapshot = null }) {
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
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);
  useEffect(() => {
    window.scrollTo(0, route.deer ? 0 : homeScroll.current);
    metrics.route(route.deer ? "deer" : "calculator");
  }, [route.deer]);
  function openDeer(input) {
    homeScroll.current = window.scrollY;
    const copy = structuredClone(input);
    window.history.pushState({ deerInput: copy }, "", "/dianlu");
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
    {homeVisited && <div hidden={route.deer} inert={route.deer || undefined}><App initialSnapshot={initialSnapshot} initialWorkspace={initialWorkspace} onOpenDeer={openDeer} /></div>}
    {route.deer && <Suspense fallback={<p role="status">正在加载电鹿斩杀线…</p>}><DeerPage initialState={route.input?.state} onReturn={returnHome} /></Suspense>}
  </>;
}
