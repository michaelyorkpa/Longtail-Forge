# Longtail Forge

Plan the project. Track the work. Preserve the knowledge.

Longtail Forge started as a simple time tracker and is growing into a small-project operations hub for freelancers, small agencies, self-hosted teams, and eventually personal/family workspaces.

## Table of Contents

- [Current State](#current-state)
- [Documentation](#documentation)
- [Getting Started](#getting-started)
- [Development Checks](#development-checks)
- [License](#license)
- [Trademark](#trademark)

## Current State

Longtail Forge currently includes:

- Workspace-based login, membership, settings, roles, and scoped permissions
- Client and project management for Business workspaces, plus workspace projects for Personal and Family workspaces
- Time tracking with manual entry, edit-entry workflows, active timer persistence, and UTC-backed storage
- A framework-owned Workbench page for daily active timers and task work
- First-party Tasks with reminders, recurrence, bulk actions, dashboard summaries, task timers, and public API support
- Billable/non-billable reporting, dashboard summaries, audit logging, API keys, and public API foundations
- Module-ready backend structure with first-party modules registered explicitly while the manifest contract matures

The near-term roadmap focuses on formalizing module manifests, Workbench contribution contracts, registry-driven navigation/settings, module lifecycle rules, and future framework services such as tags, search, notifications, notes, support tickets, calendars, and broader project tools.

## Documentation

- [ROADMAP.md](ROADMAP.md): detailed per-version plan and forward roadmap
- [CHANGELOG.md](CHANGELOG.md): completed release notes
- [DECISIONS.md](DECISIONS.md): settled product and architecture decisions
- [docs/architecture.md](docs/architecture.md): framework/module architecture direction
- [docs/module-contract.md](docs/module-contract.md): current module definition contract
- [docs/time-tracking-module.md](docs/time-tracking-module.md): Time Tracking module boundary
- [docs/public-api.md](docs/public-api.md): public API and API key documentation
- [docs/longtail_forge_permissions_matrix.md](docs/longtail_forge_permissions_matrix.md): role and permission matrix
- [docs/storage-rename-plan.md](docs/storage-rename-plan.md): workspace storage rename plan
- [docs/product-notes.md](docs/product-notes.md): product notes and planning context
- [docs/licensing.md](docs/licensing.md): licensing notes

## Getting Started

### Requirements

- Node.js 20 or newer
- npm
- SQLite command-line tool available as `sqlite3`, or set `SQLITE_COMMAND`

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
