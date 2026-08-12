import type { RequestSession } from "./http-contracts.js";
import type { SearchReference, SearchableTypeContribution } from "./framework-contracts.js";

export type SearchRebuildScope =
  | "app"
  | "app-module"
  | "workspace"
  | "module"
  | "record_type"
  | "inactive_record_types";

export interface ActiveSearchableTypeDeclaration extends SearchableTypeContribution {
  recordType: string;
  moduleId: string;
  label: string;
  description: string;
  idField: string;
  titleField: string;
  summaryField: string;
  bodyFields: string[];
  workspaceField: string;
  clientField: string;
  projectField: string;
  requiredReadPermission: string;
  indexer: string;
  requiredModules: string[];
  tagsTextField: string;
  visibilityField: string;
  recordStatusField: string;
  sourceLabel: string;
}

export type SearchRebuildSession = RequestSession & { workspace_id: string };

export interface SearchRebuildOptions {
  workspaceId?: unknown;
  workspace_id?: unknown;
  moduleId?: unknown;
  module_id?: unknown;
  dryRun?: unknown;
  dry_run?: unknown;
  audit?: boolean;
  session?: SearchRebuildSession;
  source?: unknown;
}

export interface SearchRebuildError {
  code: string;
  message: string;
}

export interface SearchRebuildCounts {
  scanned: number;
  indexed: number;
  skipped: number;
  removed: number;
  failed: number;
  repaired: number;
}

export interface SearchBackendRepairSummary {
  rebuilt: number;
  missing: number;
  orphaned: number;
  skipped: boolean;
}

export interface SearchRebuildTargetSummary extends SearchRebuildCounts {
  moduleId: string;
  recordType: string;
  errors: SearchRebuildError[];
  ftsRepair?: SearchBackendRepairSummary;
}

export interface SearchRebuildSummary {
  scope: SearchRebuildScope;
  workspaceId: string;
  moduleId: string;
  dryRun: boolean;
  counts: SearchRebuildCounts;
  targets: SearchRebuildTargetSummary[];
}

export interface SearchRebuildSummaryInput {
  scope: SearchRebuildScope;
  workspaceId?: string;
  moduleId?: string;
  dryRun?: boolean;
}

export interface SearchRebuildTypeInput {
  dryRun: boolean;
  searchableType: ActiveSearchableTypeDeclaration;
  workspaceId: string;
}

export interface InactiveSearchRowsInput {
  activeSearchableTypes: ActiveSearchableTypeDeclaration[];
  dryRun: boolean;
  moduleId: string;
  workspaceId: string;
}

export interface StaleSearchRecordIdsInput {
  indexedRecordIds: Set<string>;
  moduleId: string;
  recordType: string;
  workspaceId: string;
}

export interface SearchRebuildReference extends SearchReference {
  workspaceId: string;
  declaration: ActiveSearchableTypeDeclaration;
  rebuild: true;
}

export type SearchIndexerDocument = Record<string, unknown>;

export interface SearchIndexerDocumentEnvelope {
  searchable?: boolean;
  document?: SearchIndexerDocument | null;
  documents?: SearchIndexerDocument[];
}
