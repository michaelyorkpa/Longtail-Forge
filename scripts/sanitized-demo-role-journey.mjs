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
  ROLE_CREDENTIALS_FILE_ENV,
  SANITIZED_DEMO_ROLE_FIXTURES,
} from "./lib/sanitized-demo-role-fixtures.mjs";

loadRuntimeEnvFile();

const scriptPath = fileURLToPath(import.meta.url);

async function runRolePermissionJourney() {
  const roleFixtures = await loadSanitizedDemoRoleFixtures({
    mode: LOCAL_ROLE_FIXTURE_MODE,
    target: { profile: "sanitized-demo" },
  });
  const journeyRoot = await fs.mkdtemp(path.join(os.tmpdir(), "ltf-role-journey-"));
  const dataDir = path.join(journeyRoot, "sanitized-demo", "permission-journey");
  let closeDatabase;
  let server;

  try {
    seedDisposableSanitizedDemo(dataDir, roleFixtures.credentialsFile);
    configureJourneyRuntime(dataDir, roleFixtures);

    const [{ createApp }, databaseApi] = await Promise.all([
      import("../src/core/app.js"),
      import("../src/db/index.js"),
    ]);
    closeDatabase = databaseApi.closeDatabase;
    await databaseApi.initializeDatabase();
    server = await listen(createApp());
    const address = server.address();
    const api = createApi(`http://127.0.0.1:${address.port}`);
    const sessions = new Map();
    let checks = 0;

    for (const fixture of SANITIZED_DEMO_ROLE_FIXTURES) {
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
    for (const fixture of SANITIZED_DEMO_ROLE_FIXTURES) {
      const shell = await api.get("/api/app-shell/bootstrap", {
        cookie: sessions.get(fixture.roleId),
      });
      assert.equal(shell.status, 200, `${fixture.roleId} should load the app shell`);
      shellByRole.set(fixture.roleId, shell.body);
      checks += 1;
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
      ["super_admin", 200, 200, 200],
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

    const expectedRoleCatalogSizes = new Map([
      ["super_admin", 7],
      ["workspace_admin", 6],
      ["client_admin", 4],
      ["project_admin", 1],
    ]);
    for (const [roleId, expectedSize] of expectedRoleCatalogSizes) {
      const roles = await api.get("/api/roles", { cookie: sessions.get(roleId) });
      assert.equal(roles.status, 200);
      assert.equal(roles.body.roles.length, expectedSize);
      assert.ok(roles.body.roles.every((role) => (
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
      clientAdminRoles.body.roles.map((role) => role.role_id).sort(),
      ["client_external_user", "client_user", "project_admin", "project_user"],
    );
    assert.ok(
      clientAdminRoles.body.roles.flatMap((role) => role.scopes)
        .some((scope) => scope.label.includes("Cedar & Bloom")),
    );
    assert.equal(
      clientAdminRoles.body.roles.flatMap((role) => role.scopes)
        .some((scope) => scope.label.includes("Maple Lane Cafe")),
      false,
    );
    checks += 3;

    const projectAdminRoles = await api.get("/api/roles", {
      cookie: sessions.get("project_admin"),
    });
    assert.deepEqual(projectAdminRoles.body.roles.map((role) => role.role_id), ["project_user"]);
    assert.deepEqual(
      projectAdminRoles.body.roles[0].scopes.map((scope) => scope.label),
      ["Cedar & Bloom / Website Refresh"],
    );
    checks += 2;

    const clientAdminLookup = await api.post("/api/role-assignments/lookup", {
      username: roleFixtures.credentials.get("project_user").username,
    }, { cookie: sessions.get("client_admin") });
    assert.equal(clientAdminLookup.status, 200);
    assert.deepEqual(
      clientAdminLookup.body.match.assignments.map((assignment) => assignment.role_id),
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
      rolesVerified: SANITIZED_DEMO_ROLE_FIXTURES.map((fixture) => fixture.roleId),
    };
  } finally {
    if (server) await closeServer(server);
    if (closeDatabase) await closeDatabase();
    await fs.rm(journeyRoot, { force: true, recursive: true });
  }
}

function seedDisposableSanitizedDemo(dataDir, credentialsFile) {
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
    LOCAL_ROLE_FIXTURE_MODE,
  ], {
    cwd: process.cwd(),
    encoding: "utf8",
    env: {
      ...process.env,
      LONGTAIL_ENV: "development",
      LONGTAIL_PUBLIC_URL: "http://127.0.0.1",
      LONGTAIL_RELEASE_BRANCH: "",
      [ROLE_CREDENTIALS_FILE_ENV]: credentialsFile,
    },
  });
  if (result.status !== 0) {
    throw new Error(`Disposable sanitized-demo seed failed: ${String(result.stderr || result.error || "unknown error").trim()}`);
  }
}

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
  delete process.env.LTF_REGRESSION_BASELINE_DB;
}

function createApi(baseUrl) {
  async function request(method, url, body, options = {}) {
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
    get: (url, options) => request("GET", url, undefined, options),
    post: (url, body, options) => request("POST", url, body, options),
  };
}

function readSessionCookie(response) {
  return (response.headers.get("set-cookie") || "")
    .match(/(?:^|,\s*)longtail_forge_session=([^;,]+)/)?.[1] || "";
}

function navigationHrefs(items) {
  const hrefs = new Set();
  for (const item of items || []) {
    if (item.href) hrefs.add(item.href);
    for (const href of navigationHrefs(item.items)) hrefs.add(href);
  }
  return hrefs;
}

function flattenClients(clients) {
  const flattened = [];
  for (const client of clients || []) {
    flattened.push(client, ...flattenClients(client.children));
  }
  return flattened;
}

function listen(app) {
  return new Promise((resolve) => {
    const server = http.createServer(app);
    server.listen(0, "127.0.0.1", () => resolve(server));
  });
}

function closeServer(server) {
  return new Promise((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === scriptPath) {
  try {
    console.log(JSON.stringify(await runRolePermissionJourney(), null, 2));
  } catch (error) {
    console.error(error?.message || error);
    process.exitCode = 1;
  }
}

export { runRolePermissionJourney };
