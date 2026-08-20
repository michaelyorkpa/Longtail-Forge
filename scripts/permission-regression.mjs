export const regressionMeta = Object.freeze({
  id: "permissions.http-authorization-matrix",
  area: "permissions",
  tier: "release-gate",
  tags: ["authorization", "http", "permissions", "roles", "security"],
  description: "Executes the complete eight-role HTTP authorization matrix against one isolated application server and disposable database.",
  runMode: "isolated-database",
});

/* global fetch */

import assert from "node:assert/strict";
import fs from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";

const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "ltf-permission-regression-"));
const permissionFilesRoot = path.join(tempDir, "files");
process.env.LONGTAIL_DATABASE_FILE = path.join(tempDir, "longtail-forge-permission-test.db");
process.env.LONGTAIL_LOCAL_STORAGE_ROOT = permissionFilesRoot;
process.env.LONGTAIL_WORKSPACE_BACKUP_ROOT = path.join(tempDir, "workspace-backups");
process.env.SUPER_ADMIN_PASSWORD = "Permission-Test-Password-123!";

const { createApp } = await import("../src/core/app.js");
const { resetJobWorkerStatusForTests, runJobWorkerOnce } = await import("../src/core/jobs/index.js");
const { closeSqlite, initializeDatabase, querySql, runSql, sqlText } = await import("../src/db/index.js");

const results = [];
let server;

try {
  await initializeDatabase();
  const fixtures = await seedFixtures();
  server = await listen(createApp());
  const baseUrl = `http://127.0.0.1:${/** @type {import("node:net").AddressInfo} */ (server.address()).port}`;
  const api = createApi(baseUrl);

  await runAccessGuardTests(api);
  await runApiKeyTests(api, fixtures);
  await runClientMutationTests(api, fixtures);
  await runProjectMutationTests(api, fixtures);
  await runScopedAdminNavigationTests(api, fixtures);
  await runTaskMutationTests(api, fixtures);
  await runTimeEntryMutationTests(api, fixtures);
  await runActiveTimerMutationTests(api, fixtures);
  await runUserMutationTests(api, fixtures);
  await runAddUserAdministrationTests(api, fixtures);
  await runRoleAssignmentTests(api, fixtures);
  await runSettingsTests(api, fixtures);
  await runOwnershipScopeTests(api, fixtures);
  await runClientProjectDomainTests(api, fixtures);
  await runDisabledModuleTests(api, fixtures);
  await runReportingPermissionTests(api, fixtures);
  await runWorkspaceCreationModuleSettingTests(api, fixtures);
  await runWorkspaceOwnerLifecycleTests(api, fixtures);

  assert.ok(results.length >= 409, "permission harness should retain at least the reviewed 409-check authorization floor");
  console.log(`Permission regression harness passed ${results.length} checks.`);
} finally {
  if (server) {
    await closeServer(server);
  }

  await closeSqlite();
  await fs.rm(tempDir, { recursive: true, force: true });
}

/**
 * The eight authorization roles this harness proves. Naming them as a closed
 * key set is what makes a dropped role a compile error rather than a silently
 * skipped row: every fixture and session record below is keyed by this union.
 * @typedef {"superAdmin" | "workspaceAdmin" | "clientAdmin" | "projectAdmin" | "clientUser" | "projectUser" | "externalClientUser" | "unscopedUser"} HarnessRole
 */

/**
 * A seeded role identity. Seven of the eight roles are generated here and
 * carry `userId`; the protected super admin is read from the database instead
 * and carries the row's `user_id`. The seeding SQL relies on exactly that
 * asymmetry — `Object.values(users).filter((user) => user.userId)` is what
 * excludes the already-present super admin from the insert set — so both
 * shapes are declared rather than normalised.
 * @typedef {{ userId: string, username: string, user_id?: undefined }} SeededRoleUser
 */
/** @typedef {{ user_id: string, username: string, userId?: undefined }} ProtectedRoleUser */
/** @typedef {SeededRoleUser | ProtectedRoleUser} HarnessRoleUser */

/** A seeded Client and Project the scoping probes address. */
/** @typedef {{ id: string, name: string }} HarnessClient */
/** @typedef {{ clientId: string, id: string, name: string }} HarnessProject */

/**
 * The session cookies the harness drives requests with: one per role, plus the
 * two extra workspace-scoped administrator sessions the personal and family
 * workspace probes use.
 * @typedef {Record<HarnessRole, string> & { familyWorkspaceAdmin: string, personalWorkspaceAdmin: string }} HarnessSessions
 */

/**
 * Everything `seedFixtures()` resolves, plus the three task identities that
 * phase functions publish back onto the record for later phases to address.
 * Those three are optional because they exist only after the phase that seeds
 * them has run, which is real ordering coupling between phases rather than
 * something the seeder provides up front.
 *
 * Every one of the eighteen phase
 * functions receives this record, so its shape is the harness's central
 * contract.
 * @typedef {{
 *   clients: { alpha: HarnessClient, beta: HarnessClient },
 *   familyWorkspace: { id: string, projectId: string },
 *   otherWorkspace: { clientId: string, id: string },
 *   personalWorkspace: { id: string, projectId: string },
 *   projects: { alpha: HarnessProject, beta: HarnessProject, workspace: HarnessProject },
 *   publicApiTaskId?: string,
 *   sessions: HarnessSessions,
 *   taskTimerGateTaskId?: string,
 *   taskTimerTaskId?: string,
 *   users: { superAdmin: ProtectedRoleUser } & Record<Exclude<HarnessRole, "superAdmin">, SeededRoleUser>,
 *   workspaceId: string,
 * }} HarnessFixtures
 */

/**
 * The record elements the eighteen phase functions iterate. Each is named
 * against the fields the authorization probes actually read, so a collection
 * that stops carrying an identity or a scope is a compile error rather than a
 * callback that silently compares `undefined`.
 */
/** @typedef {{ source_id: string, source_type: string, task_id: string, allDay: boolean, assignee_ids: unknown[], client_id: string, id: string, priority: string, project_id: string, recurrenceDetails: Record<string, unknown>, recurrence_instance_date: string, recurrence_template_id: string, reminderDetails: { effectivePolicy: { offsets: { dateTime: number[] } }, overrideEnabled: boolean }, startDate: string, status: string }} HarnessTaskRow */
/** @typedef {{ entry_id: string, task_id: string, description: string, duration_seconds: number, tags: HarnessTagRow[], user_id: string }} HarnessTimeEntryRow */
/** @typedef {{ source_id: string, source_module_id: string, source_type: string, timer_slot: string, task_id: string, timer_status: string }} HarnessTimerRow */
/** @typedef {{ can_manage: boolean, client_id: string, id: string, name: string }} HarnessProjectRow */
/** @typedef {{ id: string, can_create_child: boolean, can_create_project: boolean, can_manage: boolean, can_manage_projects: boolean, name: string, parent_client_id: string, projects: HarnessProjectRow[] }} HarnessClientRow */
/** @typedef {{ assignment_scope_type: string, role_id: string, scopes: HarnessScopeRow[] }} HarnessRoleRow */
/** @typedef {{ label: string, scopeId: string }} HarnessScopeRow */
/** @typedef {{ can_create_child: boolean, id: string, recordType: string }} HarnessCandidateRow */
/** @typedef {{ key: string }} HarnessResourceRow */
/** @typedef {{ module_id: string, task_id: string }} HarnessModuleStatusRow */
/** @typedef {{ id: string, workspaceId: string }} HarnessWorkspaceRow */
/** @typedef {{ tag_id: string }} HarnessTagRow */
/** @typedef {{ renderer: string }} HarnessCardRow */
/** @typedef {{ dataRoute: string, id: string, placement: string, renderer: string }} HarnessPanelRow */
/**
 * The specific rows each surface returns.
 *
 * `0.33.33.30.7.2.2` used one aggregated `HarnessListItem` across navigation,
 * task and timer, time entry, dashboard, reporting, module metadata, and
 * workspace payloads. That type claimed fields no individual row guaranteed,
 * so post-merge review required it split; each row below now carries only what
 * the endpoint that produces it actually returns.
 */
/** @typedef {{ action: { href: string }, id: string, reasons: unknown[], status: string, task_id: string }} HarnessAttentionRow */
/** @typedef {{ project: { id: string }, rawSeconds: number }} HarnessReportingRow */
/** @typedef {{ dataRoute: string, href: string, id: string, path: string, placement: string, renderer: string }} HarnessModuleSurfaceRow */
/** @typedef {{ id: string, moduleSettings: HarnessModuleDefinition[], workspaceType: string }} HarnessWorkspaceTypeOption */
/** @typedef {{ id: string, entriesCount: number, action: Record<string, unknown> }} HarnessRecentTimeRow */

/** @typedef {{ code: string, message: string, requestId: string, status: number }} HarnessErrorEnvelope */


/** @typedef {HarnessScopeRow} HarnessAssignmentScope */
/** @typedef {HarnessPanelRow} HarnessSurfacePanel */
/** @typedef {HarnessTagRow} HarnessTag */

/**
 * What each named response envelope carries, built from the fields the
 * assertions in this file actually read.
 *
 * This is a key-to-contract dictionary, never a response shape. It is only
 * ever consumed through `Pick<>` by `readPayload`, so each call site declares
 * exactly the envelopes it reads and receives exactly those. No response is
 * ever claimed to carry all of them, which is what made the single required
 * `HarnessPayload` attempted at `0.33.33.30.7.2.2` wrong against this
 * harness's roughly fifty heterogeneous endpoints.
 * @typedef {{
 *   accountCreated: boolean,
 *   actions: { tasks: { href: string }, workbench: { href: string } },
 *   activeTimers: { count: number, rows: HarnessAttentionRow[] },
 *   apiKey: { api_key_id: string, scopes?: string[], status?: string },
 *   apiKeys: Array<{ api_key_id: string, status?: string }>,
 *   assignmentRevision: string,
 *   availableScopes: Array<{ scope: string }>,
 *   rawKey: string,
 *   assignments: unknown,
 *   attentionRows: HarnessAttentionRow[],
 *   backup: { archiveSha256: string, secureNotesKeyIncluded: boolean, workspaceName: string },
 *   canAddUsers: boolean,
 *   capabilities: Record<string, boolean>,
 *   client: HarnessClientRow,
 *   clients: HarnessClientRow[],
 *   createdTask: HarnessTaskRow,
 *   data: HarnessPublicApiRecord,
 *   deletion: { acknowledgementPhrase: string, backup: { current: boolean }, lifecycle: { backupProtected: boolean, noCurrentBackupAcknowledged: boolean, purgeAfter: string, requestedAt: string, status: string }, pending: boolean },
 *   enabledModules: string[],
 *   entries: HarnessTimeEntryRow[],
 *   entry: HarnessTimeEntryRow,
 *   entry_id: string,
 *   error: HarnessErrorEnvelope,
 *   errors: HarnessErrorEnvelope[],
 *   extensionPoints: { dashboardPanels: HarnessPanelRow[] },
 *   initialPassword: string,
 *   items: Array<HarnessCandidateRow & HarnessTaskRow>,
 *   match: { activeMembership: unknown, alreadyActive: boolean, assignmentRevision: string, assignments: unknown, userId: string, username: string },
 *   moduleSettings: HarnessModuleDefinition[],
 *   modules: HarnessModuleDescriptor[] | Record<string, { enabled: boolean }>,
 *   navigation: HarnessNavigationItem[],
 *   permissionHints: Record<string, unknown>,
 *   project: HarnessProjectRow,
 *   projects: HarnessProjectRow[],
 *   recentTime: { entriesCount: number, rows: HarnessRecentTimeRow[], todaySeconds: number, totalSeconds: number },
 *   recurrenceJob: { queued: boolean },
 *   registry: { workbenchCards: HarnessCardRow[] },
 *   resources: HarnessResourceRow[],
 *   roles: HarnessRoleRow[],
 *   rows: HarnessReportingRow[],
 *   task: HarnessTaskRow,
 *   taskFilter: unknown,
 *   task_id: string,
 *   tasks: HarnessTaskRow[],
 *   timer: HarnessTimerRow,
 *   timers: HarnessTimerRow[],
 *   totals: { seconds: number },
 *   upcomingRows: HarnessAttentionRow[],
 *   user: { user_id: string, username: string, workspaceContext?: HarnessWorkspaceContext },
 *   workCandidates: HarnessCandidateRow[],
 *   workspace: HarnessWorkspaceRow,
 *   workspaceContext: HarnessWorkspaceContext,
 *   workspaceCreation: { availableTypes: HarnessWorkspaceTypeOption[] },
 *   workspaceProjects: HarnessProjectRow[],
 *   workspaceType: string,
 *   workspace_id: string,
 *   workspaces: HarnessWorkspaceRow[],
 * }} HarnessEnvelopeRegistry
 */

/** The resolved workspace context a shell or session read returns. */
/** @typedef {{ permissionIds: string[], workspaceDeletion: { status: string } }} HarnessWorkspaceContext */

/** One record the public API returns under its `data` envelope. */
/** @typedef {{ client_id: string, enabledModules: string[], moduleSettings: HarnessModuleDefinition[], parent_client_id: string, priority: string, project_id: string, status: string, task_id: string, user_id: string }} HarnessPublicApiRecord */

/** One module descriptor the module registry returns, by surface. */
/** @typedef {{ dashboard: HarnessModuleSurfaceRow[], id: string, moduleId: string, navigation: HarnessModuleSurfaceRow[], publicApiEndpoints: HarnessModuleSurfaceRow[], settings: HarnessModuleSurfaceRow[], enabled?: boolean }} HarnessModuleDescriptor */

/**
 * One response the harness client resolves, derived from the request helper
 * rather than restated. `status` and `headers` are the transport shape this
 * checkpoint owns.
 *
 * `body` is `unknown`, deliberately. It arrives from `JSON.parse()`, whose
 * result is `any`, and an `any` here would silently terminate type checking
 * for every payload read in the file: annotating a callback parameter proves
 * nothing when the collection it iterates is `any`, because `.find()` on `any`
 * accepts any callback signature. Post-merge review of `0.33.33.30.7.2.2`
 * found exactly that, so the boundary is now explicit and each consumer
 * narrows what it reads through `readPayload` below.
 *
 * One required envelope covering every response is still the wrong answer and
 * was disproven earlier against this harness's roughly fifty heterogeneous
 * endpoints; the narrowing is per consumer instead.
 * @typedef {Awaited<ReturnType<typeof request>>} HarnessResponse
 */

/**
 * Per-request overrides. The harness proves both browser and API-key
 * authorization paths, so a request carries either a session cookie or a
 * bearer key.
 * @typedef {{ bearer?: string, cookie?: string }} HarnessRequestOptions
 */

/**
 * The request client every phase function drives the running app through.
 * @typedef {{
 *   delete: (url: string, options?: HarnessRequestOptions) => Promise<HarnessResponse>,
 *   get: (url: string, options?: HarnessRequestOptions) => Promise<HarnessResponse>,
 *   post: (url: string, body?: unknown, options?: HarnessRequestOptions) => Promise<HarnessResponse>,
 *   put: (url: string, body?: unknown, options?: HarnessRequestOptions) => Promise<HarnessResponse>,
 * }} HarnessApi
 */

/** One configurable module setting, as a workspace settings read returns it. */
/** @typedef {{ id: string, moduleStatus?: boolean, readOnly?: boolean, value?: unknown }} HarnessModuleSetting */

/** One module's settings block within a workspace settings payload. */
/** @typedef {{ id?: string, moduleId: string, settings: HarnessModuleSetting[] }} HarnessModuleDefinition */

/** The workspace settings record the module-settings helpers read. */
/** @typedef {{ audit?: unknown, moduleSettings?: HarnessModuleDefinition[], workspaceName?: string, workspaceType?: string }} HarnessSettings */

/** The settings payload those helpers build, keyed by module then setting. */
/** @typedef {Record<string, Record<string, unknown>>} HarnessSettingsPayload */

/**
 * One navigation entry the harness flattens when proving scoped navigation.
 * The two flatteners walk different child keys - `children` in the settings
 * navigation and `items` in the shell navigation - so both are declared
 * rather than normalised into one.
 * @typedef {{ children?: HarnessNavigationItem[], href?: string, id?: string, items?: HarnessNavigationItem[] }} HarnessNavigationItem
 */

/**
 * Read a task identity an earlier phase published onto the fixture record.
 * The three cross-phase identities exist only after their seeding phase has
 * run, so reading one too early is an ordering bug; this surfaces it instead
 * of interpolating `undefined` into a request URL.
 * @param {string | undefined} value
 * @param {string} label
 * @returns {string}
 */
function requirePublishedTaskId(value, label) {
  assert.ok(value, `${label} should have been published by an earlier phase`);
  return value;
}

/** @returns {Promise<HarnessFixtures>} */
async function seedFixtures() {
  const workspaceId = /** @type {string} */ ((await querySql("SELECT workspace_id FROM workspaces ORDER BY created_at LIMIT 1;"))[0].workspace_id);
  const superAdmin = /** @type {ProtectedRoleUser} */ (/** @type {unknown} */ ((await querySql(`
SELECT user_id, username
FROM users
WHERE home_workspace_id = ${sqlText(workspaceId)}
  AND protected_user = 'yes'
LIMIT 1;
`))[0]));
  const now = new Date().toISOString();
  const users = {
    superAdmin,
    workspaceAdmin: userFixture("workspace-admin"),
    clientAdmin: userFixture("client-admin"),
    projectAdmin: userFixture("project-admin"),
    clientUser: userFixture("client-user"),
    projectUser: userFixture("project-user"),
    externalClientUser: userFixture("external-client-user"),
    unscopedUser: userFixture("unscoped-user"),
  };
  const clients = {
    alpha: { id: `client-alpha-${randomUUID()}`, name: "Alpha Client" },
    beta: { id: `client-beta-${randomUUID()}`, name: "Beta Client" },
  };
  const projects = {
    alpha: { id: `project-alpha-${randomUUID()}`, clientId: clients.alpha.id, name: "Alpha Project" },
    beta: { id: `project-beta-${randomUUID()}`, clientId: clients.beta.id, name: "Beta Project" },
    workspace: { id: `project-workspace-${randomUUID()}`, clientId: "", name: "Workspace Project" },
  };
  const otherWorkspace = {
    id: `workspace-other-${randomUUID()}`,
    clientId: `client-other-${randomUUID()}`,
  };
  const personalWorkspace = {
    id: `workspace-personal-${randomUUID()}`,
    projectId: `project-personal-${randomUUID()}`,
  };
  const familyWorkspace = {
    id: `workspace-family-${randomUUID()}`,
    projectId: `project-family-${randomUUID()}`,
  };

  await runSql(`
${Object.values(users).filter((user) => user.userId).map((user) => userInsertSql(workspaceId, user)).join("\n")}
${Object.values(users).filter((user) => user.userId).map((user) => membershipInsertSql(workspaceId, user, now)).join("\n")}
${clientInsertSql(workspaceId, clients.alpha, now)}
${clientInsertSql(workspaceId, clients.beta, now)}
${projectInsertSql(workspaceId, projects.alpha, now)}
${projectInsertSql(workspaceId, projects.beta, now)}
${projectInsertSql(workspaceId, projects.workspace, now)}
${assignmentInsertSql(workspaceId, users.workspaceAdmin.userId, "workspace_admin", "workspace", workspaceId, now)}
${assignmentInsertSql(workspaceId, users.clientAdmin.userId, "client_admin", "client", clients.alpha.id, now)}
${assignmentInsertSql(workspaceId, users.projectAdmin.userId, "project_admin", "project", projects.alpha.id, now)}
${assignmentInsertSql(workspaceId, users.clientUser.userId, "client_user", "client", clients.alpha.id, now)}
${assignmentInsertSql(workspaceId, users.projectUser.userId, "project_user", "project", projects.alpha.id, now)}
${assignmentInsertSql(workspaceId, users.externalClientUser.userId, "client_external_user", "client", clients.alpha.id, now)}
INSERT INTO workspaces (workspace_id, name, status, workspace_type, owner_user_id, created_at, updated_at)
VALUES (${sqlText(otherWorkspace.id)}, 'Other Workspace', 'Active', 'business', ${sqlText(superAdmin.user_id)}, ${sqlText(now)}, ${sqlText(now)});
${workspaceSettingsInsertSql(otherWorkspace.id, now)}
${workspaceModuleInsertSql(otherWorkspace.id, "tasks", now)}
${workspaceModuleInsertSql(otherWorkspace.id, "time-tracking", now)}
${clientInsertSql(otherWorkspace.id, { id: otherWorkspace.clientId, name: "Other Workspace Client" }, now)}
${workspaceInsertSql(personalWorkspace.id, "Personal Harness Workspace", "personal", users.workspaceAdmin.userId, now)}
${workspaceSettingsInsertSql(personalWorkspace.id, now)}
${workspaceModuleInsertSql(personalWorkspace.id, "tasks", now)}
${workspaceModuleInsertSql(personalWorkspace.id, "time-tracking", now)}
${Object.values(users).filter((user) => user.userId).map((user) => membershipInsertSql(personalWorkspace.id, user, now)).join("\n")}
${projectInsertSql(personalWorkspace.id, { id: personalWorkspace.projectId, clientId: "", name: "Personal Workspace Project" }, now)}
${assignmentInsertSql(personalWorkspace.id, users.workspaceAdmin.userId, "workspace_admin", "workspace", personalWorkspace.id, now)}
${workspaceInsertSql(familyWorkspace.id, "Family Harness Workspace", "family", users.workspaceAdmin.userId, now)}
${workspaceSettingsInsertSql(familyWorkspace.id, now)}
${workspaceModuleInsertSql(familyWorkspace.id, "tasks", now)}
${workspaceModuleInsertSql(familyWorkspace.id, "time-tracking", now)}
${membershipInsertSql(familyWorkspace.id, users.workspaceAdmin, now)}
${projectInsertSql(familyWorkspace.id, { id: familyWorkspace.projectId, clientId: "", name: "Family Workspace Project" }, now)}
${assignmentInsertSql(familyWorkspace.id, users.workspaceAdmin.userId, "workspace_admin", "workspace", familyWorkspace.id, now)}
`);

  /** @type {Record<string, string>} */
  const sessions = {};
  for (const [key, user] of Object.entries(users)) {
    const userId = user.userId || user.user_id;
    assert.ok(userId, `harness role ${key} should resolve a user identity`);
    const username = user.username;
    sessions[key] = await createSession(workspaceId, userId, username);
  }

  sessions.personalWorkspaceAdmin = await createSession(
    personalWorkspace.id,
    users.workspaceAdmin.userId,
    users.workspaceAdmin.username,
  );
  sessions.familyWorkspaceAdmin = await createSession(
    familyWorkspace.id,
    users.workspaceAdmin.userId,
    users.workspaceAdmin.username,
  );

  return /** @type {HarnessFixtures} */ (/** @type {unknown} */ ({
    workspaceId,
    users,
    sessions,
    clients,
    projects,
    otherWorkspace,
    personalWorkspace,
    familyWorkspace,
  }));
}

/** @param {HarnessApi} api @returns {Promise<void>} */
async function runAccessGuardTests(api) {
  await expectStatus("unauthenticated browser API requests return 401", api.get("/api/clients"), 401);
  const response = await api.get("/dashboard.html");
  check("protected HTML gives unauthenticated users one branded sign-in recovery action", () => {
    assert.equal(response.status, 401);
    assert.match(String(response.body || ""), /data-recovery-kind="login-required"/);
    assert.match(String(response.body || ""), /href="\/login\.html" autofocus>Sign in<\/a>/);
  });
}

/** @param {HarnessApi} api @param {HarnessFixtures} fixtures @returns {Promise<void>} */
async function runApiKeyTests(api, fixtures) {
  await expectStatus("API key route rejects missing key", api.get("/api/v1/clients"), 401);
  await expectStatus("API key route rejects invalid key", api.get("/api/v1/clients", { bearer: "ltf_live_invalid" }), 401);

  const underscoped = await createApiKey(api, fixtures.sessions.workspaceAdmin, ["projects:read"]);
  await expectStatus("API key route rejects underscoped key", api.get("/api/v1/clients", { bearer: underscoped.rawKey }), 403);

  const revoked = await createApiKey(api, fixtures.sessions.workspaceAdmin, ["clients:read"]);
  await expectStatus(
    "workspace admin can revoke API keys",
    api.put(`/api/api-keys/${revoked.apiKey.api_key_id}/revoke`, {}, { cookie: fixtures.sessions.workspaceAdmin }),
    200,
  );
  await expectStatus("API key route rejects revoked key", api.get("/api/v1/clients", { bearer: revoked.rawKey }), 401);
  await expectStatus(
    "project user cannot create API keys",
    api.post("/api/api-keys", { name: "Denied key", scopes: ["clients:read"] }, { cookie: fixtures.sessions.projectUser }),
    403,
  );
  const personalClientKey = await createApiKey(api, fixtures.sessions.personalWorkspaceAdmin, ["clients:read", "projects:read"]);
  await expectStatus(
    "public API client reads are business-only",
    api.get("/api/v1/clients", { bearer: personalClientKey.rawKey }),
    403,
  );
  await expectStatus(
    "public API project reads remain available in personal workspaces",
    api.get("/api/v1/projects", { bearer: personalClientKey.rawKey }),
    200,
  );
  const clientReadKey = await createApiKey(api, fixtures.sessions.workspaceAdmin, ["clients:read"]);
  const clientFullKey = await createApiKey(api, fixtures.sessions.workspaceAdmin, ["clients:read", "clients:write"]);
  await expectStatus(
    "public API Client creation requires clients write scope",
    api.post("/api/v1/clients", {
      name: "Denied Public API Child Client",
      parent_client_id: fixtures.clients.alpha.id,
    }, { bearer: clientReadKey.rawKey }),
    403,
  );
  await expectStatus(
    "public API Client creation retains the shared parent-scoped service path",
    api.post("/api/v1/clients", {
      name: "Public API Child Client",
      parent_client_id: fixtures.clients.alpha.id,
    }, { bearer: clientFullKey.rawKey }),
    201,
  ).then((response) => {
    check("public API child creation keeps the requested parent", () => {
      assert.equal(readPayload(response, ["data"]).data.parent_client_id, fixtures.clients.alpha.id);
    });
  });

  const taskReadKey = await createApiKey(api, fixtures.sessions.workspaceAdmin, ["tasks:read"]);
  const taskWriteKey = await createApiKey(api, fixtures.sessions.workspaceAdmin, ["tasks:write"]);
  const taskFullKey = await createApiKey(api, fixtures.sessions.workspaceAdmin, ["tasks:read", "tasks:write"]);
  await expectStatus(
    "public API task reads require tasks read scope",
    api.get("/api/v1/tasks", { bearer: taskReadKey.rawKey }),
    200,
  );
  await expectStatus(
    "public API task writes reject read-only keys",
    api.post("/api/v1/tasks", { title: "Denied public API task" }, { bearer: taskReadKey.rawKey }),
    403,
  );
  await expectStatus(
    "public API task reads reject write-only keys",
    api.get("/api/v1/tasks", { bearer: taskWriteKey.rawKey }),
    403,
  );
  const publicTask = await expectStatus(
    "public API can create project tasks",
    api.post("/api/v1/tasks", {
      title: "Public API project task",
      project_id: fixtures.projects.alpha.id,
      assignee_ids: [fixtures.users.projectUser.userId],
      due_date: "2026-06-12",
    }, { bearer: taskFullKey.rawKey }),
    201,
  );
  fixtures.publicApiTaskId = readPayload(publicTask, ["data"]).data.task_id;
  check("public API task create inherits project client context", () => {
    assert.equal(readPayload(publicTask, ["data"]).data.project_id, fixtures.projects.alpha.id);
    assert.equal(readPayload(publicTask, ["data"]).data.client_id, fixtures.clients.alpha.id);
    assert.equal(readPayload(publicTask, ["workspace_id"]).workspace_id, fixtures.workspaceId);
  });
  await expectStatus(
    "public API can read task by id",
    api.get(`/api/v1/tasks/${encodeURIComponent(requirePublishedTaskId(fixtures.publicApiTaskId, "publicApiTaskId"))}`, { bearer: taskReadKey.rawKey }),
    200,
  ).then((response) => {
    check("public API task read returns requested task", () => {
      assert.equal(readPayload(response, ["data"]).data.task_id, requirePublishedTaskId(fixtures.publicApiTaskId, "publicApiTaskId"));
    });
  });
  await expectStatus(
    "public API can update tasks",
    api.put(`/api/v1/tasks/${encodeURIComponent(requirePublishedTaskId(fixtures.publicApiTaskId, "publicApiTaskId"))}`, {
      title: "Public API project task updated",
      priority: "urgent",
      status: "in_progress",
    }, { bearer: taskFullKey.rawKey }),
    200,
  ).then((response) => {
    check("public API task update persists lifecycle fields", () => {
      assert.equal(readPayload(response, ["data"]).data.priority, "urgent");
      assert.equal(readPayload(response, ["data"]).data.status, "in_progress");
    });
  });
  await expectStatus(
    "public API can complete tasks",
    api.post(`/api/v1/tasks/${encodeURIComponent(requirePublishedTaskId(fixtures.publicApiTaskId, "publicApiTaskId"))}/complete`, {}, { bearer: taskFullKey.rawKey }),
    200,
  );
  await expectStatus(
    "public API can reopen tasks",
    api.post(`/api/v1/tasks/${encodeURIComponent(requirePublishedTaskId(fixtures.publicApiTaskId, "publicApiTaskId"))}/reopen`, {}, { bearer: taskFullKey.rawKey }),
    200,
  );
  await expectStatus(
    "public API can archive tasks",
    api.post(`/api/v1/tasks/${encodeURIComponent(requirePublishedTaskId(fixtures.publicApiTaskId, "publicApiTaskId"))}/archive`, {}, { bearer: taskFullKey.rawKey }),
    200,
  );
  await expectStatus(
    "public API can restore tasks",
    api.post(`/api/v1/tasks/${encodeURIComponent(requirePublishedTaskId(fixtures.publicApiTaskId, "publicApiTaskId"))}/restore`, {}, { bearer: taskFullKey.rawKey }),
    200,
  );
}

/** @param {HarnessApi} api @param {HarnessFixtures} fixtures @returns {Promise<void>} */
async function runClientMutationTests(api, fixtures) {
  const client = await createClient(api, fixtures.sessions.workspaceAdmin, "Mutation Client");
  const childClient = await createClient(api, fixtures.sessions.workspaceAdmin, "Nested Child Client", {
    parent_client_id: fixtures.clients.alpha.id,
  });
  const scopedChildClient = await createClient(api, fixtures.sessions.clientAdmin, "Scoped Nested Child Client", {
    parent_client_id: fixtures.clients.alpha.id,
  });
  check("client administrator child creation keeps the authorized parent", () => {
    assert.equal(scopedChildClient.parent_client_id, fixtures.clients.alpha.id);
  });
  await expectStatus(
    "client administrator receives scoped child-create capabilities",
    api.get("/api/client-projects", { cookie: fixtures.sessions.clientAdmin }),
    200,
  ).then((response) => {
    check("client administrator has no top-level create capability", () => {
      assert.equal(readPayload(response, ["capabilities"]).capabilities?.can_create_top_level_client, false);
    });
    check("client administrator can add a child only from an administered Client row", () => {
      assert.equal(readPayload(response, ["clients"]).clients.find((candidate) => candidate.id === fixtures.clients.alpha.id)?.can_create_child, true);
      assert.equal(readPayload(response, ["clients"]).clients.some((candidate) => (
        candidate.id !== fixtures.clients.alpha.id &&
        candidate.can_create_child === true
      )), false);
    });
  });
  await expectStatus(
    "client administrator cannot create top-level clients",
    api.post("/api/clients", { name: "Denied Scoped Top-Level Client" }, { cookie: fixtures.sessions.clientAdmin }),
    403,
  );
  await expectStatus(
    "client administrator cannot create children outside their Client scope",
    api.post("/api/clients", {
      name: "Denied Cross-Scope Child Client",
      parent_client_id: fixtures.clients.beta.id,
    }, { cookie: fixtures.sessions.clientAdmin }),
    403,
  );
  await expectStatus(
    "project administrator cannot create child clients",
    api.post("/api/clients", {
      name: "Denied Project Administrator Child Client",
      parent_client_id: fixtures.clients.alpha.id,
    }, { cookie: fixtures.sessions.projectAdmin }),
    403,
  );
  const superAdminTopLevelClient = await createClient(
    api,
    fixtures.sessions.superAdmin,
    "Super Administrator Top-Level Client",
  );
  const superAdminChildClient = await createClient(
    api,
    fixtures.sessions.superAdmin,
    "Super Administrator Child Client",
    { parent_client_id: fixtures.clients.beta.id },
  );
  check("super administrator client creation remains unchanged", () => {
    assert.equal(superAdminTopLevelClient.parent_client_id, "");
    assert.equal(superAdminChildClient.parent_client_id, fixtures.clients.beta.id);
  });
  await expectStatus(
    "workspace administrator receives top-level and row-scoped create capabilities",
    api.get("/api/client-projects", { cookie: fixtures.sessions.workspaceAdmin }),
    200,
  ).then((response) => {
    check("workspace administrator create capabilities remain unchanged", () => {
      assert.equal(readPayload(response, ["capabilities"]).capabilities?.can_create_top_level_client, true);
      assert.ok(readPayload(response, ["clients"]).clients.length > 0);
      assert.ok(readPayload(response, ["clients"]).clients.every((candidate) => candidate.can_create_child === true));
    });
  });
  await expectStatus(
    "workspace admin can update clients",
    api.put(`/api/clients/${encodeURIComponent(client.id)}`, { name: "Mutation Client Updated" }, { cookie: fixtures.sessions.workspaceAdmin }),
    200,
  );
  await expectStatus(
    "client cannot become its own parent",
    api.put(`/api/clients/${encodeURIComponent(client.id)}`, { name: client.name, parent_client_id: client.id }, { cookie: fixtures.sessions.workspaceAdmin }),
    400,
  );
  await expectStatus(
    "client cannot be nested below one of its descendants",
    api.put(`/api/clients/${encodeURIComponent(fixtures.clients.alpha.id)}`, { name: fixtures.clients.alpha.name, parent_client_id: childClient.id }, { cookie: fixtures.sessions.workspaceAdmin }),
    400,
  );
  await expectStatus(
    "workspace admin can archive clients",
    api.delete(`/api/clients/${encodeURIComponent(client.id)}`, { cookie: fixtures.sessions.workspaceAdmin }),
    200,
  );
  await expectStatus(
    "project user cannot create clients",
    api.post("/api/clients", { name: "Denied Client" }, { cookie: fixtures.sessions.projectUser }),
    403,
  );
  await expectStatus(
    "personal workspace admin cannot list clients",
    api.get("/api/clients", { cookie: fixtures.sessions.personalWorkspaceAdmin }),
    403,
  );
  await expectStatus(
    "personal workspace admin cannot create clients",
    api.post("/api/clients", { name: "Denied Personal Client" }, { cookie: fixtures.sessions.personalWorkspaceAdmin }),
    403,
  );
  await expectStatus(
    "personal workspace hides clients in combined project payload",
    api.get("/api/client-projects", { cookie: fixtures.sessions.personalWorkspaceAdmin }),
    200,
  ).then((response) => {
    check("personal workspace combined payload has only workspace projects", () => {
      assert.equal(readPayload(response, ["capabilities"]).capabilities?.can_create_top_level_client, false);
      assert.equal(readPayload(response, ["clients"]).clients.length, 0);
      assert.ok(readPayload(response, ["workspaceProjects"]).workspaceProjects.some((project) => project.id === fixtures.personalWorkspace.projectId));
    });
  });
  await expectStatus(
    "personal workspace hides clients in the options projection",
    api.get("/api/client-projects?view=options", { cookie: fixtures.sessions.personalWorkspaceAdmin }),
    200,
  ).then((response) => {
    check("personal workspace options payload has only workspace projects", () => {
      assert.equal(readPayload(response, ["clients"]).clients.length, 0);
      assert.ok(readPayload(response, ["workspaceProjects"]).workspaceProjects.some((project) => project.id === fixtures.personalWorkspace.projectId));
    });
  });
}

/** @param {HarnessApi} api @param {HarnessFixtures} fixtures @returns {Promise<void>} */
async function runProjectMutationTests(api, fixtures) {
  const project = await createProject(api, fixtures.sessions.workspaceAdmin, fixtures.clients.alpha.id, "Mutation Project");
  const childProject = await createProject(api, fixtures.sessions.workspaceAdmin, fixtures.clients.alpha.id, "Nested Child Project", {
    parent_project_id: fixtures.projects.alpha.id,
  });
  await expectStatus(
    "workspace admin can update projects",
    api.put(`/api/projects/${encodeURIComponent(project.id)}`, { name: "Mutation Project Updated" }, { cookie: fixtures.sessions.workspaceAdmin }),
    200,
  );
  await expectStatus(
    "workspace admin can move projects across clients",
    api.put(`/api/projects/${encodeURIComponent(project.id)}`, { client_id: fixtures.clients.beta.id, name: "Mutation Project Moved" }, { cookie: fixtures.sessions.workspaceAdmin }),
    200,
  );
  await expectStatus(
    "workspace admin can move projects to workspace scope",
    api.put(`/api/projects/${encodeURIComponent(project.id)}`, { client_id: "", name: "Mutation Project Workspace" }, { cookie: fixtures.sessions.workspaceAdmin }),
    200,
  );
  await expectStatus(
    "personal workspace admin can create workspace projects without clients",
    api.post("/api/projects", { name: `Personal Project ${randomUUID()}` }, { cookie: fixtures.sessions.personalWorkspaceAdmin }),
    201,
  );
  await expectStatus(
    "project cannot become its own parent",
    api.put(`/api/projects/${encodeURIComponent(project.id)}`, { client_id: "", name: project.name, parent_project_id: project.id }, { cookie: fixtures.sessions.workspaceAdmin }),
    400,
  );
  await expectStatus(
    "project cannot be nested below one of its descendants",
    api.put(`/api/projects/${encodeURIComponent(fixtures.projects.alpha.id)}`, { client_id: fixtures.clients.alpha.id, name: fixtures.projects.alpha.name, parent_project_id: childProject.id }, { cookie: fixtures.sessions.workspaceAdmin }),
    400,
  );
  await expectStatus(
    "project parent must stay in the same client scope",
    api.put(`/api/projects/${encodeURIComponent(fixtures.projects.alpha.id)}`, { client_id: fixtures.clients.alpha.id, name: fixtures.projects.alpha.name, parent_project_id: fixtures.projects.beta.id }, { cookie: fixtures.sessions.workspaceAdmin }),
    400,
  );
  await expectStatus(
    "workspace admin can archive projects",
    api.delete(`/api/projects/${encodeURIComponent(project.id)}`, { cookie: fixtures.sessions.workspaceAdmin }),
    200,
  );
  await expectStatus(
    "project admin cannot move a project without current scope permission",
    api.put(`/api/projects/${encodeURIComponent(fixtures.projects.beta.id)}`, { client_id: fixtures.clients.alpha.id, name: "Denied Move" }, { cookie: fixtures.sessions.projectAdmin }),
    403,
  );
  await expectStatus(
    "project admin cannot move a project to an unauthorized target client",
    api.put(`/api/projects/${encodeURIComponent(fixtures.projects.alpha.id)}`, { client_id: fixtures.clients.beta.id, name: "Denied Target Move" }, { cookie: fixtures.sessions.projectAdmin }),
    403,
  );
}

/** @param {HarnessApi} api @param {HarnessFixtures} fixtures @returns {Promise<void>} */
async function runScopedAdminNavigationTests(api, fixtures) {
  const clientAdminShell = await expectStatus(
    "client administrator can load the scope-aware app shell",
    api.get("/api/app-shell/bootstrap", { cookie: fixtures.sessions.clientAdmin }),
    200,
  );
  const clientAdminHrefs = navigationHrefs(readPayload(clientAdminShell, ["navigation"]).navigation);
  check("client administrator receives scoped Client and Project navigation only", () => {
    assert.equal(readPayload(clientAdminShell, ["permissionHints"]).permissionHints?.clientsManage, true);
    assert.equal(readPayload(clientAdminShell, ["permissionHints"]).permissionHints?.projectsManage, true);
    assert.equal(readPayload(clientAdminShell, ["permissionHints"]).permissionHints?.roleAssignmentsDelegate, true);
    assert.ok(readPayload(clientAdminShell, ["workspaceContext"]).workspaceContext?.permissionIds?.includes("clients.manage"));
    assert.ok(readPayload(clientAdminShell, ["workspaceContext"]).workspaceContext?.permissionIds?.includes("projects.manage"));
    assert.equal(readPayload(clientAdminShell, ["workspaceContext"]).workspaceContext?.permissionIds?.includes("workspace_settings.manage"), false);
    assert.ok(clientAdminHrefs.has("clients.html"));
    assert.ok(clientAdminHrefs.has("projects.html"));
    assert.ok(clientAdminHrefs.has("role-assignments.html"));
    assert.equal(clientAdminHrefs.has("user-admin.html"), false);
    assert.equal(clientAdminHrefs.has("workspace-settings.html"), false);
    assert.equal(clientAdminHrefs.has("audit-log.html"), false);
    assert.equal(clientAdminHrefs.has("api-keys.html"), false);
    const clientAdminSettingsGroup = readPayload(clientAdminShell, ["navigation"]).navigation
      .find((item) => item.id === "settings")?.items
      ?.find((item) => item.id === "admin-settings-group");
    assert.ok(clientAdminSettingsGroup?.items, "the Client Administrator shell should expose the admin settings group");
    assert.equal(clientAdminSettingsGroup.items.some((item) => item.id === "module-settings-group"), false);
  });

  const projectAdminShell = await expectStatus(
    "project administrator can load the scope-aware app shell",
    api.get("/api/app-shell/bootstrap", { cookie: fixtures.sessions.projectAdmin }),
    200,
  );
  const projectAdminHrefs = navigationHrefs(readPayload(projectAdminShell, ["navigation"]).navigation);
  check("project administrator receives Project navigation without Client or workspace administration", () => {
    assert.equal(readPayload(projectAdminShell, ["permissionHints"]).permissionHints?.clientsManage, false);
    assert.equal(readPayload(projectAdminShell, ["permissionHints"]).permissionHints?.projectsManage, true);
    assert.equal(readPayload(projectAdminShell, ["permissionHints"]).permissionHints?.roleAssignmentsDelegate, true);
    assert.equal(readPayload(projectAdminShell, ["workspaceContext"]).workspaceContext?.permissionIds?.includes("clients.manage"), false);
    assert.ok(readPayload(projectAdminShell, ["workspaceContext"]).workspaceContext?.permissionIds?.includes("projects.manage"));
    assert.equal(projectAdminHrefs.has("clients.html"), false);
    assert.ok(projectAdminHrefs.has("projects.html"));
    assert.ok(projectAdminHrefs.has("role-assignments.html"));
    assert.equal(projectAdminHrefs.has("user-admin.html"), false);
    assert.equal(projectAdminHrefs.has("workspace-settings.html"), false);
    assert.equal(projectAdminHrefs.has("audit-log.html"), false);
    assert.equal(projectAdminHrefs.has("api-keys.html"), false);
  });

  const clientUserShell = await expectStatus(
    "role without management grants can load the ordinary app shell",
    api.get("/api/app-shell/bootstrap", { cookie: fixtures.sessions.clientUser }),
    200,
  );
  const clientUserHrefs = navigationHrefs(readPayload(clientUserShell, ["navigation"]).navigation);
  check("role without management grants receives no Client or Project Settings links", () => {
    assert.equal(readPayload(clientUserShell, ["permissionHints"]).permissionHints?.clientsManage, false);
    assert.equal(readPayload(clientUserShell, ["permissionHints"]).permissionHints?.projectsManage, false);
    assert.equal(readPayload(clientUserShell, ["permissionHints"]).permissionHints?.roleAssignmentsDelegate, false);
    assert.equal(readPayload(clientUserShell, ["workspaceContext"]).workspaceContext?.permissionIds?.includes("clients.manage"), false);
    assert.equal(readPayload(clientUserShell, ["workspaceContext"]).workspaceContext?.permissionIds?.includes("projects.manage"), false);
    assert.equal(clientUserHrefs.has("clients.html"), false);
    assert.equal(clientUserHrefs.has("projects.html"), false);
    assert.equal(clientUserHrefs.has("role-assignments.html"), false);
  });

  const clientAdminSession = await expectStatus(
    "session bootstrap carries the same any-scope browser permission set",
    api.get("/api/session", { cookie: fixtures.sessions.clientAdmin }),
    200,
  );
  check("session workspace context preserves scoped grants without workspace elevation", () => {
    const permissionIds = readPayload(clientAdminSession, ["user"]).user?.workspaceContext?.permissionIds || [];
    assert.ok(permissionIds.includes("clients.manage"));
    assert.ok(permissionIds.includes("projects.manage"));
    assert.equal(permissionIds.includes("workspace_settings.manage"), false);
  });

  const workspaceAdminShell = await expectStatus(
    "workspace administrator can load unchanged administrative navigation",
    api.get("/api/app-shell/bootstrap", { cookie: fixtures.sessions.workspaceAdmin }),
    200,
  );
  const workspaceAdminHrefs = navigationHrefs(readPayload(workspaceAdminShell, ["navigation"]).navigation);
  check("workspace administrator navigation remains complete", () => {
    for (const href of [
      "clients.html",
      "projects.html",
      "role-assignments.html",
      "user-admin.html",
      "workspace-settings.html",
      "api-keys.html",
      "audit-log.html",
    ]) {
      assert.ok(workspaceAdminHrefs.has(href), `workspace administrator should retain ${href}`);
    }
  });

  await expectStatus(
    "client administrator can load dedicated Role Assignments",
    api.get("/role-assignments.html", { cookie: fixtures.sessions.clientAdmin }),
    200,
  );
  await expectStatus(
    "project administrator can load dedicated Role Assignments",
    api.get("/role-assignments.html", { cookie: fixtures.sessions.projectAdmin }),
    200,
  );
  await expectStatus(
    "workspace administrator can load dedicated Role Assignments",
    api.get("/role-assignments.html", { cookie: fixtures.sessions.workspaceAdmin }),
    200,
  );
  await expectStatus(
    "role without roles.assign cannot load dedicated Role Assignments",
    api.get("/role-assignments.html", { cookie: fixtures.sessions.clientUser }),
    403,
  );
  await expectStatus(
    "client administrator still cannot load full User Admin",
    api.get("/user-admin.html", { cookie: fixtures.sessions.clientAdmin }),
    403,
  );
  await expectStatus(
    "workspace administrator retains full User Admin",
    api.get("/user-admin.html", { cookie: fixtures.sessions.workspaceAdmin }),
    200,
  );
  await expectStatus(
    "client administrator can load protected Project Settings",
    api.get("/projects.html", { cookie: fixtures.sessions.clientAdmin }),
    200,
  );
  await expectStatus(
    "project administrator can load protected Project Settings",
    api.get("/projects.html", { cookie: fixtures.sessions.projectAdmin }),
    200,
  );
  await expectStatus(
    "client administrator can load protected Client Settings",
    api.get("/clients.html", { cookie: fixtures.sessions.clientAdmin }),
    200,
  );
  await expectStatus(
    "project administrator cannot load Client Settings",
    api.get("/clients.html", { cookie: fixtures.sessions.projectAdmin }),
    403,
  );
  await expectStatus(
    "role without projects.manage cannot load Project Settings",
    api.get("/projects.html", { cookie: fixtures.sessions.clientUser }),
    403,
  );
  await expectStatus(
    "role without clients.manage cannot load Client Settings",
    api.get("/clients.html", { cookie: fixtures.sessions.clientUser }),
    403,
  );

  const clientAdminProjects = await expectStatus(
    "client administrator receives only scoped Project Settings data",
    api.get("/api/projects?status=All", { cookie: fixtures.sessions.clientAdmin }),
    200,
  );
  check("client administrator project rows are scoped and actionable", () => {
    assert.equal(readPayload(clientAdminProjects, ["capabilities"]).capabilities?.can_create_workspace_project, false);
    assert.ok(readPayload(clientAdminProjects, ["projects"]).projects.some((project) => project.id === fixtures.projects.alpha.id));
    assert.ok(readPayload(clientAdminProjects, ["projects"]).projects.every((project) => project.client_id === fixtures.clients.alpha.id));
    assert.ok(readPayload(clientAdminProjects, ["projects"]).projects.every((project) => project.can_manage === true));
    assert.equal(readPayload(clientAdminProjects, ["projects"]).projects.some((project) => project.id === fixtures.projects.beta.id), false);
    assert.equal(readPayload(clientAdminProjects, ["projects"]).projects.some((project) => project.id === fixtures.projects.workspace.id), false);
  });

  const projectAdminProjects = await expectStatus(
    "project administrator receives only assigned Project Settings data",
    api.get("/api/projects?status=All", { cookie: fixtures.sessions.projectAdmin }),
    200,
  );
  check("project administrator project row is scoped and actionable without create authority", () => {
    assert.equal(readPayload(projectAdminProjects, ["capabilities"]).capabilities?.can_create_workspace_project, false);
    assert.deepEqual(
      readPayload(projectAdminProjects, ["projects"]).projects.map((project) => project.id),
      [fixtures.projects.alpha.id],
    );
    assert.equal(readPayload(projectAdminProjects, ["projects"]).projects[0]?.can_manage, true);
  });

  const clientAdminData = await expectStatus(
    "client administrator receives scoped project-create targets",
    api.get("/api/client-projects", { cookie: fixtures.sessions.clientAdmin }),
    200,
  );
  check("client administrator can create and manage projects only in the administered Client", () => {
    assert.equal(readPayload(clientAdminData, ["capabilities"]).capabilities?.can_create_workspace_project, false);
    assert.deepEqual(readPayload(clientAdminData, ["clients"]).clients.map((client) => client.id), [fixtures.clients.alpha.id]);
    assert.equal(readPayload(clientAdminData, ["clients"]).clients[0]?.can_create_project, true);
    assert.equal(readPayload(clientAdminData, ["clients"]).clients[0]?.can_manage_projects, true);
    assert.equal(readPayload(clientAdminData, ["clients"]).clients[0]?.projects[0]?.can_manage, true);
  });

  const projectAdminData = await expectStatus(
    "project administrator receives a non-creatable scoped Project view",
    api.get("/api/client-projects", { cookie: fixtures.sessions.projectAdmin }),
    200,
  );
  check("project administrator receives no Client or workspace project-create target", () => {
    assert.equal(readPayload(projectAdminData, ["capabilities"]).capabilities?.can_create_workspace_project, false);
    assert.deepEqual(readPayload(projectAdminData, ["clients"]).clients.map((client) => client.id), [fixtures.clients.alpha.id]);
    assert.equal(readPayload(projectAdminData, ["clients"]).clients[0]?.can_create_project, false);
    assert.equal(readPayload(projectAdminData, ["clients"]).clients[0]?.can_manage, false);
    assert.equal(readPayload(projectAdminData, ["clients"]).clients[0]?.can_manage_projects, false);
    assert.equal(readPayload(projectAdminData, ["clients"]).clients[0]?.projects[0]?.can_manage, true);
  });
}

/** @param {HarnessApi} api @param {HarnessFixtures} fixtures @returns {Promise<void>} */
async function runTaskMutationTests(api, fixtures) {
  const workspaceTask = await expectStatus(
    "workspace admin can create workspace-only tasks",
    api.post("/api/tasks", {
      title: "Workspace task",
      priority: "high",
      due_date: "2026-06-05",
    }, { cookie: fixtures.sessions.workspaceAdmin }),
    201,
  );
  check("workspace-only task has no client or project scope", () => {
    assert.equal(readPayload(workspaceTask, ["task"]).task.client_id, "");
    assert.equal(readPayload(workspaceTask, ["task"]).task.project_id, "");
  });

  const scopedTask = await expectStatus(
    "project user can create assigned project tasks",
    api.post("/api/tasks", {
      title: "Project scoped task",
      project_id: fixtures.projects.alpha.id,
      assignee_ids: [fixtures.users.projectUser.userId],
    }, { cookie: fixtures.sessions.projectUser }),
    201,
  );
  check("project task inherits client context from project", () => {
    assert.equal(readPayload(scopedTask, ["task"]).task.project_id, fixtures.projects.alpha.id);
    assert.equal(readPayload(scopedTask, ["task"]).task.client_id, fixtures.clients.alpha.id);
    assert.deepEqual(readPayload(scopedTask, ["task"]).task.assignee_ids, [fixtures.users.projectUser.userId]);
  });
  const timedOverdue = localPastMinuteDue();
  const timedOverdueTask = await expectStatus(
    "workspace admin can create a same-day timed overdue task",
    api.post("/api/tasks", {
      title: "Same-day timed overdue task",
      project_id: fixtures.projects.alpha.id,
      assignee_ids: [fixtures.users.projectUser.userId],
      due_date: timedOverdue.date,
      due_time: timedOverdue.time,
    }, { cookie: fixtures.sessions.workspaceAdmin }),
    201,
  );
  await expectStatus(
    "dashboard task summary respects due time for overdue tasks",
    api.get("/api/tasks/dashboard-summary", { cookie: fixtures.sessions.projectUser }),
    200,
  ).then((response) => {
    check("same-day timed overdue task is attention, not upcoming", () => {
      const attentionIds = readPayload(response, ["attentionRows"]).attentionRows.map((task) => task.task_id);
      const upcomingIds = readPayload(response, ["upcomingRows"]).upcomingRows.map((task) => task.task_id);
      assert.ok(attentionIds.includes(readPayload(timedOverdueTask, ["task"]).task.task_id));
      assert.equal(upcomingIds.includes(readPayload(timedOverdueTask, ["task"]).task.task_id), false);
    });
  });

  // The Tasks contribution grants client_external_user only tasks.view. The
  // database role-seed-scope-convergence regression owns the separate contract
  // that module defaults converge into the persisted role_permissions table;
  // what these prove is the corresponding behavior over HTTP, which no probe
  // in this matrix covered before 0.33.33.30.7.2.3.
  await expectStatus(
    "external client user can read tasks in its scoped client",
    api.get("/api/tasks", { cookie: fixtures.sessions.externalClientUser }),
    200,
  ).then((response) => {
    check("external client user Task reads stay inside its authorized Client scope", () => {
      // 0.33.33.30.7.2.3 proved this read returns 200. That showed the role
      // has access without showing what it receives, so a scope regression
      // that widened the result set would still have passed. These assert the
      // containment half, and the expectation is taken from the live
      // implementation rather than a policy this product does not claim: the
      // role is assigned client_external_user scoped to the alpha Client, and
      // the endpoint returns only that Client's Tasks.
      const visible = readPayload(response, ["tasks"]).tasks;
      const visibleIds = visible.map((task) => task.task_id);
      assert.ok(
        visibleIds.includes(readPayload(scopedTask, ["task"]).task.task_id),
        "the external client user should see the Task in its authorized Client and project",
      );
      assert.equal(
        visibleIds.includes(readPayload(workspaceTask, ["task"]).task.task_id),
        false,
        "the workspace-only Task carries no Client and must stay outside the external Client scope",
      );
      assert.ok(visible.length > 0, "the scoped read should not be empty, or containment would prove nothing");
      assert.deepEqual(
        [...new Set(visible.map((task) => task.client_id))],
        [fixtures.clients.alpha.id],
        "every Task the external client user can see must belong to its authorized Client",
      );
    });
  });
  await expectStatus(
    "external client user cannot create tasks",
    api.post("/api/tasks", {
      title: "Denied external client task",
      project_id: fixtures.projects.alpha.id,
    }, { cookie: fixtures.sessions.externalClientUser }),
    403,
  );
  await expectStatus(
    "external client user cannot edit tasks it does not own",
    api.put(`/api/tasks/${encodeURIComponent(readPayload(scopedTask, ["task"]).task.task_id)}`, {
      title: "Denied external client edit",
    }, { cookie: fixtures.sessions.externalClientUser }),
    403,
  );

  await expectStatus(
    "project user cannot create tasks outside assigned project",
    api.post("/api/tasks", {
      title: "Denied project task",
      project_id: fixtures.projects.beta.id,
    }, { cookie: fixtures.sessions.projectUser }),
    403,
  );
  await expectStatus(
    "project user can complete own assigned tasks",
    api.post(`/api/tasks/${encodeURIComponent(readPayload(scopedTask, ["task"]).task.task_id)}/complete`, {}, { cookie: fixtures.sessions.projectUser }),
    200,
  );
  await expectStatus(
    "project user cannot archive tasks",
    api.post(`/api/tasks/${encodeURIComponent(readPayload(scopedTask, ["task"]).task.task_id)}/archive`, {}, { cookie: fixtures.sessions.projectUser }),
    403,
  );
  await expectStatus(
    "workspace admin can archive tasks",
    api.post(`/api/tasks/${encodeURIComponent(readPayload(scopedTask, ["task"]).task.task_id)}/archive`, {}, { cookie: fixtures.sessions.workspaceAdmin }),
    200,
  );
  await expectStatus(
    "workspace admin can restore tasks",
    api.post(`/api/tasks/${encodeURIComponent(readPayload(scopedTask, ["task"]).task.task_id)}/restore`, {}, { cookie: fixtures.sessions.workspaceAdmin }),
    200,
  );
  await expectStatus(
    "workspace admin can bulk update task priority",
    api.post("/api/tasks/bulk", {
      action: "priority",
      priority: "urgent",
      task_ids: [readPayload(scopedTask, ["task"]).task.task_id],
    }, { cookie: fixtures.sessions.workspaceAdmin }),
    200,
  ).then((response) => {
    check("bulk priority update returns updated task", () => {
      assert.equal(readPayload(response, ["tasks"]).tasks[0].priority, "urgent");
      assert.equal(readPayload(response, ["errors"]).errors.length, 0);
    });
  });
  await expectStatus(
    "project user bulk Project move reports denied destination scope",
    api.post("/api/tasks/bulk", {
      action: "project_assign",
      project_id: fixtures.projects.beta.id,
      task_ids: [readPayload(scopedTask, ["task"]).task.task_id],
    }, { cookie: fixtures.sessions.projectUser }),
    200,
  ).then((response) => {
    check("bulk Project move keeps destination authority server-owned", () => {
      assert.equal(readPayload(response, ["tasks"]).tasks.length, 0);
      assert.equal(readPayload(response, ["errors"]).errors[0].status, 403);
    });
  });
  await expectStatus(
    "workspace admin can bulk assign Task Project and derived Client",
    api.post("/api/tasks/bulk", {
      action: "project_assign",
      client_id: fixtures.clients.beta.id,
      project_id: fixtures.projects.beta.id,
      task_ids: [readPayload(workspaceTask, ["task"]).task.task_id],
    }, { cookie: fixtures.sessions.workspaceAdmin }),
    200,
  ).then((response) => {
    check("bulk Project assignment returns canonical destination context", () => {
      assert.equal(readPayload(response, ["tasks"]).tasks[0].project_id, fixtures.projects.beta.id);
      assert.equal(readPayload(response, ["tasks"]).tasks[0].client_id, fixtures.clients.beta.id);
      assert.equal(readPayload(response, ["errors"]).errors.length, 0);
    });
  });
  await expectStatus(
    "workspace admin can bulk replace task assignees",
    api.post("/api/tasks/bulk", {
      action: "assignee_replace",
      assignee_ids: [fixtures.users.workspaceAdmin.userId],
      task_ids: [readPayload(scopedTask, ["task"]).task.task_id],
    }, { cookie: fixtures.sessions.workspaceAdmin }),
    200,
  ).then((response) => {
    check("bulk assignee replace returns exact assignee list", () => {
      assert.deepEqual(readPayload(response, ["tasks"]).tasks[0].assignee_ids, [fixtures.users.workspaceAdmin.userId]);
      assert.equal(readPayload(response, ["errors"]).errors.length, 0);
    });
  });
  await expectStatus(
    "workspace admin can bulk restore task assignee",
    api.post("/api/tasks/bulk", {
      action: "assignee_replace",
      assignee_ids: [fixtures.users.projectUser.userId],
      task_ids: [readPayload(scopedTask, ["task"]).task.task_id],
    }, { cookie: fixtures.sessions.workspaceAdmin }),
    200,
  );
  await expectStatus(
    "project user bulk archive reuses task archive permission",
    api.post("/api/tasks/bulk", {
      action: "archive",
      task_ids: [readPayload(scopedTask, ["task"]).task.task_id],
    }, { cookie: fixtures.sessions.projectUser }),
    200,
  ).then((response) => {
    check("bulk archive reports denied selected task", () => {
      assert.equal(readPayload(response, ["tasks"]).tasks.length, 0);
      assert.equal(readPayload(response, ["errors"]).errors[0].status, 403);
    });
  });
  await expectStatus(
    "workspace admin can save workspace task reminder defaults",
    api.put("/api/settings", {
      workspaceName: "Harness Business Workspace",
      workspaceType: "business",
      moduleSettings: {
        tasks: {
          reminderDateTimeHours1: 1,
          reminderDateTimeHours2: 3,
          reminderDateOnlyDays1: 1,
          reminderDateOnlyDays2: 2,
        },
      },
    }, { cookie: fixtures.sessions.workspaceAdmin }),
    200,
  ).then((response) => {
    check("workspace task reminder defaults are returned from settings save", () => {
      const taskSettings = readPayload(response, ["data"]).data.moduleSettings
        .find((moduleDefinition) => moduleDefinition.moduleId === "tasks")?.settings || [];
      assert.equal(taskSettings.find((setting) => setting.id === "reminderDateTimeHours1")?.value, 1);
      assert.equal(taskSettings.find((setting) => setting.id === "reminderDateTimeHours2")?.value, 3);
      assert.equal(taskSettings.find((setting) => setting.id === "reminderDateOnlyDays1")?.value, 1);
      assert.equal(taskSettings.find((setting) => setting.id === "reminderDateOnlyDays2")?.value, 2);
    });
  });
  await expectStatus(
    "workspace admin can save client task reminder defaults",
    api.put(`/api/clients/${fixtures.clients.alpha.id}`, {
      name: "Alpha Client",
      status: "Active",
      billable: "yes",
      taskReminderPolicy: {
        inherited: false,
        dateTime: [90, 240],
        dateOnly: [2880, 4320],
      },
    }, { cookie: fixtures.sessions.workspaceAdmin }),
    200,
  );
  await expectStatus(
    "workspace admin can save project task reminder defaults",
    api.put(`/api/projects/${fixtures.projects.alpha.id}`, {
      name: "Alpha Project",
      status: "Active",
      client_id: fixtures.clients.alpha.id,
      billable: "yes",
      confirm_downstream_update: true,
      taskReminderPolicy: {
        inherited: false,
        dateTime: [120, 360],
        dateOnly: [1440, 4320],
      },
    }, { cookie: fixtures.sessions.workspaceAdmin }),
    200,
  );
  await expectStatus(
    "workspace admin can save task reminder overrides",
    api.put(`/api/tasks/${encodeURIComponent(readPayload(scopedTask, ["task"]).task.task_id)}`, {
      title: "Project scoped task",
      project_id: fixtures.projects.alpha.id,
      reminderOverrideEnabled: true,
      reminderPolicy: {
        dateTime: [30, 60],
        dateOnly: [1440, 2880],
      },
    }, { cookie: fixtures.sessions.workspaceAdmin }),
    200,
  ).then((response) => {
    check("task reminder override is returned with effective policy", () => {
      assert.equal(readPayload(response, ["task"]).task.reminderDetails.overrideEnabled, true);
      assert.deepEqual(readPayload(response, ["task"]).task.reminderDetails.effectivePolicy.offsets.dateTime, [30, 60]);
    });
  });
  const recurringTask = await expectStatus(
    "workspace admin can create recurring project tasks",
    api.post("/api/tasks", {
      title: "Recurring project task",
      project_id: fixtures.projects.alpha.id,
      due_date: localDateOffset(0),
      assignee_ids: [fixtures.users.projectUser.userId],
      recurrence: {
        enabled: true,
        frequency: "DAILY",
        interval: 1,
        endDate: localDateOffset(2),
      },
    }, { cookie: fixtures.sessions.workspaceAdmin }),
    201,
  );
  check("recurring task returns recurrence details", () => {
    assert.ok(readPayload(recurringTask, ["task"]).task.recurrence_template_id);
    assert.equal(readPayload(recurringTask, ["task"]).task.recurrence_instance_date, localDateOffset(0));
    assert.equal(readPayload(recurringTask, ["task"]).task.recurrenceDetails.frequency, "DAILY");
  });
  const completedRecurringTask = await expectStatus(
    "project user can complete own recurring task and create next instance",
    api.post(`/api/tasks/${encodeURIComponent(readPayload(recurringTask, ["task"]).task.task_id)}/complete`, {}, { cookie: fixtures.sessions.projectUser }),
    200,
  );
  await drainQueuedSearchJobs();
  const nextRecurringTask = await readRecurrenceInstance(
    fixtures.workspaceId,
    readPayload(recurringTask, ["task"]).task.recurrence_template_id,
    localDateOffset(1),
  );
  check("recurring completion creates next dated task", () => {
    assert.equal(readPayload(completedRecurringTask, ["task"]).task.status, "complete");
    assert.equal(readPayload(completedRecurringTask, ["createdTask"]).createdTask, null);
    assert.equal(readPayload(completedRecurringTask, ["recurrenceJob"]).recurrenceJob.queued, true);
    assert.equal(nextRecurringTask.due_date, localDateOffset(1));
    assert.equal(nextRecurringTask.recurrence_template_id, readPayload(recurringTask, ["task"]).task.recurrence_template_id);
  });
  await expectStatus(
    "recurring completion retry reuses existing next instance",
    api.post(`/api/tasks/${encodeURIComponent(readPayload(recurringTask, ["task"]).task.task_id)}/complete`, {}, { cookie: fixtures.sessions.projectUser }),
    200,
  ).then((response) => {
    return drainQueuedSearchJobs().then(async () => ({ response, nextCount: await countRecurrenceInstances(
      fixtures.workspaceId,
      readPayload(recurringTask, ["task"]).task.recurrence_template_id,
      localDateOffset(1),
    ) }));
  }).then(({ response, nextCount }) => {
    check("recurring retry does not duplicate next instance", () => {
      assert.equal(readPayload(response, ["createdTask"]).createdTask, null);
      assert.equal(nextCount, 1);
    });
  });
  const calendarRangeStart = localDateOffset(0);
  const calendarRangeEnd = localDateOffset(2);
  await expectStatus(
    "task calendar API returns scoped due-date tasks",
    api.get(`/api/tasks/calendar?start=${calendarRangeStart}&end=${calendarRangeEnd}`, { cookie: fixtures.sessions.projectUser }),
    200,
  ).then((response) => {
    check("task calendar payload is calendar-ready and scope filtered", () => {
      const taskIds = readPayload(response, ["tasks"]).tasks.map((task) => task.task_id);
      assert.ok(!taskIds.includes(readPayload(recurringTask, ["task"]).task.task_id), "completed recurrence instances stay out of the active calendar default");
      assert.ok(taskIds.includes(nextRecurringTask.task_id));
      assert.ok(!taskIds.includes(readPayload(workspaceTask, ["task"]).task.task_id));
      const calendarTask = readPayload(response, ["tasks"]).tasks.find((task) => task.task_id === nextRecurringTask.task_id);
      assert.ok(calendarTask, "the calendar payload should carry the recurring task");
      assert.equal(calendarTask.id, nextRecurringTask.task_id);
      assert.equal(calendarTask.startDate, nextRecurringTask.due_date);
      assert.equal(calendarTask.allDay, true);
      assert.ok(!("source" in calendarTask), "calendar permission reads keep the lean renderer row");
      assert.ok(!("url" in calendarTask), "calendar permission reads do not expose unused navigation fields");
    });
  });
  await expectStatus(
    "dashboard task panels include scoped task links",
    api.get("/api/tasks/dashboard-summary", { cookie: fixtures.sessions.projectUser }),
    200,
  ).then((response) => {
    check("dashboard task summary respects task scope and exposes Dashboard-safe handoffs", () => {
      const upcomingIds = readPayload(response, ["upcomingRows"]).upcomingRows.map((task) => task.task_id);
      assert.ok(upcomingIds.includes(nextRecurringTask.task_id));
      assert.ok(!upcomingIds.includes(readPayload(workspaceTask, ["task"]).task.task_id));
      const firstUpcomingRow = readPayload(response, ["upcomingRows"]).upcomingRows[0];
      assert.equal(
        firstUpcomingRow.action.href,
        `workbench.html?taskId=${encodeURIComponent(firstUpcomingRow.task_id)}`,
        "per-task Open Workbench handoffs must deep-link into Task Focus for that row's task",
      );
      assert.equal(readPayload(response, ["actions"]).actions.workbench.href, "workbench.html");
      assert.equal(readPayload(response, ["actions"]).actions.tasks.href, "tasks.html");
    });
  });
  await expectStatus(
    "dashboard bootstrap advertises the task summary contribution metadata",
    api.get("/api/dashboard", { cookie: fixtures.sessions.projectUser }),
    200,
  ).then((response) => {
    check("dashboard task summary contribution is metadata-only and module-routed", () => {
      assert.ok(!Object.hasOwn(payloadRecord(response), "tasks"));
      assert.ok(readPayload(response, ["extensionPoints"]).extensionPoints.dashboardPanels.some((panel) => (
        panel.id === "tasks-needs-attention" &&
        panel.renderer === "tasks.needs-attention" &&
        panel.placement === "attention" &&
        panel.dataRoute === "/api/tasks/dashboard-summary"
      )));
      assert.ok(readPayload(response, ["extensionPoints"]).extensionPoints.dashboardPanels.some((panel) => (
        panel.id === "tasks-today-upcoming" &&
        panel.renderer === "tasks.today-upcoming" &&
        panel.placement === "today" &&
        panel.dataRoute === "/api/tasks/dashboard-summary"
      )));
      assert.ok(readPayload(response, ["extensionPoints"]).extensionPoints.dashboardPanels.some((panel) => (
        panel.id === "task-summary" &&
        panel.renderer === "tasks.pressure" &&
        panel.placement === "main" &&
        panel.dataRoute === "/api/tasks/dashboard-summary"
      )));
    });
  });
  const timerTask = await expectStatus(
    "project user can create task timer eligible project task",
    api.post("/api/tasks", {
      title: "Task timer project task",
      project_id: fixtures.projects.alpha.id,
      assignee_ids: [fixtures.users.projectUser.userId],
    }, { cookie: fixtures.sessions.projectUser }),
    201,
  );
  fixtures.taskTimerTaskId = readPayload(timerTask, ["task"]).task.task_id;
  const timerGateTask = await expectStatus(
    "project user can create task timer gate test task",
    api.post("/api/tasks", {
      title: "Task timer gate task",
      project_id: fixtures.projects.alpha.id,
      assignee_ids: [fixtures.users.projectUser.userId],
    }, { cookie: fixtures.sessions.projectUser }),
    201,
  );
  fixtures.taskTimerGateTaskId = readPayload(timerGateTask, ["task"]).task.task_id;
  await expectStatus(
    "project user can start task timer",
    api.put(`/api/tasks/${encodeURIComponent(readPayload(timerTask, ["task"]).task.task_id)}/timer`, {
      timer_status: "running",
      accumulated_elapsed_seconds: 5,
      last_active_start_time: new Date().toISOString(),
    }, { cookie: fixtures.sessions.projectUser }),
    200,
  ).then((response) => {
    check("task timer returns active timer state", () => {
      assert.equal(readPayload(response, ["timer"]).timer.task_id, readPayload(timerTask, ["task"]).task.task_id);
      assert.equal(readPayload(response, ["timer"]).timer.timer_status, "running");
    });
  });
  await expectStatus(
    "dashboard attention includes running task timer",
    api.get("/api/tasks/dashboard-summary", { cookie: fixtures.sessions.projectUser }),
    200,
  ).then((response) => {
    check("running task timer is a deduped attention signal", () => {
      const timerRow = readPayload(response, ["attentionRows"]).attentionRows.find((row) => row.task_id === readPayload(timerTask, ["task"]).task.task_id);
      assert.ok(timerRow);
      assert.ok(timerRow.reasons.includes("Timer running"));
      assert.equal(timerRow.action.href, `workbench.html?taskId=${encodeURIComponent(timerRow.task_id)}`);
    });
  });
  await assertUnifiedTimerState({
    label: "task timer is stored in unified active timer table",
    workspaceId: fixtures.workspaceId,
    userId: fixtures.users.projectUser.userId,
    expected: {
      source_module_id: "tasks",
      source_type: "task",
      source_id: readPayload(timerTask, ["task"]).task.task_id,
      timer_status: "running",
    },
  });
  await expectStatus(
    "tasks cannot complete while task timer is active",
    api.post(`/api/tasks/${encodeURIComponent(readPayload(timerTask, ["task"]).task.task_id)}/complete`, {}, { cookie: fixtures.sessions.projectUser }),
    400,
  );
  await expectStatus(
    "starting normal timer pauses running task timer",
    api.put("/api/active-timers/task-mutual", timerPayload(fixtures.projects.alpha.id, {
      timer_status: "running",
      accumulated_elapsed_seconds: 3,
      last_active_start_time: new Date().toISOString(),
    }), { cookie: fixtures.sessions.projectUser }),
    200,
  );
  await assertUnifiedTimerState({
    label: "manual timer is stored in unified active timer table",
    workspaceId: fixtures.workspaceId,
    userId: fixtures.users.projectUser.userId,
    expected: {
      source_type: "manual",
      timer_slot: "task-mutual",
      timer_status: "running",
    },
  });
  await expectStatus(
    "project user can list task timers",
    api.get("/api/tasks/timers", { cookie: fixtures.sessions.projectUser }),
    200,
  ).then((response) => {
    check("normal timer start paused task timer", () => {
      const timer = readPayload(response, ["timers"]).timers.find((item) => item.task_id === readPayload(timerTask, ["task"]).task.task_id);
      assert.ok(timer, "the timers payload should carry the seeded timer");
      assert.equal(timer.timer_status, "paused");
    });
  });
  await expectStatus(
    "dashboard attention includes paused task timer",
    api.get("/api/tasks/dashboard-summary", { cookie: fixtures.sessions.projectUser }),
    200,
  ).then((response) => {
    check("paused task timer is a deduped attention signal", () => {
      const timerRow = readPayload(response, ["attentionRows"]).attentionRows.find((row) => row.task_id === readPayload(timerTask, ["task"]).task.task_id);
      assert.ok(timerRow);
      assert.ok(timerRow.reasons.includes("Timer paused"));
      assert.equal(timerRow.action.href, `workbench.html?taskId=${encodeURIComponent(timerRow.task_id)}`);
    });
  });
  await assertUnifiedTimerState({
    label: "normal timer start pauses sourced task timer in unified table",
    workspaceId: fixtures.workspaceId,
    userId: fixtures.users.projectUser.userId,
    expected: {
      source_module_id: "tasks",
      source_type: "task",
      source_id: readPayload(timerTask, ["task"]).task.task_id,
      timer_status: "paused",
    },
  });
  await expectStatus(
    "starting task timer pauses normal active timer",
    api.put(`/api/tasks/${encodeURIComponent(readPayload(timerTask, ["task"]).task.task_id)}/timer`, {
      timer_status: "running",
      accumulated_elapsed_seconds: 8,
      last_active_start_time: new Date().toISOString(),
    }, { cookie: fixtures.sessions.projectUser }),
    200,
  );
  await expectStatus(
    "project user can list active timers after task timer starts",
    api.get("/api/active-timers", { cookie: fixtures.sessions.projectUser }),
    200,
  ).then((response) => {
    check("task timer start paused normal timer", () => {
      const timer = readPayload(response, ["timers"]).timers.find((item) => item.timer_slot === "task-mutual");
      assert.ok(timer, "the timers payload should carry the seeded timer");
      assert.equal(timer.timer_status, "paused");
    });
  });
  await expectStatus(
    "project user can load Workbench bootstrap",
    api.get("/api/workbench/bootstrap", { cookie: fixtures.sessions.projectUser }),
    200,
  ).then((response) => {
    check("Workbench bootstrap returns generic module state and source registry", () => {
      assert.equal(asModuleMap(readPayload(response, ["modules"]).modules).tasks.enabled, true);
      assert.equal(asModuleMap(readPayload(response, ["modules"]).modules)["time-tracking"].enabled, true);
      assert.equal(Object.hasOwn(asModuleMap(readPayload(response, ["modules"]).modules), "timeTracking"), false);
      assert.ok(readPayload(response, ["registry"]).registry.workbenchCards.some((card) => card.renderer === "active-work-timers"));
      assert.ok(readPayload(response, ["registry"]).registry.workbenchCards.some((card) => card.renderer === "task-workbench-items"));
      assert.deepEqual(readPayload(response, ["timers"]).timers, []);
      assert.equal(Object.hasOwn(payloadRecord(response), "taskItems"), false);
      assert.deepEqual(readPayload(response, ["workCandidates"]).workCandidates, [], "bootstrap must not compute focus candidates");
    });
  });
  await expectStatus(
    "project user can load Workbench focus candidates",
    api.get("/api/workbench/focus-candidates?limit=50", { cookie: fixtures.sessions.projectUser }),
    200,
  ).then((response) => {
    check("Workbench focus candidates include normalized live-timer candidates", () => {
      assert.ok(readPayload(response, ["items"]).items.some((candidate) => candidate.recordType === "active_work_timer"));
    });
  });
  await expectStatus(
    "Workbench timer contribution route returns normalized timers",
    api.get("/api/active-timers/all", { cookie: fixtures.sessions.projectUser }),
    200,
  ).then((response) => {
    check("Workbench timer source route preserves manual and task timer data", () => {
      assert.ok(readPayload(response, ["timers"]).timers.some((timer) => timer.source_type === "manual" && timer.timer_slot === "task-mutual"));
      assert.ok(readPayload(response, ["timers"]).timers.some((timer) => timer.source_module_id === "tasks" && timer.source_id === readPayload(timerTask, ["task"]).task.task_id));
    });
  });
  await expectStatus(
    "Workbench task contribution route returns task items",
    api.get("/api/tasks/workbench-items", { cookie: fixtures.sessions.projectUser }),
    200,
  ).then((response) => {
    check("Workbench task source route preserves task item data", () => {
      assert.ok(readPayload(response, ["items"]).items.some((task) => task.source_type === "task" && task.source_id === readPayload(timerTask, ["task"]).task.task_id));
    });
  });
  await expectStatus(
    "Workbench can pause a sourced task timer without losing source metadata",
    api.put(`/api/workbench/timers/${encodeURIComponent(`source:tasks:task:${readPayload(timerTask, ["task"]).task.task_id}`)}/status`, {
      timer_status: "paused",
      accumulated_elapsed_seconds: 12,
    }, { cookie: fixtures.sessions.projectUser }),
    200,
  ).then((response) => {
    check("Workbench status action preserves task timer source", () => {
      assert.equal(readPayload(response, ["timer"]).timer.source_module_id, "tasks");
      assert.equal(readPayload(response, ["timer"]).timer.source_type, "task");
      assert.equal(readPayload(response, ["timer"]).timer.source_id, readPayload(timerTask, ["task"]).task.task_id);
      assert.equal(readPayload(response, ["timer"]).timer.timer_status, "paused");
    });
  });
  await expectStatus(
    "project user can restart task timer after Workbench pause",
    api.put(`/api/tasks/${encodeURIComponent(readPayload(timerTask, ["task"]).task.task_id)}/timer`, {
      timer_status: "running",
      accumulated_elapsed_seconds: 60,
      last_active_start_time: new Date().toISOString(),
    }, { cookie: fixtures.sessions.projectUser }),
    200,
  );
  await assertUnifiedTimerState({
    label: "task timer start pauses manual timer in unified table",
    workspaceId: fixtures.workspaceId,
    userId: fixtures.users.projectUser.userId,
    expected: {
      source_type: "manual",
      timer_slot: "task-mutual",
      timer_status: "paused",
    },
  });
  await expectStatus(
    "project user can finalize task timer into time entry",
    api.post(`/api/tasks/${encodeURIComponent(readPayload(timerTask, ["task"]).task.task_id)}/timer/finalize`, {
      duration_seconds: 60,
      end_time: new Date().toISOString(),
    }, { cookie: fixtures.sessions.projectUser }),
    201,
  ).then((response) => {
    check("task timer finalize returns time entry id", () => {
      assert.ok(readPayload(response, ["entry_id"]).entry_id);
      assert.equal(readPayload(response, ["task_id"]).task_id, readPayload(timerTask, ["task"]).task.task_id);
    });
  });
  await expectStatus(
    "task timer time entry stores task id",
    api.get("/api/time-entries", { cookie: fixtures.sessions.projectUser }),
    200,
  ).then((response) => {
    check("time entries include finalized task timer link", () => {
      assert.ok(readPayload(response, ["entries"]).entries.some((entry) => entry.task_id === readPayload(timerTask, ["task"]).task.task_id));
    });
  });
  await assertNoUnifiedTimerState({
    label: "finalized task timer is removed from unified active timer table",
    workspaceId: fixtures.workspaceId,
    userId: fixtures.users.projectUser.userId,
    sourceId: readPayload(timerTask, ["task"]).task.task_id,
  });
  await expectStatus(
    "project user can complete task after task timer is finalized",
    api.post(`/api/tasks/${encodeURIComponent(readPayload(timerTask, ["task"]).task.task_id)}/complete`, {}, { cookie: fixtures.sessions.projectUser }),
    200,
  );
  await expectStatus(
    "client admin can list scoped tasks",
    api.get("/api/tasks", { cookie: fixtures.sessions.clientAdmin }),
    200,
  ).then((response) => {
    check("client admin scoped task list includes assigned client task", () => {
      assert.ok(readPayload(response, ["tasks"]).tasks.some((task) => task.task_id === readPayload(scopedTask, ["task"]).task.task_id));
      assert.ok(!readPayload(response, ["tasks"]).tasks.some((task) => task.task_id === readPayload(workspaceTask, ["task"]).task.task_id));
    });
  });
  await expectStatus(
    "personal workspace admin can create project tasks without clients",
    api.post("/api/tasks", {
      title: "Personal project task",
      project_id: fixtures.personalWorkspace.projectId,
    }, { cookie: fixtures.sessions.personalWorkspaceAdmin }),
    201,
  );
  await expectStatus(
    "personal workspace rejects direct client task scope",
    api.post("/api/tasks", {
      title: "Denied personal client task",
      client_id: fixtures.clients.alpha.id,
    }, { cookie: fixtures.sessions.personalWorkspaceAdmin }),
    403,
  );
}

/** @param {HarnessApi} api @param {HarnessFixtures} fixtures @returns {Promise<void>} */
async function runTimeEntryMutationTests(api, fixtures) {
  const entry = await createTimeEntry(api, fixtures.sessions.projectUser, fixtures.projects.alpha.id);
  const correctionTag = await createTag(fixtures.workspaceId, fixtures.users.workspaceAdmin.userId, "Admin Correction");
  await expectStatus(
    "project user can update own time entries",
    api.put(`/api/time-entries/${encodeURIComponent(entry.entry_id)}`, timeEntryPayload(fixtures.projects.alpha.id, { description: "Updated own entry" }), { cookie: fixtures.sessions.projectUser }),
    200,
  );
  await expectStatus(
    "client user cannot update another user's time entry",
    api.put(`/api/time-entries/${encodeURIComponent(entry.entry_id)}`, timeEntryPayload(fixtures.projects.alpha.id, { description: "Denied edit all" }), { cookie: fixtures.sessions.clientUser }),
    403,
  );
  const adminCorrection = await expectStatus(
    "workspace admin can correct another user's workspace time entry with tags",
    api.put(`/api/time-entries/${encodeURIComponent(entry.entry_id)}`, timeEntryPayload(fixtures.projects.alpha.id, {
      billable: "no",
      description: "Workspace admin corrected entry",
      duration_hours: "1.50",
      duration_seconds: 5400,
      end_time: "2026-06-02T14:30:00.000Z",
      tagIds: [correctionTag.tagId],
    }), { cookie: fixtures.sessions.workspaceAdmin }),
    200,
  );
  check("workspace admin correction preserves original time entry owner", () => {
    assert.equal(readPayload(adminCorrection, ["entry"]).entry.user_id, fixtures.users.projectUser.userId);
  });
  check("workspace admin correction returns updated manual tag", () => {
    assert.ok((readPayload(adminCorrection, ["entry"]).entry.tags || []).some((tag) => tag.tag_id === correctionTag.tagId));
  });
  const correctedList = await expectStatus(
    "workspace admin corrected time entry appears in time-entry list",
    api.get("/api/time-entries", { cookie: fixtures.sessions.workspaceAdmin }),
    200,
  );
  check("time-entry list reflects workspace admin correction fields", () => {
    const corrected = readPayload(correctedList, ["entries"]).entries.find((item) => item.entry_id === entry.entry_id);
    assert.equal(corrected?.description, "Workspace admin corrected entry");
    assert.equal(Number(corrected?.duration_seconds), 5400);
    assert.ok((corrected?.tags || []).some((tag) => tag.tag_id === correctionTag.tagId));
  });
  const recentDashboardEnd = new Date();
  const recentDashboardStart = new Date(recentDashboardEnd.getTime() - 45 * 60 * 1000);
  const recentDashboardEntry = await expectStatus(
    "project user can create a recent dashboard time entry",
    api.post("/api/time-entries", timeEntryPayload(fixtures.projects.alpha.id, {
      description: "Dashboard recent time entry",
      duration_hours: "0.75",
      duration_seconds: 2700,
      end_time: recentDashboardEnd.toISOString(),
      start_time: recentDashboardStart.toISOString(),
    }), { cookie: fixtures.sessions.projectUser }),
    201,
  );
  const scopedDashboardBeforeHidden = await expectStatus(
    "dashboard effort summary includes recent saved time",
    api.get("/api/time-tracking/dashboard/effort-summary", { cookie: fixtures.sessions.projectUser }),
    200,
  );
  check("recent time dashboard payload is compact and Dashboard-safe", () => {
    const row = readPayload(scopedDashboardBeforeHidden, ["recentTime"]).recentTime.rows.find((item) => item.id === readPayload(recentDashboardEntry, ["entry_id"]).entry_id);
    assert.ok(row);
    assert.equal(row.action.href, "time-entries.html");
    assert.equal(Object.hasOwn(row, "description"), false);
    assert.equal(Object.hasOwn(row, "billable"), false);
    assert.equal(JSON.stringify(scopedDashboardBeforeHidden.body).includes("invoice"), false);
  });
  const hiddenDashboardEnd = new Date(recentDashboardEnd.getTime() + 60 * 1000);
  const hiddenDashboardStart = new Date(hiddenDashboardEnd.getTime() - 35 * 60 * 1000);
  const hiddenDashboardEntry = await expectStatus(
    "workspace admin can create recent time outside the project user's scope",
    api.post("/api/time-entries", timeEntryPayload(fixtures.projects.beta.id, {
      description: "Dashboard hidden recent time entry",
      duration_hours: "0.5833",
      duration_seconds: 2100,
      end_time: hiddenDashboardEnd.toISOString(),
      start_time: hiddenDashboardStart.toISOString(),
    }), { cookie: fixtures.sessions.workspaceAdmin }),
    201,
  );
  const scopedDashboardAfterHidden = await expectStatus(
    "dashboard effort summary preserves project scope in bounded aggregation",
    api.get("/api/time-tracking/dashboard/effort-summary", { cookie: fixtures.sessions.projectUser }),
    200,
  );
  check("bounded dashboard aggregation excludes inaccessible recent time from rows and totals", () => {
    assert.ok(!readPayload(scopedDashboardAfterHidden, ["recentTime"]).recentTime.rows.some((item) => item.id === readPayload(hiddenDashboardEntry, ["entry_id"]).entry_id));
    assert.equal(readPayload(scopedDashboardAfterHidden, ["recentTime"]).recentTime.entriesCount, readPayload(scopedDashboardBeforeHidden, ["recentTime"]).recentTime.entriesCount);
    assert.equal(readPayload(scopedDashboardAfterHidden, ["recentTime"]).recentTime.todaySeconds, readPayload(scopedDashboardBeforeHidden, ["recentTime"]).recentTime.todaySeconds);
    assert.equal(readPayload(scopedDashboardAfterHidden, ["recentTime"]).recentTime.totalSeconds, readPayload(scopedDashboardBeforeHidden, ["recentTime"]).recentTime.totalSeconds);
  });
  const reporting = await expectStatus(
    "reporting reflects workspace admin time entry correction",
    api.get(`/api/reporting/project-summary?period=custom&scopeId=${encodeURIComponent(fixtures.clients.alpha.id)}&projectIds=${encodeURIComponent(fixtures.projects.alpha.id)}&startDate=2026-06-01&endDate=2026-06-30`, { cookie: fixtures.sessions.workspaceAdmin }),
    200,
  );
  check("reporting summary includes corrected raw duration", () => {
    const row = readPayload(reporting, ["rows"]).rows.find((item) => item.project.id === fixtures.projects.alpha.id);
    assert.ok(row, "the reporting payload should carry the alpha project row");
    assert.ok(row.rawSeconds >= 5400);
  });
  const auditRows = await querySql(`
SELECT metadata_json
FROM audit_logs
WHERE workspace_id = ${sqlText(fixtures.workspaceId)}
  AND record_type = 'time_entry'
  AND record_id = ${sqlText(entry.entry_id)}
  AND action = 'time_entry_updated'
ORDER BY created_at DESC
LIMIT 1;
`);
  check("workspace admin correction audit records admin metadata", () => {
    assert.ok(auditRows.length > 0);
    const metadata = JSON.parse(/** @type {string} */ (auditRows[0].metadata_json) || "{}");
    assert.equal(metadata.admin_correction, true);
    assert.equal(metadata.corrected_user_id, fixtures.users.projectUser.userId);
    assert.ok((metadata.sensitive_fields_changed || []).includes("billable"));
  });
  await drainQueuedSearchJobs();
  const searchRows = await querySql(`
SELECT title, body, tags_text
FROM search_index
WHERE workspace_id = ${sqlText(fixtures.workspaceId)}
  AND module_id = 'time-tracking'
  AND record_type = 'time_entry'
  AND record_id = ${sqlText(entry.entry_id)}
LIMIT 1;
`);
  check("search index reflects workspace admin correction and tag", () => {
    assert.equal(searchRows[0]?.title, "Workspace admin corrected entry");
    assert.ok(String(searchRows[0]?.tags_text || "").includes("Admin Correction"));
  });
  await expectStatus(
    "project user can delete own time entries",
    api.delete(`/api/time-entries/${encodeURIComponent(entry.entry_id)}`, { cookie: fixtures.sessions.projectUser }),
    200,
  );
  await expectStatus(
    "project user cannot create time entries outside assigned project",
    api.post("/api/time-entries", timeEntryPayload(fixtures.projects.beta.id), { cookie: fixtures.sessions.projectUser }),
    403,
  );
  const crossWorkspaceEntryId = `cross-workspace-entry-${randomUUID()}`;
  await insertTimeEntry(fixtures.otherWorkspace.id, {
    entryId: crossWorkspaceEntryId,
    projectId: "other-project",
    userId: fixtures.users.projectUser.userId,
  });
  await expectStatus(
    "workspace admin cannot correct cross-workspace time entries",
    api.put(`/api/time-entries/${encodeURIComponent(crossWorkspaceEntryId)}`, timeEntryPayload(fixtures.projects.alpha.id, { description: "Denied cross workspace correction" }), { cookie: fixtures.sessions.workspaceAdmin }),
    404,
  );
}

/** @param {HarnessApi} api @param {HarnessFixtures} fixtures @returns {Promise<void>} */
async function runActiveTimerMutationTests(api, fixtures) {
  await expectStatus(
    "project user can save active timers",
    api.put("/api/active-timers/1", timerPayload(fixtures.projects.alpha.id), { cookie: fixtures.sessions.projectUser }),
    200,
  );
  await expectStatus(
    "dashboard effort summary includes active timers",
    api.get("/api/time-tracking/dashboard/effort-summary", { cookie: fixtures.sessions.projectUser }),
    200,
  ).then((response) => {
    check("active timers dashboard payload is compact and Workbench-routed", () => {
      assert.ok(readPayload(response, ["activeTimers"]).activeTimers.count >= 1);
      assert.ok(readPayload(response, ["activeTimers"]).activeTimers.rows.some((row) =>
        row.action.href === "workbench.html" &&
        ["Running", "Paused"].includes(row.status)));
      assert.equal(JSON.stringify(readPayload(response, ["activeTimers"]).activeTimers).includes("invoice"), false);
    });
  });
  await expectStatus(
    "project user can finalize active timers",
    api.post("/api/active-timers/1/finalize", timeEntryPayload(fixtures.projects.alpha.id), { cookie: fixtures.sessions.projectUser }),
    201,
  );
  await expectStatus(
    "project user can remove active timers",
    api.delete("/api/active-timers/2", { cookie: fixtures.sessions.projectUser }),
    200,
  );
  await expectStatus(
    "project user cannot save active timers outside assigned project",
    api.put("/api/active-timers/3", timerPayload(fixtures.projects.beta.id), { cookie: fixtures.sessions.projectUser }),
    403,
  );
  await expectStatus(
    "project user can save active timer slot before compaction",
    api.put("/api/active-timers/1", timerPayload(fixtures.projects.alpha.id, { description: "Compaction slot 1" }), { cookie: fixtures.sessions.projectUser }),
    200,
  );
  await expectStatus(
    "project user can save middle active timer slot before compaction",
    api.put("/api/active-timers/3", timerPayload(fixtures.projects.alpha.id, { description: "Compaction slot 3" }), { cookie: fixtures.sessions.projectUser }),
    200,
  );
  await expectStatus(
    "project user can save later active timer slot before compaction",
    api.put("/api/active-timers/4", timerPayload(fixtures.projects.alpha.id, { description: "Compaction slot 4" }), { cookie: fixtures.sessions.projectUser }),
    200,
  );
  await expectStatus(
    "removing a middle active timer compacts later manual timer slots",
    api.delete("/api/active-timers/3", { cookie: fixtures.sessions.projectUser }),
    200,
  ).then((response) => {
    check("manual active timer slots are compact after middle removal", () => {
      const slots = readPayload(response, ["timers"]).timers
        .map((timer) => timer.timer_slot)
        .filter((/** @type {string} */ timerSlot) => /^[1-9]\d*$/.test(timerSlot));
      assert.deepEqual(slots, ["1", "2"]);
    });
  });
  await expectStatus(
    "project user can remove first compacted active timer",
    api.delete("/api/active-timers/1", { cookie: fixtures.sessions.projectUser }),
    200,
  );
  await expectStatus(
    "project user can remove remaining compacted active timer",
    api.delete("/api/active-timers/1", { cookie: fixtures.sessions.projectUser }),
    200,
  );
}

/** @param {HarnessApi} api @param {HarnessFixtures} fixtures @returns {Promise<void>} */
async function runUserMutationTests(api, fixtures) {
  await expectStatus(
    "workspace admin cannot delete the signed-in account through User Administration",
    api.delete(`/api/users/${fixtures.users.workspaceAdmin.userId}`, { cookie: fixtures.sessions.workspaceAdmin }),
    400,
  );

  const created = await api.post("/api/users", {
    username: uniqueEmail("mutation-user"),
    displayName: "Mutation User",
    timezone: "America/New_York",
  }, { cookie: fixtures.sessions.workspaceAdmin });
  await expectStatus("workspace admin can create users", created, 201);
  const userId = readPayload(created, ["user"]).user.user_id;

  await expectStatus(
    "workspace admin can update users",
    api.put(`/api/users/${userId}/update`, { displayName: "Mutation User Updated", timezone: "America/New_York" }, { cookie: fixtures.sessions.workspaceAdmin }),
    200,
  );
  await expectStatus("workspace admin can deactivate users", api.put(`/api/users/${userId}/deactivate`, {}, { cookie: fixtures.sessions.workspaceAdmin }), 200);
  await expectStatus("workspace admin can reactivate users", api.put(`/api/users/${userId}/reactivate`, {}, { cookie: fixtures.sessions.workspaceAdmin }), 200);
  await expectStatus("workspace admin can retire users", api.delete(`/api/users/${userId}`, { cookie: fixtures.sessions.workspaceAdmin }), 200);
  const retiredAdminTarget = await querySql(`
SELECT users.username, users.display_name, users.user_status, user_workspaces.status AS membership_status
FROM users
INNER JOIN user_workspaces ON user_workspaces.user_id = users.user_id
WHERE users.user_id = ${sqlText(userId)}
  AND user_workspaces.workspace_id = ${sqlText(fixtures.workspaceId)};
`);
  check("administrator deletion retires access while preserving readable identity", () => {
    assert.deepEqual(retiredAdminTarget, [{
      username: readPayload(created, ["user"]).user.username,
      display_name: "Mutation User Updated",
      user_status: "inactive",
      membership_status: "inactive",
    }]);
  });

  const selfCreated = await api.post("/api/users", {
    username: uniqueEmail("self-retirement-user"),
    displayName: "Retained Attribution User",
    timezone: "America/New_York",
  }, { cookie: fixtures.sessions.workspaceAdmin });
  await expectStatus("workspace admin can create a self-retirement fixture", selfCreated, 201);
  const selfUserId = readPayload(selfCreated, ["user"]).user.user_id;
  await runSql(`
UPDATE users
SET password_change_required = 0
WHERE user_id = ${sqlText(selfUserId)};
`);
  const attribution = await seedUserAttribution(fixtures.workspaceId, selfUserId);
  const selfLogin = await expectStatus(
    "active user can sign in before self-retirement",
    api.post("/api/login", {
      username: readPayload(selfCreated, ["user"]).user.username,
      password: readPayload(selfCreated, ["initialPassword"]).initialPassword,
    }),
    200,
  );
  const selfCookie = extractSessionCookie(selfLogin.headers);
  await expectStatus(
    "signed-in user can retire the account through User Settings",
    api.delete("/api/user/account", { cookie: selfCookie }),
    200,
  );
  await expectStatus(
    "retired session cannot access User Settings",
    api.get("/api/user/settings", { cookie: selfCookie }),
    401,
  );
  const retiredLogin = await expectStatus(
    "retired account receives a non-enumerating login denial",
    api.post("/api/login", {
      username: readPayload(selfCreated, ["user"]).user.username,
      password: readPayload(selfCreated, ["initialPassword"]).initialPassword,
    }),
    401,
  );
  const unknownLogin = await expectStatus(
    "unknown account receives the same non-enumerating login denial",
    api.post("/api/login", {
      username: uniqueEmail("unknown-retirement-user"),
      password: readPayload(selfCreated, ["initialPassword"]).initialPassword,
    }),
    401,
  );
  check("inactive and unknown login responses are indistinguishable", () => {
    assert.equal(readPayload(retiredLogin, ["error"]).error.code, readPayload(unknownLogin, ["error"]).error.code);
    assert.equal(readPayload(retiredLogin, ["error"]).error.message, readPayload(unknownLogin, ["error"]).error.message);
    assert.equal(readPayload(retiredLogin, ["error"]).error.code, "authentication_required");
    assert.equal(readPayload(retiredLogin, ["error"]).error.message, "These credentials do not have access to this installation.");
    assert.match(readPayload(retiredLogin, ["error"]).error.requestId, /^[0-9a-f-]{36}$/i);
    assert.match(readPayload(unknownLogin, ["error"]).error.requestId, /^[0-9a-f-]{36}$/i);
  });

  const retainedAttribution = await querySql(`
SELECT
  users.username,
  users.display_name,
  users.user_status,
  tasks.created_by_user_id AS task_user_id,
  notes.owner_user_id AS note_user_id,
  files.uploaded_by_user_id AS file_user_id,
  lists.created_by_user_id AS list_user_id
FROM users
INNER JOIN tasks ON tasks.task_id = ${sqlText(attribution.taskId)}
INNER JOIN notes ON notes.note_id = ${sqlText(attribution.noteId)}
INNER JOIN files ON files.file_id = ${sqlText(attribution.fileId)}
INNER JOIN lists ON lists.list_id = ${sqlText(attribution.listId)}
WHERE users.user_id = ${sqlText(selfUserId)};
`);
  check("self-retirement preserves readable task, note, file, and list attribution", () => {
    assert.deepEqual(retainedAttribution, [{
      username: readPayload(selfCreated, ["user"]).user.username,
      display_name: "Retained Attribution User",
      user_status: "inactive",
      task_user_id: selfUserId,
      note_user_id: selfUserId,
      file_user_id: selfUserId,
      list_user_id: selfUserId,
    }]);
  });

  await expectStatus(
    "project user cannot create users",
    api.post("/api/users", { username: uniqueEmail("denied-user") }, { cookie: fixtures.sessions.projectUser }),
    403,
  );
}

/** @param {string} workspaceId @param {string} userId */
async function seedUserAttribution(workspaceId, userId) {
  const now = new Date().toISOString();
  const taskId = `retained-task-${randomUUID()}`;
  const noteId = `retained-note-${randomUUID()}`;
  const fileId = `retained-file-${randomUUID()}`;
  const listId = `retained-list-${randomUUID()}`;

  await runSql(`
INSERT INTO tasks (
  task_id, workspace_id, title, created_by_user_id, updated_by_user_id, created_at, updated_at
) VALUES (
  ${sqlText(taskId)}, ${sqlText(workspaceId)}, 'Retained task attribution',
  ${sqlText(userId)}, ${sqlText(userId)}, ${sqlText(now)}, ${sqlText(now)}
);
INSERT INTO notes (
  note_id, workspace_id, title, owner_user_id, created_by_user_id, updated_by_user_id, created_at, updated_at
) VALUES (
  ${sqlText(noteId)}, ${sqlText(workspaceId)}, 'Retained note attribution',
  ${sqlText(userId)}, ${sqlText(userId)}, ${sqlText(userId)}, ${sqlText(now)}, ${sqlText(now)}
);
INSERT INTO files (
  file_id, workspace_id, storage_key, original_filename, stored_filename, display_name,
  status, uploaded_by_user_id, created_at, updated_at
) VALUES (
  ${sqlText(fileId)}, ${sqlText(workspaceId)}, ${sqlText(`retained/${fileId}`)},
  'retained.txt', 'retained.txt', 'Retained file attribution', 'available',
  ${sqlText(userId)}, ${sqlText(now)}, ${sqlText(now)}
);
INSERT INTO lists (
  list_id, workspace_id, title, list_type, created_by_user_id, updated_by_user_id, created_at, updated_at
) VALUES (
  ${sqlText(listId)}, ${sqlText(workspaceId)}, 'Retained list attribution', 'checklist',
  ${sqlText(userId)}, ${sqlText(userId)}, ${sqlText(now)}, ${sqlText(now)}
);
`);

  const retainedFilePath = path.join(permissionFilesRoot, "retained", fileId);
  await fs.mkdir(path.dirname(retainedFilePath), { recursive: true });
  await fs.writeFile(retainedFilePath, "");

  return { fileId, listId, noteId, taskId };
}

/** @param {HarnessApi} api @param {HarnessFixtures} fixtures @returns {Promise<void>} */
async function runAddUserAdministrationTests(api, fixtures) {
  const workspaceAdminOptions = await expectStatus(
    "workspace admin can read server-shaped Add User options",
    api.get("/api/users/add-options", { cookie: fixtures.sessions.workspaceAdmin }),
    200,
  );
  check("non-super Add User workspace options exclude unrelated business workspaces", () => {
    const workspaceIds = readPayload(workspaceAdminOptions, ["workspaces"]).workspaces.map((workspace) => workspace.workspaceId);
    assert.ok(workspaceIds.includes(fixtures.workspaceId));
    assert.ok(workspaceIds.includes(fixtures.familyWorkspace.id));
    assert.ok(!workspaceIds.includes(fixtures.otherWorkspace.id));
  });
  check("workspace admin Add User roles include authorized client and project scopes but exclude super admin", () => {
    const roles = new Map(readPayload(workspaceAdminOptions, ["roles"]).roles.map((role) => [role.role_id, role]));
    const clientUserRole = roles.get("client_user");
    const projectUserRole = roles.get("project_user");
    const projectAdminRole = roles.get("project_admin");
    assert.ok(clientUserRole && projectUserRole && projectAdminRole, "the workspace admin options should disclose each scoped role");
    const clientScopeIds = clientUserRole.scopes.map((scope) => scope.scopeId);
    const projectScopeIds = projectUserRole.scopes.map((scope) => scope.scopeId);
    assert.ok(!roles.has("super_admin"));
    assert.equal(projectAdminRole.assignment_scope_type, "project");
    assert.ok(Object.values(fixtures.clients).every((client) => clientScopeIds.includes(client.id)));
    assert.ok(Object.values(fixtures.projects).every((project) => projectScopeIds.includes(project.id)));
    assert.ok(!clientScopeIds.includes(fixtures.otherWorkspace.clientId));
  });

  await expectStatus(
    "workspace admin cannot enumerate Add User options for an unrelated workspace",
    api.get(`/api/users/add-options?workspaceId=${encodeURIComponent(fixtures.otherWorkspace.id)}`, {
      cookie: fixtures.sessions.workspaceAdmin,
    }),
    403,
  );
  await expectStatus(
    "workspace admin cannot search accounts for an unrelated workspace",
    api.post("/api/users/lookup", {
      username: fixtures.users.projectUser.username,
      workspaceId: fixtures.otherWorkspace.id,
    }, { cookie: fixtures.sessions.workspaceAdmin }),
    403,
  );

  const exactLookup = await expectStatus(
    "authorized exact-email lookup finds an existing account",
    api.post("/api/users/lookup", {
      username: fixtures.users.projectUser.username.toUpperCase(),
      workspaceId: fixtures.familyWorkspace.id,
    }, { cookie: fixtures.sessions.workspaceAdmin }),
    200,
  );
  check("exact-email lookup discloses only the minimum safe account match", () => {
    assert.deepEqual(Object.keys(readPayload(exactLookup, ["match"]).match).sort(), ["alreadyActive", "displayName", "username"]);
    assert.equal(readPayload(exactLookup, ["match"]).match.username, fixtures.users.projectUser.username);
    assert.equal(readPayload(exactLookup, ["match"]).match.alreadyActive, false);
  });
  const noMatchLookup = await expectStatus(
    "exact-email lookup does not return unrelated account suggestions",
    api.post("/api/users/lookup", {
      username: uniqueEmail("no-match"),
      workspaceId: fixtures.familyWorkspace.id,
    }, { cookie: fixtures.sessions.workspaceAdmin }),
    200,
  );
  check("unmatched account lookup has no directory payload", () => {
    assert.equal(readPayload(noMatchLookup, ["match"]).match, null);
  });

  const existingAccount = await expectStatus(
    "workspace admin can add an existing installation account with a family project role",
    api.post("/api/users", {
      username: fixtures.users.projectUser.username,
      workspaceId: fixtures.familyWorkspace.id,
      assignments: [{
        role_id: "project_user",
        scope_type: "project",
        scope_id: fixtures.familyWorkspace.projectId,
      }],
    }, { cookie: fixtures.sessions.workspaceAdmin }),
    200,
  );
  check("existing account addition reuses the identity and does not issue a password", () => {
    assert.equal(readPayload(existingAccount, ["accountCreated"]).accountCreated, false);
    assert.equal(readPayload(existingAccount, ["user"]).user.user_id, fixtures.users.projectUser.userId);
    assert.equal(readPayload(existingAccount, ["initialPassword"]).initialPassword, "");
  });
  const existingMemberships = await querySql(`
SELECT workspace_id
FROM user_workspaces
WHERE user_id = ${sqlText(fixtures.users.projectUser.userId)}
  AND workspace_id = ${sqlText(fixtures.familyWorkspace.id)}
  AND status = 'active';
`);
  const existingAssignments = await querySql(`
SELECT role_id, scope_type, scope_id
FROM user_role_assignments
WHERE user_id = ${sqlText(fixtures.users.projectUser.userId)}
  AND workspace_id = ${sqlText(fixtures.familyWorkspace.id)};
`);
  check("existing account addition creates one target membership and scoped role assignment", () => {
    assert.equal(existingMemberships.length, 1);
    assert.deepEqual(existingAssignments, [{
      role_id: "project_user",
      scope_type: "project",
      scope_id: fixtures.familyWorkspace.projectId,
    }]);
  });

  const superOptions = await expectStatus(
    "super admin can target any active workspace from Add User",
    api.get(`/api/users/add-options?workspaceId=${encodeURIComponent(fixtures.otherWorkspace.id)}`, {
      cookie: fixtures.sessions.superAdmin,
    }),
    200,
  );
  check("super admin Add User options include the global super role", () => {
    assert.ok(readPayload(superOptions, ["workspaces"]).workspaces.some((workspace) => workspace.workspaceId === fixtures.otherWorkspace.id));
    assert.ok(readPayload(superOptions, ["roles"]).roles.some((role) => role.role_id === "super_admin"));
  });

  const crossWorkspaceEmail = uniqueEmail("cross-workspace-user");
  const crossWorkspaceCreated = await expectStatus(
    "super admin can create an account in another active workspace",
    api.post("/api/users", {
      username: crossWorkspaceEmail,
      workspaceId: fixtures.otherWorkspace.id,
      assignments: [{
        role_id: "client_user",
        scope_type: "client",
        scope_id: fixtures.otherWorkspace.clientId,
      }],
    }, { cookie: fixtures.sessions.superAdmin }),
    201,
  );
  const crossWorkspaceIdentities = await querySql(`
SELECT user_id
FROM users
WHERE lower(username) = ${sqlText(crossWorkspaceEmail)};
`);
  const crossWorkspaceAssignments = await querySql(`
SELECT role_id, scope_type, scope_id
FROM user_role_assignments
WHERE user_id = ${sqlText(readPayload(crossWorkspaceCreated, ["user"]).user.user_id)}
  AND workspace_id = ${sqlText(fixtures.otherWorkspace.id)};
`);
  check("new cross-workspace account receives one identity, password, membership, and requested scope", () => {
    assert.equal(readPayload(crossWorkspaceCreated, ["accountCreated"]).accountCreated, true);
    assert.ok(readPayload(crossWorkspaceCreated, ["initialPassword"]).initialPassword);
    assert.equal(crossWorkspaceIdentities.length, 1);
    assert.deepEqual(crossWorkspaceAssignments, [{
      role_id: "client_user",
      scope_type: "client",
      scope_id: fixtures.otherWorkspace.clientId,
    }]);
  });

  await expectStatus(
    "workspace admin cannot create users in an unrelated workspace",
    api.post("/api/users", {
      username: uniqueEmail("denied-cross-workspace"),
      workspaceId: fixtures.otherWorkspace.id,
    }, { cookie: fixtures.sessions.workspaceAdmin }),
    403,
  );
  await expectStatus(
    "workspace admin cannot create a super admin",
    api.post("/api/users", {
      username: uniqueEmail("denied-super-admin"),
      workspaceId: fixtures.workspaceId,
      assignments: [{
        role_id: "super_admin",
        scope_type: "all",
        scope_id: "all",
      }],
    }, { cookie: fixtures.sessions.workspaceAdmin }),
    403,
  );

  const familyOptions = await expectStatus(
    "family workspace Add User options remain available to its workspace admin",
    api.get("/api/users/add-options", { cookie: fixtures.sessions.familyWorkspaceAdmin }),
    200,
  );
  check("family workspace Add User options exclude every client-scoped role", () => {
    assert.ok(readPayload(familyOptions, ["roles"]).roles.some((role) => role.role_id === "project_user"));
    assert.ok(readPayload(familyOptions, ["roles"]).roles.every((role) => role.assignment_scope_type !== "client"));
  });

  const personalOptions = await expectStatus(
    "personal workspace returns a disabled Add User contract without client roles",
    api.get("/api/users/add-options", { cookie: fixtures.sessions.personalWorkspaceAdmin }),
    200,
  );
  check("personal workspace never offers Add User or client role scopes", () => {
    assert.equal(readPayload(personalOptions, ["canAddUsers"]).canAddUsers, false);
    assert.ok(readPayload(personalOptions, ["roles"]).roles.every((role) => role.assignment_scope_type !== "client"));
  });
  await expectStatus(
    "personal workspace rejects Add User creation",
    api.post("/api/users", {
      username: uniqueEmail("denied-personal-user"),
      workspaceId: fixtures.personalWorkspace.id,
    }, { cookie: fixtures.sessions.personalWorkspaceAdmin }),
    400,
  );
}

/** @param {HarnessApi} api @param {HarnessFixtures} fixtures @returns {Promise<void>} */
async function runRoleAssignmentTests(api, fixtures) {
  const rolesResponse = await expectStatus(
    "client admin can read role options for scoped assignments",
    api.get("/api/roles", { cookie: fixtures.sessions.clientAdmin }),
    200,
  );
  check("client admin role options disclose only delegable roles and authorized scopes", () => {
    assert.deepEqual(
      readPayload(rolesResponse, ["roles"]).roles.map((role) => role.role_id).sort(),
      ["client_external_user", "client_user", "project_admin", "project_user"],
    );
    const disclosedScopeIds = readPayload(rolesResponse, ["roles"]).roles.flatMap((role) => (
      role.scopes.map((scope) => scope.scopeId)
    ));
    assert.ok(disclosedScopeIds.includes(fixtures.clients.alpha.id));
    assert.ok(disclosedScopeIds.includes(fixtures.projects.alpha.id));
    assert.equal(disclosedScopeIds.includes(fixtures.clients.beta.id), false);
    assert.equal(disclosedScopeIds.includes(fixtures.projects.beta.id), false);
    assert.equal(disclosedScopeIds.includes(fixtures.projects.workspace.id), false);
    assert.equal(disclosedScopeIds.includes(fixtures.otherWorkspace.clientId), false);
  });
  const projectAdminRoles = await expectStatus(
    "project admin receives only Project User at its authorized Project",
    api.get("/api/roles", { cookie: fixtures.sessions.projectAdmin }),
    200,
  );
  check("project admin server-shaped role options contain no broader scope", () => {
    assert.deepEqual(readPayload(projectAdminRoles, ["roles"]).roles.map((role) => role.role_id), ["project_user"]);
    assert.deepEqual(
      readPayload(projectAdminRoles, ["roles"]).roles[0].scopes.map((scope) => scope.scopeId),
      [fixtures.projects.alpha.id],
    );
  });
  const workspaceAdminRoles = await expectStatus(
    "workspace admin receives its full authorized Business role catalog with server-shaped scopes",
    api.get("/api/roles", { cookie: fixtures.sessions.workspaceAdmin }),
    200,
  );
  check("workspace admin role options retain its six-role ceiling and labeled scopes", () => {
    assert.deepEqual(
      readPayload(workspaceAdminRoles, ["roles"]).roles.map((role) => role.role_id).sort(),
      [
        "client_admin",
        "client_external_user",
        "client_user",
        "project_admin",
        "project_user",
        "workspace_admin",
      ],
    );
    assert.ok(readPayload(workspaceAdminRoles, ["roles"]).roles.every((role) => (
      role.assignment_scope_type
      && role.scopes.length > 0
      && role.scopes.every((scope) => scope.scopeId && scope.label)
    )));
  });
  const superAdminRoles = await expectStatus(
    "super admin receives all seven Business roles with server-shaped scopes",
    api.get("/api/roles", { cookie: fixtures.sessions.superAdmin }),
    200,
  );
  check("only super admin role options include Super Admin", () => {
    assert.equal(readPayload(superAdminRoles, ["roles"]).roles.length, 7);
    assert.ok(readPayload(superAdminRoles, ["roles"]).roles.some((role) => role.role_id === "super_admin"));
  });
  await expectStatus(
    "scoped admins cannot enumerate assignments by user ID",
    api.get(`/api/users/${fixtures.users.unscopedUser.userId}/role-assignments`, {
      cookie: fixtures.sessions.clientAdmin,
    }),
    403,
  );

  const unknownLookup = await expectStatus(
    "delegated account lookup returns a calm not-found result",
    api.post("/api/role-assignments/lookup", {
      username: uniqueEmail("missing-delegated-account"),
    }, { cookie: fixtures.sessions.clientAdmin }),
    200,
  );
  check("delegated account lookup not-found response contains no directory data", () => {
    assert.deepEqual(unknownLookup.body, { match: null });
  });
  await runSql(`
UPDATE user_workspaces
SET status = 'inactive'
WHERE workspace_id = ${sqlText(fixtures.workspaceId)}
  AND user_id = ${sqlText(fixtures.users.externalClientUser.userId)};
`);
  const inactiveLookup = await expectStatus(
    "delegated account lookup gives inactive membership not-found parity",
    api.post("/api/role-assignments/lookup", {
      username: fixtures.users.externalClientUser.username,
    }, { cookie: fixtures.sessions.clientAdmin }),
    200,
  );
  check("inactive membership lookup matches the unknown-account shape", () => {
    assert.deepEqual(inactiveLookup.body, unknownLookup.body);
  });
  await runSql(`
UPDATE user_workspaces
SET status = 'active'
WHERE workspace_id = ${sqlText(fixtures.workspaceId)}
  AND user_id = ${sqlText(fixtures.users.externalClientUser.userId)};
`);

  const hiddenAssignmentId = randomUUID();
  const hiddenHigherAssignmentId = randomUUID();
  const hiddenCreatedAt = "2026-06-10T12:00:00.000Z";
  const hiddenOverrides = '{"operationAccess":{"tasks":{"read":false}},"sentinel":"preserve-byte-for-byte"}';
  await runSql(`
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
  ${sqlText(hiddenAssignmentId)},
  ${sqlText(fixtures.workspaceId)},
  ${sqlText(fixtures.users.unscopedUser.userId)},
  'client_user',
  'client',
  ${sqlText(fixtures.clients.beta.id)},
  ${sqlText(fixtures.clients.beta.id)},
  NULL,
  ${sqlText(hiddenOverrides)},
  ${sqlText(hiddenCreatedAt)},
  ${sqlText(hiddenCreatedAt)}
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
  ${sqlText(hiddenHigherAssignmentId)},
  ${sqlText(fixtures.workspaceId)},
  ${sqlText(fixtures.users.unscopedUser.userId)},
  'workspace_admin',
  'workspace',
  ${sqlText(fixtures.workspaceId)},
  NULL,
  NULL,
  ${sqlText('{"sentinel":"higher-role-preserved"}')},
  ${sqlText(hiddenCreatedAt)},
  ${sqlText(hiddenCreatedAt)}
);`);
  const hiddenBefore = await querySql(`
SELECT *
FROM user_role_assignments
WHERE assignment_id IN (
  ${sqlText(hiddenAssignmentId)},
  ${sqlText(hiddenHigherAssignmentId)}
)
ORDER BY assignment_id;
`);

  const initialLookup = await expectStatus(
    "client admin can find an exact active workspace member",
    api.post("/api/role-assignments/lookup", {
      username: fixtures.users.unscopedUser.username.toUpperCase(),
    }, { cookie: fixtures.sessions.clientAdmin }),
    200,
  );
  check("exact delegated lookup returns only minimum identity and manageable assignments", () => {
    assert.equal(readPayload(initialLookup, ["match"]).match.userId, fixtures.users.unscopedUser.userId);
    assert.equal(readPayload(initialLookup, ["match"]).match.username, fixtures.users.unscopedUser.username);
    assert.equal(readPayload(initialLookup, ["match"]).match.activeMembership, true);
    assert.match(readPayload(initialLookup, ["match"]).match.assignmentRevision, /^[a-f0-9]{64}$/);
    assert.deepEqual(readPayload(initialLookup, ["match"]).match.assignments, []);
    assert.deepEqual(
      Object.keys(readPayload(initialLookup, ["match"]).match).sort(),
      ["activeMembership", "assignmentRevision", "assignments", "displayName", "userId", "username"],
    );
  });

  const delegatedUpdate = await expectStatus(
    "client admin can assign project users in assigned client",
    api.put(`/api/users/${fixtures.users.unscopedUser.userId}/role-assignments`, {
      assignmentRevision: readPayload(initialLookup, ["match"]).match.assignmentRevision,
      assignments: [{
        role_id: "project_user",
        scope_type: "project",
        scope_id: fixtures.projects.alpha.id,
      }],
    }, { cookie: fixtures.sessions.clientAdmin }),
    200,
  );
  check("delegated mutation returns only its manageable assignment and a new revision", () => {
    assert.deepEqual(readPayload(delegatedUpdate, ["assignments"]).assignments, [{
      role_id: "project_user",
      scope_id: fixtures.projects.alpha.id,
      scope_type: "project",
    }]);
    assert.match(readPayload(delegatedUpdate, ["assignmentRevision"]).assignmentRevision, /^[a-f0-9]{64}$/);
    assert.notEqual(
      readPayload(delegatedUpdate, ["assignmentRevision"]).assignmentRevision,
      readPayload(initialLookup, ["match"]).match.assignmentRevision,
    );
  });
  const hiddenAfter = await querySql(`
SELECT *
FROM user_role_assignments
WHERE assignment_id IN (
  ${sqlText(hiddenAssignmentId)},
  ${sqlText(hiddenHigherAssignmentId)}
)
ORDER BY assignment_id;
`);
  check("delegated mutation preserves hidden assignments byte-for-byte", () => {
    assert.deepEqual(hiddenAfter, hiddenBefore);
  });
  await expectStatus(
    "scoped mutation cannot name a hidden higher role",
    api.put(`/api/users/${fixtures.users.unscopedUser.userId}/role-assignments`, {
      assignmentRevision: readPayload(delegatedUpdate, ["assignmentRevision"]).assignmentRevision,
      assignments: [{
        role_id: "workspace_admin",
        scope_type: "workspace",
        scope_id: fixtures.workspaceId,
      }],
    }, { cookie: fixtures.sessions.clientAdmin }),
    403,
  );
  await expectStatus(
    "scoped mutation cannot set permission overrides",
    api.put(`/api/users/${fixtures.users.unscopedUser.userId}/role-assignments`, {
      assignmentRevision: readPayload(delegatedUpdate, ["assignmentRevision"]).assignmentRevision,
      assignments: [{
        role_id: "project_user",
        scope_type: "project",
        scope_id: fixtures.projects.alpha.id,
        permission_overrides: {
          operationAccess: { tasks: { read: false } },
        },
      }],
    }, { cookie: fixtures.sessions.clientAdmin }),
    403,
  );

  await expectStatus(
    "client admin cannot assign project users outside assigned client",
    api.put(`/api/users/${fixtures.users.unscopedUser.userId}/role-assignments`, {
      assignmentRevision: readPayload(delegatedUpdate, ["assignmentRevision"]).assignmentRevision,
      assignments: [{
        role_id: "project_user",
        scope_type: "project",
        scope_id: fixtures.projects.beta.id,
      }],
    }, { cookie: fixtures.sessions.clientAdmin }),
    403,
  );

  await expectStatus(
    "stale delegated assignment revisions fail closed",
    api.put(`/api/users/${fixtures.users.unscopedUser.userId}/role-assignments`, {
      assignmentRevision: readPayload(initialLookup, ["match"]).match.assignmentRevision,
      assignments: [{
        role_id: "project_user",
        scope_type: "project",
        scope_id: fixtures.projects.alpha.id,
      }],
    }, { cookie: fixtures.sessions.clientAdmin }),
    409,
  );
  await expectStatus(
    "delegated assignment revisions cannot be reused by another actor",
    api.put(`/api/users/${fixtures.users.unscopedUser.userId}/role-assignments`, {
      assignmentRevision: readPayload(delegatedUpdate, ["assignmentRevision"]).assignmentRevision,
      assignments: readPayload(delegatedUpdate, ["assignments"]).assignments,
    }, { cookie: fixtures.sessions.projectAdmin }),
    409,
  );

  const projectLookup = await expectStatus(
    "project admin exact lookup sees the lower assignment in its project only",
    api.post("/api/role-assignments/lookup", {
      username: fixtures.users.unscopedUser.username,
    }, { cookie: fixtures.sessions.projectAdmin }),
    200,
  );
  check("project admin lookup does not disclose hidden client assignment data", () => {
    assert.deepEqual(readPayload(projectLookup, ["match"]).match.assignments, [{
      role_id: "project_user",
      scope_id: fixtures.projects.alpha.id,
      scope_type: "project",
    }]);
    assert.equal(JSON.stringify(projectLookup.body).includes(fixtures.clients.beta.id), false);
    assert.equal(JSON.stringify(projectLookup.body).includes("permission"), false);
  });
  await expectStatus(
    "project admin can preserve project users in its assigned project",
    api.put(`/api/users/${fixtures.users.unscopedUser.userId}/role-assignments`, {
      assignmentRevision: readPayload(projectLookup, ["match"]).match.assignmentRevision,
      assignments: readPayload(projectLookup, ["match"]).match.assignments,
    }, { cookie: fixtures.sessions.projectAdmin }),
    200,
  );

  const selfLookup = await expectStatus(
    "delegated exact lookup can resolve the actor without exposing hidden roles",
    api.post("/api/role-assignments/lookup", {
      username: fixtures.users.clientAdmin.username,
    }, { cookie: fixtures.sessions.clientAdmin }),
    200,
  );
  await expectStatus(
    "delegated role mutation rejects self-assignment",
    api.put(`/api/users/${fixtures.users.clientAdmin.userId}/role-assignments`, {
      assignmentRevision: readPayload(selfLookup, ["match"]).match.assignmentRevision,
      assignments: [],
    }, { cookie: fixtures.sessions.clientAdmin }),
    400,
  );

  const protectedLookup = await expectStatus(
    "delegated exact lookup returns no protected role details",
    api.post("/api/role-assignments/lookup", {
      username: fixtures.users.superAdmin.username,
    }, { cookie: fixtures.sessions.clientAdmin }),
    200,
  );
  check("protected exact lookup omits protected state and assignments", () => {
    assert.deepEqual(readPayload(protectedLookup, ["match"]).match.assignments, []);
    assert.equal(Object.hasOwn(readPayload(protectedLookup, ["match"]).match, "protectedUser"), false);
  });
  await expectStatus(
    "delegated role mutation rejects protected users",
    api.put(`/api/users/${fixtures.users.superAdmin.user_id}/role-assignments`, {
      assignmentRevision: readPayload(protectedLookup, ["match"]).match.assignmentRevision,
      assignments: [],
    }, { cookie: fixtures.sessions.clientAdmin }),
    400,
  );

  const scopedAudit = (await querySql(`
SELECT previous_value_json, new_value_json, metadata_json, record_url
FROM audit_logs
WHERE workspace_id = ${sqlText(fixtures.workspaceId)}
  AND actor_user_id = ${sqlText(fixtures.users.clientAdmin.userId)}
  AND action = 'user_role_assignments_updated'
ORDER BY created_at DESC
LIMIT 1;
`))[0];
  check("delegated role audit contains only the visible subset", () => {
    const serializedAudit = JSON.stringify(scopedAudit);
    assert.equal(serializedAudit.includes(fixtures.clients.beta.id), false);
    assert.equal(serializedAudit.includes("permission_overrides"), false);
    assert.equal(JSON.parse(/** @type {string} */ (scopedAudit.metadata_json)).delegation_mode, "scoped");
    assert.equal(scopedAudit.record_url, null);
  });

  const revokedLookup = await expectStatus(
    "client admin can refresh its delegated target before authority revocation",
    api.post("/api/role-assignments/lookup", {
      username: fixtures.users.unscopedUser.username,
    }, { cookie: fixtures.sessions.clientAdmin }),
    200,
  );
  const revokedActorAssignment = (await querySql(`
SELECT *
FROM user_role_assignments
WHERE workspace_id = ${sqlText(fixtures.workspaceId)}
  AND user_id = ${sqlText(fixtures.users.clientAdmin.userId)}
  AND role_id = 'client_admin'
LIMIT 1;
`))[0];
  await runSql(`
DELETE FROM user_role_assignments
WHERE assignment_id = ${sqlText(revokedActorAssignment.assignment_id)};
`);
  await expectStatus(
    "revoked actor authority cannot apply a previously discovered mutation",
    api.put(`/api/users/${fixtures.users.unscopedUser.userId}/role-assignments`, {
      assignmentRevision: readPayload(revokedLookup, ["match"]).match.assignmentRevision,
      assignments: readPayload(revokedLookup, ["match"]).match.assignments,
    }, { cookie: fixtures.sessions.clientAdmin }),
    403,
  );
  await runSql(`
INSERT INTO user_role_assignments (
  assignment_id, workspace_id, user_id, role_id, scope_type, scope_id,
  client_id, project_id, permission_overrides_json, created_at, updated_at
)
VALUES (
  ${sqlText(revokedActorAssignment.assignment_id)},
  ${sqlText(revokedActorAssignment.workspace_id)},
  ${sqlText(revokedActorAssignment.user_id)},
  ${sqlText(revokedActorAssignment.role_id)},
  ${sqlText(revokedActorAssignment.scope_type)},
  ${sqlText(revokedActorAssignment.scope_id)},
  ${sqlText(revokedActorAssignment.client_id)},
  NULL,
  NULL,
  ${sqlText(revokedActorAssignment.created_at)},
  ${sqlText(revokedActorAssignment.updated_at)}
);`);

  await expectStatus(
    "workspace admin can update role assignments",
    api.put(`/api/users/${fixtures.users.unscopedUser.userId}/role-assignments`, {
      assignments: [{
        role_id: "client_user",
        scope_type: "client",
        scope_id: fixtures.clients.alpha.id,
      }],
    }, { cookie: fixtures.sessions.workspaceAdmin }),
    200,
  );
  const fullAdminRows = await querySql(`
SELECT role_id, scope_type, scope_id
FROM user_role_assignments
WHERE workspace_id = ${sqlText(fixtures.workspaceId)}
  AND user_id = ${sqlText(fixtures.users.unscopedUser.userId)}
ORDER BY role_id, scope_id;
`);
  check("workspace admin full replacement remains unchanged", () => {
    assert.deepEqual(fullAdminRows, [{
      role_id: "client_user",
      scope_id: fixtures.clients.alpha.id,
      scope_type: "client",
    }]);
  });
  await expectStatus(
    "role assignment scope IDs must belong to the active workspace",
    api.put(`/api/users/${fixtures.users.unscopedUser.userId}/role-assignments`, {
      assignments: [{
        role_id: "client_user",
        scope_type: "client",
        scope_id: fixtures.otherWorkspace.clientId,
      }],
    }, { cookie: fixtures.sessions.workspaceAdmin }),
    400,
  );
  await expectStatus(
    "Family workspace rejects Business-only delegated roles",
    api.put(`/api/users/${fixtures.users.unscopedUser.userId}/role-assignments`, {
      assignments: [{
        role_id: "client_user",
        scope_type: "client",
        scope_id: fixtures.clients.alpha.id,
      }],
    }, { cookie: fixtures.sessions.familyWorkspaceAdmin }),
    403,
  );
  await expectStatus(
    "Personal workspace rejects Project User role assignment",
    api.put(`/api/users/${fixtures.users.unscopedUser.userId}/role-assignments`, {
      assignments: [{
        role_id: "project_user",
        scope_type: "project",
        scope_id: fixtures.personalWorkspace.projectId,
      }],
    }, { cookie: fixtures.sessions.personalWorkspaceAdmin }),
    403,
  );
}

/** @param {HarnessApi} api @param {HarnessFixtures} fixtures @returns {Promise<void>} */
async function runSettingsTests(api, fixtures) {
  const settings = await api.get("/api/settings", { cookie: fixtures.sessions.workspaceAdmin });
  await expectStatus("workspace admin can read workspace settings", settings, 200);
  await expectStatus(
    "workspace admin can read the latest workspace backup receipt",
    api.get("/api/settings/workspace-backups/latest", { cookie: fixtures.sessions.workspaceAdmin }),
    200,
  );
  await expectStatus(
    "project user cannot create a workspace backup",
    api.post("/api/settings/workspace-backups", {}, { cookie: fixtures.sessions.projectUser }),
    403,
  );
  const workspaceBackup = await expectStatus(
    "workspace admin can create a workspace backup",
    api.post("/api/settings/workspace-backups", {}, { cookie: fixtures.sessions.workspaceAdmin }),
    201,
  );
  check("workspace backup response exposes a checksum without key material or a server path", () => {
    assert.match(readPayload(workspaceBackup, ["backup"]).backup.archiveSha256, /^[a-f0-9]{64}$/);
    assert.equal(readPayload(workspaceBackup, ["backup"]).backup.secureNotesKeyIncluded, false);
    assert.equal(readPayload(workspaceBackup, ["backup"]).backup.workspaceName, "Harness Business Workspace");
    assert.equal(Object.hasOwn(readPayload(workspaceBackup, ["backup"]).backup, "archiveFilename"), false);
    assert.equal(Object.hasOwn(readPayload(workspaceBackup, ["backup"]).backup, "outputPath"), false);
  });
  const latestWorkspaceBackup = await expectStatus(
    "super admin can read the latest workspace backup receipt",
    api.get("/api/settings/workspace-backups/latest", { cookie: fixtures.sessions.superAdmin }),
    200,
  );
  check("latest workspace backup receipt matches the created checksum", () => {
    assert.equal(readPayload(latestWorkspaceBackup, ["backup"]).backup.archiveSha256, readPayload(workspaceBackup, ["backup"]).backup.archiveSha256);
  });
  await expectStatus(
    "project user cannot read workspace deletion state",
    api.get("/api/settings/workspace-deletion", { cookie: fixtures.sessions.projectUser }),
    403,
  );
  await expectStatus(
    "project user cannot schedule workspace deletion",
    api.post("/api/settings/workspace-deletion/request", {
      workspaceName: "Harness Business Workspace",
    }, { cookie: fixtures.sessions.projectUser }),
    403,
  );
  const lifecycleBeforeCounts = await querySql(`
SELECT
  (SELECT COUNT(1) FROM user_workspaces WHERE workspace_id = ${sqlText(fixtures.workspaceId)}) AS memberships,
  (SELECT COUNT(1) FROM sessions WHERE active_workspace_id = ${sqlText(fixtures.workspaceId)}) AS sessions;
`);
  const deletionRequest = await expectStatus(
    "workspace admin can schedule deletion with a recent workspace backup",
    api.post("/api/settings/workspace-deletion/request", {
      workspaceName: "Harness Business Workspace",
    }, { cookie: fixtures.sessions.workspaceAdmin }),
    201,
  );
  check("workspace deletion response is safe, explicit, and 30-day recoverable", () => {
    const deletion = readPayload(deletionRequest, ["deletion"]).deletion;
    assert.equal(deletion.pending, true);
    assert.equal(deletion.lifecycle.status, "pending_deletion");
    assert.equal(deletion.lifecycle.backupProtected, true);
    assert.equal(deletion.lifecycle.noCurrentBackupAcknowledged, false);
    assert.equal(
      new Date(deletion.lifecycle.purgeAfter).getTime() - new Date(deletion.lifecycle.requestedAt).getTime(),
      30 * 24 * 60 * 60 * 1000,
    );
    assert.equal(JSON.stringify(deletion).includes(fixtures.workspaceId), false);
    assert.equal(Object.hasOwn(deletion.lifecycle, "requestedByUserId"), false);
  });
  const pendingShell = await expectStatus(
    "pending workspace remains navigable through the existing session",
    api.get("/api/app-shell/bootstrap", { cookie: fixtures.sessions.workspaceAdmin }),
    200,
  );
  check("app shell exposes the safe pending lifecycle without suppressing modules", () => {
    assert.equal(readPayload(pendingShell, ["workspaceContext"]).workspaceContext.workspaceDeletion.status, "pending_deletion");
    assert.ok(readPayload(pendingShell, ["enabledModules"]).enabledModules.includes("tasks"));
    assert.match(JSON.stringify(readPayload(pendingShell, ["navigation"]).navigation), /workspace-settings\.html/);
  });
  await expectStatus(
    "super admin can cancel deletion during the grace period",
    api.post("/api/settings/workspace-deletion/cancel", {}, { cookie: fixtures.sessions.superAdmin }),
    200,
  );
  const lifecycleAfterCounts = await querySql(`
SELECT
  (SELECT COUNT(1) FROM user_workspaces WHERE workspace_id = ${sqlText(fixtures.workspaceId)}) AS memberships,
  (SELECT COUNT(1) FROM sessions WHERE active_workspace_id = ${sqlText(fixtures.workspaceId)}) AS sessions;
`);
  check("request and cancellation do not alter memberships or sessions", () => {
    assert.deepEqual(lifecycleAfterCounts, lifecycleBeforeCounts);
  });
  const noBackupState = await expectStatus(
    "workspace admin can read a workspace with no current backup",
    api.get("/api/settings/workspace-deletion", { cookie: fixtures.sessions.familyWorkspaceAdmin }),
    200,
  );
  check("no-backup state requires the exact safe acknowledgement phrase", () => {
    assert.equal(readPayload(noBackupState, ["deletion"]).deletion.backup.current, false);
    assert.equal(readPayload(noBackupState, ["deletion"]).deletion.acknowledgementPhrase, "DELETE WITHOUT CURRENT BACKUP");
  });
  await expectStatus(
    "workspace deletion refuses an incorrect no-backup acknowledgement",
    api.post("/api/settings/workspace-deletion/request", {
      acknowledgement: "delete",
      workspaceName: "Family Harness Workspace",
    }, { cookie: fixtures.sessions.familyWorkspaceAdmin }),
    400,
  );
  const noBackupRequest = await expectStatus(
    "workspace admin can explicitly acknowledge deletion without a current backup",
    api.post("/api/settings/workspace-deletion/request", {
      acknowledgement: "DELETE WITHOUT CURRENT BACKUP",
      workspaceName: "Family Harness Workspace",
    }, { cookie: fixtures.sessions.familyWorkspaceAdmin }),
    201,
  );
  check("no-backup acknowledgement is recorded without pretending a receipt exists", () => {
    assert.equal(readPayload(noBackupRequest, ["deletion"]).deletion.lifecycle.backupProtected, false);
    assert.equal(readPayload(noBackupRequest, ["deletion"]).deletion.lifecycle.noCurrentBackupAcknowledged, true);
  });
  await expectStatus(
    "workspace admin can cancel an acknowledged no-backup deletion request",
    api.post("/api/settings/workspace-deletion/cancel", {}, { cookie: fixtures.sessions.familyWorkspaceAdmin }),
    200,
  );
  await expectStatus(
    "workspace admin can update workspace settings",
    api.put("/api/settings", {
      ...workspaceSettingsSavePayload(readPayload(settings, ["moduleSettings"])),
      workspaceName: "Permission Regression Workspace",
      moduleSettings: moduleSettingsPayload(readPayload(settings, ["moduleSettings"])),
    }, { cookie: fixtures.sessions.workspaceAdmin }),
    200,
  );
  await expectStatus(
    "workspace type cannot be changed after creation",
    api.put("/api/settings", {
      ...workspaceSettingsSavePayload(readPayload(settings, ["moduleSettings"])),
      workspaceType: "personal",
      moduleSettings: moduleSettingsPayload(readPayload(settings, ["moduleSettings"])),
    }, { cookie: fixtures.sessions.workspaceAdmin }),
    400,
  );
  const unchangedType = await expectStatus(
    "workspace settings remain readable after a rejected type change",
    api.get("/api/settings", { cookie: fixtures.sessions.workspaceAdmin }),
    200,
  );
  check("rejected direct requests preserve the workspace type", () => {
    assert.equal(readPayload(unchangedType, ["workspaceType"]).workspaceType, "business");
  });
  await expectStatus(
    "super admin can rename a workspace",
    api.put("/api/settings", {
      ...workspaceSettingsSavePayload(readPayload(unchangedType, ["moduleSettings"])),
      workspaceName: "Super Admin Renamed Workspace",
      moduleSettings: moduleSettingsPayload(readPayload(unchangedType, ["moduleSettings"])),
    }, { cookie: fixtures.sessions.superAdmin }),
    200,
  );
  await expectStatus(
    "project user cannot update workspace settings",
    api.put("/api/settings", {
      ...workspaceSettingsSavePayload(readPayload(settings, ["moduleSettings"])),
      workspaceName: "Denied Workspace",
      moduleSettings: moduleSettingsPayload(readPayload(settings, ["moduleSettings"])),
    }, { cookie: fixtures.sessions.projectUser }),
    403,
  );
}

/** @param {HarnessApi} api @param {HarnessFixtures} fixtures @returns {Promise<void>} */
async function runOwnershipScopeTests(api, fixtures) {
  const entry = await createTimeEntry(api, fixtures.sessions.projectUser, fixtures.projects.alpha.id);
  const adminEntry = await createTimeEntry(api, fixtures.sessions.workspaceAdmin, fixtures.projects.alpha.id);
  const clientAdminList = await expectStatus(
    "client admin can list scoped time entries from other users",
    api.get("/api/time-entries", { cookie: fixtures.sessions.clientAdmin }),
    200,
  );
  check("client admin scoped time list includes team entries in assigned client", () => {
    assert.ok(readPayload(clientAdminList, ["entries"]).entries.some((item) => item.entry_id === adminEntry.entry_id));
  });
  const projectAdminList = await expectStatus(
    "project admin can list scoped project time entries from other users",
    api.get("/api/time-entries", { cookie: fixtures.sessions.projectAdmin }),
    200,
  );
  check("project admin scoped time list includes team entries in assigned client", () => {
    assert.ok(readPayload(projectAdminList, ["entries"]).entries.some((item) => item.entry_id === adminEntry.entry_id));
  });
  const update = await api.put(
    `/api/time-entries/${encodeURIComponent(entry.entry_id)}`,
    timeEntryPayload(fixtures.projects.alpha.id, { user_id: fixtures.users.clientUser.userId, description: "Attempted owner spoof" }),
    { cookie: fixtures.sessions.projectUser },
  );
  await expectStatus("time-entry update accepts valid owner-spoof regression request", update, 200);
  check("time-entry update cannot change user_id", () => {
    assert.equal(readPayload(update, ["entry"]).entry.user_id, fixtures.users.projectUser.userId);
  });

  const apiKey = await createApiKey(api, fixtures.sessions.workspaceAdmin, ["time_entries:write"]);
  const create = await api.post("/api/v1/time-entries", timeEntryPayload(fixtures.projects.alpha.id, {
    user_id: fixtures.users.projectUser.userId,
    description: "Public API attempted owner spoof",
  }), { bearer: apiKey.rawKey });
  await expectStatus("public API time-entry create accepts valid owner-spoof regression request", create, 201);
  check("public API time-entry create cannot spoof user_id", () => {
    assert.equal(readPayload(create, ["data"]).data.user_id, fixtures.users.workspaceAdmin.userId);
  });
}

/** @param {HarnessApi} api @param {HarnessFixtures} fixtures @returns {Promise<void>} */
async function runClientProjectDomainTests(api, fixtures) {
  const archivedClient = await createClient(api, fixtures.sessions.workspaceAdmin, "Archived Scope Client");
  const archivedProject = await createProject(api, fixtures.sessions.workspaceAdmin, fixtures.clients.alpha.id, "Archived Scope Project");
  await expectStatus(
    "archived clients remain readable before downstream checks",
    api.get(`/api/clients/${encodeURIComponent(archivedClient.id)}`, { cookie: fixtures.sessions.workspaceAdmin }),
    200,
  );
  await expectStatus(
    "workspace admin can archive clients for downstream checks",
    api.delete(`/api/clients/${encodeURIComponent(archivedClient.id)}`, { cookie: fixtures.sessions.workspaceAdmin }),
    200,
  );
  await expectStatus(
    "archived clients cannot receive new projects",
    api.post(`/api/clients/${encodeURIComponent(archivedClient.id)}/projects`, { name: "Denied Archived Client Project" }, { cookie: fixtures.sessions.workspaceAdmin }),
    400,
  );
  await expectStatus(
    "archived clients cannot be assigned as parent clients",
    api.post("/api/clients", { name: "Denied Archived Parent Client", parent_client_id: archivedClient.id }, { cookie: fixtures.sessions.workspaceAdmin }),
    400,
  );
  await expectStatus(
    "existing clients cannot be moved under archived parent clients",
    api.put(`/api/clients/${encodeURIComponent(fixtures.clients.beta.id)}`, { name: fixtures.clients.beta.name, parent_client_id: archivedClient.id }, { cookie: fixtures.sessions.workspaceAdmin }),
    400,
  );
  await expectStatus(
    "projects cannot move into archived clients",
    api.put(`/api/projects/${encodeURIComponent(fixtures.projects.alpha.id)}`, { client_id: archivedClient.id, name: "Denied Archived Client Move" }, { cookie: fixtures.sessions.workspaceAdmin }),
    400,
  );
  await expectStatus(
    "workspace admin can archive projects for downstream checks",
    api.delete(`/api/projects/${encodeURIComponent(archivedProject.id)}`, { cookie: fixtures.sessions.workspaceAdmin }),
    200,
  );
  await expectStatus(
    "archived projects remain readable",
    api.get(`/api/projects/${encodeURIComponent(archivedProject.id)}`, { cookie: fixtures.sessions.workspaceAdmin }),
    200,
  );
  await expectStatus(
    "archived projects cannot be assigned as parent projects",
    api.post(`/api/clients/${encodeURIComponent(fixtures.clients.alpha.id)}/projects`, { name: "Denied Archived Parent Project", parent_project_id: archivedProject.id }, { cookie: fixtures.sessions.workspaceAdmin }),
    400,
  );
  await expectStatus(
    "existing projects cannot be moved under archived parent projects",
    api.put(`/api/projects/${encodeURIComponent(fixtures.projects.alpha.id)}`, { client_id: fixtures.clients.alpha.id, name: fixtures.projects.alpha.name, parent_project_id: archivedProject.id }, { cookie: fixtures.sessions.workspaceAdmin }),
    400,
  );
  await expectStatus(
    "archived projects cannot receive time entries",
    api.post("/api/time-entries", timeEntryPayload(archivedProject.id), { cookie: fixtures.sessions.workspaceAdmin }),
    400,
  );
  await expectStatus(
    "archived projects cannot receive active timers",
    api.put("/api/active-timers/archived-project", timerPayload(archivedProject.id), { cookie: fixtures.sessions.workspaceAdmin }),
    400,
  );
  const apiKey = await createApiKey(api, fixtures.sessions.workspaceAdmin, ["time_entries:write"]);
  await expectStatus(
    "archived projects cannot receive public API time entries",
    api.post("/api/v1/time-entries", timeEntryPayload(archivedProject.id), { bearer: apiKey.rawKey }),
    400,
  );
}

/** @param {HarnessApi} api @param {HarnessFixtures} fixtures @returns {Promise<void>} */
async function runWorkspaceOwnerLifecycleTests(api, fixtures) {
  const ownedWorkspace = await expectStatus(
    "workspace admin can create an owned workspace for lifecycle checks",
    api.post("/api/workspaces", {
      workspaceName: `Owner Lifecycle ${randomUUID()}`,
      workspaceType: "business",
      timeTrackingEnabled: true,
    }, { cookie: fixtures.sessions.workspaceAdmin }),
    201,
  );
  const transferAdmin = userFixture("owner-transfer-admin");
  const transferNow = "2026-01-01T00:00:00.000Z";

  await runSql(`
${userInsertSql(readPayload(ownedWorkspace, ["workspace"]).workspace.workspaceId, transferAdmin)}
${membershipInsertSql(readPayload(ownedWorkspace, ["workspace"]).workspace.workspaceId, transferAdmin, transferNow)}
${assignmentInsertSql(readPayload(ownedWorkspace, ["workspace"]).workspace.workspaceId, transferAdmin.userId, "workspace_admin", "workspace", readPayload(ownedWorkspace, ["workspace"]).workspace.workspaceId, transferNow)}
`);
  const transferAdminSession = await createSession(
    readPayload(ownedWorkspace, ["workspace"]).workspace.workspaceId,
    transferAdmin.userId,
    transferAdmin.username,
  );
  await expectStatus(
    "workspace owner removal transfers ownership to senior workspace admin",
    api.delete(`/api/users/${fixtures.users.workspaceAdmin.userId}`, { cookie: transferAdminSession }),
    200,
  );
  const transferredOwner = await querySql(`
SELECT owner_user_id
FROM workspaces
WHERE workspace_id = ${sqlText(readPayload(ownedWorkspace, ["workspace"]).workspace.workspaceId)}
LIMIT 1;
`);
  check("workspace owner transfer selects the active workspace administrator", () => {
    assert.equal(transferredOwner[0]?.owner_user_id, transferAdmin.userId);
  });

  const blockedWorkspace = await expectStatus(
    "workspace admin can create a candidate-free owned workspace",
    api.post("/api/workspaces", {
      workspaceName: `Owner Block ${randomUUID()}`,
      workspaceType: "business",
      timeTrackingEnabled: true,
    }, { cookie: fixtures.sessions.workspaceAdmin }),
    201,
  );
  const blockedOwnerSession = await createSession(
    readPayload(blockedWorkspace, ["workspace"]).workspace.workspaceId,
    fixtures.users.workspaceAdmin.userId,
    fixtures.users.workspaceAdmin.username,
  );
  await expectStatus(
    "workspace owner removal blocks when no other workspace admin exists",
    api.delete(`/api/users/${fixtures.users.workspaceAdmin.userId}`, { cookie: blockedOwnerSession }),
    400,
  );

  const unassigned = await api.post("/api/users", {
    username: uniqueEmail("unassigned-fallback"),
    displayName: "Unassigned Fallback",
    timezone: "America/New_York",
  }, { cookie: fixtures.sessions.workspaceAdmin });
  await expectStatus("workspace admin can create a user for no-workspace fallback", unassigned, 201);
  await expectStatus(
    "removing all workspace memberships creates a personal fallback workspace",
    api.put(`/api/users/${readPayload(unassigned, ["user"]).user.user_id}/update`, {
      workspaceMemberships: [],
      timezone: "America/New_York",
    }, { cookie: fixtures.sessions.workspaceAdmin }),
    200,
  );
  const fallbackMemberships = await querySql(`
SELECT workspaces.workspace_type, user_workspaces.workspace_id, user_workspaces.status, users.active_workspace_id
FROM user_workspaces
INNER JOIN workspaces ON workspaces.workspace_id = user_workspaces.workspace_id
INNER JOIN users ON users.user_id = user_workspaces.user_id
WHERE user_workspaces.user_id = ${sqlText(readPayload(unassigned, ["user"]).user.user_id)}
  AND user_workspaces.status = 'active'
ORDER BY workspaces.created_at DESC;
`);
  check("personal fallback workspace is active for unassigned user", () => {
    assert.equal(fallbackMemberships[0]?.workspace_type, "personal");
    assert.equal(fallbackMemberships[0]?.status, "active");
    assert.equal(fallbackMemberships[0]?.active_workspace_id, fallbackMemberships[0]?.workspace_id);
  });
}

/** @param {HarnessApi} api @param {HarnessFixtures} fixtures @returns {Promise<void>} */
async function runWorkspaceCreationModuleSettingTests(api, fixtures) {
  const userSettings = await expectStatus(
    "workspace admin can read workspace creation module controls",
    api.get("/api/user/settings", { cookie: fixtures.sessions.workspaceAdmin }),
    200,
  );
  const businessType = readPayload(userSettings, ["workspaceCreation"]).workspaceCreation.availableTypes.find((type) => type.workspaceType === "business");
  assert.ok(businessType, "workspace creation should offer the business type");

  check("Create Workspace exposes module settings for Business workspaces", () => {
    assert.ok(businessType);
    assert.ok(businessType.moduleSettings.some((moduleDefinition) => moduleDefinition.moduleId === "tasks"));
    assert.ok(businessType.moduleSettings.some((moduleDefinition) => moduleDefinition.moduleId === "time-tracking"));
  });
  check("required modules appear locked in Create Workspace module controls", () => {
    const requiredModule = businessType.moduleSettings.find((moduleDefinition) => moduleDefinition.moduleId === "client-projects");
    assert.ok(requiredModule?.settings, "the business type should carry required module settings");
    assert.ok(requiredModule);
    assert.ok(requiredModule.settings.some((setting) => setting.moduleStatus === true && setting.readOnly === true));
  });

  const tasksOffWorkspace = await expectStatus(
    "workspace admin can create Business workspace with Tasks off and Time Tracking on",
    api.post("/api/workspaces", {
      workspaceName: `Tasks Off ${randomUUID()}`,
      workspaceType: "business",
      moduleSettings: createWorkspaceModuleSettingsPayload(businessType, {
        tasks: { tasksEnabled: false },
        "time-tracking": { timeTrackingEnabled: true },
      }),
    }, { cookie: fixtures.sessions.workspaceAdmin }),
    201,
  );
  const tasksOffStatuses = await readWorkspaceModuleStatuses(readPayload(tasksOffWorkspace, ["workspace"]).workspace.workspaceId);
  check("created workspace stores Tasks off and Time Tracking on", () => {
    assert.equal(tasksOffStatuses.get("tasks"), "disabled");
    assert.equal(tasksOffStatuses.get("time-tracking"), "enabled");
  });
  const tasksOffShell = await expectStatus(
    "app shell loads after creating workspace with Tasks disabled",
    api.get("/api/app-shell/bootstrap", { cookie: fixtures.sessions.workspaceAdmin }),
    200,
  );
  check("disabled Tasks do not appear in nav after creation", () => {
    assert.equal(flattenNavigationHrefs(readPayload(tasksOffShell, ["navigation"]).navigation).includes("tasks.html"), false);
  });

  const tasksOffSettings = await expectStatus(
    "Workspace Settings exposes the same Business module availability rules",
    api.get("/api/settings", { cookie: fixtures.sessions.workspaceAdmin }),
    200,
  );
  check("Workspace Settings keeps required module controls locked", () => {
    const requiredModule = readPayload(tasksOffSettings, ["moduleSettings"]).moduleSettings.find((moduleDefinition) => moduleDefinition.moduleId === "client-projects");
    assert.ok(requiredModule);
    assert.ok(requiredModule.settings.some((setting) => setting.moduleStatus === true && setting.readOnly === true));
  });
  check("Workspace Settings and Create Workspace expose matching Business module setting IDs", () => {
    assert.deepEqual(
      moduleStatusSettingKeys(readPayload(tasksOffSettings, ["moduleSettings"]).moduleSettings),
      moduleStatusSettingKeys(businessType.moduleSettings),
    );
  });

  const timeTrackingOffWorkspace = await expectStatus(
    "workspace admin can create Business workspace with Time Tracking off and Tasks on",
    api.post("/api/workspaces", {
      workspaceName: `Time Tracking Off ${randomUUID()}`,
      workspaceType: "business",
      moduleSettings: createWorkspaceModuleSettingsPayload(businessType, {
        tasks: { tasksEnabled: true },
        "time-tracking": { timeTrackingEnabled: false },
      }),
    }, { cookie: fixtures.sessions.workspaceAdmin }),
    201,
  );
  const timeTrackingOffStatuses = await readWorkspaceModuleStatuses(readPayload(timeTrackingOffWorkspace, ["workspace"]).workspace.workspaceId);
  check("created workspace stores Time Tracking off and Tasks on", () => {
    assert.equal(timeTrackingOffStatuses.get("tasks"), "enabled");
    assert.equal(timeTrackingOffStatuses.get("time-tracking"), "disabled");
  });
  const timeTrackingOffShell = await expectStatus(
    "app shell loads after creating workspace with Time Tracking disabled",
    api.get("/api/app-shell/bootstrap", { cookie: fixtures.sessions.workspaceAdmin }),
    200,
  );
  check("disabled Time Tracking does not appear in nav after creation", () => {
    const hrefs = flattenNavigationHrefs(readPayload(timeTrackingOffShell, ["navigation"]).navigation);
    assert.equal(hrefs.includes("time-tracker.html"), false);
    assert.equal(hrefs.includes("manual-entry.html"), false);
    assert.equal(hrefs.includes("edit-entries.html"), false);
  });
}

/** @param {HarnessApi} api @param {HarnessFixtures} fixtures @returns {Promise<void>} */
async function runDisabledModuleTests(api, fixtures) {
  const settings = await api.get("/api/settings", { cookie: fixtures.sessions.workspaceAdmin });
  await expectStatus("workspace admin can read settings before disabled-module smoke", settings, 200);
  const permissionResources = await expectStatus(
    "workspace admin can read the permission resource catalog",
    api.get("/api/users/permission-resources", { cookie: fixtures.sessions.workspaceAdmin }),
    200,
  );
  check("permission resource catalog contains contributed resources only", () => {
    const resourceKeys = new Set(readPayload(permissionResources, ["resources"]).resources.map((resource) => resource.key));
    assert.equal(resourceKeys.has("time_entries"), true);
    assert.equal(resourceKeys.has("lists"), true);
    assert.equal(resourceKeys.has("tags"), true);
    assert.equal(resourceKeys.has("tickets"), false);
    assert.equal(resourceKeys.has("knowledge_base"), false);
  });
  await expectStatus(
    "project user cannot read the User Admin permission resource catalog",
    api.get("/api/users/permission-resources", { cookie: fixtures.sessions.projectUser }),
    403,
  );
  check("settings expose Time Tracking module metadata", () => {
    const timeTrackingModule = asModuleList(readPayload(settings, ["modules"]).modules).find((moduleDefinition) => moduleDefinition.id === "time-tracking");
    assert.ok(timeTrackingModule);
    assert.ok(timeTrackingModule.navigation.some((item) => item.href === "time-tracker.html"));
    assert.ok(timeTrackingModule.dashboard.some((item) =>
      item.id === "active-timers" &&
      item.renderer === "time-tracking.active-timers" &&
      item.placement === "main" &&
      item.dataRoute === "/api/time-tracking/dashboard/effort-summary"));
    assert.ok(timeTrackingModule.dashboard.some((item) =>
      item.id === "recent-time" &&
      item.renderer === "time-tracking.recent-time" &&
      item.placement === "main" &&
      item.dataRoute === "/api/time-tracking/dashboard/effort-summary"));
    assert.equal(timeTrackingModule.dashboard.some((item) => item.id === "current-month-billables"), false);
    assert.equal(timeTrackingModule.dashboard.some((item) => item.id === "hours-billables-chart"), false);
    assert.ok(timeTrackingModule.publicApiEndpoints.some((item) => item.path === "/api/v1/time-entries"));
    assert.ok(timeTrackingModule.settings.some((item) => item.id === "timeTrackingEnabled"));
  });
  check("settings expose Tasks module metadata", () => {
    const tasksModule = asModuleList(readPayload(settings, ["modules"]).modules).find((moduleDefinition) => moduleDefinition.id === "tasks");
    assert.ok(tasksModule);
    assert.ok(tasksModule.navigation.some((item) => item.href === "tasks.html"));
    assert.ok(tasksModule.dashboard.some((item) =>
      item.id === "tasks-needs-attention" &&
      item.renderer === "tasks.needs-attention" &&
      item.placement === "attention" &&
      item.dataRoute === "/api/tasks/dashboard-summary"));
    assert.ok(tasksModule.dashboard.some((item) =>
      item.id === "tasks-today-upcoming" &&
      item.renderer === "tasks.today-upcoming" &&
      item.placement === "today" &&
      item.dataRoute === "/api/tasks/dashboard-summary"));
    assert.ok(tasksModule.dashboard.some((item) =>
      item.id === "task-summary" &&
      item.renderer === "tasks.pressure" &&
      item.placement === "main" &&
      item.dataRoute === "/api/tasks/dashboard-summary"));
    assert.ok(tasksModule.publicApiEndpoints.some((item) => item.path === "/api/v1/tasks"));
    assert.ok(tasksModule.settings.some((item) => item.id === "tasksEnabled"));
    assert.ok(tasksModule.settings.some((item) => item.id === "taskTimersEnabled"));
    assert.equal(readPayload(settings, ["enabledModules"]).enabledModules.includes("tasks"), true);
    assert.equal(Object.hasOwn(payloadRecord(settings), "tasksEnabled"), false);
    assert.equal(Object.hasOwn(payloadRecord(settings), "timeTrackingEnabled"), false);
    assert.equal(Object.hasOwn(payloadRecord(settings), "taskTimersEnabled"), false);
  });
  const apiKey = await createApiKey(api, fixtures.sessions.workspaceAdmin, ["time_entries:read", "time_entries:write"]);
  const tasksApiKey = await createApiKey(api, fixtures.sessions.workspaceAdmin, ["tasks:read", "tasks:write"]);
  const disabledSettings = await api.put("/api/settings", {
    ...workspaceSettingsSavePayload(readPayload(settings, ["moduleSettings"])),
    moduleSettings: moduleSettingsPayload(readPayload(settings, ["moduleSettings"]), {
      "time-tracking": { timeTrackingEnabled: false },
    }),
  }, { cookie: fixtures.sessions.workspaceAdmin });
  await expectStatus("workspace admin can disable Time Tracking", disabledSettings, 200);
  check("disabled Time Tracking is removed from enabled module list", () => {
    assert.equal(Object.hasOwn(readPayload(disabledSettings, ["data"]).data, "timeTrackingEnabled"), false);
    assert.equal(readPayload(disabledSettings, ["data"]).data.enabledModules.includes("time-tracking"), false);
  });
  await expectStatus(
    "disabled Time Tracking drops out of the permission matrix catalog",
    api.get("/api/users/permission-resources", { cookie: fixtures.sessions.workspaceAdmin }),
    200,
  ).then((response) => {
    check("disabled Time Tracking contributes no permission resource", () => {
      assert.equal(readPayload(response, ["resources"]).resources.some((resource) => resource.key === "time_entries"), false);
    });
  });
  await expectStatus(
    "disabled Time Tracking removes compact dashboard cards",
    api.get("/api/dashboard", { cookie: fixtures.sessions.projectUser }),
    200,
  ).then((response) => {
    check("disabled Time Tracking contributes no active or recent time dashboard panels", () => {
      const panels = readPayload(response, ["extensionPoints"]).extensionPoints.dashboardPanels || [];
      assert.equal(panels.some((panel) => panel.id === "active-timers"), false);
      assert.equal(panels.some((panel) => panel.id === "recent-time"), false);
    });
  });

  await expectStatus(
    "disabled Time Tracking keeps historical time-entry reads available",
    api.get("/api/time-entries", { cookie: fixtures.sessions.projectUser }),
    200,
  );
  await expectStatus(
    "disabled Time Tracking keeps public API time-entry reads available",
    api.get("/api/v1/time-entries", { bearer: apiKey.rawKey }),
    200,
  );
  await expectStatus(
    "disabled Time Tracking blocks time-entry writes",
    api.post("/api/time-entries", timeEntryPayload(fixtures.projects.alpha.id), { cookie: fixtures.sessions.projectUser }),
    403,
  );
  await expectStatus(
    "disabled Time Tracking blocks public API time-entry writes",
    api.post("/api/v1/time-entries", timeEntryPayload(fixtures.projects.alpha.id), { bearer: apiKey.rawKey }),
    403,
  );
  await expectStatus(
    "disabled Time Tracking blocks active-timer writes",
    api.put("/api/active-timers/disabled-smoke", timerPayload(fixtures.projects.alpha.id), { cookie: fixtures.sessions.projectUser }),
    403,
  );
  await expectStatus(
    "disabled Time Tracking blocks task timer writes",
    api.put(`/api/tasks/${encodeURIComponent(requirePublishedTaskId(fixtures.taskTimerGateTaskId, "taskTimerGateTaskId"))}/timer`, {
      timer_status: "running",
      accumulated_elapsed_seconds: 1,
      last_active_start_time: new Date().toISOString(),
    }, { cookie: fixtures.sessions.projectUser }),
    403,
  );
  await expectStatus("workspace admin can re-enable Time Tracking", api.put("/api/settings", {
    ...workspaceSettingsSavePayload(readPayload(settings, ["moduleSettings"])),
    moduleSettings: moduleSettingsPayload(readPayload(settings, ["moduleSettings"]), {
      "time-tracking": { timeTrackingEnabled: true },
    }),
  }, { cookie: fixtures.sessions.workspaceAdmin }), 200);
  await expectStatus(
    "re-enabled Time Tracking returns to the permission matrix catalog",
    api.get("/api/users/permission-resources", { cookie: fixtures.sessions.workspaceAdmin }),
    200,
  ).then((response) => {
    check("re-enabled Time Tracking contributes its permission resource", () => {
      assert.equal(readPayload(response, ["resources"]).resources.some((resource) => resource.key === "time_entries"), true);
    });
  });
  await expectStatus("workspace admin can disable Task Timers sub-option", api.put("/api/settings", {
    ...workspaceSettingsSavePayload(readPayload(settings, ["moduleSettings"])),
    moduleSettings: moduleSettingsPayload(readPayload(settings, ["moduleSettings"]), {
      tasks: { taskTimersEnabled: false },
    }),
  }, { cookie: fixtures.sessions.workspaceAdmin }), 200);
  await expectStatus(
    "disabled Task Timers sub-option blocks task timer writes",
    api.put(`/api/tasks/${encodeURIComponent(requirePublishedTaskId(fixtures.taskTimerGateTaskId, "taskTimerGateTaskId"))}/timer`, {
      timer_status: "running",
      accumulated_elapsed_seconds: 1,
      last_active_start_time: new Date().toISOString(),
    }, { cookie: fixtures.sessions.projectUser }),
    403,
  );
  await expectStatus("workspace admin can re-enable Task Timers sub-option", api.put("/api/settings", {
    ...workspaceSettingsSavePayload(readPayload(settings, ["moduleSettings"])),
    moduleSettings: moduleSettingsPayload(readPayload(settings, ["moduleSettings"]), {
      tasks: { taskTimersEnabled: true },
    }),
  }, { cookie: fixtures.sessions.workspaceAdmin }), 200);
  const disabledTasksSettings = await api.put("/api/settings", {
    ...workspaceSettingsSavePayload(readPayload(settings, ["moduleSettings"])),
    moduleSettings: moduleSettingsPayload(readPayload(settings, ["moduleSettings"]), {
      tasks: { tasksEnabled: false },
    }),
  }, { cookie: fixtures.sessions.workspaceAdmin });
  await expectStatus("workspace admin can disable Tasks", disabledTasksSettings, 200);
  check("disabled Tasks are removed from enabled module list", () => {
    assert.equal(Object.hasOwn(readPayload(disabledTasksSettings, ["data"]).data, "tasksEnabled"), false);
    assert.equal(readPayload(disabledTasksSettings, ["data"]).data.enabledModules.includes("tasks"), false);
  });
  await expectStatus(
    "disabled Tasks keep historical task reads available",
    api.get("/api/tasks", { cookie: fixtures.sessions.projectUser }),
    200,
  );
  await expectStatus(
    "disabled Tasks keep public API task reads available",
    api.get("/api/v1/tasks", { bearer: tasksApiKey.rawKey }),
    200,
  );
  await expectStatus(
    "disabled Tasks block task writes",
    api.post("/api/tasks", { title: "Denied disabled task", project_id: fixtures.projects.alpha.id }, { cookie: fixtures.sessions.projectUser }),
    403,
  );
  await expectStatus(
    "disabled Tasks block public API task writes",
    api.post("/api/v1/tasks", { title: "Denied disabled public task", project_id: fixtures.projects.alpha.id }, { bearer: tasksApiKey.rawKey }),
    403,
  );
  await expectStatus("workspace admin can re-enable Tasks", api.put("/api/settings", {
    ...workspaceSettingsSavePayload(readPayload(settings, ["moduleSettings"])),
    moduleSettings: moduleSettingsPayload(readPayload(settings, ["moduleSettings"]), {
      tasks: { tasksEnabled: true },
    }),
  }, { cookie: fixtures.sessions.workspaceAdmin }), 200);
  await expectStatus("top-level legacy module settings are rejected", api.put("/api/settings", {
    ...workspaceSettingsSavePayload(readPayload(settings, ["moduleSettings"])),
    timeTrackingEnabled: false,
  }, { cookie: fixtures.sessions.workspaceAdmin }), 400);
}

/** @param {HarnessSettings} settings @returns {HarnessSettings} */
function workspaceSettingsSavePayload(settings) {
  return {
    workspaceName: settings.workspaceName,
    workspaceType: settings.workspaceType,
    audit: settings.audit,
  };
}

/** @param {HarnessSettings} settings @param {HarnessSettingsPayload} [overrides] @returns {HarnessSettingsPayload} */
function moduleSettingsPayload(settings, overrides = {}) {
  /** @type {HarnessSettingsPayload} */
  const payload = {};

  for (const moduleDefinition of settings.moduleSettings || []) {
    const moduleId = moduleDefinition.moduleId;

    if (!moduleId) {
      continue;
    }

    payload[moduleId] = {};
    for (const setting of moduleDefinition.settings || []) {
      if (setting.readOnly === true) {
        continue;
      }
      payload[moduleId][setting.id] = setting.value;
    }
  }

  for (const [moduleId, settingsById] of Object.entries(overrides)) {
    payload[moduleId] = {
      ...(payload[moduleId] || {}),
      ...settingsById,
    };
  }

  return payload;
}

/**
 * Despite the parameter name this receives a workspace settings record, not a
 * workspace type string; it reads `moduleSettings` straight off it.
 * @param {HarnessSettings} workspaceType
 * @param {HarnessSettingsPayload} [overrides]
 * @returns {HarnessSettingsPayload}
 */
function createWorkspaceModuleSettingsPayload(workspaceType, overrides = {}) {
  const payload = moduleSettingsPayload({
    moduleSettings: workspaceType.moduleSettings || [],
  }, overrides);

  for (const [moduleId, settingsById] of Object.entries(payload)) {
    if (Object.keys(settingsById).length === 0) {
      delete payload[moduleId];
    }
  }

  return payload;
}

/** @param {string} workspaceId */
async function readWorkspaceModuleStatuses(workspaceId) {
  const rows = await querySql(`
SELECT module_id, status
FROM workspace_modules
WHERE workspace_id = ${sqlText(workspaceId)};
`);

  return new Map(rows.map((row) => [row.module_id, row.status]));
}

/** @param {HarnessModuleDefinition[]} moduleSettings @returns {string[]} */
function moduleStatusSettingKeys(moduleSettings) {
  return (moduleSettings || []).flatMap((moduleDefinition) => (
    (moduleDefinition.settings || [])
      .filter((setting) => setting.moduleStatus === true)
      .map((setting) => `${moduleDefinition.moduleId}.${setting.id}`)
  )).sort();
}

/** @param {HarnessNavigationItem[]} navigation @returns {string[]} */
function flattenNavigationHrefs(navigation) {
  return (navigation || []).flatMap((item) => [
    item.href,
    ...flattenNavigationHrefs(item.children || []),
  ]).filter((href) => typeof href === "string");
}

/** @param {HarnessApi} api @param {HarnessFixtures} fixtures @returns {Promise<void>} */
async function runReportingPermissionTests(api, fixtures) {
  await expectStatus(
    "client user can read scoped reporting bootstrap",
    api.get("/api/reporting/bootstrap", { cookie: fixtures.sessions.clientUser }),
    200,
  );
  await expectStatus(
    "workspace admin can filter reporting summaries by task timer link",
    api.get(`/api/reporting/project-summary?scopeId=${encodeURIComponent(fixtures.clients.alpha.id)}&taskId=${encodeURIComponent(requirePublishedTaskId(fixtures.taskTimerTaskId, "taskTimerTaskId"))}`, { cookie: fixtures.sessions.workspaceAdmin }),
    200,
  ).then((response) => {
    check("task-linked reporting filter isolates finalized task timer time", () => {
      assert.deepEqual(readPayload(response, ["taskFilter"]).taskFilter, [fixtures.taskTimerTaskId]);
      assert.equal(readPayload(response, ["rows"]).rows.length, 1);
      assert.equal(readPayload(response, ["rows"]).rows[0].project.id, fixtures.projects.alpha.id);
      assert.equal(readPayload(response, ["rows"]).rows[0].rawSeconds, 60);
      assert.equal(readPayload(response, ["totals"]).totals.seconds, 60);
    });
  });
  await expectStatus(
    "external client user cannot read reporting bootstrap",
    api.get("/api/reporting/bootstrap", { cookie: fixtures.sessions.externalClientUser }),
    403,
  );
}

/** @param {HarnessApi} api @param {string} cookie @param {string[]} scopes */
async function createApiKey(api, cookie, scopes) {
  const response = await api.post("/api/api-keys", { name: `Harness key ${randomUUID()}`, scopes }, { cookie });
  await expectStatus(`created API key with scopes ${scopes.join(",")}`, response, 201);
  return readPayload(response, ["apiKey", "apiKeys", "availableScopes", "rawKey"]);
}

/** @param {HarnessApi} api @param {string} cookie @param {string} name @param {Record<string, unknown>} [extra] */
async function createClient(api, cookie, name, extra = {}) {
  const response = await api.post("/api/clients", { name, ...extra }, { cookie });
  await expectStatus(`created client ${name}`, response, 201);
  return readPayload(response, ["client"]).client;
}

/** @param {HarnessApi} api @param {string} cookie @param {string} clientId @param {string} name @param {Record<string, unknown>} [extra] */
async function createProject(api, cookie, clientId, name, extra = {}) {
  const response = await api.post(`/api/clients/${encodeURIComponent(clientId)}/projects`, { name, ...extra }, { cookie });
  await expectStatus(`created project ${name}`, response, 201);
  return readPayload(response, ["project"]).project;
}

/** @param {HarnessApi} api @param {string} cookie @param {string} projectId */
async function createTimeEntry(api, cookie, projectId) {
  const response = await api.post("/api/time-entries", timeEntryPayload(projectId), { cookie });
  await expectStatus(`created time entry for ${projectId}`, response, 201);
  return readPayload(response, ["entry", "entry_id"]);
}

/** @param {string} workspaceId @param {string} userId @param {string} name @returns {Promise<{ name: string, tagId: string }>} */
async function createTag(workspaceId, userId, name) {
  const tagId = `tag-${randomUUID()}`;
  const now = new Date().toISOString();

  await runSql(`
INSERT INTO tags (
  tag_id,
  workspace_id,
  name,
  slug,
  description,
  color,
  status,
  created_by_user_id,
  created_at,
  updated_at
)
VALUES (
  ${sqlText(tagId)},
  ${sqlText(workspaceId)},
  ${sqlText(name)},
  ${sqlText(name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""))},
  '',
  '#2563eb',
  'active',
  ${sqlText(userId)},
  ${sqlText(now)},
  ${sqlText(now)}
);
`);

  return { name, tagId };
}

/** @param {string} workspaceId @param {Record<string, unknown>} [options] */
async function insertTimeEntry(workspaceId, options = {}) {
  const now = new Date().toISOString();

  await runSql(`
INSERT INTO time_entries (
  entry_id,
  workspace_id,
  user_id,
  client_id,
  client_name,
  project_id,
  project_name,
  task_id,
  description,
  start_time,
  end_time,
  duration_seconds,
  duration_hours,
  billable,
  invoice_status,
  created_at,
  updated_at
)
VALUES (
  ${sqlText(options.entryId || `entry-${randomUUID()}`)},
  ${sqlText(workspaceId)},
  ${sqlText(options.userId || "")},
  '',
  '',
  ${sqlText(options.projectId || "")},
  'Other Workspace Project',
  NULL,
  'Cross-workspace time entry',
  '2026-06-02T13:00:00.000Z',
  '2026-06-02T14:00:00.000Z',
  3600,
  '1.00',
  'yes',
  'unbilled',
  ${sqlText(now)},
  ${sqlText(now)}
);
`);
}

/** @param {{ expected: Record<string, unknown>, label: string, userId: string, workspaceId: string }} probe @returns {Promise<void>} */
async function assertUnifiedTimerState({ label, workspaceId, userId, expected }) {
  const filters = [
    `workspace_id = ${sqlText(workspaceId)}`,
    `user_id = ${sqlText(userId)}`,
  ];

  if (expected.source_module_id !== undefined) {
    filters.push(`source_module_id = ${sqlText(expected.source_module_id)}`);
  }

  if (expected.source_type !== undefined) {
    filters.push(`source_type = ${sqlText(expected.source_type)}`);
  }

  if (expected.source_id !== undefined) {
    filters.push(`source_id = ${sqlText(expected.source_id)}`);
  }

  if (expected.timer_slot !== undefined) {
    filters.push(`timer_slot = ${sqlText(expected.timer_slot)}`);
  }

  const rows = await querySql(`
SELECT source_module_id, source_type, source_id, timer_slot, timer_status
FROM active_work_timers
WHERE ${filters.join(" AND ")}
LIMIT 1;
`);

  check(label, () => {
    assert.equal(rows.length, 1);
    assert.equal(rows[0].timer_status, expected.timer_status);
  });
}

/** @param {{ label: string, sourceId: string, userId: string, workspaceId: string }} probe @returns {Promise<void>} */
async function assertNoUnifiedTimerState({ label, workspaceId, userId, sourceId }) {
  const rows = await querySql(`
SELECT active_timer_id
FROM active_work_timers
WHERE workspace_id = ${sqlText(workspaceId)}
  AND user_id = ${sqlText(userId)}
  AND source_module_id = 'tasks'
  AND source_type = 'task'
  AND source_id = ${sqlText(sourceId)}
LIMIT 1;
`);

  check(label, () => {
    assert.equal(rows.length, 0);
  });
}

/**
 * @param {string} baseUrl
 * @returns {HarnessApi}
 */
function createApi(baseUrl) {
  return {
    /** @param {string} url @param {HarnessRequestOptions} [options] */
    get: (url, options = {}) => request(baseUrl, "GET", url, null, options),
    /** @param {string} url @param {unknown} [body] @param {HarnessRequestOptions} [options] */
    post: (url, body, options = {}) => request(baseUrl, "POST", url, body, options),
    /** @param {string} url @param {unknown} [body] @param {HarnessRequestOptions} [options] */
    put: (url, body, options = {}) => request(baseUrl, "PUT", url, body, options),
    /** @param {string} url @param {HarnessRequestOptions} [options] */
    delete: (url, options = {}) => request(baseUrl, "DELETE", url, null, options),
  };
}

/** @param {Headers} headers @returns {string} */
function extractSessionCookie(headers) {
  const setCookie = headers.get("set-cookie") || "";
  const match = setCookie.match(/(?:^|,\s*)longtail_forge_session=([^;,]+)/);

  assert.ok(match?.[1], "login response should set the Longtail Forge session cookie");
  return match[1];
}

/**
 * @param {string} baseUrl
 * @param {string} method
 * @param {string} url
 * @param {unknown} [body]
 * @param {HarnessRequestOptions} [options]
 */
async function request(baseUrl, method, url, body = null, options = {}) {
  /** @type {Record<string, string>} */
  const headers = {};

  if (body !== null) {
    headers["Content-Type"] = "application/json";
  }

  if (options.cookie) {
    headers.Cookie = `longtail_forge_session=${options.cookie}`;
  }

  if (options.bearer) {
    headers.Authorization = `Bearer ${options.bearer}`;
  }

  const response = await fetch(`${baseUrl}${url}`, {
    method,
    headers,
    body: body === null ? undefined : JSON.stringify(body),
    redirect: "manual",
  });
  const text = await response.text();
  /** @type {unknown} */
  let parsedBody = null;

  try {
    parsedBody = text ? JSON.parse(text) : null;
  } catch {
    parsedBody = text;
  }

  return {
    body: parsedBody,
    headers: response.headers,
    status: response.status,
  };
}

/**
 * Read a response payload as the shape the calling assertions consume.
 *
 * This is a checked narrowing, not a cast dressed as one: the payload must be
 * a JSON object and must carry every key the caller names, so an endpoint that
 * stops returning one fails here with that key rather than reading `undefined`
 * further down. The caller supplies the shape through the annotation on the
 * receiving binding, which keeps each contract small and local to the
 * endpoint that produced it.
 * @template {keyof HarnessEnvelopeRegistry} EnvelopeKey
 * @param {HarnessResponse} response
 * @param {readonly EnvelopeKey[]} keys
 * @returns {Pick<HarnessEnvelopeRegistry, EnvelopeKey>}
 */
function readPayload(response, keys) {
  const body = response.body;
  assert.ok(body && typeof body === "object" && !Array.isArray(body), `response payload should be a JSON object: ${JSON.stringify(body)}`);
  const record = /** @type {Record<string, unknown>} */ (body);
  for (const key of keys) {
    assert.ok(key in record, `response payload should carry ${key}: ${JSON.stringify(Object.keys(record))}`);
  }
  return /** @type {Pick<HarnessEnvelopeRegistry, EnvelopeKey>} */ (/** @type {unknown} */ (record));
}

/**
 * The `modules` envelope is not one shape: the Workbench bootstrap returns a
 * record keyed by module id while the settings read returns a searchable
 * list. These prove which one the endpoint actually returned rather than
 * assuming it.
 * @param {HarnessEnvelopeRegistry["modules"]} modules
 * @returns {HarnessModuleDescriptor[]}
 */
function asModuleList(modules) {
  assert.ok(Array.isArray(modules), "the settings modules envelope should be a list");
  return modules;
}

/**
 * @param {HarnessEnvelopeRegistry["modules"]} modules
 * @returns {Record<string, { enabled: boolean }>}
 */
function asModuleMap(modules) {
  assert.ok(modules && !Array.isArray(modules), "the Workbench modules envelope should be keyed by module id");
  return modules;
}

/**
 * Read the whole payload as a record, for probes that assert an envelope is
 * absent rather than reading one.
 * @param {HarnessResponse} response
 * @returns {Record<string, unknown>}
 */
function payloadRecord(response) {
  const body = response.body;
  assert.ok(body && typeof body === "object", `response payload should be a JSON object: ${JSON.stringify(body)}`);
  return /** @type {Record<string, unknown>} */ (body);
}

/** @param {string} name @param {() => void} assertion @returns {void} */
function check(name, assertion) {
  assertion();
  results.push(name);
}

/**
 * Record one status expectation. Most callers pass the in-flight request;
 * the seeding helpers pass a response they already awaited, so both a promise
 * and a settled record are accepted.
 * @param {string} name
 * @param {HarnessResponse | Promise<HarnessResponse>} responsePromise
 * @param {number} expectedStatus
 * @returns {Promise<HarnessResponse>}
 */
async function expectStatus(name, responsePromise, expectedStatus) {
  const response = await responsePromise;
  check(name, () => {
    assert.equal(response.status, expectedStatus, `${name}: ${JSON.stringify(response.body)}`);
  });
  return response;
}

/** @param {string} projectId @param {Record<string, unknown>} [overrides] @returns {Record<string, unknown>} */
function timeEntryPayload(projectId, overrides = {}) {
  return {
    project_id: projectId,
    description: "Permission regression time entry",
    start_time: "2026-06-02T13:00:00.000Z",
    end_time: "2026-06-02T14:00:00.000Z",
    duration_seconds: 3600,
    duration_hours: "1.00",
    billable: "yes",
    invoice_status: "unbilled",
    ...overrides,
  };
}

/** @param {string} projectId @param {Record<string, unknown>} [overrides] @returns {Record<string, unknown>} */
function timerPayload(projectId, overrides = {}) {
  return {
    project_id: projectId,
    description: "Permission regression active timer",
    accumulated_elapsed_seconds: 120,
    timer_status: "paused",
    ...overrides,
  };
}

/** @param {string} label @returns {SeededRoleUser} */
function userFixture(label) {
  return {
    userId: `${label}-${randomUUID()}`,
    username: uniqueEmail(label),
  };
}

/** @param {string} label @returns {string} */
function uniqueEmail(label) {
  return `${label}-${randomUUID()}@example.test`;
}

/** @param {string} workspaceId @param {HarnessRoleUser} user @returns {string} */
function userInsertSql(workspaceId, user) {
  return `
INSERT INTO users (
  user_id,
  home_workspace_id,
  username,
  display_name,
  alt_email,
  timezone,
  password,
  theme_mode,
  user_status,
  protected_user,
  active_workspace_id
)
VALUES (
  ${sqlText(user.userId)},
  ${sqlText(workspaceId)},
  ${sqlText(user.username)},
  ${sqlText(user.username)},
  NULL,
  'America/New_York',
  'fixture-password',
  'light',
  'active',
  'no',
  ${sqlText(workspaceId)}
);`;
}

/** @param {string} workspaceId @param {HarnessRoleUser} user @param {string} now @returns {string} */
function membershipInsertSql(workspaceId, user, now) {
  return `
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
  ${sqlText(user.userId)},
  ${sqlText(workspaceId)},
  'active',
  ${sqlText(now)},
  ${sqlText(now)}
);`;
}

/** @param {string} workspaceId @param {string} name @param {string} workspaceType @param {string} ownerUserId @param {string} now @returns {string} */
function workspaceInsertSql(workspaceId, name, workspaceType, ownerUserId, now) {
  return `
INSERT INTO workspaces (workspace_id, name, status, workspace_type, owner_user_id, created_at, updated_at)
VALUES (${sqlText(workspaceId)}, ${sqlText(name)}, 'Active', ${sqlText(workspaceType)}, ${sqlText(ownerUserId)}, ${sqlText(now)}, ${sqlText(now)});`;
}

/** @param {string} workspaceId @param {string} now @returns {string} */
function workspaceSettingsInsertSql(workspaceId, now) {
  return `
INSERT INTO workspace_settings (
  workspace_id,
  audit_logging_enabled,
  audit_retention_days,
  created_at,
  updated_at
)
VALUES (
  ${sqlText(workspaceId)},
  1,
  30,
  ${sqlText(now)},
  ${sqlText(now)}
);`;
}

/** @param {string} workspaceId @param {string} moduleId @param {string} now @returns {string} */
function workspaceModuleInsertSql(workspaceId, moduleId, now) {
  return `
INSERT OR IGNORE INTO workspace_modules (
  workspace_id,
  module_id,
  status,
  enabled_at,
  disabled_at,
  updated_at
)
VALUES (
  ${sqlText(workspaceId)},
  ${sqlText(moduleId)},
  'enabled',
  ${sqlText(now)},
  NULL,
  ${sqlText(now)}
);`;
}

/** @param {string} workspaceId @param {string} userId @param {string} roleId @param {string} scopeType @param {string} scopeId @param {string} now @returns {string} */
function assignmentInsertSql(workspaceId, userId, roleId, scopeType, scopeId, now) {
  const scopedClientId = scopeType === "client" ? scopeId : null;
  const scopedProjectId = scopeType === "project" ? scopeId : null;

  return `
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
  ${sqlText(roleId)},
  ${sqlText(scopeType)},
  ${sqlText(scopeId)},
  ${scopedClientId ? sqlText(scopedClientId) : "NULL"},
  ${scopedProjectId ? sqlText(scopedProjectId) : "NULL"},
  NULL,
  ${sqlText(now)},
  ${sqlText(now)}
);`;
}

/** @param {string} workspaceId @param {HarnessClient} client @param {string} now @returns {string} */
function clientInsertSql(workspaceId, client, now) {
  return `
INSERT INTO clients (
  id,
  workspace_id,
  name,
  status,
  billable,
  billing_rate,
  billing_period_type,
  billing_period_start_day,
  billing_rounding_enabled,
  billing_rounding_increment,
  billing_contact_name,
  billing_contact_email,
  billing_contact_alternate_name,
  billing_contact_alternate_email,
  billing_contact_phone_number,
  billing_contact_alternate_phone_number,
  billing_contact_street_address_1,
  billing_contact_street_address_2,
  billing_contact_city,
  billing_contact_state,
  billing_contact_zip_code,
  created_at,
  updated_at
)
VALUES (
  ${sqlText(client.id)},
  ${sqlText(workspaceId)},
  ${sqlText(client.name)},
  'Active',
  'yes',
  NULL,
  NULL,
  NULL,
  NULL,
  NULL,
  '',
  '',
  '',
  '',
  '',
  '',
  '',
  '',
  '',
  '',
  '',
  ${sqlText(now)},
  ${sqlText(now)}
);`;
}

/** @param {string} workspaceId @param {HarnessProject} project @param {string} now @returns {string} */
function projectInsertSql(workspaceId, project, now) {
  return `
INSERT INTO projects (
  id,
  workspace_id,
  client_id,
  name,
  status,
  billable,
  billing_rate,
  billing_period_type,
  billing_period_start_day,
  billing_rounding_enabled,
  billing_rounding_increment,
  created_at,
  updated_at
)
VALUES (
  ${sqlText(project.id)},
  ${sqlText(workspaceId)},
  ${project.clientId ? sqlText(project.clientId) : "NULL"},
  ${sqlText(project.name)},
  'Active',
  'yes',
  NULL,
  NULL,
  NULL,
  NULL,
  NULL,
  ${sqlText(now)},
  ${sqlText(now)}
);`;
}

/** @param {string} workspaceId @param {string} userId @param {string} username @returns {Promise<string>} */
async function createSession(workspaceId, userId, username) {
  const sessionId = randomUUID();
  const now = new Date().toISOString();
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();

  await runSql(`
INSERT INTO sessions (
  session_id,
  home_workspace_id,
  active_workspace_id,
  user_id,
  username,
  timezone,
  expires_at,
  created_at,
  updated_at
)
VALUES (
  ${sqlText(sessionId)},
  ${sqlText(workspaceId)},
  ${sqlText(workspaceId)},
  ${sqlText(userId)},
  ${sqlText(username)},
  'America/New_York',
  ${sqlText(expiresAt)},
  ${sqlText(now)},
  ${sqlText(now)}
);`);

  return sessionId;
}

/**
 * @param {string} workspaceId
 * @param {string} templateId
 * @param {string} instanceDate
 * @returns {Promise<{ due_date: string, recurrence_instance_date: string, recurrence_template_id: string, task_id: string }>}
 */
async function readRecurrenceInstance(workspaceId, templateId, instanceDate) {
  const rows = await querySql(`
SELECT task_id, due_date, recurrence_template_id, recurrence_instance_date
FROM tasks
WHERE workspace_id = ${sqlText(workspaceId)}
  AND recurrence_template_id = ${sqlText(templateId)}
  AND recurrence_instance_date = ${sqlText(instanceDate)}
LIMIT 1;
`);

  const row = rows[0];
  assert.ok(row, `expected recurrence instance for ${instanceDate}`);
  return /** @type {{ due_date: string, recurrence_instance_date: string, recurrence_template_id: string, task_id: string }} */ (/** @type {unknown} */ (row));
}

/** @param {string} workspaceId @param {string} templateId @param {string} instanceDate @returns {Promise<number>} */
async function countRecurrenceInstances(workspaceId, templateId, instanceDate) {
  const rows = await querySql(`
SELECT COUNT(*) AS count
FROM tasks
WHERE workspace_id = ${sqlText(workspaceId)}
  AND recurrence_template_id = ${sqlText(templateId)}
  AND recurrence_instance_date = ${sqlText(instanceDate)};
`);

  return Number(rows[0]?.count || 0);
}

function localPastMinuteDue(timeZone = "America/New_York") {
  const now = new Date();
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).formatToParts(now).map((part) => [part.type, part.value]));
  const minute = Math.max(0, Number(parts.minute || 0) - 1);

  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    time: `${parts.hour}:${String(minute).padStart(2, "0")}`,
  };
}

function localDateOffset(days = 0, timeZone = "America/New_York") {
  const date = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date).map((part) => [part.type, part.value]));

  return `${parts.year}-${parts.month}-${parts.day}`;
}

/** @param {HarnessNavigationItem[]} [items] @returns {Set<string>} */
function navigationHrefs(items = []) {
  /** @type {Set<string>} */
  const hrefs = new Set();
  /** @param {HarnessNavigationItem[] | undefined} entries */
  const visit = (entries) => {
    for (const item of Array.isArray(entries) ? entries : []) {
      if (item?.href) {
        hrefs.add(item.href);
      }
      visit(item?.items);
    }
  };

  visit(items);
  return hrefs;
}

/**
 * @param {import("./test-support/http-fixture-contracts.mjs").HttpFixtureApp} app
 * @returns {Promise<import("./test-support/http-fixture-contracts.mjs").HttpFixtureServer>}
 */
function listen(app) {
  return new Promise((resolve) => {
    const nextServer = http.createServer(/** @type {http.RequestListener} */ (/** @type {unknown} */ (app)));
    nextServer.listen(0, "127.0.0.1", () => resolve(nextServer));
  });
}

async function drainQueuedSearchJobs() {
  resetJobWorkerStatusForTests();

  for (let attempt = 0; attempt < 10; attempt += 1) {
    const summary = await runJobWorkerOnce({
      claimLimit: 25,
      mode: "inline",
      workerId: "permission-regression",
    });

    if (summary.claimed === 0) {
      return;
    }

    assert.equal(summary.failed, 0, "queued permission-regression search jobs should not fail");
    assert.equal(summary.dead, 0, "queued permission-regression search jobs should not dead-letter");
  }

  throw new Error("Queued permission-regression search jobs did not drain.");
}

/**
 * @param {import("./test-support/http-fixture-contracts.mjs").HttpFixtureServer} nextServer
 * @returns {Promise<void>}
 */
function closeServer(nextServer) {
  return new Promise((resolve, reject) => {
    nextServer.close((error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });
}
