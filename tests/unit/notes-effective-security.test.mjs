import { describe, expect, it } from "vitest";
import {
  resolveCollectionEffectiveSecurity,
  resolveNoteEffectiveSecurity,
} from "../../src/modules/notes/effective-security.js";
import { canAccessNote, NOTE_PERMISSIONS } from "../../src/modules/notes/access-policy.js";

const workspaceId = "workspace-a";

/**
 * @param {string} id
 * @param {string | null} [parentId]
 * @param {Record<string, unknown>} [options]
 */
function collection(id, parentId = null, options = {}) {
  return {
    note_library_collection_id: id,
    parent_collection_id: parentId,
    security_policy: "normal",
    security_transition_state: "stable",
    workspace_id: workspaceId,
    ...options,
  };
}

/** @param {...ReturnType<typeof collection>} collections */
function collectionMap(...collections) {
  return new Map(collections.map((item) => [item.note_library_collection_id, item]));
}

describe("Notes effective security", () => {
  it("resolves explicit, direct-catalog, and arbitrary-depth inherited security", () => {
    const root = collection("root", null, { security_policy: "secure" });
    const archived = collection("archived", "root", { status: "archived" });
    const leaf = collection("leaf", "archived");
    const collections = collectionMap(root, archived, leaf);

    expect(resolveNoteEffectiveSecurity({
      note_collection_id: "leaf",
      security_mode: "normal",
      workspace_id: workspaceId,
    }, collections, workspaceId)).toMatchObject({
      effective_security_mode: "secure",
      explicit_security_mode: "normal",
      security_catalog_id: "root",
      security_inherited: true,
      security_resolution_state: "resolved",
      security_source: "ancestor_catalog",
    });

    expect(resolveNoteEffectiveSecurity({
      note_collection_id: "root",
      security_mode: "normal",
      workspace_id: workspaceId,
    }, collections, workspaceId)).toMatchObject({
      effective_security_mode: "secure",
      security_catalog_id: "root",
      security_inherited: true,
      security_source: "catalog",
    });

    expect(resolveNoteEffectiveSecurity({
      note_collection_id: null,
      security_mode: "secure",
      workspace_id: workspaceId,
    }, collections, workspaceId)).toMatchObject({
      effective_security_mode: "secure",
      security_inherited: false,
      security_source: "explicit_note",
    });
  });

  it("treats securing and failed transitions as secure authorization state", () => {
    for (const state of ["securing", "failed"]) {
      const catalog = collection("catalog", null, { security_transition_state: state });
      expect(resolveCollectionEffectiveSecurity(catalog, collectionMap(catalog), workspaceId))
        .toMatchObject({ effectiveSecurityMode: "secure", resolutionState: "resolved" });
    }
  });

  it("makes the effective result authoritative for secure-note permissions", () => {
    const projected = {
      ...resolveNoteEffectiveSecurity({
        note_collection_id: "secure-catalog",
        owner_user_id: "user-a",
        security_mode: "normal",
        status: "active",
        visibility: "internal",
        workspace_id: workspaceId,
      }, collectionMap(collection("secure-catalog", null, { security_policy: "secure" })), workspaceId),
      owner_user_id: "user-a",
      security_mode: "normal",
      status: "active",
      visibility: "internal",
      workspace_id: workspaceId,
    };

    expect(canAccessNote({
      note: projected,
      operation: "read",
      permissions: [NOTE_PERMISSIONS.VIEW],
      session: { user_id: "user-a", workspace_id: workspaceId },
    })).toEqual({ allowed: false, reason: "secure_note_permission" });
    expect(canAccessNote({
      note: projected,
      operation: "read",
      permissions: [NOTE_PERMISSIONS.VIEW, NOTE_PERMISSIONS.SECURE_VIEW],
      session: { user_id: "user-a", workspace_id: workspaceId },
    })).toEqual({ allowed: true, reason: "allowed" });
  });

  it("fails closed for missing collections, missing ancestors, cycles, and workspace mismatches", () => {
    const orphan = collection("orphan", "missing");
    const cycleA = collection("cycle-a", "cycle-b");
    const cycleB = collection("cycle-b", "cycle-a");
    const foreign = collection("foreign", null, { workspace_id: "workspace-b" });

    /** @type {Array<[{ note_collection_id: string, security_mode: string, workspace_id: string }, Map<string, ReturnType<typeof collection>>, string]>} */
    const scenarios = [
      [{ note_collection_id: "missing", security_mode: "normal", workspace_id: workspaceId }, collectionMap(), "missing_collection"],
      [{ note_collection_id: "orphan", security_mode: "normal", workspace_id: workspaceId }, collectionMap(orphan), "missing_ancestor"],
      [{ note_collection_id: "cycle-a", security_mode: "normal", workspace_id: workspaceId }, collectionMap(cycleA, cycleB), "cycle"],
      [{ note_collection_id: "foreign", security_mode: "normal", workspace_id: workspaceId }, collectionMap(foreign), "workspace_mismatch"],
    ];

    for (const [note, collections, resolutionState] of scenarios) {
      expect(resolveNoteEffectiveSecurity(note, collections, workspaceId)).toMatchObject({
        effective_security_mode: "secure",
        security_inherited: true,
        security_resolution_state: resolutionState,
        security_source: "unresolved_catalog",
      });
    }
  });
});
