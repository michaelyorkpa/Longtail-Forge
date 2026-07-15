# UI Layout Guide

Longtail Forge UI should stay quiet, scannable, and operational. Pages should favor clear controls, stable spacing, and predictable state over decorative layouts.

## Page Structure

- Use the actual work surface as the first screen.
- Keep settings, admin, reporting, and workflow pages dense but readable.
- Avoid nesting cards inside cards.
- Use fieldsets for related form controls.
- Keep headings proportional to the panel or page they belong to.

## Responsive Breakpoints and Mobile Foundation

The framework CSS (`public/css/longtail-forge.css`) owns the shared responsive foundation. Its "Responsive foundation" section is the single source of responsive truth; surfaces consume it instead of inventing per-page breakpoints.

- Canonical breakpoints: mobile is `max-width: 700px` (the app shell collapses primary navigation there), tablet is `max-width: 1024px`, desktop is everything wider. CSS media queries cannot read custom properties, so `@media` rules must use these exact values; the matching tokens (`--breakpoint-mobile`, `--breakpoint-tablet`) exist for `calc()`/JavaScript consumption.
- Every view declares `<meta name="viewport" content="width=device-width, initial-scale=1">`.
- Utility classes: `.u-hide-mobile` hides an element at or below the mobile breakpoint; `.u-mobile-only` shows it only there.
- At the mobile breakpoint the shell sets base body type to 16px with 1.5 line-height and enforces the shared tap-target floor (`--tap-target-min`, 44px) on buttons, selects, textareas, and text-style inputs.
- Embedded media (`img`, `svg`, `video`, `canvas`) is constrained to `max-width: 100%` so nothing forces horizontal scroll; a surface that genuinely needs a wider canvas opts in with a `min-width` inside its own `overflow-x: auto` container. Do not add horizontal-scrolling data tables; wrap/stack or use contained overflow.
- Long user-supplied labels (task/note/list titles, client/project names) must wrap or truncate safely at every width, including unbroken strings: give the label element `min-width: 0` plus `overflow-wrap: anywhere` (the Dashboard task rows do this), or an explicit ellipsis. At the mobile breakpoint, dense list tables switch nowrap/ellipsis labels to wrapping and let row action strips wrap (the Tasks density table uses `table-layout: fixed` there) so every control stays visible without sideways table scrolling.
- Below the mobile breakpoint the framework shell renders primary navigation as a fixed left-side drawer owned by `public/js/navigation.js`: the `.nav-toggle` control opens `#primary-menu` (`.nav-links.is-open`) above a `.nav-drawer-overlay` click-away backdrop, body scroll locks while open (`body.nav-drawer-open`), focus moves into the drawer on open, Escape/overlay/toggle all close it, and closing returns focus to the toggle, which stays visible above the overlay. Desktop navigation above the breakpoint is unchanged, and modules must not restyle or repurpose the drawer anatomy.
- The `views.mobile-foundation` regression pins the viewport meta, the tokens, and a frozen allowlist of pre-existing legacy media-query values; new `@media` rules outside the canonical breakpoints fail it. The rendered mobile smoke (`npm run test:e2e`) is the overflow/console gate at the mobile viewport.

## Controls

- Use native form controls when they fit: checkboxes for binary settings, selects for option sets, inputs for text and numbers, and buttons for commands.
- Use shared renderers for registry-driven controls instead of hand-building duplicate UI in each page script.
- Disabled required controls should remain visible and clearly locked.
- Labels should describe the setting itself, not implementation details.

## Current Modal Conventions

- Session-expiry warnings are authenticated-app-shell behavior, not module status copy. A same-origin protected API `401` opens one blocking framework `alertdialog` in the native dialog top layer, including when a module editor is already open; concurrent failures reuse that warning, the editor remains in place beneath it, and the focused `Sign in` action returns the user to login. Do not hide this condition in the console or a page status region, and do not label ordinary `403` permission failures as expired sessions.
- Keep compact workflow modals scannable: title and summary context near the top, related fields grouped together, and low-frequency details collapsed when they are empty.
- Put save, cancel, copy/share, tags, files, and notification actions in the modal heading or footer where the current workflow expects them. Preserve accessible labels and titles on icon-only controls.
- Use adaptive visible text in modal footers: dense task-style footers may keep recognizable icon-only controls, while wider, destructive, unusual, or ambiguous actions should show icon plus short visible text where space allows.
- Keep module-owned pickers module-owned. For example, Tasks may open Tags and Files from footer controls, but Tags and Files keep their assignment and attachment contracts.
- Use the shared overlay host for small module-owned picker panels opened from modal footer or row actions; the overlay host owns placement, close behavior, focus handling, Escape, click-away, responsive sizing, and one-open-overlay behavior.
- Do not create a second notification settings block inside a modal when the heading bell already owns follow/unfollow behavior.
- Use the 0.33.5.13 shared surface vocabulary in `docs/ui-surface-contract.md` for new or converted framework-owned main-screen panels, modal groups, modal section headings/bodies/help text/validation, overlay panels, drawers, slideouts, dividers, chips, dense action clusters, and disabled/focus states.
- Use `LongtailForge.view` for converted framework-owned view anatomy such as page headers, status messages, filters, collapsible indexes, split list/detail workspaces, data tables, detail headers, modal shells/forms/footers, field grids, and inline action rows. Keep module-specific fields, payloads, routes, validation, permissions, and labels in the module.
- Disclosure `<summary>` toggles must keep their native disclosure marker (the caret). Do not set `display: flex` or `display: grid` on a plain disclosure summary — that replaces the default `display: list-item` and flexes the caret away, so users cannot tell the section is collapsible. Style summaries with `cursor`, `font-weight`, etc. instead, as the framework collapsible panels (`.view-collapsible-index-summary`, `.view-info-panel-title`) and the Lists/Notes detail sections do. If a summary genuinely needs a flex/grid layout, add an explicit replacement marker (e.g. a `::after` caret, as the navigation menu does).
- Use `.surface-main-panel` for filters, bulk toolbars, settings groups, notification/timer panels, and contextual main-screen work surfaces.
- In converted Notifications surfaces, use `.surface-main-panel` for list/preference boxes, `.surface-card` for full page notification rows, and `.surface-dense-actions` for row-local notification actions.
- In converted task timer surfaces, keep visible timer action text and use shared surfaces for the timer group, timer chip, and compact action placement.
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

`public/js/shared/settings-renderer.js` is the one shared module settings adapter for Workspace Settings, module-specific settings pages, and Create Workspace. It normalizes contributions, builds titled fieldset sections and save actions through `LongtailForge.view`, collects typed values into the nested backend payload, applies descriptor-driven dependent visibility, and routes native/API validation through each field's message channel. The Settings pages load `view-builder.js` first; the former `settings-controls.js` and `settings-normalizers.js` paths are retired. `public/js/shared/status.js` continues to own page-level accessible status updates.

`public/js/shared/settings-host.js` owns the framework page/anatomy layer. Workspace, User, Tasks, Time Tracking, and Files Settings HTML each contain one `data-settings-host` mount; the host builds their framework fields, sections, action rows, statuses, operational readouts, and dialogs through view primitives, then exposes `data-settings-attachment="workspace|user|module|new-workspace"` targets. Page adapters read eligible contributed sections from `/api/settings/catalog` and never use the retired implicit module-settings anchors.

Shared settings helpers should render from metadata such as type, options, required state, numeric bounds, input mode, read-only state, and reason text. They should not know about first-party setting IDs.
