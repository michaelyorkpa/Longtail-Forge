# Longtail Forge Agent Instructions

This file is the working guide for Codex and other coding agents in this repository.

## First Rule

Stay focused on the current roadmap slice.

Before changing code, read:

1. The active section of `ROADMAP.md`.
2. The current `DECISIONS.md`.
3. Relevant module/developer docs for the files being touched.

Do not implement from `TODO.md` unless the item has been promoted into `ROADMAP.md`.

Do not revive behavior from historical decisions or archives when current `ROADMAP.md` / `DECISIONS.md` supersede it.

## Source of Truth Order

When guidance conflicts, use this order:

1. Current user instruction in the active conversation.
2. The active `ROADMAP.md` slice and its acceptance criteria.
3. Current `DECISIONS.md`.
4. Relevant current docs in `docs/`.
5. Existing code contracts and tests.
6. Historical archives only as background context.

If current roadmap and decisions conflict, stop and ask for clarification before implementing.

## Scope Discipline

Every slice should have one main blast radius.

Do not broaden a slice because a helper makes extra work easy.

Do not add speculative features, alternate layouts, new workflows, new routes, new schema, or new settings unless the active roadmap slice explicitly asks for them.

When touching a converted surface, preserve module behavior unless the roadmap explicitly changes it.

When touching framework helpers, prove that at least two surfaces need the shared behavior or that the current slice explicitly calls for framework work.

## Slice Sizing and Delivery Cost

Ceremony cost scales with the number of slices, not the size of the app. Every slice pays roughly the same fixed tax (context read, focused regressions, version bump, CHANGELOG, docs, archive bookkeeping, full verification), so over-slicing burns tokens/credits for no extra output. See "Roadmap Slicing and Delivery Efficiency" in `DECISIONS.md`.

Keep one primary blast radius per slice, but do not slice below it:

- Do not give a measure-only step its own slice unless a later slice genuinely cannot start safely without the recorded result. Fold analysis into the change it informs (e.g. diagnose and fix a contained flake in one slice).
- Do not split a mechanical rollout into "proof pair" then "finish the rest" when the conversion is trivial once the shared helper exists. One slice builds the helper and rolls it across the cluster.
- When a branch includes suite/build speedups, sequence them first so later slices verify against a faster gate.
- If the roadmap already lists small adjacent slices with the same blast radius, propose merging them before implementing rather than running each ceremony separately. If unsure, ask.

Splitting is still correct when a slice would cross blast radii, touch coverage-risky consolidation at scale, or carry unresolved design risk. The goal is not "always merge" — it is "no ceremony without isolation value."

## Slice Model Signal

Every roadmap slice should carry a recommended-model callout so the operator can match model strength to the slice's reasoning depth, blast radius, and correctness risk — and avoid paying top-tier cost on low-risk work. When you author or refine a roadmap slice, add a callout as the first line under the slice header:

```
**Model: <tier>** — <one-line reason>
```

The signal is advice for the human operator, who selects the model; it is not something you act on yourself. Use this rubric:

- **High Effort** when any of these hold: real architectural/design decisions; cross-module or framework-wide blast radius; security, permission, or data-integrity implications; database/dialect/migration work; or high-volume mechanical edits where a subtle error would silently break behavior or drop test coverage. Mechanically heavy is not the same as low-risk — a large careful rollout belongs here.
- **Medium Effort** when all of these hold: a single well-specified blast radius; low correctness risk; no architectural decisions. This is the default for docs-only slices, measure/analysis-only slices, routine closeout ceremony, and small contained edits.

Docs slices default to GPT-5.4, because doc errors are low-cost and easily corrected. Bump a docs slice to GPT-5.5 Extra High only when the document is a governing, enforced contract whose exact wording is load-bearing (for example the module/database dialect contract).

If a branch mixes tiers, still sequence any suite/build speedups first regardless of their model tier.

## Product Philosophy

Longtail Forge is a context-preserving work system.

Core product rules:

- Never make the user rebuild context from memory.
- Never show twenty choices when one useful next action will do.
- Never punish drift; help the user recover.
- Make work visible, startable, and resumable.

Use broad workflow language such as "focus," "next action," "resume work," "work context," "review," "recovery," "structured context," and "startable work."

Do not use medical, diagnostic, or neurodivergence-specific language in UI, Help, README, or marketing copy unless a roadmap item explicitly asks for it.

When adding or changing a workflow, check whether the user can answer:

- What is this?
- Why does it matter?
- What is the next action?
- What information do I need?
- Where did I leave off?
- What changed since I last touched it?
- How do I get back on track?

## Module Mental Model

Use these boundaries when making implementation decisions:

- Workbench is the live work surface: active work, next actions, active timers, blocked/stale work, resumable work, and quick capture.
- Dashboard is an overview surface. It should summarize state without becoming the place where every action must happen.
- Tasks are commitments, outcomes, and assigned work.
- Time Tracking records effort and supports active work.
- Lists are operational execution aids, not Notes, inventory, purchasing, accounting, vendor management, manufacturing, or ERP.
- Notes are working context and reference memory, not Tasks, Tickets, or Knowledge Base.
- Knowledge Base is reviewed/curated knowledge, not active working notes.
- Files preserve source material and artifacts where work happens. The framework owns storage/security/download/lifecycle/shared UI; modules own the business meaning and placement.
- Search is a recovery surface.
- Tags classify records but do not control permissions, workflow state, visibility, billing, or module behavior.
- Notifications and reminders recover attention and timing.
- Help explains current shipped behavior only.

## Framework vs Module Ownership

Framework owns shared contracts and generic infrastructure:

- App shell and navigation composition.
- Protected/public view registration.
- Module registry and manifest validation.
- Runtime configuration.
- Auth, sessions, users, workspaces, roles, permissions.
- Tags, Search, Notifications, Files, Help, Audit, Events, Work Resume State.
- Shared view helpers, descriptors, modal shells, drawer/slideout shells, list/table wrappers, field grids, status/empty/error shells, focus return, and accessible defaults.
- Database adapter boundary and migration runner.

Modules own workflow meaning:

- Records and data shape.
- Services, repositories, and routes.
- Validation and save payloads.
- Permission implications.
- Human-readable record labels.
- Browser behavior adapters.
- Which actions exist and what they do.
- Refresh and focus behavior specific to the workflow.

Do not hard-code one module into another. Integrate through manifests, providers, services, events, tags, search, files, notifications, Help, permissions, and registered module actions.

Extensibility thesis: Longtail Forge is "VS Code for Work" — an extensible platform modified by declarative module/plugin contributions, not by forking the framework. Every extension point follows the VS Code `contributes` model (data-only validated manifests, behavior registered by stable ID, permission-filtered catalogs, one canonical store per concern), never the WordPress model (global untyped hooks, arbitrary plugin code, settings sprawl, plugins overriding anything). Protected framework parts — core modules like Clients/Projects, Users, and Tags ship `canDisable: false` — can never be disabled or overridden by a contribution. Governing statement: `DECISIONS.md` → Product North Star and Framework and Module Boundary.

## UI Conversion Rules

Shared UI helpers are layout tools, not product designers.

Before copying a pattern from another module, identify the primary work surface:

- Tasks: list-first.
- Notes: selected-note/detail-first.
- Files: compact listing-first.
- Lists: operational execution/detail-first.
- Dashboard: overview.
- Workbench: live action/recovery.

Framework-owned anatomy should be boring and reusable. Module-owned behavior should stay explicit.

Do not use a read-only proof to sneak in a new workflow. A proof may validate anatomy, but the final UX still has to match the module's purpose.

Do not introduce persistent split/detail panels, inspector-like panes, dashboard panels, or inline editors unless the roadmap explicitly asks for them.

Do not rebuild framework-owned anatomy by hand once the current slice has converted that anatomy to descriptors/shared helpers.

Do not force complex module-owned escape hatches into generic descriptors before their behavior is preserved and tested.

## Files-Specific Rules

Files recently drifted because generic read/detail anatomy was over-applied. The current direction is explicit:

- Files page is a compact workspace file recovery/audit listing.
- Main panel is the listing.
- Slide-out sidebar contains filters.
- No persistent inline Browse Summary.
- No selected-file detail dashboard.
- No inline Preview panel.
- No inline Metadata panel.
- No selected-row state driving page-level detail.
- Row click opens the File Context edit modal.
- Preview/View button opens the Preview modal.
- Download/Delete/Restore/Report/Quarantine actions are separate controls.
- Unsupported files are download-only.
- Future Inspector behavior is out of scope unless the roadmap explicitly adds it.

File Context editor:

- Attachment-scoped.
- Route-backed.
- Editable only for context fields such as Target, Project, and Business-only Client.
- No filename rename.
- No binary replacement.
- No storage move/provider/key controls.
- No scan/quarantine editing.
- No hard purge or permanent delete.
- No raw storage controls.
- No raw IDs as visible labels.

Preview:

- Attachment-scoped.
- Route-backed.
- Image, text, and Markdown first.
- Markdown uses the shared Markdown service.
- Unsupported files remain download-only.
- No protected paths, storage keys, signed URLs, scanner internals, file hashes, raw filesystem data, or unreadable target labels in preview payloads.

Attachment panels:

- Stay closest to the owning record.
- Use the shared Files attachment helper.
- Converted modals should open substantial Files utilities as stacked child dialogs, not as inline bodies.

## Runtime and Database Rules

SQLite remains a supported self-hosted/small-office backend.

SQLite target:

- One app server.
- Local or attached storage.
- Roughly 50 total users.
- Typical active use around 5-15 concurrent users.
- No horizontal scaling expectation.

PostgreSQL is the hosted SaaS target and should sit behind a provider-neutral database adapter.

Runtime configuration belongs in `.env` / environment variables for install-level startup values and secrets. Real `.env` files must not be committed. `.env.example` documents the contract.

Do not claim the current SQLite helper is fully provider-agnostic. Move toward a real database adapter with:

- Parameterized queries.
- Explicit transactions.
- Backend health/capability reporting.
- SQLite and future PostgreSQL implementations.
- Migration locking for multi-process safety.
- SQLite foreign-key enforcement.

## Query and Data Rules

Server/services own canonical filtering, sorting, paging, permission pruning, and read-model shaping.

Browser code may render, preserve UI state, request filters/pages, and dispatch actions.

Browser code must not become the source of truth for:

- Task visibility.
- Notes access.
- Client/project hierarchy.
- File availability.
- Permission logic.
- Canonical sorting/paging.
- Tag semantics.

Large list endpoints should move toward:

- Server-side paging.
- Maximum page sizes.
- Lightweight list projections.
- Separate detail reads.
- Batched enrichment for visible row IDs.
- Query-count awareness.

## Jobs and Background Work

Jobs are Node-side work stored in database tables.

Future job/outbox work should handle:

- Search indexing.
- Notification fan-out.
- Reminders.
- Recurrence generation.
- File scanning.
- Imports.
- Webhooks.

SQLite mode may run jobs inline or through one local worker. SaaS/PostgreSQL mode should support separate workers.

Do not add a background workflow in a feature module that bypasses the eventual job/outbox contract.

## Security and Safety Rules

Never expose:

- Storage keys.
- Protected paths.
- Signed URLs unless explicitly designed for that route.
- File hashes in normal UI.
- Scanner internals.
- Secure-note encrypted payloads or crypto metadata.
- Raw secure-note errors.
- Hidden/inaccessible record labels.
- Raw IDs as visible labels when safe readable labels or unavailable states are possible.

Destructive actions require:

- Explicit route/service support.
- Permission checks.
- Confirmation where appropriate.
- Audit/lifecycle behavior.
- Regression coverage.

No direct static file downloads. Downloads go through permission-checked routes.

## Development Workflow

### Version-wide internal checkpoints

When the active roadmap explicitly defines numbered internal checkpoints inside one version-wide branch, its branch contract replaces per-slice release packaging until the named branch-closeout checkpoint. Each internal checkpoint still runs one canonical `npm run verify:slice`, but it does not bump package/lock version metadata, add a changelog release entry, update durable `DECISIONS.md` or owning documentation, or perform runtime identity proof. Stage the completed checkpoint's `ROADMAP.md` to `ROADMAP-ARCHIVE.md` handoff as the final bookkeeping commit in the same protected pull request as its implementation. The archive entry becomes authoritative only when that pull request merges; do not open a second archive-only pull request. The branch-closeout checkpoint rolls the remaining deferred identity and durable-documentation items up once.

Every non-merge implementation commit on that branch must end with exactly one machine-readable trailer of each form:

```text
LTF-Checkpoint: <slice-id>
LTF-Summary: <single-line outcome>
LTF-Docs: <documentation disposition>
```

Use either `Docs updated: <comma-separated paths>.` or `No docs change needed: <short reason>.` as the complete `LTF-Docs` value. `ROADMAP.md` and `ROADMAP-ARCHIVE.md` are ceremony/bookkeeping paths, not documentation paths for this trailer; their normal handoff uses exactly `LTF-Docs: No docs change needed: completed checkpoint moved to roadmap archive.` Keep all three trailers contiguous in one final commit-message paragraph, with no blank lines between them. Internal checkpoints normally change no more than two ceremony files. The first policy checkpoint may update the governing agent/versioning instructions that establish this rule; later internal checkpoints defer durable documentation. A roadmap-only planning commit may precede implementation; it is not a completed checkpoint. The protected pull-request Development gate validates the complete base-to-head commit range. Exact-SHA Nightly, promotion, artifact, and deployment contracts remain unchanged.

For every implementation slice:

1. Confirm the current version in `package.json`.
2. Read the active roadmap slice.
3. Read current decisions.
4. Inspect relevant module docs and existing tests.
5. Make the smallest change that satisfies the slice.
6. Add/update focused regressions.
7. Run `npm run docs:suggest`, then update only the docs that own behavior or a contract that actually changed. If mapped source changed but no owning doc needs an edit, record `No docs change needed: <short reason>.`
8. Update `CHANGELOG.md`.
9. When the version changes, run `npm run version:bump -- <version>`; do not use a broad repository find/replace. Review only `package.json` and `package-lock.json`, and preserve historical roadmap/changelog/archive/docs labels.
10. Archive completed roadmap sections according to the roadmap bookkeeping rule.
11. At final local closeout, run `npm run verify:slice` exactly once. It collects the changed paths once, runs `npm run closeout` once, executes the existing changed-area plan once, and adds the separate permission harness once when the selected areas require it.
12. After `npm run verify:slice` succeeds, do not separately rerun `closeout`, `check`, changed regressions, an included regression area, or the permission harness unless a source, test, documentation, package, lockfile, workflow, or configuration file changes.
13. On a version-wide checkpoint branch, after the intended commits are complete, run `npm run checkpoint:validate` before the first push and again after amending any checkpoint commit message. It validates the complete `merge-base(origin/nightly, HEAD)..HEAD` commit range without repeating source verification. A message-only amend does not invalidate a green tree verification; any file change does.

Use the running server for testing when useful. Restart it as needed.

### Windows local server restarts

On this Windows workstation, never launch the background server with bare
`Start-Process -FilePath npm`. PowerShell may follow the file association for
the extensionless npm launcher and open it in Notepad instead of starting
Node.

Resolve and launch the Windows command shim explicitly:

```powershell
$npmCommand = (Get-Command npm.cmd -ErrorAction Stop).Source
$process = Start-Process -FilePath $npmCommand -ArgumentList 'start' -WorkingDirectory (Get-Location) -WindowStyle Hidden -PassThru
```

When the standard Node installation path is known, using
`C:\Program Files\nodejs\npm.cmd` directly is also valid. After launch, verify
that the intended port is listening and prove `/healthz`, `/readyz`, and
`/api/app-info`; do not treat the launcher process ID alone as runtime proof.
If an incorrect launch opens Notepad, confirm that it is the process created by
that attempt before stopping it, then relaunch with `npm.cmd`.

During implementation, run only the cheapest focused test needed to diagnose the current change. Do not run `npm run check` during every framework edit merely as a reflex. Typical iteration choices are:

1. For a one-module change, run that module's narrow Vitest command first (`npm run test:files`, `npm run test:tasks`) or the module's narrow regression area command.
2. For schema/contract changes, run `npm run test:contracts` and `npm run typecheck`.
3. For shared framework changes, run the narrow unit, contract, typecheck, lint, or regression command that exercises the edited contract.
4. For browser behavior, run focused local Playwright only while diagnosing or proving that behavior; do not duplicate it solely for ceremony after successful final verification.

Vitest narrow tests are cheap tripwires for contracts and pure service logic; they never replace the regression suite, and a regression may only be retired through the coverage-ratchet rules even when a Vitest test covers a smaller unit.

The changed-area command remains independently available when its routing output or direct execution is useful during iteration:

```sh
npm run test:regressions:changed
```

It prints selected areas and route reasons, runs narrow module coverage when safe, and escalates framework/view, database, or release changes to the full gate. An empty change set runs nothing and says so. The advice-only `node scripts/suggest-regressions-for-changes.mjs` and manual area commands remain available when you need to inspect or override the normal flow. Do not run this command separately as final ceremony before or after `npm run verify:slice`.

The runner retries a failed isolated-database script once, serially, with a fresh fixture and reports a successful retry as `flaky-recovered`. Do not chase a one-off recovered contention failure as a product bug. Do investigate any script that fails its retry or appears repeatedly in recovery summaries. Static/source and other buckets are never auto-retried, and `LTF_REGRESSION_REPEAT` remains the deliberate flake-hunting control.

The default full suite runs buckets cheap-first: static/source, default database, file storage, then isolated database. A failing bucket stops later buckets, so deterministic source failures short-circuit stateful work. Preserve this relative order, exact discovered-script membership, and each bucket's parallel/serial safety when changing runner orchestration; narrow filters retain the same relative order for whichever buckets remain.

The standing maintenance gates remain independently orchestrated by `npm run closeout`. Keep each underlying package script independently runnable, keep documentation and licensing warning-only, and add a maintenance gate only when it is a standing cross-slice contract. Ordinary final local verification is orchestrated by `npm run verify:slice`, which de-duplicates that closeout conductor with changed-area/full-check escalation and the separate permission harness.

Run the canonical final local command once after all intended files are complete:

```sh
npm run verify:slice
```

When permissions, visibility, route guards, workspace scope, module enablement, Files access, public API scopes, or admin/security behavior change, changed-area routing includes the separate permission harness exactly once. Direct `npm run test:permissions` remains available for focused diagnosis, but do not repeat it after a successful `verify:slice` run that included it.

GitHub Actions owns the independent clean-Linux pull-request proof into `nightly`, including browser, dependency-review, CodeQL, and PR verification passes. Promotion to `main`, manual releases, security or data-integrity exceptions explicitly required by the roadmap, and direct user instructions may still require additional named gates; those exceptional gates do not change the ordinary one-command local closeout rule.

For database/storage changes, also run or document:

```sql
PRAGMA integrity_check;
```

For migration/schema changes, create the next file with `npm run db:migration:create -- <name>`, then run `npm run db:schema:refresh` and `npm run db:schema:check`. Review the generated snapshot diff. Do not edit an applied migration or change `src/db/schema/current.sql` without a forward migration during normal feature work.

Run `npm run licensing:gates` when preparing a public release, changing third-party notice requirements, or activating outside contribution intake. This gate is warning-only: missing `THIRD_PARTY_NOTICES.md`, `CONTRIBUTING.md`, a pull-request template, or an active CLA process does not block ordinary private development. Do not rewrite licensing docs during unrelated slices, add public-contributor language before outside contributions are accepted, or place private SaaS/commercial templates in the public repository.

For browser route changes, verify `/api/app-info` reports the expected app version after restart.

For every release-version change, restart the app and verify `/api/app-info` after the version guardrail and normal release checks. The full versioning contract and ceremony checklist live in `docs/versioning.md`.

## Documentation Rules

- Use `docs/docs-ownership.json` and `npm run docs:suggest` to identify likely documentation owners during implementation and closeout. `npm run docs:check` is the warning-only release gate; it does not replace review judgment.
- Record documentation disposition as either `Docs updated: <comma-separated paths>.` or `No docs change needed: <short reason>.`
- Do not update several docs by reflex. Do update the document that owns the changed behavior or contract, and refine the ownership index when a recurring source-to-doc relationship is missing.
- README should remain cursory.
- ROADMAP is the implementation plan.
- Do not add a `## Archived Roadmap History` section to the top of `ROADMAP.md`; completed shipped history belongs in `CHANGELOG.md`, with detailed archived planning only in `ROADMAP-ARCHIVE.md` when a roadmap section is actually being archived.
- CHANGELOG records shipped changes.
- DECISIONS records current governing decisions, not every historical note.
- TODO is scratchpad only.
- Help is user-facing current behavior only.
- Developer docs should describe current implementation boundaries and how future work should integrate.
- Licensing docs change only for intentional legal/policy changes, dependency or bundled-asset notice changes, public-release gates, or contributor-process activation.

When replacing or superseding a decision, archive historical detail instead of keeping contradictory active guidance.

## What to Do When Unsure

Ask before implementing if:

- The roadmap scope is unclear.
- A change would alter workflow behavior beyond the slice.
- A helper makes an extra UI pattern easy but the roadmap does not request it.
- A historical decision conflicts with current roadmap/decisions.
- A module appears to need framework behavior that only one module uses.
- A route, permission, schema, or destructive action is not explicitly authorized.

Prefer a smaller behavior-preserving slice over a broad clever rewrite.

## Current Red Flags

Stop and re-check scope if you are about to:

- Turn Files into a document manager.
- Add inline Files details/previews to the browse page.
- Move a module's primary work surface into a filter/sidebar drawer.
- Add generic Inspector behavior in a module slice.
- Rebuild canonical filtering in browser JavaScript.
- Query another module's tables directly instead of using its service/provider.
- Add hard delete/purge/rename/file replacement without explicit roadmap permission.
- Expose raw IDs, storage keys, paths, scanner details, or hidden record labels.
- Implement anything only because it appears in TODO.
