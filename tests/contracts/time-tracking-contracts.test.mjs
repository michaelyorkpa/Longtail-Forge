import { describe, expect, it } from "vitest";
import {
  ActiveTimerFinalizeSchema,
  ActiveTimerSaveSchema,
  ActiveTimerStatusSchema,
  BrowserTimeEntryCreateSchema,
  BrowserTimeEntryUpdateSchema,
  PublicApiTimeEntryCreateSchema,
  parseTimeTrackingEdgePayload,
} from "../../src/modules/time-tracking/time-tracking.contracts.js";
import { AppError } from "../../src/utils/app-error.js";

const browserCreatePayload = {
  billable: "yes",
  client_id: "client-1",
  client_name: "Acme",
  description: "Implementation",
  duration_hours: "0.5000",
  duration_seconds: 1800,
  end_time: "2026-07-14T14:30:00.000Z",
  invoice_status: "unbilled",
  project_id: "project-1",
  project_name: "Launch",
  start_time: "2026-07-14T14:00:00.000Z",
  tagIds: ["tag-1"],
};

describe("browser time-entry contracts", () => {
  it("accepts the real browser create and update shape", () => {
    const created = parseTimeTrackingEdgePayload(BrowserTimeEntryCreateSchema, browserCreatePayload);
    const updated = parseTimeTrackingEdgePayload(BrowserTimeEntryUpdateSchema, {
      ...browserCreatePayload,
      billable: false,
      tag_ids: ["tag-2"],
    });

    expect(created.project_id).toBe("project-1");
    expect(created.duration_seconds).toBe(1800);
    expect(created.tagIds).toEqual(["tag-1"]);
    expect(updated.billable).toBe(false);
    expect(updated.tag_ids).toEqual(["tag-2"]);
  });

  it("keeps service-owned required checks outside the schema", () => {
    expect(parseTimeTrackingEdgePayload(BrowserTimeEntryCreateSchema, {})).toEqual({});
  });

  it("strips unknown and server-managed fields", () => {
    const parsed = parseTimeTrackingEdgePayload(BrowserTimeEntryCreateSchema, {
      ...browserCreatePayload,
      created_at: "spoof",
      user_id: "spoof",
      workspace_id: "spoof",
      unexpected: true,
    });

    expect(parsed).not.toHaveProperty("created_at");
    expect(parsed).not.toHaveProperty("user_id");
    expect(parsed).not.toHaveProperty("workspace_id");
    expect(parsed).not.toHaveProperty("unexpected");
  });

  it("rejects wrong-typed timestamps, durations, billable flags, and tags", () => {
    expect(() => parseTimeTrackingEdgePayload(BrowserTimeEntryCreateSchema, {
      ...browserCreatePayload,
      start_time: 123,
    })).toThrow("Start time must be text.");
    expect(() => parseTimeTrackingEdgePayload(BrowserTimeEntryCreateSchema, {
      ...browserCreatePayload,
      duration_seconds: { seconds: 5 },
    })).toThrow("Duration seconds must be a number or numeric text.");
    expect(() => parseTimeTrackingEdgePayload(BrowserTimeEntryCreateSchema, {
      ...browserCreatePayload,
      billable: 1,
    })).toThrow("Billable must be a boolean or 'yes'/'no'.");
    expect(() => parseTimeTrackingEdgePayload(BrowserTimeEntryCreateSchema, {
      ...browserCreatePayload,
      tagIds: "tag-1",
    })).toThrow("Tags must be a list.");
  });

  it("reports failures as 400 AppError", () => {
    try {
      parseTimeTrackingEdgePayload(BrowserTimeEntryCreateSchema, { end_time: [] });
      expect.unreachable("should have thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(AppError);
      expect(error.statusCode).toBe(400);
    }
  });
});

describe("public API time-entry create contract", () => {
  it("accepts the public API-only entry id and task id fields", () => {
    const parsed = parseTimeTrackingEdgePayload(PublicApiTimeEntryCreateSchema, {
      ...browserCreatePayload,
      entry_id: "external-entry-1",
      task_id: "task-1",
    });

    expect(parsed.entry_id).toBe("external-entry-1");
    expect(parsed.task_id).toBe("task-1");
    expect(parsed).not.toHaveProperty("tagIds");
  });

  it("keeps browser and public API create shapes distinct", () => {
    const browser = parseTimeTrackingEdgePayload(BrowserTimeEntryCreateSchema, {
      entry_id: "ignored-browser-id",
      tagIds: ["tag-1"],
    });
    const publicApi = parseTimeTrackingEdgePayload(PublicApiTimeEntryCreateSchema, {
      entry_id: "accepted-public-id",
      tagIds: ["ignored-tag"],
    });

    expect(browser).not.toHaveProperty("entry_id");
    expect(browser.tagIds).toEqual(["tag-1"]);
    expect(publicApi.entry_id).toBe("accepted-public-id");
    expect(publicApi).not.toHaveProperty("tagIds");
  });
});

describe("active timer contracts", () => {
  it("accepts the real manual timer save shape", () => {
    const parsed = parseTimeTrackingEdgePayload(ActiveTimerSaveSchema, {
      active_timer_id: "",
      accumulated_elapsed_seconds: 37,
      billable: "no",
      client_id: "client-1",
      client_name: "Acme",
      description: "Resume work",
      last_active_start_time: "2026-07-14T14:00:00.000Z",
      project_id: "project-1",
      project_name: "Launch",
      timer_slot: "1",
      timer_status: "running",
    });

    expect(parsed.timer_status).toBe("running");
    expect(parsed.accumulated_elapsed_seconds).toBe(37);
  });

  it("accepts status/start/pause payloads and nullable timestamps", () => {
    const running = parseTimeTrackingEdgePayload(ActiveTimerStatusSchema, {
      accumulated_elapsed_seconds: "42",
      last_active_start_time: "2026-07-14T14:00:00.000Z",
      timer_status: "running",
    });
    const paused = parseTimeTrackingEdgePayload(ActiveTimerStatusSchema, {
      last_active_start_time: null,
      timer_status: "paused",
    });

    expect(running.accumulated_elapsed_seconds).toBe("42");
    expect(paused.last_active_start_time).toBeNull();
  });

  it("accepts finalize fields while stripping unrelated timer state", () => {
    const parsed = parseTimeTrackingEdgePayload(ActiveTimerFinalizeSchema, {
      ...browserCreatePayload,
      active_timer_id: "server-owned",
      accumulated_elapsed_seconds: 200,
    });

    expect(parsed.project_id).toBe("project-1");
    expect(parsed).not.toHaveProperty("active_timer_id");
    expect(parsed).not.toHaveProperty("accumulated_elapsed_seconds");
  });

  it("rejects wrong-typed timer fields", () => {
    expect(() => parseTimeTrackingEdgePayload(ActiveTimerSaveSchema, {
      project_id: "project-1",
      timer_status: ["running"],
    })).toThrow("Timer status must be text.");
    expect(() => parseTimeTrackingEdgePayload(ActiveTimerStatusSchema, {
      accumulated_elapsed_seconds: false,
    })).toThrow("Accumulated elapsed seconds must be a number or numeric text.");
    expect(() => parseTimeTrackingEdgePayload(ActiveTimerFinalizeSchema, {
      end_time: { now: true },
    })).toThrow("End time must be text.");
  });
});
