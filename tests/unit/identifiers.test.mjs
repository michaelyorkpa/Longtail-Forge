import { describe, expect, it } from "vitest";
import { createOpaqueId, createRecordId } from "../../src/core/identifiers.js";

const CANONICAL_UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe("identifier authority", () => {
  it("creates canonical UUIDv7 record identifiers", () => {
    const recordId = createRecordId();

    expect(recordId).toMatch(CANONICAL_UUID_PATTERN);
    expect(recordId[14]).toBe("7");
  });

  it("creates canonical random UUIDv4 opaque identifiers", () => {
    const opaqueId = createOpaqueId();

    expect(opaqueId).toMatch(CANONICAL_UUID_PATTERN);
    expect(opaqueId[14]).toBe("4");
  });

  it("keeps meaningful batches unique", () => {
    const recordIds = new Set(Array.from({ length: 2_000 }, () => createRecordId()));
    const opaqueIds = new Set(Array.from({ length: 2_000 }, () => createOpaqueId()));

    expect(recordIds.size).toBe(2_000);
    expect(opaqueIds.size).toBe(2_000);
  });

  it("uses supported UUIDv7 options for deterministic timestamp proof", () => {
    const recordId = createRecordId({
      msecs: Date.UTC(2026, 6, 31, 12, 0, 0),
      random: new Uint8Array(16).fill(0x5a),
      seq: 0x12345678,
    });

    expect(recordId).toBe("019fb80b-aa00-7123-9159-e25a5a5a5a5a");
  });

  it("uses supported UUIDv4 options without weakening the production RNG path", () => {
    const opaqueId = createOpaqueId({ random: new Uint8Array(16).fill(0xa5) });

    expect(opaqueId).toBe("a5a5a5a5-a5a5-45a5-a5a5-a5a5a5a5a5a5");
  });
});
