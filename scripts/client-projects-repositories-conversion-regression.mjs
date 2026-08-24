import assert from "node:assert/strict";
import { requireJsonRecord } from "./test-support/json-record-assertions.mjs";
import { workspaceSessionFixture } from "./test-support/session-fixtures.mjs";

import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createProjectTextReader } from "./test-support/source-scan.mjs";
const { readText } = createProjectTextReader();

const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "ltf-client-projects-repositories-conversion-"));
process.env.LONGTAIL_DATA_DIR = tempDir;
process.env.LONGTAIL_DATABASE_FILE = path.join(tempDir, "longtail-forge-client-projects-repositories-conversion.db");
process.env.LONGTAIL_WORKER_MODE = "disabled";
process.env.SUPER_ADMIN_PASSWORD = "Client-Projects-Repositories-Conversion-Test-123!";

const clientsRepoSource = readText("src/modules/client-projects/clients.repo.js");
const projectsRepoSource = readText("src/modules/client-projects/projects.repo.js");
const auditDocs = readText("docs/database-parameter-binding-audit.md");
const databaseDocs = readText("docs/database.md");

const {
  closeDatabase,
  db,
  initializeDatabase,
} = await import("../src/db/index.js");
const { clientsRepository } = await import("../src/modules/client-projects/clients.repo.js");
const { projectsRepository } = await import("../src/modules/client-projects/projects.repo.js");
const { clientsService } = await import("../src/modules/client-projects/clients.service.js");
const { moduleEntry: clientProjectsModuleEntry } = await import("../src/modules/client-projects/module.js");
const { auditService } = await import("../src/services/audit.service.js");
const { searchService } = await import("../src/services/search.service.js");
const { workspacesRepository } = await import("../src/repositories/workspaces.repo.js");

try {
  assertStaticContract();

  await initializeDatabase();
  // `activateApp` is optional on the module entry contract and receives the
  // activation context the framework always supplies. This owner drives it
  // directly, so it presents the same context rather than calling the hook with
  // none and relying on this module's implementation ignoring it.
  assert.ok(clientProjectsModuleEntry.activateApp, "the Clients/Projects module entry should expose an app activation hook");
  clientProjectsModuleEntry.activateApp({
    moduleId: "client-projects",
    runtime: "app",
    registerStartupTask() {},
  });
  const session = await readSeedSession();

  await assertClientProjectRepositoryRuntime(session);
  await assertBusinessOnlyClientGate(session);
  await assertIntegrity();

  console.log("Clients/Projects repositories conversion regression passed.");
} finally {
  await closeDatabase();
  await fs.rm(tempDir, { recursive: true, force: true });
}

function assertStaticContract() {

  for (const [label, source] of [
    ["clients repo", clientsRepoSource],
    ["projects repo", projectsRepoSource],
  ]) {
    assert.match(source, /import \{ db \} from "\.\.\/\.\.\/core\/database\.js";/, `${label} should import the provider-neutral db facade`);
    assert.doesNotMatch(source, /\b(?:querySql|getSql|runSql|sqlText|sqlInteger|sqlNullableText|sqlNullableInteger)\b/, `${label} should be fully off literal helpers and compatibility query wrappers`);
    assert.match(source, /\bdb\.(?:query|get|run|transaction)\b/, `${label} should use the adapter db path`);
    assert.match(source, /:[A-Za-z][A-Za-z0-9_]*\b/, `${label} should use named params`);
    assert.match(source, /db\.dialect\.comparison\./, `${label} should route comparison or ordering through the dialect seam`);
    assert.match(source, /db\.dialect\.boolean\./, `${label} should route billing rounding boolean mapping through the dialect seam`);
  }

  assert.match(clientsRepoSource, /id IN \(:clientIds\)/, "Clients batched reads should use array-valued named params");
  assert.match(clientsRepoSource, /await db\.transaction\(async \(transaction\) => \{[\s\S]*UPDATE clients[\s\S]*UPDATE projects/, "Client archive should split cascading updates into transaction-scoped bound statements");
  assert.match(clientsRepoSource, /await db\.transaction\(async \(transaction\) => \{[\s\S]*DELETE FROM projects[\s\S]*DELETE FROM clients[\s\S]*projectsRepository\.insertProject/, "Client replaceAll should stay transaction-scoped while inserting clients and projects through bound params");
  assert.match(projectsRepoSource, /id IN \(:projectIds\)/, "Projects batched reads should use array-valued named params");
  assert.match(projectsRepoSource, /db\.dialect\.comparison\.equalsNoCase\("trim\(projects\.name\)", "trim\(:projectName\)"\)/, "Project duplicate-name reads should preserve trim plus case-insensitive comparison behind the dialect seam");
  assert.match(projectsRepoSource, /task_default_sort_order_json = :taskDefaultSortOrderJson/, "Project writes should preserve task-default sort-order storage as a named param");

  assert.match(auditDocs, /## Baseline-driven workflow[\s\S]*npm run audit:params:check[\s\S]*Do not update the baseline in unrelated feature work/, "audit docs should record the current baseline-driven parameter-binding ratchet");
  assert.match(auditDocs, /\| client-projects\/clients\.repo \| Converted \| 0 \| 0 \| 9 \| 9 \|/, "audit inventory should mark clients repo converted");
  assert.match(auditDocs, /\| client-projects\/projects\.repo \| Converted \| 0 \| 0 \| 8 \| 8 \|/, "audit inventory should mark projects repo converted");
  assert.match(auditDocs, /0\.33\.5\.27\.27 Clients and Projects Repository Conversion[\s\S]*`client-projects\/clients\.repo` and `client-projects\/projects\.repo` are fully converted[\s\S]*195 runtime literal-helper invocations[\s\S]*45 direct interpolated SQL operation sites[\s\S]*319 existing bound operation sites/, "audit docs should record the Clients/Projects repositories conversion slice");
  assert.match(databaseDocs, /As of version 0\.33\.5\.27\.27[\s\S]*`client-projects\/clients\.repo` and `client-projects\/projects\.repo` are converted[\s\S]*195 remaining helper invocations/, "database docs should record the concrete Clients/Projects repositories conversion");
}

/** @typedef {import("../src/types/http-contracts.js").WorkspaceRequestSession} ConversionSession */

/** @param {ConversionSession} session */
async function assertClientProjectRepositoryRuntime(session) {
  const parentClient = (await clientsService.createClient({
    action: {
      action: "client_created",
      client_id: "",
      client_name: "Repository Parent '; DROP TABLE clients; --",
    },
    billing_contact: {
      email: "billing@example.test",
      name: "Billing Contact",
    },
    billing_period: { startDay: 9, type: "custom" },
    billing_rate: "225",
    billing_rounding: { enabled: true, increment: "nearestHalfHour" },
    billable: "yes",
    name: "Repository Parent '; DROP TABLE clients; --",
  }, session)).client;
  const childClient = (await clientsService.createClient({
    name: "Repository Child",
    parent_client_id: parentClient.id,
  }, session)).client;
  const parentProject = (await clientsService.createProject(parentClient.id, {
    action: {
      action: "project_created",
      client_id: parentClient.id,
      project_id: "",
      project_name: "Repository Project '; DROP TABLE projects; --",
    },
    billing_rounding: { enabled: true, increment: "nearestHour" },
    name: "Repository Project '; DROP TABLE projects; --",
    taskDefaults: {
      defaultAssigneeMode: "unassigned",
      priority: "high",
      sortOrder: ["priority", "due_date", "status"],
      status: "open",
    },
  }, session)).project;
  const childProject = (await clientsService.createProject(parentClient.id, {
    name: "Repository Child Project",
    parent_project_id: parentProject.id,
  }, session)).project;
  const completedProject = (await clientsService.createProject(parentClient.id, {
    name: "Repository Completed Project",
    status: "Completed",
  }, session)).project;
  const legacyClientId = "ffffffff-ffff-4fff-8fff-ffffffffffff";
  const legacyClient = (await clientsService.createClient({
    id: legacyClientId,
    name: "Repository Legacy UUIDv4 Client",
  }, session)).client;
  const legacyClientProject = (await clientsService.createProject(legacyClient.id, {
    name: "Repository UUIDv7 Project Under Legacy Client",
  }, session)).project;
  const legacyProjectId = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
  const legacyProject = (await clientsService.createProject(parentClient.id, {
    id: legacyProjectId,
    name: "Repository Legacy UUIDv4 Project",
  }, session)).project;
  const mixedVersionChildProject = (await clientsService.createProject(parentClient.id, {
    name: "Repository UUIDv7 Child Under Legacy Project",
    parent_project_id: legacyProject.id,
  }, session)).project;

  for (const [label, recordId] of [
    ["new client", parentClient.id],
    ["new child client", childClient.id],
    ["new project", parentProject.id],
    ["new child project", childProject.id],
    ["project created under a legacy client", legacyClientProject.id],
    ["project created under a legacy project", mixedVersionChildProject.id],
  ]) {
    assertUuidVersion(recordId, 7, `${label} should use the central UUIDv7 record generator`);
  }
  assert.equal(legacyClient.id, legacyClientId, "caller-supplied UUIDv4 client ids should remain unchanged");
  assertUuidVersion(legacyClient.id, 4, "legacy client compatibility should preserve UUIDv4 ids");
  assert.equal(legacyClientProject.client_id, legacyClient.id, "UUIDv7 projects should retain their UUIDv4 client relationship");
  assert.equal(legacyProject.id, legacyProjectId, "caller-supplied UUIDv4 project ids should remain unchanged");
  assertUuidVersion(legacyProject.id, 4, "legacy project compatibility should preserve UUIDv4 ids");
  assert.equal(mixedVersionChildProject.parent_project_id, legacyProject.id, "UUIDv7 child projects should retain their UUIDv4 parent relationship");
  await assertCanonicalCreateActionMetadata(session.workspace_id, parentClient, parentProject);

  const updatedLegacyClient = (await clientsService.updateClient(legacyClient.id, {
    name: "Repository Legacy UUIDv4 Client Updated",
  }, session)).client;
  const updatedLegacyProject = (await clientsService.updateProject(legacyProject.id, {
    client_id: parentClient.id,
    name: "Repository Legacy UUIDv4 Project Updated",
  }, session)).project;
  assert.equal(updatedLegacyClient.id, legacyClient.id, "updating a legacy Client must preserve its UUIDv4 identity");
  assert.equal(updatedLegacyProject.id, legacyProject.id, "updating a legacy Project must preserve its UUIDv4 identity");
  assert.equal(updatedLegacyProject.client_id, parentClient.id, "updating a legacy Project must preserve its UUIDv7 Client relationship");

  await assertSearchAndAuditExportCompatibility(session, updatedLegacyClient, updatedLegacyProject);

  const readClients = await clientsRepository.readByIds(session.workspace_id, [
    childClient.id,
    parentClient.id,
  ]);
  assert.deepEqual(
    readClients.map((client) => client.name),
    [childClient.name, parentClient.name],
    "batched client reads should preserve name ordering through bound array params",
  );
  const readParentClient = readClients.find((client) => client.id === parentClient.id);
  assert.ok(readParentClient, "the batched client read should return the parent client");
  // `billing_rounding` is null on a record with no rounding configured, and
  // these are the assertions proving the boolean seam round-trips a configured
  // one, so the block is proven present rather than read through.
  assert.ok(readParentClient.billing_rounding, "the parent client should carry a billing rounding block");
  assert.equal(readParentClient.billing_rounding.enabled, true, "client billing rounding should read through the boolean seam");

  const readProjects = await projectsRepository.readByIds(session.workspace_id, [
    childProject.id,
    parentProject.id,
  ]);
  assert.deepEqual(
    readProjects.map((project) => project.name),
    [childProject.name, parentProject.name],
    "batched project reads should preserve readable labels through bound array params",
  );
  const readParentProject = readProjects[1];
  assert.ok(readParentProject, "the batched project read should return both projects");
  assert.ok(readParentProject.billing_rounding, "the parent project should carry a billing rounding block");
  assert.equal(readParentProject.billing_rounding.enabled, true, "project billing rounding should read through the boolean seam");
  assert.deepEqual(readParentProject.taskDefaults.sortOrder, ["priority", "due_date", "status"], "project task-default sort order should round-trip");

  const duplicateNameMatch = await projectsRepository.readByNameInScope(
    session.workspace_id,
    parentClient.id,
    parentProject.name.toLowerCase(),
  );
  assert.ok(duplicateNameMatch, "the case-insensitive duplicate read should find the parent project");
  assert.equal(duplicateNameMatch.id, parentProject.id, "case-insensitive duplicate reads should use the dialect seam");
  assert.equal(
    await projectsRepository.readByNameInScope(session.workspace_id, parentClient.id, parentProject.name, parentProject.id),
    null,
    "duplicate reads should keep the exclude-project guard",
  );

  await assert.rejects(
    () => clientsService.createProject(parentClient.id, { name: parentProject.name.toLowerCase() }, session),
    /Project name already exists/,
    "service-level duplicate detection should still reject same-scope project names",
  );

  const activeProjects = (await clientsService.listProjects(session, { include_depth: "true" })).projects;
  const projectNames = activeProjects.map((project) => project.name);
  assert.ok(projectNames.indexOf(parentProject.name) < projectNames.indexOf(childProject.name), "service-owned project ordering should keep parent before child");
  assert.ok(projectNames.indexOf(updatedLegacyProject.name) < projectNames.indexOf(mixedVersionChildProject.name), "parent-before-child ordering must beat lexical UUID order for mixed-version Projects");

  await clientsService.updateClient(childClient.id, {
    billing_rate: null,
    billing_rounding: { enabled: false, increment: "nearestQuarterHour" },
    name: childClient.name,
    parent_client_id: parentClient.id,
  }, session);
  const updatedChildClient = await clientsRepository.readById(session.workspace_id, childClient.id);
  assert.ok(updatedChildClient, "updating a client should read the persisted record back");
  assert.equal(updatedChildClient.parent_client_id, parentClient.id, "client update should preserve parent hierarchy");
  assert.ok(updatedChildClient.billing_rounding, "the updated child client should keep its billing rounding block");
  assert.equal(updatedChildClient.billing_rounding.enabled, false, "client update should preserve false billing rounding through the boolean seam");

  const activeClients = (await clientsService.listClients(session, { include_depth: "true" })).clients;
  const clientNames = activeClients.map((client) => client.name);
  assert.ok(clientNames.indexOf(parentClient.name) < clientNames.indexOf(childClient.name), "service-owned client hierarchy ordering should keep parent before child");
  assert.equal(activeClients.find((client) => client.id === childClient.id)?.depth, 1, "client hierarchy reads should preserve child depth metadata");

  await clientsService.archiveClient(parentClient.id, {}, session);
  const archivedClient = await clientsRepository.readById(session.workspace_id, parentClient.id);
  const archivedProject = await projectsRepository.readById(session.workspace_id, parentProject.id);
  const preservedProject = await projectsRepository.readById(session.workspace_id, completedProject.id);
  // Archiving must not remove the rows, and these are the assertions proving
  // the cascade sets status rather than deleting, so each read is proven to
  // have found its record before its status is compared.
  assert.ok(archivedClient, "archiving a client should leave the client readable");
  assert.ok(archivedProject, "archiving a client should leave its active project readable");
  assert.ok(preservedProject, "archiving a client should leave its completed project readable");
  assert.equal(archivedClient.status, "Inactive", "client archive should mark the client inactive");
  assert.equal(archivedProject.status, "Inactive", "client archive should cascade inactive status to active projects");
  assert.equal(preservedProject.status, "Completed", "client archive should preserve completed projects");
}

/** @param {ConversionSession} session */
async function assertBusinessOnlyClientGate(session) {
  const personalWorkspace = await workspacesRepository.createWorkspace({
    ownerUser: { user_id: session.user_id },
    workspaceName: "Personal Client Gate Regression",
    workspaceType: "personal",
  });
  const personalSession = {
    ...session,
    active_workspace_id: personalWorkspace.workspaceId,
    workspace_id: personalWorkspace.workspaceId,
  };

  await assert.rejects(
    () => clientsService.listClients(personalSession),
    /Clients are only available in Business workspaces/,
    "Clients should remain gated to Business workspaces",
  );
}

async function readSeedSession() {
  const user = await db.get(`
SELECT users.user_id, users.username, users.timezone, users.home_workspace_id, users.active_workspace_id
FROM users
WHERE users.protected_user = 'yes'
LIMIT 1;
`);

  return workspaceSessionFixture(user);
}

async function assertIntegrity() {
  const row = await db.get("PRAGMA integrity_check;");
  assert.equal(row?.integrity_check, "ok", "Clients/Projects repositories conversion database should pass integrity check");
}

/**
 * @param {ConversionSession} session
 * @param {{ id: string, name: string }} legacyClient
 * @param {{ id: string, name: string }} legacyProject
 */
async function assertSearchAndAuditExportCompatibility(session, legacyClient, legacyProject) {
  for (const [recordType, recordId] of [
    ["client", legacyClient.id],
    ["project", legacyProject.id],
  ]) {
    const indexed = await searchService.reindexSearchRecord({
      moduleId: "client-projects",
      recordId,
      recordType,
      workspaceId: session.workspace_id,
    }, { throwOnError: true });
    assert.equal(indexed.ok, true, `legacy ${recordType} should reindex without rewriting identity`);
  }

  const searchRows = await db.query(`
SELECT record_type, record_id, title
FROM search_index
WHERE workspace_id = :workspaceId
  AND record_id IN (:recordIds)
ORDER BY record_type;
`, {
    recordIds: [legacyClient.id, legacyProject.id],
    workspaceId: session.workspace_id,
  });
  assert.deepEqual(searchRows, [
    { record_id: legacyClient.id, record_type: "client", title: legacyClient.name },
    { record_id: legacyProject.id, record_type: "project", title: legacyProject.name },
  ], "Search indexing must retain exact UUIDv4 record identities and updated labels");

  const csv = await auditService.exportCsv(session, { limit: 1000 });
  assert.match(csv, new RegExp(legacyClient.id), "audit export should retain the exact legacy Client ID");
  assert.match(csv, new RegExp(legacyProject.id), "audit export should retain the exact legacy Project ID");
}

/**
 * @param {string} workspaceId
 * @param {{ id: string, name: string }} client
 * @param {{ id: string, name: string }} project
 */
async function assertCanonicalCreateActionMetadata(workspaceId, client, project) {
  const rows = await db.query(`
SELECT record_type, record_id, metadata_json
FROM audit_logs
WHERE workspace_id = :workspaceId
  AND record_id IN (:recordIds)
ORDER BY created_at;
`, {
    recordIds: [client.id, project.id],
    workspaceId,
  });
  const clientAudit = rows.find((row) => row.record_type === "client" && row.record_id === client.id);
  const projectAudit = rows.find((row) => row.record_type === "project" && row.record_id === project.id);
  // The audit metadata is a JSON-bearing database column, so each row is proven
  // present and its column proven to be text before it is parsed, and the parsed
  // value is narrowed to a record before the action is read off it.
  const clientAction = auditActionMetadata(clientAudit, "client");
  const projectAction = auditActionMetadata(projectAudit, "project");

  assert.equal(clientAction?.client_id, client.id, "Client audit action metadata should use the canonical server-generated ID");
  assert.equal(clientAction?.client_name, client.name, "Client audit action metadata should use the canonical saved label");
  assert.equal(projectAction?.client_id, client.id, "Project audit action metadata should retain canonical Client scope");
  assert.equal(projectAction?.project_id, project.id, "Project audit action metadata should use the canonical server-generated ID");
  assert.equal(projectAction?.project_name, project.name, "Project audit action metadata should use the canonical saved label");
}

/** @param {unknown} value @param {number} version @param {string} message */
/**
 * Read the recorded action metadata off one audit row.
 * @param {Record<string, unknown> | undefined} auditRow
 * @param {string} recordType
 * @returns {Record<string, unknown>}
 */
function auditActionMetadata(auditRow, recordType) {
  assert.ok(auditRow, `the ${recordType} create should record an audit row`);
  const metadataJson = auditRow.metadata_json;
  assert.ok(typeof metadataJson === "string", `the ${recordType} audit row should persist metadata as JSON text`);
  const metadata = requireJsonRecord(JSON.parse(metadataJson), `the ${recordType} audit metadata`);
  return requireJsonRecord(metadata.provided_action, `the ${recordType} audit provided action`);
}

/** @param {unknown} value @param {number} version @param {string} message */
function assertUuidVersion(value, version, message) {
  assert.match(
    String(value || ""),
    new RegExp(`^[0-9a-f]{8}-[0-9a-f]{4}-${version}[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$`, "i"),
    message,
  );
}
