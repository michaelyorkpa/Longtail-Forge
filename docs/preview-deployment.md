# Docker and Bare-Metal Preview Deployment

This is the supported application deployment contract for the limited one-server private preview. Docker Compose is the primary reproducible path. A staged bare-metal installation from the same checksummed runtime artifact remains supported. Both paths keep the Node listener behind the host's Caddy 2 edge from [Reference Internet Deployment](internet-deployment.md); neither path exposes Node directly to the internet.

This document does not authorize invitations. The tested baseline backup/restore is defined in [Baseline Backup and Restore](backup-restore.md); the Docker-engine acceptance proof, remaining release gates, and manual security review are still required.

Repository promotion, immutable GitHub artifacts, and the maintained manual preview handoff are defined in [GitHub Workflow](development/github-workflow.md). That handoff uses a low-privilege SSH account with pinned host keys and passwordless sudo access to one reviewed root-owned helper, rather than a root SSH login or a general-purpose self-hosted runner. Where a GitHub-hosted runner requires an Internet-reachable SSH endpoint, that dedicated key-only port is restricted management-plane access, never Longtail Forge application ingress, and must not expose an interactive deployment shell, Node, Caddy administration, data, or runtime secrets. The helper preserves this document's stop, backup, stage, start, verify, and restore boundary. Its GitHub Environments start disabled until isolated hosts, credentials, URLs, data, and recovery materials exist and a real deployment/rollback exercise passes.

The root-owned deployment state directory uses mode `0711` so the deployment account can traverse only the known path to its own `0700` inbox; it cannot list the parent or read/write sibling state such as deployment history. The backup directory remains root-only `0700`. Do not make the deployment-state parent `0700`, because that prevents the pinned account from delivering an artifact to the nested inbox, and do not broaden it to a listable or group-writable directory.

Install the host helper from the LF-only tracked file. The repository pins `scripts/release/longtail-forge-deploy-host.example` to `eol=lf` because a CRLF shebang is not executable by Linux (`/usr/bin/env` would look for `bash\r`). Verify the staged file with `file` or an equivalent byte-level check before installing it as the root-owned helper; do not copy a differently normalized editor buffer.

## Shared boundary

- One Node application server, one local SQLite database, local Files storage, and either the inline worker or one same-host separate worker.
- Roughly 50 total users and typical active use around 5-15 concurrent users. No PostgreSQL service, horizontal scaling, hosted SaaS, high availability, or automatic updater.
- Caddy owns public TCP 80/443 and TLS. Node is reachable only through loopback port 8001. The fixed Docker bridge gateway is the immediate peer trusted by the containerized app.
- Application data and Files content live together under one durable private data root. Backups live at a separate path and are never served from `public/`.
- SQLite data must use a local Docker volume or local block filesystem. Do not place the database or WAL/SHM sidecars on NFS, SMB, cloud-synchronized folders, object-storage mounts, or a volume shared by multiple app containers.
- Real `.env` files, secrets, databases, Files data, backups, logs, and release credentials never enter the image or source control.

## Docker image build

The checked-in Dockerfile does not copy the repository. It receives one exact versioned runtime tarball produced with an explicit source branch (`npm run artifact:build -- --source-branch main` for preview candidates), installs its pruned shrinkwrap with `npm ci --omit=dev`, makes the application tree read-only, and runs as UID/GID 10001. Deployment supplies the same branch through `LONGTAIL_RELEASE_BRANCH`; the installed runtime does not need `.git`. Its default base is the immutable multi-platform digest for the official `node:24.18.0-bookworm-slim` image; changing that `NODE_IMAGE` build argument is a reviewed runtime-base change, not an ordinary deployment toggle. Build through the helper so the current artifact path, checksum, image label, and tag stay aligned:

```sh
npm run container:build -- --tag longtail-forge:0.33.17.3
```

Use `--no-cache --pull` for the clean release-candidate build. The image starts `node server.js` directly as the container process, which is the same entrypoint beneath the unchanged `npm start` contract. It has no compiler, test runner, browser harness, regression tooling, source checkout, `.env`, live data, backup, or Caddy process.

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

## Bare-metal installation

Use a dedicated non-interactive `longtail-forge` account. Keep immutable releases under `/opt/longtail-forge/releases/<version>`, a `current` symlink to the selected release, protected configuration under `/etc/longtail-forge`, durable data under `/var/lib/longtail-forge`, and backups outside that tree. The service account owns only its data root; release files stay root-owned and read-only.

1. Verify the versioned artifact SHA-256 sidecar, extract into a new release directory, and run `npm ci --omit=dev` there. Never `git pull` or extract over the live release.
2. Copy [longtail-forge.service.example](longtail-forge.service.example) to `/etc/systemd/system/longtail-forge.service`, review every path, set `HOST=127.0.0.1` and `PORT=8001` in the protected environment, then enable/start the service. Keep Node behind the selected reviewed edge from [Reference Internet Deployment](internet-deployment.md): either direct Caddy or the exact Nginx -> WireGuard -> Caddy chain.
3. Verify direct and proxied health/readiness/version, login/session, workspace access, Files access, and one representative workflow.

For an upgrade, record the current symlink target and version, pause traffic, take and verify the complete backup, stage and install the new artifact in a new release directory, stop the service, atomically repoint `current`, start, allow normal migrations, and run the full verification above. If verification fails, stop the candidate. Repoint to the prior release only when migration rollback compatibility is proven; otherwise restore the complete pre-upgrade backup into an isolated recovery data path, point the prior release at that restored path, verify, and deliberately promote it. Keep the previous release and backup until the candidate has passed the observation period.

## Proof commands and limits

Run `npm run artifact:smoke` for the clean runtime artifact install/boot proof, `npm run bare-metal:smoke -- --previous-artifact dist/longtail-forge-<previous-version>.tgz` for the staged bare-metal upgrade/restored-rollback rehearsal, and `npm run container:smoke -- --previous-artifact dist/longtail-forge-<previous-version>.tgz --pull` for the clean image build, non-root/read-only boot, persistence, replacement, health/readiness, backup-first upgrade rehearsal, and restored rollback rehearsal. The Docker proof requires a working local Docker Engine; absence of an engine is a failed prerequisite, not a passing skip.

These rehearsals use disposable data and may compare two images built from supplied previous/current artifacts. They prove packaging and operational mechanics, not external penetration testing, public DNS/certificate issuance, production ClamAV deployment, backup completeness, cross-version downgrade safety, or invitation readiness.
