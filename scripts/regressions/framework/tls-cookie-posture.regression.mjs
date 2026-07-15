export const regressionMeta = Object.freeze({
  id: "framework.tls-cookie-posture",
  area: "framework",
  tier: "focused",
  tags: ["cookies", "hsts", "security", "tls"],
  description: "Proves production public URL policy, cookie attributes, trusted effective HTTPS, and HSTS gating fail closed at direct and proxy edges.",
  runMode: "static",
});

import assert from "node:assert/strict";
import http from "node:http";
import express from "express";
import { createConfig } from "../../../src/config.js";
import {
  attachRequestContext,
  configureTrustedProxy,
  getRequestContext,
} from "../../../src/core/request-context.js";
import { createTransportSecurityMiddleware } from "../../../src/core/transport-security.js";
import {
  buildCsrfCookie,
  buildSessionCookie,
  buildThemeAutoSourceCookie,
  buildThemeCookie,
} from "../../../src/security/cookies.js";

const defaults = createConfig({});
assert.equal(defaults.publicUrl, "");
assert.deepEqual(defaults.cookies, {
  csrfName: "lf_csrf",
  domain: "",
  httpOnly: true,
  maxAgeSeconds: 43200,
  path: "/",
  sameSite: "Lax",
  secure: false,
  sessionName: "longtail_forge_session",
  themeAutoSourceName: "lf_theme_auto_source",
  themeName: "lf_theme",
});
assert.deepEqual(defaults.security.hsts, { enabled: false, maxAgeSeconds: 0 });

const production = createConfig({
  LONGTAIL_ENV: "production",
  LONGTAIL_FILE_SCANNER: "clamscan",
  LONGTAIL_PUBLIC_URL: "https://forge.example.test",
  LONGTAIL_SECURE_NOTES_MASTER_KEY: "Production-Secure-Notes-Master-Key-123!",
  LONGTAIL_SESSION_COOKIE_SECURE: "true",
  SUPER_ADMIN_PASSWORD: "Production-Test-Password-123!",
  TRUST_PROXY: "127.0.0.1/32",
});
assert.equal(production.publicUrl, "https://forge.example.test");
assert.deepEqual(production.security.hsts, { enabled: true, maxAgeSeconds: 300 });
assert.deepEqual(production.runtimeWarnings, []);

assert.throws(
  () => createProductionConfig({ LONGTAIL_PUBLIC_URL: "http://forge.example.test" }),
  /must use https in production/,
  "production HTTP should fail without an unmistakable override",
);
assert.throws(
  () => createProductionConfig({ LONGTAIL_PUBLIC_URL: "HTTP://forge.example.test" }),
  /must use https in production/,
  "URL protocol case should not bypass production HTTPS enforcement",
);
const unsafeProduction = createProductionConfig({
  LONGTAIL_PUBLIC_URL: "http://forge.example.test",
  LONGTAIL_UNSAFE_ALLOW_INSECURE_PUBLIC_URL: "true",
});
assert.equal(unsafeProduction.security.allowInsecurePublicUrl, true);
assert.deepEqual(unsafeProduction.runtimeWarnings, [
  "UNSAFE OVERRIDE ACTIVE: production LONGTAIL_PUBLIC_URL uses HTTP and browser sessions are not protected by TLS.",
]);
assert.throws(
  () => createProductionConfig({ LONGTAIL_PUBLIC_URL: "https://forge.example.test" }),
  /TRUST_PROXY must list the TLS reverse proxy/,
  "production HTTPS should fail when the proxy protocol boundary cannot resolve HTTPS",
);
assert.throws(() => createConfig({ LONGTAIL_PUBLIC_URL: "forge.example.test" }), /absolute http or https URL/);
assert.throws(() => createConfig({ LONGTAIL_PUBLIC_URL: "ftp://forge.example.test" }), /absolute http or https URL/);
assert.throws(() => createConfig({ LONGTAIL_PUBLIC_URL: "https://user:secret@forge.example.test" }), /must not include credentials/);
assert.throws(() => createConfig({ LONGTAIL_HSTS_MAX_AGE_SECONDS: "-1" }), /must be at least 0/);
assert.throws(() => createConfig({ LONGTAIL_HSTS_MAX_AGE_SECONDS: "63072001" }), /must be at most 63072000/);

const rollback = createProductionConfig({
  LONGTAIL_HSTS_MAX_AGE_SECONDS: "0",
  LONGTAIL_PUBLIC_URL: "https://forge.example.test",
  LONGTAIL_UNSAFE_ALLOW_HSTS_ROLLBACK: "true",
  TRUST_PROXY: "127.0.0.1/32",
});
assert.deepEqual(rollback.security.hsts, { enabled: true, maxAgeSeconds: 0 });
assert.deepEqual(rollback.runtimeWarnings, ["UNSAFE OVERRIDE ACTIVE: HSTS rollback mode is active; secure responses send max-age=0."]);

const forwardedHeaders = {
  "x-forwarded-for": "203.0.113.11",
  "x-forwarded-host": "forge.example.test",
  "x-forwarded-proto": "https",
};

const directHttp = await probeRequest([], {}, { enabled: true, maxAgeSeconds: 300 });
assert.equal(directHttp.body.protocol, "http");
assert.equal(directHttp.hsts, undefined, "direct HTTP should never receive HSTS");
assertCookiePosture(directHttp.cookies, { secure: false });

const forgedHttps = await probeRequest([], forwardedHeaders, { enabled: true, maxAgeSeconds: 300 });
assert.equal(forgedHttps.body.protocol, "http", "direct mode should ignore forged forwarded HTTPS");
assert.equal(forgedHttps.hsts, undefined, "forged forwarded HTTPS should not enable HSTS");
assertCookiePosture(forgedHttps.cookies, { secure: false });

const untrustedHttps = await probeRequest(["10.0.0.0/8"], forwardedHeaders, { enabled: true, maxAgeSeconds: 300 });
assert.equal(untrustedHttps.body.protocol, "http", "an untrusted peer should not establish HTTPS");
assert.equal(untrustedHttps.hsts, undefined, "an untrusted peer should not enable HSTS");
assertCookiePosture(untrustedHttps.cookies, { secure: false });

const trustedHttps = await probeRequest(["127.0.0.1/32"], forwardedHeaders, { enabled: true, maxAgeSeconds: 300 });
assert.equal(trustedHttps.body.protocol, "https");
assert.equal(trustedHttps.hsts, "max-age=300", "trusted effective HTTPS should enable HSTS");
assertCookiePosture(trustedHttps.cookies, { secure: true });

const trustedRollback = await probeRequest(["127.0.0.1/32"], forwardedHeaders, { enabled: true, maxAgeSeconds: 0 });
assert.equal(trustedRollback.hsts, "max-age=0", "rollback mode should clear HSTS only over trusted HTTPS");

console.log("TLS and cookie posture regression passed.");

function createProductionConfig(overrides = {}) {
  return createConfig({
    LONGTAIL_ENV: "production",
    LONGTAIL_FILE_SCANNER: "clamscan",
    LONGTAIL_SECURE_NOTES_MASTER_KEY: "Production-Secure-Notes-Master-Key-123!",
    LONGTAIL_SESSION_COOKIE_SECURE: "true",
    SUPER_ADMIN_PASSWORD: "Production-Test-Password-123!",
    ...overrides,
  });
}

function assertCookiePosture(cookies, { secure }) {
  assert.equal(cookies.length, 4, "the probe should issue one session, two theme, and one CSRF cookie");
  assert.match(cookies[0], /; Path=\/;/, "the session cookie should be scoped to the app root");
  assert.match(cookies[0], /; HttpOnly;/, "the session cookie should remain HttpOnly");
  assert.match(cookies[0], /; SameSite=Lax/, "the session cookie should use the deliberate Lax default");
  assert.doesNotMatch(cookies[0], /; Domain=/, "the session cookie should remain host-only");
  assert.doesNotMatch(cookies[1], /; HttpOnly/, "the first-paint theme cookie must remain browser-readable");
  assert.doesNotMatch(cookies[2], /; HttpOnly/, "the first-paint theme source cookie must remain browser-readable");
  assert.doesNotMatch(cookies[3], /; HttpOnly/, "the double-submit CSRF cookie must remain browser-readable");

  for (const cookie of cookies) {
    assert.match(cookie, /; Path=\/;/);
    assert.match(cookie, /; SameSite=Lax/);
    assert.doesNotMatch(cookie, /; Domain=/);
    assert.equal(cookie.includes("; Secure"), secure);
  }
}

async function probeRequest(trustedProxies, headers, hsts) {
  const app = express();
  configureTrustedProxy(app, trustedProxies);
  app.use(attachRequestContext);
  app.use(createTransportSecurityMiddleware({ hsts }));
  app.get("/probe", (request, response) => {
    response.setHeader("Set-Cookie", [
      buildSessionCookie("probe-session", 300, request),
      buildThemeCookie("system", request),
      buildThemeAutoSourceCookie("system", request),
      buildCsrfCookie("probe-token", request),
    ]);
    response.json(getRequestContext(request));
  });

  const server = await new Promise((resolve) => {
    const listener = app.listen(0, "127.0.0.1", () => resolve(listener));
  });

  try {
    return await sendRequest(server.address().port, headers);
  } finally {
    await new Promise((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    });
  }
}

function sendRequest(port, headers) {
  return new Promise((resolve, reject) => {
    const request = http.request({
      headers,
      host: "127.0.0.1",
      method: "GET",
      path: "/probe",
      port,
    }, (response) => {
      const chunks = [];
      response.on("data", (chunk) => chunks.push(chunk));
      response.on("end", () => {
        resolve({
          body: JSON.parse(Buffer.concat(chunks).toString("utf8")),
          cookies: response.headers["set-cookie"] || [],
          hsts: response.headers["strict-transport-security"],
        });
      });
    });
    request.on("error", reject);
    request.end();
  });
}
