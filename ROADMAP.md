# Longtail Forge Roadmap

This file is the detailed per-version forward plan for Longtail Forge. README.md should stay cursory and point here for version-level detail.

Active cursor: `0.33.33`.
Archived sections are maintained in ROADMAP-ARCHIVE.md.

These version plans are governed by the standing architecture boundaries in `DECISIONS.md` — the Product North Star (product-first framework direction), the Framework and Module Boundary, the Two-Module Rule, and the gradual-modernization and regression-direction rules. `DECISIONS.md` is the single canonical home for those boundaries; this file plans versions against them rather than restating them.

## Version 0.33.33 - Lean Core, Full Strict TypeScript, and Verification Simplification

**Model: High Effort** - This branch changes release policy, regression ownership, compiler coverage, and high-fan-in source boundaries across the repository; subtle losses could hide behavior or type debt.

Purpose:

Make Longtail Forge materially cheaper to change before Support Tickets begins: remove historical and duplicate verification weight without weakening live protections, place every first-party JavaScript file in a full-strict TypeScript program, and cut only source boundaries whose dependency edges genuinely improve.

Confirmed planning baseline:

- [ ] Treat the source-backed audit at revision `375ecb52` as the branch baseline. Fresh probes reproduce `864` current-dial and `9,734` full-strict server/test errors, `4,909` current-dial and `11,134` full-strict browser errors, and `3,824` current-dial and `11,625` full-strict script-only errors.
- [ ] Start from `982` first-party JavaScript/MJS files, only `150` checked through file pragmas, no real checker suppressions, and `832` unchecked files. The scripts program does not exist yet and the browser program covers only nine shared files.
- [ ] Start from `464` discovered regressions: 238 static, 192 isolated-database, 28 isolated-files, and 6 serial-database. The latest measured CI regression wall is 107 seconds and the full gate is about 2.5 minutes; this is a maintenance-weight and process-model release, not a claim that CI is slow.
- [ ] Preserve the audit's load-bearing/deadweight distinction: roughly half of assertion calls are regex-on-text, 192 programs inspect planning/history/documentation surfaces, 11 fake-DOM harnesses and 81 `escapeRegExp` helpers are duplicated, and the 3,815-line/409-check permission harness is outside discovery. These facts justify consolidation, but no test is removable merely because it is large, static, or slow.
- [ ] Treat the missing Notes/Lists edge schemas, classic-script browser global collisions, four browser descriptor fallbacks, Workbench loader coupling, oversized service seams, file-count coverage floors, and repeated per-slice ceremony as confirmed change drivers.
- [ ] Measure success by meaning density and dependency locality. Honest JSDoc/contracts will grow `src/` and `public/`; expected net line reduction belongs primarily to `scripts/`, not application source.

Branch delivery contract:

- [ ] Open one version-wide `0.33.33` topic branch before implementation and retain it through 0.33.33.48. Publish each internal numbered checkpoint through a focused protected pull request from that branch into `nightly`; checkpoints are reviewable integration units, not separately packaged application releases.
- [ ] Land ceremony and verification-infrastructure savings first so later checkpoints use the cheaper rules. Each checkpoint still runs one canonical `npm run verify:slice` against its final tree and protected CI still supplies clean-Linux proof.
- [ ] Use checked JavaScript, JSDoc, runtime Zod schemas, and `.d.ts` contracts. Do not mass-rename existing runtime files to `.ts`, introduce a compile/serve step, change `npm start`, add browser bundling, or convert classic browser delivery to ES modules in this branch.
- [ ] Finish all three programs under unqualified `strict: true` with `checkJs: true` and `noImplicitAny` enabled inside `0.33.33`. There is no `0.33.34.1` TypeScript overflow; Public Demo Analytics now owns `0.33.34`.
- [ ] Keep one monotonic generated error ledger only while debt remains. It must fail on a new unchecked file, new error, per-file increase, unjustified explicit `any`, or suppression; delete the ledger and retire its temporary gate when all three programs reach zero.
- [ ] Burn each owner to full strict once after the shared cascade fixes land instead of touching the same files in separate current-dial and `noImplicitAny` passes.
- [ ] Retain child-process isolation for database, Files, serial, environment-sensitive, and child-spawning regressions. In-process static execution is audit-gated and opt-in with a child-process fallback; do not merge isolated-database programs or move slow tiers without measured runtime evidence.
- [ ] Preserve attested-baseline fail-closed proof, canonical-workspace fingerprinting, backup/restore/purge and migration-chain coverage, parameter-binding and module-import audits, permission/session/auth/Support View proofs, Files quota/scanner/streaming coverage, Playwright accessibility/console/overflow coverage, the four closeout regenerators, exact-SHA Nightly/promotion proof, CodeQL, and dependency review.
- [ ] Do not split `view-builder.js` factories, `user-admin.js`, task-dialog subsystems, or any browser controller that remains an unwrapped classic script. Decomposition is allowed only at the verified seams named below or when typing exposes equivalent evidence and the roadmap is updated first.

Resliced checkpoint rule: parent identifiers `0.33.33.16`, `.17`, `.18`, `.21`, `.22`, `.25`, `.26`, `.28`, `.28.5`, `.28.6`, `.30`, `.30.2`, `.30.3`, `.30.7`, `.30.7.2`, `.31`, and `.32` are planning rollups only. Their numeric child sections are the protected implementation checkpoints; completing and archiving the final child closes the parent without a separate parent pull request. Later checkpoint numbering remains unchanged. A corrective child added after a parent's earlier children archived (for example `0.33.33.25.6` through `0.33.33.25.10`) reopens that parent until the new final child archives.

Release-wide measurable acceptance:

- [ ] Every first-party server, test, script, and browser JavaScript file belongs to its owning checked program with no file omitted from the combined program universe, file pragmas, `@ts-ignore`, `@ts-nocheck`, or unexplained `any`; `npm run typecheck` is green under full strict.
- [ ] Every retired or consolidated regression has a machine-checked assertion disposition and named continuing owner. Assertion inventory is at least the baseline minus reviewed true duplicates, and protected behavioral owners remain intact.
- [ ] **No active regression, gate, or operational verification owner depends on historical release-specific `ROADMAP-ARCHIVE.md` or `CHANGELOG.md` content, or on obsolete live-roadmap breadcrumbs, as evidence for current behaviour.** Every surviving planning or history read owns a current live structural or release-process contract and carries a recorded rationale. Scanner coverage is evidence supporting this acceptance, not the acceptance itself.
  - **Forbidden:** an assertion that archived release prose still contains particular wording, or that the live roadmap no longer contains a named completed heading or breadcrumb, used as proof that the code behaves a certain way today.
  - **Allowed:** live roadmap structure and cursor advancement, the version handoff, changelog structure, release-process and routing invariants, and any other read whose subject is a contract that is still live. Naming a planning document as a *path* in a routing table, a ceremony inventory, or an allowed-paths list is a path reference, not a history dependency.
  - **Scanner completeness is not the criterion.** `0.33.33.32.28` restated this deliberately, because the previous wording made a filename grep the standard and five blind-spot classes were then found in it - content readers outside the original pattern, live-roadmap breadcrumb checks the historical pattern cannot see, cursor-floor helpers that name no document, filenames written inside escaped regular expressions, and owners that are not discovered regressions at all. **Every one of the five turned out to be benign once classified.** A rule that demands perfect textual detection of every way a file can mention a filename measures the scanner, not the estate. The baseline stays as shrink-only governance evidence; semantic classification is what the acceptance asks for.
  - Measured at `0.33.33.32.28`: **68 files under `scripts/` name a planning document in some form** - 50 in discovered regressions, 13 in retired scripts still on disk, and 5 in operational tooling that reads the live roadmap by design. The pin baseline records **7 historical content pinners and 24 planning-document readers**, and every one of the 7 names the documents only as path strings in a routing or ceremony table.
- [ ] The static estate uses one shared source reader, one `escapeRegExp`, and one fake-DOM harness. The permission harness is discovered and floor-counted.
- [ ] The target full run uses roughly 250-300 Node processes and roughly 250-300 discovered regression entry points without increasing the measured verification wall. These are review targets, not permission to weaken coverage if runtime evidence disagrees.
- [ ] Internal checkpoints normally touch no more than two ceremony files; each completed checkpoint's roadmap-to-archive handoff is the final bookkeeping commit in the same protected implementation pull request and becomes authoritative on merge, while release version, changelog rollup, durable decision/docs updates, and runtime identity proof batch at branch closeout.
- [ ] The branch records final before/after compiler, regression, process, assertion, history-reader, dependency-cycle, scripts-line, and module-locality measurements with hypotheses labeled separately from enforced contracts.

### 0.33.33.32 - Type product regressions and close the scripts program

**Model: High Effort** - The remaining legacy and module estate is mechanically large and must retain complete coverage metadata.

Planning rollup only; its numbered children below are the protected implementation checkpoints. The reslice this rollup owed itself has been taken. A measured probe against the tree at `48ce14df`, immediately after `0.33.33.31.11.1` merged, puts the remaining scripts program at **3,150 diagnostics across 202 diagnostic-bearing files and 56,631 lines** — 1.8 times the 1,758 that forced the eleven-way `0.33.33.31` reslice, 2.4 times the 1,319 that forced the seven-way `0.33.33.30` reslice, and the largest cohort the branch has faced. The figure reconciles exactly with the generated ledger, so the reslice below is authoritative rather than provisional.

Cohort boundary: this rollup owns everything left in the scripts program. That is the product estate `0.33.33.31` explicitly deferred here — Tasks, Notes, Lists, Time Tracking, Workbench, Search, Tags, Notifications, Help, Clients/Projects, linked context, and public API — plus the view-descriptor, app-shell, and module-action static owners, the product-area modules under `scripts/regression-contracts/`, and the remaining legacy and operational owners. Nothing in `public/js/` belongs here; the browser program is `0.33.33.38` through `0.33.33.41`.

The reslice follows the seams the estate already has — subsystem ownership and shared fixtures — not counts. Every one of the 202 files was assigned to exactly one child, and the children summed to the measured 3,150. `0.33.33.32.1` through `0.33.33.32.28`, plus the corrective children `0.33.33.32.22.1`, `0.33.33.32.28.2`, and `0.33.33.32.28.3.2`, have since archived, closing **all 3,143 diagnostics across all 202 files** — the measured cohort exactly — and leaving 0 across 0, with the repository's explicit-`any` count also at 0. Reaching zero once is not the same as proving it stays there: `0.33.33.32.28.1` is still the only child that may close the scripts program's governance state, and it runs only after the three corrective children `0.33.33.32.28` opened; `0.33.33.32.7` also removed four further diagnostics by correcting the TimeEntry write contract. Every remaining child below was remeasured against the live ledger before `0.33.33.32.11` began; all seventeen reconcile exactly to 1,753 across 134, and only `.32.25` moved, because `0.33.33.32.10` closed one module that belongs to it. `0.33.33.32.10.1` has since archived, correcting the resume-state resolver scope seam without moving either program's totals:

| Child | Subject | Diagnostics | Files | Lines |
| --- | --- | --- | --- | --- |
| `.32.28.3` | Narrow the package manifest and lockfile boundaries | 31 sites | 20 | — |
| `.32.28.3.1` | Narrow the generated policy, ledger, and audit reads | 14 sites | 8 | — |
| `.32.28.3.3` | Narrow the in-test synthetic and computed sources | 22 sites | 19 | — |
| `.32.28.4` | Migrate family B, top-level owners | 15 defs | 15 | — |
| `.32.28.4.1` | Migrate family B, contract modules | 16 defs | 16 | — |
| `.32.28.4.2` | Migrate family C, Tasks contract modules | 15 defs | 13 | — |
| `.32.28.4.3` | Migrate family C, Files contract modules | 8 defs | 8 | — |
| `.32.28.4.4` | Migrate family C, top-level owners | 8 defs | 8 | — |
| `.32.28.4.5` | Migrate family C, remaining module areas | 10 defs | 10 | — |
| `.32.28.1` | Final scripts-program closeout and measurement | 0 | 0 | — |

`0.33.33.32.7` was resliced before implementation after `0.33.33.32.5` exposed that `timeEntriesRepository.create()` uses the normalized read record as its write contract. A measured probe put the correct repair at two production files, three already-closed consumers, and a scripts program that falls to 2,321 rather than rising, so the production seam correction is separated from the eight timer and billing owners it would otherwise ship beside. The two children sum to 202 rather than the originally measured 206 because the contract correction legitimately removes four diagnostics from `time-entries-repository-conversion`.

Sizing evidence for the typing children: the twenty-seven span 34 to 206 diagnostics against a proven `0.33.33.31` range of 96 to 217, and 985 to 3,001 lines against a proven range of 1,321 to 6,369. Two children sit outside the usual line band for reasons that are recorded rather than hidden. `.32.10` carries 3,001 lines because `work-focus-modes-regression.mjs` alone is 1,467 lines while contributing only 53 diagnostics, so its line count overstates the session cost. `.32.25` and `.32.26` carry 15 and 21 diagnostic-bearing files — a subset of the 19 and 41 modules their aggregators own — because declarative contract modules average 120 lines and two diagnostics each; the closest precedent is the 28-file `0.33.33.30.7.2` closeout, which held. Every file count in this table is diagnostic-bearing files, not aggregator inventory. If any child's first working probe disagrees with its measured size, reslice that child before starting rather than absorbing the overflow.

The diagnostic profile is mechanical and dominated by the same two shapes as the previous rollup: **1,915 `TS7006`** implicit-any parameters and **518** nullability diagnostics (`TS18047`, `TS18048`, `TS2531`, `TS2532`), with `TS2339` property reads a distant third. That means the work is roughly linear in files, and that the nullability band is where a careless non-null assertion would silently manufacture an inherited zero.

The two closeout children are not bookkeeping. A measured probe puts **78 of the 202 owners** in scope for the rollup-wide dynamic-boundary audit — 39 `JSON.parse` sites across 28 owners, 61 owners reading `*_json` columns, and 5 spawning child processes — before counting the 34 estate-wide history-pin survivors, the explicit-`any` detector correction, and the helper sweep across twenty-seven children's new helpers. The equivalent audit at `0.33.33.31.11` found 21 real boundaries across 10 files in a rollup less than half this size, and the corrections it required were substantial. `.32.28` therefore owns the audits and everything they find, and `.32.28.1` owns the final proof and measurement, so that a large audit finding cannot force closeout proof into the same session as the fixes.

`.32.28.1` is the only child that closes the scripts program. No earlier child may change the scripts ledger's governance state, relax `tsconfig.scripts.json`, or claim the release-wide history-document acceptance.

Requirements shared by every child:

- [ ] Introduce no explicit `any`, `@ts-ignore`, `@ts-nocheck`, file pragma, or `tsconfig.scripts.json` exclusion, and keep every operational entry point directly runnable. Pin each closed owner strict-clean through `framework.full-strict-governance` and run one canonical `npm run verify:slice` against the child's final tree.
- [ ] Reuse published `src/types/` contracts by type-only import wherever one already truthfully describes a shape; do not redeclare rows, payloads, or descriptors that already have a contract.
- [ ] Inventory the dynamic boundaries the child's own owners touch and record a disposition for each — narrowed through a published contract, narrowed locally from `unknown`, intentionally left open with concrete rationale, or not present. A measured `JSON.parse` count is given per child below as a starting point, not as the whole inventory: database `*_json` columns, child-process output, filesystem reads, environment records, and event payloads count even where no `JSON.parse` appears.
- [ ] Require `JSON.parse`, parsed response payloads, JSON-bearing database columns, child-process stdout and stderr, filesystem JSON, environment and configuration records, message/event/job payloads, and provider or mock responses to enter as `unknown` unless a published production contract already exists and truthfully describes the value. Never replace an `any` boundary with an unchecked cast that only gives it a more impressive name.
- [ ] **Treat `TS2353` as a diagnostic requiring cause analysis, not as evidence of contract drift.** `0.33.33.32.8` and `0.33.33.32.10` both carried roadmap language predicting their `TS2353` bands were object literals disagreeing with a published contract, and both predictions were wrong in the same way: the parameter receiving the literal was a destructured object whose type the checker inferred from its defaulted members only, so the properties every caller passes were absent from the inferred type. Thirty-two diagnostics across the two children had that single cause and no contract was at fault. Before changing any published contract to resolve a `TS2353`, inspect the diagnostic site, inspect the receiving parameter or producer type, check for destructured defaults and under-inferred helper inputs, and only then confirm the literal genuinely disagrees with what the runtime publishes. Name the parameter with a truthful type when the cause is inference; change the contract only when the contract is wrong.
- [ ] **Verify every scripted multi-site edit before starting the next one.** After each regex or scripted transformation, inspect the resulting diff and run the cheapest applicable parser, lint, or owner check immediately; do not stack mechanical rewrites and rely on the final `npm run verify:slice` to find structural mistakes. This rollup has already produced three: a greedy `const X = await [^;]+;` pattern that inserted an assertion inside a SQL template literal, a shell-escaped replacement that left an unterminated string literal, and a blanket `X.body.` rewrite that pointed one suite's assertions at a payload declared in another function because two suites bound the same response name. Prefer literal multi-line anchors over greedy patterns, prefer an editing tool over shell-escaped inline scripts when the replacement carries quotes or regex metacharacters, and treat "the patch script reported success" as no evidence.
- [ ] Runtime-prove nested arrays and objects wherever an assertion depends on their shape. A top-level object guard proves only the top level, and `0.33.33.31.11.1` had to correct three annotations a same-length string would have satisfied.
- [ ] Keep helper contracts honest under the `0.33.33.31.6.1` rule: a helper must not reach zero by erasing information its callers already had, and a helper whose annotation forces compensating casts, fallbacks, or hand-rebuilt types downstream has the wrong contract.
- [ ] Do not resolve a nullability diagnostic with a non-null assertion where the owner can assert the value instead. This band is 518 of the 3,150 and is the likeliest source of a zero that the compiler believes and the runtime does not.
- [ ] Strip historical `ROADMAP-ARCHIVE.md` and `CHANGELOG.md` pins from the owners the child touches, recording each disposition; any surviving planning-document read must assert a current live contract. 41 of the 202 files carry such a pin today, counted per child below.
- [ ] **Inventory both pin categories per child; the per-child counts above are historical content pinners only.** `0.33.33.32.13` and `0.33.33.32.14` were both recorded as having no history-pinned owners and both turned out to carry a dead planning-document read — a `0.33.5.21` breadcrumb check and an `assertRoadmapCursorAtLeast("0.33.8")` floor respectively, neither of which a live 0.33.33 cursor can fail. The second was invisible to `scripts/planning-document-pin-baseline.json` by construction: its scan matches planning-document filenames, so a cursor-floor caller importing `scripts/lib/roadmap-cursor.mjs` without naming a document is never counted. **Eleven owners estate-wide have that shape**; `0.33.33.32.28` owns deciding what to do with the rest.
- [ ] Preserve child-process isolation, discovered-coverage floors, and existing assertion meaning. Retiring an assertion requires the `retiredAssertions` mechanism established at `0.33.33.30.7.2`, not a silent deletion.

`0.33.33.32.28` has archived. It resolved the contract findings, closed the explicit-`any` inventory, corrected the planning-document acceptance above, and opened corrective children for the findings too large to absorb.

**Those children were then resliced, planning-only, before any of them started.** Two were still too large as implementation units, and remeasuring them corrected two figures `0.33.33.32.28` had recorded:

- The source-slicing helper inventory is **79 definitions across 77 owners**, not 75 across 73. Four owners annotate their helper parameters inline — `function functionBlock(/** @type {string} */ source, ...)` — and the definition matcher that produced the original figure required a bare parameter list, so it skipped them. All four are family B, in `scripts/` top level.
- The assertion figure is **135 negative and 792 positive**, not 138 negative. The original counter summed per helper name and could count one `assert.doesNotMatch` twice when an owner bound the same helper under two names; the corrected counter deduplicates by call-site offset.

The unchecked-boundary figure was confirmed unchanged at **77 sites across 55 owners**. `0.33.33.32.28.3.2` has since closed 10 of them across 8 owners, leaving **67 across 47** for the three remaining boundary children.

**Execution order.** `0.33.33.32.28.2` and `0.33.33.32.28.3.2` have archived. Next are the three remaining `0.33.33.32.28.3*` boundary children, then the six `0.33.33.32.28.4*` helper children, and **`0.33.33.32.28.1` last**. The numbering is historical, not an execution order; `0.33.33.32.28.1` is not renumbered because it is referenced by every closeout rule in this rollup.

**Reconciliation contract.** Every one of the 77 boundary findings belongs to exactly one `.32.28.3*` child and every one of the 79 helper definitions to exactly one `.32.28.4*` child or to the recorded local dispositions. No owner appears in two children: the boundary partition assigns whole owners rather than individual sites, so an owner is edited once and pinned once. Each child below states its own site or definition count, and the counts sum to the totals.

#### 0.33.33.32.28.3 - Narrow the package manifest and lockfile boundaries

**Model: Medium Effort - The producer-collapse child: one shared helper pair already exists for all of it.**

**31 sites across 20 owners.** 24 of the 31 parse `package.json` or `package-lock.json`; the remaining 7 are other boundaries in those same owners, taken here so no owner is edited by two children. This is the single largest collapse available: `scripts/test-support/package-manifest-assertions.mjs` already publishes `requirePackageManifest` and `requirePackageLock`, and `0.33.33.32.28` already extended `PackageLockManifest` with the root-entry shape ten owners were reading through `unknown`. **No new contract is needed — only adoption.**

- [ ] Route all 24 manifest reads through the published helpers, and the 7 co-located boundaries through `requireJsonRecord` or `readPayload` as their kind requires.
- [ ] Extend `PackageManifest` or `PackageLockManifest` only where an owner reads a member the published shape does not declare, and only with members that genuinely exist.
- [ ] Owners: `better-sqlite3-install-smoke`, `demo-data-host`, `file-storage-scanner-runtime-closeout`, `lib/package-script-runner`, `lib/public-demo-baseline-candidate`, `lib/regression-manifest`, `lib/third-party-notices`, `regression-contracts/views/markdown-renderer-service`, `regressions/database/backup-restore-foundation`, `regressions/database/workspace-backup-package`, `regressions/framework/bundled-module-registry`, `regressions/framework/express-5-http-contract`, `regressions/release/closeout-conductor`, `regressions/release/current-static-contracts`, `regressions/release/dependency-baseline`, `regressions/release/developer-verification-throughput`, `regressions/release/playwright-dev-only-boundary`, `regressions/release/runtime-artifact-boundary`, `runtime-artifact-smoke`, `workspace-backup-drill`.

#### 0.33.33.32.28.3.1 - Narrow the generated policy, ledger, and audit reads

**Model: Medium Effort - Eight owners reading files this repository generates.**

**14 sites across 8 owners.** These parse `scripts/regression-coverage-*.json`, `scripts/regression-legacy-snapshot.json`, `scripts/typecheck-debt-ledger.json`, the isolation audits, and the compose-reset operation markers. Every one is a file the repository writes, so the shapes are knowable exactly and several owners read the same artefact.

- [ ] Narrow through `requireJsonRecord` with local shapes naming only the fields each owner reads. Do not attempt a whole schema for the coverage policy or the ledger.
- [ ] Where three or more owners read the same artefact, consider publishing one shape in `scripts/test-support/` rather than three local ones — but only if the fields actually overlap.
- [ ] Owners: `regression-contracts/database/migration-runner-checked-boundary`, `regressions/framework/asset-cache-version`, `regressions/release/files-regression-isolation-audit`, `regressions/release/public-demo-compose-reset`, `regressions/release/regression-baseline-bypass-audit`, `regressions/release/regression-discovery-runner`, `regressions/release/regression-routing-commands`, `test-support/typecheck-ledger`.

#### 0.33.33.32.28.3.3 - Narrow the in-test synthetic and computed sources

**Model: Medium Effort - Nineteen owners, one or two sites each, no shared producer.**

**22 sites across 19 owners.** These parse a source the owner built or computed itself — a synthetic ledger, a fixture written moments earlier, a git-show of a tracked file, a captured child-process line. They have no common producer, which is why they are one child by shape rather than by artefact.

- [ ] Narrow each through `requireJsonRecord` with a local shape naming only what the owner reads. Where the owner wrote the fixture itself, the shape is exact and should say so.
- [ ] Do not add runtime guards around values that are already statically typed. The audit counted structured boundaries, not every read.
- [ ] Owners, by area — release: `regressions/release/immutable-image-publication`, `regressions/release/maintenance-release-rehearsal`, `regressions/release/preview-deployment-boundary`, `release/checkpoint-commits`, `release/install-playwright-browser`. Framework: `regression-contracts/framework/calendar-subscription-settings`, `regression-contracts/framework/identifier-authority`, `regression-contracts/framework/markdown-checked-core`, `regression-contracts/framework/password-startup-checked-core`, `regressions/framework/module-import-boundaries`, `regressions/framework/public-legal-surfaces`, `regressions/framework/support-view-request-enforcement`. Library and top level: `build-runtime-artifact`, `lib/demo-data-operation`, `lib/development-data-safety`, `lib/docs-change-routing`, `lib/sanitized-demo-role-fixtures`, `regressions/permissions/public-demo-role-journey`, `regressions/permissions/sanitized-demo-role-journey`.

Rules shared by every `0.33.33.32.28.4*` child:

- [ ] **Prove equivalence per owner. "All owners still pass" is not evidence.** For each migrated helper, prove the published helper extracts the same region as the owner's previous helper for every name that owner asks for — or, where the region genuinely differs, prove the assertions still mean what they meant.
- [ ] **Every negative assertion needs a seeded control.** `assert.doesNotMatch` cannot fail by being given too little text, so a migration that narrows the extracted region silently turns a real proof vacuous. For each negative assertion in scope, seed the forbidden text *inside the intended region* and confirm the assertion fails; then remove it and confirm it passes.
- [ ] Publish one family-C helper contract in `scripts/test-support/source-scan.mjs` and have every family-C child use it. The family-C children may land in any order but must not each invent their own.
- [ ] Leave families A and other local. Family A is 5 definitions across 5 Workbench contract modules returning the body without its braces, and the two remaining definitions match no family. Seven definitions do not justify a third published contract, and each is recorded rather than migrated.

#### 0.33.33.32.28.4 - Migrate family B, top-level owners

**Model: High Effort - The family the published helper already matches, but the region still has to be proved.**

**15 definitions across 15 owners, feeding 51 positive and 17 negative assertions.** Family B returns the whole balanced block including its braces, which is what `extractFunctionBlock` already returns — keyed off a regular-expression declaration match rather than `indexOf`, which is the one difference that must be proved rather than assumed. **Four of these fifteen are the owners the original inventory missed**, which annotate their parameters inline.

- [ ] Migrate all fifteen to the published `extractFunctionBlock`, per-owner, with the shared equivalence and seeded-control rules above.
- [ ] Pay particular attention to the `indexOf`-versus-regex difference: a local helper that finds `function foo(` by substring will also match `asyncfunction foo(` or a call site inside a comment, where the published helper's anchored pattern will not. Where the two disagree on a real source, the published helper is right and the assertion may need re-reading.

#### 0.33.33.32.28.4.1 - Migrate family B, contract modules

**Model: High Effort - Sixteen contract modules, and the densest assertion load in family B.**

**16 definitions across 16 owners, feeding 177 positive and 37 negative assertions** — 89 positive in the Workbench contract modules alone. Same migration as `0.33.33.32.28.4`, separated because these owners are loaded by area aggregators and a failure here fails a whole area.

- [ ] Migrate all sixteen, with the shared equivalence and seeded-control rules above.
- [ ] Areas: Workbench (8), Files (3), Notes (1), Tags (1), Tasks (1), Views (1), and one `regressions/workbench` owner.

#### 0.33.33.32.28.4.2 - Migrate family C, Tasks contract modules

**Model: High Effort - The largest single assertion load in the estate.**

**15 definitions across 13 owners, feeding 199 positive and 21 negative assertions.** Family C returns the declaration through the *next top-level declaration*, which is a different region from anything published: it includes whatever follows the function, which several owners rely on to assert about trailing constants. **This child publishes the family-C helper contract** that `0.33.33.32.28.4.3` through `.4.5` then consume.

- [ ] Publish one family-C helper in `scripts/test-support/source-scan.mjs`, named for what it spans rather than for what it is not — the region from a declaration to the next top-level declaration.
- [ ] Prove the published helper's region equals each owner's previous region for every name that owner asks for, and seed a control for all 21 negative assertions.
- [ ] Two owners define two family-C helpers each; both definitions must be migrated or neither.

#### 0.33.33.32.28.4.3 - Migrate family C, Files contract modules

**Model: High Effort - Eight owners, 239 positive assertions.**

**8 definitions across 8 owners, feeding 239 positive and 23 negative assertions.** Consumes the family-C helper `0.33.33.32.28.4.2` publishes; does not define its own.

- [ ] Migrate all eight, with the shared equivalence and seeded-control rules above.

#### 0.33.33.32.28.4.4 - Migrate family C, top-level owners

**Model: High Effort - The highest negative-assertion density in family C.**

**8 definitions across 8 owners, feeding 28 positive and 14 negative assertions.** Half as many positives as the Files child but two thirds as many negatives, which makes this the child where a silent vacuity would be most likely and least visible.

- [ ] Migrate all eight, with the shared equivalence and seeded-control rules above.
- [ ] Seed a control for every one of the 14 negative assertions without exception.

#### 0.33.33.32.28.4.5 - Migrate family C, remaining module areas

**Model: Medium Effort - Ten owners across six areas, one or two definitions each.**

**10 definitions across 10 owners, feeding 52 positive and 10 negative assertions.** Views (3), Lists (2), Notes (2), and one each in the framework contracts, `regressions/database`, and `regressions/time-tracking`.

- [ ] Migrate all ten, with the shared equivalence and seeded-control rules above.
- [ ] Re-measure the whole helper inventory afterwards. If family A and the two unclassified definitions are all that remain, record that as the end state and close the consolidation rather than inventing a third contract for seven definitions.

#### 0.33.33.32.28.1 - Prove the scripts program permanently strict-zero

**Model: High Effort - The proof and measurement checkpoint that closes the rollup.**

Runs after `0.33.33.32.28`. No diagnostics and no audit backlog: this child exists so that a large audit finding at `.32.28` cannot force closeout proof into the same session as the fixes.

- [ ] Confirm the scripts program is at zero under unqualified `strict: true` with `checkJs: true` and `noImplicitAny: true`, with no file pragma, `@ts-ignore`, `@ts-nocheck`, exclusion, or unjustified `any` anywhere in `scripts/`. `tsconfig.scripts.json` already carries these flags directly, so the remaining work is proof, not configuration change; record that plainly rather than claiming an enablement that already happened.
- [ ] **Retire the scripts debt at zero rather than deleting its ledger section, mirroring what `server-tests` already does.** The earlier plan to delete the section was wrong and would have broken live governance: `scripts/regressions/framework/full-strict-governance.regression.mjs` asserts `Object.keys(ledger.programs)` is exactly `["server-tests", "browser", "scripts"]`, pins named scripts owners strict-clean through `ledger.programs.scripts.diagnostics[path] === undefined`, and floor-checks whole scripts subtrees the same way. The `server-tests` program reached zero at `0.33.33.26.2` and kept its section, guarded by an explicit assertion that it "is retired at zero and may never regain debt". Apply that identical pattern to scripts: empty `diagnostics`, `errorCount` of `0`, section retained, and a new governance assertion that the scripts program may never regain debt. The ledger itself retires when all three programs reach zero at `0.33.33.41`.
- [ ] State the invariant the retirement must preserve: once the scripts debt retires, the scripts program must continue compiling under full strict on every canonical `npm run typecheck`, and source-policy enforcement for scripts must continue. Removal from the debt ledger means "this program is permanently required to remain at zero", never "this program is no longer checked".
- [ ] Re-run the assertion, entry-point, and process inventory after strict closure and record before/after figures against the branch baseline, keeping hypotheses separate from enforced contracts.
- [ ] Record the final rollup measurements — closing diagnostics, files, explicit-`any` count after the detector correction, surviving history-document readers, and the boundary-audit result — and close the `0.33.33.32` rollup.
- [ ] Add no new regression owner, fixture, or route, and change no production behaviour. This child proves and records; it does not extend coverage.

### 0.33.33.33 - Isolate classic browser controllers with IIFEs

**Model: High Effort** - Mechanical wrapping can break implicit globals and page initialization across many surfaces.

- [ ] IIFE-wrap every remaining bare classic controller and explicitly publish only supported `window.LongtailForge.*` surfaces. The 0.33.33.25-era re-audit counts 27 bare classic scripts, not the originally audited fourteen: the module/page controllers plus thirteen leaf and support scripts (`splash`, `footer`, `login`, `account-recovery`, `module-settings`, and similar); record a wrap-or-justify disposition for each.
- [ ] Preserve classic-script loading and Workbench dynamic `import()` compatibility without adding modules, bundling, or script-order changes.
- [ ] Remove real and compiler-visible global lexical collisions, including the `api`/`view`/`state` family.
- [ ] Prove every affected page through focused view contracts and Playwright before accepting the browser ledger change.

### 0.33.33.34 - Extract the Workbench module-action loader and Files bridge

**Model: High Effort** - The loader is shared framework machinery whose dependency table controls several module controllers.

- [ ] Move the hard-coded action dependency table and loader to `public/js/shared/` behind a typed stable contract.
- [ ] Remove Workbench's inline `filesDialog` stub once the canonical File Context/preview helper is loadable.
- [ ] Preserve asset versioning, lazy loading, module enablement, failure messaging, and action registration.
- [ ] Do not broaden the loader into a plugin system or change Workbench workflow behavior.

### 0.33.33.35 - Remove descriptor fallbacks and isolate view-renderer responsibilities

**Model: High Effort** - Shared declarative view interpretation is security- and behavior-relevant across many pages.

- [ ] Delete the five module-local descriptor fallbacks — the Notes/Lists/Files/Tasks view-surface fallbacks and the nested Notes linked-records fallback — and use the established null-and-skip contract for unavailable server descriptors.
- [ ] Extract descriptor-action permission/route interpolation, search-options combobox, and data binding from `view-renderer.js` behind explicit contracts.
- [ ] Extract only the modal stack from `view-builder.js`; keep the frozen factory namespace intact.
- [ ] Preserve server authority, action visibility, focus return, and current module surface anatomy.

### 0.33.33.36 - Share the Notes/Lists linked-context picker

**Model: High Effort** - Linked-context scope and safe labels cross module hierarchy and permission boundaries.

- [ ] Replace the duplicated Notes and Lists implementations with one shared typed picker contract.
- [ ] **Close the producer gap `0.33.33.32.23` measured before consolidating.** That child typed all six linked-context owners and reported plainly: `LinkTargetCandidate` in `src/types/link-target-directory-contracts.d.ts` **is** the right shape for the shared picker — the framework already publishes it, `linkTargetDirectory.list` already returns it, and its members are exactly what the six owners read. What is missing is on the producer. `notesService.listLinkTargets` declares no return type, and it builds `const targets = []` from two sources: the directory provider, which answers `LinkTargetCandidate[]`, and a local `listTargetsByType` whose literals are untyped. The inferred union widens `targetType` from the published `LinkTargetType` union to `string`, so **a consumer cannot annotate against the published contract without a cast**. That is why six owners each describe picker targets locally. Declare `listLinkTargets`'s return as `{ targets: LinkTargetCandidate[] }` and type `listTargetsByType` to match, before or as part of the consolidation; the shared picker will otherwise inherit the same untyped seam it is meant to remove.

- [ ] Preserve client/project descendant scope, unavailable/hidden labels, workspace type behavior, and saved selection rules.
- [ ] Keep module-owned payload meaning and save behavior outside the shared helper.
- [ ] Remove both old implementations only after Notes and Lists browser regressions pass.

### 0.33.33.37 - Share the Task action policy

**Model: High Effort** - Triplicated permission and lifecycle rules can expose invalid actions if consolidated incorrectly.

- [ ] Replace Tasks, Workbench, and Task Dialog action-policy copies with one typed shared policy module.
- [ ] Preserve permission, status, timer, blocking, recurrence, and module-enablement visibility rules.
- [ ] Keep rendering and workflow dispatch local to each surface.
- [ ] Prove identical action matrices at all three consumers before deleting the copies.

### 0.33.33.38 - Add typed DOM, API-response, and page-state browser contracts

**Model: High Effort** - These shared contracts collapse most browser error cascades and can encode unsafe assumptions if too broad.

- [ ] Add checked DOM lookup/assert helpers that return the correct element subtype or fail explicitly; do not turn required elements into optional no-ops.
- [ ] Add named API response and descriptor handoff contracts with `unknown` narrowing at network and view boundaries.
- [ ] Add page-state typedefs that prevent `{}`, `never[]`, and nullable-element cascades without inventing runtime data.
- [ ] Keep contracts in declaration/JSDoc surfaces and preserve response shaping on the server.

### 0.33.33.39 - Type shared browser framework code

**Model: High Effort** - Shared browser helpers have broad fan-in and include descriptor, recovery, modal, API, and shell behavior.

- [ ] Close full-strict debt in `public/js/shared/`, app-shell/bootstrap, navigation, dialogs, formatters, records, and view helpers.
- [ ] Use the new DOM/API/state contracts and narrow event targets explicitly.
- [ ] Preserve accessibility, focus, recovery, cache-version, CSP, and frozen namespace behavior.
- [ ] Reduce shared-browser ledger debt to zero.

### 0.33.33.40 - Type the Notes browser controller

**Model: High Effort** - Notes is the largest browser controller and includes secure content, revisions, links, collections, attachments, and Markdown.

- [ ] Close full-strict debt in Notes and its browser-owned helpers using named state, response, DOM, and action contracts.
- [ ] Preserve secure/plain note separation, safe Markdown, revision rules, linked context, attachments, and modal focus.
- [ ] Do not redesign the Notes surface or split new classic-script subsystems.
- [ ] Reduce the Notes browser ledger to zero with focused desktop/mobile proof.

### 0.33.33.41 - Type Tasks and Task Dialog browser controllers

**Model: High Effort** - Task lifecycle, recurrence, reminders, checklist, timers, and editor state share one high-risk workflow.

- [ ] Close full-strict debt in Tasks, Task Dialog, and task-owned browser helpers.
- [ ] Preserve list authority, canonical editor behavior, recurrence scope, blocking recovery, timer state, checklist saves, and action policy.
- [ ] Keep Task Dialog's shared closure intact except for already-authorized policy extraction.
- [ ] Reduce this browser ledger cohort to zero with rendered lifecycle coverage.

### 0.33.33.42 - Type Workbench and extract Task Focus

**Model: High Effort** - Workbench is a live orchestration surface with dynamic modules, timers, resume state, and recovery behavior.

- [ ] Extract the self-contained Task Focus mode behind typed inputs/events while preserving Workbench ownership of the live surface.
- [ ] Close full-strict debt in Workbench, action loading, candidate rendering, timers, and resume/recovery state.
- [ ] Preserve module contribution boundaries, no-raw-ID labels, focus capture, blocking recovery, and fallback navigation.
- [ ] Reduce the Workbench browser ledger to zero.

### 0.33.33.43 - Type Lists, Files, and Clients/Projects browser controllers

**Model: High Effort** - Three large operational surfaces share hierarchy and view helpers but retain distinct workflows.

- [ ] Close full-strict debt in Lists, Files, Clients/Projects, and their settings/helpers after shared extraction lands.
- [ ] Preserve server-side filtering, compact Files listing/modal rules, Lists execution/detail purpose, and hierarchy permissions.
- [ ] Use shared contracts without merging module-owned state or payload meaning.
- [ ] Reduce this browser ledger cohort to zero with focused module and Playwright coverage.

### 0.33.33.44 - Type remaining browser controllers and close the browser program

**Model: High Effort** - The final cross-surface pass must eliminate every remaining dial exception without hiding edge cases.

- [ ] Close full-strict debt in settings, admin, Search, Notifications, Help, calendar, support, recovery, footer/splash, and remaining page controllers.
- [ ] Remove browser `@ts-check` pragmas, enable direct all-file `checkJs` and `noImplicitAny`, and delete the browser ledger section at zero.
- [ ] Confirm all classic pages and the Dashboard bridge retain their existing delivery modes.
- [ ] Prove the three-program `npm run typecheck` is green with zero suppressions, first-party omissions, or unexplained explicit `any`.

### 0.33.33.45 - Extract proven module-development helper defaults

**Model: High Effort** - Shared module defaults and factories affect every first-party module and must satisfy the Two-Module Rule.

- [ ] Centralize the byte-identical public API response helpers and repeated record-indexer control flow with at least two existing consumers each.
- [ ] Default proven `createModuleEntry` constants only where all current consumers agree; do not hide meaningful module declarations.
- [ ] Keep route/service behavior explicit and do not create a route DSL, new manifest fields, empty concern files, or plugin hooks.
- [ ] Compose the oversized Time Tracking manifest only where current 500-line/75-line thresholds prove cohesive concern owners.

### 0.33.33.46 - Add the strict-clean module scaffold

**Model: High Effort** - The generator defines the default architecture inherited by Support Tickets and future modules.

- [ ] Add `npm run module:create -- <module-id>` for the proven minimal skeleton: module entry/public seam, contracts, repository, service, browser/public API routes, search indexer, view/controller, Help/docs, terminology, permissions/scopes, and regression-area home.
- [ ] Emit no empty-array padding, speculative concern composition, route DSL, framework edits, or Support Tickets feature behavior.
- [ ] Generate a throwaway module in a disposable fixture, build the registry/catalog, boot it, prove navigation/permission/search registration and strict-clean output, then remove it.
- [ ] Require untouched scaffold output to pass the normal validation contract without a transpile step.

### 0.33.33.47 - Establish dependency and module-locality ratchets

**Model: High Effort** - New architecture metrics become lasting gates and must distinguish useful signals from count theater.

- [ ] Add a maintained dependency-cycle measurement tool and record the honest baseline before enforcing a no-growth ratchet.
- [ ] Record median files touched for module-local changes, cross-module/framework edits for a standard capability, scaffold-to-green time, and ceremony-file count.
- [ ] Target zero framework-file edits for standard module capabilities and strict-clean new module output, but label timing/locality expectations as hypotheses until measured.
- [ ] Do not turn raw file or line counts into quality gates detached from dependency or behavior ownership.

### 0.33.33.48 - Lean Core branch closeout

**Model: High Effort** - Final closure must prove that reduced machinery retains every protected behavior and that no type debt remains hidden.

- [ ] Delete the temporary compiler ledger and retire superseded honesty/seam/pragma inventories only after all three direct full-strict programs are green.
- [ ] Record final before/after measurements and the complete protection-to-owner map, including any numeric target rejected for safety.
- [ ] Record the regression entry-point disposition against the 250-300 review target (347 as of 0.33.33.25.5, with the static reduction concentrated in contract-module re-parenting) and the `maximumActiveScripts` ceiling-regeneration ceremony future modules use to add discovered entry points.
- [ ] Run the branch-wide full regression, permission, browser, audit, packaging, dependency, and protected CI gates once against the final tree.
- [ ] Record the scripted multi-site edit discipline in `AGENTS.md` as durable working practice, carrying over the rule and the three concrete failures recorded in the `0.33.33.32` shared requirements.
- [ ] Roll up checkpoint trailers into the changelog and durable decisions/docs, bump once to `0.33.33`, archive the completed roadmap section, and prove `/api/app-info` from the exact candidate artifact.

## Version 0.33.34 - Public Demo Analytics, Privacy, and Interest Capture

**Model: High Effort** — Cross-domain analytics, consent, retention, and durable interest capture create privacy and security obligations even when the product events are anonymous.

Purpose:

Preserve the October 1, 2026 public-demo launch follow-on (moved from August 31, 2026 to allow additional features and the completed Lean Core branch) for privacy-respecting measurement and interest capture without mixing durable visitor data into the hourly-reset application database.

Dependencies and planned boundary:

- [ ] Build on 0.33.31's explicit demo profile and external-integration capability catalog. Keep analytics and interest capture disabled until this slice selects and documents the independently operated external boundaries.
- [ ] Before publishing first-party hosted Terms/Privacy or enabling public analytics, feedback, or interest capture, choose and record the review path appropriate to the actual launch scope, including whether professional legal review is warranted. Until that decision is complete, keep the neutral operator templates clearly labeled and all nonessential public data collection disabled; `0.33.25` does not claim legal approval.
- [ ] Define privacy-respecting analytics for the root marketing domain and demo subdomain, UTM campaign attribution, and anonymous demo-login/role-selection events with no record content, shared credential, stable user profiling, or cross-workspace identifier.
- [ ] Provide a permanent external mailing-list signup path and reset-surviving feedback channel; neither writes subscriber email, feedback, consent, or analytics data to the demo SQLite database.
- [ ] Document privacy/cookie notices, consent gating for all nonessential storage or tracking, retention/deletion ownership, IP and reverse-proxy log treatment, cross-domain data flow, and the separation between product analytics and security/audit logging.

Acceptance criteria:

- The October 1 launch has an explicit privacy and durable-interest-capture decision: any enabled measurement is consent-appropriate and documented, mailing-list/feedback data survives demo resets only in its governed external system, and 0.33.31 remains operable with all nonessential analytics disabled.

## Version 0.34 - Support Tickets Module

**Model: High Effort** — Tickets is a committed cross-module workflow with schema, permission, client-visibility, Files, API, and public-intake risk.

Purpose:

Ship Support Tickets as an official first-party Longtail Forge workflow module for the owner and invited users, not as a speculative vertical or market-gated product.

Decision:

- Tickets ships in the public core when complete and may be disableable per workspace where appropriate.
- Tickets integrates through existing contracts with Notes, Tasks, Time Tracking, Files, Search, Tags, Notifications, Workbench, and Reporting where appropriate, with a clean reviewed path into the later Knowledge Base module.
- Ticket ledger entries remain distinct from security audit records; internal notes remain distinct from client-visible replies.
- The module starts with the proven composed-manifest source pattern and native ES-module entry convention settled in 0.33.18.

Dependencies:

- 0.33.16 security hardening, 0.33.17 preview operations/seed foundations, and 0.33.18 manifest/frontend/testing conventions.

Non-goals:

- No email help desk, omnichannel support suite, automatic Knowledge Base publishing, or weakening of client/workspace/permission boundaries.

## Version 0.34.0 - Support Tickets Framework Contract

**Model: High Effort** — The ticket contract establishes schema, visibility, permissions, and contribution boundaries used by every later ticket slice.

* [ ] Add Support Tickets as a first-party workflow module.

  * [ ] Module ID should be `support-tickets`.
  * [ ] Tickets are workflow records, not framework/core records.
  * [ ] Tickets should use framework-owned services for users, workspaces, permissions, tags, search, notifications, audit logging, file attachments, events/hooks, API scopes, and module lifecycle.
  * [ ] Do not hard-code ticket behavior into framework-owned app shell, search, notification, file, or permission services.
  * [ ] Support Tickets should be disableable per workspace where appropriate.
  * [ ] Disabled ticket module should block new ticket writes while preserving historical reads if `historicalReadAccess` is enabled.
  * [ ] Compose the module source by substantial concern using the settled 0.33.18 pattern while exporting one validated runtime manifest; do not create empty boilerplate files.
  * [ ] Use the settled native ES-module browser entry pattern without adding new implicit global script-order dependencies.

* [ ] Define ticket terminology by workspace type.

  * [ ] Business workspaces should display "Support Tickets" / "Tickets".
  * [ ] Personal and Family workspaces may display "Requests" where terminology is user-facing.
  * [ ] Terminology must be display-only.
  * [ ] Stored module IDs, route names, permission IDs, API scopes, audit record types, and database fields should remain stable.

* [ ] Define core ticket record model.

  * [ ] Add `tickets` table.
  * [ ] Suggested fields:

    * [ ] `ticket_id`
    * [ ] `workspace_id`
    * [ ] `ticket_number` or `display_key`
    * [ ] `client_id` optional
    * [ ] `project_id` optional
    * [ ] `requester_user_id` optional
    * [ ] `requester_name_snapshot`
    * [ ] `requester_email_snapshot`
    * [ ] `title`
    * [ ] `description`
    * [ ] `status`
    * [ ] `priority`
    * [ ] `category`
    * [ ] `source`
    * [ ] `visibility`
    * [ ] `assigned_user_id` optional
    * [ ] `created_by_user_id`
    * [ ] `created_at`
    * [ ] `updated_at`
    * [ ] `closed_at`
    * [ ] `archived_at`
    * [ ] `metadata_json`
  * [ ] Ticket records must always belong to one workspace.
  * [ ] Client/project links must belong to the same workspace as the ticket.
  * [ ] External/client-created tickets should snapshot requester name/email for historical context.

* [ ] Define ticket statuses.

  * [ ] Start with a small boring set:

    * [ ] `new`
    * [ ] `open`
    * [ ] `waiting_on_internal`
    * [ ] `waiting_on_client`
    * [ ] `resolved`
    * [ ] `closed`
    * [ ] `archived`
  * [ ] Keep status labels configurable/display-friendly later.
  * [ ] Do not make tags the source of truth for ticket status.

* [ ] Define ticket priorities.

  * [ ] Start with:

    * [ ] `low`
    * [ ] `normal`
    * [ ] `high`
    * [ ] `urgent`
  * [ ] Priority should be an explicit field.
  * [ ] Do not infer priority from tags.

* [ ] Define ticket sources.

  * [ ] Start with:

    * [ ] `internal`
    * [ ] `client_portal`
    * [ ] `public_api`
    * [ ] `import`
  * [ ] Reserve future source values:

    * [ ] `wordpress`
    * [ ] `shopify`
    * [ ] `email`
    * [ ] `webhook`
    * [ ] `automation`
  * [ ] Source should be metadata, not permission logic.

* [ ] Add ticket ledger foundation.

  * [ ] Add `ticket_entries` or `ticket_ledger_entries` table.
  * [ ] A ticket entry represents a visible ticket timeline item, not the security audit log.
  * [ ] Suggested fields:

    * [ ] `ticket_entry_id`
    * [ ] `workspace_id`
    * [ ] `ticket_id`
    * [ ] `entry_type`
    * [ ] `visibility`
    * [ ] `body`
    * [ ] `created_by_user_id`
    * [ ] `created_at`
    * [ ] `updated_at`
    * [ ] `deleted_at`
    * [ ] `metadata_json`
  * [ ] Entry visibility should be explicit:

    * [ ] `internal`
    * [ ] `client_visible`
  * [ ] Do not use the word `public` in code for client-visible ticket entries unless the entry is truly public internet visible.
  * [ ] Internal entries are visible only to internal users with appropriate ticket permissions.
  * [ ] Client-visible entries are visible to internal users and authorized client/external users who can access the ticket.
  * [ ] Ticket ledger entries should never replace audit logging.

* [ ] Define first ticket entry types.

  * [ ] `initial_request`
  * [ ] `client_reply`
  * [ ] `internal_note`
  * [ ] `status_change`
  * [ ] `assignment_change`
  * [ ] `priority_change`
  * [ ] `attachment_added`
  * [ ] `system_event`
  * [ ] Keep raw audit details out of normal ticket ledger display.

* [ ] Add ticket permissions.

  * [ ] `tickets.view`
  * [ ] `tickets.view_internal`
  * [ ] `tickets.create`
  * [ ] `tickets.create_for_client`
  * [ ] `tickets.reply_client_visible`
  * [ ] `tickets.add_internal_note`
  * [ ] `tickets.update`
  * [ ] `tickets.assign`
  * [ ] `tickets.close`
  * [ ] `tickets.archive`
  * [ ] `tickets.manage_settings`
  * [ ] `tickets.view_all`
  * [ ] Add client/external access checks separately from internal workspace role checks.
  * [ ] A client user should only see tickets explicitly associated with a client/project they can access.

* [ ] Add ticket resource definition.

  * [ ] Resource key: `tickets`.
  * [ ] Supported operations:

    * [ ] `read`
    * [ ] `create`
    * [ ] `update`
    * [ ] `archive`
    * [ ] `restore`
    * [ ] `assign`
    * [ ] `manage`

* [ ] Add ticket audit record types.

  * [ ] `ticket`
  * [ ] `ticket_entry`
  * [ ] Audit ticket creation, updates, assignment changes, status changes, priority changes, archive/restore, client-visible replies, internal notes, attachment links, and API-created tickets.
  * [ ] Audit records should remain admin/security records and should not be shown as the normal ticket timeline.

* [ ] Add ticket events.

  * [ ] `ticket.created`
  * [ ] `ticket.updated`
  * [ ] `ticket.assigned`
  * [ ] `ticket.status_changed`
  * [ ] `ticket.priority_changed`
  * [ ] `ticket.client_reply_added`
  * [ ] `ticket.internal_note_added`
  * [ ] `ticket.resolved`
  * [ ] `ticket.closed`
  * [ ] `ticket.archived`
  * [ ] `ticket.restored`
  * [ ] Event payloads should include workspace, actor, ticket ID, client/project IDs where applicable, safe previous/new values, source, and metadata.
  * [ ] Event payloads should leave room for future automations and integrations.

## Version 0.34.1 - Ticket Browser API and Services

**Model: High Effort** — Service and route work must preserve ledger visibility, workspace isolation, and client-safe projections.

* [ ] Add ticket service methods.

  * [ ] Create ticket.
  * [ ] Read one ticket.
  * [ ] List tickets.
  * [ ] Update ticket fields.
  * [ ] Assign ticket.
  * [ ] Change ticket status.
  * [ ] Change ticket priority.
  * [ ] Archive ticket.
  * [ ] Restore ticket where appropriate.
  * [ ] Add client-visible reply.
  * [ ] Add internal note.
  * [ ] List ticket ledger entries with permission-safe visibility filtering.

* [ ] Add browser API routes.

  * [ ] `GET /api/tickets`
  * [ ] `POST /api/tickets`
  * [ ] `GET /api/tickets/:ticketId`
  * [ ] `PUT /api/tickets/:ticketId`
  * [ ] `POST /api/tickets/:ticketId/assign`
  * [ ] `POST /api/tickets/:ticketId/status`
  * [ ] `POST /api/tickets/:ticketId/priority`
  * [ ] `POST /api/tickets/:ticketId/archive`
  * [ ] `POST /api/tickets/:ticketId/restore`
  * [ ] `GET /api/tickets/:ticketId/entries`
  * [ ] `POST /api/tickets/:ticketId/replies`
  * [ ] `POST /api/tickets/:ticketId/internal-notes`

* [ ] Enforce ticket API permissions.

  * [ ] Every route must validate active workspace.
  * [ ] Every ticket read must validate workspace membership or authorized client/external access.
  * [ ] Internal notes must never be returned to client/external users.
  * [ ] Client-visible replies must be visible only to users allowed to access that ticket.
  * [ ] Update/assign/status/priority actions must require explicit permissions.
  * [ ] Disabled ticket module must block writes.
  * [ ] Historical reads should follow module `historicalReadAccess`.

* [ ] Add ticket list filtering.

  * [ ] Status.
  * [ ] Priority.
  * [ ] Assignee.
  * [ ] Client.
  * [ ] Project.
  * [ ] Requester.
  * [ ] Source.
  * [ ] Updated date.
  * [ ] Created date.
  * [ ] Archived state.
  * [ ] Pagination.

* [ ] Add ticket number/display key generation.

  * [ ] Generate human-readable ticket keys per workspace.
  * [ ] Ensure keys do not collide inside a workspace.
  * [ ] Keep database IDs separate from user-facing ticket keys.

## Version 0.34.2 - Ticket UI MVP

**Model: High Effort** — The internal UI must make visibility distinctions obvious while preserving accessible, permission-safe behavior.

* [ ] Add Tickets navigation and protected views.

  * [ ] Tickets list page.
  * [ ] Ticket detail page.
  * [ ] Create ticket dialog/page.
  * [ ] Edit ticket metadata controls.
  * [ ] Permission-aware buttons and empty states.
  * [ ] Disabled-module state.

* [ ] Add internal ticket creation workflow.

  * [ ] Internal users can create tickets.
  * [ ] Internal users can optionally assign a ticket to a client.
  * [ ] Internal users can optionally assign a ticket to a project.
  * [ ] Internal users can set title, description, priority, category, and assignee where permitted.
  * [ ] Ticket creation should create the first ledger entry.

* [ ] Add ticket detail workflow.

  * [ ] Show ticket title, status, priority, client, project, requester, assignee, created date, updated date, and source.
  * [ ] Show client-visible ledger entries.
  * [ ] Show internal ledger entries only to users with internal ticket access.
  * [ ] Visually distinguish internal notes from client-visible replies.
  * [ ] Allow permitted users to add internal notes.
  * [ ] Allow permitted users to add client-visible replies.
  * [ ] Allow permitted users to change status, priority, and assignment.
  * [ ] Preserve accessibility behavior for form controls, icon buttons, tabs/filters, and status messages.

* [ ] Add tickets list workflow.

  * [ ] Show ticket key, title, status, priority, client/project context, assignee, requester, source, and updated date.
  * [ ] Add basic filters.
  * [ ] Add pagination.
  * [ ] Add empty state.
  * [ ] Add archived filter or archived view.
  * [ ] Keep list UI simple; do not build a full helpdesk dashboard yet.

* [ ] Add client/external ticket visibility groundwork.

  * [ ] Add permission-safe service methods for client-visible ticket reads.
  * [ ] Add UI/API distinction between internal users and external/client users.
  * [ ] Client/external users should not see internal notes, internal-only status details, raw audit records, or private metadata.
  * [ ] Client-facing ticket pages can be minimal in 0.34.x but the permission model must be real.

## Version 0.34.3 - Ticket Integration Hooks

**Model: High Effort** — Tickets touches many modules, but each integration must use registered contracts rather than direct coupling.

* [ ] Register tickets as searchable records.

  * [ ] Add `searchableTypes` manifest declaration for tickets.
  * [ ] Index ticket title, description, ticket key, client/project context, status, priority, requester snapshot, and safe ledger text.
  * [ ] Internal-only ledger text must only appear in search results for users allowed to see internal ticket content.
  * [ ] Client-visible search results must not expose internal notes.
  * [ ] Search indexing should use the framework search service and adapter, not ticket-specific search queries.

* [ ] Register tickets as taggable records.

  * [ ] Add `taggableTypes` declaration for tickets.
  * [ ] Allow permitted users to assign workspace tags to tickets.
  * [ ] Tags are classification metadata only.
  * [ ] Do not use tags for visibility, status, billing state, or access control.

* [ ] Register tickets as attachable records.

  * [ ] Use the framework file attachment contract.
  * [ ] Tickets should not implement separate file storage.
  * [ ] Attachments should inherit or explicitly declare ticket-entry visibility.
  * [ ] Client-visible attachments must require public/client-safe file handling.
  * [ ] Internal attachments must not be downloadable by client/external users.
  * [ ] Quarantined/pending files must not appear in normal ticket UI.

* [ ] Register ticket notification events.

  * [ ] Notify relevant users when a ticket is created.
  * [ ] Notify assignee when assigned.
  * [ ] Notify followers when status/priority/client-visible reply changes.
  * [ ] Notify internal users when a client-visible reply is added.
  * [ ] Do not notify client/external users about internal notes.
  * [ ] Add ticket follow/unfollow support through framework notification subscriptions.

* [ ] Register ticket Workbench contribution.

  * [ ] Tickets can appear as actionable Workbench items.
  * [ ] Workbench item payload should include ticket key, title, status, priority, client/project context, assignee, due/follow-up date later, source URL, and timer state if Time Tracking is enabled.
  * [ ] Workbench should remain framework-owned.

* [ ] Register ticket timer source.

  * [ ] If Time Tracking is enabled, internal users can start/resume/pause/finalize timers from tickets.
  * [ ] Ticket timers should use the shared Time Tracking active timer engine.
  * [ ] Finalized time entries should preserve ticket metadata.
  * [ ] Do not create a separate ticket timer engine.

* [ ] Add Notes, Reporting, and future Knowledge Base integration seams.

  * [ ] Allow permitted internal users to link or create working Notes without making Notes content client-visible implicitly.
  * [ ] Expose permission-safe ticket reporting dimensions through Reporting contracts rather than direct table reads.
  * [ ] Leave explicit stable hooks for a later resolved-ticket or selected-entry Knowledge Base review candidate, article linking, and resolution-time suggestions; never auto-publish ticket content.

* [ ] Add manual task creation hook.

  * [ ] If Tasks is enabled, permitted users can create a task from a ticket.
  * [ ] The created task should link back to the source ticket.
  * [ ] This should be manual in 0.34.x.
  * [ ] Automatic task creation rules should wait for the automation/rules framework in 0.4x.

## Version 0.34.4 - Client Ticket Portal MVP

**Model: High Effort** — The client portal is an internet-facing permission boundary between internal and client-visible ticket content.

* [ ] Add minimal client/external ticket creation surface.

  * [ ] Authorized client users can create tickets for their allowed client/project context.
  * [ ] Client users can provide title, description, category, and optional attachment only where file safety permits.
  * [ ] Created tickets should use source `client_portal`.
  * [ ] Created tickets should create a client-visible initial request entry.
  * [ ] Internal users should be notified when appropriate.

* [ ] Add minimal client/external ticket detail surface.

  * [ ] Client users can view tickets they are authorized to access.
  * [ ] Client users can see client-visible entries only.
  * [ ] Client users can add client-visible replies.
  * [ ] Client users can see safe status labels.
  * [ ] Client users cannot see internal notes, internal-only files, raw audit records, private metadata, internal assignment details unless explicitly allowed, or internal search results.

* [ ] Add client/external ticket list surface.

  * [ ] Show ticket key, title, safe status, created date, updated date, and project context where allowed.
  * [ ] Add basic status filtering.
  * [ ] Add pagination.
  * [ ] Keep this portal simple; do not build a full customer support portal yet.

* [ ] Add client ticket access regression tests.

  * [ ] Client users cannot access tickets from another workspace.
  * [ ] Client users cannot access tickets for another client/project.
  * [ ] Client users cannot see internal notes.
  * [ ] Client users cannot download internal-only attachments.
  * [ ] Client-visible replies are visible to the right client users and internal users.
  * [ ] Internal users with proper permission can see both internal and client-visible ledger entries.

## Version 0.34.5 - Ticket Public API Groundwork

**Model: High Effort** — Public API scopes and intake validation create durable external contracts and abuse boundaries.

* [ ] Add ticket API scopes.

  * [ ] `tickets:read`
  * [ ] `tickets:write`
  * [ ] `tickets:create`
  * [ ] `tickets:reply`
  * [ ] Consider separating `tickets:internal` from client-facing API scopes.
  * [ ] API scopes should be offered only when the Support Tickets module is enabled.

* [ ] Add first safe public API routes for future plugins.

  * [ ] `POST /api/v1/tickets`
  * [ ] `GET /api/v1/tickets/:ticketId` only if permission-safe.
  * [ ] `POST /api/v1/tickets/:ticketId/replies` only if permission-safe.
  * [ ] Keep public API minimal.
  * [ ] Require API keys and scopes.
  * [ ] Validate workspace, client/project context, module state, and allowed source.
  * [ ] Do not expose internal notes through public API.
  * [ ] Do not expose raw audit data through public API.

* [ ] Add source attribution for API-created tickets.

  * [ ] Store source application/plugin identifier where available.
  * [ ] Store safe request metadata.
  * [ ] Leave room for future webhook signatures, replay protection, and per-plugin rate limits.
  * [ ] Avoid building WordPress/Shopify plugins in 0.34.x.

* [ ] Add API regression tests.

  * [ ] Missing/invalid API key is rejected.
  * [ ] Missing scope is rejected.
  * [ ] Disabled ticket module blocks writes.
  * [ ] API-created ticket belongs to the correct workspace.
  * [ ] API-created ticket cannot spoof another workspace/client/project.
  * [ ] Public API cannot create internal notes unless explicitly using an internal/admin scope.
  * [ ] Public API cannot read internal ledger entries.

## Version 0.34.6 - Ticket Regression, Polish, and Closeout

**Model: High Effort** — Closeout must prove isolation, public/client visibility, integrations, seed coverage, and replacement-test evidence together.

* [ ] Add complete ticket regression coverage.

  * [ ] Tickets cannot cross workspace boundaries.
  * [ ] Client/project links cannot cross workspace boundaries.
  * [ ] Internal users only see tickets permitted by role/resource checks.
  * [ ] Client/external users only see authorized client-visible tickets.
  * [ ] Internal notes are hidden from client/external users.
  * [ ] Client-visible replies are visible to both authorized client users and appropriate internal users.
  * [ ] Ticket status, priority, assignment, archive, and restore actions enforce permissions.
  * [ ] Search does not expose internal ticket content to unauthorized users.
  * [ ] Tags can be assigned only by users with tag assignment permission and ticket access.
  * [ ] Attachments follow ticket and entry visibility.
  * [ ] Notifications do not expose private ticket details.
  * [ ] Disabled ticket module blocks new ticket writes and hides normal navigation.
  * [ ] Historical ticket reads work only when module policy allows them.
  * [ ] Ticket timers require Time Tracking to be enabled.
  * [ ] Create-task-from-ticket requires Tasks to be enabled.

* [ ] Add accessibility and UI regression coverage.

  * [ ] Ticket forms have labels, validation summaries, and keyboard-friendly controls.
  * [ ] Ticket ledger entries have readable structure and status labels.
  * [ ] Internal/client-visible labels are clear.
  * [ ] Icon buttons have accessible names.
  * [ ] Empty/error/loading states are clear.
  * [ ] Client portal views do not leak internal controls.

* [ ] Add documentation notes.

  * [ ] Document ticket visibility rules.
  * [ ] Document internal notes vs client-visible replies.
  * [ ] Document ticket permissions.
  * [ ] Document public API limitations.
  * [ ] Document future plugin and automation hooks.
  * [ ] Document that ticket ledger is not the same as audit log.
  * [ ] Produce current user, admin, and developer documentation at closeout rather than deferring it to 0.39.9.

* [ ] Add deterministic development-seed scenarios for internal and client-visible tickets, assignments, replies, internal notes, timers, tasks, Files, and permission boundaries through the 0.33.17 seed contract.

* [ ] Run a formal test-suite streamlining review.

  * [ ] Consume timing output, report the slowest ticket tests, and review the suite-time budget.
  * [ ] Retire nothing without demonstrated replacement coverage and recorded manifest/ratchet evidence.
  * [ ] Preserve strong workspace, permission, client/internal visibility, API, Files, and integration coverage even when pure contract checks move to Vitest.

* [ ] Release bookkeeping.

  * [ ] Update `DECISIONS.md` or product notes with ticket visibility and ledger decisions.
  * [ ] Update `CHANGELOG.md`.
  * [ ] Bump `package.json` and `package-lock.json`.
  * [ ] Run `npm run check`.
  * [ ] Run `npm run test:permissions`.
  * [ ] Run ticket-specific regression scripts.

## Version 0.35 - Knowledge Base Module

**Model: High Effort** — Knowledge Base introduces reviewed publication snapshots, permission-filtered sources, and client/public visibility boundaries.

## Knowledge Base Direction Adjustment

Decision:
Knowledge Base is the reviewed, read-only knowledge layer generated from Notes first. Notes remain the working authoring records. Knowledge Base entries may still be written directly, but the default workflow is note-sourced: normal internal/workspace/client-visible notes become KB review candidates automatically, then reviewers approve and publish safe read-only KB snapshots.

- Knowledge Base is an official first-party public-core module, may be disableable per workspace, and is not market- or funding-gated.
- It uses the 0.33.18 composed-manifest and native ES-module patterns from its first implementation.
- Because Tickets now lands first, the contract must leave reviewed, permission-safe paths to convert a resolved ticket or selected ticket entries into a KB review candidate, link a KB article to a ticket, and suggest KB material during resolution.
- Ticket integration must not weaken the Notes-first source model, bypass review, expose internal entries, or publish automatically.

### Version 0.35.1 - Knowledge Base Module Contract, Publishing Model, and Notes Relationship

**Model: High Effort** — The contract governs source revisions, publication immutability, secure-note exclusion, and future ticket linkage.

* [ ] Define Knowledge Base as the reviewed consumption layer for Notes-backed knowledge.

  * [ ] Notes are the working/source records.
  * [ ] KB articles are reviewed read-only article records or publication snapshots.
  * [ ] Normal note creation/update can automatically create or update a KB review candidate.
  * [ ] Automatic KB candidate creation does not mean automatic publishing.
  * [ ] Publishing remains explicit, permission-protected, audited, and snapshot-based.
  * [ ] KB may support directly authored articles, but direct authoring is secondary to note-sourced workflow.

* [ ] Add KB candidate/source behavior.

  * [ ] Add `source_mode` values:

    * [ ] `note_sourced`
    * [ ] `manual`
    * [ ] `imported`
  * [ ] Add `source_sync_state` or equivalent metadata:

    * [ ] `current`
    * [ ] `source_updated`
    * [ ] `manual_override`
    * [ ] `detached`
  * [ ] Add `source_note_id` convenience field only if it simplifies the common one-note article case; keep `kb_article_sources` as the canonical many-source table.
  * [ ] Add `source_note_revision_id` or use `kb_article_sources.source_revision_id` to preserve the note revision that seeded the reviewed article.
  * [ ] Add `last_source_synced_at`.
  * [ ] Add `last_reviewed_at`.
  * [ ] Add `review_due_at` optional for future maintenance workflows.

* [ ] Define automatic candidate rules.

  * [ ] Normal `internal` notes create internal KB candidates.
  * [ ] Normal `workspace` notes create workspace KB candidates.
  * [ ] Normal `client_visible` notes may create client-visible KB candidates only after client-visible KB permissions and file safety are enabled.
  * [ ] `private` notes do not create KB candidates by default.
  * [ ] `secure` notes must never create KB candidates.
  * [ ] Deleted notes should not create KB candidates.
  * [ ] Archived notes may remain as KB sources, but should not automatically update pending candidates unless explicitly configured.

* [ ] Define KB statuses for note-sourced workflow.

  * [ ] `draft`
  * [ ] `in_review`
  * [ ] `approved`
  * [ ] `published`
  * [ ] `rejected`
  * [ ] `archived`
  * [ ] `deleted`
  * [ ] Manually created articles start as `draft`.
  * [ ] Automatically note-sourced articles start as `in_review`.
  * [ ] Updating a source note marks the KB candidate/publication as `source_updated` or creates a new review revision, but does not silently mutate the published snapshot.
  * [ ] Rejected candidates remain linked to the source note for history unless deleted by a permitted user.

* [ ] Define future ticket-to-KB relationships without automatic publication.

  * [ ] A resolved ticket or selected permitted entries may seed a review candidate explicitly.
  * [ ] A ticket may link to an accessible KB article, and resolution workflows may suggest accessible articles.
  * [ ] Internal ticket entries, client-visible entries, and attachment visibility remain distinct and permission-filtered.
  * [ ] Notes remain the principal working-authoring source; ticket-derived material enters the same reviewed snapshot pipeline.

### Version 0.35.2 - Knowledge Base Browser API, Editorial Workflow, and Internal UI MVP

**Model: High Effort** — Editorial services and UI must make source drift visible without silently mutating published content.

* [ ] Add automatic note-to-KB candidate service methods.

  * [ ] Create or update candidate from note.
  * [ ] Queue note for KB review.
  * [ ] Read KB candidate by source note.
  * [ ] List KB candidates needing review.
  * [ ] Mark source update pending review.
  * [ ] Detach KB article from source note where permitted.
  * [ ] Reject KB candidate with reason.
  * [ ] Approve KB candidate.
  * [ ] Publish approved KB article snapshot.

* [ ] Add Notes lifecycle hook integration.

  * [ ] On normal note created, create KB candidate if workspace KB candidate policy allows it.
  * [ ] On normal note updated, mark linked KB candidate/publication as source-updated.
  * [ ] On note archived, preserve existing KB linkage but stop automatic updates unless configured.
  * [ ] On note deleted, hide or mark linked KB candidate as source unavailable.
  * [ ] Do not process secure notes.
  * [ ] Do not process private notes unless a future explicit rule allows it.

* [ ] Add KB review queue UI.

  * [ ] Show candidates grouped by source visibility:

    * [ ] Internal
    * [ ] Workspace
    * [ ] Client-visible when enabled
  * [ ] Show source note title, source collection path, source updated date, proposed article title, visibility, review status, and whether the source changed since last review.
  * [ ] Allow reviewers to approve, reject, edit article draft, publish, or detach.
  * [ ] Make it obvious when a published KB article is behind its source note.

### Version 0.35.3 - Knowledge Base Search, Tags, Attachments, Static Pages, and Permission Boundaries

**Model: High Effort** — Search, backlinks, Files, and publication views can leak inaccessible source information if projections are wrong.

* [ ] Add KB article chrome/window-dressing generation.

  * [ ] Generate safe table of contents.
  * [ ] Generate "What links here."
  * [ ] Generate related articles from article links, source notes, shared tags, shared collections, and wiki-style links.
  * [ ] Show source-note linkage only to users who can access the source note.
  * [ ] Show source update/review status only to internal users with review/history permission.
  * [ ] Hide internal source data from client-visible/public outputs.
  * [ ] Backlink lists must be permission-filtered and must not leak inaccessible article titles, note titles, files, or counts.

* [ ] Add KB link index support.

  * [ ] Track article-to-article links detected from Markdown/wiki-style links.
  * [ ] Track note-to-article references where useful.
  * [ ] Track source note-to-article relationships through `kb_article_sources`.
  * [ ] Rebuild link indexes when article Markdown, note wiki links, slugs, or source links change.
  * [ ] Broken links should be allowed but clearly labeled for reviewers.

### Version 0.35.4 - Knowledge Base Settings, Documentation, and Closeout

**Model: High Effort** — Closeout must prove settings cannot bypass review/security and that seeded, documented, measured coverage is complete.

* [ ] Add KB automation settings.

  * [ ] Configure note-to-KB candidate behavior:

    * [ ] Disabled
    * [ ] Manual only
    * [ ] Auto-create internal/workspace candidates
    * [ ] Auto-create client-visible candidates when supported
  * [ ] Configure default candidate status for note-sourced entries.
  * [ ] Configure whether review is always required before publishing.
  * [ ] Configure whether source note updates reopen review.
  * [ ] Configure whether archived notes can continue feeding KB candidates.
  * [ ] Settings must not bypass permissions, secure-note restrictions, private-note restrictions, file safety, or publication review.

* [ ] Add deterministic seeded examples covering source Notes, source-updated review, approved/published snapshots, rejected candidates, permission-filtered backlinks, and safe ticket-linked review candidates.
* [ ] Produce current user, admin, and developer documentation at closeout, including Notes-first authoring, review/publication, source drift, secure/private exclusions, and ticket-link limits.
* [ ] Run a formal test-suite streamlining review using timing output and the suite budget; retire no regression without demonstrated replacement coverage and manifest/ratchet evidence.
* [ ] Preserve strong secure/private-note, permission, workspace, publication-snapshot, backlink, Files, ticket-link, and browser accessibility coverage.

Acceptance criteria:

- Knowledge Base ships as a reviewed Notes-first module with immutable publication snapshots, safe optional ticket linkage, deterministic seed coverage, current documentation, and evidence-backed tests.

## Version 0.36.0 - Calendars and Calendar Views

A lean, read-only task calendar shipped earlier in 0.33.10 (task due dates + reminder markers). This
section owns the fuller Calendar module: user-created calendar events, iCal/shared-calendar display,
and richer views beyond the 0.33.10 task read-out. External Google/Outlook sync remains later integrations work.

- [ ] Calendars
  - [ ] Year view
  - [ ] Month view
  - [ ] Week view
  - [ ] Day view
  - [ ] Filters for client (business workspace only)/project

- [ ] Calendar Events
  - [ ] Allow addition of calendar events
  - [ ] Display iCal events from shared calendars

## Version 0.36.5 - Account Home / Cross-Workspace Attention View

Add a framework-owned Account Home view for users who belong to multiple workspaces.

This view must not weaken workspace isolation. It should aggregate only permission-safe summaries from workspaces the current user can access.

Account Home should not query module tables directly. It should use framework-owned summary services, notification records, announcement records, activity-feed records, and module-declared attention providers where available.

The first version should include:

- Workspace cards showing unread/attention counts.
- Active workspace announcements.
- Current-user notifications across accessible workspaces.
- Permission-safe attention items such as overdue tasks, assigned tickets, pending reviews, and stale timers where those modules are enabled.
- Links that switch/open the correct workspace before navigating to the target record.
- Permission-change and access-removal notifications (promoted from TODO 2026-07-21): when a user's role or permissions change in a workspace, notify that user; when a user is fully removed from a workspace, deliver the discontinuation notice through their remaining workspaces / Account Home, since the removed workspace can no longer surface it. (Example: a freelancer whose client-admin access to Workspace A ends must see that notice in their own other workspaces.) This item waits here deliberately because the removal case requires exactly this branch's cross-workspace delivery machinery; an in-workspace-only change notice may land earlier if a notification slice wants it, but the removal case is owned here.

Do not expose raw audit records, raw event payloads, private module records, or cross-workspace administrative data. Every item must be visible only if the user could read the source record inside that workspace. Permission-change notices must state the change without leaking who else holds which roles.

## Version 0.36.6 - Asset Registry / Assets Module

**Model: High Effort** — Assets is a durable cross-module registry with typed records, lifecycle state, permission-safe asset-to-asset relationships, backlinks to work records, Search/Tags/Files integration, Quick Action Capture, date-based attention, and import/export. A mistake in ownership or relationship design would create cross-module coupling, stale links, permission leaks, or an unusable pseudo-CMDB.

Purpose:

Ship an official first-party **Assets** module for the individually identifiable physical and digital things a workspace owns, manages, supports, leases, assigns, or depends upon. The module is not retail inventory: it does not model SKUs, warehouse quantity, fulfillment, stock adjustments, or purchase-order receiving. An Asset is a durable record with a persistent identity and lifecycle — for example a server, VM, network device, workstation, printer, camera, UPS, software installation, SaaS subscription, domain, TLS certificate, vehicle, bicycle, trailer, generator, appliance, or specialized tool.

Assets must work across Business, Personal, and Family workspaces without forcing business-only concepts into personal use. A Business workspace may associate an Asset with a Client and Project; a Personal or Family workspace owns the Asset directly and must not receive Client fields or labels. The module should make it possible to answer:

- What is this?
- Where is it?
- Who owns, manages, or uses it?
- What does it run on, connect to, protect, back up, replace, or depend upon?
- What depends upon it?
- Which Tasks, Notes, Tickets, Knowledge Base articles, Lists, Files, and other records belong to it?
- What happened to it previously?
- What requires attention next?

Placement:

This version lands after 0.36.5 and before 0.37.0. That placement is deliberate:

- Support Tickets (0.34.x) and Knowledge Base (0.35.x) already exist as real relationship targets.
- Calendar and Account Home (0.36.0 and 0.36.5) already provide the hosts for due-date and cross-workspace attention integration.
- Assets then exists before Expanded Reporting (0.37.0), the read-only MCP connector (0.38.8), Creator Studio (0.39.0), the 0.3x documentation/stabilization checkpoint (0.39.9), the integration-surface audit (0.39.15), and the SQLite/PostgreSQL dual-backend work (0.40.0).
- The module therefore becomes part of those later contracts instead of being retrofitted after them.

Decision:

- Use **Assets** as the UI/navigation label and `assets` as the stable module ID. Documentation may call the module the **Asset Registry** when distinction from retail inventory is useful.
- Ship Assets as a first-party public-core module with `enabledByDefault: false`, `canDisable: true`, and historical read access for already-created records where the existing module lifecycle contract permits it.
- Make Assets available to Business, Personal, and Family workspaces. Workspace terminology may adjust descriptions and empty states, but stable IDs, routes, permissions, relationship keys, and stored values must not vary by workspace type.
- Keep Assets module-owned: Assets owns Asset records, Asset Types, Asset Locations, identifiers, lifecycle dates, asset-to-asset relationships, and the authoritative Asset-to-record link ledger.
- Reuse framework-owned Permissions, Search, Tags, Files, Audit, Events, Notifications, Reporting, Dashboard, Account Home, Quick Action Capture, view primitives, and Linked Context provider/shell contracts. Assets must not create duplicate engines for those concerns.
- Treat explicit relationships and links as the source of truth. Tags may improve classification, filtering, and optional propagation, but tags must never stand in for an Asset relationship.
- Keep type-specific fields Assets-owned. Asset Types may define validated field schemas rendered through the existing field factory, but this version must not invent a product-wide custom-field framework solely for Assets. Generalization waits for a second materially similar consumer under the Two-Module Rule.
- Store each Asset in exactly one workspace. Asset-to-Asset and Asset-to-record links are same-workspace only in the first release. Account Home may aggregate permission-safe attention summaries across workspaces, but it must never create cross-workspace relationships or bypass source-workspace permissions.
- Keep the first Assets release internal to authenticated workspace users. Client-visible Ticket or Knowledge Base projections must not expose an internal Asset name, code, identifier, relationship, or file merely because an internal record links to it.
- Reserve **Assets** for persistent managed things. Creator Studio media remains Files-backed media/library content; it must not reuse the same term for uploaded images, video, audio, captions, or scripts. Creator Studio may later link content work to real Assets such as cameras, microphones, vehicles, computers, or software.

Key data-model decisions:

- Keep universally useful fields as normal columns and type-specific fields in a validated attributes document.
- Use stable Asset Type field IDs and schema versions. Editing a type must not silently discard values already stored on existing Assets.
- Keep the human-facing **Asset Code** separate from workspace Tags. Asset Code may also be described in help text as an asset tag or inventory ID, but it is a unique identifier field, not a Tags-module assignment.
- Store additional non-secret identifiers separately so one Asset may have several useful identities: serial number, VIN, plate, hostname, domain, IP address, service ID, subscription ID, license ID, or external-system ID.
- Model lifecycle status separately from archive state. A retired or disposed Asset remains part of history and relationships; archiving controls normal list visibility and is not a substitute for retirement.
- Keep Locations Assets-owned rather than creating a framework-wide Locations primitive. Networks, environments, clusters, and platforms may themselves be Assets when relationship behavior is useful; physical/site placement uses Asset Locations.

Baseline lifecycle statuses:

- `planned`
- `active`
- `maintenance`
- `inactive`
- `retired`
- `disposed`

Type-specific operational states may live in validated attributes when a server, vehicle, subscription, certificate, or another type needs more precise language. Do not expand the universal lifecycle list until multiple real Asset Types require the same semantics.

Non-goals:

- Do not build retail inventory, SKU/quantity tracking, warehouses, fulfillment, reorder points, stock adjustments, or point-of-sale behavior.
- Do not build network discovery, SNMP polling, endpoint management, remote control, patching, vulnerability scanning, uptime monitoring, or an RMM agent.
- Do not build a password manager or secrets vault. Passwords, API keys, access tokens, recovery codes, private keys, certificate private material, and software activation secrets must not be stored in Asset fields, identifiers, search text, audit payloads, events, or ordinary Files. An Asset may store a human-readable reference such as `1Password -> Raymond Tec -> Mastodon Production`.
- Do not build accounting depreciation, tax basis, fixed-asset accounting, lease accounting, or a replacement for bookkeeping software.
- Do not build a full CMDB, NetBox replacement, vehicle fleet-management suite, maintenance work-order engine, parts inventory, fuel log, or software-license compliance scanner.
- Do not add a graphical topology map in the first release. Start with readable relationship lists, inverse labels, dependency/impact summaries, and filters. A graph view may be evaluated later from real use.
- Do not allow a relationship or tag to grant permission to another Asset or linked record.
- Do not cascade-delete related Assets, Files, Tasks, Notes, Tickets, Knowledge Base records, or other records when an Asset is archived, retired, disposed, or removed.
- Do not create automatic Task or Ticket rules in this version. Manual create/link actions are allowed; automation waits for the later rules/automation framework.
- Do not create one hidden/system Tag per Asset as a substitute for an explicit Asset link.
- Do not expose internal Assets through the client Ticket portal or public Knowledge Base in the first release.
- Do not add cross-workspace Asset links in the first release.

### Version 0.36.6.1 - Assets module contract, schema, Asset Types, and Locations

**Model: High Effort** — The first schema must support materially different Asset Types without collapsing into an unvalidated JSON junk drawer or a sprawling universal table.

- [ ] Add the `assets` first-party module through the generated bundled-module catalog and explicit runtime activation contract established in 0.33.18.
- [ ] Use the composed-manifest and native browser ES-module patterns established in 0.33.18 from the first implementation; do not create a new loading shape.
- [ ] Declare module metadata, navigation, protected views, browser assets, permissions, default role grants, searchable/taggable/attachable types, Linked Context provider metadata, events, notifications, reports, settings, help, seed hooks, and repair hooks only where the related slice implements them.
- [ ] Add module-owned tables or provider-neutral equivalents for:
  - [ ] `asset_types`
  - [ ] `asset_locations`
  - [ ] `assets`
  - [ ] `asset_identifiers`
  - [ ] later-slice relationship, record-link, and lifecycle-date tables
- [ ] Define `asset_types` as workspace-scoped type definitions with stable type IDs, name, category, description, icon/key, active/archived state, schema version, and validated field-schema metadata.
- [ ] Define the Asset Type field schema with stable field IDs and the existing supported field-factory types: text, number, boolean/toggle, select, multi-select, textarea, date, time, and safe URL where supported by the settled field contract.
- [ ] Keep field descriptors data-only. Validation, normalization, allowed values, and persistence remain Assets-owned; manifests and saved schemas must not embed executable functions.
- [ ] Preserve values when an Asset Type changes:
  - [ ] Renaming a field keeps its stable field ID and values.
  - [ ] Removing a field from the active schema does not silently delete saved values.
  - [ ] Existing legacy values remain recoverable/admin-visible until explicitly migrated or removed through reviewed tooling.
  - [ ] Type changes that would make stored values invalid require a preview/migration decision rather than blind coercion.
- [ ] Define `assets` common fields:
  - [ ] `asset_id`
  - [ ] `workspace_id`
  - [ ] `asset_type_id`
  - [ ] `name`
  - [ ] optional workspace-unique `asset_code`
  - [ ] lifecycle `status`
  - [ ] summary/description
  - [ ] optional Business-only `client_id` and `project_id`
  - [ ] optional `location_id`
  - [ ] optional assigned/responsible user
  - [ ] optional ownership/custody relationship such as owned, leased, rented, managed, or client-owned
  - [ ] manufacturer and model
  - [ ] acquisition/in-service metadata where generally useful
  - [ ] validated `attributes` document plus schema-version marker
  - [ ] `last_verified_at`, source, and optional external-system reference
  - [ ] retirement/disposal metadata
  - [ ] normal created/updated/archive metadata
- [ ] Define `asset_identifiers` for multiple non-secret identifiers per Asset, including kind, label, value, normalized value, primary marker, and timestamps.
- [ ] Support useful identifier kinds without hard-coding every possible domain: serial number, VIN, plate, hostname, domain, IP address, MAC address, service/subscription ID, license ID, external-system ID, and custom.
- [ ] Apply workspace-scoped uniqueness where semantics require it, especially Asset Code. Do not globally reject legitimate repeated model, hostname, IP, or vendor identifiers without a type-specific rule.
- [ ] Define `asset_locations` as an Assets-owned optional hierarchy with workspace, optional Business client context, parent location, location type, name, safe path label, status/archive state, and deterministic ordering.
- [ ] Validate Project/Client consistency through existing hierarchy services. Personal and Family workspaces must not receive or persist Client context from normal Assets routes.
- [ ] Seed protected starter template packs that can be cloned into workspace-owned types:
  - [ ] IT and Infrastructure: physical server, VM, container host, network device, workstation, printer, camera, UPS, storage device, hosted service.
  - [ ] Software and Online Services: application, SaaS subscription, domain, TLS certificate, license/subscription.
  - [ ] Vehicles and Equipment: car, truck, motorcycle, bicycle, trailer/camper, generator, machine, specialized tool.
  - [ ] Home and Family: appliance, electronics, safety equipment, household system.
  - [ ] General Business: office equipment, shop equipment, assigned device, leased/rented equipment.
- [ ] Treat starter templates as versioned defaults, not immutable assumptions about every workspace. Workspace admins may clone and adapt them without upgrades overwriting workspace-owned definitions.
- [ ] Add schema and migration regressions for a fresh database, an enabled/disabled Assets module, type-schema edits, preserved legacy values, workspace isolation, and provider-neutral SQL/dialect guardrails.

Acceptance criteria:

- A Business, Personal, or Family workspace can enable Assets and create a type definition appropriate to that workspace without changing framework code.
- Common fields remain queryable and type-specific values remain validated.
- Type edits preserve existing data and never silently discard or coerce stored values.
- Asset Codes and identifiers are searchable data, not disguised Tags or secrets.
- The schema uses the existing database facade and dialect seams and introduces no SQLite-only application SQL.

### Version 0.36.6.2 - Asset services, browser API, permissions, lifecycle, and history

**Model: High Effort** — Asset reads and writes must preserve workspace/client scope, lifecycle history, module disablement, and future integration contracts without turning generic framework services into Asset-aware code.

- [ ] Add Assets-owned repository, service, routes, normalizers, and policy helpers. Framework services must not query Assets tables directly.
- [ ] Add permissions with user-facing labels and descriptions:
  - [ ] `assets.view`
  - [ ] `assets.create`
  - [ ] `assets.edit`
  - [ ] `assets.archive`
  - [ ] `assets.manage_types`
  - [ ] `assets.manage_locations`
  - [ ] `assets.manage_relationships`
  - [ ] `assets.manage_links`
  - [ ] `assets.import_export`
- [ ] Define conservative default role grants. Owners/admins receive management permissions; normal members receive only the Asset permissions deliberately appropriate to the existing role model.
- [ ] Add browser service methods and routes for:
  - [ ] paged/filterable Asset listing
  - [ ] Asset detail
  - [ ] create and update
  - [ ] lifecycle transition
  - [ ] archive and restore
  - [ ] Asset Type list/create/edit/archive/clone
  - [ ] Location list/create/edit/archive
  - [ ] identifier add/edit/remove
- [ ] Keep list filtering and paging server-side with stable ordering and opaque cursor behavior consistent with other large first-party modules.
- [ ] Support filters for Asset Type, category, lifecycle status, Client/Project in Business workspaces, Location, assigned user, Tag, identifier kind/value, upcoming lifecycle date, archived state, and text query.
- [ ] Validate every mutation at the service boundary:
  - [ ] active workspace ownership
  - [ ] enabled-module state
  - [ ] permission and Client/Project scope
  - [ ] Asset Type availability and schema
  - [ ] Location availability
  - [ ] Asset Code/identifier normalization
  - [ ] lifecycle transition
  - [ ] no secret-designated field or identifier type
- [ ] Keep lifecycle transitions explicit. Retiring or disposing an Asset records who changed it, when, optional reason, and optional replacement Asset; it does not archive the record automatically.
- [ ] Do not expose normal hard delete. If later cleanup tooling is required, it must refuse deletion while relationships, record links, Files, or history remain and must be owner/admin-only with an audit trail.
- [ ] Add canonical Asset event types and safe summaries:
  - [ ] `asset.created`
  - [ ] `asset.updated`
  - [ ] `asset.status_changed`
  - [ ] `asset.retired`
  - [ ] `asset.disposed`
  - [ ] `asset.archived`
  - [ ] `asset.restored`
  - [ ] `asset.identifier_added`
  - [ ] `asset.identifier_removed`
  - [ ] relationship/link/date events added by later slices
- [ ] Keep event/audit payloads body-light and safe. They may contain Asset ID, safe name/code snapshot, type, workspace, actor, safe previous/new values, and source; they must not contain secrets, file contents, private key material, credentials, or unrestricted type attributes.
- [ ] Add an Asset history projection/timeline built from permission-safe event summaries and lifecycle records rather than exposing raw audit rows.
- [ ] Add module settings through the 0.33.15 settings contract where useful:
  - [ ] whether Asset Code is required
  - [ ] optional auto-generation prefix/pattern
  - [ ] default upcoming-attention window
  - [ ] optional Asset-to-linked-record Tag propagation, default off
- [ ] Add regressions for role grants, Client/Project scope, Personal/Family payload shaping, disabled-module behavior, historical read behavior, lifecycle transitions, archive/restore, audit/event safety, and concurrent conflicting edits.

Acceptance criteria:

- Assets can be created, edited, retired, disposed, archived, restored, filtered, and read through module-owned contracts with correct workspace and permission behavior.
- Lifecycle history remains readable without raw audit exposure.
- Disabling Assets removes active navigation/capture/integration contributions and blocks mutation without deleting historical records.
- Personal and Family routes never leak Client fields or labels.

### Version 0.36.6.3 - Assets UI, canonical openers, and module-contributed Quick Action Capture

**Model: High Effort** — The Assets surface must handle dense typed data and relationships while the Quick Action Capture change moves an existing app-shell hard-coded list into a validated multi-module contribution contract.

- [ ] Add Assets navigation under the existing Actions/workflow area through the module navigation contribution, with permission and enabled-module filtering.
- [ ] Add a protected Assets browse surface using established framework anatomy:
  - [ ] page header and primary action
  - [ ] bottom-left slide-out filter/navigation drawer
  - [ ] paged table/list with readable type, code, status, Client/Project, Location, assigned user, and due-attention summaries
  - [ ] stable empty/loading/error states
  - [ ] no raw UUIDs as labels
- [ ] Add a dedicated Asset detail surface rather than forcing overview, identifiers, relationships, related work, Files, dates, and history into one oversized list-row modal.
- [ ] Organize Asset detail into readable framework-owned panel anatomy:
  - [ ] Overview
  - [ ] Identifiers
  - [ ] Relationships
  - [ ] Related Work
  - [ ] Files
  - [ ] Dates and Attention
  - [ ] History
- [ ] Add one canonical Assets-owned create/edit dialog/opening contract and register:
  - [ ] `assets.add`
  - [ ] `assets.edit`
- [ ] Render common and Asset Type fields through the 0.33.14 field factory. Do not hand-build parallel field anatomy or create an Assets-only form engine.
- [ ] Keep complex Assets-owned behavior — type switching, identifier editing, schema validation, lifecycle transitions, relationship picking, and link management — behind module-owned handlers and routes.
- [ ] Promote Quick Action Capture actions to a validated, data-only module contribution if this has not landed earlier:
  - [ ] Add a `quickActions` manifest contribution with stable ID, label, description, icon, module action ID, sort order, required modules, required permissions, and required workspace capabilities.
  - [ ] Add `modulesService.listQuickActionContributions(workspaceId, session)` using the existing enabled-module, dependency, capability, and permission filtering pattern.
  - [ ] Keep the framework responsible for the drawer host, ordering, focus behavior, outside/Escape close, lazy module-action dispatch, current-page context, and fallback framework actions.
  - [ ] Keep modules responsible for the canonical opener, defaults, validation, save payload, and refresh behavior.
  - [ ] Migrate Timer, Task, Note, and List capture definitions out of the framework-owned `QUICK_ACTION_DEFINITIONS` list and into their owning modules without changing labels, order, permissions, or behavior.
  - [ ] Keep File, Reporting, and Search fallbacks framework-owned until they have real module/opener contracts; do not pretend a page link is a module create action.
  - [ ] Record the Two-Module evidence explicitly: Time Tracking, Tasks, Notes, Lists, and Assets are real consumers of the same Quick Action contribution contract.
- [ ] Add an Assets Quick Action:
  - [ ] Label: `Asset`
  - [ ] Description: `Register a device, service, vehicle, or other managed asset.`
  - [ ] Action: `assets.add`
  - [ ] Required permission: `assets.create`
  - [ ] Hidden when Assets is disabled or the user lacks permission
- [ ] Keep Quick Capture intentionally small: name, Asset Type, optional Asset Code, lifecycle status/default, and safe current Client/Project/Location context. The full editor remains available after creation.
- [ ] Accept current-page context in the canonical opener. When opened from a readable Task, Note, Ticket, Knowledge Base article, List, Client, or Project page, the dialog may offer to prefill context and create an explicit link after save; it must not silently create a relationship.
- [ ] Add keyboard, focus-return, narrow-screen, modal-stack, and stale-context regressions for the Assets opener and Quick Action drawer.

Acceptance criteria:

- Assets has a usable list/detail/editor workflow built from established framework anatomy and module-owned behavior.
- `Asset` appears in Quick Action Capture only when the module and permission permit it and opens the same canonical editor used elsewhere.
- Existing Timer, Task, Note, and List capture behavior remains unchanged after their descriptors move to module ownership.
- The framework Quick Action host no longer hard-codes those first-party workflow module IDs.

### Version 0.36.6.4 - Typed Asset-to-Asset relationships and dependency/impact views

**Model: High Effort** — Asset relationships form a durable directed graph. Direction, inverse labels, symmetric edges, cycle rules, retirement behavior, and permission checks must remain correct without turning the first release into a topology product.

Purpose:

Make relationships a first-class part of the Asset Registry rather than a note field. One stored relationship must render correctly from either Asset, answer both “what does this depend on?” and “what depends on this?”, and remain safe when an Asset is disabled, archived, retired, moved, or no longer readable.

- [ ] Add Assets-owned relationship tables or provider-neutral equivalents:
  - [ ] `asset_relationship_types`
  - [ ] `asset_relationships`
- [ ] Define relationship type metadata:
  - [ ] stable key
  - [ ] forward label
  - [ ] inverse label
  - [ ] directed or symmetric shape
  - [ ] optional acyclic rule
  - [ ] optional allowed source/target Asset Type categories
  - [ ] built-in/protected vs workspace-defined state
  - [ ] active/archive state
  - [ ] deterministic ordering
- [ ] Ship a conservative protected starter catalog:
  - [ ] `contains` / `part of`
  - [ ] `installed_on` / `has installed`
  - [ ] `runs_on` / `hosts`
  - [ ] `depends_on` / `supports`
  - [ ] `connected_to` / `connected to` (symmetric)
  - [ ] `backs_up` / `backed up by`
  - [ ] `protects` / `protected by`
  - [ ] `managed_through` / `manages`
  - [ ] `replaces` / `replaced by`
  - [ ] `paired_with` / `paired with` (symmetric)
- [ ] Allow workspace admins to create additional relationship types without modifying framework code. Custom types remain Assets-owned settings/data, not manifest fields.
- [ ] Store one canonical edge with source Asset, target Asset, relationship type, optional safe note, actor, and timestamps.
- [ ] Enforce:
  - [ ] same workspace
  - [ ] actor may read both Assets and manage relationships
  - [ ] no self-link
  - [ ] no duplicate effective edge
  - [ ] symmetric relationships canonicalize endpoint order so reverse duplicates cannot exist
  - [ ] directed relationships render the configured inverse label from the target side without storing a second mirrored row
  - [ ] only relationship types marked acyclic run cycle detection; do not impose a false universal tree on legitimate dependency or network relationships
- [ ] Do not allow a relationship to grant access. A user sees an edge only when allowed to read both endpoint Assets; otherwise the relationship is omitted or shown through the existing safe-unavailable pattern without leaking the hidden Asset name/code.
- [ ] Permit same-workspace cross-Client relationships only when the actor can read both Assets. Show both readable contexts and a clear warning because shared infrastructure may legitimately support multiple Clients, but one Client relationship must not imply access to the other.
- [ ] Add Assets-owned service methods and routes for create, read, update-note/type where permitted, and remove.
- [ ] Add relationship picker/search through the Assets provider and existing shared picker/list anatomy. The Assets module owns filtering, safe labels, status/type/location context, and deterministic result ordering.
- [ ] Add relationship detail panels grouped by meaning rather than one undifferentiated list:
  - [ ] `Depends on`
  - [ ] `Supports / depended on by`
  - [ ] `Runs on / hosts`
  - [ ] `Connected to`
  - [ ] `Backs up / backed up by`
  - [ ] `Protects / protected by`
  - [ ] `Contains / part of`
  - [ ] replacement history
  - [ ] other workspace-defined relationships
- [ ] Add bounded dependency/impact traversal:
  - [ ] direct upstream dependencies
  - [ ] direct downstream dependents
  - [ ] optional bounded multi-hop expansion with visited-node protection and explicit depth
  - [ ] readable path labels and status indicators
  - [ ] no unrestricted recursive query or browser-side permission reconstruction
- [ ] When retiring, disposing, or archiving an Asset, warn about readable dependents, active linked Tasks/Tickets, and missing replacement context. The user may continue after explicit confirmation; do not silently cascade status or rewire relationships.
- [ ] Support an optional replacement selection during retirement that creates `replaces` / `replaced by`. Do not automatically transfer identifiers, Files, record links, lifecycle dates, or every relationship.
- [ ] Emit safe events:
  - [ ] `asset.relationship_added`
  - [ ] `asset.relationship_updated`
  - [ ] `asset.relationship_removed`
- [ ] Add regression cases based on real structures:
  - [ ] DigitalOcean account -> production droplet -> Docker host -> Mastodon/PostgreSQL/Elasticsearch
  - [ ] site -> UPS -> protected switch/server
  - [ ] core switch connected to access point and camera network
  - [ ] old workstation replaced by new workstation
  - [ ] cross-workspace link rejected
  - [ ] unreadable endpoint omitted
  - [ ] symmetric reverse duplicate rejected
  - [ ] acyclic containment loop rejected
  - [ ] dependency cycle allowed where the relationship type does not claim acyclic semantics

Acceptance criteria:

- One canonical stored relationship renders correct forward and inverse meaning from both Assets.
- A user can immediately see what an Asset depends on and what would be affected by its loss or retirement.
- Relationship reads never leak an unreadable endpoint or cross a workspace boundary.
- Retirement preserves history and warns about impact without destructive cascade behavior.
- The first release remains a readable relationship registry, not an attempted graphical network mapper.

### Version 0.36.6.5 - Authoritative Asset-to-record links, backlinks, and Related Work

**Model: High Effort** — This slice crosses module boundaries and must provide bidirectional usefulness without duplicate link stores, cross-module table reads, hidden-record labels, or client-portal leakage.

Purpose:

Let an Asset become the durable context hub for every piece of work and knowledge associated with it. A user who searches for an Asset name, Asset Code, hostname, serial number, VIN, plate, or other identifier must be able to open that Asset and see every readable linked Task, Note, Support Ticket, Knowledge Base article, List, Project, and other supported record.

Decision:

Asset-to-record links are owned by one Assets ledger. Consumer modules may render and mutate those links through Assets-owned service/browser contracts, but they must not create separate Asset-link columns or duplicate Asset link tables. Existing module-owned relationships such as Note Linked Context, List linked records, Task parent/child relationships, and Ticket ledger entries remain intact; Assets adds a dedicated Asset relationship surface alongside them.

- [ ] Add `asset_record_links` or a provider-neutral equivalent with:
  - [ ] `asset_record_link_id`
  - [ ] `workspace_id`
  - [ ] `asset_id`
  - [ ] `target_module_id`
  - [ ] `target_type`
  - [ ] `target_id`
  - [ ] optional `link_kind`
  - [ ] optional short safe context note
  - [ ] actor and timestamps
  - [ ] active/removed state where history requires it
- [ ] Start with a small stable link-kind vocabulary:
  - [ ] `related`
  - [ ] `work`
  - [ ] `incident`
  - [ ] `maintenance`
  - [ ] `documentation`
  - [ ] `configuration`
  - [ ] `purchase`
  - [ ] `warranty`
  - [ ] `replacement`
- [ ] Keep link kind descriptive only. It does not grant permission, change target workflow state, or replace the source module's own status/type fields.
- [ ] Validate target module/type through active module contracts and Linked Context providers. Creation requires:
  - [ ] same workspace
  - [ ] Assets enabled
  - [ ] source module enabled
  - [ ] `assets.manage_links`
  - [ ] readable Asset
  - [ ] readable target record
  - [ ] recognized provider/type
- [ ] Add or complete Linked Context target providers for real initial targets where they do not already exist:
  - [ ] Task
  - [ ] Note
  - [ ] Support Ticket
  - [ ] Knowledge Base article/review candidate where visibility permits
  - [ ] List
  - [ ] Project
  - [ ] Client in Business workspaces
  - [ ] later Calendar event/content records only when their owning modules expose safe providers
- [ ] Register Assets itself as a `linkedContextProviders` target with safe Asset labels, type/status/location/Client context, source URL, deterministic ordering, and no secret identifiers.
- [ ] Add Assets-owned browser/service routes for:
  - [ ] list links by Asset
  - [ ] list Asset links by target record
  - [ ] create link
  - [ ] update link kind/context
  - [ ] remove link
  - [ ] permission-safe counts grouped by module/type/status
- [ ] Resolve target labels and URLs through provider-owned read contracts; do not query another module's table from the Assets repository or hard-code how Tickets, Notes, Tasks, Lists, Projects, or Knowledge Base records construct labels.
- [ ] Keep strict creation and soft readback:
  - [ ] new links to disabled, missing, unsupported, cross-workspace, or unreadable targets are rejected
  - [ ] existing links may outlive a target/module and render a safe `Unavailable linked record` state
  - [ ] stale rows never echo raw UUIDs, record IDs, hidden titles, internal Ticket text, secure Note content, or client-private metadata
  - [ ] permitted users may remove/repair stale links
- [ ] Add a Related Work panel on Asset detail:
  - [ ] group by Tasks, Tickets, Notes, Knowledge Base, Lists, Projects/Clients, and other supported providers
  - [ ] show safe label, source/type, status where provider supplies it, link kind, linked date, and source URL
  - [ ] filter by module/type, status, link kind, active/archived state, and text
  - [ ] show counts without counting unreadable records
- [ ] Add reusable Assets-owned target panels/helpers for supported source records:
  - [ ] Task detail/editor
  - [ ] Note detail/editor
  - [ ] internal Support Ticket detail
  - [ ] Knowledge Base editorial/internal detail
  - [ ] List detail/editor where useful
- [ ] Consumer panels call Assets-owned APIs/helpers and use shared picker/list anatomy. They must not read Assets tables, reconstruct Asset permissions, or persist duplicate Asset IDs in their own storage.
- [ ] Allow manual source actions:
  - [ ] create a Task linked to an Asset through the registered Tasks opener
  - [ ] create a Note linked to an Asset through the registered Notes opener
  - [ ] create or link an internal Ticket through the registered Tickets action when available
  - [ ] create a Knowledge Base review candidate only through the existing reviewed publication contract
- [ ] Pass safe defaults/context to module actions and create the Asset link only after the target record is successfully created and the user has confirmed the relationship.
- [ ] Keep client/public projections closed:
  - [ ] Client Ticket views do not show internal Asset links.
  - [ ] Public/client Knowledge Base views do not show Asset links unless a later version defines an explicit client-safe Asset projection.
  - [ ] Internal users may see the link only when they can read both records.
- [ ] Make Asset recovery through Search practical:
  - [ ] Asset Search indexes name, Asset Code, allowed identifiers, manufacturer/model, Location, safe type attributes, and Tags.
  - [ ] Search results open the Asset detail/Related Work handoff.
  - [ ] The Asset detail route is the authoritative permission-safe expansion that reveals every readable linked record.
  - [ ] Do not denormalize Asset names/codes into every linked record's `tags_text` or create a system Tag per Asset.
- [ ] Emit safe events:
  - [ ] `asset.record_link_added`
  - [ ] `asset.record_link_updated`
  - [ ] `asset.record_link_removed`
- [ ] Add regressions for duplicate links, disabled providers, stale targets, secure Notes, internal/client-visible Ticket boundaries, cross-workspace rejection, same-workspace cross-Client permission checks, no raw-ID fallback, and bidirectional panel consistency.

Acceptance criteria:

- Searching an Asset name, Asset Code, hostname, serial number, VIN, plate, or other allowed identifier leads to one Asset hub that lists every linked record the current user may read.
- Tasks, Notes, internal Tickets, Knowledge Base editorial records, Lists, and Projects can show and manage their Asset links without storing duplicate relationship data.
- Removing a link from either side updates the same authoritative ledger.
- Disabled/missing/unreadable targets fail safely and never leak labels or raw IDs.
- Internal Asset context never appears in client/public projections by accident.

### Version 0.36.6.6 - Search, Tags, Files, notifications, and activity integration

**Model: High Effort** — These integrations must use existing framework services and preserve the distinction between classification, attachment, search text, relationship data, permissions, and sensitive information.

- [ ] Register Assets as a framework-searchable type.
- [ ] Add an Assets-owned indexer that includes:
  - [ ] Asset name
  - [ ] Asset Code
  - [ ] safe identifier values
  - [ ] Asset Type/category
  - [ ] manufacturer/model
  - [ ] readable Client/Project and Location context where permitted
  - [ ] safe summary
  - [ ] safe type-specific attributes explicitly marked searchable
  - [ ] effective Tag text through the existing Tags/Search path
  - [ ] lifecycle/record status
- [ ] Exclude from search:
  - [ ] credentials and secret-like values
  - [ ] secure Note content
  - [ ] private keys/tokens/license activation secrets
  - [ ] unrestricted attribute JSON
  - [ ] hidden relationship endpoint labels
  - [ ] file contents unless the existing Files/Search contract independently permits them
- [ ] Register Assets as a Taggable type.
- [ ] Keep the distinctions explicit in UI/help:
  - [ ] **Asset Code** identifies one Asset.
  - [ ] **Identifiers** are searchable identities for one Asset.
  - [ ] **Tags** classify and group records.
  - [ ] **Relationships** connect Assets/records explicitly.
- [ ] Reuse existing Tag propagation where semantics are real:
  - [ ] allow Client/Project classification Tags to propagate to Assets through an Assets-owned resolver when an Asset carries that context
  - [ ] add optional Asset-to-linked-record Tag propagation through an Assets-owned resolver, default off
  - [ ] use existing materialized assignment source metadata and suppressions
  - [ ] never make propagation create/remove the underlying Asset link
  - [ ] never infer Asset visibility, lifecycle, ownership, or relationship type from a Tag
- [ ] Register Assets as an attachable type through the Files service.
- [ ] Support Files such as manuals, receipts, warranties, registrations, photographs, diagrams, service records, configuration exports, and vendor documents through the existing upload/scan/quarantine/download contract.
- [ ] Allow one stored File to link to both an Asset and related Task/Ticket/Note where useful; do not duplicate the stored object.
- [ ] Keep credential/private-key guidance explicit. Configuration exports containing secrets must not be treated as safe merely because Files allows the extension.
- [ ] Add follow/unfollow and notification support through framework contracts where useful:
  - [ ] lifecycle-date approaching
  - [ ] Asset assigned/reassigned
  - [ ] Asset status changed to maintenance/inactive/retired
  - [ ] relationship or link changed when the user follows the Asset
- [ ] Keep notification content safe and body-light; notification open must re-check current Asset and target-record access.
- [ ] Add a readable Asset Activity panel from event summaries:
  - [ ] lifecycle changes
  - [ ] identifier changes
  - [ ] relationship changes
  - [ ] record-link changes
  - [ ] lifecycle-date changes/completion
  - [ ] file attachment events where the existing Files summary contract allows it
- [ ] Add Search, Tags, Files, notification, event-summary, disabled-module, rebuild/repair, and permission regressions.

Acceptance criteria:

- Assets participates in global Search, exact Tag filters, Files, notifications, and safe activity through existing framework-owned services.
- Asset Code/identifiers, Tags, and relationships remain distinct concepts in storage and UI.
- Optional Tag propagation improves discovery without becoming the relationship source of truth.
- Search, events, notifications, and Files expose no secrets or unreadable relationship labels.

### Version 0.36.6.7 - Lifecycle dates, Calendar, Dashboard, Account Home, and Reporting

**Model: High Effort** — Date-based attention crosses Calendar, notifications, Dashboard, and Account Home and must not create a second task/reminder/work-order engine or cross-workspace leak.

- [ ] Add Assets-owned lifecycle-date records for durable Asset facts and obligations:
  - [ ] warranty expiration
  - [ ] subscription/license renewal
  - [ ] domain/certificate expiration
  - [ ] registration
  - [ ] inspection
  - [ ] planned maintenance/service
  - [ ] battery replacement
  - [ ] replacement/end-of-life review
  - [ ] custom date
- [ ] Store date kind, label, due date/time, status, reminder/attention window, optional safe note, completed/dismissed state, actor, and timestamps.
- [ ] Keep one-time lifecycle facts in Assets. For recurring work execution, create/link a recurring Task through the Tasks recurrence engine rather than building an Assets work-order recurrence engine.
- [ ] When the 0.36 Calendar contract supports module-owned event sources, register lifecycle dates as read-only Asset calendar items through that contract. Calendar must not query Assets tables or hard-code Asset date kinds.
- [ ] If the Calendar source contract is not sufficiently general after 0.36.0, keep lifecycle dates in Assets/Account Home and create linked Tasks; do not add an Assets-only framework calendar query.
- [ ] Add manual actions from a lifecycle date:
  - [ ] create linked Task
  - [ ] create/link Ticket for an incident/service request
  - [ ] mark complete/dismiss
  - [ ] reschedule
- [ ] Add an Assets Dashboard module-overview card consistent with the settled Dashboard boundary:
  - [ ] two or three safe metrics such as active Assets, due soon, and needs attention
  - [ ] at most one suggested/latest attention row
  - [ ] one primary handoff to Assets
  - [ ] no full inventory table, topology graph, raw identifiers, or inline editor
- [ ] Add an Assets attention provider for Account Home:
  - [ ] overdue/expiring lifecycle dates
  - [ ] Asset statuses requiring attention
  - [ ] optional unreadable-safe counts of open linked Tasks/Tickets
  - [ ] correct workspace-switch/open link
  - [ ] no raw event or cross-workspace record data
- [ ] Add initial Reporting contributions through the existing Reporting host:
  - [ ] Assets by type/status/Location/Client
  - [ ] upcoming renewals/expirations/maintenance
  - [ ] retired/disposed/replacement history
  - [ ] relationship/dependency summary
- [ ] Keep reports operational, not accounting-facing. Do not calculate depreciation, tax basis, book value, or compliance conclusions.
- [ ] Add deterministic time-zone/date-boundary behavior and regressions for due-soon/overdue calculations, Calendar visibility, Account Home workspace switching, Dashboard compactness, report permission filters, and disabled optional modules.

Acceptance criteria:

- Assets can surface upcoming warranty, renewal, inspection, certificate, registration, maintenance, and replacement attention without becoming a work-order engine.
- Users may turn an Asset date into a linked Task/Ticket through canonical module actions.
- Dashboard and Account Home show permission-safe summaries and handoffs, not full inventories or cross-workspace data.
- Reporting can summarize Assets without direct framework-to-Assets table coupling.

### Version 0.36.6.8 - CSV import/export and integration-safe API groundwork

**Model: High Effort** — Bulk import and external writes can create duplicate identities, invalid type attributes, cross-workspace relationships, or partially committed graphs if validation/transactions are weak.

- [ ] Add CSV export for:
  - [ ] Assets/common fields
  - [ ] type-specific fields
  - [ ] identifiers
  - [ ] Locations
  - [ ] lifecycle dates
  - [ ] Asset-to-Asset relationships
  - [ ] Asset-to-record link metadata where the user may read the target
- [ ] Add staged CSV import with:
  - [ ] upload/parse preview
  - [ ] column mapping
  - [ ] Asset Type selection/mapping
  - [ ] Location selection/mapping
  - [ ] common-field and type-schema validation
  - [ ] duplicate detection by Asset Code and selected identifier kinds
  - [ ] create/update/skip decision
  - [ ] dry-run summary
  - [ ] bounded transactional batches
  - [ ] per-row errors without exposing database internals
  - [ ] explicit final confirmation
- [ ] Keep relationship import separate from base Asset creation so endpoints can be resolved after Asset IDs/codes exist. Reject cross-workspace, self, duplicate, unreadable, or invalid-type edges.
- [ ] Keep Asset-to-record link import conservative. It may use stable external keys only when the target module exposes a supported resolver; never accept arbitrary table names or raw cross-module IDs as trusted input.
- [ ] Add module-owned public/integration API scopes where the existing public API contract is ready:
  - [ ] `assets.read`
  - [ ] `assets.write`
  - [ ] `assets.relationships`
- [ ] Expose stable API operations for Asset list/detail/create/update, identifiers, lifecycle dates, and relationships through module-owned service contracts and workspace-scoped API-key permissions.
- [ ] Preserve fields useful to scripts and future observations:
  - [ ] `external_system`
  - [ ] `external_id`
  - [ ] `last_verified_at`
  - [ ] safe source metadata
- [ ] Allow a script to update version/status/identifier/last-verified data through the normal API; do not add an agent, scanner, polling daemon, discovery engine, or unrestricted bulk SQL endpoint.
- [ ] Make the Assets read contract consumable later by the 0.38.8 read-only MCP connector without coupling MCP directly to Assets tables.
- [ ] Ensure the 0.39.15 public/integration-surface audit includes Assets and that the 0.40.0 dual-backend suite runs Asset CRUD, filters, attributes, identifiers, dates, relationships, and links against both adapters.
- [ ] Add import/export/API regressions for validation, dry run, atomicity, duplicate resolution, API scopes, rate/size bounds, workspace isolation, and provider-neutral SQL.

Acceptance criteria:

- A user can safely import an existing spreadsheet, preview every decision, and export a portable representation of Assets and relationships.
- External scripts can maintain safe Asset facts through scoped APIs without bypassing validation, permissions, or workspace isolation.
- API and import paths cannot create cross-workspace links or arbitrary cross-module references.
- The integration contract is ready for later MCP/automation work but does not pretend to be monitoring or discovery.

### Version 0.36.6.9 - Seeds, documentation, regression, and closeout

**Model: High Effort** — Closeout must prove the module works across Business, Personal, and Family use cases and that relationships, links, search, permissions, and later database work are not held together by special cases.

- [ ] Add deterministic safe seed scenarios:
  - [ ] Business/IT: hosted account -> production server/droplet -> container host -> Mastodon/PostgreSQL/Elasticsearch, with a UPS/network example, identifiers, lifecycle dates, Files, Notes, Tasks, Tickets, and typed relationships.
  - [ ] Business/client: client site -> firewall/core switch -> access point/camera/workstation, with readable Client/Project context and an internal Ticket.
  - [ ] Personal/Family: vehicle, bicycle, camper/trailer, generator/appliance, manuals, inspection/service dates, and linked maintenance Tasks/Notes without Client labels.
  - [ ] Software/services: domain, TLS certificate, SaaS subscription, application version, renewal/expiration dates, and credential-manager references without actual secrets.
- [ ] Add complete regression coverage for:
  - [ ] module catalog/activation and disablement
  - [ ] permissions and default roles
  - [ ] workspace and Client/Project isolation
  - [ ] Personal/Family payloads and terminology
  - [ ] type schema/version/value preservation
  - [ ] identifier normalization and uniqueness
  - [ ] lifecycle/archive/history
  - [ ] QAC contribution filtering and opener behavior
  - [ ] relationship direction/inverse/symmetry/cycle rules
  - [ ] retirement impact warnings
  - [ ] Asset-to-record links and stale/unreadable targets
  - [ ] secure Note and client Ticket/public KB boundaries
  - [ ] Search, Tags, propagation, Files, notifications, and activity
  - [ ] lifecycle dates, Calendar, Dashboard, Account Home, and Reporting
  - [ ] CSV/API validation and atomicity
  - [ ] database-dialect guardrails and migration/repair behavior
  - [ ] accessibility and narrow/wide responsive behavior
- [ ] Add current documentation:
  - [ ] user guide: what qualifies as an Asset, creating types/assets, codes vs Tags, relationships, Related Work, dates, Files, search, retirement
  - [ ] admin guide: enabling/disabling, permissions, type templates, locations, code generation, Tag propagation, import/export
  - [ ] developer guide: module ownership, schema, provider contracts, QAC contribution, relationship/link APIs, Search/Tags/Files declarations, events, reports, public API, no-cross-module-table rule
  - [ ] security guide: no credentials/secrets, safe credential-manager references, Files cautions, client/public boundary
- [ ] Update `docs/module-contract.md`, `docs/module-development.md`, `docs/architecture.md`, declarative-view inventories, search/tag/file documentation, Linked Context provider documentation, Quick Action Capture documentation, and public API documentation.
- [ ] Update `DECISIONS.md` with:
  - [ ] Assets vs retail inventory boundary
  - [ ] common columns plus validated type attributes
  - [ ] explicit relationships/links vs Tags
  - [ ] authoritative Assets-owned record-link ledger
  - [ ] no secrets
  - [ ] no cross-workspace relationships
  - [ ] Creator Studio media terminology distinction
- [ ] Run a formal test-suite streamlining review using timing output and the suite budget. Retire no permission, workspace-isolation, relationship, search, Files, import, migration, integration, or browser critical-journey coverage without demonstrated replacement evidence.
- [ ] Update `CHANGELOG.md`, package metadata, Help content, roadmap archive, feature/marketing proof registers, and `/api/app-info` verification as required by normal closeout.

Acceptance criteria:

- Assets ships as a disableable first-party module that works for IT/business and Personal/Family equipment without terminology distortion.
- Asset Types, identifiers, lifecycle, Locations, relationships, Related Work, Search, Tags, Files, Quick Capture, dates, attention, reporting, import/export, and scoped APIs are documented and regression-covered.
- A searched Asset becomes the durable hub for everything that Asset is, depends upon, affects, and has had done to it.
- The module stores no credentials/secrets, leaks no cross-workspace/client/public context, and introduces no framework-to-Assets table coupling.
- Later Reporting, MCP, Creator Studio, stabilization, integration-audit, and PostgreSQL work can consume documented Assets contracts rather than retrofitting special cases.

## Version 0.37.0 - Expanded Reporting and Invoicing

- [ ] Opening slice — convert Reporting from hard-wired framework core into a registered first-party module (promoted from TODO 2026-07-21): today Reporting has framework-owned routes/service and a framework-catalog `reporting.view` permission, no module manifest, and no `workspace_modules` lifecycle row, so there is no path to disable it at all. Register it in the module catalog (`enabledByDefault: true`, `canDisable: true`), move `reporting.view` ownership into the module manifest, and backfill existing workspaces' module rows via the registry sync so Workspace and Super admins can disable Reporting from Settings -> Admin -> Modules like every other module.
- [ ] Expanded reporting
- [ ] Invoicing
- [ ] Add Assets as a report-capable module and explicitly keep depreciation/fixed-asset accounting out of scope.

## Version 0.38.0 - Advanced User Account Security

This branch builds on the minimum private-preview controls from 0.33.16. It does not re-plan trusted proxies, baseline throttling, password modernization, session revocation, forced logout, password reset, or baseline security-event logging.

### Two Factor Authentication (TOTP) (2FA)

- [ ] Add optional 2FA for users. Can be turned on in the Settings -> User dialog
- [ ] Super admins should be able to turn on a setting that requires 2FA setup on next login for individual users
- [ ] Workspace admins can require users have 2FA to join workspace

### Version 0.38.1 - Passkeys

- [ ] Passkeys

### Version 0.38.2 - Richer Device and Session History

- [ ] Build on 0.33.16 session review/revocation with recognizable device, browser, location approximation, creation, last-used, and risk context.
- [ ] Review absolute and idle expiration policies using measured private-preview behavior; do not weaken next-request revocation.
- [ ] Add suspicious-session highlighting and user/admin history views without exposing raw session secrets or crossing workspace/admin scope.

## Version 0.38.3 - Advanced Login Monitoring and Risk Scoring

Extend the structured baseline security-event stream from 0.33.16 with login-specific enrichment, analytics, risk scoring, and suspicious-login notification. Do not introduce a second competing event log for events already captured by the baseline.

- [ ] Add a `user_login_events` projection/table only where advanced login analytics cannot use the baseline stream directly:
  - [ ] `login_event_id`
  - [ ] `user_id`
  - [ ] `occurred_at`
  - [ ] `success`
  - [ ] `failure_reason`
  - [ ] `ip_address`
  - [ ] `ip_hash`
  - [ ] `user_agent`
  - [ ] `user_agent_hash`
  - [ ] `browser_family`
  - [ ] `os_family`
  - [ ] `device_type`
  - [ ] `country`
  - [ ] `region`
  - [ ] `risk_score`
  - [ ] `risk_reason`
  - [ ] `session_id_hash`
  - [ ] `metadata_json`
- [ ] Enrich baseline authentication events for advanced monitoring:
  - [ ] Successful login.
  - [ ] Failed login.
  - [ ] Password reset requested.
  - [ ] Password reset completed.
  - [ ] 2FA challenge success/failure.
  - [ ] Passkey registration/removal.
  - [ ] New device/session.
  - [ ] Logout.
  - [ ] Admin-forced logout.
- [ ] Add login risk checks:
  - [ ] New device/browser.
  - [ ] New country or impossible travel.
  - [ ] IP reputation check if available.
  - [ ] Many failures for same account.
  - [ ] Many failures from same IP.
  - [ ] Successful login after many failures.
  - [ ] Login from TOR/VPN/proxy if detectable.
- [ ] Add risk-based responses:
  - [ ] Low risk: allow login and log event.
  - [ ] Medium risk: allow login and notify user.
  - [ ] High risk: require 2FA/passkey reauthentication if available.
  - [ ] Critical risk: temporarily block or require password reset/admin review.
- [ ] Add user-facing security tools:
  - [ ] Show recent login history in user settings.
  - [ ] Allow user to revoke sessions.
  - [ ] Email/in-app notification for new device login.
  - [ ] Email/in-app notification for suspicious login.
- [ ] Add admin security tools:
  - [ ] View recent failed login patterns.
  - [ ] Force logout user sessions.
  - [ ] Temporarily disable account.
  - [ ] Require password reset.
  - [ ] Require 2FA setup.
- [ ] Privacy rules:
  - [ ] Do not log passwords, tokens, reset tokens, or full session IDs.
  - [ ] Consider hashing or truncating IP addresses for long-term retention.
  - [ ] Define retention period for login events.
  - [ ] Restrict access to login security logs.

## Version 0.38.x - Advanced Security, Sessions, and Hosted Hardening

Add dependency note:

This branch depends on the runtime configuration contract from 0.33.5.19. Security-sensitive settings must be validated through `.env`/runtime config before public hosted SaaS launch.

Additional hosted/advanced work:

- [ ] TOTP/2FA, passkeys, richer device/session history, risk scoring, suspicious-login notifications, advanced retention/security analytics, and hosted incident-response requirements.
- [ ] Re-evaluate parameters and controls with real preview evidence while preserving the 0.33.16 baseline.
- [ ] Keep hosted provisioning, secret rotation, fleet policy, and managed operations private deployment concerns.

### Version 0.38.4 - Advanced Backup Automation and Retention

**Model: High Effort** — Automated retention and remote/encrypted destinations extend the proven 0.33.17 restore contract and can destroy recovery history if implemented incorrectly.

Baseline backup and restore moved intentionally to 0.33.17 and must not be implemented again here. This later phase may add only genuinely advanced capabilities:

- [ ] Scheduling and retention policies with protected minimum recovery points.
- [ ] Remote destinations and separately encrypted managed backups.
- [ ] Hosted backup orchestration and richer super-admin automation.
- [ ] Point-in-time recovery where the active provider supports it.
- [ ] Restore drills, retention deletion audit, and provider-specific recovery objectives built on the versioned 0.33.17 backup format.

Acceptance criteria:

- Advanced automation extends rather than competes with the baseline format, and scheduling/retention cannot silently delete the last valid recovery path.

### Version 0.38.8 - MCP Server for AI Task access

## Slice: LTF ChatGPT Read-Only MCP Connector Foundation

Goal:
Create a private read-only MCP connector so ChatGPT can retrieve LTF context for daily briefings.

Scope:
- Add an integration layer separate from feature modules.
- Do not wire ChatGPT directly into Tasks, Notes, Lists, or Projects UI code.
- Do not add write actions in this slice.
- Do not expose unauthenticated real user data.

Deliverables:
1. Add MCP server endpoint:
   - `GET/POST /mcp` as required by the MCP server package being used.
   - Endpoint must advertise tools and metadata.

2. Add read-only tools:
   - `ltf_get_daily_briefing_context`
   - `ltf_list_due_tasks`
   - `ltf_list_overdue_tasks`
   - `ltf_list_recent_activity`
   - `ltf_search`
   - `ltf_fetch`

3. Add service-layer query functions:
   - Retrieve tasks due today.
   - Retrieve overdue tasks.
   - Retrieve upcoming tasks.
   - Retrieve active projects/actions with blockers.
   - Retrieve recently changed notes/lists.
   - Return structured JSON only; no HTML rendering.

4. Add auth placeholder:
   - Development may allow local/test mode only.
   - Production path must support OAuth-based user auth before exposing real data.
   - Define future read scopes:
     - `tasks:read`
     - `projects:read`
     - `notes:read`
     - `lists:read`
     - `activity:read`
     - `assets:read`

5. Add audit logging:
   - Log connector tool name.
   - Log authenticated user/workspace.
   - Log timestamp.
   - Do not log full private record bodies unless debug mode is explicitly enabled.

6. Add documentation:
   - How to run locally.
   - How to expose via tunnel for testing.
   - How to connect in ChatGPT Settings ? Connectors ? Create.
   - Security warning that tunnels/no-auth are for dev only.

Non-goals:
- No write actions.
- No public app directory submission.
- No UI widgets inside ChatGPT yet.
- No broad data sync/indexing yet.

### Version 0.39.0 - Creator Studio / Content Studio Module

**Note from 0.36.6 Assets module update**
- Rename `Assets/media` and `Asset library` to `Media files/library` so the word **Assets** remains reserved for the Asset Registry.
   - Allow Creator Studio records to link to real Assets such as cameras, microphones, computers, software, and vehicles through the Assets link contract.

**Model: High Effort** — Creator Studio is a committed multi-workflow first-party module spanning records, Files, Tasks, Notes, Calendar, permissions, and specialized work surfaces.

Purpose:

Ship an official first-party public-core module for the owner; YouTube creators; TikTok, Shorts, and Reels creators; bloggers and newsletter publishers; podcast/content workflows where appropriate; aspiring and working authors; businesses managing their own content; and agencies managing content for clients. It is not an external plugin or market-validation experiment and may be disabled for workspaces that do not need it.

Reference workflows:

1. Creator/video: Idea -> research/Notes -> script/draft -> filming/editing Tasks -> assets -> scheduled publication -> derivative Shorts/TikTok/social/newsletter items -> performance Notes.
2. Author: Book/story idea -> research/world/character Notes -> outline -> chapter or section drafts -> revision Tasks -> supporting assets -> submission/publication planning.

Decision:

- Use content-type-aware terminology and views; do not force authors into video-oriented language.
- Use the settled composed-manifest source pattern and native ES-module frontend entry points from the first implementation.
- Preserve module ownership for Ideas, Drafts, Campaigns/series, Channels, Assets, Repurposing, editorial planning, assignments/reviews, and creator-specific Workbench behavior while integrating through Tasks, Notes, Files, Search, Tags, Notifications, and Calendar contracts.

- [ ] Core records:
  - [ ] Content ideas.
  - [ ] Content drafts.
  - [ ] Campaigns/series.
  - [ ] Publishing channels.
  - [ ] Assets/media.
  - [ ] Content templates.
  - [ ] Repurposing tasks.
- [ ] Content idea fields:
  - [ ] Title.
  - [ ] Description/angle.
  - [ ] Workspace.
  - [ ] Client/project if applicable.
  - [ ] Channel(s).
  - [ ] Format: blog, short, long video, email, social post, product page, course material, etc.
  - [ ] Status: idea, planned, drafting, editing, scheduled, published, archived.
  - [ ] Priority.
  - [ ] Target publish date.
  - [ ] Assigned user.
  - [ ] Tags.
  - [ ] Related notes/tasks/assets.
- [ ] Editorial calendar:
  - [ ] Calendar view by publish date.
  - [ ] List view by status.
  - [ ] Kanban view by production stage.
  - [ ] Filter by brand/site/channel/project/tag.
- [ ] Publishing channels:
  - [ ] Website/blog.
  - [ ] YouTube.
  - [ ] Shorts/Reels/TikTok.
  - [ ] Newsletter.
  - [ ] Facebook/Instagram/X/LinkedIn/Mastodon.
  - [ ] Podcast if needed later.
- [ ] Asset library:
  - [ ] Attach images, video, audio, documents, thumbnails, captions, and scripts.
  - [ ] Track asset usage across content items.
  - [ ] Store alt text, captions, source/license notes, and credit requirements.
- [ ] Repurposing workflow:
  - [ ] One long-form item can spawn shorts, social posts, newsletter blurbs, blog excerpts, and follow-up tasks.
  - [ ] Track each derivative item separately but link it to the source content.
- [ ] Analytics groundwork:
  - [ ] Store published URL.
  - [ ] Store basic performance notes manually at first.
  - [ ] Later: integrate platform analytics where APIs allow.
- [ ] Permissions:
  - [ ] Creator Studio records are workspace-scoped.
  - [ ] Client/project-linked content respects existing permissions.
  - [ ] External clients may be allowed to review/comment only if explicitly enabled.

- [ ] Treat Creator Studio as a committed, disableable first-party public-core module.
  - [ ] The module should ship with Longtail Forge but be disabled by default for workspaces that do not need it.
  - [ ] It should follow the same module manifest, permissions, navigation, search, tags, notification, file, task, notes, and calendar contracts as every other first-party module.
  - [ ] Do not build it as a separate third-party plugin project.
  - [ ] Use it as a real-world test case for whether Longtail Forge modules can compose shared framework services cleanly.
  - [ ] Compose substantial manifest concerns through the proven 0.33.18 pattern while exporting one validated module definition.
  - [ ] Load module browser behavior through native ES-module entry points without new script-order globals.

- [ ] Reuse existing first-party modules where appropriate.
  - [ ] Content ideas may start as Creator Studio records but should be linkable to notes and lists.
  - [ ] Content drafts may hook into Notes when Notes exists.
  - [ ] Campaigns/series should likely be Creator Studio-owned hierarchical records.
  - [ ] Assets/media should use the framework file service.
  - [ ] Repurposing work should be able to create/link Tasks.
  - [ ] Publishing dates should hook into Calendar when Calendar exists.
  - [ ] Tags and Search should apply to Creator Studio records.
  - [ ] Notifications should support assignments, due dates, review requests, and scheduled publish reminders later.

- [ ] Add Creator Studio workbench.
  - [ ] Add a dedicated Creator Studio workbench page.
  - [ ] Workbench should be accessible from a picker similar to workspace/module selection.
  - [ ] It should support a focused content-production workflow without cluttering the basic workbench.
  - [ ] It should optionally filter by client/project/brand/channel/campaign.
  - [ ] It should be disabled cleanly when the Creator Studio module is disabled.

- [ ] Define workbench areas as a framework concept only if the Two-Module Rule is satisfied by real materially similar consumers; otherwise keep Creator-specific workbench behavior module-owned.
  - [ ] Basic workbench for general first-party modules such as timers, tasks, notes, and lists.
  - [ ] Focused workbench for one client/project at a time.
  - [ ] Creator Studio workbench for content planning, drafting, assets, campaigns, repurposing, and editorial calendar work.
  - [ ] Future modules may declare their own workbench areas through the module manifest.

- [ ] Add deterministic safe seed scenarios for both the creator/video and author workflows, including assignments/reviews and representative Notes, Tasks, Files, channels, assets, derivatives, and publication planning.
- [ ] Produce current user, admin, and developer documentation at closeout, including content-type-aware terminology, workspace disablement, permissions, manifest/browser ownership, and both reference workflows.
- [ ] Run a formal test-suite streamlining review at closeout using timing output and the suite budget; retire no regression without demonstrated replacement coverage and manifest/ratchet evidence.

Acceptance criteria:

- Creator Studio supports creator and author workflows without terminology distortion, uses proven module/frontend patterns, remains workspace-disableable, and closes with safe seeds, current documentation, and evidence-backed coverage.

## Version 0.39.9 - User Documentation and 0.3x Stabilization Checkpoint

**Model: Medium Effort** — This is a comprehensive consolidation and gap-closure checkpoint over already documented shipped behavior.

Purpose:

Review, consolidate, and verify the complete 0.3x documentation and stabilization story. Essential installation, preview operation, backup, upgrade, onboarding, and security-limit documentation already ships in 0.33.17; this is not the first documentation pass.

- [ ] Review and consolidate user-facing documentation for the completed 0.3x feature set.
  - [ ] Getting started.
  - [ ] Workspace types and workspace switching.
  - [ ] Users, roles, and permissions.
  - [ ] Clients and projects.
  - [ ] Time tracking.
  - [ ] Tasks.
  - [ ] Notifications.
  - [ ] Tags.
  - [ ] Search.
  - [ ] Files/attachments if completed in 0.32.x.
  - [ ] Support Tickets if completed in 0.34.x.
  - [ ] Notes and Knowledge Base if completed in 0.35.x.
  - [ ] Calendar basics if completed in 0.36.x.
  - [ ] Shopping/procurement lists if completed in 0.39.x.
  - [ ] Creator/content studio if completed in 0.39.x.
- [ ] Create admin-facing documentation for workspace/module setup.
  - [ ] Module enable/disable behavior.
  - [ ] Workspace-type label differences.
  - [ ] Permission expectations.
  - [ ] Safe file upload/download behavior.
- [ ] Create developer-facing notes for first-party module contracts.
  - [ ] Module manifest fields.
  - [ ] Navigation registration.
  - [ ] Permission declarations.
  - [ ] Notification declarations.
  - [ ] Taggable/searchable declarations.
  - [ ] File attachable declarations.
  - [ ] Workbench card/area declarations.
- [ ] Update `docs/architecture.md` to reflect the completed 0.3x architecture.
- [ ] Close documentation gaps, refresh screenshots, audit terminology, verify cross-document links/claims, and reconcile current feature, operator, user, admin, and developer documentation.
- [ ] Run the 0.3x test-suite streamlining review: consume timing output, report slowest tests, review the budget, identify evidence-backed consolidation, and preserve permissions, workspace isolation, database/migration, Files, integration, and critical Playwright/accessibility coverage.
- [ ] Verify `ROADMAP.md`, `TODO.md`, `DECISIONS.md`, `CHANGELOG.md`, and package versions are consistent.

- Add `Assets, Asset Types, relationships, Related Work, lifecycle dates, import/export, and no-secrets guidance` to the user/admin/developer documentation checklist.

- [x] Wipe existing DB migrations and create a new DB baseline  -  Completed in 0.33.5.18.6.5.4.

- [x] Evaluate all existing regressions and see what can be eliminated/lightened  -  Completed in 0.33.5.18.6.5.4 without removing coverage from the standard release gate.

- [x] Determine where efficiencies can be made in the code/Perform an efficiency refactor  -  Initial regression/database efficiency pass completed in 0.33.5.18.6.5.4.

- [ ] Evaluate whether TypeScript would be a useful addition for ensure module/framework contracts are adhered to

- [ ] Audit all Public API calls and make a list for review and modification. Sort by module.

- [ ] Audit all event hooks by module and make a list for review and modification.

## Version 0.39.12 - Self-Hosted Update Assistant Re-evaluation

**Model: High Effort** — Any updater that can replace application code and migrate or roll back a database is a high-risk deployment subsystem.

Purpose:

Re-evaluate update assistance only after at least two real release/upgrade/restore cycles have used the supported Docker Compose path established in 0.33.28. Do not implement an in-app updater merely because an earlier roadmap specified one.

- [ ] Review real operator friction and decide whether users need passive update notifications, a CLI update helper, a Docker-oriented helper, an in-app updater, signed artifacts, and/or automatic rollback.
- [ ] Treat the backup-first Docker Compose upgrade and migration-aware restored-rollback path as the supported initial contract until evidence justifies a safer assistant.
- [ ] Build any future implementation on proven artifact, checksum/signing, backup, restore, release, health/readiness, migration, restart, and rollback contracts.
- [ ] Require explicit threat modeling, permissions, failure-state tests, air-gapped behavior if needed, and a kill switch before authorizing self-modifying behavior.
- [ ] Keep hosted/SaaS deployment and fleet orchestration as a separate private operations concern.

Acceptance criteria:

- The decision records two real upgrade/restore cycles and selects the smallest evidence-supported assistant, including a documented decision to build nothing if manual operations remain sufficient.

## Version 0.39.15 - Public API and integration-surface decoupling (backend-agnostic, pre-Postgres)

**Note from 0.36.6 Assets Module**
- Include the Assets API, relationship API, and future MCP read path in the backend/module-boundary audit.

Purpose:

Decouple the public/integration-facing surfaces from both specific module internals and from any assumption about the storage backend, **before** the 0.40.0 PostgreSQL adapter and dual-backend work begins. This is deliberately ordered ahead of 0.40.0: the public API is the contract external integrations, the MCP connector (0.38.8), the ticket public API (0.34.5), and the future 0.70.0 integrations all depend on, and it must not care whether SQLite or PostgreSQL is running underneath, nor reach around module boundaries to assemble its responses. Doing this decoupling while the backend is still single-provider means the public API contract is proven stable *before* a second backend can perturb it.

Entry contract and grounding (re-verify at implementation time ? code will have drifted):

- `src/services/public-api.service.js` currently imports `clientsService`, `clientsRepository`, and `projectsRepository` directly, reaching around the module boundary to assemble responses instead of consuming module-owned contracts.
- `src/services/tag-propagation-registry.js` is nominally a framework registry but `registerBuiltInResolvers()` embeds module-specific SQL against `clients`, `projects`, `tasks`, `notes`, and `note_links` (with a literal `sqlText("client-projects")` module id). That is module data logic living in a framework file, and it is also raw-dialect/interpolation surface that the 0.33.5.27 seam work does not own because it is keyed on module semantics.
- This version consumes the framework-coupling allowlist recorded in 0.33.6.12, which explicitly deferred `public-api.service.js` and `tag-propagation-registry.js` to this slice.
- Aligns with the 0.70.0 integration guideline: "Avoid integration-specific logic leaking into core services where a module or adapter would be cleaner."

Sizing rule for this branch:

- Each sub-slice has one primary blast radius and should be completable in a single focused session. Do not fold the public API decoupling and the tag-propagation decoupling into one slice just because both touch `src/services/`.

### Version 0.39.15.1 - Public API service module-boundary decoupling

- [ ] Remove the direct `clientsService`/`clientsRepository`/`projectsRepository` imports from `src/services/public-api.service.js`; have it consume module-owned read contracts (the Clients/Projects module's service surface) or a registry-mediated data provider rather than importing another module's repo.
- [ ] Confirm the public API depends only on framework-owned foundations (auth, API-key scopes, permissions, workspace boundaries, module enable/disable guards) plus module-declared `publicApiEndpoints`/`apiScopes`, never on a concrete module's storage internals.
- [ ] Preserve every existing public API response shape, scope check, workspace boundary, and disabled-module write guard exactly; this is a decoupling, not a contract change.
- [ ] Add regressions proving public API responses are unchanged and that the service no longer imports specific module repos/services.

Acceptance criteria:

- The public API assembles its responses through framework foundations and module-owned contracts only, with no direct import of a specific module's service/repo and no response-shape change.

### Version 0.39.15.2 - Tag propagation registry module-ownership decoupling

- [ ] Move the module-specific propagation SQL out of `src/services/tag-propagation-registry.js` and into module-owned resolvers registered through the existing `registerTagPropagationResolver()` seam, so the framework registry holds only the registration/materialization/suppression machinery and each module owns the SQL that reads its own tables.
- [ ] Keep the framework responsible for materializing propagated assignments, honoring suppressions, emitting safe events, and repair tooling; keep each Client/Project/Task/Note relationship query owned by the module that owns those tables.
- [ ] Route any dialect-sensitive SQL the resolvers still need through the 0.33.5.27 seams so the tag-propagation path is also backend-agnostic (this SQL was outside the 0.33.5.27 conversion waves because it lived in a framework service keyed on module semantics).
- [ ] Preserve current Client/Project/Task/Note propagation behavior, resolver outputs, and suppression semantics exactly.
- [ ] Add regressions proving propagation behavior is unchanged and that `tag-propagation-registry.js` no longer contains module-specific table SQL.

Acceptance criteria:

- Tag propagation SQL is module-owned behind the resolver registry, the framework file holds only generic machinery, and dialect-sensitive resolver SQL uses the provider-neutral seams.

### Version 0.39.15.3 - Integration-surface backend-agnostic assertion and closeout

- [ ] Confirm the public API, MCP read connector groundwork (0.38.8), and ticket public API (0.34.5) surfaces contain no direct dependency on a storage backend, raw dialect, or a specific module's storage internals; anything remaining routes through framework foundations, module contracts, or the provider-neutral seams.
- [ ] Extend the 0.33.6.12 framework-coupling guardrail (or add a companion) so the public/integration surfaces cannot reintroduce a direct module-repo import or a hardcoded module ID for data access, and remove `public-api.service.js`/`tag-propagation-registry.js` from the deferred-coupling allowlist.
- [ ] Update `docs/public-api.md`, `docs/module-contract.md`, and `DECISIONS.md` to record that integration-facing surfaces are module-contract- and backend-agnostic, and cross-reference this as a prerequisite the 0.40.0 dual-backend work relies on.
- [ ] Run a pre-PostgreSQL test-streamlining and dual-backend planning checkpoint: consume timing output, identify reusable API contract coverage for both providers, and retire nothing that weakens public API shapes, scopes, permissions, or integration boundaries.
- [ ] Run `npm run check` and `npm run test:permissions`, and verify `/api/app-info` after restart.

Acceptance criteria:

- The public API and integration surfaces are provably independent of the storage backend and of specific module internals before 0.40.0 begins, with a guardrail preventing regression and the coupling allowlist reduced accordingly.

## Version 0.39.16 - SQLite adapter pre-PostgreSQL benchmark checkpoint

**Model: Medium Effort** — Verification checkpoint; the implementation scope of this branch was pulled forward to 0.33.20.1 (2026-07-20 Workbench performance review), because the adapter's per-query overhead was measured multiplying production N+1 costs rather than being a deferrable cleanup.

Purpose:

The original 0.39.16 adapter cleanup (prepared-statement cache, single-scan SQL parsing, single-row `db.get()`, config-gated WAL-safe PRAGMAs) moved to 0.33.20.1. What remains here is its original end-of-0.39 placement rationale: confirm the SQLite adapter is still tuned and benchmarked immediately before the 0.40.0 PostgreSQL adapter lands, so both backends can be benchmarked fairly and the PostgreSQL adapter mirrors the same startup-tuning and statement-lifecycle patterns instead of diverging.

- [ ] Re-run the 0.33.20.1 adapter micro-benchmark on the current codebase and compare against the recorded 0.33.20.1 numbers; investigate any regression before starting 0.40.0.
- [ ] Verify the statement cache, single-scan parsing, single-row `get()`, and PRAGMA tuning survived the intervening branches (no reintroduced per-query scans or write-on-read paths) and that the behavior-preserving regressions from 0.33.20.1 still run in the suite.
- [ ] Record the final SQLite baseline that the 0.40.0 PostgreSQL adapter must be benchmarked against, and note the statement-lifecycle/startup-tuning patterns it should mirror.

Acceptance criteria:

- The SQLite adapter's tuned performance is re-proven on current code with recorded numbers, giving 0.40.0 a fair comparison baseline and a pattern reference for the PostgreSQL adapter.

## Version 0.40.0 - Project Tools expansion & Database extraction layer for use with SQLite or PostGRES

**Note from 0.36.6 Assets Module**
- Include Assets common fields, attributes JSON, identifiers, Locations, dates, relationship traversal, record links, filters, import transactions, and Search rebuilds in the dual-backend contract suite.

Now that we have the base layer of a complete project management tool, we can begin expanding actual project management with milestones, dependencies, status reporting, budgeting, estimation, views, templates, etc.

Allowing the app to run on SQLite OR PostGRES makes it more flexible for self-hosted installs; I want the database layer to be able to handle either one, based on the settings/.env file

Below is a rough road map for all of the 0.40 branch, this is not finalized yet

- [ ] Add topics to GitHub for discovery

### Project Tools expansion

- [ ] Project Milestones/Phases/Deliverables
  - Milestones belong to a workspace and optionally a client/project
  - Tasks, notes, tickets, time entries, and files may eventually link to a milestone
  - Milestones should have a title, description, status, due date, sort order, and optional completion/completed date
  - This should not block basic tasks, but the data model should leave room for it

- [ ] Task dependencies/blockers
  - Allow one task to depend on another task
  - Show blocked tasks clearly
  - Prevent circular dependencies
  - Allow blocked-by relationships across the same project, and maybe later across projects
  - More formal task workflow, such as `backlog`, `ready`, `in_progress`, `waiting`, `blocked`, `in_review`, `approved`, `complete`, `canceled`, and `archived`, often with rules about which statuses can move to which next statuses.

- [ ] Project Status/Health
  - Project status: active, paused, completed, archived
  - Project heatlh: on_track, at_risk, blocked, waiting_on_client
  - Dashboard should eventually surface project health

- [ ] Project budgeting/estimation/actuals
  - should be optional for personal/family projects
  - [ ] Add estimated hours to projects
  - [ ] Add optional budgeted hours/dollars to projects
  - [ ] Compare estimated vs actual tracked time
  - [ ] Show budget/burn progress on project pages and dashboard
  - [ ] Allow reporting by client, project, milestone, tag, and date range

- [ ] List/Kanban/Calendar views
  - [ ] Add list view for tasks
  - [ ] Add Kanban board view for tasks grouped by status
  - [ ] Add calendar view for tasks with due dates

- [ ] Project/task templates
  - should have hard-coded, initial examples that can be used as well as saved templates
  - [ ] Add task templates
  - [ ] Add project templates
  - [ ] Allow project templates to create default milestones, tasks, notes, and checklists
  - [ ] Allow workspace-level templates first
  - [ ] Later: allow client-specific templates

- [ ] Task checklists (tasks can have sub-item checklists)
  - Checklist items belong to a task
  - Items can be checked/unchecked and sorted
    - sort by: due date, importance, etc.
  - Checklist completion can optionally contribute to task progress

- [ ] Task/Project discussions
  - [ ] Add comments to tasks
  - [ ] Add comments to projects
  - [ ] Add internal comments to support tickets
  - [ ] Comments should respect permissions and visibility
  - [ ] Comments should appear in activity feeds where appropriate

- [ ] Files/attachments foundation
  - [ ] Add file attachment foundation for notes/tasks/support tickets/projects
  - [ ] Store file metadata in database
  - [ ] Decide local storage vs object storage later
  - [ ] Respect workspace/client/project permissions
  - [ ] Public-safe attachments required before public KB/client portal features

- [ ] Project Owner/Responsible-user fields
  - [ ] Workspace owner
  - [ ] Client/account owner
  - [ ] Project owner
  - [ ] Ticket owner
  - [ ] Task/ticket assignee remains separate from project ownership

- [ ] Saved views
  - people will want views like: "Tasks due this week," "Waiting on client," "Client open tickets," etc.
  - [ ] Allow users to save commenly used filters
  - [ ] Saved views may apply to tasks, time entries, tickets, notes, and dashboard sections
  - [ ] Views should be user-specific first
  - [ ] Workspace-share views can come later

- [ ] Client approvals and change requests
  - [ ] Add lightweight approval records
    - [ ] Track `requested_by`, `approved_by`, `approved_at`, status, and notes
    - [ ] Link approvals to clients, projects, milestones, tasks, notes, tickets, or files where appropriate
  - [ ] Add change request records
    - [ ] Track request details, status, requester, approver, and related records
    - [ ] Link change requests to Client/Project scope
    - [ ] Make the feature useful for project history and billing justification without turning it into a contract-management system
  - [ ] Keep client-facing approval actions out of scope until permissions and client-portal features are ready

- [ ] Timeline/Gannt-style view

- [ ] Workload/capacity planning

- [ ] Portfolio-level reporting across clients/projects/workspaces

### Database extraction layer - PostgreSQL adapter and dual-backend support

Deferred here from the 0.33.5 line (originally 0.33.5.23, "PostgreSQL Adapter and SaaS Runtime Proof"). Its prerequisites are the provider-neutral database seam from 0.33.5.19, the parameter-binding migration from 0.33.5.23, the array/bulk binding follow-ups from 0.33.5.26, and the completed 0.33.5.27 agnostic-by-contract conversion/seam branch. By the time this section starts, application call sites already use named bound params and provider-neutral dialect seams, with the interpolation and raw-dialect ratchets enforced at zero for app call sites. 0.40.0 is the actual PostgreSQL backend, provider gating, migration-runner, dual-backend test, and SaaS seed/load proof work behind those seams, not an app-wide SQL rewrite. SQLite stays the self-hosted default throughout. See also the PostgreSQL bullets in 0.50.0 and 0.60.0, which this section is the concrete plan for.

Purpose: implement and prove the hosted-SaaS PostgreSQL database backend behind the provider-neutral database contract while preserving SQLite small-office support.

Grounding (re-verify at implementation time - code will have drifted):

- The real adapter seam is `createDatabaseAdapter(provider)` in `src/db/provider.js`, which throws for anything but `"sqlite"` and returns `createSqliteAdapter()`. PostgreSQL plugs in as a new `src/db/adapters/postgres-adapter.js` plus a branch in the factory, not by editing `core/database.js` (a re-export).
- Adapter contract shape (from `sqlite-adapter.js`): `provider`, a `capabilities` object (`transactions: true`, `transactionApi: "callback"`), `query/get/run(sql, params)`, `transaction(callback)`, `health`, `initializeRuntime`.
- `assertNotInsideTransactionContext` (AsyncLocalStorage) guards top-level `db.*` inside a transaction; nested `transaction()` throws. Re-verify the `db.transaction(...)` call-site count (5 at time of writing: `jobs.service.js`, `job-queue.js`, `job-runner.js`, `notes.repo.js`, `tasks.repo.js`).
- SQLite-only introspection/repair historically lived in `src/db/migrations.js` and `src/db/index.js` startup maintenance. Re-verify the 0.33.5.27 startup/migration allowlist and provider gates before adding PostgreSQL equivalents.
- The migration lock is file-based (`src/db/migration-lock.js`, `fs.open(path, "wx")`) and single-host; PostgreSQL needs an advisory-lock equivalent.
- Search is behind a search adapter (`src/core/search/adapters/sqlite-search-adapter.js`, FTS5 `MATCH`/`bm25()`); PostgreSQL needs a parallel `tsvector`/`tsquery` search adapter, not an inline SQL port.

- [ ] **Dialect seam implementation recheck** - consume the closed 0.33.5.27 decisions, audit totals, and enforcement allowlist, then re-scan for drift before building PostgreSQL support. Confirm every active call site still uses the established seams for `INSERT OR IGNORE`/SQLite `ON CONFLICT`, `COLLATE NOCASE`, PRAGMA usage, FTS5 (`MATCH`/`bm25()`), JSON assumptions, boolean storage, `julianday(...)`/date arithmetic, `rowid`, and `RETURNING`/identity. Output only the PostgreSQL implementation gap list and intentional provider-specific paths; do not reopen application repository conversion unless drift is found.
- [ ] **PostgreSQL adapter skeleton and factory wiring** - add `src/db/adapters/postgres-adapter.js`, register it in `createDatabaseAdapter(provider)` (replace the `"postgres"` throw), match the adapter contract exactly, support `DATABASE_URL`/pool/TLS via runtime config, add health checks in the shape diagnostics already consume, and docs for local Postgres dev. No SQLite default changes; connection + contract only.
- [ ] **PostgreSQL implementations for established dialect seams** - implement provider translations for the non-FTS seams established in 0.33.5.27 (`INSERT OR IGNORE`/`ON CONFLICT`, case-insensitive compare/order, boolean storage, date/interval math, `rowid`/identity). SQLite output stays identical; PostgreSQL routes to the compatible form behind the same call. Document intentional provider-specific paths.
- [ ] **Full-text search portability** - a PostgreSQL search adapter behind the existing search-adapter seam, mapping FTS5 `MATCH`/`bm25()` to `tsvector`/`tsquery` + ranking, preserving the search result/permission-scoping contract. SQLite FTS5 adapter unchanged.
- [ ] **Read-modify-write transaction hardening** - wrap the RMW sequences from the audit in `db.transaction(...)` so they stay correct on a pooled/concurrent backend without SQLite's global serialization; reuse the callback-transaction contract and `assertNotInsideTransactionContext`; no nested transactions.
- [ ] **Provider-gate SQLite-only introspection and repair** - gate the SQLite-only routines in both `src/db/index.js` startup maintenance and `src/db/migrations.js` behind the SQLite provider; provide provider-appropriate equivalents (or explicit no-ops) so a PostgreSQL boot does not silently skip required repairs. SQLite behavior unchanged.
- [ ] **PostgreSQL migration runner and advisory locking** - per-provider DDL/introspection selection in the migration runner; advisory-lock equivalent of the file-based lock (which stays SQLite/single-host); keep the `runMigrations` app-facing entry stable.
- [ ] **PostgreSQL schema baseline and checksum** - a PostgreSQL-compatible schema baseline/translation (`src/db/schema/current.sql` is SQLite DDL today), verified from an empty PG database, with checksum validation; docs for the SQLite self-hosted path vs the PostgreSQL SaaS path, migration ownership, and backups.
- [ ] **Dual-backend repository contract tests** - a runner that executes repository contract tests against SQLite and (opt-in via `DATABASE_URL`, Docker or local Postgres) PostgreSQL; prioritize sessions, workspaces, permissions, tasks, notes, files metadata, search index, notifications; prove `db.transaction(...)` pins one connection for the whole callback on PG and that no path uses top-level `db.*` inside a transaction.
- [ ] **Dual-backend test-matrix streamlining review** - consume per-provider timing output, report the slowest setup/tests, establish a dual-backend suite budget, share provider-neutral fixtures/contracts where equivalent, and retain provider-specific migration, transaction, search, permission, workspace, and failure coverage. Do not retire SQLite or PostgreSQL coverage merely because the matrix is expensive.
- [ ] **SaaS seed and load smoke test** - a Postgres seed profile for many workspaces + basic load-smoke scripts covering login/session, app shell, tasks, notes, files, search, notifications, and the job worker; record baseline performance numbers and document what is and is not proven.
- [ ] **Closeout** - record decisions in `DECISIONS.md` (advisory-lock strategy, FTS `tsvector` boundary, intentional provider-specific paths), update runtime-configuration docs so `LONGTAIL_DATABASE_PROVIDER`/`DATABASE_URL`/pool/TLS keys are marked live vs. reserved accurately, add the dual-backend/portability regressions to the suite, and verify `/api/runtime-diagnostics` reports the configured provider/health on both backends.

### Database Tools

- [ ] Configuration files for initial configuration
  - [ ] Merge all previous migrations to make unified initial SQL
- [ ] Migration tools to switch between database backends
- [ ] Export/Import database tools
  - [ ] Allow users to export their workspaces

### App Decisions

- [ ] Define archival period
- [ ] Define lifecycle of tasks, notes, tickets, etc.

## Version 0.43.0

- [ ] Email delivery
- [ ] Invite links
- [ ] Single Sign-On (SSO)

## Version 0.45.0 - Phone/Tablet/TV app prep

- Prepare APIs for Phone/Tablet/TV apps

- Universal Longtail Forge app for iOS

- Universal Longtail Forge app for Android (Latest)

- Roku apps for coordinating teams/families
  - Displays Calendar/Task Lists/Current-Upcoming Day Events

## Version 0.50.0 - Production, Packaging, and Self-Hosting

- [ ] Expand from the limited 0.33.17 private preview to a broader public self-hosted release only after measured upgrade, restore, security, and support evidence.
- [ ] Make PostgreSQL the preferred production database for this release (the SQLite/PostgreSQL adapter, dialect, and dual-backend work is built earlier in 0.40.0 - Database extraction layer; SQLite stays the lightweight self-hosted default)
- [ ] Harden and document the Docker Compose-only production/self-hosted contract established in 0.33.28 rather than reviving a second bare-metal packaging contract.
- [ ] Setup wizard
- [ ] Consolidated public-release admin/operator docs
- [ ] Re-verify the 0.33.16 production cookie, trusted-proxy, CSRF, security-header, and fail-closed configuration posture at broader-release scale.
- [ ] Self-hosted release
- [ ] Expand project management tools

### Added during 0.30.6 Code Review

- Verify runtime data directory permissions for `data/`, `logs/`, and `archive/`.
- Ensure the SQLite database file is not web-served under any configuration.
- Add startup warnings when data/log directories are world-readable or world-writable on platforms where that can be checked reliably.
- Add backup/restore path validation that prevents writing outside approved runtime directories.
- Consider an install health-check endpoint or CLI command that reports filesystem lockdown status without exposing sensitive paths to normal users.

## Version 0.60.0 - SaaS Wrapper

This will be a private plugin, only available to me. This layer is the hosted, multi-tenant *operation* of the app - it builds on the SQLite/PostgreSQL adapter work from 0.40.0 rather than re-implementing it. "Hosted PostgreSQL" here means the managed/provisioned database service and tenant data isolation for the hosted product, not the database adapter itself.

- [ ] SaaS wrapper
- [ ] Hosted PostgreSQL (managed/provisioned instances + tenant isolation on top of the 0.40.0 adapter)
- [ ] Tenant signup
- [ ] Billing
- [ ] Monitoring

## Version 0.70.0 - Integrations and Plugin Readiness

### Guidelines/Notes for Integrations

- [ ] Integration architecture
  - [ ] Integrations should authenticate through API keys, OAuth, or integration-specific credentials as appropriate
  - [ ] Integrations should respect workspace, client, project, and user permissions
  - [ ] Integration events should be audit logged where appropriate
  - [ ] Integration-created records should identify their source in metadata
  - [ ] Avoid integration-specific logic leaking into core services where a module or adapter would be cleaner

### Potential Integrations List

#### Support tickets

- [ ] ZenDesk
- [ ] FreshDesk
- [ ] GitHub Issues

#### Calendars

- [ ] Google Calendar
- [ ] Outlook Calendar

#### Task/To Do App Integrations

- [ ] Microsoft To Do
- [ ] Google Tasks
- [ ] Identify others in the marketplace

#### File Sharing and Storage

Is it possible to get notifications from any of these sources?

- [ ] DigitalOcean Spaces
- [ ] AWS
- [ ] Microsoft Azure
- [ ] Microsoft OneDrive
- [ ] Google Drive
- [ ] DropBox
- [ ] Microsoft SharePoint
  - File sharing
  - Knowledgebase pages
  - Input for tickets/notes/tasks/etc.
- [ ] GitHub (Repository Linking)

#### Email integrations

Auto-routing communications/messaging

- [ ] Google Workspace email
- [ ] Outlook

#### eCommerce Plugins

- [ ] Knowledge Base publishing/search connector for the first-party Knowledge Base module
- [ ] Support ticket intake connector for the first-party Support Tickets module
  - Would include notes plugin for Shopify Admin
- [ ] Automated task creation from:
  - Front-end support tickets
  - Order issues (fulfillment failure, etc.)

- [ ] WordPress/WooCommerce
- [ ] Shopify
- [ ] Magento
- [ ] BigCommerce

#### Personal/Family Workspace Integrations

- [ ] Create grocery/shopping list items from Home Assistant (voice commands inputs)
- [ ] Update/create project tasks from Home Assistant (voice commands inputs)

- [ ] Home Assistant
- [ ] Apple Home
- [ ] Google Assistant (Google Home?)

#### Analytics (Creator Studio)

- [ ] WordPress
- [ ] YouTube
- [ ] TikTok
- [ ] Twitch
- [ ] Facebook
- [ ] Instagram
- [ ] Threads
- [ ] X
- [ ] BlueSky
- [ ] Mastodon
- [ ] Buffer

#### Publishing (Creator Studio)

The Creator studio tool can be much richer if it pushes content out to these platforms, or stores them there until ready for publishing.

- [ ] WordPress (Posts first, the Custom Post Types)
- [ ] Shopify (Blogs)
- [ ] Social Media
  - [ ] YouTube
  - [ ] TikTok
  - [ ] Twitch
  - [ ] Facebook
  - [ ] Instagram
  - [ ] Threads
  - [ ] X
  - [ ] BlueSky
  - [ ] Mastodon
  - [ ] Buffer

## Version 0.71.0

- [ ] Buy domain name
  - [ ] Launch website

- [ ] Launch Social Media
