const timeTrackingPermissions = {
  requiredPermissions: [
    "time_entries.create",
    "time_entries.edit_own",
    "time_entries.edit_all",
  ],
  permissions: [
    {
      id: "time_entries.create",
      moduleId: "time-tracking",
      label: "Create Time Entries",
      description: "Create stopwatch and manual time entries.",
      resource: "time_entries",
      operation: "create",
    },
    {
      id: "time_entries.edit_own",
      moduleId: "time-tracking",
      label: "Edit Own Time Entries",
      description: "Edit or delete only the actor's own time entries in scope.",
      resource: "time_entries",
      operation: "update",
    },
    {
      id: "time_entries.edit_all",
      moduleId: "time-tracking",
      label: "Edit All Time Entries",
      description: "Edit or delete time entries in scope.",
      resource: "time_entries",
      operation: "update",
    },
  ],
  defaultRolePermissions: [
    { roleId: "super_admin", permissions: ["time_entries.create", "time_entries.edit_all"] },
    { roleId: "workspace_admin", permissions: ["time_entries.create", "time_entries.edit_all"] },
    { roleId: "client_admin", permissions: ["time_entries.create", "time_entries.edit_all"] },
    { roleId: "project_admin", permissions: ["time_entries.create", "time_entries.edit_all"] },
    { roleId: "client_user", permissions: ["time_entries.create", "time_entries.edit_own"] },
    { roleId: "project_user", permissions: ["time_entries.create", "time_entries.edit_own"] },
    { roleId: "client_external_user", permissions: ["time_entries.create", "time_entries.edit_own"] },
  ],
  resourceDefinitions: [
    {
      key: "time_entries",
      moduleId: "time-tracking",
      label: "Time Entries",
      operations: ["read", "create", "update", "delete", "manage"],
      requiredPermissions: ["time_entries.edit_all"],
    },
  ],
  auditRecordTypes: [
    {
      recordType: "time_entry",
      moduleId: "time-tracking",
      label: "Time Entry",
      description: "Tracked time records and time entry lifecycle audit history.",
    },
  ],
};

export { timeTrackingPermissions };
