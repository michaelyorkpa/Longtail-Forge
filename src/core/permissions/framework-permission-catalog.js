const frameworkPermissionEntries = Object.freeze([
  Object.freeze({
    id: "reporting.view",
    moduleId: "framework",
    label: "View Reporting",
    description: "View reports in scope.",
    resource: "reporting",
    operation: "read",
  }),
]);

const frameworkRolePermissionDefaults = Object.freeze([
  "super_admin",
  "workspace_admin",
  "client_admin",
  "project_admin",
  "client_user",
  "project_user",
].map((roleId) => Object.freeze({
  moduleId: "framework",
  roleId,
  permissions: Object.freeze(["reporting.view"]),
})));

const frameworkResourceDefinitions = Object.freeze([
  Object.freeze({
    key: "reporting",
    moduleId: "framework",
    label: "Reporting",
    operations: Object.freeze(["read"]),
    requiredPermissions: Object.freeze(["reporting.view"]),
  }),
  Object.freeze({
    key: "workspace_settings",
    moduleId: "framework",
    label: "Workspace Settings",
    operations: Object.freeze(["read", "update"]),
    requiredPermissions: Object.freeze(["workspace_settings.manage"]),
  }),
  Object.freeze({
    key: "audit_logs",
    moduleId: "framework",
    label: "Audit Logs",
    operations: Object.freeze(["read"]),
    requiredPermissions: Object.freeze(["audit_logs.view"]),
  }),
]);

function listFrameworkPermissionIds() {
  return frameworkPermissionEntries.map((permission) => permission.id);
}

function listFrameworkPermissionEntries() {
  return frameworkPermissionEntries.map((permission) => ({ ...permission }));
}

function listFrameworkRolePermissionDefaults() {
  return frameworkRolePermissionDefaults.map((mapping) => ({
    ...mapping,
    permissions: [...mapping.permissions],
  }));
}

function listFrameworkResourceDefinitions() {
  return frameworkResourceDefinitions.map((resource) => ({
    ...resource,
    operations: [...resource.operations],
    requiredPermissions: [...resource.requiredPermissions],
  }));
}

export {
  listFrameworkPermissionEntries,
  listFrameworkPermissionIds,
  listFrameworkResourceDefinitions,
  listFrameworkRolePermissionDefaults,
};
