import { describe, expect, it } from "vitest";
import { normalizeTimeEntry } from "../../src/utils/normalizers.js";
import {
  addLocalDateDays,
  localDateBoundToUtcIso,
  localDateKey,
  normalizeUtcIso,
} from "../../src/utils/timezones.js";

/** @typedef {import("../../src/utils/normalizers.js").TimeEntry} TimeEntry */
/** @typedef {import("../../src/utils/timezones.js").DateBoundEdge} DateBoundEdge */

describe("canonical time-entry normalization", () => {
  it("returns the authoritative string-duration and tri-state billable shape", () => {
    /** @type {TimeEntry} */
    const entry = normalizeTimeEntry({
      entry_id: " entry-1 ",
      workspace_id: " workspace-1 ",
      user_id: " user-1 ",
      client_id: null,
      client_name: "",
      project_id: " project-1 ",
      project_name: " Launch ",
      task_id: null,
      description: " Implementation ",
      start_time: "2026-08-10T13:00:00.000Z",
      end_time: "2026-08-10T13:30:00.000Z",
      duration_seconds: 1800,
      duration_hours: "0.5000",
      billable: true,
      invoice_status: "billed",
      created_at: "2026-08-10T13:30:01.000Z",
      updated_at: "2026-08-10T13:30:02.000Z",
    });

    expect(entry).toEqual({
      entry_id: "entry-1",
      workspace_id: "workspace-1",
      user_id: "user-1",
      client_id: "",
      client_name: "",
      project_id: "project-1",
      project_name: "Launch",
      task_id: "",
      description: "Implementation",
      start_time: "2026-08-10T13:00:00.000Z",
      end_time: "2026-08-10T13:30:00.000Z",
      duration_seconds: "1800",
      duration_hours: "0.5000",
      billable: "yes",
      invoice_status: "billed",
      created_at: "2026-08-10T13:30:01.000Z",
      updated_at: "2026-08-10T13:30:02.000Z",
    });
  });

  it("preserves zero and blank duration coercion plus billable fallback behavior", () => {
    const zero = normalizeTimeEntry({ duration_seconds: 0, duration_hours: 0, billable: false });
    const blank = normalizeTimeEntry({ duration_seconds: "   ", duration_hours: null, billable: null, invoice_status: "other" });
    const paddedInvoiceStatus = normalizeTimeEntry({ invoice_status: " billed " });

    expect(zero.duration_seconds).toBe("0");
    expect(zero.duration_hours).toBe("0");
    expect(zero.billable).toBe("no");
    expect(blank.duration_seconds).toBe("");
    expect(blank.duration_hours).toBe("0");
    expect(blank.billable).toBe("");
    expect(blank.invoice_status).toBe("unbilled");
    expect(paddedInvoiceStatus.invoice_status).toBe("unbilled");
  });
});

describe("timezone normalization", () => {
  it("treats empty input as the supplied fallback and defaults it to call time", () => {
    const fallback = new Date("2026-08-10T12:34:56.789Z");
    expect(normalizeUtcIso("", "America/New_York", fallback)).toBe(fallback.toISOString());
    expect(normalizeUtcIso(null, "America/New_York", fallback)).toBe(fallback.toISOString());

    const before = Date.now();
    const normalizedNow = Date.parse(normalizeUtcIso(undefined));
    const after = Date.now();
    expect(normalizedNow).toBeGreaterThanOrEqual(before);
    expect(normalizedNow).toBeLessThanOrEqual(after);
  });

  it("retains explicit-offset, invalid-input, and invalid-timezone behavior", () => {
    const fallback = new Date("2025-01-02T03:04:05.000Z");
    expect(normalizeUtcIso("2026-08-10T09:00:00-04:00")).toBe("2026-08-10T13:00:00.000Z");
    expect(normalizeUtcIso("not-a-date", "America/New_York", fallback)).toBe(fallback.toISOString());
    expect(() => normalizeUtcIso("2026-08-10T09:00:00", "Not/A_Timezone", fallback)).toThrow(RangeError);
  });

  it("preserves the established DST gap, overlap, and local-date edge calculations", () => {
    /** @type {DateBoundEdge[]} */
    const edges = ["start", "end"];

    expect(normalizeUtcIso("2024-03-10T02:30:00", "America/New_York")).toBe("2024-03-10T06:30:00.000Z");
    expect(normalizeUtcIso("2024-11-03T01:30:00", "America/New_York")).toBe("2024-11-03T05:30:00.000Z");
    expect(localDateBoundToUtcIso("2024-03-10", "America/New_York", edges[0])).toBe("2024-03-10T05:00:00.000Z");
    expect(localDateBoundToUtcIso("2024-03-10", "America/New_York", edges[1])).toBe("2024-03-11T03:59:59.999Z");
  });

  it("derives and advances local calendar keys independently of the server timezone", () => {
    expect(localDateKey(new Date("2026-03-01T01:00:00.000Z"), "America/Los_Angeles")).toBe("2026-02-28");
    expect(localDateKey(new Date("2026-03-01T01:00:00.000Z"), "UTC")).toBe("2026-03-01");
    expect(addLocalDateDays("2026-02-28", 1)).toBe("2026-03-01");
    expect(addLocalDateDays("2024-02-28", 1)).toBe("2024-02-29");
  });
});
