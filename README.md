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

- Node.js 20.x or a newer runtime supported by the selected `better-sqlite3` release
- npm
- SQLite command-line tool available as `sqlite3`, or set `SQLITE_COMMAND` until the 0.33.5.21.0 driver swap is complete
- Python and a C++ toolchain, such as Visual Studio Build Tools on Windows, only if npm cannot use a prebuilt `better-sqlite3` binary

### Setup

Install dependencies:

```sh
npm install
```

The app stores local runtime data in `data/`, including the SQLite database at `data/longtail-forge.db`. Database migrations run automatically when the server starts.

### Optional Environment Variables

- `HOST`: server host, defaults to `127.0.0.1`
- `PORT`: server port, defaults to `8001`
- `SQLITE_COMMAND`: SQLite executable, defaults to `sqlite3`
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

The main check runs the full regression suite through a timed runner before ESLint. It preserves release-gate coverage while parallelizing only safe regression buckets.

Run the permission regression suite when permissions, workspace lifecycle, task access, reporting access, or module access rules change:

```sh
npm run test:permissions
```

## License

Longtail Forge is licensed under the GNU Affero General Public License v3.0 or later.

You may use, study, modify, and self-host Longtail Forge under the terms of the AGPL. If you modify Longtail Forge and make it available to users over a network, you must make the corresponding source code for your modified version available under the AGPL.

Commercial licensing may be available separately.

## Trademark

"Longtail Forge" and the Longtail Forge logo are trademarks of Michael York DBA Raymond Tec. You may use the name to refer to the original project, but you may not use the name, logo, or confusingly similar branding for a competing hosted service or modified distribution without permission.
