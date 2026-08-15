// @ts-check
// Public entry point for the Notes module.
//
// Framework/shared code and other modules import Notes capabilities from here.
// Do not import this module's internal repositories/services/routes directly
// from outside the module; the module-import-boundaries guardrail rejects new
// deep imports. Everything exported here is a supported cross-module contract.

export { notesModule } from "./module.js";
export { notesService } from "./notes.service.js";
export { notesRepository } from "./notes.repo.js";
export { catalogSecurityService } from "./catalog-security.service.js";
export {
  NOTES_PROTECTED_CONTENT_CONSUMERS,
  assertNoteConsumerAccess,
  canExposeNoteToConsumer,
  readNoteConsumerPolicy,
} from "./consumer-policy.js";
export {
  NOTE_LIBRARY_BUCKETS,
  NOTE_SECURITY_MODES,
  NOTE_STATUSES,
  NOTE_VISIBILITIES,
} from "./library.js";
