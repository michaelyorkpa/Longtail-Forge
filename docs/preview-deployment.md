# Compose Production Support and Bare-Metal Transition

Docker Compose is the sole supported production and self-hosted deployment for the Longtail Forge public preview. Direct Node/systemd operation remains technically possible but is unsupported. Normal npm installation and `npm start` remain available for development, testing, and advanced experimentation; the extracted runtime tarball is not a second supported production installation, upgrade, rollback, or recovery path.

The existing bare-metal `rt-ltf` and `rt-ltf-demo` installations remain active transition safety until the Compose replacement passes deployment, upgrade, durable database/Files persistence, backup, restore, and restored-rollback proof. Do not remove their helper, service definitions, retained releases, backups, smoke coverage, or recovery evidence before that gate and the verified live cutover. Both the current transition path and the supported Compose path keep Node behind the reviewed Caddy edge from [Reference Internet Deployment](internet-deployment.md); neither exposes Node directly to the internet.

This document does not authorize invitations. The tested baseline backup/restore is defined in [Baseline Backup and Restore](backup-restore.md); native Docker-engine acceptance, remaining release gates, the private readiness record, and the explicit invite/no-invite decision are still required.

## Support matrix

| Use | Status | Contract |
| --- | --- | --- |
| Docker Compose on `linux/amd64` Debian Bookworm/glibc | Sole supported production/self-hosted path | Immutable digest-selected image, one local SQLite/Files volume, separate protected backup destination, loopback-only Node behind the reviewed Caddy edge. |
| Direct Node, npm, or systemd | Unsupported for production | Available only for development, testing, advanced experimentation, and the bounded transition safety described below. No parallel supported production lifecycle is promised. |
| `linux/arm64`, musl/Alpine, or another container platform | Unsupported | Requires a future explicit platform decision plus native clean build/install, `better-sqlite3` load, boot, and complete container acceptance proof. A manifest or emulated build is insufficient. |
| Kubernetes, Swarm, Helm, horizontal app replicas, PostgreSQL service | Out of scope | Compose remains one application container on the supported one-server SQLite topology. |

The supported platform decision is `linux/amd64` only. Both current preview hosts reported native `x86_64` on 2026-08-04, and the protected Ubuntu packaging job runs on native amd64. The container smoke refuses any Docker server that does not report `linux/amd64`, then loads `better-sqlite3` and boots the exact candidate in the final image. QEMU-only, manifest-only, cross-build-only, or JavaScript-only evidence does not qualify another platform.

## Transition asset inventory

| Asset | Classification | Dependency and retirement gate |
| --- | --- | --- |
| Checksummed runtime artifact and `artifact:smoke` | Retained | The artifact is the only reviewed application payload accepted by the image build. The clean disposable production-dependency install and boot remain required, but the tarball is no longer advertised as a production installer. |
| `Dockerfile`, `compose.yaml`, `.dockerignore`, `container:build`, `container:smoke` | Adapted | These become the sole supported production packaging/lifecycle surface. The current slice fixes platform, controlled-payload, security-label, provenance, and native-proof requirements; 0.33.28.2 expands the full Compose recovery exercise. |
| Bare-metal smoke and systemd example | Retained as transition safety | Keep while either live host is bare-metal and while comparison/recovery proof depends on it. Retire as a separate final slice only after Compose replacement and restored rollback pass on the live hosts. |
| Root-owned host deploy helper and constrained SSH handoff | Adapted later | Preserve the current fail-closed backup/deploy/recovery boundary. Version 0.33.28.3 may adapt transport to a digest-selected Compose image; do not weaken credentials, host keys, markers, or evidence meanwhile. |
| Release workflows and release regressions | Adapted | Continue exact-SHA artifact, backup, bare-metal transition, and native container proof now. Version 0.33.28.3 binds the published image digest and transport; the final retirement slice removes obsolete bare-metal jobs only after cutover. |
| Installation, self-hosting, upgrade, rollback, and recovery docs | Adapted in sequence | This slice establishes the sole-support boundary and labels old instructions as transition-only. Version 0.33.28.2 owns the complete supported Compose lifecycle; the final slice removes duplicated bare-metal promises after live replacement proof. |

Repository promotion, immutable GitHub artifacts, and the current transition handoff are defined in [GitHub Workflow](development/github-workflow.md). That handoff uses a low-privilege SSH account with pinned host keys and passwordless sudo access to one reviewed root-owned helper, rather than a root SSH login or a general-purpose self-hosted runner. Where a GitHub-hosted runner requires an Internet-reachable SSH endpoint, that dedicated key-only port is restricted management-plane access, never Longtail Forge application ingress, and must not expose an interactive deployment shell, Node, Caddy administration, data, or runtime secrets. The helper remains transition safety until the digest-selected Compose transport replaces it. Its GitHub Environments stay isolated until the exact host, credentials, URLs, data, and recovery materials exist and the required deployment/rollback proof passes.

The root-owned deployment state directory uses mode `0711` so the deployment account can traverse only the known path to its own `0700` inbox; it cannot list the parent or read/write sibling state such as deployment history. The backup directory remains root-only `0700`. Do not make the deployment-state parent `0700`, because that prevents the pinned account from delivering an artifact to the nested inbox, and do not broaden it to a listable or group-writable directory.

Install the host helper from the LF-only tracked file. The repository pins `scripts/release/longtail-forge-deploy-host.example` to `eol=lf` because a CRLF shebang is not executable by Linux (`/usr/bin/env` would look for `bash\r`). Verify the staged file with `file` or an equivalent byte-level check before installing it as the root-owned helper; do not copy a differently normalized editor buffer.

Install [longtail-forge-deploy-helper.env.example](longtail-forge-deploy-helper.env.example) separately as `/etc/longtail-forge/deploy-helper.env`, owned by `root:root` with mode `0600`, and set `LTF_PUBLIC_URL` to the exact clean HTTPS preview origin. This durable file is parsed as allowlisted literal `KEY=value` data before helper defaults are resolved; it is never sourced as shell code. Its parent and file must be root-owned, real paths that are not group- or other-writable. Keep the application environment and secrets out of this file. `LTF_SECURE_KEY_BACKUP`, when needed, is only the path to separately protected recovery-key material. `LTF_MAINTENANCE_STATE_ROOT` must match the separately installed maintenance-helper configuration; the deploy helper derives the fixed root-only deployment marker beneath it and never changes the operator marker. Reinstalling the reviewed helper must not replace this host configuration file.

## Root-owned maintenance asset and marker helper

Version 0.33.24.1 supplies the host-neutral page and marker helper. Installing those host assets alone does not stop Longtail Forge or route requests; the reviewed Caddy configuration remains the routing authority. Version 0.33.24.2 integrates the assets at that private-Caddy boundary, version 0.33.24.3 integrates the deployment-owned marker into the successful bare-metal deployment path, and version 0.33.24.6 adds a separate root-owned transport-failure page for the public Nginx edge in the bounded multi-proxy topology.

1. Create one dedicated local group such as `longtail-forge-maintenance`, and add only the reviewed interactive operator accounts that may assert the operator hold. Start a new login session before relying on new group membership. Do not reuse the Caddy, application, or deployment account as the operator group.
2. Copy [longtail-forge-maintenance-helper.env.example](longtail-forge-maintenance-helper.env.example) to `/etc/longtail-forge/maintenance-helper.env`. Keep it `root:root` mode `0644`: it contains no secrets and must be readable by the unprivileged helper caller, but it must never be writable by that caller. Its root-owned parent must permit traversal to that known file without permitting directory listing or writes; when the parent contains sibling root-only helper environments, mode `0711` preserves their `0600` confidentiality. Review the dedicated group and the separate state, immutable-asset, and helper paths.
3. From a byte-preserving checkout, install the tracked helper and adjacent page:

   ```sh
   sudo bash scripts/release/longtail-forge-maintenance-host.example install
   ```

   The repository pins the helper to LF line endings. Installation refuses symbolic-link substitutions, a writable/unowned configuration boundary, missing operator group, overlapping state/asset trees, or unsafe paths. It installs the helper and page root-owned, creates a non-listable state root, gives the operator group write access only to its own setgid marker directory, and leaves the deployment marker directory root-only. The zero-byte marker itself must be readable by Caddy even when Caddy runs as a distinct service account: the helper creates the operator marker as `0664` and the deployment marker as `0644`, without adding another writer.

The helper has three deliberate forms:

```sh
longtail-forge-maintenance status
longtail-forge-maintenance operator on
longtail-forge-maintenance operator off
sudo longtail-forge-maintenance deployment on
sudo longtail-forge-maintenance deployment off
```

`status` reports the aggregate and both independent markers. Repeating `on` or `off` is safe. The operator commands can change only the operator marker; deployment marker changes require root so the later root-owned deployment helper can control only that marker. An operator hold therefore survives deployment cleanup, and an unresolved deployment hold cannot be removed by the operator command. The marker read bits are required only for Caddy's per-request file match; write authority still comes from the containing `2771` operator-group or `0711` root-only directory. The helper rejects symbolic-link or non-regular marker substitutions. The writable marker directory grants no write access to the page, helper, Caddy configuration, releases, application data, backups, or secrets.

After installation, validate ownership and mode with `sudo longtail-forge-maintenance status`, assert the operator marker, and verify an ordinary public request plus all three exact diagnostics before clearing it. Then repeat with the root-only deployment marker. In the bounded topology, stop only private Caddy long enough to prove the distinct Nginx transport fallback, restart it, and confirm recovery without an Nginx reload. Do not perform that outage exercise on a host carrying unannounced user traffic.

For a stale deployment marker, inspect the protected latest/history operation records and invoke only the same recorded deploy or rollback. The helper reconstructs or revalidates the selected identity before clearing its marker. Never use the operator `off` command, `rm`, or a proxy reload to hide unresolved deployment state. For emergency containment, keep the operator marker active when the application is safe enough for diagnostics; stop or firewall the public edge when even diagnostic reachability is unsafe. Preserve application, proxy, deployment-helper, operation, backup, and incident evidence in the private operational record before changing containment.

To retire this boundary from a host, first move traffic elsewhere or close the public edge, verify no active deploy/rollback and no unresolved marker, preserve the helper configuration, proxy configuration, operation history, releases, backups, and incident evidence, then remove proxy references before removing the installed helper/page/state paths. Never run uninstall by deleting a marker tree that an active proxy still evaluates. The old `archive/maintenance-mode/` files are historical and must not be installed. The repository-local preflight for this lifecycle is `npm run maintenance:rehearse`; retain its native-Linux output with tool versions and the exact revision in the private operational record.

The installed page is self-contained and uses passive system Light/Dark styling with no script or external asset. Its default copy says only that Longtail Forge is temporarily unavailable and refreshes once a minute; it does not claim scheduled work, backup success, data safety, or application health. Both checked-in private-Caddy examples now inspect the two marker paths per request and serve this page as a hardened HTML `503` for ordinary traffic without a reload. The exact `/healthz`, `/readyz`, and `/api/app-info` paths continue to proxy to Node; a stopped Node produces generic JSON `503` on those diagnostics and the same page for every other request. The complete routing, header, outage, and recovery contract belongs to [Reference Internet Deployment](internet-deployment.md#proxy-configuration).

The tracked `scripts/release/longtail-forge-edge-unavailable.html` is not an application maintenance marker or a replacement for that page. In the bounded Nginx topology it is installed root-owned on the public edge and is selected only when Nginx cannot reach private Caddy across the transport boundary. Valid inner `503` responses pass through unchanged. A stopped public Nginx edge produces no HTTP response at all; it must not be described as application maintenance. Installation, exact response ownership, diagnostics, and the disposable real-Nginx proof are governed by [Reference Internet Deployment](internet-deployment.md#proxy-configuration). No repository change in this slice modifies a live edge host.

For a transition-only bare-metal deployment, the root-owned deploy helper validates the disjoint deployment and maintenance trees plus the exact owner, group, mode, directory, regular-file, and no-symbolic-link contract before touching the marker. It verifies the artifact checksum and release metadata, extracts the candidate, and installs locked production dependencies before the outage window. It then requires Caddy to be active, idempotently asserts the deployment marker, stops only the application service, creates and inspects the stopped-app backup when upgrading, switches the immutable release, and starts the application. Caddy stays active throughout.

The helper first requires direct loopback readiness, then verifies the intended release identity through public `/api/app-info` and checks public `/healthz` and `/readyz` through their marker exemptions. It records deployment state and rechecks Caddy before removing only the deployment marker. A pre-existing operator marker remains untouched, so successful deployment does not override an operator hold. Interruption or failure does not run a broad cleanup trap: the deployment marker remains fail-closed for the reviewed recovery path. Do not manually clear that root-owned hold merely because the helper exited.

### Failed transition bare-metal deployment recovery

After a candidate is fully staged, each deploy attempt writes one protected history record beneath `/var/lib/longtail-forge-deploy/operations/` and atomically refreshes `/var/lib/longtail-forge-deploy/deployment-operation.json`. The history directory is `root:root` mode `0700`; history and latest records are regular `root:root` files mode `0600`. The deployment account can traverse only to its separate inbox and the operator-maintenance group has no access to either location. Records are secret-free and contain the deployment marker owner, initiating/final reason class, start/end timestamps, phase, candidate identity, recovery identity when one was attempted, retained backup path, and outcome. As of 0.33.27.3, operation-record names and atomic temporary-write suffixes use random UUIDv4 values from the staged candidate's central opaque identifier authority; these values are not timestamps, secrets, or ordering keys.

The failed-deploy contract is exact:

- If stopping the current application fails, the helper reselects, starts, and directly/publicly verifies the recorded known-good identity without restoring data. It clears only the deployment marker after that proof; otherwise the curtain remains.
- If the stopped-app pre-deployment backup fails, no candidate release or migration has run. The helper retains the failed backup path, restarts and verifies the recorded known-good release without treating the incomplete backup as a recovery unit, and reopens only after proof.
- If candidate startup/readiness fails or public identity is wrong, the helper stops the candidate, reselects the recorded prior release, restores the verified pre-deployment database and Files backup together, restores release metadata, and requires direct readiness plus public identity/health/readiness before clearing its marker.
- If the prior backup cannot be restored, or the restored current release cannot start and pass exact identity/readiness proof, Caddy stays active, the application stays unavailable or untrusted behind the curtain, and the deployment marker, immutable releases, backup/pre-restore artifacts, release metadata snapshot, and protected operation evidence remain intact.
- `HUP`, `INT`, and `TERM` record an interrupted outcome at the current phase and never clear the marker. There is no `EXIT` cleanup that can reopen traffic.

A retry is accepted only for the same candidate named by the protected active operation. It reuses the immutable candidate and, when available, the original retained backup; it first restores/reselects and verifies the recorded known-good baseline under the existing curtain, stops that verified baseline again, and then repeats candidate startup and proof. A different candidate, missing recovery unit, unsafe file, mismatched current release, or invalid operation record is refused. A pre-existing operator marker survives every recovered, failed, interrupted, and retried path and must be cleared independently by its authorized operator.

## Shared boundary

- One Node application server, one local SQLite database, local Files storage, and either the inline worker or one same-host separate worker.
- Roughly 50 total users and typical active use around 5-15 concurrent users. No PostgreSQL service, horizontal scaling, hosted SaaS, high availability, or automatic updater.
- Caddy owns public TCP 80/443 and TLS. Node is reachable only through loopback port 8001. The fixed Docker bridge gateway is the immediate peer trusted by the containerized app.
- Application data and Files content live together under one durable private data root. Backups live at a separate path and are never served from `public/`.
- SQLite data must use a local Docker volume or local block filesystem. Do not place the database or WAL/SHM sidecars on NFS, SMB, cloud-synchronized folders, object-storage mounts, or a volume shared by multiple app containers.
- Real `.env` files, secrets, databases, Files data, backups, logs, and release credentials never enter the image or source control.

## Docker image build

The checked-in Dockerfile does not copy the repository. `.dockerignore` denies everything except the Dockerfile and generated `dist/*.tgz` payload, and the build helper verifies the adjacent artifact checksum before placing that exact tarball in the builder. A disposable builder stage installs Python 3, `make`, and `g++`, then installs the artifact's pruned shrinkwrap with `npm ci --omit=dev`; the final stage copies only the root-owned read-only installed application tree and runs as UID/GID 10001 without the native build toolchain or repository development dependencies. The installed runtime does not need `.git`.

The default base is the immutable digest for the official `node:24.18.0-bookworm-slim` image. The helper fixes the build to `linux/amd64`, verifies the built image reports that platform, and adds the exact version, AGPL license, source branch, full revision, runtime-artifact checksum, and platform labels. For a release candidate, bind the already-created release metadata to the same artifact:

```sh
npm run container:build -- --artifact dist/longtail-forge-<version>.tgz --release-metadata dist/release-metadata.json --tag longtail-forge:<version> --no-cache --pull
```

The build writes adjacent retained JSON provenance containing the source revision, source branch, application version, runtime-artifact checksum, resolved base reference/digest, `linux/amd64` platform, local content-addressed image digest, and reviewed labels. The protected promotion workflow retains that record for 30 days. Version 0.33.28.3 owns the immutable published manifest digest and attaches or retains the SBOM there; this slice explicitly defers SBOM generation because an unattached local-build document would not prove the published digest. A release candidate without matching release metadata or a native `linux/amd64` container smoke is not qualified.

The image starts `node server.js` directly as the container process, which is the same entrypoint beneath the unchanged development/test `npm start` contract. It has no compiler, test runner, browser harness, regression tooling, source checkout, `.env`, live data, backup, or Caddy process. Changing `NODE_IMAGE` or the platform is a reviewed qualification change, not an ordinary deployment toggle.

## Docker Compose installation

1. Install a supported Docker Engine with Compose v2. Copy [compose.env.example](compose.env.example) to the protected root `.env`, replace the hostname and both required secrets, and keep mode `0600` on POSIX. Create the configured backup directory before startup; on Linux make it writable only by the recovery operator and container UID 10001.
2. Confirm the chosen `172.30.17.0/24` bridge does not overlap the host, VPN, LAN, or another Docker network. If it does, change the subnet, gateway, and `LONGTAIL_DOCKER_TRUST_PROXY` together. Trust only the exact bridge gateway `/32`.
3. Run the production scanner on the same host or another protected reachable address. `host.docker.internal:3310` is the default Compose handoff to host `clamd`; do not expose that port publicly. Production startup fails when the scanner is absent or unhealthy.
4. Build or obtain the exact reviewed image, set `LONGTAIL_IMAGE` to its immutable release tag or digest, then validate and start:

   ```sh
   docker compose config --quiet
   docker compose up -d
   docker compose ps
   ```

5. Require the container to become healthy, then verify the direct loopback boundary and the public Caddy boundary:

   ```sh
   curl --fail --silent --show-error http://127.0.0.1:8001/healthz
   curl --fail --silent --show-error http://127.0.0.1:8001/readyz
   curl --fail --silent --show-error http://127.0.0.1:8001/api/app-info
   curl --fail --silent --show-error https://forge.example.com/readyz
   curl --fail --silent --show-error https://forge.example.com/api/app-info
   ```

Compose publishes only `127.0.0.1:${LONGTAIL_HOST_PORT}:8001`. Caddy keeps using `reverse_proxy 127.0.0.1:8001`; public firewall rules must still deny port 8001. The application filesystem is read-only, Linux capabilities are dropped, privilege escalation is disabled, `/tmp` is a bounded private tmpfs, and shutdown has 30 seconds for the app and inline worker to stop cleanly.

The named `longtail-data` volume contains the SQLite database, WAL/SHM sidecars, and local Files storage. The configured backup bind mount appears at `/var/backups/longtail-forge`; it is the protected destination for the [baseline backup CLI](backup-restore.md), the app-created `workspaces/` packages described in [Workspace Backup Package](workspace-backup.md), and operator recovery, not ordinary application downloads. Do not delete either location during image replacement.

## Docker backup-first upgrade

Use the tested complete backup and restore command from [Baseline Backup and Restore](backup-restore.md). The earlier deployment smoke's stopped raw-volume copy remains only a disposable packaging rehearsal and is not a supported backup format.

For the first supported upgrade after that prerequisite exists:

1. Record the current `/api/app-info` version, exact image tag/digest, Compose configuration, volume identity, and last-known-good release. Pause changes and remove public traffic at the selected TLS edge.
2. Run the tested complete backup. Verify its manifest/checksums and required separately protected Secure Notes key recovery material before proceeding.
3. Build or obtain the reviewed candidate image and verify its artifact checksum/image identity. Do not reuse a mutable `latest` tag.
4. Stop the app with `docker compose stop longtail-forge`. Do not delete the data volume. Update only `LONGTAIL_IMAGE`, then run `docker compose up -d --no-deps --force-recreate longtail-forge`. Normal startup owns forward migrations.
5. Require container health, direct and proxied `/readyz`, the expected `/api/app-info` version, current schema, login/session, workspace access, Files access, and one representative workflow before restoring public traffic.
6. Record the old/new image identities, artifact checksum, backup identity, migrations, commands, checks, operator, timestamps, and decision.

If verification fails, remove public traffic and stop the candidate. Re-pointing Compose at the previous image is allowed only when rollback compatibility with every applied migration is explicitly proven. Otherwise leave both images intact, restore the verified pre-upgrade database and Files backup together into a clean recovery volume, select the previous image, start, and re-run health/readiness/version/schema/workflow verification. Never reverse migrations by hand or combine an old database with newer Files data.

## Transition-only bare-metal installation

The following procedure documents and protects the two existing installations during cutover. It is not a supported production/self-hosting option for a new installation.

Use a dedicated non-interactive `longtail-forge` account. Keep immutable releases under `/opt/longtail-forge/releases/<version>`, a `current` symlink to the selected release, protected configuration under `/etc/longtail-forge`, durable data under `/var/lib/longtail-forge`, and backups outside that tree. The service account owns only its data root; release files stay root-owned and read-only.

1. Verify the versioned artifact SHA-256 sidecar, extract into a new release directory, and run `npm ci --omit=dev` there. Never `git pull` or extract over the live release.
2. Copy [longtail-forge.service.example](longtail-forge.service.example) to `/etc/systemd/system/longtail-forge.service`, review every path, set `HOST=127.0.0.1` and `PORT=8001` in the protected environment, then enable/start the service. Keep Node behind the selected reviewed edge from [Reference Internet Deployment](internet-deployment.md): either direct Caddy or the exact Nginx -> WireGuard -> Caddy chain.
3. Verify direct and proxied health/readiness/version, login/session, workspace access, Files access, and one representative workflow.

For an upgrade through the root-owned helper, keep Caddy running and let the helper stage and install the new artifact before asserting its deployment marker. The helper then stops the application, creates and inspects the complete backup, atomically repoints `current`, starts the candidate, and proves direct plus public readiness and release identity before clearing only its marker. The root-owned helper returns restored data to the dedicated application account, reapplies private runtime-directory and database modes, and refuses symbolic-link substitutions before startup. A failed candidate follows the protected recovery matrix above: verified known-good recovery clears only the deployment hold and still returns failure for the attempted deploy; unresolved restore or verification keeps the curtain and recovery evidence intact.

An explicit rollback follows the same curtain boundary without stopping Caddy: the helper records the target and current identities, asserts its marker, stops Node, creates and inspects a pre-rollback current-state backup, restores the recorded target database and Files archive, applies the target release metadata, and requires direct plus public readiness/identity before swapping deployment state and clearing only its marker. A failed target restore/start/identity check reconstructs the pre-rollback current release from that new backup and reopens only after the current identity passes the same proof. If either restore or verification fails, both recovery units, their pre-restore artifacts, the immutable releases, and the root-only operation record remain beneath the curtain. Re-running the same interrupted rollback first reconstructs and verifies its recorded current baseline; a different target is refused. A deployment marker left after an already-recorded state swap is cleared only after the selected rollback identity is reverified, never from marker or operation-file presence alone. Keep both releases and backups through the observation period.

The isolated `rt-ltf-demo` development environment may additionally install the separate root-owned helper from [Demo Host Data Provisioning and Reset](demo-data-operations.md). That helper is not part of normal deploy/rollback, never runs during startup or a scheduled Nightly workflow, and must not be installed on the friends-and-family preview or customer/self-hosted environments. Routine Nightly deployment preserves its generated database and Files state.

## Proof commands and limits

Run `npm run artifact:smoke` for the clean controlled-payload install/boot proof. Keep `npm run bare-metal:smoke -- --previous-artifact dist/longtail-forge-<previous-version>.tgz` only as transition recovery evidence. Run `npm run container:smoke -- --artifact dist/longtail-forge-<version>.tgz --release-metadata dist/release-metadata.json --previous-artifact dist/longtail-forge-<previous-version>.tgz --pull` for the native clean image build, `better-sqlite3` load, non-root/read-only boot, persistence, replacement, health/readiness, backup-first upgrade rehearsal, and restored rollback rehearsal. The Docker server must itself report `linux/amd64`; absence of an engine, an unsupported architecture, or emulation-only execution is a failed prerequisite, not a passing skip.

These rehearsals use disposable data and may compare two images built from supplied previous/current artifacts. They prove packaging and operational mechanics, not external penetration testing, public DNS/certificate issuance, production ClamAV deployment, backup completeness, cross-version downgrade safety, or invitation readiness.
