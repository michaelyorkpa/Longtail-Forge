import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "ltf-client-projects-canonical-"));
process.env.LONGTAIL_DATABASE_FILE = path.join(tempDir, "longtail-forge-client-projects-canonical.db");
process.env.SUPER_ADMIN_PASSWORD = "Client-Projects-Canonical-Test-123!";

const { closeSqlite, initializeDatabase, querySql, runSql, sqlText } = await import("../src/db/index.js");
const { clientsService } = await import("../src/modules/client-projects/clients.service.js");
const { publicApiService } = await import("../src/services/public-api.service.js");

try {
  await initializeDatabase();
  const session = await readSeedSession();
  const fixtures = await createFixtures(session);

  await assertCanonicalClientLists(session, fixtures);
  await assertCanonicalProjectLists(session, fixtures);
  await assertPermissionSafeClientProjects(session, fixtures);
  await assertPublicApiUsesCanonicalLists(session);
  await assertIntegrity();

  console.log("Client/projects canonical payload regression passed.");
} finally {
  await closeSqlite();
  await fs.rm(tempDir, { recursive: true, force: true });
}

async function createFixtures(session) {
  const alpha = (await clientsService.createClient({ name: "Alpha Client" }, session)).client;
  const beta = (await clientsService.createClient({ name: "Beta Client" }, session)).client;
  const zeta = (await clientsService.createClient({ name: "Zeta Client" }, session)).client;
  const alphaChild = (await clientsService.createClient({
    name: "Alpha Child",
    parent_client_id: alpha.id,
  }, session)).client;
  const inactiveClient = (await clientsService.createClient({
    name: "Inactive Client",
    status: "Inactive",
  }, session)).client;
  const alphaParentProject = (await clientsService.createProject(alpha.id, {
    name: "Alpha Parent Project",
  }, session)).project;
  const alphaChildProject = (await clientsService.createProject(alpha.id, {
    name: "Alpha Child Project",
    parent_project_id: alphaParentProject.id,
  }, session)).project;
  const betaProject = (await clientsService.createProject(beta.id, {
    name: "Beta Project",
  }, session)).project;
  const completedProject = (await clientsService.createProject(beta.id, {
    name: "Completed Project",
    status: "Completed",
  }, session)).project;
  const inactiveProject = (await clientsService.createProject(zeta.id, {
    name: "Inactive Project",
    status: "Inactive",
  }, session)).project;
  const workspaceProject = (await clientsService.createProject("", {
    name: "Workspace Project",
  }, session)).project;

  return {
    alpha,
    alphaChild,
    alphaChildProject,
    alphaParentProject,
    beta,
    betaProject,
    completedProject,
    inactiveClient,
    inactiveProject,
    workspaceProject,
    zeta,
  };
}

async function assertCanonicalClientLists(session, fixtures) {
  const activeClients = (await clientsService.listClients(session, {
    include_depth: "true",
  })).clients;

  assert.deepEqual(
    activeClients.map((client) => client.name),
    ["Alpha Client", "Alpha Child", "Beta Client", "Zeta Client"],
    "active client default should return flattened tree order",
  );
  assert.deepEqual(
    activeClients.map((client) => client.depth),
    [0, 1, 0, 0],
    "flattened client list should include depth metadata when requested",
  );
  assert.equal(activeClients[1].display_label, "  - Alpha Child");
  assert.ok(!activeClients.some((client) => client.id === fixtures.inactiveClient.id), "inactive clients should be excluded by default");

  const inactiveClients = (await clientsService.listClients(session, { status: "Inactive" })).clients;
  assert.deepEqual(inactiveClients.map((client) => client.id), [fixtures.inactiveClient.id]);

  const topLevelClients = (await clientsService.listClients(session, {
    scope: "top_level",
    status: "All",
  })).clients;
  assert.deepEqual(
    topLevelClients.map((client) => client.name),
    ["Alpha Client", "Beta Client", "Inactive Client", "Zeta Client"],
    "top-level client scope should omit child clients",
  );

  const treeClients = (await clientsService.listClients(session, {
    include_depth: "true",
    shape: "tree",
    status: "All",
  })).clients;
  const alphaNode = treeClients.find((client) => client.id === fixtures.alpha.id);
  assert.equal(alphaNode.children.length, 1);
  assert.equal(alphaNode.children[0].id, fixtures.alphaChild.id);
}

async function assertCanonicalProjectLists(session, fixtures) {
  const activeProjects = (await clientsService.listProjects(session, {
    include_depth: "true",
  })).projects;

  assert.deepEqual(
    activeProjects.map((project) => project.name),
    ["Alpha Parent Project", "Alpha Child Project", "Beta Project", "Workspace Project"],
    "active project default should return flattened project tree order",
  );
  assert.deepEqual(
    activeProjects.map((project) => project.depth),
    [0, 1, 0, 0],
    "flattened project list should include depth metadata when requested",
  );
  assert.equal(activeProjects[1].display_label, "  - Alpha Child Project");

  const betaProjects = (await clientsService.listProjects(session, {
    client: fixtures.beta.id,
    status: "All",
  })).projects;
  assert.deepEqual(
    betaProjects.map((project) => project.name),
    ["Beta Project", "Completed Project"],
    "client project filter should include only the selected client's projects",
  );

  const workspaceProjects = (await clientsService.listProjects(session, {
    client: "workspace",
  })).projects;
  assert.deepEqual(workspaceProjects.map((project) => project.id), [fixtures.workspaceProject.id]);

  const completedProjects = (await clientsService.listProjects(session, {
    status: "Completed",
  })).projects;
  assert.deepEqual(completedProjects.map((project) => project.id), [fixtures.completedProject.id]);

  const inactiveProjects = (await clientsService.listProjects(session, {
    status: "Inactive",
  })).projects;
  assert.deepEqual(inactiveProjects.map((project) => project.id), [fixtures.inactiveProject.id]);
}

async function assertPermissionSafeClientProjects(session, fixtures) {
  const scopedSession = await createScopedProjectUserSession(session.workspace_id, fixtures.betaProject.id);
  const clientProjects = await clientsService.readClientProjects(scopedSession);

  assert.deepEqual(
    clientProjects.workspaceProjects.map((project) => project.id),
    [],
    "scoped project users should not see workspace projects without scope",
  );
  assert.deepEqual(
    clientProjects.clients.map((client) => client.id),
    [fixtures.beta.id],
    "client-project tree should include only clients needed for readable projects",
  );
  assert.deepEqual(
    clientProjects.clients[0].projects.map((project) => project.id),
    [fixtures.betaProject.id],
    "client-project tree should hide unreadable sibling projects",
  );
}

async function assertPublicApiUsesCanonicalLists(session) {
  const clients = await publicApiService.listClients(session, {
    include_depth: "true",
    limit: "2",
    status: "All",
  });

  assert.equal(clients.pagination.limit, 2);
  assert.ok(clients.pagination.total >= 4);
  assert.equal(clients.data[0].display_label, "Alpha Client");
  assert.equal(clients.data[1].display_label, "  - Alpha Child");

  const projects = await publicApiService.listProjects(session, {
    client: "workspace",
    include_depth: "true",
  });

  assert.deepEqual(projects.data.map((project) => project.name), ["Workspace Project"]);
}

async function createScopedProjectUserSession(workspaceId, projectId) {
  const userId = `canonical-project-user-${randomUUID()}`;
  const username = `${userId}@example.test`;
  const now = new Date().toISOString();

  await runSql(`
INSERT INTO users (
  user_id,
  home_workspace_id,
  username,
  display_name,
  password,
  protected_user,
  active_workspace_id
)
VALUES (
  ${sqlText(userId)},
  ${sqlText(workspaceId)},
  ${sqlText(username)},
  ${sqlText(username)},
  'fixture-password',
  'no',
  ${sqlText(workspaceId)}
);

INSERT INTO user_workspaces (
  user_workspace_id,
  user_id,
  workspace_id,
  status,
  created_at,
  updated_at
)
VALUES (
  ${sqlText(randomUUID())},
  ${sqlText(userId)},
  ${sqlText(workspaceId)},
  'active',
  ${sqlText(now)},
  ${sqlText(now)}
);

INSERT INTO user_role_assignments (
  assignment_id,
  workspace_id,
  user_id,
  role_id,
  scope_type,
  scope_id,
  client_id,
  project_id,
  permission_overrides_json,
  created_at,
  updated_at
)
VALUES (
  ${sqlText(randomUUID())},
  ${sqlText(workspaceId)},
  ${sqlText(userId)},
  'project_user',
  'project',
  ${sqlText(projectId)},
  NULL,
  ${sqlText(projectId)},
  NULL,
  ${sqlText(now)},
  ${sqlText(now)}
);
`);

  return {
    active_workspace_id: workspaceId,
    home_workspace_id: workspaceId,
    ip: "127.0.0.1",
    timezone: "America/New_York",
    user_id: userId,
    username,
    workspace_id: workspaceId,
  };
}

async function readSeedSession() {
  const rows = await querySql(`
SELECT users.user_id, users.username, users.timezone, users.home_workspace_id, users.active_workspace_id
FROM users
WHERE users.protected_user = 'yes'
LIMIT 1;
`);
  const user = rows[0];

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
  const rows = await querySql("PRAGMA integrity_check;");
  assert.equal(rows[0]?.integrity_check, "ok");
}
