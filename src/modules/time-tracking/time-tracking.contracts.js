// Time Tracking edge-payload contracts.
//
// Browser time-entry writes, public API time-entry creates, and active timer
// mutations intentionally enter through different services. Their schemas
// share field definitions where the wire shapes overlap, but each untrusted
// payload is parsed only at its real service edge. Time entries assembled by
// active-timer finalization are trusted internal objects and are not re-parsed.
//
// Contract choices (see docs/module-development.md):
// - Unknown and server-managed fields are stripped, not stored.
// - Wrong-typed known fields fail with the existing 400 AppError envelope.
// - Numeric duration values may remain numbers or numeric text because the
//   existing normalizers accept both forms.
// - Required-ness and semantic value checks stay in the owning services so
//   their current messages and fallback behavior remain unchanged.

import { z } from "zod";
import { AppError } from "../../utils/app-error.js";

/** @param {string} label */
const optionalText = (label) => z.string({ error: `${label} must be text.` }).trim().optional();
/** @param {string} label */
const optionalNullableText = (label) => optionalText(label).nullable();
/** @param {string} label */
const optionalNumberOrText = (label) => z.union(
  [z.number(), z.string().trim()],
  { error: `${label} must be a number or numeric text.` },
).optional();
const optionalBillable = z.union(
  [z.boolean(), z.enum(["yes", "no"])],
  { error: "Billable must be a boolean or 'yes'/'no'." },
).optional();
/** @param {string} label */
const optionalIdList = (label) => z.array(
  z.union([z.string().trim(), z.number(), z.null(), z.undefined()], {
    error: `${label} entries must be text.`,
  }),
  { error: `${label} must be a list.` },
).optional();

const sharedTimeEntryFields = {
  billable: optionalBillable,
  client_id: optionalText("Client ID"),
  client_name: optionalText("Client name"),
  description: z.string({ error: "Description must be text." }).optional(),
  duration_hours: optionalNumberOrText("Duration hours"),
  duration_seconds: optionalNumberOrText("Duration seconds"),
  end_time: optionalText("End time"),
  invoice_status: optionalText("Invoice status"),
  project_id: optionalText("Project ID"),
  project_name: optionalText("Project name"),
  start_time: optionalText("Start time"),
  task_id: optionalText("Task ID"),
};

const browserTimeEntryFields = {
  ...sharedTimeEntryFields,
  tagIds: optionalIdList("Tags"),
  tag_ids: optionalIdList("Tags"),
};

/** Browser `POST /api/time-entries` request body. */
const BrowserTimeEntryCreateSchema = z.object(browserTimeEntryFields);

/** Browser `PUT /api/time-entries/:entryId` request body. */
const BrowserTimeEntryUpdateSchema = z.object(browserTimeEntryFields);

/** Public `POST /api/v1/time-entries` request body. */
const PublicApiTimeEntryCreateSchema = z.object({
  ...sharedTimeEntryFields,
  entry_id: optionalText("Entry ID"),
});

/** Manual active-timer slot save body. */
const ActiveTimerSaveSchema = z.object({
  active_timer_id: optionalText("Active timer ID"),
  accumulated_elapsed_seconds: optionalNumberOrText("Accumulated elapsed seconds"),
  billable: optionalBillable,
  client_id: optionalText("Client ID"),
  client_name: optionalText("Client name"),
  description: z.string({ error: "Description must be text." }).optional(),
  last_active_start_time: optionalNullableText("Last active start time"),
  project_id: optionalText("Project ID"),
  project_name: optionalText("Project name"),
  timer_slot: optionalText("Timer slot"),
  timer_status: optionalText("Timer status"),
});

const optionalSourceMetadata = z.record(z.string(), z.unknown(), {
  error: "Source metadata must be an object.",
}).optional();

/** Sourced active-timer save payload crossing a module action boundary. */
const ActiveTimerSourcedSaveSchema = ActiveTimerSaveSchema.extend({
  sourceMetadata: optionalSourceMetadata,
  source_metadata: optionalSourceMetadata,
});

/** Active-timer start, pause, and Workbench status mutation body. */
const ActiveTimerStatusSchema = z.object({
  accumulated_elapsed_seconds: optionalNumberOrText("Accumulated elapsed seconds"),
  last_active_start_time: optionalNullableText("Last active start time"),
  timer_status: optionalText("Timer status"),
});

/** Manual or sourced active-timer finalize body. */
const ActiveTimerFinalizeSchema = z.object(browserTimeEntryFields);

/**
 * Validate an untrusted Time Tracking edge payload.
 *
 * Zod object parsing strips unknown fields. The first validation issue is
 * surfaced through the application's existing error envelope.
 *
 * @template {import("zod").ZodType} Schema
 * @param {Schema} schema
 * @param {unknown} payload
 * @returns {import("zod").output<Schema>}
 */
function parseTimeTrackingEdgePayload(schema, payload) {
  const result = schema.safeParse(payload ?? {});
  if (!result.success) {
    const issue = result.error.issues[0];
    throw new AppError(issue?.message || "Time Tracking payload is invalid.", 400);
  }

  return result.data;
}

export {
  ActiveTimerFinalizeSchema,
  ActiveTimerSaveSchema,
  ActiveTimerSourcedSaveSchema,
  ActiveTimerStatusSchema,
  BrowserTimeEntryCreateSchema,
  BrowserTimeEntryUpdateSchema,
  PublicApiTimeEntryCreateSchema,
  parseTimeTrackingEdgePayload,
};
