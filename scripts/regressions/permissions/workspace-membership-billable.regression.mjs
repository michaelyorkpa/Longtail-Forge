export const regressionMeta = Object.freeze({
  id: "permissions.workspace-membership-billable",
  area: "permissions",
  tier: "integration",
  tags: ["database", "time-tracking", "users", "workspaces"],
  description: "Proves inactive workspace members stay out of people surfaces and Personal/Family work cannot use the Billable flag.",
  runMode: "isolated-database",
});

import assert from "node:assert/strict";

import { randomUUID } from "node:crypto";
import { createDisposableDatabaseFixture } from "../../test-support/disposable-database.mjs";
import { createProjectTextReader } from "../../test-support/source-scan.mjs";
const { readText } = createProjectTextReader();

const fixture = await createDisposableDatabaseFixture("workspace-membership-billable");
const { closeSqlite, initializeDatabase, querySql, runSql, sqlText } = await import("../../../src/db/index.js");
const { usersRepository } = await import("../../../src/repositories/users.repo.js");
const { usersService } = await import("../../../src/services/users.service.js");
const { clientsService } = await import("../../../src/modules/client-projects/clients.service.js");
const { tasksService } = await import("../../../src/modules/tasks/tasks.service.js");
const { activeTimersService } = await import("../../../src/modules/time-tracking/active-timers.service.js");
const { timeEntriesService } = await import("../../../src/modules/time-tracking/time-entries.service.js");
const { timeTrackingPublicApiService } = await import("../../../src/modules/time-tracking/public-api.service.js");

try {
  await assertStaticContracts();
  await initializeDatabase();
  const session = await readProtectedSession();

  await assertInactiveMembersAreAbsent(session);
  await assertPersonalFamilyBillableBoundary(session);
  await assertIntegrity();

  console.log("Workspace membership and Billable cleanup regression passed.");
} finally {
  await closeSqlite();
  await fixture.cleanup();
}

async function assertStaticContracts() {
  const usersRepoSource = await readText("src/repositories/users.repo.js");
  const timeEntriesSource = await readText("public/js/time-entries.js");
  const stopwatchSource = await readText("public/js/stop-watch.js");
  const timerDialogSource = await readText("public/js/time-tracking-timer-dialog.js");
  const entryDialogSource = await readText("public/js/time-entry-dialog.js");
  const projectsSource = await readText("public/js/clients-projects.js");
  const timeTrackerView = await readText("views/protected/time-tracker.html");
  const userSettingsView = await readText("views/protected/user-settings.html");
  const settingsHostSource = await readText("public/js/shared/settings-host.js");
  const userSettingsSource = await readText("public/js/user-settings.js");

  assert.match(usersRepoSource, /user_workspaces\.workspace_id = :workspaceId[\s\S]*user_workspaces\.status = 'active'[\s\S]*user_rows\.user_status = 'active'/, "workspace people reads should require active membership and active user state");
  assert.doesNotMatch(timeEntriesSource, /timeEntries\.forEach\(\(entry\)[\s\S]*usersById\.set\(entry\.userId, entry\.userId\)/, "historical entries must not reintroduce inactive user IDs into the user filter");
  assert.match(timeTrackerView, /data-stopwatch-billable-control[\s\S]*data-stopwatch-billable/, "the Time Tracker Billable control should have a workspace-aware wrapper");
  assert.match(stopwatchSource, /function workspaceUsesBillableFlag\(\)[\s\S]*workspaceType === "business"[\s\S]*function billableValue\(input\)[\s\S]*\? "yes" : "no"/, "manual timers should hide and coerce Billable outside Business workspaces");
  assert.match(timerDialogSource, /billableControl\.hidden = !workspaceUsesBillableFlag\(\)[\s\S]*billable: workspaceBillableValue\(\)/, "Create Timer should hide and coerce its Billable field");
  assert.match(entryDialogSource, /billableControl\.hidden = !workspaceUsesBillableFlag\(\)[\s\S]*billable: workspaceBillableValue\(\)/, "Time Entry should hide and coerce its Billable field");
  assert.match(projectsSource, /withoutUnsupportedBillingFields[\s\S]*field !== "billingDisplay"[\s\S]*"project-billable"/, "project read surfaces should omit billing metadata outside Business workspaces");
  assert.match(userSettingsView, /data-settings-host="user"/, "User Settings should expose the minimal framework host");
  assert.match(settingsHostSource, /action\("Leave Workspace", "openWorkspaceRemoval"\)/, "User Settings should expose membership removal");
  assert.match(settingsHostSource, /title: "Leave a Workspace"/, "User Settings should title membership removal explicitly");
  assert.match(settingsHostSource, /Leaving a workspace removes only your membership\. The workspace and its data are not deleted\. A Workspace Administrator or Super Admin must restore your access/, "User Settings should describe membership removal and administrator-restored access instead of workspace deletion");
  assert.equal(settingsHostSource.match(/text: LEAVE_WORKSPACE_WARNING/g)?.length, 2, "the Leave Workspace section and confirmation should share the governing warning");
  assert.match(userSettingsSource, /Leaving \$\{workspace\.workspaceName[\s\S]*Workspace membership removed\.[\s\S]*Workspace membership was not removed\./, "membership-removal status copy should stay explicit");
}

async function assertInactiveMembersAreAbsent(session) {
  const activeUserId = await createWorkspaceUser(session.workspace_id, "Active Member", {
    membershipStatus: "active",
    userStatus: "active",
  });
  const inactiveMembershipUserId = await createWorkspaceUser(session.workspace_id, "Inactive Membership", {
    membershipStatus: "inactive",
    userStatus: "active",
  });
  const inactiveUserId = await createWorkspaceUser(session.workspace_id, "Inactive User", {
    membershipStatus: "active",
    userStatus: "inactive",
  });

  const repositoryUsers = await usersRepository.readAll(session.workspace_id);
  const repositoryUserIds = new Set(repositoryUsers.map((user) => user.user_id));
  assert.equal(repositoryUserIds.has(activeUserId), true);
  assert.equal(repositoryUserIds.has(inactiveMembershipUserId), false);
  assert.equal(repositoryUserIds.has(inactiveUserId), false);

  const workspaceUsers = await usersService.list(session);
  const workspaceUserIds = new Set(workspaceUsers.users.map((user) => user.user_id));
  assert.equal(workspaceUserIds.has(activeUserId), true, "active users should remain visible in workspace administration");
  assert.equal(workspaceUserIds.has(inactiveMembershipUserId), false, "inactive memberships should be absent from workspace administration");
  assert.equal(workspaceUserIds.has(inactiveUserId), false, "inactive users should be absent from workspace administration");

  const taskOptions = (await tasksService.list(session)).options.users;
  const assignableUserIds = new Set(taskOptions.map((user) => user.user_id));
  assert.equal(assignableUserIds.has(activeUserId), true, "active members should remain assignable");
  assert.equal(assignableUserIds.has(inactiveMembershipUserId), false, "inactive memberships must not be assignable");
  assert.equal(assignableUserIds.has(inactiveUserId), false, "inactive users must not be assignable");
}

async function assertPersonalFamilyBillableBoundary(session) {
  for (const workspaceType of ["personal", "family"]) {
    await setWorkspaceType(session.workspace_id, workspaceType);
    // Production authentication creates a fresh request-session object for
    // each request. Use a fresh object after this direct fixture mutation so
    // request-scoped settings memos cannot retain the preceding workspace type.
    const workspaceSession = { ...session };
    const projectName = `${workspaceType} Billable Boundary`;
    const { project } = await clientsService.createProject("", { name: projectName }, workspaceSession);

    await runSql(`UPDATE projects SET billable = 'yes' WHERE workspace_id = ${sqlText(session.workspace_id)} AND id = ${sqlText(project.id)};`);

    const task = (await tasksService.create({
      billable: "yes",
      project_id: project.id,
      title: `${workspaceType} task`,
    }, workspaceSession)).task;
    assert.equal(task.billable, "no", `${workspaceType} tasks should reject Billable yes`);

    const timer = (await activeTimersService.save("1", {
      accumulated_elapsed_seconds: 15,
      billable: "yes",
      description: `${workspaceType} timer`,
      last_active_start_time: new Date(Date.now() - 15_000).toISOString(),
      project_id: project.id,
      timer_status: "paused",
    }, workspaceSession)).timer;
    assert.equal(timer.billable, "no", `${workspaceType} timers should reject Billable yes`);

    const now = Date.now();
    const created = await timeEntriesService.create({
      billable: "yes",
      description: `${workspaceType} entry`,
      duration_seconds: 600,
      duration_hours: "0.1667",
      end_time: new Date(now).toISOString(),
      project_id: project.id,
      start_time: new Date(now - 600_000).toISOString(),
    }, workspaceSession);
    assert.equal(created.entry.billable, "no", `${workspaceType} time-entry writes should reject Billable yes`);

    const stored = await querySql(`SELECT billable FROM time_entries WHERE workspace_id = ${sqlText(session.workspace_id)} AND entry_id = ${sqlText(created.entry_id)} LIMIT 1;`);
    assert.equal(stored[0]?.billable, "no", `${workspaceType} writes should persist non-billable state`);

    await runSql(`UPDATE time_entries SET billable = 'yes' WHERE workspace_id = ${sqlText(session.workspace_id)} AND entry_id = ${sqlText(created.entry_id)};`);
    const browserRead = await timeEntriesService.list(workspaceSession);
    const browserEntry = browserRead.entries.find((entry) => entry.entry_id === created.entry_id);
    assert.equal(browserEntry?.billable, "no", `${workspaceType} browser reads should not use a legacy Billable yes value`);

    const publicRead = await timeTrackingPublicApiService.listTimeEntries(workspaceSession, { limit: 100 });
    const publicEntry = publicRead.data.find((entry) => entry.entry_id === created.entry_id);
    assert.equal(publicEntry?.billable, "no", `${workspaceType} public API reads should not expose a legacy Billable yes value`);

    const timers = await activeTimersService.list(workspaceSession);
    assert.equal(timers.timers.find((entry) => entry.active_timer_id === timer.active_timer_id)?.billable, "no", `${workspaceType} timer reads should remain non-billable`);
    await activeTimersService.remove("1", workspaceSession);
  }
}

async function createWorkspaceUser(workspaceId, label, { membershipStatus, userStatus }) {
  const userId = randomUUID();
  const now = new Date().toISOString();
  const username = `${label.toLowerCase().replace(/\s+/g, "-")}-${userId}@example.test`;

  await runSql(`
INSERT INTO users (
  user_id, home_workspace_id, username, display_name, password,
  user_status, protected_user, active_workspace_id
)
VALUES (
  ${sqlText(userId)}, ${sqlText(workspaceId)}, ${sqlText(username)}, ${sqlText(label)},
  'unused', ${sqlText(userStatus)}, 'no', ${sqlText(workspaceId)}
);
`);
  await runSql(`
INSERT INTO user_workspaces (
  user_workspace_id, user_id, workspace_id, status, created_at, updated_at
)
VALUES (
  ${sqlText(randomUUID())}, ${sqlText(userId)}, ${sqlText(workspaceId)},
  ${sqlText(membershipStatus)}, ${sqlText(now)}, ${sqlText(now)}
);
`);

  return userId;
}

async function setWorkspaceType(workspaceId, workspaceType) {
  await runSql(`UPDATE workspaces SET workspace_type = ${sqlText(workspaceType)} WHERE workspace_id = ${sqlText(workspaceId)};`);
}

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

  return {
    active_workspace_id: user.active_workspace_id || user.home_workspace_id,
    display_name: user.display_name || user.username,
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
