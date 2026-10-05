import { describe, expect, it } from "vitest";
import {
  CreateTaskSchema,
  TaskChecklistItemCreateSchema,
  TaskChecklistItemUpdateSchema,
  TaskChecklistReorderSchema,
  TaskChildRelationshipSchema,
  TaskRecurrenceSchema,
  UpdateTaskSchema,
  parseTasksEdgePayload,
} from "../../src/modules/tasks/tasks.contracts.js";
import { AppError } from "../../src/utils/app-error.js";

const validCreatePayload = {
  title: "Write the report",
  status: "active",
  priority: "high",
  client_id: "client-1",
  project_id: "project-1",
  due_date: "2026-07-15",
  due_time: "14:00",
  next_action: "Draft the outline",
  blocked_reason: "",
  resume_note: "",
  description: "Quarterly report",
  assignee_ids: ["user-1", "user-2"],
  recurrence: { enabled: true, applyTo: "future", frequency: "weekly", interval: 1, endDate: "" },
  reminderOverrideEnabled: false,
  reminderPolicy: { offsets: [60] },
  tagIds: ["tag-1"],
};

describe("CreateTaskSchema / UpdateTaskSchema", () => {
  it("accepts the full browser create payload unchanged", () => {
    const parsed = parseTasksEdgePayload(CreateTaskSchema, validCreatePayload);
    expect(parsed.title).toBe("Write the report");
    expect(parsed.status).toBe("active");
    expect(parsed.priority).toBe("high");
    expect(parsed.assignee_ids).toEqual(["user-1", "user-2"]);
    expect(parsed.recurrence?.applyTo).toBe("future");
    expect(parsed.tagIds).toEqual(["tag-1"]);
  });

  it("accepts a client-generated task id on create", () => {
    const parsed = parseTasksEdgePayload(CreateTaskSchema, { ...validCreatePayload, task_id: "client-uuid" });
    expect(parsed.task_id).toBe("client-uuid");
  });

  it("rejects wrong-typed title/status/priority instead of coercing", () => {
    expect(() => parseTasksEdgePayload(CreateTaskSchema, { ...validCreatePayload, title: 42 }))
      .toThrow("Title must be text.");
    expect(() => parseTasksEdgePayload(CreateTaskSchema, { ...validCreatePayload, status: { nested: true } }))
      .toThrow("Status must be text.");
    expect(() => parseTasksEdgePayload(CreateTaskSchema, { ...validCreatePayload, priority: [] }))
      .toThrow("Priority must be text.");
  });

  it("leaves title required-ness to the service (empty title passes the schema)", () => {
    const parsed = parseTasksEdgePayload(CreateTaskSchema, { ...validCreatePayload, title: "  " });
    expect(parsed.title).toBe("");
  });

  it("strips unknown and server-managed audit fields instead of rejecting round-trip callers", () => {
    const parsed = parseTasksEdgePayload(UpdateTaskSchema, {
      ...validCreatePayload,
      workspace_id: "attacker-workspace",
      created_by_user_id: "attacker",
      completed_at: "2020-01-01T00:00:00.000Z",
      created_at: "2020-01-01T00:00:00.000Z",
      unknown_junk: true,
    });
    expect(parsed).not.toHaveProperty("workspace_id");
    expect(parsed).not.toHaveProperty("created_by_user_id");
    expect(parsed).not.toHaveProperty("completed_at");
    expect(parsed).not.toHaveProperty("created_at");
    expect(parsed).not.toHaveProperty("unknown_junk");
  });

  it("accepts assignees as ids or user objects and rejects junk shapes", () => {
    expect(parseTasksEdgePayload(CreateTaskSchema, { assignees: ["user-1", { user_id: "user-2" }] }).assignees)
      .toHaveLength(2);
    expect(() => parseTasksEdgePayload(CreateTaskSchema, { assignees: "user-1" }))
      .toThrow("Assignees must be a list.");
    expect(() => parseTasksEdgePayload(CreateTaskSchema, { assignee_ids: [{ nested: true }] }))
      .toThrow(AppError);
  });

  it("tolerates null recurrence and reminder policy like the service does", () => {
    const parsed = parseTasksEdgePayload(UpdateTaskSchema, { title: "x", recurrence: null, reminderPolicy: null });
    expect(parsed.recurrence).toBeNull();
    expect(parsed.reminderPolicy).toBeNull();
  });

  it("reports validation failures as 400 AppError", () => {
    try {
      parseTasksEdgePayload(CreateTaskSchema, { title: 42 });
      expect.unreachable("should have thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(AppError);
      if (error instanceof AppError) {
        expect(error.statusCode).toBe(400);
      }
    }
  });
});

describe("TaskRecurrenceSchema (recurrence update mode)", () => {
  it("accepts the two supported apply modes", () => {
    expect(parseTasksEdgePayload(TaskRecurrenceSchema, { applyTo: "future" }).applyTo).toBe("future");
    expect(parseTasksEdgePayload(TaskRecurrenceSchema, { applyTo: "instance" }).applyTo).toBe("instance");
    expect(parseTasksEdgePayload(TaskRecurrenceSchema, {})).not.toHaveProperty("applyTo");
  });

  it("rejects an unsupported apply mode instead of silently treating it as 'instance'", () => {
    expect(() => parseTasksEdgePayload(CreateTaskSchema, {
      title: "x",
      recurrence: { enabled: true, applyTo: "everything" },
    })).toThrow("Recurrence applyTo must be 'future' or 'instance'.");
  });

  it("accepts dual-cased end dates and numeric or text intervals", () => {
    expect(parseTasksEdgePayload(TaskRecurrenceSchema, { end_date: "2026-12-31" }).end_date).toBe("2026-12-31");
    expect(parseTasksEdgePayload(TaskRecurrenceSchema, { interval: 2 }).interval).toBe(2);
    expect(parseTasksEdgePayload(TaskRecurrenceSchema, { interval: "2" }).interval).toBe("2");
    expect(() => parseTasksEdgePayload(TaskRecurrenceSchema, { interval: { nested: true } }))
      .toThrow("Recurrence interval must be a number or numeric text.");
  });
});

describe("checklist mutation payloads", () => {
  it("accepts label or title on create and trims them", () => {
    expect(parseTasksEdgePayload(TaskChecklistItemCreateSchema, { label: "  Step one  " }).label).toBe("Step one");
    expect(parseTasksEdgePayload(TaskChecklistItemCreateSchema, { title: "Step one" }).title).toBe("Step one");
  });

  it("accepts dual-cased checked state on update", () => {
    expect(parseTasksEdgePayload(TaskChecklistItemUpdateSchema, { is_checked: true }).is_checked).toBe(true);
    expect(parseTasksEdgePayload(TaskChecklistItemUpdateSchema, { checked: false }).checked).toBe(false);
  });

  it("rejects wrong-typed labels and checked states", () => {
    expect(() => parseTasksEdgePayload(TaskChecklistItemCreateSchema, { label: ["a"] }))
      .toThrow("Checklist label must be text.");
    expect(() => parseTasksEdgePayload(TaskChecklistItemUpdateSchema, { is_checked: { nested: true } }))
      .toThrow("Checked state must be a boolean.");
  });

  it("accepts dual-cased reorder id lists and rejects non-lists", () => {
    expect(parseTasksEdgePayload(TaskChecklistReorderSchema, { item_ids: ["a", "b"] }).item_ids).toEqual(["a", "b"]);
    expect(parseTasksEdgePayload(TaskChecklistReorderSchema, { itemIds: ["a"] }).itemIds).toEqual(["a"]);
    expect(() => parseTasksEdgePayload(TaskChecklistReorderSchema, { item_ids: "a,b" }))
      .toThrow("Checklist item IDs must be a list.");
  });
});

describe("parent/child relationship payloads", () => {
  it("accepts dual-cased child ids and blocking flags", () => {
    const snake = parseTasksEdgePayload(TaskChildRelationshipSchema, { child_task_id: "t-2", is_blocking: true });
    expect(snake.child_task_id).toBe("t-2");
    expect(snake.is_blocking).toBe(true);

    const camel = parseTasksEdgePayload(TaskChildRelationshipSchema, { childTaskId: "t-2", blocking: false });
    expect(camel.childTaskId).toBe("t-2");
    expect(camel.blocking).toBe(false);
  });

  it("rejects invalid child payload shapes", () => {
    expect(() => parseTasksEdgePayload(TaskChildRelationshipSchema, { child_task_id: { nested: true } }))
      .toThrow("Child task ID must be text.");
    expect(() => parseTasksEdgePayload(TaskChildRelationshipSchema, { is_blocking: ["yes"] }))
      .toThrow("Blocking state must be a boolean.");
  });

  it("strips unrelated context fields from relationship payloads", () => {
    const parsed = parseTasksEdgePayload(TaskChildRelationshipSchema, {
      child_task_id: "t-2",
      workspace_id: "spoof",
      parent_task_id: "spoof",
    });
    expect(parsed).not.toHaveProperty("workspace_id");
    expect(parsed).not.toHaveProperty("parent_task_id");
  });
});
