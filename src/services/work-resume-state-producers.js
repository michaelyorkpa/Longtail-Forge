// @ts-check
import { summarizeActivityEvent } from "../core/events/event-summaries.js";
import { modulesService } from "../core/modules/modules.service.js";
import { workResumeStateService } from "./work-resume-state.service.js";

/** @typedef {import("../types/framework-contracts.js").InternalEvent} InternalEvent */
/** @typedef {Pick<import("../types/http-contracts.js").RequestSession, "workspace_id" | "user_id">} ResumeStateWriteSession */
/** @typedef {import("../types/framework-contracts.js").ResumeStateProducerResult & Record<string, unknown> & {updatedAt?: string, updated_at?: string}} ProducerPayload */
/** @typedef {{event: InternalEvent, helpers: typeof producerHelpers, summary: ReturnType<typeof summarizeActivityEvent>}} ProducerBuilderContext */
/** @typedef {(context: ProducerBuilderContext) => ProducerPayload | null | undefined | Promise<ProducerPayload | null | undefined>} ProducerBuilder */
/** @typedef {{buildPayload: ProducerBuilder, events: string[], id: string, moduleId: string, recordType: string}} ResumeProducerDefinition */
/** @typedef {Pick<ResumeProducerDefinition, "id" | "moduleId" | "recordType">} ResumeProducerIdentity */
/** @typedef {{buildPayload?: unknown, events?: unknown, id?: unknown, moduleId?: unknown, module_id?: unknown, recordType?: unknown, record_type?: unknown}} ResumeProducerDefinitionInput */

/** @type {Map<string, ResumeProducerDefinition>} */
const producerDefinitions = new Map();
/** @type {Array<() => void>} */
let unsubscribeHandlers = [];
let producersRegistered = false;

/** @type {Readonly<Record<string, number>>} */
const STRING_LIMITS = Object.freeze({
  blocked_reason: 1000,
  context_label_snapshot: 240,
  handoff_note: 1000,
  last_action_label: 160,
  last_action_type: 80,
  module_id: 80,
  next_action: 1000,
  priority_snapshot: 80,
  record_id: 160,
  record_type: 80,
  source_url: 1000,
  status_snapshot: 80,
  title_snapshot: 240,
});
const ALLOWED_PAYLOAD_FIELDS = new Set([
  "blocked_reason",
  "blockedReason",
  "client_id",
  "clientId",
  "context_label_snapshot",
  "contextLabelSnapshot",
  "due_at_snapshot",
  "dueAtSnapshot",
  "handoff_note",
  "handoffNote",
  "last_action_label",
  "lastActionLabel",
  "last_action_type",
  "lastActionType",
  "last_worked_at",
  "lastWorkedAt",
  "metadata",
  "metadata_json",
  "metadataJson",
  "module_id",
  "moduleId",
  "next_action",
  "nextAction",
  "priority_snapshot",
  "prioritySnapshot",
  "project_id",
  "projectId",
  "record_id",
  "recordId",
  "record_type",
  "recordType",
  "resume_rank_hint",
  "resumeRankHint",
  "source_url",
  "sourceUrl",
  "status_snapshot",
  "statusSnapshot",
  "title",
  "title_snapshot",
  "titleSnapshot",
  "updated_at",
  "updatedAt",
]);
const FORBIDDEN_FIELD_PATTERNS = [
  /body/i,
  /comment/i,
  /rendered.*html/i,
  /html/i,
  /attachment/i,
  /secure/i,
  /encrypt/i,
  /cipher/i,
  /nonce/i,
  /auth.*tag/i,
  /data.*key/i,
  /storage.*key/i,
  /protected.*path/i,
  /scanner/i,
];
const REMOVE_ACTIONS = new Set(["remove", "delete", "deleted"]);

/** @param {ResumeProducerDefinitionInput} [definition] */
function registerResumeStateProducer(definition = {}) {
  const normalizedDefinition = normalizeProducerDefinition(definition);

  producerDefinitions.set(normalizedDefinition.id, normalizedDefinition);
  return normalizedDefinition.id;
}

function listResumeStateProducerIds() {
  return [...producerDefinitions.keys()].sort();
}

function listResumeStateProducerDefinitions() {
  return [...producerDefinitions.values()].map((definition) => ({
    events: [...definition.events],
    id: definition.id,
    moduleId: definition.moduleId,
    recordType: definition.recordType,
  }));
}

function registerResumeStateProducerEventHandlers() {
  if (producersRegistered) {
    return;
  }

  producersRegistered = true;
  unsubscribeHandlers = [...producerDefinitions.values()].flatMap((definition) => (
    definition.events.map((eventName) => modulesService.onInternalEvent(eventName, async (/** @type {InternalEvent} */ event) => {
      await handleProducerEvent(definition, event);
    }, {
      id: `work-resume:${definition.id}:${eventName}`,
      moduleId: "framework",
    }))
  ));
}

function resetResumeStateProducersForTests() {
  for (const unsubscribe of unsubscribeHandlers) {
    unsubscribe();
  }

  unsubscribeHandlers = [];
  producerDefinitions.clear();
  producersRegistered = false;
}

/** @param {ResumeProducerDefinition} definition @param {InternalEvent} event */
async function handleProducerEvent(definition, event) {
  const session = event.session || null;
  const workspaceId = event.workspace_id || session?.workspace_id || "";
  const moduleId = definition.moduleId || event.module_id || "";

  if (!isResumeStateWriteSession(session) || !workspaceId || workspaceId !== session.workspace_id) {
    return { status: "skipped", reason: "missing_current_user_session" };
  }

  if (!moduleId || !modulesService.getModule(moduleId) || !(await modulesService.canWriteModule(workspaceId, moduleId))) {
    return { status: "skipped", reason: "module_unavailable" };
  }

  let producerResult;

  try {
    producerResult = await definition.buildPayload({
      event,
      helpers: producerHelpers,
      summary: summarizeActivityEvent(event),
    });
  } catch (error) {
    console.warn(`[work-resume] Producer '${definition.id}' skipped event '${event.name}': ${error instanceof Error ? error.message : error}`);
    return { status: "skipped", reason: "producer_failed" };
  }

  if (!producerResult) {
    return { status: "skipped", reason: "empty_payload" };
  }

  if (REMOVE_ACTIONS.has(normalizeText(producerResult.action, 24))) {
    await workResumeStateService.removeResumeStateForRecord(
      workspaceId,
      producerResult.moduleId || producerResult.module_id || moduleId,
      producerResult.recordType || producerResult.record_type || definition.recordType || event.record_type,
      producerResult.recordId || producerResult.record_id || event.record_id,
    );
    return { status: "removed" };
  }

  const payload = buildSafeProducerPayload(definition, event, producerResult);

  if (!payload.moduleId || !payload.recordType || !payload.recordId) {
    return { status: "skipped", reason: "missing_target" };
  }

  await workResumeStateService.upsertResumeState(session, payload);
  return { status: "upserted" };
}

/** @param {unknown} session @returns {session is ResumeStateWriteSession} */
function isResumeStateWriteSession(session) {
  return Boolean(
    session &&
    typeof session === "object" &&
    "workspace_id" in session &&
    typeof session.workspace_id === "string" &&
    session.workspace_id &&
    "user_id" in session &&
    typeof session.user_id === "string" &&
    session.user_id
  );
}

/** @param {ResumeProducerIdentity} definition @param {InternalEvent} event @param {ProducerPayload} [producerPayload] */
function buildSafeProducerPayload(definition, event, producerPayload = {}) {
  const summary = summarizeActivityEvent(event);
  const safePayload = pickAllowedProducerFields(producerPayload);
  const sanitizedMetadata = sanitizeMetadata({
    changed_context: summary.changedContext || null,
    event: event.name,
    producer_id: definition.id,
    ...readMetadata(producerPayload),
  });
  const metadata = sanitizedMetadata && typeof sanitizedMetadata === "object" && !Array.isArray(sanitizedMetadata)
    ? /** @type {Record<string, unknown>} */ (sanitizedMetadata)
    : {};

  return {
    ...safePayload,
    contextLabelSnapshot: safePayload.contextLabelSnapshot || safePayload.context_label_snapshot || summary.changedContext?.summary || summary.summary || "",
    lastActionLabel: safePayload.lastActionLabel || safePayload.last_action_label || summary.label || "",
    lastActionType: safePayload.lastActionType || safePayload.last_action_type || event.name || "",
    metadata,
    moduleId: safePayload.moduleId || safePayload.module_id || definition.moduleId || event.module_id || "",
    recordId: safePayload.recordId || safePayload.record_id || event.record_id || "",
    recordType: safePayload.recordType || safePayload.record_type || definition.recordType || event.record_type || "",
    sourceUrl: safePayload.sourceUrl || safePayload.source_url || summary.url || "",
    title: safePayload.title || safePayload.titleSnapshot || safePayload.title_snapshot || summary.recordLabel || "",
    updatedAt: safePayload.updatedAt || safePayload.updated_at || event.emitted_at || "",
  };
}

/** @param {ProducerPayload} [producerPayload] @returns {ProducerPayload} */
function pickAllowedProducerFields(producerPayload = {}) {
  /** @type {ProducerPayload} */
  const picked = {};

  for (const [key, value] of Object.entries(producerPayload || {})) {
    if (!ALLOWED_PAYLOAD_FIELDS.has(key) || isForbiddenField(key)) {
      continue;
    }

    picked[key] = typeof value === "string"
      ? normalizeText(value, STRING_LIMITS[key] || STRING_LIMITS[snakeCase(key)] || 1000)
      : value;
  }

  return picked;
}

/** @param {unknown} value @param {number} [depth] @returns {unknown} */
function sanitizeMetadata(value, depth = 0) {
  if (depth > 4 || value === null || value === undefined) {
    return null;
  }

  if (Array.isArray(value)) {
    return value
      .map((item) => sanitizeMetadata(item, depth + 1))
      .filter((item) => item !== null && item !== undefined)
      .slice(0, 25);
  }

  if (typeof value !== "object") {
    return typeof value === "string" ? normalizeText(value, 500) : value;
  }

  return Object.fromEntries(Object.entries(value)
    .filter(([key]) => !isForbiddenField(key))
    .map(([key, item]) => [key, sanitizeMetadata(item, depth + 1)])
    .filter(([, item]) => item !== null && item !== undefined));
}

/** @param {ProducerPayload} [producerPayload] @returns {Record<string, unknown>} */
function readMetadata(producerPayload = {}) {
  const metadata = producerPayload.metadata || producerPayload.metadata_json || producerPayload.metadataJson;
  return metadata && typeof metadata === "object" && !Array.isArray(metadata)
    ? /** @type {Record<string, unknown>} */ (metadata)
    : {};
}

/** @param {ResumeProducerDefinitionInput} definition @returns {ResumeProducerDefinition} */
function normalizeProducerDefinition(definition) {
  const id = normalizeRequiredText(definition.id, "Resume state producer ID", 120);
  const moduleId = normalizeRequiredText(definition.moduleId || definition.module_id, "Resume state producer module ID", 80);
  const recordType = normalizeRequiredText(definition.recordType || definition.record_type, "Resume state producer record type", 80);
  const events = Array.isArray(definition.events)
    ? [...new Set(definition.events.map((event) => normalizeText(event, 120)).filter(Boolean))]
    : [];

  if (events.length === 0) {
    throw new TypeError(`Resume state producer '${id}' must declare at least one event.`);
  }

  if (typeof definition.buildPayload !== "function") {
    throw new TypeError(`Resume state producer '${id}' must provide buildPayload.`);
  }

  return {
    buildPayload: /** @type {ProducerBuilder} */ (definition.buildPayload),
    events,
    id,
    moduleId,
    recordType,
  };
}

/** @param {unknown} value @param {string} label @param {number} [limit] */
function normalizeRequiredText(value, label, limit) {
  const normalized = normalizeText(value, limit);

  if (!normalized) {
    throw new TypeError(`${label} is required.`);
  }

  return normalized;
}

/**
 * @param {unknown} value
 * @param {number | undefined} limit
 */
function normalizeText(value, limit) {
  return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, limit);
}

/**
 * @param {string} fieldName
 */
function isForbiddenField(fieldName) {
  const normalizedFieldName = String(fieldName || "");

  return FORBIDDEN_FIELD_PATTERNS.some((pattern) => pattern.test(normalizedFieldName));
}

/**
 * @param {string} value
 */
function snakeCase(value) {
  return String(value || "").replace(/[A-Z]/g, (match) => `_${match.toLowerCase()}`);
}

const producerHelpers = Object.freeze({
  buildSafeProducerPayload,
  sanitizeMetadata,
});

export {
  ALLOWED_PAYLOAD_FIELDS,
  buildSafeProducerPayload,
  isForbiddenField,
  listResumeStateProducerDefinitions,
  listResumeStateProducerIds,
  registerResumeStateProducer,
  registerResumeStateProducerEventHandlers,
  resetResumeStateProducersForTests,
  sanitizeMetadata,
};
