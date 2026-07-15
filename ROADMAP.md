# Longtail Forge Roadmap

This file is the detailed per-version forward plan for Longtail Forge. README.md should stay cursory and point here for version-level detail.

Active cursor: `0.33.14.1`.

## Roadmap-Wide Architecture Rules

### Product-first framework direction

Longtail Forge is a product first. Its framework exists to support the Longtail Forge application and its official first-party modules, not to become a generic framework for its own sake. Support Tickets, Knowledge Base, and Creator Studio are committed first-party product modules that will ship in the public Longtail Forge core when completed. They may be disableable per workspace where appropriate, but they are not contingent on customer requests, preorders, outside funding, or a market-validation gate.

### Two-Module Rule

- Do not add a framework primitive, manifest field, registry, contribution type, generalized service, or framework-owned abstraction merely because one module has one unusual requirement.
- A generalized framework facility should normally have at least two concrete first-party consumers with materially similar behavioral and contract requirements. Do not invent a hypothetical or fake second consumer.
- A one-module requirement remains module-owned until the common contract is understood. Shared appearance alone is not sufficient when behavior and ownership are not also meaningfully shared.
- Authentication, sessions, security, permissions, workspace isolation, deployment, database abstraction, and app-shell behavior are legitimate exceptions because they are intrinsically framework-wide. Any other exception must be explicit in the owning roadmap decision and architecture documentation.
- Apply this rule prospectively. It does not require destructive rewrites of sound abstractions that predate it.
- At closeout of a new generalized primitive, name its two real consumers or document the framework-wide exception.

The 0.33.14 editable field primitive already satisfies this rule: the current descriptor renderer paths, Reporting, and Settings have overlapping metadata-to-control, value-binding, accessible-field-anatomy, and validation-message needs. The rule narrows that primitive to those real consumers; it does not cancel 0.33.14 or authorize a broad conversion of unrelated pages.

### Gradual modernization rules

- Large first-party module definitions may be composed from concern-focused source files while continuing to export one validated module definition to the registry. This is source organization, not a plugin-loader redesign; small modules do not need empty boilerplate files.
- Browser modernization in the 0.3x branch uses native ES modules and explicit page entry points gradually. Do not rewrite the frontend in React, Vue, Svelte, Angular, or another framework, replace the renderer wholesale, or add new implicit script-order dependencies.
- Test streamlining means measuring and relocating equivalent coverage deliberately, never deleting a test merely because it is slow. Permission, workspace-isolation, database, migration, file-safety, integration, rendered critical-journey, and accessibility coverage remain strong.

## Roadmap Reordering Record

| Previous location | Revised location | Record |
| --- | --- | --- |
| 0.33.16 packaging and in-app/bare-metal auto-updater work | 0.33.17 packaging/release operations; updater evaluation at 0.39.12 | Security remains in 0.33.16; supported initial upgrades are manual Docker or bare-metal operations. |
| 0.38.4 baseline Backup and Restore | 0.33.17 private-preview/release readiness | Baseline verified backup/restore moves forward; 0.38.4 retains advanced automation only. |
| 0.34.1-0.34.4 Knowledge Base | 0.35.1-0.35.4 Knowledge Base | Detailed Notes-first reviewed-publication contract is preserved after Tickets. |
| 0.35.0-0.35.6 Support Tickets | 0.34.0-0.34.6 Support Tickets | Tickets land first as a committed first-party workflow module. |
| Deferred test timing and affected-test notes in TODO | 0.33.18 and repeated closeout checkpoints | Timing consumption and evidence-based consolidation become versioned roadmap work. |

## Version 0.33.13 - Lists Module UI/UX Overhaul

Decision:

The Lists workspace is a framework-declarative view surface (`lists.workspace` in `src/modules/lists/module.js`), so this overhaul is expressed by moving Lists onto the same framework anatomy Notes already uses — not by hand-building Lists-only page chrome. The framework owns page layout, the slide-out filter/navigation drawer and its bottom-left filter button, collapsible boxes, the shared Linked Context picker/read-list shells, and modal sizing/anatomy. Lists owns its filter/selector data, detail content, linked-record provider queries and save payloads, item workflow, and `.lists-*` content styling.

Before this branch, Lists rendered filters and the "List Selector" inline above the detail through `layout: "stacked"`. As of 0.33.13.1, both controls live in the framework slide-out drawer and the selected-list detail owns the full-width main surface. As of 0.33.13.2, the detail opens with a collapsible List Details box that contains the description and read-only linked records through the shared linked-context list shell. As of 0.33.13.3, Create/Edit List owns all link management through the shared Linked Context picker in a framework-wide modal, with permission-filtered readable/writable targets and no raw record-ID entry. As of 0.33.13.4, the Add/Edit Item modal follows the same framework modal heading, section, and width-hint guidelines without the leftover one-off item-grid layout CSS. As of 0.33.13.5, Lists is closed on one declarative linked-record path per purpose, the retired detail-side linked-record editor/bootstrap/CSS are gone, and the branch is complete.

Purpose:

Bring the Lists workspace in line with the framework view guidelines and the Notes reference layout: move filtering and list selection into the standard bottom-left filter drawer, give the detail a clean full-width reading layout with a collapsible "List Details" box, and move all link management into a properly sized Edit List modal that uses the shared Linked Context picker.

Dependencies and baseline:

- Builds on the framework `slide-out-sidebar` layout and `sidebarPanels` (already consumed by `notes.workspace` and Tasks), the collapsible `view.createInfoPanel`, and the shared `view.createLinkedContextPicker` / `view.createLinkedContextList` shells and `linked-context-target.v1` provider contract (`docs/linked-context-picker-contract.md`). Lists already registers a `linkedContextProviders` List-target provider; this version makes Lists a *consumer* of the shared picker for its own linking UI, as Notes already is.
- Honors the framework/module view-ownership boundary: framework owns layout/anatomy/`.view-*`; Lists owns data/behavior and `.lists-*`.
- Does not depend on the 0.33.14 field-factory primitive; the Edit List and Item modals use the current descriptor modal-form primitives. Any field type the primitive does not yet cover stays as-is until 0.33.14 folds it in.

Non-goals:

- Do not change the Lists data model, routes, permissions, item/reusable/catalog workflow, or billing/cost math.
- Do not build Lists-only layout classes where a framework primitive exists; consume `renderDescriptor*` / `view.*` helpers.
- Do not revive the deprecated `.view-split-list-detail` primitive; Lists moves from `stacked` to `slide-out-sidebar`.

## Version 0.33.14 - Framework View Primitives: Editable Form-Field Factory

Purpose:

Promote form-field construction from a private renderer helper into a first-class, exported `LongtailForge.view` primitive with the field types and editable value-binding required by its three real consumers: current descriptor-renderer paths, Reporting, and Settings. Today the framework can render fields from metadata — but only inside the renderer's private `renderFieldShell`/`createFieldControl` functions (`public/js/shared/view-renderer.js`), which are not part of the frozen `LongtailForge.view` export (`public/js/shared/view-builder.js`), do not cover current Reporting/Settings needs such as toggle/radio/multi-select or `max`/`inputmode`, and are hardwired `disabled: true` for persistent (non-modal) field grids (`renderFieldGridShell`). This satisfies the Two-Module Rule without turning the slice into a generic form-builder program.

This is a deliberately small, foundational slice sequenced immediately ahead of the Settings work (0.33.15) so Settings consumes a finished primitive rather than inventing settings-only field anatomy. Reporting (0.33.12) lands first on the existing read/filter path and may use a narrow framework adapter for the missing project multi-select and conditional-date behavior; this version must fold any overlapping Reporting field construction into the exported factory without changing report behavior.

Decision:

Field construction is framework-owned view anatomy. The framework owns a single exported field-factory primitive (labels, controls, `.view-*` field anatomy, accessible structure, editable vs. read-only mode). Modules and framework hosts own field metadata (id, label, type, options, default), value meaning, validation, and save payloads — and must not hand-build field DOM when the primitive covers it.

Dependencies and baseline:

- Builds on the framework view baseline (0.33.5.13-0.33.5.18) and the existing renderer field internals; this version exposes and completes them rather than replacing the renderer.
- Honors the view-ownership boundary (framework owns `.view-*` field anatomy; modules own data/validation/payloads).

Non-goals:

- Do not build settings-specific behavior here (save to `PUT /api/settings`, dependent-setting visibility, retiring `settingsControls`); that stays in Settings (0.33.15).
- Do not broadly convert existing pages in this version; limit adoption to the shared renderer paths and any temporary Reporting field construction that the new primitive directly replaces.
- Do not fork modal-form or filter rendering that already works; extend the shared path so there is one field-construction path, not two.
- Do not add field types, schema keys, validation machinery, or layout modes without a current renderer, Reporting, or Settings consumer.

### Version 0.33.14.1 - Exported field-factory primitive and complete field-type set

**Model: High Effort** — This changes a framework-wide renderer seam and must preserve every converted surface while adding the field types needed by Reporting and Settings.

- [ ] Extract field construction into an exported `LongtailForge.view` primitive (for example `createField`/`createFieldControl`) so callers build fields from metadata without passing fully-formed DOM and without reaching into renderer internals.
- [ ] Complete the field types required by the three named consumers: text, number (with `min`/`max`/`step`/`inputmode`), select, multi-select, boolean/checkbox, toggle/switch, radio group, textarea, date, and time. Add no extra type without a concrete current consumer.
- [ ] Keep the descriptor field schema (`VIEW_FIELD_FIELDS` in `manifest-contract.js`) and the primitive in sync (add `max`, `inputmode`, and the new types).
- [ ] Route the descriptor renderer (`renderFieldShell` and the modal/filter paths) through the shared primitive so there is one field-construction path, not two.
- [ ] Route any temporary Reporting project multi-select or conditional-date field construction from 0.33.12 through the new primitive without changing report filters or query payloads.
- [ ] Add contract-focused regressions for supported metadata, accessible labels/control state, value binding, and collection. Avoid pinning incidental DOM-construction order or private helper structure.

Acceptance criteria:

- A caller can construct any supported field from metadata via one exported primitive.
- Modal, filter, and persistent-grid field rendering all flow through the same primitive.

### Version 0.33.14.2 - Editable field grids, value binding, and guardrails

**Model: High Effort** — Editable binding and collection become a shared framework contract consumed by Settings, so subtle value or disabled-state regressions would spread across surfaces.

- [ ] Add an editable mode to field grids so a persistent (non-modal) grid can render enabled, value-bound controls (today `renderFieldGridShell` forces `disabled: true`).
- [ ] Add a value-collection helper that reads a grid's live field values into a payload object, generalizing the pattern currently trapped in `settings-controls.js` (`readModuleSettingsPayload`).
- [ ] Provide a per-field error/message channel the primitive can display, with validation itself owned by the caller.
- [ ] Add a guardrail/regression that framework-owned field anatomy is not hand-built with raw `document.createElement` when the primitive covers it.
- [ ] Update `docs/view-building-contract.md` and the view-primitive inventory to document the field factory.

Acceptance criteria:

- A persistent, editable, value-bound field grid renders from metadata with no hand-built DOM, and its values can be collected into a save payload.
- The field factory is documented and guardrailed as the single field-construction path.
- Closeout names the current renderer, Reporting, and Settings as the primitive's real consumers and records any framework-wide exception explicitly.

## Version 0.33.15 - Settings De-Hardcoding: Module-Contributed Settings Framework

Purpose:

Turn settings from a hand-built framework island into a framework-owned settings host that renders settings **contributed** by modules. Today "settings" is four disconnected mechanisms with no shared registry — the columnar `workspace_settings` table (framework), the `app_settings` key/value table, per-user columns on `users`, and per-feature tables (`file_workspace_settings`, `task_reminder_offsets`, `notification_*`) — and the settings UI reuses **none** of the framework's declarative view system. Module-conceptual settings (billing rate, billing period, rounding, fiscal year, task timers, task reminder defaults, file policy/storage) are baked into framework-owned code, and adding a single functional module setting today requires editing the framework in three places: a `MODULE_SETTING_HANDLERS` entry in `settings.service.js`, a dedicated `workspace_settings` column, and a branch in `normalizeSettings`. This version establishes the pattern the product needs going forward: a module (eventually a third-party plugin) exposes a setting declaratively and says where it attaches, and the framework stores, permission-filters, renders, and saves it with no framework code change.

This is the settings analog of the Reporting framework work (0.33.12): the same "framework owns the host and dispatch; modules own the definitions, data, and record-level safety" boundary, applied to settings instead of reports. It is also the "broader Administration/Settings audit" that 0.33.11 explicitly deferred as larger than a quick fix.

Decision:

Settings is framework-owned settings-host infrastructure, not a normal disable-able workflow module. The framework owns the settings page shell and anatomy, the settings catalog, contribution filtering, the settings renderer and its `.view-*` anatomy, generic settings storage, the save dispatch, and the declared attachment points. Individual modules own their setting descriptors (id, label, type, options, default, validation), the meaning and allowed values of each setting, per-setting permission requirements, and — only where a setting has side effects — a persistence/apply handler registered by stable ID. A module must never require a framework schema migration or a hardcoded framework branch to add an ordinary setting.

A setting must be able to affect change in two places — the owning module and the framework — through one uniform read accessor plus an optional on-change effect registered by stable ID; each setting declares which of those two targets it affects. And some framework settings and capabilities are protected: they are framework-owned, may be read-only or owner-only, and can never be disabled or overridden by a module contribution — the same guarantee that already makes core modules like Clients/Projects and Users non-disable-able (`canDisable: false`), extended to the settings layer.

Dependencies and baseline:

- Builds on the framework view baseline (0.33.5.13-0.33.5.18) and the 0.33.14 editable form-field primitive: the 0.33.14 field factory supplies the exported field construction, the complete field-type set, and the editable value-bound field grid, so Settings consumes a finished primitive rather than inventing settings-only field anatomy. This version adds only the settings-specific layer on top (save binding to `PUT /api/settings`, dependent-setting visibility, and per-setting validation surfacing).
- Follows the Reporting contribution contract (0.33.12.2-0.33.12.7) as its template and precedent: a validated data-only manifest contribution, a `modulesService.list*Contributions` method reusing the shared four-axis filter, register-by-ID execution kept separate from catalog filtering, permission-filtered module browser-asset delivery into a framework host, and grep/regression guardrails forbidding framework-to-module coupling.
- Reuses the existing settings seam rather than replacing it: the manifest already has a validated `settings` field (`manifest-contract.js`), the generic contribution filter `listWorkspaceContributions` already applies enabled-module + required-module + workspace-capability + user-permission filtering, and settings already have a data-descriptor-to-behavior-by-ID split (`MODULE_SETTING_HANDLERS`). This version generalizes those; it does not start from scratch.
- Honors the view-ownership boundary (framework owns page/anatomy/`.view-*`; modules own data/behavior/validation/save payloads and module-prefixed classes).

Key decisions:

- **Generic module-settings storage is the linchpin.** Add a generic per-module/per-workspace settings store (addressed by workspace + module + setting id, JSON-valued) so a contributed setting persists without a dedicated `workspace_settings` column or a `normalizeSettings` branch. Column-per-setting storage is what makes settings hard to un-hardcode; the generic store removes that.
- **Register-by-ID handlers become opt-in, not mandatory.** The common case (store and read a validated value) is handled generically from the descriptor. A registered handler (generalizing `MODULE_SETTING_HANDLERS`) is required only when a setting has side effects (for example enabling/disabling a module, or writing a legacy per-feature table during migration).
- **"Where it attaches" is a validated placement key**, modeled on the existing dashboard-panel `placement` contribution, resolving to framework-owned attachment points (workspace settings, user settings, a module's own settings page, and new-workspace creation) — replacing today's implicit `[data-module-settings]` / `[data-module-settings-fields]` / `[data-new-workspace-module-settings]` anchors.
- **Existing framework-owned settings are migrated behind module ownership with backward-compatible reads.** Billing/rounding/fiscal-year and task settings move to their owning modules; the values keep flowing to the billing/reporting/client-projects consumers through a module-owned accessor, not a framework column read, mirroring the reporting.service.js decoupling.
- **Settings affect change through one read accessor plus optional on-change effects.** Consuming code — module or framework — reads a setting's current value through a single accessor (`settingsService.getValue(...)`); an optional on-change effect registered by stable ID runs when the value changes (invalidate a cache, refresh navigation, revoke sessions). Read access and effects are separate concerns from write/persistence.
- **Every setting declares a target: module or framework.** Module-target settings affect only the owning module; framework-target settings affect framework behavior and are framework-owned and guarded. A module contribution cannot reach a framework target it does not own.
- **Protected framework parts are first-class.** Framework/core settings and capabilities can be marked protected (non-disable, read-only, or owner-only) and can never be removed, disabled, or overridden by a module contribution — extending the existing `canDisable: false` guarantee on core modules (Clients/Projects, Users, Tags) to the settings layer.
- Settings values are validated at the edge by each module (the module owns validation and allowed values); the framework host stays value-agnostic and never special-cases a first-party module or setting id.

Non-goals:

- Do not build a third-party plugin loader or filesystem module discovery in this version; the contract is designed so a future plugin can use it, but modules remain the statically-registered first-party set.
- Do not convert framework operational readouts (runtime diagnostics, jobs observability) into contributed settings; those stay framework-owned.
- Do not migrate genuinely install-level config (session/cookie TTLs, sqlite/worker tuning) out of `config.js` into per-workspace settings.
- Do not change the meaning, defaults, or persisted values of any existing setting; this is relocation and de-hardcoding, not a settings redesign.
- Do not weaken permission, workspace-capability, enabled-module, private/secure-content, or audit guardrails to make settings contributable.
- Do not leave two parallel settings renderers: the raw-`document.createElement` `settingsControls` path is replaced by framework view primitives / descriptor fields, not kept alongside them.
- Do not let a module contribution disable, override, read-only-bypass, or otherwise weaken a protected framework setting or capability, or target the framework; protected framework parts stay framework-owned.
- Do not add a generalized settings facility solely for one module's unusual configuration. Keep a single-module effect module-owned unless a second real consumer exists or the setting is intrinsically framework-wide.
- Keep this branch bounded to Settings de-hardcoding; do not absorb the 0.33.16 security work or 0.33.17 preview/release work.

### Version 0.33.15.1 - Settings inventory, ownership map, and storage decision

Purpose: Catalog every setting and decide, per setting, its owner and target storage before moving anything.

- [ ] Inventory every setting across all four mechanisms: framework `workspace_settings` columns, `app_settings` key/values, per-user `users` columns, and per-feature tables (`file_workspace_settings`, `task_reminder_offsets`, `notification_*`).
- [ ] Classify each setting as framework-owned (workspace identity, audit, ops, install policy) or module-owned-by-concept:
  - [ ] billing rate, billing period, rounding, fiscal year -> time-tracking / client-projects.
  - [ ] task timers, reminder defaults -> tasks.
  - [ ] file type policy, storage limits -> files.
  - [ ] secure-notes key policy -> notes.
- [ ] Record each setting's current definition/normalizer, storage location, read consumers, and write path so migration preserves behavior.
- [ ] Decide the target storage per setting: generic module-settings store, a retained per-feature table (behind a registered handler), per-user, or app-level.
- [ ] Produce a `docs/settings-ownership.md` map used by the later slices; do not change runtime behavior in this slice.

Acceptance criteria:

- Every setting has a documented owner, current storage, consumers, and target storage.
- The framework-owned vs module-owned classification is explicit before any migration.

### Version 0.33.15.2 - Generic settings storage, read accessor, and effect registries

Purpose: Build the engine by which settings are stored, read, and reacted-to generically — the mechanism that lets a setting affect change in the owning module or the framework — without a framework schema change per setting.

- [ ] Add a generic per-module/per-workspace settings store addressed by (workspace_id, module_id, setting_id) with JSON-encoded, type-validated values, defaulted from the setting descriptor.
- [ ] Add a uniform read accessor (`settingsService.getValue(context, moduleId, settingId)`, plus a framework-target equivalent) so module code and framework code consume a setting's current value the same way, with descriptor defaulting and workspace scoping. This is how settings "affect change" at read time.
- [ ] Generalize `MODULE_SETTING_HANDLERS` into two registries keyed by `"${moduleId}.${settingId}"`, both opt-in:
  - [ ] a persistence registry (optional write/apply handler) for settings that need custom storage or side effects; the default path stores/reads through the generic store with no handler.
  - [ ] an on-change effect registry (optional "react when this changes" hook) run once after a successful save — invalidate a cache, refresh navigation, revoke sessions, re-evaluate a capability. Effects are separate from persistence and never run on a rejected save.
- [ ] Route reads/writes so a writable contributed setting no longer requires a `workspace_settings` column or a `normalizeSettings` branch.
- [ ] Keep the existing `PUT /api/settings` save contract and `moduleSettings` payload shape working.
- [ ] Add regressions: a new module setting persists and reads back with no framework schema edit; the read accessor returns the stored value or the descriptor default; an on-change effect fires exactly once after a successful save and never after a rejected one; an unknown/read-only/wrong-typed setting is rejected; a handler-backed setting still routes through its handler.

Acceptance criteria:

- A module can persist and read a validated functional setting through the generic store and accessor with no framework column, normalizer branch, or hardcoded handler.
- Persistence handlers and on-change effects are opt-in, registered by stable ID, and available to both module-target and framework-target settings.

### Version 0.33.15.3 - Settings contribution contract (manifest) and listing method

Purpose: Promote the manifest `settings` field into a full, validated contribution that says what the setting is and where it attaches.

- [ ] Extend the manifest settings contribution (validated in `manifest-contract.js`) with:
  - [ ] an attachment/`placement` target validated against a fixed attachment-point set (modeled on dashboard `placement`).
  - [ ] a `target` of `module` or `framework` declaring what the setting affects (default `module`); framework-target settings bind to the framework read accessor/effects from 0.33.15.2.
  - [ ] a `protected` / `readOnly` / `ownerOnly` flag for framework-owned or core settings that must not be disabled, overridden, or edited except by the framework or an owner.
  - [ ] the standard filter axes (`requiredPermissions`, `requiredWorkspaceCapabilities`, `requiresEnabledModules`/`requiredModules`).
  - [ ] an optional handler/runner and on-change effect **string ID** (never a function).
  - [ ] the field metadata: `id`, `label`, `type` (boolean/toggle, text, number, select, multi-select, radio, and info for display-only), `options`, `min/max/step`, `default`, `description`, `readOnly`.
- [ ] Add `validateSettingsContributions(...)` to the manifest validation sequence and to `ACTIVE_MANIFEST_FIELDS`; keep contributions data-only (no functions in manifests — the `hooks` exception does not apply here).
- [ ] Validate the protected boundary: a module contribution cannot set `target: framework`, mark a setting `protected`, or reuse/override a framework-owned or protected setting id — only framework-registered settings may target the framework or be protected. Reject at manifest-validation time.
- [ ] Add `modulesService.listSettingsContributions(workspaceId, session)` as a thin wrapper over `listWorkspaceContributions(...)`, inheriting the four filters and terminology resolution for free.
- [ ] Keep contribution listing separate from value read/write so the catalog is permission-safe without executing setting code.
- [ ] Update `docs/module-contract.md` with the finalized settings contribution shape.

Acceptance criteria:

- A module can declare a setting and its attachment point declaratively, with permission/capability/enabled-module filtering applied by the shared helper.
- Contribution validation is data-only and documented.

### Version 0.33.15.4 - Settings renderer: sections, value binding, and validation

Purpose: Render settings from a descriptor by consuming the 0.33.14 field-factory primitive, adding only the settings-specific layer the primitive does not own.

- [ ] Consume the 0.33.14 exported field-factory primitive and its editable, value-bound field grid for all settings fields; do not build field DOM in settings code and do not re-implement field types here.
- [ ] Add the framework settings-section/fieldset host that groups a contribution's fields under a titled section with a save action, built on framework view primitives.
- [ ] Wire the primitive's value-collection into the `PUT /api/settings` `moduleSettings` save payload.
- [ ] Add dependent-setting visibility (`visibleWhen`) so a setting can gate another (for example a rounding-increment select shown only when rounding is on).
- [ ] Surface per-setting validation errors through the primitive's error channel, with each module owning its validation and allowed values.
- [ ] Retire the raw-`document.createElement` `settingsControls`/`settingsNormalizers` path in favor of the primitive/descriptor.
- [ ] Add regressions for settings-section rendering, save-payload binding, dependent visibility, and validation surfacing.

Acceptance criteria:

- Settings sections render from a descriptor via the 0.33.14 primitive with no hand-built DOM, and save through `PUT /api/settings`.
- The parallel raw-DOM settings renderer is gone; settings use framework `.view-*` anatomy.

### Version 0.33.15.5 - Framework settings host, catalog route, and attachment points

Purpose: Assemble contributed settings into framework-owned hosts at declared attachment points.

- [ ] Add a framework settings catalog route (for example `GET /api/settings/catalog`) returning the permission/capability/enabled-filtered settings contributions grouped by attachment point, with field metadata and default values (mirroring the reporting catalog route).
- [ ] Define the framework-owned attachment points and replace the implicit `[data-module-settings]` (workspace), `[data-module-settings-fields]` (module page), and `[data-new-workspace-module-settings]` (new workspace) anchors with declared placement targets.
- [ ] Reduce the settings protected views (`workspace-settings.html`, `user-settings.html`, module settings pages) to minimal framework hosts that load the settings renderer and place contributed sections by attachment point.
- [ ] Keep framework-owned settings (workspace identity, audit, ops) rendered through the same host path.
- [ ] Add static/browser regressions proving the settings pages are minimal hosts and that contributed sections appear only where permitted.

Acceptance criteria:

- Contributed settings render into the correct framework-owned attachment point, permission-filtered.
- Settings pages are minimal framework hosts, not hand-built forms.

### Version 0.33.15.6 - Migrate hardcoded module settings and decouple the framework settings service

Purpose: Move the baked-in module settings to their owning modules and remove module-specific knowledge from framework settings code.

- [ ] Migrate billing rate, billing period, billing rounding, and fiscal year to time-tracking / client-projects settings contributions; keep the values flowing to the billing/reporting/client-projects consumers through a module-owned accessor rather than a framework `workspace_settings` column read.
- [ ] Migrate `taskTimersEnabled` and task reminder defaults to the tasks module, removing the `settings.service.js` import of the tasks reminders service and the tasks-specific bridging/stripping.
- [ ] Migrate file type policy and storage limits to files-owned settings contributions; evaluate secure-notes key policy and storage/scanner config for workspace-configurable settings vs install-level config.
- [ ] Remove module-specific branches from `normalizeSettings` and the hardcoded name lists (`publicSettingsPayload`, `rejectLegacyModuleSettingAliases`) as their settings move to the contract.
- [ ] Add a grep/regression guardrail asserting `src/services/settings.service.js` and `src/utils/normalizers.js` do not import a specific module service or hardcode a module setting id (mirroring the reporting.service.js decoupling guardrail).
- [ ] Preserve every migrated setting's meaning, default, and stored value; add backward-compatible read shims where a consumer still expects the old shape until it is updated.

Acceptance criteria:

- No module-conceptual setting remains defined, normalized, or stored in framework settings code.
- The framework settings service imports no specific module service and hardcodes no module setting id, proven by a guardrail.
- Migrated settings keep their values and behavior.

### Version 0.33.15.7 - De-hardcode the permission resource catalog

Purpose: Render the permission matrix from module-contributed resources instead of a hardcoded list.

- [ ] Replace the hardcoded `PERMISSION_RESOURCES` array in `public/js/user-admin.js` with the module-contributed `resourceDefinitions` already provided by modules, filtered by enabled modules and permissions.
- [ ] Ensure adding or disabling a module changes the permission matrix without editing framework user-admin code.
- [ ] Keep record-level permission checks and role-assignment behavior unchanged.
- [ ] Add regressions: the matrix reflects contributed resources, and a disabled module's resources drop out.

Acceptance criteria:

- The permission matrix is built from contributed `resourceDefinitions`, not a framework-hardcoded list.

### Version 0.33.15.8 - Guardrails, docs, and closeout

Purpose: Lock in the de-hardcoding and document the settings contract.

- [ ] Add guardrails: no new framework-hardcoded setting (settings must come through the contribution contract), settings pages remain minimal hosts, no raw `document.createElement` for framework-owned settings anatomy, no first-party module/setting id special-casing in the host, and a module contribution cannot disable, override, weaken, or target a protected framework setting or capability.
- [ ] Inventory every generalized Settings facility at closeout and name the real modules/settings that consume it; document an intrinsically framework-wide exception explicitly instead of inventing a second consumer.
- [ ] Update `docs/module-contract.md` (settings contribution), `docs/declarative-view-surfaces.md` (move settings surfaces out of "reported" into converted), `docs/settings-control-matrix.md`, and `docs/view-building-contract.md`.
- [ ] Update `DECISIONS.md`, `CHANGELOG.md`, package metadata, and the roadmap archive; confirm `/api/app-info` after implementation.
- [ ] Run `npm run check`, `npm run test:permissions`, and the settings/declarative-surface regressions.

Acceptance criteria:

- A new module setting requires only a manifest contribution (plus an optional registered handler for side effects), with no framework edit.
- Settings surfaces are documented as framework-owned converted hosts, and the release-gate checks pass.

## Version 0.33.16 - Internet-Exposure Security Hardening

Purpose:

Establish the **minimum supported private internet preview posture** for Longtail Forge on its own domain or subdomain behind one documented TLS reverse proxy. The Node process binds to loopback or a protected private interface; the proxy is the public edge; and the Longtail Forge login page is the authentication gate. Cloudflare Access, HTTP Basic Authentication, a VPN, or another external gate may be added by an operator, but the supported posture must not rely on a second password screen.

This is friends-and-family/private-preview hardening, not enterprise certification and not a promise that any internet deployment is perfectly safe. Packaging, Docker, backup/restore, CI, and release operations follow in 0.33.17. The former in-app self-updater is explicitly removed from this branch and deferred for re-evaluation at 0.39.12.

Dependencies and sequencing:

- Builds on the existing auth/session/audit primitives (`src/security/passwords.js`, `src/security/sessions.js`, `src/services/auth.service.js`, `src/services/audit.service.js`) and the framework-owned session-expiry modal from 0.33.11.6; harden them rather than replace cookie/session authentication.
- Uses the active runtime-configuration contract in `.env.example` and `docs/runtime-configuration.md`; unsupported unsafe production combinations must fail startup or require an unmistakable explicit override.
- Security controls here are intrinsically framework-wide exceptions to the Two-Module Rule.
- Backup/restore security and incident recovery depend on the baseline implementation in 0.33.17; PostgreSQL, shared hosted SaaS, TOTP, passkeys, risk scoring, and richer device history remain later work.

Key decisions:

- Internet-exposure hardening lands before private-preview packaging and invitations. The app must not rely on an external access gate, but it remains behind a real trusted TLS reverse proxy rather than exposing the Node listener directly.
- Client IP, protocol, and host are trusted from proxy headers only behind a configured trusted proxy; every IP-keyed control (login throttling, audit, security logging) consumes one shared trusted-client-IP helper rather than reading `X-Forwarded-For` ad hoc.
- Cookie, CSRF, browser-header, throttling, session-revocation, password, logging, and production-config controls are centralized and tested at the framework boundary.
- Security logs are structured and safe; health/readiness output is useful to operators without exposing secrets or internal paths.
- One Caddy or Nginx reference deployment becomes the supported proof path before several equally official variants are offered.

Non-goals:

- Do not package or deploy the app in this branch; that is 0.33.17.
- Do not add GitHub release checking, update-available UI, artifact download, checksum application, self-replacement, in-app migration/restart orchestration, automatic rollback, air-gapped in-app upload, or updater configuration/kill switches. Those ideas are deferred to 0.39.12 for evidence-based re-evaluation.
- Do not claim external penetration testing, enterprise certification, compliance, or perfect internet safety unless independently completed and documented.
- Do not replace the existing session/cookie auth model with a new token/OAuth/SSO/passwordless system in this version; the security work is hardening, not a re-architecture.
- Do not build a full WAF, IDS, or external SIEM integration; security event logging is the in-app audit stream, not a third-party pipeline.
- Do not add an email/notification transport in this version; the app has none today, so token-based self-service ("forgot password") reset is deferred to a future version and the already-shipped admin reset (Settings -> Workspace -> User Admin) is hardened as the supported recovery path.
- Do not weaken existing permission, workspace, private/secure-content, or audit guardrails to add these controls.

### Version 0.33.16.1 - Trusted reverse-proxy and secure-edge request handling

**Model: High Effort** — Getting proxy trust wrong either lets clients spoof their source IP (defeating throttling, audit, and security logging) or breaks Secure-cookie/HTTPS behavior behind TLS termination; both are security-critical and subtle.

Purpose:

Make the app safe to run behind a trusted reverse proxy on the public internet so that client IP, protocol, and host are derived from proxy headers only when the immediate peer is a configured trusted proxy, and never from arbitrary client-supplied headers. Today `readRequestIpAddress` in `src/routes/auth.routes.js` takes the first `X-Forwarded-For` value unconditionally, so a direct client can forge it; every downstream control that keys on IP (throttling, audit, security logging) inherits that spoofability.

- [ ] Add explicit trusted-proxy configuration (for example `config.security.trustedProxies`): a list/CIDR set of proxy addresses or a hop count, plus an off-by-default "direct exposure / no proxy" mode.
- [ ] Configure the framework's proxy trust (Express `trust proxy`) from that config instead of leaving it at the default, so `request.ip`, `request.protocol`, and `request.hostname` reflect the real client only when the peer is trusted.
- [ ] Replace the ad-hoc `X-Forwarded-For` parsing with a single shared request-context helper that:
  - [ ] returns the framework-resolved client IP when a trusted proxy is configured,
  - [ ] falls back to the socket peer address when no proxy is trusted,
  - [ ] never honors `X-Forwarded-*` from an untrusted peer.
- [ ] Route every IP consumer (login context, audit `ipAddress`, session `ip_address`, and the throttling/security-logging slices below) through that one helper.
- [ ] Honor `X-Forwarded-Proto` for Secure-cookie and HTTPS assumptions only behind a trusted proxy, and ensure session/theme cookies are marked `Secure` when the effective protocol is HTTPS.
- [ ] Document the reference deployment (single Node process behind one TLS-terminating reverse proxy) and the exact headers the proxy must set and strip.
- [ ] Add focused regressions:
  - [ ] a forged `X-Forwarded-For` from an untrusted peer is ignored (resolved IP is the socket peer).
  - [ ] a forwarded IP from a configured trusted proxy is honored.
  - [ ] direct-exposure mode never trusts forwarded headers.
  - [ ] Secure cookies are set when the effective protocol is HTTPS behind the proxy.

Acceptance criteria:

- Client IP, protocol, and host are trusted from proxy headers only when the peer is a configured trusted proxy; otherwise the socket peer is used.
- A single shared helper is the only source of client IP, and throttling, audit, and security logging all consume it.
- Direct internet exposure without a proxy cannot be tricked into trusting forwarded headers.

### Version 0.33.16.2 - TLS and cookie posture

**Model: High Effort** — Public URL, proxy protocol resolution, and cookie attributes are one authentication boundary; unsafe combinations can silently leak sessions.

- [ ] Make HTTPS the expected supported public-internet posture and derive Secure-cookie behavior from the trusted effective protocol established in 0.33.16.1.
- [ ] Keep session cookies `HttpOnly`; choose and document a deliberate `SameSite` policy plus explicit path/domain behavior.
- [ ] If production declares an HTTP public URL, fail startup unless an unmistakable unsafe-development override is set; do not silently assume the proxy will correct an insecure application declaration.
- [ ] Enable HSTS only after HTTPS and trusted proxy resolution are verified consistently; document rollout and rollback considerations.
- [ ] Add regressions for direct HTTP, trusted forwarded HTTPS, forged forwarded protocol, cookie attributes, unsafe production URL rejection, and HSTS gating.

Acceptance criteria:

- Public-preview production configuration cannot silently run with insecure public URL/cookie assumptions.
- Cookie and HSTS decisions use one trusted effective-protocol source and are covered at direct-peer and proxy edges.

### Version 0.33.16.3 - Login and sensitive-endpoint throttling

**Model: High Effort** — Throttling sits directly on the login/auth path; a mistake either locks out real users or leaves brute-forcing open, and it must key on the trusted IP established in 0.33.16.1.

Purpose:

Protect the public login surface from credential brute-forcing and account enumeration once the app is reachable on the internet. `authService.login` currently performs unlimited constant-cost attempts and returns a generic 401 with no per-IP or per-account backoff. This slice adds throttling keyed on the trusted client IP (0.33.16.1) and on the submitted account, without revealing which accounts exist.

- [ ] Add an authentication throttle that tracks recent failed attempts per client IP and per targeted username, with a configurable window, threshold, and lockout/backoff duration.
- [ ] Apply progressive backoff or temporary lockout after repeated failures, and reset the counter on a successful authentication.
- [ ] Key throttling on the trusted client IP from the 0.33.16.1 helper, never on raw `X-Forwarded-For`.
- [ ] Keep responses non-enumerating: throttled and invalid-credential responses must not reveal whether the account exists, and timing should stay uniform.
- [ ] Return a framework `AppError` with the correct status (for example 429) and a "too many attempts, try again later" message consistent with the existing error envelope.
- [ ] Cover self-service password verification/change, admin reset, any future reset-token redemption, and other credential-checking endpoints consistently; assess API-key and public-intake limits where those surfaces exist.
- [ ] Emit a security event on lockout/threshold breach without logging credentials.
- [ ] Make limits configurable and disable-able for trusted internal/offline deployments, with safe internet-facing defaults.
- [ ] Add focused regressions:
  - [ ] repeated failures from one IP are throttled and then locked out for the window.
  - [ ] repeated failures against one username are throttled across IPs.
  - [ ] a successful login resets the counter.
  - [ ] throttled and invalid responses are indistinguishable with respect to account existence.

Acceptance criteria:

- Repeated failed logins are throttled/locked out per IP and per account with configurable, internet-safe defaults.
- Throttling keys on the trusted client IP and cannot be bypassed by forged headers.
- Responses never reveal account existence, and lockouts emit a security event.

### Version 0.33.16.4 - CSRF and state-changing browser request protection

**Model: High Effort** — Central cookie-authenticated write protection touches every browser mutation and must preserve legitimate same-origin workflows without route-by-route drift.

- [ ] Define and centralize the CSRF policy for cookie-authenticated browser requests.
- [ ] Validate `Origin` on state-changing requests where appropriate; define a constrained `Referer` fallback rather than treating it as an unconditional substitute.
- [ ] Add CSRF tokens for flows where origin enforcement alone is insufficient. `SameSite` cookies are defense in depth, not the whole strategy.
- [ ] Reject unsupported content types on JSON/state-changing API routes and protect login-sensitive, logout, and other state-change behavior consistently.
- [ ] Add regressions for accepted same-origin writes, rejected cross-origin writes, missing/invalid required tokens, forged headers, and unsupported content types.

Acceptance criteria:

- Cookie-authenticated mutations pass through one documented CSRF boundary; unsupported cross-origin and content-type combinations fail closed.

### Version 0.33.16.5 - Browser security headers and CSP rollout

**Model: High Effort** — CSP and cache/header policy can either leave browser attack surface open or silently break the current inline/global frontend if enforced without an inventory.

- [ ] Inventory current inline script/style and asset-loading requirements, then define Content-Security-Policy in report-only mode where a migration period is required and schedule enforcement explicitly.
- [ ] Define `frame-ancestors` and compatible anti-framing behavior, `X-Content-Type-Options: nosniff`, `Referrer-Policy`, and `Permissions-Policy`.
- [ ] Add HSTS only after 0.33.16.2 verifies consistent HTTPS, and set safe non-cache behavior for authenticated/private responses where necessary.
- [ ] Keep the policy compatible with the current app; use the 0.33.18 ES-module direction to reduce future CSP exceptions rather than shipping a CSP that breaks the UI.
- [ ] Add header regressions plus a rendered smoke through the reference proxy proving critical login and authenticated journeys still load.

Acceptance criteria:

- The browser-header policy is explicit, tested, and deployable without silently breaking current rendered behavior; CSP has a documented report-only-to-enforcement path.

### Version 0.33.16.6 - Session revocation and forced logout

**Model: High Effort** — Session lifecycle is the core of "do not leak data"; revocation must be complete and immediate, and it interacts with password change, reset, deactivation, and rehash.

Purpose:

Give owners/admins and the auth flows a reliable way to revoke sessions and force logout, so a compromised or stale session can be killed immediately. Sessions live in the `sessions` table via `sessionsRepository` and are only removed today on explicit logout or lazy expiry; changing a password or deactivating a user does not currently invalidate that user's other live sessions.

- [ ] Add session-revocation service/repository methods:
  - [ ] revoke a single session by id,
  - [ ] revoke all sessions for a user ("log out everywhere"),
  - [ ] revoke all of a user's sessions except the current one.
- [ ] Force logout on security-relevant events:
  - [ ] on self-service password change (`authService.changePassword`), revoke the user's other sessions,
  - [ ] on admin password reset (0.33.16.7), revoke all of the target user's sessions,
  - [ ] on user deactivation / status change to inactive, revoke all of that user's sessions,
  - [ ] on password-hash upgrade/rehash where a deployment requires it (0.33.16.9).
- [ ] Surface an owner/admin action to view and revoke a user's active sessions, gated behind the existing permission/role checks; never expose it to ordinary users or across workspace boundaries.
- [ ] Optionally let a user list and revoke their own active sessions from user settings.
- [ ] Ensure a revoked session id is rejected on the very next request through the existing `getRequestSession` path, and that the framework-owned session-expiry modal (0.33.11.6) surfaces the forced logout cleanly rather than a console-only failure.
- [ ] Emit a security event for each revocation for 0.33.16.8.
- [ ] Add focused regressions:
  - [ ] revoking a session rejects its next request.
  - [ ] "log out everywhere" invalidates all of a user's sessions.
  - [ ] changing or resetting a password invalidates other sessions.
  - [ ] deactivating a user invalidates their sessions.
  - [ ] revocation respects permission and workspace boundaries.

Acceptance criteria:

- Individual and bulk session revocation exist and take effect on the next request.
- Password change, admin reset, and deactivation force logout of the affected sessions.
- Revocation is permission-gated, workspace-safe, and emits security events.

### Version 0.33.16.7 - Password reset hardening

**Model: High Effort** — Password reset is a classic account-takeover vector; the existing admin reset already changes credentials but does not currently invalidate the target's live sessions, so tightening it must be exact about revocation and forced re-login.

Purpose:

Harden the reset paths that already exist rather than build a new one. Admin-initiated reset is already shipped: Settings -> Workspace -> User Admin exposes a reset action backed by `usersService.resetPassword` ([src/services/users.service.js](src/services/users.service.js)), which is gated behind `users.manage`, generates a new credential with `createGeneratedPassword`, updates the stored hash, surfaces the generated password once to the admin, and audits `user_password_reset`. Self-service `changePassword` (which requires the current password) also exists. The gap for an internet launch is that neither path revokes the target user's other live sessions, forces a re-login, or feeds the security event stream — and there is no self-service recovery for a genuinely locked-out user, because the app has no email/notification transport today.

- [ ] Harden the existing admin reset (`usersService.resetPassword`):
  - [ ] on reset, revoke all of the target user's sessions (0.33.16.6) so an attacker who holds a live session is kicked out immediately,
  - [ ] require a password change on next login for the target where practical, so the one-time generated credential cannot linger as a permanent password,
  - [ ] keep the generated credential surfaced once to the admin and confirm it is never written to logs in plaintext,
  - [ ] emit a dedicated security event on reset (0.33.16.8) in addition to the existing `user_password_reset` audit record.
- [ ] Harden self-service `changePassword` to revoke the user's other sessions on success (shared with 0.33.16.6) and emit a security event.
- [ ] Apply the 0.33.16.3 throttle to reset/change endpoints so they cannot be hammered.
- [ ] Confirm the reset flow stays workspace-scoped and permission-safe, and that a reset cannot target a user the admin has no `users.manage` authority over.
- [ ] Token-based self-service reset is explicitly deferred: the app has no email/notification transport, so a forgot-password email/token flow is out of scope for this version. Record it as a future extension gated on a delivery channel, and — when built — require a single-use, time-limited, hashed-at-rest token delivered out-of-band, a non-enumerating "if an account exists, a reset was sent" response, throttling, and forced logout on redemption. Until then, admin reset is the supported recovery path.
- [ ] Add focused regressions:
  - [ ] admin reset sets a new credential, revokes the target's sessions, and stays `users.manage`-gated and workspace-scoped.
  - [ ] a reset/self-change forces logout of the affected sessions on the next request.
  - [ ] the generated credential is never present in logs.
  - [ ] reset/change endpoints are throttled and emit security events.

Acceptance criteria:

- The existing admin reset and self-service change both revoke the affected user's other sessions and emit security events.
- Admin reset stays permission-gated and workspace-scoped, and the one-time credential is surfaced once and never logged.
- Token-based self-service reset is documented as deferred until a delivery channel exists, with admin reset as the supported recovery path.

### Version 0.33.16.8 - Security event logging and retention

**Model: High Effort** — This is the audit backbone for an internet-exposed install; it must capture the right events without recording secrets and stay permission-safe.

Purpose:

Give an internet-exposed install a clear, queryable record of security-relevant events. `auditService.record` already logs successful login/logout and password change with actor, IP, and metadata, but failed logins never reach it (login throws before the audit call), and there is no consolidated security view. This slice formalizes a security event stream on top of the existing audit primitives and ensures the earlier slices feed it.

- [ ] Define a security-event category (a dedicated record/change type or a severity tag on `auditService`) covering:
  - [ ] failed and successful logins, including the reason class (bad credentials, inactive user, throttled/locked out),
  - [ ] throttle/lockout triggers (0.33.16.3),
  - [ ] session revocations and forced logouts (0.33.16.6),
  - [ ] password change and admin password reset (0.33.16.7),
  - [ ] password-hash upgrades/rehash (0.33.16.9),
  - [ ] permission-denied / authorization failures on protected routes where practical.
- [ ] Record actor (or attempted username), trusted client IP (0.33.16.1), timestamp, event type, outcome, and safe metadata; never record passwords, tokens, session ids, or hashes.
- [ ] Add a failed-login audit path so authentication failures are recorded, without leaking account existence in the record's user-facing surfaces.
- [ ] Surface a security-event view to owners/admins, permission-gated and workspace-scoped, reusing the existing audit query/filtering surface where possible.
- [ ] Keep security logging resilient: a logging failure must never block or crash the auth path.
- [ ] Define configurable retention, restrict the security view to appropriately authorized users, and preserve workspace scope for workspace-specific events.
- [ ] Include successful login, user deactivation, security-sensitive configuration changes, and important authorization failures where practical.
- [ ] Add focused regressions:
  - [ ] a failed login produces a security event with no secret material.
  - [ ] lockout, revocation, and reset events are recorded.
  - [ ] the security view is owner/admin-only and workspace-scoped.
  - [ ] logging failures do not break authentication.

Acceptance criteria:

- Security-relevant auth/session/reset events are recorded via a consolidated security event stream.
- Records carry actor/IP/outcome and never contain secrets.
- The security view is permission-gated and workspace-safe, and logging never blocks auth.

### Version 0.33.16.9 - Password hashing modernization

**Model: High Effort** — Changing the credential-at-rest format risks locking users out or silently weakening hashing; it needs algorithm agility and transparent migration.

Purpose:

Strengthen credential-at-rest and make the hashing scheme upgradeable. `src/security/passwords.js` uses PBKDF2-HMAC-SHA256 at 310000 iterations with a tagged format (`pbkdf2_sha256$iterations$salt$hash`), which already supports algorithm agility. This slice raises the work factor and/or moves to a memory-hard algorithm and migrates existing hashes transparently on next login, without forcing a mass reset.

- [ ] Prefer an asynchronous memory-hard algorithm such as Argon2id or scrypt after evaluating Node 24, native/package, Docker, bare-metal, CPU, memory, and denial-of-service constraints; keep `verifyPassword` able to read legacy tagged `pbkdf2_sha256$...` hashes.
- [ ] Add transparent rehash-on-verify: when a user authenticates and their stored hash uses an outdated algorithm/parameters, re-hash with the current scheme and update the stored value.
- [ ] Keep `hashPassword`/`verifyPassword` the single choke point, and ensure all callers (`login`, `changePassword`, admin reset, seeding) go through it.
- [ ] Permit an optional server-side pepper only with documented backup, rotation, and recovery policy; do not add one casually or make it an undocumented lockout dependency.
- [ ] Preserve constant-time verification (`timingSafeEqual`) and confirm no plaintext or hash is ever logged (ties into 0.33.16.8).
- [ ] Optionally tighten `validatePassword` (length/complexity) for internet exposure without invalidating existing valid credentials.
- [ ] Store algorithm and parameter-version information and coordinate with 0.33.16.6 when a deployment deliberately requires re-authentication.
- [ ] Add focused regressions:
  - [ ] a legacy PBKDF2 hash still verifies.
  - [ ] a legacy hash is transparently upgraded on successful login.
  - [ ] a newly created, changed, or reset password uses the hardened scheme.
  - [ ] verification stays constant-time and never logs secrets.

Acceptance criteria:

- New and changed passwords use a hardened, current hashing scheme with a raised work factor.
- Existing hashes verify and are transparently upgraded on next login without a mass reset.
- Hashing stays behind one choke point, constant-time, secret-free in logs, and upgrade-ready.

### Version 0.33.16.10 - Production configuration that fails closed

**Model: High Effort** — Startup policy governs credentials, secrets, encrypted data, uploads, and response disclosure; an unsafe default can compromise the whole installation.

- [ ] Review and harden public URL, HTTPS expectation, secure-cookie mode, trusted proxies, session-secret quality/rotation expectations, bootstrap credentials, Secure Notes key readiness, upload/scanner posture, data-directory permissions, debug mode, error-detail exposure, CORS where applicable, and request/upload limits.
- [ ] Production must not silently generate or expose a reusable default super-admin credential.
- [ ] Secure Notes must not appear safely usable when its external master key is missing.
- [ ] Public/client uploads fail closed, remain disabled, or emit an unmistakable deployment-blocking warning when required scanning/quarantine safeguards are unavailable.
- [ ] Browser responses never receive debug stack traces or sensitive internals. Unsupported unsafe combinations fail startup or require an explicit narrowly named override.
- [ ] Add a configuration matrix regression covering safe defaults, each rejected combination, explicit development overrides, and redacted diagnostics.

Acceptance criteria:

- A public-preview production process cannot start silently with default credentials, missing required secrets, insecure public URL/cookies, misleading Secure Notes readiness, unsafe upload posture, or debug disclosure.

### Version 0.33.16.11 - Operational security basics

**Model: High Effort** — Production observability, health reporting, and security-response contracts cross authentication, runtime, and deployment boundaries.

- [ ] Add structured JSON production logging and per-request correlation/request IDs without exposing secrets or private content.
- [ ] Add `/healthz` for process/basic health and `/readyz` for database, migration, and worker readiness; keep both outputs minimal and secret-free.
- [ ] Plan and document dependency-update automation, dependency vulnerability scanning, code scanning, and secret-scanning/push-protection guidance without claiming that a scan proves security.
- [ ] Add `SECURITY.md` with a private vulnerability-reporting path and document a minimum private-preview incident-response procedure.
- [ ] Cross-reference backup/restore security in 0.33.17 and require a manual security review/checklist before friends-and-family invitations.
- [ ] Add focused checks for JSON log shape/redaction, request-ID propagation, safe health responses, readiness failure, and security-reporting documentation.

Acceptance criteria:

- Operators can collect correlated production logs, distinguish health from readiness, report vulnerabilities privately, and follow a minimum incident-response checklist without receiving secrets from health or log output.

### Version 0.33.16.12 - Reference internet deployment and security closeout

**Model: High Effort** — The first supported internet topology must prove that application controls and reverse-proxy behavior agree in a real deployment.

- [ ] Select and document one tested Caddy or Nginx reference path before presenting alternatives as equally supported.
- [ ] Document DNS, TLS termination, Node binding to loopback or a protected private interface, required public ports, inbound proxy-header stripping/setting, environment/secrets permissions, database/data-volume permissions, log handling, backup location, manual upgrade procedure, health/readiness checks, and emergency session revocation/account disablement.
- [ ] State the supported private-preview scale: SQLite, one application server, roughly 50 total users, and typical active use around 5-15 concurrent users; do not imply hosted-SaaS or enterprise scale.
- [ ] Run focused auth/session/security, permission, workspace-isolation, CSRF, security-header, trusted-peer, forged-header, password compatibility, and end-to-end login/session regressions.
- [ ] Run the full `npm run check` gate and a manual review through the reference TLS reverse proxy.
- [ ] Publish known limitations and never claim external penetration testing, certification, or perfect internet safety unless that work actually occurred.

Acceptance criteria:

- The minimum supported private internet preview posture is documented and exercised through the reference proxy.
- Security closeout proves the focused and full gates, workspace boundaries, and known limitations without relying on a second authentication gate.

## Version 0.33.17 - Friends-and-Family Internet Preview, Packaging, Backup/Restore, CI, and Release Operations

**Model: High Effort** — This branch joins deployment, restore integrity, release artifacts, CI, and operational documentation into the minimum reproducible private-preview path.

Purpose:

Prepare a limited, explicitly labeled friends-and-family internet preview targeted for July 31, 2026 if and only if 0.33.16 security hardening, tested backup/restore, and deployment readiness are complete. The date is a target, not permission to skip controls or make unsupported uptime, security, backup, or compliance promises. SQLite remains supported for this one-server preview at roughly 50 total users and typical active use around 5-15 concurrent users; PostgreSQL remains required before shared hosted SaaS or larger production claims.

Decision:

- Docker is the primary reproducible preview/self-hosted path; a documented manual bare-metal path remains supported where practical.
- Initial upgrades are manual. There is no in-app self-modifying updater in this branch.
- Baseline Backup and Restore moves intentionally from former 0.38.4 into 0.33.17; 0.38.4 retains only advanced automation.
- Essential installation, operation, onboarding, backup, upgrade, and security-limitation documentation moves forward from 0.39.9.

The non-technical preview execution plan (participant profile, invitation copy, onboarding, five-minute first-use path, known-limitations and privacy templates, feedback, and closeout) is maintained in [docs/marketing/friends-and-family-preview.md](docs/marketing/friends-and-family-preview.md); the overall staging from private preview through hosted SaaS is in [docs/marketing/launch-plan.md](docs/marketing/launch-plan.md). Those plans consume this branch's readiness; they do not set its scope.

Non-goals:

- No hosted/SaaS deployment automation, PostgreSQL service profile before PostgreSQL exists, automatic customer-instance deployment, enterprise certification, or automatic updater.

### Version 0.33.17.1 - Runtime-only packaging boundary

**Model: Medium Effort** — The artifact boundary is well specified, but omissions must be proven in a clean environment.

- [ ] Define runtime versus development/test files while keeping `npm start` as `node server.js` unless the runtime contract changes deliberately.
- [ ] Keep runtime validation dependencies; exclude tests, regression tooling, development fixtures, local secrets, caches, live data, and unrelated planning documents.
- [ ] Produce a versioned runtime artifact and checksum, boot it in a clean environment, and prove it does not import development-only dependencies.
- [ ] Document the artifact inventory and the settled runtime install command.

Acceptance criteria:

- A checksummed, versioned, secret-free runtime artifact boots cleanly without repository-only development dependencies.

### Version 0.33.17.2 - Docker and manual bare-metal preview paths

**Model: High Effort** — Packaging must preserve SQLite durability, least privilege, health reporting, and recoverable manual upgrades.

- [ ] Add a Dockerfile and Docker Compose definition with persistent database/data/file volumes, environment-file handling, health checks, non-root runtime where practical, explicit host/port exposure, restart policy, backup paths, and SQLite-safe volume guidance.
- [ ] Do not add a PostgreSQL service profile until PostgreSQL is implemented. Add clean-build, clean-install, and clean-boot tests.
- [ ] Document the first supported Docker upgrade: verify backup, obtain new version, stop, replace image/artifact, start and run normal migrations, verify `/readyz` and app version, and manually restore the pre-upgrade backup if verification fails.
- [ ] Retain a manual bare-metal path using the versioned artifact, checksum verification, the settled `npm ci --omit=dev`-style runtime install command, a supervisor example, stop/backup/replace/start/verify, and manual rollback.
- [ ] Keep the Node process behind the 0.33.16 reference TLS proxy; do not expose it directly in the supported topology.

Acceptance criteria:

- A clean Docker deployment and the documented bare-metal path both persist data, report health/readiness, and complete a manual backup-first upgrade and rollback exercise.

### Version 0.33.17.3 - Baseline backup and restore, moved from 0.38.4

**Model: High Effort** — A backup is only valid when database, files, encryption prerequisites, compatibility, and destructive restore behavior are proven together.

- [ ] Define a versioned backup format containing the SQLite database or provider-appropriate dump, local uploaded/attached files, application version, schema/migration version, UTC timestamp, safe configuration inventory, storage-provider restore metadata, manifest, checksums, and an explicit inclusion/exclusion list.
- [ ] Do not silently place the Secure Notes master key in an ordinary plaintext archive. Require a separately protected operator key backup or separately encrypted operator-secret bundle.
- [ ] Warn and refuse to describe a backup as fully restorable when encrypted note data exists but its key-recovery prerequisite is absent.
- [ ] Prefer a CLI/operator path first. Keep archives outside public/static downloads with restrictive permissions and predictable cleanup; any later web-admin download must be super-admin-only, audited, non-cacheable, one-time or short-lived, and never available to an ordinary workspace administrator.
- [ ] Audit backup creation, download, and restore. Validate archive type, manifest, checksums, version compatibility, expected paths, traversal attempts, and unexpected files before restore.
- [ ] Require a stopped app or maintenance mode, a pre-restore backup, and explicit destructive confirmation; restore database and files consistently, verify `/readyz`, application version, and schema, and document failed-restore rollback.
- [ ] Perform an automated or scripted backup-to-restore drill in a disposable environment; “backup created” alone is not acceptance.

Acceptance criteria:

- A disposable installation can be backed up and restored consistently, including files and required encryption prerequisites, with malicious or incompatible archives rejected safely.

### Version 0.33.17.4 - Seeded development database and sanitized demo workspace

**Model: High Effort** — Deterministic data generation touches permissions and many product states and must never target live data.

- [ ] Keep automated test fixtures, a deterministic developer seed database, and a sanitized demo/preview workspace as three distinct contracts.
- [ ] Add convention-aligned development seed/reset commands that refuse apparent production/live databases and require an explicitly development-marked environment/data directory.
- [ ] Use deterministic fake data only; do not commit a generated live database, seed normal installs, use real client/family/financial/customer data, or create a shared production password.
- [ ] Seed development-only users across Business, Personal, and supported Family workspaces; meaningful roles; clients/projects; due, overdue, upcoming, blocked, recurring, completed, and undated tasks; checklists; next actions; resume context; work-resume state; active/paused/completed timers; manual time; Notes collections/links/tags/revisions/safe Markdown; reusable/active/finalized/partial Lists; harmless tiny Files fixtures; notifications/reminders; Search; Dashboard; and Workbench Focus Selection/Task Focus states.
- [ ] Commit no Secure Notes plaintext or key material. Give invited users individual accounts through the real workflow.
- [ ] Allow future Tickets, Knowledge Base, and Creator Studio seed builders to add their scenarios, but do not create a generalized seed registry until at least two real modules need the same extension contract under the Two-Module Rule.

The marketing screenshot and demo-data inventory that consumes this seed contract (safe fake scenarios, capture list, naming, and refresh process) is in [docs/marketing/screenshot-and-demo-data-plan.md](docs/marketing/screenshot-and-demo-data-plan.md).

Acceptance criteria:

- A developer can reproducibly seed and safely reset rich fake product data, while production-like targets, real data, shared preview credentials, and secret key material remain protected.

### Version 0.33.17.5 - GitHub Actions, releases, and solo-maintainer workflow

**Model: High Effort** — CI and release automation become repository gates and must avoid redundant cost or accidental deployment.

- [ ] Add clearly named pull-request/push jobs under `.github/workflows` using the supported Node major, clean checkout, `npm ci`, typecheck, Vitest/unit tests, ESLint, regression selection/full gates as appropriate, migration/schema checks, and documentation/closeout checks without redundantly running the enormous suite in multiple jobs.
- [ ] Add Playwright browser installation plus critical smoke and accessibility checks; document whether these run per PR, on main/nightly, or by manual dispatch and why.
- [ ] Plan and configure Dependabot/current GitHub dependency updates, CodeQL or equivalent code scanning, dependency review where supported, and secret-scanning/push-protection guidance without treating scan success as proof of security.
- [ ] Add an initially manual or manually dispatched release workflow that runs gates, builds runtime and supported Docker assets, produces checksums/version metadata, and attaches/publishes appropriate release assets; never deploy a private or customer instance automatically.
- [ ] Document a solo-maintainer ruleset: protected known-good `main`, short-lived branches, pull requests, required passing checks, resolved conversations, and no force-push/deletion. Do not require a second-human approval until contributors exist.
- [ ] Deliver `docs/development/github-workflow.md` in ordinary language covering main, branches, commits, pushes, pull requests, Actions, required checks, protection, tags, Releases, example commands and practical VS Code/GitHub UI flows, failed-CI recovery, merge/delete, hotfixes, and version/changelog release flow.
- [ ] Deliver or complete `docs/releasing.md`, `docs/self-hosting.md`, `docs/backup-and-restore.md`, and `docs/upgrading.md` as part of the relevant slices.

Acceptance criteria:

- A solo maintainer can use a protected PR-to-main flow, understand and recover from CI, and manually publish verified artifacts without needing another human approval or triggering deployment.

### Version 0.33.17.6 - Private-preview documentation and readiness

**Model: Medium Effort** — This is a precise documentation and operational-readiness closeout after the underlying controls exist.

- [ ] Publish installation/deployment, reverse-proxy/TLS, first-login/bootstrap, account creation, backup/restore, manual upgrade, known/security limitations, Secure Notes key, file scanning/upload, bug reporting, emergency shutdown/revocation, and feedback guidance.
- [ ] Label the program “private preview”; document the supported scale and avoid unsupported uptime, security, backup, or compliance promises.
- [ ] Require a tested restore, reference-proxy deployment review, unique invited accounts, feedback path, and operator readiness checklist before invitations.
- [ ] Keep 0.39.9 as comprehensive 0.3x documentation/stabilization, not the first time essential operator and user documentation exists.

Acceptance criteria:

- An invited user and operator can understand the preview’s setup, safe operation, limits, recovery, account flow, and feedback path before access is granted.

### Version 0.33.17.7 - Preview release closeout

**Model: High Effort** — Release readiness must combine packaging, restore, CI, security, and live deployment evidence.

- [ ] Run packaging/clean-boot checks, Docker and bare-metal upgrade/rollback exercises, the disposable restore drill, security and permission gates, `npm run closeout`, affected/full regression routing, and the full release gate.
- [ ] Verify `/healthz`, `/readyz`, and `/api/app-info` through the reference proxy and publish checksums, known limitations, and the completed readiness checklist.
- [ ] Do not invite users until all 0.33.16 and 0.33.17 acceptance criteria are met; move the target instead of weakening a gate.

Acceptance criteria:

- The private preview has reproducible artifacts, proven restore, supported manual upgrades, passing CI/release gates, complete essential documentation, and no unsupported claims.

## Version 0.33.18 - Post-Preview Maintainability and Architecture Cleanup

**Model: High Effort** — This branch reorganizes startup, manifests, frontend loading, and test ownership while preserving runtime behavior.

Purpose:

Reduce the most visible maintainability strain after preview readiness and settle patterns that Support Tickets can consume without coupling Tickets to unrelated framework invention.

### Version 0.33.18.1 - Startup maintenance classification and split

**Model: High Effort** — Startup ordering, repair idempotency, transactions, and provider neutrality carry data-integrity risk.

- [ ] Inventory every action currently coordinated through `src/db/index.js`, `src/db/migrations.js`, module synchronization, bootstrap, legacy repair, settings/workspace defaults, and worker readiness.
- [ ] Classify each action as every-boot coordination, one-time migration/versioned repair, first-install bootstrap, recurring lightweight check, explicit admin/CLI maintenance job, background job, or health/readiness assertion.
- [ ] Establish understandable startup coordination, migration execution, bootstrap, versioned repair, recurring-check, explicit-maintenance, readiness/schema-verification, and timing/logging ownership based on the real inventory; do not merely split one large file arbitrarily.
- [ ] Remove repeated full-table startup repair only when migration or explicit maintenance ownership is proven. Preserve transaction safety, idempotency, fresh installs, migration order, failure behavior, SQLite behavior, and provider-neutral seams.
- [ ] Add structured phase timings and focused order/failure tests. Do not mix PostgreSQL implementation into this cleanup unless a genuine provider-neutral seam requires adjustment.

Acceptance criteria:

- Every startup action has explicit lifecycle ownership, slow phases are visible, and tests prove order and failure behavior without changing fresh-install or current SQLite semantics.

### Version 0.33.18.2 - Digestible module-manifest composition pilot

**Model: High Effort** — High-volume source movement can silently alter contribution IDs, ordering, permissions, or startup validation.

- [ ] Keep one composed module definition exported to the registry and passing the same startup validator.
- [ ] Pilot concern-based source composition on at least two already-large first-party modules, using repository-conventional equivalents of `module.manifest.js`, `module.permissions.js`, `module.views.js`, `module.dashboard.js`, `module.workbench.js`, `module.events.js`, `module.notifications.js`, `module.api.js`, and `module.settings.js` only where each concern is substantial.
- [ ] Preserve module/contribution IDs, permissions, routes, runtime behavior, and registration order. Do not create empty boilerplate files for small modules or redesign the plugin loader.
- [ ] Document review thresholds and a complete example. Support Tickets, Knowledge Base, and Creator Studio use the proven composition pattern from their first implementation.

Acceptance criteria:

- Two large modules are easier to review while their composed manifests validate and behave identically; the pattern is documented without becoming mandatory boilerplate.

### Version 0.33.18.3 - First native browser ES-module conversion wave

**Model: High Effort** — Dashboard/Workbench loading, accessibility, and module-host boundaries are highly coupled and user-visible.

- [ ] Establish one explicit ES-module entry point per converted page and import conventions; select Dashboard, Workbench, or both from measured coupling/risk while they are materially changed.
- [ ] Preserve a temporary compatibility bridge for existing `LongtailForge`/`window` globals and prohibit new script-order global dependencies.
- [ ] Keep module-specific browser behavior and styling module-owned; framework hosts must consume contribution contracts instead of hard-coding module renderers.
- [ ] Split shared CSS source by framework anatomy and module ownership where useful while preserving practical release delivery, cache/versioning, CSP compatibility, accessibility, keyboard, responsive, and rendered behavior.
- [ ] Add entry-point loading, missing-import, behavior, accessibility, and keyboard regressions. Do not adopt a frontend framework or replace the renderer wholesale during 0.3x.

Acceptance criteria:

- The first strained surface loads through explicit imports with no new global-order dependency and no behavioral or accessibility regression.

### Version 0.33.18.4 - First formal test-suite streamlining review

**Model: High Effort** — Coverage retirement and suite budgeting require evidence across unit, integration, permission, database, and browser layers.

- [ ] Consume the regression runner timing output, report the slowest tests, and establish/review a suite-time budget.
- [ ] Identify duplicate coverage, obsolete historical checks, implementation-detail assertions, and overly broad setup; prefer fixture, isolation, selection, and setup improvements before deletion.
- [ ] Move pure functions, schema validation, and stable contract behavior toward Vitest where practical while retaining strong permission, workspace-isolation, database, migration, file-safety, and integration coverage and Playwright critical journeys/accessibility.
- [ ] Do not retire a regression because it is slow. Identify and demonstrate replacement coverage and record retirement evidence through the existing manifest/ratchet process.
- [ ] Keep the full release gate until replacement coverage is proven equivalent and update `docs/regression-suite.md` with the resulting policy and budget.

Acceptance criteria:

- The suite has a measured budget and evidence-backed consolidation plan; any retirement is traceable to equivalent coverage and no high-risk contract is weakened.

### Version 0.33.18.5 - Maintainability closeout

**Model: High Effort** — Closeout must prove source reorganization did not change runtime contracts.

- [ ] Update architecture, module-development, frontend, startup/database, and testing documentation to match the implemented boundaries.
- [ ] Name the two real consumers for every new generalized primitive or document the framework-wide exception.
- [ ] Run manifest/startup/loading focused tests, `npm run closeout`, affected regression routing, and the full release gates; compare runtime manifests and critical behavior before/after reorganization.

Acceptance criteria:

- Documentation matches the settled structures, the Two-Module Rule is evidenced, and no runtime behavior changed accidentally.

## Version 0.34 - Support Tickets Module

**Model: High Effort** — Tickets is a committed cross-module workflow with schema, permission, client-visibility, Files, API, and public-intake risk.

Purpose:

Ship Support Tickets as an official first-party Longtail Forge workflow module for the owner and invited users, not as a speculative vertical or market-gated product.

Decision:

- Tickets ships in the public core when complete and may be disableable per workspace where appropriate.
- Tickets integrates through existing contracts with Notes, Tasks, Time Tracking, Files, Search, Tags, Notifications, Workbench, and Reporting where appropriate, with a clean reviewed path into the later Knowledge Base module.
- Ticket ledger entries remain distinct from security audit records; internal notes remain distinct from client-visible replies.
- The module starts with the proven composed-manifest source pattern and native ES-module entry convention settled in 0.33.18.

Dependencies:

- 0.33.16 security hardening, 0.33.17 preview operations/seed foundations, and 0.33.18 manifest/frontend/testing conventions.

Non-goals:

- No email help desk, omnichannel support suite, automatic Knowledge Base publishing, or weakening of client/workspace/permission boundaries.

## Version 0.34.0 - Support Tickets Framework Contract

**Model: High Effort** — The ticket contract establishes schema, visibility, permissions, and contribution boundaries used by every later ticket slice.

* [ ] Add Support Tickets as a first-party workflow module.

  * [ ] Module ID should be `support-tickets`.
  * [ ] Tickets are workflow records, not framework/core records.
  * [ ] Tickets should use framework-owned services for users, workspaces, permissions, tags, search, notifications, audit logging, file attachments, events/hooks, API scopes, and module lifecycle.
  * [ ] Do not hard-code ticket behavior into framework-owned app shell, search, notification, file, or permission services.
  * [ ] Support Tickets should be disableable per workspace where appropriate.
  * [ ] Disabled ticket module should block new ticket writes while preserving historical reads if `historicalReadAccess` is enabled.
  * [ ] Compose the module source by substantial concern using the settled 0.33.18 pattern while exporting one validated runtime manifest; do not create empty boilerplate files.
  * [ ] Use the settled native ES-module browser entry pattern without adding new implicit global script-order dependencies.

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

## Version 0.34.1 - Ticket Browser API and Services

**Model: High Effort** — Service and route work must preserve ledger visibility, workspace isolation, and client-safe projections.

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

## Version 0.34.2 - Ticket UI MVP

**Model: High Effort** — The internal UI must make visibility distinctions obvious while preserving accessible, permission-safe behavior.

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
  * [ ] Client-facing ticket pages can be minimal in 0.34.x but the permission model must be real.

## Version 0.34.3 - Ticket Integration Hooks

**Model: High Effort** — Tickets touches many modules, but each integration must use registered contracts rather than direct coupling.

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

* [ ] Add Notes, Reporting, and future Knowledge Base integration seams.

  * [ ] Allow permitted internal users to link or create working Notes without making Notes content client-visible implicitly.
  * [ ] Expose permission-safe ticket reporting dimensions through Reporting contracts rather than direct table reads.
  * [ ] Leave explicit stable hooks for a later resolved-ticket or selected-entry Knowledge Base review candidate, article linking, and resolution-time suggestions; never auto-publish ticket content.

* [ ] Add manual task creation hook.

  * [ ] If Tasks is enabled, permitted users can create a task from a ticket.
  * [ ] The created task should link back to the source ticket.
  * [ ] This should be manual in 0.34.x.
  * [ ] Automatic task creation rules should wait for the automation/rules framework in 0.4x.

## Version 0.34.4 - Client Ticket Portal MVP

**Model: High Effort** — The client portal is an internet-facing permission boundary between internal and client-visible ticket content.

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

## Version 0.34.5 - Ticket Public API Groundwork

**Model: High Effort** — Public API scopes and intake validation create durable external contracts and abuse boundaries.

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
  * [ ] Avoid building WordPress/Shopify plugins in 0.34.x.

* [ ] Add API regression tests.

  * [ ] Missing/invalid API key is rejected.
  * [ ] Missing scope is rejected.
  * [ ] Disabled ticket module blocks writes.
  * [ ] API-created ticket belongs to the correct workspace.
  * [ ] API-created ticket cannot spoof another workspace/client/project.
  * [ ] Public API cannot create internal notes unless explicitly using an internal/admin scope.
  * [ ] Public API cannot read internal ledger entries.

## Version 0.34.6 - Ticket Regression, Polish, and Closeout

**Model: High Effort** — Closeout must prove isolation, public/client visibility, integrations, seed coverage, and replacement-test evidence together.

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
  * [ ] Produce current user, admin, and developer documentation at closeout rather than deferring it to 0.39.9.

* [ ] Add deterministic development-seed scenarios for internal and client-visible tickets, assignments, replies, internal notes, timers, tasks, Files, and permission boundaries through the 0.33.17 seed contract.

* [ ] Run a formal test-suite streamlining review.

  * [ ] Consume timing output, report the slowest ticket tests, and review the suite-time budget.
  * [ ] Retire nothing without demonstrated replacement coverage and recorded manifest/ratchet evidence.
  * [ ] Preserve strong workspace, permission, client/internal visibility, API, Files, and integration coverage even when pure contract checks move to Vitest.

* [ ] Release bookkeeping.

  * [ ] Update `DECISIONS.md` or product notes with ticket visibility and ledger decisions.
  * [ ] Update `CHANGELOG.md`.
  * [ ] Bump `package.json` and `package-lock.json`.
  * [ ] Run `npm run check`.
  * [ ] Run `npm run test:permissions`.
  * [ ] Run ticket-specific regression scripts.

## Version 0.35 - Knowledge Base Module

**Model: High Effort** — Knowledge Base introduces reviewed publication snapshots, permission-filtered sources, and client/public visibility boundaries.

## Knowledge Base Direction Adjustment

Decision:
Knowledge Base is the reviewed, read-only knowledge layer generated from Notes first. Notes remain the working authoring records. Knowledge Base entries may still be written directly, but the default workflow is note-sourced: normal internal/workspace/client-visible notes become KB review candidates automatically, then reviewers approve and publish safe read-only KB snapshots.

- Knowledge Base is an official first-party public-core module, may be disableable per workspace, and is not market- or funding-gated.
- It uses the 0.33.18 composed-manifest and native ES-module patterns from its first implementation.
- Because Tickets now lands first, the contract must leave reviewed, permission-safe paths to convert a resolved ticket or selected ticket entries into a KB review candidate, link a KB article to a ticket, and suggest KB material during resolution.
- Ticket integration must not weaken the Notes-first source model, bypass review, expose internal entries, or publish automatically.

### Version 0.35.1 - Knowledge Base Module Contract, Publishing Model, and Notes Relationship

**Model: High Effort** — The contract governs source revisions, publication immutability, secure-note exclusion, and future ticket linkage.

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

* [ ] Define future ticket-to-KB relationships without automatic publication.

  * [ ] A resolved ticket or selected permitted entries may seed a review candidate explicitly.
  * [ ] A ticket may link to an accessible KB article, and resolution workflows may suggest accessible articles.
  * [ ] Internal ticket entries, client-visible entries, and attachment visibility remain distinct and permission-filtered.
  * [ ] Notes remain the principal working-authoring source; ticket-derived material enters the same reviewed snapshot pipeline.

### Version 0.35.2 - Knowledge Base Browser API, Editorial Workflow, and Internal UI MVP

**Model: High Effort** — Editorial services and UI must make source drift visible without silently mutating published content.

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

### Version 0.35.3 - Knowledge Base Search, Tags, Attachments, Static Pages, and Permission Boundaries

**Model: High Effort** — Search, backlinks, Files, and publication views can leak inaccessible source information if projections are wrong.

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

### Version 0.35.4 - Knowledge Base Settings, Documentation, and Closeout

**Model: High Effort** — Closeout must prove settings cannot bypass review/security and that seeded, documented, measured coverage is complete.

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

* [ ] Add deterministic seeded examples covering source Notes, source-updated review, approved/published snapshots, rejected candidates, permission-filtered backlinks, and safe ticket-linked review candidates.
* [ ] Produce current user, admin, and developer documentation at closeout, including Notes-first authoring, review/publication, source drift, secure/private exclusions, and ticket-link limits.
* [ ] Run a formal test-suite streamlining review using timing output and the suite budget; retire no regression without demonstrated replacement coverage and manifest/ratchet evidence.
* [ ] Preserve strong secure/private-note, permission, workspace, publication-snapshot, backlink, Files, ticket-link, and browser accessibility coverage.

Acceptance criteria:

- Knowledge Base ships as a reviewed Notes-first module with immutable publication snapshots, safe optional ticket linkage, deterministic seed coverage, current documentation, and evidence-backed tests.

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

## Version 0.38.0 - Advanced User Account Security

This branch builds on the minimum private-preview controls from 0.33.16. It does not re-plan trusted proxies, baseline throttling, password modernization, session revocation, forced logout, password reset, or baseline security-event logging.

### Two Factor Authentication (TOTP) (2FA)

- [ ] Add optional 2FA for users. Can be turned on in the Settings -> User dialog
- [ ] Super admins should be able to turn on a setting that requires 2FA setup on next login for individual users
- [ ] Workspace admins can require users have 2FA to join workspace

### Version 0.38.1 - Passkeys

- [ ] Passkeys

### Version 0.38.2 - Richer Device and Session History

- [ ] Build on 0.33.16 session review/revocation with recognizable device, browser, location approximation, creation, last-used, and risk context.
- [ ] Review absolute and idle expiration policies using measured private-preview behavior; do not weaken next-request revocation.
- [ ] Add suspicious-session highlighting and user/admin history views without exposing raw session secrets or crossing workspace/admin scope.

## Version 0.38.3 - Advanced Login Monitoring and Risk Scoring

Extend the structured baseline security-event stream from 0.33.16 with login-specific enrichment, analytics, risk scoring, and suspicious-login notification. Do not introduce a second competing event log for events already captured by the baseline.

- [ ] Add a `user_login_events` projection/table only where advanced login analytics cannot use the baseline stream directly:
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
- [ ] Enrich baseline authentication events for advanced monitoring:
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

## Version 0.38.x - Advanced Security, Sessions, and Hosted Hardening

Add dependency note:

This branch depends on the runtime configuration contract from 0.33.5.19. Security-sensitive settings must be validated through `.env`/runtime config before public hosted SaaS launch.

Additional hosted/advanced work:

- [ ] TOTP/2FA, passkeys, richer device/session history, risk scoring, suspicious-login notifications, advanced retention/security analytics, and hosted incident-response requirements.
- [ ] Re-evaluate parameters and controls with real preview evidence while preserving the 0.33.16 baseline.
- [ ] Keep hosted provisioning, secret rotation, fleet policy, and managed operations private deployment concerns.

### Version 0.38.4 - Advanced Backup Automation and Retention

**Model: High Effort** — Automated retention and remote/encrypted destinations extend the proven 0.33.17 restore contract and can destroy recovery history if implemented incorrectly.

Baseline backup and restore moved intentionally to 0.33.17 and must not be implemented again here. This later phase may add only genuinely advanced capabilities:

- [ ] Scheduling and retention policies with protected minimum recovery points.
- [ ] Remote destinations and separately encrypted managed backups.
- [ ] Hosted backup orchestration and richer super-admin automation.
- [ ] Point-in-time recovery where the active provider supports it.
- [ ] Restore drills, retention deletion audit, and provider-specific recovery objectives built on the versioned 0.33.17 backup format.

Acceptance criteria:

- Advanced automation extends rather than competes with the baseline format, and scheduling/retention cannot silently delete the last valid recovery path.

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

**Model: High Effort** — Creator Studio is a committed multi-workflow first-party module spanning records, Files, Tasks, Notes, Calendar, permissions, and specialized work surfaces.

Purpose:

Ship an official first-party public-core module for the owner; YouTube creators; TikTok, Shorts, and Reels creators; bloggers and newsletter publishers; podcast/content workflows where appropriate; aspiring and working authors; businesses managing their own content; and agencies managing content for clients. It is not an external plugin or market-validation experiment and may be disabled for workspaces that do not need it.

Reference workflows:

1. Creator/video: Idea -> research/Notes -> script/draft -> filming/editing Tasks -> assets -> scheduled publication -> derivative Shorts/TikTok/social/newsletter items -> performance Notes.
2. Author: Book/story idea -> research/world/character Notes -> outline -> chapter or section drafts -> revision Tasks -> supporting assets -> submission/publication planning.

Decision:

- Use content-type-aware terminology and views; do not force authors into video-oriented language.
- Use the settled composed-manifest source pattern and native ES-module frontend entry points from the first implementation.
- Preserve module ownership for Ideas, Drafts, Campaigns/series, Channels, Assets, Repurposing, editorial planning, assignments/reviews, and creator-specific Workbench behavior while integrating through Tasks, Notes, Files, Search, Tags, Notifications, and Calendar contracts.

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

- [ ] Treat Creator Studio as a committed, disableable first-party public-core module.
  - [ ] The module should ship with Longtail Forge but be disabled by default for workspaces that do not need it.
  - [ ] It should follow the same module manifest, permissions, navigation, search, tags, notification, file, task, notes, and calendar contracts as every other first-party module.
  - [ ] Do not build it as a separate third-party plugin project.
  - [ ] Use it as a real-world test case for whether Longtail Forge modules can compose shared framework services cleanly.
  - [ ] Compose substantial manifest concerns through the proven 0.33.18 pattern while exporting one validated module definition.
  - [ ] Load module browser behavior through native ES-module entry points without new script-order globals.

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

- [ ] Define workbench areas as a framework concept only if the Two-Module Rule is satisfied by real materially similar consumers; otherwise keep Creator-specific workbench behavior module-owned.
  - [ ] Basic workbench for general first-party modules such as timers, tasks, notes, and lists.
  - [ ] Focused workbench for one client/project at a time.
  - [ ] Creator Studio workbench for content planning, drafting, assets, campaigns, repurposing, and editorial calendar work.
  - [ ] Future modules may declare their own workbench areas through the module manifest.

- [ ] Add deterministic safe seed scenarios for both the creator/video and author workflows, including assignments/reviews and representative Notes, Tasks, Files, channels, assets, derivatives, and publication planning.
- [ ] Produce current user, admin, and developer documentation at closeout, including content-type-aware terminology, workspace disablement, permissions, manifest/browser ownership, and both reference workflows.
- [ ] Run a formal test-suite streamlining review at closeout using timing output and the suite budget; retire no regression without demonstrated replacement coverage and manifest/ratchet evidence.

Acceptance criteria:

- Creator Studio supports creator and author workflows without terminology distortion, uses proven module/frontend patterns, remains workspace-disableable, and closes with safe seeds, current documentation, and evidence-backed coverage.

## Version 0.39.9 - User Documentation and 0.3x Stabilization Checkpoint

**Model: Medium Effort** — This is a comprehensive consolidation and gap-closure checkpoint over already documented shipped behavior.

Purpose:

Review, consolidate, and verify the complete 0.3x documentation and stabilization story. Essential installation, preview operation, backup, upgrade, onboarding, and security-limit documentation already ships in 0.33.17; this is not the first documentation pass.

- [ ] Review and consolidate user-facing documentation for the completed 0.3x feature set.
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
  - [ ] Support Tickets if completed in 0.34.x.
  - [ ] Notes and Knowledge Base if completed in 0.35.x.
  - [ ] Calendar basics if completed in 0.36.x.
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
- [ ] Close documentation gaps, refresh screenshots, audit terminology, verify cross-document links/claims, and reconcile current feature, operator, user, admin, and developer documentation.
- [ ] Run the 0.3x test-suite streamlining review: consume timing output, report slowest tests, review the budget, identify evidence-backed consolidation, and preserve permissions, workspace isolation, database/migration, Files, integration, and critical Playwright/accessibility coverage.
- [ ] Verify `ROADMAP.md`, `TODO.md`, `DECISIONS.md`, `CHANGELOG.md`, and package versions are consistent.

- [x] Wipe existing DB migrations and create a new DB baseline  -  Completed in 0.33.5.18.6.5.4.

- [x] Evaluate all existing regressions and see what can be eliminated/lightened  -  Completed in 0.33.5.18.6.5.4 without removing coverage from the standard release gate.

- [x] Determine where efficiencies can be made in the code/Perform an efficiency refactor  -  Initial regression/database efficiency pass completed in 0.33.5.18.6.5.4.

- [ ] Evaluate whether TypeScript would be a useful addition for ensure module/framework contracts are adhered to

- [ ] Audit all Public API calls and make a list for review and modification. Sort by module.

- [ ] Audit all event hooks by module and make a list for review and modification.

## Version 0.39.12 - Self-Hosted Update Assistant Re-evaluation

**Model: High Effort** — Any updater that can replace application code and migrate or roll back a database is a high-risk deployment subsystem.

Purpose:

Re-evaluate update assistance only after at least two real release/upgrade/restore cycles have used the manual Docker and bare-metal paths from 0.33.17. Do not implement an in-app updater merely because an earlier roadmap specified one.

- [ ] Review real operator friction and decide whether users need passive update notifications, a CLI update helper, a Docker-oriented helper, an in-app updater, signed artifacts, and/or automatic rollback.
- [ ] Treat manual Docker and bare-metal upgrades as the supported initial paths until evidence justifies a safer alternative.
- [ ] Build any future implementation on proven artifact, checksum/signing, backup, restore, release, health/readiness, migration, restart, and rollback contracts.
- [ ] Require explicit threat modeling, permissions, failure-state tests, air-gapped behavior if needed, and a kill switch before authorizing self-modifying behavior.
- [ ] Keep hosted/SaaS deployment and fleet orchestration as a separate private operations concern.

Acceptance criteria:

- The decision records two real upgrade/restore cycles and selects the smallest evidence-supported assistant, including a documented decision to build nothing if manual operations remain sufficient.

## Version 0.39.15 - Public API and integration-surface decoupling (backend-agnostic, pre-Postgres)

Purpose:

Decouple the public/integration-facing surfaces from both specific module internals and from any assumption about the storage backend, **before** the 0.40.0 PostgreSQL adapter and dual-backend work begins. This is deliberately ordered ahead of 0.40.0: the public API is the contract external integrations, the MCP connector (0.38.8), the ticket public API (0.34.5), and the future 0.70.0 integrations all depend on, and it must not care whether SQLite or PostgreSQL is running underneath, nor reach around module boundaries to assemble its responses. Doing this decoupling while the backend is still single-provider means the public API contract is proven stable *before* a second backend can perturb it.

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

- [ ] Confirm the public API, MCP read connector groundwork (0.38.8), and ticket public API (0.34.5) surfaces contain no direct dependency on a storage backend, raw dialect, or a specific module's storage internals; anything remaining routes through framework foundations, module contracts, or the provider-neutral seams.
- [ ] Extend the 0.33.6.12 framework-coupling guardrail (or add a companion) so the public/integration surfaces cannot reintroduce a direct module-repo import or a hardcoded module ID for data access, and remove `public-api.service.js`/`tag-propagation-registry.js` from the deferred-coupling allowlist.
- [ ] Update `docs/public-api.md`, `docs/module-contract.md`, and `DECISIONS.md` to record that integration-facing surfaces are module-contract- and backend-agnostic, and cross-reference this as a prerequisite the 0.40.0 dual-backend work relies on.
- [ ] Run a pre-PostgreSQL test-streamlining and dual-backend planning checkpoint: consume timing output, identify reusable API contract coverage for both providers, and retire nothing that weakens public API shapes, scopes, permissions, or integration boundaries.
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

- [ ] Client approvals and change requests
  - [ ] Add lightweight approval records
    - [ ] Track `requested_by`, `approved_by`, `approved_at`, status, and notes
    - [ ] Link approvals to clients, projects, milestones, tasks, notes, tickets, or files where appropriate
  - [ ] Add change request records
    - [ ] Track request details, status, requester, approver, and related records
    - [ ] Link change requests to Client/Project scope
    - [ ] Make the feature useful for project history and billing justification without turning it into a contract-management system
  - [ ] Keep client-facing approval actions out of scope until permissions and client-portal features are ready

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
- [ ] **Dual-backend test-matrix streamlining review** - consume per-provider timing output, report the slowest setup/tests, establish a dual-backend suite budget, share provider-neutral fixtures/contracts where equivalent, and retain provider-specific migration, transaction, search, permission, workspace, and failure coverage. Do not retire SQLite or PostgreSQL coverage merely because the matrix is expensive.
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

- [ ] Expand from the limited 0.33.17 private preview to a broader public self-hosted release only after measured upgrade, restore, security, and support evidence.
- [ ] Make PostgreSQL the preferred production database for this release (the SQLite/PostgreSQL adapter, dialect, and dual-backend work is built earlier in 0.40.0 - Database extraction layer; SQLite stays the lightweight self-hosted default)
- [ ] Harden and document the proven 0.33.17 Docker Compose and manual deployment paths rather than creating a second packaging contract.
- [ ] Setup wizard
- [ ] Consolidated public-release admin/operator docs
- [ ] Re-verify the 0.33.16 production cookie, trusted-proxy, CSRF, security-header, and fail-closed configuration posture at broader-release scale.
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

- [ ] Knowledge Base publishing/search connector for the first-party Knowledge Base module
- [ ] Support ticket intake connector for the first-party Support Tickets module
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
