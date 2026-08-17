// @ts-check
import { usersRoutes } from "../../routes/users.routes.js";
import { LINKED_CONTEXT_TARGET_RESPONSE_CONTRACT } from "../../core/linked-context/provider-contract.js";
import { createModuleEntry } from "../../core/modules/module-entry.js";

/** @param {import("../../types/framework-contracts.js").EventSummaryResolverContext} context */
function moduleDisabledNotificationBody({ event }) {
  const moduleLabel = event.metadata?.module_label
    || event.record_id
    || event.metadata?.module_id
    || "A module";
  return `Module "${moduleLabel}" was disabled.`;
}

/** @type {import("../../types/framework-contracts.js").ModuleManifest} */
const usersModule = {
  id: "users",
  name: "Users",
  displayName: "Users",
  description: "User administration, profile settings, and role assignment surfaces.",
  terminology: {
    default: {
      label: "Users",
      singular: "User",
      plural: "Users",
      navigationLabel: "Users",
      createButton: "Create User",
      emptyState: "No users found.",
    },
  },
  category: "core-admin",
  version: "0.32.9.5",
  enabledByDefault: true,
  canDisable: false,
  historicalReadAccess: false,
  browserApiRoutes: [usersRoutes],
  publicApiRoutes: [],
  browserAssetsDir: new URL("../../../public/js/", import.meta.url),
  migrationsDir: null,
  protectedViewsDir: new URL("../../../views/protected/", import.meta.url),
  seedHooks: [],
  repairHooks: [],
  navigation: [
    { label: "User Admin", href: "user-admin.html", parent: "settings.html" },
    {
      label: "Role Assignments",
      href: "role-assignments.html",
      parent: "settings.html",
      requiredPermissions: ["roles.assign"],
    },
  ],
  protectedViews: [
    {
      id: "user-admin",
      path: "/user-admin.html",
      moduleId: "users",
      file: "user-admin.html",
      requiredPermissions: ["users.manage"],
      requiredWorkspaceCapabilities: ["team_members", "permissions", "family_permissions"],
    },
    {
      id: "role-assignments",
      path: "/role-assignments.html",
      moduleId: "users",
      file: "role-assignments.html",
      requiredPermissions: ["roles.assign"],
      requiredWorkspaceCapabilities: ["team_members", "permissions", "family_permissions"],
    },
  ],
  publicViews: [],
  browserAssets: [
    {
      id: "role-assignments-script",
      moduleId: "users",
      path: "/js/role-assignments.js",
      type: "script",
      views: ["role-assignments"],
      requiredPermissions: ["roles.assign"],
    },
    {
      id: "user-admin-script",
      moduleId: "users",
      path: "/js/user-admin.js",
      type: "script",
      views: ["user-admin"],
      requiredPermissions: ["users.manage"],
    },
  ],
  dashboard: [],
  requiredPermissions: [
    "users.manage",
    "roles.assign",
  ],
  permissions: [
    {
      id: "users.manage",
      moduleId: "users",
      label: "Manage Users",
      description: "Create, update, deactivate, and assign users.",
      resource: "users",
      operation: "manage",
    },
    {
      id: "roles.assign",
      moduleId: "users",
      label: "Assign Roles",
      description: "Add and remove scoped role assignments.",
      resource: "users",
      operation: "assign",
    },
  ],
  defaultRolePermissions: [
    { roleId: "super_admin", permissions: ["users.manage", "roles.assign"] },
    { roleId: "workspace_admin", permissions: ["users.manage", "roles.assign"] },
    { roleId: "client_admin", permissions: ["roles.assign"] },
    { roleId: "project_admin", permissions: ["roles.assign"] },
  ],
  resourceDefinitions: [
    {
      key: "users",
      moduleId: "users",
      label: "Users",
      operations: ["read", "create", "update", "delete", "assign", "manage"],
      requiredPermissions: ["users.manage"],
    },
  ],
  auditRecordTypes: [
    {
      recordType: "user",
      moduleId: "users",
      label: "User",
      description: "User profile and user lifecycle audit history.",
    },
    {
      recordType: "workspace_membership",
      moduleId: "users",
      label: "Workspace Membership",
      description: "Workspace membership lifecycle audit history.",
    },
    {
      recordType: "user_role_assignment",
      moduleId: "users",
      label: "User Role Assignment",
      description: "Scoped role assignment audit history.",
    },
  ],
  publicApiEndpoints: [],
  apiScopes: [],
  eventTypes: [
    {
      event: "user.role_assignments_updated",
      moduleId: "users",
      label: "User Role Assignments Updated",
      description: "A user's authorized role-assignment set changed.",
      recordType: "user_role_assignment",
    },
    {
      event: "module.disabled",
      moduleId: "users",
      label: "Module Disabled",
      description: "Framework module-disabled event surfaced for workspace administrators.",
      recordType: "module",
    },
  ],
  eventSummaries: [
    {
      event: "module.disabled",
      moduleId: "users",
      notification: {
        title: "Module Disabled",
        body: moduleDisabledNotificationBody,
        url: "workspace-settings.html",
        recipientHints: ["workspace_admins"],
      },
    },
  ],
  notificationEvents: [
    {
      id: "module.disabled",
      moduleId: "users",
      label: "Module Disabled",
      description: "Notifies workspace administrators when a module is disabled.",
      defaultEnabled: true,
      defaultPriority: "high",
      recipientMode: "workspace_admins",
    },
  ],
  workbench: [],
  timerSources: [],
  workItemSources: [],
  linkedContextProviders: [
    {
      id: "users.user",
      moduleId: "users",
      targetType: "user",
      label: "User",
      description: "Permission-safe user targets for shared Linked Context pickers.",
      provider: "users.linked-context.users",
      responseContract: LINKED_CONTEXT_TARGET_RESPONSE_CONTRACT,
      requiredReadPermission: "users.manage",
      requiredPermissions: ["users.manage"],
      requiredModules: ["users"],
      requiredWorkspaceCapabilities: ["team_members", "permissions", "family_permissions"],
    },
  ],
  workspaceCapabilityRequirements: ["team_members", "permissions", "family_permissions"],
};

const moduleEntry = createModuleEntry({ manifest: usersModule });

export { usersModule, moduleEntry };
