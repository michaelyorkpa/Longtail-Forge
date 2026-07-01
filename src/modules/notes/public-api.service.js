import { AppError } from "../../core/errors.js";
import { notesService } from "./notes.service.js";

async function listNotes(context, query = {}) {
  const result = await notesService.listAll(context, query);
  const notes = result.notes
    .filter((note) => note.security_mode !== "secure")
    .map((note) => withWorkspaceAlias(shapePublicNote(note), context));

  return paged(notes, query);
}

async function readNote(context, noteId) {
  const result = await notesService.read(noteId, context);
  const note = result.note;

  if (note.security_mode === "secure") {
    throw new AppError("Secure notes are not available through the public API.", 403);
  }

  return withWorkspaceAlias(shapePublicNote(note), context);
}

function shapePublicNote(note = {}) {
  const shaped = { ...note };

  delete shaped.body_html;
  delete shaped.body_plaintext_index;
  delete shaped.metadata_json;
  delete shaped.searchDocument;

  return shaped;
}

function withWorkspaceAlias(record, context) {
  if (!record || typeof record !== "object") {
    return record;
  }

  return {
    ...record,
    workspace_id: record.workspace_id || context.workspace_id,
  };
}

function paged(items, query) {
  const limit = clampInteger(query.limit, 1, 100, 50);
  const offset = clampInteger(query.offset, 0, Number.MAX_SAFE_INTEGER, 0);

  return {
    data: items.slice(offset, offset + limit),
    pagination: {
      limit,
      offset,
      total: items.length,
      has_more: offset + limit < items.length,
    },
  };
}

function clampInteger(value, min, max, fallback) {
  const parsed = Number.parseInt(value, 10);

  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return Math.min(Math.max(parsed, min), max);
}

export const notesPublicApiService = {
  listNotes,
  readNote,
};
