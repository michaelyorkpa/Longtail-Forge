export const regressionMeta = Object.freeze({
  id: "framework.public-demo-account-catalog",
  area: "framework",
  tier: "integration",
  tags: ["accessibility", "authentication", "browser", "demo", "routes", "security"],
  description: "Proves the six-account public-demo login catalog is safely shaped, demo-only, source-aligned, and excludes Super Admin and internal identity data.",
  runMode: "static",
});

import assert from "node:assert/strict";
import http from "node:http";
import express from "express";
import { createErrorHandler } from "../../../src/middleware/error-handler.js";
import {
  PUBLIC_DEMO_VISITOR_ACCOUNTS,
  PUBLIC_DEMO_VISITOR_PASSWORDS,
  listPublicDemoVisitorAccounts,
} from "../../../src/core/public-demo-visitor-accounts.js";
import {
  PUBLIC_DEMO_TEMPORARY_CHANGES_NOTICE,
  createPublicDemoAccountRoutes,
} from "../../../src/routes/public-demo-account.routes.js";
import { SANITIZED_DEMO_ROLE_FIXTURES } from "../../lib/sanitized-demo-role-fixtures.mjs";

const EXPECTED_ROLES = Object.freeze([
  ["Workspace Administrator", "Northwind Studio workspace"],
  ["Client Administrator", "Cedar & Bloom client"],
  ["Project Administrator", "Website Refresh project"],
  ["Client User", "Cedar & Bloom client"],
  ["Project User", "Website Refresh project"],
  ["Client User (External)", "Cedar & Bloom client"],
]);

const publicAccounts = listPublicDemoVisitorAccounts();
assert.equal(publicAccounts.length, 6);
assert.deepEqual(
  publicAccounts.map((account) => [account.roleName, account.scopeLabel]),
  EXPECTED_ROLES,
);
assert.equal(Object.hasOwn(PUBLIC_DEMO_VISITOR_PASSWORDS, "super_admin"), false);
assert.match(PUBLIC_DEMO_TEMPORARY_CHANGES_NOTICE, /resets every hour.*temporary/i);

for (const account of publicAccounts) {
  assert.deepEqual(Object.keys(account).sort(), [
    "allowedActions",
    "expectedDenials",
    "password",
    "representativeRecords",
    "roleName",
    "scopeLabel",
    "username",
  ]);
  assert.ok(account.username.endsWith("@example.test"));
  assert.ok(account.password.length >= 16);
  assert.ok(account.representativeRecords.length > 0);
  assert.ok(account.allowedActions.length > 0);
  assert.ok(account.expectedDenials.length > 0);
  assert.notEqual(account.roleName, "Super Admin");
  assert.doesNotMatch(JSON.stringify(account), /user_id|role_id|scope_id|workspace_id|client_id|project_id/i);
}

const fixturesByRoleId = new Map(SANITIZED_DEMO_ROLE_FIXTURES.map((fixture) => [fixture.roleId, fixture]));
for (const account of PUBLIC_DEMO_VISITOR_ACCOUNTS) {
  assert.equal(account.username, fixturesByRoleId.get(account.roleId)?.username);
  assert.equal(account.password, PUBLIC_DEMO_VISITOR_PASSWORDS[account.roleId]);
}

const enabled = await serve(createPublicDemoAccountRoutes({ demoEnabled: true }));
try {
  const response = await request(enabled, "/api/public-demo/accounts");
  assert.equal(response.statusCode, 200);
  assert.equal(response.headers["cache-control"], "no-store");
  assert.deepEqual(JSON.parse(response.body), {
    accounts: publicAccounts,
    notice: PUBLIC_DEMO_TEMPORARY_CHANGES_NOTICE,
  });
} finally {
  await close(enabled);
}

const disabled = await serve(createPublicDemoAccountRoutes({ demoEnabled: false }));
try {
  const response = await request(disabled, "/api/public-demo/accounts");
  assert.equal(response.statusCode, 404);
  assert.equal(response.headers["cache-control"], "no-store");
  const body = JSON.parse(response.body);
  assert.equal(body.error.code, "not_found");
  assert.equal(body.error.message, "The requested resource was not found.");
  assert.doesNotMatch(response.body, /role-|password|account|demo/i);
} finally {
  await close(disabled);
}

console.log("Public-demo account catalog regression passed.");

function serve(router) {
  const app = express();
  app.use((request, _response, next) => {
    request.requestContext = { requestId: "catalog-regression-request" };
    next();
  });
  app.use("/api", router);
  app.use(createErrorHandler({ logger: { error() {} } }));
  return new Promise((resolve) => {
    const server = http.createServer(app);
    server.listen(0, "127.0.0.1", () => resolve(server));
  });
}

function request(server, requestPath) {
  return new Promise((resolve, reject) => {
    const outgoing = http.request({
      headers: { Accept: "application/json" },
      host: "127.0.0.1",
      method: "GET",
      path: requestPath,
      port: server.address().port,
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

function close(server) {
  return new Promise((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  });
}
