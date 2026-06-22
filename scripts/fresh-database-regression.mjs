import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "ltf-fresh-database-regression-"));
process.env.LONGTAIL_DATABASE_FILE = path.join(tempDir, "longtail-forge-fresh-database-test.db");
process.env.SUPER_ADMIN_PASSWORD = "Fresh-Database-Test-Password-123!";

const { closeSqlite, initializeDatabase, querySql } = await import("../src/db/index.js");

try {
  await initializeDatabase();
  await assertFreshBaselineMarker();
  await assertCurrentTableSet();
  await assertCurrentIndexes();
  await assertSeedRows();
  await assertIntegrity();
  console.log("Fresh database regression passed.");
} finally {
  await closeSqlite();
  await fs.rm(tempDir, { recursive: true, force: true });
}

async function assertFreshBaselineMarker() {
  const migrations = await querySql(`
SELECT version, module_id, name
FROM schema_migrations
ORDER BY version;
`);

  assert.equal(migrations.length, 1, "fresh database should record only the current consolidated baseline");
  assert.deepEqual(migrations[0], {
    version: "0.33.5.18.6.5.4",
    module_id: "core",
    name: "current_fresh_start_database",
  });
}

async function assertCurrentTableSet() {
  const rows = await querySql(`
SELECT name
FROM sqlite_master
WHERE type = 'table'
  AND name NOT LIKE 'sqlite_%'
ORDER BY name;
`);
  const tableNames = rows.map((row) => row.name);
  const expectedTables = [
    "active_work_timers",
    "api_key_scopes",
    "api_keys",
    "app_settings",
    "audit_logs",
    "clients",
    "file_attachments",
    "file_reports",
    "file_storage_accounting",
    "file_workspace_settings",
    "files",
    "list_item_catalog",
    "list_items",
    "list_links",
    "lists",
    "modules",
    "note_library_collections",
    "note_links",
    "note_revisions",
    "note_wiki_links",
    "notes",
    "notification_subscriptions",
    "notification_user_display_preferences",
    "notification_user_preferences",
    "notification_workspace_defaults",
    "notifications",
    "permissions",
    "projects",
    "role_permissions",
    "roles",
    "schema_migrations",
    "search_index",
    "secure_note_placeholder_warnings",
    "sessions",
    "tag_assignment_suppressions",
    "tag_assignments",
    "tags",
    "task_assignees",
    "task_checklist_items",
    "task_recurrence_assignees",
    "task_recurrence_templates",
    "task_relationships",
    "task_reminder_offsets",
    "tasks",
    "time_entries",
    "user_role_assignments",
    "user_workspace_creation_permissions",
    "user_workspaces",
    "users",
    "work_resume_state",
    "workspace_modules",
    "workspace_settings",
    "workspaces",
  ];

  assert.deepEqual(tableNames, expectedTables);
}

async function assertCurrentIndexes() {
  const rows = await querySql(`
SELECT name
FROM sqlite_master
WHERE type = 'index'
  AND name IN (
    'idx_active_work_timers_user_slot',
    'idx_active_work_timers_source',
    'idx_api_keys_hash',
    'idx_file_attachments_unique_active_target',
    'idx_file_attachments_workspace_client',
    'idx_file_attachments_workspace_file',
    'idx_file_attachments_workspace_module',
    'idx_file_attachments_workspace_project',
    'idx_file_attachments_workspace_target',
    'idx_file_reports_workspace_attachment',
    'idx_file_reports_workspace_file',
    'idx_file_storage_accounting_unique_scope',
    'idx_file_storage_accounting_workspace_kind',
    'idx_files_storage_provider_key',
    'idx_files_workspace_file',
    'idx_files_workspace_hash',
    'idx_files_workspace_status',
    'idx_list_item_catalog_workspace_context',
    'idx_list_item_catalog_workspace_name',
    'idx_list_item_catalog_workspace_type',
    'idx_list_item_catalog_workspace_usage',
    'idx_list_links_workspace_created',
    'idx_list_links_workspace_list',
    'idx_list_links_workspace_target',
    'idx_list_items_workspace_catalog',
    'idx_list_items_workspace_assigned_user',
    'idx_list_items_workspace_list_sort',
    'idx_list_items_workspace_list_status',
    'idx_list_items_workspace_needed_by',
    'idx_lists_workspace_client',
    'idx_lists_workspace_created_by',
    'idx_lists_workspace_duplicated_from',
    'idx_lists_workspace_finalized_at',
    'idx_lists_workspace_list',
    'idx_lists_workspace_project',
    'idx_lists_workspace_reusable',
    'idx_lists_workspace_source',
    'idx_lists_workspace_status',
    'idx_lists_workspace_type',
    'idx_lists_workspace_updated_at',
    'idx_note_library_collections_workspace_bucket',
    'idx_note_library_collections_workspace_parent',
    'idx_note_library_collections_workspace_path',
    'idx_note_library_collections_workspace_sibling_slug',
    'idx_note_library_collections_workspace_status',
    'idx_note_links_unique_active_target',
    'idx_note_links_workspace_note',
    'idx_note_links_workspace_scope',
    'idx_note_links_workspace_target',
    'idx_note_revisions_workspace_changed_by',
    'idx_note_revisions_workspace_created_at',
    'idx_note_revisions_workspace_import_batch',
    'idx_note_revisions_workspace_import_source',
    'idx_note_revisions_workspace_note',
    'idx_note_revisions_workspace_note_library',
    'idx_note_revisions_workspace_note_revision',
    'idx_note_wiki_links_unique_active_target',
    'idx_note_wiki_links_workspace_note',
    'idx_note_wiki_links_workspace_status',
    'idx_note_wiki_links_workspace_target_note',
    'idx_note_wiki_links_workspace_target_slug',
    'idx_notes_workspace_client',
    'idx_notes_workspace_created_by',
    'idx_notes_workspace_import_batch',
    'idx_notes_workspace_import_source',
    'idx_notes_workspace_library',
    'idx_notes_workspace_library_security',
    'idx_notes_workspace_library_status',
    'idx_notes_workspace_library_visibility',
    'idx_notes_workspace_linked_user',
    'idx_notes_workspace_note',
    'idx_notes_workspace_collection',
    'idx_notes_workspace_owner',
    'idx_notes_workspace_project',
    'idx_notes_workspace_security_mode',
    'idx_notes_workspace_slug',
    'idx_notes_workspace_slug_lookup',
    'idx_notes_workspace_status',
    'idx_notes_workspace_task',
    'idx_notes_workspace_ticket',
    'idx_notes_workspace_updated_at',
    'idx_notes_workspace_visibility',
    'idx_notification_subscriptions_target',
    'idx_notification_subscriptions_unique_active',
    'idx_notification_subscriptions_user',
    'idx_notification_user_display_preferences_user',
    'idx_notifications_created_at',
    'idx_notifications_event_type',
    'idx_notifications_recipient_status_created',
    'idx_notifications_record',
    'idx_notifications_workspace_module',
    'idx_notification_user_preferences_user',
    'idx_notification_workspace_defaults_workspace',
    'idx_search_index_workspace_body',
    'idx_search_index_workspace_client',
    'idx_search_index_workspace_indexed_at',
    'idx_search_index_workspace_library_bucket',
    'idx_search_index_workspace_module',
    'idx_search_index_workspace_note_collection',
    'idx_search_index_workspace_project',
    'idx_search_index_workspace_record_status',
    'idx_search_index_workspace_record_type',
    'idx_search_index_workspace_title',
    'idx_tag_assignment_suppressions_source',
    'idx_tag_assignment_suppressions_tag',
    'idx_tag_assignment_suppressions_target',
    'idx_tag_assignment_suppressions_unique',
    'idx_tag_assignments_propagation_source',
    'idx_tag_assignments_source_assignment',
    'idx_tag_assignments_tag_target',
    'idx_tag_assignments_target',
    'idx_tag_assignments_unique_target_tag',
    'idx_tags_workspace_slug',
    'idx_tags_workspace_status',
    'idx_task_checklist_items_task',
    'idx_task_checklist_items_workspace_updated',
    'idx_task_relationships_active_pair',
    'idx_task_relationships_child',
    'idx_task_relationships_parent',
    'idx_tasks_workspace_due_date',
    'idx_tasks_workspace_last_worked_at',
    'idx_tasks_workspace_resume_context',
    'idx_time_entries_workspace_task',
    'idx_user_workspaces_workspace_status',
    'idx_work_resume_state_dismissed',
    'idx_work_resume_state_last_worked',
    'idx_work_resume_state_record_cleanup',
    'idx_work_resume_state_workspace_client',
    'idx_work_resume_state_workspace_module',
    'idx_work_resume_state_workspace_project',
    'idx_work_resume_state_workspace_user_default',
    'idx_workspace_modules_workspace_status'
  )
ORDER BY name;
`);

  assert.deepEqual(rows.map((row) => row.name), [
    "idx_active_work_timers_source",
    "idx_active_work_timers_user_slot",
    "idx_api_keys_hash",
    "idx_file_attachments_unique_active_target",
    "idx_file_attachments_workspace_client",
    "idx_file_attachments_workspace_file",
    "idx_file_attachments_workspace_module",
    "idx_file_attachments_workspace_project",
    "idx_file_attachments_workspace_target",
    "idx_file_reports_workspace_attachment",
    "idx_file_reports_workspace_file",
    "idx_file_storage_accounting_unique_scope",
    "idx_file_storage_accounting_workspace_kind",
    "idx_files_storage_provider_key",
    "idx_files_workspace_file",
    "idx_files_workspace_hash",
    "idx_files_workspace_status",
    "idx_list_item_catalog_workspace_context",
    "idx_list_item_catalog_workspace_name",
    "idx_list_item_catalog_workspace_type",
    "idx_list_item_catalog_workspace_usage",
    "idx_list_items_workspace_assigned_user",
    "idx_list_items_workspace_catalog",
    "idx_list_items_workspace_list_sort",
    "idx_list_items_workspace_list_status",
    "idx_list_items_workspace_needed_by",
    "idx_list_links_workspace_created",
    "idx_list_links_workspace_list",
    "idx_list_links_workspace_target",
    "idx_lists_workspace_client",
    "idx_lists_workspace_created_by",
    "idx_lists_workspace_duplicated_from",
    "idx_lists_workspace_finalized_at",
    "idx_lists_workspace_list",
    "idx_lists_workspace_project",
    "idx_lists_workspace_reusable",
    "idx_lists_workspace_source",
    "idx_lists_workspace_status",
    "idx_lists_workspace_type",
    "idx_lists_workspace_updated_at",
    "idx_note_library_collections_workspace_bucket",
    "idx_note_library_collections_workspace_parent",
    "idx_note_library_collections_workspace_path",
    "idx_note_library_collections_workspace_sibling_slug",
    "idx_note_library_collections_workspace_status",
    "idx_note_links_unique_active_target",
    "idx_note_links_workspace_note",
    "idx_note_links_workspace_scope",
    "idx_note_links_workspace_target",
    "idx_note_revisions_workspace_changed_by",
    "idx_note_revisions_workspace_created_at",
    "idx_note_revisions_workspace_import_batch",
    "idx_note_revisions_workspace_import_source",
    "idx_note_revisions_workspace_note",
    "idx_note_revisions_workspace_note_library",
    "idx_note_revisions_workspace_note_revision",
    "idx_note_wiki_links_unique_active_target",
    "idx_note_wiki_links_workspace_note",
    "idx_note_wiki_links_workspace_status",
    "idx_note_wiki_links_workspace_target_note",
    "idx_note_wiki_links_workspace_target_slug",
    "idx_notes_workspace_client",
    "idx_notes_workspace_collection",
    "idx_notes_workspace_created_by",
    "idx_notes_workspace_import_batch",
    "idx_notes_workspace_import_source",
    "idx_notes_workspace_library",
    "idx_notes_workspace_library_security",
    "idx_notes_workspace_library_status",
    "idx_notes_workspace_library_visibility",
    "idx_notes_workspace_linked_user",
    "idx_notes_workspace_note",
    "idx_notes_workspace_owner",
    "idx_notes_workspace_project",
    "idx_notes_workspace_security_mode",
    "idx_notes_workspace_slug",
    "idx_notes_workspace_slug_lookup",
    "idx_notes_workspace_status",
    "idx_notes_workspace_task",
    "idx_notes_workspace_ticket",
    "idx_notes_workspace_updated_at",
    "idx_notes_workspace_visibility",
    "idx_notification_subscriptions_target",
    "idx_notification_subscriptions_unique_active",
    "idx_notification_subscriptions_user",
    "idx_notification_user_display_preferences_user",
    "idx_notification_user_preferences_user",
    "idx_notification_workspace_defaults_workspace",
    "idx_notifications_created_at",
    "idx_notifications_event_type",
    "idx_notifications_recipient_status_created",
    "idx_notifications_record",
    "idx_notifications_workspace_module",
    "idx_search_index_workspace_body",
    "idx_search_index_workspace_client",
    "idx_search_index_workspace_indexed_at",
    "idx_search_index_workspace_library_bucket",
    "idx_search_index_workspace_module",
    "idx_search_index_workspace_note_collection",
    "idx_search_index_workspace_project",
    "idx_search_index_workspace_record_status",
    "idx_search_index_workspace_record_type",
    "idx_search_index_workspace_title",
    "idx_tag_assignment_suppressions_source",
    "idx_tag_assignment_suppressions_tag",
    "idx_tag_assignment_suppressions_target",
    "idx_tag_assignment_suppressions_unique",
    "idx_tag_assignments_propagation_source",
    "idx_tag_assignments_source_assignment",
    "idx_tag_assignments_tag_target",
    "idx_tag_assignments_target",
    "idx_tag_assignments_unique_target_tag",
    "idx_tags_workspace_slug",
    "idx_tags_workspace_status",
    "idx_task_checklist_items_task",
    "idx_task_checklist_items_workspace_updated",
    "idx_task_relationships_active_pair",
    "idx_task_relationships_child",
    "idx_task_relationships_parent",
    "idx_tasks_workspace_due_date",
    "idx_tasks_workspace_last_worked_at",
    "idx_tasks_workspace_resume_context",
    "idx_time_entries_workspace_task",
    "idx_user_workspaces_workspace_status",
    "idx_work_resume_state_dismissed",
    "idx_work_resume_state_last_worked",
    "idx_work_resume_state_record_cleanup",
    "idx_work_resume_state_workspace_client",
    "idx_work_resume_state_workspace_module",
    "idx_work_resume_state_workspace_project",
    "idx_work_resume_state_workspace_user_default",
    "idx_workspace_modules_workspace_status",
  ]);
}

async function assertSeedRows() {
  const [workspaces, users, modules, roles, permissions, workspaceModules, appSettings] = await Promise.all([
    querySql("SELECT COUNT(*) AS count FROM workspaces;"),
    querySql("SELECT COUNT(*) AS count FROM users WHERE protected_user = 'yes';"),
    querySql("SELECT COUNT(*) AS count FROM modules;"),
    querySql("SELECT COUNT(*) AS count FROM roles WHERE role_id IN ('super_admin', 'workspace_admin');"),
    querySql("SELECT COUNT(*) AS count FROM permissions WHERE permission_id IN ('workspace_settings.manage', 'tasks.view', 'time_entries.create', 'notifications.view_own', 'notifications.manage_preferences', 'notifications.manage_workspace_defaults', 'tags.manage', 'tags.view', 'tags.assign', 'tags.remove', 'files.view', 'files.upload', 'files.download', 'files.delete', 'files.manage_quarantine', 'files.manage_workspace_settings', 'notes.view', 'notes.view_all', 'notes.view_private', 'notes.create', 'notes.update', 'notes.archive', 'notes.restore', 'notes.delete', 'notes.view_history', 'notes.restore_revision', 'notes.manage_links', 'notes.manage_library', 'notes.manage_settings', 'notes.publish_client_visible', 'notes.secure.create', 'notes.secure.view', 'notes.secure.update', 'notes.secure.archive', 'notes.secure.restore', 'notes.secure.delete', 'notes.secure.view_history', 'notes.secure.manage');"),
    querySql("SELECT COUNT(*) AS count FROM workspace_modules;"),
    querySql("SELECT COUNT(*) AS count FROM app_settings;"),
  ]);

  assert.equal(Number(workspaces[0].count), 1, "fresh startup should create a default workspace");
  assert.equal(Number(users[0].count), 1, "fresh startup should create one protected super admin");
  assert.ok(Number(modules[0].count) >= 4, "fresh startup should sync registered modules");
  assert.equal(Number(roles[0].count), 2, "fresh baseline should seed current core roles");
  assert.equal(Number(permissions[0].count), 38, "fresh startup should seed core, module, notification, tag, file, and note permissions");
  assert.ok(Number(workspaceModules[0].count) >= 4, "fresh startup should create workspace module status rows");
  assert.ok(Number(appSettings[0].count) >= 3, "fresh startup should seed app settings");
}

async function assertIntegrity() {
  const rows = await querySql("PRAGMA integrity_check;");

  assert.equal(rows[0]?.integrity_check, "ok");
}
