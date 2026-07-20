# Demo Host Data Provisioning and Reset

Version 0.33.19.1 adds one explicit operator operation for the named Longtail Forge demo/development installation. It installs the same coherent fictional scenario used by the local `development` profile while keeping the production runtime, normal startup, and routine Nightly deployments non-destructive.

This is not a general production seed command. The operation accepts only target `rt-ltf-demo`, host identity `rt-ltf-demo`, and public origin `https://demo.longtailforge.com`. Do not install its root-owned wrapper or helper configuration on preview, customer, or ordinary self-hosted installations.

## Repository and host boundaries

Repository/runtime-artifact owned:

- deterministic fictional scenario builder;
- guarded Linux host operation;
- root-owned wrapper and non-secret helper configuration example;
- regressions and this runbook.

Demo-host-only state:

- generated SQLite database and Files objects;
- `.longtail-demo-data.json` ownership marker;
- current and retained previous data directories;
- whole-instance archives, checksums, and operator logs;
- application environment and all credentials.

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

Review the installed helper environment before use. It contains only the exact target/hostname/public-origin identity, service/account names, and protected-path locations. It must remain a real root-owned file under a real root-owned parent, with neither path group- nor other-writable. Do not put `SUPER_ADMIN_PASSWORD`, Secure Notes key material, or any other secret in this helper file.

The application environment remains `/etc/longtail-forge/longtail-forge.env`. The operation parses that protected file as literal environment data and obtains the demo installation's own strong `SUPER_ADMIN_PASSWORD` from it. It never copies a developer `.env`, places the password in arguments, or prints it. Changing the environment value does not silently rotate an existing account; the explicit provision/reset replaces the fictional installation as a unit.

## First provision

Choose and record an explicit anchor date. It controls the fictional relative due states and remains in the host-only ownership marker.

```sh
/usr/local/sbin/longtail-forge-demo-data provision \
  --target rt-ltf-demo \
  --anchor-date YYYY-MM-DD \
  --confirm "PROVISION RT-LTF-DEMO DATA"
```

`provision` is accepted only while the current installation has no demo-data ownership marker. Once successfully provisioned, use `reset`.

## Manual regeneration

Routine verified `nightly` deployments preserve the database and Files tree. They never invoke this command. Let test changes accumulate until the environment is deliberately returned to the fictional baseline:

```sh
/usr/local/sbin/longtail-forge-demo-data reset \
  --target rt-ltf-demo \
  --anchor-date YYYY-MM-DD \
  --confirm "RESET RT-LTF-DEMO DATA"
```

`reset` requires the matching live ownership marker. It refuses an unmarked, mismatched, preview/customer, unknown-host, unknown-origin, non-production, symbolic-link-substituted, incorrectly owned/mode, partial-stage, unexpectedly populated, nested backup/data, or unresolved installation.

## What the operation does

For both actions the helper:

1. Verifies exact host, public origin, release, service, account, path, ownership/mode, marker, and secret-presence contracts without printing protected values.
2. Records active app/worker/edge services, stops them, and proves they are quiesced.
3. Creates and inspects a whole-instance backup of the current SQLite database and Files objects together. No replacement starts until the archive is restorable and its checksum matches.
4. Builds the fictional database and Files tree in a new same-filesystem sibling staging directory through the existing `development` scenario definition. Only the operator identity fields and password needed for bootstrap cross from the protected application environment into this minimal seed process; other production secrets do not.
5. Verifies SQLite integrity, zero foreign-key violations, the semantic fingerprint and expected counts, inactive/non-login persona accounts, no Secure Notes material, Search projections, and every seeded Files object's size and SHA-256.
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

After the first installation and after any reset, retain a private operational record of the sanitized output and separately prove operator login, disabled persona login, representative Search, representative Files read/preview, worker/job health, direct and public health/readiness, and `/api/app-info`. The first real `rt-ltf-demo` execution and a subsequent data-preserving Nightly deployment are external evidence owned by 0.33.19.2; local regressions do not substitute for them.
