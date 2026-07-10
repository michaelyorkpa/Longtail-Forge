# Longtail Forge Roadmap

This file is the detailed per-version forward plan for Longtail Forge. README.md should stay cursory and point here for version-level detail.

Active cursor: `0.33.6`. Completed `0.33.5.29` is archived in `ROADMAP-ARCHIVE.md`.

## Version 0.33.6 - Dashboard and Workbench Formalization as Project hub and work center

Purpose:

Turn the already-existing Dashboard and Workbench surfaces into framework-owned hosts that render module *contributions* instead of hardcoded Tasks/Time-Tracking behavior. Dashboard becomes the workspace overview/orientation surface; Workbench becomes the active work/resumption/focus surface driven by a single normalized work-candidate model, focus modes, the existing resume-state service, a floating Quick Action Capture (QAC) drawer, and a Workbench Inspector.

This is a formalization and de-hardcoding pass, not greenfield. Dashboard, Workbench, and the resume-state service already exist; several contribution contracts already exist. The work is finishing/converting them, adding the net-new contracts, and reconciling the QAC/Inspector direction from `TODO.md`.

Dependencies and framework baseline:

- 0.33.5.9 shipped the framework-owned resume-state service and `/api/work-resume`.
- 0.33.5.15/0.33.5.16/0.33.5.18 provide the `LongtailForge.view` primitives, validated `viewSurfaces`/`renderSurface(...)`, minimal protected hosts, and the finalized view baseline. Dashboard/Workbench hosts must consume this baseline rather than hand-building framework-owned anatomy (mirrors the Reporting host rule in 0.33.11).

Current wiring (grounding for this branch):

- Contribution contracts already half-exist. The module manifest already validates `dashboard` and `workbench` contributions (plus `timerSources`/`workItemSources`) in `src/core/modules/manifest-contract.js:1019-1047`, and `modulesService` already exposes `listDashboardPanels`, `listWorkbenchCards`, `listTimerSources`, `listWorkItemSources` (`src/core/modules/modules.service.js:997-1023`), all filtered through the shared `listWorkspaceContributions(workspaceId, session, fieldName)` path (enabled-module + `requiredPermissions` + `requiredWorkspaceCapabilities` + `requiresEnabledModules`). The **net-new** contracts are focus modes and a candidate source; a resume-snippet producer contract already exists (below).
- Workbench service de-hardcoding is complete as of 0.33.6.5: `src/services/workbench.service.js` now reads module state, Workbench cards, timer/work-item sources, and normalized work candidates without importing first-party module services. Remaining Workbench work in this branch is the guided host/UI conversion, resume/focus presentation, QAC, and Inspector.
- Dashboard is hand-built static HTML, not a framework host: `views/protected/dashboard.html` hardcodes the client/billing panels inline and exposes only a hidden `data-dashboard-extension-panels` stub for contributions. Converting it to a minimal host is in scope for this version.
- Resume state is fully built and safe by construction. `GET /api/work-resume` + `POST /api/work-resume/:id/dismiss` (`src/routes/work-resume.routes.js`) return a rich normalized item (`title`, `contextLabel`, `nextAction`, `sourceUrl`, `priority`, `dueAt`, `blockedReason`, `resumeRankHint`, `lastActionLabel`, `metadata`, `mode`). It is fed by an event-driven producer registry (`src/services/work-resume-state-producers.js`) with a strict field allowlist and forbidden-field patterns (`body`, `html`, `attachment`, `secure`, `encrypt`, `storage.key`, `scanner`, ...). This producer payload is the basis for the shared work-candidate shape below.
- Global chrome is injected per protected page via the shared `navigation.js` + `footer.js` includes (see `views/protected/dashboard.html`); the QAC floating drawer hooks into that app-shell include so it appears on all protected screens.

Sizing rule for this branch:

- Each sub-slice below should have one primary blast radius and should be completable in a single focused implementation session.
- Each implementation sub-slice follows the normal release ceremony: focused regressions, relevant docs, `CHANGELOG.md`, package metadata when the version changes, and verification.
- Do not combine adjacent slices just because the same helper file is already open. In particular, the candidate model (0.33.6.2) is split from its ranking/sources (0.33.6.3), and the Dashboard host conversion (0.33.6.8) is split from moving Time-Tracking's panels into contributions (0.33.6.9).

Key decisions for this branch:

- QAC is a floating bottom-right drawer available on all protected pages, NOT a permanent right-side rail (reconciling `TODO.md` against the earlier rail wording). Record this in `DECISIONS.md`.
- The Workbench Inspector is a persistent right panel on wide Workbench layouts showing permission-safe related record titles/context and opening existing preview/record modals in-place via stacked-modal behavior, not an embedded viewer pane. It is a distinct surface from QAC and must not steal the same screen space.
- Next-action candidates and resume state share ONE normalized work-candidate shape derived from the existing resume-producer payload; there is no second parallel candidate contract. The candidate model inherits the producer allowlist/forbidden-field safety so candidates can never leak body/secure/storage-key content.

### Version 0.33.6.1 - Surface contracts and scope (plan only)

**Model: GPT-5.4** - Planning/docs-only contract baseline with no runtime behavior changes.

- [x] Define Dashboard as the workspace overview/orientation surface and Workbench as the active work/resumption/focus surface, and keep them separate.
- [x] Confirm and document the already-existing contribution contracts (`dashboard`, `workbench`, `timerSources`, `workItemSources`) and the resume-state producer registry, so later slices extend rather than reinvent them.
- [x] Name the net-new contracts this branch adds: a focus-mode contract/registry (0.33.6.4) and a normalized work-candidate source (0.33.6.2-0.33.6.3).
- [x] Enumerate the hardcoded Task/Time assumptions to remove (`src/services/workbench.service.js` direct `tasksService`/`activeTimersService` calls and its hardcoded `modules: { tasks, timeTracking }` bootstrap return shape; the inline panels in `views/protected/dashboard.html`; and the first-party module IDs baked into the framework registry service itself ? `TASKS_MODULE_ID`/`TIME_TRACKING_MODULE_ID` constants, the `readModuleSettingValue` `taskTimersEnabled` special-case, and the `tasksEnabled`/`timeTrackingEnabled` compat-flag injection in `decorateWorkspaceSettings` in `src/core/modules/modules.service.js`) and assign each to its owning slice. These compat flags cannot be retired until the Dashboard/Workbench/settings browser code that reads them is de-hardcoded in this branch, which is why they land here rather than in the earlier 0.33.5.27 database-conversion waves.
- [x] Preserve, as a standing requirement for every slice, permission checks, module enabled/disabled checks, workspace boundaries, and private/secure/deleted-record handling.
- [x] Update the implementation plan only; do not change runtime behavior in this slice.

Acceptance criteria:

- The Dashboard/Workbench boundary, the existing vs. net-new contracts, and the de-hardcoding targets are documented, with each target assigned to a later slice.

### Version 0.33.6.2 - Normalized work-candidate contract and service

**Model: GPT-5.5 Extra High** - Shared cross-module candidate contract work on top of existing framework and resume-state seams.

- [x] Promote the resume-producer payload shape (`src/services/work-resume-state-producers.js`) into a single normalized work-candidate shape reused by both next-action ranking and resume state: `moduleId`, `recordType`, `recordId`, `title`, `contextLabel`, `reason`, primary-action descriptor, `sourceUrl`, `priority`, `dueAt`, `blockedReason`, and a rank hint.
- [x] Reuse the existing seams rather than adding a new manifest axis: the framework-owned candidate service assembles candidates from resume-state rows plus live signals (e.g. running/paused timers) behind one shape, building on the existing resume-state producer payload plus the already-shipped `timerSources`/`workItemSources` contracts.
- [x] Inherit the producer safety rules verbatim: the same field allowlist and forbidden-field patterns (`body`, `html`, `attachment`, `secure`, `storage.key`, `scanner`, ...) so a candidate can never carry body text, secure content, storage keys, or raw IDs in labels.
- [x] Every candidate must expose a reason string, a primary action, a safe context label, and a source URL; labels follow the `docs/workflow-context-contract.md` no-raw-ID rule.
- [x] Add regressions proving the shape is stable and that forbidden fields are stripped even if a source tries to supply them.

Acceptance criteria:

- One normalized, safe-by-construction work-candidate shape backs both next-action and resume behavior, with no second parallel contract.

### Version 0.33.6.3 - Deterministic ranking and module candidate sources

**Model: GPT-5.5 Extra High** - Cross-module ranking and source integration with deterministic behavior and safety filtering.

- [x] Add deterministic candidate ranking: running timers, paused timers, overdue assigned work, due today, blocked/stale work, recently touched work, due this week.
- [x] Tasks contributes task candidates and Time Tracking contributes running/paused timer candidates through the shared contract and the existing contribution seams; Lists, Notes (Active Work), and future Tickets contribute when their integrations are ready. Do not add a new candidate-source manifest field.
- [x] Reuse the existing resume-state producer registry where a candidate is event-driven; add only a thin pull-style candidate source where live state (e.g. active/paused timers) is not captured by producers.
- [x] Keep ranking a pure function of candidate fields (no hidden per-module ordering) so the "one recommended next action" is deterministic and testable.
- [x] Add regressions for ranking order across mixed candidate types and for disabled-module/permission filtering of sources.

Acceptance criteria:

- Candidates from multiple modules rank deterministically into a single ordered list, permission- and module-aware.

### Version 0.33.6.4 - Focus-mode contract and resolver

**Model: GPT-5.5 Extra High** - Framework-owned focus registry with workspace-aware context resolution and later UI curation.

- [x] Add a focus-mode contract/registry (following the `listWorkspaceContributions` pattern) with the full canonical mode set: Start my day, Pick up where I left off, What's due next, Work this week, Review blocked work, In progress, Project focus, and Client focus (Business workspaces only).
- [x] Each focus mode resolves to a normalized focus context (scope, client/project, status/date filters) passed to the candidate sources from 0.33.6.3.
- [x] Focus modes are user-friendly labels over deterministic filters, not separate hardcoded pages. This slice owns the full canonical registry even if later Workbench UI surfaces only a curated subset at first.
- [x] Client focus must be hidden outside Business workspaces; Personal/Family must not surface client scope or labels.
- [x] Add regressions for mode-to-context resolution and workspace-type gating.

Acceptance criteria:

- A canonical focus-mode set resolves to normalized focus contexts that drive the candidate sources, with correct workspace-type gating.

### Version 0.33.6.5 - De-hardcode the Workbench service

**Model: GPT-5.5 Extra High** - Framework/service decoupling that removes first-party module names from generic decisions.

- [x] Remove the direct `tasksService`/`activeTimersService` imports and hardcoded `tasks`/`time-tracking` branches from `src/services/workbench.service.js`; drive timers and work items purely through the contribution registry and the candidate service. The `TASKS_MODULE_ID`/`TIME_TRACKING_MODULE_ID` constants and the hardcoded `modules: { tasks, timeTracking }` bootstrap return shape must both be gone; if the browser still needs a module-state map, build it generically from enabled-module state keyed by module ID.
- [x] Also de-hardcode the framework registry service itself: remove the `taskTimersEnabled` special-case in `readModuleSettingValue` and the `tasksEnabled`/`timeTrackingEnabled` compat-flag injection in `decorateWorkspaceSettings` (`src/core/modules/modules.service.js`), retiring those deprecated top-level flags now that the settings/Workbench/browser-shell code consuming them is being converted in this branch. `src/core/modules/` must not name specific first-party module IDs to make generic contribution/settings decisions.
- [x] Keep the existing Workbench bootstrap response shape working for the browser during the transition (adapt internals without breaking the page contract).
- [x] Preserve enabled/disabled-module handling, permission checks, and workspace boundaries already enforced in `bootstrap`.
- [x] Update the framework/browser consumers and regressions that still expect the deprecated top-level flags (for example `navigation.js` and the current permission regression assertions), so the retirement is complete rather than Workbench-only.
- [x] Add regressions proving Workbench renders the same live data with Tasks/Time enabled and degrades cleanly when either is disabled, without importing them directly, and that no first-party module ID remains hardcoded in `workbench.service.js` or the `modules.service.js` settings/decoration paths.

Acceptance criteria:

- Workbench data comes entirely from contributions and the candidate service, with no hardcoded module imports and no behavior regression, and the framework registry service (`modules.service.js`) no longer names specific first-party modules to make generic settings/contribution decisions.

### Version 0.33.6.6 - Guided Workbench UI

**Model: GPT-5.5 Extra High** - Framework-owned Workbench host conversion plus guided next-action UX on top of the candidate model.

- [x] Replace the hardcoded `views/protected/workbench.html` host with a minimal framework-owned `LongtailForge.view` Workbench host; in this branch, the guided host is the new Workbench host rather than a layer added on top of the old static page.
- [x] Add a question-led Workbench entry that presents a curated initial subset of the 0.33.6.4 canonical focus modes as friendly questions ("Pick up where I left off", "Start with what's due", "Work this week", "Review blocked work", "Focus on a project") over the deterministic filters.
- [x] Show one recommended next action (top-ranked candidate) before showing longer lists.
- [x] Keep secondary lists available but visually subordinate; do not turn Workbench into another full module index.
- [x] Add empty states that suggest a useful next step instead of dead ends.
- [x] Build on `LongtailForge.view` primitives and framework view states; do not hand-build framework-owned anatomy.
- [x] Add focused browser/static regressions for focus selection, recommended-action rendering, and empty states.

Acceptance criteria:

- Workbench opens through a minimal framework-owned host as a guided, focus-led surface that highlights one recommended action first and keeps secondary work subordinate.

### Version 0.33.6.6a - Recommended-action candidate cycling and overflow

**Model: GPT-5.5 Extra High** - Guided-UX refinement of the shipped recommended-action panel over the existing candidate ranking.

Promoted from `TODO.md` (Recommended Next Action Interface & Algorithm). Follow-up to the shipped 0.33.6.6 guided host; belongs before 0.33.6.7.

- [x] Add a "not this one" affordance to the "Start here" recommended-action panel: right-aligned, icon-only left/right arrows aligned with the "Start here" heading that cycle through the top 3-5 ranked candidates for the active focus (from the 0.33.6.3 deterministic ranking) without leaving the Workbench.
- [x] Keep everything beyond the top 3-5 in the existing "More in this focus" list; the arrows only re-fill the single recommended slot and must not reorder or duplicate the secondary list.
- [x] Preserve the one-recommended-action emphasis (a single card visible at a time) and framework view states; extend the existing `workbench-recommended-panel` DOM in `public/js/workbench.js` rather than hand-building framework-owned anatomy.
- [x] Preserve the permission/workspace/enabled-module scoping already applied to candidates; cycling never surfaces a candidate the ranking would not.
- [x] Add focused browser/static regressions for arrow presence and right-alignment, cycling bounds across the 3-5 window, and overflow remaining in "More in this focus".

Acceptance criteria:

- The recommended-action panel lets the user cycle the top 3-5 candidates via right-aligned icon-only arrows, with all further candidates staying in the subordinate "More in this focus" list.

### Version 0.33.6.6b - Workbench host status and intro-copy cleanup

**Model: GPT-5.4** - Mechanical host-shell cleanup routing status through existing framework view states.

Promoted from `TODO.md`. Follow-up to 0.33.6.6; belongs before 0.33.6.7.

- [x] Remove the frequently-empty status box at the top of the Workbench page and the static "Choose a focus, then start one useful next action." line beneath the Workbench heading.
- [x] Relocate the transient status messages that previously rendered in that box (loading/updating/error/empty-context) into the space formerly occupied by the intro line, using framework view status states rather than an ad-hoc box.
- [x] Do not hand-build framework-owned header/status anatomy; use `LongtailForge.view` status primitives.
- [x] Add a focused static/browser regression proving the deprecated box and intro line are gone and that status messages render in the relocated slot.

Acceptance criteria:

- The empty status box and static intro line are removed, and Workbench status messaging renders through framework view states in the former intro location.

### Version 0.33.6.6c - In-place record editing from Workbench

**Model: GPT-5.5 Extra High** - Stacked-modal wiring of the shipped Workbench actions to the canonical record openers.

Promoted from `TODO.md`. Follow-up to 0.33.6.6; belongs before 0.33.6.7.

- [x] Change the Workbench "Open Work" action so it opens the existing Edit Task modal in place via stacked-modal behavior instead of navigating to the task list page.
- [x] Reuse the canonical task opener (the shared `LongtailForge.moduleActions` / task dialog path) rather than a Workbench-specific editor; return focus to the triggering control on close and refresh the affected candidate/list in place.
- [x] Where a candidate's record type has no in-place modal yet, keep an explicitly temporary navigation fallback (consistent with the QAC temporary-fallback rule) rather than a silent dead end.
- [x] Preserve permission checks, workspace boundaries, and disabled-module handling on open.
- [x] Add regressions proving "Open Work" dispatches the in-place editor for tasks and returns focus without leaving the Workbench.

Acceptance criteria:

- "Open Work" opens the record's editor in place via stacked-modal behavior and refreshes Workbench state, instead of navigating away.

### Version 0.33.6.6d - Focus-mode candidate scope and ordering corrections

**Model: GPT-5.5 Extra High** - Deterministic ranking/focus-context corrections behind the shipped focus modes.

Promoted from `TODO.md`. Corrects candidate/focus behavior surfaced by the 0.33.6.6 focus modes; belongs before 0.33.6.7. Blast radius is the 0.33.6.3 ranking and 0.33.6.4 focus resolver, not new UI.

- [x] "What's due next" / "Start with what's due" must order by due datetime - oldest overdue first, then the next upcoming due task - not by alphabetized client/project order. Fix in the deterministic ranking/focus context (0.33.6.3/0.33.6.4), keeping ranking a pure function of candidate fields.
- [x] "Work this week" must recommend the next-due task (not an arbitrary single task) and load the full in-scope list into "More in this focus", not a single entry.
- [x] "Review blocked work" must resolve to genuinely blocked candidates only; when nothing is blocked it shows the focus empty state (0.33.6.6 empty-state contract) instead of falling back to unrelated tasks.
- [x] Keep all three as deterministic filters over the shared candidate contract; do not add per-mode hardcoded ordering or a second candidate source.
- [x] Preserve permission/workspace/enabled-module and archived/complete handling in every focus context.
- [x] Add regressions for due-datetime ordering (overdue-before-upcoming), work-this-week next-due plus full-list population, and blocked-focus emptiness when no blocked work exists.

Acceptance criteria:

- The due, this-week, and blocked focus modes resolve to correctly scoped and ordered candidates (datetime-ordered due work, next-due plus full list for the week, genuinely-blocked-only for blocked), with correct empty states.

### Version 0.33.6.6e - Split Workbench client and project focus filters

**Model: GPT-5.5 Extra High** - Focus-filter UI split feeding the existing focus-context resolver.

Promoted from `TODO.md`. Follow-up to 0.33.6.6; belongs before 0.33.6.7. First consumer of the app-wide scoping standard in 0.33.6.14.

- [x] Replace the single combined client/project dropdown in the "What should we focus on?" box with two separate filters - a client filter (Business workspaces only) and a project filter - and make them active for ALL focus modes, not only Project focus.
- [x] Mirror the two-filter behavior used elsewhere in Tasks so scoping is consistent; keep client scope hidden on Personal/Family workspaces.
- [x] Consume the hierarchical (parent-includes-descendants) scoping standard from 0.33.6.14 so selecting a parent client/project includes its sub-clients/sub-projects; if 0.33.6.14 has not landed, scope to the exact client/project and cross-reference 0.33.6.14 as the follow-up that generalizes it.
- [x] Preserve permission/workspace boundaries and the focus-context contract; the split filters feed the same focus-context resolver (0.33.6.4).
- [x] Add regressions for the two-filter split, all-focus-mode applicability, workspace-type gating of the client filter, and (once 0.33.6.14 lands) parent-includes-descendants scoping.

Acceptance criteria:

- The Workbench focus box exposes separate client and project filters that apply to every focus mode, are workspace-type aware, and use exact client/project scoping until 0.33.6.14 generalizes parent/child descendant inclusion.

### Version 0.33.6.6f - Collapsible Workbench sections: default state and caret affordance

**Model: GPT-5.5 Extra High** - Default-state logic and accessible collapse affordance over the shipped Workbench sections.

Promoted from user request. Follow-up to 0.33.6.6; belongs before 0.33.6.7.

- [x] Start the "More in this focus" secondary-candidate section collapsed by default: `createSecondaryCandidateSection()` in `public/js/workbench.js` currently forces its `<details>` open (`section.open = true`) - flip the default to collapsed while keeping the section available.
- [x] Make the Timers section (`createTimerSection()`) default-collapsed ONLY when there are no active/paused timers, and default-open when there is at least one; key the initial open state off the loaded timer state (`state.timers.length`) and re-evaluate when timer data loads/changes so it auto-opens if a timer becomes active during the session (respect an explicit user toggle within the session rather than fighting it).
- [x] Add a clear, consistent caret/chevron affordance on collapsible section headers so users can see a section is collapsible and whether it is collapsed or expanded (surface the native `<details>`/`<summary>` disclosure marker or a styled chevron that rotates on toggle). Keep it accessible: real `<summary>` semantics / `aria-expanded`, keyboard-toggleable, visible focus.
- [x] Preserve each section's existing content, counts, and behavior; only the default open state and the affordance change. Build on `LongtailForge.view` primitives and existing section markup rather than hand-rolling new anatomy.
- [x] Add focused browser/static regressions for: "More in this focus" defaulting collapsed, Timers open-state keyed to active-timer presence (open with timers, collapsed without), and the caret affordance present and reflecting collapsed/expanded state.

Acceptance criteria:

- "More in this focus" starts collapsed, Timers starts open only when active/paused timers exist, and every collapsible Workbench section shows an accessible caret affordance indicating its collapsed/expanded state.

### Version 0.33.6.6g - Remove the all-tasks list from the Workbench

**Model: GPT-5.4** - Focused removal of the non-curated task list and its dead data plumbing.

Promoted from user request. Follow-up to 0.33.6.6; belongs before 0.33.6.7.

- [x] Remove the full Tasks list from the Workbench: delete `createTaskSection()` and its `workbench-task-list` region in `public/js/workbench.js` so the Workbench no longer renders an all-tasks index. The Workbench stays a focused surface (recommended action + "More in this focus" curated candidates), reinforcing the 0.33.6.6 rule that it is not another full module index.
- [x] Remove the now-dead task-list data plumbing that fed only that list (the `taskItems` fetch/merge/render path), while keeping `taskOptions` and the work-candidate paths that the recommended action and secondary candidates still need.
- [x] Preserve permission/enabled-module handling for the surfaces that remain; removing the list must not affect candidate ranking or focus behavior.
- [x] Add regressions proving the Workbench renders no all-tasks list and that the recommended action + secondary candidate surfaces still render.

Acceptance criteria:

- The Workbench no longer renders an all-tasks list; only the focused recommended-action and curated "More in this focus" surfaces remain, with no dead task-list plumbing left behind.

### Version 0.33.6.6h - Shorten recommendation cycle-button labels

**Model: GPT-5.4** - Copy-only correction to the shipped recommended-action cycle buttons.

Promoted from user request. Follow-up correction to the already-shipped 0.33.6.6a arrows; belongs before 0.33.6.7.

- [x] Shorten the two cycle-button labels on the recommended-action arrows: the shipped verbose text "Show previous recommendation" and "Not this one, show another recommendation" (`public/js/workbench.js`) become concise "Previous" and "Next" respectively.
- [x] On the icon-only arrows these serve as the accessible name / tooltip (`aria-label`/`title`); if any visible text remains it is just "Previous"/"Next", not a sentence.
- [x] Update any regression that pins the old button labels.

Acceptance criteria:

- The recommended-action cycle buttons read "Previous"/"Next" (as visible text and/or accessible name), with no verbose sentence labels remaining.

### Version 0.33.6.7 - Resume "Pick up where I left off" UI

**Model: GPT-5.5 Extra High** - Resume-state integration with deterministic fallback behavior and safe dismissal handling.

- [x] Wire the "Pick up where I left off" focus to `GET /api/work-resume` first, falling back to the lower-ranked recently-touched-work candidate bucket from 0.33.6.3 only when no active resume rows exist. Close the current wiring gap: the mode's declared `resumeStrategy: { primary: "work-resume", ... }` in `src/services/work-focus-modes.service.js` is inert (no server or client code reads it), so today the mode only runs the recently-touched branch via `/api/workbench/focus-candidates` and never consults `/api/work-resume`. This slice must actually execute that strategy.
- [x] Do not build a new framework activity feed in this slice; the fallback is weaker ranking over existing candidate sources, not a second recovery surface.
- [x] Show one recommended resume candidate first; keep secondary candidates subordinate.
- [x] (Promoted from `TODO.md`) Account for active timers as the strongest resume signal. Running/paused timer state already produces resume-state rows (the `initial.time-tracking-timers` producer), so consulting `/api/work-resume` first restores them; but the recently-touched fallback currently classifies timers into the `running_timer`/`paused_timer` buckets and drops them (`matchesRankBucketFilters`/`rankBucket` in `src/services/work-candidate.service.js`), so the fallback must include the timer buckets (or otherwise not discard running/paused timer candidates for this mode).
- [x] (Promoted from `TODO.md`) Rank resume candidates with an explicit precedence - running timer, then paused timer, then task with a resume note, then In Progress task, with task priority as the tiebreaker - applied consistently across both the recommended slot and the "More in this focus" list.
- [x] (Promoted from `TODO.md`) Exclude recurring-task instances whose only recent signal is "Task Created" from the resume recommendation unless they are within ~24 hours of their due date; recurring instances have definitive due dates and should not surface just for being recently created. Fold this rule into the 0.33.6.3 recently-touched-work bucket so the resume fallback inherits it rather than special-casing it in the UI.
- [x] Allow users to dismiss stale resume candidates via `POST /api/work-resume/:id/dismiss`.
- [x] Preserve permission checks, disabled-module behavior, deleted-record handling, and private/secure content boundaries (already enforced by the producer allowlist).
- [x] Add regressions for resume-first ordering, timer-precedence ordering (running > paused > resume-note > In Progress > priority), running/paused timers surviving the recently-touched fallback, recurring-instance exclusion outside the ~24h due window, recent-work fallback, dismiss behavior, and safe handling of stale/unavailable targets.

Acceptance criteria:

- The resume focus consumes the existing resume-state service (executing its `resumeStrategy`, not just the recently-touched fallback), surfaces running/paused timers ahead of resume-note and In Progress work, recommends one candidate first, supports dismissal, and never exposes unsafe content.

### Version 0.33.6.8 - Dashboard host conversion

**Model: GPT-5.5 Extra High** - Framework-owned Dashboard host conversion while preserving contribution gating and existing overview panels.

- [x] Convert `views/protected/dashboard.html` into a minimal framework host that renders contributed dashboard panels via `modulesService.listDashboardPanels` and registered panel renderers, using `LongtailForge.view` primitives for shell/header/status/empty/error states.
- [x] Keep the existing panels working through the host during the conversion (no visual/data regression), retiring the hidden `data-dashboard-extension-panels` stub.
- [x] Do not hand-build framework-owned Dashboard anatomy in static HTML or ad-hoc DOM when a view primitive or descriptor field covers it.
- [x] Add a focused static regression proving the Dashboard page is a minimal framework host.

Acceptance criteria:

- Dashboard renders module-contributed panels through a framework host rather than hardcoded static markup, with existing panels preserved.

### Version 0.33.6.9 - Move Time-Tracking dashboard panels into contributions

**Model: GPT-5.5 Extra High** - Time-Tracking-owned dashboard contribution extraction with shared billing-calculation reuse.

- [x] Narrow this slice to the Time-Tracking-owned billing panels only: move the current-month billables table and the hours-and-billables chart out of `dashboard.html` and into Time-Tracking-owned `dashboard` contributions with their own renderers and data routes.
- [x] Task summary remains the Tasks-owned contribution already covered by the host contract; it is not part of this extraction slice.
- [x] Keep the reporting hub / client-project count launch panel as a framework-hosted interim panel in 0.33.6.x; it does not move into Time Tracking here and instead converts to a Reporting-owned dashboard contribution in 0.33.11.
- [x] Keep Time Tracking responsible for the billing/time data and calculations; extract the billing/time aggregation into a shared Time-Tracking calculation service that 0.33.11's project time/billing work can reuse, while the framework remains responsible only for panel hosting, placement, and status/empty/error states.
- [x] Ensure the panels disappear cleanly when Time Tracking is disabled or the user lacks the required permissions, via the existing contribution filtering.
- [x] Add regressions proving the panels appear only when Time Tracking is enabled and permitted, and that no hardcoded Task/Time assumptions remain in the Dashboard host.

Acceptance criteria:

- The Dashboard billing panels are Time-Tracking contributions gated by enabled-module and permission checks, with no remaining hardcoded Time-Tracking billing markup in the host and no accidental reassignment of the reporting hub.

### Version 0.33.6.10a - Quick Action Capture drawer shell

**Model: GPT-5.5 Extra High** - Framework-owned shared app-shell drawer behavior across every protected page.

Decision:

QAC is app-shell utility behavior, not a Workbench focus mode. It provides low-distraction access to common capture and recovery tools without navigating away from the current work surface: reduce focus/workflow interruption, keep productivity focused, and allow quick idea/thought capture without derailing the work train. QAC is a floating bottom-right drawer (not a permanent rail).

- [x] Add a floating, drawer-style QAC control anchored bottom-right, available on ALL protected screens via the shared app-shell include (`navigation.js`/`footer.js`), quiet until the user opens it.
  - [x] Use an icon that communicates action/capture rather than words that consume screen real estate (evaluate a "runner"/lightning-style glyph against the existing icon registry at build time).
  - [x] On wide screens the drawer may show icon + small text; on narrow screens it collapses to icon-only.
- [x] Drawer actions are contributed by enabled modules or mapped from registered module actions, and the shell owns contributed-action gating, quiet-until-opened behavior, focus return, and explicit temporary page fallbacks.
- [x] Ship the framework-owned first action set with explicit temporary behavior where a modal does not exist yet:
  - [x] Timer - temporary fallback to `time-tracker.html` until the future 2-timer modal exists (see deferred follow-ups in 0.33.6.12).
  - [x] Task - dispatches through the existing registered Task action path.
  - [x] Note - explicit temporary fallback to `notes.html` until the shared action registry opener lands in 0.33.6.10b.
  - [x] List - explicit temporary fallback to `lists.html` until the shared action registry opener lands in 0.33.6.10b.
  - [x] File - explicit temporary fallback to `files.html` until the shared action registry opener lands in 0.33.6.10b.
  - [x] Reporting - temporary fallback to `reporting.html` until the future report-creation modal exists.
  - [x] Search - temporary fallback to `search.html` until the future advanced-search modal exists.
- [x] Actions open modals without changing the current page, receive safe current-page context when available, and return focus to the triggering control when closed.
- [x] If a modal action does not exist yet, the QAC action may be hidden, disabled with a clear tooltip, or temporarily link to the existing module page as an explicitly temporary fallback; temporary navigation fallbacks must be removed once the modal action exists.
- [x] Do not use badges, alerts, or recommendation behavior in the drawer; notifications and Workbench own those concerns.
- [x] Add regressions for drawer presence on protected pages, contributed-action gating, focus return, quiet-until-opened behavior, and temporary-fallback labeling.

Acceptance criteria:

- A quiet floating QAC drawer is available on all protected pages, opens contributed capture actions as modals (with explicit temporary page fallbacks), preserves focus, and adds no badge/alert noise.

### Version 0.33.6.10b - First-party opener rollout for QAC

**Model: GPT-5.4** - Mechanical registry rollout that wraps existing module-owned openers without inventing new forms.

- [x] Register the missing first-party Notes, Lists, and Files modal openers through the shared `LongtailForge.moduleActions` registry so QAC dispatches them the same way it dispatches Tasks, Time Entries, Projects, and Clients.
- [x] Wrap each module's existing canonical opener; do not build new forms or alternate editor flows.
- [x] Preserve module-owned permissions, payloads, refresh hooks, and focus-return behavior while routing opens through the shared framework action path.
- [x] Add regressions proving the new action registrations exist, dispatch through the canonical module-owned opener, and do not duplicate existing page-specific open logic.

Implementation note: Notes and Lists now dispatch QAC create actions through their canonical add/edit modal wrappers. Files registers the existing attachment-scoped File Context and File Preview openers (`files.edit`, `files.preview`) for framework dispatch; generic File capture remains an explicit page fallback until a target-aware upload opener exists, because this slice must not invent a new Files form.

Acceptance criteria:

- Notes, Lists, and Files expose canonical shared action registrations that QAC and future framework surfaces can dispatch without inventing new module forms.

### Version 0.33.6.11 - Workbench Inspector panel

**Model: GPT-5.5 Extra High** - Permission-safe cross-module context rail work without introducing a new embedded viewer host.

- [x] Add a persistent Inspector panel on wide Workbench layouts (subordinate to the main surface) that stays out of the QAC drawer's space.
- [x] Show permission-safe related record titles/context when idle; clicking a related title opens the existing preview or record modal in place via stacked-modal behavior (reuse existing preview/linked-context infrastructure rather than a new viewer host).
- [x] Do not build an embedded preview pane inside the Inspector in this slice; a true embedded viewer would be a separate future slice.
- [x] Keep the Inspector permission-safe and workspace-aware, and apply the no-raw-ID/`docs/workflow-context-contract.md` label rules; non-Workbench screens remain centered unless they explicitly opt into Inspector behavior.
- [x] Degrade gracefully on narrow screens (collapse/hide) and when there is no related context.
- [x] Add regressions for related-title rendering, stacked-modal open behavior, permission scoping, and narrow-screen behavior.

Acceptance criteria:

- The Workbench Inspector shows permission-safe related titles/context on wide layouts, opens existing preview/record modals without competing with the QAC drawer, and does not introduce an embedded viewer pane or leak unsafe content.

### Version 0.33.6.11b - Remove the Quick Notes section from the Workbench

**Model: GPT-5.4** - Focused removal of the Quick Notes section now that its replacements exist.

Promoted from user request. Placed here (after QAC 0.33.6.10a and the Inspector 0.33.6.11) because it depends on those replacements; originally drafted as a 0.33.6.6 follow-up but moved to run after its dependencies.

- [x] Remove the Quick Notes section from the Workbench: delete `createQuickNotesSection()` and its data/behavior in `public/js/workbench.js`. The Workbench stays a focused surface; quick capture is now owned by the Quick Action Capture drawer (0.33.6.10a) and related record context by the Workbench Inspector (0.33.6.11), so this section is redundant.
- [x] Confirm no capture/context gap remains: the QAC Note action and the Inspector cover what Quick Notes provided before removing it.
- [x] Preserve permission/enabled-module handling for the surfaces that remain.
- [x] Add a regression proving the Workbench renders no Quick Notes section.

Acceptance criteria:

- The Workbench no longer renders a Quick Notes section, with quick capture handled by QAC (0.33.6.10a) and related context by the Inspector (0.33.6.11), and no capture/context gap introduced.

## Workbench View-State Direction

As of 0.33.6.12a, Workbench has two explicit view states: Focus Selection and Task Focus.

Focus Selection is for choosing work. It shows focus-mode questions, filters, one recommended next action, and a right-side candidate overflow panel for other work matching the selected focus.

Task Focus is for working one selected task. It hides Focus Selection controls and shows a mostly read-only task work surface with explicit task actions, checklist execution, task-linked timer controls, and a right-side task-context Inspector.

The Workbench Inspector is state-specific. In Focus Selection it replaces the old "More in this focus" main-column section. In Task Focus it shows context around the selected task: linked notes, task files, linked lists, same-project tasks, and direct shared-tag records, all permission-shaped and opened through existing module actions or explicit safe fallbacks.

Task candidate primary actions enter Task Focus by default. Editing remains explicit through the Edit action and canonical Task editor opener. Workbench does not hide work through candidate dismissal; blocked/stale work is represented through task status and focus selection.

### Version 0.33.6.12a - Workbench view-state split: Focus Selection and Task Focus

**Model: GPT-5.5 Extra High** ? Workbench UX/state architecture correction with framework-owned surface behavior, task action dispatch, and candidate/list behavior changes.

Purpose:

Split the Workbench into two explicit view states:

- **Focus Selection**: the user chooses a focus mode, reviews the recommended next action, and can scan more candidates without committing to one.
- **Task Focus**: the user has selected one task as the active work target, so the page stops showing competing tasks and instead shows the focused task, its checklist, timer controls, and related context.

This is a Workbench-specific view-state correction, not a new module and not a new focus-mode registry entry. The existing focus-mode contract still chooses the candidate set; the new Workbench view state controls whether the user is choosing work or actively focusing on one task.

- [x] Add an explicit Workbench browser state value such as `focus-selection` / `task-focus`, with `focus-selection` as the default.
- [x] Preserve the current focus-mode controls, client filter, project filter, recommended candidate panel, and candidate ranking while in `focus-selection`.
- [x] Change all Workbench candidate primary actions currently labeled/opening as "Open work" so they enter `task-focus` for task candidates instead of opening the Task edit modal.
- [x] Keep non-task candidates on an explicit temporary fallback path until their owning module has a Task Focus-equivalent target view, and label that fallback clearly in code/tests rather than silently opening an editor.
- [x] Remove the `Dismiss` action from recommended and secondary/resume candidates. Workbench should not hide work from the user through dismissal; blocked work is represented by task status, and alternate work is chosen through focus selection.
- [x] Add a persistent header action labeled `Change Focus` in the upper-right action slot, replacing the current `Time Tracker` link. The button exists in both Workbench states, is disabled/quiet in `focus-selection`, and is enabled in `task-focus`.
- [x] When `Change Focus` is activated from `task-focus`, clear the active task focus selection and return to `focus-selection` without changing the current focus mode/client/project filters.
- [x] Preserve browser focus return and keyboard behavior when entering and leaving `task-focus`.
- [x] Do not navigate away from the Workbench when selecting a task for focus.
- [x] Add focused regressions proving:
  - Workbench has explicit Focus Selection and Task Focus states.
  - Candidate primary action enters Task Focus instead of opening `tasks.edit`.
  - `Dismiss` no longer appears on recommended/resume candidate cards.
  - `Change Focus` replaces the `Time Tracker` header action, is disabled in Focus Selection, and exits Task Focus when enabled.
  - Existing focus mode/client/project filters remain intact after returning to Focus Selection.

Acceptance criteria:

- Workbench has a clear two-state model: Focus Selection for choosing work, Task Focus for working one task. Selecting a task no longer opens the edit modal by default, and stale work is not hidden through dismissal.

### Version 0.33.6.12b - Focus Selection cleanup: Inspector owns More in this focus

**Model: GPT-5.4** ? Focused Workbench presentation cleanup after the view-state split, with no service, permission, or architecture change.

Purpose:

Reduce visual competition in Focus Selection by moving the "More in this focus" candidate list into the right-side Inspector surface and removing the duplicate collapsible "More in this focus" section from the main Workbench column.

In Focus Selection, the right panel is a candidate browsing surface. In Task Focus, the right panel becomes true task-context inspection.

- [x] In `focus-selection`, retitle/re-purpose the current right Inspector panel as the surface for "More in this focus" candidates.
  - Heading: `More in this focus`.
  - Helper copy: `Other work matching the selected focus. Choose one to focus it.`
- [x] Remove the main-column `More in this focus` collapsible section entirely.
- [x] Keep the right-side candidate panel bounded and scrollable so it can show a useful list without stretching the whole page.
- [x] Keep the recommended-action panel in the main column showing one candidate at a time.
- [x] Change `RECOMMENDED_CANDIDATE_LIMIT` from `1` to `5`, so the Previous/Next controls cycle through the top five ranked candidates.
- [x] Ensure candidates in the top-five recommendation cycle are not duplicated in the right-side "More in this focus" Inspector list unless the product decision is to show the full ranked set with a clear "currently recommended" marker. Prefer no duplication for calmness.
- [x] Preserve the existing right-panel count badge, but make it count the actual non-recommended overflow candidates shown in the panel.
- [x] Remove any stale regression expectation that recommendations are limited to one candidate window.
- [x] Add focused regressions proving:
  - `RECOMMENDED_CANDIDATE_LIMIT = 5`.
  - Previous/Next cycle through up to five candidates.
  - Main-column `More in this focus` no longer renders.
  - Focus Selection right panel renders overflow candidates.
  - The right panel scrolls/bounds long candidate lists.
  - The selected/recommended candidate is not duplicated in the overflow panel unless explicitly marked as current.

Acceptance criteria:

- Focus Selection shows one recommended task in the main column, lets the user cycle the top five recommendations, and moves all other in-focus candidates into the right-side panel instead of showing another task list in the main column.

### Version 0.33.6.12c-1 - Task Focus main surface: read-only task work view and task actions

**Model: GPT-5.5 Extra High** ? Task Focus introduces task lifecycle actions from a new Workbench view state, requiring careful permission/status/regression handling.

Purpose:

When a task is selected, Workbench should become a focused execution surface for that task rather than an editor or another task list. The main column should hide Focus Selection controls and render a mostly read-only task view with only the execution actions needed while working.

Task Focus main-surface order after this slice:

1. Task action strip.
2. Task summary / selected task heading.
3. Task details, collapsed by default.
4. Checklist, handled in 0.33.6.12c-2.
5. Timers, handled in 0.33.6.12d-1.

- [x] In `task-focus`, hide the Focus Selection controls:
  - "What should we focus on?"
  - Recommended Next Action
  - Focus Selection candidate overflow / right-panel candidate list behavior from 0.33.6.12b
- [x] Render a selected-task heading/summary so the user can immediately tell what task is being focused without opening the edit modal.
- [x] Add a top task action strip with icon-only actions, right-justified near the left edge of the Inspector column with a slight margin.
  - Edit: opens the existing canonical Task edit modal.
  - Complete: completes the task through the existing task lifecycle route/service, then returns to Focus Selection.
  - Block: moves the task to blocked status through the existing task lifecycle route/service and leaves the user in Task Focus unless service behavior requires a refresh fallback.
- [x] Use existing Tasks-owned lifecycle routes/actions; do not invent a Workbench-only task status mutation path.
- [x] Render Task Details as a read-only collapsible section, collapsed by default.
  - Include safe task metadata already exposed to Workbench/task detail reads: title, status, due date/time, priority, assignees, client/project context, blocked reason when present, and description/details if the user can read them.
  - Do not expose raw IDs or hidden/private labels.
- [x] Leave checklist execution out of this slice except for any stable mount point needed by 0.33.6.12c-2.
- [x] Add focused regressions proving:
  - Task Focus hides Focus Selection panels.
  - Task action strip renders icon-only Edit, Complete, and Block actions with accessible labels/titles.
  - Edit opens the canonical Task edit modal.
  - Complete calls the existing lifecycle path and returns to Focus Selection.
  - Block calls the existing lifecycle path and refreshes the focused task state.
  - Task Details is read-only and collapsed by default.

Acceptance criteria:

- Task Focus gives the user a calm, mostly read-only task work surface with explicit Edit, Complete, and Block actions, without opening the Task editor by default or reintroducing Focus Selection panels.

### Version 0.33.6.12c-2 - Task Focus checklist execution

**Model: GPT-5.5 Extra High** ? Checklist mutation from Workbench must preserve Tasks-owned permission checks, progress side effects, audit/event/search behavior, and the canonical editor boundary.

Purpose:

Add checklist execution to the Task Focus main surface from 0.33.6.12c-1 without turning Workbench into a second Task editor.

- [x] Render Checklist as a prominent Task Focus section in the main column.
  - If the task has checklist items, the Checklist section is open by default.
  - If the task has no checklist items, the Checklist section is collapsed by default and shows: `Edit task to add checklist items.`
  - Checklist items can be checked/unchecked inside Task Focus.
  - Task Focus must not add, remove, rename, or reorder checklist items; those remain in the Task edit modal.
- [x] Use existing Tasks-owned checklist routes/services for check/uncheck behavior; do not invent a Workbench-only checklist mutation path.
- [x] Preserve Tasks-owned checklist progress side effects, audit/event/search/notification behavior, and permission checks.
- [x] Keep the Task Focus shell/actions from 0.33.6.12c-1 intact while adding the checklist section.
- [x] Add focused regressions proving:
  - Checklist is open by default when populated.
  - Checklist is collapsed with the required empty message when empty.
  - Task Focus only supports checklist check/uncheck, not add/remove/rename/reorder.
  - Checklist changes dispatch through the existing Tasks-owned mutation path and refresh the focused task state.
  - Checklist permission failures are safely surfaced without leaking hidden task data.

Acceptance criteria:

- Task Focus supports inline checklist execution for the focused task while all checklist structure editing remains in the canonical Task editor.

### Version 0.33.6.12d-1 - Workbench timers by view state and task-linked timer surface

**Model: GPT-5.5 Extra High** ? Workbench timer behavior touches task-linked timer context, elapsed-time controls, and state-specific surface rules.

Purpose:

Cleanly separate timer behavior by Workbench view state and give Task Focus a task-linked timer surface. QAC and the Time Tracking Create Timer modal are handled separately in 0.33.6.12d-2.

Focus Selection timer rule:

- Focus Selection only shows active/paused timers.
- Focus Selection does not show a timer creation form because QAC owns quick capture/create actions.

Task Focus timer rule:

- Task Focus shows a task-linked timer box at the bottom of the main column.
- The timer box is open by default, collapsible, and uses the same caret affordance as other Workbench collapsible sections.
- The top of the box should visually align with the existing Task Timer box in the Task edit modal.
- Active/paused timers appear below the task timer controls and support Start/Pause/Save/Reset behavior consistent with the old Workbench timer model.

- [x] In Focus Selection, remove the manual timer creation row from the Workbench Timers section.
- [x] In Focus Selection, keep the Timers section focused on active/paused timers only.
  - If no timers exist, keep the existing empty state: `No active or paused timers.`
  - Keep the section collapsible with the existing caret behavior.
- [x] In Task Focus, render a task-linked timer section at the bottom of the main column.
  - Open by default.
  - Collapsible with visible caret.
  - Use selected task context automatically; do not require the user to reselect Client/Project/Task.
  - Show controls matching the Task edit modal timer model as closely as practical.
- [x] In Task Focus, list active/paused timers below the task-linked timer controls.
  - Start/Pause/Save/Reset behavior should reuse existing Time Tracking/Tasks timer services and preserve permissions, audit/event/search behavior, and elapsed-time calculations.
- [x] Keep QAC Timer on its current explicit fallback until 0.33.6.12d-2 replaces it with the Time Tracking-owned modal.
- [x] Add focused regressions proving:
  - Focus Selection no longer renders the manual timer creation row.
  - Focus Selection Timers renders only active/paused timers and the no-timers empty state.
  - Task Focus renders a default-open, collapsible timer section with caret.
  - Task Focus timer controls are task-linked and do not require reselecting the task.
  - Active/paused timer controls still support Start/Pause/Save/Reset behavior.
  - QAC Timer fallback behavior is unchanged in this slice.

Acceptance criteria:

- Timer creation moves out of the Focus Selection Workbench section, while Task Focus gets a task-linked timer surface suited to actively working the selected task.

### Version 0.33.6.12d-2 - Time Tracking Create Timer modal for QAC and shared dispatch

**Model: GPT-5.5 Extra High** ? Crosses Time Tracking, QAC, and shared module-action dispatch while preserving timer creation rules, billable inheritance, focus return, and host refresh behavior.

Purpose:

Add a Time Tracking-owned Create Timer modal so users can start timers through QAC and future framework surfaces without navigating away from the current page.

Time Tracking modal rule:

- Time Tracking owns a new Create Timer modal and registers it as a shared module action.
- QAC Timer opens that modal instead of navigating to `time-tracker.html`.

- [x] Build a Time Tracking-owned Create Timer modal.
  - Register a module action such as `time-tracking.timer.create`.
  - Modal should support quickly creating/starting a timer with Client, Project, optional Task, Description, and Billable behavior consistent with existing timer rules.
  - Billable inheritance should match the existing Time Tracking/Task timer behavior.
  - The modal must be usable from QAC and future Workbench surfaces through `LongtailForge.moduleActions`.
  - The modal must return focus to the trigger and notify the host to refresh timer state after save/start.
- [x] Update the QAC Timer action to open the new Time Tracking Create Timer modal.
- [x] Remove the previous QAC Timer temporary page fallback once the modal is registered and covered.
- [x] Add focused regressions proving:
  - Time Tracking registers a Create Timer module action.
  - QAC Timer dispatches the Create Timer modal instead of navigating to Time Tracker.
  - The modal supports Client, Project, optional Task, Description, and Billable behavior consistent with existing timer rules.
  - Focus return and host timer refresh occur after modal close/save/start.

Acceptance criteria:

- QAC Timer uses a Time Tracking-owned Create Timer modal through the shared module-action registry, with the temporary Time Tracker page fallback removed.

### Version 0.33.6.12e-1 - Task Focus related-context service and ranking algorithm

**Model: GPT-5.5 Extra High** ? Cross-module, permission-shaped context aggregation around a focused task with Files/Notes/Lists/Tags integration risk.

Purpose:

Build the permission-shaped related-context read model that Task Focus Inspector will consume in 0.33.6.12e-2. This slice is about selected-task context aggregation and ranking, not Inspector presentation.

Context ordering algorithm:

1. Linked context Notes directly linked to the task.
2. Files attached to the task.
3. Lists linked to the task.
4. Other active tasks in the same project.
5. Tasks, Notes, Files, and Lists sharing the same direct tags as the task.

Refinements:

- Direct task links outrank shared project.
- Shared project outranks shared tags.
- Direct tags mean manually/directly assigned tags, not propagated/effective/system tags, unless a later roadmap slice explicitly changes that.
- Deduplicate records that match through multiple reasons and keep the strongest reason.
- Bound each group to a calm display count with "View more" or equivalent future-safe affordance only if an existing module route/modal can handle it safely.
- Do not expose body text, secure note bodies, protected file data, storage keys, scanner internals, raw IDs, or unreadable labels.

- [x] Add a Workbench Task Focus related-context service path that returns a permission-shaped read model for one selected task.
  - Prefer provider/service integration over Workbench directly querying other modules' tables.
  - Use existing Notes linked-context providers/helpers where available.
  - Use Files service/attachment read models for task attachments.
  - Use Lists linked-record service/provider behavior for lists linked to the task.
  - Use Tasks service/repository paths for same-project task context.
  - Use Tags service/provider paths for direct shared-tag context.
- [x] Shape each related item with:
  - module ID / source label
  - record type
  - safe readable title
  - short safe context/reason label
  - existing module action ID or explicit fallback URL
  - badges/chips where safe
- [x] Keep this service independent from focus-mode candidate overflow; it must resolve context from the selected task.
- [x] Add focused regressions proving:
  - The related-context service uses selected-task context, not focus-mode candidate overflow.
  - Related items are ordered by linked notes, task files, linked lists, same-project tasks, then direct shared tags.
  - Items are deduplicated with strongest reason preserved.
  - Unreadable/private/secure/file-storage-sensitive content is excluded or safely labeled.
  - Direct tags are used for shared-tag matching, not propagated/effective/system tags.
  - Related item action descriptors are existing module actions or explicit safe fallbacks.

Acceptance criteria:

- Task Focus has a permission-shaped selected-task related-context read model for notes, files, lists, related project work, and direct shared-tag records without leaking unsafe content or depending on generic focus-mode candidates.

### Version 0.33.6.12e-2 - Task Focus Inspector related-context UI and action dispatch

**Model: GPT-5.5 Extra High** ? Task Focus Inspector UI consumes cross-module context and dispatches existing module actions without becoming an embedded viewer or leaking unsafe labels.

Purpose:

Make the Inspector mean what it was originally intended to mean in Task Focus: context around the current working task, not a list of unrelated candidates from the selected work mode.

In Task Focus, the Inspector becomes a collapsible, scrollable related-context panel for the selected task, backed by the read model from 0.33.6.12e-1.

- [x] In Task Focus, keep the Inspector visible on wide layouts but make it collapsible.
  - Default open.
  - Visible caret.
  - Scrollable list body.
  - Collapsed state should preserve layout without stealing focus.
- [x] In narrow layouts, preserve the current graceful hide/collapse behavior unless a later mobile-specific slice designs a drawer.
- [x] Render related items from the selected-task related-context read model, not from focus-mode candidate overflow.
- [x] Clicking a related item opens the existing module preview/edit modal when one exists.
  - Notes: existing note editor/preview path as available.
  - Files: existing File Preview or File Context modal, depending on whether the item represents previewable content or attachment context.
  - Lists: existing list editor/detail opener if registered.
  - Tasks: existing task editor only when explicitly choosing Edit/Open from context, not as the primary Task Focus selection behavior.
- [x] Do not build an embedded preview pane inside the Inspector.
- [x] Add focused regressions proving:
  - Inspector is collapsible with a caret, default-open in Task Focus, scrollable, and hidden/collapsed safely on narrow screens.
  - Inspector rows render the service-provided safe titles, source labels, reason labels, and badges/chips.
  - Task Focus Inspector uses selected-task related context rather than Focus Selection overflow candidates.
  - Related items dispatch existing module actions or explicit safe fallbacks.
  - No embedded Inspector preview pane is introduced.

Acceptance criteria:

- In Task Focus, the Inspector renders selected-task context from the related-context service, stays collapsible and responsive, dispatches existing module actions or safe fallbacks, and does not become an embedded viewer.

### Version 0.33.6.12f - Resume candidate correction: second-most-recent updated task boost

**Model: GPT-5.5 Extra High** ? Ranking behavior correction touching resume/candidate ordering and deterministic focus behavior.

Purpose:

Adjust "Pick up where I left off" so it better handles interruption recovery.

When the user chooses "Pick up where I left off," the first visible candidate should be the **second-most-recently updated active task** the user can read, because the most recently updated task is often the interruption itself. After that boosted task, the existing resume/candidate list should continue in its normal order, deduplicated.

- [x] For the `pick-up-where-left-off` focus, compute a second-most-recently updated visible task candidate.
  - Exclude completed and archived tasks.
  - Respect workspace scope, readable task permissions, enabled-module state, private/secure boundaries, and current client/project filters.
  - Use task `updated_at` / canonical task update timestamp, not browser-local ordering.
  - If fewer than two eligible recently updated tasks exist, do not fabricate a boost; fall back to the existing resume/candidate ordering.
- [x] Prepend the second-most-recent updated task to the `pick-up-where-left-off` candidate list.
- [x] Deduplicate the boosted task if it already appears elsewhere in the list.
- [x] Preserve the existing resume-first strategy for active resume rows and active timers unless this boost is explicitly being applied to the task list after those higher-priority resume signals.
  - Preferred ordering: running timer / paused timer resume rows remain strongest; then second-most-recent updated task; then the rest of the resume/candidate list.
- [x] Keep candidate ranking deterministic and testable.
- [x] Add focused regressions proving:
  - The second-most-recent updated readable active task is boosted for Pick up where I left off.
  - The most recently updated task is not the boost target when at least two eligible tasks exist.
  - Completed/archived/unreadable/disabled-module tasks are excluded.
  - Client/project filters are respected.
  - The boosted task is deduplicated from the remaining list.
  - Running/paused timer resume precedence remains intact.

Acceptance criteria:

- "Pick up where I left off" intentionally helps recover the prior work thread after an interruption by boosting the second-most-recent updated eligible task without breaking resume/timer precedence or permission safety.

### Version 0.33.6.12g - Workbench view-state isolation: hide opposite-state panels

**Model: GPT-5.4** ? Single Workbench presentation/state correction with no service, permission, or schema change.

Purpose:

Correct Workbench state isolation so each view state renders only its own surface. When a task is selected, the Focus Selection panels must be completely out of view until the user activates `Change Focus`. When Workbench is in Focus Selection, Task Focus-only boxes, disabled task action buttons, selected-task shells, and task timer placeholders must be completely out of view.

- [x] In `task-focus`, completely hide/remove from visible layout:
  - `What should we focus on?`
  - Focus-mode question cards.
  - Client/Project focus filters.
  - `Recommended Next Action`.
  - Focus Selection recommendation cycling controls.
- [x] In `focus-selection`, completely hide/remove from visible layout:
  - Task Focus action strip/box.
  - Disabled Edit/Complete/Block/Pause-style task action buttons.
  - Selected-task summary placeholders.
  - Task Details / Checklist / Task Timer shells.
  - Any empty wrapper card reserved only for Task Focus.
- [x] Ensure hidden opposite-state panels do not leave blank space, scroll height, visible headings, tab stops, or screen-reader confusion.
- [x] Keep `Change Focus` as the only way back to Focus Selection from Task Focus.
- [x] When `Change Focus` returns to Focus Selection, clear the active Task Focus UI state enough that no Task Focus box remains visible, while restoring the previously selected focus mode and Client/Project filters without mutating them.
- [x] Preserve reload/refresh behavior: if the implementation persists Task Focus across refresh, Focus Selection panels must still stay hidden until `Change Focus`; if it intentionally falls back to Focus Selection, document and test that behavior explicitly.
- [x] Add focused regressions proving:
  - Task Focus does not render visible Focus Selection controls or Recommended Next Action.
  - Task Focus has no focusable controls from the hidden Focus Selection panels.
  - Focus Selection does not render the Task Focus action box, disabled task buttons, selected-task summary, or task timer shells.
  - Focus Selection has no focusable controls from hidden Task Focus panels.
  - `Change Focus` restores Focus Selection panels and keeps focus mode/client/project filter state intact.
  - Focus Selection continues to render its panels normally.

Acceptance criteria:

- Task Focus shows only the selected task work surface and task-context Inspector, while Focus Selection shows only focus choice/recommendation/candidate-overflow surfaces. Neither state leaks boxes, controls, tab stops, or empty placeholders from the other state.

### Version 0.33.6.12h - Task Focus Inspector same-project due-date ordering

**Model: GPT-5.4** ? Narrow selected-task related-context ordering correction with existing permission-shaped read models.

Purpose:

Sort the Task Focus Inspector's same-project task group so nearer due dates are prioritized. The Inspector is already showing the correct related tasks; this slice corrects their order.

- [x] In Task Focus related context, sort the `Same project tasks` group by due date proximity:
  - Overdue and due-today tasks first.
  - Then future due dates from nearest to farthest.
  - Tasks with no due date after dated tasks.
- [x] Keep ordering deterministic within equal due-date buckets.
  - Use existing task priority/status/update/title tie-breakers where they already exist.
  - Do not rely on browser insertion order.
- [x] Preserve the selected-task related-context group ordering from 0.33.6.12e-1; this slice only changes ordering inside the same-project task group unless a bug requires a tightly documented adjustment.
- [x] Preserve permission pruning, enabled-module checks, workspace scope, private/secure boundaries, and safe labels.
- [x] Add focused regressions proving:
  - Same-project tasks in Task Focus Inspector are ordered by nearest due date.
  - No-due-date tasks appear after dated same-project tasks.
  - Ties are deterministic.
  - Unreadable/completed/archived/disabled-module tasks do not leak into the group.
  - Other related-context groups keep their intended precedence.

Acceptance criteria:

- Task Focus Inspector still shows selected-task related context, but same-project tasks are ordered by useful due-date proximity instead of arbitrary or stale ordering.

### Version 0.33.6.12i - Task Focus summary metadata cleanup and chips

**Model: GPT-5.4** ? Contained Workbench Task Focus presentation correction using existing task read-model fields.

Purpose:

Clean up the selected-task summary in Task Focus so Client/Project context appears once and the task metadata chips live in the expected summary row.

- [x] Remove duplicated Client/Project context from the Task Focus summary card.
  - The selected task's Client/Project path should appear once in the Task Focus summary region.
  - Do not duplicate the same Client/Project line immediately below itself.
- [x] Add/restore the Task Focus summary chip row for the usual task metadata:
  - Status.
  - Priority.
  - Due date/time where present.
  - Tags where present and safe to show.
  - Other existing safe task chips already used by the Tasks surface when available.
- [x] Keep chip labels safe and readable; do not expose raw IDs, hidden client/project labels, inaccessible tags, or private/secure data.
- [x] Keep the read-only `Task Details` section available for expanded detail, but avoid using it as the only place where summary-level status/priority/due/tags can be seen.
- [x] Preserve Task Focus action strip layout, checklist section, timer section, and Inspector layout.
- [x] Add focused regressions proving:
  - Task Focus summary renders Client/Project context once.
  - Status, priority, due date/time, and safe tags render as chips in the summary row.
  - No raw IDs or hidden labels appear in the chip row.
  - Task Details remains read-only and does not regress action/checklist/timer behavior.

Acceptance criteria:

- Task Focus summary is compact and non-redundant: Client/Project context appears once, and status/priority/due/tags are visible as chips in the selected-task summary row.

### Version 0.33.6.12j - Recurring checklist propagation through All Future Tasks

**Model: GPT-5.5 Extra High** ? Tasks recurrence/checklist mutation correctness touches canonical editor payloads, recurrence series updates, future instance generation, audit/search/event side effects, and data integrity.

Purpose:

Ensure checklist structure changes made on a recurring task are wired into recurrence updates when the user chooses `All Future Tasks`.

Observed correction:

- A completed recurring task occurrence can have checklist items, while later generated occurrences in the same series show `0 / 0 complete`. If the checklist was saved to `All Future Tasks`, future occurrences should inherit the checklist structure.

Product rule:

- `All Future Tasks` applies checklist **structure** to the recurrence series and eligible future occurrences.
- Future generated occurrences inherit checklist item text/order from the recurrence series.
- Checklist completion state does not carry forward as completed work; future occurrences should start with the copied checklist items unchecked unless an existing future occurrence already has its own preserved progress.

- [x] Audit the canonical Task editor save path for recurring tasks and confirm whether checklist changes are included in the `All Future Tasks` update payload.
- [x] Wire checklist item structure into the recurrence-series update path used by the `All Future Tasks` button.
  - Include item text, order, and active/deleted state needed to reproduce the checklist.
  - Do not copy completed/check-state as completed future work.
- [x] Ensure newly generated future recurrence instances inherit the saved checklist structure.
- [x] Ensure already-generated eligible future instances in the same series receive the checklist structure when `All Future Tasks` is applied.
  - Do not alter past instances.
  - Do not alter completed/archived instances unless the existing recurrence-update contract already explicitly includes them and tests prove the behavior is intended.
  - Preserve existing per-instance checklist progress where a future occurrence already has progress that can be safely matched.
- [x] Preserve Tasks-owned permissions, validation, audit/event/search/notification side effects, and recurrence update semantics.
- [x] Keep checklist structure editing in the canonical Task editor; Task Focus continues to execute checklist check/uncheck only.
- [x] Update Tasks documentation to record the `All Future Tasks` checklist-structure propagation rule and occurrence-specific checklist completion state.
- [x] Add focused regressions proving:
  - Editing a recurring task checklist and choosing `All Future Tasks` updates the recurrence series checklist structure.
  - Future generated instances inherit checklist items.
  - Already-generated eligible future instances receive the checklist items.
  - Copied checklist items start unchecked on new future occurrences.
  - Past/completed/archived instances are not unexpectedly rewritten.
  - Per-instance checklist progress is preserved where safe.
  - Task Focus shows the propagated checklist for a future recurring occurrence.

Acceptance criteria:

- A checklist saved to `All Future Tasks` on a recurring task appears on future occurrences of that recurring task, with structure propagated through recurrence and future task generation while completion state remains occurrence-specific.

### Version 0.33.6.12k - Task Focus timer de-duplication and Other Active Timers

**Model: GPT-5.5 Extra High** ? Timer-state/rendering correction touches task-linked timers, active/paused timer filtering, elapsed-time display, and Workbench/Time Tracking behavior.

Purpose:

Clean up Task Focus timer behavior so the focused task's timer has one visible representation and the secondary timer panel only shows other active work.

Current correction:

- Starting the Task Focus timer can create a second timer card below the task timer controls.
- That duplicate card can drift from the live task timer display.
- The lower timer panel can also show the focused task's active/paused timer, even though the user is already inside that task.

Product rule:

- In Task Focus, the selected task's timer appears only in the Task Timer section for the focused task.
- The lower timer panel is renamed `Other Active Timers` and shows only running/paused timers for other tasks or manual timers.

- [x] In Task Focus, remove/filter the focused task's running/paused timer from any lower timer list or card below the task-linked timer controls.
- [x] Do not render a duplicate timer card for the focused task after starting, pausing, saving, or resetting the task-linked timer.
- [x] Ensure the Task Timer section's live counter updates immediately after Start and continues updating while running without waiting for Pause or a full refresh.
- [x] Rename the Task Focus lower timer panel heading from `Timers` to `Other Active Timers`.
- [x] In `Other Active Timers`, show only active/paused timers that are not tied to the focused task.
  - Other task timers remain eligible.
  - Manual timers remain eligible.
  - The focused task's active/paused timer is always excluded from this panel.
- [x] If no other active/paused timers exist, show `No other active or paused timers.`
- [x] Preserve Focus Selection timer behavior from 0.33.6.12d-1; outside Task Focus, the general timer list can continue to show all active/paused timers because there is no currently focused task to exclude.
- [x] Reuse existing Task/Time Tracking timer services and preserve permissions, elapsed-time calculations, audit/event/search behavior, and focus return.
- [x] Add focused regressions proving:
  - Starting a Task Focus timer does not create a duplicate focused-task timer card.
  - The focused task's running/paused timer is excluded from `Other Active Timers`.
  - Other task timers and manual timers still appear in `Other Active Timers`.
  - The Task Timer live counter updates while running.
  - The lower panel heading is `Other Active Timers`.
  - The empty state reads `No other active or paused timers.`
  - Focus Selection timer behavior is unchanged.

Acceptance criteria:

- Task Focus has exactly one visible representation of the focused task's timer. The lower timer panel is labeled `Other Active Timers`, excludes the focused task's timer, and only shows other running/paused task or manual timers.

### Version 0.33.6.12l - Task Focus checklist-driven status transitions

**Model: GPT-5.5 Extra High** ? Task lifecycle transitions touch checklist mutation routes, status side effects, audit/events/search, and Task Focus read refresh behavior.

Purpose:

Make Task Focus checklist execution update task status in the way the work surface implies: checking work means the task has started; clearing all checked work returns the task to not-started.

Product rule:

- Checking any checklist item on an `Open` task moves the task to `In Progress`.
- Unchecking all checklist items on an `In Progress` task moves the task back to `Open`.
- The transition is Tasks-owned and should apply through the existing checklist check/uncheck service path, not as browser-only state in Workbench.

- [x] On checklist `check`, transition eligible `Open` tasks to `In Progress` after the checked state is saved.
- [x] On checklist `uncheck`, transition eligible `In Progress` tasks to `Open` only when no checklist items remain checked.
- [x] Do not reopen or rewrite `Complete`, `Archived`, or `Blocked` tasks through checklist toggles.
- [x] Preserve existing checklist mutation behavior: progress counts, refreshed task payloads, audit records, internal events, search updates, notifications, and permission/module/workspace checks.
- [x] Ensure Task Focus refreshes the summary chip/status text immediately after the checklist mutation response.
- [x] Keep checklist structure editing in the canonical Task editor; Task Focus remains check/uncheck only.
- [x] Add focused regressions proving:
  - Checking the first/any checklist item on an `Open` task returns an `In Progress` task payload.
  - Unchecking the last checked checklist item on an `In Progress` task returns an `Open` task payload.
  - Unchecking one of several checked items keeps the task `In Progress`.
  - Completed, archived, and blocked tasks are not status-mutated by checklist toggles.
  - Task Focus displays the refreshed status without requiring a full page reload.

Acceptance criteria:

- Task Focus checklist progress and task status stay aligned: started checklist work marks the task `In Progress`, and clearing all checklist work returns eligible in-progress tasks to `Open`, without overriding stronger lifecycle states or bypassing Tasks-owned side effects.

### Version 0.33.6.12m - Task Focus linked-note view modal and edit handoff

**Model: GPT-5.5 Extra High** ? Linked note viewing can expose note body content, Markdown rendering, private/secure-note boundaries, modal stacking, and cross-module action behavior.

Purpose:

Make linked notes in the Task Focus Inspector readable first. A linked note title should open a rendered Markdown view, with editing available as an explicit secondary action.

Product rule:

- Clicking a linked note in Task Focus opens a note view/read modal, not the edit modal.
- The view modal renders Markdown so the note remains readable as reference context.
- The view modal includes an `Edit` action that closes the view and opens the canonical Notes edit modal for the same note.

- [x] Update Task Focus Inspector linked-note actions to prefer a Notes-owned view/read modal or module action instead of `notes.edit`.
- [x] If a reusable Notes view modal/action does not already exist, add the smallest Notes-owned view modal needed for linked-context consumption.
- [x] Render Markdown through the existing Notes/Markdown rendering path; do not show raw Markdown as the primary read surface.
- [x] Include an explicit `Edit` button/action in the view modal that closes the view modal and opens the existing Notes edit modal with normal focus return and refresh hooks.
- [x] Preserve Notes permissions, private-note behavior, secure-note behavior, body visibility rules, stale/deleted target handling, and no-raw-ID labels.
- [x] Keep Task Focus free of embedded preview panes; this is a modal handoff, not an inline Inspector reader.
- [x] Add focused regressions proving:
  - Task Focus linked-note clicks open the view/read modal path, not the edit path.
  - Markdown-rendered note content is visible in the view modal for readable notes.
  - The view modal `Edit` action opens the canonical edit modal for the same note.
  - Private/secure/unreadable/stale linked notes do not leak body content or raw IDs.

Acceptance criteria:

- Linked notes in Task Focus behave like readable reference context by default, preserving Markdown formatting, while a clear Edit action still reaches the canonical Notes editor when editing is intentional.

### Version 0.33.6.12n - Recurring linked-note propagation through All Future Tasks

**Model: GPT-5.5 Extra High** ? Recurrence propagation touches Tasks recurrence templates, linked Notes/Linked Context persistence, generated future instances, and data-integrity boundaries.

Purpose:

Make linked notes useful on recurring work by ensuring note links saved to a recurring task can carry forward through `All Future Tasks`, instead of requiring the same note to be re-linked every week.

Scope:

- This slice is about linked Notes on recurring Tasks.
- Do not generalize every Linked Context target type unless the existing storage contract already makes that safer than a Notes-only implementation.
- Do not copy note body content into recurrence templates or tasks; propagate only the relationship/link metadata needed to reconnect future task instances to the same readable note.

- [x] First prove the current behavior with a recurrence fixture: add a linked note to one occurrence, save with `All Future Tasks`, inspect existing future occurrences and newly generated recurrence instances.
- [x] If linked notes already propagate correctly, add regressions/docs that lock that behavior and update the user-facing/developer contracts.
- [x] If linked notes do not propagate, store the active linked-note relationship structure needed by the recurrence template when `All Future Tasks` is selected.
- [x] Apply saved linked-note structure to eligible future active occurrences in the same recurring series.
- [x] Copy saved linked-note structure into newly generated recurrence instances.
- [x] Do not rewrite past occurrences, completed occurrences, archived occurrences, or unrelated tasks.
- [x] Preserve occurrence-specific task state, checklist completion state, timer state, audit/event/search behavior, permissions, and Notes visibility rules.
- [x] Decide and document how removals behave: removing a linked note and saving `All Future Tasks` should remove that propagated link from eligible future occurrences only, without deleting the note itself.
- [x] Add focused regressions proving:
  - A linked note saved with `All Future Tasks` appears on eligible future recurring occurrences.
  - Newly generated recurrence instances inherit the saved linked note.
  - Removing a linked note with `All Future Tasks` removes it from eligible future occurrences without touching the note record.
  - Past/completed/archived occurrences are not unexpectedly rewritten.
  - Task Focus Inspector shows the propagated linked note on a future recurring occurrence.

Acceptance criteria:

- A linked note saved to a recurring task with `All Future Tasks` remains linked on future occurrences and newly generated instances, while note bodies, occurrence-specific state, and ineligible historical/completed/archived tasks remain untouched.

### Version 0.33.6.12o - Workbench overdue inclusion across focus modes

**Model: GPT-5.5 Extra High** - Cross-mode Workbench candidate eligibility/ranking correction where hidden overdue work would silently weaken recovery recommendations.

Purpose:

Make overdue work visible and first-priority anywhere a Workbench focus mode is meant to recover due, project-scoped, or urgent active task work. Overdue tasks should not be excluded by due-window lower bounds or source gaps; they should push due-today, upcoming, and no-due work downward inside the relevant mode.

Scope:

- Workbench Focus Selection candidate eligibility and ordering for task-derived candidates.
- Server-side focus/source read models, recommended-action ordering, and Inspector overflow ordering.
- Existing client/project filters, permissions, module enablement, recurring-created suppression, and task lifecycle exclusions.
- Do not change Task Focus execution surfaces, task status semantics, canonical Tasks list views, Dashboard behavior, or recurrence generation behavior in this slice.

- [x] Audit every user-facing Workbench focus mode and every task-candidate source path that can include due dates:
  - `Start with what's due` / `whats-due-next`.
  - `Work this week`.
  - `Focus on a project`.
  - `Pick up where I left off`, including resume fallback behavior and the second-most-recent task boost.
  - `Review blocked work`, including blocked tasks that are also overdue.
  - The default Focus Selection bootstrap candidate list, if it can feed recommendations before a focus mode reload completes.
- [x] Fix the due-focused modes so overdue active tasks are included first:
  - `Start with what's due` includes readable active overdue tasks before due-today and upcoming due work.
  - `Work this week` includes readable active overdue tasks before due-today and current-week work, instead of using a lower-bound date filter that hides overdue work.
  - Future-dated work outside the selected due window remains excluded unless another mode explicitly allows it.
- [x] Fix `Focus on a project` so overdue active tasks inside the selected project are eligible and ranked before due-today, upcoming, stale/recent, and no-due project work.
- [x] Preserve explicit Client and Project filter boundaries: overdue work from other clients/projects must not leak into scoped modes, and parent/child hierarchy behavior remains whatever the current exact-match filter contract allows until the later hierarchy standard lands.
- [x] Review whether focus modes that promise due/project work need a Tasks-owned active-task candidate source in addition to resume-state rows and live timers, so overdue tasks are not hidden merely because they lack a recent resume-state signal.
- [x] Keep `Pick up where I left off` resume-first behavior intact: running/paused timers and stronger resume rows stay ahead of fallback due work, but overdue task fallback candidates and the second-most-recent task boost must not be filtered out when they are inside the current Client/Project scope.
- [x] Keep `Review blocked work` semantically blocked-only: blocked overdue tasks rank before less urgent blocked work, but non-blocked overdue tasks stay in due/project modes instead of being recast as blocked work.
- [x] Ensure the Focus Selection recommended-action top-five window and right-side Inspector overflow are derived from the same ordered candidate list, so overdue items are not visible in one surface but hidden or reordered in the other.
- [x] Preserve recurrence passive-created suppression except where the task is overdue or inside the existing near-due window; an overdue recurring occurrence should be recoverable rather than hidden as passive generated noise.
- [x] Add focused regressions with fixture coverage for overdue, due-today, current-week, future-out-of-window, no-due, blocked-overdue, blocked-not-overdue, different-client, different-project, completed, archived, unreadable, disabled-module, and passive recurring-created tasks.
- [x] Update the existing Workbench focus-mode regression expectations that currently assert overdue tasks are absent from `Work this week`.
- [x] Add or update static/docs regressions proving the Workbench contract states:
  - Due-focused modes include overdue work first.
  - Project focus does not hide overdue project tasks.
  - Focus Selection recommendation cycling and Inspector overflow share one canonical overdue-aware order.
  - Browser code renders the service-owned candidate order instead of rebuilding overdue logic.
- [x] Update `docs/module-contract.md`, `docs/view-building-contract.md`, `docs/ui-surface-contract.md`, and `docs/tasks-module.md` only for the behavior actually changed.
- [x] Update `CHANGELOG.md`, package metadata, and roadmap archive bookkeeping as part of the implementation closeout.
- [x] Run the focused Workbench focus-mode regressions, relevant Workbench UI/static regressions, `npm run check`, and `/api/app-info` verification after restart.

Acceptance criteria:

- Workbench no longer hides overdue active tasks from due-focused or project-focused recommendations. Overdue tasks appear first in every relevant Focus Selection recommendation and Inspector overflow list while permissions, Client/Project scope, blocked-only semantics, recurrence suppression, and Task Focus boundaries remain intact.

Slice-sizing note:

- `0.33.6.13` is intentionally compressed to four implementation slices plus closeout.
- The earlier split between Dashboard attention and the Tasks Dashboard card added ceremony without real isolation value; they now land together.
- The earlier split between module-overview/activity work and the final Dashboard polish likewise added a second ceremony pass over the same surface; polish now closes with the final guardrail/docs sweep.

### Version 0.33.6.13a - Dashboard foundation: product contract, placement, service boundary, and Workspace Pulse

**Model: GPT-5.5 Extra High** ? This slice establishes the full framework-owned Dashboard foundation in one pass so later panel work lands on the final host/data contract instead of a temporary intermediary.

Purpose:

Turn the remaining Dashboard placeholder into an explicit product and implementation contract, with the final framework-owned host boundary and top-level Workspace Pulse in place before module panel reshaping begins.

Dashboard becomes the workspace pulse/orientation surface:

1. Is anything on fire?
2. What changed recently?
3. What areas of this workspace need attention?
4. Where should I go next?

Boundary:

- Dashboard summarizes state, pressure, and direction.
- Workbench owns active work, focus selection, Task Focus, next actions, resumable work, active timers, and recovery.
- Reporting owns detailed time, billing, charts, and financial analysis.
- Module pages own full lists, record management, and detailed workflows.
- QAC owns quick capture.

Surface rule:

Dashboard surface = summary, pressure, and direction.

Dashboard may show:

- Counts.
- Reasons.
- Safe short labels.
- Up to 3-5 rows when a short list is useful.
- One obvious drilldown/action per panel.
- Empty states that tell the user where useful work will appear.

Dashboard must not show:

- Full task lists.
- Full report tables.
- Full charts as default content.
- Inline editors.
- Full module indexes.
- Billing tables/charts as default panels.
- Browser-rebuilt permission, ranking, or workspace-scope logic.
- Raw IDs, hidden labels, secure/private content, storage keys, scanner data, audit payload JSON, protected paths, or signed URLs.

Drilldown rule:

- Do the work -> Workbench.
- See the full list -> owning module page with filter/query when supported.
- Analyze time/money -> Reporting.
- Inspect one thing -> existing owning-module read/preview/modal action when already safe.
- Configure/fix setup -> Settings/Admin.
- Capture something -> QAC.

Implementation scope:

- [x] Add or formalize a Dashboard contribution placement field, such as:
  - `pulse`
  - `attention`
  - `today`
  - `main`
  - `activity`
  - `secondary`
  - `reporting`
- [x] Default existing/legacy Dashboard contributions to `main` when no placement is declared.
- [x] Update the manifest validator to reject unknown placement values.
- [x] Update `public/js/dashboard.js` so placement is driven by contribution metadata, not hardcoded contribution IDs.
- [x] Remove the `project-summary` special-case for deciding panel placement.
- [x] Add framework-owned Dashboard regions:
  - Workspace Pulse.
  - Needs Attention.
  - Today / Upcoming.
  - Module Overview.
  - Recent Activity.
  - Secondary / Reporting shortcuts.
- [x] Move Dashboard read-model ownership out of `reporting.service.js` into a framework-owned Dashboard service/route module while keeping `/api/dashboard` stable.
  - A thin compatibility wrapper is acceptable if moving route ownership all at once is risky.
- [x] Dashboard service may assemble:
  - Workspace summary.
  - Workspace type.
  - Active Dashboard contribution metadata.
  - Framework-owned layout/placement metadata.
  - Safe high-level signal counts where they already come through framework or contribution seams.
- [x] Dashboard service must not directly import first-party module services/repos to make generic decisions.
- [x] Module-specific data must hydrate through module-owned `dataRoute` endpoints or registered contribution seams.
- [x] If any direct coupling remains temporarily, document it in `0.33.6.13z` with file/function, reason, retained coverage owner, and follow-up version.

Workspace Pulse:

- [x] Add a top full-width Workspace Pulse strip.
- [x] Show workspace name.
- [x] Show a compact signal line, such as:
  - Overdue count.
  - Due-soon count.
  - Blocked count.
  - Active/paused timer count.
  - Recent activity count if safely available.
  - Setup/system warning count if present.
- [x] One primary action: `Open Workbench`.
- [x] Secondary signal links may point to:
  - Workbench focus modes.
  - Filtered module page.
  - Reporting.
  - Settings/Admin for setup issues.
- [x] Keep copy calm and practical.
- [x] Do not include full task rows, full timer rows, full activity rows, or billable tables in the pulse strip.

Setup / Admin warnings:

- [x] Add a conditional warnings area that appears only when needed.
- [x] Eligible warnings may include:
  - Module enabled but missing setup data.
  - Integration/storage/scanner/job/runtime warnings already available through safe diagnostics.
  - Search indexing/job failure counts if safe and already available.
  - Time Tracking active timer warnings when they can be safely summarized.
- [x] Do not expose:
  - Secrets.
  - Raw runtime values.
  - Job payload JSON.
  - Storage paths/keys.
  - Scanner internals.
  - Raw IDs.
- [x] Hide the warning region completely when there are no warnings.

Workspace-type gating:

- Business workspaces may show Client-aware labels only where current permissions and safe labels allow.
- Personal/Family workspaces must not show:
  - Client filter/radio controls.
  - Client reporting language.
  - Billable amount.
  - Invoice-ready amount.
  - Billing chart.
  - Current Month Billables.
  - Client-only labels.

Regressions:

- [x] Dashboard protected HTML remains a minimal host.
- [x] Dashboard host renders framework-owned regions through shared view primitives.
- [x] Dashboard contribution placement accepts only known placement values.
- [x] Existing contributions without placement default to `main`.
- [x] Browser Dashboard placement no longer special-cases `project-summary`.
- [x] `/api/dashboard` remains stable.
- [x] Dashboard read-model is framework-owned or routed through a documented thin wrapper.
- [x] Dashboard service does not import first-party module services/repos for generic Dashboard decisions outside an allowlist.
- [x] Workspace Pulse renders with safe summary signals.
- [x] Workspace Pulse has exactly one primary Workbench action.
- [x] Setup/admin warnings appear only when safe warning data exists.
- [x] Setup/admin warning payloads do not expose raw job payloads, scanner internals, storage paths/keys, secrets, or raw IDs.
- [x] Dashboard still hides disabled/unpermitted contributions through existing contribution filtering.
- [x] Dashboard empty state appears when no panels are available.
- [x] Personal/Family pulse does not show Client/billable/billing language.
- [x] Business pulse respects permission-shaped labels.
- [x] Disabled/unpermitted modules do not contribute pulse signals.

Docs:

- [x] Update `docs/module-contract.md`.
- [x] Update `docs/view-building-contract.md`.
- [x] Update `docs/ui-surface-contract.md`.
- [x] Update `docs/declarative-view-surfaces.md`.
- [x] Update `CHANGELOG.md`, package metadata, and roadmap archive bookkeeping as normal.

Verification:

- [x] Run focused Dashboard host/contribution regressions.
- [x] Run Dashboard service/route regressions.
- [x] Run manifest-contract regressions.
- [x] Run relevant static guardrails.
- [x] Run permission regressions if route/module visibility changed.
- [x] Run `npm run check`.
- [x] Restart and verify `/api/app-info`.

Acceptance criteria:

- Dashboard has a documented product contract and contribution placement contract.
- Dashboard layout regions are framework-owned and contribution-driven.
- Dashboard has a framework-owned read-model boundary and a calm Workspace Pulse that summarizes workspace state without becoming a task list, report, or editor surface.
- Safe setup/admin warnings appear only when needed and do not leak sensitive/internal data.
- Existing Dashboard panels can still render through default placement.
- No framework/browser Dashboard placement logic depends on first-party panel IDs.

### Version 0.33.6.13b - Dashboard attention surfaces and Tasks pressure card

**Model: GPT-5.5 Extra High** ? Urgent/near-term attention and the Tasks Dashboard reshaping share one task-pressure contract, one dedupe story, and one set of Workbench-facing drilldowns, so they should land together.

Purpose:

Replace the noisy task/report visibility on Dashboard with one urgent attention surface, one calmer near-term horizon surface, and one Tasks-owned pressure card that all reinforce the same Dashboard/Workbench boundary.

Product rule:

- Dashboard can show what needs attention.
- Workbench is where the user focuses and works.
- Tasks remains list-first.
- Dashboard should point to Workbench or module pages; it should not become a second Workbench candidate list or a full task index.

Needs Attention:

- [x] Add a first main Dashboard panel titled `Needs Attention`.
- [x] Aggregate urgent signals into one deduped list.
- [x] Initial eligible sources:
  - Overdue active tasks.
  - Blocked active tasks.
  - Due-soon active tasks.
  - Running/paused timers needing visibility.
  - Safe module-owned attention contributions where already available.
- [x] Future-ready sources, but do not invent their full modules in this slice:
  - Tickets waiting on the user.
  - KB articles needing review.
  - Creator Studio missed schedule/drafts ready.
  - Lists/files/integrations needing attention.
- [x] Deduplicate rows by module ID + record type + record ID.
- [x] Show at most five rows.
- [x] Each row should include:
  - Safe title.
  - Module/source label.
  - Reason badge.
  - Safe context label when available.
  - One drilldown action.
- [x] Drilldown actions should prefer:
  - `Focus in Workbench` for task-like work.
  - `Open Workbench` with focus mode/context when specific Task Focus routing is not available.
  - `View` or owning module page for non-task records.
- [x] Do not open the Task edit modal by default from Dashboard attention rows.

Today / Upcoming:

- [x] Add a compact horizon card.
- [x] Include due-today and due-this-week active work where safely available.
- [x] Include scheduled future module signals later when their modules exist.
- [x] Show top 3-5 rows only.
- [x] Keep urgency distinct:
  - Overdue/blocked belongs in Needs Attention.
  - Today/upcoming belongs in horizon.
- [x] Drilldowns go to Workbench focus, filtered Tasks, or owning module page.

Tasks pressure card:

- [x] Replace the current three-column Tasks Dashboard panel with a compact Tasks-owned card.
- [x] Show task pressure metrics:
  - Overdue.
  - Due soon.
  - Blocked.
  - Assigned to me.
- [x] Show a short deduped list only if useful:
  - Top 3-5 task attention rows.
  - Safe title.
  - Reason badge.
  - Safe context.
  - Due date/time when relevant.
  - One drilldown.
- [x] Do not show separate full lists for Overdue, Due Soon, and Assigned to Me.
- [x] Avoid duplicate display of the same task.
- [x] Drilldowns:
  - `Open Workbench` or `Focus in Workbench` for active task work.
  - `View Tasks` for full filtered list.
  - Task edit remains explicit and should not be the default Dashboard action.
- [x] Use the Tasks-owned service/read model for row shaping and permission checks.
- [x] Keep browser rendering thin.

Ordering and safety:

- [x] Server/module-owned order is authoritative.
- [x] Browser code renders returned order.
- [x] Browser must not rebuild due/priority/workspace/permission logic.
- [x] Overdue and blocked work must not be hidden from Needs Attention because it lacks a recent resume-state row.
- [x] Candidate reuse is allowed if it comes from safe framework work-candidate seams.
- [x] If a more specific Dashboard attention service is needed, keep it framework-owned and fed by existing contribution/provider seams.
- [x] Rows must be body-free.
- [x] Secure/private/unreadable rows must be omitted or represented by a safe unavailable state.
- [x] No raw IDs as visible labels.
- [x] No attachment internals.
- [x] No storage keys.
- [x] No scanner data.
- [x] No audit payload JSON.

Workspace-type gating:

- [x] Business workspaces may show readable Client/Project context.
- [x] Personal/Family workspaces show Project/workspace context only.
- [x] No Client-only labels in Personal/Family.

Regressions:

- [x] Needs Attention renders up to five deduped rows.
- [x] Repeated task signals render once.
- [x] Overdue, blocked, due-soon, and active/paused timer signals are shaped safely.
- [x] Needs Attention rows point to Workbench/module drilldowns, not default Task edit.
- [x] Today / Upcoming renders due-today/week rows separately from overdue/blocked pressure.
- [x] Old three-column Tasks Dashboard lists no longer render.
- [x] Task pressure metrics render.
- [x] Deduped task attention rows render at the configured cap.
- [x] A task that is overdue and assigned to the user appears once.
- [x] Task rows use safe labels and no raw IDs.
- [x] Dashboard task action points to Workbench/module drilldown, not default edit modal.
- [x] Personal/Family rows never show Client labels.
- [x] Business rows show Client labels only when safely readable.
- [x] Disabled/unpermitted modules contribute no attention/upcoming rows.
- [x] Tasks card disappears when Tasks is disabled or the user lacks `tasks.view`.
- [x] Browser renders server-owned order and does not rebuild task priority, scope, or permission logic.
- [x] Unsafe content patterns are absent from row payloads and DOM.

Docs:

- [x] Update Dashboard/Workbench boundary docs.
- [x] Update `docs/ui-surface-contract.md` for Dashboard attention/horizon panels.
- [x] Update `docs/module-contract.md` if attention-style contribution metadata or the Tasks Dashboard contribution shape changes.
- [x] Update `docs/tasks-module.md`.
- [x] Update `CHANGELOG.md`, package metadata, and roadmap archive bookkeeping.

Verification:

- [x] Run Dashboard attention/upcoming regressions.
- [x] Run Tasks Dashboard regressions.
- [x] Run Workbench candidate/focus regressions if work-candidate seams are reused. No work-candidate seam reuse was added in this slice.
- [x] Run Workbench regressions if task drilldowns use Workbench focus/Task Focus routes. Dashboard uses the existing `Open Workbench` handoff, not a new Task Focus route.
- [x] Run permission regressions if visibility/route guards changed.
- [x] Run `npm run check`.
- [x] Restart and verify `/api/app-info`.

Acceptance criteria:

- Dashboard shows one deduped Needs Attention panel, one calm Today / Upcoming panel, and one compact Tasks pressure card.
- The user can quickly see urgent and near-term task pressure without seeing full task lists or duplicated task columns.
- Dashboard points to Workbench/module drilldowns without becoming the execution surface.

### Version 0.33.6.13c - Time Tracking dashboard cards and Reporting boundary cleanup

**Model: GPT-5.5 Extra High** ? Time Tracking Dashboard changes affect module contributions, Reporting boundaries, workspace-type gating, and financial/billing visibility, but remain one primary blast radius.

Purpose:

Remove detailed billables from the default Dashboard and replace them with compact active/recent time visibility that matches the Dashboard pulse model.

Product rule:

- Time Tracking records effort and supports active work.
- Reporting owns detailed time/billing analysis.
- Dashboard may show active/recent time signals.
- Dashboard should not show full billing tables/charts by default.

Implementation:

- [x] Remove the default Dashboard rendering of:
  - `Current Month Billables`.
  - `Hours & Billables by Month`.
- [x] Keep detailed billable tables/charts in Reporting.
- [x] Update Time Tracking dashboard contributions:
  - Retire or hide `current-month-billables` from default Dashboard placement.
  - Retire or hide `hours-billables-chart` from default Dashboard placement.
  - Implement the existing reserved `active-timers` contribution as a compact Dashboard card.
  - Implement the existing reserved `recent-time` contribution as a compact Dashboard card.
- [x] Active Timers card:
  - Shows active/paused timer count.
  - Shows top 1-3 active/paused timers only if useful.
  - Links to Workbench or opens existing Time Tracking timer behavior where safe.
  - No timer creation form; QAC owns quick timer capture.
- [x] Recent Time card:
  - Shows recent saved time summary.
  - Links to Time Entries or Reporting as appropriate.
  - Does not show a full table.
- [x] Business Pulse: deferred to `0.33.11`; this slice adds no default billing shortcut.
  - If a compact Business-only Reporting shortcut is trivial and safe, it may show as a secondary/reporting shortcut.
  - It must not be a full billables table/chart.
  - It must be hidden for Personal/Family.
  - If it requires meaningful Reporting redesign, defer it to `0.33.11`.
- [x] Personal/Family:
  - No billable amount.
  - No invoice-ready copy.
  - No billing chart.
  - No Current Month Billables.
  - No Client billing language.

Regressions:

- [x] Current Month Billables no longer renders on default Dashboard.
- [x] Hours & Billables chart no longer renders on default Dashboard.
- [x] Detailed billing routes/reports still work in Reporting.
- [x] Active Timers Dashboard card renders when Time Tracking is enabled/permitted.
- [x] Recent Time Dashboard card renders when Time Tracking is enabled/permitted.
- [x] Time Tracking cards disappear when Time Tracking is disabled or permission/capability checks fail.
- [x] Personal/Family Dashboard has no billable/billing/invoice language.
- [x] QAC Timer capture behavior remains unchanged.
- [x] Workbench timer behavior remains unchanged.
- [x] Reporting navigation remains available where appropriate.

Docs:

- [x] Update `docs/time-tracking-module.md`.
- [x] Update `docs/module-contract.md` for Time Tracking Dashboard contribution behavior if needed.
- [x] Update Dashboard/Reporting boundary docs.
- [x] Update `CHANGELOG.md`, package metadata, and roadmap archive bookkeeping.

Verification:

- [x] Run Time Tracking Dashboard regressions.
- [x] Run Reporting regressions touched by billables movement.
- [x] Run QAC Timer regressions.
- [x] Run Workbench timer regressions.
- [x] Run permission regressions if route/contribution visibility changed.
- [x] Run `npm run check`.
- [x] Restart and verify `/api/app-info`.

Acceptance criteria:

- Dashboard no longer behaves like a billing/report page.
- Time Tracking contributes compact active/recent effort cards.
- Detailed billable analysis remains available through Reporting.
- Personal/Family workspaces do not leak billing concepts.

### Version 0.33.6.13d - Module overview grid, Recent Activity region, and sparse-workspace readiness

**Model: GPT-5.5 Extra High** ? This slice creates the general module overview and safe activity pattern that makes Dashboard viable across enabled-module mixes without inventing future modules or unsafe event feeds.

Purpose:

Make Dashboard useful for module-specific and future module-limited workspaces such as KB-only, Tickets-only, Creator Studio-only, Personal, Family, and Business workspaces.

Product rule:

- Dashboard should work even when a workspace has only a subset of modules enabled.
- Module cards summarize; they do not become full module indexes.
- Recent Activity should catch the user up only if it can be done safely.

Module Overview Grid:

- [x] Add a Module Overview grid below Pulse/Attention/Horizon.
- [x] Enabled modules can contribute compact overview cards.
- [x] Disabled/unpermitted modules are hidden.
- [x] Each card should show:
  - Module title.
  - 2-3 safe metrics.
  - Optional one latest/suggested row.
  - One primary link.
- [x] Initial first-party cards:
  - Tasks: pressure metrics and link to Tasks/Workbench render through the compact Tasks pressure overview card.
  - Time Tracking: active/recent time cards now live in the Module Overview grid.
  - Notes: deferred because no existing safe body-free overview route/read model was added in this slice.
  - Lists: deferred because no existing safe summary overview route/read model was added in this slice.
  - Files: deferred because no existing safe summary overview route/read model was added in this slice.
- [x] Future module cards remain documented expectations only:
  - Knowledge Base: drafts/stale/review-needed articles.
  - Tickets: new/waiting/high-priority/stale tickets.
  - Creator Studio: drafts/scheduled/missed schedule/ideas ready.
- [x] Do not implement future modules in this slice.
- [x] Do not add speculative schema for future modules.

Recent Activity region:

- [x] Add the Recent Activity Dashboard region now.
- [x] Existing event/audit/notification seams were not safe enough for body-free, raw-ID-free rows without new infrastructure, so no activity rows ship in this slice.
- [x] Render a quiet empty/deferred state because safe Recent Activity rows cannot be produced inside this slice.
- [x] Do not build a new global activity-feed framework from scratch in this slice.
- [x] Activity rows must never expose:
  - Audit payload JSON.
  - Raw IDs.
  - Secure/private note bodies.
  - Hidden labels.
  - Storage keys/paths.
  - Scanner internals.
  - Protected filesystem data.
  - Job payload JSON.
- [x] Activity examples remain deferred until safe rows exist:
  - Task completed.
  - Note updated.
  - File attached.
  - List finalized/completed.
  - Timer saved.
  - KB/Ticket/Creator Studio events later.

Empty/sparse workspaces:

- [x] Dashboard should feel intentional when little data exists.
- [x] Empty states should explain what will appear and link to useful starting points.
- [x] Do not show a wall of disabled/empty module panels.
- [x] A KB-only or Tickets-only future workspace should not require Dashboard redesign.

Regressions:

- [x] Module Overview grid renders only enabled/permitted module cards.
- [x] Disabled modules do not leave empty card shells.
- [x] Module cards show compact metrics only, not full module lists.
- [x] Notes card, Lists card, and Files card either render safe summaries or are omitted/deferred safely.
- [x] Future module placeholders do not render as fake live cards.
- [x] Recent Activity region renders safe rows only when safe source data exists.
- [x] Recent Activity hides or shows a quiet empty state when no safe source exists.
- [x] Activity rows do not expose raw IDs, payload JSON, secure/private content, storage/scanner internals, or hidden labels.
- [x] Sparse Dashboard empty states are useful and not noisy.
- [x] Personal/Family module cards do not leak Client/billing concepts.

Docs:

- [x] Update `docs/module-contract.md` for module overview card expectations if needed.
- [x] Update `docs/ui-surface-contract.md` for compact module overview cards.
- [x] Update module docs for any module card actually implemented.
- [x] Record richer activity digest as deferred if only the region/empty state ships.
- [x] Update `CHANGELOG.md`, package metadata, and roadmap archive bookkeeping.

Verification:

- [x] Run Dashboard module-card regressions.
- [x] Run relevant module card route regressions.
- [x] Run activity safety/static regressions.
- [x] Run permission regressions if activity/card visibility changed.
- [x] Run `npm run check`.
- [x] Restart and verify `/api/app-info`.

Acceptance criteria:

- Dashboard has a compact Module Overview grid that works for enabled modules without becoming a module index.
- Recent Activity has a safe region and either safe rows or an explicitly quiet deferred/empty state.
- Future KB/Tickets/Creator Studio module cards can plug into Dashboard without reworking the page.

### Version 0.33.6.13z - Dashboard polish, guardrails, docs, decisions, and closeout

**Model: GPT-5.5 Extra High** ? Closeout updates governing decisions, docs, static guardrails, coupling allowlists, and verification across Dashboard, Workbench, QAC, Tasks, Time Tracking, Notes, permissions, and app-info.

Purpose:

Close the Dashboard/Workbench formalization branch only after the Workbench Task Focus model and Dashboard Pulse redesign have landed, and lock the final product/architecture boundaries so future slices do not drift back into noisy dashboard/report/workbench hybrids.

Proviso:

Do not close this branch until `0.33.6.13a` through `0.33.6.13d` are implemented, documented, regressed, and verified.

Final polish scope:

- [x] CSS/layout refinement.
- [x] Responsive behavior.
- [x] Empty/loading/error state copy.
- [x] Workspace-type copy audit.
- [x] Drilldown label audit.
- [x] Final Dashboard manual smoke checks before closeout.
- [x] No new workflow behavior unless a regression reveals a small bug in the shipped Dashboard slices.

Layout and copy rules:

- [x] Pulse is first and visually distinct without becoming a hero billboard.
- [x] Needs Attention comes before lower-priority panels.
- [x] Today / Upcoming remains visually calmer than Needs Attention.
- [x] Module Overview grid uses compact cards.
- [x] Recent Activity is visually secondary.
- [x] Reporting/Business shortcuts are secondary and never dominate the page.
- [x] Setup/admin warnings appear only when needed and are visually clear but not noisy.
- [x] Mobile/narrow layouts stack cleanly:
  - Pulse.
  - Needs Attention.
  - Today / Upcoming.
  - Module cards.
  - Activity.
  - Secondary/reporting shortcuts.
- [x] Cards should not create horizontal scrolling at normal desktop widths.
- [x] Long task/client/project/module labels truncate or wrap safely without raw IDs.
- [x] Use calm, practical language.
- [x] Avoid `billing` and `client` language outside Business workspaces.
- [x] Avoid medical/diagnostic/neurodivergence-specific UI language.
- [x] Avoid `empty because broken` vibes.
- [x] Empty states should tell the user what will show here and where to start.

Drilldown audit:

- [x] Pulse primary action -> Workbench.
- [x] Needs Attention active-work rows -> Workbench/focus.
- [x] Module card primary actions -> owning module page or Workbench when action-oriented.
- [x] Reporting links -> Reporting.
- [x] Settings/admin warnings -> Settings/Admin.
- [x] QAC remains capture; Dashboard does not add capture forms.

Record branch decisions in `DECISIONS.md`:

- [x] Dashboard is the workspace pulse/orientation surface.
- [x] Dashboard answers:
  - Is anything on fire?
  - What changed recently?
  - What areas need attention?
  - Where should I go next?
- [x] Dashboard summarizes state; it does not become the main place users complete detailed work.
- [x] Dashboard surface rule:
  - Summary.
  - Pressure.
  - Direction.
  - Short safe lists only when useful.
  - No full tables, full charts, full editors, full reports, or full module indexes.
- [x] Dashboard default layout is:
  - Workspace Pulse.
  - Needs Attention.
  - Today / Upcoming.
  - Module Overview.
  - Recent Activity when safely available.
  - Secondary/reporting/setup shortcuts only where relevant.
- [x] Dashboard panels are contribution-driven and placed by a validated placement/region contract, not by hardcoded panel IDs.
- [x] Needs Attention rows are deduped, permission-shaped, body-free, raw-ID-free, and capped.
- [x] Recent Activity is safe-summary-only and may remain a quiet/deferred region until richer event/activity infrastructure is deliberately expanded.
- [x] Admin/setup warnings appear only when there is safe warning data.
- [x] Workbench is the live work surface: Focus Selection and Task Focus.
- [x] Focus Selection is for choosing work.
- [x] Task Focus is for working one selected task.
- [x] Dashboard may link to Workbench focus modes or Task Focus, but it does not recreate Workbench recommendation lists as full Dashboard task lists.
- [x] Reporting owns detailed time/billing analysis.
- [x] Time Tracking Dashboard content is compact active/recent time visibility by default, not current-month billable tables/charts.
- [x] A compact Business Pulse/reporting shortcut may exist only as a secondary Dashboard surface; detailed billable tables/charts remain Reporting-owned.
- [x] Personal and Family workspaces must not show Client/billable/invoice/billing Dashboard language.
- [x] The right-side Workbench panel has state-specific meaning:
  - Focus Selection: `More in this focus` candidate overflow.
  - Task Focus: task-related work context.
- [x] Workbench candidate primary actions enter Task Focus for task candidates instead of opening the edit modal.
- [x] Task editing remains available through explicit Edit actions and canonical module-action openers.
- [x] Task Focus hides Focus Selection panels and Recommended Next Action until `Change Focus` is pressed.
- [x] Task Focus summary context is non-duplicative and uses safe metadata chips for status, priority, due dates, tags, and other existing task metadata.
- [x] Task Focus Inspector same-project task context prioritizes nearer due dates.
- [x] Recurring-task checklist structure is propagated through `All Future Tasks` recurrence updates while checklist completion state remains occurrence-specific.
- [x] Task Focus checklist toggles keep task status aligned with visible work: checked checklist work moves eligible Open tasks to In Progress, and clearing all checked work returns eligible In Progress tasks to Open.
- [x] Task Focus linked notes open as rendered Markdown view/read modals first, with an explicit Edit handoff to the canonical Notes editor.
- [x] Recurring-task linked notes saved through `All Future Tasks` propagate relationship metadata to eligible future occurrences and newly generated instances without copying note bodies.
- [x] QAC owns quick capture and opens the Time Tracking Create Timer modal for Timer capture.

Update `AGENTS.md` only if needed to reflect short active guidance:

- [x] Dashboard is overview/pulse.
- [x] Workbench is live action/recovery.
- [x] Reporting is detailed analysis.
- [x] QAC is quick capture.
- [x] Do not implement TODO scratchpad items unless promoted into `ROADMAP.md`.
- [x] Do not turn Dashboard into the primary work surface, report page, or module index.

Current `AGENTS.md` already carries the short active Dashboard, Workbench, and TODO-promotion guidance, so no AGENTS edit was needed for this closeout.

Update docs:

- [x] `docs/declarative-view-surfaces.md`
  - Dashboard host status.
  - Dashboard region placement.
  - Workbench Focus Selection vs Task Focus status.
  - Dashboard/Workbench/Reporting/QAC boundary.
- [x] `docs/module-contract.md`
  - Dashboard contribution placement/region field.
  - Dashboard contribution ownership.
  - Module-owned panel data routes/renderers.
  - Contribution filtering by module, permissions, capabilities, workspace type.
- [x] `docs/view-building-contract.md`
  - Dashboard region layout ownership.
  - Framework-owned panel/status/empty/error anatomy.
  - Workbench state-specific layout boundary.
- [x] `docs/ui-surface-contract.md`
  - Dashboard surface rule: summary, pressure, direction.
  - Dashboard must not render full task indexes, full report tables/charts, editors, or browser-owned permission/ranking logic.
- [x] `docs/tasks-module.md`
  - Task Dashboard card boundary.
  - Workbench Task Focus checklist/status behavior.
  - Recurring checklist and linked-note propagation boundaries.
- [x] `docs/time-tracking-module.md`
  - Dashboard active/recent time cards.
  - Detailed billables live in Reporting, not default Dashboard panels.
  - QAC Time Tracking Create Timer modal.
  - Task-linked timer behavior.
- [x] `docs/notes-module.md`
  - Task Focus linked-note view/read modal and Edit handoff.
  - Recurring linked-note relationship propagation without copying note bodies.
- [x] Any module docs touched by Module Overview cards.

Add/update static guardrails:

Dashboard guardrails:

- [x] Dashboard protected host remains minimal.
- [x] Dashboard browser host must use shared view primitives for framework-owned page/header/status/empty/error/panel anatomy.
- [x] Dashboard region placement must not hardcode first-party panel IDs such as `project-summary`.
- [x] Dashboard must not render:
  - Current Month Billables default table.
  - Hours & Billables default chart.
  - Full task lists.
  - Full report tables/charts.
  - Inline editors/forms.
  - Browser-rebuilt task ranking or permission logic.
- [x] Dashboard Personal/Family surfaces must not show Client/billable/invoice/billing language.
- [x] Dashboard module cards must disappear when the module is disabled or permission/capability checks fail.
- [x] Dashboard activity rows must not expose unsafe content, raw audit payloads, raw IDs, storage internals, scanner data, secure/private body content, or hidden labels.
- [x] Dashboard warning rows must not expose secrets, raw runtime values, job payload JSON, storage internals, or scanner internals.
- [x] Dashboard empty/sparse states must remain useful.

Workbench guardrails:

- [x] Workbench must not reintroduce:
  - A main-column `More in this focus` task list.
  - A Focus Selection manual timer creation row.
  - A default `Open work` opens edit modal path for task candidates.
  - A `Dismiss` action on recommended/resume candidates.
  - Visible Focus Selection panels or Recommended Next Action while in Task Focus.
  - Duplicated Client/Project context in the Task Focus summary.
  - A Task Focus Inspector sourced from generic focus-mode candidates instead of selected-task context.
  - Same-project Inspector tasks sorted without due-date proximity.
  - An embedded Inspector preview pane.
- [x] Workbench Task Focus must keep editing explicit through Edit actions and canonical module-action openers.
- [x] Workbench Task Focus checklist execution must stay check/uncheck only; checklist structure editing remains in the Task editor.
- [x] Workbench Task Focus linked Note reads must use the Notes-owned view/read modal first, with explicit Edit handoff.

Framework coupling guardrails:

- [x] Add/update a framework-coupling guardrail so `src/core/**` and framework aggregation services under `src/services/**` do not import specific first-party module services/repos or hardcode first-party module IDs for generic decisions outside a documented allowlist.
- [x] Record still-coupled framework services deferred to later branches:
  - Reporting remains deferred to `0.33.11`.
  - Public API and tag propagation remain deferred to `0.39.15`.
- [x] Any temporary Dashboard direct coupling left by `0.33.6.13a` through `0.33.6.13d` must be documented with:
  - File/function.
  - Why it remains.
  - Retained coverage owner.
  - Follow-up version.

Deferred follow-up inventory:

- Richer Dashboard Recent Activity digest if `0.33.6.13d` only adds the safe region/empty state.
- Compact Business Pulse/reporting shortcut if it is deferred to Reporting `0.33.11`.
- Advanced-search modal + search-result display modal, including routing main-ribbon search results through it if that remains the direction.
- Report-creation modal, cross-referenced to `0.37.5`.
- Any remaining Files target-aware upload modal if still needed after QAC/File behavior is reviewed.
- Future KB/Tickets/Creator Studio Dashboard module cards.

Verification:

- [x] Run focused Dashboard regressions.
- [x] Run Dashboard host/static guardrail regressions.
- [x] Run Dashboard contribution/manifest regressions.
- [x] Run Dashboard/Workbench regression set.
- [x] Run QAC regressions.
- [x] Run Time Tracking timer/dashboard regressions.
- [x] Run Tasks recurrence/checklist/dashboard regressions.
- [x] Run Notes linked-note modal regressions.
- [x] Run permission regressions if contribution filtering, workspace-type gating, route guards, or safe visibility changed.
- [x] Run `npm run check`.
- [x] Run `npm run test:permissions`.
- [x] Restart and verify `/api/app-info` reports the expected version.
- [x] Manually verify:
  - Business Dashboard.
  - Personal/Family Dashboard.
  - Sparse/no-data Dashboard.
  - Tasks enabled/disabled.
  - Time Tracking enabled/disabled.
  - Reporting permission present/missing.
  - Workbench Focus Selection.
  - Workbench Task Focus.
  - QAC Timer capture.
  - Dashboard responsive/narrow layout.

Closeout bookkeeping:

- [x] Update `CHANGELOG.md`.
- [x] Update `package.json` and `package-lock.json` when the version changes.
- [x] Archive completed roadmap sections according to the roadmap bookkeeping rule.
- [x] Do not add a top-level `## Archived Roadmap History` section to `ROADMAP.md`.

Archive bookkeeping note: `0.33.6` remains the active roadmap family for `0.33.6.14+`, so this completed Dashboard/Workbench branch stays checked in place and shipped history is recorded in `CHANGELOG.md` without adding a top-level archived-history block.

Acceptance criteria:

- Dashboard/Workbench closeout occurs only after the Dashboard Pulse redesign and Workbench Task Focus model are both landed.
- Current governing decisions and docs clearly separate Dashboard, Workbench, Reporting, QAC, module pages, and module-owned panel behavior.
- Guardrails prevent Dashboard from regressing into full task lists, billing reports, hardcoded panel placement, unsafe activity feeds, warning leaks, browser-owned permission/ranking logic, or primary-work-surface behavior.
- Guardrails prevent Workbench from regressing into distracting Focus Selection lists during Task Focus or edit-modal-first task execution.
- The verification gate covers Dashboard, Workbench, QAC, Tasks, Time Tracking, Notes, permissions, `npm run check`, `npm run test:permissions`, and app-info version reporting.

## Remaining 0.33.6 Direction

### Version 0.33.6.14 - App-wide hierarchical client/project scoping standard

**Model: GPT-5.5 Extra High** - Cross-cutting scope-resolution standard shared by every client/project filter.

Scope decision:

Promoted from `TODO.md` (Recommended Next Action Interface & Algorithm, hierarchy note). This is a cross-cutting scoping standard, not a Dashboard/Workbench surface, so it is intentionally sequenced after the 0.33.6 host work and its closeout; it may be promoted to its own dedicated version if it grows. The Workbench two-filter split (0.33.6.6e) is its first consumer, and this slice generalizes the behavior to every surface that filters by client/project.

- [ ] Establish an app-wide standard that a client/project filter selecting a PARENT includes all descendant sub-clients/sub-projects, while still allowing drill-down to a single client/project - using the existing `parent_client_id`/`parent_project_id` hierarchy in `client-projects`.
- [ ] Apply the standard consistently across the client/project filters in Tasks, Notes, Files, the Workbench focus filters (0.33.6.6e), and any other list surface that filters by client/project; do not fork per-surface scoping logic.
- [ ] Provide a shared, permission-aware scope-resolution helper (parent -> descendant id set) that each surface's query uses, rather than duplicating descendant expansion per module; respect readable-client/readable-project filtering so descendants the user cannot read are excluded.
- [ ] Preserve workspace boundaries and workspace-type gating (client scope hidden on Personal/Family); the standard must not leak cross-workspace or unreadable descendants.
- [ ] Update the relevant `docs/` scoping/contract docs to record parent-includes-descendants as the app-wide default.
- [ ] Add regressions proving parent selection includes descendants, single drill-down still works, unreadable descendants are excluded, and the behavior is consistent across at least Tasks, Notes, and Workbench.

Acceptance criteria:

- Selecting a parent client or project includes its descendants across all client/project filters via a shared permission-aware scope resolver, single drill-down is preserved, and no unreadable or cross-workspace records leak.

### Version 0.33.6.14a - Linked Context picker: client-scoped project selection

**Model: GPT-5.5 Extra High** - Client-context selection for the shared Linked Context picker, applying the 0.33.6.14 scoping standard.

Promoted from user request. Consumes the app-wide client/project scoping conventions from 0.33.6.14 and applies them to the shared Linked Context picker (`createLinkedContextPicker` in `public/js/shared/view-builder.js`, wired in `public/js/notes.js`, contract `docs/linked-context-picker-contract.md`). Today the picker has only a target-type + search + record control set with no client context, and project rows are labeled `"{{projectName}} - {{clientName}}"` unconditionally on business workspaces (`primaryProjectOptionLabel` in `notes.js`).

- [ ] Add a client-context selector to the Linked Context picker on BUSINESS workspaces only, defaulting to "All Clients": with "All Clients" selected the picker shows all projects/records across clients (unchanged breadth).
- [ ] Include a "{{workspaceName}}" entry in the client selector (e.g. "Raymond Tec") that scopes the results to client-less workspace projects (projects with no client) - the workspace-projects bucket, presented as if it were a client.
- [ ] List the real clients after "All Clients" and "{{workspaceName}}", and scope the project/record list to the chosen client; apply the 0.33.6.14 parent-includes-descendants rule so a parent client includes its sub-clients' projects, with single drill-down preserved.
- [ ] Label rule: under "All Clients", project rows keep the `"{{projectName}} - {{clientName}}"` suffix so same-named projects across clients stay distinguishable; once a specific client OR the "{{workspaceName}}" entry is selected, drop the suffix and show just the project name (the client context is now explicit).
- [ ] PERSONAL/FAMILY workspaces must never show a client selector, a "{{workspaceName}}"-as-client entry, or any `- clientName` label anywhere in this picker - no client concept leaks into non-business scope.
- [ ] Keep the shared shell data-agnostic: the picker shell must not fetch or own client/project data (its regression forbids `fetch`/storage in the shell); the caller (`notes.js`) supplies the client options and scoped records, and the shell only renders the client select and reflects the selection. Preserve permission/workspace boundaries and the no-raw-ID label rules from the picker contract.
- [ ] Update `docs/linked-context-picker-contract.md` for the new client-context control and its business-only gating, and add regressions for: All-Clients default breadth + suffix, "{{workspaceName}}" scoping to client-less projects + suffix dropped, specific-client scoping + suffix dropped + descendant inclusion, and Personal/Family showing no client control or labels.

Acceptance criteria:

- On business workspaces the Linked Context picker offers a client selector (All Clients default, "{{workspaceName}}" for workspace projects, then clients with parent-includes-descendants scoping); the `- client` suffix shows only under All Clients and drops once a specific client/workspace is picked; Personal/Family never surface any client selector or label; and the shared shell stays data-agnostic.

### Version 0.33.6.15 - App version source-of-truth and version-bump cleanup

**Model: GPT-5.5 Extra High** - Mechanical versioning cleanup to reduce release/update blast radius before TypeScript/Zod/Vitest lands.

Purpose:

Reduce the amount of manual version-string churn during every release slice by separating the current app version from historical roadmap/changelog labels and regression documentation.

This is a source-of-truth cleanup, not a product feature. It should make future version bumps smaller, safer, and easier for Codex/Claude to perform without accidentally rewriting historical slice labels such as `0.33.6.13a` / `0.33.6.14a` or “As of…” documentation assertions.

Current problem:

* The current app version is pinned in multiple runtime, metadata, and regression locations.
* Some version strings are true current-version assertions.
* Some version strings are historical roadmap/changelog/docs labels that must never be rewritten during a version bump.
* Codex/Claude currently has to distinguish those manually during broad replacements, which creates unnecessary blast radius and slows regression/update work.

Scope:

* Current app-version reporting.
* Package metadata.
* `/api/app-info` version reporting.
* Version assertion regressions.
* Version bump/update workflow.
* Guardrails preventing accidental current-version literals outside approved source-of-truth files.

Non-goals:

* Do not rewrite historical roadmap, changelog, archive, or docs slice labels.
* Do not rewrite “As of 0.x.x” historical documentation assertions unless a human explicitly asks for that specific documentation update.
* Do not change product behavior.
* Do not introduce TypeScript, Zod, Vitest, Playwright, or any new testing framework in this slice.
* Do not change `npm start`.
* Do not weaken the existing release ceremony or app-info verification.

Feasibility and required sequence:

This slice can be done in one pass, but only if the steps are ordered correctly. Today the current app-version literal lives in ~200 files per bump: `package.json` + `package-lock.json`, 5 module manifests (`src/modules/*/module.js` `version:`) and `src/db/adapters/sqlite-dialect-seams.js` (`contractVersion:`), plus ~190 regression scripts that each hardcode `const appVersion = "<literal>"` before asserting that `package.json` / `package-lock.json` / module source match it. That regression pattern is uniform, so the bulk conversion is mechanical and low-risk - but the new anti-literal guardrail must be added LAST, after every consumer already derives the version, or it will fail the suite the moment it is introduced. The guardrail must also distinguish a live current-version pin from a historical label, because regressions legitimately embed historical strings (for example an `as of 0.33.6.12n` documentation assertion) that must never be rewritten during a bump.

Decisions to make first:

* Canonical source mechanism: keep `package.json` as the single current-version source, and have the runtime helper (`src/core/version.js`) read and re-export it (fs read / import assertion); regression scripts read `package.json.version` through the same helper or a tiny shared reader. Avoid a second hand-maintained version constant that can drift from `package.json`.
* `contractVersion` in `src/db/adapters/sqlite-dialect-seams.js`: decide whether it is the app version (route it through the helper) or an independent contract version that only currently coincides with it (leave it alone and exclude it from the app-version guardrail). Default to independent unless a human confirms it should track the app version.

#### Version 0.33.6.15.1 - Canonical version source and runtime consumers (no guardrail yet)

**Model: GPT-5.5 Extra High** - Establish the source of truth and move runtime consumers onto it.

* [ ] Establish one canonical current app-version source: `package.json` remains the metadata source.
* [ ] Add a runtime helper (`src/core/version.js` or `src/services/app-version.service.js`) that reads/exports the current app version from the approved source; runtime code calls the helper instead of duplicating the literal.
* [ ] Route `/api/app-info` version reporting through the helper.
* [ ] Convert the 5 module manifests (`src/modules/*/module.js` `version:`) to derive the version from the helper instead of a hardcoded literal.
* [ ] Resolve the `contractVersion` decision for `sqlite-dialect-seams.js` per "Decisions to make first"; only route it through the helper if it is intended to track the app version.
* [ ] Update the module-version regressions in lockstep so module version is asserted against the helper/runtime value rather than a hardcoded source-string regex.
* [ ] Do NOT add the anti-literal guardrail in this sub-slice.

Acceptance criteria:

* `/api/app-info` and all module manifests report the version with no hardcoded current-version literal in those runtime files.
* `npm run check` stays green.

#### Version 0.33.6.15.2 - Regression source-of-truth conversion (bulk, mechanical)

**Model: GPT-5.5 Extra High** - Remove the ~190 duplicated `const appVersion` literals in one mechanical pass.

* [ ] Replace the uniform `const appVersion = "<literal>";` across the regression scripts with a read from the canonical source (shared reader or inline `package.json` read); the scripts already read `package.json` / `package-lock.json` and assert equality, so this is a mechanical transform.
* [ ] Verify the full suite stays green after the conversion; the equality assertions now compare the source to itself and to the runtime consumers converted in 0.33.6.15.1.
* [ ] Leave historical-label assertions untouched (for example `as of 0.33.6.12n` documentation checks); they are documentation assertions, not current-version pins.

Acceptance criteria:

* No regression script hardcodes the current app-version literal for its own `appVersion`.
* `npm run check` stays green.

#### Version 0.33.6.15.3 - Version-bump helper

**Model: GPT-5.5 Extra High** - One command to bump, no repo-wide find/replace.

* [ ] Add a version bump helper (`scripts/bump-version.mjs`) that updates only the approved current-version source(s) plus `package.json` / `package-lock.json`.
* [ ] It must not bulk-rewrite roadmap/changelog/archive history; it prints a short follow-up release-ceremony checklist instead of silently touching docs.
* [ ] Add a package script: `version:bump` (or `version:set`).

Acceptance criteria:

* A bump updates only the approved current-version files and leaves history untouched.
* `npm run check` stays green after a bump.

#### Version 0.33.6.15.4 - Anti-literal guardrail, allowlist, docs, and closeout (added LAST)

**Model: GPT-5.5 Extra High** - Lock the boundary only after every literal is already gone.

* [ ] Add an allowlist for current-version literals, limited to `package.json`, `package-lock.json`, the version helper/source file (only if it intentionally mirrors the package version), and any narrowly approved release metadata files.
* [ ] Keep historical labels allowed in `ROADMAP.md`, `ROADMAP-ARCHIVE.md`, `CHANGELOG.md`, `docs/**`, and archived release/history documentation.
* [ ] Add a regression/guardrail that fails if the current app-version literal appears outside the allowlist. It must not flag historical roadmap/changelog/docs labels, and must distinguish a live current-version assertion from a historical slice label. Register it with the suite/coverage manifest.
* [ ] Add focused regressions proving: `/api/app-info` reports the current package/app version; the helper returns the value expected by package metadata; the current-version literal does not appear in unapproved runtime/regression files; historical version labels are ignored by the guardrail; and the bump helper does not rewrite historical roadmap/changelog labels.
* [ ] Update developer/agent docs with the new version-bump workflow: use the bump helper, do not broad find/replace for release bumps, preserve historical roadmap/changelog/archive labels, and verify `/api/app-info` after restart. Record the source-of-truth decision in `DECISIONS.md`.
* [ ] Update `CHANGELOG.md` and roadmap bookkeeping for this slice through normal release ceremony.

Acceptance criteria:

* The guardrail passes now (because 0.33.6.15.1-0.33.6.15.2 removed the stray literals) and fails if a current-version literal is reintroduced outside the allowlist.
* Historical roadmap/changelog/docs labels are preserved and ignored by the guardrail.

Suggested version-bump workflow after this slice:

1. Run the version bump helper with the new app version.
2. Review only the approved current-version files it changed.
3. Run the focused version guardrail.
4. Run the normal release verification.
5. Update changelog/roadmap history manually as historical documentation, not as app-version pins.

Acceptance criteria:

* The current app version has one canonical source-of-truth path.
* Runtime app-info/version reporting uses that source instead of duplicated literals.
* Current-version assertions are centralized or derived from the helper/source.
* A guardrail prevents the current app-version literal from spreading into unrelated runtime/regression files.
* Historical roadmap/changelog/docs labels are preserved and not treated as current app-version pins.
* A version bump helper exists and avoids broad repository find/replace.
* Future version bumps should have a much smaller blast radius before 0.33.7+ TypeScript/Zod/Vitest work lands.


### Version 0.33.6.16 - Release workflow, regression-suite, and maintenance-gate cleanup before TypeScript

**Model: GPT-5.5 Extra High** - Pre-TypeScript maintenance cleanup to reduce Codex/Claude clerical churn.

Purpose:

Remove recurring release-process and regression-suite friction before the TypeScript/Zod/Vitest foundation lands in 0.33.7.

This version is about making future slices cheaper to implement. It should reduce the amount of time Codex/Claude spends manually wiring regression scripts, updating coverage manifests, bumping cache keys, reconciling scanner/audit counts, guessing which docs need updates, and performing release-gate bookkeeping.

This is a maintenance/workflow cleanup branch, not a product-feature branch.

Sequencing:

* Lands after 0.33.6.15 app-version source-of-truth cleanup.
* Lands before 0.33.7 TypeScript/Zod/Vitest so the TypeScript slice inherits cleaner versioning, regression routing, docs ownership, asset cache-busting, audit baselines, and database migration/schema workflows.
* Lands before 0.33.8 Playwright so browser/mobile tests are added onto a cleaner regression runner instead of becoming another manually wired test island.
* Lands before 0.33.9 mobile polish so mobile work can use clear narrow commands and stable asset/test conventions.

Intra-branch dependencies and suggested order:

* 0.33.6.16.1 (inventory/convention) is a prerequisite for the rest; do it first.
* 0.33.6.16.2 (discovery + metadata runner) is the backbone; 0.33.6.16.3 (manifest generation) and 0.33.6.16.4 (narrow commands) depend on it, so keep 16.2 -> 16.3 -> 16.4 in order.
* 0.33.6.16.5 (asset cache-bust), 0.33.6.16.6 (parameter-binding baseline), 0.33.6.16.7 (docs ownership), 0.33.6.16.8 (migration/schema), and 0.33.6.16.9 (licensing gate) are largely independent of the runner work and of each other; they can ship in any order (or in parallel) once 0.33.6.16.1 is done.
* 0.33.6.16.2 and 0.33.6.16.3 are the highest-blast-radius slices because they touch the runner and coverage ratchet the whole suite trusts; treat them as the risky core and verify against a full-suite run before and after. If time-constrained, 16.2/16.3/16.4 plus 16.5 deliver most of the churn savings; 16.7 and 16.9 are the safest to defer.
* 0.33.6.16.10 (closeout) is last and depends on all of the above.

Core goals:

* Make regression scripts discoverable by convention instead of manually wired everywhere.
* Make regression coverage manifest/ratchet upkeep generated or semi-generated instead of hand-maintained.
* Add narrow regression commands by area/tier/tag so agents do not default to the full suite for every small change.
* Centralize asset cache-busting so UI/static changes do not require manual cache-key edits.
* Convert the parameter-binding audit into a baseline-driven scanner that reports only new violations.
* Add a docs ownership index so doc updates are intentional instead of scattered guesswork.
* Add migration/schema helper workflow so database changes do not require hand-maintained schema drift.
* Clarify licensing/public-release gates so licensing docs do not become a recurring release-blocking mystery.

Non-goals:

* Do not introduce TypeScript, Zod, Vitest, Playwright, Puppeteer, jsdom, PHP, Python, or another runtime in this version.
* Do not rewrite existing regression behavior.
* Do not delete existing regression coverage.
* Do not weaken permission, workspace, module-enabled, private/secure-content, storage-key, no-raw-ID, migration, or app-info release checks.
* Do not move product roadmap work into this slice.
* Do not change `npm start`.
* Do not change user-facing product behavior except where asset cache-busting/runtime metadata is surfaced through existing app-info/legal/about paths.
* Do not treat historical roadmap/changelog/docs labels as current version pins; 0.33.6.15 owns that boundary.

#### Version 0.33.6.16.1 - Regression-suite inventory and discovery convention

**Model: GPT-5.5 Extra High** - Planning/inventory slice for regression-suite cleanup.

Purpose:

Inventory the current custom regression suite and define the convention that later 0.33.6.16 slices will implement. This slice should not rewrite the runner yet.

* [ ] Inventory the current regression runner entry points:

  * [ ] `scripts/run-regressions.mjs`
  * [ ] `scripts/regression-suite.mjs`
  * [ ] `scripts/regression-coverage-ratchet.mjs`
  * [ ] `scripts/regression-clean-clone-contract.mjs`
  * [ ] `scripts/regression-coverage-manifest.json`
  * [ ] `package.json` scripts that invoke regressions.
* [ ] Inventory current regression categories by path/name:

  * [ ] Workbench.
  * [ ] Dashboard.
  * [ ] Files.
  * [ ] Tasks.
  * [ ] Notes.
  * [ ] Lists.
  * [ ] Search.
  * [ ] Notifications.
  * [ ] Tags.
  * [ ] Public API.
  * [ ] Permissions.
  * [ ] Database/migrations.
  * [ ] View builder / declarative views.
  * [ ] Module contracts.
  * [ ] Background jobs / worker runner.
  * [ ] App-info/version/release gates.
  * [ ] Licensing/public-release gates, if any.
* [ ] Define a regression file convention for future discovery.

  * Preferred final shape:

    * `scripts/regressions/<area>/<name>.regression.mjs`
  * Transitional support:

    * Existing `scripts/*-regression.mjs` files continue to run until migrated.
* [ ] Define required metadata for discovered regressions:

  * [ ] `id`
  * [ ] `area`
  * [ ] `tier`
  * [ ] `tags`
  * [ ] `description`
  * [ ] `runMode` or equivalent parallel/serial safety flag, only if needed by the existing runner.
* [ ] Define canonical area names:

  * [ ] `framework`
  * [ ] `views`
  * [ ] `dashboard`
  * [ ] `workbench`
  * [ ] `tasks`
  * [ ] `notes`
  * [ ] `lists`
  * [ ] `files`
  * [ ] `search`
  * [ ] `notifications`
  * [ ] `tags`
  * [ ] `time-tracking`
  * [ ] `database`
  * [ ] `permissions`
  * [ ] `jobs`
  * [ ] `public-api`
  * [ ] `release`
  * [ ] `docs`
  * [ ] `licensing`
* [ ] Define canonical tiers:

  * [ ] `unit-like`
  * [ ] `focused`
  * [ ] `integration`
  * [ ] `release-gate`
  * [ ] `slow`
* [ ] Document the intended future behavior:

  * [ ] Agents add a regression script with metadata.
  * [ ] The runner discovers it.
  * [ ] The coverage index/manifest is generated or validated from metadata.
  * [ ] Agents do not manually edit multiple suite files for every new regression.

Acceptance criteria:

* The current regression suite shape is documented.
* The future discovery convention is documented.
* Required metadata fields are defined.
* Existing regressions continue unchanged in this slice.
* No regression is removed, disabled, or silently skipped.

#### Version 0.33.6.16.2 - Regression metadata and auto-discovery runner

**Model: GPT-5.5 Extra High** - Custom regression runner cleanup without changing regression semantics.

Purpose:

Teach the regression runner to discover regression scripts by convention and metadata so future slices do not require manual suite wiring.

* [ ] Add a small regression metadata helper, for example:

  * [ ] `scripts/lib/regression-metadata.mjs`
  * [ ] or `scripts/regressions/registry.mjs`
* [ ] Support metadata exported by regression scripts, for example:

  * [ ] `export const regressionMeta = { ... }`
  * [ ] Keep the exact API simple and documented.
* [ ] Add discovery for:

  * [ ] New convention path: `scripts/regressions/**/*.regression.mjs`
  * [ ] Existing transitional path: `scripts/*-regression.mjs`
* [ ] Ensure discovered scripts are sorted deterministically.
* [ ] Preserve existing serial/parallel behavior.

  * [ ] If the current runner has safe parallel buckets, preserve them.
  * [ ] Regressions that touch shared files, global temp state, database files, ports, or process state must remain serial unless explicitly marked safe.
* [ ] Add runner options:

  * [ ] `--area <area>`
  * [ ] `--tag <tag>`
  * [ ] `--tier <tier>`
  * [ ] `--list`
  * [ ] `--dry-run`
* [ ] Keep `npm run check` behavior intact unless 0.33.6.16.4 changes the command wiring explicitly.
* [ ] Add focused regressions proving:

  * [ ] New convention files are discovered.
  * [ ] Existing legacy `scripts/*-regression.mjs` files are still discovered.
  * [ ] Metadata is validated.
  * [ ] Missing/invalid metadata fails with a useful error for new-style regressions.
  * [ ] Ordering is deterministic.
  * [ ] Area/tag/tier filters include the right scripts and exclude unrelated scripts.
  * [ ] Serial-only regressions are not accidentally parallelized.
  * [ ] The set of scripts discovered by the new runner exactly equals (or is a superset of) the set the current runner runs today - captured as a checked-in snapshot - so no regression is silently dropped during the discovery migration.
* [ ] Document how to add a new regression with metadata.

Acceptance criteria:

* New regression scripts can be added by convention without manually editing the central suite.
* Existing regression scripts still run.
* The runner supports list/dry-run/area/tag/tier filtering.
* Parallelization safety is preserved.
* `npm run check` still runs the full intended regression coverage.
* No script that runs today is dropped by the new discovery, proven by the snapshot-equality check.

#### Version 0.33.6.16.3 - Regression coverage manifest generation and ratchet cleanup

**Model: GPT-5.5 Extra High** - Reduce manual coverage-manifest upkeep while preserving the coverage ratchet.

Purpose:

Stop making Codex/Claude manually update the regression coverage manifest every time a regression is added, renamed, or moved.

* [ ] Review the current `scripts/regression-coverage-manifest.json` contract and how `scripts/regression-coverage-ratchet.mjs` consumes it.
* [ ] Decide whether the manifest becomes:

  * [ ] Fully generated from regression metadata; or
  * [ ] Semi-generated with a checked-in generated file and explicit legacy exceptions.
* [ ] Prefer metadata as the source of truth for:

  * [ ] regression ID
  * [ ] area
  * [ ] tier
  * [ ] tags
  * [ ] protected contract/feature
  * [ ] release-gate status
* [ ] Add a manifest generation/check command, for example:

  * [ ] `npm run regressions:manifest`
  * [ ] `npm run regressions:manifest:check`
* [ ] Update the ratchet so it validates discovered regression metadata rather than relying on hand-maintained duplicate lists.
* [ ] Preserve any existing ratchet behavior that prevents coverage from being deleted or weakened.
* [ ] Add an explicit exception mechanism for:

  * [ ] intentionally retired regressions
  * [ ] merged/consolidated regressions
  * [ ] legacy scripts awaiting migration
* [ ] Add focused regressions proving:

  * [ ] Manifest generation is deterministic.
  * [ ] Missing metadata is detected.
  * [ ] Duplicate regression IDs fail.
  * [ ] Removing a covered area without an explicit retirement entry fails.
  * [ ] Legacy exceptions are honored.
  * [ ] No existing coverage is silently dropped.
* [ ] Update docs so agents know:

  * [ ] Add metadata to the regression script.
  * [ ] Run the manifest check/generator.
  * [ ] Do not manually hand-edit the coverage manifest except for explicit retirement/exception entries.

Acceptance criteria:

* Regression coverage manifest upkeep is generated or semi-generated from regression metadata.
* The coverage ratchet still prevents accidental coverage loss.
* Agents no longer need to manually wire every new regression in multiple places.
* Existing release-gate coverage remains intact.

#### Version 0.33.6.16.4 - Narrow regression commands and changed-area routing

**Model: GPT-5.5 Extra High** - Fast regression routing before TypeScript/Vitest/Playwright arrive.

Purpose:

Give Codex/Claude fast, narrow commands for common work areas so they do not default to the full regression suite for every small change.

* [ ] Add package scripts for narrow regression areas:

  * [ ] `test:regressions`
  * [ ] `test:regressions:list`
  * [ ] `test:regressions:framework`
  * [ ] `test:regressions:views`
  * [ ] `test:regressions:dashboard`
  * [ ] `test:regressions:workbench`
  * [ ] `test:regressions:tasks`
  * [ ] `test:regressions:notes`
  * [ ] `test:regressions:files`
  * [ ] `test:regressions:database`
  * [ ] `test:regressions:permissions`
  * [ ] `test:regressions:release`
* [ ] Add a changed-area helper, for example:

  * [ ] `scripts/suggest-regressions-for-changes.mjs`
* [ ] The helper should inspect changed files and suggest likely regression commands.

  * [ ] It may use git diff against the working tree/current branch.
  * [ ] It should be conservative: suggest more checks rather than fewer when shared files change.
* [ ] Add route rules for common paths:

  * [ ] `src/modules/tasks/**` -> tasks regressions.
  * [ ] `src/modules/files/**` and file UI scripts -> files regressions.
  * [ ] `public/js/workbench.js`, Workbench routes/services/docs -> workbench regressions.
  * [ ] `public/js/shared/view-builder.js`, view renderer/core view files -> view/framework regressions.
  * [ ] `src/db/**`, migrations, repositories -> database regressions.
  * [ ] permissions/session/workspace/membership files -> permissions regressions.
  * [ ] package/version/app-info/release docs -> release regressions.
* [ ] Keep `npm run check` as the full release gate.
* [ ] Add agent/developer docs:

  * [ ] One-module change: run the narrow area command first.
  * [ ] Shared framework change: run framework/view commands plus relevant module commands.
  * [ ] DB change: run database command plus affected module commands.
  * [ ] Release closeout: run full `npm run check`.
* [ ] Add focused regressions proving:

  * [ ] Area scripts call the regression runner with the right filters.
  * [ ] Changed-area helper suggests expected commands for representative path sets.
  * [ ] Shared/framework changes produce conservative suggestions.
  * [ ] Full `npm run check` remains the release gate.

Acceptance criteria:

* Agents have clear narrow regression commands before 0.33.7 TypeScript/Vitest.
* Changed-file routing suggests the right focused checks.
* Full release verification remains available and unchanged in purpose.
* The new command structure reduces unnecessary full-suite runs during focused feature work.

#### Version 0.33.6.16.5 - Asset cache-bust source-of-truth

**Model: GPT-5.5 Extra High** - Centralize UI asset versioning so cache-key updates stop becoming release-churn.

Purpose:

Stop manually bumping scattered cache keys or asset query strings during UI/static slices.

This complements 0.33.6.15 but is not the same thing. 0.33.6.15 centralizes the current app version. This slice centralizes asset cache-busting.

* [ ] Inventory all script/style asset cache-bust patterns:

  * [ ] Static HTML query strings.
  * [ ] Shared app-shell includes.
  * [ ] Navigation/footer injected assets.
  * [ ] Module-declared assets.
  * [ ] Any tests that pin asset query strings or cache-bust values.
* [ ] Define one asset version/cache-bust source.

  * [ ] Prefer deriving from the current app version helper when acceptable.
  * [ ] If asset version must differ from app version, add a dedicated source such as `src/core/asset-version.js`.
* [ ] Route shared script/style URL generation through one helper where practical.
* [ ] Update static/protected pages and app-shell includes so asset URLs receive cache-bust values consistently.
* [ ] Remove scattered manually maintained cache-bust literals where safe.
* [ ] Preserve existing browser behavior and asset loading order.
* [ ] Add guardrails:

  * [ ] New raw `?v=...` or `?cache=...` asset literals outside approved helper/source files should fail unless explicitly allowed.
  * [ ] Historical docs/changelog examples should not be flagged.
* [ ] Add focused regressions proving:

  * [ ] Shared app-shell assets include the canonical cache-bust value.
  * [ ] Module assets receive consistent cache-bust behavior.
  * [ ] Manual cache-bust literals outside allowlisted files are caught.
  * [ ] Existing pages still load required scripts/styles.
  * [ ] No product behavior changes.
* [ ] Update docs to explain:

  * [ ] Do not manually bump cache keys.
  * [ ] Use the asset helper/source.
  * [ ] App version and asset version relationship.

Acceptance criteria:

* Asset cache-busting has one source-of-truth path.
* UI/static slices no longer require scattered manual cache-key edits.
* Guardrails prevent new scattered asset version literals.
* Existing pages and module assets continue loading correctly.

#### Version 0.33.6.16.6 - Parameter-binding audit baseline cleanup

**Model: GPT-5.5 Extra High** - Turn parameter-binding audit upkeep into a scanner/baseline workflow.

Purpose:

Stop making Codex/Claude repeatedly reconcile raw parameter-binding counts during unrelated database work.

This slice keeps the safety goal but changes the workflow: the scanner should report new violations against a known baseline rather than forcing broad count reconciliation every time.

* [ ] Inventory current parameter-binding audit scripts and docs:

  * [ ] audit scanner
  * [ ] audit regression
  * [ ] database parameter-binding audit docs
  * [ ] known exception lists, if any
* [ ] Define a baseline file, for example:

  * [ ] `scripts/baselines/parameter-binding-baseline.json`
  * [ ] or `docs/generated/parameter-binding-baseline.json`
* [ ] The baseline should track known legacy findings by stable location/signature.
* [ ] The scanner should report:

  * [ ] total scanned sites
  * [ ] safe bound sites
  * [ ] known baseline exceptions
  * [ ] new violations
  * [ ] resolved legacy findings, if useful
* [ ] The regression should fail on new violations.
* [ ] The regression should not fail merely because total scanned count changes due to unrelated safe code movement, unless a new unsafe pattern appears.
* [ ] Add a baseline update command for dedicated cleanup slices only, for example:

  * [ ] `npm run audit:params`
  * [ ] `npm run audit:params:update-baseline`
  * [ ] `npm run audit:params:check`
* [ ] Document the rule:

  * [ ] Do not update the baseline in unrelated feature work.
  * [ ] If a feature introduces a new query site, it must use the safe binding helper.
  * [ ] If a legacy unsafe site is fixed, the baseline may shrink in a dedicated cleanup or as part of that fix.
* [ ] Add focused regressions proving:

  * [ ] New unsafe query patterns fail.
  * [ ] Known baseline exceptions are reported but do not fail.
  * [ ] Safe new bound query sites pass.
  * [ ] Count-only drift does not force manual doc edits.
  * [ ] Baseline updates are deterministic.
* [ ] Update database docs to point to the scanner/baseline workflow.

Acceptance criteria:

* Parameter-binding safety remains enforced.
* New unsafe query sites fail fast.
* Known legacy findings are baseline-managed.
* Agents no longer have to manually reconcile broad scanned/bound counts during unrelated feature work.

#### Version 0.33.6.16.7 - Documentation ownership index and docs-change gate

**Model: GPT-5.5 Extra High** - Make docs updates intentional rather than scattered release ritual.

Purpose:

Reduce time spent guessing which docs must be updated for every implementation slice.

This slice does not reduce documentation quality. It makes documentation ownership explicit so Codex/Claude can update the right docs and explicitly skip irrelevant docs.

* [ ] Add a docs ownership index, for example:

  * [ ] `docs/docs-ownership.json`
  * [ ] or `docs/maintenance/docs-ownership.json`
* [ ] Map source areas to likely docs:

  * [ ] Workbench.
  * [ ] Dashboard.
  * [ ] Tasks.
  * [ ] Notes.
  * [ ] Lists.
  * [ ] Files.
  * [ ] Search.
  * [ ] Notifications.
  * [ ] Tags.
  * [ ] Time Tracking.
  * [ ] Permissions.
  * [ ] Database.
  * [ ] Module contracts.
  * [ ] View-building/declarative surfaces.
  * [ ] Public API.
  * [ ] Licensing.
  * [ ] Release process.
* [ ] Add a docs suggestion helper, for example:

  * [ ] `scripts/suggest-docs-for-changes.mjs`
* [ ] The helper should inspect changed files and list likely docs to review.
* [ ] Add a docs-change note convention:

  * [ ] Docs updated: list paths.
  * [ ] No docs change needed: short reason.
* [ ] Add a lightweight guardrail for release closeout:

  * [ ] If source files in a mapped area changed and no likely docs changed, print a warning or require an explicit no-doc-change note.
  * [ ] Keep this as warning-only at first unless the project decides to hard-fail later.
* [ ] Add focused regressions proving:

  * [ ] Changed tasks files suggest Tasks docs.
  * [ ] Changed Workbench files suggest UI/view/workbench docs.
  * [ ] Changed database/migration files suggest database docs.
  * [ ] Changed licensing docs suggest licensing docs/index.
  * [ ] Unmapped files do not produce noisy false positives.
* [ ] Update agent/development docs:

  * [ ] Use docs suggestion helper during closeout.
  * [ ] Do not update five docs by reflex.
  * [ ] Do update docs that own the changed contract.

Acceptance criteria:

* The repo has an explicit docs ownership index.
* Agents can ask the repo which docs are likely affected.
* Docs updates become targeted and intentional.
* Release closeout still preserves documentation quality.

#### Version 0.33.6.16.8 - Database migration and schema helper workflow

**Model: GPT-5.5 Extra High** - Prepare database workflow for upcoming TypeScript and later Postgres/database abstraction work.

Purpose:

Reduce hand-maintained migration/schema drift before the TypeScript and database abstraction work get heavier.

This slice does not change the database engine or add Postgres. It improves the workflow around migrations and schema snapshots.

* [ ] Inventory current migration/schema workflow:

  * [ ] migration file naming
  * [ ] migration runner behavior
  * [ ] `src/db/schema/current.sql`
  * [ ] fresh database regression
  * [ ] migration compatibility regression
  * [ ] SQLite performance/seed regressions
* [ ] Add a migration creation helper, for example:

  * [ ] `npm run db:migration:create -- <name>`
* [ ] The helper should:

  * [ ] choose the next migration number
  * [ ] create a correctly named migration file
  * [ ] include a minimal safe template
  * [ ] avoid duplicate numbers
* [ ] Add a schema refresh/check workflow, for example:

  * [ ] `npm run db:schema:refresh`
  * [ ] `npm run db:schema:check`
* [ ] Decide and document whether `src/db/schema/current.sql` is:

  * [ ] generated from migrations; or
  * [ ] manually maintained but verified against a generated schema.
* [ ] Prefer generated-or-verified schema over hand-edited schema drift.

  * Recommended default: keep `current.sql` manually maintained but verified against a generated schema (lighter than full generation); move to fully generating it from migrations only if drift keeps recurring.
* [ ] Add a guardrail:

  * [ ] If migrations change, schema check must prove `current.sql` is current.
  * [ ] If schema changes without a migration, fail unless explicitly allowed for docs/test-only work.
* [ ] Add focused regressions proving:

  * [ ] migration creation helper produces deterministic next names
  * [ ] duplicate migration numbers fail
  * [ ] schema refresh/check detects drift
  * [ ] fresh database still builds from migrations
  * [ ] migration compatibility regression still runs
* [ ] Update database docs with the new workflow.

Acceptance criteria:

* Database migration creation is scripted.
* Schema snapshot refresh/check is scripted.
* `current.sql` drift is detected.
* Future database changes require less manual bookkeeping.
* No database engine change occurs in this slice.

#### Version 0.33.6.16.9 - Licensing and public-release gate clarification

**Model: GPT-5.5 Extra High** - Clarify licensing/public-release gates so they do not become recurring mystery work.

Purpose:

Clarify that the licensing docs are not a routine per-slice cleanup burden. Separate current licensing state from future gates for public contributors, public release, app legal notices, and third-party notices.

This slice is not a legal rewrite. It is a repo-process clarification.

* [ ] Review the current licensing hub, licensing directory index, root README license section, package metadata license value, root `LICENSE`, and trademark notice.
* [ ] Confirm the current state is documented:

  * [ ] Longtail Forge Core uses `AGPL-3.0-only`.
  * [ ] Commercial licensing / hosted SaaS / private deployment tooling may be separate.
  * [ ] Trademark policy is linked.
  * [ ] Licensing policy docs are discoverable from README and `docs/licensing.md`.
* [ ] Clarify future gates in one place:

  * [ ] Contribution gate.
  * [ ] Public release legal/about screen.
  * [ ] Third-party notices.
  * [ ] PR template / CLA requirement before accepting outside contributions.
  * [ ] Private repo boundary for SaaS billing, tenant provisioning, hosted backups, production monitoring, customer admin tooling, managed deployment automation, paid plugins, and commercial license templates.
* [ ] Add a lightweight licensing gate check, warning-only unless the project decides otherwise:

  * [ ] Before public release, warn if `THIRD_PARTY_NOTICES.md` does not exist.
  * [ ] Before public contribution acceptance, warn if `CONTRIBUTING.md` / PR template / CLA process is not present.
  * [ ] Do not block normal private development slices on contribution/public-release gates.
* [ ] Add or update docs so agents understand:

  * [ ] Do not keep rewriting licensing docs during unrelated slices.
  * [ ] Do not add public-contributor language until outside contributions are actually being accepted.
  * [ ] Do not put private SaaS/commercial templates in the public repo.
  * [ ] Licensing docs are updated only for legal/policy changes, dependency notice changes, release-publication gates, or contributor-process gates.
* [ ] Add focused regressions or static checks proving:

  * [ ] README license still says `AGPL-3.0-only`.
  * [ ] `package.json` license remains `AGPL-3.0-only`.
  * [ ] Root `LICENSE` exists.
  * [ ] docs licensing hub and index links resolve.
  * [ ] Trademark policy link is still reachable.
  * [ ] Public-release/contribution gate warnings do not fail ordinary development.

Acceptance criteria:

* Licensing status is clear and not treated as broken.
* Future contributor/public-release gates are explicit.
* Ordinary feature slices do not keep revisiting licensing docs unnecessarily.
* No legal/policy rewrite occurs unless intentionally requested.

#### Version 0.33.6.16.10 - Pre-TypeScript maintenance closeout

**Model: GPT-5.5 Extra High** - Prove the maintenance cleanup reduces future agent churn without weakening gates.

Purpose:

Close out the release workflow/regression maintenance cleanup and confirm the repo is ready for 0.33.7 TypeScript/Zod/Vitest.

* [ ] Confirm 0.33.6.15 app-version source-of-truth still works.
* [ ] Confirm regression auto-discovery works.
* [ ] Confirm legacy regression scripts still run.
* [ ] Confirm regression coverage manifest/ratchet still protects coverage.
* [ ] Confirm narrow regression commands exist and are documented.
* [ ] Confirm changed-area regression suggestions work.
* [ ] Confirm asset cache-bust source-of-truth works and scattered manual cache keys are guarded.
* [ ] Confirm parameter-binding audit baseline reports new unsafe sites without requiring unrelated count reconciliation.
* [ ] Confirm docs ownership helper suggests relevant docs without requiring broad doc churn.
* [ ] Confirm database migration/schema helpers work.
* [ ] Confirm licensing/public-release gates are documented as future/process gates, not routine slice blockers.
* [ ] Confirm `npm start` is unchanged.
* [ ] Confirm `npm run check` still represents the full release gate.
* [ ] Confirm no TypeScript, Zod, Vitest, Playwright, Puppeteer, jsdom, PHP, Python, or second runtime was introduced.
* [ ] Update agent/development docs with the new recommended order:

  * [ ] Run changed-area suggestions.
  * [ ] Run narrow regression command first.
  * [ ] Run full `npm run check` for shared framework/release closeout.
  * [ ] Update docs only when the docs ownership helper or changed contract warrants it.
* [ ] Update `CHANGELOG.md`, package metadata, and roadmap bookkeeping.
* [ ] Run final verification:

  * [ ] `npm run check`
  * [ ] `npm run test:permissions`
  * [ ] narrow regression commands for at least Workbench, Files, Tasks, Database, Release, and Docs
  * [ ] version/app-info verification after restart

Acceptance criteria:

* The repo has cleaner release/version/regression/docs/database/licensing maintenance workflows before TypeScript starts.
* Agents can add regressions with less manual wiring.
* Agents can run narrower checks for focused changes.
* Release-gate coverage is preserved.
* The repo is ready for 0.33.7 TypeScript/Zod/Vitest without dragging the old maintenance clutter into that slice.

## Version 0.33.7 - TypeScript, Runtime Contracts, and Fast Test Foundation

Purpose:

Introduce TypeScript, Zod, and Vitest as a focused correctness-and-speed foundation without rewriting the app, changing the runtime boot path, or turning Longtail Forge into a multi-language/polyglot project.

This version is not a TypeScript conversion wave. It establishes the contract pattern that future modules and framework surfaces should use:

- TypeScript catches code/contract drift at development time.
- Zod validates untrusted runtime input at the edges.
- Vitest provides fast, narrow contract/service tests so Codex/Claude can fail quickly before running the full regression suite.

The goal is to reduce slow regression churn by catching common shape errors, renamed fields, invalid payloads, broken module contracts, and contract-test failures early and locally. This does not replace the existing regression suite, permission regressions, database regressions, browser/static regressions, or release closeout checks.

Dependencies and sequencing:

- Lands after 0.33.6 (Dashboard/Workbench formalization) so the framework surfaces it contracts against are stable, and before the Playwright, Mobile, Calendar, and Reporting slices that build on the contracts it establishes.
- Lands before 0.33.11 (Reporting Framework) so Reporting, public API expansion, tickets, creator tools, and future module contribution points are built against clearer contracts.
- Builds on the framework contracts stabilized through 0.33.5-0.33.6:
  - Module manifests.
  - Declarative view surfaces.
  - Dashboard/Workbench contributions.
  - Work candidates.
  - Focus modes.
  - Resume-state producers.
  - Search.
  - Notifications.
  - Tags.
  - Files.
  - Permissions.
  - Public API envelopes.
  - Jobs.
  - Database seam.
- Keeps the primary app as Node/Express/ESM.
- Does not introduce PHP, Python, or any second backend runtime in this version.
- Does not add a TypeScript compile step to `npm start`.

Key decisions:

- Incremental, not a rewrite.
- TypeScript is introduced first as dev-time checking.
- Zod is introduced as runtime validation for selected edge contracts, not as a blanket internal-object parser.
- Vitest is introduced for narrow unit/contract tests, not as a replacement for the existing regression runner.
- Runtime-imported contract/schema files must remain runnable by the current Node app.
  - If a schema is used at runtime, keep it in JavaScript (`.js`) with JSDoc/type support until the repo has an intentional build strategy.
  - Type-only `.ts` files may exist, but runtime JavaScript must not import `.ts` files directly.
- `npm start` must remain `node server.js`.
- `npm run check` should run the fastest checks first:
  1. TypeScript typecheck.
  2. Vitest narrow/unit tests.
  3. Existing regression runner.
  4. ESLint.
- Codex/Claude should run module-specific tests first, then typecheck, then full `npm run check` only when the change touches shared framework contracts, shared services, release closeout, or multiple modules.

Non-goals:

- Do not convert the whole repo to TypeScript.
- Do not convert browser UI scripts broadly in this version.
- Do not add a runtime TypeScript loader to app startup.
- Do not add PHP or Python for Files or other module logic.
- Do not replace the existing regression runner.
- Do not weaken permission, workspace, module-enabled, private/secure-content, storage-key, or no-raw-ID guardrails.
- Do not silence type errors with blanket `any`, broad `// @ts-ignore`, or global type exclusions.

### Version 0.33.7.1 - Tooling setup: TypeScript, Zod, and Vitest

**Model: GPT-5.5 Extra High** - Tooling foundation with no app boot-path change.

- [ ] Add TypeScript as a dev dependency.
- [ ] Add Vitest as a dev dependency.
- [ ] Add Zod as a runtime dependency because schemas will be used by runtime validation paths.
- [ ] Add `tsconfig.json`.
  - [ ] Node/ESM-compatible compiler settings.
  - [ ] `noEmit: true`.
  - [ ] `allowJs: true`.
  - [ ] Scope `include` narrowly at first.
  - [ ] Use `checkJs` selectively instead of type-checking the entire repo immediately.
  - [ ] Exclude runtime data, generated files, `archive/`, build/vendor output, temporary directories, and `node_modules`.
- [ ] Add package scripts:
  - [ ] `typecheck` - runs `tsc --noEmit`.
  - [ ] `test:unit` - runs Vitest once.
  - [ ] `test:watch` - runs Vitest in watch mode.
  - [ ] `test:contracts` - runs contract/schema-focused Vitest tests.
  - [ ] `test:files` - runs Files-focused Vitest tests once Files is the proving-ground module.
  - [ ] `test:tasks` - runs Tasks-focused Vitest tests once Tasks has contract tests.
- [ ] Keep `npm start` unchanged.
- [ ] Update `npm run check` so it runs fast checks before the existing slow suite:
  - [ ] `npm run typecheck`
  - [ ] `npm run test:unit`
  - [ ] existing regression runner
  - [ ] ESLint
- [ ] Add a guardrail proving `npm run check` invokes `typecheck` and `test:unit` before the full regression runner.
- [ ] Do not alter runtime behavior in this slice except dependency availability and script wiring.

Acceptance criteria:

- TypeScript, Zod, and Vitest are installed.
- `npm run typecheck` works in `noEmit` mode.
- `npm run test:unit` works even with an initial minimal test.
- `npm run check` runs typecheck and unit tests before the existing regression runner.
- `npm start` remains unchanged and does not run TypeScript compilation.

### Version 0.33.7.2 - Contract folder and module public-entry pattern

**Model: GPT-5.5 Extra High** - Repo-shape guardrails before broad conversion.

Purpose:

Create the structure that prevents future modules from becoming import spaghetti. This slice establishes where contracts live and how other code imports module capabilities.

- [ ] Establish the preferred contract/schema pattern:
  - [ ] `*.contracts.js` or `*.schema.js` for runtime Zod schemas and JSDoc-backed types.
  - [ ] Optional `*.types.ts` or shared `.d.ts` files for type-only definitions that are never imported by runtime JavaScript.
  - [ ] Tests live beside contracts or in a clearly named test folder.
- [ ] Establish module public entry points where practical:
  - [ ] `src/modules/files/index.js`
  - [ ] `src/modules/tasks/index.js`
  - [ ] `src/modules/notes/index.js`
  - [ ] Similar pattern for other modules as they are touched.
- [ ] Document the import rule:
  - [ ] Framework/shared code should import module capabilities from public entry points.
  - [ ] Other modules must not import another module's internal repositories/services directly unless an explicit contract allows it.
- [ ] Add a lightweight static guardrail for obvious forbidden imports between module internals.
- [ ] Document the distinction:
  - [ ] TypeScript types describe trusted internal shapes.
  - [ ] Zod validates untrusted runtime input and config.
  - [ ] Vitest proves contracts and service behavior.
  - [ ] Existing regressions still prove integration, permissions, database behavior, and browser/static behavior.

Acceptance criteria:

- The repo has a documented contract/schema/test pattern.
- Module public-entry rules are documented.
- At least one guardrail prevents obvious cross-module internal imports.
- No broad module rewrite occurs.

### Version 0.33.7.3 - Zod proving ground: Files contract schemas

**Model: GPT-5.5 Extra High** - Runtime contract proof on the module most likely to grow storage/preview/upload complexity.

Purpose:

Use Files as the first Zod proving ground because Files will eventually need upload metadata, attachment contracts, previews, storage adapters, scanners, SaaS/private-hosted storage differences, and future indexing. This is where runtime validation will pay for itself without converting the whole app.

- [ ] Add Files-owned runtime schemas in JavaScript, for example:
  - [ ] `CreateFileSchema`
  - [ ] `UpdateFileSchema`
  - [ ] `FileMetadataSchema`
  - [ ] `FileAttachmentSchema`
  - [ ] `FilePreviewRequestSchema`
  - [ ] `FileStorageAdapterConfigSchema`
- [ ] Keep schemas focused on edge payloads:
  - [ ] Request bodies.
  - [ ] Query params.
  - [ ] Upload metadata.
  - [ ] Storage configuration.
  - [ ] Preview/action payloads.
- [ ] Do not Zod-parse every internal object passed between already-trusted service functions.
- [ ] Preserve the existing Files behavior and error envelope for valid requests.
- [ ] If invalid payload handling changes, make the error shape explicit, consistent, and tested.
- [ ] Add JSDoc typedefs inferred from Zod schemas where useful.
- [ ] Add Vitest contract tests proving:
  - [ ] Valid create/update payloads pass.
  - [ ] Empty/invalid required fields fail.
  - [ ] Defaults are applied intentionally.
  - [ ] Unknown/unsafe fields are stripped or rejected according to the chosen contract.
  - [ ] Private/storage/scanner-sensitive fields cannot be accepted from user input.
- [ ] Add one narrow Files command, such as `npm run test:files`, that runs only Files Vitest tests.

Acceptance criteria:

- Files has runtime Zod schemas for its highest-risk edge payloads.
- Files schemas are covered by fast Vitest tests.
- Valid existing Files behavior is preserved.
- Unsafe/unknown file input is explicitly handled.
- `npm run test:files` gives Codex/Claude a narrow first check for Files work.

### Version 0.33.7.4 - TypeScript contract checking for high-value framework seams

**Model: GPT-5.5 Extra High** - Selective type coverage over shared contracts without broad conversion.

Purpose:

Type the seams that cause the most expensive regression churn when they drift. This slice should not try to type every module.

- [ ] Add shared typed/JSDoc-backed definitions for the highest-value contracts:
  - [ ] Module manifest shape.
  - [ ] Declarative view descriptor shape.
  - [ ] Dashboard contribution shape.
  - [ ] Workbench contribution shape.
  - [ ] Work candidate shape.
  - [ ] Focus-mode definition/context shape.
  - [ ] Resume-state producer payload shape.
  - [ ] Search record/reference/result shape.
  - [ ] Notification event/create/read payload shape.
  - [ ] Taggable/searchable/attachable manifest contribution shapes.
  - [ ] Public API success/error/list envelope.
  - [ ] Job enqueue/handler payload shape.
  - [ ] Database adapter/dialect seam shape.
- [ ] Add `// @ts-check` plus JSDoc typing only to selected high-value JavaScript files first:
  - [ ] `src/core/modules/manifest-contract.js`
  - [ ] module registry/validation path
  - [ ] work-candidate/focus/resume services
  - [ ] search contract/service seam
  - [ ] notification contract/service seam
  - [ ] tag contract/service seam
  - [ ] Files contract/service seam from 0.33.7.3
- [ ] Model dual-cased shapes honestly where they still exist.
  - [ ] Do not pretend everything is camelCase if existing code still accepts or emits snake_case.
  - [ ] Prefer a normalized internal shape plus explicit edge adapters where practical.
- [ ] Fix real contract drift exposed by typecheck.
- [ ] Do not mask drift with blanket `any`.
- [ ] Do not type-check the entire browser UI in this slice.
- [ ] Do not rename working files just to make them `.ts`.

Acceptance criteria:

- High-value framework contracts have importable/checkable definitions.
- Selected files pass `@ts-check` or TypeScript checking against those contracts.
- Typecheck catches real shape drift without requiring a repo-wide conversion.
- Dual casing is modeled explicitly where it still exists.

### Version 0.33.7.5 - Vitest narrow tests and Codex/Claude workflow

**Model: GPT-5.5 Extra High** - Fast verification paths that reduce unnecessary full-regression runs.

Purpose:

Give agents fast, targeted commands before the full suite. Vitest does not replace the existing regression runner; it creates cheap tripwires for contracts and service logic.

- [ ] Add initial Vitest tests for:
  - [ ] Files schemas from 0.33.7.3.
  - [ ] Work candidate ranking pure functions.
  - [ ] Focus-mode context resolution.
  - [ ] Resume payload allowlist/denylist behavior.
  - [ ] Public API envelope helpers.
  - [ ] Shared pagination/envelope helpers where currently duplicated.
- [ ] Add or document narrow commands:
  - [ ] `npm run test:contracts`
  - [ ] `npm run test:files`
  - [ ] `npm run test:tasks`
  - [ ] `npm run test:unit`
- [ ] Update agent/development docs with the verification order:
  - [ ] For a one-module change: run that module's narrow test first.
  - [ ] For schema/contract changes: run `npm run test:contracts` and `npm run typecheck`.
  - [ ] For shared framework changes: run `npm run typecheck`, `npm run test:unit`, then `npm run check`.
  - [ ] For release closeout: run full required verification.
- [ ] Add a guardrail proving the narrow commands exist and are wired to Vitest.
- [ ] Keep existing regression scripts as the source of truth for integration behavior, permissions, database migrations, file-storage side effects, browser/static guardrails, and closeout coverage.
- [ ] Do not delete existing regressions merely because a Vitest test now covers a smaller unit; retirement/consolidation must follow the regression coverage-ratchet rules.

Acceptance criteria:

- Vitest has useful initial coverage of schemas and pure contract/service logic.
- Narrow test commands exist and pass.
- Agent docs tell Codex/Claude to run narrow tests first.
- Existing regression coverage remains intact.

### Version 0.33.7.6 - Optional Tasks contract schemas, only if Files proves the pattern cleanly

**Model: GPT-5.5 Extra High** - Second-module validation only if the first proving ground is stable.

Purpose:

Apply the same Zod/Vitest pattern to Tasks only if Files establishes the pattern without churn. This slice may be deferred if 0.33.7 is getting too large.

- [ ] Add Tasks-owned runtime schemas for selected edge payloads:
  - [ ] Create task.
  - [ ] Update task.
  - [ ] Checklist item mutation.
  - [ ] Recurrence update mode.
  - [ ] Task focus/action payload where applicable.
- [ ] Validate only edge inputs, not every internal service object.
- [ ] Add Vitest tests for:
  - [ ] Required title/status/priority behavior.
  - [ ] Checklist mutation payloads.
  - [ ] Recurrence update mode validation.
  - [ ] Invalid parent/child/context payload shapes.
- [ ] Add or activate `npm run test:tasks`.

Acceptance criteria:

- Tasks has the same contract/schema/test pattern as Files for selected edge payloads.
- The work remains contained and does not become a broad Tasks rewrite.
- If deferred, document the reason and keep Files as the completed proving ground.

### Version 0.33.7.7 - Release closeout

**Model: GPT-5.5 Extra High** - Prove the new loop is useful, wired, and non-vacuous.

- [ ] Confirm `npm start` remains unchanged and does not compile or typecheck.
- [ ] Confirm `npm run typecheck` runs in `noEmit` mode.
- [ ] Confirm `npm run test:unit` runs Vitest tests.
- [ ] Confirm `npm run check` runs:
  - [ ] typecheck
  - [ ] unit/Vitest tests
  - [ ] existing regression runner
  - [ ] ESLint
- [ ] Confirm fast-failure ordering: typecheck/Vitest failures stop before the slow regression runner.
- [ ] Add a "proof it bites" guardrail:
  - [ ] A seeded temporary contract/type error fails `npm run typecheck`.
  - [ ] A seeded temporary schema test failure fails the relevant Vitest command.
  - [ ] The seeded failures are removed before final verification.
- [ ] Confirm no blanket `any`, broad `@ts-ignore`, or global `@ts-nocheck` was added to bypass the new checks.
- [ ] Confirm no PHP, Python, second backend runtime, app-start TypeScript loader, or broad browser TypeScript conversion was introduced.
- [ ] Update documentation:
  - [ ] Architecture notes.
  - [ ] Module contract docs.
  - [ ] Development/agent verification workflow.
  - [ ] Runtime validation vs. TypeScript checking explanation.
- [ ] Update `CHANGELOG.md` and package metadata.
- [ ] Run final verification:
  - [ ] `npm run typecheck`
  - [ ] `npm run test:unit`
  - [ ] `npm run check`
  - [ ] `npm run test:permissions`

Acceptance criteria:

- TypeScript, Zod, and Vitest are installed and documented.
- `npm start` remains pure Node runtime startup.
- `npm run check` fails faster by running typecheck and Vitest before the full regression runner.
- Files has a proven Zod + Vitest contract pattern.
- High-value framework seams have initial type coverage.
- Existing regression coverage remains intact.
- The repo has clearer contracts without becoming a rewrite, a polyglot app, or a TypeScript build-system project.

## Version 0.33.8 - Playwright End-to-End Smoke Foundation (dev/test tooling only)

Purpose:

Add the missing rendered signal. The existing regression suite (300+ scripts) is entirely static source/string assertion and never launches a browser, so it cannot see real viewport behavior, horizontal overflow, mobile navigation, or runtime console errors. This version introduces Playwright as a narrow, dev/test-only end-to-end smoke harness that renders the real app at desktop and mobile viewports and asserts the handful of things static checks cannot.

This is a foundation slice, not an end-to-end test conversion. Keep the first suite intentionally small: load, overflow, mobile nav, and console-error smoke on the highest-traffic surfaces. It exists so that 0.33.9 (Mobile Polish) and future responsive work have an objective, rendered pass/fail signal instead of "the static suite is green."

Dependencies and sequencing:

- Lands after 0.33.7 (TypeScript/Vitest foundation) so dev tooling conventions and `npm run check` ordering already exist.
- Lands before 0.33.9 (Mobile Polish), which consumes this harness as its acceptance signal.
- Builds on the framework-owned app shell, navigation, Dashboard, and Workbench surfaces already shipped through 0.33.6.
- Does not depend on Reporting (now 0.33.11).

Key decisions:

- Playwright is dev/test tooling ONLY. It must never enter the production runtime or the app boot path.
  - `@playwright/test` is a `devDependencies` entry, never a `dependencies` entry.
  - Playwright browser binaries are installed on demand in dev/CI (`npx playwright install`), never required by `npm start` or app startup.
  - No file under `src/`, `server.js`, `public/`, or any runtime path imports `@playwright/test` or `playwright`.
  - The e2e suite lives in a dedicated `tests/e2e/` folder that is not shipped, served, or imported by runtime code.
- `npm start` remains `node server.js`, unchanged.
- The e2e smoke is a SEPARATE npm script (`test:e2e`), not wired into the default `npm run check`, because it requires browser binaries and a running server that not every environment (or fast local loop) will have. `npm run check` stays the fast static/regression gate; `test:e2e` is run explicitly, in CI, and as the acceptance gate for 0.33.9 and future responsive slices.
- The smoke suite authenticates against a local dev server using a seeded test session/`storageState`, so protected surfaces (Dashboard, Workbench) are reachable without hard-coding real credentials.
- Viewports are fixed and named: a desktop profile (e.g. 1280x800) and a mobile profile (e.g. 375x812), reused across specs.
- "No major console errors" means captured `pageerror` and `console.error` events, minus a small, documented allowlist of known-benign messages; unexpected entries fail the spec.

Non-goals:

- Do not convert the existing static regression suite to Playwright.
- Do not add Playwright to production `dependencies` or to `npm start`.
- Do not build a large page-object framework or exhaustive E2E coverage in this pass.
- Do not make `npm run check` depend on browser binaries.
- Do not weaken permission, workspace, module-enabled, private/secure-content, or no-raw-ID guardrails to make a page testable.

### Version 0.33.8.1 - Playwright dev-dependency install and config (no boot-path change)

**Model: GPT-5.5 Extra High** - Dev tooling foundation with zero production-runtime footprint.

- [ ] Add `@playwright/test` as a `devDependencies` entry only.
- [ ] Add a `playwright.config.js` (or a type-only `.ts` per the 0.33.7 runtime-import rule) under the repo root or `tests/e2e/`:
  - [ ] Define named `projects` for a desktop viewport (e.g. 1280x800) and a mobile viewport (e.g. 375x812 / a device profile).
  - [ ] Point `testDir` at `tests/e2e/`.
  - [ ] Set `baseURL` to the local dev server (configurable via env, defaulting to the existing local port).
  - [ ] Optionally use `webServer` to boot `node server.js` for the run, or document the "server already running" expectation; either way `npm start` itself stays unchanged.
  - [ ] Capture trace/screenshot on failure for debugging.
- [ ] Add package scripts:
  - [ ] `test:e2e` - runs the Playwright smoke suite once.
  - [ ] `test:e2e:install` - runs `npx playwright install` for local/CI browser setup.
  - [ ] (optional) `test:e2e:ui` - Playwright UI mode for local debugging.
- [ ] Add a seeded test-session/auth helper so protected surfaces are reachable:
  - [ ] Establish a `storageState` (or login-per-run) against a dev/test account without committing real credentials.
  - [ ] Keep any test seed/fixture data separate from production data paths.
- [ ] Keep `npm start` unchanged and do NOT wire `test:e2e` into `npm run check`.
- [ ] Do not alter runtime behavior in this slice except dev-dependency availability, config, and script wiring.

Acceptance criteria:

- `@playwright/test` is present only in `devDependencies`.
- `npm run test:e2e` runs (even with a single trivial spec) at both desktop and mobile viewports.
- `npm start` is unchanged and does not require Playwright or browser binaries.
- `npm run check` does not invoke Playwright.

### Version 0.33.8.2 - Core smoke specs: load, overflow, mobile nav, console

**Model: GPT-5.4** - Narrow, high-signal rendered smoke on the highest-traffic surfaces.

- [ ] App loads (desktop): the app shell renders at the desktop viewport with primary navigation present and no fatal load error.
- [ ] App loads (mobile): the app shell renders at the mobile viewport with the mobile navigation affordance present.
- [ ] Dashboard has no horizontal overflow:
  - [ ] At the mobile viewport, assert `document.scrollingElement.scrollWidth <= clientWidth` (no horizontal scroll) on the Dashboard.
  - [ ] Assert the same at the desktop viewport.
- [ ] Workbench has no horizontal overflow:
  - [ ] At the mobile viewport, assert no horizontal scroll on the Workbench.
  - [ ] Assert the same at the desktop viewport.
- [ ] Mobile nav opens/closes:
  - [ ] At the mobile viewport, the nav toggle opens the navigation drawer/menu.
  - [ ] Closing (toggle, overlay, or close control) hides it again and returns focus safely.
- [ ] No major console errors:
  - [ ] Capture `pageerror` and `console.error` while loading the app shell, Dashboard, and Workbench.
  - [ ] Fail on any entry outside a small, documented allowlist of known-benign messages.
- [ ] Keep specs organized by concern (e.g. `app-load.spec`, `overflow.spec`, `mobile-nav.spec`, `console.spec`) under `tests/e2e/`.
- [ ] Keep selectors resilient: prefer stable framework anatomy hooks (existing `data-view-*` / nav hooks) over brittle text or nth-child selectors.

Acceptance criteria:

- All six smoke checks pass at their intended viewports against a running dev server.
- The overflow checks measure real rendered width, not CSS strings.
- The console check fails on a deliberately injected error and passes when clean.

### Version 0.33.8.3 - Guardrails, docs, and closeout

**Model: GPT-5.5 Extra High** - Lock the dev-only boundary and document the harness.

- [ ] Add a static guardrail regression (in the existing `scripts/` suite) proving the dev-only boundary:
  - [ ] `@playwright/test` appears in `devDependencies` and NOT in `dependencies`.
  - [ ] No `src/`, `server.js`, or `public/` runtime file imports `@playwright/test` or `playwright`.
  - [ ] `npm start` remains `node server.js`.
- [ ] Confirm the version-guardrail ceremony: bump package/package-lock and any version-asserting scripts consistently, and register the new `scripts/` guardrail with the suite/coverage manifest.
- [ ] Document the harness:
  - [ ] Add `docs/e2e-testing.md` (or a section in an existing testing doc) describing how to install browsers, run `test:e2e`, add specs, the viewport profiles, and the console allowlist policy.
  - [ ] Note explicitly that Playwright is dev/test-only and never part of production runtime.
- [ ] Update `CHANGELOG.md`, package metadata, `DECISIONS.md` (record the "rendered smoke is a separate gate, not part of `npm run check`" decision), and roadmap archive bookkeeping.
- [ ] Run `npm run check` (static suite still green).
- [ ] Run `npm run test:e2e` (rendered smoke green at both viewports).
- [ ] Verify `/api/app-info` reports the expected version.

Acceptance criteria:

- A guardrail fails if Playwright is ever moved into production `dependencies` or imported by runtime code.
- The static regression suite and the rendered smoke suite both pass.
- The harness is documented and reproducible from a clean checkout.

## Version 0.33.9 - Mobile Polish (rendered against the 0.33.8 smoke harness)

Purpose:

Make Longtail Forge load and look good on a phone. With the 0.33.8 Playwright smoke providing a real rendered signal, this version does the actual responsive polish across the framework-owned app shell and the highest-traffic surfaces, then extends the smoke suite so mobile quality stays green going forward.

Do the foundation first, then polish per surface. A single global "make everything mobile" sweep is unsafe on an 8k-line framework CSS with static-only guardrails; a foundation slice plus bounded per-surface slices, each verified in a real browser, is not.

Dependencies and sequencing:

- Lands after 0.33.8 (Playwright smoke) and uses `npm run test:e2e` as its acceptance gate.
- Stays within existing guardrails: the framework owns layout/anatomy and `.view-*`; modules own data/behavior. Do not rename or restructure the DOM anatomy that the static regressions assert; add responsive behavior on top of it.
- Centralizes responsive rules in the framework CSS (`public/css/longtail-forge.css`, ~8k lines, currently ~13 media queries) rather than scattering per-module overrides.

Key decisions:

- Establish shared breakpoint tokens/util classes once in the framework CSS; surfaces consume them instead of inventing per-page breakpoints.
- Ensure a correct viewport meta tag and mobile-safe base typography/tap targets app-wide before per-surface tweaks.
- Preserve the existing graceful narrow-layout hide/collapse behavior (e.g. the Workbench Inspector) unless a slice intentionally designs a drawer.
- Every surface touched must pass the 0.33.8 overflow + console smoke at the mobile viewport before its slice closes.

Non-goals:

- Do not restructure framework-owned anatomy or `.view-*` hooks the static regressions pin.
- Do not build a separate mobile app, separate mobile templates, or a parallel mobile CSS file.
- Do not add horizontal-scrolling data tables; wrap/stack or provide contained overflow instead.

### Version 0.33.9.1 - Mobile foundation: viewport, breakpoints, base type and tap targets

**Model: GPT-5.5 Extra High** - Framework CSS foundation that every later surface consumes.

- [ ] Confirm/add a correct `<meta name="viewport" content="width=device-width, initial-scale=1">` in the framework app shell for all protected views.
- [ ] Add shared breakpoint tokens/util classes to `public/css/longtail-forge.css` (a small, documented set of breakpoints) as the single source of responsive truth.
- [ ] Set mobile-safe base typography, line-height, spacing, and minimum tap-target sizing at the shell level.
- [ ] Ensure the base page/container never forces horizontal scroll at the mobile viewport (no fixed min-widths, safe `overflow-x`, images/media constrained to `max-width: 100%`).
- [ ] Do not change framework-owned anatomy class names or `.view-*` hooks; add responsive rules on top of existing anatomy.
- [ ] Extend the 0.33.8 smoke: app-shell has no horizontal overflow and no console errors at the mobile viewport.

Acceptance criteria:

- Shared breakpoints/tokens exist and are documented.
- The app shell has a correct viewport meta and no base horizontal overflow on mobile.
- Static regressions remain green (no anatomy renamed).

### Version 0.33.9.2 - Mobile navigation drawer

**Model: GPT-5.4** - Framework-owned mobile navigation.

- [ ] Convert the primary navigation into a mobile-friendly drawer/menu below the mobile breakpoint, using the existing framework nav anatomy/hooks.
- [ ] Provide an accessible toggle (open/close), overlay/escape/close affordances, focus management, and body-scroll handling while open.
- [ ] Preserve full desktop navigation above the breakpoint unchanged.
- [ ] Extend the 0.33.8 smoke: mobile nav opens and closes, and focus returns safely.

Acceptance criteria:

- Mobile nav opens/closes via the smoke spec at the mobile viewport.
- Desktop navigation is unchanged.
- Keyboard/focus behavior is safe.

### Version 0.33.9.3 - Per-surface responsive polish (Dashboard, Workbench, and primary list/modal surfaces)

**Model: Claude Fable 5** - Bounded, mechanical per-surface CSS/layout polish on top of the foundation, verified by the rendered smoke. This is the safe home for a Fable pass: the foundation and a rendered pass/fail signal already exist, and scope is one surface at a time - not a blind global sweep.

- [ ] Dashboard: stack panels cleanly in the specified order on mobile, compact cards, no horizontal overflow, long labels wrap/truncate safely (consume the existing 0.33.6.13g responsive intent).
- [ ] Workbench: focus box, filters, task-focus sections, and Inspector reflow/stack or collapse safely on mobile with no horizontal overflow; preserve existing collapse/hide behavior.
- [ ] Primary list and modal surfaces (Tasks, Notes, Files, Lists, Linked Context picker): tables wrap/stack or use contained overflow, modals fit the mobile viewport, controls remain reachable and tappable.
- [ ] Keep all changes CSS/layout-level on top of existing anatomy; route any behavior changes through existing framework/module hooks, not new anatomy.
- [ ] Extend the 0.33.8 smoke per surface: Dashboard and Workbench (already covered) plus at least one list and one modal assert no horizontal overflow and no console errors at the mobile viewport.

Acceptance criteria:

- Dashboard and Workbench pass mobile overflow + console smoke.
- At least one list surface and one modal pass mobile overflow smoke.
- No framework-owned anatomy was renamed; static regressions stay green.

### Version 0.33.9.4 - Guardrails, docs, and closeout

**Model: GPT-5.5 Extra High** - Lock mobile quality in and document it.

- [ ] Ensure the extended Playwright smoke covers app-shell, Dashboard, Workbench, one list, and one modal at the mobile viewport (overflow + console) plus mobile nav open/close.
- [ ] Confirm the version-guardrail ceremony and register any new `scripts/` guardrails with the suite/coverage manifest.
- [ ] Update docs: responsive/mobile conventions (breakpoints, viewport, drawer, no-horizontal-table rule) in the relevant `docs/` UI/view contracts; note the mobile smoke as an ongoing gate.
- [ ] Update `CHANGELOG.md`, package metadata, `DECISIONS.md`, and roadmap archive bookkeeping.
- [ ] Manual smoke on a real phone or emulated device for the primary surfaces.
- [ ] Run `npm run check` (static suite green).
- [ ] Run `npm run test:e2e` (mobile smoke green).
- [ ] Verify `/api/app-info` reports the expected version.

Acceptance criteria:

- The app loads and looks good on a phone across the primary surfaces.
- The mobile smoke suite is green and guards against regressions.
- Static regressions remain green; no anatomy was renamed to achieve mobile polish.

## Version 0.33.10 - Task Calendar Views (lean, read-only)

Purpose:

Give the Dashboard/Workbench work a calendar companion: a read-only calendar that visualizes existing task due dates and the reminder schedule shipped in 0.33.5.21.8. This is intentionally lean. User-created calendar events, iCal/shared-calendar display, and external Google/Outlook sync stay at 0.36.0 (Calendars and Calendar Views) and the 0.70.x integrations work; this slice must not build them.

Scope decision:

- Read-only. No calendar event record type, no event creation, no iCal, and no external calendar sync in this slice.
- Framework-owned Calendar host built on the finalized 0.33.5.18 view baseline and the bounded-query pattern from 0.33.5.20, not a bespoke Calendar-only layout.
- Data comes from the existing task calendar-window path (`GET /api/tasks/calendar` -> `tasksService.calendarWindow` -> `tasksRepository.readDueBetween`), which is already workspace- and permission-aware and date-range bounded (`canReadTask` filtering, `taskCalendarRow` shape). Extend it only where needed; do not replace it with a load-everything query.

### Version 0.33.10.1 - Task calendar data contract

- [ ] Confirm/extend `tasksService.calendarWindow` (`src/modules/tasks/tasks.service.js`) to return everything a month/week/day render needs: task id, title, due date, due time/`due_at_utc`, status, priority, client/project context, assignee summary, and a task URL/link.
- [ ] Include reminder markers from the 0.33.5.21 reminder schedule (the `reminder_at_utc` occurrences from `taskRemindersService`) so the calendar can show when reminders fire, not only the due date.
- [ ] Keep the range bounded (reuse the existing start/end window and the 0.33.5.20 bounded-query pattern via `readDueBetween`); clamp or reject overly wide ranges instead of loading all tasks.
- [ ] Keep results permission- and workspace-aware (already enforced by `canReadTask` in `calendarWindow`); archived/complete and disabled-module handling must match the rest of Tasks.

### Version 0.33.10.2 - Framework Calendar host and month/week/day views

- [ ] Add a framework-owned Calendar surface (protected page + browser behavior) built on `LongtailForge.view` primitives and the 0.33.5.18 anatomy, not hand-built layout/CSS.
- [ ] Render read-only month, week, and day views of task due dates (year view can defer to 0.36.0).
- [ ] Show each task as a calendar entry with its title and a priority/status affordance, plus a reminder indicator on days a reminder fires; clicking an entry opens the existing task editor/detail (reuse the task modal) rather than an inline editor.
- [ ] Handle empty/loading/error states through the framework view states, not ad-hoc DOM.

### Version 0.33.10.3 - Filters, navigation, and Workbench hook

- [ ] Add client (business workspace only) and project filters, mirroring the filter behavior used by Tasks and the Reporting host.
- [ ] Add period navigation (previous/next/today) and view switching (month/week/day) that re-query the bounded window.
- [ ] Add framework navigation for the Calendar surface, permission- and module-aware.
- [ ] Provide a lightweight entry point from Workbench/Dashboard (e.g. a "this week" affordance or link) so the calendar reinforces the "what's due next / work this week" focus modes; keep Workbench framework-owned and do not duplicate calendar logic there.

### Version 0.33.10.4 - Guardrails, docs, and closeout

- [ ] Do not introduce a calendar event record type, iCal parsing, or external calendar sync in this slice; cross-reference 0.36.0 as the owner of events/iCal and the 0.70.x work as the owner of Google/Outlook sync.
- [ ] Add guardrails so the Calendar host does not hand-build framework-owned page/header/filter/status anatomy when a view primitive already covers it.
- [ ] Add focused regressions: bounded-range enforcement, permission/workspace scoping (no cross-workspace or unreadable tasks leak), reminder-marker correctness, and disabled-module behavior.
- [ ] Update `docs/declarative-view-surfaces.md` and the view/module contract docs with the Calendar host status.
- [ ] Update the changelog and verify `/api/app-info` after restart.

Acceptance criteria:

- A read-only task calendar (month/week/day) shows task due dates and reminder markers, filtered by client/project, consuming the existing bounded, permission-aware task calendar-window path.
- Calendar entries link back to their task; the surface reuses framework view anatomy and adds no event/iCal/external-sync behavior (those remain at 0.36.0 / 0.70.x).
- The calendar is reachable from Workbench/Dashboard and reinforces the "what's due / this week" focus without duplicating calendar logic.

## Version 0.33.11 - Reporting Framework and Time Report Contribution

Decision:

Reporting is framework-owned report infrastructure, not a normal disable-able first-party workflow module. The framework owns the Reporting page, report catalog, contribution filtering, report execution dispatch, shared filter host, loading/error/empty states, and future saved/export/export scheduling behavior. Individual modules own the actual report definitions, report runners, data queries, domain calculations, result shapes, and record-level permission checks.

The first 0.33.11 report should remain intentionally small: Time Tracking contributes one Project Time & Billing report. Do not build a custom report builder, report designer, analytics dashboard, or saved report system in this pass.

### Dependencies and Framework Baseline

This version builds on the framework surface work completed immediately before it and must not
reintroduce a hard-coded Reporting page:

- 0.33.5.13 defines shared surface/modal/overlay tokens and common page anatomy expectations.
- 0.33.5.15 exposes the framework-owned `LongtailForge.view` primitives for page headers,
  filters, status/empty/error states, tables, action strips, field grids, and modal shells.
- 0.33.5.16 introduces validated `viewSurfaces`, `LongtailForge.view.renderSurface(...)`,
  descriptor data binding, `surface.refresh()`, route actions, behavior handlers, minimal protected
  hosts, and strict guardrails for converted declarative surfaces.
- 0.33.5.18 extends the descriptor/renderer capability set while converting Notes, Tasks, Files,
  and Clients/Projects pages. Reporting should consume the finalized 0.33.5.18 view baseline
  instead of creating Reporting-only anatomy for filters, tables, status messages, or host layout.

Reporting is a framework-owned surface, so it should not create a fake disable-able
`src/modules/reporting` workflow module just to fit module-owned `viewSurfaces`. 0.33.11 must decide
and document the framework-owned equivalent: either a framework-owned descriptor/config source that
the same renderer can consume, or a narrow framework host adapter built directly on
`LongtailForge.view` primitives where the descriptor contract cannot yet model report execution.

### Version 0.33.11.1 - Reporting Architecture and Framework View Baseline

- [ ] Review the completed 0.33.5.18 renderer/primitive capabilities before implementing Reporting.
- [ ] Decide whether the Reporting host should use:
  - [ ] A framework-owned descriptor/config source consumed by `LongtailForge.view.renderSurface(...)`.
  - [ ] A narrow framework Reporting host adapter built on `LongtailForge.view` primitives.
- [ ] Do not create a normal disable-able `src/modules/reporting` workflow module only to satisfy
      module-owned `viewSurfaces` shape.
- [ ] Define which Reporting host anatomy is framework-owned:
  - [ ] Page shell and header.
  - [ ] Report selector.
  - [ ] Shared filter host.
  - [ ] Loading, error, empty, and status states.
  - [ ] Results host and overflow behavior.
  - [ ] Report action placement for future export/saved-report actions.
- [ ] Define module-owned report responsibilities:
  - [ ] Report definitions.
  - [ ] Runner IDs.
  - [ ] Data queries and aggregation.
  - [ ] Domain calculations.
  - [ ] Result shape.
  - [ ] Record-level permission checks.
- [ ] Update the implementation plan only; do not change runtime behavior in this slice.

### Version 0.33.11.2 - Reporting Contribution Contract

- [ ] Keep this roadmap section named "Reporting Framework and Time Report Contribution."
- [ ] Keep `reporting.html` framework-owned.
- [ ] Expand the existing module manifest `reporting` field into a validated report contribution contract.
- [ ] Report contribution fields should include:
  - [ ] `id`
  - [ ] `label`
  - [ ] `description`
  - [ ] `category`
  - [ ] `renderer`
  - [ ] `runner`
  - [ ] `requiredPermissions`
  - [ ] `requiredWorkspaceCapabilities`
  - [ ] `requiresEnabledModules`
  - [ ] `sortOrder`
  - [ ] supported filter metadata, such as billing period, custom date range, scope, project, tag, and descendants.
- [ ] Add `modulesService.listReportingReports(workspaceId, session)` using the same enabled-module, permission, workspace-capability, and required-module filtering pattern used by other module contributions.
- [ ] Keep contribution validation data-only. Do not place executable functions directly in module manifests.
- [ ] Keep report contribution filtering separate from report execution so the catalog can be permission-safe without running report code.
- [ ] Update `docs/module-contract.md` with the finalized reporting contribution shape.

### Version 0.33.11.3 - Reporting Framework Catalog Route

- [ ] Add framework-owned report catalog route:
  - [ ] `GET /api/reporting/catalog`
- [ ] Return only reports allowed by enabled modules, workspace capabilities, required modules, and user permissions.
- [ ] Include report metadata, supported filters, renderer ID, default filter values, and report-specific permission requirements.
- [ ] Ensure disabled modules do not contribute active catalog reports.
- [ ] Ensure reports from historically readable disabled modules are only visible when explicitly allowed by contribution and module policy.
- [ ] Add focused catalog regressions for disabled modules, missing permissions, workspace capability filtering, and required-module filtering.

### Version 0.33.11.4 - Reporting Runner Registry and Execution Route

- [ ] Add framework-owned report execution route:
  - [ ] `GET /api/reporting/reports/:moduleId/:reportId/run`
  - [ ] or a stable equivalent using a report key.
- [ ] Add a server-side report runner registry keyed by stable runner IDs.
- [ ] The framework Reporting service should validate report availability, permissions, enabled modules, workspace capability requirements, and basic filter shape before dispatching.
- [ ] The module-owned runner should remain responsible for domain-specific data access, calculations, and record-level permission safety.
- [ ] Normalize execution errors into framework-owned report status/error payloads without exposing implementation details.
- [ ] Add focused execution regressions for unknown report IDs, missing runners, denied permissions, disabled modules, and invalid filter shape.

### Version 0.33.11.5 - Time Tracking Project Time & Billing Contribution

- [ ] Move Project Time & Billing report logic out of the framework Reporting service and into Time Tracking-owned report/service code.
- [ ] Make removal of framework?module coupling a hard bar for this move, not just a logic relocation: after the migration, `src/services/reporting.service.js` must not directly import `tasksService`, `timeEntriesService`, `clientsService`, or any other specific module service/repo. The framework Reporting service keeps only catalog/dispatch/host responsibilities; all client/project/task/time-entry data access moves behind the module-owned runner registered by ID. Any client/project hierarchy the runner needs must come through a module-owned contract (the Clients/Projects module), not a framework-level import.
- [ ] Time Tracking should contribute the initial report:
  - [ ] ID: `project-time-billing`
  - [ ] Label: `Project Time & Billing`
  - [ ] Runner: `time-tracking.project-time-billing`
  - [ ] Renderer: `time-project-billing-table`
- [ ] Preserve existing useful filters:
  - [ ] Current billing period
  - [ ] Last billing period
  - [ ] Custom date range
  - [ ] Reporting scope
  - [ ] Projects
  - [ ] Tags
  - [ ] Include descendants
- [ ] Hide Start Date and End Date unless Billing Period is set to Custom.
- [ ] Keep Time Tracking responsible for time entry aggregation.
- [ ] Keep Client/Projects responsible for client/project hierarchy and billing metadata.
- [ ] Keep framework Reporting responsible only for report hosting and dispatch.
- [ ] Preserve existing `tagIds` filtering behavior through the Time Tracking-owned runner.
- [ ] Preserve existing task-linked time entry reporting behavior where already supported.
- [ ] Add focused Time Tracking report runner regressions before the page-host rewrite depends on it.

### Version 0.33.11.6 - Correct Project and Client Rollup Billing Math

- [ ] Fix descendant rollup calculation so each project/subproject computes its own direct time first.
- [ ] Apply that project's effective billing rate, billing period, and rounding rules to that project's direct time.
- [ ] Parent project totals should equal:
  - [ ] Parent direct rounded total
  - [ ] plus child project rounded totals
  - [ ] plus deeper descendant rounded totals
- [ ] Do not round all descendant time together at the parent level.
- [ ] Do not apply the parent billing rate to child project time when the child has its own effective rate.
- [ ] Client totals should aggregate project totals using the same already-rounded project/subproject totals.
- [ ] Parent clients should add direct client project totals plus child-client totals without losing child billing rules.
- [ ] Preserve display-only expandable child project rows without double-counting totals.
- [ ] Add fixture coverage for parent projects, child projects, deeper descendants, parent clients, child clients, mixed rates, and mixed billing periods.

### Version 0.33.11.7 - Framework Reporting Host Shell

- [ ] Keep one framework-owned `reporting.html` page.
- [ ] Reduce `views/protected/reporting.html` to a minimal framework host that loads shared view assets,
      the chosen Reporting host renderer/adapter, and the Reporting browser behavior file.
- [ ] Convert the hard-coded Time Report UI into a framework Reporting host that loads available report definitions from the catalog.
- [ ] Render the page shell, header, report selector, status/error/empty states, filter host, and results host through the chosen framework view path.
- [ ] Do not hand-build framework-owned Reporting anatomy in static HTML or ad-hoc browser DOM when a descriptor field or `LongtailForge.view` primitive exists.
- [ ] Keep the first host simple: one selected report, one filter area, one status area, and one results area.
- [ ] Add a focused static regression proving the Reporting page is a minimal framework host.

### Version 0.33.11.8 - Reporting Filter Host and Report Selection

- [ ] Load report definitions from `GET /api/reporting/catalog`.
- [ ] Select the first available report by default when no valid report is requested.
- [ ] Render report filters from contribution metadata through the shared filter host:
  - [ ] Billing period.
  - [ ] Custom date range.
  - [ ] Reporting scope.
  - [ ] Projects.
  - [ ] Tags.
  - [ ] Include descendants.
- [ ] Hide Start Date and End Date unless Billing Period is set to Custom.
- [ ] Preserve query-parameter deep links where already useful, including selected scope/report where practical.
- [ ] Ensure filter changes call the framework execution route and refresh the current result without rebuilding the host layout by hand.
- [ ] Add focused browser/static regressions for report selection, custom date visibility, empty catalog state, and filter refresh behavior.

### Version 0.33.11.9 - Project Time & Billing Result Renderer

- [ ] Add a registered report result renderer for `time-project-billing-table`.
- [ ] The first renderer may remain specific to Project Time & Billing, but it should use framework table/action primitives where they fit.
- [ ] Preserve hierarchical project display:
  - [ ] Parent rows can expand/collapse child rows.
  - [ ] Child rows are display-only rows under their parent.
  - [ ] Footer totals come from the runner result and are not recomputed from expanded display rows.
- [ ] Keep Time Tracking responsible for the result shape and billing semantics.
- [ ] Keep the framework responsible for result-host placement, overflow wrappers, loading/error/empty states, and renderer dispatch.
- [ ] Add focused regressions for expandable child rows, totals, no-results state, and renderer-not-found recovery.

### Version 0.33.11.10 - Permissions, Navigation, Guardrails, and Closeout

- [ ] Decide whether `reporting.view` should become a framework-owned permission instead of being contributed by Time Tracking.
- [ ] Keep report-specific visibility dependent on both `reporting.view` and the owning module's required permissions.
- [ ] Keep Reporting navigation framework-owned, with child report entries contributed by modules.
- [ ] Add strict guardrails for the converted Reporting host:
  - [ ] Reporting must not ship a non-minimal protected HTML view.
  - [ ] Reporting must not call `document.createElement` for framework-owned page header, filter host, status, table shell, or action anatomy when the chosen framework view path covers it.
  - [ ] Reporting must not introduce new one-off layout/footer classes for framework-owned anatomy.
  - [ ] `src/services/reporting.service.js` (and any framework Reporting host/service code) must not import a specific module service/repo or hardcode a first-party module ID to reach data; all report data access stays behind module-owned runners. Add a grep/regression guardrail asserting this so the coupling that exists today (`reporting.service.js` importing `clientsService`/`tasksService`/`timeEntriesService`) cannot survive or be reintroduced.
- [ ] Update `docs/declarative-view-surfaces.md` inventory to move Reporting out of "reported" and into the chosen framework-owned Reporting host status.
- [ ] Update `docs/view-building-contract.md` and `docs/module-contract.md` with the Reporting host/contribution boundary.
- [ ] Update Help, `DECISIONS.md`, `CHANGELOG.md`, package metadata, and roadmap archive.
- [ ] Add regression coverage for:
  - [ ] Report catalog filters disabled modules.
  - [ ] Report catalog filters missing permissions.
  - [ ] Time Tracking report appears when Time Tracking is enabled and permissions allow it.
  - [ ] Time Tracking report disappears or is blocked when Time Tracking is disabled.
  - [ ] Custom date fields are hidden unless Custom is selected.
  - [ ] Project/subproject/client rollups apply rounding at the correct level.
  - [ ] Reporting no longer uses hard-coded framework-owned page anatomy.
- [ ] Run focused reporting regressions.
- [ ] Run `npm run check`.
- [ ] Run `npm run test:permissions`.
- [ ] Verify `/api/app-info` reports the expected version after implementation.

## Version 0.34 - Knowledge Base Module

## Knowledge Base Direction Adjustment

Decision:
Knowledge Base is the reviewed, read-only knowledge layer generated from Notes first. Notes remain the working authoring records. Knowledge Base entries may still be written directly, but the default workflow is note-sourced: normal internal/workspace/client-visible notes become KB review candidates automatically, then reviewers approve and publish safe read-only KB snapshots.

### Add to 0.34.1 - Knowledge Base Module Contract, Publishing Model, and Notes Relationship

* [ ] Define Knowledge Base as the reviewed consumption layer for Notes-backed knowledge.

  * [ ] Notes are the working/source records.
  * [ ] KB articles are reviewed read-only article records or publication snapshots.
  * [ ] Normal note creation/update can automatically create or update a KB review candidate.
  * [ ] Automatic KB candidate creation does not mean automatic publishing.
  * [ ] Publishing remains explicit, permission-protected, audited, and snapshot-based.
  * [ ] KB may support directly authored articles, but direct authoring is secondary to note-sourced workflow.

* [ ] Add KB candidate/source behavior.

  * [ ] Add `source_mode` values:

    * [ ] `note_sourced`
    * [ ] `manual`
    * [ ] `imported`
  * [ ] Add `source_sync_state` or equivalent metadata:

    * [ ] `current`
    * [ ] `source_updated`
    * [ ] `manual_override`
    * [ ] `detached`
  * [ ] Add `source_note_id` convenience field only if it simplifies the common one-note article case; keep `kb_article_sources` as the canonical many-source table.
  * [ ] Add `source_note_revision_id` or use `kb_article_sources.source_revision_id` to preserve the note revision that seeded the reviewed article.
  * [ ] Add `last_source_synced_at`.
  * [ ] Add `last_reviewed_at`.
  * [ ] Add `review_due_at` optional for future maintenance workflows.

* [ ] Define automatic candidate rules.

  * [ ] Normal `internal` notes create internal KB candidates.
  * [ ] Normal `workspace` notes create workspace KB candidates.
  * [ ] Normal `client_visible` notes may create client-visible KB candidates only after client-visible KB permissions and file safety are enabled.
  * [ ] `private` notes do not create KB candidates by default.
  * [ ] `secure` notes must never create KB candidates.
  * [ ] Deleted notes should not create KB candidates.
  * [ ] Archived notes may remain as KB sources, but should not automatically update pending candidates unless explicitly configured.

* [ ] Define KB statuses for note-sourced workflow.

  * [ ] `draft`
  * [ ] `in_review`
  * [ ] `approved`
  * [ ] `published`
  * [ ] `rejected`
  * [ ] `archived`
  * [ ] `deleted`
  * [ ] Manually created articles start as `draft`.
  * [ ] Automatically note-sourced articles start as `in_review`.
  * [ ] Updating a source note marks the KB candidate/publication as `source_updated` or creates a new review revision, but does not silently mutate the published snapshot.
  * [ ] Rejected candidates remain linked to the source note for history unless deleted by a permitted user.

### Add to 0.34.2 - Knowledge Base Browser API, Editorial Workflow, and Internal UI MVP

* [ ] Add automatic note-to-KB candidate service methods.

  * [ ] Create or update candidate from note.
  * [ ] Queue note for KB review.
  * [ ] Read KB candidate by source note.
  * [ ] List KB candidates needing review.
  * [ ] Mark source update pending review.
  * [ ] Detach KB article from source note where permitted.
  * [ ] Reject KB candidate with reason.
  * [ ] Approve KB candidate.
  * [ ] Publish approved KB article snapshot.

* [ ] Add Notes lifecycle hook integration.

  * [ ] On normal note created, create KB candidate if workspace KB candidate policy allows it.
  * [ ] On normal note updated, mark linked KB candidate/publication as source-updated.
  * [ ] On note archived, preserve existing KB linkage but stop automatic updates unless configured.
  * [ ] On note deleted, hide or mark linked KB candidate as source unavailable.
  * [ ] Do not process secure notes.
  * [ ] Do not process private notes unless a future explicit rule allows it.

* [ ] Add KB review queue UI.

  * [ ] Show candidates grouped by source visibility:

    * [ ] Internal
    * [ ] Workspace
    * [ ] Client-visible when enabled
  * [ ] Show source note title, source collection path, source updated date, proposed article title, visibility, review status, and whether the source changed since last review.
  * [ ] Allow reviewers to approve, reject, edit article draft, publish, or detach.
  * [ ] Make it obvious when a published KB article is behind its source note.

### Add to 0.34.3 - Knowledge Base Search, Tags, Attachments, Static Pages, and Permission Boundaries

* [ ] Add KB article chrome/window-dressing generation.

  * [ ] Generate safe table of contents.
  * [ ] Generate "What links here."
  * [ ] Generate related articles from article links, source notes, shared tags, shared collections, and wiki-style links.
  * [ ] Show source-note linkage only to users who can access the source note.
  * [ ] Show source update/review status only to internal users with review/history permission.
  * [ ] Hide internal source data from client-visible/public outputs.
  * [ ] Backlink lists must be permission-filtered and must not leak inaccessible article titles, note titles, files, or counts.

* [ ] Add KB link index support.

  * [ ] Track article-to-article links detected from Markdown/wiki-style links.
  * [ ] Track note-to-article references where useful.
  * [ ] Track source note-to-article relationships through `kb_article_sources`.
  * [ ] Rebuild link indexes when article Markdown, note wiki links, slugs, or source links change.
  * [ ] Broken links should be allowed but clearly labeled for reviewers.

### Add to 0.34.4 - Knowledge Base Settings, Documentation, and Closeout

* [ ] Add KB automation settings.

  * [ ] Configure note-to-KB candidate behavior:

    * [ ] Disabled
    * [ ] Manual only
    * [ ] Auto-create internal/workspace candidates
    * [ ] Auto-create client-visible candidates when supported
  * [ ] Configure default candidate status for note-sourced entries.
  * [ ] Configure whether review is always required before publishing.
  * [ ] Configure whether source note updates reopen review.
  * [ ] Configure whether archived notes can continue feeding KB candidates.
  * [ ] Settings must not bypass permissions, secure-note restrictions, private-note restrictions, file safety, or publication review.

## Version 0.35.0 - Support Tickets Framework Contract

* [ ] Add Support Tickets as a first-party workflow module.

  * [ ] Module ID should be `support-tickets`.
  * [ ] Tickets are workflow records, not framework/core records.
  * [ ] Tickets should use framework-owned services for users, workspaces, permissions, tags, search, notifications, audit logging, file attachments, events/hooks, API scopes, and module lifecycle.
  * [ ] Do not hard-code ticket behavior into framework-owned app shell, search, notification, file, or permission services.
  * [ ] Support Tickets should be disableable per workspace where appropriate.
  * [ ] Disabled ticket module should block new ticket writes while preserving historical reads if `historicalReadAccess` is enabled.

* [ ] Define ticket terminology by workspace type.

  * [ ] Business workspaces should display "Support Tickets" / "Tickets".
  * [ ] Personal and Family workspaces may display "Requests" where terminology is user-facing.
  * [ ] Terminology must be display-only.
  * [ ] Stored module IDs, route names, permission IDs, API scopes, audit record types, and database fields should remain stable.

* [ ] Define core ticket record model.

  * [ ] Add `tickets` table.
  * [ ] Suggested fields:

    * [ ] `ticket_id`
    * [ ] `workspace_id`
    * [ ] `ticket_number` or `display_key`
    * [ ] `client_id` optional
    * [ ] `project_id` optional
    * [ ] `requester_user_id` optional
    * [ ] `requester_name_snapshot`
    * [ ] `requester_email_snapshot`
    * [ ] `title`
    * [ ] `description`
    * [ ] `status`
    * [ ] `priority`
    * [ ] `category`
    * [ ] `source`
    * [ ] `visibility`
    * [ ] `assigned_user_id` optional
    * [ ] `created_by_user_id`
    * [ ] `created_at`
    * [ ] `updated_at`
    * [ ] `closed_at`
    * [ ] `archived_at`
    * [ ] `metadata_json`
  * [ ] Ticket records must always belong to one workspace.
  * [ ] Client/project links must belong to the same workspace as the ticket.
  * [ ] External/client-created tickets should snapshot requester name/email for historical context.

* [ ] Define ticket statuses.

  * [ ] Start with a small boring set:

    * [ ] `new`
    * [ ] `open`
    * [ ] `waiting_on_internal`
    * [ ] `waiting_on_client`
    * [ ] `resolved`
    * [ ] `closed`
    * [ ] `archived`
  * [ ] Keep status labels configurable/display-friendly later.
  * [ ] Do not make tags the source of truth for ticket status.

* [ ] Define ticket priorities.

  * [ ] Start with:

    * [ ] `low`
    * [ ] `normal`
    * [ ] `high`
    * [ ] `urgent`
  * [ ] Priority should be an explicit field.
  * [ ] Do not infer priority from tags.

* [ ] Define ticket sources.

  * [ ] Start with:

    * [ ] `internal`
    * [ ] `client_portal`
    * [ ] `public_api`
    * [ ] `import`
  * [ ] Reserve future source values:

    * [ ] `wordpress`
    * [ ] `shopify`
    * [ ] `email`
    * [ ] `webhook`
    * [ ] `automation`
  * [ ] Source should be metadata, not permission logic.

* [ ] Add ticket ledger foundation.

  * [ ] Add `ticket_entries` or `ticket_ledger_entries` table.
  * [ ] A ticket entry represents a visible ticket timeline item, not the security audit log.
  * [ ] Suggested fields:

    * [ ] `ticket_entry_id`
    * [ ] `workspace_id`
    * [ ] `ticket_id`
    * [ ] `entry_type`
    * [ ] `visibility`
    * [ ] `body`
    * [ ] `created_by_user_id`
    * [ ] `created_at`
    * [ ] `updated_at`
    * [ ] `deleted_at`
    * [ ] `metadata_json`
  * [ ] Entry visibility should be explicit:

    * [ ] `internal`
    * [ ] `client_visible`
  * [ ] Do not use the word `public` in code for client-visible ticket entries unless the entry is truly public internet visible.
  * [ ] Internal entries are visible only to internal users with appropriate ticket permissions.
  * [ ] Client-visible entries are visible to internal users and authorized client/external users who can access the ticket.
  * [ ] Ticket ledger entries should never replace audit logging.

* [ ] Define first ticket entry types.

  * [ ] `initial_request`
  * [ ] `client_reply`
  * [ ] `internal_note`
  * [ ] `status_change`
  * [ ] `assignment_change`
  * [ ] `priority_change`
  * [ ] `attachment_added`
  * [ ] `system_event`
  * [ ] Keep raw audit details out of normal ticket ledger display.

* [ ] Add ticket permissions.

  * [ ] `tickets.view`
  * [ ] `tickets.view_internal`
  * [ ] `tickets.create`
  * [ ] `tickets.create_for_client`
  * [ ] `tickets.reply_client_visible`
  * [ ] `tickets.add_internal_note`
  * [ ] `tickets.update`
  * [ ] `tickets.assign`
  * [ ] `tickets.close`
  * [ ] `tickets.archive`
  * [ ] `tickets.manage_settings`
  * [ ] `tickets.view_all`
  * [ ] Add client/external access checks separately from internal workspace role checks.
  * [ ] A client user should only see tickets explicitly associated with a client/project they can access.

* [ ] Add ticket resource definition.

  * [ ] Resource key: `tickets`.
  * [ ] Supported operations:

    * [ ] `read`
    * [ ] `create`
    * [ ] `update`
    * [ ] `archive`
    * [ ] `restore`
    * [ ] `assign`
    * [ ] `manage`

* [ ] Add ticket audit record types.

  * [ ] `ticket`
  * [ ] `ticket_entry`
  * [ ] Audit ticket creation, updates, assignment changes, status changes, priority changes, archive/restore, client-visible replies, internal notes, attachment links, and API-created tickets.
  * [ ] Audit records should remain admin/security records and should not be shown as the normal ticket timeline.

* [ ] Add ticket events.

  * [ ] `ticket.created`
  * [ ] `ticket.updated`
  * [ ] `ticket.assigned`
  * [ ] `ticket.status_changed`
  * [ ] `ticket.priority_changed`
  * [ ] `ticket.client_reply_added`
  * [ ] `ticket.internal_note_added`
  * [ ] `ticket.resolved`
  * [ ] `ticket.closed`
  * [ ] `ticket.archived`
  * [ ] `ticket.restored`
  * [ ] Event payloads should include workspace, actor, ticket ID, client/project IDs where applicable, safe previous/new values, source, and metadata.
  * [ ] Event payloads should leave room for future automations and integrations.

## Version 0.35.1 - Ticket Browser API and Services

* [ ] Add ticket service methods.

  * [ ] Create ticket.
  * [ ] Read one ticket.
  * [ ] List tickets.
  * [ ] Update ticket fields.
  * [ ] Assign ticket.
  * [ ] Change ticket status.
  * [ ] Change ticket priority.
  * [ ] Archive ticket.
  * [ ] Restore ticket where appropriate.
  * [ ] Add client-visible reply.
  * [ ] Add internal note.
  * [ ] List ticket ledger entries with permission-safe visibility filtering.

* [ ] Add browser API routes.

  * [ ] `GET /api/tickets`
  * [ ] `POST /api/tickets`
  * [ ] `GET /api/tickets/:ticketId`
  * [ ] `PUT /api/tickets/:ticketId`
  * [ ] `POST /api/tickets/:ticketId/assign`
  * [ ] `POST /api/tickets/:ticketId/status`
  * [ ] `POST /api/tickets/:ticketId/priority`
  * [ ] `POST /api/tickets/:ticketId/archive`
  * [ ] `POST /api/tickets/:ticketId/restore`
  * [ ] `GET /api/tickets/:ticketId/entries`
  * [ ] `POST /api/tickets/:ticketId/replies`
  * [ ] `POST /api/tickets/:ticketId/internal-notes`

* [ ] Enforce ticket API permissions.

  * [ ] Every route must validate active workspace.
  * [ ] Every ticket read must validate workspace membership or authorized client/external access.
  * [ ] Internal notes must never be returned to client/external users.
  * [ ] Client-visible replies must be visible only to users allowed to access that ticket.
  * [ ] Update/assign/status/priority actions must require explicit permissions.
  * [ ] Disabled ticket module must block writes.
  * [ ] Historical reads should follow module `historicalReadAccess`.

* [ ] Add ticket list filtering.

  * [ ] Status.
  * [ ] Priority.
  * [ ] Assignee.
  * [ ] Client.
  * [ ] Project.
  * [ ] Requester.
  * [ ] Source.
  * [ ] Updated date.
  * [ ] Created date.
  * [ ] Archived state.
  * [ ] Pagination.

* [ ] Add ticket number/display key generation.

  * [ ] Generate human-readable ticket keys per workspace.
  * [ ] Ensure keys do not collide inside a workspace.
  * [ ] Keep database IDs separate from user-facing ticket keys.

## Version 0.35.2 - Ticket UI MVP

* [ ] Add Tickets navigation and protected views.

  * [ ] Tickets list page.
  * [ ] Ticket detail page.
  * [ ] Create ticket dialog/page.
  * [ ] Edit ticket metadata controls.
  * [ ] Permission-aware buttons and empty states.
  * [ ] Disabled-module state.

* [ ] Add internal ticket creation workflow.

  * [ ] Internal users can create tickets.
  * [ ] Internal users can optionally assign a ticket to a client.
  * [ ] Internal users can optionally assign a ticket to a project.
  * [ ] Internal users can set title, description, priority, category, and assignee where permitted.
  * [ ] Ticket creation should create the first ledger entry.

* [ ] Add ticket detail workflow.

  * [ ] Show ticket title, status, priority, client, project, requester, assignee, created date, updated date, and source.
  * [ ] Show client-visible ledger entries.
  * [ ] Show internal ledger entries only to users with internal ticket access.
  * [ ] Visually distinguish internal notes from client-visible replies.
  * [ ] Allow permitted users to add internal notes.
  * [ ] Allow permitted users to add client-visible replies.
  * [ ] Allow permitted users to change status, priority, and assignment.
  * [ ] Preserve accessibility behavior for form controls, icon buttons, tabs/filters, and status messages.

* [ ] Add tickets list workflow.

  * [ ] Show ticket key, title, status, priority, client/project context, assignee, requester, source, and updated date.
  * [ ] Add basic filters.
  * [ ] Add pagination.
  * [ ] Add empty state.
  * [ ] Add archived filter or archived view.
  * [ ] Keep list UI simple; do not build a full helpdesk dashboard yet.

* [ ] Add client/external ticket visibility groundwork.

  * [ ] Add permission-safe service methods for client-visible ticket reads.
  * [ ] Add UI/API distinction between internal users and external/client users.
  * [ ] Client/external users should not see internal notes, internal-only status details, raw audit records, or private metadata.
  * [ ] Client-facing ticket pages can be minimal in 0.33.x but the permission model must be real.

## Version 0.35.3 - Ticket Integration Hooks

* [ ] Register tickets as searchable records.

  * [ ] Add `searchableTypes` manifest declaration for tickets.
  * [ ] Index ticket title, description, ticket key, client/project context, status, priority, requester snapshot, and safe ledger text.
  * [ ] Internal-only ledger text must only appear in search results for users allowed to see internal ticket content.
  * [ ] Client-visible search results must not expose internal notes.
  * [ ] Search indexing should use the framework search service and adapter, not ticket-specific search queries.

* [ ] Register tickets as taggable records.

  * [ ] Add `taggableTypes` declaration for tickets.
  * [ ] Allow permitted users to assign workspace tags to tickets.
  * [ ] Tags are classification metadata only.
  * [ ] Do not use tags for visibility, status, billing state, or access control.

* [ ] Register tickets as attachable records.

  * [ ] Use the framework file attachment contract.
  * [ ] Tickets should not implement separate file storage.
  * [ ] Attachments should inherit or explicitly declare ticket-entry visibility.
  * [ ] Client-visible attachments must require public/client-safe file handling.
  * [ ] Internal attachments must not be downloadable by client/external users.
  * [ ] Quarantined/pending files must not appear in normal ticket UI.

* [ ] Register ticket notification events.

  * [ ] Notify relevant users when a ticket is created.
  * [ ] Notify assignee when assigned.
  * [ ] Notify followers when status/priority/client-visible reply changes.
  * [ ] Notify internal users when a client-visible reply is added.
  * [ ] Do not notify client/external users about internal notes.
  * [ ] Add ticket follow/unfollow support through framework notification subscriptions.

* [ ] Register ticket Workbench contribution.

  * [ ] Tickets can appear as actionable Workbench items.
  * [ ] Workbench item payload should include ticket key, title, status, priority, client/project context, assignee, due/follow-up date later, source URL, and timer state if Time Tracking is enabled.
  * [ ] Workbench should remain framework-owned.

* [ ] Register ticket timer source.

  * [ ] If Time Tracking is enabled, internal users can start/resume/pause/finalize timers from tickets.
  * [ ] Ticket timers should use the shared Time Tracking active timer engine.
  * [ ] Finalized time entries should preserve ticket metadata.
  * [ ] Do not create a separate ticket timer engine.

* [ ] Add manual task creation hook.

  * [ ] If Tasks is enabled, permitted users can create a task from a ticket.
  * [ ] The created task should link back to the source ticket.
  * [ ] This should be manual in 0.33.x.
  * [ ] Automatic task creation rules should wait for the automation/rules framework in 0.4x.

## Version 0.35.4 - Client Ticket Portal MVP

* [ ] Add minimal client/external ticket creation surface.

  * [ ] Authorized client users can create tickets for their allowed client/project context.
  * [ ] Client users can provide title, description, category, and optional attachment only where file safety permits.
  * [ ] Created tickets should use source `client_portal`.
  * [ ] Created tickets should create a client-visible initial request entry.
  * [ ] Internal users should be notified when appropriate.

* [ ] Add minimal client/external ticket detail surface.

  * [ ] Client users can view tickets they are authorized to access.
  * [ ] Client users can see client-visible entries only.
  * [ ] Client users can add client-visible replies.
  * [ ] Client users can see safe status labels.
  * [ ] Client users cannot see internal notes, internal-only files, raw audit records, private metadata, internal assignment details unless explicitly allowed, or internal search results.

* [ ] Add client/external ticket list surface.

  * [ ] Show ticket key, title, safe status, created date, updated date, and project context where allowed.
  * [ ] Add basic status filtering.
  * [ ] Add pagination.
  * [ ] Keep this portal simple; do not build a full customer support portal yet.

* [ ] Add client ticket access regression tests.

  * [ ] Client users cannot access tickets from another workspace.
  * [ ] Client users cannot access tickets for another client/project.
  * [ ] Client users cannot see internal notes.
  * [ ] Client users cannot download internal-only attachments.
  * [ ] Client-visible replies are visible to the right client users and internal users.
  * [ ] Internal users with proper permission can see both internal and client-visible ledger entries.

## Version 0.35.5 - Ticket Public API Groundwork

* [ ] Add ticket API scopes.

  * [ ] `tickets:read`
  * [ ] `tickets:write`
  * [ ] `tickets:create`
  * [ ] `tickets:reply`
  * [ ] Consider separating `tickets:internal` from client-facing API scopes.
  * [ ] API scopes should be offered only when the Support Tickets module is enabled.

* [ ] Add first safe public API routes for future plugins.

  * [ ] `POST /api/v1/tickets`
  * [ ] `GET /api/v1/tickets/:ticketId` only if permission-safe.
  * [ ] `POST /api/v1/tickets/:ticketId/replies` only if permission-safe.
  * [ ] Keep public API minimal.
  * [ ] Require API keys and scopes.
  * [ ] Validate workspace, client/project context, module state, and allowed source.
  * [ ] Do not expose internal notes through public API.
  * [ ] Do not expose raw audit data through public API.

* [ ] Add source attribution for API-created tickets.

  * [ ] Store source application/plugin identifier where available.
  * [ ] Store safe request metadata.
  * [ ] Leave room for future webhook signatures, replay protection, and per-plugin rate limits.
  * [ ] Avoid building WordPress/Shopify plugins in 0.33.x.

* [ ] Add API regression tests.

  * [ ] Missing/invalid API key is rejected.
  * [ ] Missing scope is rejected.
  * [ ] Disabled ticket module blocks writes.
  * [ ] API-created ticket belongs to the correct workspace.
  * [ ] API-created ticket cannot spoof another workspace/client/project.
  * [ ] Public API cannot create internal notes unless explicitly using an internal/admin scope.
  * [ ] Public API cannot read internal ledger entries.

## Version 0.35.6 - Ticket Regression, Polish, and Closeout

* [ ] Add complete ticket regression coverage.

  * [ ] Tickets cannot cross workspace boundaries.
  * [ ] Client/project links cannot cross workspace boundaries.
  * [ ] Internal users only see tickets permitted by role/resource checks.
  * [ ] Client/external users only see authorized client-visible tickets.
  * [ ] Internal notes are hidden from client/external users.
  * [ ] Client-visible replies are visible to both authorized client users and appropriate internal users.
  * [ ] Ticket status, priority, assignment, archive, and restore actions enforce permissions.
  * [ ] Search does not expose internal ticket content to unauthorized users.
  * [ ] Tags can be assigned only by users with tag assignment permission and ticket access.
  * [ ] Attachments follow ticket and entry visibility.
  * [ ] Notifications do not expose private ticket details.
  * [ ] Disabled ticket module blocks new ticket writes and hides normal navigation.
  * [ ] Historical ticket reads work only when module policy allows them.
  * [ ] Ticket timers require Time Tracking to be enabled.
  * [ ] Create-task-from-ticket requires Tasks to be enabled.

* [ ] Add accessibility and UI regression coverage.

  * [ ] Ticket forms have labels, validation summaries, and keyboard-friendly controls.
  * [ ] Ticket ledger entries have readable structure and status labels.
  * [ ] Internal/client-visible labels are clear.
  * [ ] Icon buttons have accessible names.
  * [ ] Empty/error/loading states are clear.
  * [ ] Client portal views do not leak internal controls.

* [ ] Add documentation notes.

  * [ ] Document ticket visibility rules.
  * [ ] Document internal notes vs client-visible replies.
  * [ ] Document ticket permissions.
  * [ ] Document public API limitations.
  * [ ] Document future plugin and automation hooks.
  * [ ] Document that ticket ledger is not the same as audit log.

* [ ] Release bookkeeping.

  * [ ] Update `DECISIONS.md` or product notes with ticket visibility and ledger decisions.
  * [ ] Update `CHANGELOG.md`.
  * [ ] Bump `package.json` and `package-lock.json`.
  * [ ] Run `npm run check`.
  * [ ] Run `npm run test:permissions`.
  * [ ] Run ticket-specific regression scripts.

## Version 0.36.0 - Calendars and Calendar Views

A lean, read-only task calendar shipped earlier in 0.33.10 (task due dates + reminder markers). This
section owns the fuller Calendar module: user-created calendar events, iCal/shared-calendar display,
and richer views beyond the 0.33.10 task read-out. External Google/Outlook sync remains later integrations work.

- [ ] Calendars
  - [ ] Year view
  - [ ] Month view
  - [ ] Week view
  - [ ] Day view
  - [ ] Filters for client (business workspace only)/project

- [ ] Calendar Events
  - [ ] Allow addition of calendar events
  - [ ] Display iCal events from shared calendars

## Version 0.36.5 - Account Home / Cross-Workspace Attention View

Add a framework-owned Account Home view for users who belong to multiple workspaces.

This view must not weaken workspace isolation. It should aggregate only permission-safe summaries from workspaces the current user can access.

Account Home should not query module tables directly. It should use framework-owned summary services, notification records, announcement records, activity-feed records, and module-declared attention providers where available.

The first version should include:

- Workspace cards showing unread/attention counts.
- Active workspace announcements.
- Current-user notifications across accessible workspaces.
- Permission-safe attention items such as overdue tasks, assigned tickets, pending reviews, and stale timers where those modules are enabled.
- Links that switch/open the correct workspace before navigating to the target record.

Do not expose raw audit records, raw event payloads, private module records, or cross-workspace administrative data. Every item must be visible only if the user could read the source record inside that workspace.

## Version 0.37.0 - Expanded Reporting and Invoicing

- [ ] Expanded reporting
- [ ] Invoicing

## Version 0.38.0 - User Account Security Upgrades and Database/Settings File Backup/Restore

### Two Factor Authentication (TOTP) (2FA)

- [ ] Add optional 2FA for users. Can be turned on in the Settings -> User dialog
- [ ] Super admins should be able to turn on a setting that requires 2FA setup on next login for individual users
- [ ] Workspace admins can require users have 2FA to join workspace

### Version 0.38.1 - Passkeys

- [ ] Passkeys

### Version 0.38.2 - User Sessions

- [ ] Sessions should expire after 1 day
- [ ] Super Admins should have ability to log users out
- [ ] Workspace admins should have ability to log users out

## Version 0.38.3 - Login Security Monitoring and Risk Scoring

- [ ] Add `user_login_events` table:
  - [ ] `login_event_id`
  - [ ] `user_id`
  - [ ] `occurred_at`
  - [ ] `success`
  - [ ] `failure_reason`
  - [ ] `ip_address`
  - [ ] `ip_hash`
  - [ ] `user_agent`
  - [ ] `user_agent_hash`
  - [ ] `browser_family`
  - [ ] `os_family`
  - [ ] `device_type`
  - [ ] `country`
  - [ ] `region`
  - [ ] `risk_score`
  - [ ] `risk_reason`
  - [ ] `session_id_hash`
  - [ ] `metadata_json`
- [ ] Log authentication events:
  - [ ] Successful login.
  - [ ] Failed login.
  - [ ] Password reset requested.
  - [ ] Password reset completed.
  - [ ] 2FA challenge success/failure.
  - [ ] Passkey registration/removal.
  - [ ] New device/session.
  - [ ] Logout.
  - [ ] Admin-forced logout.
- [ ] Add login risk checks:
  - [ ] New device/browser.
  - [ ] New country or impossible travel.
  - [ ] IP reputation check if available.
  - [ ] Many failures for same account.
  - [ ] Many failures from same IP.
  - [ ] Successful login after many failures.
  - [ ] Login from TOR/VPN/proxy if detectable.
- [ ] Add risk-based responses:
  - [ ] Low risk: allow login and log event.
  - [ ] Medium risk: allow login and notify user.
  - [ ] High risk: require 2FA/passkey reauthentication if available.
  - [ ] Critical risk: temporarily block or require password reset/admin review.
- [ ] Add user-facing security tools:
  - [ ] Show recent login history in user settings.
  - [ ] Allow user to revoke sessions.
  - [ ] Email/in-app notification for new device login.
  - [ ] Email/in-app notification for suspicious login.
- [ ] Add admin security tools:
  - [ ] View recent failed login patterns.
  - [ ] Force logout user sessions.
  - [ ] Temporarily disable account.
  - [ ] Require password reset.
  - [ ] Require 2FA setup.
- [ ] Privacy rules:
  - [ ] Do not log passwords, tokens, reset tokens, or full session IDs.
  - [ ] Consider hashing or truncating IP addresses for long-term retention.
  - [ ] Define retention period for login events.
  - [ ] Restrict access to login security logs.

## Version 0.38.x - Security, Sessions, Login Monitoring, and Production Hardening

Add dependency note:

This branch depends on the runtime configuration contract from 0.33.5.19. Security-sensitive settings must be validated through `.env`/runtime config before public hosted SaaS launch.

Additional required hardening before hosted SaaS:

- [ ] Production secure cookies.
- [ ] Trusted proxy configuration.
  - [ ] Wire the already-reserved `TRUST_PROXY` env var into `src/config.js` and `app.set('trust proxy', ...)`; it is documented in `.env.example`/`docs/runtime-configuration.md` but currently unread.
- [ ] Login throttling/rate limiting.
- [ ] Async password hashing/verification.
- [ ] Session revocation.
- [ ] Admin-forced logout.
- [ ] Password reset.
- [ ] Security event logging.
- [ ] Backup/restore testing.
- [ ] Runtime secret documentation.

### Version 0.38.4 - Backup and Restore

Super Admins should have a backup/restore function on the dashboard that dumps the current database into a clean file with an app meta data file that has app version stamped and datetime (UTC) of backup in it and zips it into a zip file along with any physical settings files on disk (this will be necessary after packaging for self-hosting and may not yet be necessary, but I want uniform functions for backup/restore that can be easily modified in the future)

- [ ] Create backup function to grab and zip:
  - [ ] Database dump/database file
  - [ ] App meta data file to include app version and datetime stamp of backup
  - [ ] Setup files (can be blank for now)
- [ ] Add backup to user interface for Super Admins in Settings menu
  - Label should be "App Backup"
  - Should only be visible if user is Super Admin (utilize session auth variables to keep from adding/hiding the option)
  - [ ] "Perform backup" button
    - this should then provide a link to the downloadable zip file
    - download should be a temporary file on the server in a "downloads" directory
    - backup should have checksum
    - backup shouldn't delete temporary file until checksum is confirmed
  - [ ] "Perform restore" button
    - this should only accept zip files
    - this should verify files, checksum, etc. before installing/overwriting current data

### Version 0.38.8 - MCP Server for AI Task access

## Slice: LTF ChatGPT Read-Only MCP Connector Foundation

Goal:
Create a private read-only MCP connector so ChatGPT can retrieve LTF context for daily briefings.

Scope:
- Add an integration layer separate from feature modules.
- Do not wire ChatGPT directly into Tasks, Notes, Lists, or Projects UI code.
- Do not add write actions in this slice.
- Do not expose unauthenticated real user data.

Deliverables:
1. Add MCP server endpoint:
   - `GET/POST /mcp` as required by the MCP server package being used.
   - Endpoint must advertise tools and metadata.

2. Add read-only tools:
   - `ltf_get_daily_briefing_context`
   - `ltf_list_due_tasks`
   - `ltf_list_overdue_tasks`
   - `ltf_list_recent_activity`
   - `ltf_search`
   - `ltf_fetch`

3. Add service-layer query functions:
   - Retrieve tasks due today.
   - Retrieve overdue tasks.
   - Retrieve upcoming tasks.
   - Retrieve active projects/actions with blockers.
   - Retrieve recently changed notes/lists.
   - Return structured JSON only; no HTML rendering.

4. Add auth placeholder:
   - Development may allow local/test mode only.
   - Production path must support OAuth-based user auth before exposing real data.
   - Define future read scopes:
     - `tasks:read`
     - `projects:read`
     - `notes:read`
     - `lists:read`
     - `activity:read`

5. Add audit logging:
   - Log connector tool name.
   - Log authenticated user/workspace.
   - Log timestamp.
   - Do not log full private record bodies unless debug mode is explicitly enabled.

6. Add documentation:
   - How to run locally.
   - How to expose via tunnel for testing.
   - How to connect in ChatGPT Settings ? Connectors ? Create.
   - Security warning that tunnels/no-auth are for dev only.

Non-goals:
- No write actions.
- No public app directory submission.
- No UI widgets inside ChatGPT yet.
- No broad data sync/indexing yet.

### Version 0.39.0 - Creator Studio / Content Studio Module

- [ ] Core records:
  - [ ] Content ideas.
  - [ ] Content drafts.
  - [ ] Campaigns/series.
  - [ ] Publishing channels.
  - [ ] Assets/media.
  - [ ] Content templates.
  - [ ] Repurposing tasks.
- [ ] Content idea fields:
  - [ ] Title.
  - [ ] Description/angle.
  - [ ] Workspace.
  - [ ] Client/project if applicable.
  - [ ] Channel(s).
  - [ ] Format: blog, short, long video, email, social post, product page, course material, etc.
  - [ ] Status: idea, planned, drafting, editing, scheduled, published, archived.
  - [ ] Priority.
  - [ ] Target publish date.
  - [ ] Assigned user.
  - [ ] Tags.
  - [ ] Related notes/tasks/assets.
- [ ] Editorial calendar:
  - [ ] Calendar view by publish date.
  - [ ] List view by status.
  - [ ] Kanban view by production stage.
  - [ ] Filter by brand/site/channel/project/tag.
- [ ] Publishing channels:
  - [ ] Website/blog.
  - [ ] YouTube.
  - [ ] Shorts/Reels/TikTok.
  - [ ] Newsletter.
  - [ ] Facebook/Instagram/X/LinkedIn/Mastodon.
  - [ ] Podcast if needed later.
- [ ] Asset library:
  - [ ] Attach images, video, audio, documents, thumbnails, captions, and scripts.
  - [ ] Track asset usage across content items.
  - [ ] Store alt text, captions, source/license notes, and credit requirements.
- [ ] Repurposing workflow:
  - [ ] One long-form item can spawn shorts, social posts, newsletter blurbs, blog excerpts, and follow-up tasks.
  - [ ] Track each derivative item separately but link it to the source content.
- [ ] Analytics groundwork:
  - [ ] Store published URL.
  - [ ] Store basic performance notes manually at first.
  - [ ] Later: integrate platform analytics where APIs allow.
- [ ] Permissions:
  - [ ] Creator Studio records are workspace-scoped.
  - [ ] Client/project-linked content respects existing permissions.
  - [ ] External clients may be allowed to review/comment only if explicitly enabled.

- [ ] Treat Creator Studio as an optional first-party module.
  - [ ] The module should ship with Longtail Forge but be disabled by default for workspaces that do not need it.
  - [ ] It should follow the same module manifest, permissions, navigation, search, tags, notification, file, task, notes, and calendar contracts as every other first-party module.
  - [ ] Do not build it as a separate third-party plugin project yet.
  - [ ] Use it as a real-world test case for whether Longtail Forge modules can compose shared framework services cleanly.

- [ ] Reuse existing first-party modules where appropriate.
  - [ ] Content ideas may start as Creator Studio records but should be linkable to notes and lists.
  - [ ] Content drafts may hook into Notes when Notes exists.
  - [ ] Campaigns/series should likely be Creator Studio-owned hierarchical records.
  - [ ] Assets/media should use the framework file service.
  - [ ] Repurposing work should be able to create/link Tasks.
  - [ ] Publishing dates should hook into Calendar when Calendar exists.
  - [ ] Tags and Search should apply to Creator Studio records.
  - [ ] Notifications should support assignments, due dates, review requests, and scheduled publish reminders later.

- [ ] Add Creator Studio workbench.
  - [ ] Add a dedicated Creator Studio workbench page.
  - [ ] Workbench should be accessible from a picker similar to workspace/module selection.
  - [ ] It should support a focused content-production workflow without cluttering the basic workbench.
  - [ ] It should optionally filter by client/project/brand/channel/campaign.
  - [ ] It should be disabled cleanly when the Creator Studio module is disabled.

- [ ] Define workbench areas as a framework concept.
  - [ ] Basic workbench for general first-party modules such as timers, tasks, notes, and lists.
  - [ ] Focused workbench for one client/project at a time.
  - [ ] Creator Studio workbench for content planning, drafting, assets, campaigns, repurposing, and editorial calendar work.
  - [ ] Future modules may declare their own workbench areas through the module manifest.

## Version 0.39.9 - User Documentation and 0.3x Stabilization Checkpoint

- [ ] Create user-facing documentation for the completed 0.3x feature set.
  - [ ] Getting started.
  - [ ] Workspace types and workspace switching.
  - [ ] Users, roles, and permissions.
  - [ ] Clients and projects.
  - [ ] Time tracking.
  - [ ] Tasks.
  - [ ] Notifications.
  - [ ] Tags.
  - [ ] Search.
  - [ ] Files/attachments if completed in 0.32.x.
  - [ ] Support tickets if completed in 0.33.x.
  - [ ] Notes and knowledge base foundations if completed in 0.34.x.
  - [ ] Calendar basics if completed in 0.35.x.
  - [ ] Shopping/procurement lists if completed in 0.39.x.
  - [ ] Creator/content studio if completed in 0.39.x.
- [ ] Create admin-facing documentation for workspace/module setup.
  - [ ] Module enable/disable behavior.
  - [ ] Workspace-type label differences.
  - [ ] Permission expectations.
  - [ ] Safe file upload/download behavior.
- [ ] Create developer-facing notes for first-party module contracts.
  - [ ] Module manifest fields.
  - [ ] Navigation registration.
  - [ ] Permission declarations.
  - [ ] Notification declarations.
  - [ ] Taggable/searchable declarations.
  - [ ] File attachable declarations.
  - [ ] Workbench card/area declarations.
- [ ] Update `docs/architecture.md` to reflect the completed 0.3x architecture.
- [ ] Verify `ROADMAP.md`, `TODO.md`, `DECISIONS.md`, `CHANGELOG.md`, and package versions are consistent.

- [x] Wipe existing DB migrations and create a new DB baseline  -  Completed in 0.33.5.18.6.5.4.

- [x] Evaluate all existing regressions and see what can be eliminated/lightened  -  Completed in 0.33.5.18.6.5.4 without removing coverage from the standard release gate.

- [x] Determine where efficiencies can be made in the code/Perform an efficiency refactor  -  Initial regression/database efficiency pass completed in 0.33.5.18.6.5.4.

- [ ] Evaluate whether TypeScript would be a useful addition for ensure module/framework contracts are adhered to

- [ ] Audit all Public API calls and make a list for review and modification. Sort by module.

- [ ] Audit all event hooks by module and make a list for review and modification.

## Version 0.39.15 - Public API and integration-surface decoupling (backend-agnostic, pre-Postgres)

Purpose:

Decouple the public/integration-facing surfaces from both specific module internals and from any assumption about the storage backend, **before** the 0.40.0 PostgreSQL adapter and dual-backend work begins. This is deliberately ordered ahead of 0.40.0: the public API is the contract external integrations, the MCP connector (0.38.8), the ticket public API (0.35.5), and the future 0.70.0 integrations all depend on, and it must not care whether SQLite or PostgreSQL is running underneath, nor reach around module boundaries to assemble its responses. Doing this decoupling while the backend is still single-provider means the public API contract is proven stable *before* a second backend can perturb it.

Entry contract and grounding (re-verify at implementation time ? code will have drifted):

- `src/services/public-api.service.js` currently imports `clientsService`, `clientsRepository`, and `projectsRepository` directly, reaching around the module boundary to assemble responses instead of consuming module-owned contracts.
- `src/services/tag-propagation-registry.js` is nominally a framework registry but `registerBuiltInResolvers()` embeds module-specific SQL against `clients`, `projects`, `tasks`, `notes`, and `note_links` (with a literal `sqlText("client-projects")` module id). That is module data logic living in a framework file, and it is also raw-dialect/interpolation surface that the 0.33.5.27 seam work does not own because it is keyed on module semantics.
- This version consumes the framework-coupling allowlist recorded in 0.33.6.12, which explicitly deferred `public-api.service.js` and `tag-propagation-registry.js` to this slice.
- Aligns with the 0.70.0 integration guideline: "Avoid integration-specific logic leaking into core services where a module or adapter would be cleaner."

Sizing rule for this branch:

- Each sub-slice has one primary blast radius and should be completable in a single focused session. Do not fold the public API decoupling and the tag-propagation decoupling into one slice just because both touch `src/services/`.

### Version 0.39.15.1 - Public API service module-boundary decoupling

- [ ] Remove the direct `clientsService`/`clientsRepository`/`projectsRepository` imports from `src/services/public-api.service.js`; have it consume module-owned read contracts (the Clients/Projects module's service surface) or a registry-mediated data provider rather than importing another module's repo.
- [ ] Confirm the public API depends only on framework-owned foundations (auth, API-key scopes, permissions, workspace boundaries, module enable/disable guards) plus module-declared `publicApiEndpoints`/`apiScopes`, never on a concrete module's storage internals.
- [ ] Preserve every existing public API response shape, scope check, workspace boundary, and disabled-module write guard exactly; this is a decoupling, not a contract change.
- [ ] Add regressions proving public API responses are unchanged and that the service no longer imports specific module repos/services.

Acceptance criteria:

- The public API assembles its responses through framework foundations and module-owned contracts only, with no direct import of a specific module's service/repo and no response-shape change.

### Version 0.39.15.2 - Tag propagation registry module-ownership decoupling

- [ ] Move the module-specific propagation SQL out of `src/services/tag-propagation-registry.js` and into module-owned resolvers registered through the existing `registerTagPropagationResolver()` seam, so the framework registry holds only the registration/materialization/suppression machinery and each module owns the SQL that reads its own tables.
- [ ] Keep the framework responsible for materializing propagated assignments, honoring suppressions, emitting safe events, and repair tooling; keep each Client/Project/Task/Note relationship query owned by the module that owns those tables.
- [ ] Route any dialect-sensitive SQL the resolvers still need through the 0.33.5.27 seams so the tag-propagation path is also backend-agnostic (this SQL was outside the 0.33.5.27 conversion waves because it lived in a framework service keyed on module semantics).
- [ ] Preserve current Client/Project/Task/Note propagation behavior, resolver outputs, and suppression semantics exactly.
- [ ] Add regressions proving propagation behavior is unchanged and that `tag-propagation-registry.js` no longer contains module-specific table SQL.

Acceptance criteria:

- Tag propagation SQL is module-owned behind the resolver registry, the framework file holds only generic machinery, and dialect-sensitive resolver SQL uses the provider-neutral seams.

### Version 0.39.15.3 - Integration-surface backend-agnostic assertion and closeout

- [ ] Confirm the public API, MCP read connector groundwork (0.38.8), and ticket public API (0.35.5) surfaces contain no direct dependency on a storage backend, raw dialect, or a specific module's storage internals; anything remaining routes through framework foundations, module contracts, or the provider-neutral seams.
- [ ] Extend the 0.33.6.12 framework-coupling guardrail (or add a companion) so the public/integration surfaces cannot reintroduce a direct module-repo import or a hardcoded module ID for data access, and remove `public-api.service.js`/`tag-propagation-registry.js` from the deferred-coupling allowlist.
- [ ] Update `docs/public-api.md`, `docs/module-contract.md`, and `DECISIONS.md` to record that integration-facing surfaces are module-contract- and backend-agnostic, and cross-reference this as a prerequisite the 0.40.0 dual-backend work relies on.
- [ ] Run `npm run check` and `npm run test:permissions`, and verify `/api/app-info` after restart.

Acceptance criteria:

- The public API and integration surfaces are provably independent of the storage backend and of specific module internals before 0.40.0 begins, with a guardrail preventing regression and the coupling allowlist reduced accordingly.

## Version 0.39.16 - SQLite adapter performance cleanup

**Model: GPT-5.5 Extra High** ? database adapter internals with prepared-statement lifecycle, transaction, and durability/data-integrity implications; a subtle cache-invalidation or PRAGMA-durability error is high-cost.

Purpose:

Now that the SQLite adapter is fully isolated behind the provider-neutral database seam and every application call site goes through `db.query/get/run` + `db.dialect.*` (0.33.5.27), the adapter's own internals can be optimized without touching a single call site or the agnostic contract. This is a self-contained, behavior-preserving cleanup of `src/db/adapters/sqlite-adapter.js` and `src/db/sqlite.js`, deliberately placed at the end of 0.39 so the SQLite adapter is tuned *before* the 0.40.0 PostgreSQL adapter lands ? that way both backends can be benchmarked fairly and the PostgreSQL adapter can mirror the same startup-tuning and statement-lifecycle patterns instead of diverging.

Scope decision (record in `DECISIONS.md`):

- Adapter-internal only. This slice changes no query result, no error contract, no transaction semantics, and no call-site code. It must not touch the dialect seams, the parameter-binding contract's observable behavior, migrations, or the agnostic-by-contract guarantees. Any durability-affecting change (e.g. `synchronous`) must be runtime-config-gated with a documented default and surfaced in health/diagnostics, not silently changed.

Entry contract and grounding (re-verify at implementation time ? code will have drifted):

- Prepared statements are recompiled on every call: `executePreparedRun`/`executePreparedQuery` in `src/db/sqlite.js` call `getSqliteDatabase().prepare(sql)` per query with no statement cache. better-sqlite3 is fastest when prepared statements are reused.
- The SQL string is scanned up to three times per query: `prepareDatabaseBindings()` (adapter) tokenizes it, then `countSqlStatements()` scans it again, then `resolveStatementBindings()` -> `collectSqlParameters()` scans it a third time in `src/db/sqlite.js`, re-deriving parameter shape the binding layer already computed. The tokenizing logic is duplicated across `src/db/parameter-bindings.js` and `src/db/sqlite.js`.
- `db.get(...)` materializes the full result set then discards all but the first row: `executeGet` -> `executeQuery` -> `allStatement` -> `statement.all()` in `src/db/adapters/sqlite-adapter.js` / `src/db/sqlite.js`, instead of better-sqlite3's `statement.get()` which stops at the first row.
- Startup PRAGMAs are minimal: `applyConnectionPragmas`/`applyStartupPragmas` set only `busy_timeout`, `foreign_keys`, and `journal_mode` (WAL). The standard WAL-safe performance PRAGMAs (`synchronous = NORMAL`, a larger `cache_size`, `temp_store = MEMORY`, and optionally `mmap_size`) are not applied.
- `config.sqlite` already carries `journalMode`/`busyTimeoutMs`/`foreignKeys`; new tuning keys should follow the same runtime-configuration pattern and be documented in `docs/runtime-configuration.md`.

Sizing rule for this branch:

- One primary blast radius: the SQLite adapter (`src/db/adapters/sqlite-adapter.js` and `src/db/sqlite.js`). Measure first, then land the changes behind behavior-preserving regressions. Split only if the 0.39.16.1 measurement shows the prepared-statement cache is materially more complex than the rest ? do not pre-split the tuning bullets, since they share the same blast radius.

- [ ] Establish a repeatable micro-benchmark for the adapter (hot single-row read, hot list read, hot write, and a transaction) and record a baseline before any change, so each optimization can be shown to help and proven not to change results.
- [ ] Add a bounded, connection-scoped prepared-statement cache keyed on the final rewritten SQL, reused across `query`/`get`/`run`. It must be invalidated/reset when the connection is closed and reopened (`initializeSqliteRuntime` closes and recreates the database), must not grow unbounded under variable-length `IN (:ids)` expansion (cap/evict), and must not change results, errors, or transaction behavior.
- [ ] Collapse the redundant per-query SQL scans: parse/tokenize the statement once and reuse the parameter/statement-shape result rather than re-scanning in `countSqlStatements` and `collectSqlParameters`. Prefer sharing the single tokenizer in `src/db/parameter-bindings.js` over maintaining a second copy in `src/db/sqlite.js`. Preserve the exact multi-statement, comment/quote-handling, and error behavior.
- [ ] Make `db.get(...)` use better-sqlite3's single-row `statement.get()` path instead of `statement.all()[0]`, preserving the current `null`-when-empty contract and identical row shape.
- [ ] Add runtime-config-gated startup performance PRAGMAs (`synchronous`, `cache_size`, `temp_store`, and optionally `mmap_size`) with safe WAL-appropriate defaults, apply them in `applyStartupPragmas`, surface the effective values in SQLite health/`/api/runtime-diagnostics`, and document the durability tradeoff of `synchronous = NORMAL` (safe under WAL: no corruption on app crash, only a possible last-transaction loss on OS/power loss). Do not change `journal_mode`, `busy_timeout`, or `foreign_keys` behavior.
- [ ] Add behavior-preserving regressions: identical results/errors/`get`-null semantics before and after; statement-cache correctness across connection reset and variable-length `IN (:ids)`; PRAGMA values reported in health; and record the before/after benchmark numbers. Run `npm run check`, `npm run test:permissions`, `PRAGMA integrity_check`, and verify `/api/app-info` after restart.

Acceptance criteria:

- The SQLite adapter is measurably faster on hot reads/writes through prepared-statement reuse, single-scan parsing, single-row `get()`, and config-gated WAL-safe PRAGMAs, with no change to query results, error contracts, transaction semantics, or the agnostic contract, and with the durability tradeoff documented and diagnostics-visible. The optimizations are established before 0.40.0 so the PostgreSQL adapter can mirror the same patterns.

## Version 0.40.0 - Project Tools expansion & Database extraction layer for use with SQLite or PostGRES

Now that we have the base layer of a complete project management tool, we can begin expanding actual project management with milestones, dependencies, status reporting, budgeting, estimation, views, templates, etc.

Allowing the app to run on SQLite OR PostGRES makes it more flexible for self-hosted installs; I want the database layer to be able to handle either one, based on the settings/.env file

Below is a rough road map for all of the 0.40 branch, this is not finalized yet

- [ ] Add topics to GitHub for discovery

### Project Tools expansion

- [ ] Project Milestones/Phases/Deliverables
  - Milestones belong to a workspace and optionally a client/project
  - Tasks, notes, tickets, time entries, and files may eventually link to a milestone
  - Milestones should have a title, description, status, due date, sort order, and optional completion/completed date
  - This should not block basic tasks, but the data model should leave room for it

- [ ] Task dependencies/blockers
  - Allow one task to depend on another task
  - Show blocked tasks clearly
  - Prevent circular dependencies
  - Allow blocked-by relationships across the same project, and maybe later across projects
  - More formal task workflow, such as `backlog`, `ready`, `in_progress`, `waiting`, `blocked`, `in_review`, `approved`, `complete`, `canceled`, and `archived`, often with rules about which statuses can move to which next statuses.

- [ ] Project Status/Health
  - Project status: active, paused, completed, archived
  - Project heatlh: on_track, at_risk, blocked, waiting_on_client
  - Dashboard should eventually surface project health

- [ ] Project budgeting/estimation/actuals
  - should be optional for personal/family projects
  - [ ] Add estimated hours to projects
  - [ ] Add optional budgeted hours/dollars to projects
  - [ ] Compare estimated vs actual tracked time
  - [ ] Show budget/burn progress on project pages and dashboard
  - [ ] Allow reporting by client, project, milestone, tag, and date range

- [ ] List/Kanban/Calendar views
  - [ ] Add list view for tasks
  - [ ] Add Kanban board view for tasks grouped by status
  - [ ] Add calendar view for tasks with due dates

- [ ] Project/task templates
  - should have hard-coded, initial examples that can be used as well as saved templates
  - [ ] Add task templates
  - [ ] Add project templates
  - [ ] Allow project templates to create default milestones, tasks, notes, and checklists
  - [ ] Allow workspace-level templates first
  - [ ] Later: allow client-specific templates

- [ ] Task checklists (tasks can have sub-item checklists)
  - Checklist items belong to a task
  - Items can be checked/unchecked and sorted
    - sort by: due date, importance, etc.
  - Checklist completion can optionally contribute to task progress

- [ ] Task/Project discussions
  - [ ] Add comments to tasks
  - [ ] Add comments to projects
  - [ ] Add internal comments to support tickets
  - [ ] Comments should respect permissions and visibility
  - [ ] Comments should appear in activity feeds where appropriate

- [ ] Files/attachments foundation
  - [ ] Add file attachment foundation for notes/tasks/support tickets/projects
  - [ ] Store file metadata in database
  - [ ] Decide local storage vs object storage later
  - [ ] Respect workspace/client/project permissions
  - [ ] Public-safe attachments required before public KB/client portal features

- [ ] Project Owner/Responsible-user fields
  - [ ] Workspace owner
  - [ ] Client/account owner
  - [ ] Project owner
  - [ ] Ticket owner
  - [ ] Task/ticket assignee remains separate from project ownership

- [ ] Saved views
  - people will want views like: "Tasks due this week," "Waiting on client," "Client open tickets," etc.
  - [ ] Allow users to save commenly used filters
  - [ ] Saved views may apply to tasks, time entries, tickets, notes, and dashboard sections
  - [ ] Views should be user-specific first
  - [ ] Workspace-share views can come later

- [ ] Client approvals/change requests
  - [ ] Add lightweight approval records
  - [ ] Add change request records
  - [ ] Link approvals/change requests to clients, projects, milestones, tasks, notes, or tickets
  - [ ] Track requested_by, approved_by, approved_at, status, and notes
  - [ ] Consider client-facing approvals only after permissions/client portal features exist

- [ ] Timeline/Gannt-style view

- [ ] Workload/capacity planning

- [ ] Portfolio-level reporting across clients/projects/workspaces

### Database extraction layer - PostgreSQL adapter and dual-backend support

Deferred here from the 0.33.5 line (originally 0.33.5.23, "PostgreSQL Adapter and SaaS Runtime Proof"). Its prerequisites are the provider-neutral database seam from 0.33.5.19, the parameter-binding migration from 0.33.5.23, the array/bulk binding follow-ups from 0.33.5.26, and the completed 0.33.5.27 agnostic-by-contract conversion/seam branch. By the time this section starts, application call sites already use named bound params and provider-neutral dialect seams, with the interpolation and raw-dialect ratchets enforced at zero for app call sites. 0.40.0 is the actual PostgreSQL backend, provider gating, migration-runner, dual-backend test, and SaaS seed/load proof work behind those seams, not an app-wide SQL rewrite. SQLite stays the self-hosted default throughout. See also the PostgreSQL bullets in 0.50.0 and 0.60.0, which this section is the concrete plan for.

Purpose: implement and prove the hosted-SaaS PostgreSQL database backend behind the provider-neutral database contract while preserving SQLite small-office support.

Grounding (re-verify at implementation time - code will have drifted):

- The real adapter seam is `createDatabaseAdapter(provider)` in `src/db/provider.js`, which throws for anything but `"sqlite"` and returns `createSqliteAdapter()`. PostgreSQL plugs in as a new `src/db/adapters/postgres-adapter.js` plus a branch in the factory, not by editing `core/database.js` (a re-export).
- Adapter contract shape (from `sqlite-adapter.js`): `provider`, a `capabilities` object (`transactions: true`, `transactionApi: "callback"`), `query/get/run(sql, params)`, `transaction(callback)`, `health`, `initializeRuntime`.
- `assertNotInsideTransactionContext` (AsyncLocalStorage) guards top-level `db.*` inside a transaction; nested `transaction()` throws. Re-verify the `db.transaction(...)` call-site count (5 at time of writing: `jobs.service.js`, `job-queue.js`, `job-runner.js`, `notes.repo.js`, `tasks.repo.js`).
- SQLite-only introspection/repair historically lived in `src/db/migrations.js` and `src/db/index.js` startup maintenance. Re-verify the 0.33.5.27 startup/migration allowlist and provider gates before adding PostgreSQL equivalents.
- The migration lock is file-based (`src/db/migration-lock.js`, `fs.open(path, "wx")`) and single-host; PostgreSQL needs an advisory-lock equivalent.
- Search is behind a search adapter (`src/core/search/adapters/sqlite-search-adapter.js`, FTS5 `MATCH`/`bm25()`); PostgreSQL needs a parallel `tsvector`/`tsquery` search adapter, not an inline SQL port.

- [ ] **Dialect seam implementation recheck** - consume the closed 0.33.5.27 decisions, audit totals, and enforcement allowlist, then re-scan for drift before building PostgreSQL support. Confirm every active call site still uses the established seams for `INSERT OR IGNORE`/SQLite `ON CONFLICT`, `COLLATE NOCASE`, PRAGMA usage, FTS5 (`MATCH`/`bm25()`), JSON assumptions, boolean storage, `julianday(...)`/date arithmetic, `rowid`, and `RETURNING`/identity. Output only the PostgreSQL implementation gap list and intentional provider-specific paths; do not reopen application repository conversion unless drift is found.
- [ ] **PostgreSQL adapter skeleton and factory wiring** - add `src/db/adapters/postgres-adapter.js`, register it in `createDatabaseAdapter(provider)` (replace the `"postgres"` throw), match the adapter contract exactly, support `DATABASE_URL`/pool/TLS via runtime config, add health checks in the shape diagnostics already consume, and docs for local Postgres dev. No SQLite default changes; connection + contract only.
- [ ] **PostgreSQL implementations for established dialect seams** - implement provider translations for the non-FTS seams established in 0.33.5.27 (`INSERT OR IGNORE`/`ON CONFLICT`, case-insensitive compare/order, boolean storage, date/interval math, `rowid`/identity). SQLite output stays identical; PostgreSQL routes to the compatible form behind the same call. Document intentional provider-specific paths.
- [ ] **Full-text search portability** - a PostgreSQL search adapter behind the existing search-adapter seam, mapping FTS5 `MATCH`/`bm25()` to `tsvector`/`tsquery` + ranking, preserving the search result/permission-scoping contract. SQLite FTS5 adapter unchanged.
- [ ] **Read-modify-write transaction hardening** - wrap the RMW sequences from the audit in `db.transaction(...)` so they stay correct on a pooled/concurrent backend without SQLite's global serialization; reuse the callback-transaction contract and `assertNotInsideTransactionContext`; no nested transactions.
- [ ] **Provider-gate SQLite-only introspection and repair** - gate the SQLite-only routines in both `src/db/index.js` startup maintenance and `src/db/migrations.js` behind the SQLite provider; provide provider-appropriate equivalents (or explicit no-ops) so a PostgreSQL boot does not silently skip required repairs. SQLite behavior unchanged.
- [ ] **PostgreSQL migration runner and advisory locking** - per-provider DDL/introspection selection in the migration runner; advisory-lock equivalent of the file-based lock (which stays SQLite/single-host); keep the `runMigrations` app-facing entry stable.
- [ ] **PostgreSQL schema baseline and checksum** - a PostgreSQL-compatible schema baseline/translation (`src/db/schema/current.sql` is SQLite DDL today), verified from an empty PG database, with checksum validation; docs for the SQLite self-hosted path vs the PostgreSQL SaaS path, migration ownership, and backups.
- [ ] **Dual-backend repository contract tests** - a runner that executes repository contract tests against SQLite and (opt-in via `DATABASE_URL`, Docker or local Postgres) PostgreSQL; prioritize sessions, workspaces, permissions, tasks, notes, files metadata, search index, notifications; prove `db.transaction(...)` pins one connection for the whole callback on PG and that no path uses top-level `db.*` inside a transaction.
- [ ] **SaaS seed and load smoke test** - a Postgres seed profile for many workspaces + basic load-smoke scripts covering login/session, app shell, tasks, notes, files, search, notifications, and the job worker; record baseline performance numbers and document what is and is not proven.
- [ ] **Closeout** - record decisions in `DECISIONS.md` (advisory-lock strategy, FTS `tsvector` boundary, intentional provider-specific paths), update runtime-configuration docs so `LONGTAIL_DATABASE_PROVIDER`/`DATABASE_URL`/pool/TLS keys are marked live vs. reserved accurately, add the dual-backend/portability regressions to the suite, and verify `/api/runtime-diagnostics` reports the configured provider/health on both backends.

### Database Tools

- [ ] Configuration files for initial configuration
  - [ ] Merge all previous migrations to make unified initial SQL
- [ ] Migration tools to switch between database backends
- [ ] Export/Import database tools
  - [ ] Allow users to export their workspaces

### App Decisions

- [ ] Define archival period
- [ ] Define lifecycle of tasks, notes, tickets, etc.

## Version 0.43.0

- [ ] Email delivery
- [ ] Invite links
- [ ] Single Sign-On (SSO)

## Version 0.45.0 - Phone/Tablet/TV app prep

- Prepare APIs for Phone/Tablet/TV apps

- Universal Longtail Forge app for iOS

- Universal Longtail Forge app for Android (Latest)

- Roku apps for coordinating teams/families
  - Displays Calendar/Task Lists/Current-Upcoming Day Events

## Version 0.50.0 - Production, Packaging, and Self-Hosting

- [ ] Move to a demo production environment
- [ ] Make PostgreSQL the preferred production database for this release (the SQLite/PostgreSQL adapter, dialect, and dual-backend work is built earlier in 0.40.0 - Database extraction layer; SQLite stays the lightweight self-hosted default)
- [ ] Add file attachment abilities to notes/tasks/support tickets
- [ ] Docker Compose
- [ ] Setup wizard
- [ ] Admin docs
- [ ] Add production cookie flags
- [ ] Self-hosted release
- [ ] Expand project management tools

### Added during 0.30.6 Code Review

- Verify runtime data directory permissions for `data/`, `logs/`, and `archive/`.
- Ensure the SQLite database file is not web-served under any configuration.
- Add startup warnings when data/log directories are world-readable or world-writable on platforms where that can be checked reliably.
- Add backup/restore path validation that prevents writing outside approved runtime directories.
- Consider an install health-check endpoint or CLI command that reports filesystem lockdown status without exposing sensitive paths to normal users.

## Version 0.60.0 - SaaS Wrapper

This will be a private plugin, only available to me. This layer is the hosted, multi-tenant *operation* of the app - it builds on the SQLite/PostgreSQL adapter work from 0.40.0 rather than re-implementing it. "Hosted PostgreSQL" here means the managed/provisioned database service and tenant data isolation for the hosted product, not the database adapter itself.

- [ ] SaaS wrapper
- [ ] Hosted PostgreSQL (managed/provisioned instances + tenant isolation on top of the 0.40.0 adapter)
- [ ] Tenant signup
- [ ] Billing
- [ ] Monitoring

## Version 0.70.0 - Integrations and Plugin Readiness

### Guidelines/Notes for Integrations

- [ ] Integration architecture
  - [ ] Integrations should authenticate through API keys, OAuth, or integration-specific credentials as appropriate
  - [ ] Integrations should respect workspace, client, project, and user permissions
  - [ ] Integration events should be audit logged where appropriate
  - [ ] Integration-created records should identify their source in metadata
  - [ ] Avoid integration-specific logic leaking into core services where a module or adapter would be cleaner

### Potential Integrations List

#### Support tickets

- [ ] ZenDesk
- [ ] FreshDesk
- [ ] GitHub Issues

#### Calendars

- [ ] Google Calendar
- [ ] Outlook Calendar

#### Task/To Do App Integrations

- [ ] Microsoft To Do
- [ ] Google Tasks
- [ ] Identify others in the marketplace

#### File Sharing and Storage

Is it possible to get notifications from any of these sources?

- [ ] DigitalOcean Spaces
- [ ] AWS
- [ ] Microsoft Azure
- [ ] Microsoft OneDrive
- [ ] Google Drive
- [ ] DropBox
- [ ] Microsoft SharePoint
  - File sharing
  - Knowledgebase pages
  - Input for tickets/notes/tasks/etc.
- [ ] GitHub (Repository Linking)

#### Email integrations

Auto-routing communications/messaging

- [ ] Google Workspace email
- [ ] Outlook

#### eCommerce Plugins

- [ ] Knowledge Base plugin
- [ ] Support ticket plugin
  - Would include notes plugin for Shopify Admin
- [ ] Automated task creation from:
  - Front-end support tickets
  - Order issues (fulfillment failure, etc.)

- [ ] WordPress/WooCommerce
- [ ] Shopify
- [ ] Magento
- [ ] BigCommerce

#### Personal/Family Workspace Integrations

- [ ] Create grocery/shopping list items from Home Assistant (voice commands inputs)
- [ ] Update/create project tasks from Home Assistant (voice commands inputs)

- [ ] Home Assistant
- [ ] Apple Home
- [ ] Google Assistant (Google Home?)

#### Analytics (Creator Studio)

- [ ] WordPress
- [ ] YouTube
- [ ] TikTok
- [ ] Twitch
- [ ] Facebook
- [ ] Instagram
- [ ] Threads
- [ ] X
- [ ] BlueSky
- [ ] Mastodon
- [ ] Buffer

#### Publishing (Creator Studio)

The Creator studio tool can be much richer if it pushes content out to these platforms, or stores them there until ready for publishing.

- [ ] WordPress (Posts first, the Custom Post Types)
- [ ] Shopify (Blogs)
- [ ] Social Media
  - [ ] YouTube
  - [ ] TikTok
  - [ ] Twitch
  - [ ] Facebook
  - [ ] Instagram
  - [ ] Threads
  - [ ] X
  - [ ] BlueSky
  - [ ] Mastodon
  - [ ] Buffer

## Version 0.71.0

- [ ] Buy domain name
  - [ ] Launch website

- [ ] Launch Social Media
