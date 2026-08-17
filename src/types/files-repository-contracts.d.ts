import type { DatabaseRow } from "./database-contracts.js";

export interface FileRow extends DatabaseRow {
  created_at: string;
  deleted_at: string | null;
  display_name: string;
  extension: string;
  file_category: string;
  file_id: string;
  file_size_bytes: number;
  metadata_json: unknown;
  mime_type_claimed: string;
  mime_type_detected: string;
  original_filename: string;
  previous_status?: string;
  quarantine_reason: string | null;
  scan_status: string;
  sha256_hash: string;
  status: string;
  storage_key: string;
  storage_kind: string;
  storage_provider: string;
  stored_filename: string;
  updated_at: string;
  uploaded_by_user_id: string;
  workspace_id: string;
}

export interface AttachmentRow extends DatabaseRow {
  attachment_role: string | null;
  attached_by_user_id: string;
  caption: string | null;
  client_id: string | null;
  created_at: string;
  display_name: string;
  extension: string;
  file_attachment_id: string;
  file_created_at: string;
  file_deleted_at: string | null;
  file_id: string;
  file_size_bytes: number;
  file_status: string;
  file_updated_at: string;
  file_uploaded_by_user_id: string;
  metadata_json: unknown;
  mime_type_detected: string;
  module_id: string;
  original_filename: string;
  project_id: string | null;
  quarantine_reason: string | null;
  removed_at: string | null;
  scan_status: string;
  sort_order: number;
  target_id: string;
  target_type: string;
  visibility: string;
  workspace_id: string;
}

export interface AttachableTargetRow extends DatabaseRow {
  client_id: string | null;
  project_id: string | null;
  target_id: string;
  target_label: string;
  workspace_id: string;
}

export interface WorkspaceFileSettingsRow extends DatabaseRow {
  allowed_extensions_json: unknown;
  blocked_extensions_json: unknown;
  created_at: string;
  file_type_policy_mode: string;
  internal_storage_limit_bytes: unknown;
  metadata_json: unknown;
  per_user_storage_limit_bytes: unknown;
  updated_at: string;
  workspace_id: string;
}

export interface StorageAccountingRow extends DatabaseRow {
  availability_status: string;
  calculated_at: string;
  external_reported_bytes: unknown;
  external_source_provider: string;
  file_count: unknown;
  internal_bytes: unknown;
  storage_accounting_id: string;
  storage_kind: string;
  storage_provider: string;
  user_id: string;
  workspace_id: string;
}

export interface StorageQuotaUsageRow extends DatabaseRow {
  user_bytes: unknown;
  workspace_bytes: unknown;
}

export interface StorageObjectRow extends DatabaseRow {
  file_size_bytes: unknown;
  storage_key: string;
  storage_provider: string;
}

export interface LabelRow extends DatabaseRow {
  id: string;
  name: string | null;
}

export interface NameRow extends DatabaseRow {
  name: string | null;
}

export interface WorkspaceTypeRow extends DatabaseRow {
  workspace_type: string | null;
}

export interface TableColumnRow extends DatabaseRow {
  name: string;
}
