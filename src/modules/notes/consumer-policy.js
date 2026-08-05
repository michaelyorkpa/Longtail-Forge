import { AppError } from "../../core/errors.js";
import { isEffectivelySecureNote } from "./effective-security.js";

const NOTES_PROTECTED_CONTENT_CONSUMERS = Object.freeze([
  consumer("notes.workspace", "browser-api", "authorize"),
  consumer("notes.revisions", "history", "authorize"),
  consumer("notes.relationships", "linked-context", "authorize"),
  consumer("notes.attachments", "files", "exclude"),
  consumer("notes.activity", "activity", "exclude"),
  consumer("notes.notifications", "notifications", "exclude"),
  consumer("notes.search", "search", "exclude"),
  consumer("notes.resume", "work-resume", "exclude"),
  consumer("notes.workbench", "workbench", "exclude"),
  consumer("notes.public-api", "public-api", "exclude"),
  consumer("notes.exports", "export", "exclude"),
  consumer("notes.provider-catalogs", "provider-catalog", "exclude"),
  consumer("notes.support-view", "support-view", "exclude"),
]);

const consumerById = new Map(NOTES_PROTECTED_CONTENT_CONSUMERS.map((entry) => [entry.id, entry]));

function canExposeNoteToConsumer(note = {}, consumerId, options = {}) {
  const policy = readNoteConsumerPolicy(consumerId);
  if (!isEffectivelySecureNote(note)) {
    return true;
  }

  return policy.behavior === "authorize" && options.authorized === true;
}

function assertNoteConsumerAccess(note = {}, consumerId, options = {}) {
  if (!canExposeNoteToConsumer(note, consumerId, options)) {
    throw new AppError("Note not found.", 404, {
      code: "protected_note_excluded",
    });
  }
  return note;
}

function readNoteConsumerPolicy(consumerId) {
  const normalizedId = String(consumerId || "").trim();
  const policy = consumerById.get(normalizedId);
  if (!policy) {
    throw new TypeError(`Notes protected-content consumer '${normalizedId || "<missing>"}' is not declared.`);
  }
  return policy;
}

function consumer(id, surface, behavior) {
  return Object.freeze({
    id,
    moduleId: "notes",
    recordType: "note",
    surface,
    behavior,
    assertion: "notes.effective-security",
  });
}

export {
  NOTES_PROTECTED_CONTENT_CONSUMERS,
  assertNoteConsumerAccess,
  canExposeNoteToConsumer,
  readNoteConsumerPolicy,
};
