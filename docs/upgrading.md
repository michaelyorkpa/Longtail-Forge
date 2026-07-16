# Upgrading Longtail Forge

Upgrades are manual, immutable replacements. Longtail Forge has no in-app updater and does not overwrite the running application tree.

1. Select an exact protected `main` commit or immutable release tag and verify its runtime artifact SHA-256.
2. Read the release notes, migration implications, backup compatibility, and security limitations.
3. Stop public traffic, the app, and any separate worker. Create and inspect the whole-instance backup described in [Backup and Restore](backup-and-restore.md).
4. Stage the new image or root-owned release directory without changing the prior one. Install production dependencies from its locked runtime metadata.
5. Switch to the candidate and let only its normal startup migration path run. Do not edit applied migrations or reverse them manually.
6. Verify `/healthz`, `/readyz`, schema/migration identity, and `/api/app-info`. The version, exact commit SHA, and artifact checksum must match the selected release metadata. Run representative login, Files, and Secure Notes checks before restoring traffic.
7. Retain the prior runtime, backup and sidecar, release metadata, and separate Secure Notes recovery material through the observation period.

If verification fails, stop the candidate. Restore the pre-upgrade database and Files backup together before starting the prior release unless that release's forward-migration rollback compatibility was explicitly proven. The maintained GitHub preview helper automates this conservative sequence for its single recorded previous known-good release; [GitHub Workflow](development/github-workflow.md) explains the deliberate rollback dispatch.
