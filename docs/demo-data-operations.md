# Public Demo Compose Reset

As of version 0.33.31.8, the named `rt-ltf-demo` installation uses one reviewed external systemd timer to invoke the same root-owned Compose reset used manually. The reset builds and validates the deterministic public candidate from the exact currently deployed immutable image, activates database plus Files only while every configured Compose SQLite user is stopped, and either returns healthy on the new baseline or automatically reconstructs and verifies the retained prior unit.

This is not a general production seed or restore command. It accepts only target `rt-ltf-demo`, public origin `https://demo.longtailforge.com`, `LONGTAIL_ENV=production`, `DEMO_MODE=true`, the maintained Compose deployment classification, the canonical container data root `/var/lib/longtail-forge`, the root-owned version 2 role credential document, and the release environment already recorded by the protected Compose deployment helper. The systemd unit schedules only this host operation; it never starts or supervises the application, runs inside the app or worker, or applies to another installation.

The assembled release-candidate checklist, capability/account ownership, retention and incident procedure, and safe visitor copy live in [Public Demo Operator Runbook](public-demo-operator-runbook.md). Start from the separately protected values in [public-demo-compose.env.example](public-demo-compose.env.example); never copy its profile onto local development, Friends-and-Family Preview, or another installation.

## Installed and generated boundaries

Repository and release owned:

- the non-activating candidate builder and active-baseline validator inside the immutable runtime image;
- the stopped-volume activation/recovery primitive inside the immutable runtime image;
- the separately installed root-owned Compose reset helper;
- the root-owned scheduler and alert helpers plus the systemd oneshot service and timer;
- the maintained Compose deploy/rollback helper with the same shared Compose operation lock;
- the non-secret helper configuration example, regressions, and this runbook.

Demo-host-only state:

- active, candidate, retained-prior, and failed-evidence SQLite and Files units;
- SQLite WAL/SHM sidecars handled only while all configured SQLite services are stopped;
- `.longtail-demo-data.json` and phase-specific reset markers;
- whole-instance archives and checksums;
- root-only operation records, session-proof cookies, API proof responses, and logs;
- application secrets, the private operator credential document, and any separately protected Secure Notes recovery key.

Generated state and protected evidence never enter Git, a GitHub artifact, or normal command output. The reset helper emits only the target, anchor, operation ID, semantic fingerprint, release identity, and backup basename after success. The scheduler never copies reset stdout or stderr into its log or alert.

## Installation

Install both LF-only host helpers from the same reviewed release. Reinstalling only one would leave deploy/rollback and reset with different lock contracts.

```sh
install -o root -g root -m 0755 \
  scripts/release/longtail-forge-compose-deploy-host.example \
  /usr/local/sbin/longtail-forge-compose-deploy

install -o root -g root -m 0755 \
  scripts/release/longtail-forge-public-demo-reset-host.example \
  /usr/local/sbin/longtail-forge-public-demo-reset

install -o root -g root -m 0755 \
  scripts/release/longtail-forge-public-demo-isolation-host.example \
  /usr/local/sbin/longtail-forge-public-demo-isolation
```

Install the scheduler boundary from the same release. The example alert writes one bounded `daemon.alert` event; replace its implementation with the host's paging integration while preserving the exact argument allowlist. The scheduler refuses missing, writable, or non-root helper files.

```sh
install -o root -g root -m 0755 scripts/release/longtail-forge-public-demo-reset-scheduler-host.example /usr/local/sbin/longtail-forge-public-demo-reset-scheduler
install -o root -g root -m 0755 scripts/release/longtail-forge-public-demo-reset-alert.example /usr/local/sbin/longtail-forge-public-demo-reset-alert
install -o root -g root -m 0600 docs/longtail-forge-public-demo-reset-scheduler.env.example /etc/longtail-forge/public-demo-reset-scheduler.env
install -o root -g root -m 0644 scripts/release/longtail-forge-public-demo-reset.service.example /etc/systemd/system/longtail-forge-public-demo-reset.service
install -o root -g root -m 0644 scripts/release/longtail-forge-public-demo-reset.timer.example /etc/systemd/system/longtail-forge-public-demo-reset.timer
systemctl daemon-reload
systemctl enable --now longtail-forge-public-demo-reset.timer
```

Both lifecycle helpers read `/etc/longtail-forge/compose-deploy-helper.env`, which must remain a real `root:root` file with mode `0600` beneath a root-owned non-writable parent. On the exact public-demo host add the path-only setting:

```text
LTF_PUBLIC_URL=https://demo.longtailforge.com
LTF_DEMO_ROLE_CREDENTIALS=/etc/longtail-forge/demo-role-credentials.json
LTF_PUBLIC_DEMO_ISOLATION_HELPER=/usr/local/sbin/longtail-forge-public-demo-isolation
```

The credential document is a separate real `root:root` file with mode `0600`, outside the Compose, deployment, and backup trees. It retains the version 2 target/origin binding and contains only the private Super Administrator password. The six public visitor passwords remain deterministic source-owned values. Never place a credential value in the helper configuration, command line, repository, or operation log.

Before the first public-demo deployment, choose a reviewed non-overlapping subnet and create the dedicated external network and data volume. The exact names and Linux bridge interface are enforced:

```sh
docker network create --driver bridge --internal \
  --subnet 172.30.18.0/24 --gateway 172.30.18.1 \
  --opt com.docker.network.bridge.name=ltf-demo0 \
  longtail-forge-public-demo-internal
docker volume create longtail-forge-public-demo-data
```

Set `LONGTAIL_DOCKER_NETWORK=longtail-forge-public-demo-internal`, `LONGTAIL_DATA_VOLUME=longtail-forge-public-demo-data`, `LONGTAIL_RESTART_POLICY=no`, `LONGTAIL_DNS_SERVER=127.0.0.1`, `LONGTAIL_CLAMD_HOST` to that bridge gateway, and `LONGTAIL_DOCKER_TRUST_PROXY` to the gateway `/32`. Do not attach another container to the network. The loopback-only resolver blocks Docker DNS forwarding; the exact demo uses literal reviewed addresses for its sole ClamAV handoff. The isolation helper installs a ClamAV-only host-input exception and default-deny host/forwarding chains, then verifies the live container's environment, exact database/Files/backup mounts, bounded local logs, scanner access, failed external name resolution, and denied host/public probes. Deploy and reset refuse to proceed when that proof is absent or drifted. After a host reboot, use a protected lifecycle operation to enforce the policy before starting the demo; Docker auto-restart is deliberately disabled for this exact profile.

The helper and release workflow carry both host files as reviewed release assets. The runtime image carries the candidate and activation primitives but no role credential document or generated demo data.

## Hourly schedule, evidence, and alerts

The timer starts at the top of every UTC hour (`OnCalendar=*-*-* *:00:00 UTC`). UTC is authoritative; local wall-clock and daylight-saving changes do not shift it. `Persistent=false` deliberately skips boundaries missed while the host or timer is down, so startup cannot produce a catch-up reset or burst. The next ordinary UTC boundary is the only automatic retry. `systemctl list-timers longtail-forge-public-demo-reset.timer` shows the next and previous trigger.

Candidate construction happens before the maintenance curtain. User-visible downtime begins only when the validated candidate is ready and the helper asserts the curtain; it covers quiescence, backup, activation, restart, session invalidation, and runtime/role proof. There is no zero-downtime promise. The oneshot has a 30-minute safety ceiling, while a healthy ordinary run should spend only the shorter host-dependent backup/restart/proof interval behind the curtain. A timeout follows the reset helper's recovery ownership and produces a failure alert.

Every scheduled and scheduler-wrapped manual run receives one correlation ID. The root-only JSONL log retains at most 336 records—start and finish records for seven days at the hourly rate—with trigger, scheduled boundary, lock outcome, duration, semantic fingerprint on success, health, bounded failure class, rollback status, recovery status, and alert outcome. It contains no passwords, record content, sessions, cookies, role document, application output, secret values, or private infrastructure paths. Send the bounded alert-helper arguments into the host's real paging system and alert if that helper itself fails. Inspect the protected log and reset operation evidence by correlation ID; do not add raw stdout/stderr to the page. Application/edge/authentication/capability/perimeter evidence uses a separate request ID: correlate a suspected reset overlap by the bounded time window and immutable release identity, never by copying visitor input or inventing one shared identifier across host and request lifecycles.

Deploy, rollback, backup, manual reset, and scheduled reset coordinate through the same non-blocking Compose operation lock. Contention exits with code 75, records `lifecycle-lock-contended`, invokes the failure alert, performs no mutation, and waits for the next normal boundary rather than retrying inside the hour. Other failures remain owned by the reset helper: a proved prior-unit recovery is reported as healthy-but-failed, while failed recovery keeps the curtain and protected evidence for operator action.

`LTF_PUBLIC_DEMO_RESET_ENABLED=false` in the root-only scheduler environment is the exact demo-host switch. A fired timer records `skipped-disabled` without calling the reset. It is intentionally not an Admin setting, database value, application environment variable, or general demo-mode feature. For extended maintenance, set the flag false and use `systemctl disable --now longtail-forge-public-demo-reset.timer`; to resume, restore true and use `systemctl enable --now longtail-forge-public-demo-reset.timer`. Confirm the next UTC boundary after either change.

For a correlated manual run with the same logging and alert behavior:

```sh
/usr/local/sbin/longtail-forge-public-demo-reset-scheduler run --trigger manual
```

## Manual reset

Use one explicit command. The literal `today` resolves once to a UTC calendar date and that value is used for candidate construction and every later proof.

```sh
/usr/local/sbin/longtail-forge-public-demo-reset reset \
  --target rt-ltf-demo \
  --anchor-date today \
  --confirm "RESET RT-LTF-DEMO COMPOSE DATA"
```

The helper performs these phases under one non-blocking shared Compose operation lock:

The long-running application keeps the Compose-wide `cap_drop: ALL` posture.
Only the ephemeral root-run candidate build/validation container adds
`CAP_CHOWN` and `CAP_DAC_OVERRIDE` so it can prepare, verify, and hand
the private database-and-Files tree to runtime UID/GID 10001. The activation
and recovery invocation adds only `CAP_DAC_OVERRIDE` to inspect and move that
UID-owned `0700` tree atomically. Backup and the application remain
capability-free, and the helper never uses privileged containers.

Before the backup container opens SQLite, the deploy helper stops the current
application and, only for the exact demo profile, uses one ephemeral root
container with `CAP_CHOWN` and `CAP_DAC_OVERRIDE` to make the mounted data root
itself UID/GID 10001 mode `0700`. It first reclaims root ownership, applies the
mode, then transfers ownership so `CAP_FOWNER` is unnecessary. This idempotent
initial-volume handoff is not run for ordinary Compose installations.

1. Revalidates root ownership, exact target/origin/profile, recorded current release environment, Compose data paths, protected role document, maintenance marker boundary, and optional recovery-key material. An overlapping Compose deploy, rollback, backup, manual reset, or later scheduled reset is refused before mutation.
2. Uses a root-run one-off container from the recorded immutable release to build and fully validate a fresh inactive candidate. Existing or partial candidate state remains a hard refusal.
3. Captures one pre-reset public visitor session through the direct loopback application, asserts the deployment-owned maintenance curtain, stops every configured application/worker SQLite service, and proves each is no longer running.
4. Creates and inspects a whole-instance database-and-Files archive while stopped. No promotion starts until the protected archive exists and inspection succeeds.
5. Moves the active database, Files tree, ownership marker, and any WAL/SHM sidecars into one operation-specific retained-prior directory. It then promotes only the three sidecar-free verified candidate members. A root-only phase marker makes partial retirement or promotion deterministic to inspect and recover.
6. Re-runs the complete baseline, migration, integrity, foreign-key, Files, role, credential-hash, session, and protected-data validator against the promoted top-level unit before starting services.
7. Starts the exact recorded Compose release and requires direct plus public health/readiness and exact `/api/app-info`. While the curtain remains asserted it also proves the pre-reset session is rejected, a fresh Workspace Administrator login succeeds, an authorized Task read succeeds, a CSRF-protected representative Time Entry write succeeds, and logout succeeds. Transient session cookie jars live only in a root-private `/run` directory and are removed on every handled exit rather than retained as operation evidence.
8. Archives the completed phase marker with the retained prior unit and clears only the deployment-owned maintenance marker after every proof passes. The independent operator marker is never changed.

A successful reset intentionally leaves the new public write used by the role proof; it is ordinary hourly-resettable demo state and does not alter the verified candidate that was proved before startup.

## Automatic recovery and retry behavior

Any error or handled `HUP`, `INT`, or `TERM` after the curtain is asserted triggers the same fail-closed recovery path: stop all SQLite services, quarantine any promoted candidate members and candidate WAL/SHM sidecars, reconstruct every prior member from the retained same-filesystem unit, start the exact recorded release, and require direct plus public runtime identity. The curtain is cleared only if that prior unit is healthy. Failed recovery keeps the curtain and all archive, prior-unit, failed-candidate, and phase evidence.

A `SIGKILL`, host loss, or runtime crash may prevent the in-process trap. The next manual invocation finds the fixed active-operation marker while holding the shared lock, recovers and verifies the prior unit, clears the curtain, and then exits with a rerun-required error instead of silently starting a second promotion. The operator must invoke the reset again deliberately. Completed prior units and failed evidence are not pruned automatically.

Do not bypass the shared lock with an ad hoc `docker compose run`, direct database copy, manual WAL deletion, or independent backup/reset command. Do not mix one operation's database and Files tree. If automatic recovery cannot prove the prior unit, keep traffic curtained and use the retained inspected whole-instance archive through the documented Compose restore path.

## Candidate-only diagnostics

The candidate command remains useful for non-mutating diagnosis from the exact recorded release. `build --dry-run` validates prerequisites without creating a directory; `build` reconstructs one inactive same-filesystem candidate; `validate` re-proves it; and `active` is reserved for the reset helper after stopped-volume promotion. None of these actions starts, stops, deploys, schedules, or clears maintenance state by itself.

## Historical pre-Compose helper (do not install for Compose)

The older `scripts/demo-data-host.mjs` helper below documents the backup-first invariants that preceded the supported Compose lifecycle. It stops systemd-managed application services and promotes data directly, so it must not be installed or extended as the public reset path. Version 0.33.31.7 replaced activation/recovery with the supported Compose maintenance, lock, backup, and health primitives.

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
