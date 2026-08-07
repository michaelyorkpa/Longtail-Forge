import { NOTE_PERMISSIONS } from "./access-policy.js";
import { notesPublicApiRoutes } from "./public-api.routes.js";
import { notesRoutes } from "./notes.routes.js";
import { registerNotesSearchIndexers } from "./search-indexers.js";
import { catalogSecurityService } from "./catalog-security.service.js";
import { createModuleEntry } from "../../core/modules/module-entry.js";
import { appVersion } from "../../core/version.js";
import { notesPermissions } from "./module.permissions.js";
import { notesEvents } from "./module.events.js";
import { notesIntegrations } from "./module.integrations.js";
import { notesHelp } from "./module.help.js";

function activateNotesRuntime() {
  registerNotesSearchIndexers();
  catalogSecurityService.registerCatalogSecurityJobHandler();
}

const notesModule = {
  id: "notes",
  name: "Notes",
  displayName: "Notes",
  description: "Internal working notes organized by Library buckets and linked workspace records.",
  terminology: {
    default: {
      label: "Notes",
      singular: "Note",
      plural: "Notes",
      navigationLabel: "Notes",
      createButton: "Create Note",
      emptyState: "No notes found.",
    },
  },
  category: "core-workflow",
  version: appVersion,
  enabledByDefault: true,
  canDisable: true,
  historicalReadAccess: true,
  browserApiRoutes: [notesRoutes],
  publicApiRoutes: [notesPublicApiRoutes],
  migrationsDir: null,
  protectedViewsDir: new URL("../../../views/protected/", import.meta.url),
  browserAssetsDir: new URL("../../../public/js/", import.meta.url),
  seedHooks: [],
  repairHooks: [],
  navigation: [
    {
      id: "notes",
      label: "Notes",
      href: "notes.html",
      parent: "projects.html",
      requiredPermissions: [NOTE_PERMISSIONS.VIEW],
      requiresEnabledModules: ["notes"],
    },
    {
      id: "notes-settings",
      label: "Notes",
      href: "notes-settings.html",
      parent: "settings.html",
      requiredPermissions: [NOTE_PERMISSIONS.MANAGE_SETTINGS, NOTE_PERMISSIONS.MANAGE_LIBRARY],
    },
  ],
  protectedViews: [
    {
      id: "notes",
      path: "/notes.html",
      moduleId: "notes",
      file: "notes.html",
      requiredPermissions: [NOTE_PERMISSIONS.VIEW],
      allowDisabledRead: true,
    },
    {
      id: "notes-settings",
      path: "/notes-settings.html",
      moduleId: "notes",
      file: "notes-settings.html",
      requiredPermissions: [NOTE_PERMISSIONS.MANAGE_SETTINGS, NOTE_PERMISSIONS.MANAGE_LIBRARY],
      allowDisabledRead: true,
    },
  ],
  publicViews: [],
  viewSurfaces: [
    {
      id: "notes.workspace",
      moduleId: "notes",
      viewId: "notes",
      layout: "slide-out-sidebar",
      sidebarLabel: "Notes navigation",
      pageHeader: {
        title: "Notes",
        titleKey: "label",
        primaryAction: {
          id: "create-note",
          publicDemoCapability: "records.workspace",
          label: "Create Note",
          labelKey: "createButton",
          role: "primary",
          behavior: "notes.create",
          requiredPermissions: [NOTE_PERMISSIONS.CREATE],
        },
      },
      sidebarPanels: [
        {
          id: "notes-filters",
          type: "filters",
          title: "Filters",
          open: false,
          className: "notes-filters-panel",
        },
        {
          id: "notes-library",
          type: "navigation",
          title: "Library",
          behavior: "notes.sidebar.library",
          open: true,
          className: "notes-library-panel view-collapsible-index--unscrolled",
          ariaLabel: "Notes Library",
        },
        {
          id: "notes-list",
          type: "index",
          title: "Notes List",
          open: true,
          className: "notes-index-panel",
          footer: {
            id: "notes-list-footer",
            behavior: "notes.sidebar.notes-list-footer",
          },
        },
      ],
      filters: [
        {
          id: "status-filter",
          field: "status",
          type: "select",
          label: "Status",
          default: "active",
          options: [["active", "Active", true], ["pinned", "Pinned"], ["archived", "Archived"], ["all", "All visible"]],
        },
        {
          id: "visibility-filter",
          field: "visibility",
          type: "select",
          label: "Visibility",
          default: "all",
          options: [["all", "All visible", true], ["internal", "Internal"], ["private", "Private"], ["workspace", "Workspace"], ["client_visible", "Client Visible"], ["public", "Public"]],
        },
        {
          id: "security-filter",
          field: "security",
          type: "select",
          label: "Security",
          default: "all",
          options: [["all", "All", true], ["normal", "Normal"], ["secure", "Secure"]],
        },
        {
          id: "type-filter",
          field: "noteType",
          type: "select",
          label: "Note Kind",
          default: "all",
          options: [["all", "All kinds", true], ["general", "General"], ["meeting", "Meeting"], ["research", "Research"], ["decision", "Decision"], ["procedure", "Procedure"], ["reference", "Reference"], ["idea", "Idea"], ["log", "Log"]],
        },
        { id: "context-filter", field: "context", type: "search", label: "Context" },
        { id: "owner-filter", field: "owner", type: "search", label: "Owner" },
        { id: "tags-filter", field: "tags", type: "search", label: "Tags", optionsSource: "notes.filters.tags" },
        { id: "updated-filter", field: "updatedSince", type: "date", label: "Updated Since" },
      ],
      indexPanel: {
        title: "Notes",
        titleKey: "plural",
        itemTitleField: "title",
        itemSubtitleField: "excerpt",
        itemMetaFields: ["library", "updatedAt"],
        emptyState: {
          title: "No notes",
          message: "No notes match the current filters.",
        },
      },
      detail: {
        header: {
          titleField: "title",
          metaField: "library",
          badges: [{ field: "status" }, { field: "visibility" }, { field: "security" }],
        },
        actionStrip: {
          label: "Note actions",
          actions: [
            { publicDemoCapability: "records.workspace", id: "edit-note", label: "Edit", role: "secondary", behavior: "notes.workflow.edit", requiredPermissions: [NOTE_PERMISSIONS.UPDATE] },
            { publicDemoCapability: "records.workspace", id: "archive-note", label: "Archive", role: "secondary", behavior: "notes.workflow.archive", requiredPermissions: [NOTE_PERMISSIONS.ARCHIVE] },
            { publicDemoCapability: "records.workspace", id: "restore-note", label: "Restore", role: "secondary", behavior: "notes.workflow.restore", requiredPermissions: [NOTE_PERMISSIONS.RESTORE] },
          ],
        },
        summaryPanels: [
          {
            title: "Context",
            description: "Linked workspace context for this note.",
          },
        ],
        linkedRecords: {
          title: "Linked Context",
          recordsField: "links",
          emptyState: { message: "No linked context." },
          fields: [
            { field: "target_type", type: "select", label: "Type", behavior: "notes.link.target-type" },
            { field: "target_search", type: "search", label: "Search records", placeholder: "Search records", autocomplete: "off", behavior: "notes.link.search" },
            { field: "target_results", type: "select", label: "Record", required: true, behavior: "notes.link.results" },
          ],
          actions: [
            { publicDemoCapability: "records.workspace", id: "add-link", label: "Add Link", role: "primary", behavior: "notes.link.add", requiredPermissions: [NOTE_PERMISSIONS.MANAGE_LINKS] },
            { publicDemoCapability: "records.workspace", id: "remove-link", label: "Remove", role: "destructive", behavior: "notes.link.remove", requiredPermissions: [NOTE_PERMISSIONS.MANAGE_LINKS] },
          ],
        },
        emptyState: {
          title: "Select a note",
          message: "Select a note to read its details.",
        },
      },
      modals: [
        {
          id: "note-editor",
          title: "Note",
          fields: [
            { id: "note-title", field: "title", type: "text", label: "Title", required: true },
            { id: "note-library", field: "library", type: "select", label: "Library", options: [["active_work", "Active Work"], ["ongoing_area", "Ongoing Areas"], ["reference", "Reference Library"]] },
            { id: "note-collection", field: "collection", type: "select", label: "Collection", options: [["", "Uncategorized"]] },
            { id: "note-kind", field: "noteType", type: "select", label: "Note Kind", options: [["general", "General"], ["meeting", "Meeting"], ["research", "Research"], ["decision", "Decision"], ["procedure", "Procedure"], ["reference", "Reference"], ["idea", "Idea"], ["log", "Log"]] },
            { id: "note-visibility", field: "visibility", type: "select", label: "Visibility", options: [["internal", "Internal"], ["private", "Private"], ["workspace", "Workspace"], ["client_visible", "Client Visible"], ["public", "Public"]] },
            { id: "note-security", field: "security", type: "select", label: "Security", options: [["normal", "Normal"], ["secure", "Secure"]] },
          ],
          footerActions: [
            { publicDemoCapability: "records.workspace", id: "cancel-note", label: "Cancel", role: "secondary", behavior: "notes.editor.cancel" },
            { publicDemoCapability: "records.workspace", id: "save-close-note", label: "Save & Close", role: "secondary", behavior: "notes.editor.save-close" },
            { publicDemoCapability: "records.workspace", id: "save-note", label: "Save Note", role: "primary", behavior: "notes.editor.save" },
          ],
        },
        {
          id: "note-bulk-editor",
          title: "Bulk Edit Notes",
          fields: [
            { id: "note-bulk-library", field: "library", type: "select", label: "Library", options: [["", "No change"], ["active_work", "Active Work"], ["ongoing_area", "Ongoing Areas"], ["reference", "Reference Library"]] },
            { id: "note-bulk-collection", field: "collection", type: "select", label: "Collection", options: [["", "No change"], ["__uncategorized", "Uncategorized"]] },
            { id: "note-bulk-kind", field: "noteType", type: "select", label: "Note Kind", options: [["", "No change"], ["general", "General"], ["meeting", "Meeting"], ["research", "Research"], ["decision", "Decision"], ["procedure", "Procedure"], ["reference", "Reference"], ["idea", "Idea"], ["log", "Log"]] },
            { id: "note-bulk-visibility", field: "visibility", type: "select", label: "Visibility", options: [["", "No change"], ["internal", "Internal"], ["private", "Private"], ["workspace", "Workspace"], ["client_visible", "Client Visible"], ["public", "Public"]] },
            { id: "note-bulk-tag-action", field: "tagAction", type: "select", label: "Tag Action", options: [["", "No change"], ["add", "Add tags"], ["remove", "Remove tags"], ["replace", "Replace direct tags"]] },
          ],
          footerActions: [
            { publicDemoCapability: "records.workspace", id: "cancel-note-bulk", label: "Cancel", role: "secondary", behavior: "notes.bulk.cancel" },
            { publicDemoCapability: "records.workspace", id: "apply-note-bulk", label: "Apply Changes", role: "primary", behavior: "notes.bulk.apply" },
          ],
        },
        {
          id: "note-collection",
          title: "Collection",
          fields: [
            { id: "collection-name", field: "title", type: "text", label: "Name", required: true },
            { id: "collection-library", field: "library", type: "select", label: "Library", options: [["active_work", "Active Work"], ["ongoing_area", "Ongoing Areas"], ["reference", "Reference Library"]] },
            { id: "collection-parent", field: "parent", type: "select", label: "Parent", options: [["", "Root collection"]] },
          ],
          footerActions: [
            { publicDemoCapability: "records.workspace", id: "cancel-collection", label: "Cancel", role: "secondary", behavior: "notes.collection.cancel" },
            { publicDemoCapability: "records.workspace", id: "save-collection", label: "Save Collection", role: "primary", behavior: "notes.collection.save" },
          ],
        },
      ],
      dataSource: {
        route: "/api/notes",
        method: "GET",
        fieldBindings: {
          id: "note_id",
          title: "title",
          excerpt: "body_excerpt",
          status: "status",
          visibility: "visibility",
          security: "security_mode",
          library: "library_bucket",
          noteType: "note_type",
          updatedAt: "updated_at",
        },
      },
    },
  ],
  browserAssets: [
    {
      id: "notes-editor-helper",
      moduleId: "notes",
      path: "/js/shared/notes-editor.js",
      type: "script",
      views: ["notes"],
      requiredPermissions: [NOTE_PERMISSIONS.VIEW],
    },
    {
      id: "notes-linked-panel-helper",
      moduleId: "notes",
      path: "/js/shared/notes-linked-panel.js",
      type: "script",
      views: ["tasks", "projects", "clients", "lists", "files"],
      requiredPermissions: [NOTE_PERMISSIONS.VIEW],
    },
    {
      id: "notes-script",
      moduleId: "notes",
      path: "/js/notes.js",
      type: "script",
      views: ["notes"],
      requiredPermissions: [NOTE_PERMISSIONS.VIEW],
    },
    {
      id: "notes-settings-script",
      moduleId: "notes",
      path: "/js/notes-settings.js",
      type: "script",
      views: ["notes-settings"],
      requiredPermissions: [NOTE_PERMISSIONS.MANAGE_SETTINGS, NOTE_PERMISSIONS.MANAGE_LIBRARY],
    },
  ],
  dashboard: [],
  workbench: [],
  reporting: [],
  settings: [
    {
      id: "notesEnabled",
      label: "Notes",
      type: "boolean",
      placement: "workspace",
      moduleStatus: true,
    },
    {
      id: "catalogManagement",
      label: "Notes catalogs",
      type: "info",
      placement: "module",
      readOnly: true,
      description: "Catalogs are the collection hierarchy shown in the Notes Library. Catalog changes below use Notes-owned actions and are saved immediately.",
      requiredPermissions: [NOTE_PERMISSIONS.MANAGE_SETTINGS, NOTE_PERMISSIONS.MANAGE_LIBRARY],
    },
  ],
  requiredPermissions: notesPermissions.requiredPermissions,
  permissions: notesPermissions.permissions,
  defaultRolePermissions: notesPermissions.defaultRolePermissions,
  resourceDefinitions: notesPermissions.resourceDefinitions,
  auditRecordTypes: notesPermissions.auditRecordTypes,
  publicApiEndpoints: notesIntegrations.publicApiEndpoints,
  apiScopes: notesIntegrations.apiScopes,
  eventTypes: notesEvents.eventTypes,
  eventSummaries: notesEvents.eventSummaries,
  hooks: notesEvents.hooks,
  timerSources: notesIntegrations.timerSources,
  workItemSources: notesIntegrations.workItemSources,
  taggableTypes: notesIntegrations.taggableTypes,
  tagPropagation: notesIntegrations.tagPropagation,
  searchableTypes: notesIntegrations.searchableTypes,
  attachableTypes: notesIntegrations.attachableTypes,
  protectedContentConsumers: notesIntegrations.protectedContentConsumers,
  linkedContextProviders: notesIntegrations.linkedContextProviders,
  notificationEvents: notesEvents.notificationEvents,
  notificationFollowTargets: notesEvents.notificationFollowTargets,
  help: notesHelp.help,
  frameworkDependencies: [
    "module-access",
    "permissions-service",
    "workspace-settings",
  ],
  moduleDependencies: [],
  workspaceCapabilityRequirements: [],
};

const moduleEntry = createModuleEntry({
  manifest: notesModule,
  activateApp: activateNotesRuntime,
  activateWorker: activateNotesRuntime,
});

export { notesModule, moduleEntry };
