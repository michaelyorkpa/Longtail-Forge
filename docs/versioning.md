# Application Versioning

`package.json` is the single metadata source for the current Longtail Forge application version. Runtime code reads it through `src/core/version.js`; `/api/app-info`, runtime diagnostics, app-shell metadata, and the bundled workflow module manifests consume that derived value instead of duplicating a release literal.

Database adapter `contractVersion` fields are independent provider-contract markers. They change only when their adapter contract changes and must not be updated merely because the application version changes.

## Asset Cache Version

The browser asset cache version is derived directly from the same application version through `src/core/asset-version.js`; it is not an independently bumped release value. The static view service rewrites every local JavaScript and CSS reference in served public/protected HTML to the canonical version, injects version metadata plus the shared browser helper in the page head, and leaves the existing first-paint theme attribute contract intact. Runtime-injected Footer and Workbench dependencies use `LongtailForge.assetVersion.url(...)`, and normalized module `browserAssets` paths use the server helper.

Do not manually add or bump `?v=...` or `?cache=...` literals. Older source-view and dynamic-loader literals are frozen compatibility input only: runtime decoration overwrites them, and `scripts/asset-cache-legacy-baseline.json` prevents additions or manual changes. Shrink that baseline when a dedicated cleanup removes an old literal; do not refresh it during ordinary UI work. A normal scoped application version bump automatically changes the served asset version.

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
3. Run the focused guardrail:

   ```sh
   npm run version:guard
   ```

4. Run the normal release verification, including `npm run check`.
5. Restart the app and verify `/api/app-info` reports the intended version and served HTML uses the same value for local JavaScript/CSS URLs.

## Literal Guardrail

`scripts/version-literal-guardrail-regression.mjs` reads the current package version and rejects that exact literal in unapproved runtime, regression, or repository files. Its narrow allowlist lives in `scripts/version-literal-allowlist.json`.

Package metadata and narrowly approved release metadata may contain the current literal. `ROADMAP.md`, `CHANGELOG.md`, roadmap archives, `docs/`, and archived release/history directories are historical-label surfaces and are ignored by the guardrail. Older version labels elsewhere are also unaffected because the guardrail searches only for the exact current package version.
