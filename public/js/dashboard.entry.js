// Dashboard is the first protected page loaded through one native ES-module
// entry. The bridge keeps existing classic-compatible browser files working
// while their globals are retired incrementally.
const namespace = window.LongtailForge = window.LongtailForge || {};
const loadedScripts = new Map();
const loadedStyles = new Map();

function versionedAssetUrl(assetPath) {
  const url = new URL(String(assetPath || ""), document.baseURI);

  if (url.origin !== window.location.origin || !/^\/(?:css|js)\//.test(url.pathname)) {
    throw new Error(`Dashboard refused non-local browser asset: ${url.href}`);
  }

  const version = String(
    namespace.assetVersion?.value ||
    document.querySelector("meta[data-asset-version]")?.content ||
    "",
  ).trim();

  if (version) {
    url.searchParams.set("v", version);
  }

  return url.href;
}

async function importScript(assetPath) {
  const url = versionedAssetUrl(assetPath);

  if (!url.endsWith(".js") && !new URL(url).pathname.endsWith(".js")) {
    throw new Error(`Dashboard script asset must end in .js: ${url}`);
  }

  if (!loadedScripts.has(url)) {
    loadedScripts.set(url, import(url));
  }

  return loadedScripts.get(url);
}

async function loadStyle(assetPath) {
  const url = versionedAssetUrl(assetPath);

  if (!new URL(url).pathname.endsWith(".css")) {
    throw new Error(`Dashboard style asset must end in .css: ${url}`);
  }

  if (!loadedStyles.has(url)) {
    loadedStyles.set(url, new Promise((resolve, reject) => {
      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = url;
      link.dataset.esModuleAsset = "dashboard";
      link.addEventListener("load", resolve, { once: true });
      link.addEventListener("error", () => reject(new Error(`Dashboard style failed to load: ${url}`)), { once: true });
      document.head.append(link);
    }));
  }

  return loadedStyles.get(url);
}

async function importScripts(assetPaths) {
  for (const assetPath of assetPaths) {
    await importScript(assetPath);
  }
}

async function loadContributedAssets(assets) {
  for (const asset of Array.isArray(assets) ? assets : []) {
    if (asset?.type === "style") {
      await loadStyle(asset.path);
    } else if (asset?.type === "script") {
      await importScript(asset.path);
    }
  }
}

namespace.esModuleBridge = Object.freeze({
  importScript,
  importScripts,
  loadContributedAssets,
  loadStyle,
  versionedAssetUrl,
});

await importScripts([
  "/js/navigation.js",
  "/js/shared/modal.js",
  "/js/shared/api-client.js",
  "/js/shared/page-controller.js",
  "/js/shared/module-actions.js",
  "/js/shared/icons.js",
  "/js/shared/formatters.js",
  "/js/shared/timezones.js",
  "/js/shared/tags.js",
  "/js/shared/file-attachments.js",
  "/js/shared/notes-linked-panel.js",
  "/js/shared/notification-subscriptions.js",
  "/js/shared/view-builder.js",
  "/js/shared/view-renderer.js",
  "/js/shared/file-preview.js",
  "/js/dashboard.js",
  "/js/footer.js",
]);
