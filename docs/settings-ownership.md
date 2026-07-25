# Settings Ownership and Storage Map

This document is the ownership map for roadmap 0.33.15. The inventory was audited in 0.33.15.1; the generic storage/accessor engine shipped in 0.33.15.2; the validated, filtered contribution contract shipped in 0.33.15.3; the descriptor-driven framework field renderer shipped in 0.33.15.4; the catalog/attachment-point minimal hosts shipped in 0.33.15.5; and 0.33.15.6 migrated the remaining module-conceptual workspace values to their owners while retaining specialized tables where required.

## Decision vocabulary

- **Framework-owned** means the setting governs identity, security, permissions, audit, operations, installation policy, or another framework-wide concern. A module contribution cannot override it.
- **Module-owned** means the module owns the setting's meaning, validation, defaults, and effect even when the framework settings host renders or dispatches it.
- **Generic settings store** means the 0.33.15.2 workspace-scoped JSON value store addressed by owner namespace plus setting ID. Module values use their module ID; protected framework values use the framework namespace and framework-only registration.
- **Retained table + handler** means the existing table remains authoritative because it models lifecycle, hierarchy, multiple rows, secrets, or another behavior that is not an ordinary scalar setting. The future catalog reaches it through a stable registered handler.
- **Per-user** means the value remains attached to a user rather than becoming workspace/module state.
- **App-level** means install policy or secret configuration remains outside workspace-scoped storage. Environment precedence and secret-handling rules remain intact.

## Generic settings engine

`workspace_module_settings` is the generic workspace-scoped store. Its composite key is `(workspace_id, module_id, setting_id)` and `setting_value_json` stores the descriptor-validated JSON value; `created_at` and `updated_at` belong to the store rather than to individual setting schemas. Module IDs are namespaces, not foreign keys, because protected framework settings use the reserved `framework` namespace through framework-only registration. Workspace deletion cascades to these rows.

`settingsService.getValue(context, moduleId, settingId)` is the module-target read path; `getFrameworkValue(context, settingId)` is the protected framework-target equivalent. Both require an explicit workspace context, resolve an absent value from the descriptor default, type-check stored/handler values before returning them, and reject unknown definitions. `setValue` and `setFrameworkValue` expose the matching internal write behavior. HTTP Settings saves retain `PUT /api/settings`: module targets submit beneath `moduleSettings[moduleId][settingId]`, while protected framework targets rendered on the same shared module-settings host submit beneath `frameworkSettings[settingId]` and recheck every registered permission before persistence.

Ordinary values read/write through the generic repository without registration. `registerPersistenceHandler("<moduleId>.<settingId>", handler)` is the opt-in specialized-storage seam, and `registerOnChangeEffect("<moduleId>.<settingId>", effect)` is the separate post-persistence seam. Effects run once only for a changed value after submitted setting persistence succeeds; validation rejection never runs them. `tasks.taskTimersEnabled` and the Client/Projects and Time Tracking workspace values are ordinary generic values. Tasks reminder defaults and Files policy/quota values use owner-registered handlers because their retained tables remain authoritative.

The manifest contribution is the metadata catalog, not a value read. Each module setting declares a fixed `placement` (`workspace`, `user`, `module`, or `new-workspace`), optional module target, field metadata/defaults, and standard permission/capability/module dependencies. `modulesService.listSettingsContributions(...)` applies the shared eligibility filters and terminology resolution without resolving handlers, effects, or stored values. Framework-target and protected definitions use the framework-only registry; module manifests cannot claim those boundaries or collide with a registered framework setting ID.

Paired columns that form one product value, such as billing-period type plus start day, are inventoried as one setting. Timestamps, row IDs, foreign keys, serialized metadata, and record lifecycle fields are called out but are not counted as independent settings.

## Ownership summary

| Owner | Settings |
| --- | --- |
| Framework: workspace lifecycle | Workspace name and type; module enablement; install-wide workspace-creation policy; per-user workspace-creation entitlement. |
| Framework: audit and operations | Audit logging and retention. Runtime diagnostics and job observability are readouts, not settings. |
| Framework: Users/app shell | Username, display name, alternate email, timezone, theme mode, and theme auto source. |
| Framework: Notifications | Per-event user preferences, workspace defaults, display grouping, and follow subscriptions. |
| Framework: Workbench | Bounded workspace focus candidate groups and registered priority presets; timers, eligibility, visibility, and Blocked policy are not adjustable settings. |
| Client/Projects module | Workspace default billing rate and billing period, because Client/Project records own the override and inheritance hierarchy. |
| Time Tracking module | Fiscal-year boundary and time rounding, because reporting/time calculations own their application. |
| Tasks module | Task timers and reminder policies. |
| Files framework service | File-type policy and storage quotas. Files remains framework-owned under the current module boundary even though these are contributed to the Settings host as Files-owned concepts. |
| Notes module | Per-user external-link rendering preference, install-level secure-note key policy, and the retained Notes Collection hierarchy exposed as a module-owned catalog-management surface. |

The billing split is deliberate: Client/Projects owns the hierarchy and its workspace/client/project billing inheritance values; Time Tracking consumes that model and owns calculation-only policy. `clientProjectSettingsService` and `timeTrackingSettingsService` are the owner accessors; Time Tracking composes them for its billing/reporting reads without asking the framework Settings service to understand billing.

## Settings facilities and consumers

The generalized Settings facilities are real shared infrastructure, not speculative helpers:

| Facility | Real consumers |
| --- | --- |
| Settings contribution metadata and shared eligibility filtering | Client/Projects billing defaults/period, Time Tracking fiscal-year/rounding, Tasks timer/reminder settings, Lists/Notes/Tags/Developer Example module-status controls, Files policy/quota descriptors, and protected Workbench focus policy. |
| Generic `workspace_module_settings` JSON store | Client/Projects billing defaults/period, Time Tracking fiscal-year/rounding, Tasks timer enablement, Developer Example hints, Workbench focus policy, and protected framework values that do not need entity-specific storage. |
| `settingsService.getValue(...)` owner accessor | Client/Projects billing reads, Time Tracking reporting/calculation reads, Tasks timer eligibility, Developer Example settings, and future module-owned scalar settings. |
| Persistence handler registry | Module lifecycle state in `workspace_modules`, Tasks reminder defaults in `task_reminder_offsets`, Files policy/quota reads in `file_workspace_settings`, and protected framework settings that need retained storage or side effects. |
| On-change effect registry | Time Tracking fiscal date clamping, audit cleanup after retention changes, and future owner-owned effects that must run only after successful changed persistence. |
| Settings catalog and attachment points | Workspace Settings, User Settings, Tasks Settings, Time Tracking Settings, Files Settings, Workbench Settings, Notes Settings, Developer Example Settings, Create Workspace, and module-specific settings navigation. |
| Shared Settings host and renderer | The eight protected Settings pages plus Create Workspace's contributed module settings section. Workspace groups optional lifecycle sections in one Modules box while retaining each module's namespaced payload. |
| Shared Settings page transaction controller | Workspace, User, Tasks, Time Tracking, Files, Workbench, Notes, and Developer Example Settings dual Save/Revert controls, dirty snapshots, and unsaved-navigation guard; immediate owner actions stay outside that snapshot. |

The framework Settings page transaction is browser anatomy, not a new persistence layer. Workspace/module pages and Workbench's protected framework contribution use `PUT /api/settings`, Files still uses `PUT /api/files/settings`, and User Settings coordinates `PUT /api/user/settings` with `PUT /api/notifications/preferences`. A successful universal Save marks the current rendered values clean; Revert is client-side and issues no write. Immediate lifecycle operations—including password changes, private Calendar Subscription lifecycle, workspace creation/departure, account deletion, API-key actions, and session actions—remain independent forms outside the dirty snapshot.

User Settings password fields are an independent action form. Current Password, New Password, and Confirm New Password are never tracked by the universal snapshot, Save/Revert actions, unsaved-navigation guard, or `PUT /api/user/settings`; the dedicated Change Password action submits only `PUT /api/user/password` and keeps its validation, status, reset, current-session, and other-session-revocation behavior in the authentication service.

Notes Catalog Management is another retained owner workflow, not generic scalar persistence. The shared Notes module page renders a read-only catalog information contribution, then mounts the Notes-owned `note_library_collections` list/editor and bounded archive/restore actions in the host's auxiliary region. Those controls are excluded from the universal settings snapshot because each operation persists immediately through Notes routes. Both Notes settings and Library-management permissions are required. The page never surfaces the Secure Notes master key, key version, encrypted payload metadata, or the future secure-catalog policy planned for 0.33.23.

Settings information architecture is also framework-owned. The app shell exposes the ordered Settings -> Admin drawer and its ordered Modules child drawer; module settings destinations still come from eligible registered views rather than a second browser settings registry. Workbench is an explicit protected framework destination in that drawer for users with `workspace_settings.manage`; its catalog section uses `moduleId: workbench` only as an attachment label and does not create a feature-module manifest. Notes is an ordinary manifest-owned protected destination requiring both Notes settings and Library-management permissions. Developer Example remains disabled by default and appears in the Modules drawer only when enabled. Its Example Detail Hints value persists through the generic store, and its conditional read-only Example Mode information renders through the same catalog and `visibleWhen` path as production module fields.

## Workbench focus policy

Workbench registers two protected framework settings at the module attachment point: `workbench.focusCandidateGroups` is a multi-select limited to overdue assigned work, due today, stale recovery, and recently touched work; `workbench.focusPriorityOrder` is limited to the registered `balanced`, `recent_first`, and `recovery_first` presets. The absent-value defaults reproduce the 0.33.21.3.1 order. The generic framework namespace persists only validated values, and the server-side focus resolver treats an invalid stored value as the matching default rather than asking browser code to repair ranking.

The selected groups and preset only shape rank buckets for Start my day and the supported fallback groups for Pick up where I left off. Running timers and paused timers are inserted first outside the adjustable list. Permission and workspace filters, readable-record checks, task eligibility, resume ownership, due-mode sorting, and the rule that Blocked work appears only in Review blocked work remain server-owned and non-negotiable. Disabling a group can narrow recommendations; it cannot make an otherwise ineligible record visible.

Lifecycle recovery is part of that framework contract. Tasks and Time Tracking Settings views remain permission-checked, normal Settings-host pages while their modules are disabled, replacing ordinary module fields with a disabled message and Workspace Settings link. Saving lifecycle controls refreshes the app-shell bootstrap in place; the Admin Modules drawer and Quick Action Capture update from the returned enabled-module state without removing the always-available Workspace recovery destination.

User Settings layout remains framework anatomy. Appearance and Profile share the first visual column; User App Preferences occupies the second and saves through the same user-owned route; Calendar Subscription, Notification Preferences, the isolated Leave Workspace and Delete Account actions, and the initially collapsed Workspace Creation disclosure span the full grid. Calendar Subscription is an intrinsically framework-wide secret/authentication lifecycle action, not a setting descriptor or saved user preference. Its browser adapter calls `/api/private-feeds/calendar`, keeps a newly generated or rotated URL only in current-page memory, and cannot recover a prior raw secret from the status response; Tasks owns permission-shaped iCalendar content behind that seam. The timezone value remains the validated `users.timezone` setting, while the browser builds its complete supported IANA choice list and current offset labels at render time. Leave Workspace continues through the existing membership-removal route and repeats the same administrator-restoration warning in its section and confirmation; it does not become workspace deletion. Delete Account is an immediate lifecycle action through `DELETE /api/user/account`, not a saved setting: it retires credentials, sessions, API keys, roles, creation grants, and all workspace memberships while retaining the identity row and readable authored-record attribution.

Workspace deletion is another framework-owned immediate lifecycle operation, but it belongs only to Workspace Settings. Its service/repository pair owns the administrator check, recent-backup or exact typed-acknowledgement prerequisite, dedicated lifecycle row, 30-day deadline, safe app-shell state, cancellation, and forced audits. It is not a setting descriptor, generic setting value, module contribution, membership removal, or page-transaction write. Normal module and shared-service owners retain all behavior while the lifecycle row is pending.

## Intrinsically framework-wide exceptions

Some Settings behavior is framework-wide by nature and does not need a second module consumer to justify a framework facility: protected framework settings, workspace identity/type, module lifecycle enablement, audit and operations controls, user identity/profile/theme fields, workspace creation policy, runtime diagnostics, job observability, install-level environment configuration, and secrets. These are framework-owned because they affect platform safety, identity, operations, or module availability. Module contributions may be displayed beside them through the shared host, but cannot disable, override, weaken, or target them.

## Workspace identity and `workspace_settings`

`workspace_settings` now contains only framework-owned audit values and row metadata. Workspace identity remains on `workspaces`; module-owned scalar values live in `workspace_module_settings` and are submitted beneath `moduleSettings`. `src/services/settings.service.js`, `src/utils/normalizers.js`, and `src/repositories/settings.repo.js` do not import feature modules or name module-specific setting IDs.

| Setting | Classification and owner | Current storage and definition | Read consumers | Current write path | Target storage |
| --- | --- | --- | --- | --- | --- |
| Workspace name | Framework-owned: workspace identity | `workspaces.name`; trimmed by `normalizeSettings`, with the configured initial workspace name as repository fallback. | Settings UI, app-shell/bootstrap workspace context, Users workspace lists, audit labels, and services that need a readable workspace label. | `PUT /api/settings` -> `settingsService.save` -> `settingsRepository.saveWorkspaceSettings`; the service permits a changed name only for a Workspace Administrator or Super Admin. Workspace creation writes through `workspacesRepository`. | Retain `workspaces.name`; protected framework identity, not a generic setting value. |
| Workspace type | Framework-owned: immutable workspace identity/capability policy | `workspaces.workspace_type`; `normalizeWorkspaceType` restricts creation to `business`, `personal`, or `family`. Non-Business normalization hides Business-only fiscal/rate values. | Capability filtering, module contribution eligibility, Client visibility, Tasks reminder inheritance, Lists terminology, Files/permissions, app shell, and workspace creation. | Workspace creation is the only write path. `PUT /api/settings` rejects a changed canonical or compatibility type field, and `settingsRepository.saveWorkspaceSettings` rechecks the stored value while never updating the column. | Retain immutable `workspaces.workspace_type`; changing it after creation is unsupported because it affects capabilities and visibility. |
| Fiscal year | Module-owned: Time Tracking | `workspace_module_settings`: `time-tracking.fiscalYearStartMonth` + `fiscalYearStartDay`; owner effect clamps the day for the selected month; Business reads default to January 1 outside the capability. | Time Tracking/reporting period behavior through `timeTrackingSettingsService`. | `PUT /api/settings` `moduleSettings.time-tracking`; generic persistence plus the Time Tracking effect. | Shipped in 0.33.15.6. |
| Default billing rate | Module-owned: Client/Projects | `workspace_module_settings`: `client-projects.defaultBillingRate`; trimmed text and Business-only contribution. | Client/Project create/edit inheritance and browser billing helpers; Time Tracking billing/reporting through the owner accessor. | `PUT /api/settings` `moduleSettings.client-projects`; generic persistence. | Shipped in 0.33.15.6; per-record overrides remain in Client/Project tables. |
| Billing period | Module-owned: Client/Projects | `workspace_module_settings`: `client-projects.billingPeriodType` + `billingPeriodStartDay`; calendar month or custom day 1-28. | Client/Project inheritance/editors and Time Tracking entry filters, billing, reporting, and public API reads. | `PUT /api/settings` `moduleSettings.client-projects`; generic persistence. | Shipped in 0.33.15.6 with override precedence preserved. |
| Time rounding | Module-owned: Time Tracking | `workspace_module_settings`: `time-tracking.billingRoundingEnabled` + `billingRoundingIncrement`. | Time Tracking entry/timer calculations and billing/reporting; Client/Project forms display inherited/override values. | `PUT /api/settings` `moduleSettings.time-tracking`; generic persistence. | Shipped in 0.33.15.6; Client/Project record overrides remain inputs to the calculator. |
| Audit logging | Framework-owned: Audit | `workspace_settings.audit_logging_enabled`; database boolean mapping and `normalizeAuditSettings`, default enabled. | `auditService` record/cleanup decisions and Settings save auditing. | `PUT /api/settings`; `settingsService.save` force-records enable/disable transitions around the repository write. | Generic framework settings store: `framework.audit.loggingEnabled`, protected. Use a framework persistence/effect handler so enable/disable audit ordering cannot change. |
| Audit retention | Framework-owned: Audit/operations | `workspace_settings.audit_retention_days`; allowed UI/normalizer values are 7, 14, 30, 60, 90, 180, or 365; default 30. | `auditService` filtering/cleanup and the post-save cleanup call. | `PUT /api/settings`, followed by `auditService.cleanupExpired`. | Generic framework settings store: `framework.audit.retentionDays`, protected, with cleanup as an on-change effect after a successful save. |
| Task timers | Module-owned: Tasks | `workspace_module_settings`: `tasks.taskTimersEnabled`; boolean default true. | Tasks bootstrap/dialog/timer service through `tasksSettingsService`, plus Dashboard/Workbench task-timer visibility and Settings decoration. | `PUT /api/settings` `moduleSettings.tasks.taskTimersEnabled`; generic persistence with no handler. | Shipped in 0.33.15.6. |

`workspace_settings.audit_settings_updated_at` is save metadata for audit-setting changes, not a user setting. `created_at` and `updated_at` are row metadata. They do not become catalog entries; the generic store owns its own timestamps.

## Module status settings

Module status controls are declared in manifests but persist in `workspace_modules.status`, not in `workspace_settings`. Current status settings are `client-projects.clientProjectsEnabled`, `time-tracking.timeTrackingEnabled`, `tasks.tasksEnabled`, `lists.listsEnabled`, `notes.notesEnabled`, and `developer-example.developerExampleEnabled`. `developer-example.developerExampleMode` is read-only documentation metadata and has no persisted value; `developer-example.developerExampleHintsEnabled` is an ordinary boolean persisted by the generic store.

All module status definitions are module-owned declarations; enable/disable lifecycle, dependency checks, protected `canDisable: false` enforcement, timestamps, audit, and events are framework-owned. Reads flow through `modulesService.decorateWorkspaceSettings` / `readWorkspaceModuleContext`; writes flow through `PUT /api/settings` or workspace creation into `modulesService.setModuleStatus`.

Target decision: retain `workspace_modules` behind the framework module-status handler. Status is lifecycle state, not an ordinary generic setting. Protected modules such as Client/Projects remain non-disableable, and new-workspace defaults continue to come from manifests.

## Install-level `app_settings`

`src/repositories/app-settings.repo.js` defines exactly three recognized keys and inserts missing defaults during startup. `usersService.readWorkspaceCreationOptions` is their only runtime consumer. There is currently no HTTP/admin write path for these keys; environment overrides exist for install mode and type limit.

| Setting | Classification and owner | Current storage and normalization | Read consumers | Current write path | Target storage |
| --- | --- | --- | --- | --- | --- |
| `workspace_creation_enabled` | Framework-owned: install/workspace policy | `app_settings` text boolean; default `"true"`; only exact `"false"` disables creation. | User Settings workspace-creation options and `POST /api/workspaces` eligibility. | Startup `ensureDefaults`; otherwise operator/database maintenance only. | App-level `app_settings`, protected. Add a deliberate admin handler only when an admin UI is planned. |
| `workspace_install_mode` | Framework-owned: deployment/install policy | `app_settings` text enum, default `self_hosted`; `WORKSPACE_INSTALL_MODE` environment value has precedence; only `saas` selects SaaS. | Workspace-type availability in `usersService`. | Startup default; environment/operator maintenance. | App-level, retaining environment precedence. Do not copy to workspace settings. |
| `workspace_type_limit` | Framework-owned: install/workspace policy | `app_settings` text enum/empty default; `WORKSPACE_TYPE_LIMIT` environment value has precedence; `business` restricts creation to Business. | Workspace-type availability in `usersService`. | Startup default; environment/operator maintenance. | App-level, retaining environment precedence. |

Unrecognized `app_settings` rows have no registered definition or consumer and are not settings contributions merely because the key/value table can store them.

## Per-user `users` settings

`GET/PUT /api/user/settings` is owned by `usersService`; normalization lives in `src/utils/normalizers.js` and profile validation in `users.service.js`; persistence lives in `usersRepository`. These values remain per-user and do not move into the workspace/module store.

| Setting | Classification and owner | Current storage and normalization | Read consumers | Current write path | Target storage |
| --- | --- | --- | --- | --- | --- |
| Username/sign-in email | Framework-owned: Users/auth identity | `users.username`; trimmed/lowercased email and uniqueness-checked. | Auth/session identity, user/profile UI, audit labels, assignments/membership labels. | `PUT /api/user/settings` profile update; sessions are updated to the new username. | Per-user `users.username`; protected identity field, not a module setting. |
| Display name | Framework-owned: Users identity | `users.display_name`; trimmed, falls back to username. | App/user UI, record actor labels, membership/admin reads. | `PUT /api/user/settings` profile update. | Per-user `users.display_name`. |
| Alternate email | Framework-owned: Users identity/contact | `users.alt_email`; optional normalized email. | User profile/admin reads. | `PUT /api/user/settings` profile update. | Per-user `users.alt_email`. |
| Timezone | Framework-owned: Users/time semantics | `users.timezone`; validated IANA zone, default `America/New_York`. Session rows mirror it. | Auth/app shell, browser timezone helper, date bounds, Tasks/Workbench/calendar/time formatting, audit filters, and due-time conversion. | `PUT /api/user/settings` profile update -> users row plus all current user sessions. | Per-user `users.timezone`; registered framework effect continues session refresh. |
| Theme mode | Framework-owned: app shell/appearance | `users.theme_mode`; `light`, `auto`, or `dark`, default `light`. | Static protected-page theme injection, auth/app-shell bootstrap, navigation, and User Settings/local cache. | `PUT /api/user/settings` -> `usersRepository.updateThemeMode`; route refreshes theme cookies. | Per-user `users.theme_mode`; framework effect refreshes cookie/client shell. |
| Theme auto source | Framework-owned: app shell/appearance | `users.theme_auto_source`; currently only `system`, default `system`. | Same theme bootstrap and browser consumers as theme mode. | `PUT /api/user/settings` -> repository update; route refreshes theme cookies. | Per-user `users.theme_auto_source`. |
| Initial login page | Framework-owned: authentication/navigation | `users.preferred_login_landing`; constrained to `dashboard`, `workbench`, `tasks`, `notes`, or `lists`, default `dashboard`. | Login response and valid-session login-page redirect after server resolution against the active workspace. | `PUT /api/user/settings` -> `usersRepository.updateLandingPreferences`. | Per-user `users.preferred_login_landing`; server returns only an available protected path or Dashboard. |
| After changing workspaces | Framework-owned: workspace/navigation | `users.preferred_workspace_switch_landing`; same constrained values and default. | Workspace-switch response after server resolution against the target workspace. | `PUT /api/user/settings` -> `usersRepository.updateLandingPreferences`. | Per-user `users.preferred_workspace_switch_landing`; server returns only an available protected path or Dashboard. |
| Default calendar view | Framework-owned: app shell/calendar | Nullable `users.preferred_calendar_view`; constrained to `day`, `week`, or `month`. `NULL` means Automatic. | App-shell bootstrap and both shared read-only calendar hosts; Automatic resolves to Day at mobile widths and Month otherwise. | `PUT /api/user/settings` -> `usersRepository.updateCalendarViewPreference`. | Per-user `users.preferred_calendar_view`; never a workspace/module setting. |
| Open external Markdown links in a new tab | Module-owned: Notes | `users.open_external_links_new_tab`; boolean default false. | User Settings and Notes browser post-processing/local cache; shared rendered HTML is not mutated. | `PUT /api/user/settings` -> `usersRepository.updateOpenExternalLinksNewTab`. | Per-user retained value. Expose later as a Notes-owned contribution attached to User Settings, with the Users handler continuing storage. |

Other `users` columns are explicitly not settings: `user_id`, nullable `home_workspace_id`, and nullable `active_workspace_id` are identity/context; `password` is a credential changed through `/api/user/password`; `user_status` and `protected_user` are admin/security lifecycle controls. They remain in `users` and must not become ordinary settings contributions. Self-service account retirement is a separate destructive User Settings action: the identity, username, and display name remain durable attribution, while access-bearing credentials, sessions, API keys, roles, grants, memberships, and any export-recovery qualification are retired. The install-level `account_export_recovery_qualifications` row and restricted session mode are authentication/lifecycle controls, not user settings.

## Retained per-feature settings tables

### Tasks reminder policy

| Setting | Classification and owner | Current storage and definition | Read consumers | Current write path | Target storage |
| --- | --- | --- | --- | --- | --- |
| Reminder offsets for date-time and date-only due work | Module-owned: Tasks | Multiple `task_reminder_offsets` rows keyed by workspace, target type (`workspace`, `client`, `project`, `task`), target ID, due kind, offset minutes, and sort order. `taskRemindersService` normalizes positive unique offsets (maximum four per kind); workspace fallbacks are 120/1440 minutes for timed work and 4320/1440 minutes for date-only work. | Settings read through `tasksSettingsService`, task detail/effective-policy reads, calendar reminder markers, reminder occurrence scheduling, durable reminder jobs, recurrence, and notification delivery. | Workspace defaults: four Tasks contributions under `moduleSettings.tasks` dispatch through Tasks-registered read/write handlers; Client/Project/Task overrides continue through Tasks services. | Retained table + owner handlers shipped in 0.33.15.6. |

`tasks.reminder_override_enabled` is task-record workflow state selecting whether task-level rows participate; it is not a workspace setting.

### Files policy and quotas

All five values are Files-owned concepts under the framework Files service and protected framework contributions attached to the Files Settings host. Catalog reads are permission-filtered; the Files page continues to save atomically through `GET/PUT /api/files/settings`, requires `files.manage_workspace_settings`, and preserves Files audit behavior. Upload preparation consumes type policy; buffered and streamed upload paths consume both quotas before creating usable file records.

| Setting | Current storage and normalization | Target storage |
| --- | --- | --- |
| File type policy mode | `file_workspace_settings.file_type_policy_mode`; `safe_default`, `allowlist`, or `blocklist`, default `safe_default`. | Retain `file_workspace_settings` behind a Files handler. |
| Allowed extensions | `allowed_extensions_json`; unique lowercase dot-prefixed alphanumeric extensions, with safe defaults when empty/invalid. | Retain with the policy handler. |
| Blocked extensions | `blocked_extensions_json`; same extension normalization, with default blocked types. | Retain with the policy handler. |
| Workspace internal-storage limit | `internal_storage_limit_bytes`; nullable non-negative integer, where `NULL` is unlimited. | Retain with the Files quota handler. |
| Per-user internal-storage limit | `per_user_storage_limit_bytes`; nullable non-negative integer, where `NULL` is unlimited. | Retain with the Files quota handler. |

`file_workspace_settings.metadata_json`, row timestamps, and Files storage accounting are internal metadata/readouts, not settings. Scanner mode and storage provider are install-level runtime configuration and remain environment-owned; they are not copied into this table or the generic store.

### Notifications

Notifications are framework-owned. Configurable event IDs and defaults originate in registered module notification declarations, but the framework owns preference storage, permission checks, enabled-module filtering, recipient expansion, delivery, and the settings UI.

| Setting | Current storage and normalization | Read consumers | Current write path | Target storage |
| --- | --- | --- | --- | --- |
| Per-user event enabled preference | `notification_user_preferences` keyed by workspace/user/event; boolean, falling back to workspace/event declaration default. | Notification preferences UI and `notificationsService.createFromEvent` recipient filtering. | `PUT /api/notifications/preferences` -> allowlisted event normalization -> repository upserts. | Retain table behind framework Notifications handler. |
| Workspace event enabled/default priority | `notification_workspace_defaults` keyed by workspace/event; enabled boolean plus `low`/`normal`/`high`/`urgent` priority. | Preferences UI and notification fan-out/default priority. | `PUT /api/notifications/workspace-defaults` with `notifications.manage_workspace_defaults`. | Retain table behind protected framework Notifications handler. |
| User notification grouping | `notification_user_display_preferences.grouping_mode`; `client_project`, `notification_type`, or `record_type`, default `client_project`. | Notifications/User Settings grouping UI. | Included in `PUT /api/notifications/preferences` and upserted per workspace/user. | Retain per-user/per-workspace table behind Notifications handler. |
| Follow subscription | `notification_subscriptions`; active/inactive row keyed by workspace/user/module/target/event. | Follow controls and notification fan-out recipient expansion with access rechecks. | `POST`/`DELETE /api/notifications/subscriptions`; target provider and permission validation precede upsert/status change. | Retain table behind Notifications follow handler; this is record lifecycle, not a generic setting. |

The `notifications` inbox table stores delivered records and is not a settings mechanism.

### Per-user workspace-creation entitlement

`user_workspace_creation_permissions.can_create_workspaces` and `allowed_workspace_types_json` are framework-owned install/account policy. `appSettingsRepository.readWorkspaceCreationPermission` normalizes the boolean and restricts types to Business, Personal, and Family. `usersService.readWorkspaceCreationOptions` intersects them with app-level policy before rendering or accepting workspace creation. There is currently no application write path; absent rows default to allowed/all types.

Target decision: retain `user_workspace_creation_permissions` as app-level per-user policy behind a protected framework handler when an admin write surface is introduced. It must not become a user-editable preference or a module setting.

## Secure Notes app-level policy

| Setting | Classification and owner | Current definition and consumers | Current write path | Target storage |
| --- | --- | --- | --- | --- |
| Secure Notes master key | Module-owned: Notes security policy | `LONGTAIL_SECURE_NOTES_MASTER_KEY`, with `SECURE_NOTES_MASTER_KEY` as the compatibility alias. `secure-crypto.js` reads the runtime secret for encryption, decryption, configuration status, and fail-closed checks; a 64-character hex or 32-byte base64 key is accepted, otherwise the configured text is SHA-256-derived. | Operator-managed environment/secret injection only. | App-level environment secret. Never store or return it through `app_settings`, the generic settings store, catalogs, diagnostics, audit, or browser payloads. |
| Secure Notes key version | Module-owned: Notes security policy | `LONGTAIL_SECURE_NOTES_KEY_VERSION`, default `v1`; written as metadata on secure Notes/revisions and exposed only through safe configuration status. | Operator-managed environment. | App-level environment configuration beside the master key. Rotation tooling is separate future work. |

## Migration invariants

- Preserve current defaults, workspace-type gating, override precedence, permission checks, audit ordering, and route payload compatibility while storage moves.
- Migrate one authoritative value per setting. Compatibility reads may bridge old and new storage temporarily, but writes must not create two independent sources of truth.
- Ordinary scalar module settings use the generic store. Retained tables require stable registered handlers; a handler is not a license for framework code to name a first-party setting ID.
- Framework settings are registered and protected by the framework. Module manifests cannot target or override their IDs.
- Per-user values remain per-user even when a module contributes their descriptor to User Settings.
- Runtime configuration, secrets, diagnostics, and observability are not workspace settings. Never expose environment values, secure-note keys, storage paths/keys, scanner internals, or job payloads through the settings catalog.
