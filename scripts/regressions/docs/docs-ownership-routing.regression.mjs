export const regressionMeta = Object.freeze({
  id: "docs.ownership-routing",
  area: "docs",
  tier: "release-gate",
  tags: ["docs", "release", "routing"],
  description: "Proves changed source areas suggest owning documentation while the closeout gate remains explicit and warning-only.",
  runMode: "static",
});

import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import {
  formatDocsSuggestion,
  suggestDocsForPaths,
  validateDocsOwnershipIndex,
} from "../../lib/docs-change-routing.mjs";

const rawIndex = JSON.parse(readFileSync("docs/docs-ownership.json", "utf8"));
const index = validateDocsOwnershipIndex(rawIndex);
const packageJson = JSON.parse(readFileSync("package.json", "utf8"));
const guide = readFileSync("docs/docs-ownership.md", "utf8");
const readme = readFileSync("README.md", "utf8");

assert.deepEqual(
  index.areas.map((area) => area.id),
  [
    "workbench",
    "dashboard",
    "reporting",
    "tasks",
    "notes",
    "clients-projects",
    "lists",
    "files",
    "search",
    "notifications",
    "tags",
    "time-tracking",
    "settings",
    "http-errors",
    "runtime-security",
    "permissions",
    "security-audit",
    "database",
    "module-contracts",
    "view-building",
    "public-api",
    "licensing",
    "e2e-testing",
    "accessibility",
    "development-demo-data",
    "release-process",
  ],
  "the ownership index should cover every roadmap-listed documentation area",
);
for (const area of index.areas) {
  for (const docPath of area.docs) {
    assert.equal(existsSync(docPath), true, `${area.id} should reference existing documentation ${docPath}`);
  }
}

const tasks = suggestDocsForPaths(["src/modules/tasks/tasks.service.js"], { index: rawIndex });
assert.deepEqual(tasks.matchedAreas.map((area) => area.id), ["tasks"]);
assert.ok(tasks.docs.includes("docs/tasks-module.md"));
assert.equal(tasks.warnings.length, 1, "a mapped source change without owning docs should warn");

const tasksWithDocs = suggestDocsForPaths([
  "src/modules/tasks/tasks.service.js",
  "docs/tasks-module.md",
], { index: rawIndex, note: "Docs updated: docs/tasks-module.md." });
assert.deepEqual(tasksWithDocs.changedOwningDocs, ["docs/tasks-module.md"]);
assert.deepEqual(tasksWithDocs.warnings, []);

const securityAudit = suggestDocsForPaths(["src/security/security-events.js"], { index: rawIndex });
assert.deepEqual(securityAudit.matchedAreas.map((area) => area.id), ["security-audit"]);
assert.ok(securityAudit.docs.includes("docs/runtime-configuration.md"));
assert.ok(securityAudit.docs.includes("docs/longtail_forge_permissions_matrix.md"));

const workbench = suggestDocsForPaths(["public/js/workbench.js"], { index: rawIndex });
assert.deepEqual(workbench.matchedAreas.map((area) => area.id), ["workbench"]);
assert.deepEqual(workbench.docs, [
  "docs/tasks-module.md",
  "docs/ui-layout-guide.md",
  "docs/view-building-contract.md",
  "docs/workflow-context-contract.md",
  "help/modules/tasks/resuming-task-work.md",
]);

const reporting = suggestDocsForPaths(["public/js/reporting.js"], { index: rawIndex });
assert.deepEqual(reporting.matchedAreas.map((area) => area.id), ["reporting"]);
assert.ok(reporting.docs.includes("docs/time-tracking-module.md"));
assert.ok(reporting.docs.includes("help/framework/time-tracking-basics.md"));

const clientsProjects = suggestDocsForPaths(["src/modules/client-projects/clients.service.js"], { index: rawIndex });
assert.deepEqual(clientsProjects.matchedAreas.map((area) => area.id), ["clients-projects"]);
assert.ok(clientsProjects.docs.includes("docs/clients-projects-strict-guardrail-inventory.md"));
assert.ok(clientsProjects.docs.includes("help/framework/clients-and-projects.md"));

const settings = suggestDocsForPaths(["src/services/settings.service.js"], { index: rawIndex });
assert.deepEqual(settings.matchedAreas.map((area) => area.id), ["settings"]);
assert.deepEqual(settings.docs, [
  "docs/settings-control-matrix.md",
  "docs/settings-ownership.md",
  "docs/workspace-backup.md",
  "docs/workspace-deletion.md",
]);

const httpErrors = suggestDocsForPaths([
  "src/core/http-error-contract.js",
  "src/middleware/error-handler.js",
  "public/js/shared/browser-recovery.js",
  "public/js/shared/error-contract.js",
], { index: rawIndex });
assert.deepEqual(httpErrors.matchedAreas.map((area) => area.id), ["http-errors"]);
assert.deepEqual(httpErrors.docs, [
  "docs/architecture.md",
  "docs/http-errors.md",
  "docs/operational-security.md",
  "docs/public-api.md",
  "docs/runtime-configuration.md",
]);

const developmentData = suggestDocsForPaths(["scripts/development-data.mjs"], { index: rawIndex });
assert.deepEqual(developmentData.matchedAreas.map((area) => area.id), ["development-demo-data"]);
assert.deepEqual(developmentData.docs, [
  "docs/demo-data-operations.md",
  "docs/development-and-demo-data.md",
  "docs/marketing/screenshot-and-demo-data-plan.md",
]);

const runtimeSecurity = suggestDocsForPaths([
  "public/js/theme-init.js",
  "src/core/csrf-protection.js",
  "src/core/request-context.js",
  "src/repositories/authentication-throttle.repo.js",
  "src/security/auth-throttle.js",
], { index: rawIndex });
assert.deepEqual(runtimeSecurity.matchedAreas.map((area) => area.id), ["http-errors", "runtime-security"]);
assert.deepEqual(runtimeSecurity.docs, [
  "SECURITY.md",
  "docs/architecture.md",
  "docs/http-errors.md",
  "docs/internet-deployment.md",
  "docs/operational-security.md",
  "docs/public-api.md",
  "docs/runtime-configuration.md",
]);

const operationalSecurity = suggestDocsForPaths([
  "SECURITY.md",
  "server.js",
  "src/core/operational-logger.js",
  "src/routes/operational-health.routes.js",
  "src/services/operational-readiness.service.js",
], { index: rawIndex });
assert.deepEqual(operationalSecurity.matchedAreas.map((area) => area.id), ["http-errors", "runtime-security"]);
assert.ok(operationalSecurity.docs.includes("SECURITY.md"));
assert.ok(operationalSecurity.docs.includes("docs/operational-security.md"));

const referenceDeployment = suggestDocsForPaths([
  "docs/Caddyfile.private-preview.example",
  "scripts/reference-caddy-security-smoke.mjs",
], { index: rawIndex });
assert.deepEqual(referenceDeployment.matchedAreas.map((area) => area.id), ["runtime-security"]);
assert.ok(referenceDeployment.docs.includes("docs/internet-deployment.md"));

const publicEdgeFallback = suggestDocsForPaths([
  "scripts/release/longtail-forge-edge-unavailable.html",
], { index: rawIndex });
assert.deepEqual(publicEdgeFallback.matchedAreas.map((area) => area.id), ["runtime-security", "release-process"]);
assert.ok(publicEdgeFallback.docs.includes("docs/internet-deployment.md"));
assert.ok(publicEdgeFallback.docs.includes("docs/preview-deployment.md"));

const maintenanceRehearsal = suggestDocsForPaths([
  "scripts/release/rehearse-maintenance-boundary.mjs",
], { index: rawIndex });
assert.deepEqual(maintenanceRehearsal.matchedAreas.map((area) => area.id), ["runtime-security", "release-process"]);
assert.ok(maintenanceRehearsal.docs.includes("docs/internet-deployment.md"));
assert.ok(maintenanceRehearsal.docs.includes("docs/releasing.md"));

const historicalMaintenanceStaging = suggestDocsForPaths([
  "archive/maintenance-mode/setup-maintenance.sh",
], { index: rawIndex });
assert.deepEqual(historicalMaintenanceStaging.matchedAreas.map((area) => area.id), ["release-process"]);
assert.ok(historicalMaintenanceStaging.docs.includes("docs/preview-deployment.md"));

const sessionSecurity = suggestDocsForPaths(["src/services/sessions.service.js"], { index: rawIndex });
assert.deepEqual(sessionSecurity.matchedAreas.map((area) => area.id), ["runtime-security", "permissions"]);
assert.ok(sessionSecurity.docs.includes("docs/runtime-configuration.md"));
assert.ok(sessionSecurity.docs.includes("help/framework/users-roles-and-permissions.md"));

const passwordResetSecurity = suggestDocsForPaths([
  "public/js/login.js",
  "src/middleware/require-auth.js",
  "src/security/password-events.js",
  "views/public/login.html",
], { index: rawIndex });
assert.deepEqual(passwordResetSecurity.matchedAreas.map((area) => area.id), ["http-errors", "runtime-security", "permissions"]);
assert.ok(passwordResetSecurity.docs.includes("docs/runtime-configuration.md"));
assert.ok(passwordResetSecurity.docs.includes("help/framework/users-roles-and-permissions.md"));

const notificationLoadGuard = suggestDocsForPaths(["public/js/notification-load-guard.js"], { index: rawIndex });
assert.deepEqual(notificationLoadGuard.matchedAreas.map((area) => area.id), ["notifications", "runtime-security"]);
assert.ok(notificationLoadGuard.docs.includes("docs/runtime-configuration.md"));

const settingsOwnership = readFileSync("docs/settings-ownership.md", "utf8");
for (const requiredMechanism of [
  "workspace_settings",
  "app_settings",
  "Per-user `users` settings",
  "file_workspace_settings",
  "task_reminder_offsets",
  "notification_user_preferences",
  "notification_workspace_defaults",
  "notification_user_display_preferences",
  "notification_subscriptions",
  "Secure Notes app-level policy",
]) {
  assert.match(settingsOwnership, new RegExp(requiredMechanism.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), `settings ownership should inventory ${requiredMechanism}`);
}
assert.match(settingsOwnership, /Generic settings store/);
assert.match(settingsOwnership, /Retained table \+ handler/);
assert.match(settingsOwnership, /Per-user/);
assert.match(settingsOwnership, /App-level/);
assert.match(settingsOwnership, /workspace_module_settings/);
assert.match(settingsOwnership, /settingsService\.getValue/);
assert.match(settingsOwnership, /registerPersistenceHandler/);
assert.match(settingsOwnership, /registerOnChangeEffect/);

const database = suggestDocsForPaths(["src/db/migrations/071_example.sql"], { index: rawIndex });
assert.deepEqual(database.matchedAreas.map((area) => area.id), ["database"]);
assert.ok(database.docs.includes("docs/database.md"));

const licensing = suggestDocsForPaths(["docs/licensing/software-license.md"], { index: rawIndex });
assert.deepEqual(licensing.matchedAreas.map((area) => area.id), ["licensing"]);
assert.deepEqual(licensing.docs, ["docs/licensing.md", "docs/licensing/README.md"]);
assert.deepEqual(licensing.warnings, [], "a documentation-only licensing change should suggest its indexes without a source warning");

const e2e = suggestDocsForPaths(["tests/e2e/console.spec.mjs", "playwright.config.js"], { index: rawIndex });
assert.deepEqual(e2e.matchedAreas.map((area) => area.id), ["e2e-testing"]);
assert.ok(e2e.docs.includes("docs/e2e-testing.md"), "e2e harness changes should route to the e2e testing doc");

const a11y = suggestDocsForPaths(["tests/e2e/a11y.spec.mjs", "tests/e2e/support/axe.mjs"], { index: rawIndex });
assert.deepEqual(a11y.matchedAreas.map((area) => area.id), ["e2e-testing", "accessibility"]);
assert.ok(a11y.docs.includes("docs/accessibility.md"), "accessibility spec changes should route to the accessibility doc");
assert.ok(a11y.docs.includes("docs/e2e-testing.md"), "accessibility specs stay part of the e2e harness routing");

const acknowledged = suggestDocsForPaths(["src/modules/tasks/tasks.service.js"], {
  index: rawIndex,
  note: "No docs change needed: internal refactor preserved the documented Tasks contract.",
});
assert.deepEqual(acknowledged.warnings, [], "an explicit no-doc-change note should acknowledge the warning-only gate");
assert.equal(acknowledged.missingDocsAreas.length, 1, "acknowledgement should not hide the underlying review result");

const unmapped = suggestDocsForPaths(["unmapped/example.txt"], { index: rawIndex });
assert.deepEqual(unmapped.matchedAreas, []);
assert.deepEqual(unmapped.docs, []);
assert.deepEqual(unmapped.warnings, []);

assert.match(formatDocsSuggestion(tasks, { check: true }), /Warnings \(warning-only\):[\s\S]*Documentation gate mode: warning-only/);
assert.equal(packageJson.scripts["docs:suggest"], "node scripts/suggest-docs-for-changes.mjs");
assert.equal(packageJson.scripts["docs:check"], "node scripts/suggest-docs-for-changes.mjs --check");
assert.match(guide, /No docs change needed: <short reason>/);
assert.match(readme, /docs\/docs-ownership\.md/);

console.log("Documentation ownership routing and warning-only gate passed.");
