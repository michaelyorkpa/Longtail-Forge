# Settings Control Matrix

This matrix describes where settings controls belong after the 0.32.3.2 UI contract hardening pass.

The current ownership, storage, consumer, write-path, and target-storage inventory is maintained in `docs/settings-ownership.md`. This file owns the current browser/control routing; the ownership map governs the 0.33.15 migration decisions.

| Surface | Source | Shows Module Status | Shows Module Sub-Settings | Saves Through |
| --- | --- | --- | --- | --- |
| Workspace Settings | `/api/settings/catalog` `attachments.workspace` plus `/api/settings` framework values | yes | workspace placement only | `PUT /api/settings` |
| Module Settings pages | `/api/settings/catalog` `attachments.module[moduleId]` | no | selected module placement only | `PUT /api/settings` |
| User Settings | `/api/settings/catalog` `attachments.user` plus `/api/user/settings` | no | user placement only | Owning user/settings route |
| Create Workspace | `/api/user/settings` prospective-workspace module lifecycle values; standardized `new-workspace` attachment | yes | new-workspace placement only | `POST /api/workspaces` |

## Shared Renderer

All four attachment surfaces use the framework view primitives plus shared Settings host/renderer adapters under `public/js/shared/`.

`GET /api/settings/catalog` groups permission/capability/enabled-filtered contributed sections under the four fixed attachment points. `LongtailForge.settingsHost` builds the current protected Settings pages from one minimal mount and exposes standardized `data-settings-attachment` regions; `LongtailForge.settingsRenderer` renders the returned sections. Disabled modules do not contribute ordinary settings, but their module lifecycle control remains in Workspace Settings so an administrator can re-enable them.

| Helper | Purpose |
| --- | --- |
| `LongtailForge.settingsRenderer.normalizeContributions` | Normalizes registry-shaped module settings for browser rendering. |
| `LongtailForge.view.createField` / `createFieldGrid` | Renders labelled, editable, value-bound setting controls and their help/error channel from normalized metadata. |
| `LongtailForge.view.collectFieldValues` | Reads one grid's live typed values while omitting disabled controls. |
| `LongtailForge.settingsRenderer.renderSections` / `renderSection` | Renders titled settings fieldsets, field grids, and section save actions through framework view primitives. |
| `LongtailForge.settingsRenderer.collectPayload` | Groups generic grid values into the existing backend `moduleSettings[moduleId]` payload shape. |
| `LongtailForge.settingsRenderer.validate` / `showValidationErrors` | Routes native and API validation messages through each framework field's message channel. |
| `LongtailForge.settingsHost.mount` / `attachmentSections` | Builds framework Settings anatomy and selects catalog sections for one declared attachment point. |
| `status.set` / `status.clear` | Standardizes accessible settings status messages. |

`settings-renderer.js` maps normalized settings metadata into framework field, field-grid, info-panel, and action primitives without special-casing first-party setting IDs. It supports text, textarea, number, boolean/toggle, select/radio/multi-select, and info fields plus `description`, `placeholder`, `options`, `min`, `max`, `step`, `rows`, `spellcheck`, `required`, `inputmode`, `readOnly`, read-only reason text, and descriptor-driven `visibleWhen`. A hidden dependent field is disabled and omitted from collection until its same-section controller matches the declared value. The Settings pages load `view-builder.js` before `settings-renderer.js`; descriptions, read-only reasons, native validation, and API field errors use the shared per-field message channel.

## Backend Rules

- Workspace Settings accepts `moduleSettings` keyed by module ID and setting ID.
- Create Workspace accepts `moduleSettings` for initial `moduleStatus` controls only.
- `timeTrackingEnabled` is still accepted by Create Workspace as a deprecated compatibility fallback when `moduleSettings` is not submitted.
- `/api/settings` and app-shell workspace context do not emit deprecated top-level module flags; consumers read module state from `enabledModules`, `modules`, and `moduleSettings`.
- Read-only module status controls are not writable.
- Unknown module setting IDs are rejected.
- Ordinary writable module sub-settings persist through the generic `(workspace, module, setting)` JSON store and are read through `settingsService.getValue(...)`; they do not need a `workspace_settings` column, normalizer branch, or handler.
- Persistence handlers and on-change effects are separate opt-in registries keyed by `<moduleId>.<settingId>`. A retained-table setting still uses the same descriptor validation and accessor contract; its owning adapter may save through a specialized route when atomic domain behavior or a narrower permission is required, as Files does through `/api/files/settings`.
- Module settings navigation comes from registered module settings views instead of hard-coded first-party app-shell links.
- A new ordinary module setting requires a manifest contribution plus optional owner-registered handler/effect only when behavior demands it. It must not require a new `settings.service.js`, `settings-catalog.service.js`, `settings-host.js`, `settings-renderer.js`, `workspace_settings`, or browser-normalizer branch.
