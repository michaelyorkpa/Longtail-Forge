# Workspace Backup Package

Longtail Forge can create a recovery package for the currently active workspace from **Settings -> Admin -> Workspace**. This is distinct from the stopped-app [whole-instance backup](backup-restore.md): it extracts one workspace for recovery review before a later workspace-deletion workflow, and it never replaces the installation in place.

Only a Workspace Administrator of the active workspace or a Super Admin may create or read its latest receipt. `POST /api/settings/workspace-backups` performs the authorization again on the server. Request, success, and classified failure outcomes are forced into the workspace audit stream without recording protected paths, credentials, key material, file content, or raw internal errors.

## Package and isolation contract

Each `*.ltfworkspace.tgz` archive has a required adjacent `*.sha256` sidecar and contains:

```text
longtail-forge-workspace-backup/
  manifest.json
  checksums.json
  database/workspace.db
  files/...
```

The standalone SQLite database retains exactly the selected workspace, its framework/module records, and the readable identity rows referenced by those records. Retained identities are attribution-only: password hashes and alternate email are stripped, the account is inactive and unprotected, and it cannot authenticate. API keys/scopes, sessions, workspace-creation grants, application settings, active timers, jobs, search/FTS data, storage accounting, and prior backup receipts are removed. The database is vacuumed after scoping so deleted workspace content and credentials cannot remain in SQLite free pages.

Internal Files objects are read through the configured Files storage adapter and copied into the package's provider-neutral local restore layout. Only selected-workspace object keys are read. External-file records retain metadata but no external object bytes. Every other workspace, its records, and its Files objects are excluded. The manifest records migration identity, table counts, identity and Secure Notes inventories, source storage-provider classifications, and explicit inclusion/exclusion lists. `checksums.json` covers the manifest, database, and every packaged Files object; the sidecar covers the compressed archive.

Encrypted Secure Notes payloads remain encrypted in the scoped database. The Secure Notes master key, environment files, provider credentials, runtime secrets, application source/binaries, logs, caches, and process state are never included. A package containing encrypted records is not considered restorable until inspection or disposable restore receives a non-empty separately protected key-backup proof through `--secure-notes-key-backup`; the command verifies the prerequisite without reading, copying, hashing, naming, or packaging the key.

The configured archive destination is `LONGTAIL_WORKSPACE_BACKUP_ROOT`, defaulting to `./backups/workspaces`. It must remain outside `public/`. Compose maps it to `/var/backups/longtail-forge/workspaces` on the protected backup bind mount. The browser receives only a safe receipt: workspace/package label, application version, creation time and user label, Files counts/bytes, Secure Notes recovery warning, and archive SHA-256. It receives no download URL, server path, filename, storage key, or secret.

## Inspect and disposable restore

Use the runtime artifact's operator commands on the protected host:

```sh
npm run workspace-backup:inspect -- \
  --archive /var/backups/longtail-forge/workspaces/<workspace>/<backup>.ltfworkspace.tgz \
  --secure-notes-key-backup /offline-or-secret-store/secure-notes-key.backup
```

Inspection verifies the sidecar, safe tar entry types/paths, exact internal inventory, checksums, SQLite integrity and foreign keys, one-workspace scope, excluded data, retired credentials, migration identity, Files bytes/hashes, application-version compatibility, and the Secure Notes prerequisite. Omit the key option only when the manifest contains no encrypted records or when a non-restorable inspection result is intentional.

Restore is deliberately non-destructive and accepts only new destinations:

```sh
npm run workspace-backup:restore -- \
  --archive /var/backups/longtail-forge/workspaces/<workspace>/<backup>.ltfworkspace.tgz \
  --target-database /protected/disposable-review/workspace.db \
  --target-files-root /protected/disposable-review/files \
  --secure-notes-key-backup /offline-or-secret-store/secure-notes-key.backup
```

The command refuses an existing database or Files destination and exact-version mismatches by default. `--allow-any-app-version` is an explicit inspection/drill escape hatch, not a compatibility promise. Keep the extracted target isolated, then verify representative records, Files, Secure Notes decryption through the separately protected key, `PRAGMA integrity_check`, and `PRAGMA foreign_key_check` before making any recovery decision. There is no merge/import or in-place workspace replacement in this slice.

`npm run workspace-backup:drill` is repository-only proof. It creates two workspaces, credentials, search data, Files objects, and a Secure Note; packages one workspace; proves the other workspace and deleted SQLite-page content are absent; validates the key prerequisite; restores to new destinations; and proves destructive overwrite is refused.
