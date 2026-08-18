#!/usr/bin/env node

/* global fetch */

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadRuntimeEnvFile } from "../src/runtime-env.js";
import {
  loadSanitizedDemoRoleFixtures,
  LOCAL_ROLE_FIXTURE_MODE,
  PUBLIC_DEMO_ROLE_FIXTURE_MODE,
  PUBLIC_DEMO_VISITOR_PASSWORDS,
  ROLE_CREDENTIALS_FILE_ENV,
  RT_LTF_DEMO_ROLE_FIXTURE_BINDING,
  SANITIZED_DEMO_ROLE_FIXTURES,
} from "./lib/sanitized-demo-role-fixtures.mjs";

loadRuntimeEnvFile();

const scriptPath = fileURLToPath(import.meta.url);

/**
 * The public-demo runtime and identity contracts loaded only for demo runs.
 * @typedef {typeof import("../src/core/public-demo-runtime.js") & typeof import("../src/core/public-demo-identities.js")} PublicDemoContracts
 */

/**
 * The database module the journey boots after its disposable seed.
 * @typedef {typeof import("../src/db/index.js")} DatabaseModule
 */

/**
 * The async database facade the journey reads seeded rows through.
 * @typedef {DatabaseModule["db"]} JourneyDatabase
 */

/**
 * The validated sanitized-demo role fixture set, including seed passwords.
 * @typedef {NonNullable<Awaited<ReturnType<typeof loadSanitizedDemoRoleFixtures>>>} SanitizedDemoRoleFixtureSet
 */

/**
 * One shipped sanitized-demo role identity the journey walks.
 * @typedef {Readonly<import("./lib/sanitized-demo-role-fixtures.mjs").SanitizedDemoRoleFixture>} JourneyRoleFixture
 */

/**
 * The job-worker logger surface the journey silences during the run.
 * @typedef {import("../src/types/framework-contracts.js").JobWorkerLogger} JobWorkerLogger
 */

/**
 * The HTTP client the journey drives the running app through.
 * @typedef {ReturnType<typeof createApi>} JourneyApi
 */

/**
 * Per-request options accepted by the journey HTTP client.
 * @typedef {{ cookie?: string }} JourneyRequestOptions
 */

/**
 * The response subset the journey reads its session cookie from.
 * @typedef {{ headers: { get: (name: string) => string | null } }} JourneySessionResponse
 */

/**
 * The HTTP server subset the journey shuts down.
 * @typedef {{ close: (callback: (error?: Error | null) => void) => void }} ClosableServer
 */

/**
 * One navigation entry in an app-shell bootstrap payload.
 * @typedef {object} NavigationItem
 * @property {string} [href]
 * @property {NavigationItem[]} [items]
 */

/**
 * One client node in a client-projects tree.
 * @typedef {object} ClientProjectNode
 * @property {string} name
 * @property {boolean} [can_create_child]
 * @property {ClientProjectNode[]} [children]
 */

/**
 * One assignable scope offered alongside a role catalog entry.
 * @typedef {object} RoleCatalogScope
 * @property {string} label
 * @property {string} scopeId
 */

/**
 * One role catalog entry returned by /api/roles.
 * @typedef {object} RoleCatalogEntry
 * @property {string} role_id
 * @property {string} role_name
 * @property {RoleCatalogScope[]} scopes
 */

/**
 * One role assignment returned by the role-assignment lookup.
 * @typedef {object} RoleAssignmentLookupEntry
 * @property {string} role_id
 */

/**
 * The published visitor passwords, probed here for absent operator roles.
 * @typedef {Readonly<Record<string, string | undefined>>} PublicDemoVisitorPasswordLookup
 */

/**
 * The verified outcome one journey run reports.
 * @typedef {object} RolePermissionJourneyResult
 * @property {number} checks
 * @property {boolean} credentialsPrinted
 * @property {boolean} ok
 * @property {boolean} publicDemo
 * @property {string[]} rolesVerified
 */

/**
 * Walk every sanitized-demo role through the authenticated permission journey.
 * @param {{ publicDemo?: boolean }} [options]
 * @returns {Promise<RolePermissionJourneyResult>}
 */
async function runRolePermissionJourney({ publicDemo = false } = {}) {
  const roleFixtures = /** @type {SanitizedDemoRoleFixtureSet} */ (await loadSanitizedDemoRoleFixtures({
    credentialBinding: publicDemo ? RT_LTF_DEMO_ROLE_FIXTURE_BINDING : null,
    mode: publicDemo ? PUBLIC_DEMO_ROLE_FIXTURE_MODE : LOCAL_ROLE_FIXTURE_MODE,
    target: { profile: "sanitized-demo" },
  }));
  const journeyFixtures = publicDemo
    ? SANITIZED_DEMO_ROLE_FIXTURES.filter((fixture) => fixture.publicVisitor)
    : SANITIZED_DEMO_ROLE_FIXTURES;
  const journeyRoot = await fs.mkdtemp(path.join(os.tmpdir(), "ltf-role-journey-"));
  const dataDir = path.join(journeyRoot, "sanitized-demo", "permission-journey");
  let closeDatabase;
  let server;
  let stopJobWorker;

  try {
    seedDisposableSanitizedDemo(dataDir, roleFixtures);
    configureJourneyRuntime(dataDir, roleFixtures);
    const publicDemoContracts = publicDemo
      ? {
          ...(await import("../src/core/public-demo-runtime.js")),
          ...(await import("../src/core/public-demo-identities.js")),
        }
      : null;

    const [{ createApp }, databaseApi, jobsApi] = await Promise.all([
      import("../src/core/app.js"),
      import("../src/db/index.js"),
      import("../src/core/jobs/index.js"),
    ]);
    closeDatabase = databaseApi.closeDatabase;
    stopJobWorker = jobsApi.stopJobWorker;
    await databaseApi.initializeDatabase();
    if (publicDemo) {
      await activatePublicDemoRuntime(
        dataDir,
        databaseApi.db,
        journeyFixtures,
        /** @type {PublicDemoContracts} */ (publicDemoContracts),
      );
    }
    const app = createApp();
    await jobsApi.startJobWorker({
      logger: /** @type {JobWorkerLogger} */ ({ error() {}, log() {}, warn() {} }),
      mode: "inline",
      workerId: "public-demo-role-journey",
    });
    server = await listen(app);
    const address = server.address();
    const api = createApi(`http://127.0.0.1:${address.port}`);
    const sessions = new Map();
    let checks = 0;

    const [health, readiness, appInfo] = await Promise.all([
      api.get("/healthz"),
      api.get("/readyz"),
      api.get("/api/app-info"),
    ]);
    assert.deepEqual(health.body, { status: "ok" });
    assert.deepEqual(readiness.body, { status: "ready" });
    assert.equal(appInfo.status, 200);
    assert.match(appInfo.body.version, /^\d+\.\d+\.\d+(?:\.\d+)*$/);
    checks += 4;

    for (const fixture of journeyFixtures) {
      const login = await api.post("/api/login", {
        password: roleFixtures.credentials.get(fixture.roleId).password,
        username: fixture.username,
      });
      assert.equal(login.status, 200, `${fixture.roleId} should authenticate`);
      const cookie = readSessionCookie(login);
      assert.ok(cookie, `${fixture.roleId} should receive a session`);
      sessions.set(fixture.roleId, cookie);
      checks += 2;
    }

    const shellByRole = new Map();
    for (const fixture of journeyFixtures) {
      const dashboard = await api.get("/dashboard.html", {
        cookie: sessions.get(fixture.roleId),
      });
      assert.equal(
        dashboard.status,
        200,
        fixture.roleId + " should load the authenticated Dashboard document",
      );
      assert.match(
        dashboard.body,
        /<main\b/i,
        fixture.roleId + " should receive the Dashboard HTML",
      );

      const shell = await api.get("/api/app-shell/bootstrap", {
        cookie: sessions.get(fixture.roleId),
      });
      assert.equal(shell.status, 200, `${fixture.roleId} should load the app shell`);
      shellByRole.set(fixture.roleId, shell.body);
      checks += 3;
    }

    const clientAdminShell = shellByRole.get("client_admin");
    assert.equal(clientAdminShell.permissionHints.clientsManage, true);
    assert.equal(clientAdminShell.permissionHints.projectsManage, true);
    assert.equal(clientAdminShell.permissionHints.roleAssignmentsDelegate, true);
    assert.deepEqual(
      navigationHrefs(clientAdminShell.navigation).has("user-admin.html"),
      false,
    );
    checks += 4;

    const projectAdminShell = shellByRole.get("project_admin");
    assert.equal(projectAdminShell.permissionHints.clientsManage, false);
    assert.equal(projectAdminShell.permissionHints.projectsManage, true);
    assert.equal(projectAdminShell.permissionHints.roleAssignmentsDelegate, true);
    assert.equal(navigationHrefs(projectAdminShell.navigation).has("clients.html"), false);
    checks += 4;

    for (const roleId of ["client_user", "project_user", "client_external_user"]) {
      const shell = shellByRole.get(roleId);
      assert.equal(shell.permissionHints.clientsManage, false);
      assert.equal(shell.permissionHints.projectsManage, false);
      assert.equal(shell.permissionHints.roleAssignmentsDelegate, false);
      assert.equal(navigationHrefs(shell.navigation).has("role-assignments.html"), false);
      checks += 4;
    }

    const clientAdminData = await api.get("/api/client-projects", {
      cookie: sessions.get("client_admin"),
    });
    assert.equal(clientAdminData.status, 200);
    assert.equal(clientAdminData.body.capabilities.can_create_top_level_client, false);
    const cedar = flattenClients(clientAdminData.body.clients)
      .find((client) => client.name === "Cedar & Bloom");
    assert.equal(cedar?.can_create_child, true);
    assert.equal(
      flattenClients(clientAdminData.body.clients)
        .find((client) => client.name === "Maple Lane Cafe")?.can_create_child,
      undefined,
    );
    checks += 4;

    const workspaceAdminData = await api.get("/api/client-projects", {
      cookie: sessions.get("workspace_admin"),
    });
    assert.equal(workspaceAdminData.status, 200);
    assert.equal(workspaceAdminData.body.capabilities.can_create_top_level_client, true);
    checks += 2;

    const pageExpectations = [
      ...(!publicDemo ? [["super_admin", 200, 200, 200]] : []),
      ["workspace_admin", 200, 200, 200],
      ["client_admin", 200, 403, 200],
      ["project_admin", 200, 403, 200],
      ["client_user", 403, 403, 403],
      ["project_user", 403, 403, 403],
      ["client_external_user", 403, 403, 403],
    ];
    for (const [roleId, roleAssignmentsStatus, userAdminStatus, projectSettingsStatus] of pageExpectations) {
      assert.equal(
        (await api.get("/role-assignments.html", { cookie: sessions.get(roleId) })).status,
        roleAssignmentsStatus,
      );
      assert.equal(
        (await api.get("/user-admin.html", { cookie: sessions.get(roleId) })).status,
        userAdminStatus,
      );
      assert.equal(
        (await api.get("/projects.html", { cookie: sessions.get(roleId) })).status,
        projectSettingsStatus,
      );
      checks += 3;
    }

    const expectedRoleCatalogSizes = new Map(/** @type {[string, number][]} */ ([
      ...(!publicDemo ? [["super_admin", 7]] : []),
      ["workspace_admin", 6],
      ["client_admin", 4],
      ["project_admin", 1],
    ]));
    for (const [roleId, expectedSize] of expectedRoleCatalogSizes) {
      const roles = await api.get("/api/roles", { cookie: sessions.get(roleId) });
      assert.equal(roles.status, 200);
      assert.equal(roles.body.roles.length, expectedSize);
      assert.ok(/** @type {RoleCatalogEntry[]} */ (roles.body.roles).every((role) => (
        role.role_name
        && Array.isArray(role.scopes)
        && role.scopes.every((scope) => scope.label && scope.scopeId)
      )));
      checks += 3;
    }
    for (const roleId of ["client_user", "project_user", "client_external_user"]) {
      assert.equal(
        (await api.get("/api/roles", { cookie: sessions.get(roleId) })).status,
        403,
      );
      checks += 1;
    }

    const clientAdminRoles = await api.get("/api/roles", {
      cookie: sessions.get("client_admin"),
    });
    assert.deepEqual(
      /** @type {RoleCatalogEntry[]} */ (clientAdminRoles.body.roles).map((role) => role.role_id).sort(),
      ["client_external_user", "client_user", "project_admin", "project_user"],
    );
    assert.ok(
      /** @type {RoleCatalogEntry[]} */ (clientAdminRoles.body.roles).flatMap((role) => role.scopes)
        .some((scope) => scope.label.includes("Cedar & Bloom")),
    );
    assert.equal(
      /** @type {RoleCatalogEntry[]} */ (clientAdminRoles.body.roles).flatMap((role) => role.scopes)
        .some((scope) => scope.label.includes("Maple Lane Cafe")),
      false,
    );
    checks += 3;

    const projectAdminRoles = await api.get("/api/roles", {
      cookie: sessions.get("project_admin"),
    });
    assert.deepEqual(/** @type {RoleCatalogEntry[]} */ (projectAdminRoles.body.roles).map((role) => role.role_id), ["project_user"]);
    assert.deepEqual(
      /** @type {RoleCatalogEntry[]} */ (projectAdminRoles.body.roles)[0].scopes.map((scope) => scope.label),
      ["Cedar & Bloom / Website Refresh"],
    );
    checks += 2;

    if (publicDemo) {
      checks += await assertPublicDemoJourney({
        api,
        contracts: /** @type {PublicDemoContracts} */ (publicDemoContracts),
        db: databaseApi.db,
        journeyFixtures,
        roleFixtures,
        sessions,
      });
    }

    const clientAdminLookup = await api.post("/api/role-assignments/lookup", {
      username: roleFixtures.credentials.get("project_user").username,
    }, { cookie: sessions.get("client_admin") });
    assert.equal(clientAdminLookup.status, 200);
    assert.deepEqual(
      /** @type {RoleAssignmentLookupEntry[]} */ (clientAdminLookup.body.match.assignments).map((assignment) => assignment.role_id),
      ["project_user"],
    );
    checks += 2;

    const projectAdminHiddenLookup = await api.post("/api/role-assignments/lookup", {
      username: roleFixtures.credentials.get("client_user").username,
    }, { cookie: sessions.get("project_admin") });
    assert.equal(projectAdminHiddenLookup.status, 200);
    assert.deepEqual(projectAdminHiddenLookup.body.match.assignments, []);
    checks += 2;

    const unknownLookup = await api.post("/api/role-assignments/lookup", {
      username: "missing-role-fixture@example.test",
    }, { cookie: sessions.get("client_admin") });
    assert.equal(unknownLookup.status, 200);
    assert.deepEqual(unknownLookup.body, { match: null });
    checks += 2;

    for (const cookie of sessions.values()) {
      assert.equal((await api.post("/api/logout", undefined, { cookie })).status, 200);
      checks += 1;
    }

    return {
      checks,
      credentialsPrinted: false,
      ok: true,
      publicDemo,
      rolesVerified: journeyFixtures.map((fixture) => fixture.roleId),
    };
  } finally {
    if (server) await closeServer(server);
    if (stopJobWorker) await stopJobWorker({ logger: /** @type {JobWorkerLogger} */ ({ error() {}, log() {}, warn() {} }) });
    if (closeDatabase) await closeDatabase();
    await fs.rm(journeyRoot, { force: true, recursive: true });
  }
}

/**
 * Write and verify the demo data-ownership marker for the seeded visitors.
 * @param {string} dataDir
 * @param {JourneyDatabase} db
 * @param {readonly JourneyRoleFixture[]} journeyFixtures
 * @param {PublicDemoContracts} contracts
 * @returns {Promise<void>}
 */
async function activatePublicDemoRuntime(dataDir, db, journeyFixtures, contracts) {
  /** @type {string[]} */
  const publicVisitorUserIds = [];
  for (const fixture of journeyFixtures) {
    const user = await db.get(
      "SELECT user_id FROM users WHERE username = :username;",
      { username: fixture.username },
    );
    assert.ok(user?.user_id, `${fixture.roleId} should have a deterministic seeded identity`);
    publicVisitorUserIds.push(/** @type {string} */ (user.user_id));
  }

  await fs.writeFile(path.join(dataDir, contracts.PUBLIC_DEMO_DATA_MARKER_FILE), `${JSON.stringify({
    contract: contracts.PUBLIC_DEMO_DATA_MARKER_CONTRACT,
    publicVisitorUserIds,
    target: contracts.PUBLIC_DEMO_TARGET,
  })}\n`, { mode: 0o600 });
  assert.deepEqual(
    await contracts.assertPublicDemoRuntimeReady({ dataDir, demo: { enabled: true } }),
    { enabled: true, marker: "verified" },
  );
}

/**
 * Assert the public-demo denials, seeded reads, and scoped writes hold for every visitor.
 * @param {{ api: JourneyApi, contracts: PublicDemoContracts, db: JourneyDatabase, journeyFixtures: readonly JourneyRoleFixture[], roleFixtures: SanitizedDemoRoleFixtureSet, sessions: Map<string, string> }} request
 * @returns {Promise<number>}
 */
async function assertPublicDemoJourney({
  api,
  contracts,
  db,
  journeyFixtures,
  roleFixtures,
  sessions,
}) {
  const fieldOps = await db.get(
    "SELECT workspace_id FROM workspaces WHERE name = 'Northwind Field Ops';",
  );
  const website = await db.get(
    "SELECT id AS project_id FROM projects WHERE name = 'Website Refresh';",
  );
  const outsideProject = await db.get(
    "SELECT id AS project_id FROM projects WHERE name = 'POS Setup';",
  );
  assert.ok(fieldOps?.workspace_id);
  assert.ok(website?.project_id);
  assert.ok(outsideProject?.project_id);
  let checks = 3;

  assert.equal(/** @type {PublicDemoVisitorPasswordLookup} */ (PUBLIC_DEMO_VISITOR_PASSWORDS).super_admin, undefined);
  assert.ok(
    Object.values(PUBLIC_DEMO_VISITOR_PASSWORDS)
      .every((password) => password !== roleFixtures.credentials.get("super_admin").password),
  );
  checks += 2;

  const adminCatalog = await api.get("/api/roles", {
    cookie: sessions.get("workspace_admin"),
  });
  assert.equal(adminCatalog.status, 200);
  assert.equal(
    /** @type {RoleCatalogEntry[]} */ (adminCatalog.body.roles).some((role) => role.role_id === "super_admin"),
    false,
  );
  checks += 2;

  const operatorGuess = await api.post("/api/login", {
    password: PUBLIC_DEMO_VISITOR_PASSWORDS.workspace_admin,
    username: roleFixtures.credentials.get("super_admin").username,
  });
  assert.equal(operatorGuess.status, 401);
  checks += 1;

  for (const fixture of journeyFixtures) {
    const cookie = sessions.get(fixture.roleId);
    const tasks = await api.get("/api/tasks?limit=10", { cookie });
    assert.equal(tasks.status, 200, `${fixture.roleId} should read authorized tasks`);

    const attachmentList = await api.get("/api/files/attachments?limit=10", { cookie });
    assert.equal(attachmentList.status, 200, `${fixture.roleId} should list authorized seeded attachments`);
    const seededAttachment = attachmentList.body.attachments?.[0];
    assert.ok(seededAttachment?.fileAttachmentId && seededAttachment?.fileId, `${fixture.roleId} should receive a seeded attachment`);
    const preview = await api.get(`/api/files/attachments/${encodeURIComponent(seededAttachment.fileAttachmentId)}/preview`, { cookie });
    assert.equal(preview.status, 200, `${fixture.roleId} should read the seeded attachment preview descriptor`);
    assert.equal(preview.body.preview?.state, "previewable", `${fixture.roleId} should receive a previewable seeded attachment`);
    const previewContent = await api.get(`/api/files/attachments/${encodeURIComponent(seededAttachment.fileAttachmentId)}/preview/content`, { cookie });
    assert.equal(previewContent.status, 200, `${fixture.roleId} should read seeded attachment preview content`);
    const download = await api.get(`/api/files/${encodeURIComponent(seededAttachment.fileId)}/download`, { cookie });
    assert.equal(download.status, 200, `${fixture.roleId} should download the authorized seeded attachment`);
    assert.ok(download.body, `${fixture.roleId} should receive nonempty seeded attachment bytes`);
    checks += 7;

    const allowedWrite = await api.post("/api/time-entries", {
      description: `Public demo permission journey: ${fixture.roleId}`,
      end_time: "2026-07-30T15:30:00.000Z",
      project_id: website.project_id,
      start_time: "2026-07-30T15:00:00.000Z",
    }, { cookie });
    assert.equal(allowedWrite.status, 201, JSON.stringify(allowedWrite.body));

    if (fixture.roleId !== "workspace_admin") {
      const deniedCrossScope = await api.post("/api/time-entries", {
        description: `Denied public demo cross-scope write: ${fixture.roleId}`,
        end_time: "2026-07-30T16:30:00.000Z",
        project_id: outsideProject.project_id,
        start_time: "2026-07-30T16:00:00.000Z",
      }, { cookie });
      assert.equal(deniedCrossScope.status, 403, JSON.stringify(deniedCrossScope.body));
      checks += 1;
    }

    const deniedWorkspaceSwitch = await api.post("/api/session/workspace", {
      workspaceId: fieldOps.workspace_id,
    }, { cookie });
    assert.equal(deniedWorkspaceSwitch.status, 403, JSON.stringify(deniedWorkspaceSwitch.body));

    const deniedPasswordChange = await api.put("/api/user/password", {
      currentPassword: roleFixtures.credentials.get(fixture.roleId).password,
      newPassword: `Blocked-${fixture.roleId}-2026!`,
    }, { cookie });
    assert.equal(deniedPasswordChange.status, 403, JSON.stringify(deniedPasswordChange.body));
    assert.deepEqual(deniedPasswordChange.body?.error && {
      code: deniedPasswordChange.body.error.code,
      message: deniedPasswordChange.body.error.message,
    }, {
      code: contracts.PUBLIC_DEMO_IDENTITY_DENIAL_CODE,
      message: contracts.PUBLIC_DEMO_IDENTITY_DENIAL_MESSAGE,
    });
    checks += 5;
  }

  return checks;
}

/**
 * Seed one disposable sanitized-demo installation for this journey.
 * @param {string} dataDir
 * @param {SanitizedDemoRoleFixtureSet} roleFixtures
 * @returns {void}
 */
function seedDisposableSanitizedDemo(dataDir, roleFixtures) {
  const result = spawnSync(process.execPath, [
    "scripts/development-data.mjs",
    "seed",
    "--profile",
    "sanitized-demo",
    "--environment",
    "development",
    "--data-dir",
    dataDir,
    "--anchor-date",
    "2026-07-30",
    "--role-fixtures",
    /** @type {string} */ (roleFixtures.mode),
    ...(roleFixtures.mode === PUBLIC_DEMO_ROLE_FIXTURE_MODE
      ? ["--role-fixture-binding", RT_LTF_DEMO_ROLE_FIXTURE_BINDING.target]
      : []),
  ], {
    cwd: process.cwd(),
    encoding: "utf8",
    env: {
      ...process.env,
      LONGTAIL_ENV: "development",
      LONGTAIL_PUBLIC_URL: "http://127.0.0.1",
      LONGTAIL_RELEASE_BRANCH: "",
      [ROLE_CREDENTIALS_FILE_ENV]: roleFixtures.credentialsFile,
    },
  });
  if (result.status !== 0) {
    throw new Error(`Disposable sanitized-demo seed failed: ${String(result.stderr || result.error || "unknown error").trim()}`);
  }
}

/**
 * Point the runtime environment at the disposable installation.
 * @param {string} dataDir
 * @param {SanitizedDemoRoleFixtureSet} roleFixtures
 * @returns {void}
 */
function configureJourneyRuntime(dataDir, roleFixtures) {
  process.env.LONGTAIL_AUTH_THROTTLE_ENABLED = "true";
  process.env.LONGTAIL_DATA_DIR = dataDir;
  process.env.LONGTAIL_DATABASE_FILE = path.join(dataDir, "longtail-forge.db");
  process.env.LONGTAIL_DATABASE_PROVIDER = "sqlite";
  process.env.LONGTAIL_ENV = "development";
  process.env.LONGTAIL_LOCAL_STORAGE_ROOT = path.join(dataDir, "files");
  process.env.LONGTAIL_PUBLIC_URL = "http://127.0.0.1";
  process.env.LONGTAIL_RELEASE_BRANCH = "";
  process.env.SUPER_ADMIN_DISPLAY_NAME = roleFixtures.credentials.get("super_admin").displayName;
  process.env.SUPER_ADMIN_PASSWORD = roleFixtures.credentials.get("super_admin").password;
  process.env.SUPER_ADMIN_USERNAME = roleFixtures.credentials.get("super_admin").username;
}

/**
 * Build the HTTP client the journey drives the running app through.
 * @param {string} baseUrl
 */
function createApi(baseUrl) {
  /**
   * @param {string} method
   * @param {string} url
   * @param {unknown} body
   * @param {JourneyRequestOptions} [options]
   */
  async function request(method, url, body, options = {}) {
    /** @type {Record<string, string>} */
    const headers = {};
    if (body !== undefined) headers["content-type"] = "application/json";
    if (options.cookie) headers.cookie = `longtail_forge_session=${options.cookie}`;
    const response = await fetch(`${baseUrl}${url}`, {
      body: body === undefined ? undefined : JSON.stringify(body),
      headers,
      method,
      redirect: "manual",
    });
    const text = await response.text();
    const contentType = response.headers.get("content-type") || "";
    return {
      body: text && contentType.includes("application/json") ? JSON.parse(text) : text,
      headers: response.headers,
      status: response.status,
    };
  }

  return {
    /**
     * @param {string} url
     * @param {JourneyRequestOptions} [options]
     */
    get: (url, options) => request("GET", url, undefined, options),
    /**
     * @param {string} url
     * @param {unknown} [body]
     * @param {JourneyRequestOptions} [options]
     */
    post: (url, body, options) => request("POST", url, body, options),
    /**
     * @param {string} url
     * @param {unknown} [body]
     * @param {JourneyRequestOptions} [options]
     */
    put: (url, body, options) => request("PUT", url, body, options),
  };
}

/**
 * Read the session cookie one authenticated login issued.
 * @param {JourneySessionResponse} response
 * @returns {string}
 */
function readSessionCookie(response) {
  return (response.headers.get("set-cookie") || "")
    .match(/(?:^|,\s*)longtail_forge_session=([^;,]+)/)?.[1] || "";
}

/**
 * Collect every href reachable from one navigation tree.
 * @param {NavigationItem[] | null | undefined} items
 * @returns {Set<string>}
 */
function navigationHrefs(items) {
  const hrefs = new Set();
  for (const item of items || []) {
    if (item.href) hrefs.add(item.href);
    for (const href of navigationHrefs(item.items)) hrefs.add(href);
  }
  return hrefs;
}

/**
 * Flatten one client tree into a single visitable list.
 * @param {ClientProjectNode[] | null | undefined} clients
 * @returns {ClientProjectNode[]}
 */
function flattenClients(clients) {
  const flattened = [];
  for (const client of clients || []) {
    flattened.push(client, ...flattenClients(client.children));
  }
  return flattened;
}

/**
 * Start the journey app on an ephemeral loopback port.
 * @param {unknown} app
 */
function listen(app) {
  return new Promise((resolve) => {
    const server = http.createServer(/** @type {import("node:http").RequestListener} */ (app));
    server.listen(0, "127.0.0.1", () => resolve(server));
  });
}

/**
 * Close the journey app server.
 * @param {unknown} server
 * @returns {Promise<void>}
 */
function closeServer(server) {
  return new Promise((resolve, reject) => {
    /** @type {ClosableServer} */ (server).close((error) => error ? reject(error) : resolve());
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === scriptPath) {
  try {
    console.log(JSON.stringify(await runRolePermissionJourney({
      publicDemo: process.argv.includes("--public-demo"),
    }), null, 2));
  } catch (error) {
    console.error(/** @type {{ message?: unknown }} */ (error)?.message || error);
    process.exitCode = 1;
  }
}

export { runRolePermissionJourney };
