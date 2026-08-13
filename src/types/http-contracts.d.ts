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

export interface RequestSessionBase extends AuthenticatedIdentity {
  active_workspace_id: string | null;
  home_workspace_id: string | null;
  timezone: string;
  ip_address: string;
  password_change_required: boolean;
  session_mode: SessionMode;
}

export interface NormalRequestSession extends RequestSessionBase {
  actor_user_id?: undefined;
  actor_username?: undefined;
  effective_user_id?: undefined;
  effective_username?: undefined;
  effective_workspace_id?: undefined;
  support_view?: undefined;
}

export interface SupportViewRequestSession extends RequestSessionBase {
  workspace_id: string;
  active_workspace_id: string;
  session_mode: "normal";
  user_id: string;
  actor_user_id: string;
  actor_username: string;
  effective_user_id: string;
  effective_username: string;
  effective_workspace_id: string;
  support_view: SupportViewSession;
}

export type RequestSession = NormalRequestSession | SupportViewRequestSession;
export type WorkspaceRequestSession = RequestSession & { workspace_id: string };

export interface PrivateFeedAuthorizationSession extends AuthenticatedIdentity {
  workspace_id: string;
  active_workspace_id: string;
  home_workspace_id: string | null;
  timezone: string;
  ip_address: string;
  session_mode: "private_feed";
  workspace_type: string;
}

export type PermissionSession = RequestSession | PrivateFeedAuthorizationSession;

export interface LogoutSession {
  ip_address: string | null;
  user_id: string;
  username: string;
  workspace_id: string | null;
}

export interface ApiSession extends AuthenticatedIdentity {
  workspace_id: string;
  api_key_id: string;
}

export interface PermissionResource {
  workspace_id: string;
  client_id?: string | null;
  project_id?: string | null;
  operation?: string;
}

export interface ActiveApiKey {
  api_key_id: string;
  workspace_id: string;
  created_by_user_id: string;
  key_prefix: string;
  status: string;
  scopes: string[];
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

export interface JsonBodyRequest extends NodeJS.ReadableStream {
  destroy(error?: Error): this;
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

export interface RequestContext {
  hostname: string;
  ipAddress: string;
  isSecure: boolean;
  origin: string;
  protocol: string;
  requestId: string;
  socketPeerAddress: string;
}

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
