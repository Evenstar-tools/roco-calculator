// Use only the country/region supplied by EdgeOne; no IP or precise location is returned.
export function onRequestGet({ request }) {
  const value = request.eo?.geo?.countryCodeAlpha2;
  const countryCode = typeof value === "string" ? value.toUpperCase() : "";
  const known = /^[A-Z]{2}$/.test(countryCode) && !["XX", "ZZ"].includes(countryCode);
  return new Response(JSON.stringify({ countryCode: known ? countryCode : null }), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "private, no-store",
    },
  });
}
