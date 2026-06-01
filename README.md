# Longtail Forge

Plan the project. Track the work. Preserve the knowledge.

## Overview

Longtail Forge started as a simple time tracker and is growing into a small-project operations hub for freelancers, small agencies, and similar teams.

The app currently focuses on:

- Multi-timer time tracking
- Client and project management
- Billable and non-billable reporting
- Manual time entry and time-entry editing
- User login and administration
- Workspace settings
- SQLite-backed local storage

## Background

The name is derived from the Wired article, and later book, *The Long Tail* by Chris Anderson. The concept is that the big, obvious work is only part of the story. In business, a few popular products or projects get most of the attention, but there is a long tail of smaller, niche, less obvious things that collectively matter a lot.

Freelancers and small agencies often fill the gaps left behind by larger agencies and companies. The big project is easy to recognize. It has a start, an end, and a clearly visualized middle. The long tail is the work that comes after launch:

- Small fixes
- Support requests
- Maintenance notes
- Client-specific settings
- Old decisions nobody remembers
- Recurring tasks
- Tiny updates that keep everything running

## Why I Built This Tool

I could not find a good, all-in-one tool that met my needs for time tracking, reporting, tasks, notes, and project management in a way that felt integrated and useful.

## Roadmap Summary

The detailed per-version changelog and future plan live in [ROADMAP.md](ROADMAP.md).

- `0.1` established the original flat-file stopwatch workflow.
- `0.11` added multiple timers, reporting, front-end editing, manual entry, and the dashboard screen.
- `0.12` moved the app to SQLite, added login, separated client/project UI, added billable flags, added a fourth timer, and introduced user administration.
- `0.20.x` modernized the server around Express, repositories, migrations, services, central error handling, and public assets.
- `0.21.x` finishes the legacy refactor and begins app version/footer and front-end organization cleanup.
- `0.22.x` focuses on logging, reporting, edit-entry polish, timer-state refinements, and frontend utility groundwork.
- `0.23.x` adds granular client/project CRUD, database audit logging, audit settings, and an admin audit-log viewer.
- `0.24.x` adds the roles and permissions foundation.
- `0.25.x` adds the public API and API key foundation.
- `0.26.x` introduces module-ready backend architecture.
- `0.27.x` consolidates shared billing and reporting calculations.
- `0.28.x` finishes core time-tracking maturity with database-backed active timer persistence, richer real-user profiles, and UTC-backed time handling.
- `0.30.x` shifts the app language and compatibility layer from organizations toward workspaces before membership, switching, and workspace-type work continues.

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

### Start

```sh
npm run start
```

### Open

Open `http://127.0.0.1:8001/index.html` in your browser, adjusting the port if you set `PORT`.

## License

Longtail Forge is licensed under the GNU Affero General Public License v3.0 or later.

You may use, study, modify, and self-host Longtail Forge under the terms of the AGPL. If you modify Longtail Forge and make it available to users over a network, you must make the corresponding source code for your modified version available under the AGPL.

Commercial licensing may be available separately.

## Trademark

"Longtail Forge" and the Longtail Forge logo are trademarks of Michael York DBA Raymond Tec. You may use the name to refer to the original project, but you may not use the name, logo, or confusingly similar branding for a competing hosted service or modified distribution without permission.
