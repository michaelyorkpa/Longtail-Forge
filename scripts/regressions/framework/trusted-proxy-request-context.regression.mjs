export const regressionMeta = Object.freeze({
  id: "framework.trusted-proxy-request-context",
  area: "framework",
  tier: "focused",
  tags: ["authentication", "cookies", "deployment", "proxy", "security"],
  description: "Proves request context rejects forged forwarding headers, trusts only configured peers, and requires multi-proxy chains to collapse before Node.",
  runMode: "static",
});

import assert from "node:assert/strict";
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
assert.equal(direct.body.ipAddress, "127.0.0.1", "direct mode should use the socket peer IP");
assert.equal(direct.body.protocol, "http", "direct mode should ignore forged forwarded protocol");
assert.equal(direct.body.hostname, "127.0.0.1", "direct mode should ignore forged forwarded host");
assert.notEqual(direct.body.requestId, edgeRequestId, "direct mode should ignore a client-supplied request ID");
assert.ok(direct.cookies.every((cookie) => !cookie.includes("; Secure")), "direct HTTP cookies should not claim Secure");

const untrusted = await probeRequest(["10.0.0.0/8"], forwardedHeaders);
assert.equal(untrusted.body.ipAddress, "127.0.0.1", "an untrusted peer should not control the resolved client IP");
assert.equal(untrusted.body.protocol, "http", "an untrusted peer should not control effective protocol");
assert.equal(untrusted.body.hostname, "127.0.0.1", "an untrusted peer should not control effective host");

const trusted = await probeRequest(["127.0.0.1/32"], forwardedHeaders);
assert.equal(trusted.body.ipAddress, "203.0.113.7", "a configured trusted proxy should supply the client IP");
assert.equal(trusted.body.protocol, "https", "a configured trusted proxy should supply effective HTTPS");
assert.equal(trusted.body.hostname, "forge.example.test", "a configured trusted proxy should supply the public host");
assert.equal(trusted.body.requestId, edgeRequestId, "the configured edge should own the cross-layer request ID");
assert.ok(trusted.cookies.length === 3, "the probe should issue session and theme cookies");
assert.ok(trusted.cookies.every((cookie) => cookie.includes("; Secure")), "effective HTTPS should secure every session/theme cookie");

const malformedEdgeId = await probeRequest(["127.0.0.1/32"], { ...forwardedHeaders, "x-request-id": "not-a-uuid" });
assert.notEqual(malformedEdgeId.body.requestId, "not-a-uuid", "a trusted edge must still supply a valid UUID");

const uncollapsedMultiProxy = await probeRequest(["127.0.0.1/32"], {
  ...forwardedHeaders,
  "x-forwarded-for": "203.0.113.7, 10.57.67.1",
});
assert.equal(
  uncollapsedMultiProxy.body.ipAddress,
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

/** @typedef {{ hostname: string, ipAddress: string, protocol: string, requestId: string }} ProbeRequestContext */
/** @typedef {{ body: ProbeRequestContext, cookies: string[] }} ProbeResponse */
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
          body: JSON.parse(Buffer.concat(chunks).toString("utf8")),
          cookies: response.headers["set-cookie"] || [],
        });
      });
    });
    request.on("error", reject);
    request.end();
  });
}
