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

3. Open a pull request into `nightly`. On GitHub choose **Pull requests > New pull request**, set base to `nightly`, compare to the short-lived branch, and describe the outcome and proof. The required checks are named exactly `Development gate`, `Browser smoke and accessibility`, `Complete maintenance release rehearsal`, `Dependency review`, and `CodeQL JavaScript analysis`; all five must report a conclusive successful result. Resolve every review conversation, even when the resolution is “no change” with a documented reason.

The Development and Nightly workflows share one rename-aware classifier. For pull requests it inspects the complete diff from the exact PR base SHA through the proposed head; for a Nightly push it inspects the exact before-to-after range. A GitHub-only documentation change may contain qualifying root-level `*.md` files and ordinary documentation beneath `docs/` only when every changed path is absent from the canonical runtime-artifact allowlist. Checked-in Caddy, Nginx, environment, systemd, YAML, script, SQL, JSON, and similar deployment/runtime configuration contracts beneath `docs/` are also excluded. Both the old and new paths of a rename must qualify.

Runtime-artifact content never qualifies even when it looks like documentation. This includes `README.md`, `SECURITY.md`, `LICENSE`, the packaged operator documents named by `scripts/build-runtime-artifact.mjs`, and every file beneath `help/`. Changes beneath `.github/`, or changes to package manifests/lockfiles, source, public assets, scripts, tests, deployment configuration, containers, migrations, runtime configuration, machine-readable documentation configuration, or any unknown path always retain the full path. An unavailable or failed classification also falls back to full validation and does not deploy from an untrusted classification result.

For a classified GitHub-only documentation pull request, `Development gate` still installs the dependencies required by the closeout and selected regressions, runs `npm run closeout`, and runs `npm run test:regressions:changed:ci` against that same complete PR diff. It skips application typecheck, unit tests, and lint. `ROADMAP.md`, `ROADMAP-ARCHIVE.md`, and `CHANGELOG.md` retain their existing `release` regression owner with `fullCheck: false`; in this context `release` means release-regression ownership only. A bookkeeping-only change does not require a GitHub Release, deployment, runtime artifact rebuild, application build, or Longtail Forge version bump.

`Browser smoke and accessibility` remains an always-present required job. It succeeds through an explicit GitHub-only documentation message without checking out the application, installing npm dependencies or Playwright browsers, or running the smoke/accessibility suite. `Complete maintenance release rehearsal` skips the same GitHub-only documentation class and otherwise installs distribution Nginx/OpenSSL plus a checksum-pinned official Caddy binary, then runs the fail-fast host-asset, direct-Caddy, real-Nginx/private-Caddy, and deploy/rollback/recovery stages through `npm run maintenance:rehearse`. `Dependency review` remains enabled for every pull request. CodeQL retains PR and scheduled analysis; redundant post-merge push scans are retired only after live protection confirmed the PR context is required on both permanent branches. The workflow deliberately does not use pull-request `paths-ignore`, because an omitted required workflow can leave branch protection waiting forever.

Node package downloads use setup-node's lockfile-keyed npm cache. Playwright's browser cache is keyed by operating system, architecture, and the exact package lock; pull-request cache scope cannot publish into the protected-branch scope. The Caddy archive cache is keyed by operating system, architecture, exact version, and SHA-512 digest, and the digest is rechecked before extraction even on a hit. ESLint's result cache is not shared between GitHub jobs because an untrusted result cache could suppress analysis; Docker recovery keeps its deliberate clean-build/no-cache proof. Nested runtime-artifact installs use a job-owned npm cache directory, never a cross-job `node_modules` cache.

For every non-GitHub-only pull request, the Development gate reports context/setup, closeout, typecheck/unit/lint, and regression stage timings. Changed-area full escalation uses the regression-only path only after fast checks pass in that same job, so it does not repeat them. Promotion, preview, and release workflows retain their complete regression, permission, browser, and packaging gates and report those stage timings separately.

4. Merge without bypassing checks, then delete the short-lived branch on GitHub and locally:

   ```sh
   git switch nightly
   git pull --ff-only origin nightly
   git branch -d feature/clear-description
   git fetch --prune origin
   ```

A GitHub-only documentation push to `nightly` completes through explicit successful no-runtime/no-deploy jobs. It does not build or upload a runtime artifact, reference the `demo-development` GitHub Environment, or start an automated deployment.

Every other verified push to `nightly` builds an artifact identified by its full commit SHA and SHA-256 checksum. After the full application and browser jobs succeed, a separate bounded job records a `nightly-proof-v1` statement bound to the repository, workflow/ref, exact SHA, workflow checksum, exact successful job set, workflow run, release metadata, artifact checksum, and creation time. The runtime bundle and proof are retained for 14 days. A scheduled run may skip repeat application/browser work only after it finds exactly one unexpired successful push run for the current `nightly` SHA, downloads both retained artifacts, and verifies that complete policy; missing, stale, ambiguous, expired, cancelled, failed, mismatched, or changed-policy evidence runs the full scheduled path. The scheduled preflight remains a visible successful job and never creates a deployment.

The exact push artifact may deploy only to the `demo-development` GitHub Environment, and only after the proof-publishing job succeeds and that environment's isolated host, URL, and credentials are configured with `DEPLOY_ENABLED=true`. Changes under `help/**` are runtime Help changes and deliberately stay on this full path: they run application/browser validation, build the artifact, and automatically deploy to the configured demo environment after the gates pass so current in-app Help is published promptly. Branches other than `nightly` cannot deploy it.

## Promote nightly to main

Promotion is a pull request whose base is `main` and whose head is exactly `nightly`. No feature branch can substitute for it; the only alternate source accepted by the protection check is an explicit `hotfix/*` branch created from `main` under the hotfix procedure below.

```sh
git fetch origin
gh pr create --base main --head nightly --title "Promote nightly to main" --body "Promotes exact nightly revision $(git rev-parse origin/nightly)."
```

The promotion source check prints the exact SHA. Strict branch protection requires `nightly` to be current with `main`. For a normal `nightly` promotion, it queries the successful Nightly push runs for that exact PR-head SHA and accepts reuse only when exactly one unexpired run, the repository and workflow/ref, `nightly-proof-v1` policy, workflow checksum, required successful job set, artifact names, release metadata, and artifact/metadata checksums all agree. A hotfix never reuses Nightly proof. Missing, stale, ambiguous, expired, cancelled, failed, mismatched, or policy-changed evidence is not an error shortcut: it selects the complete release and browser path.

On accepted reuse, the required `Release gate` and `Browser gate` remain present and report the verified proof explicitly; dependency review and dependency audit retain their appropriate proof. On fallback, the release gate runs closeout, the full regression/lint/unit/typecheck gate, permissions, audit, and Playwright exactly as before. Both paths select one exact-SHA runtime artifact: accepted promotions download the retained Nightly bundle, while fallback and hotfix paths build it once. Runtime-artifact, bare-metal transition, native `linux/amd64` container, and backup recovery jobs then run independently in parallel, with the first three consuming that same checksummed artifact. The container job binds release metadata to the image labels, rejects a non-native Docker server, and retains the candidate image-provenance JSON for 30 days. The required `Packaging and recovery` job aggregates every result without changing its protected name. Merge only when every required check is green and conversations are resolved.

Merging does not deploy friends and family. A merge commit has a different immutable identity from the promoted Nightly head, so the bounded main workflow builds and retains one checksummed artifact named by the exact main commit; it does not relabel the Nightly artifact as main proof. Create an immutable annotated tag only after selecting that main commit deliberately:

```sh
git switch main
git pull --ff-only origin main
git tag -a v0.33.17.5 -m "Longtail Forge 0.33.17.5"
git push origin v0.33.17.5
```

A GitHub Release is a human-readable record around that immutable tag, controlled runtime-payload checksum, schema-2 image metadata, reviewed `linux/amd64` platform manifest, Compose assets, and root-owned helper. The manual release workflow publishes the image to GHCR with an ephemeral repository-scoped token, attaches SPDX SBOM and SLSA provenance to the registry digest, and executes the published digest natively before creating the Release. The tarball is provenance/build input, not a production installer; the commit tag is discovery metadata, not deployment identity. Do not use or silently move `latest`, deploy a tag without its digest, or create a permanent release branch.

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

The development pull-request workflow has a required clean-Ubuntu **Complete maintenance release rehearsal** job. It installs checksum-pinned Caddy plus the distribution Nginx/OpenSSL packages and runs `npm run maintenance:rehearse`. Retain the candidate job URL, commit, tool versions, timing, and outcome in the private operational record; a local `--plan` is not equivalent proof.

The `friends-and-family-preview` environment has separate data, application secrets, Secure Notes key, SSH credential, known-hosts pin, URL, and deployment account. It remains disabled until the actual Compose cutover proof in 0.33.28.4. The host helper keeps its exact public origin, GHCR repository, matching maintenance-state root, and optional Secure Notes recovery-key backup path in the separate root-owned `/etc/longtail-forge/compose-deploy-helper.env`; reinstalling the reviewed helper must preserve that file. Root's Docker client holds a separate pull-only package credential that the deployment account and workflow cannot read. Rotate it by adding the replacement, proving one exact digest pull, and revoking the old value; revoke immediately on suspected disclosure and disable deployment until replacement proof passes.

In **Actions > Manual friends and family preview > Run workflow**, choose `deploy`, paste a full 40-character SHA reachable from `main`, paste the exact `sha256:...` image-index digest from that version's GitHub Release metadata, and enter `DEPLOY <SHA>`. The workflow re-runs release gates, downloads the Release metadata, rejects a non-`main`, mutable, mismatched, unsupported-platform, unattested, or native-proof-free image, and hands only that metadata to the narrowly privileged host helper. It never rebuilds or transfers the runtime tarball. The helper verifies and pulls the digest before the outage window, leaves Caddy running, asserts its root-only deployment marker, stops only the Compose app, creates and inspects the stopped-app backup, selects the digest, and restarts it. It clears only that marker after direct readiness and public `/healthz`, `/readyz`, and `/api/app-info` identity succeed; an operator marker is preserved.

A failed deploy writes root-only secret-free latest/history evidence. Stop or backup failure reselects and verifies the known-good release without a data restore; candidate start/readiness or identity failure restores the recorded whole-instance backup and release metadata before verifying that known-good identity. A verified recovery clears only the deployment marker and still reports the candidate deployment as failed. Failed restore, failed current-release verification, or interruption leaves the marker, releases, backup/pre-restore artifacts, metadata snapshot, and evidence intact. Retry only the same recorded candidate; the helper first restores and verifies the known-good baseline under the retained curtain. Do not dispatch another candidate or clear the deployment marker manually to make a failed workflow appear green.

The deployed application identity is visible at `/api/app-info` as `version`, `commitSha`, and `artifactSha256`. Match all three to the workflow metadata, and independently inspect the container's image-index/platform digests, before treating the deployment as successful.

Rollback is another deliberate dispatch. Select `rollback`, enter the full SHA and exact image digest recorded for the previous known-good release, and confirm `ROLLBACK <SHA>`. The helper leaves Caddy running, asserts its deployment marker before stopping the app, protects the current identity with a new inspected database-and-Files backup, restores the recorded previous backup and digest metadata, and clears only its marker after direct and public readiness/identity succeed. If target restore/start/identity fails, the helper restores that pre-rollback current backup and current digest and reopens only after the current identity passes the same proof; the dispatch still fails. If current recovery also fails, the deployment marker, both backups, pre-restore artifacts, images, and root-only operation record remain for manual recovery.

Retry only the same target named by an interrupted or failed rollback record. The helper first reconstructs and verifies the pre-rollback current baseline under the retained curtain, then repeats the rollback. If a host interruption leaves the deployment-state swap complete but the marker present, the same dispatch revalidates the selected target identity before clearing the stale marker. A mismatched operation is refused, and the operator maintenance `off` command cannot remove deployment-owned evidence. Do not delete either release, either backup, sidecars, operation records, or Secure Notes recovery material until the observation period passes.

## Hotfixes

An urgent preview fix starts from `main`, not `nightly`. Hotfix promotion always executes the complete release, browser, dependency, packaging, and recovery path; it can never consume a Nightly proof:

```sh
git switch main
git pull --ff-only origin main
git switch -c hotfix/clear-description
```

Open a focused pull request from `hotfix/*` into `main`; all main checks still apply. After merge, deliberately deploy the exact new main SHA through the manual workflow. Then immediately reconcile the same fix into `nightly` with a pull request from `main` (or a narrowly scoped cherry-pick branch when histories require it). Resolve conflicts in that reconciliation PR and require the nightly checks to pass. Never accept a hotfix that exists only on `main`, and never skip backup, migration, security, immutable identity, readiness, or rollback controls because the change is urgent.

## Maintainer recovery

The repository administrator can change protection through the GitHub API, but normal work has no bypass. Use recovery only when GitHub itself or a misconfigured required check makes every compliant pull request impossible. Record the reason, narrow the temporary change, restore protection immediately, and run `npm run github:configure -- --apply` to return the repository to the checked-in policy. Do not use recovery to merge a red product change.
