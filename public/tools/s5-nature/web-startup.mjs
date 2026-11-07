// The tool has unhashed modules. Finish updating an existing root worker before
// loading its UI so a fresh HTML document cannot start with cached older modules.
export async function prepareToolWorker(serviceWorker = globalThis.navigator?.serviceWorker,
  location = globalThis.location, timeoutMs = 3000) {
  if (!serviceWorker || !['http:', 'https:'].includes(location?.protocol)) return false;
  let finished = false;
  let timer;
  const cleanup = [];
  const previousController = serviceWorker.controller;
  const root = `${location.origin}/`;
  const deadline = new Promise(resolve => { timer = setTimeout(() => resolve(false), timeoutMs); });
  const update = async () => {
    const existing = await serviceWorker.getRegistration(root);
    if (finished || !existing || existing.scope !== root) return false;
    const worker = existing.active ?? existing.waiting ?? existing.installing;
    if (!worker || new URL(worker.scriptURL).href !== `${root}sw.js`) return false;

    // Re-register only this existing root worker; direct first visits do not
    // install the calculator's full offline cache just to start this tool.
    const registration = await serviceWorker.register('/sw.js', { updateViaCache: 'none' });
    if (finished) return false;
    let complete;
    const takeover = new Promise(resolve => { complete = resolve; });
    const checkController = () => {
      if (serviceWorker.controller && serviceWorker.controller !== previousController) complete(true);
    };
    serviceWorker.addEventListener('controllerchange', checkController);
    cleanup.push(() => serviceWorker.removeEventListener('controllerchange', checkController));
    const watched = new Set();
    const watchInstalling = () => {
      const pending = registration.installing ?? registration.waiting;
      if (!pending || watched.has(pending)) return;
      watched.add(pending);
      const checkState = () => {
        if (pending.state === 'redundant') complete(false);
        else checkController();
      };
      pending.addEventListener('statechange', checkState);
      cleanup.push(() => pending.removeEventListener('statechange', checkState));
      checkState();
    };
    registration.addEventListener('updatefound', watchInstalling);
    cleanup.push(() => registration.removeEventListener('updatefound', watchInstalling));
    watchInstalling();
    await registration.update();
    if (finished) return false;
    checkController();
    watchInstalling();
    if (!registration.installing && !registration.waiting
      && registration.active === previousController && serviceWorker.controller === previousController) return false;
    return takeover;
  };
  try {
    return await Promise.race([update().catch(() => false), deadline]);
  } finally {
    finished = true;
    clearTimeout(timer);
    for (const dispose of cleanup) dispose();
  }
}

export async function startTool({ serviceWorker = globalThis.navigator?.serviceWorker,
  location = globalThis.location, document = globalThis.document,
  loadUI = () => import('./ui.mjs'), timeoutMs = 3000 } = {}) {
  try {
    await prepareToolWorker(serviceWorker, location, timeoutMs);
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
    if (status) status.textContent = '加载失败，请刷新重试。';
    throw error;
  }
}
