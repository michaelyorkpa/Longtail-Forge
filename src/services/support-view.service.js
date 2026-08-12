// @ts-check
import { config } from "../config.js";
import { boundedPaginationEnvelope, normalizeBoundedPagination } from "../core/bounded-pagination.js";
import { db } from "../core/database.js";
import { createOpaqueId } from "../core/identifiers.js";
import { sessionsRepository } from "../repositories/sessions.repo.js";
import { supportSessionsRepository } from "../repositories/support-sessions.repo.js";
import { userWorkspacesRepository } from "../repositories/user-workspaces.repo.js";
import { usersRepository } from "../repositories/users.repo.js";
import { prepareSessionRecord } from "../security/session-records.js";
import { verifyCurrentPasswordForSensitiveAction } from "../security/current-password-verification.js";
import { permissionsService } from "./permissions.service.js";
import { AppError } from "../utils/app-error.js";
import { assertPublicDemoCapabilityAllowed } from "../core/public-demo-enforcement.js";
import { localDateBoundToUtcIso, normalizeUtcIso } from "../utils/timezones.js";

/** @typedef {import("../types/http-contracts.js").RequestSession} RequestSession */
/** @typedef {import("../types/http-contracts.js").SupportViewRequestSession} SupportViewRequestSession */
/** @typedef {import("../types/support-view-contracts.js").ActiveSupportViewBrowserSessionRow} ActiveSupportViewBrowserSessionRow */
/** @typedef {import("../types/support-view-contracts.js").NormalizedSupportViewAuditFilters} NormalizedSupportViewAuditFilters */
/** @typedef {import("../types/support-view-contracts.js").SupportViewActionAttempt} SupportViewActionAttempt */
/** @typedef {import("../types/support-view-contracts.js").SupportViewAuditFilters} SupportViewAuditFilters */
/** @typedef {import("../types/support-view-contracts.js").SupportViewAuditOptions} SupportViewAuditOptions */
/** @typedef {import("../types/support-view-contracts.js").SupportViewAuditRow} SupportViewAuditRow */
/** @typedef {import("../types/support-view-contracts.js").SupportViewBrowserSessionRow} SupportViewBrowserSessionRow */
/** @typedef {import("../types/support-view-contracts.js").SupportViewEligibilityRow} SupportViewEligibilityRow */
/** @typedef {import("../types/support-view-contracts.js").SupportViewEndOptions} SupportViewEndOptions */
/** @typedef {import("../types/support-view-contracts.js").SupportViewEventInput} SupportViewEventInput */
/** @typedef {import("../types/support-view-contracts.js").SupportViewEventOutcome} SupportViewEventOutcome */
/** @typedef {import("../types/support-view-contracts.js").SupportViewEventType} SupportViewEventType */
/** @typedef {import("../types/support-view-contracts.js").SupportViewInvalidState} SupportViewInvalidState */
/** @typedef {import("../types/support-view-contracts.js").SupportViewOperatorSession} SupportViewOperatorSession */
/** @typedef {import("../types/support-view-contracts.js").SupportViewPublicRow} SupportViewPublicRow */
/** @typedef {import("../types/support-view-contracts.js").SupportViewServiceContext} SupportViewServiceContext */
/** @typedef {import("../types/support-view-contracts.js").SupportViewStartPayload} SupportViewStartPayload */
/** @typedef {import("../types/support-view-contracts.js").SupportViewStoredSessionRow} SupportViewStoredSessionRow */
/** @typedef {import("../types/support-view-contracts.js").SupportViewTargetRow} SupportViewTargetRow */
/** @typedef {{ workspace_id: string }} ActiveMembership */
/** @typedef {{ workspaceId: string, workspaceName: string, label: string }} SupportViewTargetWorkspace */
/** @typedef {{ userId: string, username: string, displayName: string, label: string, workspaces: SupportViewTargetWorkspace[] }} SupportViewTarget */
/** @typedef {{ eventType: SupportViewEventType, outcome: SupportViewEventOutcome, supportSessionId: string, actorUserId: string, effectiveUserId: string, workspaceId: string, requestId: string, occurredAt: string, routeId?: string, actionId?: string, reasonClass?: string, metadata?: Record<string, unknown> }} SupportViewEventValue */

const SUPPORT_VIEW_AUDIT_RETENTION_DAYS = 365;
const SUPPORT_VIEW_AUDIT_DEFAULT_PAGE_SIZE = 50;
const SUPPORT_VIEW_AUDIT_MAX_PAGE_SIZE = 200;
const SUPPORT_VIEW_AUDIT_EXPORT_LIMIT = 1000;

/** @param {RequestSession | null | undefined} session */
async function listTargets(session) {
  assertPublicDemoCapabilityAllowed("support_view");
  const operator = await assertOperator(session);
  const rows = await supportSessionsRepository.listEligibleTargets(operator.user_id);
  /** @type {SupportViewTarget[]} */
  const targets = [];
  /** @type {Map<string, SupportViewTarget>} */
  const byUserId = new Map();

  rows.forEach((row) => {
    let target = byUserId.get(row.user_id);
    if (!target) {
      const displayName = displayLabel(row.display_name, row.username);
      target = {
        userId: row.user_id,
        username: row.username,
        displayName,
        label: displayName === row.username ? row.username : `${displayName} (${row.username})`,
        workspaces: [],
      };
      byUserId.set(row.user_id, target);
      targets.push(target);
    }
    target.workspaces.push({
      workspaceId: row.workspace_id,
      workspaceName: row.workspace_name,
      label: row.workspace_name,
    });
  });

  return {
    actor: {
      userId: operator.user_id,
      username: operator.username,
      label: operator.username,
    },
    expiresInSeconds: config.supportView.ttlSeconds,
    targets,
  };
}

/**
 * @param {RequestSession | null | undefined} session
 * @param {SupportViewAuditFilters} [filters]
 * @param {SupportViewAuditOptions} [options]
 */
async function listAudit(session, filters = {}, options = {}) {
  assertPublicDemoCapabilityAllowed("support_view");
  const operator = await assertOperator(session);
  const cutoffIso = retentionCutoff(options.now);
  await supportSessionsRepository.pruneBefore(cutoffIso);
  const normalizedFilters = normalizeAuditFilters(filters, operator.timezone, cutoffIso);
  const pagination = normalizeBoundedPagination(filters, {
    defaultLimit: SUPPORT_VIEW_AUDIT_DEFAULT_PAGE_SIZE,
    maxLimit: options.maxPageSize || SUPPORT_VIEW_AUDIT_MAX_PAGE_SIZE,
  });
  const repositoryFilters = {
    ...normalizedFilters,
    limit: pagination.limit,
    offset: pagination.offset,
  };
  const [events, total, filterOptions] = await Promise.all([
    supportSessionsRepository.searchAudit(repositoryFilters),
    supportSessionsRepository.countAudit(repositoryFilters),
    supportSessionsRepository.readAuditFilterOptions(cutoffIso),
  ]);

  return {
    events: events.map(toAuditEvent),
    exportLimit: SUPPORT_VIEW_AUDIT_EXPORT_LIMIT,
    filterOptions,
    pagination: boundedPaginationEnvelope({
      ...pagination,
      hasMore: pagination.offset + events.length < total,
      returned: events.length,
      total,
    }),
    retentionDays: SUPPORT_VIEW_AUDIT_RETENTION_DAYS,
  };
}

/** @param {RequestSession | null | undefined} session @param {SupportViewAuditFilters} [filters] */
async function exportAuditCsv(session, filters = {}) {
  assertPublicDemoCapabilityAllowed("support_view");
  const result = await listAudit(session, {
    ...filters,
    limit: SUPPORT_VIEW_AUDIT_EXPORT_LIMIT,
    offset: 0,
  }, { maxPageSize: SUPPORT_VIEW_AUDIT_EXPORT_LIMIT });
  const headers = [
    "occurred_at",
    "actor",
    "viewed_user",
    "workspace",
    "event_type",
    "action_id",
    "route_id",
    "outcome",
    "reason_class",
    "reason_reference",
  ];
  const rows = result.events.map((event) => [
    event.occurredAt,
    event.actorLabel,
    event.effectiveUserLabel,
    event.workspaceName,
    event.eventType,
    event.actionId,
    event.routeId,
    event.outcome,
    event.reasonClass,
    event.reasonReference,
  ].map(csvValue).join(","));
  return `${headers.join(",")}\n${rows.join("\n")}${rows.length ? "\n" : ""}`;
}

/**
 * @param {RequestSession | null | undefined} session
 * @param {string} currentSessionId
 * @param {SupportViewStartPayload} [payload]
 * @param {SupportViewServiceContext} [context]
 */
async function start(session, currentSessionId, payload = {}, context = {}) {
  assertPublicDemoCapabilityAllowed("support_view");
  if (!config.supportView.enabled) {
    throw new AppError("Support View is disabled for this installation.", 403);
  }
  if (!session || session.session_mode !== "normal" || session.support_view) {
    throw new AppError("Support View cannot be nested or started from this session mode.", 409);
  }

  const effectiveUserId = normalizeId(payload.effectiveUserId || payload.effective_user_id);
  const workspaceId = normalizeId(payload.workspaceId || payload.workspace_id);
  const reasonReference = normalizeReasonReference(payload.reasonReference || payload.reason_reference);
  if (!effectiveUserId || !workspaceId) {
    throw new AppError("A target user and workspace are required.", 400);
  }
  if (effectiveUserId === session.user_id) {
    throw new AppError("Support View cannot target the current administrator.", 400);
  }

  await permissionsService.assertCan(session, "support_view.enter", {
    operation: "create",
    workspace_id: workspaceId,
  });
  await verifyCurrentPasswordForSensitiveAction(session, payload.currentPassword, {
    ipAddress: context.ipAddress || session.ip_address,
    scope: "support-view",
  });

  const storedSession = await sessionsRepository.readById(currentSessionId);
  if (!storedSession || storedSession.user_id !== session.user_id || storedSession.support_session_id) {
    throw new AppError("The current session changed. Sign in and try again.", 409);
  }

  const now = normalizeNow(context.now);
  const requestId = normalizeRequestId(context.requestId);
  const supportSessionId = createOpaqueId();
  const startState = await db.transaction(async (transaction) => {
    const freshSession = await sessionsRepository.readById(currentSessionId, transaction);
    if (
      !freshSession
      || freshSession.user_id !== session.user_id
      || freshSession.session_mode !== "normal"
      || freshSession.support_session_id
      || new Date(freshSession.expires_at).getTime() <= now.getTime()
    ) {
      throw new AppError("The current session changed. Sign in and try again.", 409);
    }
    const expiresAt = new Date(Math.min(
      now.getTime() + config.supportView.ttlSeconds * 1000,
      new Date(freshSession.expires_at).getTime(),
    ));
    const eligibility = await supportSessionsRepository.readEligibility(
      session.user_id,
      effectiveUserId,
      workspaceId,
      transaction,
    );
    assertEligible(eligibility);

    const prepared = prepareSessionRecord({
      user_id: eligibility.actor_user_id,
      username: eligibility.actor_username,
      home_workspace_id: freshSession.home_workspace_id,
      active_workspace_id: workspaceId,
      timezone: freshSession.timezone,
      ip_address: context.ipAddress || freshSession.ip_address,
      session_mode: "normal",
      support_session_id: supportSessionId,
    }, { expiresAt: freshSession.expires_at });

    const timestamp = now.toISOString();
    await supportSessionsRepository.create({
      supportSessionId,
      actorUserId: eligibility.actor_user_id,
      actorUsername: eligibility.actor_username,
      actorHomeWorkspaceId: freshSession.home_workspace_id,
      actorWorkspaceId: freshSession.active_workspace_id,
      effectiveUserId: eligibility.effective_user_id,
      effectiveUsername: eligibility.effective_username,
      workspaceId,
      reasonReference,
      startRequestId: requestId,
      startedAt: timestamp,
      expiresAt: expiresAt.toISOString(),
      createdAt: timestamp,
      updatedAt: timestamp,
    }, createEvent({
      supportSessionId,
      actorUserId: eligibility.actor_user_id,
      effectiveUserId,
      workspaceId,
      eventType: "entered",
      outcome: "success",
      requestId,
      occurredAt: timestamp,
      metadata: { expiry_seconds: config.supportView.ttlSeconds },
    }), transaction);
    await sessionsRepository.create(prepared.record, transaction);
    await sessionsRepository.remove(currentSessionId, transaction);
    return { eligibility, expiresAt, prepared };
  });

  return {
    session: startState.prepared.cookie,
    supportView: toPublicSupportView({
      support_session_id: supportSessionId,
      actor_user_id: startState.eligibility.actor_user_id,
      actor_username: startState.eligibility.actor_username,
      actor_display_name: startState.eligibility.actor_display_name,
      effective_user_id: startState.eligibility.effective_user_id,
      effective_username: startState.eligibility.effective_username,
      effective_display_name: startState.eligibility.effective_display_name,
      workspace_id: workspaceId,
      workspace_name: startState.eligibility.workspace_name,
      started_at: now.toISOString(),
      expires_at: startState.expiresAt.toISOString(),
    }),
  };
}

/** @param {SupportViewRequestSession} session @param {string} currentSessionId @param {SupportViewServiceContext} [context] */
async function exit(session, currentSessionId, context = {}) {
  const { storedSession, supportSession } = await readActiveSupportSession(session, currentSessionId);

  const result = await endAndRotate(storedSession, supportSession, {
    eventType: "exited",
    outcome: "exited",
    requestId: normalizeRequestId(context.requestId),
    now: normalizeNow(context.now),
    reasonClass: "administrator_exit",
  });
  if (!result.session) {
    throw new AppError("The administrator session is no longer available.", 401);
  }
  return { ok: true, session: result.session };
}

/** @param {SupportViewRequestSession} session @param {string} currentSessionId @param {SupportViewServiceContext} [context] */
async function endForLogout(session, currentSessionId, context = {}) {
  const { storedSession, supportSession } = await readActiveSupportSession(session, currentSessionId);
  const result = await endAndRotate(storedSession, supportSession, {
    eventType: "exited",
    outcome: "exited",
    requestId: normalizeRequestId(context.requestId),
    now: normalizeNow(context.now),
    reasonClass: "administrator_logout",
    restoreSession: false,
  });
  return { ok: true, actorSession: result.actorSession };
}

/** @param {SupportViewRequestSession} session @param {string} currentSessionId */
async function readActiveSupportSession(session, currentSessionId) {
  if (!session?.support_view?.supportSessionId) {
    throw new AppError("Support View is not active.", 409);
  }
  const storedSession = await sessionsRepository.readById(currentSessionId);
  if (!storedSession || storedSession.support_session_id !== session.support_view.supportSessionId) {
    throw new AppError("The current support session changed. Sign in and try again.", 409);
  }
  const supportSession = await supportSessionsRepository.readById(storedSession.support_session_id);
  if (!supportSession || supportSession.ended_at) {
    throw new AppError("Support View is no longer active.", 409);
  }
  return { storedSession, supportSession };
}

/** @param {ActiveSupportViewBrowserSessionRow} storedSession @param {SupportViewServiceContext} [context] */
async function resolveForRequest(storedSession, context = {}) {
  const supportSession = await supportSessionsRepository.readById(storedSession.support_session_id);
  if (!supportSession) {
    await sessionsRepository.remove(storedSession.session_id);
    return { storedSession: null };
  }

  const invalid = classifyInvalidState(supportSession, normalizeNow(context.now));
  if (invalid) {
    return endAndRotate(storedSession, supportSession, {
      eventType: invalid.eventType,
      outcome: invalid.outcome,
      requestId: normalizeRequestId(context.requestId),
      now: normalizeNow(context.now),
      reasonClass: invalid.reasonClass,
    });
  }

  return { storedSession, supportSession };
}

/** @param {SupportViewRequestSession} session @param {SupportViewActionAttempt} action @param {SupportViewServiceContext} [context] */
async function recordAction(session, action, context = {}) {
  if (!session?.support_view?.supportSessionId) {
    return null;
  }

  const timestamp = normalizeNow(context.now).toISOString();
  const event = createEvent({
    supportSessionId: session.support_view.supportSessionId,
    actorUserId: session.actor_user_id,
    effectiveUserId: session.effective_user_id,
    workspaceId: session.effective_workspace_id,
    eventType: "action_attempt",
    outcome: action.outcome === "allowed" ? "allowed" : "denied",
    requestId: normalizeRequestId(context.requestId),
    occurredAt: timestamp,
    routeId: normalizeAuditIdentifier(action.routeId),
    actionId: normalizeAuditIdentifier(action.actionId),
    reasonClass: normalizeAuditIdentifier(action.reasonClass),
    metadata: {},
  });
  await supportSessionsRepository.appendEvent(event);
  return event;
}

/** @param {SupportViewBrowserSessionRow} storedSession @param {SupportViewStoredSessionRow} supportSession @param {SupportViewEndOptions} options */
async function endAndRotate(storedSession, supportSession, options) {
  const actor = await usersRepository.readFirstByUserId(supportSession.actor_user_id);
  const activeMemberships = actor?.user_status === "active"
    ? await userWorkspacesRepository.readActiveForUser(actor.user_id)
    : [];
  const restoreWorkspaceId = chooseRestoreWorkspace(supportSession, activeMemberships);
  const canRepresentActor = actor
    && actor.user_status === "active"
    && restoreWorkspaceId
    && new Date(storedSession.expires_at).getTime() > options.now.getTime()
    ? actor
    : null;
  let actorSession = canRepresentActor
    ? {
      user_id: canRepresentActor.user_id,
      username: canRepresentActor.username,
      timezone: canRepresentActor.timezone,
      home_workspace_id: canRepresentActor.home_workspace_id || restoreWorkspaceId,
      active_workspace_id: restoreWorkspaceId,
      workspace_id: restoreWorkspaceId,
      ip_address: storedSession.ip_address,
      session_mode: "normal",
    }
    : null;
  let prepared = actorSession && options.restoreSession !== false
    ? prepareSessionRecord(actorSession, { expiresAt: storedSession.expires_at })
    : null;
  if (supportSession.ended_at) {
    prepared = null;
    actorSession = null;
  }
  const timestamp = options.now.toISOString();

  await db.transaction(async (transaction) => {
    if (!supportSession.ended_at) {
      const ended = await supportSessionsRepository.end({
        supportSessionId: supportSession.support_session_id,
        endedAt: timestamp,
        endRequestId: options.requestId,
        outcome: options.outcome,
        updatedAt: timestamp,
      }, createEvent({
        supportSessionId: supportSession.support_session_id,
        actorUserId: supportSession.actor_user_id,
        effectiveUserId: supportSession.effective_user_id,
        workspaceId: supportSession.workspace_id,
        eventType: options.eventType,
        outcome: options.outcome === "exited" ? "success" : options.outcome,
        requestId: options.requestId,
        occurredAt: timestamp,
        metadata: { reason_class: options.reasonClass },
      }), transaction);
      if (!ended) {
        prepared = null;
        actorSession = null;
      }
    }
    if (prepared) {
      await sessionsRepository.create(prepared.record, transaction);
    }
    await sessionsRepository.remove(storedSession.session_id, transaction);
  });

  return {
    actorSession,
    session: prepared?.cookie || null,
    storedSession: prepared?.record || null,
  };
}

/** @param {SupportViewEligibilityRow | null} row @returns {asserts row is SupportViewEligibilityRow} */
function assertEligible(row) {
  if (!row || row.actor_status !== "active" || Number(row.actor_has_support_permission) !== 1) {
    throw new AppError("Support View is not available for this administrator.", 403);
  }
  if (
    row.effective_status !== "active"
    || row.effective_membership_status !== "active"
    || String(row.workspace_status).toLowerCase() !== "active"
  ) {
    throw new AppError("The selected support target is unavailable.", 409);
  }
}

/** @param {SupportViewStoredSessionRow} row @param {Date} now @returns {SupportViewInvalidState | null} */
function classifyInvalidState(row, now) {
  if (row.ended_at) {
    return { eventType: "terminated", outcome: "revoked", reasonClass: "already_ended" };
  }
  if (!config.supportView.enabled) {
    return { eventType: "terminated", outcome: "disabled", reasonClass: "runtime_gate_disabled" };
  }
  if (new Date(row.expires_at).getTime() <= now.getTime()) {
    return { eventType: "expired", outcome: "expired", reasonClass: "expiry_reached" };
  }
  if (row.actor_status !== "active") {
    return { eventType: "terminated", outcome: "revoked", reasonClass: "actor_inactive" };
  }
  if (Number(row.actor_has_support_permission) !== 1) {
    return { eventType: "terminated", outcome: "revoked", reasonClass: "actor_permission_revoked" };
  }
  if (row.effective_status !== "active") {
    return { eventType: "terminated", outcome: "revoked", reasonClass: "target_inactive" };
  }
  if (row.effective_membership_status !== "active") {
    return { eventType: "terminated", outcome: "revoked", reasonClass: "target_membership_revoked" };
  }
  if (String(row.workspace_status).toLowerCase() !== "active") {
    return { eventType: "terminated", outcome: "revoked", reasonClass: "workspace_inactive" };
  }
  return null;
}

/** @param {SupportViewStoredSessionRow} supportSession @param {ActiveMembership[]} memberships */
function chooseRestoreWorkspace(supportSession, memberships) {
  const candidates = [supportSession.actor_workspace_id, supportSession.actor_home_workspace_id];
  for (const candidate of candidates) {
    if (memberships.some((membership) => membership.workspace_id === candidate)) {
      return candidate;
    }
  }
  return memberships[0]?.workspace_id || null;
}

/** @param {SupportViewEventValue} value @returns {SupportViewEventInput} */
function createEvent(value) {
  return {
    eventId: createOpaqueId(),
    supportSessionId: value.supportSessionId,
    actorUserId: value.actorUserId,
    effectiveUserId: value.effectiveUserId,
    workspaceId: value.workspaceId,
    eventType: value.eventType,
    outcome: value.outcome,
    requestId: value.requestId,
    routeId: value.routeId || null,
    actionId: value.actionId || null,
    reasonClass: value.reasonClass || null,
    metadataJson: JSON.stringify(value.metadata || {}),
    occurredAt: value.occurredAt,
  };
}

/** @param {unknown} value */
function normalizeAuditIdentifier(value) {
  const normalized = String(value || "").trim();
  return /^[a-z0-9._:-]{1,160}$/i.test(normalized) ? normalized : "unspecified";
}

/** @param {SupportViewPublicRow} row */
function toPublicSupportView(row) {
  return {
    supportSessionId: row.support_session_id,
    actorUserId: row.actor_user_id,
    actorUsername: row.actor_username,
    actorLabel: displayLabel(row.actor_display_name, row.actor_username),
    effectiveUserId: row.effective_user_id,
    effectiveUsername: row.effective_username,
    effectiveUserLabel: displayLabel(row.effective_display_name, row.effective_username),
    effectiveWorkspaceId: row.workspace_id,
    effectiveWorkspaceName: row.workspace_name || "Workspace unavailable",
    startedAt: row.started_at,
    expiresAt: row.expires_at,
  };
}

/** @param {RequestSession | null | undefined} session @returns {Promise<SupportViewOperatorSession>} */
async function assertOperator(session) {
  if (!config.supportView.enabled) {
    throw new AppError("Support View is disabled for this installation.", 403);
  }
  if (!isSupportViewOperatorSession(session)) {
    throw new AppError("Not found.", 404);
  }
  if (!(await permissionsService.isSuperAdmin(session))) {
    throw new AppError("Support View is not available for this administrator.", 403);
  }
  await permissionsService.assertCan(session, "support_view.enter", {
    operation: "read",
    workspace_id: session.workspace_id,
  });
  return session;
}

/**
 * @param {RequestSession | null | undefined} session
 * @returns {session is SupportViewOperatorSession}
 */
function isSupportViewOperatorSession(session) {
  return Boolean(
    session
    && session.session_mode === "normal"
    && !session.support_view
    && session.workspace_id
    && session.active_workspace_id
  );
}

/** @param {SupportViewAuditFilters} filters @param {string} timezone @param {string} cutoffIso @returns {NormalizedSupportViewAuditFilters} */
function normalizeAuditFilters(filters, timezone, cutoffIso) {
  return {
    actorUserId: normalizeId(filters.actorUserId),
    cutoffIso,
    dateFrom: normalizeAuditDate(filters.dateFrom, timezone, "start"),
    dateTo: normalizeAuditDate(filters.dateTo, timezone, "end"),
    effectiveUserId: normalizeId(filters.effectiveUserId),
    eventType: normalizeAuditChoice(filters.eventType, ["entered", "exited", "expired", "terminated", "action_attempt"]),
    outcome: normalizeAuditChoice(filters.outcome, ["success", "expired", "revoked", "disabled", "allowed", "denied"]),
    workspaceId: normalizeId(filters.workspaceId),
  };
}

/** @param {unknown} value @param {string} timezone @param {"start" | "end"} edge */
function normalizeAuditDate(value, timezone, edge) {
  const normalized = String(value || "").trim();
  if (!normalized) {
    return "";
  }
  return /^\d{4}-\d{2}-\d{2}$/.test(normalized)
    ? localDateBoundToUtcIso(normalized, timezone, edge)
    : normalizeUtcIso(normalized, timezone);
}

/** @param {unknown} value @param {readonly string[]} allowed */
function normalizeAuditChoice(value, allowed) {
  const normalized = String(value || "").trim();
  return allowed.includes(normalized) ? normalized : "";
}

/** @param {unknown} [now] */
function retentionCutoff(now = Date.now()) {
  const timestamp = now instanceof Date
    ? now.getTime()
    : typeof now === "string" || typeof now === "number"
      ? new Date(now).getTime()
      : Number.NaN;
  return new Date(timestamp - SUPPORT_VIEW_AUDIT_RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString();
}

/** @param {SupportViewAuditRow} row */
function toAuditEvent(row) {
  return {
    actionId: row.action_id || "",
    actorLabel: displayLabel(row.actor_display_name, row.actor_username),
    effectiveUserLabel: displayLabel(row.effective_display_name, row.effective_username),
    eventType: row.event_type,
    occurredAt: row.occurred_at,
    outcome: row.outcome,
    reasonClass: row.reason_class || "",
    reasonReference: row.reason_reference,
    routeId: row.route_id || "",
    sessionOutcome: row.session_outcome,
    workspaceName: row.workspace_name || "Workspace unavailable",
  };
}

/** @param {unknown} displayName @param {unknown} username */
function displayLabel(displayName, username) {
  return String(displayName || username || "User unavailable").trim();
}

/** @param {unknown} value */
function csvValue(value) {
  const text = String(value ?? "");
  const safeText = /^[\t\r ]*[=+\-@]/.test(text) ? `'${text}` : text;
  const quote = String.fromCharCode(34);
  const needsQuotes = safeText.includes(",") || safeText.includes(quote)
    || safeText.includes(String.fromCharCode(10)) || safeText.includes(String.fromCharCode(13));
  return needsQuotes ? quote + safeText.split(quote).join(quote + quote) + quote : safeText;
}

/** @param {unknown} value */
function normalizeReasonReference(value) {
  const normalized = String(value || "").replace(/[\u0000-\u001f\u007f]+/g, " ").trim();
  if (!normalized) {
    throw new AppError("A support reason or reference is required.", 400);
  }
  if (normalized.length > 500) {
    throw new AppError("The support reason or reference must be 500 characters or fewer.", 400);
  }
  return normalized;
}

/** @param {unknown} value */
function normalizeRequestId(value) {
  const normalized = String(value || "").trim();
  return /^[A-Za-z0-9_-]{1,128}$/.test(normalized) ? normalized : createOpaqueId();
}

/** @param {unknown} value */
function normalizeId(value) {
  return String(value || "").trim();
}

/** @param {unknown} value */
function normalizeNow(value) {
  const normalized = value ?? Date.now();
  const date = normalized instanceof Date
    ? new Date(normalized.getTime())
    : typeof normalized === "string" || typeof normalized === "number"
      ? new Date(normalized)
      : new Date(Number.NaN);
  return Number.isNaN(date.getTime()) ? new Date() : date;
}

export const supportViewService = {
  endForLogout,
  exit,
  exportAuditCsv,
  listAudit,
  listTargets,
  recordAction,
  resolveForRequest,
  start,
};
