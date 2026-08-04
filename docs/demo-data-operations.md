# Demo Host Data Provisioning and Reset

Version 0.33.26.8 extends the explicit operator operation for the named Longtail Forge demo/development installation. It installs the same coherent fictional scenario and seven-role permission fixture used by the local `sanitized-demo` profile while keeping the production runtime, normal startup, and routine Nightly deployments non-destructive.

This is not a general production seed command. The operation accepts only target `rt-ltf-demo`, host identity `rt-ltf-demo`, and public origin `https://demo.longtailforge.com`. Do not install its root-owned wrapper or helper configuration on preview, customer, or ordinary self-hosted installations.

## Repository and host boundaries

Repository/runtime-artifact owned:

- deterministic fictional scenario builder;
- guarded Linux host operation;
- root-owned wrapper and non-secret helper configuration example;
- shared deterministic role identity/scope definition and credential validator;
- regressions and this runbook.

Demo-host-only state:

- generated SQLite database and Files objects;
- `.longtail-demo-data.json` ownership marker;
- current and retained previous data directories;
- whole-instance archives, checksums, and operator logs;
- application environment and the separately installed role credential document;

Generated state never enters Git or a runtime artifact. The runtime artifact contains the reviewed operator code so the installed release can build and verify its own matching database. The wrapper is installed separately only on the named demo host.

## Install the operator boundary

Work from reviewed LF-only copies with Unix LF line endings. As an authorized root operator:

```sh
install -o root -g root -m 0755 \
  scripts/release/longtail-forge-demo-data-host.example \
  /usr/local/sbin/longtail-forge-demo-data

install -o root -g root -m 0600 \
  docs/demo-data-helper.env.example \
  /etc/longtail-forge/demo-data-helper.env
```

Review the installed helper environment before use. It contains only the exact target/hostname/public-origin identity, service/account names, and protected-path locations, including `LTF_ROLE_CREDENTIALS=/etc/longtail-forge/demo-role-credentials.json`. It must remain a real root-owned file under a real root-owned parent, with exact mode `0600`; neither path may be group- or other-writable. Do not put `SUPER_ADMIN_PASSWORD`, Secure Notes key material, or any other secret in this helper file.

Create the separate role credential document with a root-only editor or secret-management installation step, then enforce `root:root` ownership and mode `0600`. Do not construct it in shell history or pass a value as a command argument:

```json
{
  "version": 1,
  "binding": {
    "target": "rt-ltf-demo",
    "publicUrl": "https://demo.longtailforge.com"
  },
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

Replace every bracketed value before installation. The document must contain exactly these fields and role keys. Each password must be unique, at least 16 characters, satisfy the normal application password policy, and differ from every password, token, master key, or other secret in the application environment. Never copy a Friends-and-Family Preview credential or its environment file. The target/origin binding, protected path, non-symlink check, exact mode, and distinct-secret check all fail closed before service quiescence or backup.

The application environment remains `/etc/longtail-forge/longtail-forge.env` and is parsed only after exact root/hostname/target/origin refusal. It still supplies the production runtime and backup inventory, but no application secret enters the candidate seed. The minimal child environment contains only safe process keys, local development/SQLite/scanner settings, and the protected role-file path. The child reads the seven values directly, validates them again, and stores only normal Argon2id hashes. The values never enter arguments, helper configuration, markers, backups, logs, output, or the runtime artifact.

## Preflight

Run the non-mutating preflight from the exact installed release before provision or reset:

```sh
/usr/local/sbin/longtail-forge-demo-data preflight \
  --target rt-ltf-demo \
  --anchor-date today \
  --confirm "PREFLIGHT RT-LTF-DEMO DATA"
```

Preflight performs the complete identity, configuration, protected-file, credential, release, path, ownership/mode, current-data, marker, and partial-state checks. It reports only `preflight-ready`, the exact target, resolved anchor, installed version, fixture count, and whether the next operation is `provision` or `reset`. It does not stop a service, create a backup, stage data, or mutate the database or Files.

## First provision

Choose and record an explicit anchor date, or pass the literal `today` to anchor the fictional timeline to the current date. Every seeded date is a relative offset (anchor -30 through anchor +30 days), so the anchor controls all overdue/today/upcoming states and remains in the host-only ownership marker.

```sh
/usr/local/sbin/longtail-forge-demo-data provision \
  --target rt-ltf-demo \
  --anchor-date today \
  --confirm "PROVISION RT-LTF-DEMO DATA"
```

`provision` is accepted only while the current installation has no demo-data ownership marker. Once successfully provisioned, use `reset`.

## Manual regeneration

Routine verified `nightly` deployments preserve the database and Files tree. They never invoke this command. Let test changes accumulate until the environment is deliberately returned to the fictional baseline:

```sh
/usr/local/sbin/longtail-forge-demo-data reset \
  --target rt-ltf-demo \
  --anchor-date today \
  --confirm "RESET RT-LTF-DEMO DATA"
```

Resetting with `--anchor-date today` re-anchors the whole relative timeline: yesterday's overdue tasks stay one day overdue, next week's work stays next week. An explicit `YYYY-MM-DD` anchor remains available for pinned, repeatable captures.

The fictional scenario remains the fat Northwind dataset (seed contract `development-data-v2`): 5 workspaces (Northwind Studio, Northwind Field Ops, two personal, one family), 17 inactive/login-disabled ordinary personas, 7 active private role fixtures, 20 clients, 46 projects, 400 tasks across every lifecycle state, 200 notes, 24 lists, ~600 time entries, and a fully materialized Search index — generated deterministically from themed pools so two seeds with the same anchor and different private passwords produce identical semantic fingerprints.

`reset` requires the matching live ownership marker. It refuses an unmarked, mismatched, preview/customer, unknown-host, unknown-origin, non-production, symbolic-link-substituted, incorrectly owned/mode, partial-stage, unexpectedly populated, nested backup/data, or unresolved installation.

## What the operation does

For both actions the helper:

1. Refuses the wrong root/hostname/target/origin before reading either protected credential source, then verifies the exact release, service, account, path, ownership/mode, marker, host-bound role document, distinct-secret, and secret-presence contracts without printing protected values.
2. Records active app/worker/edge services, stops them, and proves they are quiesced.
3. Creates and inspects a whole-instance backup of the current SQLite database and Files objects together. No replacement starts until the archive is restorable and its checksum matches.
4. Builds the fictional database and Files tree in a new same-filesystem sibling staging directory through the reviewed `sanitized-demo` role-fixture definition. No application secret crosses into the minimal child environment; only the protected role-file path does.
5. Verifies SQLite integrity, zero foreign-key violations, the semantic fingerprint and expected counts, exactly seven active role identities with exact role/scope/membership rows and no overrides, all ordinary personas inactive, reserved identity domains, no Secure Notes material, Search projections, and every seeded Files object's size and SHA-256.
6. Writes the host-only ownership marker, rejects symbolic links, reapplies the dedicated application ownership and private modes, and swaps the database plus Files tree together by promoting the staged data root.
7. Restarts the previously active services and requires direct readiness plus public health/readiness and the exact current `nightly` runtime identity.

If staging, promotion, restart, or verification fails, the helper restores the retained prior data root and restarts the prior services. If that recovery also fails, it leaves traffic closed and reports that the retained whole-instance backup is required. It never prunes older backups or retained successful pre-reset data automatically.

Normal successful output is deliberately limited to the target, anchor date, semantic fingerprint/counts, backup filename/checksum/ID, retained previous-state basename, and public runtime identity. It excludes paths, environment values, passwords, key material, file contents, storage keys, and raw application data.

## Recovery and post-operation proof

Keep the pre-reset archive, checksum sidecar, retained previous data state, prior runtime artifact, and any separately protected Secure Notes recovery material through the observation period. Inspect a retained archive from the current installed release with:

```sh
cd /opt/longtail-forge/current
npm run backup:inspect -- \
  --archive /var/backups/longtail-forge/<backup>.ltfbackup.tgz
```

Use the full restore command and recovery rules in [Baseline Backup and Restore](backup-restore.md) if automatic prior-state recovery failed. Never mix one snapshot's database with another snapshot's Files tree.

After the first installation and after any reset, retain a private operational record of the sanitized output and separately prove all seven logins, exact role/scope assignments, disabled ordinary-persona login, representative permission allows/denials, Search, Files read/preview, worker/job health, direct and public health/readiness, and `/api/app-info`. Local regressions do not substitute for the live evidence.

## Reviewed 0.33.26.9 live-operation checklist

Do not begin the live operation until every item is available:

1. All changes through 0.33.26.8 are merged through the protected topic-to-`nightly` path and the exact immutable artifact is deployed to `rt-ltf-demo`.
2. Direct and public health, readiness, canonical version, `nightly` branch, commit, and artifact checksum all match that deployed artifact.
3. The installed wrapper and helper are reviewed copies; the helper points to the separate root-owned `0600` demo role document with exact target/origin binding.
4. Preflight returns `preflight-ready` and `nextAction: reset` without a service, backup, database, Files, or marker change.
5. A new whole-instance database-and-Files backup can be created and inspected as restorable; the retained prior data state and prior runtime artifact have sufficient storage and a reviewed recovery path.
6. The exact reset confirmation is entered only for target `rt-ltf-demo`. Never run a provision, reset, seed, credential, backup, or data command against `rt-ltf` or the Friends-and-Family Preview.
7. After activation, prove integrity, foreign keys, Files/Search, all seven private logins and exact scopes, representative 0.33.26 permission behavior, rejection of an old session, direct/public runtime identity, and automatic prior-state restoration on any failed activation check.
8. Retain only sanitized operational evidence. No credential value, protected path, application environment, backup content, raw assignment identifier, or secret-bearing command/output belongs in repository history.
