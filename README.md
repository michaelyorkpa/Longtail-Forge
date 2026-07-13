# Longtail Forge

Plan the project. Track the work. Preserve the knowledge.

Longtail Forge started as a simple time tracker and is growing into a small-project operations hub for freelancers, small agencies, self-hosted teams, and eventually personal/family workspaces.

## Table of Contents

- [Longtail Forge: Product Philosophy](#longtail-forge-product-philosophy)
- [Current State](#current-state)
- [How the Core Modules Work Together](#how-the-core-modules-work-together)
- [Documentation](#documentation)
- [Getting Started](#getting-started)
- [Development Checks](#development-checks)
- [License](#license)
- [Trademark](#trademark)

## Longtail Forge: Product Philosophy

- Never make the user rebuild context from memory.
- Never show twenty choices when one next action will do.
- Never punish drift; help the user recover.
- Make work visible, startable, and resumable.

Longtail Forge is designed to reduce the amount of work a user has to keep in their head. Projects, tasks, notes, lists, files, time entries, reminders, search, and knowledge records should work together as structured context so users can capture information quickly, decide the next action, resume interrupted work, and preserve what was learned.

## Current State

Longtail Forge currently includes:

- Workspace-based login, membership, settings, roles, and scoped permissions
- Client and project management for Business workspaces, plus workspace projects for Personal and Family workspaces
- Time tracking with manual entry, edit-entry workflows, active timer persistence, and UTC-backed storage
- A framework-owned Workbench page for daily active timers and task work
- First-party Tasks with reminders, recurrence, bulk actions, dashboard summaries, task timers, and public API support
- Framework-owned browser search across indexed Tasks, Time Entries, Clients, Projects, and Help articles
- Framework-owned Help Center with baseline product help and module-declared Help contributions
- First-party Notes with Library buckets, collections, Markdown, links, revisions, tags, files, search, Help, and secure-note encryption-at-rest boundaries
- Billable/non-billable reporting, dashboard summaries, audit logging, API keys, and public API foundations
- Module-ready backend structure with explicit first-party module registration, startup manifest validation, registry-driven navigation/settings/views/assets, lifecycle checks, module permissions/API scopes, internal events, framework-owned search, file attachment, and Help Center foundations, and developer example coverage
- A fresh-start database baseline for new installs, a persistent SQLite adapter for local performance, and regression checks for permissions, accessibility, module sanity, migrations, legacy cleanup, and database performance

The near-term roadmap continues expanding framework services and module surfaces that can be shared by current and future modules: support tickets, calendars, broader reporting, richer project tools, and UI consistency passes.

## How the Core Modules Work Together

Longtail Forge keeps different kinds of work in distinct but connected places:

- **Workbench** is the daily work surface. It should help users see what is active, resume what was interrupted, start the next useful action, and recover from drift without digging through every module.
- **Tasks** are commitments and outcomes. A good task should make the next action, ownership, status, due date, project context, reminders, files, notes, and time history easy to find.
- **Lists** are operational checklists, shopping/procurement lists, packing lists, supply lists, parts lists, and reusable repeatable workflows. Lists should help users execute known steps without turning into Notes, Tasks, Files, bookmarks, inventory, purchasing, or ERP.
- **Notes** are working memory and reference context. Notes should collect details, decisions, research, links, and reusable knowledge around clients, projects, tasks, tickets, and other records.
- **Knowledge Base** is the curated publishing layer for reviewed knowledge. Notes can feed KB review workflows, but KB should remain separate from active working notes.
- **Files** are supporting artifacts attached to records. Files should preserve source material where work happens instead of becoming a separate place users have to search first.
- **Search, tags, reminders, notifications, and Help** are recovery systems. They should help users find, resume, understand, and complete work without making the app feel noisy or punitive.

## Documentation

- [ROADMAP.md](ROADMAP.md): detailed per-version plan and forward roadmap
- [CHANGELOG.md](CHANGELOG.md): completed release notes
- [docs/architecture.md](docs/architecture.md): framework/module architecture direction
- [docs/versioning.md](docs/versioning.md): application/asset-version sources, bump command, guardrails, and release workflow
- [docs/docs-ownership.md](docs/docs-ownership.md): changed-area documentation suggestions and closeout note convention
- [docs/module-contract.md](docs/module-contract.md): current module definition contract
- [docs/notes-module.md](docs/notes-module.md): Notes module developer guide
- [docs/time-tracking-module.md](docs/time-tracking-module.md): Time Tracking module boundary
- [docs/accessibility.md](docs/accessibility.md): accessibility target, checks, and manual release checklist
- [docs/public-api.md](docs/public-api.md): public API and API key documentation
- [docs/longtail_forge_permissions_matrix.md](docs/longtail_forge_permissions_matrix.md): role and permission matrix
- [docs/storage-rename-plan.md](docs/storage-rename-plan.md): workspace storage rename plan
- [docs/product-notes.md](docs/product-notes.md): product notes and planning context
- [docs/licensing.md](docs/licensing.md): licensing notes

## Getting Started

### Requirements

- Node.js 24.x, matching the root package `engines.node` range `>=24 <25`
- npm
- Python and a C++ toolchain, such as Visual Studio Build Tools on Windows, only if npm cannot use a prebuilt `better-sqlite3` binary

### Setup

Install dependencies:

```sh
npm install
```

The app stores local runtime data in `data/`, including the SQLite database at `data/longtail-forge.db`. Database migrations run automatically when the server starts.

### Optional Environment Variables

- `HOST`: server host, defaults to `0.0.0.0`
- `PORT`: server port, defaults to `8001`
- `LONGTAIL_DATA_DIR`: local runtime data root, defaults to `./data`
- `LONGTAIL_DATABASE_FILE`: SQLite database path, defaults to `./data/longtail-forge.db`
- `WORKSPACE_INSTALL_MODE`: workspace creation mode, defaults to `self_hosted`; use `saas` for account-type creation limits
- `WORKSPACE_TYPE_LIMIT`: optional workspace type limit; use `business` for business-only installs

### Start

```sh
npm run start
```

Open `http://127.0.0.1:8001/index.html` in your browser, adjusting the port if you set `PORT`.

## Development Checks

Run the main verification check before syncing changes:

```sh
npm run check
```

During focused work, run the narrowest useful check first: `npm run test:files`/`npm run test:tasks` for one-module changes, `npm run test:contracts` plus `npm run typecheck` for schema/contract changes, and `npm run typecheck` plus `npm run test:unit` before the full gate for shared framework changes. The main check runs the fast checks first — the TypeScript typecheck (`npm run typecheck`, `tsc --noEmit`) and the Vitest unit tests (`npm run test:unit`) — then the full regression suite through a timed runner before ESLint. A typecheck or unit-test failure stops the gate in seconds, before the slow suite starts. The regression stage preserves release-gate coverage while parallelizing only safe regression buckets, and runs the cheap static/source bucket before stateful database and file work so deterministic mistakes stop the gate early. During focused work, run `npm run test:regressions:changed` to inspect the working tree and automatically run the routed narrow checks. One-module changes stay narrow; shared framework/view, database, and release changes escalate to `npm run check`. You can still use `npm run test:regressions:<area>` or `node scripts/suggest-regressions-for-changes.mjs` manually. These iteration commands do not replace the full closeout gate.

If an isolated-database regression fails once under parallel load, the runner retries only that script once with a fresh serial fixture. A pass is reported as `flaky-recovered`; a second failure remains a hard failure. Static/source and other buckets are never auto-retried.

For database query changes, run `npm run audit:params:check`. The scanner rejects new unreviewed interpolation findings while allowing informational bound/scanned totals to change without documentation reconciliation. Baseline updates are reserved for dedicated reviewed cleanup.

For migration/schema changes, use `npm run db:migration:create -- <name>`, refresh the generated final-schema snapshot with `npm run db:schema:refresh`, and verify it with `npm run db:schema:check`.

Run `npm run docs:suggest` during closeout to review likely documentation owners. `npm run docs:check` reports warning-only gaps; either update the owning docs or record `No docs change needed: <short reason>.` instead of updating unrelated docs by reflex.

Run `npm run licensing:gates` when preparing a public release, changing dependency notices, or activating outside contribution intake. Its missing-artifact readout is warning-only and does not block ordinary private development.

Run `npm run closeout` at slice closeout to execute the version guard, generated regression-manifest check, database schema check, parameter-binding audit, documentation ownership check, and licensing readiness gate in one pass. It runs every gate and prints a consolidated hard/warning-only status board. This convenience command does not run or replace the full `npm run check` regression and lint gate.

See [docs/regression-suite.md](docs/regression-suite.md) for the current metadata-driven discovery contract, bucket safety model, focused selection options, and add-a-regression workflow.

The rendered end-to-end smoke (`npm run test:e2e`, after a one-time `npm run test:e2e:install`) is a separate, explicitly-run gate: it renders the real app in a browser at named desktop and mobile viewports against an isolated managed server, including automated WCAG A/AA axe scans and keyboard/focus checks (run those alone with `npm run test:a11y`). Playwright and axe are dev/test-only and never part of the production runtime or `npm run check`. A clean axe run is not WCAG conformance; see [docs/e2e-testing.md](docs/e2e-testing.md) and [docs/accessibility.md](docs/accessibility.md).

Run the permission regression suite when permissions, workspace lifecycle, task access, reporting access, or module access rules change:

```sh
npm run test:permissions
```

## License

Longtail Forge Core is licensed under the GNU Affero General Public License v3.0 only (`AGPL-3.0-only`).

You may use, study, modify, and self-host Longtail Forge under the terms of the AGPL. If you modify Longtail Forge and make it available to users over a network, you are responsible for complying with the AGPL's source-code availability requirements for that modified version.

Commercial licensing, managed hosting, official SaaS, support plans, private deployment tooling, and first-party commercial plugins may be offered separately by Michael York d/b/a Raymond Tec or a successor entity.

See [docs/licensing.md](docs/licensing.md) for the full license stack and the policy documents in [docs/licensing/](docs/licensing/).

Public-release and outside-contributor artifacts are future process gates. Their warning-only status is documented in the licensing hub; unrelated feature slices should not rewrite licensing policy to clear those future warnings.

## Trademark

"Longtail Forge" and the Longtail Forge logo are trademarks of Michael York d/b/a Raymond Tec. You may use the name to refer to the original project, but you may not use the name, logo, or confusingly similar branding for a competing hosted service or modified distribution without permission. See [docs/licensing/trademark-policy.md](docs/licensing/trademark-policy.md).
