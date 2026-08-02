export const regressionMeta = Object.freeze({
  id: "framework.private-calendar-feed-authentication",
  area: "framework",
  tier: "focused",
  tags: ["authentication", "baseline-bypass", "calendar", "security", "tasks", "throttling", "workspace-isolation"],
  description: "Proves private calendar feed token lifecycle, hashed storage, sessionless provider dispatch, immediate revocation, rejection parity, trusted-IP throttling, and secret-free logs.",
  runMode: "isolated-database",
});

/* global fetch */

import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import http from "node:http";
import { createDisposableDatabaseFixture } from "../../test-support/disposable-database.mjs";

const fixture = await createDisposableDatabaseFixture("private-calendar-feed-authentication");
const ADMIN_USERNAME = "private-feed-admin@example.test";
const ADMIN_PASSWORD = "Private-Feed-Admin-123!";

process.env.SUPER_ADMIN_USERNAME = ADMIN_USERNAME;
process.env.SUPER_ADMIN_PASSWORD = ADMIN_PASSWORD;
process.env.TRUST_PROXY = "false";
process.env.LONGTAIL_AUTH_THROTTLE_ENABLED = "true";
process.env.LONGTAIL_AUTH_THROTTLE_FAILURE_LIMIT = "3";
process.env.LONGTAIL_AUTH_THROTTLE_WINDOW_SECONDS = "60";
process.env.LONGTAIL_AUTH_THROTTLE_LOCKOUT_SECONDS = "120";

const { createApp } = await import("../../../src/core/app.js");
const { closeDatabase, initializeDatabase } = await import("../../../src/db/index.js");
const { db } = await import("../../../src/core/database.js");
const { authenticationThrottle } = await import("../../../src/security/auth-throttle.js");
const {
  getPrivateFeedProvider,
  listPrivateFeedProviders,
} = await import("../../../src/core/private-feeds/private-feed-providers.js");

let server;
const capturedConsole = [];
const originalConsoleError = console.error;
const originalConsoleWarn = console.warn;

try {
  console.error = (...values) => capturedConsole.push(values.map(String).join(" "));
  console.warn = (...values) => capturedConsole.push(values.map(String).join(" "));

  await initializeDatabase();
  server = await listen(createApp());
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  const api = createApi(baseUrl);

  assert.deepEqual(
    listPrivateFeedProviders().map((provider) => provider.id),
    ["tasks.calendar"],
    "Tasks should register the initial calendar content provider by stable ID",
  );
  assert.equal(
    await getPrivateFeedProvider("tasks.calendar").render({
      session: {
        user_id: "missing-private-feed-user",
        username: "missing@example.test",
        workspace_id: "missing-private-feed-workspace",
      },
    }),
    null,
    "the Tasks provider should refuse content when the resolved owner lacks tasks.view",
  );

  const unauthenticatedCollection = await api.get("/api/private-feeds/calendar-subscriptions");
  assert.equal(unauthenticatedCollection.status, 401, "feed lifecycle reads should require a browser session");

  const loginResponse = await api.post("/api/login", {
    password: ADMIN_PASSWORD,
    username: ADMIN_USERNAME,
  });
  assert.equal(loginResponse.status, 200, JSON.stringify(loginResponse.body));
  const sessionCookie = readSessionCookie(loginResponse);
  const ownerUserId = loginResponse.body.user.user_id;
  const ownerWorkspaceId = loginResponse.body.user.workspace_id;
  assert.equal(
    (await api.raw("/calendar-settings.html", { cookie: sessionCookie })).status,
    200,
    "workspace settings managers should reach the dedicated Calendar administration page",
  );

  const initialCollection = await api.get("/api/private-feeds/calendar-subscriptions", { cookie: sessionCookie });
  assert.deepEqual(initialCollection.body.subscriptions, []);

  const generated = await api.post("/api/private-feeds/calendar-subscriptions", {
    name: "Initial workspace & planning / North",
    scopeType: "workspace",
  }, { cookie: sessionCookie });
  assert.equal(generated.status, 201, JSON.stringify(generated.body));
  assert.equal(generated.body.subscription.status, "active");
  assert.match(
    generated.body.feedUrl,
    /^http:\/\/127\.0\.0\.1:\d+\/feeds\/calendar\/ltf_feed_[A-Za-z0-9_-]{16}_[A-Za-z0-9_-]{43}\/Initial%20workspace%20&%20planning%20-%20North\.ics$/,
    "new subscription URLs should end in a path-safe encoded friendly name Thunderbird uses during ICS discovery",
  );
  assert.equal(
    thunderbirdIcsDisplayName(generated.body.feedUrl),
    "Initial workspace & planning - North",
    "Thunderbird's HEAD-based ICS detector should derive the friendly subscription name from the final URL segment",
  );
  const firstRawToken = readRawToken(generated.body.feedUrl);
  const generatedCollection = await api.get("/api/private-feeds/calendar-subscriptions", { cookie: sessionCookie });
  assert.equal(generatedCollection.body.subscriptions.length, 1);
  assert.equal(generatedCollection.body.subscriptions[0].name, "Initial workspace & planning / North");
  assert.equal(Object.hasOwn(generatedCollection.body, "feedUrl"), false, "metadata reads must never recover the raw bearer URL");

  const stored = await db.get(`
SELECT provider_id, token_selector, token_hash, status
FROM private_feed_tokens
WHERE workspace_id = :workspaceId
  AND user_id = :userId;
`, { userId: ownerUserId, workspaceId: ownerWorkspaceId });
  assert.equal(stored.provider_id, "tasks.calendar");
  assert.equal(stored.status, "active");
  assert.match(stored.token_hash, /^[a-f0-9]{64}$/);
  assert.equal(JSON.stringify(stored).includes(firstRawToken), false, "the raw private feed token must not be stored");
  assert.equal(stored.token_hash.includes(firstRawToken), false);

  await authenticationThrottle.clear();
  const friendlyFeedPath = new URL(generated.body.feedUrl).pathname;
  const thunderbirdHead = await api.head(friendlyFeedPath);
  assert.equal(thunderbirdHead.status, 200, "the friendly-name URL should support Thunderbird's initial HEAD probe");
  assert.match(thunderbirdHead.headers.get("content-type") || "", /^text\/calendar;\s*charset=utf-8$/i);
  const sessionlessFeed = await api.raw(friendlyFeedPath);
  assert.equal(sessionlessFeed.status, 200, sessionlessFeed.text);
  assert.match(sessionlessFeed.headers.get("content-type") || "", /^text\/calendar;\s*charset=utf-8$/i);
  assert.equal(sessionlessFeed.headers.get("cache-control"), "private, no-store");
  assert.equal(sessionlessFeed.headers.get("x-calendar-refresh-interval"), "900");
  assert.match(sessionlessFeed.text, /^BEGIN:VCALENDAR\r?\n/);
  assert.match(sessionlessFeed.text, /\r?\nEND:VCALENDAR\r?\n$/);
  assert.equal(sessionlessFeed.text.includes(ownerUserId), false, "feed content must not expose raw owner IDs");

  const legacyFeed = await api.raw(`/feeds/calendar/${encodeURIComponent(firstRawToken)}.ics`);
  assert.equal(legacyFeed.status, 200, "existing one-segment bearer URLs should remain valid");

  const rotated = await api.post(
    `/api/private-feeds/calendar-subscriptions/${generated.body.subscription.subscriptionId}/rotate`,
    undefined,
    { cookie: sessionCookie },
  );
  assert.equal(rotated.status, 200, JSON.stringify(rotated.body));
  const secondRawToken = readRawToken(rotated.body.feedUrl);
  assert.notEqual(secondRawToken, firstRawToken);

  await authenticationThrottle.clear();
  const rotatedAway = await api.raw(new URL(generated.body.feedUrl).pathname);
  assert.equal(rotatedAway.status, 404, "rotation should revoke the old URL immediately");
  const currentFeed = await api.raw(new URL(rotated.body.feedUrl).pathname);
  assert.equal(currentFeed.status, 200, "the replacement URL should serve immediately");

  const disabled = await api.delete(
    `/api/private-feeds/calendar-subscriptions/${generated.body.subscription.subscriptionId}`,
    { cookie: sessionCookie },
  );
  assert.equal(disabled.status, 200, JSON.stringify(disabled.body));
  assert.deepEqual(disabled.body, {
    removed: true,
    subscriptionId: generated.body.subscription.subscriptionId,
  });
  assert.equal(
    await db.get(
      "SELECT private_feed_token_id FROM private_feed_tokens WHERE private_feed_token_id = :subscriptionId;",
      { subscriptionId: generated.body.subscription.subscriptionId },
    ),
    null,
    "manual revocation should remove the credential row after recording the lifecycle event",
  );

  await authenticationThrottle.clear();
  const disabledResponse = await api.raw(new URL(rotated.body.feedUrl).pathname);
  const unknownResponse = await api.raw("/feeds/calendar/ltf_feed_aaaaaaaaaaaaaaaa_bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb.ics");
  const malformedResponse = await api.raw("/feeds/calendar/not-a-private-feed-token.ics");
  await authenticationThrottle.clear();
  const malformedFriendlyResponse = await api.raw("/feeds/calendar/not-a-private-feed-token/Friendly%20name.ics");
  for (const response of [disabledResponse, unknownResponse, malformedResponse, malformedFriendlyResponse]) {
    assert.equal(response.status, 404);
    assert.equal(response.text, "Calendar feed not found.");
    assert.equal(response.headers.get("cache-control"), "private, no-store");
    assert.match(response.headers.get("content-type") || "", /^text\/plain;\s*charset=utf-8$/i);
  }

  const auditRows = await db.query(`
SELECT action, previous_value_json, new_value_json, metadata_json
FROM audit_logs
WHERE record_type = 'security_event'
  AND action LIKE 'security.private_feed.%'
ORDER BY created_at, action;
`);
  assert.deepEqual(
    new Set(auditRows.map((row) => row.action)),
    new Set([
      "security.private_feed.revoked",
      "security.private_feed.created",
      "security.private_feed.rotated",
    ]),
  );
  const serializedAudit = JSON.stringify(auditRows);
  assert.equal(serializedAudit.includes(firstRawToken), false);
  assert.equal(serializedAudit.includes(secondRawToken), false);

  await authenticationThrottle.clear();
  for (let index = 0; index < 3; index += 1) {
    const rejected = await api.raw(
      `/feeds/calendar/ltf_feed_aaaaaaaaaaaaaaaa_${String(index).padStart(43, "c")}.ics`,
      { headers: { "x-forwarded-for": `203.0.113.${index + 10}` } },
    );
    assert.equal(rejected.status, 404);
  }
  const throttled = await api.raw(
    "/feeds/calendar/ltf_feed_aaaaaaaaaaaaaaaa_ddddddddddddddddddddddddddddddddddddddddddd.ics",
    { headers: { "x-forwarded-for": "198.51.100.99" } },
  );
  assert.equal(throttled.status, 429, "forged forwarding headers must not evade the trusted-IP throttle");
  assert.equal(throttled.text, "Too many attempts. Try again later.");
  assert.equal(throttled.headers.get("retry-after"), "120");
  const throttleRows = await db.query(`
SELECT scope, dimension
FROM authentication_throttle_entries
WHERE scope = 'private-calendar-feed';
`);
  assert.deepEqual(throttleRows, [{ dimension: "ip", scope: "private-calendar-feed" }]);

  await authenticationThrottle.clear();
  const regenerated = await api.post("/api/private-feeds/calendar-subscriptions", {
    name: "Recovered membership",
    scopeType: "workspace",
  }, { cookie: sessionCookie });
  assert.equal(regenerated.status, 201);
  await db.run(`
UPDATE user_workspaces
SET status = 'inactive'
WHERE workspace_id = :workspaceId
  AND user_id = :userId;
`, { userId: ownerUserId, workspaceId: ownerWorkspaceId });
  const inactiveMembership = await api.raw(new URL(regenerated.body.feedUrl).pathname);
  assert.equal(inactiveMembership.status, 404, "feed authentication must stop when the owner loses workspace membership");
  await db.run(`
UPDATE user_workspaces
SET status = 'active'
WHERE workspace_id = :workspaceId
  AND user_id = :userId;
`, { userId: ownerUserId, workspaceId: ownerWorkspaceId });

  const { clientsRepository } = await import("../../../src/modules/client-projects/clients.repo.js");
  const { projectsRepository } = await import("../../../src/modules/client-projects/projects.repo.js");
  const { hashPassword } = await import("../../../src/security/passwords.js");
  const { modulesService } = await import("../../../src/core/modules/modules.service.js");
  const clientId = randomUUID();
  const projectId = randomUUID();
  await clientsRepository.create(ownerWorkspaceId, {
    id: clientId,
    name: "Calendar Client",
    status: "Active",
  });
  await projectsRepository.create(ownerWorkspaceId, clientId, {
    id: projectId,
    name: "Calendar Project",
    status: "Active",
  });
  for (const workspaceType of ["personal", "family"]) {
    await db.run(`
UPDATE workspaces
SET workspace_type = :workspaceType
WHERE workspace_id = :workspaceId;
`, { workspaceId: ownerWorkspaceId, workspaceType });
    const rejectedScope = await api.post(
      "/api/private-feeds/calendar-subscriptions",
      { clientId, name: `Invalid ${workspaceType} client scope`, scopeType: "client" },
      { cookie: sessionCookie },
    );
    assert.equal(rejectedScope.status, 400);
    assert.equal(
      rejectedScope.body?.error?.message,
      "Client calendar scope is available only in Business workspaces.",
    );
    const projectScope = await api.post(
      "/api/private-feeds/calendar-subscriptions",
      { name: `${workspaceType} project scope`, projectId, scopeType: "project" },
      { cookie: sessionCookie },
    );
    assert.equal(projectScope.status, 201, `${workspaceType} workspaces should allow Project calendar scope`);
    const removedProjectScope = await api.delete(
      `/api/private-feeds/calendar-subscriptions/${projectScope.body.subscription.subscriptionId}`,
      { cookie: sessionCookie },
    );
    assert.equal(removedProjectScope.status, 200, `${workspaceType} Project calendar proof should clean up`);
  }
  await db.run(`
UPDATE workspaces
SET workspace_type = 'business'
WHERE workspace_id = :workspaceId;
`, { workspaceId: ownerWorkspaceId });

  const workspaceSubscription = await api.post("/api/private-feeds/calendar-subscriptions", {
    name: "Workspace planning",
    scopeType: "workspace",
  }, { cookie: sessionCookie });
  const clientSubscription = await api.post("/api/private-feeds/calendar-subscriptions", {
    clientId,
    name: "Client delivery",
    scopeType: "client",
  }, { cookie: sessionCookie });
  const projectSubscription = await api.post("/api/private-feeds/calendar-subscriptions", {
    name: "Workspace planning",
    projectId,
    scopeType: "project",
  }, { cookie: sessionCookie });
  for (const response of [workspaceSubscription, clientSubscription, projectSubscription]) {
    assert.equal(response.status, 201, JSON.stringify(response.body));
    assert.match(response.body.feedUrl, /\/feeds\/calendar\/ltf_feed_/);
  }
  await authenticationThrottle.clear();
  assert.equal((await api.raw(new URL(workspaceSubscription.body.feedUrl).pathname)).status, 200);
  await authenticationThrottle.clear();
  const clientScopedFeed = await api.raw(new URL(clientSubscription.body.feedUrl).pathname);
  assert.equal(clientScopedFeed.status, 200, clientScopedFeed.text);
  assert.match(clientScopedFeed.text, /X-WR-CALNAME:Client delivery/);
  await authenticationThrottle.clear();
  const projectScopedFeed = await api.raw(new URL(projectSubscription.body.feedUrl).pathname);
  assert.equal(projectScopedFeed.status, 200, projectScopedFeed.text);
  assert.match(projectScopedFeed.text, /X-WR-CALNAME:Workspace planning/);

  const collection = await api.get("/api/private-feeds/calendar-subscriptions", { cookie: sessionCookie });
  assert.equal(collection.status, 200, JSON.stringify(collection.body));
  assert.equal(collection.body.subscriptions.filter((subscription) => subscription.status === "active").length, 4);
  assert.deepEqual(
    new Set(collection.body.subscriptions.filter((subscription) => subscription.status === "active").map((subscription) => subscription.name)),
    new Set(["Recovered membership", "Workspace planning", "Client delivery"]),
  );
  assert.equal(JSON.stringify(collection.body).includes("ltf_feed_"), false, "collection reads must not recover bearer URLs");
  assert.equal(JSON.stringify(collection.body).includes("token_hash"), false, "collection reads must not expose hashes");
  const duplicateNames = collection.body.subscriptions.filter((subscription) => (
    subscription.status === "active" && subscription.name === "Workspace planning"
  ));
  assert.equal(duplicateNames.length, 2, "human names may repeat across independently addressed subscriptions");
  assert.equal(
    new Set(duplicateNames.map((subscription) => subscription.subscriptionId)).size,
    2,
    "duplicate names must retain distinct opaque identities",
  );

  const rotatedProject = await api.post(
    `/api/private-feeds/calendar-subscriptions/${projectSubscription.body.subscription.subscriptionId}/rotate`,
    undefined,
    { cookie: sessionCookie },
  );
  assert.equal(rotatedProject.status, 200, JSON.stringify(rotatedProject.body));
  assert.notEqual(rotatedProject.body.feedUrl, projectSubscription.body.feedUrl);
  const revokedClient = await api.delete(
    `/api/private-feeds/calendar-subscriptions/${clientSubscription.body.subscription.subscriptionId}`,
    { cookie: sessionCookie },
  );
  assert.equal(revokedClient.status, 200, JSON.stringify(revokedClient.body));
  assert.equal(revokedClient.body.removed, true);
  const { clientsService } = await import("../../../src/modules/client-projects/clients.service.js");
  await clientsService.archiveClient(clientId, {}, {
    user_id: ownerUserId,
    username: ADMIN_USERNAME,
    workspace_id: ownerWorkspaceId,
    workspace_type: "business",
  });
  await authenticationThrottle.clear();
  assert.equal(
    (await api.raw(new URL(rotatedProject.body.feedUrl).pathname)).status,
    404,
    "archiving the required Client and Project must revoke the scoped calendar immediately",
  );
  const archivedProjectSubscription = await db.get(`
SELECT status, revocation_reason
FROM private_feed_tokens
WHERE private_feed_token_id = :subscriptionId;
`, { subscriptionId: projectSubscription.body.subscription.subscriptionId });
  assert.deepEqual(archivedProjectSubscription, {
    revocation_reason: "project_inactive",
    status: "revoked",
  });
  const deletedArchivedProject = await api.delete(
    `/api/private-feeds/calendar-subscriptions/${projectSubscription.body.subscription.subscriptionId}`,
    { cookie: sessionCookie },
  );
  assert.deepEqual(deletedArchivedProject.body, {
    removed: true,
    subscriptionId: projectSubscription.body.subscription.subscriptionId,
  });
  assert.equal(
    await db.get(
      "SELECT private_feed_token_id FROM private_feed_tokens WHERE private_feed_token_id = :subscriptionId;",
      { subscriptionId: projectSubscription.body.subscription.subscriptionId },
    ),
    null,
    "an automatically revoked credential should remain explicitly deletable from Calendar Settings",
  );
  const deletedSubscriptionAudit = await db.get(`
SELECT action, metadata_json
FROM audit_logs
WHERE record_type = 'security_event'
  AND action = 'security.private_feed.deleted'
ORDER BY created_at DESC
LIMIT 1;
`);
  assert.equal(deletedSubscriptionAudit.action, "security.private_feed.deleted");
  assert.equal(JSON.parse(deletedSubscriptionAudit.metadata_json).operation, "delete");

  const delegatedUserId = randomUUID();
  const delegatedUsername = "calendar-admin@example.test";
  const delegatedPassword = "Calendar-Admin-123!";
  const now = new Date().toISOString();
  await db.run(`
INSERT INTO users (
  user_id, home_workspace_id, username, display_name, timezone, password,
  theme_mode, user_status, protected_user, active_workspace_id
) VALUES (
  :userId, :workspaceId, :username, 'Calendar Administrator', 'America/New_York', :password,
  'light', 'active', 'no', :workspaceId
);`, {
    password: await hashPassword(delegatedPassword),
    userId: delegatedUserId,
    username: delegatedUsername,
    workspaceId: ownerWorkspaceId,
  });
  await db.run(`
INSERT INTO user_workspaces (
  user_workspace_id, user_id, workspace_id, status, created_at, updated_at
) VALUES (
  :membershipId, :userId, :workspaceId, 'active', :now, :now
);`, {
    membershipId: randomUUID(),
    now,
    userId: delegatedUserId,
    workspaceId: ownerWorkspaceId,
  });
  await db.run(`
INSERT INTO user_role_assignments (
  assignment_id, workspace_id, user_id, role_id, scope_type, scope_id,
  client_id, project_id, permission_overrides_json, created_at, updated_at
) VALUES (
  :assignmentId, :workspaceId, :userId, 'workspace_admin', 'workspace', :workspaceId,
  NULL, NULL, NULL, :now, :now
);`, {
    assignmentId: randomUUID(),
    now,
    userId: delegatedUserId,
    workspaceId: ownerWorkspaceId,
  });
  const delegatedLogin = await api.post("/api/login", {
    password: delegatedPassword,
    username: delegatedUsername,
  });
  assert.equal(delegatedLogin.status, 200, JSON.stringify(delegatedLogin.body));
  const delegatedCookie = readSessionCookie(delegatedLogin);
  const delegatedSubscription = await api.post("/api/private-feeds/calendar-subscriptions", {
    name: "Delegated calendar",
    scopeType: "workspace",
  }, { cookie: delegatedCookie });
  assert.equal(delegatedSubscription.status, 201, JSON.stringify(delegatedSubscription.body));

  const adminCollection = await api.get("/api/private-feeds/calendar-subscriptions", { cookie: sessionCookie });
  const delegatedMetadata = adminCollection.body.subscriptions.find((subscription) => subscription.name === "Delegated calendar");
  assert.equal(delegatedMetadata.owner.username, delegatedUsername);
  assert.equal(delegatedMetadata.ownedByCurrentUser, false);
  const ownerRotateDenied = await api.post(
    `/api/private-feeds/calendar-subscriptions/${delegatedMetadata.subscriptionId}/rotate`,
    undefined,
    { cookie: sessionCookie },
  );
  assert.equal(ownerRotateDenied.status, 403, "workspace admins must not rotate another owner's bearer URL");
  const adminRevoked = await api.delete(
    `/api/private-feeds/calendar-subscriptions/${delegatedMetadata.subscriptionId}`,
    { cookie: sessionCookie },
  );
  assert.equal(adminRevoked.status, 200);
  await authenticationThrottle.clear();
  assert.equal((await api.raw(new URL(delegatedSubscription.body.feedUrl).pathname)).status, 404);

  const permissionLossSubscription = await api.post("/api/private-feeds/calendar-subscriptions", {
    name: "Permission loss",
    scopeType: "workspace",
  }, { cookie: delegatedCookie });
  assert.equal(permissionLossSubscription.status, 201, JSON.stringify(permissionLossSubscription.body));
  const assignmentsRemoved = await api.put(`/api/users/${delegatedUserId}/role-assignments`, {
    assignments: [],
  }, { cookie: sessionCookie });
  assert.equal(assignmentsRemoved.status, 200, JSON.stringify(assignmentsRemoved.body));
  assert.equal(
    (await api.raw("/calendar-settings.html", { cookie: delegatedCookie })).status,
    403,
    "the Calendar administration page must fail closed without workspace_settings.manage",
  );
  assert.equal(
    (await api.get("/api/private-feeds/calendar-subscriptions", { cookie: delegatedCookie })).status,
    403,
    "the Calendar collection must share the page's workspace settings gate",
  );
  assert.equal(
    (await api.raw(new URL(permissionLossSubscription.body.feedUrl).pathname)).status,
    404,
    "role replacement must revoke an ineligible calendar URL immediately",
  );
  const permissionLossRow = await db.get(`
SELECT status, revocation_reason
FROM private_feed_tokens
WHERE private_feed_token_id = :subscriptionId;
`, { subscriptionId: permissionLossSubscription.body.subscription.subscriptionId });
  assert.deepEqual(permissionLossRow, {
    revocation_reason: "tasks_permission_removed",
    status: "revoked",
  });

  const assignmentsRestored = await api.put(`/api/users/${delegatedUserId}/role-assignments`, {
    assignments: [{
      role_id: "workspace_admin",
      scope_id: ownerWorkspaceId,
      scope_type: "workspace",
    }],
  }, { cookie: sessionCookie });
  assert.equal(assignmentsRestored.status, 200, JSON.stringify(assignmentsRestored.body));
  const deactivationSubscription = await api.post("/api/private-feeds/calendar-subscriptions", {
    name: "Owner deactivation",
    scopeType: "workspace",
  }, { cookie: delegatedCookie });
  assert.equal(deactivationSubscription.status, 201, JSON.stringify(deactivationSubscription.body));
  const deactivatedOwner = await api.put(`/api/users/${delegatedUserId}/deactivate`, undefined, {
    cookie: sessionCookie,
  });
  assert.equal(deactivatedOwner.status, 200, JSON.stringify(deactivatedOwner.body));
  await authenticationThrottle.clear();
  assert.equal(
    (await api.raw(new URL(deactivationSubscription.body.feedUrl).pathname)).status,
    404,
    "canonical user deactivation must revoke the owner's calendar URLs immediately",
  );
  const deactivatedOwnerRow = await db.get(`
SELECT status, revocation_reason
FROM private_feed_tokens
WHERE private_feed_token_id = :subscriptionId;
`, { subscriptionId: deactivationSubscription.body.subscription.subscriptionId });
  assert.deepEqual(deactivatedOwnerRow, {
    revocation_reason: "owner_inactive",
    status: "revoked",
  });
  await modulesService.setModuleStatus(ownerWorkspaceId, "tasks", false, {
    session: {
      user_id: ownerUserId,
      username: ADMIN_USERNAME,
      workspace_id: ownerWorkspaceId,
    },
  });
  assert.equal(
    (await api.raw(new URL(workspaceSubscription.body.feedUrl).pathname)).status,
    404,
    "disabling Tasks must revoke every remaining workspace calendar URL immediately",
  );
  assert.equal(
    (await db.get("SELECT COUNT(1) AS count FROM private_feed_tokens WHERE workspace_id = :workspaceId AND status = 'active';", { workspaceId: ownerWorkspaceId })).count,
    0,
    "no active orphaned calendar subscriptions may remain after module disablement",
  );

  const secretSources = await Promise.all([
    fs.readFile("src/core/operational-logger.js", "utf8"),
    fs.readFile("src/routes/private-feeds.routes.js", "utf8"),
    fs.readFile("src/services/private-feeds.service.js", "utf8"),
  ]);
  assert.doesNotMatch(secretSources[0], /request\.(?:originalUrl|path|url)/, "request logging must not include secret-bearing feed paths");
  assert.doesNotMatch(secretSources[1], /console\.(?:debug|error|info|log|warn)/, "the feed route must not log tokens");
  assert.match(secretSources[2], /timingSafeEqual\(candidateHash, storedHash\)/);
  const serializedConsole = JSON.stringify(capturedConsole);
  assert.equal(serializedConsole.includes(firstRawToken), false, "runtime diagnostics must not contain the original token");
  assert.equal(serializedConsole.includes(secondRawToken), false, "runtime diagnostics must not contain the rotated token");

  const integrity = await db.get("PRAGMA integrity_check;");
  assert.equal(integrity.integrity_check, "ok");

  console.log("Private calendar feed authentication regression passed.");
} finally {
  console.error = originalConsoleError;
  console.warn = originalConsoleWarn;
  if (server) {
    await closeServer(server);
  }
  await closeDatabase();
  await fixture.cleanup();
}

function createApi(baseUrl) {
  async function request(method, url, body, options = {}) {
    const headers = { ...(options.headers || {}) };
    if (body !== undefined) {
      headers["content-type"] = "application/json";
    }
    if (options.cookie) {
      headers.cookie = `longtail_forge_session=${options.cookie}`;
    }
    const response = await fetch(`${baseUrl}${url}`, {
      body: body === undefined ? undefined : JSON.stringify(body),
      headers,
      method,
    });
    const text = await response.text();
    const contentType = response.headers.get("content-type") || "";
    return {
      body: text && contentType.includes("application/json") ? JSON.parse(text) : null,
      headers: response.headers,
      status: response.status,
      text,
    };
  }

  return {
    delete(url, options) {
      return request("DELETE", url, undefined, options);
    },
    get(url, options) {
      return request("GET", url, undefined, options);
    },
    head(url, options) {
      return request("HEAD", url, undefined, options);
    },
    post(url, body, options) {
      return request("POST", url, body, options);
    },
    put(url, body, options) {
      return request("PUT", url, body, options);
    },
    raw(url, options) {
      return request("GET", url, undefined, options);
    },
  };
}

function readSessionCookie(response) {
  return (response.headers.get("set-cookie") || "")
    .match(/longtail_forge_session=([^;,]+)/)?.[1] || "";
}

function readRawToken(feedUrl) {
  const tokenSegment = new URL(feedUrl).pathname
    .split("/")
    .find((segment) => segment.startsWith("ltf_feed_"));
  return decodeURIComponent(String(tokenSegment || "").replace(/\.ics$/i, ""));
}

function thunderbirdIcsDisplayName(feedUrl) {
  const lastPath = decodeURI(new URL(feedUrl).pathname)
    .split("/")
    .filter(Boolean)
    .pop() || "";
  return lastPath.split(".").slice(0, -1).join(".") || lastPath;
}

function listen(app) {
  return new Promise((resolve) => {
    const nextServer = http.createServer(app);
    nextServer.listen(0, "127.0.0.1", () => resolve(nextServer));
  });
}

function closeServer(serverInstance) {
  return new Promise((resolve, reject) => {
    serverInstance.close((error) => error ? reject(error) : resolve());
  });
}
