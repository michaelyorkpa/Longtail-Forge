export const regressionMeta = Object.freeze({
  id: "framework.browser-recovery-boundary",
  area: "framework",
  tier: "release-gate",
  tags: ["accessibility", "browser", "errors", "modal", "recovery", "security"],
  description: "Proves self-contained branded browser failures, client crash recovery, and mutation-only permission-denied presentation.",
  runMode: "static",
});

import assert from "node:assert/strict";
import fs from "node:fs/promises";
import http from "node:http";
import express from "express";
import { attachRequestContext } from "../../../src/core/request-context.js";
import { createTransportSecurityMiddleware } from "../../../src/core/transport-security.js";
import { sendBrowserError } from "../../../src/core/http-error-contract.js";
import { createErrorHandler } from "../../../src/middleware/error-handler.js";
import { AppError } from "../../../src/utils/app-error.js";

/**
 * The framework route-handler contract. `express().get()` accepts unknown
 * handlers, so each fixture route is cast to this shape to receive the
 * framework request and response types rather than implicit parameters.
 * @typedef {import("../../../src/types/route-contracts.js").AsyncRouteHandler} RouteHandler
 */
/** One captured fixture response: the recovery page and the status that produced it. */
/** @typedef {{ headers: import("node:http").IncomingHttpHeaders, status: number | undefined, text: string }} RecoveryResponse */

const browserRecoverySource = await fs.readFile("public/js/shared/browser-recovery.js", "utf8");
const staticServiceSource = await fs.readFile("src/services/static.service.js", "utf8");
const requireAuthSource = await fs.readFile("src/middleware/require-auth.js", "utf8");

assert.match(
  staticServiceSource,
  /<head\\b[\s\S]*\/js\/shared\/error-contract\.js[\s\S]*\/js\/shared\/browser-recovery\.js/,
  "every served HTML document should install the parser and recovery boundary before declared page assets",
);
assert.match(
  requireAuthSource,
  /isBrowserDocumentRequest\(request\)[\s\S]*sendBrowserError\(request, response,[\s\S]*statusCode:\s*401/,
  "direct protected navigation should use the branded login-required surface",
);
assert.match(browserRecoverySource, /addEventListener\("error", handleWindowError, true\)/);
assert.match(browserRecoverySource, /addEventListener\("unhandledrejection", handleUnhandledRejection\)/);
assert.match(
  browserRecoverySource,
  /response\?\.status === 403[\s\S]*isAppApiRequest\(input\)[\s\S]*isMutationMethod\(requestMethod\(input, init\)\)/,
  "only same-origin API action failures should trigger the permission dialog",
);
assert.match(
  browserRecoverySource,
  /dialog\.dataset\.frameworkPermissionDenied[\s\S]*role", "alertdialog"[\s\S]*aria-live", "assertive"/,
  "permission failures should use one assertive accessible dialog",
);
assert.match(
  browserRecoverySource,
  /const trigger = document\.activeElement[\s\S]*trigger\?\.isConnected[\s\S]*trigger\.focus\(\)/,
  "closing the permission dialog should return focus to the attempted action",
);
assert.match(
  browserRecoverySource,
  /document\.body\.replaceChildren\(main\)[\s\S]*heading\.focus\(\)/,
  "fatal rendering failures should replace broken content and focus the announced recovery heading",
);
assert.match(
  browserRecoverySource,
  /html\[data-theme="dark"\] \.framework-recovery-body[\s\S]*html\[data-theme-mode="auto"\] \.framework-recovery-body/,
  "client recovery should use the explicit interface theme and reserve the system color scheme for Auto",
);
assert.doesNotMatch(browserRecoverySource, /location\.reload\(|setInterval\(/, "recovery must never replay work automatically");

const app = express();
app.use(attachRequestContext);
app.use(createTransportSecurityMiddleware());
app.get("/login-required.html", /** @type {RouteHandler} */ ((request, response) => {
  sendBrowserError(request, response, { statusCode: 401 });
}));
app.get("/forbidden.html", /** @type {RouteHandler} */ ((request, response) => {
  sendBrowserError(request, response, {
    message: "Secret forbidden record title.",
    statusCode: 403,
  });
}));
app.get("/missing.html", /** @type {RouteHandler} */ ((request, response) => {
  sendBrowserError(request, response, {
    message: "Secret missing record title.",
    statusCode: 404,
  });
}));
app.get("/conflict.html", /** @type {RouteHandler} */ ((_request, _response) => {
  throw new AppError("This read changed.", 409);
}));
app.get("/dependency.html", /** @type {RouteHandler} */ ((_request, _response) => {
  throw new AppError("The database is temporarily unavailable. Try again.", 503, {
    code: "service_unavailable",
    expose: true,
  });
}));
app.get("/unexpected.html", () => {
  throw new Error("secret database path C:\\private\\database.sqlite");
});
app.use(createErrorHandler({
  logger: {
    error() {},
  },
}));

const server = await listen(app);
try {
  const login = await request(server, "/login-required.html");
  assert.equal(login.status, 401);
  assert.match(login.text, /data-recovery-kind="login-required"/);
  assert.match(login.text, /href="\/login\.html" autofocus>Sign in<\/a>/);

  const lightTheme = await request(server, "/login-required.html", {
    Cookie: "lf_theme=light; lf_theme_auto_source=system",
  });
  assert.match(lightTheme.text, /<html lang="en" data-theme-mode="light" data-theme-auto-source="system" data-theme="light">/);
  assert.match(lightTheme.text, /html\[data-theme="dark"\] body/);
  assert.match(lightTheme.text, /html\[data-theme-mode="auto"\] body/);
  assert.doesNotMatch(lightTheme.text, /@media \(prefers-color-scheme: dark\) \{\s*body/);

  const darkTheme = await request(server, "/login-required.html", {
    Cookie: "lf_theme=dark; lf_theme_auto_source=system",
  });
  assert.match(darkTheme.text, /<html lang="en" data-theme-mode="dark" data-theme-auto-source="system" data-theme="dark">/);

  const forbidden = await request(server, "/forbidden.html");
  const missing = await request(server, "/missing.html");
  assert.equal(forbidden.status, 403);
  assert.equal(missing.status, 404);
  assert.equal(forbidden.text, missing.text, "403 and 404 browser bodies should remain indistinguishable");
  assert.match(forbidden.text, /data-error-code="unavailable"/);
  assert.doesNotMatch(forbidden.text, /secret|forbidden record|missing record/i);

  const conflict = await request(server, "/conflict.html");
  assert.equal(conflict.status, 409);
  assert.match(conflict.text, /data-recovery-kind="conflict"/);
  assert.match(conflict.text, /href="\/conflict\.html" autofocus>Reload page<\/a>/);

  const dependency = await request(server, "/dependency.html");
  assert.equal(dependency.status, 503);
  assert.equal(dependency.headers["retry-after"], "30");
  assert.match(dependency.text, /data-recovery-kind="dependency-unavailable"/);
  assert.match(dependency.text, /The database is temporarily unavailable\. Try again\./);
  assert.match(dependency.text, /href="\/dependency\.html" autofocus>Try again<\/a>/);

  const unexpected = await request(server, "/unexpected.html");
  assert.equal(unexpected.status, 500);
  assert.match(unexpected.text, /data-recovery-kind="unexpected"/);
  // Single-value headers, cast rather than narrowed so the read stays exactly as
  // permissive as it is today; see the 0.33.33.30.2 note on this correlation check.
  assert.match(unexpected.text, new RegExp(/** @type {string} */ (unexpected.headers["x-request-id"])));
  assert.doesNotMatch(unexpected.text, /secret|database\.sqlite|private/i);

  for (const response of [login, forbidden, missing, conflict, dependency, unexpected]) {
    assert.equal(response.headers["cache-control"], "no-store");
    assert.match(/** @type {string} */ (response.headers["content-security-policy"]), /default-src 'self'/);
    assert.match(response.text, /role="alert" aria-live="assertive" aria-atomic="true"/);
    assert.match(response.text, /@media \(prefers-color-scheme: dark\)/);
    assert.doesNotMatch(response.text, /<script\b|<link\b/i, "server fallback should not require optional application assets");
    assert.equal((response.text.match(/class="error-page-action"/g) || []).length, 1);
  }
} finally {
  await closeServer(server);
}

console.log("Browser recovery boundary regression passed.");

/** @param {import("express").Application} appInstance @returns {Promise<import("node:http").Server>} */
function listen(appInstance) {
  return new Promise((resolve) => {
    const nextServer = appInstance.listen(0, "127.0.0.1", () => resolve(nextServer));
  });
}

/** @param {import("node:http").Server} serverInstance @returns {Promise<void>} */
function closeServer(serverInstance) {
  return new Promise((resolve, reject) => {
    serverInstance.close((error) => error ? reject(error) : resolve());
  });
}

/** @param {import("node:http").Server} serverInstance @param {string} requestPath @param {Record<string, string>} [headers] @returns {Promise<RecoveryResponse>} */
function request(serverInstance, requestPath, headers = {}) {
  return new Promise((resolve, reject) => {
    const nextRequest = http.request({
      headers: { Accept: "text/html", ...headers },
      host: "127.0.0.1",
      method: "GET",
      path: requestPath,
      port: /** @type {import("node:net").AddressInfo} */ (serverInstance.address()).port,
    }, (response) => {
      /** @type {Buffer[]} */
      const chunks = [];
      response.on("data", (chunk) => chunks.push(chunk));
      response.on("end", () => resolve({
        headers: response.headers,
        status: response.statusCode,
        text: Buffer.concat(chunks).toString("utf8"),
      }));
    });
    nextRequest.on("error", reject);
    nextRequest.end();
  });
}
