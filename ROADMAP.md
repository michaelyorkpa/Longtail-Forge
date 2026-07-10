# Longtail Forge Roadmap

This file is the detailed per-version forward plan for Longtail Forge. README.md should stay cursory and point here for version-level detail.

Active cursor: `0.33.7`.

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
- Lands before 0.33.12 (Reporting Framework) so Reporting, public API expansion, tickets, creator tools, and future module contribution points are built against clearer contracts.
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

- [x] Add TypeScript as a dev dependency.
- [x] Add Vitest as a dev dependency.
- [x] Add Zod as a runtime dependency because schemas will be used by runtime validation paths.
- [x] Add `tsconfig.json`.
  - [x] Node/ESM-compatible compiler settings (`module`/`moduleResolution` `nodenext`).
  - [x] `noEmit: true`.
  - [x] `allowJs: true`.
  - [x] Scope `include` narrowly at first (`server.js`, `worker.js`, `src/**/*.js`, `tests/**/*.mjs`; browser `public/` scripts excluded).
  - [x] Use `checkJs` selectively instead of type-checking the entire repo immediately (`checkJs: false`; files opt in with `// @ts-check`).
  - [x] Exclude runtime data, generated files, `archive/`, build/vendor output, temporary directories, and `node_modules`.
- [x] Add package scripts:
  - [x] `typecheck` - runs `tsc --noEmit`.
  - [x] `test:unit` - runs Vitest once.
  - [x] `test:watch` - runs Vitest in watch mode.
  - [x] `test:contracts` - runs contract/schema-focused Vitest tests (filtered pass; `--passWithNoTests` until 0.33.7.3).
  - [x] `test:files` - runs Files-focused Vitest tests once Files is the proving-ground module (filtered pass; `--passWithNoTests` until then).
  - [x] `test:tasks` - runs Tasks-focused Vitest tests once Tasks has contract tests (filtered pass; `--passWithNoTests` until then).
- [x] Keep `npm start` unchanged.
- [x] Update `npm run check` so it runs fast checks before the existing slow suite:
  - [x] `npm run typecheck`
  - [x] `npm run test:unit`
  - [x] existing regression runner
  - [x] ESLint
- [x] Add a guardrail proving `npm run check` invokes `typecheck` and `test:unit` before the full regression runner (`scripts/regressions/release/fast-check-pipeline.regression.mjs`, a required release gate).
- [x] Do not alter runtime behavior in this slice except dependency availability and script wiring.

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

- [x] Establish the preferred contract/schema pattern:
  - [x] `*.contracts.js` or `*.schema.js` for runtime Zod schemas and JSDoc-backed types.
  - [x] Optional `*.types.ts` or shared `.d.ts` files for type-only definitions that are never imported by runtime JavaScript.
  - [x] Tests live beside contracts or in a clearly named test folder (`tests/**/*.test.mjs`).
- [x] Establish module public entry points where practical:
  - [x] `src/modules/files/index.js` — not applicable: Files is framework-owned with no `src/modules/files/` directory; its public seam is `src/services/files.service.js` plus `src/core/files/`, documented in the module development guide.
  - [x] `src/modules/tasks/index.js`
  - [x] `src/modules/notes/index.js`
  - [x] Similar pattern for other modules as they are touched — `lists`, `client-projects`, and `time-tracking` entries created now because they already have cross-module consumers; `tags`/`users`/`developer-example` are manifest-only and get entries when touched.
- [x] Document the import rule:
  - [x] Framework/shared code should import module capabilities from public entry points.
  - [x] Other modules must not import another module's internal repositories/services directly unless an explicit contract allows it.
- [x] Add a lightweight static guardrail for obvious forbidden imports between module internals (`framework.module-import-boundaries` release gate; the 22 pre-existing deep imports are frozen in `scripts/baselines/module-internal-import-baseline.json`).
- [x] Document the distinction:
  - [x] TypeScript types describe trusted internal shapes.
  - [x] Zod validates untrusted runtime input and config.
  - [x] Vitest proves contracts and service behavior.
  - [x] Existing regressions still prove integration, permissions, database behavior, and browser/static behavior.

Acceptance criteria:

- The repo has a documented contract/schema/test pattern.
- Module public-entry rules are documented.
- At least one guardrail prevents obvious cross-module internal imports.
- No broad module rewrite occurs.

### Version 0.33.7.3 - Zod proving ground: Files contract schemas

**Model: GPT-5.5 Extra High** - Runtime contract proof on the module most likely to grow storage/preview/upload complexity.

Purpose:

Use Files as the first Zod proving ground because Files will eventually need upload metadata, attachment contracts, previews, storage adapters, scanners, SaaS/private-hosted storage differences, and future indexing. This is where runtime validation will pay for itself without converting the whole app.

- [x] Add Files-owned runtime schemas in JavaScript (`src/core/files/files.contracts.js`, framework-owned per the Files seam):
  - [x] `CreateFileSchema`
  - [x] `UpdateFileSchema` — implemented as `UpdateFileContextSchema`: Files has no generic file-update endpoint by design (no rename/replacement); the real update edge is the attachment-scoped File Context editor. `CreateFileBatchSchema` also added for the batch JSON envelope.
  - [x] `FileMetadataSchema`
  - [x] `FileAttachmentSchema`
  - [x] `FilePreviewRequestSchema`
  - [x] `FileStorageAdapterConfigSchema`
- [x] Keep schemas focused on edge payloads:
  - [x] Request bodies (JSON upload, batch, attach-existing, context update).
  - [x] Query params — preview request attachment ID; list-filter queries stay on the existing normalizers (already validated, no behavior change wanted this slice).
  - [x] Upload metadata (multipart fields after route assembly).
  - [x] Storage configuration (validated at provider resolution, 500 on malformed config).
  - [x] Preview/action payloads.
- [x] Do not Zod-parse every internal object passed between already-trusted service functions.
- [x] Preserve the existing Files behavior and error envelope for valid requests (all 44 Files-area regressions pass unchanged; validation failures throw the existing `AppError` envelope).
- [x] If invalid payload handling changes, make the error shape explicit, consistent, and tested — unknown fields are stripped; wrong-typed known fields and non-object `attachmentMetadata` now fail 400 with explicit messages; server-managed storage/scanner/integrity fields are rejected outright.
- [x] Add JSDoc typedefs inferred from Zod schemas where useful.
- [x] Add Vitest contract tests proving:
  - [x] Valid create/update payloads pass.
  - [x] Empty/invalid required fields fail.
  - [x] Defaults are applied intentionally.
  - [x] Unknown/unsafe fields are stripped or rejected according to the chosen contract.
  - [x] Private/storage/scanner-sensitive fields cannot be accepted from user input.
- [x] Add one narrow Files command, such as `npm run test:files`, that runs only Files Vitest tests (wired in 0.33.7.1; now matches the Files contract tests).

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

- [x] Add shared typed/JSDoc-backed definitions for the highest-value contracts (`src/types/framework-contracts.d.ts`, type-only, never imported by runtime JavaScript):
  - [x] Module manifest shape.
  - [x] Declarative view descriptor shape.
  - [x] Dashboard contribution shape.
  - [x] Workbench contribution shape.
  - [x] Work candidate shape.
  - [x] Focus-mode definition/context shape.
  - [x] Resume-state producer payload shape.
  - [x] Search record/reference/result shape (plus the registered indexer signature).
  - [x] Notification event/create/read payload shape.
  - [x] Taggable/searchable/attachable manifest contribution shapes.
  - [x] Public API success/error/list envelope.
  - [x] Job enqueue/handler payload shape.
  - [x] Database adapter/dialect seam shape.
- [x] Add `// @ts-check` plus JSDoc typing only to selected high-value JavaScript files first:
  - [x] `src/core/modules/manifest-contract.js`
  - [x] module registry/validation path (`registry.js`, with the definition list typed `ModuleManifest[]` so all eight manifests are structurally checked)
  - [x] work-candidate/focus/resume services (`work-candidate.service.js`, `work-focus-modes.service.js`, `work-resume-state.service.js`, `work-resume-state-producers.js`)
  - [x] search contract/service seam (`search.service.js`, `indexer-registry.js`)
  - [x] notification contract/service seam (`notifications.service.js`)
  - [x] tag contract/service seam (`tags.service.js`, `tag-propagation-registry.js`)
  - [x] Files contract/service seam from 0.33.7.3 (`files.contracts.js`)
- [x] Model dual-cased shapes honestly where they still exist.
  - [x] Do not pretend everything is camelCase if existing code still accepts or emits snake_case — resume payloads, job enqueue options, and search filters are typed with both casings.
  - [x] Prefer a normalized internal shape plus explicit edge adapters where practical.
- [x] Fix real contract drift exposed by typecheck — SQLite adapter `query/get/run` signatures documented named-parameter objects (they previously claimed arrays); search indexing now guards an unregistered indexer with a clear 500 instead of a raw TypeError; the contract types themselves were corrected against reality (defaultRolePermissions/auditRecordTypes/eventTypes are structured arrays, view dirs are URL objects, navigation has no id).
- [x] Do not mask drift with blanket `any` — checking dials are tsconfig-level (`strict` on, `noImplicitAny` off for incremental JS) and the `framework.typecheck-seams` gate rejects `@ts-nocheck`/`@ts-ignore` in runtime files.
- [x] Do not type-check the entire browser UI in this slice.
- [x] Do not rename working files just to make them `.ts`.

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
- Does not depend on Reporting (now 0.33.12).

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

## Version 0.33.11 - Self-Hosted Release Packaging and Bare-Metal Auto-Upgrade

Purpose:

Give self-hosted installs a clean, runtime-only release artifact and a safe, opt-in mechanism that checks GitHub for a newer published release and can apply it in place. This is the first packaging/distribution slice: before it, "self-hosting" means cloning the whole repo (dev/test tooling and all); after it, a self-hoster runs a slim runtime artifact and can upgrade without manually re-pulling and reinstalling.

The upgrade target for this version is bare-metal: a single Node process on a host (for example under systemd or a process manager), not a container or orchestrated fleet. Container images and SaaS/managed-fleet upgrades are explicitly out of scope here and deferred to later hosting/SaaS work.

This version has two halves that must land together to be useful:

- A packaging boundary that separates runtime code from dev/test tooling so the shipped artifact is slim and does not require ESLint/TypeScript/Vitest/Playwright/the regression suite to run.
- A bare-metal updater that compares the installed version against the latest GitHub release, surfaces availability, and can download, verify, back up, apply, migrate, restart, and roll back on failure.

Dependencies and sequencing:

- Builds on 0.33.6.15 canonical app-version source-of-truth, which the updater uses to compare installed vs. latest.
- Builds on the 0.33.6.16 release-gate closeout conductor, so a release artifact can be gated before it is published.
- Relies on the runtime-vs-dev separation the codebase already maintains (`npm start` stays `node server.js`; TypeScript/Vitest/Playwright are dev-only; Zod stays a runtime dependency because it validates untrusted input). This slice formalizes that separation into a packaging boundary rather than inventing it.
- Assumes an actual published release channel exists (GitHub Releases for the AGPL core; see the 0.33.6.16.9 licensing/public-release gates). If releases are not yet published, this slice defines the mechanism and the manual-artifact fallback, and the GitHub fetch activates once a public release channel is live.
- Slotted before Reporting (now 0.33.12) at project direction; it is otherwise independent of Reporting.
- Bare-metal only; container and multi-tenant SaaS upgrade orchestration are deferred and cross-referenced to later hosting/SaaS and 0.38.x production-hardening work.

Key decisions:

- Release source is GitHub Releases of the repository; the updater compares the canonical installed app version against the latest release tag.
- The release artifact is a packaged, runtime-only tarball plus a checksum (with room to add a signature later); the updater verifies the checksum before applying anything.
- Upgrades are owner/admin-gated, opt-in, and never destructive-by-default: the updater always backs up the current code and database before applying, and rolls back automatically if a post-upgrade health check fails.
- The app can stage an update and request a restart; the actual process restart is owned by the host supervisor (systemd/process manager), not by the app force-killing itself unmanaged.
- An air-gapped/manual fallback lets an admin upload a verified artifact instead of fetching from GitHub.
- Self-hosted installs only: hosted/SaaS deployments manage their own pipeline and must be able to disable the in-app updater entirely.

Non-goals:

- Do not add container/Docker/Kubernetes image auto-upgrade in this version; bare-metal single-host only.
- Do not build multi-tenant/fleet upgrade orchestration.
- Do not change `npm start`.
- Do not auto-apply an upgrade without explicit opt-in and a completed backup.
- Do not ship dev/test tooling, dev fixtures, `.env` files, or secrets in the release artifact.
- Do not strip Zod or other runtime validation as if it were test tooling.
- Do not weaken permission, workspace, private/secure-content, storage-key, or migration guardrails to make upgrades possible.
- Do not build a full update-server/CDN; GitHub Releases plus manual upload is the surface for this version.

### Version 0.33.11.1 - Runtime/dev file boundary and release-artifact packaging

Purpose:

Formalize which files are runtime vs. dev/test and produce a slim, runtime-only release artifact.

- [ ] Define the runtime file boundary explicitly:

  - [ ] runtime: `server.js`, `src/`, `public/`, database migrations/schema, runtime dependencies, canonical version/asset-version sources.
  - [ ] excluded: `scripts/` regression tooling, tests, ESLint/tsconfig/Vitest/Playwright configs, dev fixtures, roadmap/dev docs, `devDependencies`.
- [ ] Choose and implement the boundary mechanism:

  - [ ] a `package.json` `files` allowlist and/or `.npmignore`, so a packed artifact contains only runtime paths.
  - [ ] install with `npm ci --omit=dev` on the target.
- [ ] Add a package/release script that produces a runtime-only artifact (tarball) plus a checksum.
- [ ] Keep `npm start` as `node server.js` on the packaged artifact.
- [ ] Keep Zod and other runtime dependencies in the artifact; do not treat them as dev tooling.
- [ ] Add a guardrail/regression proving:

  - [ ] the packaged artifact excludes `scripts/`/regression/test/dev-config paths.
  - [ ] the packaged artifact includes every runtime path required to boot.
  - [ ] a booted artifact does not import any dev/test package.
  - [ ] no `.env`/secret/dev fixture is present in the artifact.
- [ ] Add self-hosted install/upgrade docs describing the slim artifact and `--omit=dev`.

Acceptance criteria:

- A packaged release artifact contains runtime code and runtime dependencies only.
- The artifact boots with `node server.js` and requires no dev/test tooling.
- A guardrail proves dev/test files and secrets are excluded and runtime files are complete.

### Version 0.33.11.2 - GitHub release check and version comparison

Purpose:

Let a self-hosted install discover whether a newer published release exists.

- [ ] Add an update-check service that queries the GitHub Releases API for the latest release of the configured repository.
- [ ] Compare the latest release tag against the canonical installed app version (0.33.6.15 source of truth).
- [ ] Support a configured update channel:

  - [ ] repository/owner.
  - [ ] stable vs. prerelease inclusion.
  - [ ] check interval and manual "check now".
  - [ ] optional token for authenticated/rate-limited access.
- [ ] Handle failure gracefully: network errors, rate limits, no releases, or malformed tags never crash the app or block normal use.
- [ ] Cache the last check result and timestamp.
- [ ] Do not fetch or apply anything in this slice beyond release metadata.
- [ ] Add focused regressions:

  - [ ] a newer release is detected as available.
  - [ ] an equal/older release is reported as up to date.
  - [ ] a prerelease is excluded unless opted in.
  - [ ] network/rate-limit/malformed responses fail safe.

Acceptance criteria:

- The app can determine whether a newer GitHub release exists without affecting normal operation.
- Version comparison uses the canonical version source.
- Update checking is configurable and fails safe.

### Version 0.33.11.3 - Update availability surfacing (admin/about)

Purpose:

Show update status to authorized users without nagging everyone.

- [ ] Surface update availability in an owner/admin-visible location (about/app-info and/or admin settings).
- [ ] Show installed version, latest available version, a release-notes link, and last-checked time.
- [ ] Gate visibility and any upgrade action behind owner/admin permission; never expose it to ordinary users.
- [ ] Provide a manual "check now" action.
- [ ] Keep this warning/informational only in this slice; applying the upgrade is 0.33.11.4+.
- [ ] Add focused regressions:

  - [ ] the update banner/status is visible to owner/admin only.
  - [ ] correct installed vs. latest values are shown.
  - [ ] no exposure to non-admin users or other workspaces.

Acceptance criteria:

- Authorized users can see whether an update is available and what it contains.
- Update status respects permission and workspace boundaries.

### Version 0.33.11.4 - Bare-metal upgrade executor: download, verify, backup, apply, migrate, restart

Purpose:

Apply an update safely on a single-host bare-metal install.

- [ ] Download the release artifact and its checksum from the selected release.
- [ ] Verify the checksum (and signature if present) before touching the install; abort on mismatch.
- [ ] Back up before applying:

  - [ ] the current code/artifact.
  - [ ] the database file(s).
  - [ ] a recorded restore point with the pre-upgrade version.
- [ ] Apply the new artifact into the install location.
- [ ] Install runtime dependencies with `npm ci --omit=dev`.
- [ ] Run database migrations using the existing migration runner.
- [ ] Request a supervised restart (systemd/process manager) rather than force-killing the app; document the supervisor expectation.
- [ ] Make each step idempotent/resumable where practical and log progress.
- [ ] Require explicit opt-in/confirmation before any destructive step; a completed backup is a precondition to apply.
- [ ] Add focused regressions/tests (dry-run/mocked where a full restart is impractical):

  - [ ] a checksum mismatch aborts before any change.
  - [ ] a backup is created before apply.
  - [ ] migrations run after apply.
  - [ ] a missing backup blocks apply.

Acceptance criteria:

- An authorized admin can apply a verified update on bare metal with an automatic pre-upgrade backup.
- Migrations run as part of the upgrade.
- The upgrade never applies an unverified artifact and never applies without a backup.

### Version 0.33.11.5 - Health check, rollback, and manual/air-gapped fallback

Purpose:

Guarantee a failed upgrade cannot leave the install broken, and support offline installs.

- [ ] After restart, run a post-upgrade health check (boot, database connectivity, `/api/app-info` reflects the new version).
- [ ] On health-check failure, roll back automatically to the backed-up code and database and restore the previous version.
- [ ] Record upgrade history and outcomes (from/to version, timestamp, success/rollback).
- [ ] Add a manual/air-gapped fallback: upload a verified artifact and run the same verify/backup/apply/migrate/health-check/rollback path without GitHub access.
- [ ] Ensure rollback restores the database backup consistently with the code rollback.
- [ ] Add focused regressions/tests:

  - [ ] a failed health check triggers rollback to the prior version and database.
  - [ ] a successful upgrade records history and reports the new version.
  - [ ] the manual artifact path enforces the same verification and backup rules.
  - [ ] rollback restores a bootable prior state.

Acceptance criteria:

- A failed upgrade automatically restores the prior working install and database.
- Upgrades are auditable via recorded history.
- Air-gapped installs can upgrade from a verified local artifact.

### Version 0.33.11.6 - Config, kill-switch, permissions, and closeout

Purpose:

Make the updater safe to ship, configurable, and disable-able, and close out the packaging/upgrade version.

- [ ] Add configuration for: enable/disable the updater, channel (stable/prerelease), check interval, repository, optional token, and auto-check vs. manual-only.
- [ ] Add a hard kill-switch so hosted/SaaS or locked-down deployments can disable in-app updates entirely.
- [ ] Restrict all update configuration and actions to owner/admin.
- [ ] Confirm the updater is inert on hosted/SaaS deployments that manage their own pipeline.
- [ ] Confirm `npm start` is unchanged and the runtime artifact carries no dev/test tooling.
- [ ] Confirm no permission/workspace/private-content/storage-key/migration guardrail was weakened to enable upgrades.
- [ ] Update self-hosted install/upgrade/backup docs and the changelog; verify `/api/app-info` after a simulated upgrade.
- [ ] Run final verification, including a full backup -> apply -> migrate -> health-check -> rollback dry run.

Acceptance criteria:

- The in-app updater is opt-in, permission-gated, configurable, and fully disable-able.
- Bare-metal self-hosted installs can check for, apply, and safely roll back GitHub releases with automatic backups.
- The release artifact is runtime-only, and `npm start` remains `node server.js`.
- Container/fleet/SaaS upgrade orchestration remains explicitly deferred.

## Version 0.33.12 - Reporting Framework and Time Report Contribution

Decision:

Reporting is framework-owned report infrastructure, not a normal disable-able first-party workflow module. The framework owns the Reporting page, report catalog, contribution filtering, report execution dispatch, shared filter host, loading/error/empty states, and future saved/export/export scheduling behavior. Individual modules own the actual report definitions, report runners, data queries, domain calculations, result shapes, and record-level permission checks.

The first 0.33.12 report should remain intentionally small: Time Tracking contributes one Project Time & Billing report. Do not build a custom report builder, report designer, analytics dashboard, or saved report system in this pass.

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
`src/modules/reporting` workflow module just to fit module-owned `viewSurfaces`. 0.33.12 must decide
and document the framework-owned equivalent: either a framework-owned descriptor/config source that
the same renderer can consume, or a narrow framework host adapter built directly on
`LongtailForge.view` primitives where the descriptor contract cannot yet model report execution.

### Version 0.33.12.1 - Reporting Architecture and Framework View Baseline

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

### Version 0.33.12.2 - Reporting Contribution Contract

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

### Version 0.33.12.3 - Reporting Framework Catalog Route

- [ ] Add framework-owned report catalog route:
  - [ ] `GET /api/reporting/catalog`
- [ ] Return only reports allowed by enabled modules, workspace capabilities, required modules, and user permissions.
- [ ] Include report metadata, supported filters, renderer ID, default filter values, and report-specific permission requirements.
- [ ] Ensure disabled modules do not contribute active catalog reports.
- [ ] Ensure reports from historically readable disabled modules are only visible when explicitly allowed by contribution and module policy.
- [ ] Add focused catalog regressions for disabled modules, missing permissions, workspace capability filtering, and required-module filtering.

### Version 0.33.12.4 - Reporting Runner Registry and Execution Route

- [ ] Add framework-owned report execution route:
  - [ ] `GET /api/reporting/reports/:moduleId/:reportId/run`
  - [ ] or a stable equivalent using a report key.
- [ ] Add a server-side report runner registry keyed by stable runner IDs.
- [ ] The framework Reporting service should validate report availability, permissions, enabled modules, workspace capability requirements, and basic filter shape before dispatching.
- [ ] The module-owned runner should remain responsible for domain-specific data access, calculations, and record-level permission safety.
- [ ] Normalize execution errors into framework-owned report status/error payloads without exposing implementation details.
- [ ] Add focused execution regressions for unknown report IDs, missing runners, denied permissions, disabled modules, and invalid filter shape.

### Version 0.33.12.5 - Time Tracking Project Time & Billing Contribution

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

### Version 0.33.12.6 - Correct Project and Client Rollup Billing Math

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

### Version 0.33.12.7 - Framework Reporting Host Shell

- [ ] Keep one framework-owned `reporting.html` page.
- [ ] Reduce `views/protected/reporting.html` to a minimal framework host that loads shared view assets,
      the chosen Reporting host renderer/adapter, and the Reporting browser behavior file.
- [ ] Convert the hard-coded Time Report UI into a framework Reporting host that loads available report definitions from the catalog.
- [ ] Render the page shell, header, report selector, status/error/empty states, filter host, and results host through the chosen framework view path.
- [ ] Do not hand-build framework-owned Reporting anatomy in static HTML or ad-hoc browser DOM when a descriptor field or `LongtailForge.view` primitive exists.
- [ ] Keep the first host simple: one selected report, one filter area, one status area, and one results area.
- [ ] Add a focused static regression proving the Reporting page is a minimal framework host.

### Version 0.33.12.8 - Reporting Filter Host and Report Selection

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

### Version 0.33.12.9 - Project Time & Billing Result Renderer

- [ ] Add a registered report result renderer for `time-project-billing-table`.
- [ ] The first renderer may remain specific to Project Time & Billing, but it should use framework table/action primitives where they fit.
- [ ] Preserve hierarchical project display:
  - [ ] Parent rows can expand/collapse child rows.
  - [ ] Child rows are display-only rows under their parent.
  - [ ] Footer totals come from the runner result and are not recomputed from expanded display rows.
- [ ] Keep Time Tracking responsible for the result shape and billing semantics.
- [ ] Keep the framework responsible for result-host placement, overflow wrappers, loading/error/empty states, and renderer dispatch.
- [ ] Add focused regressions for expandable child rows, totals, no-results state, and renderer-not-found recovery.

### Version 0.33.12.10 - Permissions, Navigation, Guardrails, and Closeout

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

## Version 0.33.13 - Lists Module UI/UX Overhaul (PLACEHOLDER)

> **Placeholder — requirements not yet captured.** The current Lists module layout is cluttered and confusing on screen, and needs a UI/UX pass before Knowledge Base (0.34) begins. The specific problems, target layout, and acceptance criteria will be filled in later; this section only reserves the slot and records intent so it is not forgotten.

Purpose:

Fix the Lists module's on-screen layout and overall page experience. As of this placeholder the direction is not yet specified beyond "the layout is awful and the page is a confusing mess"; treat everything below as scaffolding to be replaced once the detailed requirements are provided.

Scope (to be defined):

- [ ] Capture the specific layout/UX problems with the current Lists page.
- [ ] Define the target layout and interaction model.
- [ ] Decide framework-owned vs. Lists-owned responsibilities, consistent with the view-ownership boundary (framework owns page/anatomy/`.view-*`; Lists owns data/behavior and `.lists-*`).
- [ ] Reuse existing framework view primitives/anatomy rather than hand-building page structure.
- [ ] Define acceptance criteria and focused Lists regressions once the redesign is settled.

Sequencing:

- Lands after Reporting (0.33.12) and before Knowledge Base (0.34), at project direction.
- Requirements must be captured before implementation begins; do not implement from this placeholder.

## Version 0.33.14 - Short-Term Critical Cleanup Sweep

Purpose:

Knock out the backlog of small, concrete UI/UX and behavior fixes that accumulated in the `TODO.md` Short Term section, before they slip any further. These are individually minor but collectively degrade day-to-day usability. Each item below is promoted verbatim-in-intent from `TODO.md` Short Term and should be a small, self-contained change.

This is a cleanup/polish sweep, not a feature version. Items are grouped by area so they can be picked off independently; none should turn into a large refactor. If any item turns out to be larger than a quick fix, split it into its own slice rather than expanding this one.

Items intentionally left in `TODO.md` (not part of this sweep): the Lists UI/UX notes (they belong to 0.33.13), the Suggested-Library revisit (deferred), the human Testing Goals checklist, the Knowledge Base "make it smart" idea (belongs to 0.34), the Mobile Tweaks (deferred to mobile polish), and the broader Administration/Settings audit (larger than a quick fix).

### Version 0.33.14.1 - Tasks quick fixes

- [ ] Workbench: when a parent task is selected, include child project tasks in the completable set, not just tasks directly on the parent — report all tasks within the parent project.
- [ ] Checklists: tighten the spacing in the checklist dialog (currently a little cramped).
- [ ] Checklists: pressing Enter should record a new checklist item / save changes to the current item, not close the modal without saving.
- [ ] Tags filter (Sorting & Filters): replace the tags dropdown with a type-to-search box with suggestions, matching how tags are entered elsewhere.
- [ ] Tag input generally: allow starting to type a tag and then pressing the down arrow to select from the suggestions (no mouse required).
- [ ] Parent/Child - Parent Task picker: for new tasks, do not list completed/archived tasks as candidate parents (keep the existing client/project filtering).
- [ ] Parent/Child - inheritance: child tasks inherit the parent's Due Date, Due Time, Priority, Client (if not already selected), and Project (if not already selected).
- [ ] Parent/Child - linkage indicator: show a clickable "Child of: {{truncatedTaskName}}" chip on line-item displays so the link is visible beyond the Parent Task dropdown.
- [ ] Parent/Child - nested display: in list views (e.g. Actions -> Tasks), nest child tasks under their parent, the way Clients and Projects nest.
- [ ] Modal behavior: on the create modal, Save should convert the dialog into the edit dialog (keeping it open) rather than closing and losing the just-captured task; add a "Save & Close" for the write-it-down-and-go case.
- [ ] Workspace project narrowing: adding a task with the {{workspaceName}} context should narrow the project list to that workspace's projects (workspace projects with no client).

Acceptance criteria:

- Each Tasks fix is implemented and covered by focused Tasks regressions where it has testable behavior.
- No fix expands into a broad Tasks rewrite.

### Version 0.33.14.2 - Notes quick fixes

- [ ] Bulk editing: add a Notes bulk-edit modal that can set Library, Collection, Note Kind, and Visibility across selected notes.
- [ ] Modal behavior parity: extend the Tasks Save -> convert-to-edit / "Save & Close" behavior to the Notes create modal.

Acceptance criteria:

- Notes bulk edit updates the listed fields across a selection, respecting permission/workspace scope.
- Notes create-modal save behavior matches the Tasks pattern.

### Version 0.33.14.3 - Timers quick fixes

- [ ] Context linking after start: allow linking a running timer to a task after it has been started, converting it from a Manual timer to a Task Timer.

Acceptance criteria:

- A running manual timer can be linked to a task mid-run and becomes a task timer, with correct attribution.

### Version 0.33.14.4 - Workspace and permission cleanups

- [ ] Inactive users: users inactive in a workspace must not appear in assignable-people pickers, and should not appear in the workspace at all.
- [ ] Personal/Family workspaces: deprecate the Billable flag everywhere on the front end; it may remain in the database only so long as it can never be used on Personal or Family workspaces.
- [ ] Remove Workspace wording: review the User Settings "Remove Workspace" flow copy now that it removes the signed-in user's membership rather than deleting the workspace record.

Acceptance criteria:

- Inactive users are absent from assignable pickers and workspace views.
- The Billable flag is not surfaced in the front end for Personal/Family workspaces.
- The Remove Workspace copy accurately describes membership removal.

### Version 0.33.14.5 - Framework-owned session/auth warnings

- [ ] Session-expiry and similar warnings (e.g. "Requires Login") must be framework-owned in-app modals, not console messages or notices hidden behind an open modal on the main window. A session that expires mid-edit should surface a clear, foreground framework modal.

Acceptance criteria:

- Auth/session warnings render as framework-owned app modals that are visible even when another modal is open, not console-only or hidden.

### Version 0.33.14.6 - Misc cleanup and closeout

- [ ] Restore the client change-requests documentation that was lost from the repo docs, back into the project-management tools section.
- [ ] Sweep `TODO.md` Short Term: confirm every item promoted here has been removed from `TODO.md` to prevent drift, and that remaining Short Term items are intentionally deferred.
- [ ] Update `CHANGELOG.md`, package metadata, and roadmap bookkeeping.
- [ ] Run relevant narrow regressions plus `npm run check`; verify `/api/app-info` after restart.

Acceptance criteria:

- The client change-requests docs are restored.
- Promoted items are removed from `TODO.md`; only intentionally-deferred items remain in Short Term.
- Release-gate checks pass.

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
