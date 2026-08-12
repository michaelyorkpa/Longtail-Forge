import type {
  NormalRequestSession,
  SessionRotation,
  SupportViewGateOutcome,
  SupportViewGateReasonClass,
  SupportViewSession,
} from "./http-contracts.js";

export type SupportViewEventType =
  | "entered"
  | "exited"
  | "expired"
  | "terminated"
  | "action_attempt";

export type SupportViewEventOutcome =
  | "success"
  | "expired"
  | "revoked"
  | "disabled"
  | "allowed"
  | "denied";

export type SupportViewSessionOutcome =
  | "active"
  | "exited"
  | "expired"
  | "revoked"
  | "disabled";

export interface SupportViewOperatorSession extends NormalRequestSession {
  workspace_id: string;
  active_workspace_id: string;
  session_mode: "normal";
}

export interface SupportViewTargetRow {
  user_id: string;
  username: string;
  display_name: string | null;
  workspace_id: string;
  workspace_name: string;
}

export interface SupportViewEligibilityRow {
  actor_user_id: string;
  actor_username: string;
  actor_display_name: string | null;
  actor_home_workspace_id: string | null;
  actor_active_workspace_id: string | null;
  actor_status: string;
  actor_protected: string;
  actor_has_support_permission: boolean | number | string;
  effective_user_id: string;
  effective_username: string;
  effective_display_name: string | null;
  effective_status: string;
  effective_home_workspace_id: string | null;
  effective_timezone: unknown;
  effective_password_change_required: unknown;
  effective_membership_status: string;
  workspace_status: string;
  workspace_name: string;
}

export interface SupportViewStoredSessionRow extends SupportViewEligibilityRow {
  support_session_id: string;
  actor_workspace_id: string | null;
  workspace_id: string;
  reason_reference: string;
  start_request_id: string;
  end_request_id: string | null;
  started_at: string;
  expires_at: string;
  ended_at: string | null;
  outcome: SupportViewSessionOutcome;
  created_at: string;
  updated_at: string;
}

export interface SupportViewAuditRow {
  event_id: string;
  occurred_at: string;
  event_type: SupportViewEventType;
  outcome: SupportViewEventOutcome;
  route_id: string | null;
  action_id: string | null;
  reason_class: string | null;
  reason_reference: string;
  started_at: string;
  expires_at: string;
  ended_at: string | null;
  session_outcome: SupportViewSessionOutcome;
  actor_user_id: string;
  actor_username: string;
  actor_display_name: string | null;
  effective_user_id: string;
  effective_username: string;
  effective_display_name: string | null;
  workspace_id: string;
  workspace_name: string | null;
}

export interface SupportViewAuditOption {
  value: string;
  label: string;
}

export interface SupportViewAuditFilterOptions {
  actors: SupportViewAuditOption[];
  effectiveUsers: SupportViewAuditOption[];
  eventTypes: SupportViewAuditOption[];
  outcomes: SupportViewAuditOption[];
  workspaces: SupportViewAuditOption[];
}

export interface SupportViewAuditFilters {
  actorUserId?: unknown;
  cutoffIso?: unknown;
  dateFrom?: unknown;
  dateTo?: unknown;
  effectiveUserId?: unknown;
  eventType?: unknown;
  limit?: unknown;
  offset?: unknown;
  outcome?: unknown;
  workspaceId?: unknown;
}

export interface NormalizedSupportViewAuditFilters {
  actorUserId: string;
  cutoffIso: string;
  dateFrom: string;
  dateTo: string;
  effectiveUserId: string;
  eventType: string;
  outcome: string;
  workspaceId: string;
}

export interface SupportViewEventInput {
  eventId: string;
  supportSessionId: string;
  actorUserId: string;
  effectiveUserId: string;
  workspaceId: string;
  eventType: SupportViewEventType;
  outcome: SupportViewEventOutcome;
  requestId: string;
  routeId: string | null;
  actionId: string | null;
  reasonClass: string | null;
  metadataJson: string;
  occurredAt: string;
}

export interface SupportViewCreateInput {
  supportSessionId: string;
  actorUserId: string;
  actorUsername: string;
  actorHomeWorkspaceId: string | null;
  actorWorkspaceId: string | null;
  effectiveUserId: string;
  effectiveUsername: string;
  workspaceId: string;
  reasonReference: string;
  startRequestId: string;
  startedAt: string;
  expiresAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface SupportViewEndInput {
  supportSessionId: string;
  endedAt: string;
  endRequestId: string;
  outcome: Exclude<SupportViewSessionOutcome, "active">;
  updatedAt: string;
}

export interface SupportViewPublicRow {
  support_session_id: string;
  actor_user_id: string;
  actor_username: string;
  actor_display_name: string | null;
  effective_user_id: string;
  effective_username: string;
  effective_display_name: string | null;
  workspace_id: string;
  workspace_name: string | null;
  started_at: string;
  expires_at: string;
}

export interface SupportViewStartResult {
  session: SessionRotation;
  supportView: SupportViewSession;
}

export interface SupportViewBrowserSessionRow {
  session_id: string;
  home_workspace_id: string | null;
  active_workspace_id: string | null;
  user_id: string;
  username: string;
  timezone: unknown;
  ip_address: string | null;
  session_mode: string | null;
  support_session_id: string | null;
  expires_at: string;
  password_change_required?: unknown;
}

export type ActiveSupportViewBrowserSessionRow = SupportViewBrowserSessionRow & {
  support_session_id: string;
};

export interface SupportViewStartPayload {
  currentPassword?: unknown;
  effectiveUserId?: unknown;
  effective_user_id?: unknown;
  reasonReference?: unknown;
  reason_reference?: unknown;
  workspaceId?: unknown;
  workspace_id?: unknown;
}

export interface SupportViewServiceContext {
  ipAddress?: unknown;
  now?: unknown;
  requestId?: unknown;
}

export interface SupportViewAuditOptions extends SupportViewServiceContext {
  maxPageSize?: number;
}

export interface SupportViewActionAttempt {
  actionId: string;
  outcome: SupportViewGateOutcome;
  reasonClass: SupportViewGateReasonClass;
  routeId: string;
}

export interface SupportViewInvalidState {
  eventType: "expired" | "terminated";
  outcome: "expired" | "revoked" | "disabled";
  reasonClass: string;
}

export interface SupportViewEndOptions {
  eventType: "exited" | "expired" | "terminated";
  outcome: "exited" | "expired" | "revoked" | "disabled";
  requestId: string;
  now: Date;
  reasonClass: string;
  restoreSession?: boolean;
}
