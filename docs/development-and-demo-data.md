# Development and Demo Data

Version 0.33.26.8 provides two reproducible, local-only data profiles:

- `development` creates a rich developer database under `data/development-seed`.
- `sanitized-demo` creates the screenshot/recording database under `data/sanitized-demo`.

These are separate from automated test fixtures and from the scale/performance profiles in `scripts/seed-scale.mjs`. Normal installation and startup never run either seed command. Generated databases and Files objects remain ignored runtime data and must not be committed.

Version 0.33.26.8 reuses the same `sanitized-demo` scenario and role definition behind a separate, named-host-only Linux operation for `rt-ltf-demo`. The host helper reads seven different private passwords from a root-owned, exact-target-bound credential document and passes only that protected file path to the candidate seed. That operation does not relax this local CLI's development-environment and marked-directory refusals. Its reviewed source and runbook are tracked, while the generated demo database, Files objects, marker, backups, logs, and credentials remain host-only. See [Demo Host Data Provisioning and Reset](demo-data-operations.md).

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

For screenshot and recording work, configure the seven private role credentials below and run `npm run demo:data:seed` instead. The commands create only their exact marked directories. An existing or non-empty target is refused rather than merged or overwritten.

Bootstrap creates that protected operator only when the installation has no users. If any protected user, `super_admin` assignment, or other user row already exists, startup does not create or rename a user merely because `SUPER_ADMIN_USERNAME` changed. A fresh install without `SUPER_ADMIN_PASSWORD` fails with an actionable configuration error; it never generates or prints a credential.

The canonical local `data/development-seed` world always uses the current local date (`Today()`) so each reset keeps the fictional due/overdue/upcoming states useful. Run it through the normal package command without a fixed date:

```powershell
npm run dev:data:seed
```

The explicit `--anchor-date` CLI option is reserved for isolated regression fixtures and controlled demo/capture operations; do not use it for the canonical local development world.

The result reports counts, a semantic fingerprint, and safe entry points for Dashboard, Workbench Focus Selection, and the seeded Task Focus task. It never reports a password. Seed completion also requires `PRAGMA integrity_check` and zero `PRAGMA foreign_key_check` rows.

## Configure private sanitized-demo role logins

The local `sanitized-demo` profile deliberately adds one login for every shipped role. Create `.local/sanitized-demo-role-credentials.json`; `.local/` is checked in as ignored, and the seed refuses a repository-local credential file outside that directory, one not covered by the Git ignore policy, or one already tracked by Git. Git ignore does not disable OneDrive or another filesystem-sync tool, so use `LONGTAIL_SANITIZED_DEMO_ROLE_CREDENTIALS_FILE` to select a protected path outside a synced checkout when needed. Never stage, commit, paste into a command line, or place these passwords in `.env`.

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

The protected bootstrap identity supplies the Super Admin fixture. Every other fixture has exactly one active Northwind Studio membership, exactly one role assignment, and no permission override. The ordinary named personas remain inactive with invalid login values. The role-fixture option is accepted only by the explicit `sanitized-demo` seed with `LONGTAIL_ENV=development`, no release branch, and an empty or loopback `LONGTAIL_PUBLIC_URL`; production, release/deployment, preview/customer, ordinary self-hosted, and non-loopback use fails closed.

After seeding, run the complete authenticated permission journey against a disposable copy:

```powershell
npm run demo:roles:journey
```

The journey reads the same private file, seeds a disposable marked database, retains normal authentication throttling and password verification, logs in and out all seven roles, and proves the scoped Client creation, Project Settings, declarative-action, and delegated Role Assignments allow/deny contracts from 0.33.26.1 through 0.33.26.6. Its output contains only a safe check count and role IDs.

## Run the seeded installation

Point a development process at the matching marked directory and reuse the same unique operator password:

```powershell
$env:LONGTAIL_ENV = 'development'
$env:LONGTAIL_DATA_DIR = './data/development-seed'
$env:SUPER_ADMIN_PASSWORD = '<same-unique-local-password>'
npm start
```

Use `./data/sanitized-demo` for a demo capture and reuse the configured fixture passwords only on that local installation. These profiles are development tools, not production deployment data. Do not copy their accounts, credential file, or data directory into `rt-ltf-demo`, `rt-ltf`, the Friends-and-Family Preview, or any customer/self-hosted installation. The named-host operation for `rt-ltf-demo` owns a separate root-protected credential contract with different passwords and an exact target/origin binding.

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

The reset command refuses an unmarked directory, a mismatched profile, changed paths, an outside database/Files path, or `LONGTAIL_ENV=production`. Reset removes the database and Files unit but not the private credential file. Regeneration is therefore an explicit `npm run demo:data:reset` followed by `npm run demo:data:seed`; rotate the seven local values first when a new credential set is wanted. These local commands never target `rt-ltf-demo` or the Friends-and-Family Preview.

## Seeded product states

The coherent fictional scenarios cover Northwind Studio (Business), a Personal workspace, and a Family workspace. They include fake users and meaningful role assignments, including Priya's Project Administrator assignment scoped to Website Refresh; clients and projects; overdue, due, upcoming, blocked, recurring, completed, in-progress, and undated tasks; checklists; next actions and resume context; Work Resume State; running and paused timers; a completed task-timer entry and manual time; Notes collections, links, tags, revisions, and safe Markdown; reusable, active/partial, and finalized Lists; tiny harmless text/Markdown Files objects; notifications and reminder offsets; Search projections; and the records consumed by Dashboard and Workbench.

As of 0.33.21.18.1, every seeded Task Timer uses the same persisted contract as a runtime-created Task Timer: `running` or `paused`, the `source:tasks:task:<taskId>` slot, Tasks source identity and labels, matching Client/Project context, and Tasks-authored lifecycle-transition metadata. A Task with seeded timer or checked-checklist evidence is `in_progress`; the seed never relies on an `open` Task plus malformed timer state that runtime code must repair.

All persona names, businesses, content, and reserved-domain addresses are fictional. In `development`, every persona account is inactive and contains an invalid non-hash password value; the one active operator is the normal first-install account protected by the unique password supplied at seed time. In `sanitized-demo`, those ordinary personas remain disabled and only the seven private role fixtures above are active. These are private permission-test identities, not the public shared accounts planned for 0.33.31. Real invitees must receive individual accounts through the shipped Users workflow.

No note uses Secure Notes mode. The builder clears Secure Notes key variables before startup and verifies that no secure payload, wrapped data key, or Secure Notes record exists. It does not create a generalized module seed registry; future shipped modules can add explicit scenario builders after a second real consumer establishes a shared extension need.

## Verification

`database.development-data-seed` creates paired disposable development and sanitized-demo installations with different private passwords and proves each profile's semantic fingerprints and counts match. It verifies exactly seven active demo fixtures, normal password hashes, exact role/membership/scope rows, no overrides, every other persona disabled, reserved identity domains, explicit environment/branch/URL activation refusals, Git-ignore and no-command-line-secret contracts, reset ownership, seeded state coverage, Files/Search projections, Secure Notes absence, SQLite integrity, and zero foreign-key violations. Its Task Timer coverage joins every seeded timer to the expected Task, user, workspace, Client, and Project, pins canonical status/slot/transition metadata, and drives the real Tasks service through Start/Resume, Pause, Save Time, and Reset while proving source uniqueness. `permissions.sanitized-demo-role-journey` separately authenticates every fixture and executes the complete representative allowed/denied role journey. `database.startup-maintenance-lifecycle` proves that a changed configured username and an existing nonempty installation cannot cause another administrator to be invented.
