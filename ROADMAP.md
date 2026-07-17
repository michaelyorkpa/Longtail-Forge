# Longtail Forge Roadmap

This file is the detailed per-version forward plan for Longtail Forge. README.md should stay cursory and point here for version-level detail.

Active cursor: `0.33.17.5`.

These version plans are governed by the standing architecture boundaries in `DECISIONS.md` — the Product North Star (product-first framework direction), the Framework and Module Boundary, the Two-Module Rule, and the gradual-modernization and regression-direction rules. `DECISIONS.md` is the single canonical home for those boundaries; this file plans versions against them rather than restating them.

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

### Version 0.33.17.5 - Branch Topology, GitHub Actions, Releases, and Solo-Maintainer Workflow

**Model: High Effort** — Branch protection, CI triggers, immutable release identity, environment isolation, deployment, rollback, and hotfix reconciliation form one operational safety boundary.

Purpose:

Create and prove the repository delivery path before private-preview invitations. Routine work integrates through one permanent `nightly` branch, verified promotion moves `nightly` into protected `main`, the Linux demo/development installation consumes verified `nightly` builds, and the friends-and-family installation consumes only a deliberately selected immutable release from `main`. In this section, “the `nightly` branch” means the permanent integration branch; “the scheduled nightly workflow” means a time-triggered full-suite run.

#### Branch and promotion topology

- [x] Establish `main` as the protected, known-good preview/release branch.
  - [x] Do not perform routine development directly on `main`; changes arrive through pull requests with required checks and resolved review conversations.
  - [x] The friends-and-family installation may run only an exact verified `main` commit, release tag, image digest, or immutable checksummed artifact produced from `main`.
  - [x] A push or merge to `main` must never silently or automatically deploy the friends-and-family installation.
- [x] Create one permanent protected `nightly` integration branch; do not create a second permanent `dev` branch with the same responsibility.
  - [x] `nightly` is the normal integration target for active development and the source for verified Linux demo/development builds.
  - [x] Protect `nightly` from force-push and deletion, and document any narrow maintainer recovery bypass; routine work still uses pull requests and passing checks.
- [x] Use short-lived branches named by intent, for example `feature/<description>`, `fix/<description>`, `docs/<description>`, `chore/<description>`, and `hotfix/<description>`; do not create permanent branches per version or feature.
- [x] Document the normal promotion flow and delete short-lived branches after merge:

  ```text
  feature/*, fix/*, docs/*, chore/*
                    |
                    v
                 nightly
                    |
            promotion pull request
                    |
                    v
                  main
  ```

- [x] Do not add a permanent `release` branch. Use immutable tags, GitHub Releases, checksummed artifacts, and container image digests for release identity. Permit a temporary `release/*` branch later only when a concrete stabilization need exists, such as maintaining a public release while incompatible development continues.

#### GitHub Actions test gates

- [x] Add clearly named workflows under `.github/workflows` using a clean checkout and the supported Node major; choose the exact division between fast pull-request checks, affected checks, the scheduled nightly full workflow, and release checks to avoid waste while preserving the complete release gate before promotion.
- [x] For pull requests into `nightly`, run the applicable development gate: `npm ci`, typecheck, ESLint, Vitest unit/contract tests, affected regression selection, migration/schema checks, documentation checks, and relevant Playwright smoke/accessibility coverage.
- [x] Do not run the same enormous suite redundantly across several jobs. Keep Playwright's existing separate-gate contract while installing browsers in the jobs that actually run it.
- [x] For promotion pull requests from `nightly` into `main`, require the complete release-quality gate applicable at that point: typecheck, lint, unit/contract tests, full regressions, migration/schema checks, documentation checks, security checks, Playwright smoke/accessibility, packaging proof, `npm run closeout`, and every other standing release gate.
  - [x] Require the promotion branch to be current with `main` and identify the exact commit being promoted.
  - [x] Merging the promotion pull request creates no automatic friends-and-family deployment.
- [x] On pushes or merges to `main`, revalidate or attest to the promoted commit and build or retain immutable release-ready artifacts. Do not silently move a mutable `latest` reference and treat it as sufficient release identity.
- [x] Plan and configure Dependabot/current GitHub dependency updates, CodeQL or equivalent code scanning, dependency review where supported, and secret-scanning/push-protection guidance; passing scans are evidence, not proof that the application is secure.

#### Demo/development deployment behavior

- [x] On a successful verified push to the `nightly` branch, reconfirm the integration gate, build the exact deployable artifact/image, and permit automatic deployment only to the non-production Linux demo/development environment once one supported deployment transport is safely implemented.
- [x] No feature/fix/docs/chore/hotfix branch may deploy directly to either persistent environment.
- [ ] Record the deployed commit SHA plus artifact checksum or image digest, then verify `/healthz`, `/readyz`, and `/api/app-info`; deployment or post-deployment failure must be visible and non-green.
- [x] Define rollback to the recorded last-known-good demo artifact/image and never expose friends-and-family credentials or secrets to the demo workflow.

#### Manual friends-and-family release and deployment behavior

- [x] Add a manually dispatched workflow or equivalent deliberate operator command that accepts or resolves an exact `main` SHA, tag, GitHub Release asset, artifact identity, or image digest and refuses unverified or non-`main` revisions.
- [ ] Run or attest to all required release gates, produce version metadata and checksums, and create or attach the appropriate GitHub Release/runtime/Docker assets where applicable.
- [ ] Perform the documented backup-first deployment from 0.33.17.2-0.33.17.3, then verify health, readiness, schema/application version, expected commit SHA, and artifact/image identity.
- [ ] Record the previously deployed known-good release and support deliberate manual rollback through the same backup, restore, readiness, and version-verification contracts.
- [x] Never deploy customer, public self-hosted, unrelated private, or friends-and-family instances merely because `main` changed.

#### Branch protection and GitHub Environment policy

- [x] Protect `main` and `nightly` with required status checks, resolved review conversations, and blocked force-push/deletion. While Mike is the sole maintainer, do not require an approval from a second human that he cannot provide; document future tightening when maintainers join.
- [x] Create separate GitHub Environments or equivalent isolated deployment configuration for demo/development and friends-and-family preview.
  - [ ] Use separate least-privilege credentials, environment URLs, health checks, and deployment access.
  - [x] Never reuse application secrets, database files, Secure Notes keys, preview data, or production-like credentials between environments.
  - [x] Never commit secrets or print them in Actions logs.
  - [x] Friends-and-family deployment requires explicit manual dispatch, an exact revision, passing checks, and confirmation inputs; do not require a second-person environment approval until another maintainer can satisfy it.
- [x] Select and document one supported deployment transport during implementation based on least privilege, secret isolation, recoverability, and the Windows-development/Linux-deployment topology. Do not preselect SSH, a self-hosted runner, registry pull, or another transport without that review.

#### Hotfix and reconciliation workflow

- [ ] Branch an urgent friends-and-family fix from `main` as `hotfix/<description>` and return it to `main` through a focused pull request and all applicable required checks.
- [ ] After deliberate deployment of the merged hotfix, merge or otherwise reconcile the same fix back into `nightly`; document conflict handling and verify the resulting `nightly` history so ongoing work cannot silently lose the preview fix.
- [ ] A hotfix never bypasses backup, migration, security, immutable-release, health/readiness, or rollback requirements merely because it is urgent.

#### Required development and release documentation

- [x] Deliver `docs/development/github-workflow.md` in ordinary language explaining why `nightly` and `main` both exist; which environment each powers; starting short-lived branches in VS Code/Codex; committing/pushing; opening a pull request into `nightly`; promoting `nightly` into `main`; reading and recovering from failed Actions; resolving drift/conflicts; deleting merged branches; creating and reconciling a hotfix; manually releasing/deploying an exact revision; finding the deployed SHA/version; rolling back; tags; GitHub Releases; practical Git commands; and equivalent GitHub/VS Code UI steps.
- [x] Deliver or complete `docs/releasing.md`, `docs/self-hosting.md`, `docs/backup-and-restore.md`, and `docs/upgrading.md` as part of the relevant 0.33.17 slices, with consistent immutable-release, backup-first, readiness, and rollback terminology.
- [ ] Create and prove the `nightly` branch, both branch protections/rulesets, pull-request promotion rules, CI workflows, demo/development environment, friends-and-family environment, manual release/deployment workflow, hotfix procedure, and supporting operator documentation during 0.33.17.5 before any private-preview invitation is sent.

Operational proof status (2026-07-16): branches, protections, pull-request checks, scheduled/push workflows, dependency/security scanning, immutable `main` artifacts, isolated disabled environments, and the protected `nightly` -> `main` promotion are proven. Both environments remain intentionally disabled and contain no deployment secrets or URLs, so live deployment identity/readiness, manual release/deployment, rollback, and deployed-hotfix reconciliation remain open. Private-preview invitations remain blocked.

Acceptance criteria:

- `main` is the protected known-good source for friends-and-family releases; `nightly` is the protected integration branch and source for demo/development builds.
- Routine short-lived work merges into `nightly`, and promotion from `nightly` to `main` uses a pull request with the complete release-quality gate.
- Verified `nightly` pushes may deploy automatically only to demo/development; feature branches cannot deploy persistent environments.
- Friends-and-family deployment is manual, pinned to an immutable verified `main` revision/artifact, backup-first, health/readiness/version verified, and recoverable to the recorded prior release.
- Demo and friends-and-family environments have isolated least-privilege secrets, configuration, data, URLs, and health checks.
- Hotfixes originate from `main`, pass required gates, deploy deliberately, and are reconciled into `nightly` with conflicts resolved explicitly.
- Immutable tags, GitHub Releases, checksums, artifacts, and image digests provide release identity; no permanent release branch is required.
- A solo maintainer can follow the documented workflow without an impossible second-human approval, and future tightening is documented.
- The branches, protections, CI, environments, promotion, release, deployment, health verification, hotfix, and rollback procedures are tested before invitations; preview remains blocked until relevant 0.33.16 and 0.33.17 acceptance criteria pass.
- No automatic deployment of friends-and-family, customer, public self-hosted, or unrelated private instances is introduced.

### Version 0.33.17.6 - Private-preview documentation and readiness

**Model: Medium Effort** — This is a precise documentation and operational-readiness closeout after the underlying controls exist.

- [x] Publish installation/deployment, reverse-proxy/TLS, first-login/bootstrap, account creation, backup/restore, manual upgrade, known/security limitations, Secure Notes key, file scanning/upload, bug reporting, emergency shutdown/revocation, and feedback guidance.
- [x] Label the program “private preview”; document the supported scale and avoid unsupported uptime, security, backup, or compliance promises.
- [x] Require a tested restore, reference-proxy deployment review, unique invited accounts, feedback path, and operator readiness checklist before invitations.
- [x] Keep 0.39.9 as comprehensive 0.3x documentation/stabilization, not the first time essential operator and user documentation exists.

Operational readiness documentation status (2026-07-16): `docs/private-preview-readiness.md` is the invitation gate and cross-links the supported installation, Caddy/TLS, backup/restore, upgrade, Secure Notes key, scanner, account, bug-reporting, feedback, revocation, and emergency-pause contracts. Invitations remain blocked until the remaining live deployment, rollback, hotfix, and final release-closeout proof passes.

Acceptance criteria:

- An invited user and operator can understand the preview’s setup, safe operation, limits, recovery, account flow, and feedback path before access is granted.

### Version 0.33.17.7 - Pre-preview UI/UX review and fixes

**Model: High Effort** — Manual review spans several framework and module surfaces changed since 0.33.14, and fixes must preserve security, permission, responsive, and workflow contracts.

Purpose:

Review every user-visible UI/UX change shipped from 0.33.14 through 0.33.17.7 before the private-preview closeout, correct confirmed defects without adding speculative workflows, and add focused rendered or regression coverage for each fix.

This is a tracking umbrella, not one implementation slice. Each numbered child below is sized for one implementation session, including its focused regression, owning-doc disposition, version/changelog/archive bookkeeping, canonical `npm run verify:slice`, and runtime proof when required. Do not combine children merely because they share the `.7` prefix. If a child reveals a new independent blast radius, add another numbered child rather than broadening the active session.

The manual review is tracked in `archive/0.33.17.7-pre-testing.md`. Confirmed findings required before preview are assigned to `0.33.17.7.1` through `0.33.17.7.19`; findings deliberately deferred until after the friends-and-family preview live in 0.33.19. Record manual results during the owning child slice where possible. The final review slice records only the remaining checklist results and routes any newly confirmed defect into its own child; it does not absorb surprise implementation work.

- [x] Correct the public login page so the required password-change form remains hidden for an ordinary unauthenticated visit and appears only after a successful login or existing session reports `passwordChangeRequired`; add desktop and mobile Playwright coverage for both the initial state and intentional transition.
- [x] Complete the numbered pre-preview correction slices below without weakening the current module ownership, permission, security, responsive, retention, or workflow contracts.
- [x] Complete the remaining changed-surface inventory at `0.33.17.7.20`; newly confirmed defects receive their own numbered child instead of extending the closeout session.

Acceptance criteria:

- Every user-visible surface changed from 0.33.14 through 0.33.17.7 has a recorded manual result; confirmed defects are corrected and regression-covered; no new workflow or preview-readiness claim is introduced through the review.
- An operator can identify the source branch of every supported running installation from both the visible version label and `/api/app-info`; a build with canonical package version `<version>` displays exactly `<version>-<branch>` (for example the current `0.33.17.7` baseline displays `0.33.17.7-nightly`) while the canonical package version remains unsuffixed.

#### Version 0.33.17.7.1 - Appearance Theme-mode grouped-control repair

**Model: Medium Effort** — This is a contained renderer/layout correction on the existing User Settings Appearance contribution.

- [x] Restore the bounded border box around User Settings -> Appearance -> Theme mode. Treat the missing grouped-control border and unwanted width expansion as related visible symptoms while verifying whether the renderer class handoff and conditional field layout have separate causes.
- [x] Keep the Light/Auto/Dark selector content-sized with its rounded grouped-control shape, clear labels, selected state, radio semantics, keyboard behavior, and current saved values in every mode.
- [x] Revealing Auto source -> Match operating system must not flatten, stretch, or redistribute the Theme-mode group; keep the secondary control visually subordinate and independently bounded.
- [x] Scope the fix to the Appearance field layout/renderer class handoff unless inspection proves the shared segmented-control primitive is broken, and add focused Light/Auto/Dark coverage in both themes at desktop and mobile widths.

Acceptance criteria:

- Theme mode retains one bounded, content-sized grouped control in Light, Auto, and Dark states at supported widths, and the conditional Auto-source control does not alter its shape or behavior.

#### Version 0.33.17.7.2 - Qualified runtime version and source-branch identity

**Model: High Effort** — Release metadata crosses build, deployment, diagnostics, public UI, artifact identity, and version guardrails.

- [x] Add an explicitly supplied source-branch identity to runtime release metadata and expose a qualified display version in the form `<packageVersion>-<branchName>`—for example `0.33.17.7-nightly`—through `/api/app-info`, the public splash, shared footer, app-shell metadata, and runtime diagnostics.
- [x] Keep `package.json` as the unsuffixed canonical application version for compatibility, artifact checks, version guardrails, and asset-cache keys; expose the canonical version and branch separately alongside the qualified display value.
- [x] Build and deployment paths must supply and validate branch identity without requiring a packaged installation to contain `.git`. Prove `nightly`, `main`, missing-label, and invalid-label behavior, and document the safe fallback for an explicitly local unqualified run.

Acceptance criteria:

- Every supported deployed installation exposes its source branch visibly and through `/api/app-info`; a build with canonical package version `<version>` displays exactly `<version>-<branch>` while the canonical package version remains unsuffixed.

#### Version 0.33.17.7.3 - Universal Settings Save/Revert and unsaved-change guard

**Model: High Effort** — This changes the framework-owned settings transaction anatomy shared by every settings surface; a mistake can lose or misroute pending values across the app.

- [x] Remove the empty/blank view-status-message box that renders on every settings page (observed on Workspace Settings and Time Tracking Settings; the issue is settings-render-wide).
- [x] Replace the many per-box "Save settings" buttons (Clients & Projects, Developer Example, Notes, Procurement Lists, Tasks, Time Tracking, Audit Log, and the page-bottom button) with exactly two universal page-level Save buttons wired through the same existing routes to save all settings on the page as currently set.
  - [x] Save is a floppy-disk icon with the text "Save", grayed out until a change is made, and flashes red momentarily after an unsaved change: on change for dropdowns/radios/checkboxes, on de-focus for typed fields (for example Default Billing Rate).
  - [x] One Save sits at the top right, vertically center-aligned with the page heading; one sits at the bottom right below all other content, so long pages never require scrolling to save.
- [x] Add a universal Revert button immediately left of each Save: a counter-clockwise (undo) arrow icon with the text "Revert", grayed out until a change is made, clearing all pending changes back to the stored settings.
- [x] If a user tries to navigate away from any settings surface with unsaved changes, warn with an in-app dialog offering "Cancel" (stay) and "Continue" (proceed to the intended destination).
- [x] Apply the Save/Revert buttons, their states, and the unsaved-changes guard universally across all settings surfaces — both functionality and visibility.
- [x] Treat password changes, workspace creation/departure, account deletion, API-key/session actions, and other immediate lifecycle operations as actions rather than dirty settings; universal Save/Revert must neither submit nor reset those forms.

Acceptance criteria:

- Every settings surface has exactly two Save buttons and two Revert buttons with the specified icons, placement, disabled/flash states, and unsaved-changes guard; no per-box settings-save buttons or blank status boxes remain, and lifecycle action forms remain independently safe.

#### Version 0.33.17.7.4 - Admin navigation, module grouping, and broken Settings pages

**Model: Medium Effort** — This is a contained Settings information-architecture and host-integration pass after the shared action anatomy is settled.

- [x] Workspace Settings: group all optional modules into one "Modules" box, alphabetized, except Developer Example (optional, never-on) which always sorts last; Clients & Projects remains directly below the Workspace box.
- [x] Rename the Settings -> Workspace slide-out drawer to "Admin", move Actions -> Project Settings to Settings -> Admin -> Projects, and order Settings -> Admin as: Modules (slide-out: Files, Tags, Tasks, Time Tracking, then Developer Example when explicitly enabled), Projects, Clients, User Admin, Workspace (renamed from "Workspace Settings"), API Keys, Audit Log.
- [x] Fix Files Settings loading nothing (top priority — it blocks further manual testing): `loadFilesSettings` crashes with `TypeError: can't access property "set", window.LongtailForge.status is undefined` at `public/js/files-settings.js` `setStatus`.
- [x] Render Developer Example settings inside the shared Settings anatomy instead of the current raw standalone HTML page (black background, no app fonts, JSON dump), and surface it under Settings -> Admin -> Modules -> Developer Example rather than as a top-level Workspace entry, so the 0.33.15.2-.4 checklist (Example Detail Hints, read-only Example Mode information, visibility and save behavior) becomes verifiable.

Acceptance criteria:

- The Admin drawer and Workspace Settings module group match the specified ownership/order; Files Settings and Developer Example load inside the shared Settings anatomy and are manually testable.

#### Version 0.33.17.7.5 - Disabled-module recovery and timer-surface suppression

**Model: High Effort** — Module lifecycle state affects framework navigation plus Tasks, Time Tracking, and Workbench visibility contracts.

- [x] When a module such as Time Tracking is disabled, its settings route shows the disabled message inside the normal Settings page context, never a barren standalone page.
- [x] Saving a module enable/disable change refreshes the Admin navigation immediately without a manual reload while retaining the recovery path needed to re-enable the module.
- [x] When Time Tracking is disabled for the workspace, timer UI must not render in Tasks, Workbench, Capture, or Time Tracking navigation.
- [x] When Tasks -> Task Timers is disabled while Time Tracking remains enabled, task-timer controls must not render in Tasks or Workbench; unrelated manual Time Tracking remains available.

Acceptance criteria:

- Disabled modules retain an in-context recovery route and immediate navigation refresh, and timer controls appear only where both the Time Tracking module and the applicable Task Timers setting allow them.

#### Version 0.33.17.7.6 - Workspace identity policy and Settings header

**Model: High Effort** — Workspace identity mutations require server-side permission enforcement and immutable type guarantees, not only a layout change.

- [x] Enforce in the service/repository route that a workspace's type can never be changed after creation and that only a workspace administrator or super admin may rename it; the browser must not be the authority.
- [x] Move the Workspace Users button to the top right of Workspace Settings across from the "Workspace Settings" heading, with a person/head icon and the shortened label "Users"; its function does not change.

Acceptance criteria:

- Workspace type is immutable through browser and direct requests, rename authorization is server-enforced, and the unchanged Users action occupies the specified Settings-header position.

#### Version 0.33.17.7.7 - User Settings layout, timezones, and Leave Workspace warnings

**Model: Medium Effort** — This is one existing User Settings surface with unchanged profile, notification, workspace-creation, and membership-removal contracts.

- [x] User Settings layout: move Profile up directly below Appearance; rename the Workspaces box to "Workspace Creation" and move it to the bottom of the page, full-width within the user-settings-grid, collapsible and starting collapsed, with a caret.
- [x] Make Notification Preferences full-width within the user-settings-grid as a single column with "Notification Grouping" at the top, fixing the current two-column layout that cuts off all adjustable settings.
- [x] Restore the complete timezone list (non-USA timezones are currently missing) and append a "(UTC -X:00)"-style offset to the end of each timezone name for convenience and standardization.
- [x] Move Leave Workspace out of Workspace Creation into its own box with prominent warnings that an administrator must restore access; clicking it opens an in-app confirmation with the same consequence wording.
- [x] Preserve the governing membership contract: Leave Workspace removes only the signed-in user's membership and must not claim to delete or schedule deletion of the workspace or its data. Workspace deletion is a separate explicit action in `0.33.17.7.13`.

Acceptance criteria:

- User Settings matches the specified order, widths, and collapse behavior; all supported IANA timezones display current UTC offsets; Leave Workspace is isolated with layered, accurate membership-removal warnings.

#### Version 0.33.17.7.8 - Preferred landing pages for login and workspace switching

**Model: High Effort** — Persisted user navigation preferences affect authentication and workspace switching and may require a forward schema migration.

- [x] Replace the current change-workspace behavior (resurfacing the exact prior page, which can produce an unformatted "Page not found" — for example switching from a business workspace's User Admin to a personal workspace) with navigation to a user-preferred landing page.
- [x] Add two dropdown settings in Settings -> User under "User App Preferences": one for initial login, one for changing workspaces. Each offers: Dashboard, Workbench, Actions: Tasks, Actions: Notes, Actions: Lists.
- [x] Validate the stored destination against the target workspace's enabled modules and the user's access; use Dashboard as the deterministic safe fallback when the preferred page is unavailable, invalid, or no longer permitted.

Acceptance criteria:

- Login and workspace switching land on an available configured page or Dashboard fallback, and no workspace switch produces an unformatted error page.

#### Version 0.33.17.7.9 - User Administration Add User and scoped initial roles

**Model: High Effort** — Cross-workspace membership creation and scoped initial roles are permission and account-enumeration boundaries.

- [x] Make Add User search by exact normalized email for an existing installation account before creating a new account, then add/activate that account in the selected workspace without duplicating the user identity. Return only the minimum safe match needed for the action; do not expose unrelated memberships or an install-wide user directory.
- [x] Add a workspace dropdown inside Add User that defaults to the current workspace and activates membership in the selected workspace. Non-super-admins see only workspaces where they can manage users; super admins may select any active workspace in the installation.
- [x] Offer all roles in the initial-role dropdown with conditionally appearing scope selectors: choosing a client admin/user role reveals a client selector; choosing a project admin/user role reveals a project selector. (The current three-option limit exists because `public/js/user-admin.js` filters the dropdown to `workspace`/`global` `assignable_scope_type` roles, since the form has no scope picker — this slice adds the scope pickers.) Personal/family workspaces never offer client roles or client selectors.
- [x] Only a super admin may create a super admin.
- [x] Enforce workspace, role, and client/project-scope authorization in the service layer and prove Personal/Family shaping, non-super-admin workspace limits, and super-admin creation limits with permission regressions.

Acceptance criteria:

- An authorized administrator can add an existing or new account to an administrable workspace and assign every allowed initial role with the correct scope; unauthorized workspace discovery, role escalation, account enumeration, and Personal/Family client scoping are blocked.

#### Version 0.33.17.7.10 - User self-deletion, deactivation messaging, and durable attribution

**Model: High Effort** — Account retirement changes authentication, membership, retention, attribution, sessions, and permission behavior.

- [x] Delete User must not be available for the signed-in user; render it disabled like other protected-user actions and enforce the self-target rejection server-side.
- [x] Add a self-service Delete Account action under Settings -> User with explicit confirmation. Treat deletion as credential/session retirement plus membership deactivation, not hard deletion of the identity row or authored records.
- [x] Preserve the user's email address and display name for audit and task/note/file/list attribution so normal history never degrades to a raw-ID `Deleted User ...` placeholder; make the confirmation copy state that all contributions and attribution are retained.
- [x] Fully inactive/deleted accounts receive a clear but non-enumerating login denial such as "These credentials do not have access to this installation"; the response must not distinguish unknown, deleted, or inactive accounts to an attacker.

Acceptance criteria:

- Self-deletion cannot be invoked through User Administration, retires credentials/sessions/memberships through User Settings, preserves readable historical attribution, and keeps login responses non-enumerating.

#### Version 0.33.17.7.11 - Recurring-task audit client/project attribution

**Model: Medium Effort** — This is one confirmed Tasks-to-Audit metadata defect with an existing reproducible row.

- [x] Fix audit-log rows for recurring-task status updates that omit client and project (filtering Audit activity by client surfaced rows with neither populated; example audit id `e2ad489e-686d-4794-b8bb-5beb2a9b6fd6`).
- [x] Correct the Tasks-owned audit producer/read metadata without weakening Audit permission or record-visibility filtering, and add a focused recurrence-status regression.

Acceptance criteria:

- Recurring-task status audit rows carry readable client/project attribution when available and remain correctly scoped and filterable.

#### Version 0.33.17.7.12 - Workspace-scoped export and backup package

**Model: High Effort** — A workspace-only export crosses module-owned data, Files, secure content, permissions, and restore integrity without allowing cross-workspace leakage.

- [x] Define and implement the supported backup/extract mechanism for one workspace before any deletion can be requested. Include the workspace records and attachment artifacts needed for recovery while preserving provider-neutral storage and module ownership.
- [x] Exclude other workspaces and inaccessible secrets, document Secure Notes key/recovery handling explicitly, produce a manifest/checksum, and provide a repeatable validation/restore smoke against a disposable target.
- [x] Gate export to super admins and administrators of that workspace, audit the request/result safely, and expose the action from Workspace Settings with clear scope and limitations.

Acceptance criteria:

- An authorized administrator can create and validate a self-contained, checksum-identified workspace backup without cross-workspace data or unsafe secret leakage, and the package has a proven disposable restore path.

#### Version 0.33.17.7.13 - Workspace deletion request, grace period, and restore

**Model: High Effort** — Scheduling workspace retirement requires a forward migration, authorization, session-state rules, audit, and reliable recovery without yet crossing the irreversible purge boundary.

- [x] Add an explicit Delete Workspace action separate from Leave Workspace, available only to super admins and administrators of that workspace, and require a successful recent workspace export from `0.33.17.7.12` or an explicit typed acknowledgement that no current export exists.
- [x] Mark the workspace pending deletion for 30 days with recorded requester, request time, and purge-after time; provide authorized restore/cancel during the grace period and make the state visible without exposing raw IDs.
- [x] Define active-session, membership, navigation, module/job, Files, Search, and notification behavior while pending deletion. Do not overload membership `inactive` state as the workspace lifecycle store, and do not physically delete workspace data in this slice.
- [x] Protect the installation's required owner/admin recovery path and add permission, restart, grace-period, and restore regressions plus database integrity proof.

Acceptance criteria:

- A deletion request is explicit, permission-checked, export-aware, visible, durable across restart, and cancelable for 30 days without deleting data or confusing Leave Workspace with deletion.

#### Version 0.33.17.7.14 - Final workspace purge and cross-workspace isolation

**Model: High Effort** — Irreversible workspace cleanup crosses every workspace-owned table and artifact and must be exactly-once, restart-safe, and demonstrably isolated.

- [x] After the `0.33.17.7.13` grace period expires, perform final purge through the existing job/explicit-maintenance boundary; a normal page request must never coordinate destructive cleanup.
- [x] Inventory and remove the target workspace's module records, framework records, Files artifacts/attachments, Search rows, jobs, notifications, sessions/memberships, and lifecycle row in foreign-key-safe order while preserving retained install-level identities and attribution required by `0.33.17.7.10`.
- [x] Make purge idempotent and resumable after interruption, record only safe tombstone/audit evidence outside the deleted workspace, and prevent stale workers or sessions from recreating data after purge begins.
- [x] Add disposable multi-workspace regressions for too-early refusal, exact-time eligibility, interrupted retry, exactly-once completion, Files cleanup, no cross-workspace deletion, and `PRAGMA integrity_check`.

Acceptance criteria:

- An expired pending-deletion workspace is purged exactly once through the maintenance/job boundary, an interrupted purge can resume safely, and another workspace's database rows and artifacts remain byte-for-byte outside the deletion scope.

#### Version 0.33.17.7.19 - Settings footer action alignment repair

**Model: Medium Effort** — This is a contained shared-layout correction for the existing universal Settings action row.

- [x] Make the bottom Revert/Save row occupy the available Settings page width so its existing end alignment places both actions at the bottom right on every protected Settings surface.
- [x] Preserve the universal top action pair, action ordering, dirty/disabled/flash states, save routes, and unsaved-navigation behavior.
- [x] Strengthen the existing Settings page-actions regression so a shrink-wrapped footer row cannot silently restore the bottom-left placement.

Acceptance criteria:

- Workspace, User, Files, Tasks, Time Tracking, and other module Settings pages place their shared bottom Revert/Save pair at the bottom right without changing Settings transaction behavior.

#### Version 0.33.17.7.20 - Remaining manual review and pre-preview correction closeout

**Model: Medium Effort** — This is a bounded evidence/bookkeeping closeout after implementation risk has been isolated into the preceding children.

- [x] Complete and timestamp every still-open applicable result in `archive/0.33.17.7-pre-testing.md` across the documented desktop/mobile, Light/Dark, workspace-type, administrator/restricted-user, keyboard/focus, two-session, and representative authenticated-write checks.
- [x] Mark an item not applicable or externally blocked only with a concrete reason. TLS/proxy-only testing remains assigned to 0.33.19.6 after the real preview environment exists; do not claim it locally.
- [x] If review finds a new pre-preview defect, record it, create a separately sized next available child, and leave this closeout open. Do not implement surprise fixes inside this session.
- [x] After all correction children and manual results are complete, reconcile the umbrella checkboxes, owning docs, changelog, roadmap/archive handoff, version metadata, canonical `npm run verify:slice`, restart, and `/api/app-info` qualified-version proof.

Acceptance criteria:

- The review inventory has an explicit result for every applicable changed surface, every confirmed pre-preview defect is closed in its own regression-covered child, external TLS evidence is not fabricated, and the running app reports the expected canonical and qualified version metadata.

### Version 0.33.17.8 - Optional 30-Day Remembered Sessions

**Model: High Effort** — Login persistence changes both the browser cookie and authoritative server-side session lifetime, so security, revocation, forced-password-change, and responsive-login contracts must move together.

Purpose:

Let a user deliberately keep a trusted browser signed in for 30 days without changing the normal configured session lifetime for users who do not opt in.

- [x] Add an unchecked `Remember me for 30 days` checkbox to the public login form. Keep the checkbox and wording on one line, left-aligned with the Email Address and Password field edges, in the same action row as the right-aligned `Log In` button, with the checkbox/label group vertically centered against the button on supported desktop and mobile widths.
- [x] Send one explicit boolean login value. Treat an omitted or false value identically to today's behavior and continue using `LONGTAIL_SESSION_TTL_SECONDS`; reject invalid types instead of relying on browser truthiness.
- [x] When selected, create an absolute 30-day session (`2592000` seconds) and use the same lifetime for both the existing authoritative `sessions.expires_at` value and the `HttpOnly` session cookie `Max-Age`. Reuse the existing session store; do not add a parallel remembered-login token or change the canonical normal-session configuration.
- [x] Preserve the existing `Secure`, `SameSite`, path/domain, trusted-proxy, CSRF, login-throttle, audit, and random opaque session-token contracts. Remembered sessions must not slide or renew silently, and logout, expiry, password reset/change, user deactivation, individual revocation, and bulk workspace logout must continue to invalidate them immediately.
- [x] Preserve the restricted forced-password-change flow. A checked preference must not grant an unrestricted 30-day session before the required password change succeeds; after successful completion, the resulting session may adopt the requested remembered lifetime without requiring the user to submit the temporary password again.
- [x] Keep Active Sessions expiry readouts accurate for normal and remembered sessions, and add focused service/route/cookie regressions plus desktop/mobile rendered coverage for unchecked default behavior, checked 30-day behavior, validation, keyboard/label activation, exact action-row alignment, password-change-required handling, expiry, and every existing revocation path.
- [x] Run `npm run docs:suggest`, update only the owning authentication/runtime and rendered-test documentation, record the shipped behavior in `CHANGELOG.md`, and complete the normal canonical local verification and live runtime-version proof.

Acceptance criteria:

- With the checkbox absent, omitted, or unchecked, login behavior and the configured normal session lifetime are unchanged. With it checked, a successful completed login remains valid for no more than 30 absolute days across browser restarts and server restarts unless an existing expiry or revocation action ends it sooner.
- The login action row matches the specified alignment at supported desktop and mobile widths, remains keyboard- and screen-reader-operable, and does not disturb the required password-change form.

### Version 0.33.17.9 - Preview release closeout

**Model: High Effort** — Release readiness must combine packaging, restore, CI, security, and live deployment evidence.

- [ ] Run packaging/clean-boot checks, Docker and bare-metal upgrade/rollback exercises, the disposable restore drill, security and permission gates, `npm run closeout`, affected/full regression routing, and the full release gate.
- [ ] Confirm the 0.33.17.5 `nightly` -> `main` promotion, isolated GitHub Environments, immutable manual preview deployment, deployed-SHA readout, and hotfix/reconciliation exercises have all been proven before invitations.
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

### Version 0.33.18.2 - First-Party Module Registry De-Hardcoding and Runtime Activation

**Model: High Effort** — Module loading sits ahead of migrations, routes, permissions, registries, jobs, and workers. A partial conversion could make the catalog appear dynamic while leaving module-specific startup coupling or import-time side effects behind.

Purpose:

Replace the manually edited first-party import/list in `src/core/modules/registry.js` with a deterministic generated bundled-module catalog, while preserving explicit, auditable loading and the existing synchronous `npm start` runtime. Separate module declaration from module runtime activation so importing a module cannot mutate framework registries before the complete manifest graph has validated.

- [ ] Separate the registry engine from the bundled first-party module catalog. The engine must not import or name individual workflow modules.
- [ ] Define one canonical, side-effect-free module entry export containing the validated manifest plus optional explicit app/worker activation hooks.
- [ ] Add a generator that discovers only repository-owned `src/modules/*/module.js` entries and emits a deterministic tracked ESM catalog.
- [ ] Add `modules:registry:generate` and `modules:registry:check`; the check must fail on a missing, extra, reordered, or stale generated entry.
- [ ] Validate directory-name/manifest-ID agreement, canonical export shape, duplicate IDs, unresolved dependencies, and deterministic ordering before database mutation or runtime activation.
- [ ] Move module-owned import-time registrations into explicit activation. Existing Tasks search/job/sweep registration and Time Tracking search/report-runner registration are initial consumers.
- [ ] Remove module-specific startup imports from framework app and worker bootstrap where the behavior belongs to a module.
- [ ] Preserve the exact pre-conversion inventory of module IDs, routes, migration sources, permissions, API scopes, views, browser assets, settings, hooks, and contribution IDs.
- [ ] Update module-development, module-contract, architecture, startup, and packaging documentation.

Non-goals:

- Do not load arbitrary code from an operator-writable runtime directory.
- Do not build third-party plugin installation, update, removal, signing, compatibility, or marketplace behavior.
- Do not make the database the source of executable module paths.
- Do not convert the registry API to broadly asynchronous lookup.
- Do not add hidden load-order behavior; activation follows validated dependencies with a stable module-ID tie-breaker.

Acceptance criteria:

- Adding a valid first-party fixture module requires no hand edit to `src/core/modules/registry.js` or another framework-owned module list. 
- `registry.js` contains no import of a specifically named first-party module.
- Module entry imports perform no registry mutation before validation.
- Framework app and worker startup contain no first-party module-specific activation calls for converted behavior.
- A stale generated catalog, directory/ID mismatch, duplicate ID, missing canonical export, or unresolved dependency fails before migrations or other database changes.
- The before/after module and contribution inventories match exactly, and module sanity, typecheck, startup, migration, clean-clone, packaging, affected, and full release gates pass.

### Version 0.33.18.3 - Digestible module-manifest composition pilot

**Model: High Effort** — High-volume source movement can silently alter contribution IDs, ordering, permissions, or startup validation.

- [ ] Keep one composed module definition exported to the registry and passing the same startup validator.
- [ ] Pilot concern-based source composition on at least two already-large first-party modules, using repository-conventional equivalents of `module.manifest.js`, `module.permissions.js`, `module.views.js`, `module.dashboard.js`, `module.workbench.js`, `module.events.js`, `module.notifications.js`, `module.api.js`, and `module.settings.js` only where each concern is substantial.
- [ ] Preserve module/contribution IDs, permissions, routes, runtime behavior, and registration order. Do not create empty boilerplate files for small modules or redesign the plugin loader.
- [ ] Document review thresholds and a complete example. Support Tickets, Knowledge Base, and Creator Studio use the proven composition pattern from their first implementation.

Acceptance criteria:

- Two large modules are easier to review while their composed manifests validate and behave identically; the pattern is documented without becoming mandatory boilerplate.

### Version 0.33.18.4 - First native browser ES-module conversion wave

**Model: High Effort** — Dashboard/Workbench loading, accessibility, and module-host boundaries are highly coupled and user-visible.

- [ ] Establish one explicit ES-module entry point per converted page and import conventions; select Dashboard, Workbench, or both from measured coupling/risk while they are materially changed.
- [ ] Preserve a temporary compatibility bridge for existing `LongtailForge`/`window` globals and prohibit new script-order global dependencies.
- [ ] Keep module-specific browser behavior and styling module-owned; framework hosts must consume contribution contracts instead of hard-coding module renderers.
- [ ] Split shared CSS source by framework anatomy and module ownership where useful while preserving practical release delivery, cache/versioning, CSP compatibility, accessibility, keyboard, responsive, and rendered behavior.
- [ ] Add entry-point loading, missing-import, behavior, accessibility, and keyboard regressions. Do not adopt a frontend framework or replace the renderer wholesale during 0.3x.

Acceptance criteria:

- The first strained surface loads through explicit imports with no new global-order dependency and no behavioral or accessibility regression.

### Version 0.33.18.5 - First formal test-suite streamlining review

**Model: High Effort** — Coverage retirement and suite budgeting require evidence across unit, integration, permission, database, and browser layers.

- [ ] Consume the regression runner timing output, report the slowest tests, and establish/review a suite-time budget.
- [ ] Identify duplicate coverage, obsolete historical checks, implementation-detail assertions, and overly broad setup; prefer fixture, isolation, selection, and setup improvements before deletion.
- [ ] Move pure functions, schema validation, and stable contract behavior toward Vitest where practical while retaining strong permission, workspace-isolation, database, migration, file-safety, and integration coverage and Playwright critical journeys/accessibility.
- [ ] Do not retire a regression because it is slow. Identify and demonstrate replacement coverage and record retirement evidence through the existing manifest/ratchet process.
- [ ] Keep the full release gate until replacement coverage is proven equivalent and update `docs/regression-suite.md` with the resulting policy and budget.

Acceptance criteria:

- The suite has a measured budget and evidence-backed consolidation plan; any retirement is traceable to equivalent coverage and no high-risk contract is weakened.

### Version 0.33.18.6 - Maintainability closeout

**Model: High Effort** — Closeout must prove source reorganization did not change runtime contracts.

- [ ] Update architecture, module-development, frontend, startup/database, and testing documentation to match the implemented boundaries.
- [ ] Name the two real consumers for every new generalized primitive or document the framework-wide exception.
- [ ] Run manifest/startup/loading focused tests, `npm run closeout`, affected regression routing, and the full release gates; compare runtime manifests and critical behavior before/after reorganization.

Acceptance criteria:

- Documentation matches the settled structures, the Two-Module Rule is evidenced, and no runtime behavior changed accidentally.

## Version 0.33.19 - Post-Preview UX Comprehensive Build and Deferred Review Fixes

**Model: High Effort** — This branch batches the pre-preview review findings that were deliberately deferred until after the friends-and-family preview with related short-term TODO work, spanning Reporting, Clients/Projects, Workbench, Tasks, and Notes surfaces.

Purpose:

Land the UI/UX corrections and workflow improvements identified during the `archive/0.33.17.7-pre-testing.md` review that can safely wait until after the friends-and-family preview ships, together with the Workbench and Tasks short-term items promoted from `TODO.md`. This branch also receives review findings that cannot be verified until the app runs behind real TLS on the deployed Linux environment (post-0.33.17.9), such as HTTPS/proxy session behavior.

Non-goals:

- No preview-readiness claims move here; anything required before invitations belongs under 0.33.17.
- No new module workflows beyond the corrections and settings surfaces named below.

### Version 0.33.19.1 - Reporting refinements

**Model: Medium Effort** — One contained control swap on an already-verified surface with routine shared-picker regression coverage.

- [ ] Convert the Reporting tag filter into the typable search-and-select control used across the rest of the interface.

Acceptance criteria:

- The Reporting tag filter matches the shared tag-picker interaction pattern.

### Version 0.33.19.2 - Clients and Projects list and modal polish

**Model: High Effort** — Many small corrections across the Clients/Projects lists, filters, and add/edit modals with shared-modal and framework-ownership implications.

Filters:

- [ ] Shrink the client/project filter fields slightly so the focus ring is not clipped by the outer box (applies to both Clients filters and Project Settings filters).
- [ ] Fix the project filter's "Workspace Client" selection displaying no results; it should display workspace projects.

Add Project modal:

- [ ] Vertically top-align the tagging box with "Parent Project" instead of leaving it in its own column.
- [ ] When adding a workspace project, the client box must show the workspace's name rather than the literal text "Workspace Project".
- [ ] "Add Client" must open a Clients-owned add-client modal instead of navigating to the Settings -> Admin -> Clients page, and the newly added client must refresh the modal's Client dropdown so it is immediately selectable.

Edit Project modal:

- [ ] Rebuild the edit modal to match the framework: wide-modal width, remove the box that encompasses the modal's interior, and remove the redundant collapsible heading below the project name (the modal's own "Edit Project: {{ projectName }}" heading is sufficient).
- [ ] Stack Status, Client, and Parent Project as three separate full-width rows in that order.
- [ ] Make Project tags full-width and unbounded by its own box.
- [ ] Visually connect Task Reminder defaults to the task-module section under Project defaults.

Billing defaults:

- [ ] Workspace projects default to "Billable" OFF.

List screens (Clients and Projects):

- [ ] Remove the extra horizontal rule separating tags/tag chips from the rest of each row.
- [ ] Fix text overrunning tag-chip borders and remove the redundant "Tags" label; place chips on the line directly below the client/project name without separation, mimicking the Actions -> Tasks list appearance.
- [ ] Restore the preceding hyphen "-" on correctly ordered child clients and child projects.
- [ ] Remove the "Actions", "Select client", and "Select Project" column headings (keep the columns) to eliminate wrapped headings and dead whitespace.

Add Client dialog:

- [ ] Rebuild the hard-coded/hand-built Add Client dialog (currently compressed and shifted) on the framework modal system.

Acceptance criteria:

- Clients/Projects filters, list rows, and add/edit modals match the shared framework modal and list patterns, with correct workspace-project labeling, hierarchy hyphens, default non-billable workspace projects, and no clipped focus rings or orphaned column headings.

### Version 0.33.19.3 - Workbench algorithm, In Progress behavior, and timer-card follow-ups

**Model: High Effort** — Focus-selection algorithm changes affect what work every user is steered toward.

- [ ] Blocked items appear only in "Review blocked work".
- [ ] "Start with what's due" includes due "In Progress" items (today they only appear in "Pick up where I left off").
- [ ] Make the Workbench algorithm adjustable: Workbench surfaces a settings section under Settings -> Admin -> Modules -> Workbench.
- [ ] Tasks with running timers appear in "Pick up where I left off", with running timers taking precedence, followed by active-but-paused timers.
- [ ] Starting a task timer and then checking/unchecking checklist boxes must preserve "In Progress" status; status must not return to open while a timer is running or time has been attached in the past.
- [ ] Clear the stale `?taskID=` URL parameter when the user changes focus or navigates to a different view/task (or immediately after load).
- [ ] Resolve the Focus Selection recommendation for a manual timer: "Open work" currently falls back to the generic Time Tracking page; decide whether Time Tracking exposes a stable modal/opener contract or the recommendation adopts clearer resume/navigation wording. Do not add a Workbench-owned timer editor.

Acceptance criteria:

- Focus modes surface the right work (blocked only in review, due In-Progress items in due mode, running timers prioritized), In Progress status survives checklist edits under a timer, stale task URLs clear, and the manual-timer recommendation has a deliberate, documented behavior.

### Version 0.33.19.4 - Task reminders, status transitions, and time estimates

**Model: High Effort** — Status automation and reminder nullability change task lifecycle behavior across views.

- [ ] Allow canceling individual reminders: a checkbox next to the "Date-Only Reminder 2" and "Timed Reminder 2" headings makes them nullable so they trigger no event notification (a 3-days-before reminder on a weekly task is unnecessary).
- [ ] Starting a timer or checking off checklist items automatically moves a task from Blocked to In Progress, clearing the blocked reason; if the timer is cancelled before being saved (and that was the cause of the transition), restore Blocked status and its reason.
- [ ] Promote Next Action: marking a task completed opens the edit-task modal with Next Action focused so the user can specify the follow-up, which is promoted to a "thing to do" in the Workbench; leaving it blank is fine and simply moves on.
- [ ] Add an estimated-time field on tasks (quarter-hour granularity) as groundwork for future day-planning; eventually estimates can be suggested from task context (client/project/tags) and prior completed time entries.

Acceptance criteria:

- Second reminders are individually cancelable; Blocked/In Progress transitions and blocked-reason restore behave as specified; completion prompts for a Workbench-promoted next action; tasks can carry quarter-hour estimates.

### Version 0.33.19.5 - Notes settings surface

**Model: Medium Effort** — A new module settings contribution following the 0.33.15 settings host contract.

- [ ] Give Notes a settings surface (it currently exposes none, which reads as incomplete): at minimum a notes settings box providing a list view/bulk editing of the catalogs.

Acceptance criteria:

- Notes contributes a settings surface with catalog list/bulk-edit management, following the shared settings anatomy and module-ownership boundaries.

### Version 0.33.19.6 - Deferred TLS/proxy-dependent review findings (placeholder)

**Model: Medium Effort** — Scope is unknown until the review runs against the deployed TLS environment.

- [ ] Reserve this slice for findings from the HTTPS/proxy session-behavior review (`archive/0.33.17.7-pre-testing.md`), which requires the real TLS proxy on the deployed environment after 0.33.17.9: sign-in through the proxy, refresh/navigation, workspace switching, logout/login, and cookie persistence without redirect loops or authentication loss.

Acceptance criteria:

- Every TLS/proxy-dependent review item has a recorded result, and confirmed defects are corrected and regression-covered here.

## Version 0.33.20 - Recurring Calendar Projection and Private Calendar Subscription Feed

Purpose:

Make the task calendar show recurring work the way users expect — every future occurrence of a repeating task visible up to its end date — and give users a read-only private calendar subscription they can add to Google Calendar, Apple Calendar, Outlook, or Thunderbird. Both are early-value calendar improvements built on the existing Tasks-owned calendar (`src/modules/tasks/tasks.service.js` `calendarWindow`/`taskCalendarRow`, `src/modules/tasks/tasks.repo.js` `readDueBetween`, `public/js/shared/task-calendar.js`) and the existing task recurrence engine (`src/modules/tasks/task-recurrence.service.js`, `task-recurrence.repo.js`, `task-jobs.service.js`, `task_recurrence_templates`).

Today the calendar only shows already-materialized task rows with a concrete `due_date`, and recurrence is materialized one open instance at a time (completion-driven, with a 12-hour backfill sweep). A weekly task therefore appears once and does not march forward across the grid. This version keeps that materialize-on-completion model but adds a read-time projection so the calendar and the feed can display future occurrences that have not been generated as rows yet, without mass-materializing them.

Decision:

Recurrence projection is a read-time concern owned by the Tasks module: the calendar read expands a recurrence template's RRULE across the requested window into virtual (ghost) occurrences and merges them with real rows, rather than pre-creating rows. A virtual occurrence is promoted to a real `tasks` row only when a user attaches instance-specific data to it (materialize-on-touch), reusing the existing `recurrence_template_id` / `recurrence_instance_date` linkage and `materializeInstance`. The subscription feed is split by ownership per the framework's Two-Module boundaries: the framework owns the private tokenized feed endpoint and its authentication/throttling (an intrinsically framework-wide auth surface, and an explicit Two-Module exception), and the Tasks module owns turning tasks into iCalendar content. The feed is read-only and provider-neutral; no two-way sync, no per-provider OAuth.

Dependencies and baseline:

- Builds on the existing Tasks calendar read path and recurrence engine; extends `calendarWindow` and reuses `buildRRule`/`parseRRule`/`nextOccurrenceDate` and `materializeInstance` rather than adding a second recurrence implementation.
- The feed endpoint is an internet-reachable, session-less, token-authenticated surface, so it depends on the 0.33.16 security hardening (trusted-proxy client-IP resolution, sensitive-endpoint throttling, secret handling, and the security-event stream) and lands after 0.33.17 preview readiness. Its token is hashed at rest and never logged, consistent with 0.33.16.8/0.33.16.9.
- Honors the calendar's current single-day model (`endDate === startDate`); this version does not introduce multi-day/spanning events.

Key decisions:

- **Projection is read-time, not eager materialization.** The calendar continues to generate at most one open real instance per chain on completion; virtual occurrences are computed on read and are never persisted unless touched. This avoids row bloat and preserves the existing completion-continuity and sweep behavior (`task-jobs.service.js`).
- **Dedup by instance identity.** A virtual occurrence for a given date is suppressed when a real row already exists for the same `(recurrence_template_id, recurrence_instance_date)`; the materialized row (which may carry an override) always wins. This dedup is shared by the calendar read and the feed serialization.
- **Materialize-on-touch preserves per-instance editing.** Adding a note, description, checklist change, assignee change, reschedule, or completion to a virtual occurrence first promotes it to a real row for that date, then applies the edit; all other occurrences stay virtual. This is the workaround for "attach data to one occurrence of a recurring task."
- **Bounded expansion.** Virtual expansion is capped by the existing `TASK_CALENDAR_WINDOW_MAX_DAYS` for the calendar and by a defined rolling window (past/future horizon) for the feed; open-ended templates (no `recurrence_end_date`) simply fill whatever bounded window is requested.
- **Feed content is native iCalendar with RRULE.** A recurring task serializes to one `VEVENT` with an `RRULE`; a materialized instance-override serializes as a `RECURRENCE-ID` exception to that series. Non-recurring tasks serialize as single `VEVENT`s. All-day vs timed derives from `due_time`, matching `taskCalendarRow`.
- **Per-user, single rotatable token.** Each user has one private feed URL scoped to the tasks they can read across the workspace; regenerating the token immediately revokes the old URL. The feed respects the same per-task read permission and workspace scope as the in-app calendar.
- **Provider-neutral, one-way, described as "Calendar subscription."** The UI and docs describe this as a read-only calendar subscription, never "Google Calendar sync." Google OAuth/API integration and any two-way editing are explicitly deferred.

Non-goals:

- Do not switch recurrence to eager mass materialization of many future rows, and do not change the completion-driven generation or the backfill sweep.
- Do not add multi-day/spanning calendar events, durations, or a standalone non-task event entity; a calendar entry remains a task.
- Do not build two-way calendar sync, write-back, free/busy publishing, or per-provider OAuth/API integration in this version.
- Do not add email/notification transport, `VALARM`-based push reminders as a delivery channel, or provider-specific feed variants.
- Do not weaken per-task read permission, workspace isolation, private/secure-content, or audit guardrails to serve the calendar projection or the feed.
- Do not generalize a framework "feed serving" facility for tasks alone; the framework owns only the tokenized-feed auth surface (a framework-wide exception), while iCalendar content stays module-owned until a second real content consumer exists.

### Version 0.33.20.1 - Read-time recurrence projection on the calendar

**Model: High Effort** — This changes the calendar read to merge computed virtual occurrences with real rows, and a mistake either drops real instances or double-shows occurrences.

- [ ] Extend `tasksService.calendarWindow` to expand each active, in-window recurrence template (`task_recurrence_templates`, `template_status = active`) into virtual occurrences across the requested range using the existing `task-recurrence.service.js` occurrence math, bounded by `TASK_CALENDAR_WINDOW_MAX_DAYS` and by each template's `recurrence_end_date`/RRULE `UNTIL`.
- [ ] Dedup virtual occurrences against materialized rows by `(recurrence_template_id, recurrence_instance_date)`, with the real row always taking precedence.
- [ ] Extend `taskCalendarRow` (or a virtual-occurrence sibling) so virtual entries carry `templateId`, `instanceDate`, and a `virtual: true` marker, while keeping `allDay`/`startDate`/`endDate` semantics identical to real rows.
- [ ] Apply the existing client/project scope and per-task read-permission filters to virtual occurrences exactly as for real rows; a user must never see a projected occurrence of a task they cannot read.
- [ ] Render virtual entries in `public/js/shared/task-calendar.js` with a clear not-yet-materialized affordance, reused by both the Calendar page (`public/js/calendar.js`) and the Dashboard calendar panel (`public/js/dashboard.js`).
- [ ] Add regressions: a weekly template with no end date shows one occurrence per week across the window; a template with an end date stops projecting after it; a materialized instance suppresses its virtual twin; a hidden/unreadable task projects nothing; and the reminder-marker lookahead still works.

Acceptance criteria:

- A recurring task appears on every applicable date within the calendar window, not only on its single materialized instance.
- Virtual occurrences respect end dates, permission/scope filters, and never duplicate a materialized instance.
- No new rows are created by opening or paging the calendar.

### Version 0.33.20.2 - Per-instance overrides via materialize-on-touch

**Model: High Effort** — Promotion-on-edit must be exactly-once and race-safe so an instance-specific edit cannot silently apply to the wrong date or spawn duplicate rows.

- [ ] Add a materialize-on-touch path: opening and saving instance-specific data (note, description, checklist change, assignee change, reschedule, completion) on a virtual occurrence first calls `materializeInstance` for that `(template, instanceDate)`, then applies the edit to the resulting row.
- [ ] Carry `templateId` + `instanceDate` from the virtual calendar entry through the task editor open path (`public/js/task-dialog.js`, `openCalendarTask`) so the save knows it is promoting a specific occurrence rather than editing the template.
- [ ] Make promotion idempotent and race-safe: concurrent promotion of the same occurrence resolves to one row (reuse/verify the existing instance-uniqueness guarantee), and promotion never disturbs the completion-driven generation of the chain's next open instance.
- [ ] Confirm the existing completion continuity and the 12-hour backfill sweep still behave correctly when the touched occurrence is not the current open instance.
- [ ] Add regressions: touching one occurrence materializes exactly that date and leaves siblings virtual; the materialized override then displays instead of its ghost (0.33.20.1 dedup); concurrent touch yields a single row; and completing a virtual occurrence both records completion and preserves normal next-instance generation.

Acceptance criteria:

- A user can attach instance-specific data to a single occurrence of a recurring task, and only that occurrence becomes a real, independently-editable row.
- Promotion is exactly-once, permission-checked, and does not disrupt recurrence generation or continuity.

### Version 0.33.20.3 - Framework private calendar-feed subscription and token authentication

**Model: High Effort** — This is a new session-less, internet-reachable authenticated read surface; getting token handling, revocation, or throttling wrong exposes private task data.

- [ ] Add a framework-owned private-feed token: one rotatable token per user, hashed at rest, never logged, verified constant-time, resolvable to the user + workspace for a feed request without a session cookie.
- [ ] Add a framework feed endpoint (for example `GET /feeds/calendar/:token.ics`) that authenticates by token only, resolves the requesting identity, and delegates content generation to a registered feed content provider by stable ID (Tasks is the initial and only provider).
- [ ] Key throttling on the 0.33.16.1 trusted client IP and apply the 0.33.16.3 sensitive-endpoint throttle; keep responses non-enumerating (an invalid/rotated token is indistinguishable from an unknown one) and never reveal account or workspace existence.
- [ ] Add token lifecycle: generate, rotate (immediately revoking the prior URL), and disable, gated behind the user's own session; emit a 0.33.16.8 security event on generate/rotate/disable.
- [ ] Set correct read-only caching/`Content-Type: text/calendar` semantics and a conservative refresh hint, and ensure the endpoint bypasses CSRF/session-cookie assumptions safely (token auth only, no state change).
- [ ] Document the token/feed auth surface as an explicit intrinsically-framework-wide Two-Module exception (authentication), with the content contract left to modules.
- [ ] Add regressions: a valid token serves the owner's feed; a rotated/disabled/unknown token is rejected indistinguishably; the endpoint is throttled and forged-header-safe; the token never appears in logs; and rotation revokes the old URL on the next request.

Acceptance criteria:

- A per-user, rotatable, hashed feed token authenticates a session-less read of the user's calendar, permission- and workspace-scoped.
- The feed endpoint is throttled, non-enumerating, secret-free in logs, and revocation takes effect immediately.
- The framework owns only the feed auth/serving seam and dispatches content to a registered provider by ID.

### Version 0.33.20.4 - Tasks iCalendar content serialization

**Model: High Effort** — iCalendar correctness (RRULE, RECURRENCE-ID overrides, time zones, escaping) determines whether real calendar clients render the feed without corruption.

- [ ] Register a Tasks feed content provider that serializes the user's readable tasks into standards-compliant iCalendar (`VCALENDAR`/`VEVENT`), reusing `taskCalendarRow` semantics for all-day (`due_time` absent) vs timed events and the same per-task read-permission and workspace scope as the in-app calendar.
- [ ] Emit recurring tasks as a single `VEVENT` with an `RRULE` derived from the template (reusing `buildRRule`/the template's stored `rrule`), honoring `recurrence_end_date` as `UNTIL`, and serialize each materialized instance-override as a `RECURRENCE-ID` exception to its series (shared dedup with 0.33.20.1).
- [ ] Produce stable, provider-neutral `UID`s (task/instance identity) and correct `DTSTART`/`DTEND`/time-zone (`due_timezone`/`due_at_utc`) handling, with proper iCalendar line folding and text escaping.
- [ ] Bound the feed to a defined rolling window (past/future horizon) rather than unbounded history/future; open-ended recurrences fill the future horizon via RRULE.
- [ ] Validate output against Google Calendar, Apple Calendar, Outlook, and Thunderbird import, and add a serialization regression (fixtures for single, all-day, timed, recurring, and overridden-instance tasks) asserting valid structure and correct RRULE/RECURRENCE-ID.

Acceptance criteria:

- The feed imports cleanly into Google, Apple, Outlook, and Thunderbird and renders one-off, all-day, timed, and recurring tasks correctly.
- Recurring tasks appear as native RRULE events with per-instance overrides expressed as RECURRENCE-ID exceptions.
- The feed exposes only tasks the token's user may read, within a bounded window.

### Version 0.33.20.5 - Subscription UI, documentation, and closeout

- [ ] Add a user-facing "Calendar subscription" control (in user settings, aligned with the 0.33.15 settings host if landed) to reveal, copy, rotate, and disable the private feed URL, described as a read-only subscription and never as "Google Calendar sync."
- [ ] Provide short in-product guidance/links for adding the URL to Google Calendar, Apple Calendar, Outlook, and Thunderbird, and set expectations that client refresh is periodic (not real-time).
- [ ] Document the recurrence projection model (read-time virtual occurrences, materialize-on-touch), the feed auth surface, and the deferral of Google OAuth/two-way sync in `docs/tasks-module.md` and the relevant architecture/security docs; update `DECISIONS.md` and `CHANGELOG.md`.
- [ ] Record the Two-Module outcome at closeout: name the feed-auth seam as a framework-wide authentication exception and keep iCalendar content module-owned until a second real content consumer exists.
- [ ] Run `npm run check`, `npm run test:permissions`, the calendar/recurrence regressions, and the feed auth/throttle/serialization regressions; confirm `/api/app-info` after implementation.

Acceptance criteria:

- Users can self-serve a private calendar subscription URL, rotate/disable it, and add it to major clients, with accurate read-only "Calendar subscription" framing.
- The recurrence-projection and feed contracts are documented, the Two-Module exception is recorded explicitly, and the release-gate checks pass.

## Committed before 0.4x — Unversioned backlog

These items are committed to land before 0.4x but are not yet assigned a version. Assign each to a concrete 0.33.x/0.3x slice when its design and prerequisite architecture are ready; do not let them slide past 0.4x.

### Secure Catalogs

* [ ] Add a first-class secure policy to Notes catalogs. Security must be represented as authorization state rather than as an ordinary tag.
* [ ] Treat every note inside a secure catalog as effectively secure without requiring the application to copy a security tag or flag onto every child record.
* [ ] Ensure newly created and newly moved notes inherit the catalog’s secure policy immediately.
* [ ] Apply secure-note authorization consistently to note content, titles, attachments, previews, search, backlinks, activity surfaces, exports, APIs, notifications, connectors, and future indexing or AI features.
* [ ] Moving a note out of a secure catalog must not silently expose it. Preserve note-level security until an authorized user explicitly removes it.
* [ ] Record catalog-security changes and explicit note-security downgrades in the audit log.
* [ ] Secure catalogs and their contents must never be visible through Support View.

### Support View

* [ ] Add a read-only Support View that allows specifically authorized platform administrators to inspect the application from the perspective of an existing user for troubleshooting.
* [ ] Maintain separate actor and effective-user identities throughout the support session. Never replace the administrator’s authenticated identity with the target user’s identity.
* [ ] Require administrator reauthentication, a support reason or ticket reference, and a short session expiration before entering Support View.
* [ ] Rotate the session identifier when entering and leaving Support View, prevent nested sessions, and display a persistent banner identifying the viewed user and providing an immediate exit action.
* [ ] Record Support View start, exit, expiration, target user, administrator, organization, reason, request context, and all attempted actions in an append-only audit trail.
* [ ] Enforce read-only behavior on the server. Do not rely on disabled buttons or other frontend-only restrictions.
* [ ] Do not expose secure notes or catalogs, credentials, API keys, OAuth tokens, authentication factors, recovery codes, payment secrets, or other protected secret material.
* [ ] Prevent Support View from changing authentication, billing, organization membership, permissions, integrations, exports, destructive records, or other security-sensitive state.
* [ ] Add narrowly scoped, explicitly named support actions only when a demonstrated support need exists. Each action must record both the administrator and affected user and must remain attributable to the administrator.
* [ ] Do not implement automatic rollback-on-logout or generalized JSON before/after restoration. Use read-only inspection, explicit support commands, or an isolated disposable workspace clone when nonpersistent experimentation is required.
* [ ] Keep unrestricted write-capable user impersonation outside the committed pre-0.4x scope unless later support evidence demonstrates that it is necessary and a dedicated security review approves it.
* [ ] Allow self-hosted instance operators to disable Support View completely. Keep SaaS support permissions separate from ordinary workspace and instance-administration roles.

### Custom 404 and Error Handling

* [ ] Add friendly in-app handling for unknown routes, unavailable resources, authorization failures, conflicts, and unexpected server errors so users are never dropped onto a barren or unformatted Express response.
* [ ] Return structured JSON errors for API routes and appropriate branded HTML responses for browser routes.
* [ ] Keep production error messages generic and never expose stack traces, SQL details, filesystem paths, environment values, credentials, or other implementation details.
* [ ] Assign every unexpected error a correlation ID shown to the user and included with the complete server-side diagnostic log.
* [ ] Distinguish 401, 403, 404, 409, 500, and 503 behavior where appropriate.
* [ ] Avoid confirming the existence of protected resources when the requesting user is unauthorized.
* [ ] Ensure the fallback error surface remains usable when the database or another application dependency is unavailable.
* [ ] Add a frontend error boundary for client-rendering failures and provide one clear recovery action from every error surface.
* [ ] Place the final API and HTML not-found handlers after normal routes and place the final Express error middleware last.

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

## Version 0.36.6 - Asset Registry / Assets Module

**Model: High Effort** — Assets is a durable cross-module registry with typed records, lifecycle state, permission-safe asset-to-asset relationships, backlinks to work records, Search/Tags/Files integration, Quick Action Capture, date-based attention, and import/export. A mistake in ownership or relationship design would create cross-module coupling, stale links, permission leaks, or an unusable pseudo-CMDB.

Purpose:

Ship an official first-party **Assets** module for the individually identifiable physical and digital things a workspace owns, manages, supports, leases, assigns, or depends upon. The module is not retail inventory: it does not model SKUs, warehouse quantity, fulfillment, stock adjustments, or purchase-order receiving. An Asset is a durable record with a persistent identity and lifecycle — for example a server, VM, network device, workstation, printer, camera, UPS, software installation, SaaS subscription, domain, TLS certificate, vehicle, bicycle, trailer, generator, appliance, or specialized tool.

Assets must work across Business, Personal, and Family workspaces without forcing business-only concepts into personal use. A Business workspace may associate an Asset with a Client and Project; a Personal or Family workspace owns the Asset directly and must not receive Client fields or labels. The module should make it possible to answer:

- What is this?
- Where is it?
- Who owns, manages, or uses it?
- What does it run on, connect to, protect, back up, replace, or depend upon?
- What depends upon it?
- Which Tasks, Notes, Tickets, Knowledge Base articles, Lists, Files, and other records belong to it?
- What happened to it previously?
- What requires attention next?

Placement:

This version lands after 0.36.5 and before 0.37.0. That placement is deliberate:

- Support Tickets (0.34.x) and Knowledge Base (0.35.x) already exist as real relationship targets.
- Calendar and Account Home (0.36.0 and 0.36.5) already provide the hosts for due-date and cross-workspace attention integration.
- Assets then exists before Expanded Reporting (0.37.0), the read-only MCP connector (0.38.8), Creator Studio (0.39.0), the 0.3x documentation/stabilization checkpoint (0.39.9), the integration-surface audit (0.39.15), and the SQLite/PostgreSQL dual-backend work (0.40.0).
- The module therefore becomes part of those later contracts instead of being retrofitted after them.

Decision:

- Use **Assets** as the UI/navigation label and `assets` as the stable module ID. Documentation may call the module the **Asset Registry** when distinction from retail inventory is useful.
- Ship Assets as a first-party public-core module with `enabledByDefault: false`, `canDisable: true`, and historical read access for already-created records where the existing module lifecycle contract permits it.
- Make Assets available to Business, Personal, and Family workspaces. Workspace terminology may adjust descriptions and empty states, but stable IDs, routes, permissions, relationship keys, and stored values must not vary by workspace type.
- Keep Assets module-owned: Assets owns Asset records, Asset Types, Asset Locations, identifiers, lifecycle dates, asset-to-asset relationships, and the authoritative Asset-to-record link ledger.
- Reuse framework-owned Permissions, Search, Tags, Files, Audit, Events, Notifications, Reporting, Dashboard, Account Home, Quick Action Capture, view primitives, and Linked Context provider/shell contracts. Assets must not create duplicate engines for those concerns.
- Treat explicit relationships and links as the source of truth. Tags may improve classification, filtering, and optional propagation, but tags must never stand in for an Asset relationship.
- Keep type-specific fields Assets-owned. Asset Types may define validated field schemas rendered through the existing field factory, but this version must not invent a product-wide custom-field framework solely for Assets. Generalization waits for a second materially similar consumer under the Two-Module Rule.
- Store each Asset in exactly one workspace. Asset-to-Asset and Asset-to-record links are same-workspace only in the first release. Account Home may aggregate permission-safe attention summaries across workspaces, but it must never create cross-workspace relationships or bypass source-workspace permissions.
- Keep the first Assets release internal to authenticated workspace users. Client-visible Ticket or Knowledge Base projections must not expose an internal Asset name, code, identifier, relationship, or file merely because an internal record links to it.
- Reserve **Assets** for persistent managed things. Creator Studio media remains Files-backed media/library content; it must not reuse the same term for uploaded images, video, audio, captions, or scripts. Creator Studio may later link content work to real Assets such as cameras, microphones, vehicles, computers, or software.

Key data-model decisions:

- Keep universally useful fields as normal columns and type-specific fields in a validated attributes document.
- Use stable Asset Type field IDs and schema versions. Editing a type must not silently discard values already stored on existing Assets.
- Keep the human-facing **Asset Code** separate from workspace Tags. Asset Code may also be described in help text as an asset tag or inventory ID, but it is a unique identifier field, not a Tags-module assignment.
- Store additional non-secret identifiers separately so one Asset may have several useful identities: serial number, VIN, plate, hostname, domain, IP address, service ID, subscription ID, license ID, or external-system ID.
- Model lifecycle status separately from archive state. A retired or disposed Asset remains part of history and relationships; archiving controls normal list visibility and is not a substitute for retirement.
- Keep Locations Assets-owned rather than creating a framework-wide Locations primitive. Networks, environments, clusters, and platforms may themselves be Assets when relationship behavior is useful; physical/site placement uses Asset Locations.

Baseline lifecycle statuses:

- `planned`
- `active`
- `maintenance`
- `inactive`
- `retired`
- `disposed`

Type-specific operational states may live in validated attributes when a server, vehicle, subscription, certificate, or another type needs more precise language. Do not expand the universal lifecycle list until multiple real Asset Types require the same semantics.

Non-goals:

- Do not build retail inventory, SKU/quantity tracking, warehouses, fulfillment, reorder points, stock adjustments, or point-of-sale behavior.
- Do not build network discovery, SNMP polling, endpoint management, remote control, patching, vulnerability scanning, uptime monitoring, or an RMM agent.
- Do not build a password manager or secrets vault. Passwords, API keys, access tokens, recovery codes, private keys, certificate private material, and software activation secrets must not be stored in Asset fields, identifiers, search text, audit payloads, events, or ordinary Files. An Asset may store a human-readable reference such as `1Password -> Raymond Tec -> Mastodon Production`.
- Do not build accounting depreciation, tax basis, fixed-asset accounting, lease accounting, or a replacement for bookkeeping software.
- Do not build a full CMDB, NetBox replacement, vehicle fleet-management suite, maintenance work-order engine, parts inventory, fuel log, or software-license compliance scanner.
- Do not add a graphical topology map in the first release. Start with readable relationship lists, inverse labels, dependency/impact summaries, and filters. A graph view may be evaluated later from real use.
- Do not allow a relationship or tag to grant permission to another Asset or linked record.
- Do not cascade-delete related Assets, Files, Tasks, Notes, Tickets, Knowledge Base records, or other records when an Asset is archived, retired, disposed, or removed.
- Do not create automatic Task or Ticket rules in this version. Manual create/link actions are allowed; automation waits for the later rules/automation framework.
- Do not create one hidden/system Tag per Asset as a substitute for an explicit Asset link.
- Do not expose internal Assets through the client Ticket portal or public Knowledge Base in the first release.
- Do not add cross-workspace Asset links in the first release.

### Version 0.36.6.1 - Assets module contract, schema, Asset Types, and Locations

**Model: High Effort** — The first schema must support materially different Asset Types without collapsing into an unvalidated JSON junk drawer or a sprawling universal table.

- [ ] Add the `assets` first-party module through the generated bundled-module catalog and explicit runtime activation contract established in 0.33.18.
- [ ] Use the composed-manifest and native browser ES-module patterns established in 0.33.18 from the first implementation; do not create a new loading shape.
- [ ] Declare module metadata, navigation, protected views, browser assets, permissions, default role grants, searchable/taggable/attachable types, Linked Context provider metadata, events, notifications, reports, settings, help, seed hooks, and repair hooks only where the related slice implements them.
- [ ] Add module-owned tables or provider-neutral equivalents for:
  - [ ] `asset_types`
  - [ ] `asset_locations`
  - [ ] `assets`
  - [ ] `asset_identifiers`
  - [ ] later-slice relationship, record-link, and lifecycle-date tables
- [ ] Define `asset_types` as workspace-scoped type definitions with stable type IDs, name, category, description, icon/key, active/archived state, schema version, and validated field-schema metadata.
- [ ] Define the Asset Type field schema with stable field IDs and the existing supported field-factory types: text, number, boolean/toggle, select, multi-select, textarea, date, time, and safe URL where supported by the settled field contract.
- [ ] Keep field descriptors data-only. Validation, normalization, allowed values, and persistence remain Assets-owned; manifests and saved schemas must not embed executable functions.
- [ ] Preserve values when an Asset Type changes:
  - [ ] Renaming a field keeps its stable field ID and values.
  - [ ] Removing a field from the active schema does not silently delete saved values.
  - [ ] Existing legacy values remain recoverable/admin-visible until explicitly migrated or removed through reviewed tooling.
  - [ ] Type changes that would make stored values invalid require a preview/migration decision rather than blind coercion.
- [ ] Define `assets` common fields:
  - [ ] `asset_id`
  - [ ] `workspace_id`
  - [ ] `asset_type_id`
  - [ ] `name`
  - [ ] optional workspace-unique `asset_code`
  - [ ] lifecycle `status`
  - [ ] summary/description
  - [ ] optional Business-only `client_id` and `project_id`
  - [ ] optional `location_id`
  - [ ] optional assigned/responsible user
  - [ ] optional ownership/custody relationship such as owned, leased, rented, managed, or client-owned
  - [ ] manufacturer and model
  - [ ] acquisition/in-service metadata where generally useful
  - [ ] validated `attributes` document plus schema-version marker
  - [ ] `last_verified_at`, source, and optional external-system reference
  - [ ] retirement/disposal metadata
  - [ ] normal created/updated/archive metadata
- [ ] Define `asset_identifiers` for multiple non-secret identifiers per Asset, including kind, label, value, normalized value, primary marker, and timestamps.
- [ ] Support useful identifier kinds without hard-coding every possible domain: serial number, VIN, plate, hostname, domain, IP address, MAC address, service/subscription ID, license ID, external-system ID, and custom.
- [ ] Apply workspace-scoped uniqueness where semantics require it, especially Asset Code. Do not globally reject legitimate repeated model, hostname, IP, or vendor identifiers without a type-specific rule.
- [ ] Define `asset_locations` as an Assets-owned optional hierarchy with workspace, optional Business client context, parent location, location type, name, safe path label, status/archive state, and deterministic ordering.
- [ ] Validate Project/Client consistency through existing hierarchy services. Personal and Family workspaces must not receive or persist Client context from normal Assets routes.
- [ ] Seed protected starter template packs that can be cloned into workspace-owned types:
  - [ ] IT and Infrastructure: physical server, VM, container host, network device, workstation, printer, camera, UPS, storage device, hosted service.
  - [ ] Software and Online Services: application, SaaS subscription, domain, TLS certificate, license/subscription.
  - [ ] Vehicles and Equipment: car, truck, motorcycle, bicycle, trailer/camper, generator, machine, specialized tool.
  - [ ] Home and Family: appliance, electronics, safety equipment, household system.
  - [ ] General Business: office equipment, shop equipment, assigned device, leased/rented equipment.
- [ ] Treat starter templates as versioned defaults, not immutable assumptions about every workspace. Workspace admins may clone and adapt them without upgrades overwriting workspace-owned definitions.
- [ ] Add schema and migration regressions for a fresh database, an enabled/disabled Assets module, type-schema edits, preserved legacy values, workspace isolation, and provider-neutral SQL/dialect guardrails.

Acceptance criteria:

- A Business, Personal, or Family workspace can enable Assets and create a type definition appropriate to that workspace without changing framework code.
- Common fields remain queryable and type-specific values remain validated.
- Type edits preserve existing data and never silently discard or coerce stored values.
- Asset Codes and identifiers are searchable data, not disguised Tags or secrets.
- The schema uses the existing database facade and dialect seams and introduces no SQLite-only application SQL.

### Version 0.36.6.2 - Asset services, browser API, permissions, lifecycle, and history

**Model: High Effort** — Asset reads and writes must preserve workspace/client scope, lifecycle history, module disablement, and future integration contracts without turning generic framework services into Asset-aware code.

- [ ] Add Assets-owned repository, service, routes, normalizers, and policy helpers. Framework services must not query Assets tables directly.
- [ ] Add permissions with user-facing labels and descriptions:
  - [ ] `assets.view`
  - [ ] `assets.create`
  - [ ] `assets.edit`
  - [ ] `assets.archive`
  - [ ] `assets.manage_types`
  - [ ] `assets.manage_locations`
  - [ ] `assets.manage_relationships`
  - [ ] `assets.manage_links`
  - [ ] `assets.import_export`
- [ ] Define conservative default role grants. Owners/admins receive management permissions; normal members receive only the Asset permissions deliberately appropriate to the existing role model.
- [ ] Add browser service methods and routes for:
  - [ ] paged/filterable Asset listing
  - [ ] Asset detail
  - [ ] create and update
  - [ ] lifecycle transition
  - [ ] archive and restore
  - [ ] Asset Type list/create/edit/archive/clone
  - [ ] Location list/create/edit/archive
  - [ ] identifier add/edit/remove
- [ ] Keep list filtering and paging server-side with stable ordering and opaque cursor behavior consistent with other large first-party modules.
- [ ] Support filters for Asset Type, category, lifecycle status, Client/Project in Business workspaces, Location, assigned user, Tag, identifier kind/value, upcoming lifecycle date, archived state, and text query.
- [ ] Validate every mutation at the service boundary:
  - [ ] active workspace ownership
  - [ ] enabled-module state
  - [ ] permission and Client/Project scope
  - [ ] Asset Type availability and schema
  - [ ] Location availability
  - [ ] Asset Code/identifier normalization
  - [ ] lifecycle transition
  - [ ] no secret-designated field or identifier type
- [ ] Keep lifecycle transitions explicit. Retiring or disposing an Asset records who changed it, when, optional reason, and optional replacement Asset; it does not archive the record automatically.
- [ ] Do not expose normal hard delete. If later cleanup tooling is required, it must refuse deletion while relationships, record links, Files, or history remain and must be owner/admin-only with an audit trail.
- [ ] Add canonical Asset event types and safe summaries:
  - [ ] `asset.created`
  - [ ] `asset.updated`
  - [ ] `asset.status_changed`
  - [ ] `asset.retired`
  - [ ] `asset.disposed`
  - [ ] `asset.archived`
  - [ ] `asset.restored`
  - [ ] `asset.identifier_added`
  - [ ] `asset.identifier_removed`
  - [ ] relationship/link/date events added by later slices
- [ ] Keep event/audit payloads body-light and safe. They may contain Asset ID, safe name/code snapshot, type, workspace, actor, safe previous/new values, and source; they must not contain secrets, file contents, private key material, credentials, or unrestricted type attributes.
- [ ] Add an Asset history projection/timeline built from permission-safe event summaries and lifecycle records rather than exposing raw audit rows.
- [ ] Add module settings through the 0.33.15 settings contract where useful:
  - [ ] whether Asset Code is required
  - [ ] optional auto-generation prefix/pattern
  - [ ] default upcoming-attention window
  - [ ] optional Asset-to-linked-record Tag propagation, default off
- [ ] Add regressions for role grants, Client/Project scope, Personal/Family payload shaping, disabled-module behavior, historical read behavior, lifecycle transitions, archive/restore, audit/event safety, and concurrent conflicting edits.

Acceptance criteria:

- Assets can be created, edited, retired, disposed, archived, restored, filtered, and read through module-owned contracts with correct workspace and permission behavior.
- Lifecycle history remains readable without raw audit exposure.
- Disabling Assets removes active navigation/capture/integration contributions and blocks mutation without deleting historical records.
- Personal and Family routes never leak Client fields or labels.

### Version 0.36.6.3 - Assets UI, canonical openers, and module-contributed Quick Action Capture

**Model: High Effort** — The Assets surface must handle dense typed data and relationships while the Quick Action Capture change moves an existing app-shell hard-coded list into a validated multi-module contribution contract.

- [ ] Add Assets navigation under the existing Actions/workflow area through the module navigation contribution, with permission and enabled-module filtering.
- [ ] Add a protected Assets browse surface using established framework anatomy:
  - [ ] page header and primary action
  - [ ] bottom-left slide-out filter/navigation drawer
  - [ ] paged table/list with readable type, code, status, Client/Project, Location, assigned user, and due-attention summaries
  - [ ] stable empty/loading/error states
  - [ ] no raw UUIDs as labels
- [ ] Add a dedicated Asset detail surface rather than forcing overview, identifiers, relationships, related work, Files, dates, and history into one oversized list-row modal.
- [ ] Organize Asset detail into readable framework-owned panel anatomy:
  - [ ] Overview
  - [ ] Identifiers
  - [ ] Relationships
  - [ ] Related Work
  - [ ] Files
  - [ ] Dates and Attention
  - [ ] History
- [ ] Add one canonical Assets-owned create/edit dialog/opening contract and register:
  - [ ] `assets.add`
  - [ ] `assets.edit`
- [ ] Render common and Asset Type fields through the 0.33.14 field factory. Do not hand-build parallel field anatomy or create an Assets-only form engine.
- [ ] Keep complex Assets-owned behavior — type switching, identifier editing, schema validation, lifecycle transitions, relationship picking, and link management — behind module-owned handlers and routes.
- [ ] Promote Quick Action Capture actions to a validated, data-only module contribution if this has not landed earlier:
  - [ ] Add a `quickActions` manifest contribution with stable ID, label, description, icon, module action ID, sort order, required modules, required permissions, and required workspace capabilities.
  - [ ] Add `modulesService.listQuickActionContributions(workspaceId, session)` using the existing enabled-module, dependency, capability, and permission filtering pattern.
  - [ ] Keep the framework responsible for the drawer host, ordering, focus behavior, outside/Escape close, lazy module-action dispatch, current-page context, and fallback framework actions.
  - [ ] Keep modules responsible for the canonical opener, defaults, validation, save payload, and refresh behavior.
  - [ ] Migrate Timer, Task, Note, and List capture definitions out of the framework-owned `QUICK_ACTION_DEFINITIONS` list and into their owning modules without changing labels, order, permissions, or behavior.
  - [ ] Keep File, Reporting, and Search fallbacks framework-owned until they have real module/opener contracts; do not pretend a page link is a module create action.
  - [ ] Record the Two-Module evidence explicitly: Time Tracking, Tasks, Notes, Lists, and Assets are real consumers of the same Quick Action contribution contract.
- [ ] Add an Assets Quick Action:
  - [ ] Label: `Asset`
  - [ ] Description: `Register a device, service, vehicle, or other managed asset.`
  - [ ] Action: `assets.add`
  - [ ] Required permission: `assets.create`
  - [ ] Hidden when Assets is disabled or the user lacks permission
- [ ] Keep Quick Capture intentionally small: name, Asset Type, optional Asset Code, lifecycle status/default, and safe current Client/Project/Location context. The full editor remains available after creation.
- [ ] Accept current-page context in the canonical opener. When opened from a readable Task, Note, Ticket, Knowledge Base article, List, Client, or Project page, the dialog may offer to prefill context and create an explicit link after save; it must not silently create a relationship.
- [ ] Add keyboard, focus-return, narrow-screen, modal-stack, and stale-context regressions for the Assets opener and Quick Action drawer.

Acceptance criteria:

- Assets has a usable list/detail/editor workflow built from established framework anatomy and module-owned behavior.
- `Asset` appears in Quick Action Capture only when the module and permission permit it and opens the same canonical editor used elsewhere.
- Existing Timer, Task, Note, and List capture behavior remains unchanged after their descriptors move to module ownership.
- The framework Quick Action host no longer hard-codes those first-party workflow module IDs.

### Version 0.36.6.4 - Typed Asset-to-Asset relationships and dependency/impact views

**Model: High Effort** — Asset relationships form a durable directed graph. Direction, inverse labels, symmetric edges, cycle rules, retirement behavior, and permission checks must remain correct without turning the first release into a topology product.

Purpose:

Make relationships a first-class part of the Asset Registry rather than a note field. One stored relationship must render correctly from either Asset, answer both “what does this depend on?” and “what depends on this?”, and remain safe when an Asset is disabled, archived, retired, moved, or no longer readable.

- [ ] Add Assets-owned relationship tables or provider-neutral equivalents:
  - [ ] `asset_relationship_types`
  - [ ] `asset_relationships`
- [ ] Define relationship type metadata:
  - [ ] stable key
  - [ ] forward label
  - [ ] inverse label
  - [ ] directed or symmetric shape
  - [ ] optional acyclic rule
  - [ ] optional allowed source/target Asset Type categories
  - [ ] built-in/protected vs workspace-defined state
  - [ ] active/archive state
  - [ ] deterministic ordering
- [ ] Ship a conservative protected starter catalog:
  - [ ] `contains` / `part of`
  - [ ] `installed_on` / `has installed`
  - [ ] `runs_on` / `hosts`
  - [ ] `depends_on` / `supports`
  - [ ] `connected_to` / `connected to` (symmetric)
  - [ ] `backs_up` / `backed up by`
  - [ ] `protects` / `protected by`
  - [ ] `managed_through` / `manages`
  - [ ] `replaces` / `replaced by`
  - [ ] `paired_with` / `paired with` (symmetric)
- [ ] Allow workspace admins to create additional relationship types without modifying framework code. Custom types remain Assets-owned settings/data, not manifest fields.
- [ ] Store one canonical edge with source Asset, target Asset, relationship type, optional safe note, actor, and timestamps.
- [ ] Enforce:
  - [ ] same workspace
  - [ ] actor may read both Assets and manage relationships
  - [ ] no self-link
  - [ ] no duplicate effective edge
  - [ ] symmetric relationships canonicalize endpoint order so reverse duplicates cannot exist
  - [ ] directed relationships render the configured inverse label from the target side without storing a second mirrored row
  - [ ] only relationship types marked acyclic run cycle detection; do not impose a false universal tree on legitimate dependency or network relationships
- [ ] Do not allow a relationship to grant access. A user sees an edge only when allowed to read both endpoint Assets; otherwise the relationship is omitted or shown through the existing safe-unavailable pattern without leaking the hidden Asset name/code.
- [ ] Permit same-workspace cross-Client relationships only when the actor can read both Assets. Show both readable contexts and a clear warning because shared infrastructure may legitimately support multiple Clients, but one Client relationship must not imply access to the other.
- [ ] Add Assets-owned service methods and routes for create, read, update-note/type where permitted, and remove.
- [ ] Add relationship picker/search through the Assets provider and existing shared picker/list anatomy. The Assets module owns filtering, safe labels, status/type/location context, and deterministic result ordering.
- [ ] Add relationship detail panels grouped by meaning rather than one undifferentiated list:
  - [ ] `Depends on`
  - [ ] `Supports / depended on by`
  - [ ] `Runs on / hosts`
  - [ ] `Connected to`
  - [ ] `Backs up / backed up by`
  - [ ] `Protects / protected by`
  - [ ] `Contains / part of`
  - [ ] replacement history
  - [ ] other workspace-defined relationships
- [ ] Add bounded dependency/impact traversal:
  - [ ] direct upstream dependencies
  - [ ] direct downstream dependents
  - [ ] optional bounded multi-hop expansion with visited-node protection and explicit depth
  - [ ] readable path labels and status indicators
  - [ ] no unrestricted recursive query or browser-side permission reconstruction
- [ ] When retiring, disposing, or archiving an Asset, warn about readable dependents, active linked Tasks/Tickets, and missing replacement context. The user may continue after explicit confirmation; do not silently cascade status or rewire relationships.
- [ ] Support an optional replacement selection during retirement that creates `replaces` / `replaced by`. Do not automatically transfer identifiers, Files, record links, lifecycle dates, or every relationship.
- [ ] Emit safe events:
  - [ ] `asset.relationship_added`
  - [ ] `asset.relationship_updated`
  - [ ] `asset.relationship_removed`
- [ ] Add regression cases based on real structures:
  - [ ] DigitalOcean account -> production droplet -> Docker host -> Mastodon/PostgreSQL/Elasticsearch
  - [ ] site -> UPS -> protected switch/server
  - [ ] core switch connected to access point and camera network
  - [ ] old workstation replaced by new workstation
  - [ ] cross-workspace link rejected
  - [ ] unreadable endpoint omitted
  - [ ] symmetric reverse duplicate rejected
  - [ ] acyclic containment loop rejected
  - [ ] dependency cycle allowed where the relationship type does not claim acyclic semantics

Acceptance criteria:

- One canonical stored relationship renders correct forward and inverse meaning from both Assets.
- A user can immediately see what an Asset depends on and what would be affected by its loss or retirement.
- Relationship reads never leak an unreadable endpoint or cross a workspace boundary.
- Retirement preserves history and warns about impact without destructive cascade behavior.
- The first release remains a readable relationship registry, not an attempted graphical network mapper.

### Version 0.36.6.5 - Authoritative Asset-to-record links, backlinks, and Related Work

**Model: High Effort** — This slice crosses module boundaries and must provide bidirectional usefulness without duplicate link stores, cross-module table reads, hidden-record labels, or client-portal leakage.

Purpose:

Let an Asset become the durable context hub for every piece of work and knowledge associated with it. A user who searches for an Asset name, Asset Code, hostname, serial number, VIN, plate, or other identifier must be able to open that Asset and see every readable linked Task, Note, Support Ticket, Knowledge Base article, List, Project, and other supported record.

Decision:

Asset-to-record links are owned by one Assets ledger. Consumer modules may render and mutate those links through Assets-owned service/browser contracts, but they must not create separate Asset-link columns or duplicate Asset link tables. Existing module-owned relationships such as Note Linked Context, List linked records, Task parent/child relationships, and Ticket ledger entries remain intact; Assets adds a dedicated Asset relationship surface alongside them.

- [ ] Add `asset_record_links` or a provider-neutral equivalent with:
  - [ ] `asset_record_link_id`
  - [ ] `workspace_id`
  - [ ] `asset_id`
  - [ ] `target_module_id`
  - [ ] `target_type`
  - [ ] `target_id`
  - [ ] optional `link_kind`
  - [ ] optional short safe context note
  - [ ] actor and timestamps
  - [ ] active/removed state where history requires it
- [ ] Start with a small stable link-kind vocabulary:
  - [ ] `related`
  - [ ] `work`
  - [ ] `incident`
  - [ ] `maintenance`
  - [ ] `documentation`
  - [ ] `configuration`
  - [ ] `purchase`
  - [ ] `warranty`
  - [ ] `replacement`
- [ ] Keep link kind descriptive only. It does not grant permission, change target workflow state, or replace the source module's own status/type fields.
- [ ] Validate target module/type through active module contracts and Linked Context providers. Creation requires:
  - [ ] same workspace
  - [ ] Assets enabled
  - [ ] source module enabled
  - [ ] `assets.manage_links`
  - [ ] readable Asset
  - [ ] readable target record
  - [ ] recognized provider/type
- [ ] Add or complete Linked Context target providers for real initial targets where they do not already exist:
  - [ ] Task
  - [ ] Note
  - [ ] Support Ticket
  - [ ] Knowledge Base article/review candidate where visibility permits
  - [ ] List
  - [ ] Project
  - [ ] Client in Business workspaces
  - [ ] later Calendar event/content records only when their owning modules expose safe providers
- [ ] Register Assets itself as a `linkedContextProviders` target with safe Asset labels, type/status/location/Client context, source URL, deterministic ordering, and no secret identifiers.
- [ ] Add Assets-owned browser/service routes for:
  - [ ] list links by Asset
  - [ ] list Asset links by target record
  - [ ] create link
  - [ ] update link kind/context
  - [ ] remove link
  - [ ] permission-safe counts grouped by module/type/status
- [ ] Resolve target labels and URLs through provider-owned read contracts; do not query another module's table from the Assets repository or hard-code how Tickets, Notes, Tasks, Lists, Projects, or Knowledge Base records construct labels.
- [ ] Keep strict creation and soft readback:
  - [ ] new links to disabled, missing, unsupported, cross-workspace, or unreadable targets are rejected
  - [ ] existing links may outlive a target/module and render a safe `Unavailable linked record` state
  - [ ] stale rows never echo raw UUIDs, record IDs, hidden titles, internal Ticket text, secure Note content, or client-private metadata
  - [ ] permitted users may remove/repair stale links
- [ ] Add a Related Work panel on Asset detail:
  - [ ] group by Tasks, Tickets, Notes, Knowledge Base, Lists, Projects/Clients, and other supported providers
  - [ ] show safe label, source/type, status where provider supplies it, link kind, linked date, and source URL
  - [ ] filter by module/type, status, link kind, active/archived state, and text
  - [ ] show counts without counting unreadable records
- [ ] Add reusable Assets-owned target panels/helpers for supported source records:
  - [ ] Task detail/editor
  - [ ] Note detail/editor
  - [ ] internal Support Ticket detail
  - [ ] Knowledge Base editorial/internal detail
  - [ ] List detail/editor where useful
- [ ] Consumer panels call Assets-owned APIs/helpers and use shared picker/list anatomy. They must not read Assets tables, reconstruct Asset permissions, or persist duplicate Asset IDs in their own storage.
- [ ] Allow manual source actions:
  - [ ] create a Task linked to an Asset through the registered Tasks opener
  - [ ] create a Note linked to an Asset through the registered Notes opener
  - [ ] create or link an internal Ticket through the registered Tickets action when available
  - [ ] create a Knowledge Base review candidate only through the existing reviewed publication contract
- [ ] Pass safe defaults/context to module actions and create the Asset link only after the target record is successfully created and the user has confirmed the relationship.
- [ ] Keep client/public projections closed:
  - [ ] Client Ticket views do not show internal Asset links.
  - [ ] Public/client Knowledge Base views do not show Asset links unless a later version defines an explicit client-safe Asset projection.
  - [ ] Internal users may see the link only when they can read both records.
- [ ] Make Asset recovery through Search practical:
  - [ ] Asset Search indexes name, Asset Code, allowed identifiers, manufacturer/model, Location, safe type attributes, and Tags.
  - [ ] Search results open the Asset detail/Related Work handoff.
  - [ ] The Asset detail route is the authoritative permission-safe expansion that reveals every readable linked record.
  - [ ] Do not denormalize Asset names/codes into every linked record's `tags_text` or create a system Tag per Asset.
- [ ] Emit safe events:
  - [ ] `asset.record_link_added`
  - [ ] `asset.record_link_updated`
  - [ ] `asset.record_link_removed`
- [ ] Add regressions for duplicate links, disabled providers, stale targets, secure Notes, internal/client-visible Ticket boundaries, cross-workspace rejection, same-workspace cross-Client permission checks, no raw-ID fallback, and bidirectional panel consistency.

Acceptance criteria:

- Searching an Asset name, Asset Code, hostname, serial number, VIN, plate, or other allowed identifier leads to one Asset hub that lists every linked record the current user may read.
- Tasks, Notes, internal Tickets, Knowledge Base editorial records, Lists, and Projects can show and manage their Asset links without storing duplicate relationship data.
- Removing a link from either side updates the same authoritative ledger.
- Disabled/missing/unreadable targets fail safely and never leak labels or raw IDs.
- Internal Asset context never appears in client/public projections by accident.

### Version 0.36.6.6 - Search, Tags, Files, notifications, and activity integration

**Model: High Effort** — These integrations must use existing framework services and preserve the distinction between classification, attachment, search text, relationship data, permissions, and sensitive information.

- [ ] Register Assets as a framework-searchable type.
- [ ] Add an Assets-owned indexer that includes:
  - [ ] Asset name
  - [ ] Asset Code
  - [ ] safe identifier values
  - [ ] Asset Type/category
  - [ ] manufacturer/model
  - [ ] readable Client/Project and Location context where permitted
  - [ ] safe summary
  - [ ] safe type-specific attributes explicitly marked searchable
  - [ ] effective Tag text through the existing Tags/Search path
  - [ ] lifecycle/record status
- [ ] Exclude from search:
  - [ ] credentials and secret-like values
  - [ ] secure Note content
  - [ ] private keys/tokens/license activation secrets
  - [ ] unrestricted attribute JSON
  - [ ] hidden relationship endpoint labels
  - [ ] file contents unless the existing Files/Search contract independently permits them
- [ ] Register Assets as a Taggable type.
- [ ] Keep the distinctions explicit in UI/help:
  - [ ] **Asset Code** identifies one Asset.
  - [ ] **Identifiers** are searchable identities for one Asset.
  - [ ] **Tags** classify and group records.
  - [ ] **Relationships** connect Assets/records explicitly.
- [ ] Reuse existing Tag propagation where semantics are real:
  - [ ] allow Client/Project classification Tags to propagate to Assets through an Assets-owned resolver when an Asset carries that context
  - [ ] add optional Asset-to-linked-record Tag propagation through an Assets-owned resolver, default off
  - [ ] use existing materialized assignment source metadata and suppressions
  - [ ] never make propagation create/remove the underlying Asset link
  - [ ] never infer Asset visibility, lifecycle, ownership, or relationship type from a Tag
- [ ] Register Assets as an attachable type through the Files service.
- [ ] Support Files such as manuals, receipts, warranties, registrations, photographs, diagrams, service records, configuration exports, and vendor documents through the existing upload/scan/quarantine/download contract.
- [ ] Allow one stored File to link to both an Asset and related Task/Ticket/Note where useful; do not duplicate the stored object.
- [ ] Keep credential/private-key guidance explicit. Configuration exports containing secrets must not be treated as safe merely because Files allows the extension.
- [ ] Add follow/unfollow and notification support through framework contracts where useful:
  - [ ] lifecycle-date approaching
  - [ ] Asset assigned/reassigned
  - [ ] Asset status changed to maintenance/inactive/retired
  - [ ] relationship or link changed when the user follows the Asset
- [ ] Keep notification content safe and body-light; notification open must re-check current Asset and target-record access.
- [ ] Add a readable Asset Activity panel from event summaries:
  - [ ] lifecycle changes
  - [ ] identifier changes
  - [ ] relationship changes
  - [ ] record-link changes
  - [ ] lifecycle-date changes/completion
  - [ ] file attachment events where the existing Files summary contract allows it
- [ ] Add Search, Tags, Files, notification, event-summary, disabled-module, rebuild/repair, and permission regressions.

Acceptance criteria:

- Assets participates in global Search, exact Tag filters, Files, notifications, and safe activity through existing framework-owned services.
- Asset Code/identifiers, Tags, and relationships remain distinct concepts in storage and UI.
- Optional Tag propagation improves discovery without becoming the relationship source of truth.
- Search, events, notifications, and Files expose no secrets or unreadable relationship labels.

### Version 0.36.6.7 - Lifecycle dates, Calendar, Dashboard, Account Home, and Reporting

**Model: High Effort** — Date-based attention crosses Calendar, notifications, Dashboard, and Account Home and must not create a second task/reminder/work-order engine or cross-workspace leak.

- [ ] Add Assets-owned lifecycle-date records for durable Asset facts and obligations:
  - [ ] warranty expiration
  - [ ] subscription/license renewal
  - [ ] domain/certificate expiration
  - [ ] registration
  - [ ] inspection
  - [ ] planned maintenance/service
  - [ ] battery replacement
  - [ ] replacement/end-of-life review
  - [ ] custom date
- [ ] Store date kind, label, due date/time, status, reminder/attention window, optional safe note, completed/dismissed state, actor, and timestamps.
- [ ] Keep one-time lifecycle facts in Assets. For recurring work execution, create/link a recurring Task through the Tasks recurrence engine rather than building an Assets work-order recurrence engine.
- [ ] When the 0.36 Calendar contract supports module-owned event sources, register lifecycle dates as read-only Asset calendar items through that contract. Calendar must not query Assets tables or hard-code Asset date kinds.
- [ ] If the Calendar source contract is not sufficiently general after 0.36.0, keep lifecycle dates in Assets/Account Home and create linked Tasks; do not add an Assets-only framework calendar query.
- [ ] Add manual actions from a lifecycle date:
  - [ ] create linked Task
  - [ ] create/link Ticket for an incident/service request
  - [ ] mark complete/dismiss
  - [ ] reschedule
- [ ] Add an Assets Dashboard module-overview card consistent with the settled Dashboard boundary:
  - [ ] two or three safe metrics such as active Assets, due soon, and needs attention
  - [ ] at most one suggested/latest attention row
  - [ ] one primary handoff to Assets
  - [ ] no full inventory table, topology graph, raw identifiers, or inline editor
- [ ] Add an Assets attention provider for Account Home:
  - [ ] overdue/expiring lifecycle dates
  - [ ] Asset statuses requiring attention
  - [ ] optional unreadable-safe counts of open linked Tasks/Tickets
  - [ ] correct workspace-switch/open link
  - [ ] no raw event or cross-workspace record data
- [ ] Add initial Reporting contributions through the existing Reporting host:
  - [ ] Assets by type/status/Location/Client
  - [ ] upcoming renewals/expirations/maintenance
  - [ ] retired/disposed/replacement history
  - [ ] relationship/dependency summary
- [ ] Keep reports operational, not accounting-facing. Do not calculate depreciation, tax basis, book value, or compliance conclusions.
- [ ] Add deterministic time-zone/date-boundary behavior and regressions for due-soon/overdue calculations, Calendar visibility, Account Home workspace switching, Dashboard compactness, report permission filters, and disabled optional modules.

Acceptance criteria:

- Assets can surface upcoming warranty, renewal, inspection, certificate, registration, maintenance, and replacement attention without becoming a work-order engine.
- Users may turn an Asset date into a linked Task/Ticket through canonical module actions.
- Dashboard and Account Home show permission-safe summaries and handoffs, not full inventories or cross-workspace data.
- Reporting can summarize Assets without direct framework-to-Assets table coupling.

### Version 0.36.6.8 - CSV import/export and integration-safe API groundwork

**Model: High Effort** — Bulk import and external writes can create duplicate identities, invalid type attributes, cross-workspace relationships, or partially committed graphs if validation/transactions are weak.

- [ ] Add CSV export for:
  - [ ] Assets/common fields
  - [ ] type-specific fields
  - [ ] identifiers
  - [ ] Locations
  - [ ] lifecycle dates
  - [ ] Asset-to-Asset relationships
  - [ ] Asset-to-record link metadata where the user may read the target
- [ ] Add staged CSV import with:
  - [ ] upload/parse preview
  - [ ] column mapping
  - [ ] Asset Type selection/mapping
  - [ ] Location selection/mapping
  - [ ] common-field and type-schema validation
  - [ ] duplicate detection by Asset Code and selected identifier kinds
  - [ ] create/update/skip decision
  - [ ] dry-run summary
  - [ ] bounded transactional batches
  - [ ] per-row errors without exposing database internals
  - [ ] explicit final confirmation
- [ ] Keep relationship import separate from base Asset creation so endpoints can be resolved after Asset IDs/codes exist. Reject cross-workspace, self, duplicate, unreadable, or invalid-type edges.
- [ ] Keep Asset-to-record link import conservative. It may use stable external keys only when the target module exposes a supported resolver; never accept arbitrary table names or raw cross-module IDs as trusted input.
- [ ] Add module-owned public/integration API scopes where the existing public API contract is ready:
  - [ ] `assets.read`
  - [ ] `assets.write`
  - [ ] `assets.relationships`
- [ ] Expose stable API operations for Asset list/detail/create/update, identifiers, lifecycle dates, and relationships through module-owned service contracts and workspace-scoped API-key permissions.
- [ ] Preserve fields useful to scripts and future observations:
  - [ ] `external_system`
  - [ ] `external_id`
  - [ ] `last_verified_at`
  - [ ] safe source metadata
- [ ] Allow a script to update version/status/identifier/last-verified data through the normal API; do not add an agent, scanner, polling daemon, discovery engine, or unrestricted bulk SQL endpoint.
- [ ] Make the Assets read contract consumable later by the 0.38.8 read-only MCP connector without coupling MCP directly to Assets tables.
- [ ] Ensure the 0.39.15 public/integration-surface audit includes Assets and that the 0.40.0 dual-backend suite runs Asset CRUD, filters, attributes, identifiers, dates, relationships, and links against both adapters.
- [ ] Add import/export/API regressions for validation, dry run, atomicity, duplicate resolution, API scopes, rate/size bounds, workspace isolation, and provider-neutral SQL.

Acceptance criteria:

- A user can safely import an existing spreadsheet, preview every decision, and export a portable representation of Assets and relationships.
- External scripts can maintain safe Asset facts through scoped APIs without bypassing validation, permissions, or workspace isolation.
- API and import paths cannot create cross-workspace links or arbitrary cross-module references.
- The integration contract is ready for later MCP/automation work but does not pretend to be monitoring or discovery.

### Version 0.36.6.9 - Seeds, documentation, regression, and closeout

**Model: High Effort** — Closeout must prove the module works across Business, Personal, and Family use cases and that relationships, links, search, permissions, and later database work are not held together by special cases.

- [ ] Add deterministic safe seed scenarios:
  - [ ] Business/IT: hosted account -> production server/droplet -> container host -> Mastodon/PostgreSQL/Elasticsearch, with a UPS/network example, identifiers, lifecycle dates, Files, Notes, Tasks, Tickets, and typed relationships.
  - [ ] Business/client: client site -> firewall/core switch -> access point/camera/workstation, with readable Client/Project context and an internal Ticket.
  - [ ] Personal/Family: vehicle, bicycle, camper/trailer, generator/appliance, manuals, inspection/service dates, and linked maintenance Tasks/Notes without Client labels.
  - [ ] Software/services: domain, TLS certificate, SaaS subscription, application version, renewal/expiration dates, and credential-manager references without actual secrets.
- [ ] Add complete regression coverage for:
  - [ ] module catalog/activation and disablement
  - [ ] permissions and default roles
  - [ ] workspace and Client/Project isolation
  - [ ] Personal/Family payloads and terminology
  - [ ] type schema/version/value preservation
  - [ ] identifier normalization and uniqueness
  - [ ] lifecycle/archive/history
  - [ ] QAC contribution filtering and opener behavior
  - [ ] relationship direction/inverse/symmetry/cycle rules
  - [ ] retirement impact warnings
  - [ ] Asset-to-record links and stale/unreadable targets
  - [ ] secure Note and client Ticket/public KB boundaries
  - [ ] Search, Tags, propagation, Files, notifications, and activity
  - [ ] lifecycle dates, Calendar, Dashboard, Account Home, and Reporting
  - [ ] CSV/API validation and atomicity
  - [ ] database-dialect guardrails and migration/repair behavior
  - [ ] accessibility and narrow/wide responsive behavior
- [ ] Add current documentation:
  - [ ] user guide: what qualifies as an Asset, creating types/assets, codes vs Tags, relationships, Related Work, dates, Files, search, retirement
  - [ ] admin guide: enabling/disabling, permissions, type templates, locations, code generation, Tag propagation, import/export
  - [ ] developer guide: module ownership, schema, provider contracts, QAC contribution, relationship/link APIs, Search/Tags/Files declarations, events, reports, public API, no-cross-module-table rule
  - [ ] security guide: no credentials/secrets, safe credential-manager references, Files cautions, client/public boundary
- [ ] Update `docs/module-contract.md`, `docs/module-development.md`, `docs/architecture.md`, declarative-view inventories, search/tag/file documentation, Linked Context provider documentation, Quick Action Capture documentation, and public API documentation.
- [ ] Update `DECISIONS.md` with:
  - [ ] Assets vs retail inventory boundary
  - [ ] common columns plus validated type attributes
  - [ ] explicit relationships/links vs Tags
  - [ ] authoritative Assets-owned record-link ledger
  - [ ] no secrets
  - [ ] no cross-workspace relationships
  - [ ] Creator Studio media terminology distinction
- [ ] Run a formal test-suite streamlining review using timing output and the suite budget. Retire no permission, workspace-isolation, relationship, search, Files, import, migration, integration, or browser critical-journey coverage without demonstrated replacement evidence.
- [ ] Update `CHANGELOG.md`, package metadata, Help content, roadmap archive, feature/marketing proof registers, and `/api/app-info` verification as required by normal closeout.

Acceptance criteria:

- Assets ships as a disableable first-party module that works for IT/business and Personal/Family equipment without terminology distortion.
- Asset Types, identifiers, lifecycle, Locations, relationships, Related Work, Search, Tags, Files, Quick Capture, dates, attention, reporting, import/export, and scoped APIs are documented and regression-covered.
- A searched Asset becomes the durable hub for everything that Asset is, depends upon, affects, and has had done to it.
- The module stores no credentials/secrets, leaks no cross-workspace/client/public context, and introduces no framework-to-Assets table coupling.
- Later Reporting, MCP, Creator Studio, stabilization, integration-audit, and PostgreSQL work can consume documented Assets contracts rather than retrofitting special cases.

## Version 0.37.0 - Expanded Reporting and Invoicing

- [ ] Expanded reporting
- [ ] Invoicing
- [ ] Add Assets as a report-capable module and explicitly keep depreciation/fixed-asset accounting out of scope.

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
     - `assets:read`

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

**Note from 0.36.6 Assets module update**
- Rename `Assets/media` and `Asset library` to `Media files/library` so the word **Assets** remains reserved for the Asset Registry.
   - Allow Creator Studio records to link to real Assets such as cameras, microphones, computers, software, and vehicles through the Assets link contract.

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

- Add `Assets, Asset Types, relationships, Related Work, lifecycle dates, import/export, and no-secrets guidance` to the user/admin/developer documentation checklist.

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

**Note from 0.36.6 Assets Module**
- Include the Assets API, relationship API, and future MCP read path in the backend/module-boundary audit.

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

**Note from 0.36.6 Assets Module**
- Include Assets common fields, attributes JSON, identifiers, Locations, dates, relationship traversal, record links, filters, import transactions, and Search rebuilds in the dual-backend contract suite.

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
