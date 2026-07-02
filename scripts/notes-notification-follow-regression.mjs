/* global fetch */

import assert from "node:assert/strict";
import fs from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";

const appVersion = "0.33.5.21.0.4";
const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "ltf-notes-notification-follow-"));
process.env.LONGTAIL_DATABASE_FILE = path.join(tempDir, "longtail-forge-notes-notification-follow.db");
process.env.SUPER_ADMIN_PASSWORD = "Notes-Notification-Follow-Test-123!";

const { createApp } = await import("../src/core/app.js");
const { modulesService } = await import("../src/core/modules/modules.service.js");
const { notificationsService } = await import("../src/services/notifications.service.js");
const { closeSqlite, initializeDatabase, querySql, runSql, sqlText } = await import("../src/db/index.js");

let server;

try {
  await initializeDatabase();
  const fixtures = await seedFixtures();
  server = await listen(createApp());
  const api = createApi(`http://127.0.0.1:${server.address().port}`);

  await assertStaticContracts();
  await assertNoteNotificationFollowFlow(api, fixtures);

  console.log("Notes notification follow regression passed.");
} finally {
  notificationsService.resetEventHandlersForTests();
  if (server) {
    await closeServer(server);
  }
  await closeSqlite();
  await fs.rm(tempDir, { recursive: true, force: true });
}

async function assertStaticContracts() {
  const [
    packageJson,
    packageLock,
    notesView,
    notesScript,
    notificationSubscriptions,
    notesModuleSource,
    notificationServiceSource,
    manifestContract,
    css,
    regressionSuite,
  ] = await Promise.all([
    readJson("package.json"),
    readJson("package-lock.json"),
    readProjectFile("views/protected/notes.html"),
    readProjectFile("public/js/notes.js"),
    readProjectFile("public/js/shared/notification-subscriptions.js"),
    readProjectFile("src/modules/notes/module.js"),
    readProjectFile("src/services/notifications.service.js"),
    readProjectFile("src/core/modules/manifest-contract.js"),
    readProjectFile("public/css/longtail-forge.css"),
    readProjectFile("scripts/regression-suite.mjs"),
  ]);

  assert.equal(packageJson.version, appVersion, "package.json should report the Notes follow-bell slice version");
  assert.equal(packageLock.version, appVersion, "package-lock root should report the Notes follow-bell slice version");
  assert.equal(packageLock.packages[""].version, appVersion, "package-lock package entry should report the Notes follow-bell slice version");
  assert.match(notesView, /js\/shared\/notification-subscriptions\.js\?v=1[\s\S]*js\/notes\.js\?v=69/, "Notes view should load notification subscriptions before Notes browser code");
  assert.match(notesView, /css\/longtail-forge\.css\?v=56/, "Notes view should cache-bust the follow-bell stylesheet");
  assert.match(notificationSubscriptions, /function noteTarget\(noteId\)[\s\S]*moduleId: "notes"[\s\S]*targetType: "note"[\s\S]*noteTarget/, "Shared notification helper should expose a Notes target helper");

  assert.match(notesScript, /data-note-notification-toggle/, "Notes editor should expose a heading notification toggle hook");
  assert.match(notesScript, /action: "follow-note-notifications"[\s\S]*icon: "bell"[\s\S]*iconOnly: true[\s\S]*label: "Follow note notifications"[\s\S]*text: ""[\s\S]*title: "Follow note notifications"/, "Notes follow bell should be icon-only like the Task follow bell");
  assert.match(notesScript, /notificationToggle\?\.addEventListener\("click", toggleNoteNotificationFollow\)/, "Notes bell should use a Notes-owned toggle handler");
  assert.match(notesScript, /function writeNoteNotificationFollowFields\(note\)[\s\S]*note\?\.security_mode !== "secure"[\s\S]*subscriptions\.readStatus\(subscriptions\.noteTarget\(noteId\)\)/, "Notes bell should be saved-note and non-secure only");
  assert.match(notesScript, /function toggleNoteNotificationFollow\(\)[\s\S]*subscriptions\.noteTarget\(noteId\)[\s\S]*subscriptions\.unfollow\(target\)[\s\S]*subscriptions\.follow\(target\)/, "Notes bell should call the shared follow APIs");
  assert.doesNotMatch(notesScript, /dataset\.noteDialogClose/, "Notes editor should not keep the duplicate top Close button");
  assert.doesNotMatch(notesScript, /document\.querySelector\("\[data-note-dialog-close\]"\)/, "Notes editor should not query a removed top Close button");

  assert.match(notesModuleSource, new RegExp(`version: "${escapeRegExp(appVersion)}"`), "Notes module should report the current follow-bell version");
  assert.match(notesModuleSource, /notificationEvents:\s*\[[\s\S]*id: "note\.updated"[\s\S]*id: "note\.archived"[\s\S]*id: "note\.restored"[\s\S]*id: "note\.linked"[\s\S]*id: "note\.unlinked"/, "Notes should declare meaningful notification events");
  assert.match(notesModuleSource, /suppressActorSubscriptions: true/, "Notes notification events should suppress followed-note notifications for the acting user");
  assert.match(notesModuleSource, /notificationFollowTargets:\s*\[[\s\S]*targetType: "note"[\s\S]*eventTypes: \[[\s\S]*"note\.updated"[\s\S]*"note\.unlinked"/, "Notes should declare note as a followable notification target");
  assert.match(notificationServiceSource, /function readNoteTargetMetadata\(notification, session, baseMetadata\)[\s\S]*notesService\.read\(notification\.record_id, session\)/, "Notification target metadata should re-check note access");
  assert.match(notificationServiceSource, /suppressActorSubscriptions === true[\s\S]*suppressActorRecipients\(rawSubscribedRecipients, event\)/, "Notification service should honor event-level subscription actor suppression");
  assert.match(notificationServiceSource, /function isNotificationSuppressed\(event\)[\s\S]*suppress_notifications/, "Notification service should let module events suppress notification delivery");
  assert.match(manifestContract, /optionalBoolean\(item, "suppressActorSubscriptions"/, "Manifest contract should document subscription actor suppression");
  assert.match(css, /\[data-note-notification-toggle\]\.is-following/, "Notes follow bell should share the followed visual state");
  assert.match(regressionSuite, /scripts\/notes-notification-follow-regression\.mjs/, "Full regression suite should include the Notes notification follow regression");
}

async function assertNoteNotificationFollowFlow(api, fixtures) {
  const created = await api.post("/api/notes", {
    bodyMarkdown: "Followable note body",
    libraryBucket: "active_work",
    securityMode: "normal",
    title: "Followable notification note",
    visibility: "internal",
  }, { cookie: fixtures.sessions.superAdmin });
  assert.equal(created.status, 201, JSON.stringify(created.body));
  const noteId = created.body.note.note_id;

  const initialStatus = await api.get(`/api/notifications/subscriptions?moduleId=notes&targetType=note&targetId=${encodeURIComponent(noteId)}`, {
    cookie: fixtures.sessions.workspaceAdmin,
  });
  assert.equal(initialStatus.status, 200, JSON.stringify(initialStatus.body));
  assert.equal(initialStatus.body.isFollowing, false);

  const followed = await api.post("/api/notifications/subscriptions", {
    moduleId: "notes",
    targetId: noteId,
    targetType: "note",
  }, { cookie: fixtures.sessions.workspaceAdmin });
  assert.equal(followed.status, 200, JSON.stringify(followed.body));
  assert.equal(followed.body.isFollowing, true);

  const deniedFollow = await api.post("/api/notifications/subscriptions", {
    moduleId: "notes",
    targetId: noteId,
    targetType: "note",
  }, { cookie: fixtures.sessions.otherProjectUser });
  assert.equal(deniedFollow.status, 404, JSON.stringify(deniedFollow.body));

  await updateNote(api, fixtures.sessions.superAdmin, noteId, {
    bodyMarkdown: "Updated by admin",
    title: "Followable notification note updated",
  });
  assert.equal(await notificationCountFor(fixtures.workspaceId, fixtures.users.workspaceAdmin.userId, "note.updated"), 1);

  const notificationList = await api.get("/api/notifications?status=unread", { cookie: fixtures.sessions.workspaceAdmin });
  const noteUpdate = notificationList.body.notifications.find((notification) => notification.event_type === "note.updated");
  assert.equal(noteUpdate.displayTitle, "Followable notification note updated");
  assert.equal(noteUpdate.target.recordType, "note");
  assert.equal(noteUpdate.target.canOpen, true);
  assert.equal(noteUpdate.url, `notes.html?note=${encodeURIComponent(noteId)}`);

  await updateNote(api, fixtures.sessions.workspaceAdmin, noteId, {
    bodyMarkdown: "Updated by follower actor",
    title: "Followable notification note follower update",
  });
  assert.equal(
    await notificationCountFor(fixtures.workspaceId, fixtures.users.workspaceAdmin.userId, "note.updated"),
    1,
    "followed-note updates by the acting follower should not notify that same user",
  );

  const linked = await api.post(`/api/notes/${encodeURIComponent(noteId)}/links`, {
    targetId: fixtures.workspaceId,
    targetType: "workspace",
  }, { cookie: fixtures.sessions.superAdmin });
  assert.equal(linked.status, 201, JSON.stringify(linked.body));
  assert.equal(await notificationCountFor(fixtures.workspaceId, fixtures.users.workspaceAdmin.userId, "note.linked"), 1);

  const removed = await api.post(`/api/notes/${encodeURIComponent(noteId)}/links/${encodeURIComponent(linked.body.link.note_link_id)}/remove`, {}, {
    cookie: fixtures.sessions.superAdmin,
  });
  assert.equal(removed.status, 200, JSON.stringify(removed.body));
  assert.equal(await notificationCountFor(fixtures.workspaceId, fixtures.users.workspaceAdmin.userId, "note.unlinked"), 1);

  const archived = await api.post(`/api/notes/${encodeURIComponent(noteId)}/archive`, {}, { cookie: fixtures.sessions.superAdmin });
  assert.equal(archived.status, 200, JSON.stringify(archived.body));
  assert.equal(await notificationCountFor(fixtures.workspaceId, fixtures.users.workspaceAdmin.userId, "note.archived"), 1);

  const restored = await api.post(`/api/notes/${encodeURIComponent(noteId)}/restore`, {}, { cookie: fixtures.sessions.superAdmin });
  assert.equal(restored.status, 200, JSON.stringify(restored.body));
  assert.equal(await notificationCountFor(fixtures.workspaceId, fixtures.users.workspaceAdmin.userId, "note.restored"), 1);

  const beforeSuppressed = await notificationCountFor(fixtures.workspaceId, fixtures.users.workspaceAdmin.userId, "note.updated");
  await modulesService.emitInternalEvent("note.updated", {
    actorUserId: fixtures.superAdmin.user_id,
    metadata: {
      recipient_user_ids: [fixtures.users.workspaceAdmin.userId],
      suppress_notifications: true,
      notification_suppression_reason: "secure_note",
    },
    moduleId: "notes",
    newValue: {
      note_id: noteId,
      security_mode: "secure",
      title: "Secure suppressed note",
    },
    recordId: noteId,
    recordType: "note",
    session: {
      user_id: fixtures.superAdmin.user_id,
      workspace_id: fixtures.workspaceId,
    },
    workspaceId: fixtures.workspaceId,
  });
  assert.equal(
    await notificationCountFor(fixtures.workspaceId, fixtures.users.workspaceAdmin.userId, "note.updated"),
    beforeSuppressed,
    "secure-note notification suppression should block delivery",
  );
}

async function updateNote(api, cookie, noteId, payload = {}) {
  const response = await api.put(`/api/notes/${encodeURIComponent(noteId)}`, {
    libraryBucket: "active_work",
    securityMode: "normal",
    visibility: "internal",
    ...payload,
  }, { cookie });
  assert.equal(response.status, 200, JSON.stringify(response.body));
  return response;
}

async function seedFixtures() {
  const workspaceId = (await querySql("SELECT workspace_id FROM workspaces ORDER BY created_at LIMIT 1;"))[0].workspace_id;
  const superAdmin = (await querySql(`
SELECT user_id, username
FROM users
WHERE home_workspace_id = ${sqlText(workspaceId)}
  AND protected_user = 'yes'
LIMIT 1;
`))[0];
  const now = new Date().toISOString();
  const users = {
    workspaceAdmin: userFixture("notes-notification-admin"),
    projectUser: userFixture("notes-notification-project-user"),
    otherProjectUser: userFixture("notes-notification-other-project-user"),
  };
  const project = {
    id: `notes-notification-project-${randomUUID()}`,
    name: "Notes Notification Project",
  };
  const otherProject = {
    id: `notes-notification-other-project-${randomUUID()}`,
    name: "Other Notes Notification Project",
  };

  await runSql(`
${Object.values(users).map((user) => userInsertSql(workspaceId, user)).join("\n")}
${Object.values(users).map((user) => membershipInsertSql(workspaceId, user, now)).join("\n")}
${projectInsertSql(workspaceId, project, now)}
${projectInsertSql(workspaceId, otherProject, now)}
${assignmentInsertSql(workspaceId, users.workspaceAdmin.userId, "workspace_admin", "workspace", workspaceId, now)}
${assignmentInsertSql(workspaceId, users.projectUser.userId, "project_user", "project", project.id, now)}
${assignmentInsertSql(workspaceId, users.otherProjectUser.userId, "project_user", "project", otherProject.id, now)}
`);

  return {
    project,
    otherProject,
    sessions: {
      workspaceAdmin: await createSession(workspaceId, users.workspaceAdmin.userId, users.workspaceAdmin.username),
      projectUser: await createSession(workspaceId, users.projectUser.userId, users.projectUser.username),
      otherProjectUser: await createSession(workspaceId, users.otherProjectUser.userId, users.otherProjectUser.username),
      superAdmin: await createSession(workspaceId, superAdmin.user_id, superAdmin.username),
    },
    superAdmin,
    users,
    workspaceId,
  };
}

function createApi(baseUrl) {
  return {
    get: (url, options = {}) => request(baseUrl, "GET", url, null, options),
    post: (url, body, options = {}) => request(baseUrl, "POST", url, body, options),
    put: (url, body, options = {}) => request(baseUrl, "PUT", url, body, options),
  };
}

async function request(baseUrl, method, url, body = null, options = {}) {
  const headers = {};

  if (body !== null) {
    headers["Content-Type"] = "application/json";
  }

  if (options.cookie) {
    headers.Cookie = `longtail_forge_session=${options.cookie}`;
  }

  const response = await fetch(`${baseUrl}${url}`, {
    method,
    headers,
    body: body === null ? undefined : JSON.stringify(body),
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
    status: response.status,
  };
}

async function notificationCountFor(workspaceId, recipientUserId, eventType) {
  const rows = await querySql(`
SELECT COUNT(*) AS count
FROM notifications
WHERE workspace_id = ${sqlText(workspaceId)}
  AND recipient_user_id = ${sqlText(recipientUserId)}
  AND event_type = ${sqlText(eventType)};
`);

  return Number(rows[0]?.count || 0);
}

async function readProjectFile(relativePath) {
  return fs.readFile(new URL(`../${relativePath}`, import.meta.url), "utf8");
}

async function readJson(relativePath) {
  return JSON.parse(await readProjectFile(relativePath));
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

function userFixture(slug) {
  return {
    displayName: slug.replaceAll("-", " "),
    userId: `user-${slug}-${randomUUID()}`,
    username: `${slug}-${randomUUID()}@example.test`,
  };
}

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
  ${sqlText(user.displayName)},
  '',
  'America/New_York',
  '!',
  'light',
  'active',
  'no',
  ${sqlText(workspaceId)}
);`;
}

function membershipInsertSql(workspaceId, user, now) {
  return `
INSERT INTO user_workspaces (user_workspace_id, workspace_id, user_id, status, created_at, updated_at)
VALUES (${sqlText(randomUUID())}, ${sqlText(workspaceId)}, ${sqlText(user.userId)}, 'active', ${sqlText(now)}, ${sqlText(now)});`;
}

function projectInsertSql(workspaceId, project, now) {
  return `
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
  task_default_status,
  task_default_priority,
  task_default_sort_order_json,
  created_at,
  updated_at
)
VALUES (
  ${sqlText(project.id)},
  ${sqlText(workspaceId)},
  NULL,
  NULL,
  ${sqlText(project.name)},
  'Active',
  'yes',
  NULL,
  NULL,
  NULL,
  NULL,
  NULL,
  'open',
  'normal',
  '["due_date","priority","status"]',
  ${sqlText(now)},
  ${sqlText(now)}
);`;
}

function assignmentInsertSql(workspaceId, userId, roleId, scopeType, scopeId, now) {
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
  NULL,
  ${scopedProjectId ? sqlText(scopedProjectId) : "NULL"},
  NULL,
  ${sqlText(now)},
  ${sqlText(now)}
);`;
}

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

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
