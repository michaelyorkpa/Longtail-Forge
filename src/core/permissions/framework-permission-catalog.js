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
  }));
}

export {
  listFrameworkPermissionEntries,
  listFrameworkPermissionIds,
  listFrameworkResourceDefinitions,
  listFrameworkRolePermissionDefaults,
};
