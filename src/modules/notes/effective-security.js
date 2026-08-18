/** @typedef {import("../../types/notes-domain-contracts.js").CollectionEffectiveSecurityResult} CollectionEffectiveSecurityResult */
/** @typedef {import("../../types/notes-domain-contracts.js").NoteEffectiveSecurityProjection} NoteEffectiveSecurityProjection */
/** @typedef {import("../../types/notes-domain-contracts.js").NoteSecurityCollectionMap} NoteSecurityCollectionMap */
/** @typedef {import("../../types/notes-domain-contracts.js").NoteSecurityCollectionRecord} NoteSecurityCollectionRecord */
/** @typedef {import("../../types/notes-domain-contracts.js").NoteSecurityResolutionState} NoteSecurityResolutionState */
/** @typedef {import("../../types/notes-domain-contracts.js").NoteSecuritySource} NoteSecuritySource */
/** @typedef {import("../../types/notes-domain-contracts.js").NoteSecuritySourceRecord} NoteSecuritySourceRecord */

const CATALOG_SECURITY_POLICIES = Object.freeze({
  NORMAL: "normal",
  SECURE: "secure",
});

const CATALOG_SECURITY_TRANSITION_STATES = Object.freeze({
  FAILED: "failed",
  SECURING: "securing",
  STABLE: "stable",
});

/** @type {ReadonlySet<string>} */
const SECURE_AUTHORIZATION_TRANSITION_STATES = new Set([
  CATALOG_SECURITY_TRANSITION_STATES.SECURING,
  CATALOG_SECURITY_TRANSITION_STATES.FAILED,
]);

const NOTE_EFFECTIVE_SECURITY_MODES = Object.freeze({
  NORMAL: "normal",
  SECURE: "secure",
});

const SECURITY_RESOLUTION_STATES = Object.freeze({
  CYCLE: "cycle",
  MISSING_ANCESTOR: "missing_ancestor",
  MISSING_COLLECTION: "missing_collection",
  RESOLVED: "resolved",
  WORKSPACE_MISMATCH: "workspace_mismatch",
});

/**
 * @param {NoteSecurityCollectionRecord} [collection]
 * @param {NoteSecurityCollectionMap} [collectionsById]
 * @param {string} [workspaceId]
 * @returns {CollectionEffectiveSecurityResult}
 */
function resolveCollectionEffectiveSecurity(collection = {}, collectionsById = new Map(), workspaceId = "") {
  const expectedWorkspaceId = normalizedText(workspaceId || collection.workspace_id);
  const visited = new Set();
  /** @type {NoteSecurityCollectionRecord | undefined} */
  let current = collection;
  let inherited = false;

  while (current) {
    const collectionId = normalizedText(current.note_library_collection_id);
    if (!collectionId || !expectedWorkspaceId || normalizedText(current.workspace_id) !== expectedWorkspaceId) {
      return failClosedCollectionResult(SECURITY_RESOLUTION_STATES.WORKSPACE_MISMATCH);
    }
    if (visited.has(collectionId)) {
      return failClosedCollectionResult(SECURITY_RESOLUTION_STATES.CYCLE);
    }
    visited.add(collectionId);

    if (catalogRequiresSecureAuthorization(current)) {
      return {
        effectiveSecurityMode: NOTE_EFFECTIVE_SECURITY_MODES.SECURE,
        inherited,
        resolutionState: SECURITY_RESOLUTION_STATES.RESOLVED,
        securityCatalogId: collectionId,
      };
    }

    const parentId = normalizedText(current.parent_collection_id);
    if (!parentId) {
      return {
        effectiveSecurityMode: NOTE_EFFECTIVE_SECURITY_MODES.NORMAL,
        inherited: false,
        resolutionState: SECURITY_RESOLUTION_STATES.RESOLVED,
        securityCatalogId: null,
      };
    }

    const parent = collectionsById.get(parentId);
    if (!parent) {
      return failClosedCollectionResult(SECURITY_RESOLUTION_STATES.MISSING_ANCESTOR);
    }
    current = parent;
    inherited = true;
  }

  return failClosedCollectionResult(SECURITY_RESOLUTION_STATES.MISSING_ANCESTOR);
}

/**
 * @param {NoteSecuritySourceRecord} [note]
 * @param {NoteSecurityCollectionMap} [collectionsById]
 * @param {string} [workspaceId]
 * @returns {NoteEffectiveSecurityProjection}
 */
function resolveNoteEffectiveSecurity(note = {}, collectionsById = new Map(), workspaceId = "") {
  const expectedWorkspaceId = normalizedText(workspaceId || note.workspace_id);
  if (!expectedWorkspaceId || normalizedText(note.workspace_id) !== expectedWorkspaceId) {
    return noteSecurityProjection({
      effectiveSecurityMode: NOTE_EFFECTIVE_SECURITY_MODES.SECURE,
      inherited: false,
      resolutionState: SECURITY_RESOLUTION_STATES.WORKSPACE_MISMATCH,
      securityCatalogId: null,
    }, note);
  }

  if (normalizedText(note.security_mode) === NOTE_EFFECTIVE_SECURITY_MODES.SECURE) {
    return noteSecurityProjection({
      effectiveSecurityMode: NOTE_EFFECTIVE_SECURITY_MODES.SECURE,
      inherited: false,
      resolutionState: SECURITY_RESOLUTION_STATES.RESOLVED,
      securityCatalogId: null,
    }, note, "explicit_note");
  }

  const collectionId = normalizedText(note.note_collection_id);
  if (!collectionId) {
    return noteSecurityProjection({
      effectiveSecurityMode: NOTE_EFFECTIVE_SECURITY_MODES.NORMAL,
      inherited: false,
      resolutionState: SECURITY_RESOLUTION_STATES.RESOLVED,
      securityCatalogId: null,
    }, note, "none");
  }

  const collection = collectionsById.get(collectionId);
  if (!collection) {
    return noteSecurityProjection(
      failClosedCollectionResult(SECURITY_RESOLUTION_STATES.MISSING_COLLECTION),
      note,
      "unresolved_catalog",
    );
  }

  const collectionResult = resolveCollectionEffectiveSecurity(collection, collectionsById, expectedWorkspaceId);
  /** @type {NoteSecuritySource} */
  const source = collectionResult.effectiveSecurityMode === NOTE_EFFECTIVE_SECURITY_MODES.SECURE
    ? collectionResult.securityCatalogId === collectionId ? "catalog" : "ancestor_catalog"
    : "none";
  return noteSecurityProjection(collectionResult, note, source);
}

/** @param {NoteSecurityCollectionRecord} [collection] */
function catalogRequiresSecureAuthorization(collection = {}) {
  return normalizedText(collection.security_policy) === CATALOG_SECURITY_POLICIES.SECURE ||
    SECURE_AUTHORIZATION_TRANSITION_STATES.has(normalizedText(collection.security_transition_state));
}

/** @param {NoteSecuritySourceRecord} [note] */
function isEffectivelySecureNote(note = {}) {
  return normalizedText(note.effective_security_mode || note.security_mode) === NOTE_EFFECTIVE_SECURITY_MODES.SECURE;
}

/** @param {NoteSecurityResolutionState} resolutionState @returns {CollectionEffectiveSecurityResult} */
function failClosedCollectionResult(resolutionState) {
  return {
    effectiveSecurityMode: NOTE_EFFECTIVE_SECURITY_MODES.SECURE,
    inherited: true,
    resolutionState,
    securityCatalogId: null,
  };
}

/**
 * @param {CollectionEffectiveSecurityResult} result
 * @param {NoteSecuritySourceRecord} note
 * @param {NoteSecuritySource} [source]
 * @returns {NoteEffectiveSecurityProjection}
 */
function noteSecurityProjection(result, note, source = "unresolved_catalog") {
  return {
    effective_security_mode: result.effectiveSecurityMode,
    explicit_security_mode: normalizedText(note.security_mode) || NOTE_EFFECTIVE_SECURITY_MODES.NORMAL,
    security_catalog_id: result.securityCatalogId,
    security_inherited: result.effectiveSecurityMode === NOTE_EFFECTIVE_SECURITY_MODES.SECURE && source !== "explicit_note",
    security_resolution_state: result.resolutionState,
    security_source: result.resolutionState === SECURITY_RESOLUTION_STATES.RESOLVED ? source : "unresolved_catalog",
  };
}

/** @param {unknown} value */
function normalizedText(value) {
  return String(value || "").trim();
}

export {
  CATALOG_SECURITY_POLICIES,
  CATALOG_SECURITY_TRANSITION_STATES,
  NOTE_EFFECTIVE_SECURITY_MODES,
  SECURITY_RESOLUTION_STATES,
  catalogRequiresSecureAuthorization,
  isEffectivelySecureNote,
  resolveCollectionEffectiveSecurity,
  resolveNoteEffectiveSecurity,
};
