/* global fetch */

import assert from "node:assert/strict";
import fs from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { requireFirstRow } from "./test-support/database-row-assertions.mjs";

/** @typedef {import("../src/types/http-contracts.js").WorkspaceRequestSession} TasksSession */
import { readPayload } from "./test-support/http-payload-assertions.mjs";

/** @typedef {ReturnType<typeof createApi>} FollowApi */
/** @typedef {Awaited<ReturnType<typeof seedFixtures>>} FollowFixtures */
/** @typedef {ReturnType<typeof userFixture>} FollowUser */
/** @typedef {{ notification_id: string, event_type: string, status: string, url: string, updateTypeLabel: string, displayType: string, displayTitle?: string, title?: string, target?: Record<string, unknown>, record_id?: string, read_at?: unknown, dismissed_at?: unknown, priority?: string }} NotificationRow */
/** @typedef {{ notifications: NotificationRow[] }} NotificationListBody */
/** @typedef {{ notification: { status: string, read_at: unknown, dismissed_at: unknown } }} NotificationMutationBody */
/** @typedef {{ unreadCount: number, totalUnreadCount?: number, lowPriorityUnreadCount?: number, hasHighPriority?: boolean, hasPriorityAlert?: boolean }} NotificationCountBody */
/** @typedef {{ id: string, event_type?: string, userEnabled?: unknown, workspaceEnabled?: unknown, moduleEnabled?: unknown }} PreferenceEventRow */
/** @typedef {{ events: PreferenceEventRow[], canManageWorkspaceDefaults?: boolean, groupingPreferences?: { groupingMode: string } }} NotificationPreferenceBody */
/** @typedef {{ isFollowing: boolean, subscription?: { user_id: string } | null }} FollowStateBody */
/** @typedef {{ task: { task_id: string, title: string } }} TaskEnvelopeBody */
/** @typedef {{ notificationSummary: { unreadCount: number } }} ShellBody */
/** @typedef {{ note: { note_id: string, title?: string } }} NoteEnvelopeBody */
/** @typedef {{ link: { link_id?: string, note_link_id?: string } }} LinkEnvelopeBody */
import { createProjectTextReader } from "./test-support/source-scan.mjs";
const { readTextAsync: readProjectFile } = createProjectTextReader();

const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "ltf-notes-notification-follow-"));
process.env.LONGTAIL_DATABASE_FILE = path.join(tempDir, "longtail-forge-notes-notification-follow.db");
process.env.SUPER_ADMIN_PASSWORD = "Notes-Notification-Follow-Test-123!";

const { createApp } = await import("../src/core/app.js");
const { resetJobWorkerStatusForTests, runJobWorkerOnce } = await import("../src/core/jobs/index.js");
const { modulesService } = await import("../src/core/modules/modules.service.js");
const { notificationsService } = await import("../src/services/notifications.service.js");
const { closeSqlite, initializeDatabase, querySql, runSql, sqlText } = await import("../src/db/index.js");

let server;

try {
  await initializeDatabase();
  const fixtures = await seedFixtures();
  server = await listen(createApp());
  const address = server.address();
  assert.ok(address && typeof address === "object", "the notification fixture server should bind a TCP port");
  const api = createApi(`http://127.0.0.1:${address.port}`);

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
    _packageJson,
    _packageLock,
    notesView,
    notesScript,
    notificationSubscriptions,
    notesModuleSource,
    notesModuleEventsSource,
    notificationServiceSource,
    manifestContract,
    css,
    _regressionSuite,
  ] = await Promise.all([
    readJson("package.json"),
    readJson("package-lock.json"),
    readProjectFile("views/protected/notes.html"),
    readProjectFile("public/js/notes.js"),
    readProjectFile("public/js/shared/notification-subscriptions.js"),
    readProjectFile("src/modules/notes/module.js"),
    readProjectFile("src/modules/notes/module.events.js"),
    readProjectFile("src/services/notifications.service.js"),
    readProjectFile("src/core/modules/manifest-contract.js"),
    readProjectFile("public/css/longtail-forge.css"),
    readProjectFile("scripts/regression-legacy-snapshot.json"),
  ]);

  assert.match(notesView, /js\/shared\/notification-subscriptions\.js[\s\S]*js\/notes\.js/, "Notes view should load notification subscriptions before Notes browser code");
  assert.match(notesView, /css\/longtail-forge\.css/, "Notes view should reference the follow-bell stylesheet");
  assert.match(notificationSubscriptions, /function noteTarget\(noteId\)[\s\S]*moduleId: "notes"[\s\S]*targetType: "note"[\s\S]*noteTarget/, "Shared notification helper should expose a Notes target helper");

  assert.match(notesScript, /data-note-notification-toggle/, "Notes editor should expose a heading notification toggle hook");
  assert.match(notesScript, /action: "follow-note-notifications"[\s\S]*icon: "bell"[\s\S]*iconOnly: true[\s\S]*label: "Follow note notifications"[\s\S]*text: ""[\s\S]*title: "Follow note notifications"/, "Notes follow bell should be icon-only like the Task follow bell");
  assert.match(notesScript, /notificationToggle\?\.addEventListener\("click", toggleNoteNotificationFollow\)/, "Notes bell should use a Notes-owned toggle handler");
  assert.match(notesScript, /function writeNoteNotificationFollowFields\(note\)[\s\S]*!isSecureNote\(note\)[\s\S]*subscriptions\.readStatus\(subscriptions\.noteTarget\(noteId\)\)/, "Notes bell should be saved-note and effectively non-secure only");
  assert.match(notesScript, /function toggleNoteNotificationFollow\(\)[\s\S]*subscriptions\.noteTarget\(noteId\)[\s\S]*subscriptions\.unfollow\(target\)[\s\S]*subscriptions\.follow\(target\)/, "Notes bell should call the shared follow APIs");
  assert.doesNotMatch(notesScript, /dataset\.noteDialogClose/, "Notes editor should not keep the duplicate top Close button");
  assert.doesNotMatch(notesScript, /document\.querySelector\("\[data-note-dialog-close\]"\)/, "Notes editor should not query a removed top Close button");

  assert.match(notesModuleSource, /version:\s*appVersion/, "Notes module should report the current follow-bell version");
  assert.match(notesModuleEventsSource, /notificationEvents:\s*\[[\s\S]*id: "note\.updated"[\s\S]*id: "note\.archived"[\s\S]*id: "note\.restored"[\s\S]*id: "note\.linked"[\s\S]*id: "note\.unlinked"/, "Notes should declare meaningful notification events");
  assert.match(notesModuleEventsSource, /suppressActorSubscriptions: true/, "Notes notification events should suppress followed-note notifications for the acting user");
  assert.match(notesModuleEventsSource, /notificationFollowTargets:\s*\[[\s\S]*targetType: "note"[\s\S]*eventTypes: \[[\s\S]*"note\.updated"[\s\S]*"note\.unlinked"/, "Notes should declare note as a followable notification target");
  assert.match(notificationServiceSource, /function readNoteTargetMetadata\(notification, session, baseMetadata\)[\s\S]*notesService\.readConsumerSummary\([\s\S]*"notes\.notifications"/, "Notification target metadata should re-check note access through the effective-security consumer policy");
  assert.match(notificationServiceSource, /Protected or unavailable note/, "Inaccessible or effectively secure note notifications should not retain stale titles");
  assert.match(notificationServiceSource, /suppressActorSubscriptions === true[\s\S]*suppressActorRecipients\(rawSubscribedRecipients, event\)/, "Notification service should honor event-level subscription actor suppression");
  assert.match(notificationServiceSource, /function isNotificationSuppressed\(event\)[\s\S]*suppress_notifications/, "Notification service should let module events suppress notification delivery");
  assert.match(manifestContract, /optionalBoolean\(item, "suppressActorSubscriptions"/, "Manifest contract should document subscription actor suppression");
  assert.match(css, /\[data-note-notification-toggle\]\.is-following/, "Notes follow bell should share the followed visual state");
}

/** @param {FollowApi} api @param {FollowFixtures} fixtures */
async function assertNoteNotificationFollowFlow(api, fixtures) {
  const created = await api.post("/api/notes", {
    bodyMarkdown: "Followable note body",
    libraryBucket: "active_work",
    securityMode: "normal",
    title: "Followable notification note",
    visibility: "internal",
  }, { cookie: fixtures.sessions.superAdmin });
  /** @type {NoteEnvelopeBody} */
  const createdPayload = readPayload(created, ["note"], "created");
  assert.equal(created.status, 201, JSON.stringify(created.body));
  const noteId = createdPayload.note.note_id;

  const initialStatus = await api.get(`/api/notifications/subscriptions?moduleId=notes&targetType=note&targetId=${encodeURIComponent(noteId)}`, {
    cookie: fixtures.sessions.workspaceAdmin,
  });
  /** @type {FollowStateBody} */
  const initialStatusPayload = readPayload(initialStatus, ["isFollowing"], "initialStatus");
  assert.equal(initialStatus.status, 200, JSON.stringify(initialStatus.body));
  assert.equal(initialStatusPayload.isFollowing, false);

  const followed = await api.post("/api/notifications/subscriptions", {
    moduleId: "notes",
    targetId: noteId,
    targetType: "note",
  }, { cookie: fixtures.sessions.workspaceAdmin });
  /** @type {FollowStateBody} */
  const followedPayload = readPayload(followed, ["isFollowing"], "followed");
  assert.equal(followed.status, 200, JSON.stringify(followed.body));
  assert.equal(followedPayload.isFollowing, true);

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
  await drainQueuedJobs();
  assert.equal(await notificationCountFor(fixtures.workspaceId, fixtures.users.workspaceAdmin.userId, "note.updated"), 1);

  const notificationList = await api.get("/api/notifications?status=unread", { cookie: fixtures.sessions.workspaceAdmin });
  /** @type {NotificationListBody} */
  const notificationListPayload = readPayload(notificationList, ["notifications"], "notificationList");
  const noteUpdate = notificationListPayload.notifications.find((notification) => notification.event_type === "note.updated");
  assert.ok(noteUpdate, "the notification list should include the note update");
  assert.equal(noteUpdate.displayTitle, "Followable notification note updated");
  assert.ok(noteUpdate.target, "the note update notification should carry its target");
  assert.equal(noteUpdate.target.recordType, "note");
  assert.equal(noteUpdate.target.canOpen, true);
  assert.equal(noteUpdate.url, `notes.html?note=${encodeURIComponent(noteId)}`);

  await updateNote(api, fixtures.sessions.workspaceAdmin, noteId, {
    bodyMarkdown: "Updated by follower actor",
    title: "Followable notification note follower update",
  });
  await drainQueuedJobs();
  assert.equal(
    await notificationCountFor(fixtures.workspaceId, fixtures.users.workspaceAdmin.userId, "note.updated"),
    1,
    "followed-note updates by the acting follower should not notify that same user",
  );

  const linked = await api.post(`/api/notes/${encodeURIComponent(noteId)}/links`, {
    targetId: fixtures.workspaceId,
    targetType: "workspace",
  }, { cookie: fixtures.sessions.superAdmin });
  /** @type {LinkEnvelopeBody} */
  const linkedPayload = readPayload(linked, ["link"], "linked");
  assert.equal(linked.status, 201, JSON.stringify(linked.body));
  await drainQueuedJobs();
  assert.equal(await notificationCountFor(fixtures.workspaceId, fixtures.users.workspaceAdmin.userId, "note.linked"), 1);

  const removed = await api.post(`/api/notes/${encodeURIComponent(noteId)}/links/${encodeURIComponent(String(linkedPayload.link.note_link_id))}/remove`, {}, {
    cookie: fixtures.sessions.superAdmin,
  });
  assert.equal(removed.status, 200, JSON.stringify(removed.body));
  await drainQueuedJobs();
  assert.equal(await notificationCountFor(fixtures.workspaceId, fixtures.users.workspaceAdmin.userId, "note.unlinked"), 1);

  const archived = await api.post(`/api/notes/${encodeURIComponent(noteId)}/archive`, {}, { cookie: fixtures.sessions.superAdmin });
  assert.equal(archived.status, 200, JSON.stringify(archived.body));
  await drainQueuedJobs();
  assert.equal(await notificationCountFor(fixtures.workspaceId, fixtures.users.workspaceAdmin.userId, "note.archived"), 1);

  const restored = await api.post(`/api/notes/${encodeURIComponent(noteId)}/restore`, {}, { cookie: fixtures.sessions.superAdmin });
  assert.equal(restored.status, 200, JSON.stringify(restored.body));
  await drainQueuedJobs();
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
  await drainQueuedJobs();
  assert.equal(
    await notificationCountFor(fixtures.workspaceId, fixtures.users.workspaceAdmin.userId, "note.updated"),
    beforeSuppressed,
    "secure-note notification suppression should block delivery",
  );
}

/** @param {FollowApi} api @param {string} cookie @param {string} noteId @param {Record<string, unknown>} [payload] */
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
  const workspaceRow = requireFirstRow(
    await querySql("SELECT workspace_id FROM workspaces ORDER BY created_at LIMIT 1;"),
    "the seeded database should carry a workspace",
  );
  const workspaceId = String(workspaceRow.workspace_id);
  const superAdminRows = await querySql(`
SELECT user_id, username
FROM users
WHERE home_workspace_id = ${sqlText(workspaceId)}
  AND protected_user = 'yes'
LIMIT 1;
`);
  const superAdminRow = requireFirstRow(superAdminRows, "the seeded database should carry a protected super admin");
  const superAdmin = { user_id: String(superAdminRow.user_id), username: String(superAdminRow.username) };
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

/** @param {string} baseUrl */
function createApi(baseUrl) {
  return {
    /** @param {string} url @param {{ cookie?: string }} [options] */
    get: (url, options = {}) => request(baseUrl, "GET", url, null, options),
    /** @param {string} url @param {unknown} body @param {{ cookie?: string }} [options] */
    post: (url, body, options = {}) => request(baseUrl, "POST", url, body, options),
    /** @param {string} url @param {unknown} body @param {{ cookie?: string }} [options] */
    put: (url, body, options = {}) => request(baseUrl, "PUT", url, body, options),
  };
}

/**
 * @param {string} baseUrl
 * @param {string} method
 * @param {string} url
 * @param {unknown} [body]
 * @param {{ cookie?: string }} [options]
 * @returns {Promise<{ body: unknown, status: number }>}
 */
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

/** @param {string} workspaceId @param {string} recipientUserId @param {string} eventType @returns {Promise<number>} */
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

async function drainQueuedJobs() {
  resetJobWorkerStatusForTests();

  for (let attempt = 0; attempt < 10; attempt += 1) {
    const summary = await runJobWorkerOnce({
      claimLimit: 25,
      mode: "inline",
      workerId: "notes-notification-follow-regression",
    });

    if (summary.failed || summary.dead) {
      throw new Error(`Notes notification follow queued work failed: ${JSON.stringify(summary)}`);
    }

    if (summary.claimed === 0) {
      return;
    }
  }

  throw new Error("Notes notification follow queued work did not drain.");
}

/** @param {string} relativePath @returns {Promise<unknown>} */
async function readJson(relativePath) {
  return JSON.parse(await readProjectFile(relativePath));
}

/** @param {import("express").Application} app @returns {Promise<import("node:http").Server>} */
function listen(app) {
  return new Promise((resolve) => {
    const server = http.createServer(app);
    server.listen(0, "127.0.0.1", () => resolve(server));
  });
}

/** @param {import("node:http").Server} server @returns {Promise<void>} */
function closeServer(server) {
  return new Promise((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve(undefined);
    });
  });
}

/** @param {string} slug */
function userFixture(slug) {
  return {
    displayName: slug.replaceAll("-", " "),
    userId: `user-${slug}-${randomUUID()}`,
    username: `${slug}-${randomUUID()}@example.test`,
  };
}

/** @param {string} workspaceId @param {FollowUser} user @returns {string} */
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

/** @param {string} workspaceId @param {FollowUser} user @param {string} now @returns {string} */
function membershipInsertSql(workspaceId, user, now) {
  return `
INSERT INTO user_workspaces (user_workspace_id, workspace_id, user_id, status, created_at, updated_at)
VALUES (${sqlText(randomUUID())}, ${sqlText(workspaceId)}, ${sqlText(user.userId)}, 'active', ${sqlText(now)}, ${sqlText(now)});`;
}

/** @param {string} workspaceId @param {{ id: string, name: string, clientId?: string }} project @param {string} now @returns {string} */
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

/** @param {string} workspaceId @param {string} userId @param {string} roleId @param {string} scopeType @param {string | null} scopeId @param {string} now @returns {string} */
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

/** @param {string} workspaceId @param {string} userId @param {string} username */
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
