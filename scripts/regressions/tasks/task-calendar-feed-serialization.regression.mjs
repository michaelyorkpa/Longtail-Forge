export const regressionMeta = Object.freeze({
  id: "tasks.task-calendar-feed-serialization",
  area: "tasks",
  tier: "focused",
  tags: ["calendar", "icalendar", "permissions", "recurrence", "tasks", "timezones"],
  description: "Proves bounded, subscription-scoped, permission-shaped Tasks iCalendar serialization for one-off, recurring, moved, hidden, and cancelled occurrences.",
  runMode: "isolated-database",
});

import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { workspaceSessionFixture } from "../../test-support/session-fixtures.mjs";
import { requireRow } from "../../test-support/database-row-assertions.mjs";

/** @typedef {import("../../../src/types/http-contracts.js").WorkspaceRequestSession} TasksSession */

const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "ltf-task-calendar-feed-serialization-"));
process.env.LONGTAIL_DATABASE_FILE = path.join(tempDir, "longtail-forge-task-calendar-feed-serialization.db");
process.env.SUPER_ADMIN_PASSWORD = "Task-Calendar-Feed-Serialization-123!";

const {
  TASK_CALENDAR_FEED_FUTURE_DAYS,
  TASK_CALENDAR_FEED_PAST_DAYS,
  calendarFeedWindow,
  serializeTasksCalendar,
} = await import("../../../src/modules/tasks/task-calendar-feed.service.js");
const { closeSqlite, initializeDatabase, querySql, runSql } = await import("../../../src/db/index.js");

const NOW = new Date("2026-07-24T16:00:00.000Z");
const SESSION = {
  timezone: "America/New_York",
  user_id: "calendar-feed-user-private",
  workspace_id: "calendar-feed-workspace-private",
};
const WINDOW = calendarFeedWindow(NOW, SESSION.timezone);
const HIDDEN_PROJECT_ID = "calendar-feed-hidden-project-private";
const RECURRING_TEMPLATE_ID = "calendar-feed-template-private";
const OPEN_ENDED_TEMPLATE_ID = "calendar-feed-open-ended-template-private";
const SUBSCRIPTION = {
  name: "Client delivery, east; priority\ncalendar",
};
const LONG_TITLE = "Quarterly review, decisions; follow-up\n"
  + "Résumé and launch readiness for a deliberately long UTF-8 calendar summary";

assert.equal(TASK_CALENDAR_FEED_PAST_DAYS, 90);
assert.equal(TASK_CALENDAR_FEED_FUTURE_DAYS, 365);
assert.deepEqual(WINDOW, {
  endDate: "2027-07-24",
  startDate: "2026-04-25",
});

/** @type {import("../../../src/types/task-recurrence-contracts.js").TaskRecurrenceTemplate[]} */
const templates = [
  {
    recurrence_template_id: RECURRING_TEMPLATE_ID,
    workspace_id: SESSION.workspace_id,
    client_id: "",
    project_id: "",
    title: "Weekly planning review",
    status: "open",
    priority: "normal",
    assignee_ids: [],
    recovery_checkpoint_date: "",
    recurrence_anchor_date: "2026-07-27",
    due_time: "09:00",
    due_timezone: "America/New_York",
    rrule: "FREQ=WEEKLY;INTERVAL=1",
    recurrence_end_date: "2026-09-07",
    template_status: "active",
    updated_at: "2026-07-20T14:00:00.000Z",
  },
  {
    recurrence_template_id: OPEN_ENDED_TEMPLATE_ID,
    workspace_id: SESSION.workspace_id,
    client_id: "",
    project_id: "",
    title: "Open-ended monthly review",
    status: "open",
    priority: "normal",
    assignee_ids: [],
    recovery_checkpoint_date: "",
    recurrence_anchor_date: "2026-05-15",
    due_time: "",
    due_timezone: "America/New_York",
    rrule: "FREQ=MONTHLY;INTERVAL=1",
    recurrence_end_date: "",
    template_status: "active",
    updated_at: "2026-07-20T14:00:00.000Z",
  },
];
const tasks = [
  taskFixture({
    task_id: "calendar-feed-all-day-private",
    title: LONG_TITLE,
    due_date: "2026-08-01",
  }),
  taskFixture({
    task_id: "calendar-feed-timed-private",
    title: "Timed client call",
    due_date: "2026-07-30",
    due_time: "14:30",
    due_timezone: "America/New_York",
    due_at_utc: "2026-07-30T18:30:00.000Z",
  }),
  taskFixture({
    task_id: "calendar-feed-outside-private",
    title: "Outside bounded horizon",
    due_date: "2027-07-25",
  }),
  taskFixture({
    task_id: "calendar-feed-unreadable-private",
    title: "Unreadable task title",
    due_date: "2026-08-02",
    project_id: HIDDEN_PROJECT_ID,
  }),
  taskFixture({
    task_id: "calendar-feed-initial-instance-private",
    title: "Weekly planning review",
    due_date: "2026-07-27",
    due_time: "09:00",
    due_timezone: "America/New_York",
    due_at_utc: "2026-07-27T13:00:00.000Z",
    recurrence_template_id: RECURRING_TEMPLATE_ID,
    recurrence_instance_date: "2026-07-27",
  }),
  taskFixture({
    task_id: "calendar-feed-override-private",
    title: "Planning review, moved",
    due_date: "2026-08-04",
    due_time: "10:30",
    due_timezone: "America/New_York",
    due_at_utc: "2026-08-04T14:30:00.000Z",
    priority: "high",
    recurrence_template_id: RECURRING_TEMPLATE_ID,
    recurrence_instance_date: "2026-08-03",
  }),
  taskFixture({
    task_id: "calendar-feed-hidden-override-private",
    title: "Hidden occurrence override",
    due_date: "2026-08-10",
    due_time: "09:00",
    due_timezone: "America/New_York",
    due_at_utc: "2026-08-10T13:00:00.000Z",
    project_id: HIDDEN_PROJECT_ID,
    recurrence_template_id: RECURRING_TEMPLATE_ID,
    recurrence_instance_date: "2026-08-10",
  }),
  taskFixture({
    task_id: "calendar-feed-archived-override-private",
    title: "Archived occurrence override",
    due_date: "2026-08-17",
    due_time: "09:00",
    due_timezone: "America/New_York",
    due_at_utc: "2026-08-17T13:00:00.000Z",
    status: "archived",
    recurrence_template_id: RECURRING_TEMPLATE_ID,
    recurrence_instance_date: "2026-08-17",
  }),
];

const calendar = serializeTasksCalendar({
  canReadTask: (resource) => resource.project_id !== HIDDEN_PROJECT_ID,
  now: NOW,
  session: SESSION,
  subscription: SUBSCRIPTION,
  suppressedInstances: [{
    recurrence_instance_date: "2026-08-24",
    recurrence_template_id: RECURRING_TEMPLATE_ID,
  }],
  tasks,
  templates,
  window: WINDOW,
});
const repeatedCalendar = serializeTasksCalendar({
  canReadTask: (resource) => resource.project_id !== HIDDEN_PROJECT_ID,
  now: NOW,
  session: SESSION,
  subscription: SUBSCRIPTION,
  suppressedInstances: [{
    recurrence_instance_date: "2026-08-24",
    recurrence_template_id: RECURRING_TEMPLATE_ID,
  }],
  tasks,
  templates,
  window: WINDOW,
});

assert.equal(calendar, repeatedCalendar, "fixed inputs must produce byte-stable feed content");
assert.match(calendar, /^BEGIN:VCALENDAR\r\nVERSION:2\.0\r\n/);
assert.match(calendar, /\r\nEND:VCALENDAR\r\n$/);
assert.equal(calendar.replaceAll("\r\n", "").includes("\n"), false, "content must use CRLF exclusively");
assert.ok(
  calendar.split("\r\n").every((line) => Buffer.byteLength(line, "utf8") <= 75),
  "every physical content line must respect the RFC 5545 75-octet folding limit",
);

const lines = unfoldLines(calendar);
assertBalancedComponents(lines);
assert.ok(lines.includes("CALSCALE:GREGORIAN"));
assert.ok(lines.includes("METHOD:PUBLISH"));
assert.ok(lines.includes("NAME:Client delivery\\, east\\; priority\\ncalendar"));
assert.ok(lines.includes("X-WR-CALNAME:Client delivery\\, east\\; priority\\ncalendar"));
assert.ok(lines.includes("X-WR-TIMEZONE:America/New_York"));
assert.ok(lines.includes("X-LONGTAIL-FORGE-WINDOW-START:20260425"));
assert.ok(lines.includes("X-LONGTAIL-FORGE-WINDOW-END:20270724"));
assert.ok(lines.includes("BEGIN:VTIMEZONE"));
assert.ok(lines.includes("TZID:America/New_York"));
assert.ok(lines.includes("BEGIN:DAYLIGHT"));
assert.ok(lines.includes("BEGIN:STANDARD"));
assert.ok(lines.includes("DTSTART:20260308T020000"), "daylight onset must use the pre-transition local wall time");
assert.ok(lines.includes("DTSTART:20261101T020000"), "standard onset must use the pre-transition local wall time");

const emptyCalendarLines = unfoldLines(serializeTasksCalendar({
  now: NOW,
  session: SESSION,
  subscription: SUBSCRIPTION,
  window: WINDOW,
}));
assert.ok(emptyCalendarLines.includes("NAME:Client delivery\\, east\\; priority\\ncalendar"));
assert.ok(emptyCalendarLines.includes("X-WR-TIMEZONE:America/New_York"));
assert.ok(emptyCalendarLines.includes("BEGIN:VTIMEZONE"), "an empty feed should still define its owner timezone");
assert.ok(emptyCalendarLines.includes("TZID:America/New_York"));

const events = readComponents(lines, "VEVENT");
assert.equal(events.length, 8, "the feed should contain two one-offs, two series, one override, and three cancellations");
for (const event of events) {
  assert.ok(event.some((line) => line.startsWith("UID:")), "every VEVENT needs a stable UID");
  assert.ok(event.some((line) => line.startsWith("DTSTAMP:")), "every VEVENT needs DTSTAMP");
  assert.ok(event.some((line) => line.startsWith("DTSTART")), "every VEVENT needs DTSTART");
}

const allDay = findEvent(events, "SUMMARY:Quarterly review\\, decisions\\; follow-up\\n"
  + "Résumé and launch readiness for a deliberately long UTF-8 calendar summary");
assert.ok(allDay.includes("DTSTART;VALUE=DATE:20260801"));
assert.ok(allDay.includes("DTEND;VALUE=DATE:20260802"), "all-day DTEND must be the exclusive next date");

const timed = findEvent(events, "SUMMARY:Timed client call");
assert.ok(timed.includes("DTSTART:20260730T183000Z"), "one-off timed Tasks must use canonical due_at_utc");
assert.equal(
  timed.some((line) => line.startsWith("DTEND")),
  false,
  "instantaneous timed Tasks must not invent a duration",
);

const series = findEvent(events, "SUMMARY:Weekly planning review");
assert.ok(series.includes("DTSTART;TZID=America/New_York:20260727T090000"));
assert.ok(
  series.includes("RRULE:FREQ=WEEKLY;INTERVAL=1;UNTIL=20260907T130000Z"),
  "timed recurrence UNTIL must honor the template end date in UTC",
);
const seriesUid = readProperty(series, "UID");

const openEndedSeries = findEvent(events, "SUMMARY:Open-ended monthly review");
assert.ok(openEndedSeries.includes("DTSTART;VALUE=DATE:20260515"));
assert.ok(
  openEndedSeries.includes("RRULE:FREQ=MONTHLY;INTERVAL=1;UNTIL=20270715"),
  "an open-ended recurrence must stop at its final occurrence inside the rolling future horizon",
);

const override = findEvent(events, "SUMMARY:Planning review\\, moved");
assert.equal(readProperty(override, "UID"), seriesUid, "an override must keep the recurring series UID");
assert.ok(override.includes("RECURRENCE-ID;TZID=America/New_York:20260803T090000"));
assert.ok(override.includes("DTSTART:20260804T143000Z"), "the override must use its canonical moved due time");

const cancellations = events.filter((event) => event.includes("STATUS:CANCELLED"));
assert.deepEqual(
  cancellations.map((event) => event.find((line) => line.startsWith("RECURRENCE-ID"))).sort(),
  [
    "RECURRENCE-ID;TZID=America/New_York:20260810T090000",
    "RECURRENCE-ID;TZID=America/New_York:20260817T090000",
    "RECURRENCE-ID;TZID=America/New_York:20260824T090000",
  ],
  "unreadable, archived, and out-of-scope real instances must suppress native RRULE occurrences without leaking titles",
);
assert.ok(cancellations.every((event) => readProperty(event, "UID") === seriesUid));

for (const forbiddenText of [
  "Outside bounded horizon",
  "Unreadable task title",
  "Hidden occurrence override",
  "Archived occurrence override",
  SESSION.user_id,
  SESSION.workspace_id,
  ...tasks.map((task) => task.task_id),
  RECURRING_TEMPLATE_ID,
  OPEN_ENDED_TEMPLATE_ID,
]) {
  assert.equal(calendar.includes(forbiddenText), false, `feed content must not expose ${forbiddenText}`);
}
assert.equal(
  new Set(events.map((event) => [
    readProperty(event, "UID"),
    readProperty(event, "RECURRENCE-ID"),
  ].join("|"))).size,
  events.length,
  "UID plus RECURRENCE-ID identities must be unique",
);

await assertRepositoryAndPermissionIntegration();
console.log("Task calendar feed serialization regression passed.");
await closeSqlite();
await fs.rm(tempDir, { force: true, recursive: true });

/** @param {Record<string, unknown>} overrides */
function taskFixture(overrides) {
  return {
    task_id: "",
    workspace_id: SESSION.workspace_id,
    client_id: "",
    project_id: "",
    title: "",
    status: "open",
    priority: "normal",
    due_date: "",
    due_time: "",
    due_timezone: "America/New_York",
    due_at_utc: "",
    recurrence_template_id: "",
    recurrence_instance_date: "",
    updated_at: "2026-07-21T15:00:00.000Z",
    ...overrides,
  };
}

/** @param {string} value @returns {string[]} */
function unfoldLines(value) {
  const unfolded = [];
  for (const line of value.split("\r\n")) {
    if (/^[ \t]/.test(line)) {
      unfolded[unfolded.length - 1] += line.slice(1);
    } else if (line) {
      unfolded.push(line);
    }
  }
  return unfolded;
}

/** @param {readonly string[]} lines */
function assertBalancedComponents(lines) {
  /** @type {string[]} */
  const stack = [];
  for (const line of lines) {
    if (line.startsWith("BEGIN:")) {
      stack.push(line.slice("BEGIN:".length));
    } else if (line.startsWith("END:")) {
      assert.equal(line.slice("END:".length), stack.pop(), `component nesting failed at ${line}`);
    }
  }
  assert.deepEqual(stack, [], "all iCalendar components must close");
}

/** @param {readonly string[]} lines @param {string} componentName @returns {string[][]} */
function readComponents(lines, componentName) {
  /** @type {string[][]} */
  const components = [];
  /** @type {string[] | null} */
  let current = null;
  for (const line of lines) {
    if (line === `BEGIN:${componentName}`) {
      current = [];
    }
    if (current) {
      current.push(line);
    }
    if (line === `END:${componentName}`) {
      components.push(/** @type {string[]} */ (current));
      current = null;
    }
  }
  assert.equal(current, null, `unterminated ${componentName} component`);
  return components;
}

/** @param {readonly string[][]} events @param {string} summaryLine @returns {string[]} */
function findEvent(events, summaryLine) {
  const event = events.find((candidate) => candidate.includes(summaryLine));
  assert.ok(event, `expected event ${summaryLine}`);
  return event;
}

/** @param {readonly string[]} event @param {string} propertyName @returns {string} */
function readProperty(event, propertyName) {
  const line = event.find((candidate) => (
    candidate.startsWith(`${propertyName}:`)
    || candidate.startsWith(`${propertyName};`)
  ));
  return line?.slice(line.indexOf(":") + 1) || "";
}

async function assertRepositoryAndPermissionIntegration() {
  await initializeDatabase();
  const { createPrivateFeedSubscriptionDescriptor } = await import(
    "../../../src/core/private-feeds/private-feed-providers.js"
  );
  const { renderTasksPrivateCalendarFeed } = await import(
    "../../../src/modules/tasks/private-calendar-feed.provider.js"
  );
  const { tasksService } = await import("../../../src/modules/tasks/tasks.service.js");
  const protectedUsers = await querySql(`
SELECT user_id, username, timezone, home_workspace_id, active_workspace_id
FROM users
WHERE protected_user = 'yes'
LIMIT 1;
`);
  const owner = protectedUsers[0];
  const workspaceId = owner.active_workspace_id || owner.home_workspace_id;
  const now = new Date().toISOString();
  const visibleProjectId = `calendar-feed-visible-${randomUUID()}`;
  const hiddenProjectId = `calendar-feed-hidden-${randomUUID()}`;
  const scopedUserId = `calendar-feed-scoped-${randomUUID()}`;
  const scopedUsername = `${scopedUserId}@example.test`;

  await runSql(`
INSERT INTO projects (
  id, workspace_id, client_id, name, status, billable, billing_rate,
  billing_period_type, billing_period_start_day, billing_rounding_enabled,
  billing_rounding_increment, created_at, updated_at
)
VALUES
  (${sqlText(visibleProjectId)}, ${sqlText(workspaceId)}, NULL, 'Visible feed project', 'Active', 'yes', NULL, NULL, NULL, NULL, NULL, ${sqlText(now)}, ${sqlText(now)}),
  (${sqlText(hiddenProjectId)}, ${sqlText(workspaceId)}, NULL, 'Hidden feed project', 'Active', 'yes', NULL, NULL, NULL, NULL, NULL, ${sqlText(now)}, ${sqlText(now)});

INSERT INTO users (
  user_id, home_workspace_id, username, display_name, alt_email, timezone,
  password, theme_mode, user_status, protected_user, active_workspace_id
)
VALUES (
  ${sqlText(scopedUserId)}, ${sqlText(workspaceId)}, ${sqlText(scopedUsername)}, 'Scoped feed user', NULL,
  'America/New_York', 'fixture-password', 'light', 'active', 'no', ${sqlText(workspaceId)}
);

INSERT INTO user_workspaces (
  user_workspace_id, user_id, workspace_id, status, created_at, updated_at
)
VALUES (
  ${sqlText(randomUUID())}, ${sqlText(scopedUserId)}, ${sqlText(workspaceId)}, 'active', ${sqlText(now)}, ${sqlText(now)}
);

INSERT INTO user_role_assignments (
  assignment_id, workspace_id, user_id, role_id, scope_type, scope_id,
  client_id, project_id, permission_overrides_json, created_at, updated_at
)
VALUES (
  ${sqlText(randomUUID())}, ${sqlText(workspaceId)}, ${sqlText(scopedUserId)}, 'project_user', 'project', ${sqlText(visibleProjectId)},
  NULL, ${sqlText(visibleProjectId)}, NULL, ${sqlText(now)}, ${sqlText(now)}
);
`);

  const ownerSession = workspaceSessionFixture(requireRow(owner, "fresh database should seed a protected super admin"));
  await tasksService.create({
    due_date: "2026-08-08",
    project_id: visibleProjectId,
    title: "Scoped readable feed task",
  }, ownerSession);
  await tasksService.create({
    due_date: "2026-08-08",
    project_id: hiddenProjectId,
    title: "Scoped unreadable feed task",
  }, ownerSession);

  const scopedContent = await renderTasksPrivateCalendarFeed({
    session: {
      active_workspace_id: workspaceId,
      home_workspace_id: workspaceId,
      timezone: "America/New_York",
      user_id: scopedUserId,
      username: scopedUsername,
      workspace_id: workspaceId,
    },
    subscription: createPrivateFeedSubscriptionDescriptor({
      name: "Scoped project calendar",
      ownerUserId: scopedUserId,
      scope: {
        projectId: visibleProjectId,
        type: "project",
      },
      subscriptionId: randomUUID(),
      workspaceId,
    }),
  });
  assert.ok(scopedContent, "scoped private calendar feed should render content");
  assert.match(scopedContent, /X-WR-CALNAME:Scoped project calendar/);
  assert.match(scopedContent, /SUMMARY:Scoped readable feed task/);
  assert.doesNotMatch(scopedContent, /Scoped unreadable feed task/);
  assert.equal(scopedContent.includes(scopedUserId), false);
  assert.equal(scopedContent.includes(visibleProjectId), false);

  const integrity = await querySql("PRAGMA integrity_check;");
  assert.equal(integrity[0]?.integrity_check, "ok");
}

/** @param {unknown} value @returns {string} */
function sqlText(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}
