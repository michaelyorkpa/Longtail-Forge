# GitHub Workflow for a Solo Maintainer

Longtail Forge uses two permanent branches because they answer different questions. `nightly` asks, “Is the current integration state healthy enough for development and the isolated demo installation?” `main` asks, “Is this exact revision known-good and eligible for a deliberate friends-and-family release?” Keeping those responsibilities separate allows active work to integrate without making every merge a preview deployment.

`main` and `nightly` are protected. Routine work never starts directly on either branch, and neither branch permits force-push or deletion. The solo-maintainer policy requires passing checks and resolved review conversations but does not require a second-person approval that cannot currently be supplied. When another maintainer joins, add at least one required approval and prevent the most privileged maintainer from bypassing the release gate.

## Ordinary development

1. Update local permanent branches, then start a short-lived branch from `nightly`. Use `feature/<description>`, `fix/<description>`, `docs/<description>`, or `chore/<description>`.

   ```sh
   git switch nightly
   git pull --ff-only origin nightly
   git switch -c feature/clear-description
   ```

   In VS Code, use **Source Control > … > Branch > Create Branch**, enter the intent-based name, and confirm that `nightly` was checked out first. Codex work uses the same branch boundary; inspect the diff before authorizing a commit or publish operation.

2. Make one scoped change, run its narrow checks, commit intentionally, and push the branch.

   ```sh
   git status --short
   git diff --check
   git add <explicit paths>
   git commit -m "Describe the completed outcome"
   git push -u origin feature/clear-description
   ```

3. Open a pull request into `nightly`. On GitHub choose **Pull requests > New pull request**, set base to `nightly`, compare to the short-lived branch, and describe the outcome and proof. The required Development gate, Browser smoke and accessibility, and Dependency review checks must pass. Resolve every review conversation, even when the resolution is “no change” with a documented reason.

4. Merge without bypassing checks, then delete the short-lived branch on GitHub and locally:

   ```sh
   git switch nightly
   git pull --ff-only origin nightly
   git branch -d feature/clear-description
   git fetch --prune origin
   ```

A verified push to `nightly` builds an artifact identified by its full commit SHA and SHA-256 checksum. It may deploy only to the `demo-development` GitHub Environment, and only after that environment's isolated host, URL, and credentials are configured and `DEPLOY_ENABLED=true`. Branches other than `nightly` cannot deploy it.

## Promote nightly to main

Promotion is a pull request whose base is `main` and whose head is exactly `nightly`. No feature branch can substitute for it; the only alternate source accepted by the protection check is an explicit `hotfix/*` branch created from `main` under the hotfix procedure below.

```sh
git fetch origin
gh pr create --base main --head nightly --title "Promote nightly to main" --body "Promotes exact nightly revision $(git rev-parse origin/nightly)."
```

The promotion source check prints the exact SHA. Strict branch protection requires `nightly` to be current with `main`. The release gate runs closeout, the full regression/lint/unit/typecheck gate, permissions, and dependency audit; separate jobs run Playwright, dependency review, runtime packaging, bare-metal recovery, Docker upgrade/rollback, and backup/restore proof. Merge only when every required check is green and conversations are resolved.

Merging does not deploy friends and family. The main workflow revalidates metadata and retains a checksummed artifact named by the exact main commit. Create an immutable annotated tag only after selecting that main commit deliberately:

```sh
git switch main
git pull --ff-only origin main
git tag -a v0.33.17.5 -m "Longtail Forge 0.33.17.5"
git push origin v0.33.17.5
```

A GitHub Release is a human-readable record around that immutable tag and its checksummed assets; it is not a mutable deployment channel. Do not use or silently move `latest` as release identity, and do not create a permanent release branch.

## Read and recover failed Actions

Open the pull request's **Checks** tab or **Actions**, select the failed job, and start with the first failed command rather than its final cascade. Reproduce the same command locally. A failed changed-regression selection shows its route reasons; a failed packaging job should be investigated on Ubuntu because it is the authoritative Docker proof. Re-run a job only for an external or demonstrated transient failure. Fix product or contract failures in the source branch and push a new commit.

If Git reports drift or a non-fast-forward push, fetch before changing history:

```sh
git fetch origin
git rebase origin/nightly
# resolve each file, then:
git add <resolved paths>
git rebase --continue
git push --force-with-lease
```

`--force-with-lease` is acceptable only on the short-lived branch. Never force a protected permanent branch. For promotion drift, reconcile `main` into `nightly` through a focused pull request, then reopen or refresh the promotion.

## Manual preview release, identity, and rollback

The `friends-and-family-preview` environment has separate data, application secrets, Secure Notes key, SSH credential, known-hosts pin, URL, and deployment account. In **Actions > Manual friends and family preview > Run workflow**, choose `deploy`, paste a full 40-character SHA reachable from `main`, and enter `DEPLOY <SHA>`. The workflow re-runs release gates, builds that revision, creates checksum metadata, and hands it to the narrowly privileged host helper. The helper stops traffic and the application, creates and inspects a whole-instance backup, installs a root-owned immutable release, restarts, and verifies public `/healthz`, `/readyz`, and `/api/app-info` identity.

The deployed identity is visible at `/api/app-info` as `version`, `commitSha`, and `artifactSha256`. Match all three to the workflow metadata before treating the deployment as successful.

Rollback is another deliberate dispatch. Select `rollback`, enter the full SHA recorded as the previous known-good release, and confirm `ROLLBACK <SHA>`. The helper backs up the failed/current state, restores the recorded pre-deployment database and Files archive together, switches the immutable runtime, and repeats health and identity verification. Do not delete the prior release, backup, sidecar, or Secure Notes recovery material until the observation period passes.

## Hotfixes

An urgent preview fix starts from `main`, not `nightly`:

```sh
git switch main
git pull --ff-only origin main
git switch -c hotfix/clear-description
```

Open a focused pull request from `hotfix/*` into `main`; all main checks still apply. After merge, deliberately deploy the exact new main SHA through the manual workflow. Then immediately reconcile the same fix into `nightly` with a pull request from `main` (or a narrowly scoped cherry-pick branch when histories require it). Resolve conflicts in that reconciliation PR and require the nightly checks to pass. Never accept a hotfix that exists only on `main`, and never skip backup, migration, security, immutable identity, readiness, or rollback controls because the change is urgent.

## Maintainer recovery

The repository administrator can change protection through the GitHub API, but normal work has no bypass. Use recovery only when GitHub itself or a misconfigured required check makes every compliant pull request impossible. Record the reason, narrow the temporary change, restore protection immediately, and run `npm run github:configure -- --apply` to return the repository to the checked-in policy. Do not use recovery to merge a red product change.
