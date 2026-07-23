# Development and Demo Data

Version 0.33.17.4 provides two reproducible, local-only data profiles:

- `development` creates a rich developer database under `data/development-seed`.
- `sanitized-demo` creates the screenshot/recording database under `data/sanitized-demo`.

These are separate from automated test fixtures and from the scale/performance profiles in `scripts/seed-scale.mjs`. Normal installation and startup never run either seed command. Generated databases and Files objects remain ignored runtime data and must not be committed.

Version 0.33.19.1 reuses the same `development` scenario definition behind a separate, named-host-only Linux operation for `rt-ltf-demo`. That operation does not relax this local CLI's development-environment and marked-directory refusals. Its reviewed source and runbook are tracked, while the generated demo database, Files objects, marker, backups, logs, and credentials remain host-only. See [Demo Host Data Provisioning and Reset](demo-data-operations.md).

## Seed a local profile

Set the initial operator identity and a unique local password in the untracked root `.env`. The seed CLI loads that file before bootstrap configuration is read; explicit process-environment values take precedence. The command does not contain or print a shared password.

PowerShell:

```powershell
npm run dev:data:seed
```

Root `.env`:

```dotenv
SUPER_ADMIN_USERNAME='operator@example.test'
SUPER_ADMIN_DISPLAY_NAME='Local Operator'
SUPER_ADMIN_PASSWORD='<unique-local-password>'
```

For screenshot and recording work, run `npm run demo:data:seed` instead. The commands create only their exact marked directories. An existing or non-empty target is refused rather than merged or overwritten.

Bootstrap creates that protected operator only when the installation has no users. If any protected user, `super_admin` assignment, or other user row already exists, startup does not create or rename a user merely because `SUPER_ADMIN_USERNAME` changed. A fresh install without `SUPER_ADMIN_PASSWORD` fails with an actionable configuration error; it never generates or prints a credential.

The canonical local `data/development-seed` world always uses the current local date (`Today()`) so each reset keeps the fictional due/overdue/upcoming states useful. Run it through the normal package command without a fixed date:

```powershell
npm run dev:data:seed
```

The explicit `--anchor-date` CLI option is reserved for isolated regression fixtures and controlled demo/capture operations; do not use it for the canonical local development world.

The result reports counts, a semantic fingerprint, and safe entry points for Dashboard, Workbench Focus Selection, and the seeded Task Focus task. It never reports a password. Seed completion also requires `PRAGMA integrity_check` and zero `PRAGMA foreign_key_check` rows.

## Run the seeded installation

Point a development process at the matching marked directory and reuse the same unique operator password:

```powershell
$env:LONGTAIL_ENV = 'development'
$env:LONGTAIL_DATA_DIR = './data/development-seed'
$env:SUPER_ADMIN_PASSWORD = '<same-unique-local-password>'
npm start
```

Use `./data/sanitized-demo` for a demo capture. These profiles are development tools, not production deployment data. Do not copy their operator account or data directory into a friends-and-family or customer installation.

## Reset safely

Use the matching explicit reset command:

```sh
npm run dev:data:reset
npm run demo:data:reset
```

Reset requires all of the following before removing anything:

- `--environment development`;
- the exact `development-seed` or `sanitized-demo` directory segment;
- database and Files paths contained below that directory;
- absence of production/live/customer path markers;
- a marker written by a completed seed of the same profile, with matching absolute paths; and
- the matching explicit confirmation value.

The reset command refuses an unmarked directory, a mismatched profile, changed paths, an outside database/Files path, or `LONGTAIL_ENV=production`.

## Seeded product states

The coherent fictional scenarios cover Northwind Studio (Business), a Personal workspace, and a Family workspace. They include fake users and meaningful role assignments, including Priya's Project Administrator assignment scoped to Website Refresh; clients and projects; overdue, due, upcoming, blocked, recurring, completed, in-progress, and undated tasks; checklists; next actions and resume context; Work Resume State; running and paused timers; a completed task-timer entry and manual time; Notes collections, links, tags, revisions, and safe Markdown; reusable, active/partial, and finalized Lists; tiny harmless text/Markdown Files objects; notifications and reminder offsets; Search projections; and the records consumed by Dashboard and Workbench.

As of 0.33.21.18.1, every seeded Task Timer uses the same persisted contract as a runtime-created Task Timer: `running` or `paused`, the `source:tasks:task:<taskId>` slot, Tasks source identity and labels, matching Client/Project context, and Tasks-authored lifecycle-transition metadata. A Task with seeded timer or checked-checklist evidence is `in_progress`; the seed never relies on an `open` Task plus malformed timer state that runtime code must repair.

All persona names, businesses, content, and `example.com` addresses are fictional. Persona accounts are inactive and contain an invalid non-hash password value, so they cannot be used as shared preview logins. The one active operator is the normal first-install account protected by the unique password supplied at seed time. Real invitees must receive individual accounts through the shipped Users workflow.

No note uses Secure Notes mode. The builder clears Secure Notes key variables before startup and verifies that no secure payload, wrapped data key, or Secure Notes record exists. It does not create a generalized module seed registry; future shipped modules can add explicit scenario builders after a second real consumer establishes a shared extension need.

## Verification

`database.development-data-seed` creates two disposable installations with different operator passwords and proves their semantic fingerprints and counts match. It also checks `.env` loading order with explicit-environment precedence, configured operator identity, target refusal, reset ownership, fake-account login disablement, seeded state coverage, Files bytes, Secure Notes absence, and SQLite integrity. Its Task Timer coverage joins every seeded timer to the expected Task, user, workspace, Client, and Project, pins canonical status/slot/transition metadata, and drives the real Tasks service through Start/Resume, Pause, Save Time, and Reset while proving source uniqueness. `database.startup-maintenance-lifecycle` separately proves that a changed configured username and an existing nonempty installation cannot cause another administrator to be invented.
