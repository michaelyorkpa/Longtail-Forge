const CATALOG_SECURITY_POLICIES = Object.freeze({
  NORMAL: "normal",
  SECURE: "secure",
});

const CATALOG_SECURITY_TRANSITION_STATES = Object.freeze({
  FAILED: "failed",
  SECURING: "securing",
  STABLE: "stable",
});

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

function resolveCollectionEffectiveSecurity(collection = {}, collectionsById = new Map(), workspaceId = "") {
  const expectedWorkspaceId = normalizedText(workspaceId || collection.workspace_id);
  const visited = new Set();
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
  const source = collectionResult.effectiveSecurityMode === NOTE_EFFECTIVE_SECURITY_MODES.SECURE
    ? collectionResult.securityCatalogId === collectionId ? "catalog" : "ancestor_catalog"
    : "none";
  return noteSecurityProjection(collectionResult, note, source);
}

function catalogRequiresSecureAuthorization(collection = {}) {
  return normalizedText(collection.security_policy) === CATALOG_SECURITY_POLICIES.SECURE ||
    [CATALOG_SECURITY_TRANSITION_STATES.SECURING, CATALOG_SECURITY_TRANSITION_STATES.FAILED]
      .includes(normalizedText(collection.security_transition_state));
}

function isEffectivelySecureNote(note = {}) {
  return normalizedText(note.effective_security_mode || note.security_mode) === NOTE_EFFECTIVE_SECURITY_MODES.SECURE;
}

function failClosedCollectionResult(resolutionState) {
  return {
    effectiveSecurityMode: NOTE_EFFECTIVE_SECURITY_MODES.SECURE,
    inherited: true,
    resolutionState,
    securityCatalogId: null,
  };
}

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
