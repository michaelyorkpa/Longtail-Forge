import { registerSearchIndexer } from "../../core/search/indexer-registry.js";
import { readSearchTagsText } from "../../core/search/tag-text.js";
import { notesRepository } from "./notes.repo.js";
import { NOTE_SECURITY_MODES, NOTE_STATUSES, NOTE_VISIBILITIES } from "./library.js";
import { extractPlainTextFromMarkdown } from "./markdown.js";

const NOTES_SEARCH_INDEXER_ID = "notes.records";

function registerNotesSearchIndexers() {
  return registerSearchIndexer(NOTES_SEARCH_INDEXER_ID, indexNoteRecord);
}

async function indexNoteRecord({ workspaceId, recordId }) {
  if (!recordId) {
    const notes = await notesRepository.list(workspaceId, { includeDeleted: false });
    const documents = [];

    for (const note of notes) {
      const document = await noteToSearchDocument(note);
      if (document) {
        documents.push(document);
      }
    }

    return { documents };
  }

  const note = await notesRepository.readById(workspaceId, recordId);
  if (!note) {
    return null;
  }

  return noteToSearchDocument(note);
}

async function noteToSearchDocument(note = {}) {
  if (!isSearchableNote(note)) {
    return null;
  }

  const links = await notesRepository.listLinks(note.workspace_id, note.note_id);
  const collection = note.note_collection_id
    ? await notesRepository.readCollectionById(note.workspace_id, note.note_collection_id)
    : null;
  const tagsText = await readSearchTagsText({
    workspaceId: note.workspace_id,
    targetType: "note",
    targetId: note.note_id,
  });
  const linkedContext = links
    .map((link) => [link.module_id, link.target_type, link.target_id, link.scope_role, link.link_role].filter(Boolean).join(" "))
    .filter(Boolean)
    .join("\n");
  const contextText = [
    note.library_bucket,
    note.status,
    note.visibility,
    note.client_id,
    note.project_id,
    note.task_id,
    note.ticket_id,
    note.linked_user_id,
    linkedContext,
  ].filter(Boolean).join("\n");

  return {
    workspace_id: note.workspace_id,
    note_id: note.note_id,
    title: note.title,
    summary: note.body_excerpt || "",
    body: [
      note.body_plaintext_index || extractPlainTextFromMarkdown(note.body_markdown || ""),
      contextText,
    ].filter(Boolean).join("\n"),
    tags_text: tagsText,
    client_id: note.client_id,
    project_id: note.project_id,
    library_bucket: note.library_bucket,
    note_collection_id: collection?.status !== "deleted" ? note.note_collection_id : "",
    collection_path: collection?.status !== "deleted" ? collection?.path_cache || collection?.title || "" : "",
    visibility: note.visibility,
    search_status: normalizeNoteSearchStatus(note),
    source: "Notes",
    record_created_at: note.created_at,
    record_updated_at: note.updated_at,
  };
}

function isSearchableNote(note = {}) {
  if (!note.note_id || note.status === NOTE_STATUSES.DELETED || note.deleted_at) {
    return false;
  }

  if (note.security_mode === NOTE_SECURITY_MODES.SECURE) {
    return false;
  }

  return note.visibility !== NOTE_VISIBILITIES.PRIVATE;
}

function normalizeNoteSearchStatus(note = {}) {
  if (note.status === NOTE_STATUSES.ARCHIVED || note.archived_at) {
    return "archived";
  }

  return "active";
}

export {
  NOTES_SEARCH_INDEXER_ID,
  indexNoteRecord,
  noteToSearchDocument,
  registerNotesSearchIndexers,
};
