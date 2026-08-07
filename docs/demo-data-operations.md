# Public Demo Baseline Candidate and Historical Host Reset

As of version 0.33.31.6, the current operator boundary for the named Longtail Forge demo installation builds and validates a coherent public baseline candidate alongside the active Compose database and Files. It derives six public visitors and one separate private Super Administrator from the same reviewed seven-role fixture used by local `sanitized-demo`. It does not stop a container, create a backup, replace active state, schedule a reset, or activate the candidate; Compose activation and automatic recovery belong to 0.33.31.7, and external hourly scheduling belongs to 0.33.31.8.

This is not a general production seed command. It accepts only target `rt-ltf-demo`, the exact production Compose public-demo profile, the canonical container data root `/var/lib/longtail-forge`, and public origin `https://demo.longtailforge.com`. Do not run it on preview, customer, ordinary self-hosted, or private development installations.

## Repository and host boundaries

Repository/runtime-artifact owned:

- deterministic fictional scenario builder;
- non-activating Compose candidate builder and validator;
- retained historical pre-Compose host operation source for reference until the Compose activation replacement lands;
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

## Build and validate the current Compose candidate

Use the immutable image and release environment already recorded by the protected Compose deployment helper. Review the exact release environment path in the root-owned deployment state, assign that literal path to `CURRENT_RELEASE_ENV`, and run from the reviewed Compose directory. Do not substitute a mutable image tag or an unreviewed environment file.

The non-mutating dry run validates the exact target/profile, canonical volume root, active database/Files presence, release metadata, protected version 2 role document, absence of an existing candidate, and absence of partial build state. It reads no application data and creates no directory:

```sh
cd /opt/longtail-forge-compose
CURRENT_RELEASE_ENV=/var/lib/longtail-forge-compose-deploy/releases/REPLACE_WITH_REVIEWED_DIGEST.env

docker compose --project-directory /opt/longtail-forge-compose \
  --file /opt/longtail-forge-compose/compose.yaml \
  --env-file /etc/longtail-forge/compose-host.env \
  --env-file "$CURRENT_RELEASE_ENV" \
  run --rm --no-deps --user 0:0 \
  --volume /etc/longtail-forge/demo-role-credentials.json:/run/secrets/demo-role-credentials.json:ro \
  longtail-forge node scripts/public-demo-baseline-candidate.mjs build \
  --target rt-ltf-demo \
  --anchor-date today \
  --data-root /var/lib/longtail-forge \
  --role-credentials /run/secrets/demo-role-credentials.json \
  --dry-run
```

Remove only `--dry-run` to build. The command reconstructs the normal migrated `sanitized-demo` seed in a fresh `.longtail-public-demo-build-*` directory inside the mounted data volume, checkpoints it out of WAL mode, verifies it, writes its ownership marker, and atomically renames that complete unit to `.longtail-public-demo-candidate`. The running container continues using only the top-level `longtail-forge.db` and `files/`; the builder never opens, renames, stops, or replaces them. An existing candidate or partial build is refused rather than reused or overwritten.

Validate the fixed candidate later without rebuilding it by replacing `build` with `validate` and omitting `--dry-run`. Validation requires the same explicit anchor, current immutable release, and protected role document. It proves:

- the exact current baseline plus every checked-in migration checksum;
- the semantic fingerprint and expected Workspaces, Users, Tasks, Notes, Lists, Files, Search, and zero-session counts;
- `PRAGMA integrity_check`, zero foreign-key violations, and a sidecar-free complete database;
- exact database-to-Files inventory, extension, size, and SHA-256 agreement;
- exactly six fixed public credential hashes and one separate private operator hash, with exact roles, scopes, memberships, and no overrides;
- a matching candidate ownership marker containing only safe identity/count/fingerprint data;
- reserved fictional identities, no active ordinary personas, no Secure Notes material, and no analytics, feedback, or interest-capture persistence; and
- no symlinks, path escapes, unexpected entries, plaintext protected values, or credential leakage.

Successful output is limited to status, target, anchor, application version, semantic and migration-identity digests, safe counts, and fixture count. It contains no path, password, environment value, record content, storage key, session, or private operator identity. Candidate construction is deliberately not wired into app/worker startup, ordinary deployment, Nightly, or an in-process timer.

## Historical pre-Compose helper (do not install for Compose)

The older `scripts/demo-data-host.mjs` helper below documents the backup-first invariants that preceded the supported Compose lifecycle. It stops systemd-managed application services and promotes data directly, so it must not be installed or extended as the public reset path. Version 0.33.31.7 will replace activation/recovery with the supported Compose maintenance, lock, backup, and health primitives.

### Historical installation reference

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
  "version": 2,
  "binding": {
    "target": "rt-ltf-demo",
    "publicUrl": "https://demo.longtailforge.com"
  },
  "passwords": {
    "super_admin": "<unique-strong-private-password>"
  }
}
```

Replace the bracketed value before installation. The version 2 document must contain exactly these fields and only the `super_admin` password. It must be at least 16 characters, satisfy the normal application password policy, and differ from every password, token, master key, or other secret in the application environment. The six visitor passwords are intentionally public, deterministic source-owned fixture values; they are not accepted from the host file or any other environment. Never reuse a local fixture, Friends-and-Family Preview, customer, or application credential. The target/origin binding, explicit `public-demo` fixture mode, protected path, non-symlink check, exact mode, and distinct-secret check all fail closed before service quiescence or backup.

The application environment remains `/etc/longtail-forge/longtail-forge.env` and is parsed only after exact root/hostname/target/origin refusal. It still supplies the production runtime and backup inventory, but no application secret enters the candidate seed. The minimal child environment contains only safe process keys, local development/SQLite/scanner settings, and the protected role-file path. The child reads and validates the one private operator value, combines it with the six reviewed public visitor values only under the exact bound profile, and stores normal Argon2id hashes. The private value never enters arguments, helper configuration, markers, backups, logs, output, or the runtime artifact.

### Historical preflight

Run the non-mutating preflight from the exact installed release before provision or reset:

```sh
/usr/local/sbin/longtail-forge-demo-data preflight \
  --target rt-ltf-demo \
  --anchor-date today \
  --confirm "PREFLIGHT RT-LTF-DEMO DATA"
```

Preflight performs the complete identity, configuration, protected-file, credential, release, path, ownership/mode, current-data, marker, and partial-state checks. It reports only `preflight-ready`, the exact target, resolved anchor, installed version, fixture count, and whether the next operation is `provision` or `reset`. It does not stop a service, create a backup, stage data, or mutate the database or Files.

### Historical first provision

Choose and record an explicit anchor date, or pass the literal `today` to anchor the fictional timeline to the current date. Every seeded date is a relative offset (anchor -30 through anchor +30 days), so the anchor controls all overdue/today/upcoming states and remains in the host-only ownership marker.

```sh
/usr/local/sbin/longtail-forge-demo-data provision \
  --target rt-ltf-demo \
  --anchor-date today \
  --confirm "PROVISION RT-LTF-DEMO DATA"
```

`provision` is accepted only while the current installation has no demo-data ownership marker. Once successfully provisioned, use `reset`.

### Historical manual regeneration

Routine verified `nightly` deployments preserve the database and Files tree. They never invoke this command. Let test changes accumulate until the environment is deliberately returned to the fictional baseline:

```sh
/usr/local/sbin/longtail-forge-demo-data reset \
  --target rt-ltf-demo \
  --anchor-date today \
  --confirm "RESET RT-LTF-DEMO DATA"
```

Resetting with `--anchor-date today` re-anchors the whole relative timeline: yesterday's overdue tasks stay one day overdue, next week's work stays next week. An explicit `YYYY-MM-DD` anchor remains available for pinned, repeatable captures.

The fictional scenario remains the fat Northwind dataset (seed contract `development-data-v2`): 5 workspaces (Northwind Studio, Northwind Field Ops, two personal, one family), 17 inactive/login-disabled ordinary personas, 6 active public visitor fixtures plus 1 private operator, 20 clients, 46 projects, 400 tasks across every lifecycle state, 200 notes, 24 lists, ~600 time entries, and a fully materialized Search index — generated deterministically from themed pools so two seeds with the same anchor and different private passwords produce identical semantic fingerprints.

`reset` requires the matching live ownership marker. It refuses an unmarked, mismatched, preview/customer, unknown-host, unknown-origin, non-production, symbolic-link-substituted, incorrectly owned/mode, partial-stage, unexpectedly populated, nested backup/data, or unresolved installation.

### Historical operation behavior

For both actions the helper:

1. Refuses the wrong root/hostname/target/origin before reading either protected credential source, then verifies the exact release, service, account, path, ownership/mode, marker, host-bound role document, distinct-secret, and secret-presence contracts without printing protected values.
2. Records active app/worker/edge services, stops them, and proves they are quiesced.
3. Creates and inspects a whole-instance backup of the current SQLite database and Files objects together. No replacement starts until the archive is restorable and its checksum matches.
4. Builds the fictional database and Files tree in a new same-filesystem sibling staging directory through the reviewed `sanitized-demo` role-fixture definition. No application secret crosses into the minimal child environment; only the protected role-file path does.
5. Verifies SQLite integrity, zero foreign-key violations, the semantic fingerprint and expected counts, zero carried sessions, exactly seven active role identities with exact role/scope/membership rows and no overrides, all ordinary personas inactive, reserved identity domains, no Secure Notes material, Search projections, and every seeded Files object's size and SHA-256.
6. Writes the host-only ownership marker with the exact six non-Super-Admin visitor user IDs, proves the protected private operator is excluded, rejects symbolic links, reapplies the dedicated application ownership and private modes, and swaps the database plus Files tree together by promoting the staged data root.
7. Restarts the previously active services and requires direct readiness plus public health/readiness and the exact current `nightly` runtime identity.

If staging, promotion, restart, or verification fails, the helper restores the retained prior data root and restarts the prior services. If that recovery also fails, it leaves traffic closed and reports that the retained whole-instance backup is required. It never prunes older backups or retained successful pre-reset data automatically.

Normal successful output is deliberately limited to the target, anchor date, semantic fingerprint/counts, backup filename/checksum/ID, retained previous-state basename, and public runtime identity. It excludes paths, environment values, passwords, key material, file contents, storage keys, and raw application data.

### Historical recovery and post-operation proof

Keep the pre-reset archive, checksum sidecar, retained previous data state, prior runtime artifact, and any separately protected Secure Notes recovery material through the observation period. Inspect a retained archive from the current installed release with:

```sh
cd /opt/longtail-forge/current
npm run backup:inspect -- \
  --archive /var/backups/longtail-forge/<backup>.ltfbackup.tgz
```

Use the full restore command and recovery rules in [Baseline Backup and Restore](backup-restore.md) if automatic prior-state recovery failed. Never mix one snapshot's database with another snapshot's Files tree.

After the first installation and after any reset, retain a private operational record of the sanitized output and separately prove the six public visitor logins, the private operator recovery login, exact role/scope assignments, disabled ordinary-persona login, representative permission allows/denials, Search, Files read/preview, worker/job health, direct and public health/readiness, and `/api/app-info`. Local regressions do not substitute for the live evidence.

### Historical 0.33.26.9 live-operation checklist

Do not begin the live operation until every item is available:

1. All changes through 0.33.26.8 are merged through the protected topic-to-`nightly` path and the exact immutable artifact is deployed to `rt-ltf-demo`.
2. Direct and public health, readiness, canonical version, `nightly` branch, commit, and artifact checksum all match that deployed artifact.
3. The installed wrapper and helper are reviewed copies; the helper points to the separate root-owned `0600` demo role document with exact target/origin binding.
4. Preflight returns `preflight-ready` and `nextAction: reset` without a service, backup, database, Files, or marker change.
5. A new whole-instance database-and-Files backup can be created and inspected as restorable; the retained prior data state and prior runtime artifact have sufficient storage and a reviewed recovery path.
6. The exact reset confirmation is entered only for target `rt-ltf-demo`. Never run a provision, reset, seed, credential, backup, or data command against `rt-ltf` or the Friends-and-Family Preview.
7. After activation, prove integrity, foreign keys, Files/Search, all six public visitor logins and exact scopes, the separate private operator recovery login, representative permission behavior, rejection of an old session, direct/public runtime identity, and automatic prior-state restoration on any failed activation check.
8. Retain only sanitized operational evidence. No credential value, protected path, application environment, backup content, raw assignment identifier, or secret-bearing command/output belongs in repository history.
