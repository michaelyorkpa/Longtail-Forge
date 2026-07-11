import { describe, expect, it } from "vitest";
import {
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
