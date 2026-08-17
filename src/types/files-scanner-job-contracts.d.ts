import type { Readable } from "node:stream";
import type { WorkspaceRequestSession } from "./http-contracts.js";
import type { FileScanJobPayload } from "./job-contracts.js";

export type FileScannerMode = "clamd" | "clamscan" | "none" | "noop";

export interface FileScannerAdapterHealth {
  available?: boolean;
  ok?: boolean;
  status?: string;
  [key: string]: unknown;
}

export interface FileScannerInput {
  displayName: string;
  extension: string;
  fileId: string;
  fileSizeBytes: number;
  mimeTypeClaimed: string;
  mimeTypeDetected: string;
  openReadStream: () => Readable | Promise<Readable>;
  originalFilename: string;
  scannerMode: FileScannerMode;
  storageProvider: string;
  workspaceId: string;
}

export interface FileScannerResult {
  metadata?: Record<string, unknown>;
  reason?: string;
  scanStatus: string;
  status: string;
}

export interface FileScannerAdapter {
  id: string;
  health: () => Promise<FileScannerAdapterHealth>;
  scan: (file: FileScannerInput) => Promise<FileScannerResult>;
}

export interface FilesScannerJobFile extends Omit<FileScannerInput, "scannerMode"> {
  scanStatus: string;
  status: string;
}

export type FileScannerJobSession = WorkspaceRequestSession & { role: "system" };

export interface FileScannerQueueOptions {
  availableAt?: unknown;
  available_at?: unknown;
  fileId?: unknown;
  file_id?: unknown;
  maxAttempts?: unknown;
  max_attempts?: unknown;
  priority?: unknown;
  requestedByUserId?: unknown;
  requested_by_user_id?: unknown;
  source?: unknown;
  workspaceId?: unknown;
  workspace_id?: unknown;
}

export interface FileScannerJobContext {
  payload?: FileScanJobPayload;
}

export interface FileScannerJobLookup {
  fileId: string;
  workspaceId: string;
}

export interface FileScannerUpdateInput extends FileScannerJobLookup {
  fileStatus: string;
  quarantineReason: string | null;
  scanStatus: string;
  updatedAt: string;
}

export interface FileScannerLifecyclePayload {
  fileId: string;
  metadata?: Record<string, unknown>;
  reason?: string;
  scanStatus: string;
  session: FileScannerJobSession;
  status: string;
}

export interface FileScannerAuditEvent {
  action: string;
  changeType: "update";
  metadata: Record<string, unknown>;
  recordId: string;
  recordLabel: string;
}

export interface FilesScannerJobDependencies {
  emitLifecycleEvent: (eventName: string, payload: FileScannerLifecyclePayload) => Promise<unknown>;
  readFile: (lookup: FileScannerJobLookup) => Promise<FilesScannerJobFile | null>;
  recordAudit: (session: FileScannerJobSession, event: FileScannerAuditEvent) => Promise<unknown>;
  updateScanResult: (input: FileScannerUpdateInput) => Promise<unknown>;
}

export interface FileScannerDisposition {
  metadata: Record<string, unknown>;
  reason: string;
  scanStatus: string;
  status: string;
  successfulScan: boolean;
}

