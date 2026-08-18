// Work-candidate edge-query contract.
//
// Workbench, focus-mode, and work-resume routes hand raw HTTP query input to
// the work-candidate service. Zod owns only the untrusted shape boundary at
// the single list-query normalization entry: every known field survives in
// both naming conventions and every retained alias, unknown fields are
// stripped, and list-valued fields always leave the edge as typed string
// arrays with the historical comma-split calibration preserved. Scalar
// coercion, token normalization, deduplication, limits, defaults, and
// rejection behavior stay in the service's established normalizers; this
// contract is total by construction and must accept every input the service
// accepted before it existed.

import { z } from "zod";

/**
 * Preserve the service's historical list intake exactly: arrays keep their
 * members (stringified), scalar text splits on commas, other present scalars
 * become one-element lists, and null/undefined fall through so the service's
 * alias resolution keeps working.
 * @param {unknown} value
 * @returns {string[] | undefined}
 */
function edgeTextList(value) {
  if (value === undefined || value === null) {
    return undefined;
  }
  if (Array.isArray(value)) {
    return value.map((item) => String(item));
  }
  if (typeof value === "string") {
    return value.split(",");
  }
  return [String(value)];
}

/**
 * @param {unknown} value
 * @returns {Record<string, unknown> | undefined}
 */
function plainObjectOrUndefined(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? /** @type {Record<string, unknown>} */ (value)
    : undefined;
}

const listField = z.preprocess((value) => edgeTextList(value), z.array(z.string()).optional());
const liberalScalar = z.unknown().optional();

const candidateQueryFields = {
  bucketIds: listField,
  bucket_ids: listField,
  clientId: liberalScalar,
  client_id: liberalScalar,
  clientIds: listField,
  client_ids: listField,
  clientProjectIds: listField,
  client_project_ids: listField,
  distantCreationOnlyFallback: liberalScalar,
  distant_creation_only_fallback: liberalScalar,
  dueBefore: liberalScalar,
  due_before: liberalScalar,
  dueFrom: liberalScalar,
  due_from: liberalScalar,
  dueOn: liberalScalar,
  due_on: liberalScalar,
  dueTo: liberalScalar,
  due_to: liberalScalar,
  excludeDistantCreationOnly: liberalScalar,
  exclude_distant_creation_only: liberalScalar,
  excludePassiveRecurringCreated: liberalScalar,
  exclude_passive_recurring_created: liberalScalar,
  excludePassiveRecurringCreatedAlways: liberalScalar,
  exclude_passive_recurring_created_always: liberalScalar,
  excludeStatusFilters: listField,
  exclude_status_filters: listField,
  excludeStatuses: listField,
  exclude_statuses: listField,
  includeTaskCandidates: liberalScalar,
  include_task_candidates: liberalScalar,
  limit: liberalScalar,
  mode: liberalScalar,
  moduleId: liberalScalar,
  module_id: liberalScalar,
  orderBy: liberalScalar,
  order_by: liberalScalar,
  projectId: liberalScalar,
  project_id: liberalScalar,
  projectIds: listField,
  project_ids: listField,
  rankBuckets: listField,
  rank_buckets: listField,
  recordType: liberalScalar,
  record_type: liberalScalar,
  sort: liberalScalar,
  status: listField,
  statusFilters: listField,
  status_filters: listField,
  statuses: listField,
  timezone: liberalScalar,
  today: liberalScalar,
  todayDate: liberalScalar,
  today_date: liberalScalar,
};

const NestedCandidateQuerySchema = z.preprocess(
  (value) => plainObjectOrUndefined(value),
  z.object(candidateQueryFields).optional(),
);

const FocusContextSchema = z.preprocess(
  (value) => plainObjectOrUndefined(value),
  z.object({
    candidateFilters: NestedCandidateQuerySchema,
    candidateQuery: NestedCandidateQuerySchema,
    candidate_filters: NestedCandidateQuerySchema,
    candidate_query: NestedCandidateQuerySchema,
    filters: NestedCandidateQuerySchema,
  }).optional(),
);

const WorkCandidateQueryEdgeSchema = z.preprocess(
  (value) => plainObjectOrUndefined(value) ?? {},
  z.object({
    ...candidateQueryFields,
    focusContext: FocusContextSchema,
    focus_context: FocusContextSchema,
  }),
);

/**
 * Parse one untrusted work-candidate list query at the service edge. The
 * schema is total: preprocessing reduces every field to an accepted shape, so
 * parsing never rejects and rejection behavior stays with the service.
 * @param {unknown} query
 * @returns {import("zod").output<typeof WorkCandidateQueryEdgeSchema>}
 */
function parseWorkCandidateQueryEdge(query) {
  return WorkCandidateQueryEdgeSchema.parse(query ?? {});
}

export { WorkCandidateQueryEdgeSchema, parseWorkCandidateQueryEdge };
