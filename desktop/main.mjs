import { readFile, stat, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import {
  app,
  BrowserWindow,
  ipcMain,
  Menu,
  protocol,
  shell,
} from "electron";
import {
  createWindowOpenHandler,
  handleWillNavigate,
  isSupportedExternalUrl,
} from "./external-navigation.mjs";
import { resolveOfflineAssetPath } from "./offline-paths.mjs";

const APP_SCHEME = "app";
const APP_ORIGIN = "app://calculator/";
const APP_NAME = "洛克计算器";
const APP_TITLE = "洛克计算器 · S3季中";
const APP_USER_MODEL_ID = "cn.rock.calculator";

protocol.registerSchemesAsPrivileged([
  {
    scheme: APP_SCHEME,
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
    },
  },
]);

function getClientRoot() {
  return app.isPackaged
    ? path.join(process.resourcesPath, "client")
    : path.join(app.getAppPath(), "dist", "client");
}

function getAppIconPath() {
  return path.join(app.getAppPath(), "desktop", "icon.png");
}

function getMimeType(filePath) {
  const extension = path.extname(filePath).toLowerCase();
  return (
    {
      ".css": "text/css",
      ".html": "text/html",
      ".ico": "image/x-icon",
      ".jpeg": "image/jpeg",
      ".jpg": "image/jpeg",
      ".js": "text/javascript",
      ".json": "application/json",
      ".png": "image/png",
      ".svg": "image/svg+xml",
      ".webmanifest": "application/manifest+json",
      ".webp": "image/webp",
      ".woff": "font/woff",
      ".woff2": "font/woff2",
    }[extension] ?? "application/octet-stream"
  );
}

async function readBundledAsset(requestUrl) {
  const clientRoot = getClientRoot();
  let assetPath = resolveOfflineAssetPath(requestUrl, clientRoot);
  if (!assetPath) {
    return {
      data: Buffer.from("Not found"),
      mimeType: "text/plain",
      statusCode: 404,
    };
  }

  try {
    const fileStat = await stat(assetPath);
    if (fileStat.isDirectory()) {
      assetPath = path.join(assetPath, "index.html");
    }
    const body = await readFile(assetPath);
    return {
      data: body,
      headers: { "cache-control": "no-store" },
      mimeType: getMimeType(assetPath),
      statusCode: 200,
    };
  } catch {
    try {
      const fallbackPath = path.join(clientRoot, "index.html");
      const body = await readFile(fallbackPath);
      return {
        data: body,
        headers: { "cache-control": "no-store" },
        mimeType: getMimeType(fallbackPath),
        statusCode: 200,
      };
    } catch {
      return {
        data: Buffer.from("Offline app files are unavailable."),
        mimeType: "text/plain",
        statusCode: 500,
      };
    }
  }
}

function createMainWindow({ visible = true } = {}) {
  const window = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 900,
    minHeight: 640,
    show: false,
    title: APP_TITLE,
    icon: getAppIconPath(),
    backgroundColor: "#f4f6fb",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(app.getAppPath(), "desktop", "preload.cjs"),
      sandbox: true,
    },
  });

  window.setMenuBarVisibility(false);
  window.webContents.on("page-title-updated", (event) => {
    event.preventDefault();
    window.setTitle(APP_TITLE);
  });
  const openExternal = (url) => shell.openExternal(url);
  window.webContents.setWindowOpenHandler(
    createWindowOpenHandler(openExternal),
  );
  window.webContents.on("will-navigate", (event, url) => {
    handleWillNavigate(event, url, openExternal);
  });
  if (visible) {
    window.once("ready-to-show", () => {
      window.show();
    });
  }
  window.loadURL(APP_ORIGIN);
  return window;
}

function getSmokeReportPath() {
  const prefix = "--offline-smoke-report=";
  const argument = process.argv.find((value) => value.startsWith(prefix));
  return argument ? path.resolve(argument.slice(prefix.length)) : null;
}

async function collectOfflineSmokeResult(window) {
  const deadline = Date.now() + 15_000;
  let shell = null;
  while (Date.now() < deadline) {
    shell = await window.webContents.executeJavaScript(`
      (() => ({
        heading:
          document.querySelector("h1")?.getAttribute("aria-label") ??
          document.querySelector("h1")?.textContent ??
          "",
        attackerPicker: Boolean(
          document.querySelector('[aria-label="攻击方精灵"]')
        ),
        defenderPicker: Boolean(
          document.querySelector('[aria-label="防御方精灵"]')
        ),
        loading: document.body.textContent.includes("正在加载 S3 数据"),
      }))()
    `);
    if (shell.attackerPicker && shell.defenderPicker && !shell.loading) break;
    await new Promise((resolve) => setTimeout(resolve, 150));
  }

  const data = await window.webContents.executeJavaScript(`
    fetch("/data/runtime.json")
      .then((response) => {
        if (!response.ok) throw new Error("runtime data unavailable");
        return response.json();
      })
      .then((snapshot) => ({
        spirits: snapshot.spirits.length,
        skills: snapshot.skills.length,
      }))
  `);

  const ok =
    shell?.attackerPicker === true &&
    shell?.defenderPicker === true &&
    shell?.loading === false &&
    data.spirits === 594 &&
    data.skills === 553;

  return {
    ok,
    mode: "offline",
    origin: APP_ORIGIN,
    heading: shell?.heading ?? "",
    attackerPicker: shell?.attackerPicker ?? false,
    defenderPicker: shell?.defenderPicker ?? false,
    spirits: data.spirits,
    skills: data.skills,
  };
}

app.setName(APP_NAME);
app.setAppUserModelId(APP_USER_MODEL_ID);
app.commandLine.appendSwitch("disable-direct-composition");

app.whenReady().then(async () => {
  Menu.setApplicationMenu(null);
  ipcMain.handle("desktop:open-external", async (event, url) => {
    if (
      !event.senderFrame.url.startsWith(APP_ORIGIN) ||
      !isSupportedExternalUrl(url)
    ) {
      return false;
    }
    await shell.openExternal(url);
    return true;
  });
  protocol.registerBufferProtocol(APP_SCHEME, (request, callback) => {
    readBundledAsset(request.url).then(callback).catch(() =>
      callback({
        data: Buffer.from("Offline app files are unavailable."),
        mimeType: "text/plain",
        statusCode: 500,
      }),
    );
  });

  const smokeReportPath = getSmokeReportPath();
  const window = createMainWindow({ visible: !smokeReportPath });
  if (!smokeReportPath) return;

  try {
    const result = await collectOfflineSmokeResult(window);
    await mkdir(path.dirname(smokeReportPath), { recursive: true });
    await writeFile(
      smokeReportPath,
      `${JSON.stringify(result, null, 2)}\n`,
      "utf8",
    );
    app.exit(result.ok ? 0 : 1);
  } catch (error) {
    await mkdir(path.dirname(smokeReportPath), { recursive: true });
    await writeFile(
      smokeReportPath,
      `${JSON.stringify(
        {
          ok: false,
          mode: "offline",
          error: error instanceof Error ? error.message : String(error),
        },
        null,
        2,
      )}\n`,
      "utf8",
    );
    app.exit(1);
  }
});

app.on("window-all-closed", () => {
  app.quit();
});
