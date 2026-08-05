# Backup and Restore Operator Guide

[Baseline Backup and Restore](backup-restore.md) is the authoritative command and archive contract. Read it before operating on live data; this page is the release-operations entry point.

Every deployment and upgrade is backup-first. Docker Compose is the sole supported production/self-hosted recovery path. Hold ordinary public traffic, stop the Compose app, create a whole-instance archive containing the SQLite database and local Files state, supply the separately protected Secure Notes recovery-key backup when encrypted Notes exist, inspect both the archive and sidecar before replacing anything, and keep the backup outside the live data volume and public paths.

Restore is destructive and must replace database and Files state from the same verified archive. After restore, start without public traffic, require database integrity and migration identity, `/readyz`, the expected `/api/app-info` version and release identity, representative login/File/Secure Notes checks, and operator audit evidence before reopening the selected TLS edge.

The GitHub deployment helper follows this contract but does not make backups automatic in the product. Operators still own protected off-host copies, retention, recovery-key custody, observation periods, and representative restore drills. Never discard the only proven restore point during a release. The private-preview invitation gate in [Private Preview Readiness](private-preview-readiness.md) requires a tested restore before access is granted.
