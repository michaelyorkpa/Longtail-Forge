# UI Surface Contract

This document captures the 0.33.5.13.7 framework surface inventory, token contract, modal section contract, modal footer/action contract, overlay host contract, drawer/slideout shell contract, main-screen internal surface contract, first adoption pass, the 0.33.5.18.6.11 action-surface slide-out closeout, the 0.33.5.18.10.8.1 converted modal action ownership standard, the 0.33.5.18.10.8.2 Task Tags/Files child-dialog parity pass, the 0.33.5.18.10.8.3 Notes/Tasks footer visual parity pass, the 0.33.5.18.10.8.4 Notes notification follow-bell pass, the 0.33.5.18.10.8.5 modal standardization closeout, and the 0.33.5.18.15 view-conversion branch closeout. It is the closeout reference for shipped shared surface behavior, not a promise that every listed surface has already been converted.

## Surface Inventory

- Page surfaces: protected workflow pages such as Dashboard, Workbench, Tasks, Lists, Notes, Files, Search, Notifications, Clients, Projects, Reporting, and Settings use the shared shell and should read page background from `--color-page-bg`.
- Main-screen internal surfaces: filters, toolbars, settings groups, notification panels, timer panels, list detail panels, linked-note panels, search results, and table/list wrappers should use framework surface tokens rather than one-off colors.
- Modals: native `dialog` elements, app confirm/alert dialogs, add/edit task dialogs, recurrence dialogs, client/project dialogs, user/role dialogs, and future module dialogs should share modal body, internal group, divider, focus, and footer patterns.
- Drawers and slideouts: reporting submenus, future quick editors, contextual detail views, and narrow-screen side panels should use the shared drawer or slideout shell when implemented.
- Overlay-like panels: shell notifications, search suggestions, modal footer pickers, tag pickers, file attachment panels, and future small module-owned pickers should use overlay panel tokens while leaving picker content and save behavior module-owned.
- Footer/action bars: modal footers, bulk-action toolbars, dense row actions, and utility action strips should use shared placement and accessible-label rules, with adaptive text labels handled by the later footer contract slice.

## Token Meanings

- `--color-page-bg`: app page background behind work surfaces.
- `--color-surface`: standard flat panel, card, and dialog body background.
- `--color-surface-raised`: modal groups, drawers, and prominent grouped controls.
- `--color-surface-muted`: chips, low-emphasis grouped controls, and quiet secondary fills.
- `--color-surface-inset`: nested input-adjacent or recessed surfaces.
- `--color-surface-overlay`: popovers, bottom sheets, notification flyouts, and other temporary panels.
- `--color-border`, `--color-border-subtle`, and `--color-border-strong`: normal, quiet, and emphasized surface boundaries.
- `--shadow-card`, `--shadow-modal`, and `--shadow-control`: overlay/card elevation, modal/drawer elevation, and small control elevation.
- `--surface-radius-sm` and `--surface-radius-md`: shared control and surface radii. Cards remain 8px or less unless a specific control such as a chip requires a pill.
- `--surface-focus-ring`: visible keyboard focus ring for framework-owned surface containers.

## Compatibility Aliases

The existing aliases `--color-background`, `--color-page`, and `--color-surface-alt` are defined in the root theme as compatibility names. New or converted framework-owned surfaces should prefer the explicit names above. Later cleanup may retire aliases after converted areas no longer reference them.

## Shared Classes

- `.surface-page`: page background alignment.
- `.surface-card`: repeated item or genuinely framed tool surface.
- `.surface-main-panel`: main-screen internal panel for filters, bulk toolbars, settings groups, notification/timer panels, and contextual work surfaces.
- `.surface-main-panel--sticky`: sticky or persistent main-screen control panel using shared control elevation.
- `.surface-modal-group`: modal internal group surface for titled or collapsible sections, including shared box padding and section gap.
- `.surface-modal-heading`: shared modal title row for the modal title and one adjacent secondary control such as Close or Follow/Unfollow.
- `.surface-modal-section-heading`: shared internal heading style for modal `summary` headings and non-collapsible section headings.
- `.surface-modal-section-body`: shared body wrapper for grouped modal section controls.
- `.surface-modal-section-help`: shared low-emphasis helper/status text inside modal sections.
- `.surface-modal-section-validation`: shared inline validation text inside modal sections.
- `.surface-overlay-host`: positioning and lifecycle host for one active overlay at a time.
- `.surface-overlay-panel`: temporary popover, bottom sheet, or picker host surface.
- `.surface-overlay-panel--bottom-sheet`: mobile full-width bottom-sheet presentation for overlay panels.
- `.surface-drawer` and `.surface-slideout`: contextual side surfaces for future side panels, quick editors, and detail views.
- `.surface-drawer-header`, `.surface-drawer-body`, and `.surface-drawer-footer`: shared drawer shell anatomy.
- `.surface-slideout-header`, `.surface-slideout-body`, and `.surface-slideout-footer`: shared slideout shell anatomy.
- `.surface-dense-actions`: compact row/table/list action placement separate from modal footer placement.
- `.surface-divider-top`: divider placed at the top of a section or option being toggled.
- `.surface-chip`: compact metadata or state chip.
- `.surface-chip-row`: wrapping row for compact metadata chips.
- `.surface-modal-footer`: shared modal footer shell.
- `.surface-modal-footer-group`: grouped footer actions.
- `.surface-modal-footer-utilities`: utility footer action group for compact helpers such as Tags, Files, Copy Link, and Follow/Unfollow.
- `.surface-modal-footer-commit`: commit footer action group for secondary, primary, destructive, and unusual record actions.
- `.surface-modal-footer-action`: footer action control with a `data-surface-action-role` of `primary`, `secondary`, `destructive`, or `utility`.
- `.surface-disabled`: disabled surface state.
- `.surface-focus-ring`: opt-in focus ring for custom focusable containers.

## Adaptive Footer Labels

As of 0.33.5.18.10.8.1, converted add/edit modals should use one shared action model. The framework owns footer placement,
utility and commit grouping, sticky footer behavior, shared action button anatomy, accessible defaults,
and focus return. Modules own which actions appear, record-specific labels/icons, availability, API
calls, save payloads, validation, permissions, record URLs, notification event meaning, and picker or
upload bodies.

Footer utility actions such as Tags, Files, and Copy Link should use an icon plus short visible text on
converted add/edit modals unless a deliberately dense surface opts into icon-only controls with clear
accessible labels, hover titles, native button types, and regression coverage. Footer commit actions
should follow the compact Tasks pattern for Cancel and Save: recognizable icon buttons with accessible
labels, titles, native button types, and consistent secondary/primary roles.

Footer utilities that open substantial picker or upload content, including Tags and Files, should open
stacked child dialogs instead of expanding inline inside the parent modal body. The framework owns the
child dialog shell, modal stack behavior, Escape/backdrop handling, parent-close cleanup, and focus
return. The owning module still owns record-specific placement, target identifiers, save-first states,
visibility rules, refresh behavior, and the Tags/Files helper mounting.

As of 0.33.5.18.10.8.2, both Notes and Tasks use stacked child dialogs for converted Add/Edit modal
Tags and Files utilities instead of inline parent-body panels.

As of 0.33.5.18.10.8.3, Notes and Tasks converted add/edit modal footer utilities use icon plus
short visible text for Tags, Files, and Copy Link where present. Cancel and Save remain compact
commit controls with icons, accessible labels, titles, native button types, and primary/secondary
roles.

The modal heading action slot should hold one contextual record-level utility such as a Follow
Notifications bell. It should not carry a duplicate Close button when the footer already provides
Cancel or Close behavior. A module should not show a follow bell as a cosmetic control until that module
can produce meaningful notifications through the framework notification system.

As of 0.33.5.18.10.8.4, Notes satisfies that requirement for saved non-secure notes: the editor
heading uses a Follow Notifications bell backed by the framework subscription helper, the duplicate top
Close button is removed, and footer Cancel remains the normal dismissal action. The framework owns the
subscription APIs, target access rechecks, delivery, preferences, and target decoration; Notes owns
which note events notify followers and when secure-note events suppress delivery.

As of 0.33.5.18.10.8.5, this is the finalized converted modal action standard for the next module
conversions. New converted add/edit modals should reuse the same heading action slot, footer utility
group, footer commit group, `.surface-modal-footer-action` buttons, and stacked child-dialog pattern
instead of introducing module-specific heading or footer anatomy. Strict converted-surface guardrails
should fail when a converted module rebuilds modal footer groups, renders substantial footer utilities
inside the parent modal body, restores a duplicate top Close button where footer Cancel exists, or shows
a Follow Notifications bell for records that cannot emit meaningful notifications.

## Overlay Host

Use `LongtailForge.overlayHost.create({ host })` for small module-owned panels opened from modal footer or row actions. The framework host owns placement, close behavior, focus handling, Escape, click-away, responsive sizing, mobile bottom-sheet presentation, trigger `aria-expanded`, panel dialog semantics, and ensuring only one overlay is open per host. Modules own the panel body, picker/upload content, save payloads, validation, permissions, and record meaning.

Use `LongtailForge.view.showModal()` and `LongtailForge.view.closeModal()` for converted modal surfaces that may open secondary dialogs above a parent editor. The framework owns parent/child dialog stack tracking, top-dialog Escape/backdrop guardrails, focus return, and safe child closure when the parent closes. Modules still own the secondary dialog content and save behavior.

## Drawers and Slideouts

Use `.surface-drawer` for narrower side panels such as future navigation drawers, filter drawers, or quick-edit side panels. Use `.surface-slideout` for wider contextual detail views that need more room for fields, linked context, or review content. Both shells use header, body, and footer anatomy so close controls, titles, scrollable content, and actions stay predictable. The framework owns shell spacing, elevation, focus styling, and responsive placement. Modules own the panel content, validation, record actions, and save behavior.

On narrow screens, drawers and slideouts become full-screen overlays instead of squeezed side panels. They should keep the user in the current workflow and return focus to the triggering control when paired with a framework open/close helper.

Descriptor-backed action/workflow surfaces that need controls beside a primary record view should prefer `layout: "slide-out-sidebar"` instead of a persistent split. The framework-owned `.view-slideout-sidebar` shell uses a fixed off-canvas drawer, backdrop, screen-left funnel/filter trigger, footer-visible offset, and scroll lock. The trigger stays near the lower-left viewport edge and lifts above the visible footer without overlapping it. The main/detail panel stays central, full-width within the page container, and top-anchored; opening the drawer must not squeeze or re-center the selected-record view.

`slide-out-sidebar` is distinct from the generic `.surface-drawer` and `.surface-slideout` helper shells because it is a full page/workflow anatomy driven by a `viewSurfaces` descriptor. It is also distinct from the retired `split-list-detail` center split and the persistent split-column `sidebar-detail` layout. Modules may mount filters, libraries, record lists, sort controls, pagination, and other module-owned controls inside ordered drawer panels, but the framework owns the drawer shell, panel chrome, ARIA state, Escape/backdrop/trigger close behavior, focus return, reduced-motion fallback, and overflow containment.

As of 0.33.6.10b, Quick Action Capture uses a footer-aware `.surface-drawer` shell mounted by the shared footer on protected pages. It is a quiet bottom-right control: the closed state shows only the capture trigger, the drawer opens on demand, Escape/outside-click closing returns focus, and the trigger lifts above the visible footer through `--site-footer-visible-offset`. Task, Note, and List capture rows use registered module actions and open the owning module's existing modal editor in place. QAC action rows may open registered module modals or explicitly labeled temporary page fallbacks, but they must not show badges, alerts, or recommendation behavior; notifications and Workbench remain the owners of those concerns. File capture remains an explicit temporary page fallback until a target-aware upload opener exists; the registered Files actions are attachment-scoped File Context and File Preview openers for existing file records.

As of 0.33.6.12d-2, QAC Timer opens the Time Tracking Create Timer modal through `LongtailForge.moduleActions` action `time-tracking.timer.create`. The modal stays Time Tracking-owned, supports Client, Project, optional Task, Description, and Billable controls, returns focus through the shared module-action host, and notifies the host after start so timer lists can refresh. QAC must not navigate to `time-tracker.html` for Timer capture.

As of 0.33.6.12c-1, the Workbench Inspector is a subordinate right-side panel on wide Workbench layouts and is not a fixed drawer, overlay, QAC rail, or embedded viewer. It uses the Workbench layout grid, hides on narrow screens, and keeps QAC's bottom-right drawer space separate. In Focus Selection, it is the bounded "More in this focus" overflow panel: rows start after the top-five recommended cycle window, show permission-safe candidate titles/context, and title clicks use the same primary candidate action path as the main recommendation. Later Task Focus slices own selected-task context behavior.

As of 0.33.6.12c-1, the Workbench header action slot is `Change Focus`, not a `Time Tracker` page link. The action exists in both Workbench states, stays disabled/quiet in Focus Selection, and exits Task Focus without changing the selected focus mode, Client filter, or Project filter. Workbench exposes `data-workbench-view-state` and `data-workbench-active-task-focus` on the host for state-specific follow-up slices.

As of 0.33.6.12c-1, the Task Focus main surface hides Focus Selection panels and renders an icon-only task action strip, a read-only task summary, and a collapsed read-only Task Details disclosure. Edit, Complete, and Block are the only visible Task Focus main actions in this slice: Edit opens the canonical Tasks modal, Complete uses the Tasks complete route and returns to Focus Selection, and Block uses the Tasks update route while staying in Task Focus. Task-linked timers and selected-task context Inspector rows are separate later slices.

As of 0.33.6.12c-2, the Task Focus Checklist section renders after Task Details as a check-only execution area. It is open by default when populated, collapsed by default when empty, and the empty body says `Edit task to add checklist items.` Checklist rows show only a checkbox and read-only label; add, remove, rename, and reorder controls stay in the canonical Task editor.

As of 0.33.6.12d-1, Focus Selection Timers contains only active/paused timer cards and the `No active or paused timers.` empty state; it no longer contains a manual creation form. The Task Focus Timer section renders after Checklist, is default-open, uses the same Workbench disclosure summary/caret treatment, shows Start, Pause, Save Time, and Reset controls tied to the selected task, and lists that task's active or paused timer below the controls. It must not show Client, Project, or Task selectors because Task Focus already supplies the task context. As of 0.33.6.12d-2, timer creation is available through the Time Tracking-owned QAC Create Timer modal instead of a Workbench manual timer row or QAC page fallback.

As of 0.33.6.12e-1, Task Focus has a backend related-context read model but no new Inspector presentation yet. The route returns safe selected-task context ordered as linked Notes, task Files, linked Lists, same-project active Tasks, then direct shared-tag records. The 0.33.6.12e-2 UI slice must render that service output and must not rebuild an embedded preview pane or reuse Focus Selection overflow candidates.

As of 0.33.6.12e-2, the Task Focus Inspector renders that selected-task related-context read model in the existing Workbench right panel. It is default-open and collapsible with a visible caret on wide layouts, hides only the scrollable related-context body when collapsed, keeps the existing narrow-layout hide behavior, and opens related rows through existing module actions or explicit safe fallback URLs. It does not embed Notes, Files, Lists, or Tasks previews inside the Inspector.

## Main-Screen Internal Surfaces

Use `.surface-main-panel` for main-screen internal boxes such as filters, bulk toolbars, settings groups, notification panels, task timer/recovery panels, list detail panels, and contextual work surfaces. Use `.surface-main-panel--sticky` only when the panel persists near the top of the work surface while the user scrolls. The Tasks filter toolbar and bulk toolbar are the first proof target for this shell; later adoption slices can broaden it to Notifications, Time Tracking, Lists, Clients/Projects, and Notes.

Notifications boxes and task timer surfaces are the first adoption-pass targets after the Tasks modal shell proof. The Notifications list workspace, preferences workspace, grouping preferences, preference groups, and preference rows use `.surface-main-panel`; full page notification rows use `.surface-card`; notification row actions and task timer controls use `.surface-dense-actions`; the task timer display uses `.surface-chip`.

## Dense Table and List Actions

Use `.surface-dense-actions` for compact row, table, and list action clusters. Dense actions belong near the record or row they affect and stay separate from `.surface-modal-footer`, which is reserved for modal-level commit, secondary, utility, and destructive actions. Dense action clusters should prefer icon buttons with accessible labels and titles when space is tight, wrapping on narrow screens instead of forcing horizontal overflow.

## Ownership Boundary

The framework owns the tokens, shared class names, focus visibility, overlay host behavior, drawer/slideout shell behavior, responsive placement, and generic footer/action alignment. Modules own form fields, record-specific content, picker/upload bodies, save payloads, validation, permissions, and business meaning.

The first concrete converted area is the Tasks modal surface shell: converted modal title rows use `.surface-modal-heading`, modal groups use `.surface-modal-group`, modal section headings use `.surface-modal-section-heading`, grouped controls use `.surface-modal-section-body`, helper/status text uses `.surface-modal-section-help`, top-only divider intent is marked with `.surface-divider-top`, and footer actions use `.surface-modal-footer` with utility and commit groups. Notes and Tasks must not keep module-specific title-row heading classes or module-specific modal heading spacing for converted add/edit modals. Converted modal footer utility actions should use icon plus text for readable module utilities such as Tags, Files, and Copy Link; utility content such as Tags pickers and Files attachment panels should open stacked child dialogs rather than appearing inside the parent modal body; compact commit actions should keep the Tasks-style Cancel and Save icon treatment with accessible labels. Collapsible modal section summaries must use the shared inside-the-box caret instead of relying on browser-native markers, and non-collapsible modal group headings should not use `fieldset`/`legend` when that would cut the box border. The first main-screen proof target is the Tasks filter toolbar and bulk toolbar using `.surface-main-panel`. The first adoption pass extends the shared classes to Notifications boxes and task timer surfaces without changing module behavior. Later 0.33.5.13 slices will broaden module adoption.

Declarative `viewSurfaces` descriptors are the manifest form of the same ownership boundary. A descriptor may name framework anatomy such as page headers, filter panels, selector/index panels, split workspaces, tables, detail headers, metadata/badge rows, action strips, summary panels, modal shells, field grids, and footer action groups. The descriptor describes the shape; the framework applies shared surface classes, accessibility defaults, overflow wrappers, responsive behavior, focus-safe controls, and workspace terminology. The owning module still supplies the data endpoint, field bindings, route and permission contract, named behavior handlers, validation, save payloads, and record-specific workflow semantics.

As of 0.33.5.18.13.1, descriptors may carry display-only hierarchy metadata, dynamic select option-source behavior IDs, and framework-known table display hooks such as hierarchy labels and chip lists. These helpers do not transfer ownership of records or workflow meaning to the framework: modules still own option data, readable labels, tag assignment, hierarchy mutation, billing/task defaults, route calls, permissions, and save payloads.

As of 0.33.5.18.13.2, Clients/Projects uses active reported descriptors for `client-projects.clients` and `client-projects.projects` with minimal protected hosts. The descriptors bind readable read fields to `/api/clients?include_depth=true` and `/api/projects?include_depth=true`, while `/api/client-projects` remains available for dialog and option workflows.

As of 0.33.5.18.13.3, Clients/Projects read pages render page headers, filters, loading/error/empty/status placement, hierarchy labels, chip-list tag display, table wrappers, page Add actions, and table row actions through descriptor/shared renderer paths. Table row actions render in a framework-owned action column; modules still own registered behavior handlers and record meaning. The Clients/Projects adapter owns safe row labels, tag display values, billing display values, Project Client labels, Business-only Client filter hydration/visibility, query-param openers, dialog bodies, save payloads, route calls, refresh behavior, hierarchy mutation, billing/task-default editors, tag assignment, permissions, and audit/search/event side effects.

As of 0.33.5.18.14.1, Clients/Projects descriptor Add/Edit actions and query-param Add/Edit openers use the shared module-action registry for dispatch and host-context callbacks. The framework still owns control placement and the action envelope; Clients/Projects owns the `LongtailForge.clientProjectDialog` API, dialog bodies, field content, validation, payload construction, save routes, refresh behavior, and hierarchy/billing/tag semantics. The old duplicate page-level Add Client compatibility shell and adapter-level first-party action registrations are retired.

As of 0.33.5.18.14.2, Clients/Projects related rows use shared list/table/action anatomy for Client detail related Projects and Project detail Client/Parent Project context. The framework owns the related-region shell, table wrapper/header/cell anatomy, empty state, and dense row action placement. Clients/Projects owns related-row data shaping, readable labels, billing and task-default summary values, tag chips, allowed row actions, route calls, saves, archive/reparent behavior, permissions, and audit/search/event side effects.

As of 0.33.5.18.14.3, Clients/Projects bulk controls use descriptor row-selection checkbox anatomy and the shared bulk toolbar shell. The framework owns checkbox placement, selected-count chip placement, collapsed toolbar shell classes, and before-table region placement. Clients/Projects owns selected IDs, allowed bulk status/billing/Client reassignment controls, Business-only Client reassignment visibility, confirmations, route calls, payloads, partial-failure messaging, refresh behavior, permissions, and audit/search/event side effects.

As of 0.33.5.18.14.4, the Projects read surface consumes service-owned ordering from `/api/projects`: workspace-level Projects first, then Client-backed Projects grouped by readable Client hierarchy, then parent-before-child Project hierarchy inside each group. The framework may render hierarchy labels, table rows, and registered edit actions, but Clients/Projects owns ordering, parent option readability, move confirmation, route payloads, cycle prevention, archived-parent checks, same-scope checks, Business-only Client rules, and workspace Project behavior. No drag/drop hierarchy editing is part of the converted surface.

As of 0.33.5.18.14.5, Clients/Projects strict surfaces use the shared left-side filter drawer, secondary table rows for tag chips, and icon-only repeated table edit controls. The framework owns the drawer trigger/backdrop/body, table secondary-row anatomy, and accessible icon-button shell. Clients/Projects owns filter option hydration, tag values and assignment, selected IDs, action behavior, route calls, payloads, dialog bodies, hierarchy rules, readable labels, and workspace gating. These changes do not alter schema, route payloads, permissions, or workflow behavior.

As of 0.33.5.18.15, the strict converted surface set is `lists.workspace`, `notes.workspace`, `tasks.workspace`, `files.browse`, `client-projects.clients`, and `client-projects.projects`. Strict surfaces must keep protected HTML minimal and must use descriptors or shared helpers for framework-owned page/filter/table/list/modal/action anatomy. Tags management and Developer Example descriptors remain reported proofs; Admin/Settings, Reporting, Dashboard, Workbench, pagination/server-side paging, Inspector behavior, and non-view workflow changes are deferred to later roadmap lines. The closeout changes docs, decisions, version metadata, archive state, and regression coverage only; it does not add schema, payload, permission, public API, route, or workflow changes.

Descriptor labels use `label`, `title`, and `description` as literal fallbacks and `labelKey`, `titleKey`, and `descriptionKey` as workspace terminology keys. This lets one surface say `Lists`, `Procurement Lists`, or `Shopping Lists` without branching layout code. Terminology changes display text only; surface IDs, module IDs, view IDs, routes, permission IDs, data bindings, behavior IDs, and workflow rules remain stable framework/module contracts.

As of 0.33.5.16.4, `public/js/shared/view-renderer.js` provides the first static descriptor renderer as `LongtailForge.view.renderSurface(descriptor, host)`. It renders descriptor anatomy by composing the existing 0.33.5.15 `LongtailForge.view` primitives, supports the `single-column`, `split-list-detail`, and `table-page` layout shells, and intentionally does not fetch data, register behavior handlers, own client state, implement a virtual DOM, or deliver descriptors through the app shell.

As of 0.33.5.16.5, validated active descriptors travel to the browser through the existing app-shell bootstrap channel and are stored on `LongtailForge.workspaceContext.viewSurfaces`. Delivery uses the same enabled-module, workspace-capability, and protected-view permission filters as module navigation. Disabled modules, unavailable protected views, and permission-denied protected views do not expose descriptors in the bootstrap payload.

As of 0.33.5.16.6, data-bound descriptor surfaces fetch through the shared browser API client, project response records through descriptor field bindings, and redraw framework-owned table, index, detail, summary, field, item collection, loading, empty, and error-state anatomy. Modules still own the route implementation, returned record shape, validation, save semantics, and workflow behavior.

As of 0.33.5.16.8, descriptor actions can be dispatched by the framework. Route actions call the shared browser API client with descriptor method/confirm metadata, and behavior actions call module-registered handlers through `LongtailForge.view.registerBehavior`. The framework owns dispatch, modal shell opening, and recoverable action errors; modules still own handler behavior, validation, save payloads, and workflow meaning.

As of 0.33.5.16.9, Lists is the first live descriptor read-shell proof. Its manifest declares the protected workspace header, filters, selector/index, split layout, and read-only detail summary intent, while the Lists browser module still owns filtered reads, hydrated detail rendering, mutations, item rows, modals, linked records, and workspace-scope behavior until later explicit conversion slices.

As of 0.33.5.16.12, Lists item entry fields, item table/action placement, list-level workflow actions, linked-record picker/row placement, and the create/edit modal shell are descriptor-declared. The Lists browser module binds module-owned field meaning, catalog suggestions, validation, payloads, permissions, task-link picker behavior, and API workflows to that anatomy; the descriptor does not make Lists a generic inventory, purchasing system, or cross-module relationship engine. Strict declarative guardrails now enforce the converted Clients, Projects, Files, Lists, Notes, and Tasks surfaces and report the remaining protected views as inventory until each is explicitly converted.
