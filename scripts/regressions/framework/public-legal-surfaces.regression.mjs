export const regressionMeta = Object.freeze({
  id: "framework.public-legal-surfaces",
  area: "framework",
  tier: "integration",
  tags: ["browser", "legal", "licensing", "security"],
  description: "Proves session-less Terms and Privacy routes, neutral defaults, shared security headers, footer links, and runtime-bound Corresponding Source.",
  runMode: "isolated-database",
});

import assert from "node:assert/strict";
import fs from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import path from "node:path";

const fixtureRoot = await fs.mkdtemp(path.join(os.tmpdir(), "ltf-public-legal-"));
process.env.LONGTAIL_ENV = "test";
process.env.LONGTAIL_DATABASE_FILE = path.join(fixtureRoot, "legal.db");
process.env.LONGTAIL_DATA_DIR = fixtureRoot;
process.env.LONGTAIL_LOCAL_STORAGE_ROOT = path.join(fixtureRoot, "files");
process.env.LTF_REGRESSION_DB = "1";

const { createApp } = await import("../../../src/core/app.js");
const { CONTENT_SECURITY_POLICY } = await import("../../../src/core/transport-security.js");

const app = createApp();
const server = await new Promise((resolve) => {
  const listener = app.listen(0, "127.0.0.1", () => resolve(listener));
});

try {
  const terms = await request(server, "/terms.html");
  const privacy = await request(server, "/privacy.html");
  const login = await request(server, "/login.html");
  const protectedHelp = await request(server, "/help.html");
  const appInfo = await request(server, "/api/app-info", { Accept: "application/json" });

  for (const response of [terms, privacy]) {
    assert.equal(response.statusCode, 200);
    assert.equal(response.headers["content-security-policy"], CONTENT_SECURITY_POLICY);
    assert.equal(response.headers["x-frame-options"], "DENY");
    assert.equal(response.headers["x-content-type-options"], "nosniff");
    assert.equal(response.headers["cache-control"], "no-store");
    assert.doesNotMatch(response.body, /longtail_forge_session|workspace_id|user_id/i);
  }

  assert.match(terms.body, /Operator Terms Template/);
  assert.match(terms.body, /not a contract offered by Raymond Tec/);
  assert.match(privacy.body, /Operator Privacy Notice Template/);
  assert.match(privacy.body, /does not make Raymond Tec the data controller/);
  assert.equal(protectedHelp.statusCode, 401, "authenticated surfaces must remain protected");
  assert.equal(login.statusCode, 200);

  const runtimeIdentity = JSON.parse(appInfo.body);
  assert.equal(appInfo.statusCode, 200);
  assert.match(runtimeIdentity.correspondingSourceUrl, new RegExp(`/tree/v${escapeRegExp(runtimeIdentity.canonicalVersion)}$`));
} finally {
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  await fs.rm(fixtureRoot, { recursive: true, force: true });
}

const footerSource = await fs.readFile("public/js/footer.js", "utf8");
assert.match(footerSource, /Licensed under AGPL-3\.0-only/);
assert.match(footerSource, /Corresponding Source for this running version/);
assert.match(footerSource, /termsLink\.href = "\/terms\.html"/);
assert.match(footerSource, /privacyLink\.href = "\/privacy\.html"/);
assert.doesNotMatch(footerSource, /or at your option any later version/);

console.log("Public legal surfaces regression passed.");

function request(listener, requestPath, headers = {}) {
  return new Promise((resolve, reject) => {
    const outgoing = http.request({
      headers,
      host: "127.0.0.1",
      method: "GET",
      path: requestPath,
      port: listener.address().port,
    }, (response) => {
      const chunks = [];
      response.on("data", (chunk) => chunks.push(chunk));
      response.once("error", reject);
      response.once("end", () => resolve({
        body: Buffer.concat(chunks).toString("utf8"),
        headers: response.headers,
        statusCode: response.statusCode,
      }));
    });
    outgoing.once("error", reject);
    outgoing.end();
  });
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
