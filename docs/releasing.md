# Releasing Longtail Forge

A releasable Longtail Forge revision is an exact protected `main` commit with passing promotion gates, an immutable controlled-artifact identity, and—once image publishing is enabled—an immutable supported Compose image digest. A version label alone is not enough. The current bare-metal release handoff remains transition safety for the two existing preview hosts; it is not a second supported production deployment.

Before promotion, run `npm run maintenance:rehearse` on native Linux (or require the exact clean-Ubuntu job for the candidate). It composes host-asset installation/toggles, direct and bounded proxy ownership, deploy failure recovery, rollback, and stale-marker recovery. Record the exact revision, Caddy/Nginx/OpenSSL versions, timestamps, result, and any failure references in the private operational record. `--plan` output is not execution evidence.

## Release checklist

1. Promote `nightly` into `main` through the protected promotion pull request described in [GitHub Workflow](development/github-workflow.md).
2. Confirm the main artifact workflow is green and retain the full commit SHA, version, artifact filename, SHA-256 sidecar, and `release-metadata.json` together.
3. If a tag and GitHub Release are appropriate, create the tag on that exact main commit. Attach the checksum and artifact without replacing an existing tag or asset silently.
4. Review current security, backup, deployment, and known-limitation prerequisites. A green scan is evidence, not a security guarantee.
5. For the private preview, dispatch the manual workflow with `DEPLOY <full-main-SHA>`. A main merge never deploys automatically.
6. Require successful backup inspection and installation while the deployment curtain is active and Caddy remains available. The helper may clear only its deployment marker after direct readiness plus public `/healthz`, `/readyz`, and `/api/app-info` verification; match `version`, `commitSha`, and `artifactSha256` to the selected release metadata.
7. Complete the [Private Preview Readiness](private-preview-readiness.md) record before any invitation or post-release access expansion.
8. Record the prior known-good release and its pre-deployment backup. Keep both until the new release completes its observation period.

If deployment fails, require the helper's protected operation outcome. A verified known-good recovery may remove only the deployment-owned curtain but the release attempt remains failed. An unresolved backup restore, recovered-current startup/identity check, signal, or malformed retry remains curtained with the original release, recovery units, metadata, and root-only evidence retained; do not relabel or manually reopen it as a successful release.

The `nightly` artifact is for the isolated demo/development environment only. It must not be relabeled as a friends-and-family release. Routine Nightly deployment preserves the demo database and Files tree and never invokes the separate manual [demo-host provision/reset operation](demo-data-operations.md). The preview environment remains blocked while its deployment variables are disabled or its isolated secrets, host helper, URL, backup, and restore proof are incomplete.

Rollback is a release operation, not a source-code reversal. Dispatch the manual workflow with the recorded previous main SHA and `ROLLBACK <SHA>`. The host helper keeps Caddy active, asserts its deployment marker before stopping Node, backs up the current database and Files together, restores the previous release's matching state and metadata, and reopens only after direct and public identity proof. A failed target rolls forward to the protected pre-rollback current state; a failed recovery or interruption keeps both recovery units and protected operation evidence behind the marker. Repeat only the same recorded target so the helper can reconstruct the current baseline or revalidate an already-completed state swap; never clear the deployment marker as a substitute for that review. See [Upgrading](upgrading.md) and [Backup and Restore](backup-and-restore.md).
