# UI Layout Guide

Longtail Forge UI should stay quiet, scannable, and operational. Pages should favor clear controls, stable spacing, and predictable state over decorative layouts.

## Page Structure

- Use the actual work surface as the first screen.
- Keep settings, admin, reporting, and workflow pages dense but readable.
- Avoid nesting cards inside cards.
- Use fieldsets for related form controls.
- Keep headings proportional to the panel or page they belong to.

## Controls

- Use native form controls when they fit: checkboxes for binary settings, selects for option sets, inputs for text and numbers, and buttons for commands.
- Use shared renderers for registry-driven controls instead of hand-building duplicate UI in each page script.
- Disabled required controls should remain visible and clearly locked.
- Labels should describe the setting itself, not implementation details.

## Current Modal Conventions

- Keep compact workflow modals scannable: title and summary context near the top, related fields grouped together, and low-frequency details collapsed when they are empty.
- Put save, cancel, copy/share, tags, files, and notification actions in the modal heading or footer where the current workflow expects them. Preserve accessible labels and titles on icon-only controls.
- Use adaptive visible text in modal footers: dense task-style footers may keep recognizable icon-only controls, while wider, destructive, unusual, or ambiguous actions should show icon plus short visible text where space allows.
- Keep module-owned pickers module-owned. For example, Tasks may open Tags and Files from footer controls, but Tags and Files keep their assignment and attachment contracts.
- Use the shared overlay host for small module-owned picker panels opened from modal footer or row actions; the overlay host owns placement, close behavior, focus handling, Escape, click-away, responsive sizing, and one-open-overlay behavior.
- Do not create a second notification settings block inside a modal when the heading bell already owns follow/unfollow behavior.
- Use the 0.33.5.13 shared surface vocabulary in `docs/ui-surface-contract.md` for new or converted framework-owned main-screen panels, modal groups, modal section headings/bodies/help text/validation, overlay panels, drawers, slideouts, dividers, chips, dense action clusters, and disabled/focus states.
- Use `.surface-main-panel` for filters, bulk toolbars, settings groups, notification/timer panels, and contextual main-screen work surfaces.
- Use `.surface-drawer` for narrow side panels and `.surface-slideout` for wider contextual detail views; both become full-screen overlays on narrow screens.
- Use `.surface-dense-actions` for row/table/list action clusters. Do not reuse modal footer classes for record-local actions.
- Use top-only dividers on the section or option being toggled instead of adding mixed internal divider rules inside each module.
- Treat later 0.33.5.13 adoption slices as the place to broaden the shared overlay host beyond the first Tasks Tags/Files proof target.

## Module Settings

Module status controls come from module manifests. A setting with `moduleStatus: true` controls the corresponding `workspace_modules` row through the backend registry service.

Workspace Settings and Create Workspace should use the same module availability rules:

- Workspace Settings can show module status controls plus module-specific sub-settings.
- Create Workspace should show initial module status controls only.
- Required modules should appear locked rather than disappearing.
- Module-specific pages should render only the selected module's settings.

## Frontend Implementation

Plain browser JavaScript remains the default. Shared UI helpers should live under `public/js/shared/` and attach APIs to `window.LongtailForge`.

`public/js/shared/settings-controls.js` owns the shared module settings renderer and payload reader for Workspace Settings, module-specific settings pages, and Create Workspace.

`public/js/shared/settings-normalizers.js` owns browser normalization for registry-shaped module setting payloads. `public/js/shared/status.js` owns accessible status message updates for settings pages.

Shared settings helpers should render from metadata such as type, options, required state, numeric bounds, input mode, read-only state, and reason text. They should not know about first-party setting IDs.
