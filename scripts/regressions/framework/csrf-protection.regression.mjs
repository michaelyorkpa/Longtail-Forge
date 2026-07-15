export const regressionMeta = Object.freeze({
  id: "framework.csrf-protection",
  area: "framework",
  tier: "focused",
  tags: ["authentication", "browser", "csrf", "security"],
  description: "Proves browser mutations share one origin, token, and content-type boundary while bearer API calls remain independent.",
  runMode: "static",
});

import assert from "node:assert/strict";
import fs from "node:fs/promises";
import http from "node:http";
import cookieParser from "cookie-parser";
import express from "express";
import { config } from "../../../src/config.js";
import {
  createCsrfProtectionMiddleware,
  createCsrfToken,
} from "../../../src/core/csrf-protection.js";
import {
  attachRequestContext,
  configureTrustedProxy,
} from "../../../src/core/request-context.js";
import { errorHandler } from "../../../src/middleware/error-handler.js";
import { buildCsrfCookie } from "../../../src/security/cookies.js";

const app = express();
configureTrustedProxy(app, []);
app.use(attachRequestContext);
app.use(cookieParser());
app.use(createCsrfProtectionMiddleware());
app.get("/api/csrf-token", (request, response) => {
  const csrfToken = createCsrfToken();
  response.setHeader("Set-Cookie", buildCsrfCookie(csrfToken, request));
  response.json({ csrfToken });
});
app.use((request, response) => response.status(200).json({ accepted: true }));
app.use(errorHandler);

const server = await new Promise((resolve) => {
  const listener = app.listen(0, "127.0.0.1", () => resolve(listener));
});

try {
  const port = server.address().port;
  const sameOrigin = `http://127.0.0.1:${port}`;
  const tokenResponse = await sendRequest(port, { path: "/api/csrf-token" });
  const csrfToken = tokenResponse.json.csrfToken;
  const csrfCookie = tokenResponse.headers["set-cookie"][0].split(";", 1)[0];
  assert.match(csrfCookie, new RegExp(`^${config.cookies.csrfName}=`), "the public token route should set the shared CSRF cookie");

  await expectStatus(port, 200, {
    body: "{}",
    headers: { "content-type": "application/json", origin: sameOrigin },
    method: "POST",
    path: "/api/login",
  }, "a same-origin JSON mutation should be accepted");
  await expectStatus(port, 200, {
    body: "{}",
    headers: { "content-type": "application/json", referer: `${sameOrigin}/index.html` },
    method: "PATCH",
    path: "/api/tasks/1",
  }, "the exact same-origin Referer fallback should be accepted");
  await expectStatus(port, 403, {
    body: "{}",
    headers: {
      "content-type": "application/json",
      cookie: csrfCookie,
      origin: "https://attacker.example",
      "x-csrf-token": csrfToken,
    },
    method: "POST",
    path: "/api/login",
  }, "a valid token must not rescue a cross-origin request");
  await expectStatus(port, 403, {
    body: "{}",
    headers: { "content-type": "application/json", referer: "https://attacker.example/form" },
    method: "POST",
    path: "/api/login",
  }, "a cross-origin Referer fallback should be rejected");
  await expectStatus(port, 403, {
    body: "{}",
    headers: { "content-type": "application/json", origin: `${sameOrigin}/forged-path` },
    method: "POST",
    path: "/api/login",
  }, "an Origin header containing a path should fail its constrained grammar");
  await expectStatus(port, 403, {
    body: "{}",
    headers: { "content-type": "application/json", "sec-fetch-site": "same-origin", "user-agent": "Mozilla/5.0" },
    method: "POST",
    path: "/api/login",
  }, "a browser request without an origin should require a token");
  await expectStatus(port, 200, {
    body: "{}",
    headers: {
      "content-type": "application/json",
      cookie: csrfCookie,
      "sec-fetch-site": "same-origin",
      "user-agent": "Mozilla/5.0",
      "x-csrf-token": csrfToken,
    },
    method: "POST",
    path: "/api/login",
  }, "a browser request should accept a matching signed double-submit token");
  await expectStatus(port, 403, {
    body: "{}",
    headers: {
      "content-type": "application/json",
      cookie: csrfCookie,
      "sec-fetch-site": "cross-site",
      "user-agent": "Mozilla/5.0",
      "x-csrf-token": csrfToken,
    },
    method: "POST",
    path: "/api/login",
  }, "browser metadata declaring a cross-site request should fail even with a valid token");
  await expectStatus(port, 403, {
    body: "{}",
    headers: { "content-type": "application/json", cookie: csrfCookie, "user-agent": "Mozilla/5.0" },
    method: "POST",
    path: "/api/login",
  }, "a CSRF cookie without its header should be rejected");
  await expectStatus(port, 403, {
    body: "{}",
    headers: { "content-type": "application/json", "user-agent": "Mozilla/5.0", "x-csrf-token": csrfToken },
    method: "POST",
    path: "/api/login",
  }, "a CSRF header without its cookie should be rejected");
  await expectStatus(port, 403, {
    body: "{}",
    headers: { "content-type": "application/json", cookie: `${config.cookies.csrfName}=forged.token`, "user-agent": "Mozilla/5.0", "x-csrf-token": "forged.token" },
    method: "POST",
    path: "/api/login",
  }, "a matching but unsigned token pair should be rejected");
  await expectStatus(port, 403, {
    body: "{}",
    headers: {
      "content-type": "application/json",
      origin: "https://forge.example.test",
      "x-forwarded-host": "forge.example.test",
      "x-forwarded-proto": "https",
    },
    method: "POST",
    path: "/api/login",
  }, "untrusted forwarding headers must not forge the allowed request origin");

  for (const contentType of ["text/plain", "application/x-www-form-urlencoded", "multipart/form-data; boundary=probe"]) {
    await expectStatus(port, 415, {
      body: "probe",
      headers: { "content-type": contentType, origin: sameOrigin },
      method: "POST",
      path: "/api/login",
    }, `${contentType} should be rejected on a JSON route`);
  }
  await expectStatus(port, 200, {
    body: "--probe--",
    headers: { "content-type": "multipart/form-data; boundary=probe", origin: sameOrigin },
    method: "POST",
    path: "/api/files/upload/batch",
  }, "the explicit Files upload boundary should retain multipart support");
  await expectStatus(port, 200, {
    headers: { cookie: csrfCookie, "sec-fetch-site": "same-origin", "user-agent": "Mozilla/5.0", "x-csrf-token": csrfToken },
    method: "POST",
    path: "/api/logout",
  }, "an empty-body action should be accepted with browser CSRF proof");
  await expectStatus(port, 200, {
    body: "{}",
    headers: { "content-type": "application/json", origin: "https://api-client.example" },
    method: "POST",
    path: "/api/v1/tasks",
  }, "bearer-token public API routes should remain outside cookie CSRF enforcement");

  const [appSource, authRoutesSource, themeInitSource] = await Promise.all([
    fs.readFile("src/core/app.js", "utf8"),
    fs.readFile("src/routes/auth.routes.js", "utf8"),
    fs.readFile("public/js/theme-init.js", "utf8"),
  ]);
  assert.ok(
    appSource.indexOf("app.use(createCsrfProtectionMiddleware())") < appSource.indexOf("app.use(express.static(config.publicDir))"),
    "the shared boundary should run before every public and authenticated browser route",
  );
  assert.match(authRoutesSource, /authRoutes\.get\("\/csrf-token"/, "the browser should have a public token bootstrap route");
  assert.match(themeInitSource, /headers\.set\(CSRF_HEADER_NAME, csrfToken\)/, "the early browser bootstrap should protect every later fetch caller");
  assert.match(themeInitSource, /!url\.pathname\.startsWith\("\/api\/v1\/"\)/, "the browser wrapper should leave bearer API routes independent");
} finally {
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
}

console.log("CSRF protection regression passed.");

async function expectStatus(port, expectedStatus, options, message) {
  const response = await sendRequest(port, options);
  assert.equal(response.statusCode, expectedStatus, `${message}: ${JSON.stringify(response.json)}`);
}

function sendRequest(port, options = {}) {
  return new Promise((resolve, reject) => {
    const body = options.body === undefined ? null : Buffer.from(options.body);
    const headers = { ...(options.headers || {}) };
    if (body && headers["content-length"] === undefined) {
      headers["content-length"] = String(body.length);
    }
    const request = http.request({
      headers,
      host: "127.0.0.1",
      method: options.method || "GET",
      path: options.path || "/",
      port,
    }, (response) => {
      const chunks = [];
      response.on("data", (chunk) => chunks.push(chunk));
      response.on("end", () => {
        const text = Buffer.concat(chunks).toString("utf8");
        resolve({
          headers: response.headers,
          json: text ? JSON.parse(text) : null,
          statusCode: response.statusCode,
        });
      });
    });
    request.on("error", reject);
    request.end(body);
  });
}
