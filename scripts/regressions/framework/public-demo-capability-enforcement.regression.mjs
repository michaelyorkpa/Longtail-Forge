export const regressionMeta = Object.freeze({
  id: "framework.public-demo-capability-enforcement",
  area: "framework",
  tier: "integration",
  tags: ["catalog", "demo", "jobs", "permissions", "routes", "security"],
  description: "Proves fail-closed public-demo denials at service, route, action, public API scope, job, and future-capability boundaries without changing standard mode.",
  runMode: "isolated-database",
});

import { escapeRegExp } from "../../test-support/source-scan.mjs";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import {
  PUBLIC_DEMO_ABSENT_CAPABILITY_IDS,
  getPublicDemoCapability,
} from "../../../src/core/public-demo-capabilities.js";

import { createDisposableDatabaseFixture } from "../../test-support/disposable-database.mjs";

const databaseFixture = await createDisposableDatabaseFixture("public-demo-capability-enforcement");
const { createErrorHandler } = await import("../../../src/middleware/error-handler.js");
const {
  PUBLIC_DEMO_DENIAL_CODE,
  PUBLIC_DEMO_DENIAL_MESSAGE,
  evaluatePublicDemoCapability,
  filterPublicDemoContributionActions,
  requirePublicDemoCapability,
} = await import("../../../src/core/public-demo-enforcement.js");
const { listModules } = await import("../../../src/core/modules/registry.js");

assert.equal(evaluatePublicDemoCapability("future.undeclared", { demoEnabled: false }).allowed, true);
assert.equal(evaluatePublicDemoCapability("future.undeclared", { demoEnabled: true }).allowed, false);
for (const capabilityId of PUBLIC_DEMO_ABSENT_CAPABILITY_IDS) {
  assert.equal(getPublicDemoCapability(capabilityId).classification, "disabled");
}
const outboundCapabilityIds = [
  "outbound.analytics",
  "outbound.email",
  "outbound.feedback",
  "outbound.integrations",
  "outbound.interest_capture",
  "outbound.url_fetch",
  "outbound.webhooks",
];
for (const capabilityId of outboundCapabilityIds) {
  assert.ok(PUBLIC_DEMO_ABSENT_CAPABILITY_IDS.includes(capabilityId));
  let outboundDenial = null;
  requirePublicDemoCapability(capabilityId, { demoEnabled: true })({}, {}, (error) => {
    outboundDenial = error;
  });
  assert.equal(outboundDenial?.code, PUBLIC_DEMO_DENIAL_CODE);
}

const catalogProbe = {
  actions: [
    { id: "record", publicDemoCapability: "records.workspace" },
    { id: "admin", publicDemoCapability: "administration.installation" },
    { id: "undeclared" },
  ],
};
assert.deepEqual(
  filterPublicDemoContributionActions(catalogProbe, { demoEnabled: true }),
  { actions: [{ id: "record", publicDemoCapability: "records.workspace" }] },
);
assert.equal(filterPublicDemoContributionActions(catalogProbe, { demoEnabled: false }), catalogProbe);

for (const moduleDefinition of listModules()) {
  assertDeclaredActions(moduleDefinition, moduleDefinition.id);
  for (const endpoint of moduleDefinition.publicApiEndpoints || []) {
    assert.equal(endpoint.publicDemoCapability, "api_keys", moduleDefinition.id + " endpoint " + endpoint.path + " must be demo-disabled");
  }
  for (const scope of moduleDefinition.apiScopes || []) {
    assert.equal(scope.publicDemoCapability, "api_keys", moduleDefinition.id + " scope " + scope.id + " must be demo-disabled");
  }
}

const sourceContracts = new Map([
  ["src/services/account-export-recovery.service.js", [["exportPortableAccount", "exports.account"]]],
  ["src/services/api-keys.service.js", [["list", "api_keys"], ["create", "api_keys"], ["revoke", "api_keys"], ["readActiveKey", "api_keys"], ["markUsed", "api_keys"]]],
  ["src/services/audit.service.js", [["exportCsv", "exports.audit"], ["exportSecurityEventsCsv", "exports.audit"]]],
  ["src/services/permissions.service.js", [["lookupDelegatedRoleAssignmentAccount", "administration.role_management"], ["replaceUserAssignments", "administration.role_management"]]],
  ["src/services/private-feeds.service.js", [["listCalendarSubscriptions", "private_feeds"], ["createCalendarSubscription", "private_feeds"], ["rotateCalendarSubscription", "private_feeds"], ["removeCalendarSubscription", "private_feeds"], ["renderCalendar", "private_feeds"]]],
  ["src/services/support-view.service.js", [["listTargets", "support_view"], ["listAudit", "support_view"], ["exportAuditCsv", "support_view"], ["start", "support_view"]]],
  ["src/services/users.service.js", [["readAddUserOptions", "administration.accounts"], ["lookupAddUserAccount", "administration.accounts"], ["create", "administration.accounts"], ["createWorkspace", "administration.workspace_lifecycle"]]],
  ["src/services/workspace-backups.service.js", [["create", "backups.workspace"], ["readLatest", "backups.workspace"]]],
  ["src/services/workspace-deletion.service.js", [["read", "administration.workspace_lifecycle"], ["request", "administration.workspace_lifecycle"], ["cancel", "administration.workspace_lifecycle"]]],
  ["src/modules/notes/catalog-security.service.js", [["preflight", "secure_notes.catalog_security"], ["enable", "secure_notes.catalog_security"], ["remove", "secure_notes.catalog_security"], ["retry", "secure_notes.catalog_security"]]],
]);
for (const [filePath, functions] of sourceContracts) {
  const source = await fs.readFile(path.resolve(filePath), "utf8");
  for (const [functionName, capabilityId] of functions) {
    assert.match(
      source,
      new RegExp("async function " + escapeRegExp(functionName) + "\\([^)]*\\) \\{\\s+assertPublicDemoCapabilityAllowed\\(\"" + escapeRegExp(capabilityId) + "\"\\);"),
      filePath + " " + functionName + " must deny before ordinary authorization or persistence",
    );
  }
}

const appSource = await fs.readFile(path.resolve("src/core/app.js"), "utf8");
assert.match(appSource, /app\.use\("\/api\/v1", requirePublicDemoCapability\("api_keys"\)\);[\s\S]*app\.use\(publicApiRoutes\);/);

const jobSources = await Promise.all([
  "src/modules/notes/catalog-security.service.js",
  "src/modules/tasks/task-jobs.service.js",
  "src/services/files.service.js",
  "src/services/import-jobs.service.js",
  "src/services/notifications.service.js",
  "src/services/search-index-jobs.service.js",
  "src/services/workspace-purge.service.js",
].map((filePath) => fs.readFile(path.resolve(filePath), "utf8")));
for (const source of jobSources) {
  assert.match(source, /registerJobHandler\([\s\S]{0,180}publicDemoCapability:/, "every production job registration must declare a demo capability");
}
const queueSource = await fs.readFile(path.resolve("src/core/jobs/job-queue.js"), "utf8");
const runnerSource = await fs.readFile(path.resolve("src/core/jobs/job-runner.js"), "utf8");
assert.match(queueSource, /assertRegisteredJobPublicDemoCapabilityAllowed\(jobType\);[\s\S]*db\.transaction/);
assert.match(runnerSource, /assertRegisteredJobPublicDemoCapabilityAllowed\(job\.job_type\);[\s\S]*getJobHandler/);

let denialError = null;
requirePublicDemoCapability("administration.accounts", { demoEnabled: true })(
  {},
  {},
  (error) => {
    denialError = error;
  },
);
assert.ok(denialError);
const responseState = { body: null, status: null };
createErrorHandler()(
  denialError,
  {
    method: "POST",
    path: "/api/users",
    originalUrl: "/api/users",
    requestContext: { requestId: "demo-denial-request" },
    session: { user_id: "public-workspace-admin", workspace_id: "demo-workspace" },
  },
  {
    headersSent: false,
    status(status) {
      responseState.status = status;
      return this;
    },
    json(body) {
      responseState.body = body;
      return this;
    },
  },
  () => {},
);
assert.equal(responseState.status, 403);
assert.deepEqual(responseState.body, {
  error: {
    code: PUBLIC_DEMO_DENIAL_CODE,
    message: PUBLIC_DEMO_DENIAL_MESSAGE,
    requestId: "demo-denial-request",
  },
});
assert.doesNotMatch(JSON.stringify(responseState.body), /super.?admin|capability id|workspace id/i);

const demoManifestProbe = spawnSync(process.execPath, [
  "--input-type=module",
  "-e",
  "import('./src/core/modules/registry.js').then(({listModules}) => console.log(listModules().length));",
], {
  cwd: process.cwd(),
  encoding: "utf8",
  env: {
    DEMO_MODE: "true",
    LONGTAIL_DEPLOYMENT_MODE: "compose",
    LONGTAIL_ENV: "production",
    LONGTAIL_FILE_SCANNER: "clamscan",
    LONGTAIL_PUBLIC_URL: "https://demo.longtailforge.com",
    LONGTAIL_RELEASE_ARTIFACT_SHA256: "b".repeat(64),
    LONGTAIL_RELEASE_BRANCH: "main",
    LONGTAIL_RELEASE_COMMIT: "a".repeat(40),
    LONGTAIL_SECURE_NOTES_MASTER_KEY: "demo-regression-secure-notes-master-key-material",
    LONGTAIL_SESSION_COOKIE_SECURE: "true",
    SUPER_ADMIN_PASSWORD: "demo-regression-bootstrap-password",
    TRUST_PROXY: "127.0.0.1/32",
  },
});
assert.equal(demoManifestProbe.status, 0, demoManifestProbe.stderr || demoManifestProbe.stdout);
assert.equal(demoManifestProbe.stdout.trim(), "8");

const outboundJobProbe = spawnSync(process.execPath, [
  "--input-type=module",
  "-e",
  `
    const handlers = await import("./src/core/jobs/job-handlers.js");
    handlers.registerJobHandler("outbound-probe", () => {}, { publicDemoCapability: "outbound.email" });
    try {
      handlers.assertRegisteredJobPublicDemoCapabilityAllowed("outbound-probe");
      process.exit(2);
    } catch (error) {
      if (error.code !== "public_demo_capability_disabled") process.exit(3);
      console.log(error.code);
    }
  `,
], {
  cwd: process.cwd(),
  encoding: "utf8",
  env: {
    DEMO_MODE: "true",
    LONGTAIL_DEPLOYMENT_MODE: "compose",
    LONGTAIL_ENV: "production",
    LONGTAIL_FILE_SCANNER: "clamscan",
    LONGTAIL_PUBLIC_URL: "https://demo.longtailforge.com",
    LONGTAIL_RELEASE_ARTIFACT_SHA256: "b".repeat(64),
    LONGTAIL_RELEASE_BRANCH: "main",
    LONGTAIL_RELEASE_COMMIT: "a".repeat(40),
    LONGTAIL_SECURE_NOTES_MASTER_KEY: "demo-regression-secure-notes-master-key-material",
    LONGTAIL_SESSION_COOKIE_SECURE: "true",
    SUPER_ADMIN_PASSWORD: "demo-regression-bootstrap-password",
    TRUST_PROXY: "127.0.0.1/32",
  },
});
assert.equal(outboundJobProbe.status, 0, outboundJobProbe.stderr || outboundJobProbe.stdout);
assert.equal(outboundJobProbe.stdout.trim(), PUBLIC_DEMO_DENIAL_CODE);

const { closeDatabase } = await import("../../../src/db/provider.js");
await closeDatabase();
await databaseFixture.cleanup();

console.log("Public-demo capability enforcement regression passed.");

function assertDeclaredActions(value, pathLabel) {
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertDeclaredActions(item, pathLabel + "[" + index + "]"));
    return;
  }
  if (!value || typeof value !== "object") {
    return;
  }
  for (const [key, item] of Object.entries(value)) {
    if (key === "actions" && Array.isArray(item)) {
      for (const action of item) {
        assert.ok(action.publicDemoCapability, pathLabel + " action " + (action.id || "unknown") + " must declare a demo capability");
      }
    }
    if (key === "primaryAction" && item) {
      assert.ok(item.publicDemoCapability, pathLabel + " primary action " + (item.id || "unknown") + " must declare a demo capability");
    }
    if (key === "rowActions" && Array.isArray(item)) {
      for (const action of item) {
        assert.ok(action.publicDemoCapability, pathLabel + " row action " + (action.id || "unknown") + " must declare a demo capability");
      }
    }
    assertDeclaredActions(item, pathLabel + "." + key);
  }
}
