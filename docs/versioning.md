# Application Versioning

`package.json` is the single metadata source for the canonical Longtail Forge application version. Runtime code reads it through `src/core/version.js`; asset keys and bundled workflow module manifests consume that unsuffixed value instead of duplicating a release literal.

Maintained deployment paths supply a validated `LONGTAIL_RELEASE_BRANCH`. Runtime identity qualifies the display version as `<canonicalVersion>-<sourceBranch>` (for example `0.33.17.7-nightly`) while exposing `canonicalVersion`, `sourceBranch`, and `displayVersion` separately through `/api/app-info`, runtime diagnostics, and app-shell metadata. The splash and shared footer show the qualified display value. An explicitly local run may omit the branch and remains unqualified; release artifacts and deployments must not infer identity from `.git` because packaged installations do not contain it.

Database adapter `contractVersion` fields are independent provider-contract markers. They change only when their adapter contract changes and must not be updated merely because the application version changes.

## Version-wide Internal Checkpoints

An active roadmap may explicitly group numbered implementation checkpoints inside one version-wide branch. In that model, an internal checkpoint is verified work but not a separately packaged application release. It retains one canonical `npm run verify:slice`, focused review, and protected pull-request CI; the checkpoint pull request's base is `nightly`, because only `nightly`- and `main`-based pull requests run the required checks, and a merge into any `agent/*` topic or integration branch completes no checkpoint. Stage its completed `ROADMAP.md` to `ROADMAP-ARCHIVE.md` handoff as the final bookkeeping commit in the same protected pull request as the implementation. The archive entry becomes authoritative only when that pull request merges; a second archive-only pull request is unnecessary. The package/lock version bump, rolled-up changelog, durable decision and documentation prose, and runtime identity proof occur once at the roadmap's named branch-closeout checkpoint. Exact-SHA Nightly, promotion, artifact, and deployment contracts do not change.

Each non-merge implementation commit carries exactly one `LTF-Checkpoint`, `LTF-Summary`, and `LTF-Docs` Git trailer. Keep the three trailers contiguous in one final commit-message paragraph, with no blank lines between them. `LTF-Checkpoint` names the declared numeric roadmap slice, `LTF-Summary` records one single-line outcome, and `LTF-Docs` contains the normal `Docs updated: <comma-separated paths>.` or `No docs change needed: <short reason>.` disposition. `ROADMAP.md` and `ROADMAP-ARCHIVE.md` are ceremony/bookkeeping paths rather than documentation paths for this trailer, so their standard handoff uses exactly `LTF-Docs: No docs change needed: completed checkpoint moved to roadmap archive.` The protected pull-request Development gate validates every commit in the complete base-to-head range, matches any declared documentation paths to the diff, rejects early package/lock, changelog, durable-decision, or documentation ceremony, and enforces the roadmap's two-ceremony-file ceiling. A completed checkpoint may use those two ceremony files for its live-roadmap-to-archive handoff, and archived headings remain valid checkpoint declarations. The first policy checkpoint may update these governing instructions; later internal checkpoints defer other durable prose. A roadmap-only planning commit may establish the version-wide branch before the first implementation checkpoint.

After all intended checkpoint commits are present, run `npm run checkpoint:validate` before the first push and after amending any checkpoint commit message. The command resolves `merge-base(origin/nightly, HEAD)` locally and validates the same complete branch range as protected CI. It does not repeat `npm run verify:slice`; a message-only amend leaves a prior green tree verification valid, while any file change requires verification again.

## Asset Cache Version

The browser asset cache version is derived directly from the same application version through `src/core/asset-version.js`; it is not an independently bumped release value. The static view service rewrites every local JavaScript and CSS reference in served public/protected HTML to the canonical version, injects version metadata plus the shared browser helper in the page head, and leaves the existing first-paint theme attribute contract intact. Runtime-injected Footer and Workbench dependencies use `LongtailForge.assetVersion.url(...)`, and normalized module `browserAssets` paths use the server helper.

Do not add `?v=...` or `?cache=...` literals anywhere in active source. As of 0.33.10.5, the old inert source-view and dynamic-loader literals are retired: views and the Footer/Workbench dependency lists reference bare asset paths, `scripts/asset-cache-legacy-baseline.json` is empty and may only stay empty, and the asset-cache release gate fails on any raw key in `public/js`, `src`, or `views`. Historical `?v=` keys quoted in `CHANGELOG.md` and other preserved history are text, not source, and stay as written. A normal scoped application version bump automatically changes the served asset version.

## Bump Workflow

Run the scoped helper with the intended release version:

```sh
npm run version:bump -- <version>
```

The helper validates that package and lock metadata are aligned, then updates only `package.json` and the root version fields in `package-lock.json`. Review those two files before continuing.

Do not use a repository-wide find/replace for an application version bump. Roadmap headings, changelog entries, archived plans, developer documentation, and `As of ...` assertions are historical labels. Preserve them unless the specific documentation itself is intentionally being revised.

After the helper runs:

1. Add the release entry to `CHANGELOG.md` and update only the documentation that owns changed behavior.
2. Complete the active `ROADMAP.md` checklist, move the finished slice to `ROADMAP-ARCHIVE.md`, and advance the `Active cursor`; preserve historical version labels. If the roadmap explicitly permits reordering and the operator requests a later slice first, remove only that completed slice from the live roadmap and keep the true lower pending slice active. Its archive entry must say `Completed on YYYY-MM-DD out of numeric order at the operator's request.` and ``The active roadmap cursor remains `<version>`;`` so the exception is reviewable rather than inferred.
3. Run `npm run docs:suggest` and record either the owning documents updated or why no documentation change is needed.
4. If regression discovery or its policy changed, review and run the explicit floor advance plus generated documentation update:

   ```sh
   npm run regressions:manifest -- --ratchet-floors
   npm run regressions:inventory:write
   ```

   Ordinary `npm run regressions:manifest` never changes policy floors, and every non-mutating check fails when a live floor lags. The ratchet mode may only raise floors and refuses a decrease.

5. If reviewed deterministic artifacts are stale, `npm run closeout -- --fix` may regenerate only the regression manifest, the delimited regression-suite numeric block, the bundled-module catalog, and the generated database schema snapshot before validation. It never edits coverage exceptions, roadmap, changelog, decisions, or free-form documentation. `-- --fail-fast` is an optional diagnostic mode; default closeout still runs every standing hard or warning-only gate.

6. After the final tree is complete, run the canonical local conductor exactly once:

   ```sh
   npm run verify:slice
   ```

   It includes closeout, fast checks, changed/full regression escalation, and the separate permission harness when selected. Do not separately rerun `version:guard`, `closeout`, `check`, an included area, or the permission harness after a green result unless a source, test, documentation, package, lockfile, workflow, or configuration file changes.

7. Build the checksummed runtime artifact once with `npm run artifact:build -- --source-branch <branch>`. `nightly` builds use `nightly`; main, preview, and tagged-release builds use `main`. For a release candidate, run `npm run artifact:smoke -- --artifact <path>` to prove that exact retained artifact has a clean `npm ci --omit=dev` install and boot without development dependencies; omitting `--artifact` remains the local build-and-smoke convenience. See [Runtime Artifact](runtime-artifact.md).
8. For a deployable preview candidate, run the supported native container proof against the same candidate artifact and release metadata: `npm run container:smoke -- --artifact <path> --release-metadata dist/release-metadata.json --previous-artifact <prior-path> --pull`. When no distinct prior artifact is supplied, the smoke uses the candidate for both sides while retaining persistence, readiness/version, backup-first replacement, and restored rollback checks. The Docker server must report native `linux/amd64`; a missing engine, unsupported platform, manifest-only build, or emulation-only build is a failed prerequisite. Retain the generated image-provenance JSON with the candidate. See [Compose Production Support](preview-deployment.md).
9. Public release publication runs only from the manual release workflow against an exact protected `main` SHA. `npm run image:publish` pushes one GHCR `linux/amd64` image, retains registry-attached SPDX/SLSA attestations, pulls and executes that digest natively, and emits schema-2 release metadata binding source, artifact, image index, platform manifest, and native dependency proof. Host deployment consumes only the recorded `repository@sha256:...`; never publish or deploy `latest`.
10. Run `npm run backup:drill` after any material database, Files, Secure Notes encryption, archive, or restore change. A preview candidate also needs a protected real-install backup inspected through the shipped CLI and a recorded representative restore; see [Baseline Backup and Restore](backup-restore.md).
11. Restart the app and verify `/api/app-info` reports the intended canonical version, source branch, and qualified display version. Served JavaScript/CSS URLs continue to use only the canonical version.

## Literal Guardrail

`scripts/version-literal-guardrail-regression.mjs` reads the current package version and rejects that exact literal in unapproved runtime, regression, or repository files. Its narrow allowlist lives in `scripts/version-literal-allowlist.json`.

The normal closeout rule requires the active roadmap cursor to compare greater than the package version. The sole lower-cursor exception is an explicitly documented out-of-order closeout: the completed current version must be absent from `ROADMAP.md`, the retained cursor must still have its live version section, and that current version's archive section must contain both the exact operator-requested out-of-order marker and the exact preserved-cursor statement. The version guard and shared closeout-regression cursor-floor helper consume the same evidence. Synthetic positive and negative cases prevent an undocumented lower cursor or a still-live completed section from passing.

Package metadata and narrowly approved release metadata may contain the current literal. Whole-file exemptions remain limited to canonical package metadata and historical/planning surfaces. Structured release metadata that needs the current version uses path-specific, anchored line rules; the regression retirement policy and its generated manifest currently allow the literal only as the value of `retiredInVersion`, not in rationales, descriptions, or arbitrary fields. `DECISIONS.md`, `ROADMAP.md`, `CHANGELOG.md`, `TODO.md`, roadmap archives, `docs/`, and archived release/history directories are governing/planning/historical-label surfaces and are ignored by the guardrail. `TODO.md` remains scratchpad only; this exemption does not promote its items into implementation scope. Older version labels elsewhere are also unaffected because the guardrail searches only for the exact current package version.
