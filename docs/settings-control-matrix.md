# Settings Control Matrix

This matrix describes where settings controls belong after the 0.32.3.2 UI contract hardening pass.

| Surface | Source | Shows Module Status | Shows Module Sub-Settings | Saves Through |
| --- | --- | --- | --- | --- |
| Workspace Settings | `/api/settings` `moduleSettings` | yes | yes | `PUT /api/settings` |
| Module Settings pages | `/api/settings` selected module | selected module only | selected module only | `PUT /api/settings` |
| Create Workspace | `/api/user/settings` `workspaceCreation.availableTypes[].moduleSettings` | yes | no | `POST /api/workspaces` |

## Shared Renderer

All three surfaces use shared helpers under `public/js/shared/`.

| Helper | Purpose |
| --- | --- |
| `settingsNormalizers.normalizeModuleSettings` | Normalizes registry-shaped module settings for browser rendering. |
| `renderModuleSettingsGroups` | Renders grouped module setting controls. |
| `renderModuleSettingFields` | Renders controls for one module. |
| `readModuleSettingsPayload` | Reads enabled controls into the backend `moduleSettings` payload shape. |
| `status.set` / `status.clear` | Standardizes accessible settings status messages. |

`settings-controls.js` renders by metadata type and does not special-case first-party setting IDs. It supports `description`, `placeholder`, `options`, `min`, `max`, `step`, `required`, `inputmode`, `readOnly`, and read-only reason text.

## Backend Rules

- Workspace Settings accepts `moduleSettings` keyed by module ID and setting ID.
- Create Workspace accepts `moduleSettings` for initial `moduleStatus` controls only.
- `timeTrackingEnabled` is still accepted by Create Workspace as a deprecated compatibility fallback when `moduleSettings` is not submitted.
- Deprecated top-level module flags remain response-only compatibility fields for browser consumers that still read them.
- Read-only module status controls are not writable.
- Unknown module setting IDs are rejected.
- Module sub-settings without a server-side handler are rejected.
- Module settings navigation comes from registered module settings views instead of hard-coded first-party app-shell links.
