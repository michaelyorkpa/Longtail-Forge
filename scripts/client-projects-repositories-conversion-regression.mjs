import { appVersion } from "../src/core/version.js";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const root = process.cwd();
const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "ltf-client-projects-repositories-conversion-"));
process.env.LONGTAIL_DATA_DIR = tempDir;
process.env.LONGTAIL_DATABASE_FILE = path.join(tempDir, "longtail-forge-client-projects-repositories-conversion.db");
process.env.LONGTAIL_WORKER_MODE = "disabled";
process.env.SUPER_ADMIN_PASSWORD = "Client-Projects-Repositories-Conversion-Test-123!";
delete process.env.LTF_REGRESSION_BASELINE_DB;

const packageJson = JSON.parse(readText("package.json"));
const packageLock = JSON.parse(readText("package-lock.json"));
const clientsRepoSource = readText("src/modules/client-projects/clients.repo.js");
const projectsRepoSource = readText("src/modules/client-projects/projects.repo.js");
const auditDocs = readText("docs/database-parameter-binding-audit.md");
const databaseDocs = readText("docs/database.md");
const roadmap = readText("ROADMAP.md");
const changelog = readText("CHANGELOG.md");
const regressionSuite = readText("scripts/regression-legacy-snapshot.json");

const {
  closeDatabase,
  db,
  initializeDatabase,
} = await import("../src/db/index.js");
const { clientsRepository } = await import("../src/modules/client-projects/clients.repo.js");
const { projectsRepository } = await import("../src/modules/client-projects/projects.repo.js");
const { clientsService } = await import("../src/modules/client-projects/clients.service.js");
const { workspacesRepository } = await import("../src/repositories/workspaces.repo.js");

try {
  assertStaticContract();

  await initializeDatabase();
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
  assert.equal(packageJson.version, appVersion, "package.json should report the Clients/Projects repositories conversion version");
  assert.equal(packageLock.version, appVersion, "package-lock root should report the Clients/Projects repositories conversion version");
  assert.equal(packageLock.packages[""].version, appVersion, "package-lock package entry should report the Clients/Projects repositories conversion version");

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
  assert.doesNotMatch(roadmap, /### Version 0\.33\.5\.27\.27 - Conversion wave: Clients and Projects repositories[\s\S]*- \[x\] Convert `client-projects\/clients\.repo`[\s\S]*- \[x\] Preserve hierarchy-aware reads[\s\S]*- \[x\] Update the burndown ratchet/, "live roadmap should archive completed 0.33.5.27 slice bodies");
  assert.match(changelog, /## Version 0\.33\.5\.27\.27 - [\s\S]*Clients and Projects repositories conversion[\s\S]*195 helper invocations[\s\S]*45 direct interpolated operation sites[\s\S]*319 bound operation sites/, "changelog should record the Clients/Projects repositories conversion burndown");
  assert.match(regressionSuite, /scripts\/client-projects-repositories-conversion-regression\.mjs/, "regression suite should include the Clients/Projects repositories conversion proof");
}

async function assertClientProjectRepositoryRuntime(session) {
  const parentClient = (await clientsService.createClient({
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
  const legacyClientId = randomUUID();
  const legacyClient = (await clientsService.createClient({
    id: legacyClientId,
    name: "Repository Legacy UUIDv4 Client",
  }, session)).client;
  const legacyClientProject = (await clientsService.createProject(legacyClient.id, {
    name: "Repository UUIDv7 Project Under Legacy Client",
  }, session)).project;

  for (const [label, recordId] of [
    ["new client", parentClient.id],
    ["new child client", childClient.id],
    ["new project", parentProject.id],
    ["new child project", childProject.id],
    ["project created under a legacy client", legacyClientProject.id],
  ]) {
    assertUuidVersion(recordId, 7, `${label} should use the central UUIDv7 record generator`);
  }
  assert.equal(legacyClient.id, legacyClientId, "caller-supplied UUIDv4 client ids should remain unchanged");
  assertUuidVersion(legacyClient.id, 4, "legacy client compatibility should preserve UUIDv4 ids");
  assert.equal(legacyClientProject.client_id, legacyClient.id, "UUIDv7 projects should retain their UUIDv4 client relationship");

  const readClients = await clientsRepository.readByIds(session.workspace_id, [
    childClient.id,
    parentClient.id,
  ]);
  assert.deepEqual(
    readClients.map((client) => client.name),
    [childClient.name, parentClient.name],
    "batched client reads should preserve name ordering through bound array params",
  );
  assert.equal(readClients.find((client) => client.id === parentClient.id)?.billing_rounding.enabled, true, "client billing rounding should read through the boolean seam");

  const readProjects = await projectsRepository.readByIds(session.workspace_id, [
    childProject.id,
    parentProject.id,
  ]);
  assert.deepEqual(
    readProjects.map((project) => project.name),
    [childProject.name, parentProject.name],
    "batched project reads should preserve readable labels through bound array params",
  );
  assert.equal(readProjects[1].billing_rounding.enabled, true, "project billing rounding should read through the boolean seam");
  assert.deepEqual(readProjects[1].taskDefaults.sortOrder, ["priority", "due_date", "status"], "project task-default sort order should round-trip");

  const duplicateNameMatch = await projectsRepository.readByNameInScope(
    session.workspace_id,
    parentClient.id,
    parentProject.name.toLowerCase(),
  );
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

  await clientsService.updateClient(childClient.id, {
    billing_rate: null,
    billing_rounding: { enabled: false, increment: "nearestQuarterHour" },
    name: childClient.name,
    parent_client_id: parentClient.id,
  }, session);
  const updatedChildClient = await clientsRepository.readById(session.workspace_id, childClient.id);
  assert.equal(updatedChildClient.parent_client_id, parentClient.id, "client update should preserve parent hierarchy");
  assert.equal(updatedChildClient.billing_rounding.enabled, false, "client update should preserve false billing rounding through the boolean seam");

  const activeClients = (await clientsService.listClients(session, { include_depth: "true" })).clients;
  const clientNames = activeClients.map((client) => client.name);
  assert.ok(clientNames.indexOf(parentClient.name) < clientNames.indexOf(childClient.name), "service-owned client hierarchy ordering should keep parent before child");
  assert.equal(activeClients.find((client) => client.id === childClient.id)?.depth, 1, "client hierarchy reads should preserve child depth metadata");

  await clientsService.archiveClient(parentClient.id, {}, session);
  assert.equal((await clientsRepository.readById(session.workspace_id, parentClient.id)).status, "Inactive", "client archive should mark the client inactive");
  assert.equal((await projectsRepository.readById(session.workspace_id, parentProject.id)).status, "Inactive", "client archive should cascade inactive status to active projects");
  assert.equal((await projectsRepository.readById(session.workspace_id, completedProject.id)).status, "Completed", "client archive should preserve completed projects");
}

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
  assert.equal(row?.integrity_check, "ok", "Clients/Projects repositories conversion database should pass integrity check");
}

function readText(filePath) {
  return readFileSync(path.join(root, filePath), "utf8");
}

function assertUuidVersion(value, version, message) {
  assert.match(
    String(value || ""),
    new RegExp(`^[0-9a-f]{8}-[0-9a-f]{4}-${version}[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$`, "i"),
    message,
  );
}
