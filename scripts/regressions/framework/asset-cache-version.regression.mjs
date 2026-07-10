export const regressionMeta = Object.freeze({
  id: "framework.asset-cache-version",
  area: "framework",
  tier: "release-gate",
  tags: ["assets", "cache", "release"],
  description: "Proves one application-derived asset version decorates served pages, runtime loaders, and module assets while raw keys stay guarded.",
  runMode: "static",
});

import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import vm from "node:vm";
import { URLSearchParams } from "node:url";
import { appVersion } from "../../../src/core/version.js";
import {
  assetVersion,
  decorateHtmlAssetUrls,
  injectAssetVersionBootstrap,
  withAssetVersion,
} from "../../../src/core/asset-version.js";
import { modulesService } from "../../../src/core/modules/modules.service.js";
import { staticService } from "../../../src/services/static.service.js";
import {
  collectAssetCacheGuardErrors,
  collectRawAssetVersionReferences,
} from "../../lib/asset-cache-guard.mjs";

const baseline = JSON.parse(await fs.readFile("scripts/asset-cache-legacy-baseline.json", "utf8"));
const liveFindings = await collectRawAssetVersionReferences();

assert.equal(assetVersion, appVersion, "asset cache version should derive from the canonical application version");
assert.equal(withAssetVersion("js/app.js?v=old"), `js/app.js?v=${appVersion}`);
assert.equal(withAssetVersion("/css/app.css?theme=wide#main"), `/css/app.css?theme=wide&v=${appVersion}#main`);
assert.equal(withAssetVersion("https://cdn.example.test/app.js?v=vendor"), "https://cdn.example.test/app.js?v=vendor");
assert.equal(withAssetVersion("images/logo.webp"), "images/logo.webp");

assert.deepEqual(
  collectAssetCacheGuardErrors({ baseline, findings: liveFindings }),
  [],
  "all retained raw keys should exactly match their explicit frozen legacy exceptions",
);

const unapprovedFindings = new Map(liveFindings);
unapprovedFindings.set("public/js/new-feature.js", {
  count: 1,
  references: ["new-feature.js?v=1"],
  sha256: "synthetic-new-reference",
});
assert.match(
  collectAssetCacheGuardErrors({ baseline, findings: unapprovedFindings }).join("\n"),
  /public\/js\/new-feature\.js contains 1 unapproved raw asset cache key/,
  "a new raw cache key outside the frozen baseline should fail",
);

const changedFindings = new Map(liveFindings);
const changedPath = "views/protected/tasks.html";
changedFindings.set(changedPath, {
  ...changedFindings.get(changedPath),
  sha256: "synthetic-manual-bump",
});
assert.match(
  collectAssetCacheGuardErrors({ baseline, findings: changedFindings }).join("\n"),
  /tasks\.html raw asset cache keys differ from the frozen legacy exception/,
  "manually bumping a frozen legacy key should fail",
);

for (const viewPath of await listFiles("views", ".html")) {
  const source = await fs.readFile(viewPath, "utf8");
  const sourceAssets = extractLocalAssets(source);
  const decorated = decorateHtmlAssetUrls(injectAssetVersionBootstrap(source));
  const decoratedAssets = extractLocalAssets(decorated);
  const bootstrapPath = "/js/shared/asset-version.js";
  const decoratedWithoutBootstrap = decoratedAssets.filter((asset) => asset.pathname !== bootstrapPath);

  assert.deepEqual(
    decoratedWithoutBootstrap.map((asset) => asset.pathname),
    sourceAssets.map((asset) => asset.pathname),
    `${viewPath} should preserve existing script/style order`,
  );
  assert.ok(
    decoratedAssets.every((asset) => asset.version === appVersion),
    `${viewPath} should serve every local script/style with the canonical asset version`,
  );
  assert.match(decorated, new RegExp(`data-asset-version content="${escapeRegExp(appVersion)}"`));
  assert.equal(decoratedAssets.filter((asset) => asset.pathname === bootstrapPath).length, 1);
}

const publicIndex = await staticService.read("/index.html");
assert.equal(publicIndex.statusCode, 200);
assert.match(String(publicIndex.contents), new RegExp(`theme-init\\.js\\?v=${escapeRegExp(appVersion)}`));
assert.match(String(publicIndex.contents), new RegExp(`asset-version\\.js\\?v=${escapeRegExp(appVersion)}`));

const moduleAssets = modulesService.listModuleBrowserAssets();
assert.ok(moduleAssets.length > 0, "fixture should include registered module browser assets");
assert.ok(
  moduleAssets.every((asset) => new URL(asset.path, "http://local.test").searchParams.get("v") === appVersion),
  "normalized module assets should receive the canonical asset version",
);

const browserHelper = await fs.readFile("public/js/shared/asset-version.js", "utf8");
const footerSource = await fs.readFile("public/js/footer.js", "utf8");
const workbenchSource = await fs.readFile("public/js/workbench.js", "utf8");
assert.match(browserHelper, /namespace\.assetVersion = Object\.freeze\(\{ url, value \}\)/);
const browserContext = {
  document: { querySelector: () => ({ content: appVersion }) },
  URLSearchParams,
  window: {},
};
vm.runInNewContext(browserHelper, browserContext);
assert.equal(browserContext.window.LongtailForge.assetVersion.value, appVersion);
assert.equal(
  browserContext.window.LongtailForge.assetVersion.url("js/example.js?v=legacy"),
  `js/example.js?v=${appVersion}`,
);
assert.match(footerSource, /assetVersion\?\.url\(dependency\.src\)[\s\S]*script\.src = versionedSrc/);
assert.match(workbenchSource, /assetVersion\?\.url\(dependency\.src\)[\s\S]*script\.src = versionedSrc/);
assert.doesNotMatch(footerSource, /script\.src = dependency\.src/);
assert.doesNotMatch(workbenchSource, /script\.src = dependency\.src/);

console.log("Canonical asset cache version and raw-key guard passed.");

async function listFiles(rootDir, extension) {
  const files = [];
  for (const entry of await fs.readdir(rootDir, { withFileTypes: true })) {
    const filePath = path.join(rootDir, entry.name);
    if (entry.isDirectory()) {
      files.push(...await listFiles(filePath, extension));
    } else if (entry.isFile() && filePath.endsWith(extension)) {
      files.push(filePath.replaceAll("\\", "/"));
    }
  }
  return files.sort();
}

function extractLocalAssets(source) {
  return [...source.matchAll(/\b(?:src|href)=(['"])([^'"]+)\1/gi)]
    .map((match) => match[2])
    .filter((assetUrl) => !/^(?:[a-z][a-z0-9+.-]*:|\/\/|#)/i.test(assetUrl))
    .map((assetUrl) => {
      const url = new URL(assetUrl, "http://local.test/");
      return { pathname: url.pathname, version: url.searchParams.get("v") };
    })
    .filter((asset) => /\.(?:css|js)$/i.test(asset.pathname));
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
