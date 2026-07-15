# Releasing Longtail Forge

A releasable Longtail Forge revision is an exact protected `main` commit with passing promotion gates and an immutable artifact identity. A version label alone is not enough.

## Release checklist

1. Promote `nightly` into `main` through the protected promotion pull request described in [GitHub Workflow](development/github-workflow.md).
2. Confirm the main artifact workflow is green and retain the full commit SHA, version, artifact filename, SHA-256 sidecar, and `release-metadata.json` together.
3. If a tag and GitHub Release are appropriate, create the tag on that exact main commit. Attach the checksum and artifact without replacing an existing tag or asset silently.
4. Review current security, backup, deployment, and known-limitation prerequisites. A green scan is evidence, not a security guarantee.
5. For the private preview, dispatch the manual workflow with `DEPLOY <full-main-SHA>`. A main merge never deploys automatically.
6. Require successful backup inspection, installation, `/healthz`, `/readyz`, and `/api/app-info` verification. Match `version`, `commitSha`, and `artifactSha256` to the selected release metadata.
7. Record the prior known-good release and its pre-deployment backup. Keep both until the new release completes its observation period.

The `nightly` artifact is for the isolated demo/development environment only. It must not be relabeled as a friends-and-family release. The preview environment remains blocked while its deployment variables are disabled or its isolated secrets, host helper, URL, backup, and restore proof are incomplete.

Rollback is a release operation, not a source-code reversal. Dispatch the manual workflow with the recorded previous main SHA and `ROLLBACK <SHA>`; restore the matching database and Files state together and verify the restored runtime identity. See [Upgrading](upgrading.md) and [Backup and Restore](backup-and-restore.md).
