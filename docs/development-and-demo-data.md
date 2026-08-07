# Development and Demo Data

Version 0.33.26.9 provides two reproducible, local-only pretty-data profiles:

- `development` creates the fat, polished developer database under `data/development-seed`, retaining the configured operator and adding seven private role logins.
- `sanitized-demo` creates the screenshot/recording database under `data/sanitized-demo`.

These are separate from automated test fixtures and from the scale/performance profiles in `scripts/seed-scale.mjs`. Normal installation and startup never run either seed command. Generated databases and Files objects remain ignored runtime data and must not be committed.

As of 0.33.31.6, the named `rt-ltf-demo` Compose operation reuses the same `sanitized-demo` scenario and role/scope definition to build a separate, non-activating public baseline candidate: six deterministic public visitor credentials plus one private operator credential from a root-owned, exact-target-bound version 2 document. The host file cannot override or add visitor values, and the public mode is refused without the exact binding. Candidate build and validation do not relax this local CLI's development-environment and marked-directory refusals, stop the running container, or replace its database/Files. Reviewed source and runbook are tracked, while generated candidates, live data, Files objects, markers, backups, logs, and the private operator credential remain host-only. See [Public Demo Baseline Candidate and Historical Host Reset](demo-data-operations.md).

As of 0.33.27.6, fresh bootstrap Workspaces and Users use the central UUIDv7 record authority while the deterministic `development` and `sanitized-demo` scenario records deliberately retain their established UUIDv4 fixture IDs. Seed validation proves representative Client, Project, Task, Note, List, relationship, and Search references remain exact and valid. Do not regenerate, normalize, or migrate an existing pretty-data world merely to change UUID versions.

## Seed a local profile

Set the initial operator identity and a unique local password in the untracked root `.env`. The seed CLI loads that file before bootstrap configuration is read; explicit process-environment values take precedence. The command does not contain or print a shared password. This operator configuration belongs to the ordinary `development` profile.

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

Configure the seven private role credentials below before running either seed. Use `npm run dev:data:seed` for the normal fat development world or `npm run demo:data:seed` for a separate screenshot/recording database. These commands are unrelated to the deliberately oversized scale/stress seed. They create only their exact marked directories; an existing or non-empty target is refused rather than merged or overwritten.

Bootstrap creates that protected operator only when the installation has no users. If any protected user, `super_admin` assignment, or other user row already exists, startup does not create or rename a user merely because `SUPER_ADMIN_USERNAME` changed. A fresh install without `SUPER_ADMIN_PASSWORD` fails with an actionable configuration error; it never generates or prints a credential.

The canonical local `data/development-seed` world always uses the current local date (`Today()`) so each reset keeps the fictional due/overdue/upcoming states useful. Run it through the normal package command without a fixed date:

```powershell
npm run dev:data:seed
```

The explicit `--anchor-date` CLI option is reserved for isolated regression fixtures and controlled demo/capture operations; do not use it for the canonical local development world.

The result reports counts, a semantic fingerprint, and safe entry points for Dashboard, Workbench Focus Selection, and the seeded Task Focus task. It never reports a password. Seed completion also requires `PRAGMA integrity_check` and zero `PRAGMA foreign_key_check` rows.

## Configure private pretty-data role logins

Both pretty-data profiles deliberately add one login for every shipped role. Create `.local/sanitized-demo-role-credentials.json`; `.local/` is checked in as ignored, and the seed refuses a repository-local credential file outside that directory, one not covered by the Git ignore policy, or one already tracked by Git. Git ignore does not disable OneDrive or another filesystem-sync tool, so use `LONGTAIL_SANITIZED_DEMO_ROLE_CREDENTIALS_FILE` to select a protected path outside a synced checkout when needed. Never stage, commit, paste into a command line, or place these passwords in `.env`.

```json
{
  "version": 1,
  "passwords": {
    "super_admin": "<unique-strong-private-password>",
    "workspace_admin": "<unique-strong-private-password>",
    "client_admin": "<unique-strong-private-password>",
    "project_admin": "<unique-strong-private-password>",
    "client_user": "<unique-strong-private-password>",
    "project_user": "<unique-strong-private-password>",
    "client_external_user": "<unique-strong-private-password>"
  }
}
```

Replace every bracketed value locally before running the command. The file must contain exactly those seven keys. Every value must be unique, at least 16 characters, satisfy the normal application password policy, and not resemble a default, example, shared, or placeholder credential. The optional `LONGTAIL_SANITIZED_DEMO_ROLE_CREDENTIALS_FILE` variable may point to a different protected local regular file; the source cannot be a symbolic link. Missing, weak, duplicate, unexpected, or indirect input fails before database creation. Only normal Argon2id hashes are stored, and neither seed output nor the permission journey prints a credential.

The resulting identities are fixed:

| Role | Username | Exact assignment |
| --- | --- | --- |
| Super Admin | `role-super-admin@example.test` | installation `all` / `all` |
| Workspace Administrator | `role-workspace-admin@example.test` | Northwind Studio workspace |
| Client Administrator | `role-client-admin@example.test` | Cedar & Bloom client |
| Project Administrator | `role-project-admin@example.test` | Website Refresh project |
| Client User | `role-client-user@example.test` | Cedar & Bloom client |
| Project User | `role-project-user@example.test` | Website Refresh project |
| Client User (External) | `role-client-external-user@example.test` | Cedar & Bloom client |

In `development`, the configured protected operator remains Alex Rivera with all existing Northwind Studio, Northwind Field Ops, Personal, and Family administration; the seven fixed identities are additional accounts, including a separate protected Super Admin fixture. In `sanitized-demo`, the protected bootstrap identity supplies the Super Admin fixture so the deployed candidate still has exactly seven active logins. Every dedicated fixture has one active Northwind Studio membership, exactly one role assignment, and no permission override. The ordinary named personas remain inactive with invalid login values. Role fixtures require an explicit pretty-data profile, `LONGTAIL_ENV=development`, no release branch, and an empty or loopback `LONGTAIL_PUBLIC_URL`; production, release/deployment, preview/customer, ordinary self-hosted, and non-loopback use fails closed.

After seeding, run the complete authenticated permission journey against a disposable copy:

```powershell
npm run demo:roles:journey
```

The journey reads the same private file, seeds a disposable marked database, retains normal authentication throttling and password verification, logs in and out all seven roles, and proves the scoped Client creation, Project Settings, declarative-action, and delegated Role Assignments allow/deny contracts from 0.33.26.1 through 0.33.26.6. Its output contains only a safe check count and role IDs.

The additional bound public profile is exercised with `npm run demo:roles:journey:public`. It requires a version 2 credential document containing only the exact `rt-ltf-demo` binding and private `super_admin` password. The journey authenticates only the six public visitors and proves representative task reads, Time Tracking writes, cross-scope denials, cross-workspace isolation, immutable credentials, normal logout, and the absence of any public Super Administrator credential or assignable role. This is a disposable local proof of the host-bound contract, not permission to enable public-demo behavior on another installation.

## Run the seeded installation

Point a development process at the matching marked directory and reuse the same unique operator password:

```powershell
$env:LONGTAIL_ENV = 'development'
$env:LONGTAIL_DATA_DIR = './data/development-seed'
$env:SUPER_ADMIN_PASSWORD = '<same-unique-local-password>'
npm start
```

The running `./data/development-seed` installation uses the configured operator password plus the seven private fixture passwords. Use `./data/sanitized-demo` only when a separate capture database is useful. These profiles are development tools, not production deployment data. Do not copy their accounts, credential file, or data directory into `rt-ltf-demo`, `rt-ltf`, the Friends-and-Family Preview, or any customer/self-hosted installation. The named-host operation for `rt-ltf-demo` owns a separate root-protected credential contract with different passwords and an exact target/origin binding.

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

The reset command refuses an unmarked directory, a mismatched profile, changed paths, an outside database/Files path, or `LONGTAIL_ENV=production`. Reset removes the database and Files unit but not the private credential file. Regeneration is therefore the matching explicit reset followed by its seed command; rotate the seven local values first when a new credential set is wanted. These local commands never target `rt-ltf-demo` or the Friends-and-Family Preview.

## Seeded product states

The coherent fictional scenarios cover Northwind Studio (Business), a Personal workspace, and a Family workspace. They include fake users and meaningful role assignments, including Priya's Project Administrator assignment scoped to Website Refresh; clients and projects; overdue, due, upcoming, blocked, recurring, completed, in-progress, and undated tasks; checklists; next actions and resume context; Work Resume State; running and paused timers; a completed task-timer entry and manual time; Notes collections, links, tags, revisions, and safe Markdown; reusable, active/partial, and finalized Lists; tiny harmless text/Markdown Files objects; notifications and reminder offsets; Search projections; and the records consumed by Dashboard and Workbench.

As of 0.33.21.18.1, every seeded Task Timer uses the same persisted contract as a runtime-created Task Timer: `running` or `paused`, the `source:tasks:task:<taskId>` slot, Tasks source identity and labels, matching Client/Project context, and Tasks-authored lifecycle-transition metadata. A Task with seeded timer or checked-checklist evidence is `in_progress`; the seed never relies on an `open` Task plus malformed timer state that runtime code must repair.

All persona names, businesses, content, and reserved-domain addresses are fictional. In `development`, every ordinary persona remains inactive with an invalid non-hash password; the normal first-install operator and the seven private fixtures are active. In local `sanitized-demo`, those ordinary personas remain disabled and only the seven private role fixtures are active. Under the separately bound `rt-ltf-demo` public profile, the same identities and scopes become six public visitors plus the private operator; no local credential is reused. Real invitees must receive individual accounts through the shipped Users workflow.

No note uses Secure Notes mode. The builder clears Secure Notes key variables before startup and verifies that no secure payload, wrapped data key, or Secure Notes record exists. It does not create a generalized module seed registry; future shipped modules can add explicit scenario builders after a second real consumer establishes a shared extension need.

## Verification

`database.public-demo-baseline-candidate` separately proves non-mutating dry run, repeatable same-anchor candidate reconstruction, exact release migration identity, fixed credential hashes, marker validation, active database/Files preservation, secret-safe output, and corrupt database/Files/roles/scopes/sessions/protected-state rejection. `release.public-demo-compose-reset` proves the stopped-volume database/Files/marker activation unit, WAL/SHM handling, successful finalization, shared deploy/reset lock, session invalidation and representative role proof ordering, interrupted retirement/promotion/finalization/recovery reconciliation, and fail-closed recovery evidence. `release.public-demo-reset-scheduler` proves the external top-of-hour UTC trigger, no-catch-up policy, same-helper manual parity, correlation identity, contention and failure classification, alert invocation, root-only bounded redacted log, safe host-only disable path, release assets, and Bash syntax on Linux. `database.development-data-seed` creates paired disposable development and sanitized-demo installations with different private passwords and proves each profile's semantic fingerprints and counts match. It verifies the development operator plus seven additional fixtures, the sanitized-demo's exact seven-fixture active set, normal password hashes, exact role/membership/scope rows, no overrides, every ordinary persona disabled, reserved fixture domains, explicit environment/branch/URL activation refusals, Git-ignore and no-command-line-secret contracts, reset ownership, seeded state coverage, Files/Search projections, Secure Notes absence, SQLite integrity, and zero foreign-key violations. Its Task Timer coverage joins every seeded timer to the expected Task, user, workspace, Client, and Project, pins canonical status/slot/transition metadata, and drives the real Tasks service through Start/Resume, Pause, Save Time, and Reset while proving source uniqueness. `permissions.sanitized-demo-role-journey` separately authenticates every private fixture and executes the complete representative allowed/denied role journey. `permissions.public-demo-role-journey` additionally proves the exact six-account bound profile, public/operator credential separation, activation refusals, authorized reads/writes, scoped and workspace denials, immutable credentials, no public Super Administrator path, and logout. `database.startup-maintenance-lifecycle` proves that a changed configured username and an existing nonempty installation cannot cause another administrator to be invented.
