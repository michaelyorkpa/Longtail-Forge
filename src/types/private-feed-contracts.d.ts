import type { DatabaseRow } from "./database-contracts.js";
import type {
  PermissionResource,
  PermissionSession,
  PrivateFeedAuthorizationSession,
  RequestSession,
} from "./http-contracts.js";

export type PrivateFeedScopeType = "workspace" | "client" | "project";

export type PrivateFeedManagementSession = RequestSession & { workspace_id: string };

export interface PrivateFeedScope {
  clientId: string | null;
  projectId: string | null;
  type: PrivateFeedScopeType;
}

export interface PrivateFeedSubscriptionDescriptor {
  readonly name: string;
  readonly ownerUserId: string;
  readonly scope: Readonly<PrivateFeedScope>;
  readonly subscriptionId: string;
  readonly workspaceId: string;
}

export interface PrivateFeedSubscriptionDescriptorInput {
  name: unknown;
  ownerUserId: unknown;
  scope: {
    clientId?: unknown;
    projectId?: unknown;
    type?: unknown;
  };
  subscriptionId: unknown;
  workspaceId: unknown;
}

export interface PrivateFeedProviderRenderContext {
  providerId: string;
  session: PrivateFeedAuthorizationSession;
  subscription: PrivateFeedSubscriptionDescriptor;
}

export type PrivateFeedProviderRender = (
  context: Readonly<PrivateFeedProviderRenderContext>,
) => Promise<string | null> | string | null;

export interface PrivateFeedProviderDefinition {
  id: unknown;
  render: PrivateFeedProviderRender;
}

export interface PrivateFeedProvider {
  readonly id: string;
  readonly render: PrivateFeedProviderRender;
}

export interface PrivateFeedTokenRow extends DatabaseRow {
  private_feed_token_id: string;
  workspace_id: string;
  user_id: string;
  provider_id: string;
  token_hash: string;
  name: string;
  scope_type: PrivateFeedScopeType;
  scope_client_id: string | null;
  scope_project_id: string | null;
  status: string;
  revocation_reason: string | null;
  created_at: string;
  rotated_at: string | null;
  revoked_at: string | null;
  updated_at: string;
  owner_username: string;
  owner_display_name: string | null;
  user_status: string;
  home_workspace_id: string | null;
  timezone: string | null;
  membership_status: string | null;
  workspace_status: string;
  workspace_type: string;
  tasks_module_status: string | null;
  scope_client_name: string | null;
  scope_client_status: string | null;
  scope_project_name: string | null;
  scope_project_status: string | null;
  project_client_id: string | null;
  project_client_status: string | null;
}

export interface PrivateFeedTokenCreateInput {
  name: string;
  providerId: string;
  scopeClientId: string | null;
  scopeProjectId: string | null;
  scopeType: PrivateFeedScopeType;
  tokenHash: string;
  tokenSelector: string;
  userId: string;
  workspaceId: string;
}

export interface PrivateFeedTokenListFilters {
  userId?: string;
  workspaceId?: string;
}

export interface PrivateFeedTokenMutationResult {
  changed: boolean;
  token: PrivateFeedTokenRow | null;
}

export interface PrivateFeedTokenRevokeResult {
  changed: number;
}

export interface PrivateFeedSubscriptionPayload {
  clientId?: unknown;
  client_id?: unknown;
  name?: unknown;
  projectId?: unknown;
  project_id?: unknown;
  scopeType?: unknown;
  scope_type?: unknown;
}

export interface ParsedPrivateFeedToken {
  secret: string;
  selector: string;
  valid: boolean;
}

export type PrivateFeedEligibility =
  | { allowed: true; reason: null }
  | { allowed: false; reason: string };

export interface PrivateFeedReconcileOptions {
  reason?: string;
  session?: PermissionSession;
  userId?: string;
  workspaceId?: string;
}

export interface PrivateFeedReconcileResult {
  failed?: true;
  revokedCount: number;
}

export interface PrivateFeedPublicSubscription {
  createdAt: string | null;
  name: string;
  ownedByCurrentUser: boolean;
  owner: {
    displayName: string;
    username: string;
  };
  revocationReason: string | null;
  revokedAt: string | null;
  rotatedAt: string | null;
  scope: {
    label: string;
    type: PrivateFeedScopeType;
  };
  status: string;
  subscriptionId: string;
  timezone: string;
}

export interface PrivateFeedAuthentication {
  session: PrivateFeedAuthorizationSession;
  subscription: PrivateFeedSubscriptionDescriptor;
}

export interface PrivateFeedCollectionResponse {
  subscriptions: PrivateFeedPublicSubscription[];
}

export interface PrivateFeedCreateResponse {
  feedUrl: string;
  subscription: PrivateFeedPublicSubscription;
}

export interface PrivateFeedRemoveResponse {
  removed: true;
  subscriptionId: string;
}

export interface PrivateFeedPermissionResource extends PermissionResource {
  workspace_id: string;
}
