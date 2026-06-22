# Linked Context Picker Provider And Shell Contract

This document defines the shared Linked Context picker provider and shell contract as of 0.33.5.18.6.6.2. The framework owns the reusable picker shell. Source modules own provider data, permission-safe filtering, sorting, labels, summaries, and source URLs.

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
- Optional full-label affordances such as `title`, `fullLabel`, or `ariaLabel` when `displayLabel` is intentionally compact
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

## Client And Project Labels

The Clients/Projects provider owns Client and Project target option labels and sort keys.

Client targets keep the plain client name as compatibility `label`. Picker `displayLabel` and `sortKey` come from the Clients/Projects-owned hierarchy option payload: top-level clients sort alphabetically, child clients follow their parent alphabetically, and child options may use the Clients/Projects-owned indentation prefix. Client targets do not include `Client:`, `- Client`, status, UUIDs, or raw ids.

Project targets use the plain project name as compatibility `label` and a provider-owned `displayLabel` for picker UI:

- Business workspace, client project: `Project Name - Client Name`.
- Business workspace, workspace-level project: `Project Name - Workspace Name`.
- Personal and Family workspace project: `Project Name`.

Business Project targets sort workspace-level projects first, then by the workspace/client display name, then by project name. Personal and Family Project targets sort by project name. Project labels do not include `Project:`, status, UUIDs, or raw ids.

## Task Labels

The Tasks provider owns Task target option labels and sort keys.

Task targets keep the full task title as compatibility `label`. Picker `displayLabel` uses an approximately 20-character task-title prefix plus readable project context when applicable:

- Business workspace, task in a client project: `Task title... - Client Name | Project Name`.
- Business workspace, task in a workspace-level project: `Task title... - Workspace Name | Project Name`.
- Business workspace, task without a project: `Task title...`.
- Personal and Family workspace, task with a project: `Task title... - Project Name`.
- Personal and Family workspace, task without a project: `Task title...`.

Task picker labels do not include `Task:`, status, UUIDs, or raw ids. When a picker label is truncated, the provider should also return the full task title through `title`, `fullLabel`, or `ariaLabel` so the shared picker can expose it as a tooltip or accessible label.

Task targets sort by provider-defined usefulness first, with active readable tasks before completed or archived tasks. Within that rank, Business workspaces sort by client/workspace display name, then project name, then task title. Personal and Family workspaces sort by project name when present, then task title. Stable target-id tie-breaks keep the order deterministic.

## First Providers

The first provider descriptors cover Client, Project, Task, Note, List, and User targets. Client targets are business-workspace only. User targets are permission-gated and can be excluded by module-specific adoption rules if a workflow should not expose user links.

The Notes Add/Edit dialog consumes the shared picker shell as of 0.33.5.18.6.5.3. Normal Notes picker choices are Project, Task, Note, List, User, and Client only in Business/client-readable contexts. Workspace targets can remain supported by service and legacy routes, but Workspace is not a normal selectable Add/Edit Note target unless a later workflow explicitly reintroduces it.
