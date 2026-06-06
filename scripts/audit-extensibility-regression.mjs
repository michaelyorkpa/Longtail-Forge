import assert from "node:assert/strict";
import { summarizeActivityEvent, summarizeNotificationEvent } from "../src/core/events/event-summaries.js";
import { modulesService } from "../src/core/modules/modules.service.js";
import { auditService } from "../src/services/audit.service.js";

let checks = 0;

function check(name, assertion) {
  assertion();
  checks += 1;
}

const recordTypes = auditService.listAuditRecordTypes().map((recordType) => recordType.recordType).sort();

check("audit service exposes module-declared record types", () => {
  assert.ok(recordTypes.includes("task"));
  assert.ok(recordTypes.includes("task_recurrence_template"));
  assert.ok(recordTypes.includes("time_entry"));
  assert.ok(recordTypes.includes("client"));
  assert.ok(recordTypes.includes("project"));
});

check("audit service keeps common change types framework-owned", () => {
  assert.deepEqual(auditService.listAuditChangeTypes(), [
    "archive",
    "create",
    "delete",
    "login",
    "logout",
    "restore",
    "settings_change",
    "update",
  ]);
});

await assert.rejects(
  () => auditService.record({
    workspaceId: "workspace-1",
    action: "invalid_record_type_test",
    changeType: "create",
    recordType: "mystery_record",
  }),
  /Unknown audit record type/,
);
checks += 1;

await assert.rejects(
  () => auditService.record({
    workspaceId: "workspace-1",
    action: "invalid_change_type_test",
    changeType: "custom_change",
    recordType: "task",
  }),
  /Unknown audit change type/,
);
checks += 1;

const taskSummaryCount = modulesService.listModuleEventSummaries()
  .filter((summary) => summary.moduleId === "tasks")
  .length;

check("registry exposes Tasks event summaries", () => {
  assert.equal(taskSummaryCount, 8);
});

const taskEvent = {
  name: "task.created",
  workspace_id: "workspace-1",
  actor_user_id: "user-1",
  module_id: "tasks",
  record_type: "task",
  record_id: "task-1",
  previous_value: null,
  new_value: {
    task_id: "task-1",
    title: "Safe summary task",
  },
  source: "manual",
  metadata: {},
};
const activitySummary = summarizeActivityEvent(taskEvent);
const notificationSummary = summarizeNotificationEvent(taskEvent);

check("activity summaries are dashboard-safe", () => {
  assert.equal(activitySummary.label, "Task Created");
  assert.equal(activitySummary.summary, "Created task \"Safe summary task\".");
  assert.equal(activitySummary.url, "tasks.html?task=task-1");
});

check("notification summaries expose recipient hints without raw event JSON", () => {
  assert.equal(notificationSummary.title, "Task Created");
  assert.equal(notificationSummary.body, "Task \"Safe summary task\" was created.");
  assert.equal(notificationSummary.url, "tasks.html?task=task-1");
  assert.deepEqual(notificationSummary.recipientHints, ["assignees"]);
});

console.log(`Audit extensibility regression passed ${checks} checks.`);
