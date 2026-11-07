// Only a controller that confirms this policy may serve the unhashed tool files.
// A controllerchange event alone does not prove that the worker has this policy.
export async function prepareToolWorker(serviceWorker = globalThis.navigator?.serviceWorker,
  location = globalThis.location, timeoutMs = 3000) {
  if (!serviceWorker || !['http:', 'https:'].includes(location?.protocol)) return false;
  let finished = false;
  let timer;
  const cleanup = [];
  const root = `${location.origin}/`;
  const retryError = () => new Error('缓存更新尚未完成，请刷新重试。');
  const deadline = new Promise((_, reject) => { timer = setTimeout(() => reject(retryError()), timeoutMs); });
  const confirmPolicy = async (worker, stillCurrent) => {
    if (finished || !worker) return false;
    return new Promise(resolve => {
      const channel = new MessageChannel();
      let settled = false;
      let responseTimer;
      const settle = supported => {
        if (settled) return;
        settled = true;
        clearTimeout(responseTimer);
        channel.port1.onmessage = null;
        channel.port1.close();
        channel.port2.close();
        resolve(supported && stillCurrent() && !finished);
      };
      cleanup.push(() => settle(false));
      responseTimer = setTimeout(() => settle(false), 400);
      channel.port1.onmessage = ({ data }) => settle(data?.type === 'S5_TOOL_CACHE_POLICY'
        && data?.policy === 'network-first-v1' && data?.path === '/tools/s5-nature/');
      try { worker.postMessage({ type: 'GET_S5_TOOL_CACHE_POLICY' }, [channel.port2]); }
      catch { settle(false); }
    });
  };
  const confirmController = () => {
    const controller = serviceWorker.controller;
    return confirmPolicy(controller, () => serviceWorker.controller === controller);
  };
  const update = async () => {
    const existing = await serviceWorker.getRegistration(root);
    if (finished || !existing || existing.scope !== root) return false;
    const worker = existing.active ?? existing.waiting ?? existing.installing;
    if (!worker || new URL(worker.scriptURL).href !== `${root}sw.js`) return false;
    // A known current controller is safe offline; no network round trip is needed.
    if (await confirmController()) return true;
    if (finished) throw retryError();

    // Re-register only this existing root worker; direct first visits do not
    // install the calculator's full offline cache just to start this tool.
    let complete;
    const takeover = new Promise(resolve => { complete = resolve; });
    const checkController = async () => {
      if (await confirmController()) complete(true);
    };
    serviceWorker.addEventListener('controllerchange', checkController);
    cleanup.push(() => serviceWorker.removeEventListener('controllerchange', checkController));
    try {
      const registration = await serviceWorker.register('/sw.js', { updateViaCache: 'none' });
      if (finished) throw retryError();
      const activateWaiting = async pending => {
        if (!pending || pending.state !== 'installed') return;
        if (await confirmPolicy(pending, () => registration.waiting === pending)) {
          try { pending.postMessage({ type: 'ACTIVATE_S5_TOOL_CACHE_POLICY', policy: 'network-first-v1' }); }
          catch { /* A superseded worker must still pass the controller check. */ }
        }
      };
      const watched = new Set();
      const watchInstallation = () => {
        const pending = registration.waiting ?? registration.installing;
        if (!pending || watched.has(pending)) return;
        watched.add(pending);
        const stateChanged = () => { void activateWaiting(pending); };
        pending.addEventListener('statechange', stateChanged);
        cleanup.push(() => pending.removeEventListener('statechange', stateChanged));
        stateChanged();
      };
      registration.addEventListener('updatefound', watchInstallation);
      cleanup.push(() => registration.removeEventListener('updatefound', watchInstallation));
      watchInstallation();
    } catch {
      if (await confirmController()) return true;
      throw retryError();
    }
    if (finished) throw retryError();
    await checkController();
    return takeover;
  };
  try {
    return await Promise.race([update(), deadline]);
  } finally {
    finished = true;
    clearTimeout(timer);
    for (const dispose of cleanup) dispose();
  }
}

export async function startTool({ serviceWorker = globalThis.navigator?.serviceWorker,
  location = globalThis.location, document = globalThis.document,
  loadUI = () => import('./ui.mjs'), fetchResource = globalThis.fetch, timeoutMs = 3000 } = {}) {
  try {
    const initialController = serviceWorker?.controller;
    await prepareToolWorker(serviceWorker, location, timeoutMs);
    if (serviceWorker?.controller && serviceWorker.controller !== initialController) {
      // HTML and this bootstrap were fetched before takeover. Populate the new
      // worker's cache as well so the very next reload can work offline.
      const urls = [location?.href, import.meta.url].filter(url => typeof url === 'string'
        && new URL(url).origin === location.origin);
      const abort = new AbortController();
      const timer = setTimeout(() => abort.abort(), 3000);
      try {
        await Promise.allSettled(urls.map(url => fetchResource(url, { cache: 'no-cache', signal: abort.signal })));
      } finally { clearTimeout(timer); }
    }
    const cleanup = [];
    let timer;
    try {
      const styles = [...document.querySelectorAll('link[data-tool-style]')].map(stylesheet => new Promise((resolve, reject) => {
        const loaded = () => resolve();
        const failed = () => reject(new Error('Tool stylesheet failed to load'));
        stylesheet.addEventListener('load', loaded);
        stylesheet.addEventListener('error', failed);
        cleanup.push(() => {
          stylesheet.removeEventListener('load', loaded);
          stylesheet.removeEventListener('error', failed);
        });
        stylesheet.setAttribute('href', stylesheet.getAttribute('data-tool-style'));
        stylesheet.removeAttribute('data-tool-style');
      }));
      await Promise.race([Promise.all(styles), new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error('Tool stylesheet timed out')), 5000);
      })]);
    } finally {
      clearTimeout(timer);
      for (const dispose of cleanup) dispose();
    }
    const result = await loadUI();
    document.getElementById('tool-startup-status')?.remove();
    document.body.style.removeProperty('visibility');
    return result;
  } catch (error) {
    const status = document.getElementById('tool-startup-status');
    if (status) status.textContent = error.message === '缓存更新尚未完成，请刷新重试。'
      ? error.message : '加载失败，请刷新重试。';
    throw error;
  }
}
