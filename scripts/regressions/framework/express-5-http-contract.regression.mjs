export const regressionMeta = Object.freeze({
  id: "framework.express-5-http-contract",
  area: "framework",
  tier: "release-gate",
  tags: ["dependencies", "errors", "http", "routing", "security"],
  description: "Pins the Express 5 runtime boundary, named wildcard routes, prior query semantics, and exactly-once async error propagation.",
  runMode: "static",
});

import assert from "node:assert/strict";
import fs from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { setImmediate as waitForImmediate } from "node:timers/promises";
import express from "express";
import { asyncRoute } from "../../../src/core/http.js";
import { errorHandler } from "../../../src/middleware/error-handler.js";
import { AppError } from "../../../src/utils/app-error.js";

const packageJson = JSON.parse(await fs.readFile("package.json", "utf8"));
const packageLock = JSON.parse(await fs.readFile("package-lock.json", "utf8"));
const rootLock = packageLock.packages[""];
const expressLock = packageLock.packages["node_modules/express"];

assert.equal(packageJson.dependencies.express, "^5.2.1", "Express should use the reviewed 5.2 runtime baseline");
assert.equal(rootLock.dependencies.express, "^5.2.1", "the lockfile root should match the Express package contract");
assert.equal(expressLock.version, "5.2.1", "the resolved Express baseline should remain 5.2.1");
assert.match(expressLock.engines.node, />= 18/, "Express 5.2 should support the repository's Node 24 runtime line");

const appSource = await fs.readFile("src/core/app.js", "utf8");
const staticRoutesSource = await fs.readFile("src/routes/static.routes.js", "utf8");
assert.match(
  appSource,
  /app\.set\("query parser", "extended"\)/,
  "Express 5 should preserve the prior nested/repeated query contract explicitly",
);
assert.match(
  staticRoutesSource,
  /staticRoutes\.get\("\/\{\*staticPath\}"/,
  "the protected static fallback should use an Express 5 named wildcard that includes the root path",
);

const invalidWildcardRoutes = [];
for (const root of ["src", "scripts/regressions/framework"]) {
  for (const filePath of await listJavaScriptFiles(root)) {
    if (filePath.endsWith("express-5-http-contract.regression.mjs")) continue;
    const source = await fs.readFile(filePath, "utf8");
    if (/\.(?:all|get|post|put|patch|delete|use)\(\s*["']\*["']/.test(source)) {
      invalidWildcardRoutes.push(filePath);
    }
  }
}
assert.deepEqual(invalidWildcardRoutes, [], "runtime and framework fixtures must not register an Express 4 bare wildcard route");

const errorPasses = new Map();
const app = express();
app.set("query parser", "extended");
app.use(express.static("public"));
app.get("/query", (request, response) => response.status(200).json(request.query));
app.get("/wrapped-error", asyncRoute(async () => {
  throw new AppError("Wrapped failure", 409);
}));
app.get("/native-error", async () => {
  throw new AppError("Native failure", 418);
});
app.get("/{*fallbackPath}", (request, response) => response.status(200).json({ path: request.path }));
app.use((error, request, _response, next) => {
  errorPasses.set(request.path, (errorPasses.get(request.path) || 0) + 1);
  next(error);
});
app.use(errorHandler);

const server = await listen(app);
const unhandledRejections = [];
const collectUnhandledRejection = (reason) => unhandledRejections.push(reason);
process.on("unhandledRejection", collectUnhandledRejection);

try {
  const root = await request(server, "/");
  assert.equal(root.status, 200, "the named wildcard should include the root path");
  assert.equal(root.body.path, "/");

  const nested = await request(server, "/nested/browser/path");
  assert.equal(nested.status, 200, "the named wildcard should include nested browser paths");
  assert.equal(nested.body.path, "/nested/browser/path");

  const query = await request(server, "/query?filter%5Bstatus%5D=active&tag=one&tag=two");
  assert.equal(query.status, 200);
  assert.deepEqual(query.body, { filter: { status: "active" }, tag: ["one", "two"] });

  const javascript = await request(server, "/js/login.js");
  assert.equal(javascript.status, 200);
  assert.match(javascript.headers["content-type"] || "", /^text\/javascript;\s*charset=utf-8$/i);

  const wrappedError = await request(server, "/wrapped-error");
  assert.equal(wrappedError.status, 409);
  assert.deepEqual(wrappedError.body, { error: "Wrapped failure" });
  assert.equal(errorPasses.get("/wrapped-error"), 1, "the compatibility wrapper should forward a rejection exactly once");

  const nativeError = await request(server, "/native-error");
  assert.equal(nativeError.status, 418);
  assert.deepEqual(nativeError.body, { error: "Native failure" });
  assert.equal(errorPasses.get("/native-error"), 1, "Express 5 should forward a native async rejection exactly once");

  await waitForImmediate();
  assert.deepEqual(unhandledRejections, [], "wrapped and native async failures must not become unhandled rejections");
} finally {
  process.off("unhandledRejection", collectUnhandledRejection);
  await closeServer(server);
}

console.log("Express 5 HTTP contract regression passed.");

async function listJavaScriptFiles(root) {
  const entries = await fs.readdir(root, { recursive: true, withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && /\.(?:js|mjs)$/.test(entry.name))
    .map((entry) => path.join(entry.parentPath, entry.name));
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

function request(serverInstance, requestPath) {
  return new Promise((resolve, reject) => {
    const nextRequest = http.request({
      host: "127.0.0.1",
      method: "GET",
      path: requestPath,
      port: serverInstance.address().port,
    }, (response) => {
      const chunks = [];
      response.on("data", (chunk) => chunks.push(chunk));
      response.on("end", () => {
        const text = Buffer.concat(chunks).toString("utf8");
        const contentType = String(response.headers["content-type"] || "");
        resolve({
          body: contentType.includes("application/json") ? JSON.parse(text) : text,
          headers: response.headers,
          status: response.statusCode,
        });
      });
    });
    nextRequest.on("error", reject);
    nextRequest.end();
  });
}
