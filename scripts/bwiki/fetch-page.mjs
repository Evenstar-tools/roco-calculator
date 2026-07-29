import { sha256Hex } from "./normalize.mjs";

const USER_AGENT = "rock-calculator/1.0 (+local immutable data snapshot)";

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

export async function fetchPage(url, options = {}) {
  const attempts = options.attempts ?? 4;
  const timeoutMs = options.timeoutMs ?? 45_000;
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, {
        headers: {
          accept: "text/html,application/xhtml+xml",
          "accept-language": "zh-CN,zh;q=0.9",
          "user-agent": USER_AGENT,
          ...options.headers,
        },
        signal: controller.signal,
      });
      const html = await response.text();
      if (!response.ok || html.slice(0, 3_000).includes("请求已被")) {
        throw new Error(`BWIKI 请求失败：HTTP ${response.status} ${url}`);
      }
      return {
        url,
        html,
        fetchedAt: new Date().toISOString(),
        sha256: sha256Hex(html),
        status: response.status,
      };
    } catch (error) {
      lastError = error;
      if (attempt < attempts) await delay(attempt * 500);
    } finally {
      clearTimeout(timeout);
    }
  }
  throw lastError;
}

export async function fetchRevisions(titles) {
  const api = new URL("https://wiki.biligame.com/rocom/api.php");
  api.search = new URLSearchParams({
    action: "query",
    prop: "revisions",
    rvprop: "ids|timestamp",
    titles: titles.join("|"),
    format: "json",
    formatversion: "2",
    origin: "*",
  }).toString();
  const response = await fetch(api, {
    headers: { accept: "application/json", "user-agent": USER_AGENT },
  });
  if (!response.ok) throw new Error(`BWIKI 修订 API 请求失败：HTTP ${response.status}`);
  const body = await response.json();
  return Object.fromEntries(
    (body.query?.pages ?? []).map((page) => [
      page.title,
      {
        pageId: page.pageid,
        revision: page.revisions?.[0]?.revid ?? null,
        timestamp: page.revisions?.[0]?.timestamp ?? null,
      },
    ]),
  );
}

export async function fetchRevisionsBatched(titles, batchSize = 25) {
  const revisions = new Map();
  for (let index = 0; index < titles.length; index += batchSize) {
    const body = new URLSearchParams({
      action: "query",
      prop: "revisions",
      rvprop: "ids|timestamp",
      titles: titles.slice(index, index + batchSize).join("|"),
      format: "json",
      formatversion: "2",
      origin: "*",
    });
    const response = await fetch("https://wiki.biligame.com/rocom/api.php", {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/x-www-form-urlencoded",
        "user-agent": USER_AGENT,
      },
      body,
    });
    if (!response.ok) {
      throw new Error(
        `BWIKI 批量修订 API 请求失败：HTTP ${response.status} batch=${index}`,
      );
    }
    const payload = await response.json();
    for (const page of payload.query?.pages ?? []) {
      revisions.set(page.title, {
        pageId: page.pageid,
        revision: page.revisions?.[0]?.revid ?? null,
        timestamp: page.revisions?.[0]?.timestamp ?? null,
      });
    }
  }
  return revisions;
}
