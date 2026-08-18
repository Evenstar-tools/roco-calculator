const API_URL = "https://wiki.biligame.com/rocom/api.php";
const USER_AGENT = "rock-calculator/1.0 portrait binding";

export function avatarFileTitle(fullName) {
  return `文件:精灵 头像 ${fullName}.png`;
}

export async function fetchNamedPortraitAssets(spirits, options = {}) {
  const fetchImpl = options.fetchImpl ?? fetch;
  const batchSize = options.batchSize ?? 25;
  const assets = new Map();

  for (let index = 0; index < spirits.length; index += batchSize) {
    const batch = spirits.slice(index, index + batchSize);
    const spiritByTitle = new Map(
      batch.map((spirit) => [avatarFileTitle(spirit.fullName), spirit]),
    );
    const body = new URLSearchParams({
      action: "query",
      prop: "imageinfo",
      iiprop: "url|sha1|size",
      titles: [...spiritByTitle.keys()].join("|"),
      format: "json",
      formatversion: "2",
      origin: "*",
    });
    const response = await fetchImpl(API_URL, {
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
        `BWIKI 头像 API 请求失败：HTTP ${response.status ?? "unknown"} batch=${index}`,
      );
    }
    const payload = await response.json();
    for (const page of payload.query?.pages ?? []) {
      const spirit = spiritByTitle.get(page.title);
      const image = page.imageinfo?.[0];
      if (!spirit || !image?.url) continue;
      assets.set(spirit.fullName, {
        sourceUrl: image.url,
        sourceTitle: page.title,
        sourceSha1: image.sha1 ?? null,
        width: image.width ?? null,
        height: image.height ?? null,
      });
    }
  }

  return assets;
}

export function applyNamedPortraitAssets(spirits, assets) {
  let resolved = 0;
  const output = spirits.map((spirit) => {
    const asset = assets.get(spirit.fullName);
    if (!asset) return spirit;
    resolved += 1;
    return {
      ...spirit,
      asset: {
        ...spirit.asset,
        ...asset,
      },
    };
  });

  return {
    spirits: output,
    resolved,
    fallback: spirits.length - resolved,
  };
}
