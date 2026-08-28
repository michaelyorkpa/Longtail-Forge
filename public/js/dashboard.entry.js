// Dashboard is the first protected page loaded through one native ES-module
// entry. The bridge keeps existing classic-compatible browser files working
// while their globals are retired incrementally.
// This file is a native ES module at runtime: the browser loads it as one and its
// top-level await depends on that. TypeScript decides module scope from syntax alone,
// so without an export marker it modelled this file as a global script and offered every
// declaration below to the classic shared scope. The marker exports nothing; this module's
// public behaviour is its explicit window.LongtailForge.* publication.
export {};

const namespace = window.LongtailForge = window.LongtailForge || {};
const loadedScripts = new Map();
const loadedStyles = new Map();

/** @typedef {import("../../src/types/browser-contracts.js").BrowserApi} BrowserApi */

/**
 * The API client this file cannot run without.
 *
 * Acquired per call rather than once at module scope, so a missing client still fails at
 * exactly the moment it failed before `0.33.33.38.1` declared the namespace it lives on.
 * The five methods keep returning `Promise<unknown>`: a fetch body is an untrusted wire
 * value, and narrowing one is `0.33.33.38.4`'s work rather than this file's.
 * @returns {BrowserApi}
 */
function requireApi() {
  const client = namespace?.api;
  if (!client) {
    throw new Error("The Dashboard bridge requires LongtailForge.api.");
  }
  return client;
}
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
  await Promise.all(assetPaths.map((assetPath) => importScript(assetPath)));
}

async function loadContributedAssets(assets) {
  await Promise.all((Array.isArray(assets) ? assets : []).map((asset) => {
    if (asset?.type === "style") {
      return loadStyle(asset.path);
    } else if (asset?.type === "script") {
      return importScript(asset.path);
    }
    return Promise.resolve();
  }));
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
  "/js/shared/api-client.js",
]);
await importScript("/js/shared/cached-fetch.js");

const dashboardDataPromises = new Map();
const dashboardManifestPromise = loadDashboardManifest();

namespace.dashboardBootstrap = Object.freeze({
  dataPromises: dashboardDataPromises,
  loadRoute: loadDashboardRoute,
  manifestPromise: dashboardManifestPromise,
  routeForPanel: dashboardPanelRoute,
});

dashboardManifestPromise
  .then(({ data, revalidated }) => {
    warmDashboardPanelData(data);
    revalidated.then(warmDashboardPanelData).catch(() => {});
  })
  .catch(() => {});

await importScripts([
  "/js/shared/modal.js",
  "/js/shared/page-controller.js",
  "/js/shared/module-actions.js",
  "/js/shared/icons.js",
  "/js/shared/formatters.js",
  "/js/shared/timezones.js",
  "/js/shared/tags.js",
  "/js/shared/view-builder.js",
]);
await importScripts([
  "/js/shared/file-attachments.js",
  "/js/shared/notes-linked-panel.js",
  "/js/shared/notification-subscriptions.js",
  "/js/shared/view-renderer.js",
  "/js/shared/file-preview.js",
]);
await importScripts([
  "/js/dashboard.js",
  "/js/footer.js",
]);

async function loadDashboardManifest() {
  const workspaceId = String(namespace.workspaceContext?.workspaceId || "").trim();

  if (!workspaceId) {
    const revalidated = requireApi().getJson("/api/dashboard", { cache: "no-store" });
    return {
      data: await revalidated,
      fromCache: false,
      revalidated,
    };
  }

  return namespace.cachedFetch.getJson("/api/dashboard", {
    cacheKey: `${workspaceId}:dashboard:${dashboardAssetVersion()}:manifest`,
  });
}

function warmDashboardPanelData(data) {
  const panels = data?.extensionPoints?.dashboardPanels;

  for (const panel of Array.isArray(panels) ? panels : []) {
    loadDashboardRoute(dashboardPanelRoute(panel)).catch(() => {});
  }

  return data;
}

function loadDashboardRoute(routeValue) {
  const route = String(routeValue || "").trim();

  if (!route) {
    return Promise.resolve({});
  }

  if (!dashboardDataPromises.has(route)) {
    dashboardDataPromises.set(route, requireApi().getJson(route, { cache: "no-store" }));
  }

  return dashboardDataPromises.get(route);
}

function dashboardPanelRoute(panel = {}) {
  const route = String(panel.dataRoute || "").trim();

  if (panel.renderer !== "tasks.calendar" || route !== "/api/tasks/calendar") {
    return route;
  }

  const view = ["day", "week", "month"].includes(namespace.userPreferences?.preferredCalendarView)
    ? namespace.userPreferences.preferredCalendarView
    : window.matchMedia?.("(max-width: 700px)")?.matches ? "day" : "month";
  const range = dashboardCalendarRange(view, new Date());
  const params = new URLSearchParams({
    start: range.start,
    end: range.end,
    statuses: "open,in_progress,blocked",
  });
  return `${route}?${params.toString()}`;
}

function dashboardCalendarRange(view, anchor) {
  if (view === "day") {
    const day = dashboardDateKey(anchor);
    return { start: day, end: day };
  }

  if (view === "week") {
    const start = new Date(anchor.getFullYear(), anchor.getMonth(), anchor.getDate() - anchor.getDay());
    return { start: dashboardDateKey(start), end: dashboardDateKey(dashboardAddDays(start, 6)) };
  }

  const monthStart = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
  const monthEnd = new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0);
  const start = dashboardAddDays(monthStart, -monthStart.getDay());
  const end = dashboardAddDays(monthEnd, 6 - monthEnd.getDay());
  return { start: dashboardDateKey(start), end: dashboardDateKey(end) };
}

function dashboardAddDays(date, days) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
}

function dashboardDateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function dashboardAssetVersion() {
  return String(
    namespace.assetVersion?.value ||
    document.querySelector("meta[data-asset-version]")?.content ||
    "",
  ).trim() || "current";
}
