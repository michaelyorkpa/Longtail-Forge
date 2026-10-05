export type StorageQuotaScope = "user" | "workspace";

export interface FilesStorageQuotaSettings {
  internalStorageLimitBytes: number | null;
  perUserStorageLimitBytes: number | null;
}

export interface StorageAccountingEntry {
  availabilityStatus: string;
  calculatedAt: string;
  externalReportedBytes: number;
  externalSourceProvider: string;
  fileCount: number;
  internalBytes: number;
  storageAccountingId: string;
  storageKind: string;
  storageProvider: string;
  userId: string;
  workspaceId: string;
}

export interface StorageAccountingSummary {
  externalFileCount: number;
  externalReportedBytes: number;
  fileCount: number;
  internalBytes: number;
  internalFileCount: number;
}

export interface StorageAccountingResult {
  entries: StorageAccountingEntry[];
  totals: StorageAccountingSummary;
}

export interface StorageAccountingReadInput {
  storageKind?: string;
  workspaceId: string;
}

export interface ExternalStorageAccountingInput {
  availabilityStatus: string;
  externalReportedBytes: number;
  fileCount: number;
  sourceProvider: string;
  userId: string;
  workspaceId: string;
}

export interface StorageAccountingIdentity {
  availabilityStatus: string;
  externalSourceProvider: string;
  storageKind: string;
  storageProvider: string;
  userId: string;
  workspaceId: string;
}

export interface StorageQuotaReadInput {
  fileSettings: FilesStorageQuotaSettings;
  userId: string;
  workspaceId: string;
}

export interface StorageQuotaCheckInput extends StorageQuotaReadInput {
  uploadBytes: number;
}

export interface StreamedUploadLimitInput extends StorageQuotaReadInput {
  maxFileSizeBytes: number;
}

export interface StorageQuotaState {
  limitsActive: boolean;
  perUserLimitBytes: number | null;
  userBytes: number;
  workspaceBytes: number;
  workspaceLimitBytes: number | null;
}

export interface StorageQuotaLimit {
  remainingBytes: number;
  scope: StorageQuotaScope;
}

export interface FileUploadLimit {
  exceededMessage: string;
  maxBytes: number;
  statusCode: 413;
}
