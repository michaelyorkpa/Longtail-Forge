-- Longtail Forge current SQLite baseline.
-- Consolidated for 0.33.5.18.6.5.4; future schema changes should use post-baseline migrations.

CREATE TABLE schema_migrations (
  version TEXT PRIMARY KEY,
  module_id TEXT NOT NULL DEFAULT 'core',
  name TEXT NOT NULL,
  checksum TEXT NOT NULL,
  applied_at TEXT NOT NULL
);
CREATE TABLE workspaces (
  workspace_id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  status TEXT NOT NULL,
  workspace_type TEXT NOT NULL DEFAULT 'business',
  owner_user_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE users (
  user_id TEXT PRIMARY KEY,
  home_workspace_id TEXT NOT NULL,
  username TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL DEFAULT '',
  alt_email TEXT,
  timezone TEXT NOT NULL DEFAULT 'America/New_York',
  password TEXT NOT NULL,
  theme_mode TEXT NOT NULL DEFAULT 'light',
  user_status TEXT NOT NULL DEFAULT 'active',
  protected_user TEXT NOT NULL DEFAULT 'no',
  active_workspace_id TEXT,
  FOREIGN KEY (home_workspace_id) REFERENCES workspaces(workspace_id),
  FOREIGN KEY (active_workspace_id) REFERENCES workspaces(workspace_id)
);
CREATE TABLE sessions (
  session_id TEXT PRIMARY KEY,
  home_workspace_id TEXT NOT NULL,
  active_workspace_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  username TEXT NOT NULL,
  timezone TEXT NOT NULL DEFAULT 'America/New_York',
  ip_address TEXT,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (home_workspace_id) REFERENCES workspaces(workspace_id),
  FOREIGN KEY (active_workspace_id) REFERENCES workspaces(workspace_id),
  FOREIGN KEY (user_id) REFERENCES users(user_id)
);
CREATE TABLE user_workspaces (
  user_workspace_id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  workspace_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (user_id, workspace_id),
  FOREIGN KEY (user_id) REFERENCES users(user_id),
  FOREIGN KEY (workspace_id) REFERENCES workspaces(workspace_id)
);
CREATE TABLE user_workspace_creation_permissions (
  user_id TEXT PRIMARY KEY,
  can_create_workspaces INTEGER NOT NULL DEFAULT 1,
  allowed_workspace_types_json TEXT NOT NULL DEFAULT '["business","personal","family"]',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(user_id)
);
CREATE TABLE app_settings (
  setting_key TEXT PRIMARY KEY,
  setting_value TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE roles (
  role_id TEXT PRIMARY KEY,
  role_name TEXT NOT NULL,
  description TEXT NOT NULL,
  assignable_scope_type TEXT NOT NULL,
  sort_order INTEGER NOT NULL
);
CREATE TABLE permissions (
  permission_id TEXT PRIMARY KEY,
  permission_name TEXT NOT NULL,
  description TEXT NOT NULL
);
CREATE TABLE role_permissions (
  role_id TEXT NOT NULL,
  permission_id TEXT NOT NULL,
  PRIMARY KEY (role_id, permission_id),
  FOREIGN KEY (role_id) REFERENCES roles(role_id),
  FOREIGN KEY (permission_id) REFERENCES permissions(permission_id)
);
CREATE TABLE user_role_assignments (
  assignment_id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  role_id TEXT NOT NULL,
  scope_type TEXT NOT NULL,
  scope_id TEXT,
  client_id TEXT,
  project_id TEXT,
  permission_overrides_json TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (workspace_id, user_id, role_id, scope_type, scope_id),
  FOREIGN KEY (workspace_id) REFERENCES workspaces(workspace_id),
  FOREIGN KEY (user_id) REFERENCES users(user_id),
  FOREIGN KEY (role_id) REFERENCES roles(role_id)
);
CREATE TABLE modules (
  module_id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  category TEXT NOT NULL DEFAULT 'general',
  status TEXT NOT NULL DEFAULT 'active',
  version TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE workspace_modules (
  workspace_id TEXT NOT NULL,
  module_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'enabled',
  enabled_at TEXT,
  disabled_at TEXT,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (workspace_id, module_id),
  FOREIGN KEY (workspace_id) REFERENCES workspaces(workspace_id),
  FOREIGN KEY (module_id) REFERENCES modules(module_id)
);
CREATE TABLE clients (
  id TEXT NOT NULL,
  workspace_id TEXT NOT NULL,
  parent_client_id TEXT,
  name TEXT NOT NULL,
  status TEXT NOT NULL,
  billable TEXT NOT NULL DEFAULT 'yes',
  billing_rate TEXT,
  billing_period_type TEXT,
  billing_period_start_day INTEGER,
  billing_rounding_enabled INTEGER,
  billing_rounding_increment TEXT,
  billing_contact_name TEXT NOT NULL,
  billing_contact_email TEXT NOT NULL,
  billing_contact_alternate_name TEXT NOT NULL,
  billing_contact_alternate_email TEXT NOT NULL,
  billing_contact_phone_number TEXT NOT NULL,
  billing_contact_alternate_phone_number TEXT NOT NULL,
  billing_contact_street_address_1 TEXT NOT NULL,
  billing_contact_street_address_2 TEXT NOT NULL,
  billing_contact_city TEXT NOT NULL,
  billing_contact_state TEXT NOT NULL,
  billing_contact_zip_code TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (workspace_id, id),
  FOREIGN KEY (workspace_id) REFERENCES workspaces(workspace_id)
);
CREATE TABLE projects (
  id TEXT NOT NULL,
  workspace_id TEXT NOT NULL,
  client_id TEXT,
  parent_project_id TEXT,
  name TEXT NOT NULL,
  status TEXT NOT NULL,
  billable TEXT NOT NULL DEFAULT 'yes',
  billing_rate TEXT,
  billing_period_type TEXT,
  billing_period_start_day INTEGER,
  billing_rounding_enabled INTEGER,
  billing_rounding_increment TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL, task_default_priority TEXT NOT NULL DEFAULT 'normal', task_default_status TEXT NOT NULL DEFAULT 'open', task_default_sort_order_json TEXT NOT NULL DEFAULT '["due_date","priority","status"]', task_default_assignee_mode TEXT NOT NULL DEFAULT 'creator',
  PRIMARY KEY (workspace_id, id),
  FOREIGN KEY (workspace_id) REFERENCES workspaces(workspace_id)
);
CREATE TABLE time_entries (
  entry_id TEXT NOT NULL,
  workspace_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  client_id TEXT,
  client_name TEXT NOT NULL DEFAULT '',
  project_id TEXT NOT NULL,
  project_name TEXT NOT NULL,
  description TEXT NOT NULL,
  start_time TEXT NOT NULL,
  end_time TEXT NOT NULL,
  duration_seconds INTEGER NOT NULL,
  duration_hours TEXT NOT NULL,
  billable TEXT NOT NULL DEFAULT 'yes',
  invoice_status TEXT NOT NULL,
  task_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (workspace_id, entry_id),
  FOREIGN KEY (workspace_id) REFERENCES workspaces(workspace_id)
);
CREATE TABLE active_work_timers (
  active_timer_id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  timer_slot TEXT NOT NULL,
  source_module_id TEXT,
  source_type TEXT NOT NULL DEFAULT 'manual',
  source_id TEXT,
  source_label TEXT NOT NULL DEFAULT '',
  source_url TEXT NOT NULL DEFAULT '',
  client_id TEXT,
  client_name TEXT NOT NULL DEFAULT '',
  project_id TEXT NOT NULL,
  project_name TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  billable TEXT NOT NULL DEFAULT 'yes',
  accumulated_elapsed_seconds INTEGER NOT NULL DEFAULT 0,
  last_active_start_time TEXT,
  timer_status TEXT NOT NULL DEFAULT 'paused',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL, source_metadata_json TEXT NOT NULL DEFAULT '{}',
  FOREIGN KEY (workspace_id) REFERENCES workspaces(workspace_id)
);
CREATE TABLE api_keys (
  api_key_id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  created_by_user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  key_hash TEXT NOT NULL UNIQUE,
  key_prefix TEXT NOT NULL,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL,
  last_used_at TEXT,
  revoked_at TEXT,
  FOREIGN KEY (workspace_id) REFERENCES workspaces(workspace_id),
  FOREIGN KEY (created_by_user_id) REFERENCES users(user_id)
);
CREATE TABLE api_key_scopes (
  api_key_id TEXT NOT NULL,
  scope TEXT NOT NULL,
  PRIMARY KEY (api_key_id, scope),
  FOREIGN KEY (api_key_id) REFERENCES api_keys(api_key_id)
);
CREATE TABLE audit_logs (
  audit_id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  actor_user_id TEXT,
  actor_user_name TEXT,
  action TEXT NOT NULL,
  change_type TEXT NOT NULL,
  record_type TEXT NOT NULL,
  record_id TEXT,
  record_label TEXT,
  record_url TEXT,
  previous_value_json TEXT,
  new_value_json TEXT,
  metadata_json TEXT,
  ip_address TEXT,
  FOREIGN KEY (workspace_id) REFERENCES workspaces(workspace_id)
);
CREATE TABLE tasks (
  task_id TEXT NOT NULL,
  workspace_id TEXT NOT NULL,
  client_id TEXT,
  project_id TEXT,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'open',
  priority TEXT NOT NULL DEFAULT 'normal',
  due_date TEXT,
  due_time TEXT,
  due_timezone TEXT,
  due_at_utc TEXT,
  source_type TEXT NOT NULL DEFAULT 'manual',
  source_id TEXT,
  archived_at TEXT,
  completed_at TEXT,
  created_by_user_id TEXT,
  updated_by_user_id TEXT,
  completed_by_user_id TEXT,
  archived_by_user_id TEXT,
  reminder_override_enabled INTEGER NOT NULL DEFAULT 0,
  recurrence_template_id TEXT,
  recurrence_instance_date TEXT,
  billable TEXT NOT NULL DEFAULT 'yes',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL, next_action TEXT NOT NULL DEFAULT '', blocked_reason TEXT NOT NULL DEFAULT '', resume_note TEXT NOT NULL DEFAULT '', last_worked_at TEXT,
  PRIMARY KEY (workspace_id, task_id),
  FOREIGN KEY (workspace_id) REFERENCES workspaces(workspace_id)
);
CREATE TABLE task_assignees (
  task_assignee_id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  task_id TEXT NOT NULL,
  assignee_type TEXT NOT NULL DEFAULT 'user',
  user_id TEXT,
  role_id TEXT,
  assigned_by_user_id TEXT,
  assigned_at TEXT NOT NULL,
  removed_at TEXT,
  FOREIGN KEY (workspace_id, task_id) REFERENCES tasks(workspace_id, task_id)
);
CREATE TABLE task_reminder_offsets (
  reminder_offset_id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  target_type TEXT NOT NULL CHECK (target_type IN ('workspace', 'client', 'project', 'task')),
  target_id TEXT NOT NULL,
  due_kind TEXT NOT NULL CHECK (due_kind IN ('date_only', 'date_time')),
  offset_minutes INTEGER NOT NULL CHECK (offset_minutes > 0),
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (workspace_id) REFERENCES workspaces(workspace_id)
);
CREATE TABLE task_recurrence_templates (
  recurrence_template_id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  client_id TEXT,
  project_id TEXT,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'open',
  priority TEXT NOT NULL DEFAULT 'normal',
  recurrence_anchor_date TEXT NOT NULL,
  due_time TEXT,
  due_timezone TEXT,
  due_at_utc TEXT,
  rrule TEXT NOT NULL,
  recurrence_end_date TEXT,
  template_status TEXT NOT NULL DEFAULT 'active',
  created_by_user_id TEXT,
  updated_by_user_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (workspace_id) REFERENCES workspaces(workspace_id)
);
CREATE TABLE task_recurrence_assignees (
  recurrence_assignee_id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  recurrence_template_id TEXT NOT NULL,
  assignee_type TEXT NOT NULL DEFAULT 'user',
  user_id TEXT,
  role_id TEXT,
  assigned_by_user_id TEXT,
  assigned_at TEXT NOT NULL,
  removed_at TEXT,
  FOREIGN KEY (workspace_id) REFERENCES workspaces(workspace_id),
  FOREIGN KEY (recurrence_template_id) REFERENCES task_recurrence_templates(recurrence_template_id)
);
CREATE INDEX idx_workspaces_type
ON workspaces (workspace_type);
CREATE INDEX idx_workspaces_owner
ON workspaces (owner_user_id);
CREATE INDEX idx_sessions_expires_at
ON sessions (expires_at);
CREATE INDEX idx_sessions_active_workspace
ON sessions (active_workspace_id);
CREATE INDEX idx_user_workspaces_user_status
ON user_workspaces (user_id, status);
CREATE INDEX idx_user_workspaces_workspace_status
ON user_workspaces (workspace_id, status);
CREATE INDEX idx_user_workspaces_user_workspace
ON user_workspaces (user_id, workspace_id);
CREATE UNIQUE INDEX idx_users_unique_user_id
ON users (user_id);
CREATE INDEX idx_user_role_assignments_workspace_user
ON user_role_assignments (workspace_id, user_id);
CREATE INDEX idx_user_role_assignments_workspace_scope
ON user_role_assignments (workspace_id, scope_type, scope_id);
CREATE INDEX idx_workspace_modules_workspace_status
ON workspace_modules (workspace_id, status);
CREATE INDEX idx_workspace_modules_module
ON workspace_modules (module_id);
CREATE INDEX idx_clients_workspace_status_updated
ON clients (workspace_id, status, updated_at);
CREATE INDEX idx_clients_workspace_parent
ON clients (workspace_id, parent_client_id, status, name);
CREATE INDEX idx_projects_workspace_client_status_updated
ON projects (workspace_id, client_id, status, updated_at);
CREATE INDEX idx_projects_workspace_status_updated
ON projects (workspace_id, status, updated_at);
CREATE INDEX idx_projects_workspace_parent
ON projects (workspace_id, parent_project_id, status, name);
CREATE INDEX idx_projects_workspace_client_parent
ON projects (workspace_id, client_id, parent_project_id, status, name);
CREATE INDEX idx_time_entries_workspace_project_end
ON time_entries (workspace_id, project_id, end_time);
CREATE INDEX idx_time_entries_workspace_user_end
ON time_entries (workspace_id, user_id, end_time);
CREATE INDEX idx_time_entries_workspace_task
ON time_entries (workspace_id, task_id, end_time);
CREATE UNIQUE INDEX idx_active_work_timers_user_slot
ON active_work_timers (workspace_id, user_id, timer_slot);
CREATE UNIQUE INDEX idx_active_work_timers_user_source
ON active_work_timers (workspace_id, user_id, source_module_id, source_type, source_id)
WHERE source_id IS NOT NULL AND source_id != '';
CREATE INDEX idx_active_work_timers_running
ON active_work_timers (workspace_id, user_id, timer_status);
CREATE INDEX idx_active_work_timers_source
ON active_work_timers (workspace_id, source_module_id, source_type, source_id, timer_status);
CREATE INDEX idx_api_keys_workspace_status
ON api_keys (workspace_id, status);
CREATE INDEX idx_api_keys_hash
ON api_keys (key_hash);
CREATE INDEX idx_audit_logs_workspace_created
ON audit_logs (workspace_id, created_at);
CREATE INDEX idx_audit_logs_workspace_actor
ON audit_logs (workspace_id, actor_user_id);
CREATE INDEX idx_audit_logs_workspace_record_type
ON audit_logs (workspace_id, record_type);
CREATE INDEX idx_audit_logs_workspace_change_type
ON audit_logs (workspace_id, change_type);
CREATE INDEX idx_audit_logs_workspace_record_id
ON audit_logs (workspace_id, record_id);
CREATE INDEX idx_audit_logs_ip_address
ON audit_logs (workspace_id, ip_address);
CREATE INDEX idx_tasks_workspace_status_updated
ON tasks (workspace_id, status, updated_at);
CREATE INDEX idx_tasks_workspace_client_status
ON tasks (workspace_id, client_id, status, updated_at);
CREATE INDEX idx_tasks_workspace_project_status
ON tasks (workspace_id, project_id, status, updated_at);
CREATE INDEX idx_tasks_workspace_due_date
ON tasks (workspace_id, due_date, due_time);
CREATE INDEX idx_tasks_workspace_archived
ON tasks (workspace_id, archived_at);
CREATE INDEX idx_tasks_recurrence_template
ON tasks (workspace_id, recurrence_template_id, recurrence_instance_date);
CREATE INDEX idx_task_assignees_task
ON task_assignees (workspace_id, task_id, removed_at);
CREATE INDEX idx_task_assignees_user
ON task_assignees (workspace_id, user_id, removed_at);
CREATE UNIQUE INDEX idx_task_assignees_active_user_unique
ON task_assignees (workspace_id, task_id, assignee_type, user_id)
WHERE removed_at IS NULL AND assignee_type = 'user';
CREATE INDEX idx_task_reminder_offsets_target
ON task_reminder_offsets (workspace_id, target_type, target_id, due_kind, sort_order);
CREATE INDEX idx_task_reminder_offsets_workspace
ON task_reminder_offsets (workspace_id, due_kind);
CREATE INDEX idx_task_recurrence_templates_workspace
ON task_recurrence_templates (workspace_id, template_status, updated_at);
CREATE INDEX idx_task_recurrence_assignees_template
ON task_recurrence_assignees (workspace_id, recurrence_template_id, removed_at);
CREATE UNIQUE INDEX idx_task_recurrence_assignees_active_user_unique
ON task_recurrence_assignees (workspace_id, recurrence_template_id, assignee_type, user_id)
WHERE removed_at IS NULL AND assignee_type = 'user';
CREATE TABLE "workspace_settings" (
  workspace_id TEXT PRIMARY KEY,
  fiscal_year_start_month INTEGER NOT NULL,
  fiscal_year_start_day INTEGER NOT NULL,
  default_billing_rate TEXT,
  billing_period_type TEXT NOT NULL,
  billing_period_start_day INTEGER NOT NULL,
  rounding_enabled INTEGER NOT NULL,
  rounding_increment TEXT NOT NULL,
  audit_logging_enabled INTEGER NOT NULL DEFAULT 1,
  audit_retention_days INTEGER NOT NULL DEFAULT 30,
  audit_settings_updated_at TEXT,
  task_timers_enabled INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (workspace_id) REFERENCES workspaces(workspace_id)
);
CREATE INDEX idx_tasks_workspace_due_updated
ON tasks (workspace_id, due_date, due_time, updated_at);
CREATE INDEX idx_task_assignees_workspace_active_user
ON task_assignees (workspace_id, removed_at, user_id);
CREATE INDEX idx_time_entries_workspace_end
ON time_entries (workspace_id, end_time);
CREATE INDEX idx_clients_workspace_name
ON clients (workspace_id, name);
CREATE INDEX idx_projects_workspace_name
ON projects (workspace_id, name);
CREATE INDEX idx_user_role_assignments_workspace_user_updated
ON user_role_assignments (workspace_id, user_id, updated_at, assignment_id);
CREATE TABLE notifications (
  notification_id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  module_id TEXT,
  event_type TEXT NOT NULL,
  recipient_user_id TEXT NOT NULL,
  actor_user_id TEXT,
  record_type TEXT,
  record_id TEXT,
  title TEXT NOT NULL,
  body TEXT NOT NULL DEFAULT '',
  url TEXT,
  status TEXT NOT NULL DEFAULT 'unread' CHECK (status IN ('unread', 'read', 'dismissed', 'archived')),
  priority TEXT NOT NULL DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
  created_at TEXT NOT NULL,
  read_at TEXT,
  dismissed_at TEXT,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  FOREIGN KEY (workspace_id) REFERENCES workspaces(workspace_id),
  FOREIGN KEY (recipient_user_id) REFERENCES users(user_id),
  FOREIGN KEY (actor_user_id) REFERENCES users(user_id)
);
CREATE INDEX idx_notifications_recipient_status_created
ON notifications (workspace_id, recipient_user_id, status, created_at DESC);
CREATE INDEX idx_notifications_workspace_module
ON notifications (workspace_id, module_id);
CREATE INDEX idx_notifications_record
ON notifications (workspace_id, record_type, record_id);
CREATE INDEX idx_notifications_event_type
ON notifications (workspace_id, event_type);
CREATE INDEX idx_notifications_created_at
ON notifications (created_at);
CREATE TABLE notification_user_preferences (
  workspace_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (workspace_id, user_id, event_type),
  FOREIGN KEY (workspace_id) REFERENCES workspaces(workspace_id),
  FOREIGN KEY (user_id) REFERENCES users(user_id)
);
CREATE TABLE notification_workspace_defaults (
  workspace_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  priority TEXT NOT NULL DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (workspace_id, event_type),
  FOREIGN KEY (workspace_id) REFERENCES workspaces(workspace_id)
);
CREATE INDEX idx_notification_user_preferences_user
ON notification_user_preferences (workspace_id, user_id, enabled);
CREATE INDEX idx_notification_workspace_defaults_workspace
ON notification_workspace_defaults (workspace_id, enabled);
CREATE TABLE tags (
  tag_id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  color TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived', 'disabled')),
  created_by_user_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (workspace_id) REFERENCES workspaces(workspace_id),
  FOREIGN KEY (created_by_user_id) REFERENCES users(user_id)
);
CREATE UNIQUE INDEX idx_tags_workspace_slug
ON tags (workspace_id, slug);
CREATE INDEX idx_tags_workspace_status
ON tags (workspace_id, status);
CREATE TABLE notification_subscriptions (
  notification_subscription_id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  module_id TEXT NOT NULL,
  target_type TEXT NOT NULL,
  target_id TEXT NOT NULL,
  event_type TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (workspace_id) REFERENCES workspaces(workspace_id),
  FOREIGN KEY (user_id) REFERENCES users(user_id)
);
CREATE UNIQUE INDEX idx_notification_subscriptions_unique_active
ON notification_subscriptions (
  workspace_id,
  user_id,
  module_id,
  target_type,
  target_id,
  COALESCE(event_type, '')
);
CREATE INDEX idx_notification_subscriptions_user
ON notification_subscriptions (workspace_id, user_id, status);
CREATE INDEX idx_notification_subscriptions_target
ON notification_subscriptions (workspace_id, module_id, target_type, target_id, status);
CREATE TABLE search_index (
  search_index_id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  module_id TEXT NOT NULL,
  record_type TEXT NOT NULL,
  record_id TEXT NOT NULL,
  title TEXT NOT NULL DEFAULT '',
  summary TEXT NOT NULL DEFAULT '',
  body TEXT NOT NULL DEFAULT '',
  tags_text TEXT NOT NULL DEFAULT '',
  client_id TEXT,
  project_id TEXT,
  visibility TEXT NOT NULL DEFAULT 'normal',
  record_status TEXT NOT NULL DEFAULT 'active',
  source TEXT NOT NULL DEFAULT '',
  record_created_at TEXT,
  record_updated_at TEXT,
  indexed_at TEXT NOT NULL, library_bucket TEXT, note_collection_id TEXT, collection_path TEXT,
  FOREIGN KEY (workspace_id) REFERENCES workspaces(workspace_id),
  FOREIGN KEY (module_id) REFERENCES modules(module_id),
  UNIQUE (workspace_id, module_id, record_type, record_id)
);
CREATE INDEX idx_search_index_workspace_record_type
ON search_index (workspace_id, record_type);
CREATE INDEX idx_search_index_workspace_module
ON search_index (workspace_id, module_id);
CREATE INDEX idx_search_index_workspace_client
ON search_index (workspace_id, client_id);
CREATE INDEX idx_search_index_workspace_project
ON search_index (workspace_id, project_id);
CREATE INDEX idx_search_index_workspace_record_status
ON search_index (workspace_id, record_status);
CREATE INDEX idx_search_index_workspace_indexed_at
ON search_index (workspace_id, indexed_at);
CREATE INDEX idx_search_index_workspace_title
ON search_index (workspace_id, title);
CREATE INDEX idx_search_index_workspace_body
ON search_index (workspace_id, body);
CREATE TABLE tag_assignments (
  tag_assignment_id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  tag_id TEXT NOT NULL,
  target_type TEXT NOT NULL,
  target_id TEXT NOT NULL,
  created_by_user_id TEXT,
  source TEXT NOT NULL DEFAULT 'manual' CHECK (source IN ('manual', 'propagated', 'system')),
  source_assignment_id TEXT,
  source_target_type TEXT,
  source_target_id TEXT,
  propagation_rule_id TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (workspace_id) REFERENCES workspaces(workspace_id),
  FOREIGN KEY (tag_id) REFERENCES tags(tag_id),
  FOREIGN KEY (created_by_user_id) REFERENCES users(user_id)
);
CREATE INDEX idx_tag_assignments_target
ON tag_assignments (workspace_id, target_type, target_id);
CREATE INDEX idx_tag_assignments_tag_target
ON tag_assignments (workspace_id, tag_id, target_type);
CREATE UNIQUE INDEX idx_tag_assignments_unique_target_tag
ON tag_assignments (workspace_id, tag_id, target_type, target_id);
CREATE INDEX idx_tag_assignments_propagation_source
ON tag_assignments (workspace_id, source_target_type, source_target_id, propagation_rule_id);
CREATE INDEX idx_tag_assignments_source_assignment
ON tag_assignments (workspace_id, source_assignment_id);
CREATE TABLE tag_assignment_suppressions (
  tag_assignment_suppression_id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  tag_id TEXT NOT NULL,
  target_type TEXT NOT NULL,
  target_id TEXT NOT NULL,
  source_target_type TEXT NOT NULL,
  source_target_id TEXT NOT NULL,
  propagation_rule_id TEXT NOT NULL DEFAULT '',
  suppressed_by_user_id TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (workspace_id) REFERENCES workspaces(workspace_id),
  FOREIGN KEY (tag_id) REFERENCES tags(tag_id),
  FOREIGN KEY (suppressed_by_user_id) REFERENCES users(user_id)
);
CREATE UNIQUE INDEX idx_tag_assignment_suppressions_unique
ON tag_assignment_suppressions (
  workspace_id,
  tag_id,
  target_type,
  target_id,
  source_target_type,
  source_target_id,
  propagation_rule_id
);
CREATE INDEX idx_tag_assignment_suppressions_target
ON tag_assignment_suppressions (workspace_id, target_type, target_id);
CREATE INDEX idx_tag_assignment_suppressions_source
ON tag_assignment_suppressions (workspace_id, source_target_type, source_target_id, propagation_rule_id);
CREATE INDEX idx_tag_assignment_suppressions_tag
ON tag_assignment_suppressions (workspace_id, tag_id);
CREATE TABLE files (
  file_id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  storage_provider TEXT NOT NULL DEFAULT 'local',
  storage_key TEXT NOT NULL,
  original_filename TEXT NOT NULL,
  stored_filename TEXT NOT NULL,
  display_name TEXT NOT NULL,
  extension TEXT,
  mime_type_claimed TEXT,
  mime_type_detected TEXT,
  file_size_bytes INTEGER NOT NULL DEFAULT 0,
  sha256_hash TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'available', 'quarantined', 'deleted')),
  scan_status TEXT NOT NULL DEFAULT 'not_required' CHECK (scan_status IN ('not_required', 'pending', 'passed', 'failed', 'error')),
  quarantine_reason TEXT,
  uploaded_by_user_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT,
  metadata_json TEXT, storage_kind TEXT NOT NULL DEFAULT 'internal', external_source_provider TEXT, external_source_id TEXT, external_availability_status TEXT NOT NULL DEFAULT 'not_external', external_reported_bytes INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY (workspace_id) REFERENCES workspaces(workspace_id),
  FOREIGN KEY (uploaded_by_user_id) REFERENCES users(user_id)
);
CREATE TABLE file_attachments (
  file_attachment_id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  file_id TEXT NOT NULL,
  module_id TEXT NOT NULL,
  target_type TEXT NOT NULL,
  target_id TEXT NOT NULL,
  client_id TEXT,
  project_id TEXT,
  visibility TEXT NOT NULL DEFAULT 'private',
  attachment_role TEXT,
  caption TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  attached_by_user_id TEXT,
  created_at TEXT NOT NULL,
  removed_at TEXT,
  metadata_json TEXT,
  FOREIGN KEY (workspace_id) REFERENCES workspaces(workspace_id),
  FOREIGN KEY (file_id) REFERENCES files(file_id),
  FOREIGN KEY (attached_by_user_id) REFERENCES users(user_id)
);
CREATE INDEX idx_files_workspace_file
ON files (workspace_id, file_id);
CREATE INDEX idx_files_workspace_status
ON files (workspace_id, status);
CREATE INDEX idx_files_workspace_hash
ON files (workspace_id, sha256_hash);
CREATE UNIQUE INDEX idx_files_storage_provider_key
ON files (storage_provider, storage_key);
CREATE INDEX idx_file_attachments_workspace_file
ON file_attachments (workspace_id, file_id);
CREATE INDEX idx_file_attachments_workspace_module
ON file_attachments (workspace_id, module_id);
CREATE INDEX idx_file_attachments_workspace_target
ON file_attachments (workspace_id, target_type, target_id);
CREATE INDEX idx_file_attachments_workspace_client
ON file_attachments (workspace_id, client_id);
CREATE INDEX idx_file_attachments_workspace_project
ON file_attachments (workspace_id, project_id);
CREATE UNIQUE INDEX idx_file_attachments_unique_active_target
ON file_attachments (workspace_id, file_id, module_id, target_type, target_id)
WHERE removed_at IS NULL;
CREATE TABLE file_reports (
  file_report_id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  file_id TEXT NOT NULL,
  file_attachment_id TEXT,
  report_reason TEXT NOT NULL,
  report_notes TEXT,
  reported_by_user_id TEXT,
  created_at TEXT NOT NULL,
  metadata_json TEXT,
  FOREIGN KEY (workspace_id) REFERENCES workspaces(workspace_id),
  FOREIGN KEY (file_id) REFERENCES files(file_id),
  FOREIGN KEY (file_attachment_id) REFERENCES file_attachments(file_attachment_id),
  FOREIGN KEY (reported_by_user_id) REFERENCES users(user_id)
);
CREATE INDEX idx_file_reports_workspace_file
ON file_reports (workspace_id, file_id, created_at);
CREATE INDEX idx_file_reports_workspace_attachment
ON file_reports (workspace_id, file_attachment_id, created_at);
CREATE TABLE note_links (
  note_link_id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  note_id TEXT NOT NULL,
  module_id TEXT NOT NULL,
  target_type TEXT NOT NULL,
  target_id TEXT NOT NULL,
  link_role TEXT NOT NULL DEFAULT 'related',
  scope_role TEXT NOT NULL DEFAULT 'related' CHECK (scope_role IN ('primary', 'context', 'related')),
  created_by_user_id TEXT,
  created_at TEXT NOT NULL,
  removed_at TEXT,
  metadata_json TEXT,
  FOREIGN KEY (workspace_id) REFERENCES workspaces(workspace_id),
  FOREIGN KEY (note_id) REFERENCES notes(note_id),
  FOREIGN KEY (created_by_user_id) REFERENCES users(user_id)
);
CREATE INDEX idx_note_links_workspace_note
ON note_links (workspace_id, note_id);
CREATE INDEX idx_note_links_workspace_target
ON note_links (workspace_id, module_id, target_type, target_id);
CREATE INDEX idx_note_links_workspace_scope
ON note_links (workspace_id, note_id, scope_role);
CREATE UNIQUE INDEX idx_note_links_unique_active_target
ON note_links (workspace_id, note_id, module_id, target_type, target_id, link_role)
WHERE removed_at IS NULL;
CREATE TABLE note_library_collections (
  note_library_collection_id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  title TEXT NOT NULL,
  slug TEXT NOT NULL,
  description TEXT,
  library_bucket TEXT CHECK (library_bucket IN ('active_work', 'ongoing_area', 'reference')),
  parent_collection_id TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived', 'deleted')),
  created_by_user_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  archived_at TEXT,
  deleted_at TEXT,
  metadata_json TEXT, path_cache TEXT, depth INTEGER NOT NULL DEFAULT 0, collection_source TEXT NOT NULL DEFAULT 'manual' CHECK (collection_source IN ('manual', 'imported')), updated_by_user_id TEXT,
  FOREIGN KEY (workspace_id) REFERENCES workspaces(workspace_id),
  FOREIGN KEY (parent_collection_id) REFERENCES note_library_collections(note_library_collection_id),
  FOREIGN KEY (created_by_user_id) REFERENCES users(user_id)
);
CREATE INDEX idx_note_library_collections_workspace_bucket
ON note_library_collections (workspace_id, library_bucket);
CREATE INDEX idx_note_library_collections_workspace_status
ON note_library_collections (workspace_id, status);
CREATE TABLE note_wiki_links (
  note_wiki_link_id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  note_id TEXT NOT NULL,
  source_revision_id TEXT,
  raw_target TEXT NOT NULL,
  target_slug TEXT,
  display_text TEXT,
  target_note_id TEXT,
  status TEXT NOT NULL DEFAULT 'unresolved' CHECK (status IN ('resolved', 'unresolved', 'broken')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  removed_at TEXT,
  metadata_json TEXT,
  FOREIGN KEY (workspace_id) REFERENCES workspaces(workspace_id),
  FOREIGN KEY (note_id) REFERENCES notes(note_id),
  FOREIGN KEY (source_revision_id) REFERENCES note_revisions(note_revision_id),
  FOREIGN KEY (target_note_id) REFERENCES notes(note_id)
);
CREATE INDEX idx_note_wiki_links_workspace_note
ON note_wiki_links (workspace_id, note_id);
CREATE INDEX idx_note_wiki_links_workspace_target_slug
ON note_wiki_links (workspace_id, target_slug);
CREATE INDEX idx_note_wiki_links_workspace_target_note
ON note_wiki_links (workspace_id, target_note_id);
CREATE INDEX idx_note_wiki_links_workspace_status
ON note_wiki_links (workspace_id, status);
CREATE UNIQUE INDEX idx_note_wiki_links_unique_active_target
ON note_wiki_links (workspace_id, note_id, raw_target, display_text)
WHERE removed_at IS NULL;
CREATE INDEX idx_search_index_workspace_library_bucket
ON search_index (workspace_id, library_bucket);
CREATE UNIQUE INDEX idx_note_library_collections_workspace_sibling_slug
ON note_library_collections (
  workspace_id,
  library_bucket,
  COALESCE(parent_collection_id, '__root__'),
  slug
)
WHERE deleted_at IS NULL;
CREATE INDEX idx_note_library_collections_workspace_parent
ON note_library_collections (workspace_id, parent_collection_id, status);
CREATE INDEX idx_note_library_collections_workspace_path
ON note_library_collections (workspace_id, library_bucket, path_cache);
CREATE INDEX idx_search_index_workspace_note_collection
ON search_index (workspace_id, note_collection_id);
CREATE TABLE secure_note_placeholder_warnings (
  warning_id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  note_id TEXT NOT NULL,
  detected_at TEXT NOT NULL,
  reason TEXT NOT NULL,
  body_markdown_present INTEGER NOT NULL DEFAULT 0,
  body_excerpt_present INTEGER NOT NULL DEFAULT 0,
  body_plaintext_index_present INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX idx_secure_note_placeholder_warnings_workspace
ON secure_note_placeholder_warnings (workspace_id, note_id);
CREATE TABLE lists (
  list_id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  client_id TEXT,
  project_id TEXT,
  title TEXT NOT NULL,
  description TEXT,
  list_type TEXT NOT NULL DEFAULT 'procurement' CHECK (list_type IN ('shopping', 'procurement', 'packing', 'supplies', 'parts', 'checklist', 'bill_of_materials')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed', 'finalized', 'archived', 'deleted')),
  is_reusable INTEGER NOT NULL DEFAULT 0 CHECK (is_reusable IN (0, 1)),
  source_list_id TEXT,
  duplicated_from_list_id TEXT,
  created_by_user_id TEXT,
  updated_by_user_id TEXT,
  finalized_by_user_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  completed_at TEXT,
  finalized_at TEXT,
  archived_at TEXT,
  deleted_at TEXT,
  metadata_json TEXT,
  FOREIGN KEY (workspace_id) REFERENCES workspaces(workspace_id),
  FOREIGN KEY (workspace_id, client_id) REFERENCES clients(workspace_id, id),
  FOREIGN KEY (workspace_id, project_id) REFERENCES projects(workspace_id, id),
  FOREIGN KEY (source_list_id) REFERENCES lists(list_id),
  FOREIGN KEY (duplicated_from_list_id) REFERENCES lists(list_id),
  FOREIGN KEY (created_by_user_id) REFERENCES users(user_id),
  FOREIGN KEY (updated_by_user_id) REFERENCES users(user_id),
  FOREIGN KEY (finalized_by_user_id) REFERENCES users(user_id)
);
CREATE INDEX idx_lists_workspace_list
ON lists (workspace_id, list_id);
CREATE INDEX idx_lists_workspace_status
ON lists (workspace_id, status);
CREATE INDEX idx_lists_workspace_type
ON lists (workspace_id, list_type);
CREATE INDEX idx_lists_workspace_reusable
ON lists (workspace_id, is_reusable);
CREATE INDEX idx_lists_workspace_source
ON lists (workspace_id, source_list_id);
CREATE INDEX idx_lists_workspace_duplicated_from
ON lists (workspace_id, duplicated_from_list_id);
CREATE INDEX idx_lists_workspace_client
ON lists (workspace_id, client_id);
CREATE INDEX idx_lists_workspace_project
ON lists (workspace_id, project_id);
CREATE INDEX idx_lists_workspace_created_by
ON lists (workspace_id, created_by_user_id);
CREATE INDEX idx_lists_workspace_updated_at
ON lists (workspace_id, updated_at);
CREATE INDEX idx_lists_workspace_finalized_at
ON lists (workspace_id, finalized_at);
CREATE TABLE list_items (
  list_item_id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  list_id TEXT NOT NULL,
  catalog_item_id TEXT,
  item_name TEXT NOT NULL,
  quantity REAL NOT NULL DEFAULT 1 CHECK (quantity >= 0),
  unit TEXT,
  needed_by_date TEXT,
  vendor_name TEXT,
  url TEXT,
  estimated_cost REAL CHECK (estimated_cost IS NULL OR estimated_cost >= 0),
  actual_cost REAL CHECK (actual_cost IS NULL OR actual_cost >= 0),
  purchase_status TEXT NOT NULL DEFAULT 'needed' CHECK (purchase_status IN ('needed', 'planned', 'ordered', 'received', 'cancelled', 'not_needed')),
  tracking_id TEXT,
  notes TEXT,
  assigned_user_id TEXT,
  created_by_user_id TEXT,
  updated_by_user_id TEXT,
  checked_at TEXT,
  checked_by_user_id TEXT,
  completed_at TEXT,
  completed_by_user_id TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT,
  metadata_json TEXT,
  FOREIGN KEY (workspace_id) REFERENCES workspaces(workspace_id),
  FOREIGN KEY (list_id) REFERENCES lists(list_id),
  FOREIGN KEY (assigned_user_id) REFERENCES users(user_id),
  FOREIGN KEY (created_by_user_id) REFERENCES users(user_id),
  FOREIGN KEY (updated_by_user_id) REFERENCES users(user_id),
  FOREIGN KEY (checked_by_user_id) REFERENCES users(user_id),
  FOREIGN KEY (completed_by_user_id) REFERENCES users(user_id)
);
CREATE INDEX idx_list_items_workspace_list_sort
ON list_items (workspace_id, list_id, sort_order);
CREATE INDEX idx_list_items_workspace_list_status
ON list_items (workspace_id, list_id, purchase_status);
CREATE INDEX idx_list_items_workspace_assigned_user
ON list_items (workspace_id, assigned_user_id);
CREATE INDEX idx_list_items_workspace_needed_by
ON list_items (workspace_id, needed_by_date);
CREATE TABLE list_item_catalog (
  catalog_item_id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  item_name TEXT NOT NULL,
  normalized_name TEXT NOT NULL,
  list_type TEXT,
  client_id TEXT,
  project_id TEXT,
  quantity REAL NOT NULL DEFAULT 1 CHECK (quantity >= 0),
  unit TEXT,
  vendor_name TEXT,
  url TEXT,
  estimated_cost REAL CHECK (estimated_cost IS NULL OR estimated_cost >= 0),
  notes TEXT,
  use_count INTEGER NOT NULL DEFAULT 0 CHECK (use_count >= 0),
  last_used_at TEXT,
  created_by_user_id TEXT,
  updated_by_user_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  archived_at TEXT,
  metadata_json TEXT,
  FOREIGN KEY (workspace_id) REFERENCES workspaces(workspace_id),
  FOREIGN KEY (workspace_id, client_id) REFERENCES clients(workspace_id, id),
  FOREIGN KEY (workspace_id, project_id) REFERENCES projects(workspace_id, id),
  FOREIGN KEY (created_by_user_id) REFERENCES users(user_id),
  FOREIGN KEY (updated_by_user_id) REFERENCES users(user_id)
);
CREATE INDEX idx_list_item_catalog_workspace_name
ON list_item_catalog (workspace_id, normalized_name);
CREATE INDEX idx_list_item_catalog_workspace_type
ON list_item_catalog (workspace_id, list_type);
CREATE INDEX idx_list_item_catalog_workspace_context
ON list_item_catalog (workspace_id, client_id, project_id);
CREATE INDEX idx_list_item_catalog_workspace_usage
ON list_item_catalog (workspace_id, use_count, last_used_at);
CREATE INDEX idx_list_items_workspace_catalog
ON list_items (workspace_id, catalog_item_id);
CREATE TABLE list_links (
  list_link_id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  list_id TEXT NOT NULL,
  module_id TEXT NOT NULL,
  target_type TEXT NOT NULL,
  target_id TEXT NOT NULL,
  link_role TEXT NOT NULL DEFAULT 'related',
  created_by_user_id TEXT,
  created_at TEXT NOT NULL,
  removed_at TEXT,
  metadata_json TEXT,
  FOREIGN KEY (workspace_id) REFERENCES workspaces(workspace_id),
  FOREIGN KEY (list_id) REFERENCES lists(list_id),
  FOREIGN KEY (created_by_user_id) REFERENCES users(user_id)
);
CREATE INDEX idx_list_links_workspace_list
ON list_links (workspace_id, list_id, removed_at);
CREATE INDEX idx_list_links_workspace_target
ON list_links (workspace_id, module_id, target_type, target_id, removed_at);
CREATE INDEX idx_list_links_workspace_created
ON list_links (workspace_id, created_at);
CREATE INDEX idx_tasks_workspace_resume_context
ON tasks (workspace_id, status, updated_at, next_action, blocked_reason, resume_note);
CREATE INDEX idx_tasks_workspace_last_worked_at
ON tasks (workspace_id, last_worked_at, status);
CREATE TABLE task_checklist_items (
  task_checklist_item_id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  task_id TEXT NOT NULL,
  label TEXT NOT NULL,
  is_checked INTEGER NOT NULL DEFAULT 0,
  completed_at TEXT,
  completed_by_user_id TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  deleted_at TEXT,
  deleted_by_user_id TEXT,
  created_by_user_id TEXT,
  updated_by_user_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (workspace_id) REFERENCES workspaces(workspace_id),
  FOREIGN KEY (workspace_id, task_id) REFERENCES tasks(workspace_id, task_id)
);
CREATE INDEX idx_task_checklist_items_task
ON task_checklist_items (workspace_id, task_id, deleted_at, sort_order);
CREATE INDEX idx_task_checklist_items_workspace_updated
ON task_checklist_items (workspace_id, updated_at);
CREATE TABLE task_relationships (
  task_relationship_id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  parent_task_id TEXT NOT NULL,
  child_task_id TEXT NOT NULL,
  is_blocking INTEGER NOT NULL DEFAULT 0,
  created_by_user_id TEXT,
  updated_by_user_id TEXT,
  removed_at TEXT,
  removed_by_user_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (workspace_id) REFERENCES workspaces(workspace_id),
  FOREIGN KEY (workspace_id, parent_task_id) REFERENCES tasks(workspace_id, task_id),
  FOREIGN KEY (workspace_id, child_task_id) REFERENCES tasks(workspace_id, task_id)
);
CREATE INDEX idx_task_relationships_parent
ON task_relationships (workspace_id, parent_task_id, removed_at, is_blocking);
CREATE INDEX idx_task_relationships_child
ON task_relationships (workspace_id, child_task_id, removed_at, is_blocking);
CREATE UNIQUE INDEX idx_task_relationships_active_pair
ON task_relationships (workspace_id, parent_task_id, child_task_id)
WHERE removed_at IS NULL;
CREATE TABLE file_storage_accounting (
  storage_accounting_id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  user_id TEXT NOT NULL DEFAULT '',
  storage_kind TEXT NOT NULL CHECK (storage_kind IN ('internal', 'external')),
  storage_provider TEXT NOT NULL DEFAULT '',
  external_source_provider TEXT NOT NULL DEFAULT '',
  availability_status TEXT NOT NULL DEFAULT '',
  file_count INTEGER NOT NULL DEFAULT 0,
  internal_bytes INTEGER NOT NULL DEFAULT 0,
  external_reported_bytes INTEGER NOT NULL DEFAULT 0,
  calculated_at TEXT NOT NULL,
  metadata_json TEXT,
  FOREIGN KEY (workspace_id) REFERENCES workspaces(workspace_id)
);
CREATE UNIQUE INDEX idx_file_storage_accounting_unique_scope
ON file_storage_accounting (
  workspace_id,
  user_id,
  storage_kind,
  storage_provider,
  external_source_provider,
  availability_status
);
CREATE INDEX idx_file_storage_accounting_workspace_kind
ON file_storage_accounting (workspace_id, storage_kind);
CREATE TABLE file_workspace_settings (
  workspace_id TEXT PRIMARY KEY,
  file_type_policy_mode TEXT NOT NULL DEFAULT 'safe_default' CHECK (file_type_policy_mode IN ('safe_default', 'allowlist', 'blocklist')),
  allowed_extensions_json TEXT NOT NULL DEFAULT '[]',
  blocked_extensions_json TEXT NOT NULL DEFAULT '[]',
  internal_storage_limit_bytes INTEGER,
  per_user_storage_limit_bytes INTEGER,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  metadata_json TEXT,
  FOREIGN KEY (workspace_id) REFERENCES workspaces(workspace_id)
);
CREATE TABLE notification_user_display_preferences (
  workspace_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  grouping_mode TEXT NOT NULL DEFAULT 'client_project' CHECK (grouping_mode IN ('client_project', 'notification_type', 'record_type')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (workspace_id, user_id),
  FOREIGN KEY (workspace_id) REFERENCES workspaces(workspace_id),
  FOREIGN KEY (user_id) REFERENCES users(user_id)
);
CREATE INDEX idx_notification_user_display_preferences_user
ON notification_user_display_preferences (workspace_id, user_id);
CREATE TABLE "notes" (
  note_id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  title TEXT NOT NULL,
  slug TEXT,
  body_markdown TEXT NOT NULL DEFAULT '',
  body_excerpt TEXT,
  body_plaintext_index TEXT,
  note_type TEXT NOT NULL DEFAULT 'general' CHECK (note_type IN ('general', 'meeting', 'research', 'decision', 'procedure', 'reference', 'idea', 'log', 'client', 'project', 'task', 'ticket', 'user')),
  library_bucket TEXT NOT NULL DEFAULT 'reference' CHECK (library_bucket IN ('active_work', 'ongoing_area', 'reference')),
  library_bucket_source TEXT NOT NULL DEFAULT 'derived' CHECK (library_bucket_source IN ('derived', 'manual', 'imported')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'pinned', 'archived', 'deleted')),
  visibility TEXT NOT NULL DEFAULT 'internal' CHECK (visibility IN ('internal', 'private', 'workspace', 'client_visible', 'public')),
  security_mode TEXT NOT NULL DEFAULT 'normal' CHECK (security_mode IN ('normal', 'secure')),
  secure_payload TEXT,
  secure_payload_version TEXT,
  encrypted_data_key TEXT,
  encryption_key_version TEXT,
  encryption_algorithm TEXT,
  key_wrapping_algorithm TEXT,
  encryption_nonce TEXT,
  encryption_auth_tag TEXT,
  key_wrapping_nonce TEXT,
  key_wrapping_auth_tag TEXT,
  encrypted_at TEXT,
  client_id TEXT,
  project_id TEXT,
  task_id TEXT,
  ticket_id TEXT,
  linked_user_id TEXT,
  note_collection_id TEXT,
  owner_user_id TEXT,
  created_by_user_id TEXT,
  updated_by_user_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  archived_at TEXT,
  deleted_at TEXT,
  metadata_json TEXT,
  import_source TEXT,
  import_source_id TEXT,
  import_source_path TEXT,
  imported_at TEXT,
  import_batch_id TEXT,
  original_notebook TEXT,
  original_section_group TEXT,
  original_section TEXT,
  original_page_id TEXT,
  FOREIGN KEY (workspace_id) REFERENCES workspaces(workspace_id),
  FOREIGN KEY (workspace_id, client_id) REFERENCES clients(workspace_id, id),
  FOREIGN KEY (workspace_id, project_id) REFERENCES projects(workspace_id, id),
  FOREIGN KEY (workspace_id, task_id) REFERENCES tasks(workspace_id, task_id),
  FOREIGN KEY (linked_user_id) REFERENCES users(user_id),
  FOREIGN KEY (owner_user_id) REFERENCES users(user_id),
  FOREIGN KEY (created_by_user_id) REFERENCES users(user_id),
  FOREIGN KEY (updated_by_user_id) REFERENCES users(user_id)
);
CREATE UNIQUE INDEX idx_notes_workspace_slug
ON notes (workspace_id, slug)
WHERE slug IS NOT NULL AND deleted_at IS NULL;
CREATE INDEX idx_notes_workspace_note
ON notes (workspace_id, note_id);
CREATE INDEX idx_notes_workspace_library
ON notes (workspace_id, library_bucket);
CREATE INDEX idx_notes_workspace_library_status
ON notes (workspace_id, library_bucket, status);
CREATE INDEX idx_notes_workspace_status
ON notes (workspace_id, status);
CREATE INDEX idx_notes_workspace_visibility
ON notes (workspace_id, visibility);
CREATE INDEX idx_notes_workspace_security_mode
ON notes (workspace_id, security_mode);
CREATE INDEX idx_notes_workspace_owner
ON notes (workspace_id, owner_user_id);
CREATE INDEX idx_notes_workspace_created_by
ON notes (workspace_id, created_by_user_id);
CREATE INDEX idx_notes_workspace_updated_at
ON notes (workspace_id, updated_at);
CREATE INDEX idx_notes_workspace_client
ON notes (workspace_id, client_id);
CREATE INDEX idx_notes_workspace_project
ON notes (workspace_id, project_id);
CREATE INDEX idx_notes_workspace_task
ON notes (workspace_id, task_id);
CREATE INDEX idx_notes_workspace_ticket
ON notes (workspace_id, ticket_id);
CREATE INDEX idx_notes_workspace_linked_user
ON notes (workspace_id, linked_user_id);
CREATE INDEX idx_notes_workspace_library_visibility
ON notes (workspace_id, library_bucket, visibility);
CREATE INDEX idx_notes_workspace_library_security
ON notes (workspace_id, library_bucket, security_mode);
CREATE INDEX idx_notes_workspace_slug_lookup
ON notes (workspace_id, slug);
CREATE INDEX idx_notes_workspace_import_source
ON notes (workspace_id, import_source);
CREATE INDEX idx_notes_workspace_import_batch
ON notes (workspace_id, import_batch_id);
CREATE INDEX idx_notes_workspace_collection
ON notes (workspace_id, note_collection_id);
CREATE INDEX idx_notes_secure_encryption_state
ON notes (workspace_id, security_mode, encrypted_at);
CREATE TABLE "note_revisions" (
  note_revision_id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  note_id TEXT NOT NULL,
  revision_number INTEGER NOT NULL,
  title TEXT NOT NULL,
  body_markdown TEXT NOT NULL DEFAULT '',
  body_excerpt TEXT,
  note_type TEXT NOT NULL DEFAULT 'general' CHECK (note_type IN ('general', 'meeting', 'research', 'decision', 'procedure', 'reference', 'idea', 'log', 'client', 'project', 'task', 'ticket', 'user')),
  library_bucket TEXT NOT NULL DEFAULT 'reference' CHECK (library_bucket IN ('active_work', 'ongoing_area', 'reference')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'pinned', 'archived', 'deleted')),
  visibility TEXT NOT NULL DEFAULT 'internal' CHECK (visibility IN ('internal', 'private', 'workspace', 'client_visible', 'public')),
  security_mode TEXT NOT NULL DEFAULT 'normal' CHECK (security_mode IN ('normal', 'secure')),
  secure_payload TEXT,
  secure_payload_version TEXT,
  encrypted_data_key TEXT,
  encryption_key_version TEXT,
  encryption_algorithm TEXT,
  key_wrapping_algorithm TEXT,
  encryption_nonce TEXT,
  encryption_auth_tag TEXT,
  key_wrapping_nonce TEXT,
  key_wrapping_auth_tag TEXT,
  encrypted_at TEXT,
  changed_by_user_id TEXT,
  change_summary TEXT,
  change_reason TEXT,
  created_at TEXT NOT NULL,
  metadata_json TEXT,
  import_source TEXT,
  import_source_id TEXT,
  import_source_path TEXT,
  imported_at TEXT,
  import_batch_id TEXT,
  original_notebook TEXT,
  original_section_group TEXT,
  original_section TEXT,
  original_page_id TEXT,
  FOREIGN KEY (workspace_id) REFERENCES workspaces(workspace_id),
  FOREIGN KEY (note_id) REFERENCES notes(note_id),
  FOREIGN KEY (changed_by_user_id) REFERENCES users(user_id)
);
CREATE UNIQUE INDEX idx_note_revisions_workspace_note_revision
ON note_revisions (workspace_id, note_id, revision_number);
CREATE INDEX idx_note_revisions_workspace_note
ON note_revisions (workspace_id, note_id);
CREATE INDEX idx_note_revisions_workspace_note_library
ON note_revisions (workspace_id, note_id, library_bucket);
CREATE INDEX idx_note_revisions_workspace_changed_by
ON note_revisions (workspace_id, changed_by_user_id);
CREATE INDEX idx_note_revisions_workspace_created_at
ON note_revisions (workspace_id, created_at);
CREATE INDEX idx_note_revisions_workspace_import_source
ON note_revisions (workspace_id, import_source);
CREATE INDEX idx_note_revisions_workspace_import_batch
ON note_revisions (workspace_id, import_batch_id);
CREATE INDEX idx_note_revisions_secure_encryption_state
ON note_revisions (workspace_id, note_id, security_mode, encrypted_at);
CREATE TABLE work_resume_state (
  resume_state_id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  module_id TEXT NOT NULL,
  record_type TEXT NOT NULL,
  record_id TEXT NOT NULL,
  client_id TEXT,
  project_id TEXT,
  source_url TEXT,
  title_snapshot TEXT NOT NULL DEFAULT '',
  context_label_snapshot TEXT NOT NULL DEFAULT '',
  last_action_type TEXT NOT NULL DEFAULT '',
  last_action_label TEXT NOT NULL DEFAULT '',
  last_worked_at TEXT,
  handoff_note TEXT,
  next_action TEXT,
  blocked_reason TEXT,
  status_snapshot TEXT,
  priority_snapshot TEXT,
  due_at_snapshot TEXT,
  resume_rank_hint INTEGER NOT NULL DEFAULT 0,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  dismissed_at TEXT,
  dismissed_source_updated_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (workspace_id) REFERENCES workspaces(workspace_id),
  FOREIGN KEY (user_id) REFERENCES users(user_id),
  FOREIGN KEY (module_id) REFERENCES modules(module_id),
  FOREIGN KEY (workspace_id, client_id) REFERENCES clients(workspace_id, id),
  FOREIGN KEY (workspace_id, project_id) REFERENCES projects(workspace_id, id),
  UNIQUE (workspace_id, user_id, module_id, record_type, record_id)
);
CREATE INDEX idx_work_resume_state_workspace_user_default
ON work_resume_state (workspace_id, user_id, dismissed_at, last_worked_at DESC, updated_at DESC);
CREATE INDEX idx_work_resume_state_record_cleanup
ON work_resume_state (workspace_id, module_id, record_type, record_id);
CREATE INDEX idx_work_resume_state_workspace_module
ON work_resume_state (workspace_id, user_id, module_id, record_type);
CREATE INDEX idx_work_resume_state_workspace_client
ON work_resume_state (workspace_id, user_id, client_id, dismissed_at, last_worked_at DESC);
CREATE INDEX idx_work_resume_state_workspace_project
ON work_resume_state (workspace_id, user_id, project_id, dismissed_at, last_worked_at DESC);
CREATE INDEX idx_work_resume_state_dismissed
ON work_resume_state (workspace_id, user_id, dismissed_at, dismissed_source_updated_at);
CREATE INDEX idx_work_resume_state_last_worked
ON work_resume_state (workspace_id, user_id, last_worked_at DESC, due_at_snapshot, priority_snapshot);

INSERT OR IGNORE INTO roles (role_id, role_name, description, assignable_scope_type, sort_order)
VALUES
  ('super_admin', 'Super Admin', 'Controls all workspaces and all app administration.', 'global', '10'),
  ('workspace_admin', 'Workspace Administrator', 'Controls users, settings, clients, projects, time, reporting, and audit logs inside one workspace.', 'workspace', '20'),
  ('client_admin', 'Client Administrator', 'Controls client details, projects, and users for one client.', 'client', '30'),
  ('project_admin', 'Project Administrator', 'Controls projects and project assignments for one client.', 'client', '40'),
  ('client_user', 'Client User', 'Can contribute time to projects within one client.', 'client', '50'),
  ('project_user', 'Project User', 'Can contribute time to one project.', 'project', '60'),
  ('client_external_user', 'Client User (External)', 'External collaborator who can contribute time for one client.', 'client', '70');

INSERT OR IGNORE INTO permissions (permission_id, permission_name, description)
VALUES
  ('audit_logs.view', 'View Audit Logs', 'View workspace audit logs.'),
  ('billing.manage', 'Manage Billing Details', 'Change billable status, rates, billing periods, and rounding.'),
  ('clients.manage', 'Manage Clients', 'Create, update, archive, and view clients.'),
  ('developer_example.view', 'View Developer Example', 'View the disabled-by-default developer example module page and sample route output.'),
  ('files.delete', 'Delete Files', 'Remove attachments and delete files through framework file services.'),
  ('files.download', 'Download Files', 'Download available files through framework file services.'),
  ('files.manage_quarantine', 'Manage File Quarantine', 'Review and manage quarantined files.'),
  ('files.manage_workspace_settings', 'Manage File Workspace Settings', 'Manage workspace-level file settings.'),
  ('files.upload', 'Upload Files', 'Upload and attach files through framework file services.'),
  ('files.view', 'View Files', 'View file metadata and attachments in authorized record context.'),
  ('lists.archive', 'Archive Lists', 'Archive lists while preserving historical access.'),
  ('lists.complete', 'Complete Lists', 'Complete and reopen lists.'),
  ('lists.create', 'Create Lists', 'Create lists in authorized workspace, client, or project scopes.'),
  ('lists.delete', 'Delete Lists', 'Soft-delete lists where allowed.'),
  ('lists.duplicate', 'Duplicate Lists', 'Duplicate accessible lists into independent active working lists.'),
  ('lists.finalize', 'Finalize Lists', 'Finalize reproducible historical lists and bill-of-materials records.'),
  ('lists.manage_catalog', 'Manage List Catalog', 'Manage reusable list item catalog entries when catalog workflows ship.'),
  ('lists.manage_items', 'Manage List Items', 'Add, edit, reorder, check, uncheck, complete, and delete list items.'),
  ('lists.manage_links', 'Manage List Links', 'Link and unlink lists to authorized records when linked-record workflows ship.'),
  ('lists.manage_reusable', 'Manage Reusable Lists', 'Mark and manage reusable lists used as reusable starting points.'),
  ('lists.manage_settings', 'Manage Lists Settings', 'Manage workspace-level Lists settings.'),
  ('lists.restore', 'Restore Lists', 'Restore archived or deleted lists where allowed.'),
  ('lists.update', 'Update Lists', 'Update list title, description, type, context, and editable metadata.'),
  ('lists.view', 'View Lists', 'View lists in authorized workspace, client, or project scopes.'),
  ('lists.view_all', 'View All Lists', 'View all lists in an authorized workspace scope.'),
  ('notes.archive', 'Archive Notes', 'Archive notes while preserving their original Library bucket.'),
  ('notes.create', 'Create Notes', 'Create notes in authorized Library and linked-record scopes.'),
  ('notes.delete', 'Delete Notes', 'Soft-delete notes where allowed.'),
  ('notes.manage_library', 'Manage Notes Library', 'Manage Library buckets and Library collections without bypassing note access rules.'),
  ('notes.manage_links', 'Manage Note Links', 'Link and unlink notes to authorized workspace records.'),
  ('notes.manage_settings', 'Manage Notes Settings', 'Manage workspace-level Notes settings.'),
  ('notes.publish_client_visible', 'Publish Client-Visible Notes', 'Expose permitted notes to authorized client-visible surfaces when those surfaces exist.'),
  ('notes.restore', 'Restore Notes', 'Restore archived notes to their previous Library bucket.'),
  ('notes.restore_revision', 'Restore Note Revisions', 'Restore earlier note revisions where edit and history access allow it.'),
  ('notes.secure.archive', 'Archive Secure Notes', 'Archive secure notes without exposing secure body content.'),
  ('notes.secure.create', 'Create Secure Notes', 'Create encrypted secure notes when secure-note storage is configured.'),
  ('notes.secure.delete', 'Delete Secure Notes', 'Soft-delete secure notes without exposing secure body content.'),
  ('notes.secure.manage', 'Manage Secure Notes', 'Administrative secure-note access for users with explicit secure-note responsibility.'),
  ('notes.secure.restore', 'Restore Secure Notes', 'Restore archived secure notes without exposing secure body content.'),
  ('notes.secure.update', 'Update Secure Notes', 'Update encrypted secure-note bodies and metadata when allowed.'),
  ('notes.secure.view', 'View Secure Notes', 'View secure note metadata and decrypted secure-note bodies when allowed.'),
  ('notes.secure.view_history', 'View Secure Note History', 'View secure note revision metadata and decrypt secure revisions when allowed.'),
  ('notes.update', 'Update Notes', 'Update note title, body, metadata, and linked context in authorized scopes.'),
  ('notes.view', 'View Notes', 'View notes in an authorized workspace, client, project, task, ticket, or user scope.'),
  ('notes.view_all', 'View All Notes', 'View all non-secure notes in an authorized workspace scope.'),
  ('notes.view_history', 'View Note History', 'View note revision history and user-friendly note changelog entries.'),
  ('notes.view_private', 'View Private Notes', 'View private notes in authorized scopes.'),
  ('notifications.manage_preferences', 'Manage Notification Preferences', 'Manage personal notification preferences.'),
  ('notifications.manage_workspace_defaults', 'Manage Workspace Notification Defaults', 'Manage workspace-level notification defaults.'),
  ('notifications.view_own', 'View Own Notifications', 'View notification records addressed to the current user.'),
  ('projects.manage', 'Manage Projects', 'Create, update, archive, and view projects.'),
  ('reporting.view', 'View Reporting', 'View reports in scope.'),
  ('roles.assign', 'Assign Roles', 'Add and remove scoped role assignments.'),
  ('tags.assign', 'Assign Tags', 'Assign workspace tags to taggable records.'),
  ('tags.manage', 'Manage Tags', 'Create, update, archive, disable, and restore workspace tag definitions.'),
  ('tags.remove', 'Remove Tags', 'Remove tag assignments from taggable records.'),
  ('tags.view', 'View Tags', 'View workspace tag definitions and assigned tags.'),
  ('tasks.archive', 'Archive Tasks', 'Archive authorized tasks.'),
  ('tasks.assign', 'Assign Tasks', 'Assign tasks to eligible workspace users.'),
  ('tasks.complete', 'Complete Tasks', 'Complete and reopen authorized tasks.'),
  ('tasks.create', 'Create Tasks', 'Create tasks in an authorized workspace, client, or project scope.'),
  ('tasks.edit_all', 'Edit All Tasks', 'Edit all tasks in an authorized workspace, client, or project scope.'),
  ('tasks.edit_own', 'Edit Own Tasks', 'Edit tasks created by or assigned to the actor in scope.'),
  ('tasks.restore', 'Restore Tasks', 'Restore archived tasks.'),
  ('tasks.view', 'View Tasks', 'View tasks in an authorized workspace, client, or project scope.'),
  ('time_entries.create', 'Create Time Entries', 'Create stopwatch and manual time entries.'),
  ('time_entries.edit_all', 'Edit All Time Entries', 'Edit or delete time entries in scope.'),
  ('time_entries.edit_own', 'Edit Own Time Entries', 'Edit or delete only the actor''s own time entries in scope.'),
  ('users.manage', 'Manage Users', 'Create, update, deactivate, and assign users.'),
  ('workspace_settings.manage', 'Manage Workspace Settings', 'View and change workspace settings.');

INSERT OR IGNORE INTO role_permissions (role_id, permission_id)
VALUES
  ('client_admin', 'billing.manage'),
  ('client_admin', 'clients.manage'),
  ('client_admin', 'files.delete'),
  ('client_admin', 'files.download'),
  ('client_admin', 'files.upload'),
  ('client_admin', 'files.view'),
  ('client_admin', 'lists.archive'),
  ('client_admin', 'lists.complete'),
  ('client_admin', 'lists.create'),
  ('client_admin', 'lists.delete'),
  ('client_admin', 'lists.manage_items'),
  ('client_admin', 'lists.restore'),
  ('client_admin', 'lists.update'),
  ('client_admin', 'lists.view'),
  ('client_admin', 'notes.archive'),
  ('client_admin', 'notes.create'),
  ('client_admin', 'notes.manage_library'),
  ('client_admin', 'notes.manage_links'),
  ('client_admin', 'notes.restore'),
  ('client_admin', 'notes.update'),
  ('client_admin', 'notes.view'),
  ('client_admin', 'notes.view_history'),
  ('client_admin', 'notifications.manage_preferences'),
  ('client_admin', 'notifications.view_own'),
  ('client_admin', 'projects.manage'),
  ('client_admin', 'reporting.view'),
  ('client_admin', 'roles.assign'),
  ('client_admin', 'tags.assign'),
  ('client_admin', 'tags.remove'),
  ('client_admin', 'tags.view'),
  ('client_admin', 'tasks.archive'),
  ('client_admin', 'tasks.assign'),
  ('client_admin', 'tasks.complete'),
  ('client_admin', 'tasks.create'),
  ('client_admin', 'tasks.edit_all'),
  ('client_admin', 'tasks.restore'),
  ('client_admin', 'tasks.view'),
  ('client_admin', 'time_entries.create'),
  ('client_admin', 'time_entries.edit_all'),
  ('client_external_user', 'files.download'),
  ('client_external_user', 'files.view'),
  ('client_external_user', 'notifications.manage_preferences'),
  ('client_external_user', 'notifications.view_own'),
  ('client_external_user', 'tags.view'),
  ('client_external_user', 'tasks.view'),
  ('client_external_user', 'time_entries.create'),
  ('client_external_user', 'time_entries.edit_own'),
  ('client_user', 'files.download'),
  ('client_user', 'files.view'),
  ('client_user', 'lists.complete'),
  ('client_user', 'lists.create'),
  ('client_user', 'lists.manage_items'),
  ('client_user', 'lists.update'),
  ('client_user', 'lists.view'),
  ('client_user', 'notes.create'),
  ('client_user', 'notes.manage_links'),
  ('client_user', 'notes.update'),
  ('client_user', 'notes.view'),
  ('client_user', 'notifications.manage_preferences'),
  ('client_user', 'notifications.view_own'),
  ('client_user', 'reporting.view'),
  ('client_user', 'tags.assign'),
  ('client_user', 'tags.remove'),
  ('client_user', 'tags.view'),
  ('client_user', 'tasks.complete'),
  ('client_user', 'tasks.create'),
  ('client_user', 'tasks.edit_own'),
  ('client_user', 'tasks.view'),
  ('client_user', 'time_entries.create'),
  ('client_user', 'time_entries.edit_own'),
  ('project_admin', 'billing.manage'),
  ('project_admin', 'files.delete'),
  ('project_admin', 'files.download'),
  ('project_admin', 'files.upload'),
  ('project_admin', 'files.view'),
  ('project_admin', 'lists.archive'),
  ('project_admin', 'lists.complete'),
  ('project_admin', 'lists.create'),
  ('project_admin', 'lists.delete'),
  ('project_admin', 'lists.manage_items'),
  ('project_admin', 'lists.restore'),
  ('project_admin', 'lists.update'),
  ('project_admin', 'lists.view'),
  ('project_admin', 'notes.archive'),
  ('project_admin', 'notes.create'),
  ('project_admin', 'notes.manage_library'),
  ('project_admin', 'notes.manage_links'),
  ('project_admin', 'notes.restore'),
  ('project_admin', 'notes.update'),
  ('project_admin', 'notes.view'),
  ('project_admin', 'notes.view_history'),
  ('project_admin', 'notifications.manage_preferences'),
  ('project_admin', 'notifications.view_own'),
  ('project_admin', 'projects.manage'),
  ('project_admin', 'reporting.view'),
  ('project_admin', 'roles.assign'),
  ('project_admin', 'tags.assign'),
  ('project_admin', 'tags.remove'),
  ('project_admin', 'tags.view'),
  ('project_admin', 'tasks.archive'),
  ('project_admin', 'tasks.assign'),
  ('project_admin', 'tasks.complete'),
  ('project_admin', 'tasks.create'),
  ('project_admin', 'tasks.edit_all'),
  ('project_admin', 'tasks.restore'),
  ('project_admin', 'tasks.view'),
  ('project_admin', 'time_entries.create'),
  ('project_admin', 'time_entries.edit_all'),
  ('project_user', 'files.download'),
  ('project_user', 'files.view'),
  ('project_user', 'lists.complete'),
  ('project_user', 'lists.create'),
  ('project_user', 'lists.manage_items'),
  ('project_user', 'lists.update'),
  ('project_user', 'lists.view'),
  ('project_user', 'notes.create'),
  ('project_user', 'notes.manage_links'),
  ('project_user', 'notes.update'),
  ('project_user', 'notes.view'),
  ('project_user', 'notifications.manage_preferences'),
  ('project_user', 'notifications.view_own'),
  ('project_user', 'reporting.view'),
  ('project_user', 'tags.assign'),
  ('project_user', 'tags.remove'),
  ('project_user', 'tags.view'),
  ('project_user', 'tasks.complete'),
  ('project_user', 'tasks.create'),
  ('project_user', 'tasks.edit_own'),
  ('project_user', 'tasks.view'),
  ('project_user', 'time_entries.create'),
  ('project_user', 'time_entries.edit_own'),
  ('super_admin', 'audit_logs.view'),
  ('super_admin', 'billing.manage'),
  ('super_admin', 'clients.manage'),
  ('super_admin', 'developer_example.view'),
  ('super_admin', 'files.delete'),
  ('super_admin', 'files.download'),
  ('super_admin', 'files.manage_quarantine'),
  ('super_admin', 'files.manage_workspace_settings'),
  ('super_admin', 'files.upload'),
  ('super_admin', 'files.view'),
  ('super_admin', 'lists.archive'),
  ('super_admin', 'lists.complete'),
  ('super_admin', 'lists.create'),
  ('super_admin', 'lists.delete'),
  ('super_admin', 'lists.duplicate'),
  ('super_admin', 'lists.finalize'),
  ('super_admin', 'lists.manage_catalog'),
  ('super_admin', 'lists.manage_items'),
  ('super_admin', 'lists.manage_links'),
  ('super_admin', 'lists.manage_reusable'),
  ('super_admin', 'lists.manage_settings'),
  ('super_admin', 'lists.restore'),
  ('super_admin', 'lists.update'),
  ('super_admin', 'lists.view'),
  ('super_admin', 'lists.view_all'),
  ('super_admin', 'notes.archive'),
  ('super_admin', 'notes.create'),
  ('super_admin', 'notes.delete'),
  ('super_admin', 'notes.manage_library'),
  ('super_admin', 'notes.manage_links'),
  ('super_admin', 'notes.manage_settings'),
  ('super_admin', 'notes.publish_client_visible'),
  ('super_admin', 'notes.restore'),
  ('super_admin', 'notes.restore_revision'),
  ('super_admin', 'notes.secure.archive'),
  ('super_admin', 'notes.secure.create'),
  ('super_admin', 'notes.secure.delete'),
  ('super_admin', 'notes.secure.manage'),
  ('super_admin', 'notes.secure.restore'),
  ('super_admin', 'notes.secure.update'),
  ('super_admin', 'notes.secure.view'),
  ('super_admin', 'notes.secure.view_history'),
  ('super_admin', 'notes.update'),
  ('super_admin', 'notes.view'),
  ('super_admin', 'notes.view_all'),
  ('super_admin', 'notes.view_history'),
  ('super_admin', 'notes.view_private'),
  ('super_admin', 'notifications.manage_preferences'),
  ('super_admin', 'notifications.manage_workspace_defaults'),
  ('super_admin', 'notifications.view_own'),
  ('super_admin', 'projects.manage'),
  ('super_admin', 'reporting.view'),
  ('super_admin', 'roles.assign'),
  ('super_admin', 'tags.assign'),
  ('super_admin', 'tags.manage'),
  ('super_admin', 'tags.remove'),
  ('super_admin', 'tags.view'),
  ('super_admin', 'tasks.archive'),
  ('super_admin', 'tasks.assign'),
  ('super_admin', 'tasks.complete'),
  ('super_admin', 'tasks.create'),
  ('super_admin', 'tasks.edit_all'),
  ('super_admin', 'tasks.restore'),
  ('super_admin', 'tasks.view'),
  ('super_admin', 'time_entries.create'),
  ('super_admin', 'time_entries.edit_all'),
  ('super_admin', 'time_entries.edit_own'),
  ('super_admin', 'users.manage'),
  ('super_admin', 'workspace_settings.manage'),
  ('workspace_admin', 'audit_logs.view'),
  ('workspace_admin', 'billing.manage'),
  ('workspace_admin', 'clients.manage'),
  ('workspace_admin', 'developer_example.view'),
  ('workspace_admin', 'files.delete'),
  ('workspace_admin', 'files.download'),
  ('workspace_admin', 'files.manage_quarantine'),
  ('workspace_admin', 'files.manage_workspace_settings'),
  ('workspace_admin', 'files.upload'),
  ('workspace_admin', 'files.view'),
  ('workspace_admin', 'lists.archive'),
  ('workspace_admin', 'lists.complete'),
  ('workspace_admin', 'lists.create'),
  ('workspace_admin', 'lists.delete'),
  ('workspace_admin', 'lists.duplicate'),
  ('workspace_admin', 'lists.finalize'),
  ('workspace_admin', 'lists.manage_catalog'),
  ('workspace_admin', 'lists.manage_items'),
  ('workspace_admin', 'lists.manage_links'),
  ('workspace_admin', 'lists.manage_reusable'),
  ('workspace_admin', 'lists.manage_settings'),
  ('workspace_admin', 'lists.restore'),
  ('workspace_admin', 'lists.update'),
  ('workspace_admin', 'lists.view'),
  ('workspace_admin', 'lists.view_all'),
  ('workspace_admin', 'notes.archive'),
  ('workspace_admin', 'notes.create'),
  ('workspace_admin', 'notes.delete'),
  ('workspace_admin', 'notes.manage_library'),
  ('workspace_admin', 'notes.manage_links'),
  ('workspace_admin', 'notes.manage_settings'),
  ('workspace_admin', 'notes.publish_client_visible'),
  ('workspace_admin', 'notes.restore'),
  ('workspace_admin', 'notes.restore_revision'),
  ('workspace_admin', 'notes.secure.archive'),
  ('workspace_admin', 'notes.secure.create'),
  ('workspace_admin', 'notes.secure.delete'),
  ('workspace_admin', 'notes.secure.manage'),
  ('workspace_admin', 'notes.secure.restore'),
  ('workspace_admin', 'notes.secure.update'),
  ('workspace_admin', 'notes.secure.view'),
  ('workspace_admin', 'notes.secure.view_history'),
  ('workspace_admin', 'notes.update'),
  ('workspace_admin', 'notes.view'),
  ('workspace_admin', 'notes.view_all'),
  ('workspace_admin', 'notes.view_history'),
  ('workspace_admin', 'notes.view_private'),
  ('workspace_admin', 'notifications.manage_preferences'),
  ('workspace_admin', 'notifications.manage_workspace_defaults'),
  ('workspace_admin', 'notifications.view_own'),
  ('workspace_admin', 'projects.manage'),
  ('workspace_admin', 'reporting.view'),
  ('workspace_admin', 'roles.assign'),
  ('workspace_admin', 'tags.assign'),
  ('workspace_admin', 'tags.manage'),
  ('workspace_admin', 'tags.remove'),
  ('workspace_admin', 'tags.view'),
  ('workspace_admin', 'tasks.archive'),
  ('workspace_admin', 'tasks.assign'),
  ('workspace_admin', 'tasks.complete'),
  ('workspace_admin', 'tasks.create'),
  ('workspace_admin', 'tasks.edit_all'),
  ('workspace_admin', 'tasks.restore'),
  ('workspace_admin', 'tasks.view'),
  ('workspace_admin', 'time_entries.create'),
  ('workspace_admin', 'time_entries.edit_all'),
  ('workspace_admin', 'users.manage'),
  ('workspace_admin', 'workspace_settings.manage');

