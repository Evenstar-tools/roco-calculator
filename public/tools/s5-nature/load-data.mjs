// The deadline includes the JSON body. Some networks return headers promptly
// and then leave the response body pending, so aborting fetch alone is not enough.
export async function readToolJson(url, {
  fetchResource = globalThis.fetch,
  timeoutMs = 12000,
  signal,
  message = '数据加载失败，请刷新页面重试。',
} = {}) {
  if (signal?.aborted) throw new Error(message);
  const controller = new AbortController();
  let interruptionError;
  let timeout;
  let cancel;
  const interrupted = new Promise((_, reject) => {
    const stop = timedOut => {
      interruptionError = new Error(timedOut ? message.replace('加载失败', '加载超时') : message);
      reject(interruptionError);
      controller.abort();
    };
    cancel = () => stop(false);
    timeout = setTimeout(() => stop(true), timeoutMs);
    signal?.addEventListener('abort', cancel, { once: true });
  });
  try {
    const reading = (async () => {
      const response = await fetchResource(url, { signal: controller.signal });
      if (!response.ok) throw new Error(message);
      return response.json();
    })();
    return await Promise.race([reading, interrupted]);
  } catch (error) {
    if (error === interruptionError) throw error;
    throw new Error(message, { cause: error });
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener('abort', cancel);
  }
}

// Start independent requests together. Only calculation data blocks the tool;
// popular online presets arrive in the background without changing user inputs.
export async function loadToolData(fetchResource = globalThis.fetch, { signal } = {}) {
  const read = (url, message, timeoutMs) => readToolJson(url, { fetchResource, signal, message, timeoutMs });
  const required = Promise.all([
    read('./data/catalog.json', '技能数据加载失败，请刷新页面重试。'),
    read('./data/field-samples.json', '形态与实测数据加载失败，请刷新页面重试。'),
    read('./data/dice.json', '骰子数据加载失败，请刷新页面重试。'),
    read('./data/traits.json', '特性数据加载失败，请刷新页面重试。'),
  ]);
  let presetLibrary = { entries: [] };
  const presetLibraryReady = read('/data/presets/pvp-popular-configs.json', '常用配置数据加载失败，请刷新页面重试。', 8000)
    .then(value => {
      if (Array.isArray(value?.entries)) presetLibrary = value;
      return presetLibrary;
    })
    .catch(() => presetLibrary);
  const [catalog, fieldData, diceCatalog, traitCatalog] = await required;
  if (!Array.isArray(catalog?.spirits) || !catalog.spirits.length || !Array.isArray(catalog?.skills) || !catalog.skills.length)
    throw new Error('技能数据不完整，请刷新页面重试。');
  if (!Array.isArray(fieldData?.formMappings) || !Array.isArray(fieldData?.entries))
    throw new Error('形态与实测数据不完整，请刷新页面重试。');
  if (!Array.isArray(diceCatalog?.dice) || !diceCatalog.dice.length)
    throw new Error('骰子数据不完整，请刷新页面重试。');
  if (!traitCatalog?.traits || Array.isArray(traitCatalog.traits) || typeof traitCatalog.traits !== 'object' || !Object.keys(traitCatalog.traits).length)
    throw new Error('特性数据不完整，请刷新页面重试。');
  return { catalog, fieldData, diceCatalog, traitCatalog, presetLibrary, presetLibraryReady };
}
