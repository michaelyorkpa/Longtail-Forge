/* global fetch */

import assert from "node:assert/strict";
import fs from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";

const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "ltf-lists-api-"));
process.env.LONGTAIL_DATABASE_FILE = path.join(tempDir, "longtail-forge-lists-api.db");
process.env.SUPER_ADMIN_PASSWORD = "Lists-Api-Test-123!";

const { createApp } = await import("../src/core/app.js");
const { closeSqlite, initializeDatabase, querySql, runSql, sqlText } = await import("../src/db/index.js");
const { createSession } = await import("../src/security/sessions.js");

let server;

try {
  await initializeDatabase();
  const fixtures = await seedFixtures();
  server = await listen(createApp());
  const baseUrl = `http://${server.address().address}:${server.address().port}`;
  const api = createApi(baseUrl);

  await assertAuthenticationRequired(api);
  await assertBusinessListApiFlow(api, fixtures);
  await assertFamilyListApiFlow(api, fixtures);
  await assertUnauthorizedAndIsolation(api, fixtures);
  await assertDisabledModuleBehavior(api, fixtures);
  await assertIntegrity();

  console.log("Lists API regression passed.");
} finally {
  if (server) {
    await closeServer(server);
  }
  await closeSqlite();
  await fs.rm(tempDir, { recursive: true, force: true });
}

async function assertAuthenticationRequired(api) {
  const response = await api.get("/api/lists");
  assert.equal(response.status, 401);
}

async function assertBusinessListApiFlow(api, fixtures) {
  const mismatch = await api.post("/api/lists", {
    client_id: fixtures.otherClientId,
    project_id: fixtures.projectId,
    title: "Mismatched procurement list",
  }, { cookie: fixtures.adminSessionId });
  assert.equal(mismatch.status, 400);
  assert.match(mismatch.body.error, /project/i);

  const created = await api.post("/api/lists", {
    description: "API procurement flow",
    list_type: "procurement",
    project_id: fixtures.projectId,
    title: "API Procurement List",
  }, { cookie: fixtures.adminSessionId });
  assert.equal(created.status, 201);
  assert.equal(created.body.list.title, "API Procurement List");
  assert.equal(created.body.list.client_id, fixtures.clientId);
  assert.equal(created.body.list.project_id, fixtures.projectId);
  fixtures.businessListId = created.body.list.list_id;

  const item = await api.post(`/api/lists/${fixtures.businessListId}/items`, {
    item_name: "API Widget",
    quantity: 2,
    unit: "box",
  }, { cookie: fixtures.adminSessionId });
  assert.equal(item.status, 201);
  assert.equal(item.body.item.item_name, "API Widget");
  fixtures.businessItemId = item.body.item.list_item_id;

  const secondItem = await api.post(`/api/lists/${fixtures.businessListId}/items`, {
    item_name: "API Cable",
    quantity: 5,
  }, { cookie: fixtures.adminSessionId });
  assert.equal(secondItem.status, 201);

  const updatedItem = await api.put(`/api/lists/${fixtures.businessListId}/items/${fixtures.businessItemId}`, {
    item_name: "API Widget Updated",
    purchase_status: "ordered",
    quantity: 3,
    sort_order: 20,
  }, { cookie: fixtures.adminSessionId });
  assert.equal(updatedItem.status, 200);
  assert.equal(updatedItem.body.item.purchase_status, "ordered");

  const reordered = await api.post(`/api/lists/${fixtures.businessListId}/items/reorder`, {
    items: [
      { list_item_id: secondItem.body.item.list_item_id, sort_order: 0 },
      { list_item_id: fixtures.businessItemId, sort_order: 10 },
    ],
  }, { cookie: fixtures.adminSessionId });
  assert.equal(reordered.status, 200);
  assert.deepEqual(reordered.body.items.map((entry) => entry.list_item_id), [
    secondItem.body.item.list_item_id,
    fixtures.businessItemId,
  ]);

  const checked = await api.post(`/api/lists/${fixtures.businessListId}/items/${fixtures.businessItemId}/check`, {}, {
    cookie: fixtures.adminSessionId,
  });
  assert.equal(checked.status, 200);
  assert.ok(checked.body.item.checked_at);

  const completedItem = await api.post(`/api/lists/${fixtures.businessListId}/items/${fixtures.businessItemId}/complete`, {}, {
    cookie: fixtures.adminSessionId,
  });
  assert.equal(completedItem.status, 200);
  assert.ok(completedItem.body.item.completed_at);

  const unchecked = await api.post(`/api/lists/${fixtures.businessListId}/items/${fixtures.businessItemId}/uncheck`, {}, {
    cookie: fixtures.adminSessionId,
  });
  assert.equal(unchecked.status, 200);
  assert.equal(unchecked.body.item.checked_at, null);
  assert.ok(unchecked.body.item.completed_at);

  const items = await api.get(`/api/lists/${fixtures.businessListId}/items`, { cookie: fixtures.adminSessionId });
  assert.equal(items.status, 200);
  assert.equal(items.body.items.length, 2);

  const read = await api.get(`/api/lists/${fixtures.businessListId}`, { cookie: fixtures.adminSessionId });
  assert.equal(read.status, 200);
  assert.equal(read.body.items.length, 2);

  const reusable = await api.post(`/api/lists/${fixtures.businessListId}/mark-reusable`, {}, { cookie: fixtures.adminSessionId });
  assert.equal(reusable.status, 200);
  assert.equal(reusable.body.list.is_reusable, true);

  const duplicated = await api.post(`/api/lists/${fixtures.businessListId}/duplicate`, {}, { cookie: fixtures.adminSessionId });
  assert.equal(duplicated.status, 201);
  assert.equal(duplicated.body.list.status, "active");
  assert.equal(duplicated.body.list.is_reusable, false);
  assert.equal(duplicated.body.list.source_list_id, fixtures.businessListId);
  assert.equal(duplicated.body.list.duplicated_from_list_id, fixtures.businessListId);
  assert.equal(duplicated.body.list.sourceContext.duplicatedFrom.title, "API Procurement List");
  assert.equal(duplicated.body.list.sourceContext.sourceList.title, "API Procurement List");
  assert.equal(duplicated.body.items.length, 2);
  assert.ok(duplicated.body.items.every((entry) => entry.purchase_status === "needed"));
  assert.ok(duplicated.body.items.every((entry) => entry.checked_at === null && entry.completed_at === null));

  const unmarkedReusable = await api.post(`/api/lists/${fixtures.businessListId}/unmark-reusable`, {}, { cookie: fixtures.adminSessionId });
  assert.equal(unmarkedReusable.status, 200);
  assert.equal(unmarkedReusable.body.list.is_reusable, false);

  const completed = await api.post(`/api/lists/${fixtures.businessListId}/complete`, {}, { cookie: fixtures.adminSessionId });
  assert.equal(completed.status, 200);
  assert.equal(completed.body.list.status, "completed");

  const reopened = await api.post(`/api/lists/${fixtures.businessListId}/reopen`, {}, { cookie: fixtures.adminSessionId });
  assert.equal(reopened.status, 200);
  assert.equal(reopened.body.list.status, "active");

  const archived = await api.post(`/api/lists/${fixtures.businessListId}/archive`, {}, { cookie: fixtures.adminSessionId });
  assert.equal(archived.status, 200);
  assert.equal(archived.body.list.status, "archived");

  const restored = await api.post(`/api/lists/${fixtures.businessListId}/restore`, {}, { cookie: fixtures.adminSessionId });
  assert.equal(restored.status, 200);
  assert.equal(restored.body.list.status, "active");

  const deletedItem = await api.delete(`/api/lists/${fixtures.businessListId}/items/${fixtures.businessItemId}`, {
    cookie: fixtures.adminSessionId,
  });
  assert.equal(deletedItem.status, 200);
  assert.ok(deletedItem.body.item.deleted_at);

  const deleted = await api.delete(`/api/lists/${fixtures.businessListId}`, { cookie: fixtures.adminSessionId });
  assert.equal(deleted.status, 200);
  assert.equal(deleted.body.list.status, "deleted");

  const hiddenDeleted = await api.get(`/api/lists/${fixtures.businessListId}`, { cookie: fixtures.adminSessionId });
  assert.equal(hiddenDeleted.status, 404);

  const restoredDeleted = await api.post(`/api/lists/${fixtures.businessListId}/restore`, {}, {
    cookie: fixtures.adminSessionId,
  });
  assert.equal(restoredDeleted.status, 200);
  assert.equal(restoredDeleted.body.list.status, "active");

  const bom = await api.post("/api/lists", {
    list_type: "bill_of_materials",
    title: "API BOM",
  }, { cookie: fixtures.adminSessionId });
  assert.equal(bom.status, 201);
  const bomItem = await api.post(`/api/lists/${bom.body.list.list_id}/items`, {
    actual_cost: 32,
    item_name: "BOM Part",
    purchase_status: "received",
    tracking_id: "API-BOM-TRACK",
  }, { cookie: fixtures.adminSessionId });
  assert.equal(bomItem.status, 201);
  const finalizedBom = await api.post(`/api/lists/${bom.body.list.list_id}/finalize`, {}, { cookie: fixtures.adminSessionId });
  assert.equal(finalizedBom.status, 200);
  assert.equal(finalizedBom.body.list.status, "finalized");
  const finalizedEdit = await api.post(`/api/lists/${bom.body.list.list_id}/items`, {
    item_name: "Blocked finalized edit",
  }, { cookie: fixtures.adminSessionId });
  assert.equal(finalizedEdit.status, 400);
  assert.match(finalizedEdit.body.error, /finalized/i);
  const duplicatedBom = await api.post(`/api/lists/${bom.body.list.list_id}/duplicate`, {}, { cookie: fixtures.adminSessionId });
  assert.equal(duplicatedBom.status, 201);
  assert.equal(duplicatedBom.body.list.status, "active");
  assert.equal(duplicatedBom.body.list.sourceContext.duplicatedFrom.title, "API BOM");
  assert.equal(duplicatedBom.body.list.sourceContext.duplicatedFrom.status, "finalized");
  assert.equal(duplicatedBom.body.items[0].actual_cost, null);
  assert.equal(duplicatedBom.body.items[0].purchase_status, "needed");
}

async function assertFamilyListApiFlow(api, fixtures) {
  const created = await api.post("/api/lists", {
    title: "Family Grocery List",
  }, { cookie: fixtures.familySessionId });
  assert.equal(created.status, 201);
  assert.equal(created.body.list.list_type, "shopping");
  assert.equal(created.body.list.client_id, null);
  fixtures.familyListId = created.body.list.list_id;

  const blockedClientContext = await api.post("/api/lists", {
    client_id: fixtures.clientId,
    title: "Family Client List",
  }, { cookie: fixtures.familySessionId });
  assert.equal(blockedClientContext.status, 400);
  assert.match(blockedClientContext.body.error, /business workspaces/i);
}

async function assertUnauthorizedAndIsolation(api, fixtures) {
  const externalRead = await api.get(`/api/lists/${fixtures.businessListId}`, {
    cookie: fixtures.externalSessionId,
  });
  assert.equal(externalRead.status, 403);

  const externalCreate = await api.post("/api/lists", {
    title: "External List",
  }, { cookie: fixtures.externalSessionId });
  assert.equal(externalCreate.status, 403);

  const crossWorkspaceRead = await api.get(`/api/lists/${fixtures.familyListId}`, {
    cookie: fixtures.adminSessionId,
  });
  assert.equal(crossWorkspaceRead.status, 404);
}

async function assertDisabledModuleBehavior(api, fixtures) {
  await runSql(`
UPDATE workspace_modules
SET status = 'disabled'
WHERE workspace_id = ${sqlText(fixtures.workspaceId)}
  AND module_id = 'lists';
`);

  const read = await api.get(`/api/lists/${fixtures.businessListId}`, { cookie: fixtures.adminSessionId });
  assert.equal(read.status, 200);

  const write = await api.post(`/api/lists/${fixtures.businessListId}/items`, {
    item_name: "Blocked while disabled",
  }, { cookie: fixtures.adminSessionId });
  assert.equal(write.status, 403);
  assert.match(write.body.error, /disabled/i);

  await runSql(`
UPDATE workspace_modules
SET status = 'enabled'
WHERE workspace_id = ${sqlText(fixtures.workspaceId)}
  AND module_id = 'lists';
`);
}

async function seedFixtures() {
  const now = new Date().toISOString();
  const rows = await querySql(`
SELECT workspace_id
FROM workspaces
ORDER BY created_at
LIMIT 1;
`);
  const workspaceId = rows[0]?.workspace_id;
  assert.ok(workspaceId, "default workspace should exist");

  await runSql(`
UPDATE workspaces
SET workspace_type = 'business'
WHERE workspace_id = ${sqlText(workspaceId)};
`);

  const adminRows = await querySql(`
SELECT user_id, username, timezone
FROM users
WHERE protected_user = 'yes'
ORDER BY rowid
LIMIT 1;
`);
  const admin = adminRows[0];
  assert.ok(admin?.user_id, "protected admin user should exist");

  const clientId = randomUUID();
  const otherClientId = randomUUID();
  const projectId = randomUUID();
  const familyWorkspaceId = randomUUID();
  const familyUserId = randomUUID();
  const externalUserId = randomUUID();

  await runSql(`
INSERT INTO clients (
  id,
  workspace_id,
  parent_client_id,
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
VALUES
  (${sqlText(clientId)}, ${sqlText(workspaceId)}, NULL, 'Lists API Client', 'active', 'yes', NULL, NULL, NULL, NULL, NULL, '', '', '', '', '', '', '', '', '', '', '', ${sqlText(now)}, ${sqlText(now)}),
  (${sqlText(otherClientId)}, ${sqlText(workspaceId)}, NULL, 'Lists API Other Client', 'active', 'yes', NULL, NULL, NULL, NULL, NULL, '', '', '', '', '', '', '', '', '', '', '', ${sqlText(now)}, ${sqlText(now)});

INSERT INTO projects (
  id,
  workspace_id,
  client_id,
  parent_project_id,
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
  ${sqlText(projectId)},
  ${sqlText(workspaceId)},
  ${sqlText(clientId)},
  NULL,
  'Lists API Project',
  'active',
  'yes',
  NULL,
  NULL,
  NULL,
  NULL,
  NULL,
  ${sqlText(now)},
  ${sqlText(now)}
);

INSERT INTO workspaces (workspace_id, name, status, workspace_type, created_at, updated_at)
VALUES (${sqlText(familyWorkspaceId)}, 'Lists API Family Workspace', 'active', 'family', ${sqlText(now)}, ${sqlText(now)});

INSERT INTO workspace_settings (
  workspace_id,
  fiscal_year_start_month,
  fiscal_year_start_day,
  default_billing_rate,
  billing_period_type,
  billing_period_start_day,
  rounding_enabled,
  rounding_increment,
  audit_logging_enabled,
  audit_retention_days,
  audit_settings_updated_at,
  task_timers_enabled,
  created_at,
  updated_at
)
VALUES (
  ${sqlText(familyWorkspaceId)},
  1,
  1,
  '',
  'monthly',
  1,
  0,
  '0.25',
  1,
  30,
  ${sqlText(now)},
  1,
  ${sqlText(now)},
  ${sqlText(now)}
);

INSERT INTO users (
  user_id,
  home_workspace_id,
  username,
  display_name,
  timezone,
  password,
  theme_mode,
  user_status,
  protected_user,
  active_workspace_id
)
VALUES
  (${sqlText(familyUserId)}, ${sqlText(familyWorkspaceId)}, 'lists-api-family@example.test', 'Lists API Family Admin', 'America/New_York', '', 'light', 'active', 'no', ${sqlText(familyWorkspaceId)}),
  (${sqlText(externalUserId)}, ${sqlText(workspaceId)}, 'lists-api-external@example.test', 'Lists API External User', 'America/New_York', '', 'light', 'active', 'no', ${sqlText(workspaceId)});

INSERT INTO user_workspaces (user_workspace_id, user_id, workspace_id, status, created_at, updated_at)
VALUES
  (${sqlText(randomUUID())}, ${sqlText(familyUserId)}, ${sqlText(familyWorkspaceId)}, 'active', ${sqlText(now)}, ${sqlText(now)}),
  (${sqlText(randomUUID())}, ${sqlText(externalUserId)}, ${sqlText(workspaceId)}, 'active', ${sqlText(now)}, ${sqlText(now)});

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
VALUES
  (${sqlText(randomUUID())}, ${sqlText(familyWorkspaceId)}, ${sqlText(familyUserId)}, 'workspace_admin', 'workspace', ${sqlText(familyWorkspaceId)}, NULL, NULL, NULL, ${sqlText(now)}, ${sqlText(now)}),
  (${sqlText(randomUUID())}, ${sqlText(workspaceId)}, ${sqlText(externalUserId)}, 'client_external_user', 'all', 'all', NULL, NULL, NULL, ${sqlText(now)}, ${sqlText(now)});
`);

  const adminSession = await createSession({
    ...admin,
    active_workspace_id: workspaceId,
    home_workspace_id: workspaceId,
  });
  const familySession = await createSession({
    active_workspace_id: familyWorkspaceId,
    home_workspace_id: familyWorkspaceId,
    timezone: "America/New_York",
    user_id: familyUserId,
    username: "lists-api-family@example.test",
  });
  const externalSession = await createSession({
    active_workspace_id: workspaceId,
    home_workspace_id: workspaceId,
    timezone: "America/New_York",
    user_id: externalUserId,
    username: "lists-api-external@example.test",
  });

  return {
    adminSessionId: adminSession.sessionId,
    clientId,
    externalSessionId: externalSession.sessionId,
    familySessionId: familySession.sessionId,
    familyWorkspaceId,
    otherClientId,
    projectId,
    workspaceId,
  };
}

function createApi(baseUrl) {
  return {
    delete: (url, options = {}) => request(baseUrl, "DELETE", url, null, options),
    get: (url, options = {}) => request(baseUrl, "GET", url, null, options),
    post: (url, body, options = {}) => request(baseUrl, "POST", url, body, options),
    put: (url, body, options = {}) => request(baseUrl, "PUT", url, body, options),
  };
}

async function request(baseUrl, method, url, body, options = {}) {
  const headers = {};

  if (options.cookie) {
    headers.Cookie = `longtail_forge_session=${options.cookie}`;
  }
  if (body !== null && body !== undefined) {
    headers["Content-Type"] = "application/json";
  }

  const response = await fetch(`${baseUrl}${url}`, {
    body: body === null || body === undefined ? undefined : JSON.stringify(body),
    headers,
    method,
    redirect: "manual",
  });
  const text = await response.text();
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
    text,
  };
}

async function assertIntegrity() {
  const rows = await querySql("PRAGMA integrity_check;");
  assert.equal(rows[0]?.integrity_check, "ok");
}

function listen(app) {
  return new Promise((resolve) => {
    const server = http.createServer(app);
    server.listen(0, "127.0.0.1", () => resolve(server));
  });
}

function closeServer(server) {
  return new Promise((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });
}
