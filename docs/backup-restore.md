# Baseline Backup and Restore

Longtail Forge provides a CLI-first whole-instance backup for the supported one-server SQLite and local Files-storage deployment. The backup is a recovery artifact, not an ordinary download, source package, database-only copy, or substitute for the separately protected Secure Notes key.

This document owns whole-instance recovery. The administrator-created, non-destructive one-workspace extract is a separate format and procedure documented in [Workspace Backup Package](workspace-backup.md).

This baseline supports only `LONGTAIL_DATABASE_PROVIDER=sqlite` and `LONGTAIL_STORAGE_PROVIDER=local`. It does not claim PostgreSQL dumps, S3/object downloads, multi-server snapshots, continuous point-in-time recovery, or unattended retention automation.

## Backup format

Each `*.ltfbackup.tgz` archive has an adjacent required `*.sha256` sidecar and one fixed root directory:

```text
longtail-forge-backup/
  manifest.json
  checksums.json
  database/longtail-forge.db
  files/...
```

`manifest.json` records:

- backup format and format version, UUID, UTC creation timestamp, and application version;
- SQLite provider plus every applied migration identity/checksum and the latest migration;
- local storage provider, restore layout, local object/reference counts and bytes, and external-record count;
- encrypted Secure Note/revision counts and key versions, with `masterKeyIncluded: false`;
- whether separate key recovery is required and was confirmed at creation;
- safe runtime classifications only: environment, worker mode, scanner mode, SQLite journal mode, and foreign-key posture;
- an explicit inclusion and exclusion inventory.

`checksums.json` contains a SHA-256 for the manifest, consolidated SQLite database, and every local Files object. The sidecar checksums the compressed archive itself. Runtime secrets, `.env`, credentials, the Secure Notes master key, logs, caches, process state, application binaries/source, external storage objects, and provider credentials are excluded.

## Secure Notes recovery prerequisite

The CLI counts encrypted Notes and revisions in the database. When any exist, creation and restore require:

```text
--secure-notes-key-backup <separately-protected-file>
```

That file must exist, be non-empty, be owner-only on POSIX, and stay outside the live data tree, Files root, ordinary backup directory, and public paths. The CLI verifies only the separate recovery prerequisite; it never reads, copies, hashes, names in the manifest, or packages the key file. Store it through a distinct protected recovery channel. Losing it can make otherwise valid encrypted content unrecoverable.

Without that prerequisite, a backup containing encrypted records is reported as not fully restorable and restore is refused.

## Create and verify

Stop Caddy traffic, the app, and any separate worker before creating the baseline backup. This conservative boundary prevents database and Files writes from crossing the snapshot. Then run:

```sh
npm run backup:create -- \
  --confirm-stopped \
  --database /var/lib/longtail-forge/longtail-forge.db \
  --files-root /var/lib/longtail-forge/files \
  --output /var/backups/longtail-forge/longtail-forge-<version>-<utc>.ltfbackup.tgz \
  --secure-notes-key-backup /offline-or-secret-store/secure-notes-key.backup
```

`--database` and `--files-root` default to the same `LONGTAIL_*` environment paths used by the app. If there are no encrypted records, omit the key-backup option. The command refuses overwrite, public/static paths, backup paths inside live data, unsupported internal storage providers, links/special files, missing referenced Files objects, mismatched Files sizes/hashes, a failed SQLite integrity check, missing migration identity, or a missing Secure Notes recovery prerequisite.

It produces the archive and sidecar with restrictive permissions, appends a structured event to `backup-operations.jsonl`, and writes a forced `instance_backup_created` security event for every workspace. It never deletes older backups automatically.

Verify before moving or using it:

```sh
npm run backup:inspect -- \
  --archive /var/backups/longtail-forge/<backup>.ltfbackup.tgz \
  --secure-notes-key-backup /offline-or-secret-store/secure-notes-key.backup
```

Inspection verifies the sidecar, entry types and paths, archive/control-file shape, exact file inventory, all internal checksums, SQLite integrity, migration identity, application-version compatibility, provider compatibility, and Secure Notes counts. It rejects absolute paths, traversal, duplicates, links, special entries, unexpected files, corrupt content, unsupported format/provider/version, or a database/manifest mismatch before any destination is changed.

## Controlled export; no web download

There is no browser or web-admin backup download route. Archives never enter `public/`, Files downloads, caches, or ordinary workspace permissions. Use the validated operator export command when copying a backup to protected removable/off-host storage:

```sh
npm run backup:export -- \
  --archive /var/backups/longtail-forge/<backup>.ltfbackup.tgz \
  --output /protected-off-host/<backup>.ltfbackup.tgz \
  --secure-notes-key-backup /offline-or-secret-store/secure-notes-key.backup
```

The command revalidates the archive, refuses overwrite/public destinations, copies the archive and sidecar together with restrictive permissions, and records `backup_exported` in the operator audit log. Any copy outside this command must be covered by the host or storage system's access audit; an ordinary workspace administrator never gains a backup-download capability.

## Destructive restore

Restore supports a backup created by the exact running application version. Future releases must deliberately expand the compatibility rule before restoring older application identities and running forward migrations. Never hand-edit the manifest, checksums, database, or migration history.

Stop Caddy traffic, the app, and any separate worker. Keep the original archive, sidecar, and separate Secure Notes key backup intact. Restore into an existing installation with:

```sh
npm run backup:restore -- \
  --confirm-stopped \
  --confirm-destructive "RESTORE LONGTAIL FORGE BACKUP" \
  --archive /var/backups/longtail-forge/<backup>.ltfbackup.tgz \
  --database /var/lib/longtail-forge/longtail-forge.db \
  --files-root /var/lib/longtail-forge/files \
  --pre-restore-backup /var/backups/longtail-forge/pre-restore-<utc>.ltfbackup.tgz \
  --secure-notes-key-backup /offline-or-secret-store/secure-notes-key.backup
```

Before replacement, the command performs the complete validation above and creates/verifies the new pre-restore backup. It stages the restored database and Files separately, moves the current database (including WAL/SHM sidecars) and Files tree aside, promotes both restored components, rechecks database integrity/migration identity, and writes both operator and workspace security audit events. If promotion or verification fails, it restores the moved-aside database and Files tree together. It never reverses migrations or combines database and Files state from different snapshots.

## Post-restore acceptance and failed-restore recovery

After the CLI succeeds:

1. Confirm the separately protected Secure Notes key is supplied to the service through the normal secret channel.
2. Start the app and worker without public traffic. Allow only the normal startup migration path for that exact application version.
3. Require `200 {"status":"ready"}` from `/readyz` and the expected version from `/api/app-info`.
4. Verify the migration identity/checksum, SQLite `PRAGMA integrity_check`, login/session, representative Files download/preview, and representative Secure Notes decrypt/history behavior.
5. Review `backup-operations.jsonl` plus the `instance_backup_restored` workspace audit event, then restore Caddy traffic deliberately.

If post-start verification fails, stop the candidate immediately. Use the automatically created pre-restore archive with the same validated restore command, or restore the original moved-aside installation through the documented operator recovery path. Do not delete either archive, its sidecar, the prior runtime artifact/image, or the separate key backup until the restored installation has passed its observation period.

## Retention and cleanup

The baseline intentionally has no automatic pruning. Apply an operator-owned retention policy to exact archive/sidecar pairs only after a newer backup has passed inspection and a representative restore drill. Keep `backup-operations.jsonl` under restricted append-only/centralized logging controls, keep the Secure Notes key backup on its separate schedule/channel, and never remove the only proven restore point during upgrade or incident work.

Run `npm run backup:drill` after material database, Files, encryption, archive, or restore changes. The disposable drill creates representative database, Files, and encrypted-note state; creates and inspects a backup; mutates live state; makes a pre-restore backup; restores and boots the original state; verifies readiness/version/schema/data; and proves incompatible and internally corrupted archives are rejected before destructive replacement.
