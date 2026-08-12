import { describe, expect, it } from "vitest";
import {
  candidateFromTimer,
  normalizeWorkCandidate,
  rankWorkCandidates,
  resolveWorkCandidateRankBucket,
  WORK_CANDIDATE_RANK_BUCKETS,
  WORK_CANDIDATE_SORTS,
} from "../../src/services/work-candidate.service.js";

const candidate = (overrides = {}) => ({
  candidateId: "c1",
  sourceKind: "task",
  recordType: "task",
  recordId: "r1",
  moduleId: "tasks",
  title: "A task",
  ...overrides,
});

const normalized = (overrides = {}) => normalizeWorkCandidate(candidate({
  sourceUrl: `tasks.html?task=${overrides.recordId || "r1"}`,
  ...overrides,
}));

describe("resolveWorkCandidateRankBucket", () => {
  it("puts a running timer in the running_timer bucket", () => {
    expect(resolveWorkCandidateRankBucket(candidate({
      metadata: { timer_status: "running" },
    }))).toBe(WORK_CANDIDATE_RANK_BUCKETS.runningTimer);
  });

  it("puts overdue assigned work ahead of undated work", () => {
    expect(resolveWorkCandidateRankBucket(candidate({
      dueAt: "2020-01-01T00:00:00.000Z",
      metadata: { assigned: true },
    }))).toBe(WORK_CANDIDATE_RANK_BUCKETS.overdueAssignedWork);
  });

  it("puts work due today in the due_today bucket", () => {
    expect(resolveWorkCandidateRankBucket(candidate({
      dueAt: new Date().toISOString(),
    }))).toBe(WORK_CANDIDATE_RANK_BUCKETS.dueToday);
  });

  it("defaults undated untouched work to the later bucket", () => {
    expect(resolveWorkCandidateRankBucket(candidate()))
      .toBe(WORK_CANDIDATE_RANK_BUCKETS.later);
  });
});

describe("rankWorkCandidates", () => {
  it("orders running timer, overdue, due today, then later", () => {
    const later = candidate({ candidateId: "later", recordId: "1", title: "Someday" });
    const dueToday = candidate({ candidateId: "today", recordId: "2", title: "Today", dueAt: new Date().toISOString() });
    const overdue = candidate({ candidateId: "over", recordId: "3", title: "Overdue", dueAt: "2020-01-01T00:00:00.000Z", metadata: { assigned: true } });
    const timer = candidate({ candidateId: "timer", recordId: "4", title: "Running", sourceKind: "timer", recordType: "timer", moduleId: "time-tracking", metadata: { timer_status: "running" } });

    const ranked = rankWorkCandidates([later, dueToday, overdue, timer]);
    expect(ranked.map((item) => item.title)).toEqual(["Running", "Overdue", "Today", "Someday"]);
  });

  it("does not mutate the input array", () => {
    const input = [candidate({ candidateId: "a" }), candidate({ candidateId: "b", metadata: { timer_status: "running" } })];
    const snapshot = input.map((item) => item.candidateId);
    rankWorkCandidates(input);
    expect(input.map((item) => item.candidateId)).toEqual(snapshot);
  });
});

describe("normalizeWorkCandidate", () => {
  it("accepts dual-cased fields and normalizes to camelCase output", () => {
    const normalized = normalizeWorkCandidate({
      module_id: "tasks",
      record_id: "task-1",
      record_type: "task",
      title_snapshot: "Snapshot title",
    });
    expect(normalized.moduleId).toBe("tasks");
    expect(normalized.recordId).toBe("task-1");
    expect(normalized.title).toBe("Snapshot title");
  });

  it("drops fields outside the allowlist", () => {
    const normalized = normalizeWorkCandidate(candidate({ evil_field: "x", body: "secret" }));
    expect(normalized).not.toHaveProperty("evil_field");
    expect(normalized).not.toHaveProperty("body");
  });

  it("rejects unsafe source URLs", () => {
    expect(normalizeWorkCandidate(candidate({ sourceUrl: "javascript:alert(1)" })).sourceUrl).toBe("");
  });

  it("keeps the supported sort modes stable", () => {
    expect(Object.values(WORK_CANDIDATE_SORTS).sort()).toEqual(["due_datetime", "ranked", "resume"]);
  });
});

describe("candidateFromTimer", () => {
  it("shapes a readable task-sourced timer as a Task Focus candidate", () => {
    const shaped = candidateFromTimer({
      active_timer_id: "timer-1",
      source_id: "task-1",
      source_label: "Continue the task",
      source_module_id: "tasks",
      source_type: "task",
      timer_slot: "source:tasks:task:task-1",
      timer_status: "running",
    }, {
      taskLifecycle: { readable: true, status: "in_progress" },
    });

    expect(shaped.moduleId).toBe("tasks");
    expect(shaped.recordType).toBe("task");
    expect(shaped.recordId).toBe("task-1");
    expect(shaped.status).toBe("in_progress");
    expect(shaped.metadata.timer_status).toBe("running");
    expect(shaped.primaryAction.href).toBe("tasks.html?task=task-1");
  });
});

describe("complete deterministic work-candidate matrices", () => {
  it("scrubs unsafe nested metadata and route action fields", () => {
    const normalizedCandidate = normalizeWorkCandidate({
      bodyHtml: "<p>hidden</p>",
      contextLabel: "Client Alpha / Project Roadrunner",
      metadata: {
        body_markdown: "Hidden body",
        nested: { safe: "kept", storage_key: "hidden/key" },
        safe_context: "visible",
      },
      moduleId: "tasks",
      primaryAction: {
        id: "unsafe.open",
        label: "Open work",
        method: "DELETE",
        payload: { body: "hidden", safe: "kept", scanner_status: "hidden" },
        route: "javascript:alert(1)",
        type: "route",
      },
      reason: "Review the safe candidate.",
      recordId: "candidate-task-1",
      recordType: "task",
      sourceUrl: "javascript:alert(1)",
      storage_key: "hidden/key",
      title: "Candidate Task",
    });

    expect(normalizedCandidate.sourceUrl).toBe("");
    expect(normalizedCandidate.primaryAction.route).toBe("");
    expect(normalizedCandidate.primaryAction.method).toBe("GET");
    expect(normalizedCandidate.primaryAction.payload).toEqual({ safe: "kept" });
    expect(normalizedCandidate.metadata).toEqual({ nested: { safe: "kept" }, safe_context: "visible" });
    expect(normalizedCandidate.title).toBe("Candidate Task");
    expect(normalizedCandidate.contextLabel).toBe("Client Alpha / Project Roadrunner");
  });

  it("orders the complete ranked matrix deterministically", () => {
    const ranked = rankWorkCandidates([
      normalized({ dueAt: "2026-07-10", recordId: "due-week", title: "Due This Week" }),
      normalized({ recordId: "later", title: "Later Work" }),
      normalized({ dueAt: "2026-07-06", metadata: { assigned_to_current_user: true }, recordId: "overdue", title: "Overdue Work" }),
      normalized({ moduleId: "time-tracking", metadata: { timer_status: "paused" }, recordId: "paused-timer", recordType: "active_work_timer", status: "paused", title: "Paused Timer" }),
      normalized({ dueAt: "2026-07-07", recordId: "today", title: "Due Today" }),
      normalized({ recordId: "blocked", status: "blocked", title: "Blocked Work" }),
      normalized({ lastWorkedAt: "2026-07-06T18:00:00.000Z", recordId: "recent", title: "Recent Work" }),
      normalized({ moduleId: "time-tracking", metadata: { timer_status: "running" }, recordId: "running-timer", recordType: "active_work_timer", status: "running", title: "Running Timer" }),
    ], { now: "2026-07-07T15:00:00.000Z", timezone: "America/New_York" });

    expect(ranked.map((item) => item.recordId)).toEqual([
      "running-timer", "paused-timer", "overdue", "today", "blocked", "recent", "due-week", "later",
    ]);
  });

  it("orders due-datetime candidates by exact due time instead of rank hint", () => {
    const ranked = rankWorkCandidates([
      normalized({ dueAt: "2026-07-09T09:00:00.000Z", rankHint: 1000, recordId: "high-rank-later", title: "A High Rank Later" }),
      normalized({ dueAt: "2026-07-07T15:00:00.000Z", rankHint: 1, recordId: "next-due", title: "Z Next Due" }),
      normalized({ dueAt: "2026-07-06T20:00:00.000Z", rankHint: 1, recordId: "newer-overdue", title: "B Newer Overdue" }),
      normalized({ dueAt: "2026-07-01T20:00:00.000Z", rankHint: 1, recordId: "oldest-overdue", title: "C Oldest Overdue" }),
    ], { sort: WORK_CANDIDATE_SORTS.dueDatetime, today: "2026-07-07", timezone: "America/New_York" });

    expect(ranked.map((item) => item.recordId)).toEqual([
      "oldest-overdue", "newer-overdue", "next-due", "high-rank-later",
    ]);
  });

  it("orders resume candidates by active timer, handoff, progress, and priority", () => {
    const ranked = rankWorkCandidates([
      normalized({ priority: "urgent", recordId: "plain-urgent", status: "open", title: "Plain Urgent" }),
      normalized({ priority: "low", recordId: "in-progress-low", status: "in_progress", title: "In Progress Low" }),
      normalized({ handoffNote: "Resume the handoff note.", priority: "low", recordId: "resume-note", status: "open", title: "Resume Note" }),
      normalized({ metadata: { timer_status: "paused" }, priority: "low", recordId: "paused-task-timer", status: "paused", title: "Paused Task Timer" }),
      normalized({ priority: "high", recordId: "in-progress-high", status: "in_progress", title: "In Progress High" }),
      normalized({ metadata: { timer_status: "running" }, priority: "low", recordId: "running-task-timer", status: "active", title: "Running Task Timer" }),
    ], { sort: WORK_CANDIDATE_SORTS.resume, today: "2026-07-07", timezone: "America/New_York" });

    expect(ranked.map((item) => item.recordId)).toEqual([
      "running-task-timer", "paused-task-timer", "resume-note", "in-progress-high", "in-progress-low", "plain-urgent",
    ]);
  });

  it("excludes far-future generated instances but keeps near-due instances recently touched", () => {
    const recurringCandidate = (dueAt, suffix) => normalized({
      dueAt,
      lastActionLabel: "Task Created",
      lastActionType: "task.created",
      lastWorkedAt: "2026-07-07T14:00:00.000Z",
      metadata: {
        recurrence_instance_date: dueAt,
        recurrence_template_id: `recurring-template-${suffix}`,
      },
      recordId: `recurring-${suffix}`,
      title: `${suffix} Recurring Instance`,
    });
    const options = { today: "2026-07-07", timezone: "America/New_York" };

    expect(resolveWorkCandidateRankBucket(recurringCandidate("2026-07-20", "far"), options))
      .not.toBe(WORK_CANDIDATE_RANK_BUCKETS.recentlyTouched);
    expect(resolveWorkCandidateRankBucket(recurringCandidate("2026-07-08", "near"), options))
      .toBe(WORK_CANDIDATE_RANK_BUCKETS.recentlyTouched);
  });
});
