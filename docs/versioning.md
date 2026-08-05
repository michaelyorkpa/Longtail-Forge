# Application Versioning

`package.json` is the single metadata source for the canonical Longtail Forge application version. Runtime code reads it through `src/core/version.js`; asset keys and bundled workflow module manifests consume that unsuffixed value instead of duplicating a release literal.

Maintained deployment paths supply a validated `LONGTAIL_RELEASE_BRANCH`. Runtime identity qualifies the display version as `<canonicalVersion>-<sourceBranch>` (for example `0.33.17.7-nightly`) while exposing `canonicalVersion`, `sourceBranch`, and `displayVersion` separately through `/api/app-info`, runtime diagnostics, and app-shell metadata. The splash and shared footer show the qualified display value. An explicitly local run may omit the branch and remains unqualified; release artifacts and deployments must not infer identity from `.git` because packaged installations do not contain it.

Database adapter `contractVersion` fields are independent provider-contract markers. They change only when their adapter contract changes and must not be updated merely because the application version changes.

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
2. Complete the active `ROADMAP.md` checklist, move the finished slice to `ROADMAP-ARCHIVE.md`, and advance the `Active cursor`; preserve historical version labels.
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

Package metadata and narrowly approved release metadata may contain the current literal. Whole-file exemptions remain limited to canonical package metadata and historical/planning surfaces. Structured release metadata that needs the current version uses path-specific, anchored line rules; the regression retirement policy and its generated manifest currently allow the literal only as the value of `retiredInVersion`, not in rationales, descriptions, or arbitrary fields. `DECISIONS.md`, `ROADMAP.md`, `CHANGELOG.md`, `TODO.md`, roadmap archives, `docs/`, and archived release/history directories are governing/planning/historical-label surfaces and are ignored by the guardrail. `TODO.md` remains scratchpad only; this exemption does not promote its items into implementation scope. Older version labels elsewhere are also unaffected because the guardrail searches only for the exact current package version.
