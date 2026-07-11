// @ts-check
// Tasks edge-payload contracts.
//
// Runtime Zod schemas for the Tasks edges: create/update bodies (browser and
// public API share these service entries), checklist item mutations,
// checklist reorder, child-relationship payloads, and the embedded recurrence
// payload with its update mode. These validate UNTRUSTED input at the
// boundary; trusted internal service objects are not re-parsed.
//
// Contract choices (see docs/module-development.md):
// - Unknown fields are stripped, not stored. Unlike Files, server-managed
//   audit fields (created_at, workspace_id, *_by_user_id, ...) are stripped
//   rather than rejected: the service already ignores every one of them, and
//   API callers legitimately echo fetched tasks back on update. Files rejects
//   because its server-managed fields are storage/scanner security controls.
// - Wrong-typed known fields fail 400 in the existing AppError envelope.
// - Required-ness and context checks (title required, scope, permissions,
//   assignee eligibility) stay in the Tasks service, which owns those error
//   messages today.
// - The recurrence update mode is the one deliberate tightening: applyTo must
//   be "future" or "instance" when provided, instead of silently treating any
//   other value as "instance".

import { z } from "zod";
import { AppError } from "../../utils/app-error.js";

const optionalText = (maxLength, label) =>
  z.string({ error: `${label} must be text.` })
    .trim()
    .max(maxLength, `${label} is too long.`)
    .optional();

const optionalFlag = (label) =>
  z.union([z.boolean(), z.string(), z.number()], { error: `${label} must be a boolean.` }).optional();

// List entries stay liberal on purpose: in-process callers pass ids that may
// be numeric or nullish, and the service normalizes/filters them as it always
// has. Only structured junk (objects/arrays as entries) is rejected.
const optionalIdList = (label) =>
  z.array(
    z.union([z.string().trim().max(160), z.number(), z.null(), z.undefined()], {
      error: `${label} entries must be text.`,
    }),
    { error: `${label} must be a list.` },
  ).optional();

/**
 * Embedded recurrence payload. applyTo is strictly "future" | "instance"
 * when provided; other values fail instead of silently meaning "instance".
 * @typedef {import("zod").infer<typeof TaskRecurrenceSchema>} TaskRecurrencePayload
 */
const TaskRecurrenceSchema = z.object({
  enabled: optionalFlag("Recurrence enabled"),
  applyTo: z.enum(["future", "instance"], {
    error: "Recurrence applyTo must be 'future' or 'instance'.",
  }).optional(),
  frequency: optionalText(40, "Recurrence frequency"),
  interval: z.union([z.string().trim().max(10), z.number()], {
    error: "Recurrence interval must be a number or numeric text.",
  }).optional(),
  endDate: optionalText(40, "Recurrence end date"),
  end_date: optionalText(40, "Recurrence end date"),
});

const taskEditableFields = {
  title: optionalText(500, "Title"),
  description: z.string({ error: "Description must be text." }).optional(),
  next_action: optionalText(1000, "Next action"),
  blocked_reason: optionalText(1000, "Blocked reason"),
  resume_note: optionalText(1000, "Resume note"),
  handoff_note: optionalText(1000, "Handoff note"),
  status: optionalText(40, "Status"),
  priority: optionalText(40, "Priority"),
  billable: optionalFlag("Billable"),
  due_date: optionalText(40, "Due date"),
  due_time: optionalText(20, "Due time"),
  due_timezone: optionalText(80, "Due timezone"),
  client_id: optionalText(160, "Client ID"),
  project_id: optionalText(160, "Project ID"),
  projectId: optionalText(160, "Project ID"),
  source_type: optionalText(80, "Source type"),
  source_id: optionalText(160, "Source ID"),
  last_worked_at: optionalText(40, "Last worked at"),
  recurrence_template_id: optionalText(160, "Recurrence template ID"),
  recurrence_instance_date: optionalText(40, "Recurrence instance date"),
  assignee_ids: optionalIdList("Assignees"),
  assignees: z.array(
    z.union([z.string().trim().max(160), z.object({ user_id: z.string().trim().max(160) })]),
    { error: "Assignees must be a list." },
  ).optional(),
  recurrence: TaskRecurrenceSchema.nullable().optional(),
  recurrenceDetails: TaskRecurrenceSchema.nullable().optional(),
  reminderOverrideEnabled: optionalFlag("Reminder override"),
  reminder_override_enabled: optionalFlag("Reminder override"),
  reminderPolicy: z.record(z.string(), z.unknown(), { error: "Reminder policy must be an object." }).nullable().optional(),
  reminder_policy: z.record(z.string(), z.unknown(), { error: "Reminder policy must be an object." }).nullable().optional(),
  tagIds: optionalIdList("Tags"),
  tag_ids: optionalIdList("Tags"),
};

/**
 * Create-task request body. Client-generated ids are supported.
 * @typedef {import("zod").infer<typeof CreateTaskSchema>} CreateTaskPayload
 */
const CreateTaskSchema = z.object({
  ...taskEditableFields,
  task_id: optionalText(160, "Task ID"),
  id: optionalText(160, "Task ID"),
});

/**
 * Update-task request body. The task id comes from the route; an echoed
 * body id is tolerated (and ignored by the service) for round-trip callers.
 * @typedef {import("zod").infer<typeof UpdateTaskSchema>} UpdateTaskPayload
 */
const UpdateTaskSchema = CreateTaskSchema;

/**
 * Checklist item create body.
 * @typedef {import("zod").infer<typeof TaskChecklistItemCreateSchema>} TaskChecklistItemCreatePayload
 */
const TaskChecklistItemCreateSchema = z.object({
  label: optionalText(500, "Checklist label"),
  title: optionalText(500, "Checklist label"),
});

/**
 * Checklist item update body (label edit and check/uncheck).
 * @typedef {import("zod").infer<typeof TaskChecklistItemUpdateSchema>} TaskChecklistItemUpdatePayload
 */
const TaskChecklistItemUpdateSchema = z.object({
  label: optionalText(500, "Checklist label"),
  is_checked: optionalFlag("Checked state"),
  checked: optionalFlag("Checked state"),
});

/**
 * Checklist reorder body.
 * @typedef {import("zod").infer<typeof TaskChecklistReorderSchema>} TaskChecklistReorderPayload
 */
const TaskChecklistReorderSchema = z.object({
  item_ids: optionalIdList("Checklist item IDs"),
  itemIds: optionalIdList("Checklist item IDs"),
});

/**
 * Child-relationship payloads (link and blocking-state update).
 * @typedef {import("zod").infer<typeof TaskChildRelationshipSchema>} TaskChildRelationshipPayload
 */
const TaskChildRelationshipSchema = z.object({
  child_task_id: optionalText(160, "Child task ID"),
  childTaskId: optionalText(160, "Child task ID"),
  is_blocking: optionalFlag("Blocking state"),
  blocking: optionalFlag("Blocking state"),
});

/**
 * Validate an untrusted Tasks edge payload: strips unknown (including
 * server-managed audit) fields and converts the first validation issue into
 * the existing AppError envelope.
 *
 * @param {import("zod").ZodType} schema
 * @param {unknown} payload
 * @returns {any} the parsed, stripped payload
 */
function parseTasksEdgePayload(schema, payload) {
  const result = schema.safeParse(payload ?? {});
  if (!result.success) {
    const issue = result.error.issues[0];
    throw new AppError(issue?.message || "Task payload is invalid.", 400);
  }

  return result.data;
}

export {
  CreateTaskSchema,
  TaskChecklistItemCreateSchema,
  TaskChecklistItemUpdateSchema,
  TaskChecklistReorderSchema,
  TaskChildRelationshipSchema,
  TaskRecurrenceSchema,
  UpdateTaskSchema,
  parseTasksEdgePayload,
};
