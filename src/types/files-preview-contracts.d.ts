import type { Readable } from "node:stream";
import type { AttachmentRow } from "./files-repository-contracts.js";

export type FilePreviewKind = "image" | "markdown" | "text" | "unsupported";
export type FilePreviewState = "download_only" | "previewable" | "too_large_for_preview" | "unauthorized" | "unavailable";

export interface FilePreviewAvailability {
  kind: FilePreviewKind;
  reason: string;
  state: FilePreviewState;
}

export interface FilePreviewAvailabilityOptions {
  canPreviewInReview?: boolean;
}

export interface FilePreviewDescriptor {
  fileAttachmentId: string;
  file_attachment_id: string;
  fileId: string;
  file_id: string;
  moduleId: string;
  module_id: string;
  targetType: string;
  target_type: string;
  targetId: string;
  target_id: string;
  state: FilePreviewState;
  previewState: FilePreviewState;
  preview_state: FilePreviewState;
  kind: FilePreviewKind;
  previewKind: FilePreviewKind;
  preview_kind: FilePreviewKind;
  reason: string;
  filename: string;
  fileName: string;
  file_name: string;
  fileType: string;
  file_type: string;
  extension: string;
  mimeType: string;
  mime_type: string;
  fileSizeBytes: number;
  file_size_bytes: number;
  status: string;
  scanStatus: string;
  scan_status: string;
  contentAvailable: boolean;
  content_available: boolean;
  contentUrl?: string;
  content_url?: string;
}

export interface FilePreviewImageResponse {
  headers: Record<string, string>;
  kind: "image";
  preview: FilePreviewDescriptor;
  stream: Readable;
  content?: undefined;
}

export interface FilePreviewTextResponse {
  content: {
    encoding: "utf-8";
    kind: "text";
    text: string;
  };
  preview: FilePreviewDescriptor;
  headers?: undefined;
  stream?: undefined;
}

export interface FilePreviewMarkdownResponse {
  content: {
    bodyFormat: "markdown";
    bodyHtml: string;
    bodyHtmlFormat: "html";
    bodyMarkdown: string;
    kind: "markdown";
  };
  preview: FilePreviewDescriptor;
  headers?: undefined;
  stream?: undefined;
}

export type FilePreviewContentResponse = FilePreviewImageResponse | FilePreviewTextResponse | FilePreviewMarkdownResponse;

export interface FilesPreviewService {
  availabilityForAttachment: (attachment: AttachmentRow, options?: FilePreviewAvailabilityOptions) => FilePreviewAvailability;
  assertContentAvailable: (availability: FilePreviewAvailability) => void;
  kindForAttachment: (attachment: AttachmentRow) => FilePreviewKind;
  readContent: (attachment: AttachmentRow, availability: FilePreviewAvailability, stream: Readable) => Promise<FilePreviewContentResponse>;
  shapeDescriptor: (attachment: AttachmentRow, availability: FilePreviewAvailability) => FilePreviewDescriptor;
}
