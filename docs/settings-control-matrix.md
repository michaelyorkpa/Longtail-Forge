# Settings Control Matrix

This matrix describes where settings controls belong after the 0.32.3.1 UI foundation cleanup.

| Surface | Source | Shows Module Status | Shows Module Sub-Settings | Saves Through |
| --- | --- | --- | --- | --- |
| Workspace Settings | `/api/settings` `moduleSettings` | yes | yes | `PUT /api/settings` |
| Module Settings pages | `/api/settings` selected module | selected module only | selected module only | `PUT /api/settings` |
| Create Workspace | `/api/user/settings` `workspaceCreation.availableTypes[].moduleSettings` | yes | no | `POST /api/workspaces` |

## Shared Renderer

All three surfaces use `window.LongtailForge.settingsControls` from `public/js/shared/settings-controls.js`.

| Helper | Purpose |
| --- | --- |
| `normalizeModuleSettings` | Normalizes registry-shaped module settings for browser rendering. |
| `renderModuleSettingsGroups` | Renders grouped module setting controls. |
| `renderModuleSettingFields` | Renders controls for one module. |
| `readModuleSettingsPayload` | Reads enabled controls into the backend `moduleSettings` payload shape. |

## Backend Rules

- Workspace Settings accepts `moduleSettings` keyed by module ID and setting ID.
- Create Workspace accepts `moduleSettings` for initial `moduleStatus` controls only.
- `timeTrackingEnabled` is still accepted by Create Workspace as a deprecated compatibility fallback when `moduleSettings` is not submitted.
- Read-only module status controls are not writable.
- Unknown module setting IDs are rejected.
- Module sub-settings without a server-side handler are rejected.
