import { describe, expect, it } from "vitest";
import { normalizeListQuery } from "../../src/services/work-candidate.service.js";
import { parseWorkCandidateQueryEdge } from "../../src/services/work-candidate.contracts.js";

/** @typedef {import("../../src/services/work-candidate.service.js").CandidateQueryInput} CandidateQueryInput */

// Frozen from the pre-schema normalizeListQuery outputs captured at
// checkpoint 0.33.33.25.10: the work-candidate edge schema must keep the
// service's normalized query byte-identical for every accepted input shape.
/** @type {Record<string, CandidateQueryInput>} */
const CASES = {
  commaString: { rankBuckets: "overdue,due_soon", today: "2026-08-01", timezone: "UTC" },
  arrayDedupe: { rank_buckets: ["overdue", "overdue", "Due-Soon"], today: "2026-08-01", timezone: "UTC" },
  bucketAliasAndStatus: { bucketIds: "recently_touched", status: "Open", timezone: "UTC", today: "2026-08-01" },
  mixedLists: { statuses: ["open", "blocked"], excludeStatuses: "done,archived", clientIds: "c1,c2", client_project_ids: ["p1"], projectIds: 42, timezone: "UTC", today: "2026-08-01" },
  nestedFocusContext: { focusContext: { candidateQuery: { rankBuckets: "overdue" }, filters: { statusFilters: ["open"] } }, mode: "left_off", timezone: "UTC", today: "2026-08-01" },
  topLevelOverride: { focusContext: { candidateQuery: { rankBuckets: "overdue" } }, rankBuckets: "due_today", timezone: "UTC", today: "2026-08-01" },
  garbageAndUnknowns: { focus_context: "garbage", limit: "7", sort: "nonsense", orderBy: 999, unknownKey: "x", timezone: "UTC", today: "2026-08-01" },
  degenerateObjectList: { rankBuckets: {}, timezone: "UTC", today: "2026-08-01" },
  empty: {},
};

/**
 * The complete normalized-query shape shared by every captured expectation.
 * @param {Record<string, unknown>} [overrides]
 * @returns {Record<string, unknown>}
 */
function expectedQuery(overrides = {}) {
  return {
    clientId: "",
    clientIds: [],
    clientProjectIds: [],
    dueBefore: "",
    excludeStatusFilters: [],
    excludePassiveRecurringCreated: false,
    excludePassiveRecurringCreatedAlways: false,
    excludeDistantCreationOnly: false,
    distantCreationOnlyFallback: false,
    dueFrom: "",
    dueOn: "",
    dueTo: "",
    includeTaskCandidates: false,
    limit: 25,
    mode: "left_off",
    moduleId: "",
    projectId: "",
    projectIds: [],
    rankBuckets: [],
    recordType: "",
    sort: "",
    statusFilters: [],
    timezone: "UTC",
    today: "2026-08-01",
    ...overrides,
  };
}

/** @type {Record<string, Record<string, unknown>>} */
const EXPECTED = {
  commaString: expectedQuery({ rankBuckets: ["overdue", "due_soon"] }),
  arrayDedupe: expectedQuery({ rankBuckets: ["overdue", "due_soon"] }),
  bucketAliasAndStatus: expectedQuery({ rankBuckets: ["recently_touched"], statusFilters: ["open"] }),
  mixedLists: expectedQuery({
    clientIds: ["c1", "c2"],
    clientProjectIds: ["p1"],
    excludeStatusFilters: ["done", "archived"],
    projectIds: ["42"],
    statusFilters: ["open", "blocked"],
  }),
  nestedFocusContext: expectedQuery({ rankBuckets: ["overdue"], statusFilters: ["open"] }),
  topLevelOverride: expectedQuery({ rankBuckets: ["due_today"] }),
  garbageAndUnknowns: expectedQuery({ limit: 7 }),
  degenerateObjectList: expectedQuery({ rankBuckets: ["[object_object]"] }),
  empty: expectedQuery({ timezone: "America/New_York", today: "" }),
};

describe("work-candidate edge-query contract", () => {
  for (const [name, input] of Object.entries(CASES)) {
    it(`keeps the normalized query byte-identical through the edge schema: ${name}`, () => {
      expect(JSON.parse(JSON.stringify(normalizeListQuery(input)))).toEqual(EXPECTED[name]);
    });
  }

  it("returns an already-normalized query unchanged by identity", () => {
    const once = normalizeListQuery({ rankBuckets: "overdue" });
    expect(normalizeListQuery(once)).toBe(once);
  });

  it("always emits typed string arrays for list fields at the edge", () => {
    for (const raw of ["overdue,due_soon", ["overdue"], 7, true, {}]) {
      const parsed = parseWorkCandidateQueryEdge({ rankBuckets: raw, statusFilters: raw, clientIds: raw });
      expect(Array.isArray(parsed.rankBuckets)).toBe(true);
      expect(Array.isArray(parsed.statusFilters)).toBe(true);
      expect(Array.isArray(parsed.clientIds)).toBe(true);
      expect((parsed.rankBuckets ?? []).every((item) => typeof item === "string")).toBe(true);
    }
    expect(parseWorkCandidateQueryEdge({ unknownKey: "x" })).not.toHaveProperty("unknownKey");
    expect(parseWorkCandidateQueryEdge("garbage")).toEqual({});
  });
});
