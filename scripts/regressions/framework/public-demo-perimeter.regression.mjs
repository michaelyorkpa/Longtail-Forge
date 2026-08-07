export const regressionMeta = Object.freeze({
  id: "framework.public-demo-perimeter",
  area: "framework",
  tier: "focused",
  tags: ["authentication", "baseline-bypass", "public-demo", "rate-limit", "security", "trusted-proxy"],
  description: "Proves demo-only global/client/mutation/search limits, NAT fairness, recovery, bounded bodies, trusted edge correlation, generic responses, and redacted evidence.",
  runMode: "isolated-database",
});

import assert from "node:assert/strict";
import http from "node:http";
import express from "express";
import { createDisposableDatabaseFixture } from "../../test-support/disposable-database.mjs";

const databaseFixture = await createDisposableDatabaseFixture("public-demo-perimeter");
const { attachRequestContext, configureTrustedProxy } = await import("../../../src/core/request-context.js");
const { createPublicDemoPerimeterMiddlewares } = await import("../../../src/core/public-demo-perimeter.js");
const { createErrorHandler } = await import("../../../src/middleware/error-handler.js");
const { readJsonBody } = await import("../../../src/utils/http.js");

const DEFAULT_SETTINGS = Object.freeze({
  clientRequestLimit: 20,
  globalRequestLimit: 100,
  maxBodyBytes: 32,
  mutationLimit: 2,
  searchLimit: 2,
  windowSeconds: 1,
});

await assertStandardModeUnchanged();
await assertClientThresholdAndRecovery();
await assertSessionFairMutationLimits();
await assertLoginCannotEvadeIpLimit();
await assertSearchLimit();
await assertForwardingAndCorrelationTrust();
await assertHostnameCannotSplitBucket();
await assertBodyLimitsAndRedaction();

await databaseFixture.cleanup();
console.log("Public demo perimeter regression passed.");

async function assertStandardModeUnchanged() {
  await withServer({ demoEnabled: false, settings: { ...DEFAULT_SETTINGS, clientRequestLimit: 1, globalRequestLimit: 1 } }, async (origin) => {
    const responses = await Promise.all(Array.from({ length: 4 }, () => request(origin, "/api/read")));
    assert.deepEqual(responses.map((item) => item.status), [200, 200, 200, 200]);
  });
}

async function assertClientThresholdAndRecovery() {
  const events = [];
  const logs = [];
  await withServer({
    events,
    logs,
    settings: { ...DEFAULT_SETTINGS, clientRequestLimit: 2 },
    trustedProxies: ["127.0.0.1/32", "::1/128"],
  }, async (origin) => {
    const headers = { "x-forwarded-for": "203.0.113.10" };
    assert.equal((await request(origin, "/api/read", { headers })).status, 200);
    assert.equal((await request(origin, "/api/read", { headers })).status, 200);
    const blocked = await request(origin, "/api/read", { headers });
    assert.equal(blocked.status, 429);
    assert.equal(blocked.body.error.code, "rate_limited");
    assert.equal(blocked.body.error.message, "Too many requests. Try again later.");
    assert.equal(blocked.body.error.requestId, blocked.headers["x-request-id"]);
    assert.equal(events.length, 1, "one threshold crossing should create one security event per key/window");
    assert.equal(logs.length, 1, "one threshold crossing should create one operational warning per key/window");
    assert.equal(events[0].metadata.scope, "client_request");
    assert.equal(events[0].metadata.request_id, blocked.headers["x-request-id"]);
    assert.equal(events[0].metadata.window_seconds, 1);

    await new Promise((resolve) => setTimeout(resolve, 1100));
    assert.equal((await request(origin, "/api/read", { headers })).status, 200, "the fixed window should recover without operator action");

    const probes = await Promise.all(Array.from({ length: 5 }, () => request(origin, "/healthz", { headers })));
    assert.deepEqual(probes.map((item) => item.status), [200, 200, 200, 200, 200], "health probes should not consume demo request capacity");
  });
}

async function assertSessionFairMutationLimits() {
  await withServer({ trustedProxies: ["127.0.0.1/32", "::1/128"] }, async (origin) => {
    const common = { "content-type": "application/json", "x-forwarded-for": "198.51.100.20" };
    const sessionA = { ...common, cookie: "longtail_forge_session=shared-session-a" };
    const sessionB = { ...common, cookie: "longtail_forge_session=shared-session-b" };
    const parallel = await Promise.all([
      request(origin, "/api/write", { body: "{}", headers: sessionA, method: "POST" }),
      request(origin, "/api/write", { body: "{}", headers: sessionA, method: "POST" }),
      request(origin, "/api/write", { body: "{}", headers: sessionB, method: "POST" }),
      request(origin, "/api/write", { body: "{}", headers: sessionB, method: "POST" }),
    ]);
    assert.deepEqual(parallel.map((item) => item.status), [200, 200, 200, 200], "parallel shared-IP sessions should receive independent mutation capacity");
    assert.equal((await request(origin, "/api/write", { body: "{}", headers: sessionA, method: "POST" })).status, 429);
    assert.equal((await request(origin, "/api/write", { body: "{}", headers: sessionB, method: "POST" })).status, 429);
  });
}

async function assertLoginCannotEvadeIpLimit() {
  await withServer({ trustedProxies: ["127.0.0.1/32", "::1/128"] }, async (origin) => {
    const common = { "content-type": "application/json", "x-forwarded-for": "198.51.100.21" };
    assert.equal((await request(origin, "/api/login", { body: "{}", headers: { ...common, cookie: "longtail_forge_session=forged-a" }, method: "POST" })).status, 200);
    assert.equal((await request(origin, "/api/login", { body: "{}", headers: { ...common, cookie: "longtail_forge_session=forged-b" }, method: "POST" })).status, 200);
    assert.equal((await request(origin, "/api/login", { body: "{}", headers: { ...common, cookie: "longtail_forge_session=forged-c" }, method: "POST" })).status, 429, "login mutation capacity must stay keyed to trusted client IP");
  });
}

async function assertSearchLimit() {
  await withServer({ trustedProxies: ["127.0.0.1/32", "::1/128"] }, async (origin) => {
    const headers = {
      cookie: "longtail_forge_session=search-session",
      "x-forwarded-for": "192.0.2.30",
    };
    assert.equal((await request(origin, "/api/search?q=first", { headers })).status, 200);
    assert.equal((await request(origin, "/api/search?q=second", { headers })).status, 200);
    assert.equal((await request(origin, "/api/search?q=third", { headers })).status, 429);
  });
}

async function assertForwardingAndCorrelationTrust() {
  const trustedId = "f59e475f-bd7a-4ad4-9a1f-e40db5adab77";
  await withServer({ trustedProxies: [] }, async (origin) => {
    const first = await request(origin, "/api/read", { headers: { "x-forwarded-for": "203.0.113.1", "x-request-id": trustedId } });
    assert.notEqual(first.headers["x-request-id"], trustedId, "a direct client must not control request correlation");
    const second = await request(origin, "/api/read", { headers: { "x-forwarded-for": "203.0.113.2" } });
    assert.equal(second.status, 200);
  });

  await withServer({ trustedProxies: ["127.0.0.1/32", "::1/128"] }, async (origin) => {
    const trusted = await request(origin, "/api/read", { headers: { "x-forwarded-for": "203.0.113.40", "x-request-id": trustedId } });
    assert.equal(trusted.headers["x-request-id"], trustedId, "the configured edge should own the cross-layer request ID");
    const invalid = await request(origin, "/api/read", { headers: { "x-forwarded-for": "203.0.113.41", "x-request-id": "submitted-content" } });
    assert.match(invalid.headers["x-request-id"], /^[0-9a-f-]{36}$/i);
    assert.notEqual(invalid.headers["x-request-id"], "submitted-content");
  });
}

async function assertHostnameCannotSplitBucket() {
  await withServer({
    settings: { ...DEFAULT_SETTINGS, clientRequestLimit: 2 },
    trustedProxies: ["127.0.0.1/32", "::1/128"],
  }, async (origin) => {
    const client = { "x-forwarded-for": "203.0.113.50" };
    assert.equal((await request(origin, "/api/read", { headers: { ...client, host: "demo.example" } })).status, 200);
    assert.equal((await request(origin, "/api/read", { headers: { ...client, host: "alternate.example" } })).status, 200);
    assert.equal(
      (await request(origin, "/api/read", { headers: { ...client, host: "third.example" } })).status,
      429,
      "changing the hostname must not create a fresh client bucket",
    );
  });
}

async function assertBodyLimitsAndRedaction() {
  const events = [];
  const logs = [];
  await withServer({ events, logs }, async (origin) => {
    const oversized = await request(origin, "/api/parse", {
      body: JSON.stringify({ submittedContent: "do-not-log-this-content" }),
      headers: { "content-type": "application/json" },
      method: "POST",
    });
    assert.equal(oversized.status, 413);
    assert.equal(oversized.body.error.code, "payload_too_large");

    const malformed = await request(origin, "/api/parse", {
      body: "{bad-json",
      headers: { "content-type": "application/json" },
      method: "POST",
    });
    assert.equal(malformed.status, 400);
    assert.equal(malformed.body.error.code, "bad_request");

    for (let index = 0; index < 3; index += 1) {
      await request(origin, "/api/write", {
        body: JSON.stringify({ submittedContent: "do-not-log-this-content" }),
        headers: {
          "content-type": "application/json",
          cookie: "longtail_forge_session=do-not-log-this-session",
        },
        method: "POST",
      });
    }
    const serialized = JSON.stringify({ events, logs });
    assert.doesNotMatch(serialized, /do-not-log-this-content/);
    assert.doesNotMatch(serialized, /do-not-log-this-session/);
  });
}

async function withServer(options, run) {
  const events = options.events || [];
  const logs = options.logs || [];
  const app = express();
  configureTrustedProxy(app, options.trustedProxies || []);
  app.use(attachRequestContext);
  app.use(...createPublicDemoPerimeterMiddlewares({
    demoEnabled: options.demoEnabled ?? true,
    logger: { warn: (event, fields) => logs.push({ event, fields }) },
    recordSecurityEvent: async (event) => events.push(event),
    settings: { ...DEFAULT_SETTINGS, ...(options.settings || {}) },
  }));
  app.all("/healthz", (_request, response) => response.status(200).json({ status: "ok" }));
  app.all("/api/parse", async (request, response, next) => {
    try {
      response.status(200).json(await readJsonBody(request));
    } catch (error) {
      next(error);
    }
  });
  app.all("/api/*splat", (_request, response) => response.status(200).json({ ok: true }));
  app.use(createErrorHandler({ logger: { error: () => {} } }));

  const server = await new Promise((resolve) => {
    const listener = app.listen(0, "127.0.0.1", () => resolve(listener));
  });
  try {
    await run(`http://127.0.0.1:${server.address().port}`);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
}

function request(origin, pathName, options = {}) {
  return new Promise((resolve, reject) => {
    const target = new URL(pathName, origin);
    const body = options.body === undefined ? null : String(options.body);
    const headers = { ...(options.headers || {}) };
    if (body !== null && !Object.hasOwn(headers, "content-length")) {
      headers["content-length"] = Buffer.byteLength(body);
    }
    const outgoing = http.request(target, {
      headers,
      method: options.method || "GET",
    }, (response) => {
      const chunks = [];
      response.on("data", (chunk) => chunks.push(chunk));
      response.on("end", () => {
        const text = Buffer.concat(chunks).toString("utf8");
        let parsed = null;
        try { parsed = JSON.parse(text); } catch { parsed = null; }
        resolve({ body: parsed, headers: response.headers, status: response.statusCode, text });
      });
    });
    outgoing.on("error", reject);
    if (body !== null) outgoing.write(body);
    outgoing.end();
  });
}