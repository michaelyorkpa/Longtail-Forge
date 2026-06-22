# Workflow Context Contract

This document defines the current user-facing context terminology for workflow records as of 0.33.5.18.6.6.3. It applies to Notes now and should guide future Tasks, Lists, Files, Clients/Projects, and Knowledge Base surfaces when they show related work context.

## Terms

Primary Context is the record's direct, structured scope. For Notes, the direct nullable fields `notes.client_id` and `notes.project_id` are Primary Context. Primary Context is used by framework-facing behavior such as permissions, tags, search, files, filters, public API shaping, and future resume context.

Linked Context is flexible related-record context stored outside the record's direct scope fields. For Notes, `note_links` rows are Linked Context. Linked Context can connect a note to supporting records, but it should not replace Primary Context or become a shortcut around the owning module's permission and scope rules.

Use Primary Context and Linked Context in normal product UI. Avoid Linked Records in frontend copy unless a developer/internal implementation document is specifically discussing existing descriptor keys, table names, route names, or helper APIs.

## Notes Boundary

Notes keeps its current backend model:

- Direct nullable context fields on the note row, such as `client_id` and `project_id`, represent Primary Context.
- Link rows, such as `note_links`, represent Linked Context.
- Primary Context and Linked Context are related, but they are not the same thing.
- Primary Context may be shown inside Linked Context UI as a non-removable reference, but it must be edited through the Note Details / Primary Context controls.
- Linked Context rows may be added or removed through the Linked Context panel when permissions allow.
- Backend table names, route names, descriptor keys such as `linkedRecords`, and internal identifiers do not need to be renamed for this terminology pass.

## Label Safety

Normal app UI must not display raw UUIDs or raw target IDs for primary or linked context. Audit Logs may display raw IDs because they are an administrative/security record.

If a primary or linked target cannot be resolved to a readable label, show a safe fallback label and do not include the raw target ID:

- `Unavailable client`
- `Unavailable project`
- `Unavailable task`
- `Unavailable note`
- `Unavailable list`
- `Unavailable linked context`

These fallback labels are display labels only. They must not imply the target is deleted, unauthorized, or broken unless the service already exposes that state safely.

## Shared Picker Provider Contract

Shared Linked Context pickers use module-owned providers. The framework owns reusable picker anatomy through `LongtailForge.view.createLinkedContextPicker()`, but source modules own permission-safe target lookup, search filtering, sorting, display labels, secondary labels, source URLs, and Primary Context hints.

Provider results use the `linked-context-target.v1` response contract documented in `docs/linked-context-picker-contract.md`. Normalized targets include `moduleId`, `targetType`, `targetId`, `displayLabel`, `secondaryLabel`, `sortKey`, `sourceUrl`, `clientId`, `projectId`, `workspaceId`, `isAvailable`, and optional `primaryContextHints`.

The no-raw-ID rule applies to provider-rendered labels: `displayLabel` and `secondaryLabel` must be safe for direct UI rendering and must not echo raw target, client, project, or workspace identifiers.

For Add/Edit Notes, normal Linked Context picker choices are Project, Task, Note, List, User, and Client only in Business/client-readable contexts. Workspace may remain available to backend compatibility paths, but it is not a normal picker option. Personal and Family workspaces must not show Client targets or client labels in project/task picker display strings.

Task target labels are compact picker labels owned by the Task provider. They use a shortened task-title portion plus project context where present, avoid target-type/status/id suffixes, and expose the full task title through tooltip or accessible-label metadata when the displayed title is truncated. Active readable tasks sort before completed or archived tasks, then by context and title through provider-owned sort keys.

Note and List target labels are provider-owned as well. Picker labels use an approximately 20-character safe title prefix plus readable Primary Context where present, following the same Business and Personal/Family context rules as Task picker labels. Existing linked Note/List rows keep the full safe title as the row label and show readable Primary Context secondary text when available. Notes may fall back to Library/collection secondary context, and Lists may fall back to list type, when no readable Primary Context exists. Private, secure, deleted, disabled-module, and inaccessible targets must be filtered before labels are returned. Neither target type should expose UUIDs, raw ids, or synthetic `Note:` / `List:` prefixes in normal UI.
