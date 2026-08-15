// @ts-check
import { notesService } from "./notes.service.js";
import { assertNoteConsumerAccess, canExposeNoteToConsumer } from "./consumer-policy.js";

/** @typedef {import("../../types/http-contracts.js").ApiSession} ApiSession */
/** @typedef {import("../../types/notes-domain-contracts.js").NotesServiceNoteLike} NotesServiceNoteLike */
/** @typedef {import("../../types/notes-domain-contracts.js").NotesServiceQuery} NotesServiceQuery */

/** @param {ApiSession} context @param {NotesServiceQuery} [query] */
async function listNotes(context, query = {}) {
  const result = await notesService.listAll(context, query);
  const notes = result.notes
    .filter((note) => canExposeNoteToConsumer(note, "notes.public-api"))
    .map((note) => withWorkspaceAlias(shapePublicNote(note), context));

  return paged(notes, query);
}

/** @param {ApiSession} context @param {string} noteId */
async function readNote(context, noteId) {
  const result = await notesService.read(noteId, context);
  const note = result.note;

  assertNoteConsumerAccess(note, "notes.public-api");

  return withWorkspaceAlias(shapePublicNote(note), context);
}

/** @param {NotesServiceNoteLike} note */
function shapePublicNote(note) {
  const shaped = { ...note };

  delete shaped.body_html;
  delete shaped.body_plaintext_index;
  delete shaped.metadata_json;
  delete shaped.searchDocument;

  return shaped;
}

/** @param {NotesServiceNoteLike} record @param {ApiSession} context */
function withWorkspaceAlias(record, context) {
  if (!record || typeof record !== "object") {
    return record;
  }

  return {
    ...record,
    workspace_id: record.workspace_id || context.workspace_id,
  };
}

/** @param {NotesServiceNoteLike[]} items @param {NotesServiceQuery} query */
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

/** @param {unknown} value @param {number} min @param {number} max @param {number} fallback */
function clampInteger(value, min, max, fallback) {
  const parsed = Number.parseInt(String(value), 10);

  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return Math.min(Math.max(parsed, min), max);
}

export const notesPublicApiService = {
  listNotes,
  readNote,
};
