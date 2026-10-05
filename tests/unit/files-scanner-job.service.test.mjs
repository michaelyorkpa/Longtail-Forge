import { Readable } from "node:stream";
import { describe, expect, it } from "vitest";
import {
  createFileScanContext,
  fileJobSession,
  normalizeFileScanDisposition,
  sanitizeScannerMetadata,
} from "../../src/services/files-scanner-job.service.js";

describe("Files scanner job policy", () => {
  it("creates an explicit provider-safe scanner input", async () => {
    const openReadStream = async () => Readable.from(["safe body"]);
    const context = createFileScanContext({
      displayName: "Safe file",
      extension: ".txt",
      fileId: "file-1",
      fileSizeBytes: 9,
      mimeTypeClaimed: "text/plain",
      mimeTypeDetected: "text/plain",
      openReadStream,
      originalFilename: "safe.txt",
      scanStatus: "pending",
      status: "pending",
      storageProvider: "local",
      workspaceId: "workspace-1",
    }, "clamd");

    expect(context).toEqual({
      displayName: "Safe file",
      extension: ".txt",
      fileId: "file-1",
      fileSizeBytes: 9,
      mimeTypeClaimed: "text/plain",
      mimeTypeDetected: "text/plain",
      openReadStream,
      originalFilename: "safe.txt",
      scannerMode: "clamd",
      storageProvider: "local",
      workspaceId: "workspace-1",
    });
    expect(Object.keys(context)).not.toEqual(expect.arrayContaining([
      "storageKey",
      "storagePath",
      "protectedPath",
      "scannerHost",
      "scannerPort",
    ]));
  });

  it("fails closed when an adapter returns an unknown disposition", () => {
    expect(normalizeFileScanDisposition({
      metadata: { scanner: "custom", result: "secret raw output", path: "hidden" },
      reason: "x".repeat(300),
      scanStatus: "mystery",
      status: "available-ish",
    })).toEqual({
      metadata: { scanner: "unavailable" },
      reason: "x".repeat(250),
      scanStatus: "error",
      status: "quarantined",
      successfulScan: false,
    });
  });

  it("retains only bounded scanner diagnostic fields", () => {
    expect(sanitizeScannerMetadata({
      scanner: "clamscan",
      result: "infected",
      exitCode: 1,
      rawOutput: "secret",
      executablePath: "C:/secret/clamscan.exe",
    })).toEqual({
      scanner: "clamscan",
      result: "infected",
      exitCode: 1,
    });
  });

  it("builds a workspace-scoped system session for worker lifecycle events", () => {
    expect(fileJobSession({ userId: "user-1", workspaceId: "workspace-1" })).toEqual({
      active_workspace_id: "workspace-1",
      home_workspace_id: "workspace-1",
      ip_address: "",
      password_change_required: false,
      role: "system",
      session_mode: "normal",
      timezone: "UTC",
      user_id: "user-1",
      username: "Job Worker",
      workspace_id: "workspace-1",
    });
  });
});
