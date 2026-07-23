# End-to-End Smoke Testing (Playwright)

Longtail Forge's rendered end-to-end smoke harness renders the real app in a real browser at fixed desktop and mobile viewports and asserts the handful of things the static regression suite cannot see: real rendered layout width, authentication-state visibility, mobile navigation behavior, and runtime console errors.

**Playwright is dev/test-only tooling. It is never part of the production runtime.** `@playwright/test` lives in `devDependencies`, browser binaries install on demand, `npm start` remains `node server.js`, and no file under `src/`, `server.js`, or `public/` imports Playwright or reaches into `tests/e2e/`. The `release.playwright-dev-only-boundary` release-gate regression enforces every part of that boundary.

## Relationship to the Other Gates

The rendered smoke is a deliberately **separate gate** from `npm run check`:

- `npm run check` stays the fast static/regression gate. It never requires browser binaries or a running server, and it never invokes Playwright.
- `npm run test:e2e` is run explicitly — locally when rendered behavior matters, in CI, and as the acceptance gate for responsive/mobile slices (0.33.9 and later).

## Setup

From a clean checkout:

```sh
npm install              # installs @playwright/test with the other dev dependencies
npm run test:e2e:install # downloads the Chromium browser binaries (one-time per machine)
```

Browser binaries live in Playwright's per-user cache, not in the repository.

## Running the Suite

```sh
npm run test:e2e     # run the whole smoke suite once (managed server, both viewports)
npm run test:e2e:ui  # Playwright UI mode for local debugging
```

By default the harness boots its own **managed, isolated server**:

- `tests/e2e/support/start-e2e-server.mjs` wipes the harness-owned, git-ignored `data/e2e` directory, pins every runtime environment value the harness depends on (so a local `.env` can never redirect the managed server at real data), and boots the unchanged `server.js` entry point on dedicated local port **8101** — deliberately not the canonical dev port 8001, so the throwaway e2e database can never collide with the real dev server or its data.
- The bootstrap seeds the super admin with a test-only password against that throwaway database. No real credential is committed or reused.
- `tests/e2e/auth.setup.mjs` (a Playwright setup project) logs in once via `POST /api/login` and saves the authenticated `storageState` cookies to git-ignored `tests/e2e/.auth/`; the viewport projects consume it so protected surfaces are reachable.

### Environment Variables

| Variable | Meaning |
| --- | --- |
| `LTF_E2E_BASE_URL` | Target an already-running server instead of booting the managed one. Nothing is booted or wiped in this mode. |
| `LTF_E2E_USERNAME` / `LTF_E2E_PASSWORD` | Credentials for the target server. Required in external-server mode; defaults match the managed server's seeded super admin. |
| `LTF_E2E_PORT` | Override the managed server's port (default 8101). |

## Viewport Profiles

Two named projects are defined in `playwright.config.js` and reused across every spec:

| Project | Viewport | Notes |
| --- | --- | --- |
| `desktop` | 1280x800 Chromium | Inline primary navigation |
| `mobile` | 375x812 Chromium | `isMobile`, `hasTouch`, 3x scale; collapsed nav toggle |

Every spec runs in both projects unless it opts out (see the mobile-nav spec's `test.skip(!isMobile, ...)` pattern for mobile-only behavior).

The viewport projects run fully parallel against one managed server and throwaway database. Keep cross-viewport assertions read-only whenever possible. A test that must mutate durable shared state should run that mutation in only one project, restore the original value in `finally`, and leave the other viewport's relevant read-only coverage intact.

## The Core Smoke Specs

Specs are organized one file per concern under `tests/e2e/`:

| Spec | Concern |
| --- | --- |
| `app-load.spec.mjs` | App shell renders with the right navigation affordance, the exact mobile-safe viewport meta, the 44px tap-target floor on the mobile nav toggle, and no fatal load error |
| `login.spec.mjs` | An unauthenticated visit renders only the login form; the remembered-login checkbox stays one-line, field-edge aligned, vertically centered with Log In, label/keyboard operable, and submits explicit false/true values at desktop and mobile widths; the required-password transition hides login and reveals only the password-change form; successful login follows the safe server-resolved preferred landing path |
| `user-settings-appearance.spec.mjs` | User Settings keeps the Light/Auto/Dark control bounded and keyboard-operable, with Auto source independently bounded; rendered desktop/mobile coverage also pins Profile placement, full-width Notifications/Leave/Workspace Creation anatomy, initial disclosure state/caret, complete offset-labelled IANA timezone choices, and matching leave-membership warnings |
| `settings-universal-actions.spec.mjs` | Every protected Settings host renders exactly two Save/Revert pairs; User Settings proves dirty/flash/revert, lifecycle-form exclusion, coordinated owner-route saving, the exact User App Preferences choices, the in-app unsaved-navigation dialog, and the disposable-account password action boundary plus old/new credential proof |
| `calendar-mobile-view.spec.mjs` | Dashboard and Actions Calendar render the shared Day view by default on mobile, retain active-status requests and reminder rows, honor saved Day/Week/Month preferences at both named viewports, and keep explicit Calendar query-view precedence |
| `workspace-switch-landing.spec.mjs` | The app-shell workspace switcher follows the safe server-resolved preferred landing path instead of reloading the prior workspace's page |
| `settings-admin-navigation.spec.mjs` | Workspace Settings keeps the immutable type disabled and the person-icon Users action in the page header while preserving its dialog; Clients & Projects and optional-module grouping remain ordered; Files/Developer Example hosts load; rendered lifecycle saves immediately update Admin, Time Keeping, and Capture; disabled module recovery stays in the shared host; Tasks and Workbench suppress task-timer UI without removing manual timers |
| `overflow.spec.mjs` | Dashboard, Workbench, Tasks, Notes, Files, and Lists have no horizontal overflow (real rendered `document.scrollingElement` width, not CSS strings) |
| `mobile-nav.spec.mjs` | The mobile header keeps Search and Notifications outside the primary-menu drawer in overflow-safe order, hides the wordmark, and preserves both controls' behavior; the toggle still opens/closes the drawer with overlay/Escape close, focus containment/return, and body scroll lock, while desktop stays expanded |
| `workbench-mobile-inspector.spec.mjs` | Mobile Workbench places the shared deerstalker `Open Inspector` action before `Change Focus`, opens the existing related-context list in the shared full-screen drawer, contains and returns focus through Escape/Close, and preserves the unchanged wide desktop Inspector grid placement and content |
| `workbench-mobile-chip-layout.spec.mjs` | Long Task Focus copy and tags stack without overlap at 375px; each Other Active Timer keeps its own source/status chips, body, and actions within the same card; the page has no horizontal overflow or console errors, while desktop retains compact side placement |
| `console.spec.mjs` | No `pageerror` or `console.error` outside the documented allowlist while loading the app shell and every smoke surface (Dashboard, Workbench, Tasks, Notes, Files, Lists) |
| `modal.spec.mjs` | The Tasks Add Task dialog fits entirely inside the viewport at both viewports, forces no page horizontal scroll while open, and opens without console errors |
| `tag-picker-workflows.spec.mjs` | Reporting proves the shared typable tag-filter search, suggestion selection, and canonical ID handoff; Notes proves the native Bulk Edit tag picker and persists a real two-note bulk assignment through the Tags-owned API |
| `client-projects-read-polish.spec.mjs` | Desktop Clients/Projects tables prove workspace-only Project filtering, service-owned hierarchy hyphens, wrapped tag chips without redundant labels/dividers, blank visible utility headers with accessible controls, and unclipped filter focus outlines |
| `client-projects-add-dialog-flow.spec.mjs` | Desktop/mobile Add Project proves the readable workspace option, non-billable workspace default, Parent/Tags alignment, stacked framework Add Client dialog, new-Client selection handoff, and persisted Project ownership |
| `client-projects-edit-dialog-reflow.spec.mjs` | Desktop/mobile Edit Project proves the wide unboxed framework shell, ordered full-width identity fields, unboxed full-width tags, Task Reminder placement under Task module defaults, unchanged footer actions, and persisted save behavior |
| `task-bulk-project-assignment.spec.mjs` | Desktop/mobile Tasks proves selected-row bulk Project assignment, Business Client scoping and derivation, canonical bulk-route persistence, and refreshed Task context |
| `task-editor-parent-save.spec.mjs` | Desktop/mobile Tasks proves Parent Task hierarchy ordering and that Edit Save persists while the canonical editor remains open |
| `a11y.spec.mjs` | Automated WCAG A/AA axe scans (shared helper in `support/axe.mjs`) of Dashboard, Workbench, Tasks, the open filter sidebar, the Add Task modal, its validation-error state, the stacked tags child dialog, and the open mobile nav drawer |
| `a11y-keyboard.spec.mjs` | Interaction-dependent accessibility axe cannot judge: keyboard reachability, visible focus, modal focus containment and Escape/focus-return, sidebar Escape/focus-return, and no keyboard trap |

The accessibility specs also run standalone via `npm run test:a11y` (same harness, same managed server and storage state). `@axe-core/playwright` is dev/test-only like Playwright itself; the `release.playwright-dev-only-boundary` gate fails if either package reaches production `dependencies` or any runtime source. Automated scans are not WCAG conformance — `docs/accessibility.md` owns the automation/manual-review boundary and the manual checklist.

Shared surface paths and framework anatomy hooks live in `tests/e2e/support/surfaces.mjs`.

## Adding Specs

1. Create `tests/e2e/<concern>.spec.mjs`. Use the `.spec.mjs` suffix — Vitest discovers `tests/**/*.test.mjs`, so `.test.mjs` names would collide with the unit-test runner.
2. Import shared surfaces/anatomy from `tests/e2e/support/surfaces.mjs` rather than redefining selectors.
3. Keep selectors resilient: prefer stable framework anatomy hooks (module host `data-*` attributes, `.site-header`, `.nav-toggle`, `#primary-menu`) over text or positional selectors.
4. Remember every spec runs at both viewports; use the `isMobile` fixture to branch or skip.
5. Specs run against the seeded authenticated session by default. Do not hard-code credentials in specs; the auth setup project owns login.
6. Do not let parallel viewport tests race over durable shared state. Isolate a required mutation to one project and restore it before the test finishes.
7. Keep the suite small and high-signal. This is a smoke harness, not an E2E conversion of the regression suite.

## Console Allowlist Policy

"No major console errors" means every captured `pageerror` and `console.error` event fails the spec unless it matches `CONSOLE_ERROR_ALLOWLIST` in `tests/e2e/console.spec.mjs`. Page errors include their browser stack when Chromium provides one, so clean-checkout failures identify the rendered source path and call sequence instead of only the exception message.

- The allowlist ships **empty**: clean loads produce zero console errors, and it should stay that way.
- Every future entry requires an inline comment documenting why the message is benign. An unexplained entry is a smell, not a fix.
- The check is proven non-vacuous: a deliberately injected `console.error` fails all console specs at both viewports.

## Boundary Rules for Future Work

- Never move `@playwright/test` (or any Playwright package) into `dependencies`.
- Never import Playwright or `tests/e2e/` files from runtime code.
- Never wire `test:e2e` into `npm run check` or make the static gate depend on browser binaries.
- Never point the managed server at real data paths; it owns `data/e2e` exclusively.
- Do not weaken permission, workspace, module-enabled, private/secure-content, or no-raw-ID guardrails to make a page testable.
