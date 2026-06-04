import { timeEntriesRoutes } from "./time-entries.routes.js";
import { timeTrackingPublicApiRoutes } from "./public-api.routes.js";

const timeTrackingModule = {
  id: "time-tracking",
  name: "Time Tracking",
  displayName: "Time Tracking",
  description: "Timers, manual entries, editable time entries, and billable time capture.",
  category: "core-workflow",
  version: "0.31.10",
  enabledByDefault: true,
  canDisable: true,
  historicalReadAccess: true,
  browserApiRoutes: [timeEntriesRoutes],
  publicApiRoutes: [timeTrackingPublicApiRoutes],
  browserAssetsDir: new URL("../../../public/js/", import.meta.url),
  migrationsDir: new URL("./migrations/", import.meta.url),
  protectedViewsDir: new URL("../../../views/protected/", import.meta.url),
  seedHooks: [],
  repairHooks: [],
  navigation: [
    { label: "Time Keeping", href: "time-tracker.html", parent: "projects.html" },
    { label: "Manual Entry", href: "manual-entry.html", parent: "time-tracker.html" },
    { label: "Edit Entries", href: "edit-entries.html", parent: "time-tracker.html" },
    { label: "Time Reports", href: "reporting.html", parent: "reporting.html" },
  ],
  dashboard: [
    { id: "active-timers", label: "Active Timers" },
    { id: "recent-time", label: "Recent Time" },
    { id: "billing-summary", label: "Billing Summary" },
  ],
  workbench: [
    {
      id: "active-work-timers",
      label: "Active Timers",
      renderer: "active-work-timers",
      moduleId: "time-tracking",
      requiredPermissions: ["time_entries.create"],
      requiredWorkspaceCapabilities: ["time_tracking"],
      requiresEnabledModules: ["time-tracking"],
      defaultCollapsed: false,
      sortOrder: 10,
    },
  ],
  reporting: [
    { id: "project-time-billing", label: "Project Time & Billing" },
  ],
  publicApiEndpoints: [
    { method: "GET", path: "/api/v1/time-entries", scope: "time_entries:read" },
    { method: "POST", path: "/api/v1/time-entries", scope: "time_entries:write" },
  ],
  requiredPermissions: [
    "time_entries.create",
    "time_entries.edit_own",
    "time_entries.edit_all",
    "reporting.view",
  ],
  workspaceCapabilityRequirements: ["time_tracking", "time_tracking_optional"],
  settings: [
    {
      id: "timeTrackingEnabled",
      label: "Time Tracking",
      type: "boolean",
      moduleStatus: true,
    },
  ],
  apiScopes: ["time_entries:read", "time_entries:write"],
  timerSources: [
    {
      sourceType: "manual",
      moduleId: "time-tracking",
      label: "Manual Timer",
      listRoute: "/api/active-timers",
      startRoute: "/api/active-timers/:timerSlot",
      pauseRoute: "/api/active-timers/:timerSlot",
      finalizeRoute: "/api/active-timers/:timerSlot/finalize",
      requiredPermissions: ["time_entries.create"],
      requiredModules: ["time-tracking"],
    },
  ],
  workItemSources: [],
  frameworkDependencies: [
    "api-key-auth",
    "audit-service",
    "billing-formatters",
    "client-projects",
    "module-access",
    "permissions-service",
    "timezone-normalization",
    "workspace-settings",
  ],
};

export { timeTrackingModule };
