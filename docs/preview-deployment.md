# Compose Production Support

Docker Compose is the sole supported production and self-hosted deployment for the Longtail Forge public preview. Direct Node/systemd operation remains technically possible but is unsupported. Normal npm installation and `npm start` remain available for development, testing, and advanced experimentation; the extracted runtime tarball is not a second supported production installation, upgrade, rollback, or recovery path.

The live `rt-ltf` preview and `rt-ltf-demo` demo hosts completed the native `linux/amd64` Compose replacement gate in 0.33.28.4, including durable SQLite/Files persistence, backup-first upgrade, complete restore, restored rollback, scanner/network posture, and exact immutable identity. Direct Node/systemd production support is retired. Historical host releases, backups, Secure Notes recovery material, and protected operation records remain private retention evidence; they are not an active installation or recovery contract.

This document does not authorize invitations. The tested baseline backup/restore is defined in [Baseline Backup and Restore](backup-restore.md); native Docker-engine acceptance, remaining release gates, the private readiness record, and the explicit invite/no-invite decision are still required.

## Support matrix

| Use | Status | Contract |
| --- | --- | --- |
| Docker Compose on `linux/amd64` Debian Bookworm/glibc | Sole supported production/self-hosted path | Immutable digest-selected image, one local SQLite/Files volume, separate protected backup destination, loopback-only Node behind the reviewed Caddy edge. |
| Direct Node, npm, or systemd | Unsupported for production | Available only for development, testing, and advanced experimentation. No maintained production installation, deployment, upgrade, rollback, recovery, workflow, or release gate is provided. |
| `linux/arm64`, musl/Alpine, or another container platform | Unsupported | Requires a future explicit platform decision plus native clean build/install, `better-sqlite3` load, boot, and complete container acceptance proof. A manifest or emulated build is insufficient. |
| Kubernetes, Swarm, Helm, horizontal app replicas, PostgreSQL service | Out of scope | Compose remains one application container on the supported one-server SQLite topology. |

The supported platform decision is `linux/amd64` only. Both current preview hosts reported native `x86_64` on 2026-08-04, and the protected Ubuntu packaging job runs on native amd64. The container smoke refuses any Docker server that does not report `linux/amd64`, then loads `better-sqlite3` and boots the exact candidate in the final image. QEMU-only, manifest-only, cross-build-only, or JavaScript-only evidence does not qualify another platform.

## Retired production paths

The bare-metal smoke and promotion job, systemd service example, root-owned immutable Node-release helper and helper environment, first-cutover helper and environment, direct runtime-artifact deployment modes, and Nightly bare-metal demo transport are retired. Direct Node/systemd production operation has no release gate. The checksummed runtime artifact and `artifact:smoke` remain because the reviewed image consumes that exact payload and must prove a clean production-dependency install and boot before image construction.

Repository promotion, immutable GitHub artifacts, and the constrained Compose handoff are defined in [GitHub Workflow](development/github-workflow.md). The handoff uses a low-privilege SSH account with pinned host keys and passwordless sudo access to one reviewed root-owned Compose helper, rather than a root SSH login or a general-purpose self-hosted runner. Where a GitHub-hosted runner requires an Internet-reachable SSH endpoint, that dedicated key-only port is restricted management-plane access, never Longtail Forge application ingress, and must not expose an interactive deployment shell, Docker, registry credentials, Node, Caddy administration, data, or runtime secrets.

The root-owned deployment state directory uses mode `0711` so the deployment account can traverse only the known path to its own `0700` inbox; it cannot list the parent or read/write sibling state such as deployment history. Do not make the deployment-state parent `0700`, because that prevents the pinned account from delivering metadata to the nested inbox, and do not broaden it to a listable or group-writable directory. The Compose backup directory is separately owner-only `0700` for container UID/GID 10001, and the helper rejects a resolved Compose configuration that does not bind that protected host directory to `/var/backups/longtail-forge`.

Install the Compose host helper from the LF-only tracked file. The repository pins `scripts/release/longtail-forge-compose-deploy-host.example` to `eol=lf` because a CRLF shebang is not executable by Linux (`/usr/bin/env` would look for `bash\r`). Verify the staged file with `file` or an equivalent byte-level check before installing it as the root-owned helper; do not copy a differently normalized editor buffer. Install [longtail-forge-compose-deploy-helper.env.example](longtail-forge-compose-deploy-helper.env.example) separately as `/etc/longtail-forge/compose-deploy-helper.env`, owned by `root:root` with mode `0600`.

## Root-owned maintenance asset and marker helper

Version 0.33.24.1 supplies the host-neutral page and marker helper. Installing those host assets alone does not stop Longtail Forge or route requests; the reviewed Caddy configuration remains the routing authority. Version 0.33.24.2 integrates the assets at that private-Caddy boundary, the supported Compose helper owns the independent deployment marker, and version 0.33.24.6 adds a separate root-owned transport-failure page for the public Nginx edge in the bounded multi-proxy topology.

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

The build writes adjacent retained JSON provenance containing the source revision, source branch, application version, runtime-artifact checksum, resolved base reference/digest, `linux/amd64` platform, local content-addressed image digest, and reviewed labels. The protected promotion workflow retains that record for 30 days. Local provenance is build evidence only. The manual release workflow is the publication authority: it builds the exact protected `main` revision, pushes one `linux/amd64` GHCR image index, attaches registry-attached SPDX SBOM and SLSA provenance attestations, pulls the published digest, and executes `better-sqlite3` from that digest on native `linux/amd64`. A release candidate without matching release metadata or either native proof is not qualified.

The image starts `node server.js` directly as the container process, which is the same entrypoint beneath the unchanged development/test `npm start` contract. It has no compiler, test runner, browser harness, regression tooling, source checkout, `.env`, live data, backup, or Caddy process. Changing `NODE_IMAGE` or the platform is a reviewed qualification change, not an ordinary deployment toggle.

## Immutable image publication and constrained transport

The maintained public release transport is GHCR. `.github/workflows/manual-release.yml` receives the repository-scoped ephemeral `GITHUB_TOKEN` with only `contents: write` and `packages: write`, authenticates with `--password-stdin`, and publishes `ghcr.io/<owner>/<repository>:sha-<full-main-commit>`. That commit tag is a discovery label, not a deployment reference. The workflow and host always select `ghcr.io/<owner>/<repository>@sha256:<image-index-digest>`; `latest`, a version tag without its digest, an unverified local image ID, a Nightly image, and a non-`main` source are rejected.

`npm run image:publish -- publish ...` consumes the checksummed runtime artifact and schema-1 source metadata, builds with BuildKit provenance and SBOM attestations, publishes exactly `linux/amd64`, and emits two release records:

- `release-metadata.json` schema 2 binds the protected `main` commit, runtime-artifact filename and SHA-256, GHCR repository/index digest/reference, exact `linux/amd64` platform-manifest digest, image config digest, native `better-sqlite3`/SQLite execution result, and attached SPDX/SLSA attestation manifests.
- `platform-manifest.json` is the standalone machine-readable platform/image proof. The GitHub Release retains it beside the schema-2 metadata, checksummed runtime payload evidence, Compose file, protected environment examples, and reviewed deploy/reset host helpers. The tarball remains the controlled Docker build input and provenance asset; it is not advertised or accepted as a production installer.

The release workflow never receives host access or application secrets. The manual preview workflow never receives registry write authority and does not rebuild or transfer the runtime tarball. It checks out the exact selected `main` commit, downloads that version's immutable GitHub Release metadata, requires the operator-supplied image digest to match, and sends only the verified metadata through pinned-host, batch-mode SSH to the non-interactive deployment account. The account may write only its private inbox and may invoke only the reviewed root-owned Compose helper through the exact `sudo -n` rule. It has no root login, interactive shell, Docker socket access, registry credential, Caddy administration, data/backup read access, runtime-secret access, or general-purpose runner.

Install `scripts/release/longtail-forge-compose-deploy-host.example` as `/usr/local/sbin/longtail-forge-compose-deploy`, root-owned and non-writable. Install [longtail-forge-compose-deploy-helper.env.example](longtail-forge-compose-deploy-helper.env.example) as `/etc/longtail-forge/compose-deploy-helper.env` with `root:root` ownership and mode `0600`, and configure the workflow's `COMPOSE_DEPLOY_HELPER` variable to that exact path. Keep a preview environment disabled whenever its exact host, credentials, URL, data, scanner, backup, restore, rollback, or recovery evidence is incomplete.

Only on the exact `rt-ltf-demo` host, install the same reviewed release's reset, scheduler, alert, and isolation helpers as `/usr/local/sbin/longtail-forge-public-demo-reset`, `/usr/local/sbin/longtail-forge-public-demo-reset-scheduler`, `/usr/local/sbin/longtail-forge-public-demo-reset-alert`, and `/usr/local/sbin/longtail-forge-public-demo-isolation`, all root-owned and non-writable. Install the reviewed oneshot service and timer under `/etc/systemd/system/`, and the root-only scheduler environment example as `/etc/longtail-forge/public-demo-reset-scheduler.env`. The reset consumes the protected Compose helper environment plus the optional root-only `LTF_DEMO_ROLE_CREDENTIALS` path and shares `/var/lib/longtail-forge-deploy/compose-operation.lock` with deploy and rollback so two lifecycle promoters cannot overlap. Set `LONGTAIL_RESTART_POLICY=no` and `LONGTAIL_DNS_SERVER=127.0.0.1` only for this exact demo. Create its dedicated bridge without Docker's internal-network flag, disable IP masquerading, and require the isolation helper's first-position stateful-return/default-deny policy plus realized loopback publication before startup. A reboot therefore leaves the container stopped until a protected deploy or reset re-establishes the firewall, and Docker's embedded resolver cannot forward visitor-influenced names. Normal production Compose retains its default `unless-stopped` restart and `127.0.0.11` resolver behavior. None of these boundaries is available to the constrained deployment SSH account, app/worker startup, or an in-process timer.

The timer runs at the top of every UTC hour and deliberately uses `Persistent=false`, so host downtime skips missed runs rather than causing catch-up reset bursts. The host-only `LTF_PUBLIC_DEMO_RESET_ENABLED=false` switch safely records a disabled skip; it is not an Admin setting or application configuration. Scheduled and scheduler-wrapped manual invocations use the same reset entry and shared Compose operation lock. Lock contention fails without mutation and invokes the bounded failure alert; reset failures report whether the prior unit is healthy or the maintenance curtain remains. The root-private bounded JSONL evidence includes correlation, trigger, scheduled boundary, duration, lock outcome, fingerprint, health, failure class, rollback, recovery, and alert outcome without application output, credentials, content, sessions, secrets, or private paths. See [Public Demo Compose Reset](demo-data-operations.md) for exact install, enable/disable, manual, downtime, alert-routing, and recovery commands.

The host's root Docker client authenticates to GHCR separately with one pull-only credential scoped to the Longtail Forge package. Store it only in root's Docker credential store or a reviewed credential helper—never in GitHub Actions, the helper environment, Compose application environment, image layers, metadata, the deployment inbox, or the deployment account. Rotation is additive: install the replacement, prove an exact digest pull, then revoke the old credential. Revoke immediately on suspected disclosure and keep `DEPLOY_ENABLED=false` until a replacement digest pull and helper preflight pass. Package deletion, administration, repository write, and owner-wide scopes are not required for the host.

The root helper validates schema-2 metadata and the pulled labels, then requires the recorded known-good Compose baseline established by the live cutover in 0.33.28.4; it refuses to treat an unrecorded first install or data volume as an automated upgrade. For a recorded baseline it asserts the deployment-owned maintenance marker, stops only the Compose app, creates and inspects the whole-instance backup, selects the new digest, starts and verifies direct/public identity, and clears only its marker. Failed candidate verification restores the prior database and Files together with the prior digest; explicit rollback first protects the current state and restores the recorded previous backup. A failed restore or recovered-current check stays curtained with the images, backups, metadata, and operation evidence retained. The operator marker remains independent.

## Docker Compose installation

1. Install a supported `linux/amd64` Docker Engine with Compose v2. Copy [compose.env.example](compose.env.example) to the protected root `.env`, set `LONGTAIL_IMAGE` to the exact `repository@sha256:<image-index-digest>` bound by schema-2 release metadata, replace the hostname and required secrets, and keep `.env` mode `0600` on POSIX. Keep application secrets in the separate root-only environment named by `LONGTAIL_ENV_FILE`; double every literal `$` when Compose interpolation must pass a dollar-bearing value unchanged, and do not use raw env parsing that preserves surrounding quotes as value data. Confirm the same metadata names one `linux/amd64` platform manifest plus native `better-sqlite3`, SPDX SBOM, and SLSA provenance evidence. A mutable `latest` tag is never a deployment identity.
2. Create the named local data volume on local block-backed storage and the separate backup directory before startup. The data volume must be private to this one app container; do not place it on NFS, SMB, cloud-synced folders, or object-storage mounts. On Linux, make the backup directory owner-only and writable by container UID/GID 10001 plus the authorized recovery operator. Keep backup exports and the Secure Notes key backup outside the data volume and protect them separately.
3. Confirm the chosen `172.30.17.0/24` bridge does not overlap the host, VPN, LAN, or another Docker network. If it does, change the subnet, gateway, and `LONGTAIL_DOCKER_TRUST_PROXY` together. Create and inspect this reviewed network before Compose; `compose.yaml` consumes it as an external network so lifecycle commands cannot silently replace its gateway or firewall identity. Trust only the exact bridge gateway `/32`. The exact public demo additionally uses its fixed internal bridge and root-owned isolation helper documented in [Public Demo Compose Reset](demo-data-operations.md); that boundary does not apply to local development or other self-hosted installs.
4. Run a real production `clamd` on the same host or another protected reachable address. The reviewed bridge gateway (`172.30.17.1:3310` by default) is the one-host Compose handoff; do not use Docker's ambiguous `host-gateway` alias or expose that port publicly. Prove a scanner `PING` before startup. Production startup fails closed when the scanner is absent or unhealthy.
5. Inspect the reviewed image identity, validate the resolved Compose configuration, create the stopped container, and inspect its mounts before starting it:

   ```sh
   docker image inspect "$(sed -n 's/^LONGTAIL_IMAGE=//p' .env)"
   docker compose config --quiet
   docker compose create longtail-forge
   docker compose ps --all
   docker compose up -d
   docker compose ps
   ```

6. Keep the operator maintenance marker active until acceptance finishes. Require the container to become healthy, then verify the direct loopback boundary and the public Caddy boundary:

   ```sh
   curl --fail --silent --show-error http://127.0.0.1:8001/healthz
   curl --fail --silent --show-error http://127.0.0.1:8001/readyz
   curl --fail --silent --show-error http://127.0.0.1:8001/api/app-info
   curl --fail --silent --show-error https://forge.example.com/readyz
   curl --fail --silent --show-error https://forge.example.com/api/app-info
   ```

7. Confirm `/api/app-info` matches the selected application/image identity and recorded schema/migration identity. Through the public boundary, log in, confirm the session survives navigation, open the intended workspace, upload and retrieve a representative File through a real scanner result, and complete one representative workflow. Open ordinary traffic only after all checks pass; record the digest, volume, backup location, commands, results, operator, and timestamps.

Compose publishes only `127.0.0.1:${LONGTAIL_HOST_PORT}:8001`. Caddy keeps using `reverse_proxy 127.0.0.1:8001`; public firewall rules must still deny port 8001. The application filesystem is read-only, Linux capabilities are dropped, privilege escalation is disabled, and shutdown has 30 seconds for the app and inline worker to stop cleanly. `/tmp` is a bounded 512 MB private tmpfs because whole-instance restore concurrently holds the inspected archive and the mandatory pre-restore snapshot; reducing this limit can make a valid roughly 40 MB SQLite database fail restore with `SQLITE_FULL` even when the host filesystem has ample capacity.

The named `longtail-data` volume contains the SQLite database, WAL/SHM sidecars, and local Files storage. The configured backup bind mount appears at `/var/backups/longtail-forge`; it is the protected destination for the [baseline backup CLI](backup-restore.md), the app-created `workspaces/` packages described in [Workspace Backup Package](workspace-backup.md), and operator recovery, not ordinary application downloads. Do not delete either location during image replacement.

## Docker backup-first upgrade and rollback

Use the versioned whole-instance archive from [Baseline Backup and Restore](backup-restore.md). A raw volume copy is not the supported backup format. Keep Caddy active so diagnostics remain truthful, assert the reviewed operator maintenance marker for ordinary traffic, and never run backup or restore while an app or worker can write the selected volume.

For every supported upgrade:

1. Record direct and public `/api/app-info`, the current immutable image digest, Compose configuration, data-volume identity, schema/migration identity, scanner readiness, and last-known-good release. Pause writes and assert maintenance; `/healthz`, `/readyz`, and `/api/app-info` remain proxied, while ordinary traffic receives the hardened `503` page.
2. Stop the app without deleting its volume. Create the complete backup with the current image, then inspect the archive and its sidecar. When encrypted Secure Notes exist, mount the separately protected key-backup proof read-only; never copy the key into the data volume, backup archive, image, or repository:

   ```sh
   docker compose stop longtail-forge
   docker compose run --rm \
     --volume /protected/secure-notes-key.backup:/run/secrets/secure-notes-key.backup:ro \
     longtail-forge node scripts/backup.mjs create \
     --confirm-stopped \
     --database /var/lib/longtail-forge/longtail-forge.db \
     --files-root /var/lib/longtail-forge/files \
     --output /var/backups/longtail-forge/pre-upgrade-<utc>.ltfbackup.tgz \
     --secure-notes-key-backup /run/secrets/secure-notes-key.backup

   docker compose run --rm \
     --volume /protected/secure-notes-key.backup:/run/secrets/secure-notes-key.backup:ro \
     longtail-forge node scripts/backup.mjs inspect \
     --archive /var/backups/longtail-forge/pre-upgrade-<utc>.ltfbackup.tgz \
     --secure-notes-key-backup /run/secrets/secure-notes-key.backup
   ```

3. Obtain and inspect the reviewed candidate digest without overwriting or deleting the prior image. Change only `LONGTAIL_IMAGE`, validate the resolved configuration, and force-recreate the app against the same data volume. Normal startup alone owns forward migrations:

   ```sh
   docker compose config --quiet
   docker compose up -d --no-deps --force-recreate longtail-forge
   docker compose ps
   ```

4. While maintenance remains active, require container health, direct and public health/readiness, exact candidate `/api/app-info`, database integrity and migration identity, login/session, workspace access, scanned File upload/read/download, and the representative workflow. Clear only the operator marker after all proof passes. Record old/new digests, artifact checksum, volume, backup ID/checksum, applied migrations, commands, checks, operator, timestamps, and decision.

If verification fails, keep maintenance active and stop the candidate. Selecting the prior image is an image-only rollback and is permitted only when the release record explicitly proves every migration applied by the candidate is backward-compatible. Absence of that complete record means restore is mandatory. Never reverse migrations by hand, edit migration history, or combine an older database with newer Files.

For the default migration-incompatible or unproven case, retain the failed upgraded volume and both images. Select the prior digest and a new, empty recovery-volume name in `.env`; do not attach two app containers to either volume. Start the prior image once to initialize the clean recovery volume, stop it, then restore the verified pre-upgrade database and Files together:

```sh
docker compose config --quiet
docker compose up -d --no-deps --force-recreate longtail-forge
docker compose stop longtail-forge

docker compose run --rm \
  --volume /protected/secure-notes-key.backup:/run/secrets/secure-notes-key.backup:ro \
  longtail-forge node scripts/backup.mjs restore \
  --confirm-stopped \
  --confirm-destructive "RESTORE LONGTAIL FORGE BACKUP" \
  --archive /var/backups/longtail-forge/pre-upgrade-<utc>.ltfbackup.tgz \
  --database /var/lib/longtail-forge/longtail-forge.db \
  --files-root /var/lib/longtail-forge/files \
  --pre-restore-backup /var/backups/longtail-forge/pre-rollback-restore-<utc>.ltfbackup.tgz \
  --secure-notes-key-backup /run/secrets/secure-notes-key.backup

# Required compatibility normalization when the selected prior image is 0.33.28.1.
# It is harmless but redundant with the 0.33.28.2 and later restore utility.
docker compose run --rm longtail-forge node -e \
  "require('node:fs').chmodSync('/var/lib/longtail-forge/files', 0o700)"

docker compose up -d --no-deps --force-recreate longtail-forge
```

Inspect the automatically created pre-restore archive, then repeat the full health/readiness/identity/schema/login/workspace/Files/workflow acceptance against the prior version before clearing maintenance. Confirm candidate-only mutations are absent and the baseline database plus Files are present together. Retain the failed upgraded volume, original/pre-restore archives and sidecars, both image digests, provenance, and recovery-key material through the observation period. A failed restore, startup, identity, or workflow check stays curtained; do not improvise a mixed-state recovery.

`npm run container:smoke` is the required native `linux/amd64` acceptance for this lifecycle. It performs two clean controlled-artifact image builds, validates Compose and hardening, uses a real Caddy process and protocol-level scanner fixture, creates authenticated workspace/workflow/File state, proves stop/start persistence, creates and inspects a real backup, observes a scanner-unready candidate restart, upgrades by force-recreation, restores into a clean recovery volume, and proves restored rollback plus SQLite integrity and migration identity. Missing Docker/native architecture is a failed prerequisite, never a passing skip.

## Proof commands and limits

Run `npm run artifact:smoke` for the clean controlled-payload install/boot proof. Run `npm run container:smoke -- --artifact dist/longtail-forge-<version>.tgz --release-metadata dist/release-metadata.json --previous-artifact dist/longtail-forge-<previous-version>.tgz --pull` for the native clean image build, `better-sqlite3` load, non-root/read-only boot, persistence, replacement, health/readiness, backup-first upgrade rehearsal, and restored rollback rehearsal. The Docker server must itself report `linux/amd64`; absence of an engine, an unsupported architecture, or emulation-only execution is a failed prerequisite, not a passing skip.

For the exact public-demo repository candidate, run `npm run demo:release-candidate:smoke -- --source-branch main --container --pull`. It executes the existing demo account/permission/identity/Files/capability/budget/content/perimeter/reset/scheduler/isolation contract owners, builds and boots the same runtime artifact, and passes that artifact to the supported native container lifecycle smoke. It does not deploy `rt-ltf-demo`, exercise the public edge, or authorize publication; those remain the live release gate.

These rehearsals use disposable data and may compare two images built from supplied previous/current artifacts. They prove packaging and operational mechanics, not external penetration testing, public DNS/certificate issuance, production ClamAV deployment, backup completeness, cross-version downgrade safety, or invitation readiness.
