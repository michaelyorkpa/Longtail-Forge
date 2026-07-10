# Application Versioning

`package.json` is the single metadata source for the current Longtail Forge application version. Runtime code reads it through `src/core/version.js`; `/api/app-info`, runtime diagnostics, app-shell metadata, and the bundled workflow module manifests consume that derived value instead of duplicating a release literal.

Database adapter `contractVersion` fields are independent provider-contract markers. They change only when their adapter contract changes and must not be updated merely because the application version changes.

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
5. Restart the app and verify `/api/app-info` reports the intended version.

## Literal Guardrail

`scripts/version-literal-guardrail-regression.mjs` reads the current package version and rejects that exact literal in unapproved runtime, regression, or repository files. Its narrow allowlist lives in `scripts/version-literal-allowlist.json`.

Package metadata and narrowly approved release metadata may contain the current literal. `ROADMAP.md`, `CHANGELOG.md`, roadmap archives, `docs/`, and archived release/history directories are historical-label surfaces and are ignored by the guardrail. Older version labels elsewhere are also unaffected because the guardrail searches only for the exact current package version.
