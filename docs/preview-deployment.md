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

The checked-in Dockerfile does not copy the repository. `.dockerignore` denies everything except the Dockerfile and generated `dist/*.tgz` payload, and the build helper verifies the adjacent artifact checksum before placing that exact tarball in the builder. A disposable builder stage installs Python 3, `make`, and `g++`, then installs the artifact's pruned shrinkwrap with `npm ci --omit=dev`; the runtime filesystem stage copies only the root-owned read-only installed application tree and runs as UID/GID 10001 without the native build toolchain or repository development dependencies. The published stage carries that filesystem as one layer, described below. The installed runtime does not need `.git`.

The default base is the immutable digest for the official `node:24.22.1-bookworm-slim` image, including the October 2026 Node security fixes. Development and CI use the same version through `.nvmrc`; package metadata requires Node 24.22.1 or later within Node 24. The helper fixes the build to `linux/amd64`, verifies the built image reports that platform, and adds the exact version, AGPL license, source branch, full revision, runtime-artifact checksum, and platform labels. For a release candidate, bind the already-created release metadata to the same artifact:

```sh
npm run container:build -- --artifact dist/longtail-forge-<version>.tgz --release-metadata dist/release-metadata.json --tag longtail-forge:<version> --no-cache --pull
```

The build writes adjacent retained JSON provenance containing the source revision, source branch, application version, runtime-artifact checksum, resolved base reference/digest, `linux/amd64` platform, local content-addressed image digest, and reviewed labels. The protected promotion workflow retains that record for 30 days. Local provenance is build evidence only. The manual release workflow is the publication authority: it builds the exact protected `main` revision, pushes one `linux/amd64` GHCR image index, attaches registry-attached SPDX SBOM and SLSA provenance attestations, pulls the published digest, refuses it if any layer carries a whiteout, and executes `better-sqlite3` from that digest on native `linux/amd64`. A release candidate without matching release metadata or either native proof is not qualified.

The image starts `node server.js` directly as the container process, which is the same entrypoint beneath the unchanged development/test `npm start` contract. It has no compiler, test runner, browser harness, regression tooling, source checkout, `.env`, live data, backup, or Caddy process.

- **No JavaScript package manager.** As of 0.33.33.50 the runtime filesystem stage removes the base image's npm, npx, corepack, and yarn, and the build fails if any of them remains. Nothing in the running container uses a package manager: dependencies are installed in the builder, and the app, worker, backup, and public-demo tools run under `node`. Run the shipped operator tools as `node scripts/<tool>.mjs`, not `npm run`.
- **Debian security updates.** The runtime filesystem stage also upgrades, at build time, the installed Debian packages whose security fixes the pinned base predates. It upgrades each to an exact version from `bookworm-security`: `perl-base` `5.36.0-7+deb12u4` (DLA-4821-1), `libpcre2-8-0` `10.42-1+deb12u2` (DLA-4816-1), `tzdata` `2026f-0+deb12u1` (DLA-4867-1), and `apt` with `libapt-pkg6.0` `2.6.2` (DLA-4880-1). It installs no new package, performs no whole-system upgrade, and fails unless every installed version matches. When Debian supersedes one of these versions, or the base is refreshed, change the list through a reviewed qualification: a pin that Debian no longer publishes fails the build rather than drifting.
- **One filesystem layer, no whiteouts.** As of 0.33.33.51 the published `runtime` stage is a `scratch` stage that copies the whole `runtime-filesystem` stage as one filesystem layer. BuildKit adds only an empty layer for `WORKDIR`.
  - **Why.** A layer that removes a lower layer's files records whiteouts: `.wh.<name>`, or `.wh..wh..opq` for a directory's whole contents. Some Docker storage cannot apply them, and the preview host's could not unpack `v0.33.33.50`.
  - **The gate.** `npm run container:build`, and image publication after its pull, refuse an image whose layers carry either kind. `node scripts/release/image-layers.mjs <image>` reports each layer.
    - **How it reads layers.** The inspection names each entry by Go's tar rules, as Docker and containerd read layers. An empty PAX value keeps the header's, a GNU long name overrides a PAX path, and header-only entries carry no data. A whiteout is judged by the base name of the cleaned path.
    - **What it refuses.** It refuses a layer it cannot read unambiguously, rather than passing it. That covers broken framing, repeated or global metadata, sparse entries, entry types containerd does not unpack, and zstd layers.
  - **The restated settings.** A scratch stage inherits nothing. The published stage therefore restates the base image's `PATH`, `NODE_VERSION`, `YARN_VERSION`, and `ENTRYPOINT`, and every setting of `runtime-filesystem` in the same order. Change a setting in both stages together.
  - **The proof.** `node scripts/release/runtime-image-equivalence.mjs --artifact <tgz> [--release-metadata <json>] [--candidate <image>]` builds `runtime-filesystem` with the image's build arguments, from the same builder and cache as the candidate. The native lifecycle qualification runs it on every proposed image.
    - **What it compares.** It applies each image's layers in order, as containerd does, and compares the resulting image-owned filesystems. Every path must match in type, mode, ownership, size, content hash, link target, device numbers, hard-link group, and the bytes of each extended attribute.
    - **The cross-check.** It compares Docker's export of each image by the same fields, and every configuration field.
    - **What it does not compare.** Modification times and owner names.
    - **What it refuses rather than models.**
      - **Parents.** An entry whose parent is missing or is a symlink.
      - **A hard link to a symlink.** containerd's mode change uses `Lstat` and skips symlinks, so it does not follow one. The check refuses this form because it does not model how a link header's metadata applies to a symlink target.
      - **A hard link that changes its file.** Its header must repeat its target's mode, ownership, and attributes, because containerd applies those fields to the shared file.
    - **The cache precondition.** A reference built without the candidate's cache differs in its Debian-generated files, and is reported as different.
- **System archive tools stay.** The system `tar` and `gzip` remain, because archive creation, inspection, backup, and restore use them. Changing `NODE_IMAGE` or the platform is a reviewed qualification change, not an ordinary deployment toggle.

## Immutable image publication and constrained transport

The maintained public release transport is GHCR. `.github/workflows/manual-release.yml` receives the repository-scoped ephemeral `GITHUB_TOKEN` with only `contents: write` and `packages: write`, authenticates with `--password-stdin`, and publishes `ghcr.io/<owner>/<repository>:sha-<full-main-commit>`. That commit tag is a discovery label, not a deployment reference. The workflow and host always select `ghcr.io/<owner>/<repository>@sha256:<image-index-digest>`; `latest`, a version tag without its digest, an unverified local image ID, a Nightly image, and a non-`main` source are rejected.

`npm run image:publish -- publish ...` consumes the checksummed runtime artifact and schema-1 source metadata, builds with BuildKit provenance and SBOM attestations, publishes exactly `linux/amd64`, and emits two release records:

- `release-metadata.json` schema 2 binds the protected `main` commit, runtime-artifact filename and SHA-256, GHCR repository/index digest/reference, exact `linux/amd64` platform-manifest digest, image config digest, native `better-sqlite3`/SQLite execution result, and attached SPDX/SLSA attestation manifests.
- `platform-manifest.json` is the standalone machine-readable platform/image proof. The GitHub Release retains it beside the schema-2 metadata, checksummed runtime payload evidence, Compose file, protected environment examples, and reviewed deploy/reset host helpers. The tarball remains the controlled Docker build input and provenance asset; it is not advertised or accepted as a production installer.

The release workflow never receives host access or application secrets. The manual preview workflow never receives registry write authority and does not rebuild or transfer the runtime tarball. It checks out the exact selected `main` commit, downloads that version's immutable GitHub Release metadata, requires the operator-supplied image digest to match, and sends only the verified metadata through pinned-host, batch-mode SSH to the non-interactive deployment account. The account may write only its private inbox and may invoke only the reviewed root-owned Compose helper through the exact `sudo -n` rule. It has no root login, interactive shell, Docker socket access, registry credential, Caddy administration, data/backup read access, runtime-secret access, or general-purpose runner.

Install `scripts/release/longtail-forge-compose-deploy-host.example` as `/usr/local/sbin/longtail-forge-compose-deploy`, root-owned and non-writable. Install [longtail-forge-compose-deploy-helper.env.example](longtail-forge-compose-deploy-helper.env.example) as `/etc/longtail-forge/compose-deploy-helper.env` with `root:root` ownership and mode `0600`, and configure the workflow's `COMPOSE_DEPLOY_HELPER` variable to that exact path. Keep a preview environment disabled whenever its exact host, credentials, URL, data, scanner, backup, restore, rollback, or recovery evidence is incomplete.

One installed helper deploys, rolls back to, and recovers several releases. As of 0.33.33.50 it therefore accepts native SQLite profiles from a reviewed set, `NATIVE_DEPENDENCY_PROFILES`, rather than one driver version. Each profile is a `better-sqlite3:SQLite` pair. The set holds the current release's pin and each previous known-good release that rollback may still select.

What the helper checks, in order:

1. **Before any pull**, it refuses metadata unless its native proof records a published-digest `linux`/`x64` execution of a reviewed profile.
2. **After the pull, before the deployment marker**, it runs the selected digest natively, without network or privileges, and refuses any disagreement with that proof.
3. **The resolved Compose `DEMO_MODE` must be exactly `true` or `false`.** A missing or other value is refused before the curtain. The application treats several spellings as true, so the helper accepts no other value. The friends-and-family preview must resolve `false`.
4. **Requests that need no image are refused before any pull or curtain.** These are a rollback target that differs from the recorded previous release, a missing recorded baseline or rollback backup, and a missing Secure Notes recovery-key backup.

Before deploying a release whose profile the installed copy does not list, reinstall the helper from that reviewed release's `longtail-forge-compose-deploy-host.example` asset. First verify the asset against the SHA-256 digest GitHub publishes for that release asset, and check its LF line endings and `bash -n` syntax. Keep `/etc/longtail-forge/compose-deploy-helper.env` as it is, and never edit the profile list on a host.

Only on the exact `rt-ltf-demo` host, install the same reviewed release's reset, scheduler, alert, and isolation helpers as `/usr/local/sbin/longtail-forge-public-demo-reset`, `/usr/local/sbin/longtail-forge-public-demo-reset-scheduler`, `/usr/local/sbin/longtail-forge-public-demo-reset-alert`, and `/usr/local/sbin/longtail-forge-public-demo-isolation`, all root-owned and non-writable. Install the reviewed oneshot service and timer under `/etc/systemd/system/`, and the root-only scheduler environment example as `/etc/longtail-forge/public-demo-reset-scheduler.env`. The reset consumes the protected Compose helper environment plus the optional root-only `LTF_DEMO_ROLE_CREDENTIALS` path and shares `$LTF_DEPLOY_ROOT/compose-operation.lock` with deploy and rollback so two lifecycle promoters cannot overlap. Both helpers read `LTF_DEPLOY_ROOT` from the same `/etc/longtail-forge/compose-deploy-helper.env`, so the lock defaults to `/var/lib/longtail-forge-compose-deploy/compose-operation.lock`. Set `LONGTAIL_RESTART_POLICY=no` and `LONGTAIL_DNS_SERVER=127.0.0.1` only for this exact demo. Create its dedicated bridge without Docker's internal-network flag, disable IP masquerading, and require the isolation helper's first-position stateful-return/default-deny policy plus realized loopback publication before startup. A reboot therefore leaves the container stopped until a protected deploy or reset re-establishes the firewall, and Docker's embedded resolver cannot forward visitor-influenced names. Normal production Compose retains its default `unless-stopped` restart and `127.0.0.11` resolver behavior. None of these boundaries is available to the constrained deployment SSH account, app/worker startup, or an in-process timer.

The timer runs at the top of every UTC hour and deliberately uses `Persistent=false`, so host downtime skips missed runs rather than causing catch-up reset bursts. The host-only `LTF_PUBLIC_DEMO_RESET_ENABLED=false` switch safely records a disabled skip; it is not an Admin setting or application configuration. Scheduled and scheduler-wrapped manual invocations use the same reset entry and shared Compose operation lock. Lock contention fails without mutation and invokes the bounded failure alert; reset failures report whether the prior unit is healthy or the maintenance curtain remains. The root-private bounded JSONL evidence includes correlation, trigger, scheduled boundary, duration, lock outcome, fingerprint, health, failure class, rollback, recovery, and alert outcome without application output, credentials, content, sessions, secrets, or private paths. See [Public Demo Compose Reset](demo-data-operations.md) for exact install, enable/disable, manual, downtime, alert-routing, and recovery commands.

The host's root Docker client authenticates to GHCR separately with one pull-only credential scoped to the Longtail Forge package. Store it only in root's Docker credential store or a reviewed credential helper—never in GitHub Actions, the helper environment, Compose application environment, image layers, metadata, the deployment inbox, or the deployment account. Rotation is additive: install the replacement, prove an exact digest pull, then revoke the old credential. Revoke immediately on suspected disclosure and keep `DEPLOY_ENABLED=false` until a replacement digest pull and helper preflight pass. Package deletion, administration, repository write, and owner-wide scopes are not required for the host.

The root helper validates schema-2 metadata and the pulled labels, then requires the recorded known-good Compose baseline established by the live cutover in 0.33.28.4; it refuses to treat an unrecorded first install or data volume as an automated upgrade. For a recorded baseline it asserts the deployment-owned maintenance marker, stops only the Compose app, creates and inspects the whole-instance backup, selects the new digest, starts and verifies direct/public identity, and clears only its marker. Failed candidate verification restores the prior database and Files together with the prior digest; explicit rollback first protects the current state and restores the recorded previous backup. A failure or signal behind the curtain but before any data change restarts the current release unchanged, and clears the marker only once its direct and public identity verify. Such failures include a protected backup that cannot be created or inspected, and a state record the next step cannot read. Every other failure behind the curtain stays curtained, with the images, backups, metadata, and operation evidence retained for the operator: a failed restore, a recovery or restart that does not verify, or a failure after the new release has verified. The operator marker remains independent.

**The public demo's deployment-backup bound.** On the demo, each deployment backup keeps the visitor-entered content of its moment.
- **What stays.** After a deploy or rollback verifies and its states are recorded, the helper keeps only the backup that `previous.json` names as `rollbackBackup`, with its sidecar.
- **What goes.** Every other `pre-upgrade-`, `pre-rollback-`, `pre-restore-`, and `pre-compose-cutover-` backup and sidecar.
- **The checks.** Each must be a plain file with one name, owned by the backup root's owner. Any other entry under those names, or any failed check, refuses the whole bound, and nothing is removed. The helper then exits non-zero, saying that the release is live and recorded, so the workflow shows the refusal.
- **A removal that fails part-way** is reported by how many files had gone, never as nothing removed. The kept backup is untouched. Archives go before sidecars, so what is left is still checked, and the next verified deploy or rollback finishes the bound. The helper exits non-zero in the same way.
- **The report.** The final line names the kept backup and the number of files removed, as `deploymentBackups`.
- **The preview** keeps every deployment backup, and the reset's own backups are never touched.

## Docker Compose installation

1. Install a supported `linux/amd64` Docker Engine with Compose v2. Copy [compose.env.example](compose.env.example) to the protected root `.env`, set `LONGTAIL_IMAGE` to the exact `repository@sha256:<image-index-digest>` bound by schema-2 release metadata, replace the hostname and required secrets, and keep `.env` mode `0600` on POSIX. Keep application secrets in the separate root-only environment named by `LONGTAIL_ENV_FILE`; double every literal `$` when Compose interpolation must pass a dollar-bearing value unchanged, and do not use raw env parsing that preserves surrounding quotes as value data. Confirm the same metadata names one `linux/amd64` platform manifest plus native `better-sqlite3`, SPDX SBOM, and SLSA provenance evidence. A mutable `latest` tag is never a deployment identity.
2. Create the named local data volume on local block-backed storage and the separate backup directory before startup. The data volume must be private to this one app container; do not place it on NFS, SMB, cloud-synced folders, or object-storage mounts. On Linux, make the backup directory owner-only and writable by container UID/GID 10001 plus the authorized recovery operator. Keep backup exports and the Secure Notes key backup outside the data volume and protect them separately.
3. Confirm the chosen `172.30.17.0/24` bridge does not overlap the host, VPN, LAN, or another Docker network. If it does, change the subnet, gateway, and `LONGTAIL_DOCKER_TRUST_PROXY` together. Create and inspect this reviewed network before Compose; `compose.yaml` consumes it as an external network so lifecycle commands cannot silently replace its gateway or firewall identity. Trust only the exact bridge gateway `/32`. The exact public demo additionally uses its fixed internal bridge and root-owned isolation helper documented in [Public Demo Compose Reset](demo-data-operations.md); that boundary does not apply to local development or other self-hosted installs.
4. Run a real production `clamd` on the same host or another protected reachable address. The reviewed bridge gateway (`172.30.17.1:3310` by default) is the one-host Compose handoff; do not use Docker's ambiguous `host-gateway` alias or expose that port publicly. Prove a scanner `PING` before startup. Production startup fails closed when the scanner is absent or unhealthy. On a socket-activated ClamAV, install the reviewed `FreeBind` drop-in from [File Scanner Setup](file-scanner-setup.md#cold-boot): without it, the scanner cannot bind the gateway address during boot, before Docker creates it. The preview keeps Docker's `unless-stopped`, so after a boot its app retries until the scanner answers, and each failed start logs `application.startup.failed` with `component=scanner` and a bounded reason.
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

## Scheduled backups and the off-server copy

A Compose installation that is not the public demo backs itself up nightly, and can copy each backup, encrypted, to another server. The public demo never runs it. It resets hourly, so a nightly backup would have nothing to recover, and would keep visitor-entered content for days.

**What a nightly run does.** The timer runs `longtail-forge-scheduled-backup run --trigger scheduled` at 08:30 UTC. Its child holds the shared lifecycle lock, so it never overlaps a deploy, rollback, or reset.
1. **Refusals before the curtain.** Nothing is stopped when any of these fails.
   - **The installation.** The resolved `DEMO_MODE` must be exactly `false`. A held lock exits 75. A maintenance curtain that is already up is another operation's, and is never taken over.
   - **The running container** must be the one the deploy helper verified: its identity and posture are checked with the deploy helper's own predicate.
   - **What the backup would read.** The backup's steps run in one-off containers created from the resolved Compose configuration, not from the running container. So that configuration must name the recorded image, which must still be the running container's own local image, and give the data directory as one whole volume, the running container's own. On both sides, nothing else may be mounted at or beneath `/var/lib/longtail-forge`: no bind, volume, or tmpfs over the database or the Files tree, no volume subpath, and no mounts taken from another container. Otherwise a step could back up other data, such as a volume a recovery restored, while the running application is started again on its own. The steps never pull an image.
   - **A step container an earlier backup left** refuses the run, which names it. Its recovery could not prove it gone, it may still be writing, and it is never removed automatically: see [clearing a step container](#clearing-a-step-container-an-earlier-run-left).
2. **The backup.** Behind the deployment curtain, it stops the application, then takes and inspects the whole-instance backup in a staging directory under the backup root, `.scheduled-pending`. Only an inspected backup joins the others, as `scheduled-<UTC>-<commit>.ltfbackup.tgz` with its sidecar. An archive that never passed inspection, whatever stopped it, is never counted as a backup, and the next run discards anything an interrupted run left there. It then starts the stopped container again as itself, without pulling or recreating anything, and lowers the curtain once that container's identity and posture, and direct and public identity, verify. The outage lasts as long as a deploy's backup step.
3. **Time limits and recovery.** Every Docker call has a time limit of its own, inside its phase's: 5 minutes for the checks before the curtain, and two hours for the backup's own work, stopping, creating, and inspecting. A step that runs out is stopped.
   - **Recovery has its own 20 minutes,** never what is left of the backup's, and keeps the lifecycle lock. Four of them are kept for stopping the release, if it cannot be restarted and verified.
   - **Step containers.** Each step's one-off container carries a label with this run's own identity, and recovery removes only containers with that label, so a container the run did not start is never touched. The release is never started beside a step container that is not proved gone: it stays stopped, behind the curtain.
   - **Every recovery step is attempted.** One that fails, such as discarding the staged archive, never skips the next.
   - **A release that is not restarted and verified is stopped,** so an unverified container never serves, and the curtain stays up for the operator. The stop counts only once Compose lists no running container for the service. If Compose's stop does not show that, the container is killed and checked again. A stop that still cannot be shown is reported as such, never as a stop.
   - **Nothing outlives the run.** The backup runs in a process session of its own. Once it ends, anything left in that session is killed, so nothing still holds the lifecycle lock when the run reports. Each process's whole `/proc` record is read, because a command name may hold a newline, and a process is killed only while its start time and session still match.
   - **The run's backstop and the service's own four-hour limit** both exceed the checks, the backup's limit, recovery's, and the copy's together.
4. **Retention.** It keeps the 14 newest scheduled backups, by the time in each name, and always the one just made. Only exact scheduled names are considered: plain files with one name, owned by the backup root's owner. Any other entry under that prefix refuses retention, which then removes nothing. A removal that stops part-way reports how far it went, and the next run finishes it, including a sidecar whose archive was already removed. Deployment and reset backups are never touched.
5. **The copy hook.** It receives exactly the backup just inspected, after the curtain is down, so a slow copy never lengthens the outage.

**What it reports.**
- **Each run** appends one line to `$LTF_DEPLOY_ROOT/scheduled-backups.jsonl`, which keeps the last 400 runs. It records whether the curtain was left up.
- **When the local backup succeeds,** it sends a heartbeat to the operator's push monitor, so a monitor alerts when a night is missed. The heartbeat means only that a local backup was taken. A failed copy still sends it, and alerts on its own, so the heartbeat never proves an off-server copy.
- **On any failure,** it raises a Discord alert with mentions disabled, which says whether the curtain is up. That includes a refusal of the run's own configuration or files, which alerts by its class alone, with the reason in the journal. It also includes a backup that succeeded but whose retention or copy did not.
- **The failure classes:**
  - `configuration-refused`, `lifecycle-lock-contended`, `refused-public-demo`, and `backup-failed`, all before the curtain;
  - `backup-failed-recovered` and `backup-failed-unrecovered`, for a failed backup;
  - `backup-timed-out-recovered` and `backup-timed-out-unrecovered`, for a backup that ran out of its time;
  - `backup-killed`, when the backup was killed before any limit, by the kernel's out-of-memory killer or another signal. It is never reported as a timeout;
  - `backup-run-limit-expired`, when the run's backstop ended it;
  - `retention-failed` and `copy-failed`, after a successful backup.
  - **Added to a failed backup's class:**
    - `step-container-not-cleared`, when a step container could not be proved removed, so the release was not started. The journal names the run's operation, for [clearing it](#clearing-a-step-container-an-earlier-run-left);
    - `release-not-stopped`, when the release could not be proved stopped, and may still be running behind the curtain;
    - `staging-not-cleared`, when the staged archive could not be discarded.
  - **Added to any class:** `processes-swept`, when processes of the backup outlived it and were killed, or `processes-not-cleared`, when they could not be, and may still hold the lifecycle lock.
- **The URLs** live only in `/etc/longtail-forge/scheduled-backup-alert-webhook` and `/etc/longtail-forge/scheduled-backup-heartbeat-url`, root-only `0600` files of one line each, and reach `curl` on standard input. The operator supplies them directly to the host. They never enter the repository, a handoff, an issue, or any shared file.

**Install it, on that installation only.** The timer is enabled last, once a manual run, the first off-server copy, and the restore drill have passed, so no unattended run comes before them.
1. Install `scripts/release/longtail-forge-scheduled-backup-host.example` from the release's assets as `/usr/local/sbin/longtail-forge-scheduled-backup`, `root:root 0755`. Check its LF line endings and `bash -n` first, as for the Compose helper. It reads the same `/etc/longtail-forge/compose-deploy-helper.env`.
2. Install [longtail-forge-scheduled-backup.env.example](longtail-forge-scheduled-backup.env.example) as `/etc/longtail-forge/scheduled-backup.env`, `root:root 0600`. `LTF_SCHEDULED_BACKUP_ENABLED=false` records a skipped run and does nothing else. It names no copy hook: one that is named but not yet installed refuses every run, so it is set only in step 6.
3. Install the alert and heartbeat files.
4. Install the service and timer examples under `/etc/systemd/system/`, and run `systemctl daemon-reload`. Do not enable the timer yet.
5. Prove it once, in a quiet window: `longtail-forge-scheduled-backup run --trigger manual`. Then read the last line of the run log, the new archive, and the heartbeat.
6. Set up [the off-server copy](#the-off-server-copy), run one more manual backup, and decrypt and verify that copy on the operator's workstation.
7. Run the restore drill from a scheduled backup, into a disposable container and volume of the same release.
8. Only then run `systemctl enable --now longtail-forge-scheduled-backup.timer`, and confirm the first nightly run and its heartbeat. The timer uses `Persistent=false`, so a host that was down skips the missed run rather than backing up during boot. The late heartbeat reports it.

### Clearing a step container an earlier run left

A run that alerts `step-container-not-cleared` leaves its release stopped and unchanged, behind the curtain. Its journal names its operation. Every later run refuses until the container is cleared, under supervision:
1. **Hold the lifecycle lock** for the whole procedure, from a root shell: `flock --nonblock "$LTF_DEPLOY_ROOT/compose-operation.lock" bash`. It refuses while a deploy, rollback, reset, or backup holds the lock. Run every later step in that shell. A scheduled run meanwhile is refused as `lifecycle-lock-contended`.
2. **Establish what is there:** `docker ps --all --no-trunc --filter label=longtail-forge.scheduled-backup.operation --format '{{.ID}} {{.Names}} {{.State}}'`. Each container must be named `longtail-forge-scheduled-backup-<operation>-create` or `-inspect`, for the operation the journal names. Anything else is not this procedure's to remove: stop, and investigate it.
3. **Keep the evidence** in a root-only file outside any synchronized folder: that listing, and `docker logs` of each container. Never keep `docker inspect` output, which holds the application's environment.
4. **Stop and remove only those containers,** by ID: `docker stop --time 30 <ID>`, then `docker rm <ID>`. List them again: none may be left. Whatever a step left in `.scheduled-pending` is discarded by the next run.
5. **Restart and verify the release.**
   - **Start it as itself:** `docker compose --project-directory "$LTF_COMPOSE_DIR" --env-file "$LTF_COMPOSE_HOST_ENV" --env-file <the releaseEnv that state/current.json records> start longtail-forge`.
   - **Verify it** as after a deploy: `/healthz`, `/readyz`, and `/api/app-info`, both directly and through the public origin.
   - **Only then** remove the deployment marker, `$LTF_MAINTENANCE_STATE_ROOT/deployment/maintenance.on`.
   - **A release that does not verify** stays curtained, and is recovered from the protected backups like any other curtained failure.
6. **Leave the shell,** which releases the lock. Run `longtail-forge-scheduled-backup run --trigger manual` before the next nightly run.

### The off-server copy

The shipped hook, `longtail-forge-offsite-copy`, encrypts each copy with [age](https://age-encryption.org) to the operator's public key. This server holds only that public key, so neither it nor the destination can read a copy. A restore from an off-server copy needs the operator's private key, which never comes to either server.
- **On this server.** Install Ubuntu's `age` package. Install the hook from the release's assets as `/usr/local/sbin/longtail-forge-offsite-copy`, `root:root 0755`, and [longtail-forge-offsite-copy.env.example](longtail-forge-offsite-copy.env.example) as `/etc/longtail-forge/offsite-copy.env`, `root:root 0600`.
  - **The key.** Make a dedicated key, root-only, with `ssh-keygen -t ed25519 -N '' -f /etc/longtail-forge/offsite-copy/id_ed25519`.
  - **The destination's host key.** Pin it in the configured `known_hosts`, after checking its fingerprint against one read on the destination itself. Name the destination by its real address: a name that resolves elsewhere fails the pinned check.
  - **Turn it on** by setting `LTF_SCHEDULED_BACKUP_COPY_HOOK` to the hook.
- **On the destination.** Install `scripts/release/longtail-forge-offsite-receive-host.example` as `/usr/local/sbin/longtail-forge-offsite-receive`, `root:root 0755`. Create a dedicated account with a store directory it owns, mode `0700`. Give it exactly one `authorized_keys` line for this server's key: `restrict,command="/usr/local/sbin/longtail-forge-offsite-receive /srv/longtail-forge-offsite/<installation>" ssh-ed25519 ...`.
- **What the receiver allows.**
  - **Each copy** must be exactly its declared size, have its declared SHA-256, and be an age file. It is stored under a name the receiver chooses, from the receipt time, and is never overwritten.
  - **What the destination can check.** It holds only the encrypted copy, so it checks that copy's size, SHA-256, and age header, comparing the header's own bytes without reading the first line into memory. The archive inside is checked against its sidecar by the hook before encryption, and again by `sha256sum -c` after decryption at a restore.
  - **One receipt at a time,** for at most 30 minutes of streaming, the hook's own transfer limit. A stream that stalls, trickles, or never closes is cut off there, its partial copy is removed, and the store is released.
  - **Retention.** Copies older than 14 days are removed only when a later copy is stored, so the copies outlive an installation that stops sending.
  - **Its caps.** At most 20 copies, 3 a day, 2 GiB each, and 10 GiB in all, and every copy must leave 10 GiB of the disk free. Above a cap it refuses the new copy rather than evicting an old one, so a stolen key cannot push the good copies out or fill the destination's disk. The refusal fails the copy, which alerts.
  - **What a stolen key can still do:** delay copies, by holding the store for one receipt's limit at a time, or by using a day's three receipts. Each copy it delays fails that night's hook, which alerts.
- **Restore from an off-server copy,** on the operator's workstation, outside any synchronized folder. Fetch the copy with the operator's own access to the destination. Then run `age -d -i <private key> <copy> | tar -x`, and `sha256sum -c` against the archive's sidecar. Restore the archive through [Docker backup-first upgrade and rollback](#docker-backup-first-upgrade-and-rollback), with the release whose version its manifest records. Delete the decrypted files afterwards.

## Proof commands and limits

Run `npm run artifact:smoke` for the clean controlled-payload install/boot proof. Run `npm run container:smoke -- --artifact dist/longtail-forge-<version>.tgz --release-metadata dist/release-metadata.json --previous-artifact dist/longtail-forge-<previous-version>.tgz --pull` for the native clean image build, `better-sqlite3` load, non-root/read-only boot, persistence, replacement, health/readiness, backup-first upgrade rehearsal, and restored rollback rehearsal. The Docker server must itself report `linux/amd64`; absence of an engine, an unsupported architecture, or emulation-only execution is a failed prerequisite, not a passing skip.

For the exact public-demo repository candidate, run `npm run demo:release-candidate:smoke -- --source-branch main --container --pull`. It executes the existing demo account/permission/identity/Files/capability/budget/content/perimeter/reset/scheduler/isolation contract owners, builds and boots the same runtime artifact, and passes that artifact to the supported native container lifecycle smoke. It does not deploy `rt-ltf-demo`, exercise the public edge, or authorize publication; those remain the live release gate.

These rehearsals use disposable data and may compare two images built from supplied previous/current artifacts. They prove packaging and operational mechanics, not external penetration testing, public DNS/certificate issuance, production ClamAV deployment, backup completeness, cross-version downgrade safety, or invitation readiness.
