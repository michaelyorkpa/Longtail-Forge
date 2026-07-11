import { describe, expect, it } from "vitest";
import {
  ALLOWED_PAYLOAD_FIELDS,
  buildSafeProducerPayload,
  isForbiddenField,
  sanitizeMetadata,
} from "../../src/services/work-resume-state-producers.js";

const definition = { id: "producer-1", moduleId: "tasks", recordType: "task" };
const event = {
  name: "task.updated",
  module_id: "tasks",
  record_id: "task-9",
  record_type: "task",
  emitted_at: "2026-07-10T00:00:00.000Z",
};

describe("isForbiddenField (denylist)", () => {
  it.each(["note_body", "renderedHtml", "html_content", "secure_payload", "encrypted_value", "attachment_id", "comment_text"])(
    "forbids content-bearing field %s",
    (field) => {
      expect(isForbiddenField(field)).toBe(true);
    },
  );

  it.each(["title_snapshot", "next_action", "module_id", "record_id", "source_url"])(
    "allows resume-safe field %s",
    (field) => {
      expect(isForbiddenField(field)).toBe(false);
    },
  );
});

describe("sanitizeMetadata", () => {
  it("strips forbidden keys recursively while keeping safe keys", () => {
    const sanitized = sanitizeMetadata({
      ok_key: "fine",
      note_body: "SECRET",
      nested: { html_content: "x", safe: 1 },
    });
    expect(sanitized).toEqual({ ok_key: "fine", nested: { safe: 1 } });
  });
});

describe("buildSafeProducerPayload (allowlist)", () => {
  it("keeps allowlisted fields and fills defaults from the event", () => {
    const payload = buildSafeProducerPayload(definition, event, {
      title_snapshot: "My task",
      next_action: "Do it",
    });
    expect(payload.title).toBe("My task");
    expect(payload.next_action).toBe("Do it");
    expect(payload.moduleId).toBe("tasks");
    expect(payload.recordId).toBe("task-9");
    expect(payload.lastActionType).toBe("task.updated");
    expect(payload.updatedAt).toBe("2026-07-10T00:00:00.000Z");
  });

  it("drops content-bearing and unknown fields outright", () => {
    const payload = buildSafeProducerPayload(definition, event, {
      title_snapshot: "My task",
      body: "FORBIDDEN CONTENT",
      renderedHtml: "<p>nope</p>",
      unknown_junk: "drop me",
    });
    expect(payload).not.toHaveProperty("body");
    expect(payload).not.toHaveProperty("renderedHtml");
    expect(payload).not.toHaveProperty("unknown_junk");
  });

  it("keeps the dual-cased allowlist stable for both casings", () => {
    expect(ALLOWED_PAYLOAD_FIELDS.has("module_id")).toBe(true);
    expect(ALLOWED_PAYLOAD_FIELDS.has("moduleId")).toBe(true);
    expect(ALLOWED_PAYLOAD_FIELDS.has("title_snapshot")).toBe(true);
    expect(ALLOWED_PAYLOAD_FIELDS.has("titleSnapshot")).toBe(true);
    expect(ALLOWED_PAYLOAD_FIELDS.has("body")).toBe(false);
  });
});
