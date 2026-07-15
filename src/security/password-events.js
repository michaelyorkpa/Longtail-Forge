import { internalEventBus } from "../core/events/event-bus.js";
import { normalizeBooleanPreference } from "../utils/normalizers.js";

async function emitPasswordResetSecurityEvent({ revokedSessionCount = 0, session, targetUser }) {
  return internalEventBus.emit("security.password.reset", {
    actorUserId: session?.user_id,
    metadata: {
      change_required: true,
      outcome: "success",
      revoked_session_count: Number(revokedSessionCount || 0),
      target_user_id: targetUser.user_id,
    },
    newValue: { password_change_required: true },
    previousValue: {
      password_change_required: normalizeBooleanPreference(targetUser.password_change_required),
    },
    recordId: targetUser.user_id,
    recordType: "user",
    session,
    source: "security",
    workspaceId: session?.workspace_id || targetUser.home_workspace_id,
  });
}

async function emitPasswordChangedSecurityEvent({ revokedSessionCount = 0, session, targetUser }) {
  return internalEventBus.emit("security.password.changed", {
    actorUserId: session?.user_id,
    metadata: {
      changed_own_password: true,
      change_requirement_cleared: normalizeBooleanPreference(targetUser.password_change_required),
      outcome: "success",
      revoked_other_session_count: Number(revokedSessionCount || 0),
      target_user_id: targetUser.user_id,
    },
    newValue: { password_change_required: false },
    previousValue: {
      password_change_required: normalizeBooleanPreference(targetUser.password_change_required),
    },
    recordId: targetUser.user_id,
    recordType: "user",
    session,
    source: "security",
    workspaceId: session?.workspace_id || targetUser.home_workspace_id,
  });
}

async function emitPasswordRehashedSecurityEvent({
  newAlgorithm,
  previousAlgorithm,
  rehashReason,
  session,
  targetUser,
}) {
  return internalEventBus.emit("security.password.rehashed", {
    actorUserId: session?.user_id,
    metadata: {
      new_algorithm: String(newAlgorithm || "unknown"),
      outcome: "success",
      previous_algorithm: String(previousAlgorithm || "unknown"),
      rehash_reason: String(rehashReason || "policy_upgrade"),
      target_user_id: targetUser.user_id,
    },
    recordId: targetUser.user_id,
    recordType: "user",
    session,
    source: "security",
    workspaceId: session?.workspace_id || targetUser.home_workspace_id,
  });
}

export {
  emitPasswordChangedSecurityEvent,
  emitPasswordRehashedSecurityEvent,
  emitPasswordResetSecurityEvent,
};
