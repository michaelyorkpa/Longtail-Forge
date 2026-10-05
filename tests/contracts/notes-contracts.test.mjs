import { describe, expect, it } from "vitest";
import {
  CreateNoteCollectionSchema,
  CreateNoteSchema,
  MoveNoteCollectionSchema,
  NoteBulkUpdateSchema,
  NoteCatalogBulkActionSchema,
  NoteCatalogSecurityTransitionSchema,
  NoteCollectionAssignmentSchema,
  NoteImportCollectionPathSchema,
  NoteLibraryChangeSchema,
  NoteLinkSchema,
  NoteMarkdownPreviewSchema,
  SENSITIVE_NOTE_INPUT_FIELDS,
  UpdateNoteCollectionSchema,
  UpdateNoteSchema,
  parseNotesEdgePayload,
} from "../../src/modules/notes/notes.contracts.js";
import { AppError } from "../../src/utils/app-error.js";

const browserNotePayload = {
  title: "  Project log  ",
  body_markdown: "## Update\n\nWork continues.",
  library_bucket: "active_work",
  noteCollectionId: null,
  note_type: "log",
  visibility: "internal",
  security_mode: "normal",
  tagIds: ["tag-1", 2, null],
  client_id: "client-1",
  project_id: "project-1",
  task_id: null,
  linked_user_id: "user-1",
  links: [{ moduleId: "tasks", targetType: "task", targetId: "task-1" }],
};

describe("Notes create and update payload corpus", () => {
  it("accepts the current browser shape, dual casing, nullable context, and liberal scalar IDs", () => {
    const created = parseNotesEdgePayload(CreateNoteSchema, browserNotePayload);
    const updated = parseNotesEdgePayload(UpdateNoteSchema, {
      ...browserNotePayload,
      bodyMarkdown: "Updated body",
      noteId: "note-1",
      metadata_json: "{\"source\":\"import\"}",
    });

    expect(created.title).toBe("Project log");
    expect(created.noteCollectionId).toBeNull();
    expect(created.tagIds).toEqual(["tag-1", 2, null]);
    expect(created.links?.[0]).toMatchObject({ targetType: "task", targetId: "task-1" });
    expect(updated.bodyMarkdown).toBe("Updated body");
    expect(updated.metadata_json).toBe("{\"source\":\"import\"}");
  });

  it("accepts import metadata and the plural context hints used by bucket derivation", () => {
    const parsed = parseNotesEdgePayload(CreateNoteSchema, {
      title: "Imported note",
      clientIds: ["client-1"],
      project_ids: "project-1,project-2",
      taskIds: 42,
      import_source: "onenote",
      import_source_path: "Notebook / Section",
      original_notebook: "Notebook",
      original_section: "Section",
    });

    expect(parsed.clientIds).toEqual(["client-1"]);
    expect(parsed.project_ids).toBe("project-1,project-2");
    expect(parsed.taskIds).toBe(42);
    expect(parsed.original_section).toBe("Section");
  });

  it("strips ordinary unknown and server-owned lifecycle fields for round-trip callers", () => {
    const parsed = parseNotesEdgePayload(UpdateNoteSchema, {
      ...browserNotePayload,
      archived_at: "spoof",
      created_at: "spoof",
      created_by_user_id: "spoof",
      workspace_id: "spoof",
      unknown_junk: true,
    });

    expect(parsed).not.toHaveProperty("archived_at");
    expect(parsed).not.toHaveProperty("created_at");
    expect(parsed).not.toHaveProperty("created_by_user_id");
    expect(parsed).not.toHaveProperty("workspace_id");
    expect(parsed).not.toHaveProperty("unknown_junk");
  });

  it.each(SENSITIVE_NOTE_INPUT_FIELDS)("rejects server-managed Secure Notes field %s", (field) => {
    expect(() => parseNotesEdgePayload(CreateNoteSchema, {
      title: "Secure spoof",
      [field]: "attacker-controlled",
    })).toThrow("Secure-note derived and encryption fields are server-managed");
  });

  it("rejects Secure Notes storage fields nested in bulk changes", () => {
    expect(() => parseNotesEdgePayload(NoteBulkUpdateSchema, {
      noteIds: ["note-1"],
      changes: { encrypted_data_key: "attacker-controlled" },
    })).toThrow("Secure-note derived and encryption fields are server-managed");
  });

  it("rejects structured junk in known workflow fields without over-tightening scalar inputs", () => {
    expect(() => parseNotesEdgePayload(CreateNoteSchema, { title: { nested: true } }))
      .toThrow("Note title must be text or a scalar value.");
    expect(() => parseNotesEdgePayload(CreateNoteSchema, { body_markdown: ["not", "markdown"] }))
      .toThrow("Note body must be text or a scalar value.");
    expect(() => parseNotesEdgePayload(CreateNoteSchema, { links: "task-1" }))
      .toThrow("Links must be a list.");
    expect(() => parseNotesEdgePayload(CreateNoteSchema, { tagIds: "tag-1" }))
      .toThrow("Tags must be a list.");
  });

  it("keeps required values and enum membership in the service", () => {
    expect(parseNotesEdgePayload(CreateNoteSchema, {})).toEqual({});
    expect(parseNotesEdgePayload(CreateNoteSchema, { title: "   ", visibility: "future-value" }))
      .toEqual({ title: "", visibility: "future-value" });
  });

  it("reports validation failures through the existing 400 AppError envelope", () => {
    try {
      parseNotesEdgePayload(UpdateNoteSchema, { links: {} });
      expect.unreachable("should have thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(AppError);
      if (!(error instanceof AppError)) throw error;
      expect(error.statusCode).toBe(400);
    }
  });
});

describe("Notes workflow mutation payloads", () => {
  it("accepts Markdown preview, Library change, and collection assignment aliases", () => {
    expect(parseNotesEdgePayload(NoteMarkdownPreviewSchema, { bodyMarkdown: "# Preview" }).bodyMarkdown)
      .toBe("# Preview");
    expect(parseNotesEdgePayload(NoteLibraryChangeSchema, { library_bucket: "reference" }).library_bucket)
      .toBe("reference");
    expect(parseNotesEdgePayload(NoteCollectionAssignmentSchema, { collectionId: null }).collectionId)
      .toBeNull();
  });

  it("accepts the current link shape and strips unrelated fields", () => {
    const parsed = parseNotesEdgePayload(NoteLinkSchema, {
      module_id: "tasks",
      target_type: "task",
      target_id: "task-1",
      link_role: "related",
      scope_role: "context",
      metadata: { source: "editor" },
      created_by_user_id: "spoof",
    });

    expect(parsed).toMatchObject({ target_type: "task", target_id: "task-1", scope_role: "context" });
    expect(parsed).not.toHaveProperty("created_by_user_id");
  });

  it("accepts nested and legacy flat Notes bulk-edit shapes", () => {
    const nested = parseNotesEdgePayload(NoteBulkUpdateSchema, {
      noteIds: ["note-1", "note-2"],
      changes: { libraryBucket: "reference", noteCollectionId: null },
    });
    const flat = parseNotesEdgePayload(NoteBulkUpdateSchema, {
      note_ids: "note-1,note-2",
      note_type: "decision",
    });

    expect(nested.changes?.noteCollectionId).toBeNull();
    expect(flat.note_ids).toBe("note-1,note-2");
    expect(flat.note_type).toBe("decision");
  });

  it("accepts collection create/update/move and import-path payloads", () => {
    const created = parseNotesEdgePayload(CreateNoteCollectionSchema, {
      title: "  Delivery  ",
      libraryBucket: "active_work",
      parentCollectionId: null,
      sortOrder: 10,
      metadata: { source: "manual" },
    });
    const updated = parseNotesEdgePayload(UpdateNoteCollectionSchema, {
      name: "Delivery notes",
      sort_order: "20",
    });
    const moved = parseNotesEdgePayload(MoveNoteCollectionSchema, {
      parent_collection_id: "collection-2",
      description: "Moved",
    });
    const imported = parseNotesEdgePayload(NoteImportCollectionPathSchema, {
      library_bucket: "reference",
      parts: ["Notebook", "Section"],
      importSource: "onenote",
    });

    expect(created.title).toBe("Delivery");
    expect(created.sortOrder).toBe(10);
    expect(updated.sort_order).toBe("20");
    expect(moved.parent_collection_id).toBe("collection-2");
    expect(imported.parts).toEqual(["Notebook", "Section"]);
  });

  it("accepts catalog bulk and security-transition confirmations while keeping passwords string-only", () => {
    const bulk = parseNotesEdgePayload(NoteCatalogBulkActionSchema, {
      action: "archive",
      catalogIds: ["catalog-1", "catalog-2"],
    });
    const transition = parseNotesEdgePayload(NoteCatalogSecurityTransitionSchema, {
      confirmAffectedNoteCount: "2",
      confirmAction: "remove_security",
      confirmCatalogId: "catalog-1",
      currentPassword: "secret",
    });

    expect(bulk.catalogIds).toEqual(["catalog-1", "catalog-2"]);
    expect(transition.confirmAffectedNoteCount).toBe("2");
    expect(() => parseNotesEdgePayload(NoteCatalogSecurityTransitionSchema, {
      currentPassword: { value: "secret" },
    })).toThrow("Current password must be text.");
  });
});
