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

  it("removes attachment and comment content while retaining safe context", () => {
    expect(sanitizeMetadata({
      attachment_url: "hidden",
      comments: "hidden",
      safe_context: "visible",
    })).toEqual({ safe_context: "visible" });
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

  it("scrubs the complete nested producer payload matrix", () => {
    const payload = buildSafeProducerPayload(definition, event, {
      body_excerpt: "Unsafe excerpt",
      metadata: {
        body_markdown: "Unsafe body",
        nested: {
          secure_payload: "encrypted text",
          safe: "kept",
        },
      },
      moduleId: "tasks",
      nextAction: "Use the explicit safe next action.",
      recordId: event.record_id,
      recordType: "task",
      title: "Explicit title",
    });

    expect(payload.title).toBe("Explicit title");
    expect(payload.nextAction).toBe("Use the explicit safe next action.");
    expect(payload).not.toHaveProperty("body_excerpt");
    expect(payload.metadata).toEqual({
      event: "task.updated",
      nested: { safe: "kept" },
      producer_id: "producer-1",
    });
  });

  it("keeps the dual-cased allowlist stable for both casings", () => {
    expect(ALLOWED_PAYLOAD_FIELDS.has("module_id")).toBe(true);
    expect(ALLOWED_PAYLOAD_FIELDS.has("moduleId")).toBe(true);
    expect(ALLOWED_PAYLOAD_FIELDS.has("title_snapshot")).toBe(true);
    expect(ALLOWED_PAYLOAD_FIELDS.has("titleSnapshot")).toBe(true);
    expect(ALLOWED_PAYLOAD_FIELDS.has("body")).toBe(false);
  });
});
