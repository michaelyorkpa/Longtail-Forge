import { auditService } from "../services/audit.service.js";
import { internalEventBus } from "../core/events/event-bus.js";
import { userWorkspacesRepository } from "../repositories/user-workspaces.repo.js";

/** @typedef {import("../types/framework-contracts.js").InternalEvent} InternalEvent */
/** @typedef {{ user_id?: string, username?: string, workspace_id?: string | null, ip_address?: string | null }} SecurityEventSession */
/** @typedef {{ home_workspace_id?: unknown, active_workspace_id?: unknown }} SecurityEventUser */
/** @typedef {{ eventType?: unknown, outcome?: unknown, reasonClass?: unknown, attemptedUsername?: unknown, metadata?: Record<string, unknown> | null, actorUserId?: unknown, actorUserName?: unknown, createdAt?: unknown, ipAddress?: unknown, recordId?: unknown, session?: SecurityEventSession | null, workspaceId?: unknown, user?: SecurityEventUser | null }} SecurityEventInput */
/** @typedef {{ source: string, workspaceId: string | null }} SecurityWorkspaceResolution */

const SECURITY_CHANGE_TYPE = "security";
const SECURITY_RECORD_TYPE = "security_event";
const MAX_METADATA_DEPTH = 4;
const MAX_METADATA_STRING_LENGTH = 512;
const SECRET_FIELD_PATTERN = /(?:authorization|cookie|credential|hash|password|secret|session_?id|session_?reference|token)/i;
const SAFE_SECRET_FIELD_NAME_EXCEPTIONS = new Set(["rehash_reason"]);
const SAFE_METADATA_FIELDS = new Set([
  "attempted_username",
  "change_required",
  "change_requirement_cleared",
  "changed_own_password",
  "client_ip",
  "dimensions",
  "event_type",
  "logging_enabled",
  "new_algorithm",
  "capability_id",
  "limit",
  "operation",
  "outcome",
  "permission",
  "previous_algorithm",
  "reason",
  "reason_class",
  "rehash_reason",
  "resource_type",
  "retention_days",
  "request_id",
  "retry_after_seconds",
  "revocation_scope",
  "revoked_current_session",
  "revoked_other_session_count",
  "revoked_session_count",
  "revoked_session_index",
  "route_class",
  "scope",
  "target_user_id",
  "window_seconds",
  "workspace_resolution",
]);

const INTERNAL_SECURITY_EVENTS = Object.freeze({
  "security.authentication_throttle.lockout": { outcome: "blocked", reasonClass: "throttled" },
  "security.public_demo.capability_denied": { outcome: "blocked", reasonClass: "capability_denied" },
  "security.public_demo.perimeter_limited": { outcome: "blocked", reasonClass: "rate_limited" },
  "security.password.changed": { outcome: "success", reasonClass: "password_changed" },
  "security.password.rehashed": { outcome: "success", reasonClass: "password_rehashed" },
  "security.password.reset": { outcome: "success", reasonClass: "password_reset" },
  "security.session.revoked": { outcome: "success", reasonClass: "session_revoked" },
});

/** @param {SecurityEventInput} [event] */
async function record(event = {}) {
  try {
    const workspaceResolution = await resolveWorkspaceId(event);

    if (!workspaceResolution.workspaceId) {
      return null;
    }

    const eventType = normalizeEventType(event.eventType);
    const outcome = normalizeClassification(event.outcome, "unknown");
    const reasonClass = normalizeClassification(event.reasonClass, "unspecified");
    const attemptedUsername = normalizeUsername(event.attemptedUsername);
    const metadata = sanitizeMetadata({
      ...(event.metadata || {}),
      attempted_username: attemptedUsername || undefined,
      event_type: eventType,
      outcome,
      reason_class: reasonClass,
      workspace_resolution: workspaceResolution.source,
    });

    return await auditService.record({
      action: eventType,
      actorUserId: event.actorUserId ?? event.session?.user_id ?? null,
      actorUserName: event.actorUserName ?? attemptedUsername ?? event.session?.username ?? null,
      allowUnknownRecordType: false,
      changeType: SECURITY_CHANGE_TYPE,
      createdAt: event.createdAt,
      force: true,
      ipAddress: normalizeIpAddress(event.ipAddress || event.session?.ip_address),
      metadata,
      recordId: null,
      recordLabel: "Security event",
      recordType: SECURITY_RECORD_TYPE,
      session: event.session,
      workspaceId: workspaceResolution.workspaceId,
    });
  } catch {
    console.warn("[security-events] Security event persistence failed.");
    return null;
  }
}

function registerEventHandlers() {
  const subscriptions = new Set(
    internalEventBus.listSubscriptions().map((subscription) => subscription.hookId),
  );

  for (const [eventName, defaults] of Object.entries(INTERNAL_SECURITY_EVENTS)) {
    const hookId = `framework:security-events:${eventName}`;
    if (subscriptions.has(hookId)) {
      continue;
    }

    internalEventBus.on(eventName, async (/** @type {InternalEvent} */ event) => {
      await record({
        actorUserId: event.actor_user_id,
        actorUserName: event.session?.username,
        createdAt: event.emitted_at,
        eventType: event.name,
        ipAddress: event.metadata?.client_ip || event.session?.ip_address,
        metadata: event.metadata,
        outcome: event.metadata?.outcome || defaults.outcome,
        reasonClass: event.metadata?.reason_class || event.metadata?.reason || defaults.reasonClass,
        recordId: event.record_id,
        session: event.session,
        workspaceId: event.workspace_id,
      });
    }, {
      id: hookId,
      moduleId: "framework",
    });
  }
}

/** @param {SecurityEventInput} event @returns {Promise<SecurityWorkspaceResolution>} */
async function resolveWorkspaceId(event) {
  const explicitWorkspaceId = nullableText(event.workspaceId || event.session?.workspace_id);
  if (explicitWorkspaceId) {
    return { source: "event", workspaceId: explicitWorkspaceId };
  }

  const userWorkspaceId = nullableText(event.user?.home_workspace_id || event.user?.active_workspace_id);
  if (userWorkspaceId) {
    return { source: "user", workspaceId: userWorkspaceId };
  }

  const installWorkspace = await userWorkspacesRepository.readInstallSecurityWorkspace();
  return {
    source: "install_default",
    workspaceId: nullableText(installWorkspace?.workspace_id),
  };
}

/** @param {unknown} value @param {number} [depth] @returns {Record<string, unknown>} */
function sanitizeMetadata(value, depth = 0) {
  if (!value || typeof value !== "object" || depth >= MAX_METADATA_DEPTH) {
    return {};
  }

  return Object.fromEntries(Object.entries(value).flatMap(([key, item]) => {
    const normalizedKey = String(key || "").trim();
    const looksSecret = SECRET_FIELD_PATTERN.test(normalizedKey) && !SAFE_SECRET_FIELD_NAME_EXCEPTIONS.has(normalizedKey);
    if (!normalizedKey || looksSecret || item === undefined || (depth === 0 && !SAFE_METADATA_FIELDS.has(normalizedKey))) {
      return [];
    }

    if (Array.isArray(item)) {
      return [[normalizedKey, item.slice(0, 50).map((entry) => sanitizeMetadataValue(entry, depth + 1))]];
    }

    if (item && typeof item === "object") {
      return [[normalizedKey, sanitizeMetadata(item, depth + 1)]];
    }

    return [[normalizedKey, sanitizeMetadataValue(item, depth + 1)]];
  }));
}

/** @param {unknown} value @param {number} depth @returns {unknown} */
function sanitizeMetadataValue(value, depth) {
  if (value && typeof value === "object") {
    return sanitizeMetadata(value, depth);
  }

  if (typeof value === "string") {
    return value.slice(0, MAX_METADATA_STRING_LENGTH);
  }

  if (["boolean", "number"].includes(typeof value) || value === null) {
    return value;
  }

  return String(value ?? "").slice(0, MAX_METADATA_STRING_LENGTH);
}

/** @param {unknown} value @returns {string} */
function normalizeEventType(value) {
  return String(value || "security.unknown")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]/g, "")
    .slice(0, 128) || "security.unknown";
}

/** @param {unknown} value @param {string} fallback @returns {string} */
function normalizeClassification(value, fallback) {
  return String(value || fallback)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]/g, "")
    .slice(0, 64) || fallback;
}

/** @param {unknown} value @returns {string} */
function normalizeIpAddress(value) {
  return String(value || "").replace(/^::ffff:/, "").trim().slice(0, 128);
}

/** @param {unknown} value @returns {string | null} */
function normalizeUsername(value) {
  return nullableText(value)?.toLowerCase().slice(0, 320) || null;
}

/** @param {unknown} value @returns {string | null} */
function nullableText(value) {
  if (value === null || value === undefined) {
    return null;
  }

  const text = String(value).trim();
  return text || null;
}

export const securityEventsService = {
  record,
  registerEventHandlers,
};

export {
  SECURITY_CHANGE_TYPE,
  SECURITY_RECORD_TYPE,
  sanitizeMetadata as sanitizeSecurityEventMetadata,
};
