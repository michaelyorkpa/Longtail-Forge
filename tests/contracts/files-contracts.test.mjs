import { describe, expect, it } from "vitest";
import {
  CreateFileBatchSchema,
  CreateFileSchema,
  FileAttachmentSchema,
  FileMetadataSchema,
  FilePreviewRequestSchema,
  FileStorageAdapterConfigSchema,
  SENSITIVE_FILE_INPUT_FIELDS,
  UpdateFileContextSchema,
  parseFilesEdgePayload,
} from "../../src/core/files/files.contracts.js";
import { AppError } from "../../src/utils/app-error.js";

const validCreatePayload = {
  moduleId: "tasks",
  targetType: "task",
  targetId: "task-1",
  contentBase64: "aGVsbG8=",
  originalFilename: "notes.txt",
  displayName: "Notes",
  mimeType: "text/plain",
  caption: "A caption",
  attachmentRole: "attachment",
  sortOrder: "3",
  visibility: "workspace",
  attachmentMetadata: { source: "test" },
};

describe("CreateFileSchema", () => {
  it("accepts a valid JSON upload payload unchanged", () => {
    const parsed = parseFilesEdgePayload(CreateFileSchema, validCreatePayload);
    expect(parsed.moduleId).toBe("tasks");
    expect(parsed.targetId).toBe("task-1");
    expect(parsed.contentBase64).toBe("aGVsbG8=");
    expect(parsed.attachmentMetadata).toEqual({ source: "test" });
  });

  it("trims text fields", () => {
    const parsed = parseFilesEdgePayload(CreateFileSchema, {
      ...validCreatePayload,
      displayName: "  padded  ",
    });
    expect(parsed.displayName).toBe("padded");
  });

  it("accepts numeric sortOrder", () => {
    const parsed = parseFilesEdgePayload(CreateFileSchema, { ...validCreatePayload, sortOrder: 7 });
    expect(parsed.sortOrder).toBe(7);
  });

  it("strips unknown fields instead of storing them", () => {
    const parsed = parseFilesEdgePayload(CreateFileSchema, {
      ...validCreatePayload,
      unexpectedField: "junk",
      nested: { anything: true },
    });
    expect(parsed).not.toHaveProperty("unexpectedField");
    expect(parsed).not.toHaveProperty("nested");
  });

  it("rejects wrong-typed known fields", () => {
    expect(() => parseFilesEdgePayload(CreateFileSchema, { ...validCreatePayload, caption: 5 }))
      .toThrow(AppError);
    expect(() => parseFilesEdgePayload(CreateFileSchema, { ...validCreatePayload, moduleId: {} }))
      .toThrow("Module ID must be text.");
  });

  it("rejects attachmentMetadata that is not a JSON object", () => {
    expect(() => parseFilesEdgePayload(CreateFileSchema, { ...validCreatePayload, attachmentMetadata: [1, 2] }))
      .toThrow(AppError);
    expect(() => parseFilesEdgePayload(CreateFileSchema, { ...validCreatePayload, attachmentMetadata: "text" }))
      .toThrow(AppError);
  });

  it("rejects over-length text fields", () => {
    expect(() => parseFilesEdgePayload(CreateFileSchema, {
      ...validCreatePayload,
      displayName: "x".repeat(181),
    })).toThrow("Display name is too long.");
  });

  it.each(SENSITIVE_FILE_INPUT_FIELDS)("rejects server-managed field %s from user input", (field) => {
    expect(() => parseFilesEdgePayload(CreateFileSchema, { ...validCreatePayload, [field]: "attacker-value" }))
      .toThrow(`Field '${field}' is server-managed and cannot be set by file input.`);
  });

  it("reports validation failures as 400 AppError", () => {
    try {
      parseFilesEdgePayload(CreateFileSchema, { ...validCreatePayload, caption: 5 });
      expect.unreachable("should have thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(AppError);
      expect(error.statusCode).toBe(400);
    }
  });
});

describe("FileMetadataSchema (multipart upload metadata)", () => {
  it("accepts route-assembled multipart metadata", () => {
    const parsed = parseFilesEdgePayload(FileMetadataSchema, {
      moduleId: "tasks",
      targetType: "task",
      targetId: "task-1",
      filename: "photo.png",
      originalFilename: "photo.png",
      mimeType: "image/png",
      caption: "",
      attachmentRole: "",
      sortOrder: "",
      visibility: "",
      displayName: "",
      attachmentMetadata: { batch_index: 0 },
    });
    expect(parsed.filename).toBe("photo.png");
    expect(parsed.attachmentMetadata).toEqual({ batch_index: 0 });
  });

  it("rejects storage-sensitive fields in multipart metadata", () => {
    expect(() => parseFilesEdgePayload(FileMetadataSchema, {
      moduleId: "tasks",
      targetType: "task",
      targetId: "task-1",
      storage_key: "escape/../../secret",
    })).toThrow("server-managed");
  });
});

describe("CreateFileBatchSchema", () => {
  it("accepts a batch envelope with at least one file", () => {
    const parsed = parseFilesEdgePayload(CreateFileBatchSchema, {
      moduleId: "tasks",
      targetType: "task",
      targetId: "task-1",
      files: [{ originalFilename: "a.txt", contentBase64: "YQ==" }],
    });
    expect(parsed.files).toHaveLength(1);
  });

  it("fails an empty or missing files array with the existing message", () => {
    for (const files of [[], undefined, "not-an-array"]) {
      expect(() => parseFilesEdgePayload(CreateFileBatchSchema, {
        moduleId: "tasks",
        targetType: "task",
        targetId: "task-1",
        files,
      })).toThrow("At least one file is required.");
    }
  });
});

describe("FileAttachmentSchema (attach existing file)", () => {
  it("accepts a valid attach payload", () => {
    const parsed = parseFilesEdgePayload(FileAttachmentSchema, {
      fileId: "file-1",
      moduleId: "tasks",
      targetType: "task",
      targetId: "task-2",
      caption: "reused",
    });
    expect(parsed.fileId).toBe("file-1");
  });

  it("rejects scan-status spoofing", () => {
    expect(() => parseFilesEdgePayload(FileAttachmentSchema, {
      fileId: "file-1",
      scan_status: "passed",
    })).toThrow("server-managed");
  });
});

describe("UpdateFileContextSchema (File Context editor)", () => {
  it("accepts camelCase and snake_case context fields", () => {
    const camel = parseFilesEdgePayload(UpdateFileContextSchema, {
      moduleId: "tasks",
      targetType: "task",
      targetId: "task-1",
    });
    expect(camel.moduleId).toBe("tasks");

    const snake = parseFilesEdgePayload(UpdateFileContextSchema, {
      module_id: "tasks",
      target_type: "task",
      target_id: "task-1",
      client_id: "client-1",
      project_id: "project-1",
    });
    expect(snake.module_id).toBe("tasks");
    expect(snake.client_id).toBe("client-1");
  });

  it("fails empty required fields with the service's existing messages", () => {
    expect(() => parseFilesEdgePayload(UpdateFileContextSchema, { targetType: "task", targetId: "t" }))
      .toThrow("Module ID is required.");
    expect(() => parseFilesEdgePayload(UpdateFileContextSchema, { moduleId: "tasks", targetId: "t" }))
      .toThrow("Target type is required.");
    expect(() => parseFilesEdgePayload(UpdateFileContextSchema, { moduleId: "tasks", targetType: "task" }))
      .toThrow("Target ID is required.");
  });
});

describe("FilePreviewRequestSchema", () => {
  it("accepts a normal attachment id", () => {
    const parsed = parseFilesEdgePayload(FilePreviewRequestSchema, { fileAttachmentId: "att-1" });
    expect(parsed.fileAttachmentId).toBe("att-1");
  });

  it("fails empty/oversized ids with not-found parity", () => {
    for (const fileAttachmentId of ["", "   ", "x".repeat(201)]) {
      try {
        parseFilesEdgePayload(FilePreviewRequestSchema, { fileAttachmentId }, { status: 404 });
        expect.unreachable("should have thrown");
      } catch (error) {
        expect(error).toBeInstanceOf(AppError);
        expect(error.statusCode).toBe(404);
        expect(error.message).toBe("Attachment not found.");
      }
    }
  });
});

describe("FileStorageAdapterConfigSchema", () => {
  it("applies the local provider default intentionally", () => {
    const parsed = parseFilesEdgePayload(FileStorageAdapterConfigSchema, {});
    expect(parsed.provider).toBe("local");
  });

  it("accepts the current local and s3 config shapes", () => {
    const parsed = parseFilesEdgePayload(FileStorageAdapterConfigSchema, {
      provider: "s3",
      localRoot: "/data/files",
      s3: { bucket: "bucket", region: "us-east-1", endpoint: "", accessKeyId: "", secretAccessKey: "" },
    });
    expect(parsed.provider).toBe("s3");
    expect(parsed.s3.bucket).toBe("bucket");
  });

  it("rejects a malformed storage config as a server error", () => {
    try {
      parseFilesEdgePayload(FileStorageAdapterConfigSchema, { provider: 5 }, { status: 500 });
      expect.unreachable("should have thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(AppError);
      expect(error.statusCode).toBe(500);
    }
  });
});
