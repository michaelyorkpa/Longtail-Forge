import { describe, expect, it } from "vitest";
import {
  shapeStorageAccountingRow,
  storageAccountingId,
  storageQuotaExceededMessage,
  summarizeStorageAccounting,
} from "../../src/services/files-storage-accounting.service.js";

describe("Files storage accounting policy", () => {
  it("builds stable scoped external accounting identities", () => {
    expect(storageAccountingId({
      availabilityStatus: "available",
      externalSourceProvider: "example-drive",
      storageKind: "external",
      storageProvider: "external",
      userId: "user-1",
      workspaceId: "workspace-1",
    })).toBe("workspace-1:external:user-1:external:example-drive:available");
  });

  it("shapes repository rows without storage keys, paths, labels, or scanner details", () => {
    const entry = shapeStorageAccountingRow({
      availability_status: "available",
      calculated_at: "2026-08-16T00:00:00.000Z",
      external_reported_bytes: "4096",
      external_source_provider: "example-drive",
      file_count: "3",
      internal_bytes: "0",
      storage_accounting_id: "accounting-1",
      storage_kind: "external",
      storage_provider: "external",
      user_id: "user-1",
      workspace_id: "workspace-1",
    });

    expect(entry).toEqual({
      availabilityStatus: "available",
      calculatedAt: "2026-08-16T00:00:00.000Z",
      externalReportedBytes: 4096,
      externalSourceProvider: "example-drive",
      fileCount: 3,
      internalBytes: 0,
      storageAccountingId: "accounting-1",
      storageKind: "external",
      storageProvider: "external",
      userId: "user-1",
      workspaceId: "workspace-1",
    });
    expect(JSON.stringify(entry)).not.toMatch(/storage[_A-Z]?key|path|scanner|label/i);
  });

  it("summarizes internal and external accounting independently", () => {
    expect(summarizeStorageAccounting([
      accountingEntry({ fileCount: 2, internalBytes: 128, storageKind: "internal" }),
      accountingEntry({ externalReportedBytes: 512, fileCount: 4, storageKind: "external" }),
    ])).toEqual({
      externalFileCount: 4,
      externalReportedBytes: 512,
      fileCount: 6,
      internalBytes: 128,
      internalFileCount: 2,
    });
  });

  it("keeps the established scope-specific quota copy", () => {
    expect(storageQuotaExceededMessage("workspace")).toBe("Upload would exceed the workspace storage quota.");
    expect(storageQuotaExceededMessage("user")).toBe("Upload would exceed your per-user storage quota.");
  });
});

function accountingEntry(overrides = {}) {
  return {
    availabilityStatus: "available",
    calculatedAt: "2026-08-16T00:00:00.000Z",
    externalReportedBytes: 0,
    externalSourceProvider: "",
    fileCount: 0,
    internalBytes: 0,
    storageAccountingId: "accounting-1",
    storageKind: "internal",
    storageProvider: "local",
    userId: "user-1",
    workspaceId: "workspace-1",
    ...overrides,
  };
}
