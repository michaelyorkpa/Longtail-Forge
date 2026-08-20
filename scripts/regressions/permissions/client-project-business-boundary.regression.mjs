export const regressionMeta = Object.freeze({
  id: "permissions.client-project-business-boundary",
  area: "permissions",
  tier: "integration",
  tags: ["client-projects", "database", "permissions", "views", "workspaces"],
  description: "Proves Client project context is contributed and accepted only in Business workspaces.",
  runMode: "isolated-database",
});

import assert from "node:assert/strict";

import { createDisposableDatabaseFixture } from "../../test-support/disposable-database.mjs";
import { createProjectTextReader } from "../../test-support/source-scan.mjs";
const { readText } = createProjectTextReader();

const fixture = await createDisposableDatabaseFixture("client-project-business-boundary");
const { closeSqlite, initializeDatabase, querySql, runSql, sqlText } = await import("../../../src/db/index.js");
const { clientsService } = await import("../../../src/modules/client-projects/clients.service.js");

try {
  await assertStaticContracts();
  await initializeDatabase();
  const session = await readProtectedSession();
  const client = (await clientsService.createClient({ name: "Business Boundary Client" }, session)).client;
  const clientProject = (await clientsService.createProject(client.id, {
    name: "Business Client Project",
  }, session)).project;
  const workspaceProject = (await clientsService.createProject("", {
    name: "Workspace Project",
  }, session)).project;

  await assertBusinessBoundary(session, client, clientProject, workspaceProject);
  await assertProjectOnlyBoundary(session, "personal", client, clientProject, workspaceProject);
  await assertProjectOnlyBoundary(session, "family", client, clientProject, workspaceProject);
  await assertIntegrity();

  console.log("Client project Business-workspace boundary regression passed.");
} finally {
  await closeSqlite();
  await fixture.cleanup();
}

/**
 * The Client and Project records and the workspace-scoped session this owner
 * drives the service with, reused from the published module contracts rather
 * than redeclared. `ClientProjectSession` is the service own session type.
 * @typedef {import("../../../src/types/client-project-contracts.js").ClientProjectSession} BoundarySession
 */
/** @typedef {import("../../../src/types/client-project-contracts.js").ClientRecord} BoundaryClient */
/** @typedef {import("../../../src/types/client-project-contracts.js").ProjectRecord} BoundaryProject */

/** The framework denial the Business-only boundary rejects with. */
/** @typedef {{ message?: string, statusCode?: number }} BoundaryDenial */

async function assertStaticContracts() {
  const browserSource = await readText("public/js/clients-projects.js");
  const moduleSource = await readText("src/modules/client-projects/module.js");
  const serviceSource = await readText("src/modules/client-projects/clients.service.js");

  assert.match(moduleSource, /id:\s*"project-client-filter"[\s\S]*field:\s*"clientId"[\s\S]*id:\s*"project-client"[\s\S]*field:\s*"clientName"/, "Business descriptor source should retain its Client filter and column contributions");
  assert.match(browserSource, /clientProjectsViewSurfaceDescriptor[\s\S]*withoutUnsupportedClientFields\(filteredSurface\)/, "Clients\/Projects should resolve workspace-scoped descriptor fields before the framework renderer receives them");
  assert.match(browserSource, /function withoutUnsupportedClientFields[\s\S]*workspaceType === "business"[\s\S]*filter\.id !== "project-client-filter"[\s\S]*column\.id !== "project-client"[\s\S]*!\["clientId", "clientName"\]\.includes/, "Personal and Family Project descriptors should omit Client filter, column, and read bindings in module-owned browser shaping");
  assert.doesNotMatch(browserSource, /function hideDescriptorField|function showDescriptorField/, "Client controls should not be rendered and hidden by the framework adapter");
  assert.match(browserSource, /function createProjectClientAssignment[\s\S]*if \(!clientsEnabledForWorkspace\(\)\) \{[\s\S]*return null/, "Edit Project should decline to create a Client selector outside Business workspaces");
  assert.match(browserSource, /function createAddProjectClientAssignment[\s\S]*if \(!clientsEnabledForWorkspace\(\)\) \{[\s\S]*return null/, "Add Project should decline to create a Client selector outside Business workspaces");
  assert.match(browserSource, /clientAssignmentSelect = clientAssignmentLabel\?\.querySelector[\s\S]*identityFields\.filter\(Boolean\)/, "Edit Project should omit the absent Client field instead of appending hidden modal anatomy");
  assert.match(serviceSource, /assertProjectClientAssignmentAllowed\(workspaceSettings\.workspaceType, clientId, payload\)[\s\S]*assertProjectClientAssignmentAllowed\(workspaceSettings\.workspaceType, "", payload\)/, "Project create and update paths should share server-owned Client assignment rejection");
  assert.match(serviceSource, /function listProjects[\s\S]*workspaceType === "business"[\s\S]*filter\(\(project\) => !project\.client_id\)[\s\S]*map\(stripProjectClientContext\)/, "Personal and Family Project list reads should stay project-only and strip Client context");
}

/** @param {BoundarySession} session @param {BoundaryClient} client @param {BoundaryProject} clientProject @param {BoundaryProject} workspaceProject */
async function assertBusinessBoundary(session, client, clientProject, workspaceProject) {
  await setWorkspaceType(session.workspace_id, "business");
  const workspaceSession = { ...session };
  const read = await clientsService.listProjects(workspaceSession, { include_depth: "true", status: "All" });
  const clientRow = read.projects.find((project) => project.id === clientProject.id);

  assert.equal(clientRow?.client_id, client.id, "Business Project lists should retain Client identity as an internal read value");
  assert.equal(clientRow?.client_name, client.name, "Business Project lists should retain readable Client labels");
  assert.ok(read.projects.some((project) => project.id === workspaceProject.id), "Business Project lists should retain workspace-level Projects");

  const detail = await clientsService.readProject(clientProject.id, workspaceSession);
  assert.equal(detail.project.client_id, client.id, "Business Project detail should retain Client assignment");
  assert.equal(detail.project.client_name, client.name, "Business Project detail should retain readable Client context");
}

/** @param {BoundarySession} session @param {string} workspaceType @param {BoundaryClient} client @param {BoundaryProject} clientProject @param {BoundaryProject} workspaceProject */
async function assertProjectOnlyBoundary(session, workspaceType, client, clientProject, workspaceProject) {
  await setWorkspaceType(session.workspace_id, workspaceType);
  const workspaceSession = { ...session };
  const read = await clientsService.listProjects(workspaceSession, {
    clientId: client.id,
    include_depth: "true",
    status: "All",
  });

  assert.ok(read.projects.some((project) => project.id === workspaceProject.id), `${workspaceType} Project lists should ignore injected Client filters and retain workspace Projects`);
  assert.equal(read.projects.some((project) => project.id === clientProject.id), false, `${workspaceType} Project lists should not expose legacy Client-backed Projects`);
  assert.equal(read.projects.every((project) => !project.client_id && !project.client_name), true, `${workspaceType} Project list rows should not expose Client context`);

  const detail = await clientsService.readProject(clientProject.id, workspaceSession);
  assert.equal(detail.project.client_id, "", `${workspaceType} Project detail reads should strip Client identity`);
  assert.equal(detail.project.client_name, "", `${workspaceType} Project detail reads should strip Client labels`);

  await assertClientAssignmentRejected(
    () => clientsService.createProject(client.id, { name: `${workspaceType} route Client Project` }, workspaceSession),
    `${workspaceType} Client-scoped Project create routes should be rejected`,
  );
  await assertClientAssignmentRejected(
    () => clientsService.createProject("", { client_id: client.id, name: `${workspaceType} payload Client Project` }, workspaceSession),
    `${workspaceType} Project creates should reject snake-case Client payloads`,
  );
  await assertClientAssignmentRejected(
    () => clientsService.createProject("", { clientId: client.id, name: `${workspaceType} camel Client Project` }, workspaceSession),
    `${workspaceType} Project creates should reject camel-case Client payloads`,
  );
  await assertClientAssignmentRejected(
    () => clientsService.updateProject(workspaceProject.id, { ...workspaceProject, client_id: client.id }, workspaceSession),
    `${workspaceType} Project updates should reject Client assignment`,
  );

  const projectOnly = (await clientsService.createProject("", {
    client_id: "",
    name: `${workspaceType} Project Only`,
  }, workspaceSession)).project;
  assert.equal(projectOnly.client_id, "", `${workspaceType} blank Client payloads should remain valid project-only writes`);
}

/** @param {() => Promise<unknown>} operation @param {string} message @returns {Promise<void>} */
async function assertClientAssignmentRejected(operation, message) {
  await assert.rejects(
    operation,
    (error) => /** @type {BoundaryDenial} */ (error)?.statusCode === 403 && /Clients are only available in Business workspaces/.test(String(/** @type {BoundaryDenial} */ (error).message)),
    message,
  );
}

/** @param {string} workspaceId @param {string} workspaceType @returns {Promise<void>} */
async function setWorkspaceType(workspaceId, workspaceType) {
  await runSql(`UPDATE workspaces SET workspace_type = ${sqlText(workspaceType)} WHERE workspace_id = ${sqlText(workspaceId)};`);
}

/** @returns {Promise<BoundarySession>} */
async function readProtectedSession() {
  const rows = await querySql(`
SELECT user_id, username, display_name, home_workspace_id, active_workspace_id, timezone
FROM users
WHERE protected_user = 'yes'
ORDER BY rowid
LIMIT 1;
`);
  const user = rows[0];
  assert.ok(user?.user_id, "protected user fixture is required");

  return /** @type {BoundarySession} */ (/** @type {unknown} */ ({
    active_workspace_id: user.active_workspace_id || user.home_workspace_id,
    display_name: user.display_name || user.username,
    home_workspace_id: user.home_workspace_id,
    ip: "127.0.0.1",
    timezone: user.timezone || "America/New_York",
    user_id: user.user_id,
    username: user.username,
    workspace_id: user.active_workspace_id || user.home_workspace_id,
  }));
}

async function assertIntegrity() {
  const rows = await querySql("PRAGMA integrity_check;");
  assert.equal(rows[0]?.integrity_check, "ok");
}
