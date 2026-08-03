import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, test, vi } from "vitest";
import {
  CACHE_KEY,
  DataUnavailableError,
  createDataService,
  sha256Hex,
} from "../src/services/data-service.js";
import { createCloudAdapter } from "../src/services/cloud-adapter.js";
import { createStorageAdapter } from "../src/services/storage-adapter.js";
import { createRuntimeConfig } from "../src/config/runtime.js";

function sha256(text) {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

function createMemoryStorage(initialEntries = {}) {
  const values = new Map(Object.entries(initialEntries));

  return {
    get: vi.fn((key) => values.get(key)),
    set: vi.fn((key, value) => values.set(key, value)),
    remove: vi.fn((key) => values.delete(key)),
  };
}

function createCloudFixture(snapshot = { pets: [{ id: "pet-1" }] }) {
  const runtimeText = JSON.stringify(snapshot);
  const manifest = {
    runtimeFileId: "cloud://env-test/data/runtime.json",
    runtimeSha256: sha256(runtimeText),
    petImages: {
      "pet-1": "cloud://env-test/pets/pet-1.png",
    },
  };

  return {
    manifest,
    runtimeText,
    cloud: {
      downloadManifest: vi.fn(async () => manifest),
      downloadRuntime: vi.fn(async () => runtimeText),
    },
  };
}

function createServiceConfig(fixture) {
  return {
    cloudEnv: "env-test",
    preview: false,
    target: "weapp",
    trustedRuntimeSha256: fixture.manifest.runtimeSha256,
  };
}

describe("createDataService", () => {
  test("computes SHA-256 over UTF-8 text without a Node-only crypto API", () => {
    const text = "洛克计算器 🐾";

    expect(sha256Hex(text)).toBe(sha256(text));
  });

  test.each([55, 56, 63, 64, 65, 127, 128])(
    "matches SHA-256 padding and multi-block boundary at %i bytes",
    (length) => {
      const text = "a".repeat(length);

      expect(sha256Hex(text)).toBe(sha256(text));
    },
  );

  test.each(["\ud800", "\udc00", "a\ud800b", "\ud800\ud800"])(
    "replaces unpaired UTF-16 surrogates before hashing %#",
    (text) => {
      expect(sha256Hex(text)).toBe(sha256(text));
    },
  );

  test("loads cloud data and caches a verified snapshot", async () => {
    const fixture = createCloudFixture();
    const storage = createMemoryStorage();
    const service = createDataService({
      cloud: fixture.cloud,
      storage,
      previewSnapshot: { preview: true },
      config: createServiceConfig(fixture),
    });

    const result = await service.load();

    expect(result).toEqual({
      petImages: {
        "pet-1": "cloud://env-test/pets/pet-1.png",
      },
      snapshot: { pets: [{ id: "pet-1" }] },
      source: "cloud",
      stale: false,
    });
    expect(fixture.cloud.downloadRuntime).toHaveBeenCalledWith(
      fixture.manifest.runtimeFileId,
    );
    expect(JSON.stringify(storage.get(CACHE_KEY))).toContain(
      fixture.manifest.runtimeSha256,
    );
  });

  test("falls back to a valid, independently verified cache after a cloud failure", async () => {
    const fixture = createCloudFixture({ pets: [{ id: "cached-pet" }] });
    const storage = createMemoryStorage();
    const warmService = createDataService({
      cloud: fixture.cloud,
      storage,
      previewSnapshot: {},
      config: createServiceConfig(fixture),
    });
    await warmService.load();

    const cachedServiceWithFailingCloud = createDataService({
      cloud: {
        downloadManifest: vi.fn(async () => {
          throw new Error("offline");
        }),
        downloadRuntime: vi.fn(),
      },
      storage,
      previewSnapshot: {},
      config: createServiceConfig(fixture),
    });

    await expect(cachedServiceWithFailingCloud.load()).resolves.toEqual({
      petImages: {
        "pet-1": "cloud://env-test/pets/pet-1.png",
      },
      snapshot: { pets: [{ id: "cached-pet" }] },
      source: "cache",
      stale: true,
    });
  });

  test("rejects cloud data whose SHA-256 does not match the manifest", async () => {
    const fixture = createCloudFixture();
    const trustedRuntimeSha256 = fixture.manifest.runtimeSha256;
    fixture.manifest.runtimeSha256 = "0".repeat(64);
    const service = createDataService({
      cloud: fixture.cloud,
      storage: createMemoryStorage(),
      previewSnapshot: {},
      config: {
        ...createServiceConfig(fixture),
        trustedRuntimeSha256,
      },
    });

    await expect(service.load()).rejects.toMatchObject({
      name: "DataUnavailableError",
      cause: expect.objectContaining({ name: "IntegrityError" }),
    });
  });

  test("rejects a corrupted cache instead of returning unverified data", async () => {
    const fixture = createCloudFixture({ pets: [{ id: "cached-pet" }] });
    const storage = createMemoryStorage();
    const warmService = createDataService({
      cloud: fixture.cloud,
      storage,
      previewSnapshot: {},
      config: createServiceConfig(fixture),
    });
    await warmService.load();

    const cached = storage.get(CACHE_KEY);
    storage.set(CACHE_KEY, {
      ...cached,
      runtimeText: JSON.stringify({ pets: [{ id: "tampered-pet" }] }),
    });

    const offlineService = createDataService({
      cloud: {
        downloadManifest: vi.fn(async () => {
          throw new Error("offline");
        }),
        downloadRuntime: vi.fn(),
      },
      storage,
      previewSnapshot: {},
      config: createServiceConfig(fixture),
    });

    await expect(offlineService.load()).rejects.toBeInstanceOf(
      DataUnavailableError,
    );
  });

  test("rejects coordinated cache data and hash tampering against the trusted build hash", async () => {
    const fixture = createCloudFixture({ pets: [{ id: "cached-pet" }] });
    const trustedRuntimeSha256 = fixture.manifest.runtimeSha256;
    const storage = createMemoryStorage();
    const warmService = createDataService({
      cloud: fixture.cloud,
      storage,
      previewSnapshot: {},
      config: createServiceConfig(fixture),
    });
    await warmService.load();

    const tamperedSnapshot = { pets: [{ id: "tampered-pet" }] };
    const tamperedText = JSON.stringify(tamperedSnapshot);
    const cached = storage.get(CACHE_KEY);
    storage.set(CACHE_KEY, {
      ...cached,
      manifest: {
        ...cached.manifest,
        runtimeSha256: sha256(tamperedText),
      },
      runtimeText: tamperedText,
      snapshot: tamperedSnapshot,
    });

    const offlineService = createDataService({
      cloud: {
        downloadManifest: vi.fn(async () => {
          throw new Error("offline");
        }),
        downloadRuntime: vi.fn(),
      },
      storage,
      previewSnapshot: {},
      config: {
        cloudEnv: "env-test",
        preview: false,
        target: "weapp",
        trustedRuntimeSha256,
      },
    });

    await expect(offlineService.load()).rejects.toBeInstanceOf(
      DataUnavailableError,
    );
  });

  test("throws DataUnavailableError on the first failed load without a cache", async () => {
    const service = createDataService({
      cloud: {
        downloadManifest: vi.fn(async () => {
          throw new Error("offline");
        }),
        downloadRuntime: vi.fn(),
      },
      storage: createMemoryStorage(),
      previewSnapshot: {},
      config: {
        cloudEnv: "env-test",
        preview: false,
        target: "weapp",
        trustedRuntimeSha256: "a".repeat(64),
      },
    });

    await expect(service.load()).rejects.toMatchObject({
      name: "DataUnavailableError",
      message: "计算数据加载失败，请检查网络后重试",
      cause: expect.objectContaining({ message: "offline" }),
    });
  });

  test("normalizes a cache read failure to DataUnavailableError", async () => {
    const cloudError = new Error("offline");
    const storageError = new Error("storage broken");
    const service = createDataService({
      cloud: {
        downloadManifest: vi.fn(async () => {
          throw cloudError;
        }),
        downloadRuntime: vi.fn(),
      },
      storage: {
        get: vi.fn(() => {
          throw storageError;
        }),
        set: vi.fn(),
        remove: vi.fn(),
      },
      previewSnapshot: {},
      config: {
        cloudEnv: "env-test",
        preview: false,
        target: "weapp",
        trustedRuntimeSha256: "a".repeat(64),
      },
    });

    await expect(service.load()).rejects.toMatchObject({
      name: "DataUnavailableError",
      cause: cloudError,
      cacheCause: storageError,
    });
  });

  test("returns verified cloud data when writing the optional cache fails", async () => {
    const fixture = createCloudFixture();
    const service = createDataService({
      cloud: fixture.cloud,
      storage: {
        get: vi.fn(),
        set: vi.fn(() => {
          throw new Error("quota exceeded");
        }),
        remove: vi.fn(),
      },
      previewSnapshot: {},
      config: createServiceConfig(fixture),
    });

    await expect(service.load()).resolves.toEqual({
      petImages: {
        "pet-1": "cloud://env-test/pets/pet-1.png",
      },
      snapshot: { pets: [{ id: "pet-1" }] },
      source: "cloud",
      stale: false,
    });
  });

  test("uses the bundled fixture directly in preview mode", async () => {
    const cloud = {
      downloadManifest: vi.fn(),
      downloadRuntime: vi.fn(),
    };
    const storage = createMemoryStorage();
    const previewSnapshot = { pets: [{ id: "preview-pet" }] };
    const service = createDataService({
      cloud,
      storage,
      previewSnapshot,
      config: { preview: true },
    });

    await expect(service.load()).resolves.toEqual({
      petImages: {},
      snapshot: previewSnapshot,
      source: "preview",
      stale: false,
    });
    expect(cloud.downloadManifest).not.toHaveBeenCalled();
    expect(storage.set).not.toHaveBeenCalled();
  });

  test("clearCache removes only the mini program snapshot cache", () => {
    const storage = createMemoryStorage();
    const service = createDataService({
      cloud: {},
      storage,
      previewSnapshot: {},
      config: { preview: true },
    });

    service.clearCache();

    expect(storage.remove).toHaveBeenCalledWith(CACHE_KEY);
  });
});

describe("createStorageAdapter", () => {
  test("delegates to Taro synchronous storage without changing the value", () => {
    const taro = {
      getStorageSync: vi.fn(() => ({ saved: true })),
      setStorageSync: vi.fn(),
      removeStorageSync: vi.fn(),
    };
    const storage = createStorageAdapter(taro);

    expect(storage.get("key")).toEqual({ saved: true });
    storage.set("key", { next: true });
    storage.remove("key");

    expect(taro.getStorageSync).toHaveBeenCalledWith("key");
    expect(taro.setStorageSync).toHaveBeenCalledWith("key", { next: true });
    expect(taro.removeStorageSync).toHaveBeenCalledWith("key");
  });
});

describe("createCloudAdapter", () => {
  test("downloads the manifest and runtime by their exact cloud file IDs", async () => {
    const fileContents = new Map([
      [
        "manifest.tmp",
        JSON.stringify({ runtimeFileId: "cloud://env/runtime.json" }),
      ],
      ["runtime.tmp", JSON.stringify({ pets: [] })],
    ]);
    const taro = {
      cloud: {
        init: vi.fn(),
        downloadFile: vi
          .fn()
          .mockResolvedValueOnce({ tempFilePath: "manifest.tmp" })
          .mockResolvedValueOnce({ tempFilePath: "runtime.tmp" }),
      },
      getFileSystemManager: vi.fn(() => ({
        readFile({ filePath, success }) {
          success({ data: fileContents.get(filePath) });
        },
      })),
    };
    const adapter = createCloudAdapter(taro, {
      cloudEnv: "env-test",
      manifestFileId: "cloud://env/manifest.json",
    });

    await expect(adapter.downloadManifest()).resolves.toEqual({
      runtimeFileId: "cloud://env/runtime.json",
    });
    await expect(
      adapter.downloadRuntime("cloud://env/runtime.json"),
    ).resolves.toBe(JSON.stringify({ pets: [] }));

    expect(taro.cloud.init).toHaveBeenCalledWith({ env: "env-test" });
    expect(taro.cloud.downloadFile.mock.calls).toEqual([
      [{ fileID: "cloud://env/manifest.json" }],
      [{ fileID: "cloud://env/runtime.json" }],
    ]);
  });

  test.each([
    "manifest.json",
    "file:///tmp/manifest.json",
    "/local/manifest.json",
    " cloud://env/manifest.json",
    "cloud://env/manifest.json ",
  ])("rejects an inexact manifest cloud file ID: %s", (manifestFileId) => {
    const taro = {
      cloud: {
        init: vi.fn(),
        downloadFile: vi.fn(),
      },
    };

    expect(() =>
      createCloudAdapter(taro, {
        cloudEnv: "env-test",
        manifestFileId,
      }),
    ).toThrow(/微信云文件 ID/);
    expect(taro.cloud.downloadFile).not.toHaveBeenCalled();
  });

  test.each([
    "runtime.json",
    "file:///tmp/runtime.json",
    "/local/runtime.json",
    " cloud://env/runtime.json",
    "cloud://env/runtime.json ",
  ])("rejects an inexact runtime cloud file ID: %s", async (runtimeFileId) => {
    const taro = {
      cloud: {
        init: vi.fn(),
        downloadFile: vi.fn(),
      },
    };
    const adapter = createCloudAdapter(taro, {
      cloudEnv: "env-test",
      manifestFileId: "cloud://env/manifest.json",
    });

    await expect(adapter.downloadRuntime(runtimeFileId)).rejects.toThrow(
      /微信云文件 ID/,
    );
    expect(taro.cloud.downloadFile).not.toHaveBeenCalled();
  });
});

describe("createRuntimeConfig", () => {
  test("accepts stable build-value keys without compile-token object keys", () => {
    expect(
      createRuntimeConfig({
        cloudEnv: "",
        manifestFileId: "",
        previewFixture: "1",
        target: "h5",
        trustedRuntimeSha256: "",
      }),
    ).toEqual({
      cloudEnv: "",
      manifestFileId: "",
      preview: true,
      target: "h5",
      trustedRuntimeSha256: "",
    });
  });

  test("keeps Taro define constants out of string literals", () => {
    const source = readFileSync(
      resolve(process.cwd(), "src/config/runtime.js"),
      "utf8",
    );
    const stringLiterals =
      source.match(/(["'`])(?:\\.|(?!\1)[^\\])*\1/g) ?? [];

    expect(stringLiterals.join("\n")).not.toContain("TARO_APP_");
  });

  test("reads cloud IDs and the trusted hash from the Taro compile environment", () => {
    const trustedRuntimeSha256 = "a".repeat(64);

    expect(
      createRuntimeConfig({
        TARO_APP_CLOUD_ENV: "env-test",
        TARO_APP_MANIFEST_FILE_ID: "cloud://env/manifest.json",
        TARO_APP_PREVIEW_FIXTURE: "0",
        TARO_APP_RUNTIME_SHA256: trustedRuntimeSha256,
        TARO_APP_TARGET: "weapp",
      }),
    ).toEqual({
      cloudEnv: "env-test",
      manifestFileId: "cloud://env/manifest.json",
      preview: false,
      target: "weapp",
      trustedRuntimeSha256,
    });
  });

  test("allows an H5 preview fixture without cloud configuration", () => {
    expect(
      createRuntimeConfig({
        TARO_APP_PREVIEW_FIXTURE: "1",
        TARO_APP_TARGET: "h5",
      }),
    ).toEqual({
      cloudEnv: "",
      manifestFileId: "",
      preview: true,
      target: "h5",
      trustedRuntimeSha256: "",
    });
  });

  test("does not allow the preview fixture to bypass WeApp cloud configuration", () => {
    expect(() =>
      createRuntimeConfig({
        TARO_APP_PREVIEW_FIXTURE: "1",
        TARO_APP_TARGET: "weapp",
      }),
    ).toThrow(/TARO_APP_CLOUD_ENV/);
  });

  test("fails production configuration when a cloud ID or trusted hash is missing", () => {
    expect(() =>
      createRuntimeConfig({
        TARO_APP_CLOUD_ENV: "",
        TARO_APP_MANIFEST_FILE_ID: "cloud://env/manifest.json",
        TARO_APP_RUNTIME_SHA256: "a".repeat(64),
        TARO_APP_TARGET: "weapp",
      }),
    ).toThrow(/TARO_APP_CLOUD_ENV/);
    expect(() =>
      createRuntimeConfig({
        TARO_APP_CLOUD_ENV: "env-test",
        TARO_APP_MANIFEST_FILE_ID: "",
        TARO_APP_RUNTIME_SHA256: "a".repeat(64),
        TARO_APP_TARGET: "weapp",
      }),
    ).toThrow(/TARO_APP_MANIFEST_FILE_ID/);
    expect(() =>
      createRuntimeConfig({
        TARO_APP_CLOUD_ENV: "env-test",
        TARO_APP_MANIFEST_FILE_ID: "cloud://env/manifest.json",
        TARO_APP_RUNTIME_SHA256: "",
        TARO_APP_TARGET: "weapp",
      }),
    ).toThrow(/TARO_APP_RUNTIME_SHA256/);
  });
});
