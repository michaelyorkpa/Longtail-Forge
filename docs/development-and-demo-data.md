# Development and Demo Data

Version 0.33.17.4 provides two reproducible, local-only data profiles:

- `development` creates a rich developer database under `data/development-seed`.
- `sanitized-demo` creates the screenshot/recording database under `data/sanitized-demo`.

These are separate from automated test fixtures and from the scale/performance profiles in `scripts/seed-scale.mjs`. Normal installation and startup never run either seed command. Generated databases and Files objects remain ignored runtime data and must not be committed.

## Seed a local profile

Choose a unique local operator password and pass it only through the environment. The command does not contain or print a shared password.

PowerShell:

```powershell
$env:SUPER_ADMIN_PASSWORD = '<unique-local-password>'
npm run dev:data:seed
```

POSIX shell:

```sh
SUPER_ADMIN_PASSWORD='<unique-local-password>' npm run dev:data:seed
```

For screenshot and recording work, run `npm run demo:data:seed` instead. The commands create only their exact marked directories. An existing or non-empty target is refused rather than merged or overwritten.

The fixed default anchor date is `2026-07-15`, which makes IDs, scenario values, relative due states, and the semantic fingerprint reproducible. To exercise another date while keeping that run deterministic, invoke the CLI directly with `--anchor-date YYYY-MM-DD` and an explicitly marked target:

```sh
node scripts/development-data.mjs seed --profile development --environment development --data-dir ./data/development-seed --anchor-date 2026-07-15
```

The result reports counts, a semantic fingerprint, and safe entry points for Dashboard, Workbench Focus Selection, and the seeded Task Focus task. It never reports a password.

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

The coherent fictional scenarios cover Northwind Studio (Business), a Personal workspace, and a Family workspace. They include fake users and meaningful role assignments; clients and projects; overdue, due, upcoming, blocked, recurring, completed, in-progress, and undated tasks; checklists; next actions and resume context; Work Resume State; active and paused timers; a completed task-timer entry and manual time; Notes collections, links, tags, revisions, and safe Markdown; reusable, active/partial, and finalized Lists; tiny harmless text/Markdown Files objects; notifications and reminder offsets; Search projections; and the records consumed by Dashboard and Workbench.

All persona names, businesses, content, and `example.com` addresses are fictional. Persona accounts are inactive and contain an invalid non-hash password value, so they cannot be used as shared preview logins. The one active operator is the normal first-install account protected by the unique password supplied at seed time. Real invitees must receive individual accounts through the shipped Users workflow.

No note uses Secure Notes mode. The builder clears Secure Notes key variables before startup and verifies that no secure payload, wrapped data key, or Secure Notes record exists. It does not create a generalized module seed registry; future shipped modules can add explicit scenario builders after a second real consumer establishes a shared extension need.

## Verification

`database.development-data-seed` creates two disposable installations with different operator passwords and proves their semantic fingerprints and counts match. It also checks target refusal, reset ownership, fake-account login disablement, seeded state coverage, Files bytes, Secure Notes absence, and SQLite integrity.
