import type { CatalogSecurityJobPayload } from "./notes-domain-contracts.js";
import type { TaskJobPayload } from "./task-recurrence-contracts.js";

export interface FileScanJobPayload {
  fileId?: unknown;
  file_id?: unknown;
  operation?: unknown;
  requestedByUserId?: unknown;
  requested_by_user_id?: unknown;
  source?: unknown;
  workspaceId?: unknown;
  workspace_id?: unknown;
}

export interface FutureImportJobPayload {
  operation?: unknown;
  requestedByUserId?: unknown;
  requested_by_user_id?: unknown;
  source?: unknown;
  workspaceId?: unknown;
  workspace_id?: unknown;
}

export interface NotificationEventJobPayload {
  declarationId?: unknown;
  declaration_id?: unknown;
  event?: unknown;
  operation?: unknown;
}

export interface SearchIndexJobReference {
  moduleId?: unknown;
  module_id?: unknown;
  reason?: unknown;
  recordId?: unknown;
  record_id?: unknown;
  recordType?: unknown;
  record_type?: unknown;
  workspaceId?: unknown;
  workspace_id?: unknown;
}

export interface SearchIndexJobPayload {
  app?: boolean;
  dryRun?: boolean;
  dry_run?: boolean;
  moduleId?: unknown;
  module_id?: unknown;
  operation?: unknown;
  recordReference?: SearchIndexJobReference;
  reason?: unknown;
  requestedByUserId?: unknown;
  requested_by_user_id?: unknown;
  scope?: unknown;
  source?: unknown;
  workspaceId?: unknown;
  workspace_id?: unknown;
}

export interface WorkspacePurgeJobPayload {
  operation?: unknown;
  source?: unknown;
  workspaceId?: unknown;
  workspace_id?: unknown;
}

/**
 * Canonical framework job payload registry. New stable job types extend this
 * interface with their exact persisted payload shape; there is no generic
 * catch-all payload contract.
 */
export interface JobPayloadRegistry {
  "database.conflict_identity.proof": { proof?: unknown };
  "file.scan": FileScanJobPayload;
  "fixture.after-fence": Record<never, never>;
  "import.future": FutureImportJobPayload;
  "notes.catalog-security": CatalogSecurityJobPayload;
  "notification.event": NotificationEventJobPayload;
  "retention.replacement": { replacement?: unknown };
  "search.index": SearchIndexJobPayload;
  "task.recurrence": TaskJobPayload;
  "task.reminder": TaskJobPayload;
  "workspace.purge": WorkspacePurgeJobPayload;
}

export type RegisteredJobType = keyof JobPayloadRegistry;
export type JobPayload<JobType extends RegisteredJobType> = JobPayloadRegistry[JobType];
