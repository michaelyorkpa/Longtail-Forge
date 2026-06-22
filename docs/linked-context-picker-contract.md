# Linked Context Picker Provider And Shell Contract

This document defines the shared Linked Context picker provider and shell contract as of 0.33.5.18.6.5.4. The framework owns the reusable picker shell. Source modules own provider data, permission-safe filtering, sorting, labels, summaries, and source URLs.

## Ownership

Source modules expose `linkedContextProviders` in their module manifests. Each provider advertises one selectable `targetType`, the provider registry id, the required read permission, required modules or workspace capabilities, and the response contract version.

The framework may list active providers, render the shared picker shell, pass the selected target type and search text to the provider, and render provider-supplied fields. The framework must not hard-code how Clients, Projects, Tasks, Notes, Lists, Users, or future modules sort records or construct display labels.

Providers own:

- Permission-safe target queries.
- Search filtering inside records the user may read.
- Sorting and deterministic tie-breaks.
- Safe display labels and secondary labels.
- Target source URLs.
- Primary Context hints such as client, project, and workspace ids.

## Provider Response

Provider records use the `linked-context-target.v1` response contract. Each returned target must include these normalized fields:

- `moduleId`
- `targetType`
- `targetId`
- `displayLabel`
- `secondaryLabel`
- `sortKey`
- `sourceUrl`
- `clientId`
- `projectId`
- `workspaceId`
- `isAvailable`
- Optional `primaryContextHints`

String fields may be empty only when the value is truly unavailable or not relevant, but `moduleId`, `targetType`, `targetId`, `displayLabel`, `sortKey`, and `workspaceId` must be non-empty. `isAvailable` must be a boolean.

## Label Safety

Provider labels must be safe for direct UI rendering. `displayLabel` and `secondaryLabel` must not be raw UUIDs, raw target ids, raw client ids, raw project ids, or raw workspace ids. If the provider cannot resolve a readable label, it must return a safe fallback such as `Unavailable client`, `Unavailable project`, `Unavailable task`, `Unavailable note`, `Unavailable list`, or `Unavailable linked context`.

IDs remain present in data fields so the selected record can be saved correctly, but normal app UI must render the safe labels instead of those IDs.

## Shared Picker Shell

`LongtailForge.view.createLinkedContextPicker(options)` is the framework-owned shell for the Target / Search / Record / `Use Target` picker pattern.

The shell renders:

- Target select.
- Search input.
- Record dropdown.
- `Use Target` action.
- Existing linked context rows.
- Remove actions for removable rows.
- Empty state text.
- Read-only or permission-disabled state text.

The shell owns anatomy, class names, accessible labels, field layout, row/action placement, empty-state placement, and disabled-control rendering. It exposes the created controls and update hooks through `element.viewParts` so consuming modules can bind provider queries, refresh provider/record options, refresh selected rows, and save behavior without rebuilding the shell.

The shell does not fetch provider data, sort records, infer workspace behavior, decide which providers are available, validate save payloads, call module APIs, or build module-specific labels. Record options and rows render provider-supplied `displayLabel` and optional `secondaryLabel` fields as separate UI text, with IDs retained only in data attributes and control values for module-owned save handlers.

Do not use the shell to construct labels such as `Project: Name - Client - Active`, `Client: Name - Client - Active`, or `Task: Name - Active`. If a module needs status, client, workspace, or other context in picker text, its provider must return a safe `displayLabel` or `secondaryLabel` that already represents the intended display.

## First Providers

The first provider descriptors cover Client, Project, Task, Note, List, and User targets. Client targets are business-workspace only. User targets are permission-gated and can be excluded by module-specific adoption rules if a workflow should not expose user links.

The Notes Add/Edit dialog consumes the shared picker shell as of 0.33.5.18.6.5.3. Normal Notes picker choices are Project, Task, Note, List, User, and Client only in Business/client-readable contexts. Workspace targets can remain supported by service and legacy routes, but Workspace is not a normal selectable Add/Edit Note target unless a later workflow explicitly reintroduces it.
