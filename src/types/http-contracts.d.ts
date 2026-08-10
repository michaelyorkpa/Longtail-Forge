export type SessionMode = "normal" | "account_export_recovery";

export interface AuthenticatedIdentity {
  workspace_id: string | null;
  user_id: string;
  username: string;
}

export interface SupportViewSession {
  supportSessionId: string;
  actorUserId: string;
  actorUsername: string;
  actorLabel: string;
  effectiveUserId: string;
  effectiveUsername: string;
  effectiveUserLabel: string;
  effectiveWorkspaceId: string;
  effectiveWorkspaceName: string;
  startedAt: string;
  expiresAt: string;
}

export interface RequestSession extends AuthenticatedIdentity {
  active_workspace_id: string | null;
  home_workspace_id: string | null;
  timezone: string;
  ip_address: string;
  password_change_required: boolean;
  session_mode: SessionMode;
  actor_user_id?: string;
  actor_username?: string;
  effective_user_id?: string;
  effective_username?: string;
  effective_workspace_id?: string;
  support_view?: SupportViewSession;
}

export interface SupportViewRequestSession extends RequestSession {
  workspace_id: string;
  active_workspace_id: string;
  user_id: string;
  actor_user_id: string;
  actor_username: string;
  effective_user_id: string;
  effective_username: string;
  effective_workspace_id: string;
  support_view: SupportViewSession;
}

export interface ApiSession extends AuthenticatedIdentity {
  workspace_id: string;
  api_key_id: string;
}

export interface PermissionResource {
  workspace_id?: string | null;
  client_id?: string | null;
  project_id?: string | null;
  operation?: string;
  [key: string]: unknown;
}

export interface ActiveApiKey {
  api_key_id: string;
  workspace_id: string;
  created_by_user_id: string;
  key_prefix: string;
  status: string;
  scopes: string[];
  [key: string]: unknown;
}

export interface SessionRotation {
  sessionId: string;
  maxAgeSeconds: number;
}

export interface SessionRotationState {
  sessionRotation?: SessionRotation;
}

export interface SessionInvalidationState {
  sessionInvalidated?: true;
}

export interface JsonBodyRequest {
  on(event: "data", listener: (chunk: string | Buffer) => void): unknown;
  on(event: "end", listener: () => void): unknown;
  destroy(): void;
  publicDemoBudgetPayloadValidator?: (payload: unknown) => void | Promise<void>;
}

export interface ReadJsonBodyOptions {
  maxBytes?: number;
}

export type SupportViewGateOutcome = "allowed" | "denied";
export type SupportViewGateReasonClass =
  | "mutation_denied"
  | "sensitive_read_excluded"
  | "declared_read_safe"
  | "undeclared_read_denied";

export interface HttpIdentityRequest extends Express.Request {
  method: string;
  path: string;
  originalUrl?: string;
  url: string;
  headers: Record<string, string | string[] | undefined> & { cookie?: string };
  cookies?: Record<string, string>;
}

declare global {
  namespace Express {
    interface Request extends SessionRotationState, SessionInvalidationState {
      session?: RequestSession | null;
      apiSession?: ApiSession;
      apiKey?: ActiveApiKey;
    }
  }
}
