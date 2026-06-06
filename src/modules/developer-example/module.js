import { developerExampleRoutes } from "./routes.js";
import { developerExamplePublicApiRoutes } from "./public-api.routes.js";

const developerExampleModule = {
  id: "developer-example",
  name: "Developer Example",
  displayName: "Developer Example",
  description: "Disabled-by-default example module that demonstrates the module manifest contract.",
  terminology: {
    default: {
      label: "Developer Example",
      singular: "Developer Example",
      plural: "Developer Examples",
      navigationLabel: "Developer Example",
      createButton: "Create Developer Example",
      emptyState: "No developer examples found.",
    },
  },
  category: "developer",
  version: "0.32.3",
  enabledByDefault: false,
  canDisable: true,
  historicalReadAccess: true,
  browserApiRoutes: [developerExampleRoutes],
  publicApiRoutes: [developerExamplePublicApiRoutes],
  migrationsDir: null,
  protectedViewsDir: new URL("../../../views/protected/", import.meta.url),
  browserAssetsDir: new URL("../../../public/js/", import.meta.url),
  seedHooks: [],
  repairHooks: [],
  navigation: [
    {
      label: "Developer Example",
      href: "developer-example.html",
      parent: "settings.html",
      requiredPermissions: ["developer_example.view"],
    },
  ],
  protectedViews: [
    {
      id: "developer-example",
      path: "/developer-example.html",
      moduleId: "developer-example",
      file: "developer-example.html",
      requiredPermissions: ["developer_example.view"],
      allowDisabledRead: false,
    },
  ],
  publicViews: [],
  browserAssets: [
    {
      id: "developer-example-script",
      moduleId: "developer-example",
      path: "/js/developer-example.js",
      type: "script",
      views: ["developer-example"],
      requiredPermissions: ["developer_example.view"],
    },
  ],
  dashboard: [],
  workbench: [],
  reporting: [],
  settings: [
    {
      id: "developerExampleEnabled",
      label: "Developer Example",
      type: "boolean",
      moduleStatus: true,
    },
    {
      id: "developerExampleMode",
      label: "Example Mode",
      type: "info",
      readOnly: true,
      description: "Read-only sample setting for developer documentation.",
    },
  ],
  requiredPermissions: [
    "developer_example.view",
  ],
  permissions: [
    {
      id: "developer_example.view",
      moduleId: "developer-example",
      label: "View Developer Example",
      description: "View the disabled-by-default developer example module page and sample route output.",
      resource: "developer_example",
      operation: "read",
    },
  ],
  defaultRolePermissions: [
    { roleId: "super_admin", permissions: ["developer_example.view"] },
    { roleId: "workspace_admin", permissions: ["developer_example.view"] },
  ],
  resourceDefinitions: [
    {
      key: "developer_example",
      moduleId: "developer-example",
      label: "Developer Example",
      operations: ["read"],
    },
  ],
  auditRecordTypes: [
    {
      recordType: "developer_example",
      moduleId: "developer-example",
      label: "Developer Example",
      description: "Developer example records used by documentation and module sanity checks.",
    },
  ],
  publicApiEndpoints: [
    { method: "GET", path: "/api/v1/developer-example", scope: "developer_example:read" },
  ],
  apiScopes: [
    {
      id: "developer_example:read",
      moduleId: "developer-example",
      label: "Read Developer Example",
      description: "Read developer example module output through the public API.",
      access: "read",
    },
  ],
  eventTypes: [
    {
      event: "developer_example.viewed",
      moduleId: "developer-example",
      label: "Developer Example Viewed",
      description: "Example event type for module developer documentation.",
      recordType: "developer_example",
    },
  ],
  eventSummaries: [
    {
      event: "developer_example.viewed",
      moduleId: "developer-example",
      activity: {
        label: "Developer Example Viewed",
        summary: "Viewed the developer example module.",
        url: "developer-example.html",
      },
      notification: {
        title: "Developer Example",
        body: "The developer example module emitted a sample event.",
        url: "developer-example.html",
        recipientHints: ["actor"],
      },
    },
  ],
  hooks: {
    events: [
      {
        id: "developer-example-task-created",
        event: "task.created",
        handler: async () => null,
      },
    ],
  },
  notificationEvents: [
    {
      id: "developer-example.sample",
      moduleId: "developer-example",
      label: "Developer Example Sample",
      description: "Sample notification event declaration for module developer documentation.",
      defaultEnabled: false,
      defaultPriority: "low",
      recipientMode: "explicit_users",
    },
  ],
  notificationTemplates: [
    {
      id: "developer-example.sample",
      event: "developer-example.sample",
      moduleId: "developer-example",
      title: "Developer Example",
      body: "Sample developer example notification template.",
      url: "developer-example.html",
    },
  ],
  searchableTypes: [
    {
      recordType: "developer_example",
      moduleId: "developer-example",
      label: "Developer Example",
      description: "Sample searchable type declaration for future search documentation.",
    },
  ],
  taggableTypes: [
    {
      targetType: "developer_example",
      moduleId: "developer-example",
      label: "Developer Example",
      description: "Sample taggable type declaration for future tag documentation.",
      idField: "developer_example_id",
      labelField: "title",
      workspaceField: "workspace_id",
      requiredReadPermission: "developer_example.view",
      requiredTagPermission: "tags.assign",
      requiredModules: ["developer-example"],
    },
  ],
  timerSources: [],
  workItemSources: [],
  frameworkDependencies: [
    "api-key-auth",
    "module-access",
    "permissions-service",
  ],
  moduleDependencies: [],
  workspaceCapabilityRequirements: [],
};

export { developerExampleModule };
