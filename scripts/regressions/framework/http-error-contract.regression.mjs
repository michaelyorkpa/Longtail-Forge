export const regressionMeta = Object.freeze({
  id: "framework.http-error-contract",
  area: "framework",
  tier: "release-gate",
  tags: ["api", "errors", "http", "logging", "routing", "security"],
  description: "Proves internal and v1 API envelopes, request correlation, safe diagnostics, browser HTML classification, and final route ordering.",
  runMode: "static",
});

import assert from "node:assert/strict";
import fs from "node:fs/promises";
import http from "node:http";
import { PassThrough } from "node:stream";
import vm from "node:vm";
import express from "express";
import { apiRouteBoundary, browserNotFound } from "../../../src/core/http-error-contract.js";
import { createErrorHandler } from "../../../src/middleware/error-handler.js";
import { attachRequestContext } from "../../../src/core/request-context.js";
import { AppError } from "../../../src/utils/app-error.js";
import {
  apiKeyAsyncRoute,
  authenticatedAsyncRoute,
  readJsonObjectBody,
  workspaceAsyncRoute,
} from "../../../src/utils/http.js";

const appSource = await fs.readFile("src/core/app.js", "utf8");
assertOrdered(appSource, [
  'app.use("/api/v1", apiRouteBoundary)',
  "app.use(requireAuth)",
  'app.use("/api", apiRouteBoundary)',
  "app.use(staticRoutes)",
  "app.use(browserNotFound)",
  "app.use(errorHandler)",
]);
const staticServiceSource = await fs.readFile("src/services/static.service.js", "utf8");
assert.match(
  staticServiceSource,
  /injectErrorBoundaryScripts\(contents\)[\s\S]*\/js\/shared\/error-contract\.js/,
  "served HTML should install the shared browser error parser before page callers run",
);
await assertBrowserApiContract();
await assertCheckedRouteBoundaries();
assertHeadersAlreadySentPassThrough();

const diagnostics = [];
const logger = {
  error(event, fields) {
    diagnostics.push({ event, fields });
  },
};
const app = express();
app.use(attachRequestContext);
app.use(express.json());
app.get("/api/conflict", () => {
  throw new AppError("The record changed before it could be saved.", 409);
});
app.get("/api/hidden-forbidden", () => {
  throw new AppError("The requested resource is unavailable.", 403);
});
app.get("/api/hidden-missing", () => {
  throw new AppError("The requested resource is unavailable.", 404);
});
app.get("/api/dependency", () => {
  throw new AppError("Try again after the dependency recovers.", 503, {
    code: "service_unavailable",
    expose: true,
  });
});
app.post("/api/unexpected", (request) => {
  request.session = {
    user_id: "raw-protected-user-id",
    workspace_id: "raw-protected-workspace-id",
  };
  throw new Error(
    "exception-secret SELECT * FROM users C:\\protected\\database.sqlite password=credential-secret raw-protected-record-id",
  );
});
app.get("/api/unknown-thrown", () => {
  throw "unknown-thrown-secret raw-unknown-record-id";
});
app.get("/api/v1/conflict", () => {
  throw new AppError("The record changed before it could be saved.", 409);
});
app.get("/browser-error.html", () => {
  throw new Error(
    "browser-secret SELECT * FROM notes D:\\private\\notes.sqlite bearer=browser-credential raw-browser-record-id",
  );
});
app.use("/api", apiRouteBoundary);
app.use(browserNotFound);
app.use(createErrorHandler({ logger }));

const server = await listen(app);
try {
  const conflict = await request(server, "/api/conflict", {
    headers: { Accept: "text/html" },
  });
  assert.equal(conflict.status, 409);
  assert.match(conflict.headers["content-type"], /^application\/json\b/);
  assert.deepEqual(conflict.body, {
    error: {
      code: "conflict",
      message: "The record changed before it could be saved.",
      requestId: conflict.headers["x-request-id"],
    },
  });

  const publicConflict = await request(server, "/api/v1/conflict");
  assert.equal(publicConflict.status, 409);
  assert.deepEqual(publicConflict.body, {
    apiVersion: "v1",
    error: {
      code: "conflict",
      message: "The record changed before it could be saved.",
      requestId: publicConflict.headers["x-request-id"],
    },
  });

  const forbidden = await request(server, "/api/hidden-forbidden");
  const missing = await request(server, "/api/hidden-missing");
  assert.equal(forbidden.status, 403);
  assert.equal(missing.status, 404);
  assert.equal(forbidden.body.error.message, missing.body.error.message);
  assert.doesNotMatch(JSON.stringify([forbidden.body, missing.body]), /hidden-forbidden|hidden-missing/);

  const dependency = await request(server, "/api/dependency");
  assert.equal(dependency.status, 503);
  assert.equal(dependency.body.error.code, "service_unavailable");
  assert.equal(dependency.body.error.message, "Try again after the dependency recovers.");
  assertSafeDiagnosticForRequest(diagnostics, dependency.headers["x-request-id"], {
    actorState: "anonymous",
    routeClass: "api-internal",
    workspaceState: "unscoped",
  });

  const unexpected = await request(server, "/api/unexpected?token=query-secret", {
    body: JSON.stringify({
      password: "request-body-credential",
      protectedRecordId: "request-body-record-id",
      sql: "DELETE FROM workspaces",
    }),
    headers: {
      Authorization: "Bearer request-header-credential",
      "Content-Type": "application/json",
    },
    method: "POST",
  });
  assert.equal(unexpected.status, 500);
  assert.equal(unexpected.body.error.code, "internal_server_error");
  assert.equal(unexpected.body.error.message, "Internal server error.");
  assert.equal(unexpected.body.error.requestId, unexpected.headers["x-request-id"]);
  assertNoProtectedDiagnosticContent(unexpected.body);
  assertSafeDiagnosticForRequest(diagnostics, unexpected.headers["x-request-id"], {
    actorState: "authenticated",
    routeClass: "api-internal",
    workspaceState: "scoped",
  });

  const unknownThrown = await request(server, "/api/unknown-thrown");
  assert.equal(unknownThrown.status, 500);
  assert.equal(unknownThrown.body.error.code, "internal_server_error");
  assert.equal(unknownThrown.body.error.message, "Internal server error.");
  assertNoProtectedDiagnosticContent(unknownThrown.body);
  assertSafeDiagnosticForRequest(diagnostics, unknownThrown.headers["x-request-id"], {
    actorState: "anonymous",
    routeClass: "api-internal",
    workspaceState: "unscoped",
  });

  const unknownApi = await request(server, "/api/unknown");
  assert.equal(unknownApi.status, 404);
  assert.equal(unknownApi.body.error.code, "not_found");
  assert.equal(unknownApi.body.error.requestId, unknownApi.headers["x-request-id"]);

  const unsupportedMethod = await request(server, "/api/unknown", { method: "POST" });
  assert.equal(unsupportedMethod.status, 405);
  assert.equal(unsupportedMethod.body.error.code, "method_not_allowed");

  const browserFailure = await request(server, "/browser-error.html", {
    headers: { Accept: "text/html" },
  });
  assert.equal(browserFailure.status, 500);
  assert.match(browserFailure.headers["content-type"], /^text\/html\b/);
  assert.match(browserFailure.text, /class="error-page error-page--unexpected"/);
  assert.match(browserFailure.text, new RegExp(browserFailure.headers["x-request-id"]));
  assertNoProtectedDiagnosticContent(browserFailure.text);
  assertSafeDiagnosticForRequest(diagnostics, browserFailure.headers["x-request-id"], {
    actorState: "anonymous",
    routeClass: "browser-document",
    workspaceState: "unscoped",
  });

  const unknownBrowser = await request(server, "/missing-page.html", {
    headers: { Accept: "text/html" },
  });
  assert.equal(unknownBrowser.status, 404);
  assert.match(unknownBrowser.headers["content-type"], /^text\/html\b/);
  assert.match(unknownBrowser.text, /data-error-code="unavailable"/);
} finally {
  await closeServer(server);
}

console.log("HTTP error contract regression passed.");

async function assertBrowserApiContract() {
  const apiClientSource = await fs.readFile("public/js/shared/api-client.js", "utf8");
  const missingParserContext = vm.createContext({
    Error,
    fetch: async () => ({ ok: true, status: 200, text: async () => "{}" }),
    window: { LongtailForge: {} },
  });
  assert.throws(
    () => vm.runInContext(apiClientSource, missingParserContext, { filename: "api-client.js" }),
    /requires the shared error contract/i,
    "api-client must fail visibly when the canonical parser is unavailable",
  );
  assert.equal(missingParserContext.window.LongtailForge.api, undefined);

  const context = vm.createContext({
    Error,
    fetch: async () => ({
      ok: false,
      status: 409,
      text: async () => JSON.stringify({
        error: {
          code: "conflict",
          message: "The record changed.",
          requestId: "browser-request-id",
        },
      }),
      url: "http://localhost/api/example",
    }),
    window: { LongtailForge: {} },
  });
  vm.runInContext(
    await fs.readFile("public/js/shared/error-contract.js", "utf8"),
    context,
    { filename: "error-contract.js" },
  );
  vm.runInContext(
    apiClientSource,
    context,
    { filename: "api-client.js" },
  );

  const error = await context.window.LongtailForge.api.getJson("/api/example")
    .then(() => null, (caught) => caught);
  assert.equal(error.message, "The record changed.");
  assert.equal(error.code, "conflict");
  assert.equal(error.requestId, "browser-request-id");
  assert.equal(error.status, 409);
  assert.equal(error.method, "GET");
  assert.equal(error.body.error.code, "conflict");
}

async function assertCheckedRouteBoundaries() {
  const objectPayload = await readObjectPayload('{"name":"checked"}');
  assert.deepEqual(objectPayload, { name: "checked" });
  for (const invalidPayload of ["null", "[]", '"scalar"']) {
    await assert.rejects(
      readObjectPayload(invalidPayload),
      (error) => error instanceof AppError
        && error.statusCode === 400
        && error.message === "Request body must contain a JSON object.",
      "object-bound routes must reject non-object JSON with one safe 400 contract",
    );
  }

  await assertRouteRefinement(
    authenticatedAsyncRoute,
    {},
    "Login required.",
  );
  await assertRouteRefinement(
    workspaceAsyncRoute,
    { session: { user_id: "user-1", workspace_id: null } },
    "An active workspace is required.",
  );
  await assertRouteRefinement(
    apiKeyAsyncRoute,
    { apiKey: { id: "key-1" } },
    "API key required.",
  );

  for (const [adapter, requestValue] of [
    [authenticatedAsyncRoute, { session: { user_id: "user-1", workspace_id: null } }],
    [workspaceAsyncRoute, { session: { user_id: "user-1", workspace_id: "workspace-1" } }],
    [apiKeyAsyncRoute, {
      apiKey: { id: "key-1" },
      apiSession: { user_id: "user-1", workspace_id: "workspace-1" },
    }],
  ]) {
    let dispatchedRequest = null;
    await new Promise((resolve, reject) => {
      adapter(async (routeRequest) => {
        dispatchedRequest = routeRequest;
        resolve();
      })(requestValue, {}, reject);
    });
    assert.equal(dispatchedRequest, requestValue, "valid refined route contexts must dispatch unchanged");
  }
}

function readObjectPayload(payload) {
  const requestStream = new PassThrough();
  const result = readJsonObjectBody(requestStream);
  requestStream.end(payload);
  return result;
}

function assertRouteRefinement(adapter, requestValue, expectedMessage) {
  return new Promise((resolve, reject) => {
    adapter(() => reject(new Error("an invalid route context reached its handler")))(
      requestValue,
      {},
      (error) => {
        try {
          assert.ok(error instanceof AppError);
          assert.equal(error.message, expectedMessage);
          resolve();
        } catch (assertionError) {
          reject(assertionError);
        }
      },
    );
  });
}

function assertHeadersAlreadySentPassThrough() {
  const forwarded = [];
  const logged = [];
  const thrownValue = { protected: "already-sent-secret" };
  createErrorHandler({ logger: { error: (...args) => logged.push(args) } })(
    thrownValue,
    {},
    { headersSent: true },
    (error) => forwarded.push(error),
  );
  assert.deepEqual(forwarded, [thrownValue]);
  assert.deepEqual(logged, [], "headers-already-sent failures must be delegated without a duplicate log or write");
}

function assertOrdered(source, snippets) {
  let priorIndex = -1;
  for (const snippet of snippets) {
    const index = source.indexOf(snippet);
    assert.ok(index > priorIndex, `${snippet} should appear in final middleware order`);
    priorIndex = index;
  }
}

function listen(appInstance) {
  return new Promise((resolve) => {
    const nextServer = appInstance.listen(0, "127.0.0.1", () => resolve(nextServer));
  });
}

function closeServer(serverInstance) {
  return new Promise((resolve, reject) => {
    serverInstance.close((error) => error ? reject(error) : resolve());
  });
}

function request(serverInstance, requestPath, options = {}) {
  return new Promise((resolve, reject) => {
    const body = options.body || "";
    const headers = {
      ...options.headers,
      ...(body ? { "Content-Length": Buffer.byteLength(body) } : {}),
    };
    const nextRequest = http.request({
      headers,
      host: "127.0.0.1",
      method: options.method || "GET",
      path: requestPath,
      port: serverInstance.address().port,
    }, (response) => {
      const chunks = [];
      response.on("data", (chunk) => chunks.push(chunk));
      response.on("end", () => {
        const text = Buffer.concat(chunks).toString("utf8");
        const contentType = String(response.headers["content-type"] || "");
        resolve({
          body: contentType.includes("application/json") ? JSON.parse(text) : null,
          headers: response.headers,
          status: response.statusCode,
          text,
        });
      });
    });
    nextRequest.on("error", reject);
    nextRequest.end(body);
  });
}

function assertSafeDiagnosticForRequest(records, requestId, expected) {
  const matchingDiagnostics = records.filter((record) => record.fields.requestId === requestId);
  assert.equal(
    matchingDiagnostics.length,
    1,
    `request ${requestId} should produce exactly one protected failure diagnostic`,
  );
  const [diagnostic] = matchingDiagnostics;
  assert.equal(diagnostic.event, "http.request.failed");
  assert.equal(diagnostic.fields.actorState, expected.actorState);
  assert.equal(diagnostic.fields.routeClass, expected.routeClass);
  assert.equal(diagnostic.fields.workspaceState, expected.workspaceState);
  assert.ok(Array.isArray(diagnostic.fields.errorStack));
  assert.deepEqual(
    Object.keys(diagnostic.fields).sort(),
    [
      "actorState",
      "component",
      "errorStack",
      "errorType",
      "method",
      "requestId",
      "routeClass",
      "statusCode",
      "workspaceState",
    ],
    "failure diagnostics should retain only the safe structured allowlist",
  );
  assertNoProtectedDiagnosticContent(diagnostic);
}

function assertNoProtectedDiagnosticContent(value) {
  assert.doesNotMatch(
    JSON.stringify(value),
    /exception-secret|browser-secret|unknown-thrown-secret|query-secret|request-body|request-header|credential-secret|browser-credential|raw-protected|raw-browser|raw-unknown|database\.sqlite|notes\.sqlite|SELECT \*|DELETE FROM|OneDrive|Time_Tracker|\\protected|\\private/i,
    "responses and diagnostics must omit secrets, bodies, SQL, paths, credentials, and raw protected identifiers",
  );
}
