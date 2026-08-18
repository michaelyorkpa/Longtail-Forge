/// <reference path="../../src/types/server-runtime-modules.d.ts" />
import assert from "node:assert/strict";
import http from "node:http";
import express from "express";

/** @typedef {import("../../src/types/http-contracts.js").WorkspaceRequestSession} ProbeWorkspaceSession */

/**
 * @typedef {object} ProbeDenialError
 * @property {unknown} [code]
 * @property {unknown} [message]
 * @property {unknown} [statusCode]
 */

/** @typedef {Record<string, unknown> & { fileStream?: import("node:stream").Readable }} ProbeUploadPayload */

/**
 * @typedef {object} ProbeResponse
 * @property {{ error?: { code?: string, message?: string } } | null} body
 * @property {number | undefined} status
 */

/** @typedef {{ session?: { user_id: string, workspace_id: string } }} ProbeIngressRequest */

const demoEnabled = process.argv.includes("--demo");
const { evaluatePublicDemoCapability } = await import("../../src/core/public-demo-enforcement.js");
const { filesService } = await import("../../src/services/files.service.js");

if (!demoEnabled) {
  assert.doesNotThrow(() => filesService.assertFileIngressAllowed());
  assert.equal(evaluatePublicDemoCapability("files.ingress").allowed, true);
  console.log("Standard Files ingress probe passed.");
  process.exit(0);
}

/** @param {ProbeDenialError | null | undefined} error */
const denial = (error) => {
  assert.equal(error?.statusCode, 403);
  assert.equal(error?.code, "public_demo_capability_disabled");
  assert.equal(error?.message, "This capability is unavailable in the public demo.");
  return true;
};
const unreadablePayload = /** @type {ProbeUploadPayload} */ (/** @type {unknown} */ (new Proxy({}, {
  get() {
    throw new Error("Files ingress inspected payload data before the public-demo denial.");
  },
})));
const session = /** @type {ProbeWorkspaceSession} */ (/** @type {unknown} */ (new Proxy({}, {
  get() {
    throw new Error("Files ingress inspected session data before the public-demo denial.");
  },
})));

assert.throws(() => filesService.assertFileIngressAllowed(), denial);
for (const methodName of /** @type {("uploadAndAttach" | "uploadStreamAndAttach" | "uploadBatchAndAttach" | "attachExistingFile")[]} */ ([
  "uploadAndAttach",
  "uploadStreamAndAttach",
  "uploadBatchAndAttach",
  "attachExistingFile",
])) {
  await assert.rejects(filesService[methodName](session, unreadablePayload), denial);
}
assert.equal(evaluatePublicDemoCapability("files.seeded_content", { access: "read" }).allowed, true);
assert.equal(evaluatePublicDemoCapability("files.seeded_content").allowed, false);

const [{ filesRoutes }, { errorHandler }, { attachRequestContext }] = await Promise.all([
  import("../../src/routes/files.routes.js"),
  import("../../src/middleware/error-handler.js"),
  import("../../src/core/request-context.js"),
]);
const app = express();
app.use(attachRequestContext);
app.use((/** @type {ProbeIngressRequest} */ request, /** @type {unknown} */ _response, /** @type {() => void} */ next) => {
  request.session = { user_id: "demo-visitor", workspace_id: "demo-workspace" };
  next();
});
app.use("/api", filesRoutes);
app.use(errorHandler);
const server = await new Promise((resolve) => {
  const listener = http.createServer(/** @type {import("node:http").RequestListener} */ (/** @type {unknown} */ (app)));
  listener.listen(0, "127.0.0.1", () => resolve(listener));
});

try {
  const port = server.address().port;
  for (const route of ["/api/files", "/api/files/batch", "/api/files/attachments"]) {
    const response = await request(port, route, {
      body: "{not-valid-json",
      contentType: "application/json",
    });
    assertDemoDenial(response, route);
  }
  for (const route of ["/api/files/upload", "/api/files/upload/batch"]) {
    const response = await request(port, route, {
      body: "visitor-controlled-file-bytes",
      contentType: "multipart/form-data; boundary=public-demo-probe",
    });
    assertDemoDenial(response, route);
  }
} finally {
  await /** @type {Promise<void>} */ (new Promise((resolve, reject) => server.close((/** @type {Error | undefined} */ error) => error ? reject(error) : resolve())));
}

console.log("Public-demo Files ingress probe passed.");

/**
 * @param {ProbeResponse} response
 * @param {string} route
 */
function assertDemoDenial(response, route) {
  assert.equal(response.status, 403, `${route} should deny before parsing its request body`);
  assert.deepEqual({
    code: response.body?.error?.code,
    message: response.body?.error?.message,
  }, {
    code: "public_demo_capability_disabled",
    message: "This capability is unavailable in the public demo.",
  });
}

/**
 * @param {number} port
 * @param {string} requestPath
 * @param {{ body: string, contentType: string }} options
 * @returns {Promise<ProbeResponse>}
 */
function request(port, requestPath, options) {
  return new Promise((resolve, reject) => {
    const request = http.request({
      host: "127.0.0.1",
      port,
      path: requestPath,
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Length": Buffer.byteLength(options.body),
        "Content-Type": options.contentType,
      },
    }, (response) => {
      /** @type {Buffer[]} */
      const chunks = [];
      response.on("data", (chunk) => chunks.push(chunk));
      response.on("end", () => {
        const text = Buffer.concat(chunks).toString("utf8");
        resolve({
          body: text ? JSON.parse(text) : null,
          status: response.statusCode,
        });
      });
    });
    request.on("error", reject);
    request.end(options.body);
  });
}
