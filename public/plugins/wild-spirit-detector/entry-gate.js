(() => {
  const key = "roco-cn-plugin-entry";
  const deny = () => {
    document.documentElement.removeAttribute("data-plugin-entry");
    location.replace("/cn/");
  };
  let granted = false;
  try {
    if (location.protocol === "app:") {
      const value = sessionStorage.getItem(key);
      sessionStorage.removeItem(key);
      const expires = typeof value === "string" && /^\d+$/.test(value) ? Number(value) : NaN;
      const now = Date.now();
      granted = Number.isSafeInteger(expires) && expires > now && expires <= now + 30_000;
    } else {
      const cookieGrant = document.cookie.split(";").some(value => value.trim() === `${key}=1`);
      document.cookie = `${key}=; Max-Age=0; Path=/; SameSite=Strict`;
      granted = cookieGrant;
    }
  } catch { /* Storage unavailable: keep this page closed. */ }
  if (!granted) { deny(); return; }
  document.documentElement.setAttribute("data-plugin-entry", "open");
  window.addEventListener("pageshow", event => { if (event.persisted) deny(); });
})();
