# Application Versioning

`package.json` is the single metadata source for the current Longtail Forge application version. Runtime code reads it through `src/core/version.js`; `/api/app-info`, runtime diagnostics, app-shell metadata, and the bundled workflow module manifests consume that derived value instead of duplicating a release literal.

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

1. Add the release entry to `CHANGELOG.md`.
2. Update only active `ROADMAP.md` checklist and archive handoff text required by the completed slice.
3. Run the closeout conductor, which includes the focused version guard plus the standing manifest, schema, parameter-binding, documentation, and licensing checks:

   ```sh
   npm run closeout
   ```

   The conductor aggregates these maintenance gates and reports warning-only documentation/licensing results without replacing their existing policy. Each underlying package script remains independently runnable.

4. Run the normal release verification, including the separate full `npm run check` regression and lint gate.
5. Restart the app and verify `/api/app-info` reports the intended version and served HTML uses the same value for local JavaScript/CSS URLs.

## Literal Guardrail

`scripts/version-literal-guardrail-regression.mjs` reads the current package version and rejects that exact literal in unapproved runtime, regression, or repository files. Its narrow allowlist lives in `scripts/version-literal-allowlist.json`.

Package metadata and narrowly approved release metadata may contain the current literal. `DECISIONS.md`, `ROADMAP.md`, `CHANGELOG.md`, `TODO.md`, roadmap archives, `docs/`, and archived release/history directories are governing/planning/historical-label surfaces and are ignored by the guardrail. `TODO.md` remains scratchpad only; this exemption does not promote its items into implementation scope. Older version labels elsewhere are also unaffected because the guardrail searches only for the exact current package version.
