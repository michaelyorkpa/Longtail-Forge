# Settings Control Matrix

This matrix describes where settings controls belong after the 0.32.3.2 UI contract hardening pass.

The current ownership, storage, consumer, write-path, and target-storage inventory is maintained in `docs/settings-ownership.md`. This file owns the current browser/control routing; the ownership map governs the 0.33.15 migration decisions.

| Surface | Source | Shows Module Status | Shows Module Sub-Settings | Saves Through |
| --- | --- | --- | --- | --- |
| Workspace Settings | `/api/settings/catalog` `attachments.workspace` plus `/api/settings` framework values | yes | workspace placement only | `PUT /api/settings` |
| Module Settings pages | `/api/settings/catalog` `attachments.module[moduleId]` | no | selected module placement only | `PUT /api/settings` |
| Calendar Settings | Framework-owned immediate lifecycle manager plus `/api/client-projects?view=options` | Tasks availability only | no | `/api/private-feeds/calendar-subscriptions` collection/item routes |
| User Settings | `/api/settings/catalog` `attachments.user` plus `/api/user/settings` | no | user placement only | Owning user/settings route |
| Create Workspace | `/api/user/settings` prospective-workspace module lifecycle values; standardized `new-workspace` attachment | yes | new-workspace placement only | `POST /api/workspaces` |

## Shared Renderer

All four attachment surfaces use the framework view primitives plus shared Settings host/renderer adapters under `public/js/shared/`.

`GET /api/settings/catalog` groups permission/capability/enabled-filtered contributed sections under the four fixed attachment points. `LongtailForge.settingsHost` builds the current protected Settings pages from one minimal mount and exposes standardized `data-settings-attachment` regions; `LongtailForge.settingsRenderer` renders the returned sections. Disabled modules do not contribute ordinary settings, but their module lifecycle control remains in Workspace Settings so an administrator can re-enable them.

Module Settings views that own lifecycle recovery set `allowDisabledRead: true`. When their module is disabled, the normal Settings header, universal actions, and status anatomy still render; the module attachment is replaced by an in-context disabled message and an `Open Workspace Settings` recovery link. A successful Workspace Settings module-lifecycle save refreshes the app-shell bootstrap immediately, so Admin navigation and Quick Action Capture match the new module state without a page reload while Workspace Settings remains reachable.

| Helper | Purpose |
| --- | --- |
| `LongtailForge.settingsRenderer.normalizeContributions` | Normalizes registry-shaped module settings for browser rendering. |
| `LongtailForge.view.createField` / `createFieldGrid` | Renders labelled, editable, value-bound setting controls and their help/error channel from normalized metadata. |
| `LongtailForge.view.collectFieldValues` | Reads one grid's live typed values while omitting disabled controls. |
| `LongtailForge.settingsRenderer.renderSections` / `renderSection` / `renderGroupedSections` | Renders titled settings fieldsets and field grids; the grouped form keeps several module sections inside one framework-owned box without changing their payload namespaces. Sections never own save actions. |
| `LongtailForge.settingsRenderer.renderDisabledModuleRecovery` | Replaces an unavailable module attachment with the shared disabled-state panel and Workspace Settings recovery link. |
| `LongtailForge.settingsRenderer.collectPayload` | Groups generic grid values into the existing backend `moduleSettings[moduleId]` payload shape. |
| `LongtailForge.settingsRenderer.validate` / `showValidationErrors` | Routes native and API validation messages through each framework field's message channel. |
| `LongtailForge.settingsHost.mount` / `attachmentSections` | Builds framework Settings anatomy and selects catalog sections for one declared attachment point. |
| `LongtailForge.settingsPageController.create` | Owns the two page-level Save/Revert pairs, dirty snapshots, disabled/flash states, and the in-app unsaved-navigation dialog across protected Settings pages. |
| `status.set` / `status.clear` | Standardizes accessible settings status messages. |

`settings-renderer.js` maps normalized settings metadata into framework field, field-grid, and info-panel primitives without special-casing first-party setting IDs. It supports text, textarea, number, boolean/toggle, select/radio/multi-select, and info fields plus `description`, `placeholder`, `options`, `min`, `max`, `step`, `rows`, `spellcheck`, `required`, `inputmode`, `readOnly`, read-only reason text, and descriptor-driven `visibleWhen`. A hidden dependent field is disabled and omitted from collection until its same-section controller matches the declared value. The Settings pages load `view-builder.js` before `settings-renderer.js`; descriptions, read-only reasons, native validation, and API field errors use the shared per-field message channel.

Each protected Settings surface renders one Revert/Save pair beside the page heading and one at the bottom right below the content. Save dispatches the page's existing owner routes for every pending setting, while Revert restores the captured stored values. Dropdown/radio/checkbox changes flash Save immediately; typed fields flash after focus leaves the field. Empty status messages stay hidden. Password, workspace creation/departure, account lifecycle, API-key, session, and similar immediate-action forms carry the action-form boundary and are not captured, submitted, or reset by the Settings transaction.

The authenticated Settings drawer exposes `Admin`, then `User` and `Help`. `Admin` orders Modules, Projects, Clients, User Admin, Workspace, API Keys, and Audit Log. Its Modules drawer starts with the fixed framework-owned Calendar destination, then Files, Tags, Tasks, and Time Tracking, with Developer Example appended only while that optional module is explicitly enabled. Calendar remains available to users with `workspace_settings.manage` when Tasks is disabled so safe metadata and revocation remain reachable; it is not a disableable module or a second calendar data model. Workspace Settings keeps Clients & Projects directly below the Workspace identity box, then places all optional-module sections in one alphabetized Modules box; Developer Example is always the last section. Files Settings loads the shared status helper before its owner adapter, and enabled Developer Example settings use the same minimal module host, catalog, conditional-info rendering, and page transaction as other module Settings pages.

Workspace Settings displays Workspace Type as a disabled creation-time identity field. Direct settings requests cannot change it, and only a Workspace Administrator or Super Admin may rename the workspace. The existing Workspace Users dialog keeps its behavior and opens from the person-icon `Users` action in the page header beside the top Revert/Save pair.

Workspace Backup is an immediate, server-owned Workspace Settings action outside the page transaction. `POST /api/settings/workspace-backups` requires a Workspace Administrator for the active workspace or a Super Admin, creates and validates one protected package, and returns only its safe receipt/checksum summary. `GET /api/settings/workspace-backups/latest` applies the same authorization. Neither route exposes an archive path or download capability; the operator inspect/restore commands own protected-host recovery.

Delete Workspace is a separate immediate framework action outside the page transaction and outside User Settings -> Leave Workspace. Workspace Settings reads the safe lifecycle state, requires an exact workspace-name confirmation plus a successful backup from the previous 24 hours or the exact no-current-backup acknowledgement, and offers cancellation before the 30-day deadline. The app-shell notice repeats the pending state and deadline across protected pages. Request/cancel routes recheck active-workspace administrator authority server-side and do not change normal Settings dirty state, membership, sessions, navigation, module/job behavior, Files, Search, notifications, or data. Expiry remains inert until a protected-host operator queues `workspace.purge`; no Settings or browser route owns irreversible cleanup.

User Settings keeps Appearance and Profile together in its first column and places User App Preferences in the second column. Its Initial login page and After changing workspaces dropdowns offer Dashboard, Workbench, Actions: Tasks, Actions: Notes, and Actions: Lists through the existing universal User Settings save. Notification Preferences, Leave Workspace, Delete Account, and the final Workspace Creation disclosure span the full settings grid. Calendar subscriptions are not rendered or managed in User Settings. Notification Grouping is the first notification control. Workspace Creation starts collapsed and is an immediate-action form; Leave Workspace is a separate immediate-action section whose visible warning is repeated in its in-app confirmation. The warning states that only membership is removed, workspace data is not deleted, and a Workspace Administrator or Super Admin must restore access. A Workspace Administrator, workspace owner, or installation Super Admin may leave their final active workspace after owner-transfer checks; every ordinary session is revoked and the next successful sign-in opens only the portable account-export recovery surface. Other roles must keep an active workspace. Delete Account is also isolated from the page Settings transaction, never grants export recovery, and requires an explicit destructive confirmation that credentials and all workspace access are retired while email, display name, contributions, and attribution remain in history. The profile timezone selector is populated from the browser's complete supported IANA timezone catalog and labels every choice with its current `UTC +/-HH:MM` offset.

Calendar Settings uses shared Settings page anatomy without the universal Save/Revert transaction. Its named create action begins at Workspace scope and can narrow to one readable Client or Project from the canonical server options; choosing a Client constrains the Project choices. Each successful create or owner rotation reveals one masked, copyable bearer URL only in current-page memory. The API-key-style list exposes safe workspace metadata, including the owner's effective profile timezone, and permission-checked per-row actions: owners may rotate their active rows, and workspace administrators may revoke any active row without recovering another owner's secret. The feed publishes both standard and compatibility name metadata plus an owner-timezone compatibility hint; the page explains that clients may retain a local name override and that Google reports subscribed-calendar timezone as read-only. Disabling Tasks prevents create and rotate while preserving listing and revocation.

## Backend Rules

- Workspace Settings accepts `moduleSettings` keyed by module ID and setting ID.
- Workspace type is immutable after creation; the Settings service and repository both reject a changed type, and ordinary settings persistence never updates `workspaces.workspace_type`.
- A workspace name change requires a Workspace Administrator or Super Admin at the service boundary.
- Create Workspace accepts `moduleSettings` for initial `moduleStatus` controls only.
- `timeTrackingEnabled` is still accepted by Create Workspace as a deprecated compatibility fallback when `moduleSettings` is not submitted.
- `/api/settings` and app-shell workspace context do not emit deprecated top-level module flags; consumers read module state from `enabledModules`, `modules`, and `moduleSettings`.
- Read-only module status controls are not writable.
- Unknown module setting IDs are rejected.
- Ordinary writable module sub-settings persist through the generic `(workspace, module, setting)` JSON store and are read through `settingsService.getValue(...)`; they do not need a `workspace_settings` column, normalizer branch, or handler.
- Persistence handlers and on-change effects are separate opt-in registries keyed by `<moduleId>.<settingId>`. A retained-table setting still uses the same descriptor validation and accessor contract; its owning adapter may save through a specialized route when atomic domain behavior or a narrower permission is required, as Files does through `/api/files/settings`.
- Module settings navigation comes from registered module settings views instead of hard-coded first-party app-shell links.
- A new ordinary module setting requires a manifest contribution plus optional owner-registered handler/effect only when behavior demands it. It must not require a new `settings.service.js`, `settings-catalog.service.js`, `settings-host.js`, `settings-renderer.js`, `workspace_settings`, or browser-normalizer branch.
