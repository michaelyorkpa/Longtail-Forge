import assert from "node:assert/strict";
import http from "node:http";
import { performance } from "node:perf_hooks";
import express from "express";
import { createPublicDemoPerimeterMiddlewares } from "../src/core/public-demo-perimeter.js";
import { attachRequestContext, configureTrustedProxy } from "../src/core/request-context.js";

const settings = Object.freeze({
  clientRequestLimit: 600,
  globalRequestLimit: 2400,
  maxBodyBytes: 128 * 1024,
  mutationLimit: 120,
  searchLimit: 60,
  windowSeconds: 60,
});
const results = [];

await runScenario("client_request", async (origin, send) => {
  const headers = { "x-forwarded-for": "203.0.113.10" };
  await assertBoundary(send, origin, "/api/read", settings.clientRequestLimit, { headers });
});

await runScenario("global_request", async (origin, send) => {
  for (let index = 0; index < settings.globalRequestLimit; index += 1) {
    const response = await send(origin, "/api/read", {
      headers: { "x-forwarded-for": `198.51.100.${1 + (index % 5)}` },
    });
    assert.equal(response.status, 200);
  }
  assert.equal((await send(origin, "/api/read", { headers: { "x-forwarded-for": "198.51.100.9" } })).status, 429);
});

await runScenario("shared_nat_fairness", async (origin, send) => {
  const responses = await Promise.all(Array.from({ length: 6 }, (_, accountIndex) => (
    Array.from({ length: 10 }, () => send(origin, "/api/write", {
      body: "{}",
      headers: {
        cookie: `longtail_forge_session=visitor-${accountIndex + 1}`,
        "content-type": "application/json",
        "x-forwarded-for": "192.0.2.25",
      },
      method: "POST",
    }))
  )).flat());
  assert.equal(responses.every((response) => response.status === 200), true);
});

await runScenario("mutation", async (origin, send) => {
  await assertBoundary(send, origin, "/api/write", settings.mutationLimit, {
    body: "{}",
    headers: {
      cookie: "longtail_forge_session=mutation-probe",
      "content-type": "application/json",
      "x-forwarded-for": "192.0.2.26",
    },
    method: "POST",
  });
});

await runScenario("search", async (origin, send) => {
  await assertBoundary(send, origin, "/api/search?q=bounded", settings.searchLimit, {
    headers: {
      cookie: "longtail_forge_session=search-probe",
      "x-forwarded-for": "192.0.2.27",
    },
  });
});

console.log(JSON.stringify({
  contract: "longtail-forge-public-demo-perimeter-load-v1",
  results,
  settings,
}, null, 2));

async function assertBoundary(send, origin, pathName, limit, options) {
  for (let index = 0; index < limit; index += 1) {
    assert.equal((await send(origin, pathName, options)).status, 200);
  }
  assert.equal((await send(origin, pathName, options)).status, 429);
}

async function runScenario(name, probe) {
  const app = express();
  configureTrustedProxy(app, ["127.0.0.1/32", "::1/128"]);
  app.use(attachRequestContext);
  app.use(...createPublicDemoPerimeterMiddlewares({
    demoEnabled: true,
    logger: { warn: () => {} },
    recordSecurityEvent: async () => null,
    settings,
  }));
  app.all("/api/*splat", (_request, response) => response.status(200).json({ ok: true }));
  const server = await new Promise((resolve) => {
    const listener = app.listen(0, "127.0.0.1", () => resolve(listener));
  });
  const agent = new http.Agent({ keepAlive: true, maxSockets: 24 });
  const latencies = [];
  const send = async (...args) => {
    const started = performance.now();
    const response = await request(agent, ...args);
    latencies.push(performance.now() - started);
    return response;
  };
  try {
    await probe(`http://127.0.0.1:${server.address().port}`, send);
    latencies.sort((left, right) => left - right);
    results.push({
      name,
      requests: latencies.length,
      p95Milliseconds: Number(latencies[Math.max(0, Math.ceil(latencies.length * 0.95) - 1)].toFixed(2)),
      status: "passed",
    });
  } finally {
    agent.destroy();
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
}

function request(agent, origin, pathName, options = {}) {
  return new Promise((resolve, reject) => {
    const body = options.body === undefined ? null : String(options.body);
    const headers = { ...(options.headers || {}) };
    if (body !== null) headers["content-length"] = Buffer.byteLength(body);
    const outgoing = http.request(new URL(pathName, origin), {
      agent,
      headers,
      method: options.method || "GET",
    }, (response) => {
      response.resume();
      response.on("end", () => resolve({ status: response.statusCode }));
    });
    outgoing.on("error", reject);
    if (body !== null) outgoing.write(body);
    outgoing.end();
  });
}