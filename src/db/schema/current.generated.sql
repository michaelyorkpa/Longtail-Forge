-- GENERATED FILE: final SQLite schema verification snapshot.
-- Source: src/db/schema/current.sql plus ordered core/module migrations.
-- Refresh with: npm run db:schema:refresh
-- Do not edit by hand.

CREATE TABLE account_export_recovery_qualifications (
  user_id TEXT PRIMARY KEY,
  qualification_basis TEXT NOT NULL CHECK (qualification_basis = 'former_workspace_administrator'),
  qualification_source TEXT NOT NULL CHECK (qualification_source IN ('membership_loss', 'membership_leave', 'workspace_purge')),
  qualified_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
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

CREATE TABLE api_key_scopes (
  api_key_id TEXT NOT NULL,
  scope TEXT NOT NULL,
  PRIMARY KEY (api_key_id, scope),
  FOREIGN KEY (api_key_id) REFERENCES api_keys(api_key_id)
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

CREATE TABLE app_settings (
  setting_key TEXT PRIMARY KEY,
  setting_value TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
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

CREATE TABLE authentication_throttle_entries (
  scope TEXT NOT NULL,
  dimension TEXT NOT NULL CHECK (dimension IN ('ip', 'account')),
  key_hash TEXT NOT NULL CHECK (length(key_hash) = 64),
  failure_count INTEGER NOT NULL CHECK (failure_count >= 0),
  window_expires_at INTEGER NOT NULL CHECK (window_expires_at >= 0),
  locked_until INTEGER NOT NULL DEFAULT 0 CHECK (locked_until >= 0),
  expires_at INTEGER NOT NULL CHECK (expires_at >= 0),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (scope, dimension, key_hash)
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

CREATE TABLE jobs (
  job_id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  job_type TEXT NOT NULL,
  dedupe_key TEXT,
  payload_json TEXT NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'completed', 'failed', 'dead')),
  priority INTEGER NOT NULL DEFAULT 0,
  available_at TEXT NOT NULL,
  attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  max_attempts INTEGER NOT NULL DEFAULT 3 CHECK (max_attempts > 0),
  locked_at TEXT,
  locked_by TEXT,
  last_error TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  completed_at TEXT,
  dead_at TEXT,
  FOREIGN KEY (workspace_id) REFERENCES workspaces(workspace_id)
);

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
  metadata_json TEXT, path_cache TEXT, depth INTEGER NOT NULL DEFAULT 0, collection_source TEXT NOT NULL DEFAULT 'manual' CHECK (collection_source IN ('manual', 'imported')), updated_by_user_id TEXT, security_policy TEXT NOT NULL DEFAULT 'normal'
CHECK (security_policy IN ('normal', 'secure')), security_transition_state TEXT NOT NULL DEFAULT 'stable'
CHECK (security_transition_state IN ('stable', 'securing', 'failed')), security_transition_action TEXT NOT NULL DEFAULT 'none'
    CHECK (security_transition_action IN ('none', 'enable', 'remove')), security_transition_version INTEGER NOT NULL DEFAULT 0
    CHECK (security_transition_version >= 0), security_transition_job_id TEXT, security_transition_actor_user_id TEXT, security_transition_started_at TEXT, security_transition_error_code TEXT,
  FOREIGN KEY (workspace_id) REFERENCES workspaces(workspace_id),
  FOREIGN KEY (parent_collection_id) REFERENCES note_library_collections(note_library_collection_id),
  FOREIGN KEY (created_by_user_id) REFERENCES users(user_id)
);

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

CREATE TABLE permissions (
  permission_id TEXT PRIMARY KEY,
  permission_name TEXT NOT NULL,
  description TEXT NOT NULL
);

CREATE TABLE "private_feed_tokens" (
  private_feed_token_id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  provider_id TEXT NOT NULL,
  name TEXT NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 120),
  scope_type TEXT NOT NULL DEFAULT 'workspace' CHECK (scope_type IN ('workspace', 'client', 'project')),
  scope_client_id TEXT,
  scope_project_id TEXT,
  token_selector TEXT NOT NULL,
  token_hash TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'revoked')),
  revocation_reason TEXT,
  created_at TEXT NOT NULL,
  rotated_at TEXT,
  revoked_at TEXT,
  updated_at TEXT NOT NULL,
  CHECK (
    (scope_type = 'workspace' AND scope_client_id IS NULL AND scope_project_id IS NULL)
    OR (scope_type = 'client' AND scope_client_id IS NOT NULL AND scope_project_id IS NULL)
    OR (scope_type = 'project' AND scope_project_id IS NOT NULL)
  ),
  UNIQUE (provider_id, token_selector),
  FOREIGN KEY (workspace_id) REFERENCES workspaces(workspace_id),
  FOREIGN KEY (user_id) REFERENCES users(user_id),
  FOREIGN KEY (workspace_id, scope_client_id) REFERENCES clients(workspace_id, id),
  FOREIGN KEY (workspace_id, scope_project_id) REFERENCES projects(workspace_id, id)
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

CREATE TABLE role_permissions (
  role_id TEXT NOT NULL,
  permission_id TEXT NOT NULL,
  PRIMARY KEY (role_id, permission_id),
  FOREIGN KEY (role_id) REFERENCES roles(role_id),
  FOREIGN KEY (permission_id) REFERENCES permissions(permission_id)
);

CREATE TABLE roles (
  role_id TEXT PRIMARY KEY,
  role_name TEXT NOT NULL,
  description TEXT NOT NULL,
  assignable_scope_type TEXT NOT NULL,
  sort_order INTEGER NOT NULL
);

CREATE TABLE schema_migrations (
  version TEXT PRIMARY KEY,
  module_id TEXT NOT NULL DEFAULT 'core',
  name TEXT NOT NULL,
  checksum TEXT NOT NULL,
  applied_at TEXT NOT NULL
);

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

CREATE TABLE "sessions" (
  session_id TEXT PRIMARY KEY,
  home_workspace_id TEXT,
  active_workspace_id TEXT,
  user_id TEXT NOT NULL,
  username TEXT NOT NULL,
  timezone TEXT NOT NULL DEFAULT 'America/New_York',
  ip_address TEXT,
  session_mode TEXT NOT NULL DEFAULT 'normal' CHECK (session_mode IN ('normal', 'account_export_recovery')),
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (home_workspace_id) REFERENCES workspaces(workspace_id),
  FOREIGN KEY (active_workspace_id) REFERENCES workspaces(workspace_id),
  FOREIGN KEY (user_id) REFERENCES users(user_id)
);

CREATE TABLE startup_maintenance_runs (
  maintenance_id TEXT PRIMARY KEY,
  lifecycle TEXT NOT NULL,
  completed_at TEXT NOT NULL,
  app_version TEXT NOT NULL,
  CHECK (lifecycle = 'one-time-migration-versioned-repair')
);

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

CREATE TABLE task_recurrence_checklist_items (
  recurrence_checklist_item_id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  recurrence_template_id TEXT NOT NULL,
  label TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  deleted_at TEXT,
  deleted_by_user_id TEXT,
  created_by_user_id TEXT,
  updated_by_user_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (workspace_id) REFERENCES workspaces(workspace_id),
  FOREIGN KEY (recurrence_template_id) REFERENCES task_recurrence_templates(recurrence_template_id)
);

CREATE TABLE task_recurrence_note_links (
  recurrence_note_link_id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  recurrence_template_id TEXT NOT NULL,
  note_id TEXT NOT NULL,
  link_role TEXT NOT NULL DEFAULT 'related',
  scope_role TEXT NOT NULL DEFAULT 'related',
  sort_order INTEGER NOT NULL DEFAULT 0,
  deleted_at TEXT,
  deleted_by_user_id TEXT,
  created_by_user_id TEXT,
  updated_by_user_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (workspace_id) REFERENCES workspaces(workspace_id),
  FOREIGN KEY (recurrence_template_id) REFERENCES task_recurrence_templates(recurrence_template_id),
  FOREIGN KEY (note_id) REFERENCES notes(note_id)
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
  updated_at TEXT NOT NULL, estimate_minutes INTEGER
CHECK (
  estimate_minutes IS NULL
  OR (estimate_minutes >= 0 AND estimate_minutes % 15 = 0)
), recovery_checkpoint_date TEXT,
  FOREIGN KEY (workspace_id) REFERENCES workspaces(workspace_id)
);

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
  updated_at TEXT NOT NULL, next_action TEXT NOT NULL DEFAULT '', blocked_reason TEXT NOT NULL DEFAULT '', resume_note TEXT NOT NULL DEFAULT '', last_worked_at TEXT, estimate_minutes INTEGER
CHECK (
  estimate_minutes IS NULL
  OR (estimate_minutes >= 0 AND estimate_minutes % 15 = 0)
),
  PRIMARY KEY (workspace_id, task_id),
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

CREATE TABLE user_workspace_creation_permissions (
  user_id TEXT PRIMARY KEY,
  can_create_workspaces INTEGER NOT NULL DEFAULT 1,
  allowed_workspace_types_json TEXT NOT NULL DEFAULT '["business","personal","family"]',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
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

CREATE TABLE "users" (
  user_id TEXT PRIMARY KEY,
  home_workspace_id TEXT,
  username TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL DEFAULT '',
  alt_email TEXT,
  timezone TEXT NOT NULL DEFAULT 'America/New_York',
  password TEXT NOT NULL,
  theme_mode TEXT NOT NULL DEFAULT 'light',
  user_status TEXT NOT NULL DEFAULT 'active',
  protected_user TEXT NOT NULL DEFAULT 'no',
  active_workspace_id TEXT,
  open_external_links_new_tab INTEGER NOT NULL DEFAULT 0 CHECK (open_external_links_new_tab IN (0, 1)),
  theme_auto_source TEXT NOT NULL DEFAULT 'system' CHECK (theme_auto_source IN ('system')),
  password_change_required INTEGER NOT NULL DEFAULT 0,
  preferred_login_landing TEXT NOT NULL DEFAULT 'dashboard'
    CHECK (preferred_login_landing IN ('dashboard', 'workbench', 'tasks', 'notes', 'lists')),
  preferred_workspace_switch_landing TEXT NOT NULL DEFAULT 'dashboard'
    CHECK (preferred_workspace_switch_landing IN ('dashboard', 'workbench', 'tasks', 'notes', 'lists')), preferred_calendar_view TEXT
CHECK (preferred_calendar_view IS NULL OR preferred_calendar_view IN ('day', 'week', 'month')),
  FOREIGN KEY (home_workspace_id) REFERENCES workspaces(workspace_id),
  FOREIGN KEY (active_workspace_id) REFERENCES workspaces(workspace_id)
);

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

CREATE TABLE workspace_backup_exports (
  backup_id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  archive_filename TEXT NOT NULL,
  archive_sha256 TEXT NOT NULL,
  app_version TEXT NOT NULL,
  created_by_user_id TEXT,
  status TEXT NOT NULL DEFAULT 'created',
  secure_notes_recovery_required INTEGER NOT NULL DEFAULT 0,
  file_object_count INTEGER NOT NULL DEFAULT 0,
  file_object_bytes INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  FOREIGN KEY (workspace_id) REFERENCES workspaces(workspace_id),
  FOREIGN KEY (created_by_user_id) REFERENCES users(user_id)
);

CREATE TABLE workspace_deletion_lifecycle (
  workspace_id TEXT PRIMARY KEY,
  requested_by_user_id TEXT,
  requested_at TEXT NOT NULL,
  purge_after TEXT NOT NULL,
  backup_id TEXT,
  no_current_backup_acknowledged INTEGER NOT NULL DEFAULT 0, status TEXT NOT NULL DEFAULT 'pending_deletion'
CHECK (status IN ('pending_deletion', 'purging')), purge_started_at TEXT, purge_token TEXT,
  FOREIGN KEY (workspace_id) REFERENCES workspaces(workspace_id),
  FOREIGN KEY (requested_by_user_id) REFERENCES users(user_id),
  FOREIGN KEY (backup_id) REFERENCES workspace_backup_exports(backup_id),
  CHECK (purge_after > requested_at),
  CHECK (
    (backup_id IS NOT NULL AND no_current_backup_acknowledged = 0)
    OR (backup_id IS NULL AND no_current_backup_acknowledged = 1)
  )
);

CREATE TABLE workspace_module_settings (
  workspace_id TEXT NOT NULL,
  module_id TEXT NOT NULL,
  setting_id TEXT NOT NULL,
  setting_value_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (workspace_id, module_id, setting_id),
  FOREIGN KEY (workspace_id) REFERENCES workspaces(workspace_id) ON DELETE CASCADE
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

CREATE TABLE workspace_purge_tombstones (
  purge_tombstone_id TEXT PRIMARY KEY,
  workspace_fingerprint TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL CHECK (status IN ('in_progress', 'complete')),
  requested_at TEXT NOT NULL,
  purge_started_at TEXT NOT NULL,
  purged_at TEXT,
  attempt_count INTEGER NOT NULL DEFAULT 1 CHECK (attempt_count > 0),
  file_object_count INTEGER NOT NULL DEFAULT 0,
  file_object_bytes INTEGER NOT NULL DEFAULT 0,
  database_row_count INTEGER NOT NULL DEFAULT 0,
  last_failure_class TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK (
    (status = 'in_progress' AND purged_at IS NULL)
    OR (status = 'complete' AND purged_at IS NOT NULL)
  )
);

CREATE TABLE "workspace_settings" (
  workspace_id TEXT PRIMARY KEY,
  audit_logging_enabled INTEGER NOT NULL DEFAULT 1,
  audit_retention_days INTEGER NOT NULL DEFAULT 30,
  audit_settings_updated_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (workspace_id) REFERENCES workspaces(workspace_id)
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

CREATE INDEX idx_active_work_timers_running
ON active_work_timers (workspace_id, user_id, timer_status);

CREATE INDEX idx_active_work_timers_source
ON active_work_timers (workspace_id, source_module_id, source_type, source_id, timer_status);

CREATE UNIQUE INDEX idx_active_work_timers_user_slot
ON active_work_timers (workspace_id, user_id, timer_slot);

CREATE UNIQUE INDEX idx_active_work_timers_user_source
ON active_work_timers (workspace_id, user_id, source_module_id, source_type, source_id)
WHERE source_id IS NOT NULL AND source_id != '';

CREATE INDEX idx_api_keys_hash
ON api_keys (key_hash);

CREATE INDEX idx_api_keys_workspace_status
ON api_keys (workspace_id, status);

CREATE INDEX idx_audit_logs_ip_address
ON audit_logs (workspace_id, ip_address);

CREATE INDEX idx_audit_logs_workspace_actor
ON audit_logs (workspace_id, actor_user_id);

CREATE INDEX idx_audit_logs_workspace_change_type
ON audit_logs (workspace_id, change_type);

CREATE INDEX idx_audit_logs_workspace_created
ON audit_logs (workspace_id, created_at);

CREATE INDEX idx_audit_logs_workspace_record_id
ON audit_logs (workspace_id, record_id);

CREATE INDEX idx_audit_logs_workspace_record_type
ON audit_logs (workspace_id, record_type);

CREATE INDEX idx_authentication_throttle_expires_at
ON authentication_throttle_entries (expires_at);

CREATE INDEX idx_authentication_throttle_updated_at
ON authentication_throttle_entries (updated_at);

CREATE INDEX idx_clients_workspace_name
ON clients (workspace_id, name);

CREATE INDEX idx_clients_workspace_parent
ON clients (workspace_id, parent_client_id, status, name);

CREATE INDEX idx_clients_workspace_status_updated
ON clients (workspace_id, status, updated_at);

CREATE UNIQUE INDEX idx_file_attachments_unique_active_target
ON file_attachments (workspace_id, file_id, module_id, target_type, target_id)
WHERE removed_at IS NULL;

CREATE INDEX idx_file_attachments_workspace_client
ON file_attachments (workspace_id, client_id);

CREATE INDEX idx_file_attachments_workspace_file
ON file_attachments (workspace_id, file_id);

CREATE INDEX idx_file_attachments_workspace_module
ON file_attachments (workspace_id, module_id);

CREATE INDEX idx_file_attachments_workspace_project
ON file_attachments (workspace_id, project_id);

CREATE INDEX idx_file_attachments_workspace_target
ON file_attachments (workspace_id, target_type, target_id);

CREATE INDEX idx_file_reports_workspace_attachment
ON file_reports (workspace_id, file_attachment_id, created_at);

CREATE INDEX idx_file_reports_workspace_file
ON file_reports (workspace_id, file_id, created_at);

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

CREATE UNIQUE INDEX idx_files_storage_provider_key
ON files (storage_provider, storage_key);

CREATE INDEX idx_files_workspace_file
ON files (workspace_id, file_id);

CREATE INDEX idx_files_workspace_hash
ON files (workspace_id, sha256_hash);

CREATE INDEX idx_files_workspace_status
ON files (workspace_id, status);

CREATE UNIQUE INDEX idx_jobs_active_dedupe
ON jobs (workspace_id, job_type, dedupe_key)
WHERE dedupe_key IS NOT NULL
  AND status IN ('pending', 'running', 'failed');

CREATE INDEX idx_jobs_pending_available
ON jobs (status, available_at, priority DESC, created_at, job_id)
WHERE status IN ('pending', 'failed');

CREATE INDEX idx_jobs_running_locked
ON jobs (status, locked_at, job_id)
WHERE status = 'running';

CREATE INDEX idx_jobs_type_status_available
ON jobs (job_type, status, available_at, priority DESC);

CREATE INDEX idx_jobs_workspace_status_updated
ON jobs (workspace_id, status, updated_at DESC, job_id);

CREATE INDEX idx_list_item_catalog_workspace_context
ON list_item_catalog (workspace_id, client_id, project_id);

CREATE INDEX idx_list_item_catalog_workspace_name
ON list_item_catalog (workspace_id, normalized_name);

CREATE INDEX idx_list_item_catalog_workspace_type
ON list_item_catalog (workspace_id, list_type);

CREATE INDEX idx_list_item_catalog_workspace_usage
ON list_item_catalog (workspace_id, use_count, last_used_at);

CREATE INDEX idx_list_items_workspace_assigned_user
ON list_items (workspace_id, assigned_user_id);

CREATE INDEX idx_list_items_workspace_catalog
ON list_items (workspace_id, catalog_item_id);

CREATE INDEX idx_list_items_workspace_list_sort
ON list_items (workspace_id, list_id, sort_order);

CREATE INDEX idx_list_items_workspace_list_status
ON list_items (workspace_id, list_id, purchase_status);

CREATE INDEX idx_list_items_workspace_needed_by
ON list_items (workspace_id, needed_by_date);

CREATE INDEX idx_list_links_workspace_created
ON list_links (workspace_id, created_at);

CREATE INDEX idx_list_links_workspace_list
ON list_links (workspace_id, list_id, removed_at);

CREATE INDEX idx_list_links_workspace_target
ON list_links (workspace_id, module_id, target_type, target_id, removed_at);

CREATE INDEX idx_lists_workspace_client
ON lists (workspace_id, client_id);

CREATE INDEX idx_lists_workspace_created_by
ON lists (workspace_id, created_by_user_id);

CREATE INDEX idx_lists_workspace_duplicated_from
ON lists (workspace_id, duplicated_from_list_id);

CREATE INDEX idx_lists_workspace_finalized_at
ON lists (workspace_id, finalized_at);

CREATE INDEX idx_lists_workspace_list
ON lists (workspace_id, list_id);

CREATE INDEX idx_lists_workspace_project
ON lists (workspace_id, project_id);

CREATE INDEX idx_lists_workspace_reusable
ON lists (workspace_id, is_reusable);

CREATE INDEX idx_lists_workspace_source
ON lists (workspace_id, source_list_id);

CREATE INDEX idx_lists_workspace_status
ON lists (workspace_id, status);

CREATE INDEX idx_lists_workspace_type
ON lists (workspace_id, list_type);

CREATE INDEX idx_lists_workspace_updated_at
ON lists (workspace_id, updated_at);

CREATE INDEX idx_note_library_collections_workspace_bucket
ON note_library_collections (workspace_id, library_bucket);

CREATE INDEX idx_note_library_collections_workspace_parent
ON note_library_collections (workspace_id, parent_collection_id, status);

CREATE INDEX idx_note_library_collections_workspace_path
ON note_library_collections (workspace_id, library_bucket, path_cache);

CREATE INDEX idx_note_library_collections_workspace_security
ON note_library_collections (workspace_id, security_policy, security_transition_state);

CREATE UNIQUE INDEX idx_note_library_collections_workspace_sibling_slug
ON note_library_collections (
  workspace_id,
  library_bucket,
  COALESCE(parent_collection_id, '__root__'),
  slug
)
WHERE deleted_at IS NULL;

CREATE INDEX idx_note_library_collections_workspace_status
ON note_library_collections (workspace_id, status);

CREATE UNIQUE INDEX idx_note_links_unique_active_target
ON note_links (workspace_id, note_id, module_id, target_type, target_id, link_role)
WHERE removed_at IS NULL;

CREATE INDEX idx_note_links_workspace_note
ON note_links (workspace_id, note_id);

CREATE INDEX idx_note_links_workspace_scope
ON note_links (workspace_id, note_id, scope_role);

CREATE INDEX idx_note_links_workspace_target
ON note_links (workspace_id, module_id, target_type, target_id);

CREATE INDEX idx_note_revisions_secure_encryption_state
ON note_revisions (workspace_id, note_id, security_mode, encrypted_at);

CREATE INDEX idx_note_revisions_workspace_changed_by
ON note_revisions (workspace_id, changed_by_user_id);

CREATE INDEX idx_note_revisions_workspace_created_at
ON note_revisions (workspace_id, created_at);

CREATE INDEX idx_note_revisions_workspace_import_batch
ON note_revisions (workspace_id, import_batch_id);

CREATE INDEX idx_note_revisions_workspace_import_source
ON note_revisions (workspace_id, import_source);

CREATE INDEX idx_note_revisions_workspace_note
ON note_revisions (workspace_id, note_id);

CREATE INDEX idx_note_revisions_workspace_note_library
ON note_revisions (workspace_id, note_id, library_bucket);

CREATE UNIQUE INDEX idx_note_revisions_workspace_note_revision
ON note_revisions (workspace_id, note_id, revision_number);

CREATE UNIQUE INDEX idx_note_wiki_links_unique_active_target
ON note_wiki_links (workspace_id, note_id, raw_target, display_text)
WHERE removed_at IS NULL;

CREATE INDEX idx_note_wiki_links_workspace_note
ON note_wiki_links (workspace_id, note_id);

CREATE INDEX idx_note_wiki_links_workspace_status
ON note_wiki_links (workspace_id, status);

CREATE INDEX idx_note_wiki_links_workspace_target_note
ON note_wiki_links (workspace_id, target_note_id);

CREATE INDEX idx_note_wiki_links_workspace_target_slug
ON note_wiki_links (workspace_id, target_slug);

CREATE INDEX idx_notes_secure_encryption_state
ON notes (workspace_id, security_mode, encrypted_at);

CREATE INDEX idx_notes_workspace_client
ON notes (workspace_id, client_id);

CREATE INDEX idx_notes_workspace_collection
ON notes (workspace_id, note_collection_id);

CREATE INDEX idx_notes_workspace_created_by
ON notes (workspace_id, created_by_user_id);

CREATE INDEX idx_notes_workspace_import_batch
ON notes (workspace_id, import_batch_id);

CREATE INDEX idx_notes_workspace_import_source
ON notes (workspace_id, import_source);

CREATE INDEX idx_notes_workspace_library
ON notes (workspace_id, library_bucket);

CREATE INDEX idx_notes_workspace_library_security
ON notes (workspace_id, library_bucket, security_mode);

CREATE INDEX idx_notes_workspace_library_status
ON notes (workspace_id, library_bucket, status);

CREATE INDEX idx_notes_workspace_library_visibility
ON notes (workspace_id, library_bucket, visibility);

CREATE INDEX idx_notes_workspace_linked_user
ON notes (workspace_id, linked_user_id);

CREATE INDEX idx_notes_workspace_note
ON notes (workspace_id, note_id);

CREATE INDEX idx_notes_workspace_owner
ON notes (workspace_id, owner_user_id);

CREATE INDEX idx_notes_workspace_project
ON notes (workspace_id, project_id);

CREATE INDEX idx_notes_workspace_security_mode
ON notes (workspace_id, security_mode);

CREATE UNIQUE INDEX idx_notes_workspace_slug
ON notes (workspace_id, slug)
WHERE slug IS NOT NULL AND deleted_at IS NULL;

CREATE INDEX idx_notes_workspace_slug_lookup
ON notes (workspace_id, slug);

CREATE INDEX idx_notes_workspace_status
ON notes (workspace_id, status);

CREATE INDEX idx_notes_workspace_task
ON notes (workspace_id, task_id);

CREATE INDEX idx_notes_workspace_ticket
ON notes (workspace_id, ticket_id);

CREATE INDEX idx_notes_workspace_updated_at
ON notes (workspace_id, updated_at);

CREATE INDEX idx_notes_workspace_visibility
ON notes (workspace_id, visibility);

CREATE INDEX idx_notification_subscriptions_target
ON notification_subscriptions (workspace_id, module_id, target_type, target_id, status);

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

CREATE INDEX idx_notification_user_display_preferences_user
ON notification_user_display_preferences (workspace_id, user_id);

CREATE INDEX idx_notification_user_preferences_user
ON notification_user_preferences (workspace_id, user_id, enabled);

CREATE INDEX idx_notification_workspace_defaults_workspace
ON notification_workspace_defaults (workspace_id, enabled);

CREATE INDEX idx_notifications_created_at
ON notifications (created_at);

CREATE INDEX idx_notifications_event_type
ON notifications (workspace_id, event_type);

CREATE INDEX idx_notifications_recipient_status_created
ON notifications (workspace_id, recipient_user_id, status, created_at DESC);

CREATE INDEX idx_notifications_record
ON notifications (workspace_id, record_type, record_id);

CREATE INDEX idx_notifications_workspace_module
ON notifications (workspace_id, module_id);

CREATE INDEX idx_private_feed_tokens_authentication
ON private_feed_tokens (provider_id, token_selector, status);

CREATE INDEX idx_private_feed_tokens_owner
ON private_feed_tokens (user_id, workspace_id, provider_id, status);

CREATE INDEX idx_private_feed_tokens_scope
ON private_feed_tokens (workspace_id, provider_id, scope_type, scope_client_id, scope_project_id, status);

CREATE INDEX idx_private_feed_tokens_workspace
ON private_feed_tokens (workspace_id, provider_id, status, created_at);

CREATE INDEX idx_projects_workspace_client_parent
ON projects (workspace_id, client_id, parent_project_id, status, name);

CREATE INDEX idx_projects_workspace_client_status_updated
ON projects (workspace_id, client_id, status, updated_at);

CREATE INDEX idx_projects_workspace_name
ON projects (workspace_id, name);

CREATE INDEX idx_projects_workspace_parent
ON projects (workspace_id, parent_project_id, status, name);

CREATE INDEX idx_projects_workspace_status_updated
ON projects (workspace_id, status, updated_at);

CREATE INDEX idx_search_index_workspace_body
ON search_index (workspace_id, body);

CREATE INDEX idx_search_index_workspace_client
ON search_index (workspace_id, client_id);

CREATE INDEX idx_search_index_workspace_indexed_at
ON search_index (workspace_id, indexed_at);

CREATE INDEX idx_search_index_workspace_library_bucket
ON search_index (workspace_id, library_bucket);

CREATE INDEX idx_search_index_workspace_module
ON search_index (workspace_id, module_id);

CREATE INDEX idx_search_index_workspace_note_collection
ON search_index (workspace_id, note_collection_id);

CREATE INDEX idx_search_index_workspace_project
ON search_index (workspace_id, project_id);

CREATE INDEX idx_search_index_workspace_record_status
ON search_index (workspace_id, record_status);

CREATE INDEX idx_search_index_workspace_record_type
ON search_index (workspace_id, record_type);

CREATE INDEX idx_search_index_workspace_title
ON search_index (workspace_id, title);

CREATE INDEX idx_secure_note_placeholder_warnings_workspace
ON secure_note_placeholder_warnings (workspace_id, note_id);

CREATE INDEX idx_sessions_active_workspace
ON sessions (active_workspace_id);

CREATE INDEX idx_sessions_expires_at
ON sessions (expires_at);

CREATE INDEX idx_tag_assignment_suppressions_source
ON tag_assignment_suppressions (workspace_id, source_target_type, source_target_id, propagation_rule_id);

CREATE INDEX idx_tag_assignment_suppressions_tag
ON tag_assignment_suppressions (workspace_id, tag_id);

CREATE INDEX idx_tag_assignment_suppressions_target
ON tag_assignment_suppressions (workspace_id, target_type, target_id);

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

CREATE INDEX idx_tag_assignments_propagation_source
ON tag_assignments (workspace_id, source_target_type, source_target_id, propagation_rule_id);

CREATE INDEX idx_tag_assignments_source_assignment
ON tag_assignments (workspace_id, source_assignment_id);

CREATE INDEX idx_tag_assignments_tag_target
ON tag_assignments (workspace_id, tag_id, target_type);

CREATE INDEX idx_tag_assignments_target
ON tag_assignments (workspace_id, target_type, target_id);

CREATE UNIQUE INDEX idx_tag_assignments_unique_target_tag
ON tag_assignments (workspace_id, tag_id, target_type, target_id);

CREATE UNIQUE INDEX idx_tags_workspace_slug
ON tags (workspace_id, slug);

CREATE INDEX idx_tags_workspace_status
ON tags (workspace_id, status);

CREATE UNIQUE INDEX idx_task_assignees_active_user_unique
ON task_assignees (workspace_id, task_id, assignee_type, user_id)
WHERE removed_at IS NULL AND assignee_type = 'user';

CREATE INDEX idx_task_assignees_task
ON task_assignees (workspace_id, task_id, removed_at);

CREATE INDEX idx_task_assignees_user
ON task_assignees (workspace_id, user_id, removed_at);

CREATE INDEX idx_task_assignees_workspace_active_user
ON task_assignees (workspace_id, removed_at, user_id);

CREATE INDEX idx_task_checklist_items_task
ON task_checklist_items (workspace_id, task_id, deleted_at, sort_order);

CREATE INDEX idx_task_checklist_items_workspace_updated
ON task_checklist_items (workspace_id, updated_at);

CREATE UNIQUE INDEX idx_task_recurrence_assignees_active_user_unique
ON task_recurrence_assignees (workspace_id, recurrence_template_id, assignee_type, user_id)
WHERE removed_at IS NULL AND assignee_type = 'user';

CREATE INDEX idx_task_recurrence_assignees_template
ON task_recurrence_assignees (workspace_id, recurrence_template_id, removed_at);

CREATE INDEX idx_task_recurrence_checklist_items_template
ON task_recurrence_checklist_items (workspace_id, recurrence_template_id, deleted_at, sort_order);

CREATE INDEX idx_task_recurrence_note_links_note
ON task_recurrence_note_links (workspace_id, note_id, deleted_at);

CREATE INDEX idx_task_recurrence_note_links_template
ON task_recurrence_note_links (workspace_id, recurrence_template_id, deleted_at, sort_order);

CREATE INDEX idx_task_recurrence_templates_workspace
ON task_recurrence_templates (workspace_id, template_status, updated_at);

CREATE UNIQUE INDEX idx_task_relationships_active_pair
ON task_relationships (workspace_id, parent_task_id, child_task_id)
WHERE removed_at IS NULL;

CREATE INDEX idx_task_relationships_child
ON task_relationships (workspace_id, child_task_id, removed_at, is_blocking);

CREATE INDEX idx_task_relationships_parent
ON task_relationships (workspace_id, parent_task_id, removed_at, is_blocking);

CREATE INDEX idx_task_reminder_offsets_target
ON task_reminder_offsets (workspace_id, target_type, target_id, due_kind, sort_order);

CREATE INDEX idx_task_reminder_offsets_workspace
ON task_reminder_offsets (workspace_id, due_kind);

CREATE UNIQUE INDEX idx_tasks_recurrence_instance_unique
ON tasks (workspace_id, recurrence_template_id, recurrence_instance_date);

CREATE INDEX idx_tasks_recurrence_template
ON tasks (workspace_id, recurrence_template_id, recurrence_instance_date);

CREATE INDEX idx_tasks_workspace_archived
ON tasks (workspace_id, archived_at);

CREATE INDEX idx_tasks_workspace_client_status
ON tasks (workspace_id, client_id, status, updated_at);

CREATE INDEX idx_tasks_workspace_due_date
ON tasks (workspace_id, due_date, due_time);

CREATE INDEX idx_tasks_workspace_due_updated
ON tasks (workspace_id, due_date, due_time, updated_at);

CREATE INDEX idx_tasks_workspace_last_worked_at
ON tasks (workspace_id, last_worked_at, status);

CREATE INDEX idx_tasks_workspace_project_status
ON tasks (workspace_id, project_id, status, updated_at);

CREATE INDEX idx_tasks_workspace_resume_context
ON tasks (workspace_id, status, updated_at, next_action, blocked_reason, resume_note);

CREATE INDEX idx_tasks_workspace_status_updated
ON tasks (workspace_id, status, updated_at);

CREATE INDEX idx_time_entries_workspace_end
ON time_entries (workspace_id, end_time);

CREATE INDEX idx_time_entries_workspace_project_end
ON time_entries (workspace_id, project_id, end_time);

CREATE INDEX idx_time_entries_workspace_task
ON time_entries (workspace_id, task_id, end_time);

CREATE INDEX idx_time_entries_workspace_user_end
ON time_entries (workspace_id, user_id, end_time);

CREATE INDEX idx_user_role_assignments_workspace_scope
ON user_role_assignments (workspace_id, scope_type, scope_id);

CREATE INDEX idx_user_role_assignments_workspace_user
ON user_role_assignments (workspace_id, user_id);

CREATE INDEX idx_user_role_assignments_workspace_user_updated
ON user_role_assignments (workspace_id, user_id, updated_at, assignment_id);

CREATE INDEX idx_user_workspaces_user_status
ON user_workspaces (user_id, status);

CREATE INDEX idx_user_workspaces_user_workspace
ON user_workspaces (user_id, workspace_id);

CREATE INDEX idx_user_workspaces_workspace_status
ON user_workspaces (workspace_id, status);

CREATE UNIQUE INDEX idx_users_unique_user_id
  ON users (user_id);

CREATE INDEX idx_work_resume_state_dismissed
ON work_resume_state (workspace_id, user_id, dismissed_at, dismissed_source_updated_at);

CREATE INDEX idx_work_resume_state_last_worked
ON work_resume_state (workspace_id, user_id, last_worked_at DESC, due_at_snapshot, priority_snapshot);

CREATE INDEX idx_work_resume_state_record_cleanup
ON work_resume_state (workspace_id, module_id, record_type, record_id);

CREATE INDEX idx_work_resume_state_workspace_client
ON work_resume_state (workspace_id, user_id, client_id, dismissed_at, last_worked_at DESC);

CREATE INDEX idx_work_resume_state_workspace_module
ON work_resume_state (workspace_id, user_id, module_id, record_type);

CREATE INDEX idx_work_resume_state_workspace_project
ON work_resume_state (workspace_id, user_id, project_id, dismissed_at, last_worked_at DESC);

CREATE INDEX idx_work_resume_state_workspace_user_default
ON work_resume_state (workspace_id, user_id, dismissed_at, last_worked_at DESC, updated_at DESC);

CREATE INDEX idx_workspace_backup_exports_workspace_created
  ON workspace_backup_exports(workspace_id, created_at DESC);

CREATE INDEX idx_workspace_deletion_lifecycle_purge_after
  ON workspace_deletion_lifecycle(purge_after);

CREATE INDEX idx_workspace_modules_module
ON workspace_modules (module_id);

CREATE INDEX idx_workspace_modules_workspace_status
ON workspace_modules (workspace_id, status);

CREATE INDEX idx_workspace_purge_tombstones_status_started
  ON workspace_purge_tombstones(status, purge_started_at);

CREATE INDEX idx_workspaces_owner
ON workspaces (owner_user_id);

CREATE INDEX idx_workspaces_type
ON workspaces (workspace_type);
