import assert from "node:assert/strict";
import { internalEventBus } from "../src/core/events/event-bus.js";
import { validateModuleManifest } from "../src/core/modules/manifest-contract.js";
import { modulesService } from "../src/core/modules/modules.service.js";

let checks = 0;

function check(name, assertion) {
  assertion();
  checks += 1;
}

internalEventBus.reset();

const receivedEvents = [];
internalEventBus.on("task.created", async (event) => {
  receivedEvents.push(event);
}, {
  id: "test:task-created",
  moduleId: "test-module",
});

const firstEmit = await internalEventBus.emit("task.created", {
  workspaceId: "workspace-1",
  moduleId: "tasks",
  recordType: "task",
  recordId: "task-1",
  previousValue: null,
  newValue: { task_id: "task-1", title: "Regression task" },
  source: "manual",
  metadata: { priority: "normal" },
  session: {
    workspace_id: "workspace-1",
    user_id: "user-1",
  },
});

check("event bus delivers async listeners", () => {
  assert.equal(receivedEvents.length, 1);
  assert.equal(firstEmit.results.length, 1);
  assert.equal(firstEmit.results[0].status, "ok");
});

check("event bus normalizes payload conventions", () => {
  assert.equal(receivedEvents[0].name, "task.created");
  assert.equal(receivedEvents[0].workspace_id, "workspace-1");
  assert.equal(receivedEvents[0].actor_user_id, "user-1");
  assert.equal(receivedEvents[0].module_id, "tasks");
  assert.equal(receivedEvents[0].record_type, "task");
  assert.equal(receivedEvents[0].record_id, "task-1");
  assert.equal(receivedEvents[0].source, "manual");
  assert.deepEqual(receivedEvents[0].metadata, { priority: "normal" });
});

internalEventBus.on("task.created", async () => {
  throw new Error("expected hook failure");
}, {
  id: "test:failing-hook",
  moduleId: "test-module",
});

const failingEmit = await internalEventBus.emit("task.created", {
  workspaceId: "workspace-1",
  moduleId: "tasks",
  recordType: "task",
  recordId: "task-2",
  newValue: { task_id: "task-2" },
});

check("event hook failures are reported without throwing", () => {
  assert.equal(failingEmit.results.length, 2);
  assert.equal(failingEmit.results.find((result) => result.hookId === "test:failing-hook")?.status, "failed");
});

const manifestErrors = validateModuleManifest({
  id: "example-events",
  name: "Example Events",
  displayName: "Example Events",
  description: "Example event hook manifest.",
  category: "test",
  version: "0.31.17",
  enabledByDefault: true,
  hooks: {
    events: [{
      id: "example-task-created",
      event: "task.created",
      handler: async () => {},
    }],
  },
  eventTypes: [{
    event: "example.created",
    moduleId: "example-events",
    label: "Example Created",
    description: "Emitted when an example record is created.",
    recordType: "example",
  }],
});

check("manifest accepts event hook and event type descriptors", () => {
  assert.deepEqual(manifestErrors, []);
});

const taskEventTypes = modulesService.listModuleEventTypes()
  .filter((eventType) => eventType.moduleId === "tasks")
  .map((eventType) => eventType.event)
  .sort();

check("registry exposes Tasks event types", () => {
  assert.deepEqual(taskEventTypes, [
    "task.archived",
    "task.assigned",
    "task.checklist_item.checked",
    "task.checklist_item.created",
    "task.checklist_item.deleted",
    "task.checklist_item.unchecked",
    "task.checklist_item.updated",
    "task.checklist_items.reordered",
    "task.completed",
    "task.created",
    "task.due_soon",
    "task.overdue",
    "task.relationship.created",
    "task.relationship.removed",
    "task.relationship.updated",
    "task.restored",
    "task.updated",
  ]);
});

internalEventBus.reset();
console.log(`Event bus regression passed ${checks} checks.`);
