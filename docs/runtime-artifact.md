# Runtime Artifact

Longtail Forge publishes a versioned runtime-only npm tarball for staged bare-metal installation and as the only application payload accepted by the checked-in Docker image build. The artifact is not a source checkout, development kit, backup, or automatic updater.

## Build and verify

From a reviewed source checkout with aligned package metadata, run:

```sh
npm run artifact:build -- --source-branch nightly
```

Use `nightly` for nightly integration artifacts and `main` for main, preview, and tagged-release artifacts. The command writes `dist/longtail-forge-<version>.tgz` and the adjacent `dist/longtail-forge-<version>.tgz.sha256`; the canonical filename stays unsuffixed. `dist/` is ignored because release artifacts are generated outputs, not source files. Verify the SHA-256 checksum before extraction or promotion.

For the full clean-install proof, run:

```sh
npm run artifact:smoke
```

The smoke builds the tarball, extracts it into a disposable directory, installs from the artifact's pruned shrinkwrap with `npm ci --omit=dev`, confirms development dependencies are absent, starts `node server.js` through the unchanged `npm start` contract, and verifies `/api/app-info` plus `/readyz`. The proof uses disposable test-mode data; it is not the production deployment or backup/restore exercise.

## Install and start

Use Node 24.7 or newer within the Node 24 line and a matching npm release. In a new non-public staging directory:

```sh
tar -xzf longtail-forge-<version>.tgz --strip-components=1
npm ci --omit=dev
npm start
```

The tarball contains `npm-shrinkwrap.json`, so `npm ci --omit=dev` is the settled runtime install command. Do not replace it with an unconstrained `npm install`, and do not run the application from the public web root. Supply the real `.env` or service-manager environment separately; never add secrets to the artifact.

`npm run start:worker` starts the optional same-host separate worker from the same installed artifact. Docker Compose, the systemd supervisor example, persistence, upgrade/rollback, and the host Caddy boundary are documented in [Docker and Bare-Metal Preview Deployment](preview-deployment.md); this artifact does not expose the Node listener directly to the internet.

The artifact also carries the `backup:create`, `backup:inspect`, `backup:export`, and `backup:restore` whole-instance commands, `workspace-backup:inspect` and `workspace-backup:restore`, and the explicit `workspace:purge` queue command. Their checksummed formats, Secure Notes key prerequisites, recovery procedures, and irreversible deadline/fencing rules are defined in [Baseline Backup and Restore](backup-restore.md), [Workspace Backup Package](workspace-backup.md), and [Workspace Deletion Grace Period and Final Purge](workspace-deletion.md). The disposable `backup:drill`, `workspace-backup:drill`, and purge regressions remain repository-only test tooling.

## Inventory

Every tarball includes `RUNTIME-ARTIFACT.json` with the canonical application version, validated source branch (or `null` only for an explicitly local build), install/start commands, runtime dependency names, included paths, and exclusion categories. The human-readable inventory is:

- Runtime entrypoints: `server.js` and `worker.js`.
- Runtime JavaScript, schemas, migrations, and database baseline: `src/`.
- Browser and view assets required by the app: `public/js/`, `public/css/`, the served logo/favicon, `views/`, and the bundled Lucide license notice.
- User Help content loaded by the Help service: `help/`.
- Runtime/operator contract files: `.env.example`, `.nvmrc`, `README.md`, `SECURITY.md`, `LICENSE`, this document, runtime configuration, operational security, preview deployment/Compose environment/systemd guidance, the reference internet-deployment/Caddy files, and SQLite small-office guidance.
- Runtime dependency and install metadata: a runtime-only `package.json` and pruned `npm-shrinkwrap.json`.

The boundary deliberately excludes development dependencies, tests, end-to-end specifications, regression/release tooling, development fixtures and source artwork, `.env` and other local secrets, live databases and Files data, logs, caches, process state, roadmaps, TODOs, decisions, changelog history, and unrelated developer/marketing/licensing planning documents.

## Release boundary

The builder copies only its explicit allowlist into a disposable staging directory before packing. It does not pack the working tree directly, which prevents ignored or untracked local state from entering the artifact. The release gate inspects the packed file list, the pruned dependency metadata, the versioned filename, and checksum format. The separate clean-install smoke is the executable proof that the runtime does not need repository-only development dependencies.
