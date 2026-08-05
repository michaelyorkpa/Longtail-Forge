import { config } from "../config.js";
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

async function start(session, currentSessionId, payload = {}, context = {}) {
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
  let expiresAt;
  let prepared;
  let eligibility;

  await db.transaction(async (transaction) => {
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
    expiresAt = new Date(Math.min(
      now.getTime() + config.supportView.ttlSeconds * 1000,
      new Date(freshSession.expires_at).getTime(),
    ));
    eligibility = await supportSessionsRepository.readEligibility(
      session.user_id,
      effectiveUserId,
      workspaceId,
      transaction,
    );
    assertEligible(eligibility);

    prepared = prepareSessionRecord({
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
  });

  return {
    session: prepared.cookie,
    supportView: toPublicSupportView({
      support_session_id: supportSessionId,
      actor_user_id: eligibility.actor_user_id,
      actor_username: eligibility.actor_username,
      effective_user_id: eligibility.effective_user_id,
      effective_username: eligibility.effective_username,
      workspace_id: workspaceId,
      started_at: now.toISOString(),
      expires_at: expiresAt.toISOString(),
    }),
  };
}

async function exit(session, currentSessionId, context = {}) {
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

async function endAndRotate(storedSession, supportSession, options) {
  const actor = await usersRepository.readFirstByUserId(supportSession.actor_user_id);
  const activeMemberships = actor?.user_status === "active"
    ? await userWorkspacesRepository.readActiveForUser(actor.user_id)
    : [];
  const restoreWorkspaceId = chooseRestoreWorkspace(supportSession, activeMemberships);
  const canRestore = Boolean(
    actor
    && actor.user_status === "active"
    && restoreWorkspaceId
    && new Date(storedSession.expires_at).getTime() > options.now.getTime()
  );
  let prepared = canRestore
    ? prepareSessionRecord({
      ...actor,
      home_workspace_id: actor.home_workspace_id || restoreWorkspaceId,
      active_workspace_id: restoreWorkspaceId,
      ip_address: storedSession.ip_address,
      session_mode: "normal",
    }, { expiresAt: storedSession.expires_at })
    : null;
  if (supportSession.ended_at) {
    prepared = null;
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
      }
    }
    if (prepared) {
      await sessionsRepository.create(prepared.record, transaction);
    }
    await sessionsRepository.remove(storedSession.session_id, transaction);
  });

  return {
    session: prepared?.cookie || null,
    storedSession: prepared?.record || null,
  };
}

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

function chooseRestoreWorkspace(supportSession, memberships) {
  const candidates = [supportSession.actor_workspace_id, supportSession.actor_home_workspace_id];
  for (const candidate of candidates) {
    if (memberships.some((membership) => membership.workspace_id === candidate)) {
      return candidate;
    }
  }
  return memberships[0]?.workspace_id || null;
}

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
    metadataJson: JSON.stringify(value.metadata || {}),
    occurredAt: value.occurredAt,
  };
}

function toPublicSupportView(row) {
  return {
    supportSessionId: row.support_session_id,
    actorUserId: row.actor_user_id,
    actorUsername: row.actor_username,
    effectiveUserId: row.effective_user_id,
    effectiveUsername: row.effective_username,
    effectiveWorkspaceId: row.workspace_id,
    startedAt: row.started_at,
    expiresAt: row.expires_at,
  };
}

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

function normalizeRequestId(value) {
  const normalized = String(value || "").trim();
  return /^[A-Za-z0-9_-]{1,128}$/.test(normalized) ? normalized : createOpaqueId();
}

function normalizeId(value) {
  return String(value || "").trim();
}

function normalizeNow(value) {
  const date = value instanceof Date ? new Date(value.getTime()) : new Date(value || Date.now());
  return Number.isNaN(date.getTime()) ? new Date() : date;
}

export const supportViewService = {
  exit,
  resolveForRequest,
  start,
};
