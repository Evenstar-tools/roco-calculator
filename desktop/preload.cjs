const EXTERNAL_PROTOCOLS = new Set(["http:", "https:", "mailto:"]);

function installExternalLinkInterceptor(root, openExternal) {
  const onClick = (event) => {
    const link = event.target?.closest?.("a[href]");
    if (!link) return;
    let url;
    try {
      url = new URL(link.href);
    } catch {
      return;
    }
    if (!EXTERNAL_PROTOCOLS.has(url.protocol)) return;
    event.preventDefault();
    openExternal(link.href);
  };

  root.addEventListener("click", onClick, true);
  return () => root.removeEventListener("click", onClick, true);
}

if (typeof process !== "undefined" && process.type === "renderer") {
  const { contextBridge, ipcRenderer } = require("electron");
  const openExternal = (url) => ipcRenderer.invoke("desktop:open-external", url);
  installExternalLinkInterceptor(document, openExternal);
  contextBridge.exposeInMainWorld("rockDesktop", { openExternal });
}

if (typeof module !== "undefined") {
  module.exports = { installExternalLinkInterceptor };
}
