import { notesService } from "./notes.service.js";
import { assertNoteConsumerAccess, canExposeNoteToConsumer } from "./consumer-policy.js";
import { pagePublicApiItems, withWorkspaceFallback } from "../../core/public-api-responses.js";

/** @typedef {import("../../types/http-contracts.js").ApiSession} ApiSession */
/** @typedef {import("../../types/notes-domain-contracts.js").NotesServiceNoteLike} NotesServiceNoteLike */
/** @typedef {import("../../types/notes-domain-contracts.js").NotesServiceQuery} NotesServiceQuery */

/** @param {ApiSession} context @param {NotesServiceQuery} [query] */
async function listNotes(context, query = {}) {
  const result = await notesService.listAll(context, query);
  const notes = result.notes
    .filter((note) => canExposeNoteToConsumer(note, "notes.public-api"))
    .map((note) => withWorkspaceFallback(shapePublicNote(note), context));

  return pagePublicApiItems(notes, query);
}

/** @param {ApiSession} context @param {string} noteId */
async function readNote(context, noteId) {
  const result = await notesService.read(noteId, context);
  const note = result.note;

  assertNoteConsumerAccess(note, "notes.public-api");

  return withWorkspaceFallback(shapePublicNote(note), context);
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

export const notesPublicApiService = {
  listNotes,
  readNote,
};
