// These datasets are independent. Start every request before waiting for the
// catalog so a slow connection pays one round trip instead of five in series.
export async function loadToolData(fetchResource = globalThis.fetch) {
  const read = async (url, fallback, message) => {
    const response = await fetchResource(url);
    if (response.ok) return response.json();
    if (message) throw new Error(message);
    return fallback;
  };
  const [catalog, fieldData, diceCatalog, traitCatalog, presetLibrary] = await Promise.all([
    read('./data/catalog.json', null, '技能数据加载失败，请刷新页面重试。'),
    read('./data/field-samples.json', { formMappings: [], entries: [] }),
    read('./data/dice.json', null, '骰子数据加载失败，请刷新页面重试。'),
    read('./data/traits.json', { traits: {} }),
    read('/data/presets/pvp-popular-configs.json', { entries: [] })
      .catch(() => ({ entries: [] })),
  ]);
  if (!Array.isArray(diceCatalog?.dice) || !diceCatalog.dice.length)
    throw new Error('骰子数据不完整，请刷新页面重试。');
  return { catalog, fieldData, diceCatalog, traitCatalog, presetLibrary };
}
