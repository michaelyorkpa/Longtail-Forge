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

Generated state and protected evidence never enter Git, a GitHub artifact, or normal command output. The reset helper emits only the target, anchor, operation ID, semantic fingerprint, release identity, backup basename, and a [retention](#retention) summary after success. The scheduler never copies reset stdout or stderr into its log or alert.

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

Install the scheduler boundary from the same release. The alert helper writes one bounded `daemon.alert` event to the local journal, then posts the same fields to the operator's Discord webhook with mentions disabled; see [Alerts and heartbeat](#alerts-and-heartbeat). The scheduler refuses missing, writable, or non-root helper files. Do not enable the timer here: it is enabled only in step 5 of the upgrade order below, once the deployed release and one manual reset have passed.

```sh
install -o root -g root -m 0755 scripts/release/longtail-forge-public-demo-reset-scheduler-host.example /usr/local/sbin/longtail-forge-public-demo-reset-scheduler
install -o root -g root -m 0755 scripts/release/longtail-forge-public-demo-reset-alert.example /usr/local/sbin/longtail-forge-public-demo-reset-alert
install -o root -g root -m 0600 docs/longtail-forge-public-demo-reset-scheduler.env.example /etc/longtail-forge/public-demo-reset-scheduler.env
install -o root -g root -m 0644 scripts/release/longtail-forge-public-demo-reset.service.example /etc/systemd/system/longtail-forge-public-demo-reset.service
install -o root -g root -m 0644 scripts/release/longtail-forge-public-demo-reset.timer.example /etc/systemd/system/longtail-forge-public-demo-reset.timer
systemctl daemon-reload
```

Install the protected boot from the same release. Enable it, so that Docker pulls it in each time it starts, only once the deployed release and one manual reset have passed; see the upgrade order below. Do not start it by hand: it runs on the next Docker start, or run its helper directly under the procedure in [Protected boot](#protected-boot).

```sh
install -o root -g root -m 0755 scripts/release/longtail-forge-public-demo-boot-host.example /usr/local/sbin/longtail-forge-public-demo-boot
install -o root -g root -m 0644 scripts/release/longtail-forge-public-demo-boot.service.example /etc/systemd/system/longtail-forge-public-demo-boot.service
systemctl daemon-reload
# Later, once the deployed release and one manual reset have passed:
systemctl enable longtail-forge-public-demo-boot.service
```

**Upgrading an installed demo to the restart-recovery helpers.** The new reset helper calls an activation action that only the restart-recovery image contains, and the boot unit runs that helper on every Docker start. So no new lifecycle helper may run until that image is deployed:

1. **Quiesce.** Run `systemctl disable --now longtail-forge-public-demo-reset.timer`. Disabling a timer does not stop a reset that is already running, so wait until `systemctl is-active longtail-forge-public-demo-reset.service` no longer reports `active` or `activating`. Then confirm that no deploy, rollback, backup, or reset holds the lock: `flock -n /var/lib/longtail-forge-compose-deploy/compose-operation.lock true` must succeed.
2. **Deploy** the restart-recovery release with the deploy helper.
3. **Install** every helper and unit from that release, including the boot helper and its unit, but do not enable the boot unit. Until it is enabled, a Docker restart leaves the demo stopped, as before this patch.
4. **Run one manual reset** with the new helper, and confirm it completes.
5. **Enable** the boot unit with `systemctl enable longtail-forge-public-demo-boot.service`, then the timer with `systemctl enable --now longtail-forge-public-demo-reset.timer`.

**Upgrading an installed demo to the retention helpers.** The new reset helper calls the `prune` action, which only the retention image contains, including in a reset the boot runs. The helpers are installed only after that image is deployed, so the boot unit may stay enabled throughout.

1. **Quiesce,** as in step 1 above.
2. **Deploy** the retention release with the deploy helper.
3. **Install** the reset, scheduler, and alert helpers from that release. The boot helper, its unit, and the isolation helper are unchanged.
4. **Prune the backlog** under supervision: run `retention plan`, review it, then run `retention apply` once. The apply also replaces the login records earlier helpers kept in retained evidence. See [Retention](#retention).
5. **Run one manual reset** through the scheduler wrapper, and confirm that its retention reports `pruned` and that its curtain is shorter.
6. **Enable** the timer, and confirm the next scheduled reset.

Both lifecycle helpers read `/etc/longtail-forge/compose-deploy-helper.env`, which must remain a real `root:root` file with mode `0600` beneath a root-owned non-writable parent. On the exact public-demo host add the path-only setting:

```text
LTF_PUBLIC_URL=https://demo.longtailforge.com
LTF_DEMO_ROLE_CREDENTIALS=/etc/longtail-forge/demo-role-credentials.json
LTF_PUBLIC_DEMO_ISOLATION_HELPER=/usr/local/sbin/longtail-forge-public-demo-isolation
```

The credential document is a separate real `root:root` file with mode `0600`, outside the Compose, deployment, and backup trees. It retains the version 2 target/origin binding and contains only the private Super Administrator password. The six public visitor passwords remain deterministic source-owned values. Never place a credential value in the helper configuration, command line, repository, or operation log.

Before the first public-demo deployment, choose a reviewed non-overlapping subnet and create the dedicated external network and data volume. The exact names and Linux bridge interface are enforced:

```sh
docker network create --driver bridge \
  --subnet 172.30.18.0/24 --gateway 172.30.18.1 \
  --opt com.docker.network.bridge.name=ltf-demo0 \
  --opt com.docker.network.bridge.enable_ip_masquerade=false \
  longtail-forge-public-demo-internal
docker volume create longtail-forge-public-demo-data
```

Set `LONGTAIL_DOCKER_NETWORK=longtail-forge-public-demo-internal`, `LONGTAIL_DATA_VOLUME=longtail-forge-public-demo-data`, `LONGTAIL_RESTART_POLICY=no`, `LONGTAIL_DNS_SERVER=127.0.0.1`, `LONGTAIL_CLAMD_HOST` to that bridge gateway, and `LONGTAIL_DOCKER_TRUST_PROXY` to the gateway `/32`. Do not attach another container to the network. Docker's internal-network flag is deliberately not used because it suppresses the required loopback port publication on the supported live engine; disabled masquerading plus the first-position firewall chains deny new connections instead. Both chains permit established/related return traffic for Caddy's loopback request path; host input additionally permits only the literal reviewed ClamAV handoff, while forwarding rejects every new connection. The loopback-only resolver blocks Docker DNS forwarding. The isolation helper verifies the realized `127.0.0.1:8001` binding, image-owned `NODE_ENV=production` without admitting provider configuration, live container environment, exact database/Files/backup mounts, bounded local logs, scanner access, failed external name resolution, and denied host/public probes. Deploy and reset refuse to proceed when that proof is absent or drifted. Docker auto-restart is deliberately disabled for this exact profile; after a host boot or a Docker restart, the [protected boot](#protected-boot) enforces the policy before it starts the demo.

The helper and release workflow carry both host files as reviewed release assets. The runtime image carries the candidate and activation primitives but no role credential document or generated demo data.

## Hourly schedule, evidence, and alerts

The timer starts at the top of every UTC hour (`OnCalendar=*-*-* *:00:00 UTC`). UTC is authoritative; local wall-clock and daylight-saving changes do not shift it. `Persistent=false` deliberately skips boundaries missed while the host or timer is down, so startup cannot produce a catch-up reset or burst. The next ordinary UTC boundary is the only automatic retry. `systemctl list-timers longtail-forge-public-demo-reset.timer` shows the next and previous trigger.

Candidate construction happens before the maintenance curtain. User-visible downtime begins only when the validated candidate is ready and the helper asserts the curtain; it covers quiescence, backup, activation, restart, session invalidation, and runtime/role proof. There is no zero-downtime promise. The oneshot has a 30-minute safety ceiling, while a healthy ordinary run should spend only the shorter host-dependent backup/restart/proof interval behind the curtain. A timeout follows the reset helper's recovery ownership and produces a failure alert.

Every scheduled and scheduler-wrapped manual run receives one correlation ID. The root-only JSONL log retains at most 336 records—start and finish records for seven days at the hourly rate—with trigger, scheduled boundary, lock outcome, duration, semantic fingerprint on success, health, bounded failure class, rollback status, recovery status, and alert outcome. It contains no passwords, record content, sessions, cookies, role document, application output, secret values, or private infrastructure paths. Each successful run also records its `heartbeatOutcome`: `delivered`, `failed`, or `not-configured`, and its `retentionStatus`: `pruned`, `capped`, or `failed`; see [Retention](#retention). An [operator hold](#protected-boot) makes a fired timer record `skipped-held`, without a reset or an alert. Inspect the protected log and reset operation evidence by correlation ID; do not add raw stdout/stderr to the page. Application/edge/authentication/capability/perimeter evidence uses a separate request ID: correlate a suspected reset overlap by the bounded time window and immutable release identity, never by copying visitor input or inventing one shared identifier across host and request lifecycles.

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

1. Revalidates root ownership, exact target and origin, recorded current release environment, Compose data paths, protected role document, maintenance marker boundary, and optional recovery-key material. It validates the complete resolved Compose profile against the same exact program the [protected boot](#protected-boot) uses, before it starts, stops, or recreates anything. An overlapping Compose deploy, rollback, backup, manual reset, or later scheduled reset is refused before mutation, and so is a run under an operator hold.
2. Recovers first. An active-operation marker means an interrupted reset: the helper restores and verifies the prior unit, then stops and asks for a deliberate rerun, as described under [Automatic recovery](#automatic-recovery-and-retry-behavior). With no marker, a verified candidate or partial build left behind is stale, because activation never began. A Docker restart left exactly that state on 2026-10-06. The helper moves it into `.longtail-public-demo-failed-<operation>-stale-candidate` in the data volume, with a `stale-candidate.json` record. Only the exact names and shapes a build creates move, a link anywhere refuses the whole move, and nothing is deleted.
3. Starts a stopped app. If the application is not running, as after a host restart, the helper runs the protected start first: the curtain goes up, the recorded release starts, and its direct and public identity and isolation are verified. The curtain then stays up until this reset's fresh baseline passes, so a reset that fails afterwards never serves the stale unit it started: a recovery that restores it keeps the curtain, and so does a failure before activation. The reset follows its normal path, so the pre-reset session capture and its rejection proof still run, and the result records `"appStartedByReset": true`. A running app whose representative login fails still fails the reset, as before. If the start itself cannot be verified, the curtain stays up and the failure reads as unrecovered.
4. Uses a root-run one-off container from the recorded immutable release to build and fully validate a fresh inactive candidate.
5. Captures one pre-reset public visitor session through the direct loopback application, asserts the deployment-owned maintenance curtain, stops every configured application/worker SQLite service, and proves each is no longer running. The proof is a running-state query that succeeds and lists nothing; a query that fails prints nothing either, so it proves nothing, and the reset stops there. The stop has a 45-second deadline and each query 15 seconds; a deadline signals the command's whole process group, then kills it five seconds later.
6. Creates and inspects a whole-instance database-and-Files archive while stopped. No promotion starts until the protected archive exists and inspection succeeds.
7. Moves the active database, Files tree, ownership marker, and any WAL/SHM sidecars into one operation-specific retained-prior directory. It then promotes only the three sidecar-free verified candidate members. A root-only phase marker makes partial retirement or promotion deterministic to inspect and recover.
8. Re-runs the complete baseline, migration, integrity, foreign-key, Files, role, credential-hash, session, and protected-data validator against the promoted top-level unit before starting services. Its link and protected-value scans read only that unit's own database, sidecars, Files tree, and marker, never the retained prior units or failed evidence beside it, so the time behind the curtain does not grow with the reset history.
9. Starts the exact recorded Compose release, without pulling, and requires direct plus public health/readiness and exact `/api/app-info`. A reset run by the [protected boot](#protected-boot) requires the direct checks only. Every request the reset makes, including the session capture and the role proof below, is bounded to 15 seconds, so a response that never completes cannot hold the lock and the curtain. While the curtain remains asserted it also proves the pre-reset session is rejected, a fresh Workspace Administrator login succeeds, authorized Task, client/project hierarchy, and seeded attachment reads succeed, and authenticated logout succeeds. This proof is deliberately read-only so the promoted unit remains semantically equivalent to the validated candidate. Transient session cookie jars live only in a root-private `/run` directory and are removed on every handled exit rather than retained as operation evidence.
10. Archives the completed phase marker with the retained prior unit, records `finalized`, and clears only the deployment-owned maintenance marker after every proof passes. The independent operator marker is never changed. Finalizing commits the reset: from then on the fresh unit is the active one, and nothing may restore the prior unit. A curtain that then cannot be lifted, because the marker is no longer a plain file, fails the reset with its state left at `finalized`. The fresh unit stays behind the curtain for the operator, and retention keeps the reset's copies as incident evidence.
11. Runs its [retention](#retention) step, once the curtain is down and still under the lock. A reset run by the protected boot runs it behind the boot's curtain. A `HUP`, `INT`, or `TERM` that arrives from the start of finalizing is held until finalizing returns. If finalizing failed, the reset recovers as below. If it succeeded, the reset completes, lifts its curtain, skips this step, and reports its completed result with a failed retention.

A successful reset permits no post-activation application mutation. Live write and mutation-cap behavior are proved before reset during the release gate; post-reset verification is read-only so the exact reproducible baseline remains active.

## Automatic recovery and retry behavior

Any error or handled `HUP`, `INT`, or `TERM` after the curtain is asserted, and before finalizing succeeds, triggers the same fail-closed recovery path: stop all SQLite services and prove the stop as step 5 does, so no recovery replaces data while a service may still be running; quarantine any promoted candidate members and candidate WAL/SHM sidecars; reconstruct every prior member from the retained same-filesystem unit, start the exact recorded release, and require direct plus public runtime identity. The curtain is cleared only if that prior unit is healthy, and only when visitors may see it. A reset run by the protected boot, or one that started a stopped app, keeps the curtain even then: the prior unit is the stale one, and the failure reads `prior-unit-healthy-curtain-retained`. Failed recovery keeps the curtain and all archive, prior-unit, failed-candidate, and phase evidence.

A `SIGKILL`, host loss, or runtime crash may prevent the in-process trap. The next manual invocation finds the fixed active-operation marker while holding the shared lock, recovers and verifies the prior unit, clears the curtain, and then exits with a rerun-required error instead of silently starting a second promotion. The operator must invoke the reset again deliberately. Failed evidence is never pruned automatically; completed prior units follow [Retention](#retention).

**Step evidence.** Before each step starts, the reset writes the step's name and time to `step.json` in its root-only operation directory, and appends it to `steps.jsonl`, so a kill or a power loss still leaves the step that was running. A step's error output is kept beside them as `step-<name>.err`: its last 64 KiB, with every secret value replaced. The secrets are taken from the environment Compose itself resolves, so however the application environment file is named or quoted, its values are the ones Compose read, together with the secret-named values of the Compose host environment and the role passwords. If any of them cannot be collected, the reset refuses before its first step. Automatic recovery runs each of its commands as a step too, so its diagnostics are redacted the same way, and the list of secret values is removed only once recovery is over. The helper's own output names only the failed step. Nothing new reaches the scheduler log, the alert, or normal output. The evidence holds no visitor-entered content: the pre-reset login keeps only its HTTP status, because its body is the shared account's profile as visitors left it, and every later read runs against the fresh baseline. Earlier helpers kept that body; a supervised `retention apply` replaces it in retained evidence.

Do not bypass the shared lock with an ad hoc `docker compose run`, direct database copy, manual WAL deletion, or independent backup/reset command. Do not mix one operation's database and Files tree. If automatic recovery cannot prove the prior unit, keep traffic curtained and use the retained inspected whole-instance archive through the documented Compose restore path.

## Retention

Nothing reads a completed reset's retired unit or pre-reset backup again, and each holds the visitor-entered content of the hour before that reset. So the reset history is bounded by fixed, reviewed constants, with no setting:

| What | Kept | Where |
| --- | --- | --- |
| Retired units | Those of the 2 newest completed resets | `.longtail-public-demo-previous-<operation>` in the data volume |
| Pre-reset backups, with their `.sha256` sidecars | Those of the 2 newest completed resets | `pre-demo-reset-<operation>.ltfbackup.tgz` in the backup root |
| Reset evidence | That of the 168 newest completed resets, seven days | `demo-reset-operations/<operation>/` in the deployment root |

Visitor-entered content therefore lasts in the live demo until the next hourly reset. In normal operation it is gone from these copies about three hours after it was entered, and reset evidence holds none. It lasts longer only in these cases:
- **A failed reset.** Its copies are incident evidence, kept until the operator disposes of them.
- **Retention that is blocked or capped.** A `retention-failed` alert reaches the operator, and the copies stay until the operator resolves it with supervised retention. A failure under the boot is retried by the next hourly reset first.
- **A held demo.** While an operator hold stops resets, the newest copies stay until resets resume.
- **Deployment backups.** Each deploy, rollback, or restore takes a whole-instance backup, which the deploy helper keeps until the operator removes it. The roadmap bounds these on the demo.

`DECISIONS.md` records this policy, and the demo's privacy notices cite it.

**Never removed automatically:**
- incident evidence: a reset whose state is not `completed`, or is missing or unreadable, with its backup and any failed unit;
- failed evidence in the data volume, including moved stale candidates;
- the active unit, the candidate, and the active-operation marker;
- any other backup, including a deployment's `pre-upgrade-` backups. A pre-reset backup whose evidence is gone is reported as an orphan;
- the state and release records, and the scheduler log.

**Selection.** Completion is proved by the operation's own record: `reset-operation.json` for a retired unit, and `state.json` for evidence and its backup. Selection is by count, newest first by the operation identity's UTC timestamp. Every selected item is checked before anything changes, and one failed check removes nothing:
- the reset history and the backup root must be real directories, and each listing of them must succeed whole;
- a retired unit must have exactly a unit's shape, with no link anywhere beneath it;
- evidence must be a root-owned real directory holding only root-owned files and directories, proved by a traversal that succeeds;
- a backup and its sidecar must be plain files with one name, owned by the backup root's owner, the container user.

A run never removes anything of the reset it belongs to. If that reset would rank among the removals, as a clock set back would make it, the run refuses.

**Removal deletes; nothing is archived.** A retired unit or an evidence directory is first renamed to a tombstone, which the next run finishes if a deletion is interrupted. A backup's archive goes before its sidecar.

**The automatic step.** Each completed reset runs retention once its curtain is down, still under the lifecycle lock.
- **The cap.** If the removals of any kind, counting the tombstones an interrupted run left, would exceed three, the step removes nothing and reports `capped`.
- **Its record.** The result is `retention.json` in the reset's operation directory, and a `retention` summary on the reset's final line.
- **Failure.** A retention failure never fails or rolls back the completed reset, and neither does a signal, which stops only retention. The scheduler logs the run as `succeeded`, with failure class `retention-failed` and the `retentionStatus`, still sends the heartbeat, and raises the Discord alert.
- **The boot.** A reset run by the protected boot runs the step behind the boot's curtain. The boot does not alert on it: a failure there is retried, and alerted, by the next hourly reset.

**Supervised retention,** for the backlog, or after a `retention-failed` alert:

```sh
/usr/local/sbin/longtail-forge-public-demo-reset retention plan --target rt-ltf-demo
/usr/local/sbin/longtail-forge-public-demo-reset retention apply --target rt-ltf-demo \
  --confirm "PRUNE RT-LTF-DEMO RESET HISTORY"
```

- **The lock.** Both take the lifecycle lock, and refuse with exit code 75, changing nothing, while a reset, deploy, rollback, or backup holds it.
- **Plan** changes nothing and reports what `apply` would remove. **Apply** is uncapped.
- **The roots.** Neither creates or repairs a root, as a reset does. Once it holds the lock, each checks that the deployment, state, release, and reset history roots are real, root-owned directories no one else may write, and refuses before writing anything if one is not. The only thing either creates is its own record under `demo-retention-operations/`.
- **The firewall.** Both check the demo's isolation and never rebuild it, so neither changes the firewall, held or not.
- **Legacy login records.** Earlier helpers kept the pre-reset login's response body: the shared account's profile as visitors left it. `retention plan` counts the ones retained completed resets still hold, as `legacyLogins`, and `retention apply` replaces each with `{"httpStatus":"200","legacyBodyRemoved":true}`. A replaced record is not counted or rewritten again. Incident evidence keeps its own until it is disposed of.
- **Records.** Each writes its result, with the operations it selected, to `demo-retention-operations/<operation>/retention.json` in the deployment root. These supervised records are not pruned.
- **An operator hold** does not stop retention, which starts nothing.
- **The procedure.** Review the plan, apply it once, and confirm that the next reset reports `pruned`.

**Disposing of incident evidence.** Incident evidence stays until the operator has what they need from it. Then:
1. Disable the timer, and hold the lifecycle lock in a root shell: `exec 9<>/var/lib/longtail-forge-compose-deploy/compose-operation.lock && flock -n 9`.
2. Remove the operation's directory under `demo-reset-operations/`, its `pre-demo-reset-<operation>.ltfbackup.tgz` and `.sha256` in the backup root, and its `.longtail-public-demo-failed-<operation>` directories in the data volume, found with `docker volume inspect --format '{{.Mountpoint}}' longtail-forge-public-demo-data`.
3. Never remove the active unit, the candidate, the active-operation marker, or a backup that is not that operation's.
4. Close the shell to release the lock, and enable the timer again.

## Protected boot

The demo container keeps `restart: no`, so nothing can start it before its isolation is in place. Its only restart owner is `longtail-forge-public-demo-boot.service`, a root-owned oneshot that Docker pulls in each time it starts, so after a host boot and after a Docker restart. The preview keeps Docker's `unless-stopped`, and has no boot unit.

One boot operation runs at a time, under the shared lifecycle lock, waiting up to seven minutes for an hourly reset that holds it. It records each phase in `demo-boot-operations/<operation>/` in the deployment root, the dependency waits in `dependencies.jsonl`, and its result in `result.json`. In order, it:

1. **Checks the preconditions.** An operator hold, a deployment marker, or an uncertain recorded release stops it with its own alert class: `boot-held`, `boot-marker-present`, or `boot-release-uncertain`. It never pulls, upgrades, or rolls back.
2. **Waits for Docker,** for up to three minutes.
3. **Resolves the profile and its secrets.** It reads the resolved configuration once, from Compose itself, and collects every secret-named value in the environment Compose resolves, with the role passwords and the secret-named values of the Compose host environment. A configuration that does not parse, or a secret that cannot be collected, stops it with `boot-profile-invalid`, because its evidence could then not be redacted completely.
4. **Validates storage.** It requires the exact data volume with a non-empty database and Files tree owned by UID 10001, the backup root, and the recorded image already in the local cache. Anything missing or uncertain stops it with `boot-storage-failed`; it never creates a substitute database. An active reset marker in the volume stops it with `boot-marker-present`.
5. **Validates the complete resolved profile,** before anything starts, with the same exact program the reset uses. Compose must resolve to exactly the one application service, running the recorded image with `restart: no`, a read-only root, UID 10001, every capability dropped, `no-new-privileges`, the reviewed `/tmp` tmpfs, and no command or entrypoint override. Only the reviewed service keys may appear, so a secret, config, inherited, or device mount, an added capability, or a shared namespace is refused. It must have exactly the one external demo network, loopback-only publication on port 8001, and bounded local logs. Its two mounts must each equal their expected form exactly, the demo data volume and the backup bind, so a volume subpath or a bind option is refused too. Its environment must be the exact production public-demo profile, with no undeclared key. Any drift stops it with `boot-profile-invalid`. The isolation helper checks the running container again, but by then it exists.
6. **Waits for the bridge and the scanner.** The exact bridge must carry the gateway address, for up to two minutes, and the scanner must answer `PING` there, for up to four. A dependency that stays unavailable stops it with `boot-dependency-unavailable`, before isolation or start.
7. **Starts the demo.** It enforces isolation before any container runs, raises the curtain, starts the recorded release with `--pull never`, and verifies health, readiness, isolation, and direct identity, each request bounded to 15 seconds. A failure stops the container again and keeps the curtain up, with `boot-start-failed`. Only a running-state query that succeeds and finds nothing proves the stop, not Compose's exit status and not a failed query's empty output. A stop that is not proved is escalated once to a kill, and one that still cannot be proved raises `boot-stop-failed`, with recovery status `unverified-container-not-stopped`. The stop has a 45-second deadline, the kill and each query 15 seconds; a deadline signals the command's whole process group, then kills it five seconds later, and a command that reached its deadline has proved nothing. So a stalled Docker API still reaches the alert.
8. **Applies the baseline policy.** If the newest completed reset began before the most recent top of the UTC hour, a boundary was missed, and the boot runs a fresh reset before visitors are served.
   - **The lock.** The reset inherits the boot's hold on it, so no timer run can slip in between.
   - **The curtain.** The boot owns it. The reset runs as its delegate (`--caller boot`), so it never lifts the curtain, even after restoring and verifying the prior unit, and it verifies the direct runtime only.
   - **Outcomes.** The boot lifts the curtain only once the fresh baseline passes. A failed fresh reset stops with `boot-reset-failed`, and the curtain stays up whatever the reset did with it: its recovery status is `prior-unit-healthy-curtain-retained` when the reset restored the prior unit, and `maintenance-curtain-retained` otherwise. With no missed boundary, the boot lifts the curtain after its start passes.
9. **Reports public availability separately,** with a ten-second bound. An edge or DNS failure is recorded, and never causes a reset or a rollback. A successful boot sends the heartbeat.

**Boot evidence.** Each check's output is kept in the boot's operation directory only after every secret value collected in step 3 is replaced. No check that runs before step 3 can print a secret. A Compose parser error is never kept, even redacted, because it can quote a malformed secret; the evidence names only that the configuration did not parse. The resolved configuration, which carries the application's secrets, lives only in a root-only directory under `/run` that is removed on every exit.

The recovery target is ten minutes from Docker starting, with healthy dependencies, including a fresh reset. The native lifecycle qualification requires it after a real Docker restart.

**Stopping the demo deliberately.** Create the hold, then stop the container:

```sh
install -o root -g root -m 0600 /dev/null /etc/longtail-forge/public-demo-hold
```

The hold keeps it stopped across boots, Docker restarts, and hourly resets: the boot stops with `boot-held`, the scheduler records `skipped-held` without an alert, and a manual reset refuses. Remove the file to resume. The next Docker start, or a manual reset, brings the demo back.

## Alerts and heartbeat

**Discord alerts.** The alert helper keeps its journal line, and posts the same bounded fields to a Discord webhook as one message, with every mention disabled. The URL lives only in `/etc/longtail-forge/public-demo-alert-webhook`: a `root:root` `0600` file holding one `https://discord.com/api/webhooks/<id>/<token>` line. It reaches `curl` on standard input, so it never appears in argv, the journal, or any output. Delivery is bounded to ten seconds, and its outcome is what the scheduler records as `delivered` or `failed`. A missing file means the alert reached only the journal, and counts as `failed`.

The failure classes are the reset's `lifecycle-lock-contended`, `reset-failed`, `reset-failed-recovered`, and `reset-failed-unrecovered`; `retention-failed`, which follows a completed reset; and the boot's `boot-held`, `boot-marker-present`, `boot-release-uncertain`, `boot-storage-failed`, `boot-profile-invalid`, `boot-dependency-unavailable`, `boot-start-failed`, `boot-stop-failed`, and `boot-reset-failed`. The recovery statuses are `not-started`, `not-required`, `unknown`, `prior-unit-healthy`, `prior-unit-healthy-curtain-retained`, `maintenance-curtain-retained`, `unverified-container-not-stopped`, and `demo-stopped`. A `retention-failed` alert always carries `not-required` and exit code 0.

**The heartbeat.** After each successful reset and boot, the helper sends one `GET` to the URL in `/etc/longtail-forge/public-demo-heartbeat-url`, such as an Uptime Kuma Push monitor's. It must be an `https://` URL in a `root:root` `0600` file, and it also reaches `curl` on standard input. The monitor alerts when a heartbeat is late, which catches a demo that stays up but stops resetting: set its interval above one hour, with some grace. A failed heartbeat never fails the reset or the boot. Its outcome is recorded as `heartbeatOutcome`.

Install each file from standard input, so that the URL never reaches a command line or shell history:

```sh
umask 077
read -rs -p 'Discord webhook URL: ' value; echo
printf '%s\n' "$value" | sh -c 'cat > /etc/longtail-forge/public-demo-alert-webhook'
unset value
chown root:root /etc/longtail-forge/public-demo-alert-webhook
chmod 0600 /etc/longtail-forge/public-demo-alert-webhook
```

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
