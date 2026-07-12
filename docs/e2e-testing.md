# End-to-End Smoke Testing (Playwright)

Longtail Forge's rendered end-to-end smoke harness renders the real app in a real browser at fixed desktop and mobile viewports and asserts the handful of things the static regression suite cannot see: real rendered layout width, mobile navigation behavior, and runtime console errors.

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

## The Core Smoke Specs

Specs are organized one file per concern under `tests/e2e/`:

| Spec | Concern |
| --- | --- |
| `app-load.spec.mjs` | App shell renders with the right navigation affordance, the exact mobile-safe viewport meta, the 44px tap-target floor on the mobile nav toggle, and no fatal load error |
| `overflow.spec.mjs` | Dashboard, Workbench, Tasks, Notes, Files, and Lists have no horizontal overflow (real rendered `document.scrollingElement` width, not CSS strings) |
| `mobile-nav.spec.mjs` | The mobile nav toggle opens/closes the primary menu drawer with focus on a visible control, plus the drawer contract: overlay and Escape close affordances, focus moving into the open drawer and returning to the toggle, and a body scroll lock while open |
| `console.spec.mjs` | No `pageerror` or `console.error` outside the documented allowlist while loading the app shell and every smoke surface (Dashboard, Workbench, Tasks, Notes, Files, Lists) |
| `modal.spec.mjs` | The Tasks Add Task dialog fits entirely inside the viewport at both viewports, forces no page horizontal scroll while open, and opens without console errors |
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
6. Keep the suite small and high-signal. This is a smoke harness, not an E2E conversion of the regression suite.

## Console Allowlist Policy

"No major console errors" means every captured `pageerror` and `console.error` event fails the spec unless it matches `CONSOLE_ERROR_ALLOWLIST` in `tests/e2e/console.spec.mjs`.

- The allowlist ships **empty**: clean loads produce zero console errors, and it should stay that way.
- Every future entry requires an inline comment documenting why the message is benign. An unexplained entry is a smell, not a fix.
- The check is proven non-vacuous: a deliberately injected `console.error` fails all console specs at both viewports.

## Boundary Rules for Future Work

- Never move `@playwright/test` (or any Playwright package) into `dependencies`.
- Never import Playwright or `tests/e2e/` files from runtime code.
- Never wire `test:e2e` into `npm run check` or make the static gate depend on browser binaries.
- Never point the managed server at real data paths; it owns `data/e2e` exclusively.
- Do not weaken permission, workspace, module-enabled, private/secure-content, or no-raw-ID guardrails to make a page testable.
