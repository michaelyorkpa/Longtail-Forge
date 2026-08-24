export const regressionMeta = Object.freeze({
  id: "framework.trusted-proxy-request-context",
  area: "framework",
  tier: "focused",
  tags: ["authentication", "cookies", "deployment", "proxy", "security"],
  description: "Proves request context rejects forged forwarding headers, trusts only configured peers, and requires multi-proxy chains to collapse before Node.",
  runMode: "static",
});

import assert from "node:assert/strict";
import { readPayload } from "../../test-support/http-payload-assertions.mjs";
import fs from "node:fs/promises";
import http from "node:http";
import express from "express";
import { createConfig } from "../../../src/config.js";
import {
  attachRequestContext,
  configureTrustedProxy,
  getRequestContext,
} from "../../../src/core/request-context.js";
import {
  buildSessionCookie,
  buildThemeAutoSourceCookie,
  buildThemeCookie,
} from "../../../src/security/cookies.js";

const directConfig = createConfig({ TRUST_PROXY: "false" });
assert.deepEqual(directConfig.security.trustedProxies, [], "proxy trust should be off by default/direct mode");

const proxyConfig = createConfig({ TRUST_PROXY: "127.0.0.1/32, ::1/128" });
assert.deepEqual(
  proxyConfig.security.trustedProxies,
  ["127.0.0.1/32", "::1/128"],
  "explicit proxy IP/CIDR entries should be normalized into framework config",
);
assert.throws(
  () => createConfig({ TRUST_PROXY: "true" }),
  /blanket trust is not allowed/,
  "blanket proxy trust should fail closed",
);
assert.throws(
  () => createConfig({ TRUST_PROXY: "proxy.internal" }),
  /IP addresses or CIDR ranges/,
  "proxy hostnames should not create a drift-prone trust boundary",
);
assert.throws(
  () => createConfig({ TRUST_PROXY: "10.0.0.0/33" }),
  /IP addresses or CIDR ranges/,
  "invalid proxy CIDR ranges should fail closed",
);

const edgeRequestId = "f59e475f-bd7a-4ad4-9a1f-e40db5adab77";
const forwardedHeaders = {
  "x-request-id": edgeRequestId,
  "x-forwarded-for": "203.0.113.7",
  "x-forwarded-host": "forge.example.test",
  "x-forwarded-proto": "https",
};

const direct = await probeRequest([], forwardedHeaders);
const directContext = readPayload(direct, ["hostname", "ipAddress", "protocol", "requestId"], "direct request context");
assert.equal(directContext.ipAddress, "127.0.0.1", "direct mode should use the socket peer IP");
assert.equal(directContext.protocol, "http", "direct mode should ignore forged forwarded protocol");
assert.equal(directContext.hostname, "127.0.0.1", "direct mode should ignore forged forwarded host");
assert.notEqual(directContext.requestId, edgeRequestId, "direct mode should ignore a client-supplied request ID");
assert.ok(direct.cookies.every((cookie) => !cookie.includes("; Secure")), "direct HTTP cookies should not claim Secure");

const untrusted = await probeRequest(["10.0.0.0/8"], forwardedHeaders);
const untrustedContext = readPayload(untrusted, ["hostname", "ipAddress", "protocol", "requestId"], "untrusted peer request context");
assert.equal(untrustedContext.ipAddress, "127.0.0.1", "an untrusted peer should not control the resolved client IP");
assert.equal(untrustedContext.protocol, "http", "an untrusted peer should not control effective protocol");
assert.equal(untrustedContext.hostname, "127.0.0.1", "an untrusted peer should not control effective host");

const trusted = await probeRequest(["127.0.0.1/32"], forwardedHeaders);
const trustedContext = readPayload(trusted, ["hostname", "ipAddress", "protocol", "requestId"], "trusted proxy request context");
assert.equal(trustedContext.ipAddress, "203.0.113.7", "a configured trusted proxy should supply the client IP");
assert.equal(trustedContext.protocol, "https", "a configured trusted proxy should supply effective HTTPS");
assert.equal(trustedContext.hostname, "forge.example.test", "a configured trusted proxy should supply the public host");
assert.equal(trustedContext.requestId, edgeRequestId, "the configured edge should own the cross-layer request ID");
assert.ok(trusted.cookies.length === 3, "the probe should issue session and theme cookies");
assert.ok(trusted.cookies.every((cookie) => cookie.includes("; Secure")), "effective HTTPS should secure every session/theme cookie");

const malformedEdgeId = await probeRequest(["127.0.0.1/32"], { ...forwardedHeaders, "x-request-id": "not-a-uuid" });
assert.notEqual(readPayload(malformedEdgeId, ["requestId"], "malformed edge request ID probe").requestId, "not-a-uuid", "a trusted edge must still supply a valid UUID");

const uncollapsedMultiProxy = await probeRequest(["127.0.0.1/32"], {
  ...forwardedHeaders,
  "x-forwarded-for": "203.0.113.7, 10.57.67.1",
});
assert.equal(
  readPayload(uncollapsedMultiProxy, ["ipAddress"], "uncollapsed multi-proxy chain probe").ipAddress,
  "10.57.67.1",
  "Node should stop at its immediate trusted Caddy peer unless Caddy collapses the reviewed outer-proxy chain",
);

const sourceFiles = (await fs.readdir("src", { recursive: true }))
  .filter((filePath) => filePath.endsWith(".js"));
for (const filePath of sourceFiles) {
  const relativePath = `src/${filePath.replaceAll("\\", "/")}`;
  const source = await fs.readFile(relativePath, "utf8");

  if (relativePath !== "src/core/request-context.js") {
    assert.doesNotMatch(source, /\b(?:request|req)\.ip\b/, `${relativePath} should consume the shared request context instead of request.ip`);
    assert.doesNotMatch(source, /x-forwarded-(?:for|host|proto)/i, `${relativePath} should not parse forwarding headers directly`);
  }
}

console.log("Trusted proxy request context regression passed.");

// The probe route's body arrives as parsed JSON, so it is published as
// `unknown` and narrowed where it is read. The previous ProbeRequestContext
// annotation on this member was a claim nothing checked.
/** @typedef {{ body: unknown, cookies: string[] }} ProbeResponse */
/** @param {readonly string[] | undefined} trustedProxies @param {Record<string, string>} headers @returns {Promise<ProbeResponse>} */
async function probeRequest(trustedProxies, headers) {
  const app = express();
  configureTrustedProxy(app, trustedProxies);
  app.use(attachRequestContext);
  app.get("/probe", /** @type {import("../../../src/types/route-contracts.js").AsyncRouteHandler} */ ((request, response) => {
    const context = getRequestContext(request);
    response.setHeader("Set-Cookie", [
      buildSessionCookie("probe-session", 300, request),
      buildThemeCookie("system", request),
      buildThemeAutoSourceCookie("system", request),
    ]);
    response.json(context);
  }));

  /** @type {import("../../test-support/http-fixture-contracts.mjs").HttpFixtureServer} */
  const server = await new Promise((resolve) => {
    const listener = app.listen(0, "127.0.0.1", () => resolve(listener));
  });

  try {
    const address = /** @type {import("node:net").AddressInfo} */ (server.address());
    return await sendRequest(address.port, headers);
  } finally {
    await /** @type {Promise<void>} */ (new Promise((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    }));
  }
}

/** @param {number} port @param {Record<string, string>} headers @returns {Promise<ProbeResponse>} */
function sendRequest(port, headers) {
  return new Promise((resolve, reject) => {
    const request = http.request({
      headers,
      host: "127.0.0.1",
      method: "GET",
      path: "/probe",
      port,
    }, (response) => {
      /** @type {Buffer[]} */
      const chunks = [];
      response.on("data", (chunk) => chunks.push(chunk));
      response.on("end", () => {
        resolve({
          body: /** @type {unknown} */ (JSON.parse(Buffer.concat(chunks).toString("utf8"))),
          cookies: response.headers["set-cookie"] || [],
        });
      });
    });
    request.on("error", reject);
    request.end();
  });
}
