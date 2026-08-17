import { Readable } from "node:stream";
import { describe, expect, it } from "vitest";
import { AppError } from "../../src/utils/app-error.js";
import {
  previewAvailabilityForAttachment,
  readAttachmentPreviewContent,
  shapeAttachmentPreviewDescriptor,
} from "../../src/services/files-preview.service.js";

function previewAttachment(overrides = {}) {
  return {
    attachment_role: "source",
    attached_by_user_id: "user-1",
    caption: null,
    client_id: null,
    created_at: "2026-08-16T12:00:00.000Z",
    display_name: "Preview source",
    extension: ".txt",
    file_attachment_id: "attachment-1",
    file_created_at: "2026-08-16T12:00:00.000Z",
    file_deleted_at: null,
    file_id: "file-1",
    file_size_bytes: 12,
    file_status: "available",
    file_updated_at: "2026-08-16T12:00:00.000Z",
    file_uploaded_by_user_id: "user-1",
    metadata_json: {},
    mime_type_detected: "text/plain",
    module_id: "tasks",
    original_filename: "preview.txt",
    project_id: null,
    quarantine_reason: null,
    removed_at: null,
    scan_status: "passed",
    sort_order: 0,
    target_id: "task-1",
    target_type: "task",
    visibility: "private",
    workspace_id: "workspace-1",
    ...overrides,
  };
}

describe("Files preview policy", () => {
  it("classifies supported, download-only, size-capped, and review previews", () => {
    expect(previewAvailabilityForAttachment(previewAttachment())).toEqual({
      kind: "text",
      reason: "",
      state: "previewable",
    });
    expect(previewAvailabilityForAttachment(previewAttachment({ extension: ".pdf" }))).toEqual({
      kind: "unsupported",
      reason: "unsupported_file_type",
      state: "download_only",
    });
    expect(previewAvailabilityForAttachment(previewAttachment({ file_size_bytes: 600000 }))).toEqual({
      kind: "text",
      reason: "too_large_for_preview",
      state: "too_large_for_preview",
    });
    expect(previewAvailabilityForAttachment(previewAttachment({ file_status: "quarantined" }), {
      canPreviewInReview: true,
    }).state).toBe("previewable");
  });

  it("projects only safe attachment and content-route fields", () => {
    const attachment = previewAttachment({
      storage_key: "unsafe-storage-key",
      sha256_hash: "unsafe-sha256",
    });
    const preview = shapeAttachmentPreviewDescriptor(attachment, previewAvailabilityForAttachment(attachment));
    const serialized = JSON.stringify(preview);

    expect(preview.contentUrl).toBe("/api/files/attachments/attachment-1/preview/content");
    expect(preview.fileName).toBe("Preview source");
    expect(serialized).not.toContain("unsafe-storage-key");
    expect(serialized).not.toContain("unsafe-sha256");
    expect(serialized).not.toMatch(/storageKey|storage_key|sha256|protectedPath|signedUrl/);
  });

  it("returns capped text and shared-service Markdown payloads", async () => {
    const textAttachment = previewAttachment();
    const text = await readAttachmentPreviewContent(
      textAttachment,
      previewAvailabilityForAttachment(textAttachment),
      Readable.from(["plain text"]),
    );
    expect(text.content).toEqual({ encoding: "utf-8", kind: "text", text: "plain text" });

    const markdownAttachment = previewAttachment({ extension: ".md", mime_type_detected: "text/markdown" });
    const markdown = await readAttachmentPreviewContent(
      markdownAttachment,
      previewAvailabilityForAttachment(markdownAttachment),
      Readable.from(["# Safe\n\n<script>alert(1)</script>"]),
    );
    expect(markdown.content?.kind).toBe("markdown");
    expect(markdown.content).toMatchObject({ bodyFormat: "markdown", bodyHtmlFormat: "html" });
    if (markdown.content?.kind !== "markdown") throw new Error("Markdown preview expected.");
    expect(markdown.content.bodyHtml).toContain("<h1>Safe</h1>");
    expect(markdown.content.bodyHtml).not.toContain("<script>");
  });

  it("streams images with safe headers and rejects unavailable content before consumption", async () => {
    const imageAttachment = previewAttachment({
      extension: ".png",
      file_size_bytes: 8,
      mime_type_detected: "image/png",
      original_filename: "../unsafe.png",
    });
    const image = await readAttachmentPreviewContent(
      imageAttachment,
      previewAvailabilityForAttachment(imageAttachment),
      Readable.from([Buffer.from("image")]),
    );
    if (!image.stream) throw new Error("Image stream expected.");
    expect(image.kind).toBe("image");
    expect(image.headers).toMatchObject({
      "Cache-Control": "no-store",
      "Content-Disposition": "inline; filename=\"unsafe.png\"",
      "Content-Security-Policy": "sandbox",
      "Content-Type": "image/png",
      "X-Content-Type-Options": "nosniff",
    });

    const unavailableAttachment = previewAttachment({ file_status: "deleted" });
    await expect(readAttachmentPreviewContent(
      unavailableAttachment,
      previewAvailabilityForAttachment(unavailableAttachment),
      Readable.from(["must not be returned"]),
    )).rejects.toMatchObject({ message: "Preview content is not available for that file.", statusCode: 409 });
    await expect(readAttachmentPreviewContent(
      unavailableAttachment,
      { kind: "text", reason: "files_download_permission_required", state: "unauthorized" },
      Readable.from(["must not be returned"]),
    )).rejects.toBeInstanceOf(AppError);
  });

  it("keeps a second streaming cap even when stored metadata is stale", async () => {
    const attachment = previewAttachment({ file_size_bytes: 1 });
    await expect(readAttachmentPreviewContent(
      attachment,
      previewAvailabilityForAttachment(attachment),
      Readable.from([Buffer.alloc(512 * 1024), Buffer.from("overflow")]),
    )).rejects.toMatchObject({ message: "Preview content is too large.", statusCode: 413 });
  });
});
