import type { RequestSession } from "./http-contracts.js";

export type UsersRequestSession = RequestSession & {
  workspace_id: string;
};

export interface UserServiceContext {
  currentSessionId?: string;
  ipAddress?: string;
}

export interface UserPayload {
  altEmail?: unknown;
  assignments?: unknown;
  displayName?: unknown;
  moduleSettings?: unknown;
  openExternalLinksNewTab?: unknown;
  preferredCalendarView?: unknown;
  preferredLoginLanding?: unknown;
  preferredWorkspaceSwitchLanding?: unknown;
  themeAutoSource?: unknown;
  themeMode?: unknown;
  timeTrackingEnabled?: unknown;
  timezone?: unknown;
  username?: unknown;
  workspaceId?: unknown;
  workspaceName?: unknown;
  workspaceType?: unknown;
  workspaceMemberships?: unknown[];
  workspace_id?: unknown;
  workspace_name?: unknown;
  workspace_type?: unknown;
}

export interface UserActionInput {
  action: string;
  context?: UserServiceContext;
  payload?: UserPayload;
  session: UsersRequestSession;
  userId: string;
}

export interface UserRow {
  active_workspace_id: string | null;
  alt_email: string | null;
  display_name: string | null;
  home_workspace_id: string | null;
  open_external_links_new_tab: boolean | number | string | null;
  password: string;
  password_change_required: boolean | number | string | null;
  preferred_calendar_view: string | null;
  preferred_login_landing: string | null;
  preferred_workspace_switch_landing: string | null;
  protected_user: boolean | number | string | null;
  theme_auto_source: string | null;
  theme_mode: string | null;
  timezone: string | null;
  user_id: string;
  user_status: string;
  username: string;
}

export interface UserProfile {
  altEmail: string | null;
  displayName: string;
  timezone: string;
  username: string;
}

export interface UserValue extends UserProfile {
  openExternalLinksNewTab: boolean;
  passwordChangeRequired: boolean;
  preferredCalendarView: string | null;
  preferredLoginLanding: string;
  preferredWorkspaceSwitchLanding: string;
  protectedUser: boolean;
  themeAutoSource: string;
  themeMode: string;
  userStatus: string;
  user_id: string;
}

export interface UserWorkspaceMembershipRow {
  created_at: string;
  status: string;
  updated_at: string;
  user_id: string;
  user_workspace_id: string;
  workspace_id: string;
  workspace_name?: string;
}

export interface WorkspaceMembershipRow {
  status: string;
  workspace_id: string;
  workspace_name: string;
  workspace_type: string;
}

export interface AssignableWorkspaceRow {
  owner_user_id: string | null;
  owner_username: string | null;
  workspace_id: string;
  workspace_name: string;
  workspace_type: string;
}

export interface WorkspaceValue {
  ownerUserId: string | null;
  ownerUsername: string | null;
  workspaceId: string;
  workspaceName: string;
  workspaceType: string;
}

export interface CreatedWorkspace {
  workspaceId: string;
  workspaceName: string;
  workspaceType: string;
}

export interface OwnerTransferCandidate {
  membership_created_at: string | null;
  user_id: string;
  username: string;
}

export interface DecoratedMembership {
  createdAt: string;
  status: string;
  updatedAt: string;
  userWorkspaceId: string;
  workspaceId: string;
  workspaceName?: string;
}

export interface DecoratedUser extends UserValue {
  workspaceMemberships: DecoratedMembership[];
}

export interface WorkspaceCreationSetting {
  id: string;
  moduleStatus?: boolean;
  readOnly?: boolean;
}

export interface WorkspaceCreationModuleDefinition {
  moduleId: string;
  settings: WorkspaceCreationSetting[];
}

export interface WorkspaceCreationTypeOption {
  defaultName: string;
  label: string;
  moduleSettings: WorkspaceCreationModuleDefinition[];
  workspaceType: string;
}

export interface WorkspaceCreationOptions {
  availableTypes: WorkspaceCreationTypeOption[];
  canCreateWorkspaces: boolean;
  installMode: "saas" | "self_hosted";
  workspaceCreationEnabled: boolean;
}

export interface ModuleStatusChange {
  enabled: boolean;
  moduleId: string;
}

export interface UserListResult {
  currentUserId: string;
  users: DecoratedUser[];
}

export interface UserMutationResult {
  user: UserValue | DecoratedUser;
  users: DecoratedUser[];
}

export interface WorkspaceMembershipAuditInput {
  action: string;
  changeType: string;
  newValue: UserWorkspaceMembershipRow | null;
  previousValue: UserWorkspaceMembershipRow | null;
  session: UsersRequestSession;
  user: UserValue;
}

export interface WorkspaceOwnershipInput {
  action: string;
  ownerUserId: string;
  session: UsersRequestSession;
  workspaceId: string;
}

export interface EnsureWorkspaceInput {
  reason: string;
  session: UsersRequestSession;
  userId: string;
}

export interface ReplaceMembershipsInput {
  requestedWorkspaceIds: unknown[];
  session: UsersRequestSession;
  user: UserValue;
}

export interface RetireAccountInput {
  actorSession: UsersRequestSession;
  context: UserServiceContext;
  selfService: boolean;
  targetUser: UserRow;
}
