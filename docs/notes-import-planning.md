# Notes Import Planning

This document records the 0.33.3.4 import planning closeout for Notes. It is planning guidance for a future import workflow, not an implemented importer and not Knowledge Base behavior.

## Current State

Notes already stores import-friendly metadata on notes and revisions:

- `import_source`
- `import_source_id`
- `import_source_path`
- `imported_at`
- `import_batch_id`
- `original_notebook`
- `original_section_group`
- `original_section`
- `original_page_id`

Notes also has hierarchical Library collections and `ensureCollectionsForImportPath()`, which can create imported collection paths through the Notes collection service. Import metadata and imported collections are classification/context metadata only. They do not grant access, do not bypass linked-record checks, do not make notes client-visible, and do not imply that private or secure source material is safe to import into normal notes.

## OneNote Mapping Plan

A future OneNote import workflow should map source structure into Notes without adding a separate notebook model:

- Notebook: preserve as `original_notebook`; optionally create a top-level imported collection.
- Section group: preserve as `original_section_group`; map nested groups into collection path segments.
- Section: preserve as `original_section`; map to a collection under the notebook/section-group path.
- Page: create one note record with the page title, safe Markdown body, source page ID, source path, and import batch ID.
- Subpage: preserve source path ordering and map to either a child collection path or source path metadata; do not create access inheritance from the source hierarchy.

The importer should preserve the original source path in `import_source_path` for troubleshooting. If the source has duplicate names, the importer should keep stable source IDs and use collision-safe note slugs and collection slugs rather than overwriting existing notes.

## Library Suggestions

Import should suggest a Library bucket where possible, but the suggestion must remain advisory:

- Task-like or open work material may suggest Active Work.
- Durable client, project, or responsibility material may suggest Ongoing Areas.
- General retained material should default to Reference Library.

Import source, notebook path, collection path, and suggested bucket must not grant permissions or change visibility by themselves. Imported notes should still pass the same note permissions, linked-record checks, secure-note checks, collection-bucket validation, and module-state checks as manually created notes.

## Safety Rules

A future import workflow must be fail-safe:

- Do not grant access based on import source.
- Do not assume imported notes are safe to make client-visible.
- Do not import secure, private, or sensitive source material into normal notes without a deliberate user choice.
- Do not turn imported source hierarchy into permissions.
- Do not expose hidden linked-record context through import metadata, audit records, search rows, lifecycle events, or Help content.
- Do not index secure imported bodies in normal search.
- Do not attach source files to secure notes until a secure-attachment model exists.
- Do not create Knowledge Base entries or publication records during Notes import.

If a future import workflow supports secure imports, it should route those bodies through the secure-note encryption path and preserve only safe source metadata outside the encrypted body.

## Verification Expectations

Future import work should add tests that create imported notes with notebook, section-group, section, page, subpage, source path, and batch metadata; verify collection path creation; verify permission-filtered counts; verify search excludes private and secure imported bodies; and verify source metadata does not appear in unsafe audit, event, notification, or public/client-visible payloads.
