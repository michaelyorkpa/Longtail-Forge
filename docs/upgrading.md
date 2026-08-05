# Upgrading Longtail Forge

Upgrades are manual, immutable replacements. Longtail Forge has no in-app updater and does not overwrite the running application tree.

Docker Compose is the sole supported production/self-hosted upgrade and recovery path. Follow the complete [Docker backup-first upgrade and rollback procedure](preview-deployment.md#docker-backup-first-upgrade-and-rollback). Direct Node/systemd production upgrades and the former runtime-artifact host helper are retired.

Qualify the maintained host path with `npm run maintenance:rehearse` on native Linux before using it for a release. Retain the exact revision, tool versions, timestamps, result, and protected failure references in the private operational record. The rehearsal proves the disposable install/toggle, response-owner, deploy/recovery, rollback, and stale-state transitions without a proxy reload; it does not replace the real backup, certificate, firewall, WireGuard, or release-identity evidence below.

1. Select an exact protected `main` commit or immutable release tag and verify schema-2 release metadata binds its runtime-artifact SHA-256, GHCR image-index digest, one `linux/amd64` platform manifest, native `better-sqlite3` execution, and attached SPDX/SLSA evidence.
2. Read the release notes, migration implications, backup compatibility, and security limitations.
3. Stage the new immutable image digest without changing the prior one and verify its retained release/image provenance.
4. At the reviewed edge, assert the operator hold or let the constrained Compose helper assert its independent deployment marker. Keep Caddy running, stop the Compose app, then create and inspect the whole-instance backup described in [Backup and Restore](backup-and-restore.md).
5. Switch to the candidate and let only its normal startup migration path run. Do not edit applied migrations or reverse them manually.
6. Verify direct readiness plus public `/healthz`, `/readyz`, schema/migration identity, and `/api/app-info`. The version, exact commit SHA, and artifact checksum must match the selected release metadata; independently inspect the running container's image-index/platform digests. The helper clears only its deployment marker after those checks; a pre-existing operator hold remains active. Run representative login, Files, and Secure Notes checks before independently restoring any remaining operator-held traffic.
7. Retain the prior runtime, backup and sidecar, release metadata, and separate Secure Notes recovery material through the observation period.

If verification fails, the Compose helper stops the candidate, restores the pre-upgrade database and Files backup together, reselects the prior digest, and starts the prior release. It clears only the deployment marker after direct and public readiness plus exact prior identity succeed; the candidate attempt still returns failure. A restore failure, prior-release startup/identity failure, or interruption stays curtained with protected root-only operation evidence and every recovery unit retained.

An explicit Compose rollback also keeps Caddy active. It asserts the deployment marker before stopping the container, captures an inspected backup of the current database and Files, restores the recorded previous backup with that release's metadata, and changes deployment state only after exact direct and public target verification. Target restore/start/identity failure restores the newly captured current backup and digest; failed current recovery keeps both recovery units and root-only operation evidence curtained. See [GitHub Workflow](development/github-workflow.md).
