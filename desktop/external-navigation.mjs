const EXTERNAL_PROTOCOLS = new Set(["http:", "https:", "mailto:"]);

function parseUrl(url) {
  try {
    return new URL(url);
  } catch {
    return null;
  }
}

function isBundledAppUrl(url) {
  const parsedUrl = parseUrl(url);
  return parsedUrl?.protocol === "app:" && parsedUrl.hostname === "calculator";
}

function openSupportedExternalUrl(url, openExternal) {
  const parsedUrl = parseUrl(url);
  if (!parsedUrl || !EXTERNAL_PROTOCOLS.has(parsedUrl.protocol)) return false;

  Promise.resolve(openExternal(url)).catch(() => {});
  return true;
}

export function isSupportedExternalUrl(url) {
  const parsedUrl = parseUrl(url);
  return Boolean(parsedUrl && EXTERNAL_PROTOCOLS.has(parsedUrl.protocol));
}

export function createWindowOpenHandler(openExternal) {
  return ({ url }) => {
    openSupportedExternalUrl(url, openExternal);
    return { action: "deny" };
  };
}

export function handleWillNavigate(event, url, openExternal) {
  if (isBundledAppUrl(url)) return;
  event.preventDefault();
  openSupportedExternalUrl(url, openExternal);
}
