export const regressionMeta = Object.freeze({
  id: "framework.browser-security-headers",
  area: "framework",
  tier: "focused",
  tags: ["browser", "cache", "csp", "headers", "security"],
  description: "Proves the centralized browser header policy, compatible CSP inventory, trusted-HTTPS HSTS retention, and private-response cache boundary.",
  runMode: "static",
});

import assert from "node:assert/strict";
import fs from "node:fs/promises";
import http from "node:http";
import express from "express";
import {
  CONTENT_SECURITY_POLICY,
  PERMISSIONS_POLICY,
  createTransportSecurityMiddleware,
} from "../../../src/core/transport-security.js";
import {
  attachRequestContext,
  configureTrustedProxy,
} from "../../../src/core/request-context.js";

const directHtml = await probeRequest([], "/login.html");
assert.equal(directHtml.statusCode, 200);
assert.equal(directHtml.headers["content-security-policy"], CONTENT_SECURITY_POLICY);
assert.equal(directHtml.headers["x-frame-options"], "DENY");
assert.equal(directHtml.headers["x-content-type-options"], "nosniff");
assert.equal(directHtml.headers["referrer-policy"], "strict-origin-when-cross-origin");
assert.equal(directHtml.headers["permissions-policy"], PERMISSIONS_POLICY);
assert.equal(directHtml.headers["cache-control"], "no-store", "HTML should not retain stale private/bootstrap state");
assert.equal(directHtml.headers["strict-transport-security"], undefined, "direct HTTP should retain the trusted-HTTPS HSTS gate");

assert.match(CONTENT_SECURITY_POLICY, /frame-ancestors 'none'/);
assert.match(CONTENT_SECURITY_POLICY, /object-src 'none'/);
assert.match(CONTENT_SECURITY_POLICY, /base-uri 'self'/);
assert.match(CONTENT_SECURITY_POLICY, /script-src 'self'/);
assert.doesNotMatch(CONTENT_SECURITY_POLICY, /script-src[^;]*'unsafe-inline'/, "executable inline script should not be allowed");
assert.match(CONTENT_SECURITY_POLICY, /style-src 'self' 'unsafe-inline'/, "the inventoried style compatibility exception should stay explicit");
assert.match(CONTENT_SECURITY_POLICY, /img-src 'self' data: blob:/, "current local and preview image sources should remain compatible");

const directApi = await probeRequest([], "/api/private");
assert.equal(directApi.headers["cache-control"], "no-store", "API responses should default to non-cacheable");

const versionedAsset = await probeRequest([], "/js/example.js");
assert.equal(versionedAsset.headers["cache-control"], undefined, "versioned public assets should retain normal browser caching");

const forgedHttps = await probeRequest([], "/login.html", {
  "x-forwarded-host": "forge.example.test",
  "x-forwarded-proto": "https",
});
assert.equal(forgedHttps.headers["strict-transport-security"], undefined, "untrusted forwarding headers must not enable HSTS");

const trustedHttps = await probeRequest(["127.0.0.1/32"], "/login.html", {
  "x-forwarded-host": "forge.example.test",
  "x-forwarded-proto": "https",
});
assert.equal(trustedHttps.headers["strict-transport-security"], "max-age=300", "trusted proxy HTTPS should retain HSTS");
assert.equal(trustedHttps.headers["content-security-policy"], CONTENT_SECURITY_POLICY, "the broader policy should coexist with HSTS");

const attachmentSandbox = await probeRequest([], "/api/file-preview", {}, { attachmentSandbox: true });
assert.equal(attachmentSandbox.headers["content-security-policy"], "sandbox", "attachment-specific sandboxing should be able to narrow the global policy");
assert.equal(attachmentSandbox.headers["x-content-type-options"], "nosniff", "shared hardening should remain on attachment responses");

const htmlFiles = (await fs.readdir("views", { recursive: true }))
  .filter((filePath) => filePath.endsWith(".html"));
for (const filePath of htmlFiles) {
  const relativePath = `views/${filePath.replaceAll("\\", "/")}`;
  const source = await fs.readFile(relativePath, "utf8");
  assert.doesNotMatch(source, /<script(?![^>]*\bsrc=)[^>]*>/i, `${relativePath} should not require unsafe-inline script execution`);
  assert.doesNotMatch(source, /\son[a-z]+\s*=/i, `${relativePath} should not use inline event handlers`);
}

const notificationsView = await fs.readFile("views/protected/notifications.html", "utf8");
const notificationGuard = await fs.readFile("public/js/notification-load-guard.js", "utf8");
const staticServiceSource = await fs.readFile("src/services/static.service.js", "utf8");
const browserSources = await readBrowserJavaScript();
assert.match(notificationsView, /src="\/js\/notification-load-guard\.js"/, "the final inline script should move to a CSP-compatible local asset");
assert.match(notificationGuard, /notificationsPageReady/, "the external guard should preserve the existing load-failure behavior");
assert.match(staticServiceSource, /<style data-theme-critical>/, "the server-injected critical theme style should stay in the compatibility inventory");
assert.match(browserSources, /\.style\.(?:setProperty|colorScheme|display|left|top|width|maxHeight|background)/, "DOM style mutations should stay visible in the compatibility inventory");

console.log("Browser security headers regression passed.");

/** @param {string[] | string | undefined} trustedProxies @param {string} requestPath @param {Record<string, string>} [headers] @param {{ attachmentSandbox?: boolean }} [options] @returns {Promise<import("../../test-support/http-fixture-contracts.mjs").HttpFixtureStatusCodeResponseBase>} */
async function probeRequest(trustedProxies, requestPath, headers = {}, options = {}) {
  const app = express();
  configureTrustedProxy(app, /** @type {readonly string[] | undefined} */ (trustedProxies));
  app.use(attachRequestContext);
  app.use(createTransportSecurityMiddleware({ hsts: { enabled: true, maxAgeSeconds: 300 } }));
  app.get("/{*browserPath}", /** @type {import("../../../src/types/route-contracts.js").AsyncRouteHandler} */ ((request, response) => {
    if (options.attachmentSandbox) {
      response.setHeader("Content-Security-Policy", "sandbox");
    }
    response.status(200).send("ok");
  }));

  /** @type {import("../../test-support/http-fixture-contracts.mjs").HttpFixtureServer} */
  const server = await new Promise((resolve) => {
    const listener = app.listen(0, "127.0.0.1", () => resolve(listener));
  });

  try {
    return await sendRequest(/** @type {import("node:net").AddressInfo} */ (server.address()).port, requestPath, headers);
  } finally {
    await /** @type {Promise<void>} */ (new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())));
  }
}

async function readBrowserJavaScript() {
  const files = (await fs.readdir("public/js", { recursive: true }))
    .filter((filePath) => filePath.endsWith(".js"));
  return (await Promise.all(files.map((filePath) => fs.readFile(`public/js/${filePath}`, "utf8")))).join("\n");
}

/** @param {number} port @param {string} requestPath @param {Record<string, string>} headers @returns {Promise<import("../../test-support/http-fixture-contracts.mjs").HttpFixtureStatusCodeResponseBase>} */
function sendRequest(port, requestPath, headers) {
  return new Promise((resolve, reject) => {
    const request = http.request({ headers, host: "127.0.0.1", method: "GET", path: requestPath, port }, (response) => {
      response.resume();
      response.on("end", () => resolve({ headers: response.headers, statusCode: response.statusCode }));
    });
    request.on("error", reject);
    request.end();
  });
}
