export const regressionMeta = Object.freeze({
  id: "tasks.private-calendar-feed-scope",
  area: "tasks",
  tier: "focused",
  tags: ["calendar", "permissions", "recurrence", "scope", "tasks", "workspace-isolation"],
  description: "Proves Workspace, Client, and Project calendar subscriptions apply a Tasks-owned SQL ceiling plus current permission and hierarchy intersection.",
  runMode: "isolated-database",
});

import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { requireRow } from "../../test-support/database-row-assertions.mjs";
import { workspaceSessionFixture } from "../../test-support/session-fixtures.mjs";

/** @typedef {import("../../../src/types/http-contracts.js").WorkspaceRequestSession} TasksSession */
import { createDisposableDatabaseFixture } from "../../test-support/disposable-database.mjs";

const fixture = await createDisposableDatabaseFixture("private-calendar-feed-scope");
process.env.SUPER_ADMIN_PASSWORD = "Private-Calendar-Feed-Scope-123!";

const { createPrivateFeedSubscriptionDescriptor } = await import(
  "../../../src/core/private-feeds/private-feed-providers.js"
);
const { db } = await import("../../../src/core/database.js");
const { closeDatabase, initializeDatabase } = await import("../../../src/db/index.js");
const { clientsRepository } = await import("../../../src/modules/client-projects/clients.repo.js");
const { projectsRepository } = await import("../../../src/modules/client-projects/projects.repo.js");
const { renderTasksPrivateCalendarFeed } = await import(
  "../../../src/modules/tasks/private-calendar-feed.provider.js"
);
const { tasksService } = await import("../../../src/modules/tasks/tasks.service.js");

try {
  await initializeDatabase();
  const owner = await db.get(`
SELECT user_id, username, timezone, home_workspace_id, active_workspace_id
FROM users
WHERE protected_user = 'yes'
LIMIT 1;
`);
  const ownerRow = requireRow(owner, "fresh database should seed a protected super admin");
  const workspaceId = ownerSessionFor(ownerRow).workspace_id;
  const clientAId = randomUUID();
  const clientBId = randomUUID();
  const visibleProjectId = randomUUID();
  const siblingProjectId = randomUUID();
  const unrelatedProjectId = randomUUID();
  const scopedUserId = randomUUID();
  const scopedUsername = "calendar-scope-user@example.test";
  const now = new Date().toISOString();

  await clientsRepository.create(workspaceId, {
    id: clientAId,
    name: "Client A",
    status: "Active",
  });
  await clientsRepository.create(workspaceId, {
    id: clientBId,
    name: "Client B",
    status: "Active",
  });
  await projectsRepository.create(workspaceId, clientAId, {
    id: visibleProjectId,
    name: "Visible project",
    status: "Active",
  });
  await projectsRepository.create(workspaceId, clientAId, {
    id: siblingProjectId,
    name: "Sibling project",
    status: "Active",
  });
  await projectsRepository.create(workspaceId, clientBId, {
    id: unrelatedProjectId,
    name: "Unrelated project",
    status: "Active",
  });
  await db.run(`
INSERT INTO users (
  user_id, home_workspace_id, username, display_name, alt_email, timezone,
  password, theme_mode, user_status, protected_user, active_workspace_id
) VALUES (
  :userId, :workspaceId, :username, 'Calendar Scope User', NULL, 'America/New_York',
  'fixture-password', 'light', 'active', 'no', :workspaceId
);`, {
    userId: scopedUserId,
    username: scopedUsername,
    workspaceId,
  });
  await db.run(`
INSERT INTO user_workspaces (
  user_workspace_id, user_id, workspace_id, status, created_at, updated_at
) VALUES (
  :membershipId, :userId, :workspaceId, 'active', :now, :now
);`, {
    membershipId: randomUUID(),
    now,
    userId: scopedUserId,
    workspaceId,
  });
  await replaceScopedRole({
    roleId: "workspace_admin",
    scopeId: workspaceId,
    scopeType: "workspace",
  });

  const ownerSession = ownerSessionFor(ownerRow);
  await createTask("Workspace-only task", { due_date: "2026-08-06" });
  await createTask("Client A direct task", {
    client_id: clientAId,
    due_date: "2026-08-07",
  });
  await createTask("Visible project task", {
    due_date: "2026-08-08",
    project_id: visibleProjectId,
  });
  await createTask("Sibling project task", {
    due_date: "2026-08-09",
    project_id: siblingProjectId,
  });
  await createTask("Unrelated project task", {
    due_date: "2026-08-10",
    project_id: unrelatedProjectId,
  });
  const recurring = (await tasksService.create({
    due_date: "2026-08-11",
    project_id: visibleProjectId,
    recurrence: {
      enabled: true,
      endDate: "2026-08-25",
      frequency: "WEEKLY",
      interval: 1,
    },
    title: "Visible scoped recurrence",
  }, ownerSession)).task;
  await db.run(`
UPDATE tasks
SET client_id = :clientId,
    project_id = :projectId,
    title = 'Moved recurrence secret'
WHERE workspace_id = :workspaceId
  AND task_id = :taskId;
`, {
    clientId: clientBId,
    projectId: unrelatedProjectId,
    taskId: recurring.task_id,
    workspaceId,
  });

  const subscriptions = {
    workspace: descriptor("Workspace planning", { type: "workspace" }),
    clientA: descriptor("Client A delivery", { clientId: clientAId, type: "client" }),
    clientB: descriptor("Client B delivery", { clientId: clientBId, type: "client" }),
    visibleProject: descriptor("Visible project plan", {
      clientId: clientAId,
      projectId: visibleProjectId,
      type: "project",
    }),
    siblingProject: descriptor("Sibling project plan", {
      clientId: clientAId,
      projectId: siblingProjectId,
      type: "project",
    }),
    unrelatedProject: descriptor("Unrelated project plan", {
      clientId: clientBId,
      projectId: unrelatedProjectId,
      type: "project",
    }),
  };
  assert.equal(Object.isFrozen(subscriptions.visibleProject), true);
  assert.equal(Object.isFrozen(subscriptions.visibleProject.scope), true);
  assert.throws(
    () => descriptor("Invalid project", { type: "project" }),
    /project identity is required/i,
  );

  const workspaceContent = await render(subscriptions.workspace);
  assert.ok(workspaceContent, "the workspace-scoped feed should render content");
  const clientAContent = await render(subscriptions.clientA);
  const clientBContent = await render(subscriptions.clientB);
  const visibleProjectContent = await render(subscriptions.visibleProject);
  const siblingProjectContent = await render(subscriptions.siblingProject);
  assert.ok(clientAContent && clientBContent && visibleProjectContent && siblingProjectContent, "scoped feeds should render content");

  assertFeedContains(workspaceContent, [
    "Workspace-only task",
    "Client A direct task",
    "Visible project task",
    "Sibling project task",
    "Unrelated project task",
    "Visible scoped recurrence",
    "Moved recurrence secret",
  ]);
  assertFeedContains(clientAContent, [
    "Client A direct task",
    "Visible project task",
    "Sibling project task",
    "Visible scoped recurrence",
  ]);
  assertFeedOmits(clientAContent, [
    "Workspace-only task",
    "Unrelated project task",
    "Moved recurrence secret",
  ]);
  assert.match(clientAContent, /STATUS:CANCELLED/);
  assert.match(clientAContent, /X-WR-CALNAME:Client A delivery/);
  assertFeedContains(clientBContent, [
    "Unrelated project task",
    "Moved recurrence secret",
  ]);
  assertFeedOmits(clientBContent, [
    "Workspace-only task",
    "Client A direct task",
    "Visible project task",
    "Sibling project task",
    "Visible scoped recurrence",
  ]);
  assertFeedContains(visibleProjectContent, [
    "Visible project task",
    "Visible scoped recurrence",
  ]);
  assertFeedOmits(visibleProjectContent, [
    "Workspace-only task",
    "Client A direct task",
    "Sibling project task",
    "Unrelated project task",
    "Moved recurrence secret",
  ]);
  assert.match(visibleProjectContent, /STATUS:CANCELLED/);
  assertFeedContains(siblingProjectContent, ["Sibling project task"]);
  assertFeedOmits(siblingProjectContent, [
    "Visible project task",
    "Unrelated project task",
    "Visible scoped recurrence",
  ]);

  await replaceScopedRole({
    clientId: clientAId,
    roleId: "client_admin",
    scopeId: clientAId,
    scopeType: "client",
  });
  assert.ok(await render(subscriptions.clientA));
  assert.ok(await render(subscriptions.visibleProject));
  assert.equal(await render(subscriptions.workspace), null);
  assert.equal(await render(subscriptions.clientB), null);

  await replaceScopedRole({
    projectId: visibleProjectId,
    roleId: "project_user",
    scopeId: visibleProjectId,
    scopeType: "project",
  });
  assert.ok(await render(subscriptions.visibleProject));
  assert.equal(await render(subscriptions.clientA), null);
  assert.equal(await render(subscriptions.siblingProject), null);

  await db.run(`
UPDATE projects
SET client_id = :clientId,
    updated_at = :now
WHERE workspace_id = :workspaceId
  AND id = :projectId;
`, {
    clientId: clientBId,
    now: new Date().toISOString(),
    projectId: visibleProjectId,
    workspaceId,
  });
  const movedProjectSubscription = descriptor("Moved project plan", {
    clientId: clientBId,
    projectId: visibleProjectId,
    type: "project",
  });
  assertFeedContains(await render(movedProjectSubscription), [
    "Visible project task",
    "Visible scoped recurrence",
  ]);

  await replaceScopedRole({
    clientId: clientAId,
    roleId: "client_admin",
    scopeId: clientAId,
    scopeType: "client",
  });
  const clientAAfterMove = await render(subscriptions.clientA);
  assertFeedContains(clientAAfterMove, ["Client A direct task", "Sibling project task"]);
  assertFeedOmits(clientAAfterMove, ["Visible project task", "Visible scoped recurrence"]);

  await replaceScopedRole({
    clientId: clientBId,
    roleId: "client_admin",
    scopeId: clientBId,
    scopeType: "client",
  });
  const clientBAfterMove = await render(subscriptions.clientB);
  assertFeedContains(clientBAfterMove, [
    "Visible project task",
    "Unrelated project task",
    "Visible scoped recurrence",
    "Moved recurrence secret",
  ]);
  assertFeedOmits(clientBAfterMove, ["Client A direct task", "Sibling project task"]);
  assert.ok(await render(movedProjectSubscription));
  assert.ok(await render(subscriptions.unrelatedProject));
  assert.equal(await render(subscriptions.visibleProject), null);

  for (const content of [
    workspaceContent,
    clientAContent,
    clientBContent,
    visibleProjectContent,
    siblingProjectContent,
    clientAAfterMove,
    clientBAfterMove,
  ]) {
    assert.ok(content, "each scoped feed in the leak sweep should have rendered");
    assert.equal(content.includes(scopedUserId), false);
    for (const rawId of [
      clientAId,
      clientBId,
      visibleProjectId,
      siblingProjectId,
      unrelatedProjectId,
      recurring.recurrence_template_id,
      recurring.task_id,
    ]) {
      assert.equal(content.includes(rawId), false, `feed content must not expose ${rawId}`);
    }
  }

  assert.equal(
    await renderTasksPrivateCalendarFeed({
      session: freshSession(),
      subscription: {
        ...movedProjectSubscription,
        ownerUserId: "another-user",
      },
    }),
    null,
  );
  const integrity = await db.get("PRAGMA integrity_check;");
  assert.ok(integrity, "the integrity check should return a row");
  assert.equal(integrity.integrity_check, "ok");
  console.log("Private calendar feed scope regression passed.");

  /** @param {string} title @param {Record<string, unknown>} payload */
  async function createTask(title, payload) {
    return tasksService.create({ ...payload, title }, ownerSession);
  }

  /** @param {string} name @param {Record<string, unknown>} scope */
  function descriptor(name, scope) {
    return createPrivateFeedSubscriptionDescriptor({
      name,
      ownerUserId: scopedUserId,
      scope,
      subscriptionId: randomUUID(),
      workspaceId,
    });
  }

  function freshSession() {
    return {
      active_workspace_id: workspaceId,
      home_workspace_id: workspaceId,
      timezone: "America/New_York",
      user_id: scopedUserId,
      username: scopedUsername,
      workspace_id: workspaceId,
    };
  }

  /** @param {import("../../../src/types/private-feed-contracts.js").PrivateFeedSubscriptionDescriptor} subscription @returns {Promise<string | null>} */
  function render(subscription) {
    return renderTasksPrivateCalendarFeed({
      session: freshSession(),
      subscription,
    });
  }

  /**
   * @param {{ clientId?: string | null, projectId?: string | null, roleId: string, scopeId: string | null, scopeType: string }} scope
   */
  async function replaceScopedRole({
    clientId = null,
    projectId = null,
    roleId,
    scopeId,
    scopeType,
  }) {
    await db.transaction(async (transaction) => {
      await transaction.run(`
DELETE FROM user_role_assignments
WHERE workspace_id = :workspaceId
  AND user_id = :userId;
`, {
        userId: scopedUserId,
        workspaceId,
      });
      const timestamp = new Date().toISOString();
      await transaction.run(`
INSERT INTO user_role_assignments (
  assignment_id, workspace_id, user_id, role_id, scope_type, scope_id,
  client_id, project_id, permission_overrides_json, created_at, updated_at
) VALUES (
  :assignmentId, :workspaceId, :userId, :roleId, :scopeType, :scopeId,
  :clientId, :projectId, NULL, :timestamp, :timestamp
);`, {
        assignmentId: randomUUID(),
        clientId,
        projectId,
        roleId,
        scopeId,
        scopeType,
        timestamp,
        userId: scopedUserId,
        workspaceId,
      });
    });
  }
} finally {
  await closeDatabase();
  await fixture.cleanup();
}

/** @param {string | null} content @param {readonly string[]} titles */
function assertFeedContains(content, titles) {
  assert.ok(content, "a feed asserted to contain titles must have rendered");
  assert.equal(typeof content, "string");
  for (const title of titles) {
    assert.equal(content.includes(`SUMMARY:${title}`), true, `expected ${title}`);
  }
}

/** @param {string | null} content @param {readonly string[]} titles */
function assertFeedOmits(content, titles) {
  assert.ok(content, "a feed asserted to omit titles must have rendered");
  assert.equal(typeof content, "string");
  for (const title of titles) {
    assert.equal(content.includes(title), false, `did not expect ${title}`);
  }
}

/**
 * Narrow the seeded protected super admin row into the session contract the
 * Tasks services publish, so the workspace identifier and timezone are proven
 * strings rather than open row values.
 * @param {Record<string, unknown>} row
 * @returns {import("../../../src/types/http-contracts.js").WorkspaceRequestSession}
 */
function ownerSessionFor(row) {
  return workspaceSessionFixture(row);
}
