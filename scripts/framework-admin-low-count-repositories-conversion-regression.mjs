import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const root = process.cwd();
const appVersion = "0.33.5.27.33";
const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "ltf-framework-admin-low-count-conversion-"));
process.env.LONGTAIL_DATA_DIR = tempDir;
process.env.LONGTAIL_DATABASE_FILE = path.join(tempDir, "longtail-forge-framework-admin-low-count-conversion.db");
process.env.LONGTAIL_WORKER_MODE = "disabled";
process.env.SUPER_ADMIN_PASSWORD = "Framework-Admin-Low-Count-Conversion-Test-123!";
delete process.env.LTF_REGRESSION_BASELINE_DB;

const packageJson = JSON.parse(readText("package.json"));
const packageLock = JSON.parse(readText("package-lock.json"));
const modulesServiceSource = readText("src/core/modules/modules.service.js");
const auditLogsRepoSource = readText("src/repositories/audit-logs.repo.js");
const apiKeysRepoSource = readText("src/repositories/api-keys.repo.js");
const helpServiceSource = readText("src/services/help.service.js");
const auditDocs = readText("docs/database-parameter-binding-audit.md");
const databaseDocs = readText("docs/database.md");
const roadmap = readText("ROADMAP.md");
const changelog = readText("CHANGELOG.md");
const regressionSuite = readText("scripts/regression-suite.mjs");

const {
  closeDatabase,
  db,
  initializeDatabase,
} = await import("../src/db/index.js");
const { modulesService } = await import("../src/core/modules/modules.service.js");
const { auditLogsRepository } = await import("../src/repositories/audit-logs.repo.js");
const { apiKeysRepository } = await import("../src/repositories/api-keys.repo.js");
const { helpService } = await import("../src/services/help.service.js");

try {
  assertStaticContract();

  await initializeDatabase();
  const session = await readSeedSession();

  await assertModulesAndHelpRuntime(session);
  await assertAuditLogsRuntime(session);
  await assertApiKeysRuntime(session);
  await assertIntegrity();

  console.log("Framework/admin low-count repositories conversion regression passed.");
} finally {
  await closeDatabase();
  await fs.rm(tempDir, { recursive: true, force: true });
}

function assertStaticContract() {
  assert.equal(packageJson.version, appVersion, "package.json should report the framework/admin low-count repository conversion version");
  assert.equal(packageLock.version, appVersion, "package-lock root should report the framework/admin low-count repository conversion version");
  assert.equal(packageLock.packages[""].version, appVersion, "package-lock package entry should report the framework/admin low-count repository conversion version");

  assert.match(modulesServiceSource, /import \{ db \} from "\.\.\/database\.js";/, "modules service should import the provider-neutral db facade");
  assertNoLiteralHelpers("modules service", modulesServiceSource);
  assert.match(modulesServiceSource, /db\.dialect\.conflict\.buildInsertOnConflictDoUpdate/, "modules registry upsert should use the conflict seam");
  assert.match(modulesServiceSource, /db\.dialect\.conflict\.buildInsertOnConflictDoNothing/, "workspace module sync should use the conflict do-nothing seam");
  assert.match(modulesServiceSource, /await db\.transaction\(async \(transaction\) => \{[\s\S]*MODULE_UPSERT_SQL[\s\S]*syncWorkspaceModuleRows[\s\S]*repairRequiredWorkspaceModules/, "module registry sync should keep grouped writes transaction-scoped");
  assert.match(modulesServiceSource, /module_id IN \(:requiredModuleIds\)/, "required module repair should use array-valued named params");

  assert.match(auditLogsRepoSource, /import \{ db \} from "\.\.\/core\/database\.js";/, "audit logs repo should import the provider-neutral db facade");
  assertNoLiteralHelpers("audit logs repo", auditLogsRepoSource);
  assert.match(auditLogsRepoSource, /workspace_id IN \(:workspaceIds\)/, "audit visibility should use array-valued named params");
  assert.match(auditLogsRepoSource, /db\.dialect\.comparison\.likeNoCase/, "audit metadata searches should route LIKE through the comparison seam");
  assert.match(auditLogsRepoSource, /db\.dialect\.comparison\.orderByNoCase/, "audit filter options should route case-insensitive ordering through the comparison seam");

  assert.match(apiKeysRepoSource, /import \{ db \} from "\.\.\/core\/database\.js";/, "API keys repo should import the provider-neutral db facade");
  assertNoLiteralHelpers("API keys repo", apiKeysRepoSource);
  assert.match(apiKeysRepoSource, /await db\.transaction\(async \(transaction\) => \{[\s\S]*API_KEY_INSERT_SQL[\s\S]*api_key_scopes/, "API key creation should keep key and scope writes transaction-scoped");
  assert.match(apiKeysRepoSource, /WHERE key_hash = :keyHash/, "API key hash reads should use named params");

  assert.match(helpServiceSource, /import \{ db \} from "\.\.\/core\/database\.js";/, "Help service should import the provider-neutral db facade");
  assertNoLiteralHelpers("Help service", helpServiceSource);
  assert.match(helpServiceSource, /WHERE workspace_id = :workspaceId/, "Help workspace existence reads should use named params");

  assert.match(auditDocs, /Current totals as of 0\.33\.5\.27\.33:[\s\S]*Remaining runtime literal-helper invocations: 0[\s\S]*Remaining direct interpolated SQL operation sites: 0[\s\S]*Existing direct bound-params operation sites: 385[\s\S]*Total runtime database operation calls seen by the audit scanner: 429/, "audit docs should record the current parameter-binding ratchet");
  assert.match(auditDocs, /\| core\/modules\/modules\.service \| Converted \| 0 \| 0 \| 6 \| 7 \|/, "audit inventory should mark modules service converted");
  assert.match(auditDocs, /\| audit-logs\.repo \| Converted \| 0 \| 0 \| 10 \| 10 \|/, "audit inventory should mark audit logs repo converted");
  assert.match(auditDocs, /\| api-keys\.repo \| Converted \| 0 \| 0 \| 9 \| 9 \|/, "audit inventory should mark API keys repo converted");
  assert.match(auditDocs, /\| services\/help\.service \| Converted \| 0 \| 0 \| 1 \| 1 \|/, "audit inventory should mark Help service converted");
  assert.match(auditDocs, /\| db\/migrations \| Migration compatibility \| 0 \| 0 \| 10 \| 28 \|[\s\S]*\| db\/index \| Startup compatibility \| 0 \| 0 \| 31 \| 40 \|/, "audit inventory should mark migration and startup compatibility after value conversion");
  assert.match(auditDocs, /0\.33\.5\.27\.28 Framework and Admin Low-Count Repository Conversion[\s\S]*`core\/modules\/modules\.service`, `audit-logs\.repo`, `api-keys\.repo`, and `services\/help\.service` are fully converted[\s\S]*117 runtime literal-helper invocations[\s\S]*27 direct interpolated SQL operation sites[\s\S]*345 existing bound operation sites/, "audit docs should record the framework/admin low-count repository conversion slice");
  assert.match(databaseDocs, /As of version 0\.33\.5\.27\.28[\s\S]*`core\/modules\/modules\.service`, `audit-logs\.repo`, `api-keys\.repo`, and `services\/help\.service` are converted[\s\S]*117 remaining helper invocations/, "database docs should record the concrete framework/admin low-count repository conversion");
  assert.doesNotMatch(roadmap, /### Version 0\.33\.5\.27\.28 - Conversion wave: Framework and admin low-count repositories[\s\S]*- \[x\] Convert `core\/modules\/modules\.service`[\s\S]*- \[x\] Preserve module registry sync\/status[\s\S]*- \[x\] Update the burndown ratchet/, "live roadmap should archive completed 0.33.5.27 slice bodies");
  assert.match(changelog, /## Version 0\.33\.5\.27\.28 - [\s\S]*Framework and admin low-count repositories conversion[\s\S]*117 helper invocations[\s\S]*27 direct interpolated operation sites[\s\S]*345 bound operation sites/, "changelog should record the framework/admin low-count repository conversion burndown");
  assert.match(regressionSuite, /scripts\/framework-admin-low-count-repositories-conversion-regression\.mjs/, "regression suite should include the framework/admin low-count repository conversion proof");
}

async function assertModulesAndHelpRuntime(session) {
  const initialStatus = await modulesService.readModuleStatus(session.workspace_id, "developer-example");
  assert.equal(initialStatus, "disabled", "developer example should start disabled in a fresh workspace");

  let activeHelpTypes = await helpService.listActiveSearchableTypes(session.workspace_id);
  assert.equal(
    activeHelpTypes.some((type) => type.moduleId === "developer-example"),
    false,
    "disabled module Help should stay out of active Help search types",
  );

  await modulesService.setModuleStatus(session.workspace_id, "developer-example", true, { session });
  assert.equal(await modulesService.readModuleStatus(session.workspace_id, "developer-example"), "enabled", "module status writes should enable a module through bound params");
  assert.ok(
    (await modulesService.readEnabledModuleIds(session.workspace_id)).includes("developer-example"),
    "enabled module IDs should include the toggled module",
  );

  const activeContributions = await modulesService.listActiveHelpContributions(session.workspace_id, null);
  assert.ok(activeContributions.articles.some((article) => article.id === "developer-example.getting-started"), "enabled module Help contributions should become visible");
  activeHelpTypes = await helpService.listActiveSearchableTypes(session.workspace_id);
  assert.ok(activeHelpTypes.some((type) => type.moduleId === "developer-example"), "enabled module Help should become indexable");

  await modulesService.setModuleStatus(session.workspace_id, "developer-example", false, { session });
  assert.equal(await modulesService.readModuleStatus(session.workspace_id, "developer-example"), "disabled", "module status writes should disable a module through bound params");
  assert.deepEqual(await helpService.listActiveSearchableTypes("missing-workspace-' OR 1=1 --"), [], "missing workspace Help reads should remain safely empty");
}

async function assertAuditLogsRuntime(session) {
  const now = new Date().toISOString();
  const clientId = `audit-client-${randomUUID()}-%_`;
  const projectId = `audit-project-${randomUUID()}-%_`;
  const auditId = `audit-${randomUUID()}`;

  await auditLogsRepository.create({
    action: "framework_admin_low_count.test",
    actor_user_id: session.user_id,
    actor_user_name: "Framework Admin Conversion Tester",
    audit_id: auditId,
    change_type: "update",
    created_at: now,
    ip_address: "127.0.0.1",
    metadata_json: JSON.stringify({ client_id: clientId, project_id: projectId }),
    new_value_json: JSON.stringify({ status: "new" }),
    previous_value_json: JSON.stringify({ status: "old" }),
    record_id: `record-${randomUUID()}`,
    record_label: "Framework/Admin Conversion Audit",
    record_type: "module",
    record_url: "workspace-settings.html",
    workspace_id: session.workspace_id,
  });

  const byClient = await auditLogsRepository.search(session.workspace_id, {
    clientId,
    limit: 10,
  });
  assert.equal(byClient.some((entry) => entry.audit_id === auditId), true, "audit metadata client filters should match escaped bound LIKE params");

  const byProjectCount = await auditLogsRepository.countSearch(session.workspace_id, { projectId });
  assert.equal(byProjectCount >= 1, true, "audit metadata project filters should count through bound LIKE params");

  const scoped = await auditLogsRepository.searchForScope({
    workspaceIds: [session.workspace_id, "not-a-real-workspace"],
  }, {
    actorUserId: session.user_id,
    limit: 20,
  });
  assert.equal(scoped.some((entry) => entry.audit_id === auditId), true, "audit workspace visibility should use array-valued params");

  const options = await auditLogsRepository.readFilterOptionsForScope({ workspaceIds: [session.workspace_id] });
  assert.ok(options.users.some((user) => user.value === session.user_id), "audit filter options should include actor users");
  assert.ok(options.recordTypes.includes("module"), "audit filter options should include record types");
  assert.ok(options.changeTypes.includes("update"), "audit filter options should include change types");

  await auditLogsRepository.removeBefore(session.workspace_id, "2000-01-01T00:00:00.000Z");
  assert.equal(await auditLogsRepository.countSearch(session.workspace_id, { clientId }), 1, "retention cleanup should preserve newer rows");
}

async function assertApiKeysRuntime(session) {
  const keyName = "Conversion API Key '; DROP TABLE api_keys; --";
  const keyHash = `hash-${randomUUID()}-' OR 1=1 --`;
  const created = await apiKeysRepository.create({
    createdByUserId: session.user_id,
    keyHash,
    keyPrefix: "ltf_live_conversion",
    name: keyName,
    scopes: ["clients:read", "projects:read"],
    workspaceId: session.workspace_id,
  });

  assert.equal(created.name, keyName, "API key names should round-trip through named params");
  assert.deepEqual(created.scopes, ["clients:read", "projects:read"], "API key scopes should be inserted transactionally");

  const byHash = await apiKeysRepository.readByHash(keyHash);
  assert.equal(byHash.api_key_id, created.api_key_id, "API key hash reads should use bound params");

  await apiKeysRepository.updateLastUsed(created.api_key_id);
  const used = await apiKeysRepository.readById(session.workspace_id, created.api_key_id);
  assert.ok(used.last_used_at, "API key last-used updates should persist through bound params");

  const allKeys = await apiKeysRepository.readAll(session.workspace_id);
  assert.ok(allKeys.some((key) => key.api_key_id === created.api_key_id && key.scopes.includes("projects:read")), "API key list reads should include scopes");

  const revoked = await apiKeysRepository.revoke(session.workspace_id, created.api_key_id);
  assert.equal(revoked.status, "revoked", "API key revoke should preserve status semantics");
  assert.ok(revoked.revoked_at, "API key revoke should set revoked timestamp");
}

async function readSeedSession() {
  const user = await db.get(`
SELECT users.user_id, users.username, users.timezone, users.home_workspace_id, users.active_workspace_id
FROM users
WHERE users.protected_user = 'yes'
LIMIT 1;
`);

  assert.ok(user, "fresh database should seed a protected super admin");

  return {
    active_workspace_id: user.active_workspace_id || user.home_workspace_id,
    home_workspace_id: user.home_workspace_id,
    ip: "127.0.0.1",
    timezone: user.timezone || "America/New_York",
    user_id: user.user_id,
    username: user.username,
    workspace_id: user.active_workspace_id || user.home_workspace_id,
  };
}

async function assertIntegrity() {
  const row = await db.get("PRAGMA integrity_check;");
  assert.equal(row?.integrity_check, "ok", "framework/admin low-count conversion database should pass integrity check");
}

function assertNoLiteralHelpers(label, source) {
  assert.doesNotMatch(source, /\b(?:querySql|getSql|runSql|sqlText|sqlInteger|sqlNullableText|sqlNullableInteger)\b/, `${label} should be fully off literal helpers and compatibility query wrappers`);
  assert.match(source, /\b(?:db|transaction|database)\.(?:query|get|run|transaction)\b/, `${label} should use the adapter db path`);
  assert.match(source, /:[A-Za-z][A-Za-z0-9_]*\b/, `${label} should use named params`);
}

function readText(filePath) {
  return readFileSync(path.join(root, filePath), "utf8");
}
