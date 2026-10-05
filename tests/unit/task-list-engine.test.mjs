import { describe, expect, it } from "vitest";
import {
  TaskListCursorError,
  createTaskListFilterContext,
  decodeTaskCursor,
  encodeTaskCursor,
  normalizeTaskListPagination,
  normalizeTaskListSort,
  normalizeTaskListView,
  sortCanonicalTasks,
  taskMatchesCanonicalQuery,
  visibleTaskListCandidates,
} from "../../src/modules/tasks/task-list-engine.js";

const clock = {
  currentWeekEnd: "2026-08-22",
  currentUserId: "user-1",
  dueSoonCutoff: "2026-08-22",
  nowIso: "2026-08-16T16:00:00.000Z",
  today: "2026-08-16",
};

function context(query = {}, scope = {}) {
  return createTaskListFilterContext(query, { ...clock, scope });
}

function task(overrides = {}) {
  return {
    assignee_ids: [],
    client_id: "",
    created_at: "2026-01-01T00:00:00.000Z",
    due_at_utc: "",
    due_date: "",
    due_time: "",
    priority: "normal",
    project_id: "",
    status: "open",
    task_id: "task-1",
    title: "Task",
    updated_at: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("Tasks list filter context", () => {
  it("normalizes aliases, whitespace, empty, and null values without browser-owned decisions", () => {
    const normalized = context({
      assignee_id: null,
      due_filter: "  TODAY ",
      sort_by: "recently_updated",
      status_filter: undefined,
      task_view: "assigned_to_me",
    });

    expect(normalized.taskView).toBe("my");
    expect(normalized.dueFilter).toBe("today");
    expect(normalized.sort).toBe("updated");
    expect(normalized.assigneeId).toBe("");
    expect(normalized.statusFilter).toBe("");
    expect(normalizeTaskListView("unknown")).toBe("");
    expect(normalizeTaskListSort(null)).toBe("due_at");
  });

  it("widens an active saved view only for an explicit terminal status", () => {
    const completed = task({ status: "complete" });

    expect(taskMatchesCanonicalQuery(completed, context({ task_view: "all", status: "active" }))).toBe(false);
    expect(taskMatchesCanonicalQuery(completed, context({ task_view: "all", status: "complete" }))).toBe(true);
    expect(taskMatchesCanonicalQuery(completed, context({ task_view: "all", status: "history" }))).toBe(true);
  });

  it("keeps date-only and timed overdue/today/week boundaries distinct", () => {
    const dateOverdue = task({ due_date: "2026-08-15" });
    const timedOverdue = task({ due_at_utc: "2026-08-16T15:59:59.000Z", due_date: "2026-08-16", due_time: "11:59" });
    const timedToday = task({ due_at_utc: "2026-08-16T17:00:00.000Z", due_date: "2026-08-16", due_time: "13:00" });
    const dueWeek = task({ due_date: "2026-08-22" });

    expect(taskMatchesCanonicalQuery(dateOverdue, context({ due: "overdue" }))).toBe(true);
    expect(taskMatchesCanonicalQuery(timedOverdue, context({ due: "today" }))).toBe(false);
    expect(taskMatchesCanonicalQuery(timedToday, context({ due: "today" }))).toBe(true);
    expect(taskMatchesCanonicalQuery(dueWeek, context({ due: "week" }))).toBe(true);
  });

  it("enforces resolved project/client hierarchy scopes, including blank context", () => {
    const nested = task({ client_id: "client-child", project_id: "project-child" });
    const projectScope = context({}, {
      hasProjectFilter: true,
      projectFilterMode: "ids",
      projectIds: ["project-parent", "project-child"],
    });
    const clientScope = context({}, {
      clientFilterMode: "ids",
      clientIds: ["client-parent", "client-child"],
      clientProjectIds: ["project-parent", "project-child"],
      hasClientFilter: true,
    });
    const blankProjectScope = context({}, {
      hasProjectFilter: true,
      projectFilterMode: "blank",
    });

    expect(taskMatchesCanonicalQuery(nested, projectScope)).toBe(true);
    expect(taskMatchesCanonicalQuery(nested, clientScope)).toBe(true);
    expect(taskMatchesCanonicalQuery(nested, blankProjectScope)).toBe(false);
    expect(taskMatchesCanonicalQuery(task(), blankProjectScope)).toBe(true);
  });
});

describe("Tasks list visibility and paging", () => {
  it("permission-prunes candidates before enrichment while retaining raw offsets", () => {
    const candidates = [
      task({ client_id: "allowed", task_id: "a" }),
      task({ client_id: "hidden", task_id: "b" }),
      task({ client_id: "allowed", task_id: "c" }),
    ];
    const visible = visibleTaskListCandidates(candidates, 40, (row) => row.client_id === "allowed");

    expect(visible.map((row) => [row.task_id, row.__candidateOffset])).toEqual([
      ["a", 40],
      ["c", 42],
    ]);
  });

  it("clamps page size, prefers a cursor, and rejects malformed cursors", () => {
    const cursor = encodeTaskCursor(75);
    expect(decodeTaskCursor(cursor)).toBe(75);
    expect(normalizeTaskListPagination(
      { cursor, limit: 9999, offset: 5 },
      { defaultPageSize: 100, maxPageSize: 200, paginate: true },
    )).toEqual({ offset: 75, pageSize: 200 });
    expect(normalizeTaskListPagination({}, { paginate: false })).toBeNull();
    expect(() => normalizeTaskListPagination({ cursor: "junk" }, { paginate: true })).toThrow(TaskListCursorError);
  });
});

describe("Tasks list stable ordering", () => {
  it("uses due, priority, title, creation, and id tie-breakers without mutating input", () => {
    const rows = [
      task({ due_date: "2026-08-16", priority: "normal", task_id: "c", title: "Same" }),
      task({ priority: "urgent", task_id: "urgent", title: "Later", due_date: "2026-08-17" }),
      task({ due_date: "2026-08-16", priority: "high", task_id: "b", title: "Same" }),
      task({ due_date: "2026-08-16", priority: "high", task_id: "a", title: "Same" }),
      task({ priority: "low", task_id: "undated", title: null, due_date: null }),
    ];
    const before = rows.map((row) => row.task_id);
    const sorted = sortCanonicalTasks(rows, { sort: "due_at" });

    expect(sorted.map((row) => row.task_id)).toEqual(["a", "b", "c", "urgent", "undated"]);
    expect(rows.map((row) => row.task_id)).toEqual(before);
  });

  it("normalizes empty context fields and preserves stable context ordering", () => {
    const sorted = sortCanonicalTasks([
      task({ client_name: null, project_name: "Zulu", task_id: "z", title: null }),
      task({ client_name: "Alpha", project_name: null, task_id: "a", title: "A" }),
      task({ client_name: null, project_name: null, task_id: "blank", title: "Blank" }),
    ], { sort: "context" });

    expect(sorted.map((row) => row.task_id)).toEqual(["blank", "z", "a"]);
  });
});
