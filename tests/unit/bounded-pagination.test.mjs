import { describe, expect, it } from "vitest";
import {
  boundedPaginationEnvelope,
  decodeOffsetCursor,
  encodeOffsetCursor,
  normalizeBoundedPagination,
} from "../../src/core/bounded-pagination.js";

describe("normalizeBoundedPagination", () => {
  it("applies the default limit and zero offset for an empty request", () => {
    expect(normalizeBoundedPagination({})).toEqual({ limit: 25, maxPageSize: 100, offset: 0 });
  });

  it("clamps the requested limit to the configured maximum", () => {
    const pagination = normalizeBoundedPagination({ limit: 9999 }, { defaultLimit: 25, maxLimit: 200 });
    expect(pagination.limit).toBe(200);
    expect(pagination.maxPageSize).toBe(200);
  });

  it("accepts dual-cased page-size inputs", () => {
    expect(normalizeBoundedPagination({ pageSize: 10 }).limit).toBe(10);
    expect(normalizeBoundedPagination({ page_size: 10 }).limit).toBe(10);
  });

  it("prefers a cursor offset over a raw offset", () => {
    const cursor = encodeOffsetCursor(50);
    expect(normalizeBoundedPagination({ cursor, offset: 5 }).offset).toBe(50);
  });

  it("floors negative or junk offsets at zero", () => {
    expect(normalizeBoundedPagination({ offset: -10 }).offset).toBe(0);
    expect(normalizeBoundedPagination({ offset: "junk" }).offset).toBe(0);
  });
});

describe("offset cursors", () => {
  it("round-trips a positive offset", () => {
    expect(decodeOffsetCursor(encodeOffsetCursor(75))).toBe(75);
  });

  it("returns null for junk cursors instead of throwing", () => {
    expect(decodeOffsetCursor("not-a-cursor")).toBeNull();
    expect(decodeOffsetCursor("")).toBeNull();
  });
});

describe("boundedPaginationEnvelope", () => {
  it("emits a next cursor only when more rows remain", () => {
    const more = boundedPaginationEnvelope({ hasMore: true, limit: 25, maxPageSize: 100, offset: 0, returned: 25 });
    expect(more.hasMore).toBe(true);
    expect(decodeOffsetCursor(more.nextCursor)).toBe(25);

    const done = boundedPaginationEnvelope({ hasMore: false, limit: 25, maxPageSize: 100, offset: 25, returned: 10 });
    expect(done.hasMore).toBe(false);
    expect(done.nextCursor).toBe("");
  });

  it("normalizes total to a number or null", () => {
    expect(boundedPaginationEnvelope({ total: "42" }).total).toBe(42);
    expect(boundedPaginationEnvelope({}).total).toBeNull();
    expect(boundedPaginationEnvelope({ total: "junk" }).total).toBeNull();
  });
});
