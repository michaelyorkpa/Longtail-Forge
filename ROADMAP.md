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

Source-contract discipline (branch-wide, from `0.33.33.35`):

- [ ] **A reference audit searches for the symbol in every form it can take, not for call syntax.** `0.33.33.35.2` searched `symbolName(` and missed ten `.filter(actionPermissionsAllowed)` sites, because a bare reference carries no parenthesis; `0.33.33.35.3` then found that the only outside references to four members it moved were the bare ones in a publication block. Check direct invocation, bare reference or callback, alias, destructuring, property assignment, membership in an array, map, or registry, namespace publication, and any test, source contract, or documentation assertion naming it. A symbol that survives under one form and not another fails at runtime rather than at the boundary.
- [ ] **A negative source assertion forbids a construct, not a word.** `0.33.33.35.3` wrote a `doesNotMatch` meant to prove the modal constructors had not moved, and it matched their names inside the new module's own comment explaining why they had stayed. Assert against the form the contract actually names: a definition (`function X(`), a publication (`namespace.X =`), or a call or import, scoped to that construct. Bare identifier-absence is only correct when no comment, doc, test, or unrelated mention may legitimately carry the name.
- [ ] **A measurement that resolves an identifier must resolve its binding, not its spelling.** `0.33.33.38.2.1` attributed 73 diagnostics to `LongtailForge.api` that had nothing to do with it: they sat on a variable named `client` - a customer record - and the attribution was file-scoped, so one function's binding spoke for every function's. Renaming the accessor's local made the false attribution disappear **without making the measurement correct**, which is the trap. A tool that reads the estate follows lexical scope the way the publication inventory already does, or it is measuring names rather than code.
- [ ] **The scope of the evidence must match the scope of the claim.** `0.33.33.37` reported "duplicated status literals 11 to 0" from an audit of the three files its own checkpoint description named, while `task-resume-note-capture.js` and `tasks-dashboard.js` still held the active-status set. The measurement was right and the claim was too wide. A repository-wide elimination claim requires a repository-wide search; an audit deliberately scoped to named owners reports itself that way - "11 to 0 across the three `0.33.33.37` owners" - and names what it did not look at.
- [ ] **Retarget a source contract to what it owns; do not repoint it at a new filename.** When extraction moves code, an assertion that merely pinned its location is a weak contract that survived by accident. Move it to the behaviour, ownership, publication, or dependency claim it was standing in for - `0.33.33.35.2` and `0.33.33.35.3` both did this - and delete it when a stronger assertion already covers the same ground.
- [ ] **Compare a changed file against its own `HEAD` convention, not against an aggregate.** `0.33.33.38.2.2.3` compared `git diff --numstat` against `--ignore-cr-at-eol` in aggregate and the totals disagreed; even a joined per-path view still missed `scripts/regression-contracts/tasks/tasks-timer-utility-escape-hatch.contract.mjs`, which had flipped line endings wholesale and was reporting **132 / 132**. Checking each changed file against the line endings its own `HEAD` blob uses found it immediately. **An equivalence check is only as good as the unit it compares**, and an aggregate total can net two errors against each other.
- [ ] **A checkpoint trailer names the checkpoint that owns the change, and validation cannot check that for you.** `0.33.33.38.2.6.1` was first committed under `0.33.33.38.2.3` - a live identifier owning entirely different work - and **`checkpoint:validate` passed**, because it verifies that a declared checkpoint exists, not that the declared checkpoint is the right one. **Existence is not ownership.** Before writing a trailer, read the section it names and confirm it describes the change; a validator that passes on the wrong identifier is behaving correctly and proving nothing.
- [ ] **A ratified model that no tool implements is not a model.** `0.33.33.38.2.2` decided that a `TS18046` on an *undeclared* namespace member is namespace work rather than a trust boundary, and **the canonical classifier was never changed to match**; three closeouts later `0.33.33.38.2.2.4` had to reconcile a 72 diagnostic gap that simple subtraction exposed - `modal` removed 64 namespace diagnostics and the estate reported 72 more `unknown`. **When a measurement decision is ratified, change the instrument in the same commit, and re-derive an already-published table from it to prove the change was faithful.** Correcting it reproduced the `0.33.33.38.2.2.8` table exactly, which is what made the fix trustworthy rather than merely plausible.
- [ ] **A classifier resolves the namespace root by binding, not by the word `LongtailForge`.** The same reconciliation found `namespace.icons` and `root.icons` - the IIFE alias used throughout `public/js/shared` and `task-dialog.js` - falling through to page-local state, which had inflated `state` and deflated `namespace` by 52 estate-wide. **This is the third time a measurement has been caught reading a spelling instead of a binding**, after `0.33.33.38.2.1`'s alias attribution and `0.33.33.38.2.7`'s publication inventory. Any new estate tool resolves aliases before it counts anything, and proves it by making the unaliased and aliased forms produce the same answer.

Resliced checkpoint rule: parent identifiers `0.33.33.16`, `.17`, `.18`, `.21`, `.22`, `.25`, `.26`, `.28`, `.28.5`, `.28.6`, `.30`, `.30.2`, `.30.3`, `.30.7`, `.30.7.2`, `.31`, `.32`, `.35.1`, `.38.2`, and `.38.2.2` are planning rollups only. Their numeric child sections are the protected implementation checkpoints; completing and archiving the final child closes the parent without a separate parent pull request. Later checkpoint numbering remains unchanged. A corrective child added after a parent's earlier children archived (for example `0.33.33.25.6` through `0.33.33.25.10`) reopens that parent until the new final child archives. **A resliced child must be declared at a heading depth checkpoint governance recognises - `###` or `####`, and no deeper.** `0.33.33.38.2` first wrote its children at `#####`, and `checkpoint:validate` reported every one of them as an undeclared checkpoint: validation visibility is part of declaring ownership, not a formatting preference.

Release-wide measurable acceptance:

- [ ] Every first-party server, test, script, and browser JavaScript file belongs to its owning checked program with no file omitted from the combined program universe, file pragmas, `@ts-ignore`, `@ts-nocheck`, or unexplained `any`; `npm run typecheck` is green under full strict. **Two of the three programs are there: server/tests retired at zero at `0.33.33.26.2` and scripts at `0.33.33.32.28.1`, with explicit `any` at 0 estate-wide.** The browser program carries the remaining 11,134 diagnostics and nine decorative `// @ts-check` pragmas; it is already all-file full strict under `tsconfig.public.json` and is retired at zero by `0.33.33.44`. **Retirement means permanently required to remain at zero, never no longer checked** — the ledger section stays, the estate stays listed, and governance forbids new debt until the whole temporary ledger is deleted at `0.33.33.48`.
- [ ] Every retired or consolidated regression has a machine-checked assertion disposition and named continuing owner. Assertion inventory is at least the baseline minus reviewed true duplicates, and protected behavioral owners remain intact.
- [ ] **No active regression, gate, or operational verification owner depends on historical release-specific `ROADMAP-ARCHIVE.md` or `CHANGELOG.md` content, or on obsolete live-roadmap breadcrumbs, as evidence for current behaviour.** Every surviving planning or history read owns a current live structural or release-process contract and carries a recorded rationale. Scanner coverage is evidence supporting this acceptance, not the acceptance itself.
  - **Forbidden:** an assertion that archived release prose still contains particular wording, or that the live roadmap no longer contains a named completed heading or breadcrumb, used as proof that the code behaves a certain way today.
  - **Allowed:** live roadmap structure and cursor advancement, the version handoff, changelog structure, release-process and routing invariants, and any other read whose subject is a contract that is still live. Naming a planning document as a *path* in a routing table, a ceremony inventory, or an allowed-paths list is a path reference, not a history dependency.
  - **Scanner completeness is not the criterion.** `0.33.33.32.28` restated this deliberately, because the previous wording made a filename grep the standard and five blind-spot classes were then found in it - content readers outside the original pattern, live-roadmap breadcrumb checks the historical pattern cannot see, cursor-floor helpers that name no document, filenames written inside escaped regular expressions, and owners that are not discovered regressions at all. **Every one of the five turned out to be benign once classified.** A rule that demands perfect textual detection of every way a file can mention a filename measures the scanner, not the estate. The baseline stays as shrink-only governance evidence; semantic classification is what the acceptance asks for.
  - Measured at `0.33.33.32.28`: **68 files under `scripts/` name a planning document in some form** - 50 in discovered regressions, 13 in retired scripts still on disk, and 5 in operational tooling that reads the live roadmap by design. The pin baseline records **7 historical content pinners and 24 planning-document readers**, and every one of the 7 names the documents only as path strings in a routing or ceremony table.
- [x] The static estate uses one shared source reader, one `escapeRegExp`, and one fake-DOM harness. The permission harness is discovered and floor-counted. **Closed across `0.33.33.32.28.4` through `0.33.33.32.28.4.5`**: seventy-three owners cut function regions through the three published extractors in `scripts/test-support/source-scan.mjs`, five recorded Workbench readers keep a brace-less body region that no published contract serves, and `framework.full-strict-governance` forbids any other script from defining a function-region extractor.
- [ ] The target full run uses roughly 250-300 Node processes and roughly 250-300 discovered regression entry points without increasing the measured verification wall. These are review targets, not permission to weaken coverage if runtime evidence disagrees. **Measured at `0.33.33.32.28.1`: 347 discovered entry points, unchanged across the whole `0.33.33.32` rollup.** The gap to the review target is recorded rather than closed; `0.33.33.48` dispositions it.
- [ ] Internal checkpoints normally touch no more than two ceremony files; each completed checkpoint's roadmap-to-archive handoff is the final bookkeeping commit in the same protected implementation pull request and becomes authoritative on merge, while release version, changelog rollup, durable decision/docs updates, and runtime identity proof batch at branch closeout.
- [ ] The branch records final before/after compiler, regression, process, assertion, history-reader, dependency-cycle, scripts-line, and module-locality measurements with hypotheses labeled separately from enforced contracts.

### 0.33.33.33 - Isolate classic browser controllers with IIFEs

**CLOSED by `0.33.33.33.8`.** The rollup and its eight children have archived. Every classic browser script is out of the shared lexical environment and the acceptance evidence is recorded in `ROADMAP-ARCHIVE.md`.

**This rollup was reopened once.** `0.33.33.33.7` closed it against the publication scanner available at the time, which discovered only direct `window.<surface> = ...` assignments. The `0.33.33.34` preflight found that model incomplete: most of the namespace is published through an alias, so the recorded inventory of 19 surfaces was a large undercount and a contested surface plus a third `window.fetch` guard were invisible. **The controller isolation work was correct and is unchanged; the publication ownership evidence was not complete.** `0.33.33.33.8` replaced the scanner with an AST-backed alias-aware inventory, re-measured the estate, and re-closed the rollup on the corrected numbers without changing any browser application file.

Closing state, measured on the final tree rather than restated:

| Closure condition | Result |
| --- | --- |
| Classic scripts isolated from the shared lexical environment | **75 / 75** |
| Shared-classic lexical backlog | **empty** |
| `TS2451` | **0** |
| Browser delivery universe | **75 classic + 2 native modules = 77** |
| Application-owned publication surfaces (AST-resolved, alias-aware) | **59** |
| Surfaces with more than one writer | **3, all classified** (2 after `0.33.33.34` retired `filesDialog`) |
| Live or spent diagnostic-reclassification records | **0** |

The two native modules, `dashboard.entry.js` and `tasks-dashboard.js`, each carry a top-level `await` and an export marker, are loaded only as modules, and are loaded classically by nothing.

The three multi-writer surfaces, as corrected by `0.33.33.33.8`:

- **`window.fetch` - permanent ordered platform composition, three writers.** `shared/browser-recovery.js` is injected immediately after `<head>` and wraps the native fetch with 403 permission-denied recovery, `theme-init.js` then adds CSRF, and `navigation.js` then adds 401 session expiry. The third guard writes through its own IIFE parameter and was invisible to the previous scanner, so the rollup had recorded two writers where the tree has three. Because no page declares the injected guard, the record states how each writer is delivered and each mechanism carries its own proof; an order proof with no witnesses now fails.
- **`window.LongtailForge.filesDialog` - temporary migration, three writers. Retired by `0.33.33.34`.** Files was the canonical owner; `shared/file-preview.js` merged its preview opener in through a namespace alias, and `workbench.js` merged a preview-only compatibility bridge. `0.33.33.34` removed both other writers, moved the action-shaped preview opener into the shared helper, and struck the record. The surface has one writer, and the estate now carries two multi-writer records rather than three.
- **`window.LongtailForge.view` - permanent ordered application composition, two writers.** `view-builder.js` publishes 30 base members and is loaded alone on 10 settings views; `view-renderer.js` adds 10 further members with zero overlap and is never loaded without the builder. Builder republishes without spreading the existing surface, so reversing the order would discard the renderer's members, which is what makes the order contractual rather than incidental. `0.33.33.35` has archived: it extracted responsibilities from both files into four sibling surfaces and left this record untouched - same two writers, same 30 and 10 members, same order - which is what its contract required. No retirement is scheduled. These composition facts are read from the AST alongside the writers and governed, not merely described: the member sets must stay disjoint and the renderer must keep spreading the surface it extends.

**What this rollup leaves behind for later checkpoints.** The browser compiler ledger stays active at **10,528** diagnostics; reducing it belongs to `0.33.33.39` through `0.33.33.44`. `window.timeTrackerDebug` remains a bare, un-namespaced `window.*` surface published by `stop-watch.js` with no consumer anywhere in the repository - single-publisher, so it does not block closure, and left untouched because removing or renaming it is not scoping work.

### 0.33.33.38 - Publish the browser contracts whose causes are genuinely shared

**Model: High Effort** - Planning rollup only; its numbered children below are the protected implementation checkpoints.

**Resliced a second time, against post-`0.33.33.37` HEAD, because the previous slice classified `TS2339` by the *receiver type the compiler printed* rather than by the *declaration that produced it*.** Those are not the same thing, and where they disagree the printed type is the symptom. The browser program is now **10,375** diagnostics; every one of them is classified below into exactly one root family, with no duplicate and no orphan.

| Root family | Diagnostics | Codes | Owner |
| --- | --- | --- | --- |
| **Unannotated function parameters** | **4,745** | `TS7006` 3,079, `TS2339` 1,561, `TS7031` 100, `TS7019` 5 | **not `.38`** - `0.33.33.39`-`.44` |
| Under-inferred page-local state | **2,038** | `TS2339` 1,145, `TS7005` 478, `TS7034` 161, `TS18047/8` 166, `TS7053` 77, `TS7023/4/8` 11 | **not `.38`** - per controller |
| DOM subtype and lookup nullability | **1,479** | `TS2339` 861, `TS18047` 612, `TS2531` 6 | `.38.3` |
| Values entering as `unknown` | **1,035** | `TS18046` | `.38.2` + `.38.4` |
| Undeclared / optional namespace surface | **908** | `TS18048` 549, `TS2339` 359 | `.38.1` + `.38.2` |

**Landed after `0.33.33.38.2.1`, measured with the classifier as it then stood: 9,327 diagnostics.** Unannotated parameters 4,718, page-local state 1,915, DOM subtype and lookup 1,484, `unknown` 531, namespace surface 511, assorted 168.

**Restated after `0.33.33.38.2.2.4` corrected the classifier twice.** Against the landed post-`icons` tree the canonical families were **unannotated parameters 4,713, page-local state 1,863, DOM subtype and lookup 1,484, genuine `unknown` 408, namespace surface 528, assorted 168 - 9,164 in total.** **Against the landed post-`billing`-removal tree they are 4,641 / 1,858 / 1,484 / 408 / 459 / 167 - 9,017 in total**, with `unknown` unmoved throughout. The two corrections are described in the branch rules above; between them they moved 52 diagnostics out of page-local state into namespace and stopped `TS18046` on an undeclared member being counted as a trust boundary. **`state` is 52 lower than any figure published before that reconciliation, and whichever checkpoint owns page-local state should size itself against 1,863.**

**The `0.33.33.39`-`.44` debt budgets, re-derived from the corrected canonical classifier.** Every non-contract diagnostic still has exactly one named owner, the owner sums are asserted against the family totals, and none was moved to make a total reconcile.

| Owner | Unannotated parameters | Page-local state | Assorted | Total |
| --- | ---: | ---: | ---: | ---: |
| `0.33.33.39` shared browser framework | **1,660** | **91** | **26** | **1,777** |
| `0.33.33.40` Notes | 378 | 129 | 27 | 534 |
| `0.33.33.41` Tasks and Task Dialog | 556 | 642 | 23 | 1,221 |
| `0.33.33.42` Workbench | 307 | 203 | 21 | 531 |
| `0.33.33.43` Lists, Files, Clients/Projects | 752 | 199 | 26 | 977 |
| `0.33.33.44` remaining page controllers | 979 | 564 | 44 | 1,587 |
| **Total** | **4,632** | **1,828** | **167** | **6,627** |

**`0.33.33.39` fell by 78 because dead source ceased to exist, not because `0.33.33.38` typed anything it owned.** `0.33.33.38.2.2.7` deleted `public/js/shared/billing.js` - a 385-line browser billing implementation whose page delivery was removed by commit `922df3cc` when the responsibility moved to `src/modules/time-tracking/time-tracking-billing.service.js`. **Its 89 diagnostics did not move owner and were not fixed; the file that produced them is gone.** Seventy-two were unannotated parameters, five page-local state, and one assorted - all `0.33.33.39`'s - and the remaining eleven were namespace surface, which `0.33.33.38` owned. **`0.33.33.40` through `.44` are unchanged in every family.**

**Restated from merged HEAD after `0.33.33.38.2.2.6.4.2`, which caused the largest budget movement of the rollup.** Thirty-eight diagnostics left `0.33.33.39`, `.42`, `.43` and `.44`. **They were eliminated, not transferred**: no owner's number rose, no diagnostic changed owner, and nothing was suppressed. Declaring `LongtailForge.clientProjectOptions` forced four page-local `clients: []` fields to be annotated - TypeScript infers `never[]` for them and **nothing is assignable to `never[]`**, so no truthful return type could land without it - and giving that state a precise element type resolved every read the compiler had been unable to follow.

| Owner | Eliminated | Where |
| --- | ---: | --- |
| `0.33.33.39` | 1 | `shared/client-project-options.js` - one parameter, closed by contextually typing `optionLabel` |
| `0.33.33.42` | 12 | `workbench.js` - 5 parameters, 7 page-local state |
| `0.33.33.43` | 22 | `lists.js` 16, `files.js` 6 |
| `0.33.33.44` | 3 | `calendar.js` - 1 parameter, 2 page-local state |

**The two smallest owners were also stale by one before this restatement**: `.42` and `.44` were published as 542 and 1,591 against a tree that measured 543 and 1,590. Both are now derived rather than carried.

**Every number in this table was produced by classifying a diagnostics file against the tree that produced it.** That qualifier is new, because `0.33.33.38.2.2.6.4.2` discovered that the classifier resolves bindings from the **working tree**: classifying a saved snapshot while different source is checked out silently invents family and owner movement, and did - it reported a `.44` increase that did not exist. **`0.33.33.38.2.4` owns making this impossible rather than merely documented.**

**`0.33.33.39` fell one further, from 1,779 to 1,778, and that one is a genuine elimination rather than a transfer.** `0.33.33.38.2.2.6.7` declared `LongtailForge.dashboardBootstrap`, and a page-local read that had been counted as untyped state resolved **because the runtime contract now gives existing state a precise type** - no code was moved, no debt was reclassified, and `0.33.33.38` did not absorb anything `.39` owned. **The distinction matters because the opposite would be invisible:** a child that quietly re-owned a diagnostic would produce the same arithmetic. This one is recorded at the point of elimination so the budget is restated in planning rather than banked. **Page-local state is 1,857 estate-wide and the six owner columns still sum to their family totals exactly.**

**This is the distinction the branch keeps having to make.** A budget may fall because debt was genuinely eliminated, because a classifier defect was corrected, or because the work landed - and the three are not interchangeable. **Deleting a ghost is the first kind**, and recording it as anything else would credit a typing checkpoint with work it never did.

**Every movement from the previous table is one of three things, and each was measured rather than inferred.** The previous figures were produced by a classifier carrying two defects, and `owners.py` carried its own copy of both because it restated the classifier instead of importing it. **There is one classifier now**, and the budget table is derived from it.

- **Genuinely eliminated by landed `0.33.33.38` code: 5 parameters, all in `0.33.33.44`** (986 to 981). They are callback parameters at `module-settings.js` and `workspace-settings.js` that gained contextual types the moment `0.33.33.38.2.2.2` declared `settingsHost.attachmentSections`. **That is real debt removed**, and the owner's budget falls accordingly.
- **Previously misclassified: 52 page-local-state diagnostics, across `0.33.33.39` (113 to 97), `0.33.33.41` (665 to 642), and `0.33.33.44` (579 to 566).** These are namespace reads written through the IIFE's own root alias, which the old classifier recognised only when the root was spelled `LongtailForge`. **They were never page-local state and no `0.33.33.38` child eliminated them.** The proof is that the corrected total is **1,863 at the post-`0.33.33.38.2.1` tree and 1,863 today** - constant across `status`, `modal`, and `icons`.
- **Unchanged: everything else.** `0.33.33.40`, `.42`, and `.43` are identical in all three families, and `assorted` is 168 throughout.

**No future owner's budget was reduced because a broken classifier credited `0.33.33.38` with removing something.** The only reduction of that kind on the table is the five parameters above, and they were traced to the specific child and the specific declaration that removed them.

| Assorted remaining codes | **170** | `TS2345` 55, `TS2322` 40, `TS2698` 16, ... | per controller |

**The correction that matters most: 1,561 of the `{}` cohort are parameters, not page state.** The previous slice read `Property 'className' does not exist on type '{}'` at `view-builder.js:20` as under-inferred state and gave the whole 2,628-strong `{}` cohort to a page-state child. The declaration is `function createElement(tagName, options = {})`. **A parameter whose only type information is a `{}` default is the same defect as `TS7006`** - the default is why TypeScript prints `{}` instead of `any` - and it is removed the same way, by annotating the function in the controller that declares it. Adding those to the 3,079 explicit `TS7006` makes **unannotated parameters 4,745 diagnostics, 46% of the browser program, and none of it is contract work.** The old `.38.3`'s claimed 4,374-diagnostic family does not exist.

**The second correction: `{}` and `unknown` are one root cause, not two.** `LongtailForgeBrowserNamespace` ends in `[key: string]: unknown`. Reading an undeclared member through optional chaining narrows `unknown` to `{}` and reports `TS2339`; reading it without optional chaining reports `TS18046`. Reduced to four lines, `interface NS { [key: string]: unknown }` with `w.NS?.unlisted.x` produces `TS2339: Property 'x' does not exist on type '{}'` and `w.NS!.unlisted.x` produces the `unknown` error, from the same declaration. Splitting them across two children would have split one cause across two owners.

**The third correction: the previous slice had no child for the largest genuinely shared contract in the estate.** `scripts/test-support/browser-publication-inventory.mjs` reports **64 published surfaces - 62 namespace members and 2 bare-window writes**. `LongtailForgeBrowserNamespace` declares **13**. The other **49 resolve through the index signature**, and **943 diagnostics are attributable to a namespace member** by direct read or single-hop alias. `LongtailForge.view` alone accounts for **529** of them, because `const view = window.LongtailForge.view` and `const workbenchViewHelpers = window.LongtailForge.view` each start a file-wide cascade from one untyped read.

- [ ] **`0.33.33.34` through `.37` published six contract interfaces that were never wired to the namespace, and that is a pattern to close rather than to repeat.** `BrowserViewActionSecurity`, `BrowserViewSearchOptions`, `BrowserViewDataBinding`, `BrowserViewModalStack`, `BrowserTaskLifecycleLegality`, and `BrowserFilePreviewActions` are each declared in `browser-contracts.d.ts` and referenced only by a local `/** @type {X | undefined} */` cast in the consumer. Each cast is honest - it is checked against a real interface - but the namespace still says `unknown`, so every other consumer of the same surface starts over. `BrowserAssetVersion` shows the finished shape: it is a declared namespace member and needs no cast anywhere.
- [ ] **A `.d.ts` declaration is not a namespace writer.** Declaring `view` adds no writer to `window.LongtailForge.view`, moves none of its 30 members, and changes no runtime value. The frozen-factory constraint governs publication, and these children publish nothing.
- [ ] **No diagnostic-debt trade.** No explicit `any`, no suppression, no unchecked cast, no `unknown`-to-assertion gymnastics, and no contract widened or narrowed to make a number move.
- [ ] **Each child publishes contract vocabulary; adoption is `0.33.33.39` through `.44`.** A child may adopt its own contracts in shared framework files it already owns. No child converts a module controller.
- [ ] **Report measured effect separately from hypothesis.** Each child states the diagnostics it was predicted to address and the delta it actually produced.

**The three families this rollup excludes are assigned, not orphaned.** "Not `.38`" is a disposition only once each diagnostic has a named owner, and every one of the 6,953 excluded diagnostics falls inside a file that `0.33.33.39` through `.44` already own and are already required to reduce to zero. The split below is the measured distribution across those owners, so the `0.33.33.38` remeasurement gate re-derives their child boundaries from a real starting partition rather than from a residual.

| Owner | Unannotated parameters | Page-local state | Assorted |
| --- | --- | --- | --- |
| `0.33.33.39` shared browser framework | 1,738 | 135 | 28 |
| `0.33.33.40` Notes | 379 | 138 | 27 |
| `0.33.33.41` Tasks and Task Dialog | 556 | 691 | 23 |
| `0.33.33.42` Workbench | 319 | 215 | 22 |
| `0.33.33.43` Lists, Files, Clients/Projects | 765 | 246 | 26 |
| `0.33.33.44` remaining page controllers | 988 | 613 | 44 |
| **Total** | **4,745** | **2,038** | **170** |

**That table is the original pre-`0.33.33.38` partition and is kept as the historical starting point, not as the current budget.** The authoritative figures live with the `0.33.33.39`-`.44` budget table above and are **4,641 / 1,858 / 167**, re-derived from the tree after the classifier corrections and the `billing` deletion. **Two owner tables reading as current is how a stale number survives**, so this one now says which it is.

- [ ] **The assorted family is split by controller and is not one owner's problem.** Its 170 diagnostics are `TS2345` 55, `TS2322` 40, `TS2698` 16 and a long tail; each is a local mismatch in the file that holds it, and each is closed by that file's typing child rather than by a shared contract.
- [ ] **These figures are a partition, not a forecast.** `0.33.33.38.1` changes what the compiler can see, so the mandatory remeasurement gate re-derives every one of them before `.39` through `.44` are sliced.

**Resolved and withdrawn: the `LinkTargetCandidate` versus `LinkTarget` question inherited from `0.33.33.36`.** The distinction is **intentional, correctly placed, and already correctly expressed** - the item is closed with no change to make.

- `LinkTargetCandidate` is **provider input vocabulary**. It is declared on `LinkTargetProvider.list` and `.read` in `link-target-directory-contracts.d.ts` and on all four module providers. A provider must supply `targetType` and `targetId`; every other member is optional, which is what a provider is permitted to omit.
- `LinkTarget` is **framework-normalised output**: `Required<Omit<LinkTargetCandidate, "unavailable">>` plus an optional `unavailable`.
- `shapeLinkTarget` in `src/core/linked-context/link-target-shape.js` is the **transition between them**, and it is total - it assigns all twenty-four required members with an explicit fallback for each. `safeUnavailableLinkTarget` routes through it too, so even the unavailable path returns a complete `LinkTarget` carrying `unavailable: true`.
- **`linkTargetDirectory.list` never declared `LinkTargetCandidate[]`.** It returns `(await provider.list(...)).map(shapeLinkTarget)`, and a type probe against the real project reports its inferred return as `LinkTarget[]`; `notesService.listLinkTargets(...).targets` is assignable to `LinkTarget[]` as well. The probe was proved live by a deliberately impossible annotation, which failed as `Type 'LinkTarget[]' is not assignable to type 'number[]'` - **the compiler naming the inferred type is the evidence.** The `0.33.33.36` note recorded the directory as *declaring* the weak type; it does not, and that half of the note is withdrawn.
- **Nothing here is to be deduplicated.** This is a weaker input contract with a stronger normalised output and a total normaliser between them, which is exactly the shape that must survive.

#### 0.33.33.38.2 - Adopt the checked namespace read, then close the declaration

**A planning rollup, and its children are declared at the same heading depth as every other `0.33.33.38` child.** The `0.33.33.38.2.1` planning commit was the first to carry a third-level identifier, and checkpoint validation recognises a live declaration only at `###` or `####` - a deeper heading left every child of this rollup unable to be committed against its own identifier. The rollup is listed with the other resliced parents above.

**Model: High Effort - RESLICED against the landed post-`0.33.33.38.1` tree. The previous shape - "declare the remaining 48 members and settle the index signature" - addresses 212 of the 808 diagnostics its own family holds, and it is the wrong unit of work.**

**The namespace family is three causes, not one.** Reclassified against the landed tree, the 808 diagnostics attributable to a namespace member or to the namespace itself split as:

| Cause | Diagnostics | What actually fixes it |
| --- | --- | --- |
| **The namespace root is optional** - `window.LongtailForge?` | **323** | checked acquisition at the consumer; no declaration touches it |
| **A *declared* member is optional** - `api` 226, `pageController` 20, `records` 9, `errors` 7, `formatters` 7 | **273** | checked acquisition; these members are **already declared** |
| **The member is undeclared** - 48 members, largest `modal` 37, `icons` 27, `settingsRenderer` 22 | **212** | declaration, then adoption |

**596 of the 808 need adoption, not declaration.** The old child's premise - that undeclared members are the problem - survives for a quarter of its own family.

**Corrected by the `0.33.33.38.2.1` preflight: the adoption figure was too high, because a root-optionality diagnostic is only adoption work when the member on that line is already declared.** 198 of the 323 root diagnostics sit on a line reaching an *undeclared* member, so acquiring the root there trades one diagnostic for another and resolves nothing until `.38.2.2` declares the member. **The genuine already-declared adoption set is 375**, and those 198 move to `.38.2.2`.

**`LongtailForge.api` is not a contract problem at all, and that is the checkpoint's largest single finding.** Its 226 diagnostics across 29 files are **entirely member optionality**: 148 through an aliased `const api = window.LongtailForge?.api` and 78 through `window.LongtailForge.api` directly. `api` has been a declared member since before this rollup and `BrowserApi` is accurate. **Not one of the 226 comes from a method return.** The five methods return `Promise<unknown>` because a fetch body is an untrusted wire value; those consumer narrowings live in the `unknown` family and belong to `.38.4`. **Typing `getJson`'s return to move a number would recreate the inherited-`any` shape the scripts program spent four children removing, wearing a JSDoc annotation.**

- [ ] **Order matters and is fixed by dependency, not by size.** Adoption of the root and the already-declared members can run immediately and needs no new contract. Undeclared members must be declared *and* adopted in one change each, on the rule `0.33.33.38.1` proved: declaring an existing consumed member retypes reads that already exist, and the monotonic ledger rejects the movement unless the consumers narrow in the same commit.
- [ ] **No child may weaken a contract to move a number.** No cast, no non-null assertion, no suppression, no permissive index signature, no `any`.
- [ ] **Classify every acquisition site before converting it, exactly as `0.33.33.38.1` did.** A consumer that legitimately runs without a surface keeps its optionality; four consumers and `file-attachments.js` did, and that was correct.

#### 0.33.33.38.2.6 - Adopt the root read at the declared members

**Model: Medium Effort - RESLICED once the estate was classified by semantics rather than by symptom.**

**All 189 root-optionality diagnostics are `TS18048` and all are canonically namespace**, which is precisely why one syntactic fix would have been wrong. Classified by what each site already does when the surface is absent:

| Class | Diagnostics | Surfaces | What it wants |
| --- | ---: | --- | --- |
| **A** - member intentionally optional | 15 | `icons` 13, `cachedFetch` 2 | an optional root read |
| **B** - member genuinely required | 26 | `pageController` 15, `records` 6, `cachedFetch` 3, `appShellBootstrap` 1, `formatters` 1 | lazy checked acquisition |
| **E** - parked behind an undeclared member | 148 | 25 members | nothing until `0.33.33.38.2.2` declares them |

**`icons` joined this child by being declared.** It was undeclared when this section was first written, so its 13 root sites sat in class E; `0.33.33.38.2.2.4` moved them into class A, which is the mechanism `0.33.33.38.2` describes working as intended. **Expect the class-E column to keep draining into A and B as `.38.2.2` declares members**, and remeasure before drawing any child from it.

- [ ] **Take one semantic class at a time and one surface at a time.** The classes want different mechanisms, and a member name is not a semantics: `cachedFetch` sits in both A and B inside a single file.
- [ ] **Class E is not adoptable and must not be swept in.** Those 148 resolve when their member is declared, and adopting the root there trades one diagnostic for another - the rule `0.33.33.38.2.1` established and remeasured.

#### 0.33.33.38.2.7 - Teach the publication inventory the logical-assignment root

**Model: Medium Effort - a prerequisite, not a cleanup. `0.33.33.38.2.2` decides which surfaces exist and how to group them by reading this inventory, and the instrument was incomplete.**

**The blind spot was found by reconciliation, not by review.** `0.33.33.38.2.1` had 11 root-optionality diagnostics it could not attribute to any member. All 11 reached `settingsPageController` and `settingsHost` - both published, both consumed across five settings pages, and **both invisible to every surface count the estate reports**. `shared/settings-page-controller.js` and `shared/settings-host.js` are the only two scripts that bind the root as `const root = global.LongtailForge ||= {}`, and the classifier resolved `namespace || {}`, `namespace ?? {}`, and the `ns = ns || {}` bootstrap but not the logical-assignment form - which evaluates to its **left** operand rather than its right.

- [x] **Proved fail-first.** A fixture publishing through `global.LongtailForge ||= {}` was added and shown to fail against the unmodified classifier before a line of it changed, so the test demonstrates the defect rather than blessing the fix.
- [x] **Recognition was extended, not loosened.** `||=` and `??=` are accepted only with an empty-object right-hand side, for the same reason `||` and `??` already are: `ns ||= other` is not the namespace. Unresolvable rooted writes stay unsupported, and the estate still reports **0 unsupported writes, 0 deep writes, and no computed top-level member name**.
- [x] **Sibling forms audited rather than speculated about.** The estate uses `LongtailForge || {}` 50 times and `LongtailForge ||= {}` twice; `?? {}` and `??= {}` appear nowhere, and no script binds the root without a fallback. `??=` is accepted because it is the same construct under the existing model, not to be comprehensive.

**The corrected estate, and it is the authoritative starting point for `0.33.33.38.2.2`:**

| | Before | After |
| --- | ---: | ---: |
| Unique published surfaces | 64 | **66** |
| Namespace members / bare-window surfaces | 62 / 2 | **64 / 2** |
| Publication occurrences | 67 | **69** |
| Multi-writer surfaces | 2 | **2** |
| Declared / undeclared members | 14 / 48 | **14 / 50** |
| Unsupported or unresolvable rooted writes | 0 | **0** |

#### 0.33.33.38.2.2 - Declare and adopt the undeclared namespace members

**Model: High Effort** - Planning rollup only. Its numbered children below are the protected implementation checkpoints, drawn from the first namespace map this branch has been able to trust.

**Both measuring instruments were wrong until `0.33.33.38.2.7` and the lexical-attribution correction landed**, and each error pointed the same way - at surfaces and diagnostics this child would have mis-sized. The map below is the first one built with an inventory that sees every publication form and an attribution model that resolves bindings rather than spellings.

**The sizing rule, corrected by the `0.33.33.38.2.2.2` writer-first preflight, and the correction runs the other way.** The rule that member attribution is not implementation ownership still stands. What was wrong was the assumption that the `unknown` half of each member's attribution belonged to `0.33.33.38.4`.

**All 124 of those diagnostics read `TS18046: 'window.LongtailForge.<member>' is of type 'unknown'` - the member itself is unknown because it is undeclared.** They are index-signature symptoms, they resolve the moment the member is declared, and they are this rollup's work. The canonical classifier had been assigning every `TS18046` to the `unknown` family by its compiler code, which is the same mistake in miniature that the whole `0.33.33.38` reslice corrected: **a diagnostic's code is not its cause.**

**The canonical table moves accordingly and the total does not.** Namespace surface **511 to 635**, `unknown` **531 to 407**. The 407 that remain are catch clauses, awaited wire bodies, and parsed JSON - **none of them attributed to an undeclared member**, which is the evidence that the split is real rather than convenient. `0.33.33.38.4`'s scope shrinks by 124 and every `.38.2.2` child grows by its share.

**`modal` owns 64, not 33. `settingsRenderer` owns 44, not 22.** The rule that still holds is the one about strength: **do not broaden a declaration to absorb a genuine wire boundary**, and the 407 remain exactly where they were.

**Every one of the 50 has exactly one writer**, so nothing here raises a multi-writer question. **`.4` was split into `.4` and `.10` after the post-`modal` remeasurement**, which is why the children below are not numbered contiguously.

#### 0.33.33.38.2.2.9 - `LongtailForge.settingsRenderer`

**Model: High Effort - RESLICED. The contract was drafted in full against the writer, wired, and measured; it does not land as one declaration child, and the evidence is specific rather than a size judgement.**

**Nine published members, not ten** - `clearValidationErrors`, `collectPayload`, `normalizeContributions`, `renderDisabledModuleRecovery`, `renderGroupedSections`, `renderSection`, `renderSections`, `showValidationErrors`, `validate`. **44 canonical namespace diagnostics across 5 consumer files, 3 regression owners, required-uniform delivery.**

**Reconfirmed unchanged after `0.33.33.38.2.2.8`, `.3`, and `.4` landed.** Still nine members, still 44 diagnostics across the same five files - **all 44 in the namespace family, none of them `unknown`** - and `settings-renderer.js` still carries **49 unannotated parameters**. The `22 / 22` split this line carried before was an artefact of the classifier defect `0.33.33.38.2.2.4` found and fixed; **this child defers nothing to `0.33.33.38.4`.** The two dead `showSaveAction: false` arguments are still at `user-settings.js:504` and `:512`, and the name still appears nowhere in the renderer. Neither `status` nor `modal` moved anything underneath this child, which is what the reslice predicted: **the blocker is the writer, not the neighbours.**

**The vocabulary search changed the design, and mostly for the better.** `ModuleSettingDefinition` already exists in `src/types/framework-contracts.d.ts`, **which is already in `tsconfig.public.json`'s include list**, so it is browser-visible by design rather than a server contract being borrowed. It describes the setting vocabulary a contribution *arrives* in, and `normalizeSetting` produces something strictly stronger: a **closed** type union where the framework's is open (`normalizeType` maps anything unrecognised to `"info"`), every member present rather than optional, a `visibleWhen` that is complete or `null`, and two members the framework contract does not have - `moduleId` and `value`. **That is the candidate-to-resolved shape `0.33.33.36` proved for link targets**, and the input side reuses the existing contract rather than restating it.

`normalizeContributions` **is a total normalizer**: a non-array input falls back to `options.modules`, each entry is rebuilt field by field, and anything without a `moduleId` or without settings is dropped - so every module that survives has the complete shape and there is no partial form downstream. `value` stays `unknown` because a descriptor is framework vocabulary while the value inside it belongs to the module.

**Why it does not land as one child.** The surface is published from a 563-line writer whose internals are untyped. Declaring the members truthfully means annotating the published functions, and TypeScript then pushes those types inward:

- `collectPayload(scope = document)` infers `scope?: Document`, which is **not assignable** to a contract accepting `Document | Element` - and consumers do pass elements - so the writer must be annotated for the publication to typecheck at all.
- Annotating the published boundary produced **six new diagnostics inside the writer**, in `normalizeFromModules`, `normalizeModule`, `normalizeSetting`, and `renderSections`' `.filter(Boolean)`.
- Closing those required annotating the internal normalizers, and **doing so without designing their input vocabulary introduced three explicit `any` annotations** - which the release-wide acceptance forbids outright. The measurement was `explicit any increased 0 -> 3`, and that is a hard stop rather than a judgement call.

- [ ] **The blocker is the writer's parameter debt, which `0.33.33.39` owns.** `settings-renderer.js` is shared browser framework, and its unannotated internals are already counted in that checkpoint's 1,733-diagnostic parameter budget. **Declaring this surface truthfully is downstream of typing the writer**, not independent of it.
- [ ] **Two orderings are available and the tree should pick one, not the roadmap.** Either this child waits for `0.33.33.39` to type `settings-renderer.js`, after which the declaration is mechanical; or it becomes a two-part child that types the writer's normalization internals first and declares the surface second. **The second is not obviously wrong** - the internals it would type are exactly the ones the contract needs - but it moves shared-framework parameter debt into a namespace child, and that trade should be made deliberately.
- [ ] **Do not weaken the contract to avoid the writer.** Declaring `scope` as `Document` alone would reject the element callers that exist today, and leaving the normalized return `unknown` would discard a total normalizer's guarantee. The drafted contract is correct; what is missing is the writer typing underneath it.
- [ ] **One real defect was found, and this checkpoint owns it.** `user-settings.js` passes `showSaveAction: false` to `renderSections` and `renderGroupedSections` at two sites; **the renderer never reads it**. It is dead configuration of exactly the kind `0.33.33.38.1` found in `createStatusMessage`. **It stays here rather than being swept up by whichever child happens to touch `user-settings.js` first** - it is a defect in this surface's contract, and it is recorded so a blocked checkpoint does not lose it.

#### 0.33.33.38.2.2.10 - `LongtailForge.tags`

**Model: High Effort - BLOCKED after a writer-first preflight and an evidence probe. The contract was drafted in full against the writer, wired, and measured; the writer is not the blocker, and the child does not land as drawn.**

`shared/tags.js` is **838 lines** publishing **twelve members** - `NO_TAGS_FILTER_VALUE`, `allTagsOption`, `createTag`, `createFilterOption`, `loadTags`, `mountFilterPicker`, `mountPicker`, `noTagsOption`, `readTagIds`, `renderTagList`, and `suppressPropagatedTag`. **21 canonical namespace diagnostics across 4 files, all in the namespace family and none in `unknown`.** A guard-dominance audit finds **48 guarded reads, 0 unguarded, and 2 probes** - the same absence-tolerant shape `icons` had.

**The writer's 64 unannotated parameters are genuinely independent, and that is measured rather than predicted.** Drafting the full contract and wiring the member leaves `shared/tags.js` byte-for-byte identical in the ledger - `{2339: 37, 7006: 64, 2345: 1, 18046: 3, 18047: 3, 2322: 1}` either side - with **no new diagnostic inside the writer**. **This is not the `settingsRenderer` blocker**, and `0.33.33.39` keeps its debt whichever way this child is eventually cut.

**No new tag vocabulary is needed either, and that is the second way it differs from `settingsRenderer`.** `normalizeTagList` is a total normalizer - seventeen fields rebuilt with `String(... || "").trim()` and every entry without a `tag_id` dropped - but **it is internal**. Nothing published returns a normalized tag, so there is no shape to design. `TagSummaryRecord` in `client-project-contracts.d.ts` is a four-field summary embedded in client and project records, it is **not in `tsconfig.public.json`'s include list**, and it describes a different concept; the framework's `TaggableTypeContribution` is catalog vocabulary. **Neither is this surface's, and neither should be borrowed for containing the word.**

**Three members cross the network, not the two the earlier measurement recorded.** `loadTags` resolves `body.tags` when it is an array and `[]` otherwise - the array is checked, the elements are not - and a non-OK response resolves to `[]` rather than rejecting. `createTag` resolves `body.tag` as parsed, or `null`, and **rejects** on a non-OK response with an error carrying `status` and `body`. `suppressPropagatedTag` **returns the parsed body untouched** and rejects the same way. All three are `unknown` and must stay that way.

**Why it does not land as one child.** The declaration is correct and independent; its **adoption** is not. Wiring the drafted contract produced **21 new diagnostics across 9 consumer files and 11 (file, code) ledger increases**, and they are not this checkpoint's to close:

- **8 are genuine `0.33.33.38.4` boundaries becoming visible** - `search.js:173` and `time-tracking-reporting.js:42` map straight over `loadTags()`'s result reading `tag.tag_id` and `tag.name`; `notes.js:1958`, `tasks.js:759`, and `task-dialog.js:287` assign it into page-local slots. **That is exactly the movement `0.33.33.38.4` predicts**, but at eight sites rather than the one `0.33.33.38.2.2.2` carried forward.
- **5 are page-local state slots inferred from `= null` and `= []`** - `notes.js:2303` and `:4199` hold `state.tagPicker` typed `null`; `clients-projects.js:1186` and `stop-watch.js:815` hold locals inferred from a fallback literal.
- **2 are DOM subtype mismatches** - `reporting.js:306` passes a `BrowserViewFieldControl` union and `tasks.js:1118` passes an `Element` to `mountFilterPicker`, which needs an input because it assigns `input.autocomplete`.
- **4 are inference collisions inside `task-dialog.js`'s bootstrap `Promise.all`**, where a typed `loadTags` changes what the surrounding destructure infers.
- **2 come from a real defect, described below.**

- [ ] **The declaration and its `0.33.33.38.4` narrowing are inseparable here, and that trade is a planning decision rather than an implementation one.** `0.33.33.38.2.2.2` set the precedent that a declaring child narrows the boundary it exposes and `0.33.33.38.4` records the carry-forward - **it did that once**. Doing it eight times, in files this child otherwise never touches, is `0.33.33.38.4`'s work arriving early under another checkpoint's name. **Either this child waits for `0.33.33.38.4` to own the tag wire boundary, or it becomes a two-part child that declares the surface and narrows its eight consumers in one measured change.** Decide it deliberately; do not let the ledger decide it by attrition.
- [ ] **It would also remove four diagnostics from `0.33.33.39`'s budget, and that must not happen silently.** `clients-projects.js:899` and `:1185`, `stop-watch.js:814`, and `time-tracking-reporting.js:42` are callback parameters that gain contextual types the moment the handles are declared - `TS7006` falls **3,052 to 3,048**. That is debt genuinely eliminated rather than moved, but **a future checkpoint's budget must be restated when it happens, not discovered later**.
- [ ] **A real defect is already in the tree and this preflight found it.** `search.js:289-291` guards on `window.LongtailForge?.tags?.createTagChip` and calls it - but **`createTagChip` is not published**. It is internal to `shared/tags.js`, the guard has always been false, and search results have always taken the plain-chip fallback. TypeScript's suggestion is `createTag`, which **posts a new tag**, so the near-miss is worse than the dead branch. **Removing the dead branch is narrow and behaviour-preserving; publishing `createTagChip` is a runtime change and is not this checkpoint's call.** Record it here so a blocked child does not lose it, exactly as `0.33.33.38.2.2.9` holds `showSaveAction`.
- [ ] **Do not weaken the contract to unblock it.** Typing `loadTags` as `Promise<TagRecord[]>` because the server sends that shape today would erase all eight boundaries at once and recreate the inherited-`any` pattern the scripts program spent four children removing. **The wire is untrusted because nothing validates it, not because TypeScript cannot guess.**

#### 0.33.33.38.2.2.5 - The workspace-context pair

**26 canonical namespace diagnostics, an optional-dominant contract, and - measured after `modal` - a child that cannot close itself as drawn.**

`workspaceContext` (15 / 24 files) and `workspaceContextReady` (11 / 17). Across both, **74 reads are optional-chained and only 16 are direct** - the widest consumer footprint in the estate and the most deliberately absence-tolerant.

- [ ] **Do not convert this cohort to required delivery.** The right change for most sites is an optional root read, not a checked accessor. `0.33.33.35.1.1` built the cold-load bootstrap around this surface being absent. **Six aliases are written `|| {}`** - `files.js:1767`, `lists.js:771`, `notes.js:1785` and `:4762`, `stop-watch.js:1269`, and `shared/module-actions.js:409` - and that fallback is real behaviour rather than defensive noise.
- [ ] **The pairing is right, and the writer proves it rather than the naming.** `navigation.js` publishes `workspaceContextReady = loadAppShellBootstrap()` at line 335 and calls `storeWorkspaceContext(workspaceContext)` inside that same function with the same constructed object. **One shape, two access paths.**
- [ ] **`Promise<WorkspaceContext>` would be false.** `loadAppShellBootstrap` is `async` with **three distinct resolutions** - `undefined` when a 401 redirects, the constructed context on success, and `null` from the `catch` that falls back to `loadWorkspaceSettings()`. **It never rejects.** Fifteen of the twenty-five `workspaceContextReady` reads are direct `await`s, so the tri-state reaches consumers and the declaration has to say so.
- [ ] **One public contract currently spans two children.** `navigation.js:334` publishes `refreshAppShell = loadAppShellBootstrap` - **the same function, uncalled** - and `refreshAppShell` sits in `0.33.33.38.2.2.6`. Decide that ownership before either child lands; declaring the promise here and the function there would describe one runtime expression twice.
- [ ] **Truthful typing is expected to expose `unknown`, not to reach zero.** The constructed object spreads `shell.workspaceContext`, which `AppShellBootstrap` in `src/types/framework-contracts.d.ts` declares as `Record<string, unknown>`. Nine fields are constructed locally and are typeable now - `enabledModules`, `navigation`, `permissionHints`, `quickActions`, `searchTargets`, `viewSurfaces`, `userId`, and `username` - but the fields consumers actually read through those aliases, **`workspaceType`, `workspaceName`, `workspaceId`, `canRebuild`, `publicDemo`, `capabilities`, `tools`, `targets`, and `rawPermissions`, are not among them** and arrive off the wire. **A residue of genuine `unknown` is the correct outcome here**, owned by `0.33.33.38.4`, and a child that promises zero is promising to guess a server shape.
- [ ] **Preflight this one against the writer before drawing its cohorts**, the way `settingsRenderer` and `modal` were. The shape above is recorded so that preflight starts from evidence rather than from the member names.

#### 0.33.33.38.2.2.6 - The undeclared remainder, resliced by writer risk

**Model: High Effort - RESLICED. Planning rollup only; its numbered children below are the implementation checkpoints.**

**The label "mixed remainder" stopped being useful once the estate was measured against a clean tree.** Of the 39 undeclared members, **nine are owned elsewhere** and **nine more belong to `0.33.33.38.2.3`**, which leaves **21 members carrying 86 canonical namespace diagnostics and 78 class-E root diagnostics**. Crucially: **zero genuine `unknown`.** Nothing here is deferred to `0.33.33.38.4` today, though declaring a wire-touching writer may expose some - which is exactly what the children below are drawn to find out one at a time.

**Owned elsewhere and not this rollup's:** `tags` (`.38.2.2.10`), `settingsRenderer` (`.38.2.2.9`), `workspaceContext` and `workspaceContextReady` (`.38.2.2.5`), `refreshAppShell` (**contested between `.38.2.2.5` and this rollup - settle it before either lands**), and the four surfaces `0.33.33.38.2.2.7` preserved with recorded verdicts: `overlayHost`, `supportView`, `sessionAuthWarnings`, `helpPageReady`.

**Moved to `0.33.33.38.2.3`:** `filePreview` - which that child already names - and the eight single-consumer members `clientProjectDialog`, `filesDialog`, `navigationIntent`, `notificationsPageReady`, `quickActionRefresh`, `recovery`, `refreshNotifications`, and `reporting`. **7 namespace and 10 root diagnostics between them**, which is the quiet tail that child exists for.

**Redrawn after `0.33.33.38.2.2.6.1`, because the first partition was measured with a detector that could not see the transport this repository actually uses.** It searched for `fetch(` and `response.json()` and missed every writer reaching the network through `LongtailForge.api` - so two surfaces were filed as no-wire that are not, and four were filed as wire-touching whose **published members never return wire data at all**. The corrected model asks the question per published member rather than per file.

**The children are drawn by writer risk, because that is what every preflight in this rollup has actually turned on.** `icons` landed because its writer's parameter debt was independent; `settingsRenderer` did not because its writer's was not; `tags` did not because its writer crosses the network. **Grouping by consumer count or diagnostic size would have predicted none of those three.**

- [ ] **Preflight each child writer-first and do not promise a child from a sibling's clearance.** Two members published by the same writer share a risk profile; two members with the same diagnostic count share nothing.
- [ ] **The 78 class-E root diagnostics resolve as their members are declared**, and they are not separate work. `0.33.33.38.2.6` closed declared-member root debt to zero; these are the parked half, and they drain child by child.

#### 0.33.33.38.2.2.6.6.1 - `LongtailForge.notificationSubscriptions`

**Complete.** Five members declared, the backlog entry struck, two consumers acquiring through their own delivery guarantee, and **14 namespace diagnostics closed with nothing transferred anywhere.** See the archive entry.

**The reassignment this section used to record was right, and it was resolved rather than reversed.** `follow`, `unfollow` and `readStatus` did return raw API bodies, and declaring the surface before `0.33.33.38.4.10` would have handed every consumer an `unknown` to read `isFollowing` off. That checkpoint narrowed the three members inside this writer, and this child then cost **zero genuine `unknown`, zero state, zero DOM and zero params** - the whole point of ordering them that way.

- [x] **Five members, and the surface is exact.** `follow`, `noteTarget`, `readStatus`, `taskTarget` and `unfollow`. The inventory reports one writer, one publication occurrence, no additive publication and no second writer, so the declaration may cover the literal exactly - and does: removing a member fails with `TS2741` and adding one fails with `TS2353`, **both without a single line of `@type` ceremony.**
- [x] **The request target and the response target stayed apart.** `taskTarget` and `noteTarget` build `BrowserNotificationTargetRequest`; the server echoes `BrowserNotificationTarget`. Declaring either helper to build the echoed shape fails.
- [x] **Checked acquisition matched the delivery contract rather than overriding it.** `footer.js` loads this script behind a presence probe and `shared/module-actions.js` names it as a module-action dependency, so the surface is genuinely optional and every consumer already hides its follow toggle without it. **The guards were extended, not replaced**: `if (!canToggleNotifications)` became `if (!subscriptions || !canToggleNotifications)`, which is the same branch because the flag is already false when the surface is missing. No accessor throws, because nothing here should.
- [x] **Backlog 23 to 22 by identity.** Striking the entry without the declaration fails, keeping it after the declaration fails, and an unrelated declaration cannot pay for it.

#### 0.33.33.38.2.2.6.6.2 - `LongtailForge.notificationPreferences`

**Complete, and it closed the rollup's last notification surface after correcting the instrument that was measuring it.** Eight members declared, the backlog entry struck, six acquisitions in `user-settings.js`, and **19 namespace eliminations with every other family unmoved.** See the archive entry.

**A measurement correction landed first, and it is not implementation progress.** Seven `notifications.js` diagnostics were filed under `0.33.33.44`'s page-state budget because their receiver was `const preferences = getNotificationPreferences()` - an alias the classifier could not resolve through the accessor call. They were namespace work all along. The classifier now resolves that one shape, and **state falls 1,789 to 1,782 while namespace rises 331 to 338 with the total unchanged at 8,590.** `0.33.33.44` is restated at **1,573**.

- [x] **Eight members, and the surface is exact.** `loadPreferences`, three `read*Payload` builders, two renderers, and two `save*` mutations. One writer, one publication occurrence, no additive publication.
- [x] **The three request builders kept their asymmetries.** `readGroupingPreferencesPayload` returns a **closed union** because `normalizeGroupingMode` closes it; `readWorkspaceDefaultsPayload` defaults its id to `""` and filters the empties; `readUserPreferencesPayload` does **neither**, so its `id` is `string | undefined`. **Homogenising them would have erased a difference between two builders four lines apart.**
- [x] **The `id` asymmetry is not a live defect, and that was traced rather than assumed.** `normalizePreferenceList` filters every submitted row against `allowedEventIds`, so a row with no id is dropped by the server before it reaches the repository. **No repair, no behaviour change, and the type now shows the shape the server was already absorbing.**
- [x] **`saveUserPreferences` and `saveWorkspaceDefaults` keep `Promise<unknown>`.** Both callers await and discard, which `0.33.33.38.4.10` proved from the boundary side and this child re-proved from the surface side with a test that fails if any caller starts binding the result.

**Eight members, six constructed and two returning a raw body.** `loadPreferences` builds its result locally, the three `read*Payload` members construct from the DOM, and the two `render*` members return nothing - but `saveUserPreferences` and `saveWorkspaceDefaults` both `return body` straight from the API.

- [x] **Traced, and the answer was the second branch.** Neither `body` return is read: `user-settings.js:321` and `notifications.js:441` both await and discard. **`Promise<unknown>` is the intentional contract for those two members**, so they were never `0.33.33.38.4`'s work.
- [x] **What did need this checkpoint was `loadPreferences`, which nobody had listed as a wire boundary.** It constructs its envelope but passed `events` through once `Array.isArray` was satisfied - container validation standing in for element validation. `0.33.33.38.4.10` checks the elements and adopts the one state slot that stores them.
- [x] **The seven were never state debt, and the classifier now says so before the source changed.** They are `TS2339` reads through an accessor alias, and correcting the attribution while the evidence still existed is the estate's own rule about ratified measurements.
- [x] **The three `read*Payload` members are request payloads, not response bodies.** They belong to this surface's declaration and not to any `0.33.33.38.4` child.

#### 0.33.33.38.2.2.6.6.3.1 - `LongtailForge.tasksDialog`

**Split out of `0.33.33.38.2.2.6.6.3`, which declared its two sibling dialogs and could not take this one.** The contract is fully derived and ready: eight members - `configure`, `open`, `openAdd`, `openEdit`, `openTaskEditor`, `pollRecurrenceContinuity`, `recurrenceContinuityMessage`, `renderRecurrenceContinuity` - with the four openers resolving `dialog.returnValue || "closed"` and `pollRecurrenceContinuity` returning an opaque continuity token its two sibling members consume.

- [ ] **The blocker is `public/js/tasks.js`, not this surface.** Declaring `tasksDialog` gives `action.behavior` a `string` type where it was `any`, and `TASK_LIFECYCLE_BEHAVIOR_HANDLERS[action.behavior]` then cannot index its own frozen record - **four `TS7053` in `tasks.js`, all page-local state owned by `0.33.33.41`.** Its two sibling dialogs caused none.
- [ ] **This is the `0.33.33.38.2.2.6.5.1` pattern with a different shape**: not a state field inferred too narrowly, but a closed record indexed by a key the declaration made precise. Neither is a copy of this contract, so neither belongs here.
- [ ] Land it with `0.33.33.41`, or once that record carries a key type. The member stays in `0.33.33.38.2.4.3`'s backlog until then.

#### 0.33.33.38.2.2.6.6.4 - `LongtailForge.taskCalendar`

**Eight constructed members, one that returns a parsed body, and a blocker that is not in this file.** `addDays`, `calendarRange`, `dateKeyOf`, `normalizeCalendarView`, `parseDateKey`, `readPreferredCalendarView`, `renderCalendarBody` and `resolveDefaultView` are all locally constructed - `readPreferredCalendarView` reads `userPreferences.preferredCalendarView` but **returns it through `normalizeCalendarView`**, so its output is a checked member of a known set rather than the wire value.

- [ ] **`fetchCalendarWindow` returns `dashboardBootstrap.loadRoute(route)` or `response.json()`.** The first is already declared `Promise<unknown>`, so that is the honest type for both branches and the surface could be declared whole.
- [ ] **The blocker is `public/js/calendar.js:44`, which initialises `data: null` in a state object literal** - the `0.33.33.38.2.2.6.5.1` pattern exactly. `calendarState.data = await fetchCalendarWindow(...)` then fails because nothing is assignable to `null`. That field is page-local state owned by `0.33.33.44`, and it is not a copy of this contract.

#### 0.33.33.38.2.3 - Close declaration coverage for the quiet tail

**Restated against the post-`0.33.33.38.2.2.7` tree: `filePreview` plus eight single-consumer members - `clientProjectDialog`, `filesDialog`, `navigationIntent`, `notificationsPageReady`, `quickActionRefresh`, `recovery`, `refreshNotifications`, `reporting` - carrying 7 namespace and 10 root diagnostics between them, and the four zero-consumer surfaces `0.33.33.38.2.2.7` preserved with verdicts.** A governance change wearing a typing change's clothes.

**`billing` is gone and is not this child's to declare.** `0.33.33.38.2.2.7` established it was superseded and deleted it; the four that remain - `overlayHost`, `supportView`, `sessionAuthWarnings`, `helpPageReady` - each carry a recorded verdict, and **two of them are recorded as uncertain rather than live.** Declaring an uncertain surface here would be the drift this child exists to stop.

- [ ] The single- and zero-consumer members produce almost no diagnostics - **14 and 2** respectively under corrected attribution - because their one consumer already narrows locally or guards. `viewActionSecurity`, `viewSearchOptions`, `viewDataBinding`, `viewModalStack`, and `filePreview` **already have accurate published interfaces and are cast locally at their single consumer** - wiring them is mechanical and removes the cast.
- [ ] **Do not justify this child by diagnostic count.** Its value is that the namespace stops drifting, which is why it belongs next to the governance child rather than to the typing ones.
- [ ] Five members have no consumer at all: `billing` (`shared/billing.js`), `helpPageReady` (`help.js`), `overlayHost` (`shared/overlay-host.js`), and `sessionAuthWarnings` and `supportView` (both `navigation.js`). **Four produce zero diagnostics and `supportView` produces two.** Establish whether each is a live seam, an external hook, a compatibility surface, or a ghost **before** declaring it - and where repository evidence cannot settle it, **record the uncertainty rather than declaring by default.** A declaration with no runtime owner is its own kind of drift, and declaration coverage is not a reason to immortalise a dead global.

#### 0.33.33.38.2.5 - Remove the namespace index signature

**Runs last, because until every legitimate surface is declared it would break the estate rather than govern it.**

**The evidence says the catch-all is bootstrap looseness, and the seams confirm it.** `[key: string]: unknown` entered in `dabf9257`, "Add browser typecheck utility tier", with no extensibility rationale recorded. Against a dynamic contract: the AST inventory reports **0 unresolvable rooted writes, 0 deep writes, and no computed top-level name anywhere in the estate** - every one of the 62 members is a static identifier, so the namespace is fully statically enumerable. Module contributions are server-side catalog data and publish nothing onto the browser namespace. Governance already treats an unresolvable rooted write as a failure rather than a supported form.

- [ ] Removing the catch-all makes an undeclared publication a compile error, which is the behaviour the estate already wants. **Confirm once more against every contribution seam before removing it**, and record what was checked.
- [ ] **Never propose `[key: string]: any` or any other permissive signature as the alternative.** The choice is a declared member or a compile error.

**Excluded from this whole family.** The `unknown` consumer boundaries are `.38.4`; DOM subtype and lookup is `.38.3`; `TaskLifecycleStatus` is `.38.5`. The 6,868 diagnostics in the unannotated-parameter, page-local-state, and assorted families keep their `0.33.33.39` through `.44` owners and **must not be absorbed here**.

#### 0.33.33.38.3 - Publish checked DOM lookup and event-target contracts

**Model: High Effort - 1,479 diagnostics measured, corrected down from the 2,169 the previous slice claimed.**

- [ ] Add checked DOM lookup and assert helpers that return the correct element subtype or fail explicitly. Do not turn a required element into an optional no-op.
- [ ] Add explicit event-target narrowing rather than a cast at each listener. `EventTarget` is only 10 diagnostics; the 861 are `Element` where a subtype is needed.
- [ ] **The nullability cohort splits three ways and only two are yours.** Of 1,327 `TS18047`/`TS18048`: **549 are the namespace surface** (`.38.2`), **449 are DOM lookup results**, **265 are the declared-null element caches** the `cacheXElements()` pattern produces, and 64 are neither. The previous slice assigned the whole cohort to DOM.
- [ ] The declared-null caches are a different shape from a lookup result and may need a different answer; measure them separately rather than forcing one helper over both.

#### 0.33.33.38.4 - Publish narrowing contracts for the genuine dynamic boundaries

**`LongtailForge.userPreferences` is owned here, moved out of `0.33.33.38.2.2.6.5` by that child's preflight.** It was listed as a narrow pure surface and it is neither. `public/js/navigation.js` publishes it **inside an async bootstrap, after `await response.json()`**, and its single member is `shell.user?.preferredCalendarView || null` - **an unvalidated wire field with a fallback.** The fallback does not make the non-null value trustworthy: nothing checks that the server sent one of the three views the page can render, so a closed string union would be a claim about the API that no code makes. **Do not declare it as one, do not cast it, and do not widen it to `string` to make the shape look settled.**

Its **lazy publication is a second contract question and belongs here too**: the surface does not exist until that request resolves, so every consumer sees it as genuinely absent for part of the page's life. That is optionality with a cause, not the ordinary namespace optionality `0.33.33.38.2.6` adopts.


**Corrected to 379 by `0.33.33.38.2.2.6.1`, and the 29 that left were never this checkpoint's.** The attributor resolved a diagnostic's subject by spelling: `'namespace.timezones' is of type 'unknown'` names a member through the IIFE's own root alias, the resolver reports that alias as no member at all, and the diagnostic fell through to the `unknown` family. **29 diagnostics across twelve members were counted here that are undeclared-member namespace symptoms.** The family did not move when `capturePrompt` landed - it was 379 before and after - and the appearance that it had was the instrument.

**The boundary, restated because a code keeps being mistaken for a cause:** a `TS18046` belongs to this checkpoint **only when the runtime value is still unknown after namespace and member identity are resolved.** An undeclared member that happens to emit `TS18046` is namespace work no matter what the compiler printed.

**Model: High Effort - 378 genuine runtime boundaries at the reslice, 231 after `0.33.33.38.4.1`.** The historical figures this section carried - 1,038, then 408, then 407, then 379 - were each true of the tree that produced them and none is true now. **They are not implementation inputs.** `0.33.33.38.2.4.2` exists so this number is produced rather than remembered: `node scripts/typecheck-governance.mjs` prints it, and a child that quotes any other figure is quoting a tree it is not editing.

- [ ] **Carry-forward from `0.33.33.38.2.2.2`: `workspace-settings.js` reads `moduleId` and `lifecycle` off the array `settingsHost.attachmentSections` returns.** That array is part of the `GET /api/settings/catalog` body, so declaring the surface truthfully as `unknown[]` made the trust boundary visible; the consumer now narrows with a predicate before sorting. **The diagnostic moved to its true owner - it is not evidence that the contract should be weakened**, and the baseline is 408 rather than 407 because of it. Expect this number to move again as later `.38.2.2` children declare their surfaces; each such move is a boundary becoming visible, not new debt.

- [ ] Add named API response and descriptor handoff contracts with `unknown` narrowing at the network and view boundaries.
- [ ] **`BrowserApi` already returns `Promise<unknown>` from all five methods, and that is correct.** A fetch body is an untrusted runtime value; the contract is right and the consumer is what needs a narrowing step. **Do not type `getJson`'s return to remove errors** - that would recreate the inherited-`any` shape the scripts program spent four children removing, wearing a JSDoc annotation.
- [ ] **Every one of them is a real boundary, and none is attributable to an undeclared namespace member** - which is what makes the boundary with `0.33.33.38.2.2` hard rather than a judgement call. A `TS18046` whose subject is an undeclared member is namespace work no matter what code the compiler emitted; a `TS18046` on a value that is still unshaped after its member is declared is this child's.
- [ ] Read the producer before publishing any contract, and do not tighten a deliberately extensible contract to remove errors.

**Resliced by producer, because a boundary is a thing that produces values and a diagnostic count is not.** The 378 were dumped from the durable classifier and traced back to what produced them. **Two kinds, and they are not variants of each other**: 147 are values a `catch` clause bound, produced by throw sites and shaped by one already-declared contract; 231 are API bodies, produced by 74 distinct calls across nineteen endpoint families. Splitting the first by file would have made 32 children of one boundary; splitting the second by count would have cut single endpoint families in half.

**The endpoint attribution below is a trace, not a guess, and it is incomplete on purpose.** Resolving one level of local indirection attributes 179 of the 231; **52 reach their producer through helpers this pass did not follow**, and they are recorded as unattributed rather than distributed to make the table add up. Attributing them is `0.33.33.38.4.9`'s first task.

| Producer family | Live | Consumers |
| --- | ---: | --- |
| Caught values | **147** | 32 files - **closed by `0.33.33.38.4.1`** |
| `/api/notes*` | 40 | `notes.js`, `notes-settings.js`, `tasks.js`, `shared/notes-linked-panel.js` - **24 closed by `0.33.33.38.4.2`**, the rest resolved to four other producers |
| `/api/tasks*` | 34 | `tasks.js`, `task-dialog.js`, `workbench.js` |
| `/api/users`, `/api/roles`, `/api/role-assignments` | 29 | `user-admin.js`, `role-assignments.js`, `lists.js` |
| `/api/settings*`, `/api/user/settings` | 18 | four settings pages |
| `/api/client-projects`, `/api/clients`, `/api/private-feeds` | 20 | `clients-projects.js`, `calendar-settings.js`, `lists.js`, `files.js`, `time-entry-dialog.js` |
| `/api/lists*` | 7 | `lists.js` |
| `/api/support-view*`, `/api/security-events`, `/api/runtime-diagnostics`, `/api/jobs` | 13 | `support-view-audit.js`, `audit-log.js`, `workspace-settings.js` |
| `/api/files*`, `/api/api-keys`, `/api/workbench`, `/api/active-timers`, `/api/time-entries` | 15 | `files-settings.js`, `api-keys.js`, `workbench.js`, `shared/file-preview.js`, `time-entries.js` |
| `/api/tags/bulk-assignments` | 4 | `notes.js` - a bulk-action envelope, **not** the `LongtailForge.tags` surface; `0.33.33.38.4.2` found seven more of the same envelope and drew `0.33.33.38.4.11` for all eleven |
| Unattributed producers | 52 | traced no further than a local helper |

**`LongtailForge.tags` has an owner and this checkpoint must not take its work.** `0.33.33.38.2.2.10` owns it, is BLOCKED after a writer-first preflight, and holds the recorded `createTagChip` defect. The `tagPicker` and `bulkTagPicker` fields `0.33.33.40.1` left behind wait on that declaration rather than on a response contract. **Two surfaces blocked behind one undeclared member is a dependency, not a reason to reassign ownership.**

**A first attempt at this table put four `notes.js` reads under that ownership and it was wrong, so it is corrected here rather than carried.** The four are `POST /api/tags/bulk-assignments` reads at `notes.js:2404-2427`, and they reach the route through `requireApi().postJson` directly - **not through `LongtailForge.tags`**. They read a bulk-action envelope of `notes`, `changed` and `errors`, which is the same envelope `notes-settings.js` reads from the catalog bulk route, and they are `0.33.33.38.4.2`'s. **The route a body comes from does not decide its owner; the surface a consumer reaches it through does.**

**What this checkpoint unblocks, stated as a map rather than a hope.** `0.33.33.40.2` waits on `/api/notes*`; `0.33.33.38.2.2.6.6.1` and `.6.6.2` wait on the notification bodies, whose diagnostics **are not in today's 378** because they appear only once those surfaces are declared - a demand-driven child, sized by a preflight rather than by the classifier; `LongtailForge.userPreferences` is owned here outright, on the terms recorded at the top of this section.

#### 0.33.33.38.4.1 - Narrow the caught-value boundary

**Complete.** One producer, one already-declared contract, 147 diagnostics, zero transfers. See the archive entry.

#### 0.33.33.38.4.2 - The Notes entity and collection response contracts

**Complete for the entity and collection family: 24 of the 48 diagnostics in the three Notes-owned files.** The other 24 were traced to five different producers and left with them. See the archive entry.

**The file a diagnostic sits in did not decide its owner, and this child is the proof.** `notes.js`, `notes-settings.js` and `shared/notes-linked-panel.js` hold 48 genuine `unknown` reads between them, and only half are the Notes entity boundary:

| Producer | Live | Owner |
| --- | ---: | --- |
| `{ note }` from `GET/PUT/POST /api/notes[/:id]` | 19 | **closed here** |
| `{ notes, pagination }` from `GET /api/notes` | 3 | **closed here** |
| `{ collections }` from `GET /api/notes/collections` | 2 | **closed here** |
| `{ affectedCount, changed, errors }` bulk envelope | 11 | `0.33.33.38.4.11` |
| `{ catalogs, capabilities, preflight, execution }` | 5 | `0.33.33.38.4.5` |
| `GET /api/settings/catalog`, `GET /api/user/settings` | 2 | `0.33.33.38.4.5` |
| `{ revisions }` and the revision restore body | 2 | `0.33.33.38.4.12` |
| `{ bodyHtml }` from `POST /api/notes/preview` | 1 | `0.33.33.38.4.12` |
| `{ targets }` from `GET /api/notes/link-targets` | 1 | `0.33.33.38.4.12` |
| `shared/notes-linked-panel.js` | 2 | carried forward, below |

- [x] **Two of the four blockers `0.33.33.40.2` recorded are gone, and two are not.** `selectedNote`, `editorNote`, `notes` and `collections` now hold named contracts, and `notesPagination` and `bulkCollections` came with them because they store the same two narrowed responses. `tagPicker`, `bulkTagPicker` and the rest stay with `0.33.33.40.2`.
- [ ] **`shared/notes-linked-panel.js` is carried forward, and the blocker is a surface decision rather than a contract one.** Its two reads are the same `GET /api/notes` list envelope plus the `{ linkedNotes }` panel projection, and `BrowserLinkedNoteItem` is already declared for the latter. What is missing is a **shared narrowing implementation**: doing it locally would duplicate the column tables and predicates into a second file, and doing it properly means publishing a note-record surface on the namespace - which is `0.33.33.38.2.2`'s decision, not this child's. **Two consumers is where the estate should decide, not where it should copy.**

#### 0.33.33.38.4.11 - The shared bulk-action failure contract

**Complete, and the trace corrected its own title.** See the archive entry.

**There is no `{ affectedCount, changed, errors }` envelope, and the instruction to trace every bulk route before naming the contract is why that was caught.** Four routes participate, not two - `POST /api/notes/bulk`, `POST /api/tags/bulk-assignments`, `POST /api/notes/settings/catalogs/bulk` and `POST /api/tasks/bulk` - and **none of them emits that shape**. They pair four different success payloads (`notes`, `changed`, `catalogs`, `tasks`) with one kind of failure list, and only the catalog producer sends `affectedCount` at all.

- [x] **The shared thing is the failure record, and `BrowserBulkActionFailure` is it.** `message` is required because all four construct it with a fallback; `status` is optional because three set it and the catalog producer does not; the four identity keys are optional **across** producers rather than within one, because `notes.js` already flattens two producers' failures into one list and reads `error.note_id || error.target_id`.
- [x] **`readBulkFailures` lives on `LongtailForge.errors`, which needed no new declaration and no new delivery dependency.** That surface is already declared, already carries `caughtMessage` and `caughtStatus` from `0.33.33.38.4.1`, and `framework.http-error-contract` already proves it is installed before every page caller.
- [x] **The two single-producer reads stayed local.** `affectedCount` is only the catalog producer's and `bulkChangedIds` only the note/tag pair's, so neither was pushed onto a shared surface to look symmetrical.
- [ ] **Two diagnostics carried to `0.33.33.38.4.3`.** `tasks.js:2482` and `:2484` read `result.tasks` and `result.recurrenceContinuities` - task records and recurrence continuations, both that child's producers. Narrowing the failure list beside them left those two exactly where they were.

#### 0.33.33.38.4.11.1 - The tag bulk-assignment counts

**Complete: 2 diagnostics, one contract, and the success half of a producer whose failure half was already published.** See the archive entry. `0.33.33.38.4.11` traced this route among four, named `BrowserBulkActionFailure` for what they share, and deliberately left each producer's own success payload to its owner. This is the tag producer's: one exact six-member literal, an action vocabulary closed by the normaliser that throws otherwise, and two counts the browser had been coercing out of a body it never read.

#### 0.33.33.38.4.12 - The Notes satellite producers

**4 diagnostics across three unrelated producers that share only the `/api/notes` prefix.** The revision history array and the revision restore body, the `{ bodyHtml }` Markdown preview, and the `{ targets }` link-target directory. **Kept out of `0.33.33.38.4.2` because a route prefix is not a producer**: none of the three is shaped by `shapeNoteForBrowser`, and the link-target directory is not even a note.

#### 0.33.33.38.4.3 - The Tasks response family

**Resliced from the live tree: 64 diagnostics, not the 34 this line used to record, and they are seven producers rather than one.** `tasks.js` 38, `task-dialog.js` 14, `workbench.js` 12. The single-task records were the largest coherent group and are closed; the rest are drawn below by producer.

**Numbered rather than lettered, because the ceremony requires it.** A first pass drew these as `.B` through `.G`; `scripts/release/checkpoint-commits.mjs` requires `LTF-Checkpoint` to be a numeric slice **and** to name a declared numbered heading, and a release regression pins that rule. The letters could never have validated, so they are gone: `.B` is `.2` and `.C` through `.G` are `.3` through `.7`, in the order they were drawn.

#### 0.33.33.38.4.3.1 - The base and detailed single-task records

**Complete: 24 diagnostics, seven contracts, one shared surface, zero fallout.** See the archive entry.

#### 0.33.33.38.4.3.2 - The task collection and list envelope

**Complete: 17 diagnostics, five contracts, three direct handoffs.** See the archive entry. **The reuse this line predicted did not hold**: the list projection is not the detail shaper, and checking that was the first thing the child did.

#### 0.33.33.38.4.3.3 - The task timer records

**Complete: 7 diagnostics, four contracts, one direct state handoff.** See the archive entry. `taskTimerFromUnified` is the shaper for the *mutation* routes only, and it **spreads** rather than reconstructing - so the browser contract is a guaranteed minimum, not an exact record.

#### 0.33.33.38.4.3.4 - Recurrence continuity

**Complete: 7 diagnostics, four contracts, and the last opaque member of the Task detail record.** See the archive entry. The plural was **not** an array of the singular record - `bulkUpdate` pushes `{ task_id, ...continuity }` - and the line's own count of five was two short.

#### 0.33.33.38.4.3.5 - The task count envelopes

**2 diagnostics.** `result.counts` and `result.count` from the attachment and note count routes - two envelopes over two other modules' counters.

#### 0.33.33.38.4.3.6 - The task relationship list

**1 diagnostic.** `result.relationships` from `GET /api/tasks/:taskId/relationships`. Its `relationshipSummary` sibling is a *different* producer that `BrowserTaskDetail` already carries as `unknown`.

#### 0.33.33.38.4.3.8 - The Task option-catalog element contracts

**Complete: 14 diagnostics, four element contracts, zero new debt.** See the archive entry. `0.33.33.38.4.3.2` typed the list envelope and left the catalog's four collections as `unknown[]`; **that made the element-level debt visible in the consumers rather than creating it**, and this child traced the four producers and closed it.

#### 0.33.33.38.4.3.7 - The Workbench bootstrap

**Complete: 6 diagnostics, four contracts, two direct handoffs.** See the archive entry. **Three of the envelope's seven members are constants the producer writes literally** - `taskOptions` is `null`, `timers` and `workCandidates` are `[]` - so no Task option contract was reusable here and there was no candidate record to derive. `bootstrap.registry`, `modules`, `taskOptions`, `workCandidates` and `currentUserId` - the Workbench module registry rather than a task producer, which is why it is drawn apart from everything above.

#### 0.33.33.38.4.3.9 - Stabilize the Task Focus exit-capture synchronization proof

**Complete: a verification correction, zero diagnostics, none claimed.** See the archive entry. `tests/e2e/task-focus-exit-capture.spec.mjs` asserted `writes.at(-1)` the moment the focus heading was visible on the third focus entry - but `activateTaskFocus` renders the candidate's title **before** `refreshActiveTaskFocus` reads the task back and consumes its note, so the heading is not a barrier for the consume PUT. Browser smoke on PR #464 twice saw the previous capture where the consume was expected; the first entry's wait was already causal, and this one now is too. Fix the wait, not the expectation: the corrected proof still requires the exact consume, capture, consume sequence, the status, the app-shell prompt and the final write count.

#### 0.33.33.38.4.4 - The workspace-user, role and assignment responses

**Resliced from the live tree, because two of its planning claims were wrong.** The family holds **34** diagnostics, not 29 - `user-admin.js` 27 and `role-assignments.js` 7 - and **`lists.js` is not one of its consumers at all**: its eleven unknowns are `/api/lists` reads belonging to `0.33.33.38.4.7`. The cross-page reuse this child was ranked on does not exist, and the ranking survived anyway because the producer evidence did.

**It is not one envelope.** The 34 span the user record, two different lookup routes, roles, assignments, sessions, and a six-body bootstrap `Promise.all`. Its children are drawn by producer:

#### 0.33.33.38.4.4.1 - The user record

**Complete: 7 diagnostics, one shaper, zero fallout.** See the archive entry.

#### 0.33.33.38.4.4.2 - The two lookup responses

**Complete: 9 diagnostics, four contracts, zero fallout.** See the archive entry. The two routes were traced apart and they do **not** share a record - the account lookup searches every account in the installation and discloses three members, the assignment lookup can only identify an active member of the caller's own workspace and discloses six.

#### 0.33.33.38.4.4.3 - Roles, assignments and sessions

**Resliced: the cluster is four routes, and its assignment half is two different records.** Ten diagnostics, and the trace found `GET /api/roles`, `GET /users/:id/role-assignments`, `PUT /users/:id/role-assignments`, and two session routes. **`decorateAssignment` builds seven members for the administrator view and `decorateDelegatedAssignment` builds three for the delegated paths** - no assignment identity and no permission overrides - so one assignment contract would have claimed four members the server withholds on purpose.

#### 0.33.33.38.4.4.3.1 - Roles and role-assignment responses

**Complete: 7 diagnostics, four contracts, zero fallout.** See the archive entry.

#### 0.33.33.38.4.4.3.2 - Managed sessions and revocation

**Complete: 3 diagnostics, four contracts, zero fallout.** See the archive entry. The instruction this line gave was followed and it found the opposite of a leak: the `sessions` table has **no token, hash or secret column at all**, because `session_id` *is* the bearer credential the session cookie carries - so the control is not redaction but that `toManagedSession` never passes the identifier through, substituting an HMAC-derived reference the server resolves on the way back.

**3 diagnostics left deliberately.** `user-admin.js:682` reads `body.sessions` from `GET /api/users/:id/sessions` and `:769` reads `body.revokedCount` twice from the two `DELETE` routes. **They are two envelopes, not one**: a session list and a revocation acknowledgement, and a list response with an optional count would be the false symmetry this rollup keeps refusing. **Trace the session record for authentication material before naming it** - a token or hash reaching the browser would be a defect to report, not a member to declare.

#### 0.33.33.38.4.4.4 - The user-admin bootstrap

The six-body `Promise.all` at `user-admin.js:220-229` - clients, workspaces, permission resources, workspace settings and the current user id. **Five producers behind one destructure**, which is why it is drawn apart from everything above.

#### 0.33.33.38.4.4.5 - The create-user mutation response

**Complete: 3 diagnostics, one contract, two halves reused, zero fallout.** See the archive entry. The security trace this line recorded held on every point, so the child typed the response rather than changing it, and `initialPassword` stayed a **required** member whose `""` means absent.

**3 diagnostics that had no owner until `0.33.33.38.4.4.2` went looking.** `user-admin.js` reads `body.accountCreated` twice and `body.initialPassword` once from `POST /api/users`. **This is a mutation envelope and not the user record**: `usersService.create` answers `{ accountCreated, user, users, initialPassword }`, and `0.33.33.38.4.4.1` already narrowed the `user` and `users` halves of it - the three flag-and-password reads are what remain.

**The security trace is done and the current behaviour is sound, so this child types it rather than changing it.** `initialPassword` is generated only in the branch that creates a new account, stays `""` when an existing account is merely attached to the workspace, and the route runs `assertPublicDemoCapabilityAllowed`, `resolveAddUserWorkspace` and `assertWorkspaceCanAddUser` first. `usersRepository.create` returns a constructed record with no password or hash in it, so the `user_created` audit entry stores none. The browser writes the value to a one-time panel that is hidden whenever the value is empty. **A child that narrows this must keep `initialPassword` a required member with an empty-string absent case rather than making it optional**, because the emptiness is what the consumer's `body.accountCreated` guard already reads.

#### 0.33.33.38.4.5 - The settings catalog and user-settings bodies

**18 diagnostics** across `workspace-settings.js`, `module-settings.js`, `notes-settings.js` and `user-settings.js`. **This child inherits `0.33.33.38.2.2.2`'s carry-forward**: `attachmentSections` is part of `GET /api/settings/catalog`, and its consumer already narrows with a predicate before sorting.

**Resliced by producer, because four settings pages are four estates.** They share a menu, not a response: `user-settings.js` reads three of its own routes, `workspace-settings.js` reads six, `notes-settings.js` four, and `module-settings.js` one. They are drawn as numeric children below as each is traced, and none may be typed as one settings envelope. **The catalogue is a fifth producer**, and the first child measured that it contributes no genuine unknown of its own - so it stays untyped until a child actually needs it.

#### 0.33.33.38.4.5.1 - The User Settings response boundary

**Complete: 6 diagnostics, twelve contracts, zero fallout - and three producers rather than the two this family expected.** See the archive entry. The trace found `DELETE /api/user/workspaces/:workspaceId` beside the load and the save. **`GET` and `PUT /api/user/settings` do not share a shape**: the save answers ten members, the read answers those ten plus four, so the read contract **extends** the save contract rather than making four members optional. The removal genuinely returns **two** shapes, and they are a union rather than one record with optional members.

#### 0.33.33.38.4.5.2 - The Workspace Deletion response boundary

**Complete: 2 diagnostics, six contracts, zero fallout - and a malformed-data correction that matters more than the count.** See the archive entry. Three routes converge on one `toBrowserState`, so there is one contract rather than three with identical members. **The raw read rendered an unvouchable body as "this workspace is not pending deletion"** - a safety claim the data never made - and it now refuses instead. Two reductions carry the security argument: the lifecycle summary drops the **purge token**, the backup id, the requester id and the purge job's state; the backup summary drops the archive filename and its digest.

#### 0.33.33.38.4.5.3 - The Notes catalog settings response

**Complete: 3 diagnostics, one producer, and the largest of the four this page actually receives.** See the archive entry. Notes Settings' six survivors are **not one family** - they are `listCatalogSettings` with three, the shared `/api/settings` body with one, and the catalog-security preflight and transition with one each. This child closes the largest, whose row shaper reconstructs twenty members and withholds the transition actor and the ancestor that imposes inherited security. **The page had been borrowing the server's own row type for browser state without validating anything**, and that type over-claims the Library bucket as non-nullable where the column permits null.

#### 0.33.33.38.4.5.4 - The catalog security preflight and transition responses

**Complete: 2 diagnostics, one service, and two contracts that were right to keep apart.** See the archive entry. `publicPreflight` reconstructs fourteen members, so the preview is exact; the transition **spreads its own process result**, so it earns only a structural minimum naming the one member the route itself branches on. Defaulting an unreadable preview to an empty object had been rendering the **enable** dialog for a **remove** request, dropping both downgrade prerequisites from the screen.

#### 0.33.33.38.4.5.5 - The shared workspace settings response

**Complete: 3 diagnostics across three pages, one producer, one reader, and no new namespace debt.** See the archive entry. `save` ends in `return { data: await readInternal(session) }`, so the PUT's `data` **is** the GET body and there is one settings contract rather than two free to drift. The child's real decision is the module record: the producer reconstructs a twenty-plus-member registry manifest, and the browser deliberately publishes only the stable framework-owned pair - **identity and state** - so registry expansion is not a browser contract change. Proved in both directions: a benign new contribution member is accepted, a missing promised member is refused.

#### 0.33.33.38.4.5.6 - The workspace backup receipt

**Complete: 2 diagnostics, one shaper, two routes, and two members that are constants rather than data.** See the archive entry. `readLatest` and `create` both end in `toBrowserReceipt`, so there is one receipt; `secureNotesKeyIncluded` and `status` are written literally by the shaper and are therefore declared and **checked** as the literals they are. The readout had been turning an unreadable body into **"no backup has been taken"** - the most misleading thing a backup summary can say - and the create path had been able to say it beside a package it had just built.

#### 0.33.33.38.4.6 - The client, project and calendar-subscription bodies

**Resliced: 22 live diagnostics and three producer families, not one.** The reuse trace this line called for was run and it answered *no*: `clientProjectOptions` normalises into a **different vocabulary** - camelCase billing members and a two-word status - so it describes what the browser builds, never what the wire sends.

#### 0.33.33.38.4.6.1 - The client and project create records

**Complete: 13 diagnostics, five contracts, zero fallout.** See the archive entry.

#### 0.33.33.38.4.6.2 - The calendar subscriptions and their options body

**Complete: 9 diagnostics, seven contracts, zero fallout.** See the archive entry. **One correction to this line's reuse claim**: the two option reads feed the calendar page's *own* `normalizeClients`/`normalizeProjects`, not the shared surface - they are total all the same, so the options body was narrowed to its exact envelope and its elements were left as `unknown[]`, recorded as later-owner debt for whoever owns the cross-page option vocabulary.

- [x] **The secret kept its own contract.** The feed URL is the raw token the server hashes and never stores in the clear, answered once by create and rotate and never by the list or the revoke; it is intentionally browser-visible and documented as such, so it was named on `BrowserCalendarSubscriptionSecret` and forbidden, by proof, from ever appearing on the descriptor.

#### 0.33.33.38.4.7 - The Lists response family

**Resliced: eleven diagnostics across six routes, and `normalizeListRecord` is not the total normaliser it looked like.** It answers `{ ...list, ... }` and maps each item and link to `{ ...item, id }`, so it reconstructs nine members of the list and one of each element and **inherits everything else from whatever it is handed**. It is a trust boundary for what it rebuilds and nothing more, which is why the checking now happens before it.

#### 0.33.33.38.4.7.1 - The list detail envelope

**Complete: 7 diagnostics, five contracts, zero fallout.** See the archive entry.

#### 0.33.33.38.4.7.2 - The list summary, suggestion, provider and target reads

**4 diagnostics, and the summary read is deferred for a measured reason rather than a tidy one.** Narrowing `result.lists` types `state.lists`, whose elements are the *normaliser's* output - a shape `0.33.33.38.4.7.1` deliberately declined to name, because naming it would have claimed the spread's contribution. Typing the slot anyway pushed four new diagnostics into `openListDialog` and the list editor, which are `0.33.33.43`'s. **The measured chain is: summary read to `state.lists` to the dialog**, and this child should either take that dialog debt deliberately or wait for `0.33.33.43` to type the editor.

- [ ] `result.suggestions`, `result.providers` and `result.targets` are three more producers, each needing its own trace. **A provider descriptor is not a link target**, and `state.linkTargets` is a direct handoff to check before it is adopted.

#### 0.33.33.38.4.8 - The operator-surface bodies

**13 diagnostics** across Support View targets and audit, `/api/security-events`, `/api/runtime-diagnostics` and `/api/jobs`. Grouped because they share an operator audience and a read-only shape, not because they share a route prefix.

**Resliced by producer, because an operator audience is not a producer.** Five services answer these thirteen, and each is its own security boundary; they are drawn as numeric children below as each is traced, and none of them may be typed as one operator envelope.

#### 0.33.33.38.4.8.1 - The Support View audit envelope

**Complete: 6 diagnostics, eight contracts, zero fallout, and one reusable pagination envelope.** See the archive entry. `listAudit` answers exactly five members behind the operator gate; `toAuditEvent` discloses eleven label-only members and no identifier, request id or metadata; the event vocabulary is closed three ways - column `CHECK`, server union, literal writers - and the browser is pinned to all three. **An audit list with one element the browser cannot vouch for is refused whole**, because a silently shorter audit list is the one thing that page must never render.

#### 0.33.33.38.4.8.2 - The Support View target response

**Complete: 5 diagnostics eliminated and 4 more cleared beside them, four contracts, zero fallout.** See the archive entry. `listTargets` answers three members behind the same operator gate as the audit: the viewing administrator, the deployment's configured lifetime, and the eligible targets. **The target is a security-filtered summary of five selected columns, not a user record** - reusing `BrowserUserRecord` would have promised a status, role, timestamps and preferences this route deliberately never sends. **A record the browser cannot vouch for is dropped rather than offered**, which is the fail-closed direction for a picker and the opposite of the audit list's.

#### 0.33.33.38.4.8.3 - The audit log envelope

**Complete: 5 diagnostics, five contracts, and the first reuse of the shared pagination envelope.** See the archive entry. One service answers both `/api/audit-logs` and `/api/security-events`, so there is **one envelope rather than two named after two routes**. The entries have no shaper at all - they are the fifteen columns of `audit_logs` - so the contract follows the schema column for column, and the three snapshot members are typed as the **JSON strings they are**, not as records no producer agrees on. **An audit page must not present partial history**, so an entry the browser cannot vouch for makes the response unreadable rather than shorter.

#### 0.33.33.38.4.9 - Attribute and close the remaining producers

**52 diagnostics whose producer this reslice did not resolve, plus whatever the file, key and timer bodies leave over.** **Attribution is the work and it comes first**: follow each read back through its local helper to a route, then fold it into whichever sibling child owns that family - or draw a new child if the trace finds a family nobody listed. **Do not begin by typing them.**

#### 0.33.33.38.4.9.1 - The API key bodies

**Complete: 6 diagnostics, seven contracts, zero fallout - the family the trace found that nobody had listed.** See the archive entry. The `/api/api-keys` row sat in the planning table with no owner, and `0.33.33.38.4.9`'s own rule is to draw a child when a trace finds such a family. One service answers three routes with **two record vocabularies and one secret**: the list entry is the nine columns `readAll` selects plus scopes, the public record is `toPublicApiKey`'s nine without the creator, and the raw key is minted, SHA-256 hashed and handed over once on create. It lives on `BrowserApiKeySecret` and is forbidden, by proof, from every record and from the revoke.

#### 0.33.33.38.4.9.2 - The file attachment list

**Complete: 2 diagnostics, five contracts, and the second reuse of the shared pagination envelope.** See the archive entry. The `/api/files/attachments` body had no owner, and `0.33.33.38.4.9`'s own rule is to draw a child when a trace finds such a family. **The element is exact although the shaper spreads**, because what it spreads is its own reconstruction - the total-reconstruction case rather than the untrusted-body one. `shared/file-attachments.js` reads the same producer and is **deliberately left**: narrowing it needs either duplicated guards or a new published surface, and neither is this child's to create.

#### 0.33.33.38.4.9.3 - The Files settings and storage accounting response

**Complete: 2 diagnostics, three contracts, and one contract covering two routes because the save *is* the read.** See the archive entry. `saveWorkspaceFileSettings` ends in `return readWorkspaceFileSettings(session)`, so the two bodies cannot diverge - producer identity proved by a call, not by matching members. The `/api/files*` row sat in the planning table with no owner, and `0.33.33.38.4.9`'s own rule is to draw a child when a trace finds such a family. **The page had been turning an unreadable response into a confident "0 internal files, 0 B internal storage"**; it now says storage usage is unavailable, while a genuine all-zero record still renders its zeros.

#### 0.33.33.38.4.10 - Notification response bodies

**Complete. The child that was worth doing for what it could not be measured by.** Its visible cost was three diagnostics; what it actually did was make two blocked namespace surfaces declarable without either of them inheriting a wire-boundary bill. See the archive entry.

**The boundary was found by declaring the surfaces temporarily and measuring, because it was invisible otherwise.** With both draft declarations applied against the tree `0.33.33.38.4.2` left, the estate fell 8,607 to 8,598 - namespace **-10**, but genuine `unknown` **+7**. Those seven were the boundary: six `result.isFollowing` reads across `notes.js` and `task-dialog.js`, and one `events` handoff in `notifications.js`. **A number that is not there yet is still a number**, and the probe is how this checkpoint stopped guessing at it.

- [x] **`readStatus`, `follow` and `unfollow` share one envelope because the producer builds one.** `subscriptionStatus`, `followTarget` and `unfollowTarget` each answer `{ isFollowing, subscription, target }`; the operation differs and the record does not, so there is one `BrowserNotificationSubscriptionResult` rather than three interfaces named after three routes.
- [x] **`saveUserPreferences` and `saveWorkspaceDefaults` keep returning `Promise<unknown>`, and that is the finding rather than an omission.** `0.33.33.38.2.2.6.6.2` set the test: if callers read fields the body is this checkpoint's, and if they ignore the result the opacity is the contract. **Both results are awaited and discarded** - `user-settings.js:321` and `notifications.js:441` - so `.6.6.2` never needed this child for them.
- [x] **The narrowing lives in the two writers, not in five consumers.** Each surface publishes members that already constructed part of their answer, so the wire is crossed once at the surface that owns it and every consumer keeps the code it had.

#### 0.33.33.38.4.13 - The remaining notification bodies

**Not drawn from a count, drawn from what `0.33.33.38.4.10` deliberately left.** `/api/notifications` itself, the read/dismiss mutations, and the display-preference routes are separate producers that no declared surface currently exposes; `notifications.js` reads them directly. **Size this the way `.4.10` was sized** - by declaring nothing and probing, because these bodies are invisible to the classifier for the same reason those were.

#### 0.33.33.38.5 - Narrow the server task lifecycle status vocabulary

**Model: Medium Effort - 16 measured sites in one module, and a proven runtime guarantee.** Inherited from `0.33.33.37`.

**The openness is accidental, and the evidence is threefold.** `TaskLifecycleStatus` in `src/types/task-block-recovery-contracts.d.ts` reads `"open" | "in_progress" | "blocked" | "complete" | "archived" | string`, and the trailing member collapses the union to `string`, so the five literals are documentation rather than type. Against that:

- **Every sibling type in the same file is closed.** `TaskBlockRecoveryPatch.status` is `"blocked" | "open"`, and `kind`, `reason`, `searchReason`, and `ChildStatusRollupEffect` are all closed unions. The author writes closed unions where they are meant.
- **The runtime is closed and validated.** `normalizeStatus` at `tasks.service.js:3066` is `STATUSES.has(status) ? status : "open"` - an unrecognised status is coerced, not stored - and `STATUSES` at `:85` is the same five values.
- **The engine is tolerant of anything but treats nothing extra as valid.** `normalizedStatus` is `String(value ?? "")` and every question it answers is set membership, so an unknown status is simply not terminal and not blocked. That is a safe default, not a supported vocabulary member. A deliberately open contract would have been written to keep its literals - this one does not.

**The cost is measured, not estimated.** The server-tests program is at zero errors. Narrowing the type produces exactly **16**: `task-block-recovery-engine.js` 1, `tasks.service.js` 11, `tests/unit/task-block-recovery-engine.test.mjs` 4. Every one is `TaskRecord.status: string` or a plain `string` reaching a parameter that now wants the union.

- [ ] Narrow the union and satisfy all 16 sites by **making the existing runtime validation visible to TypeScript** - a predicate at the boundary where a persisted row becomes a lifecycle status. `0.33.33.36`'s standard applies exactly: the runtime value is valid, and TypeScript can see why. **No cast, no assertion, no suppression.**
- [ ] Do not narrow `TaskRecord.status` itself as a shortcut; that reaches far past this checkpoint. If the predicate cannot be placed without doing so, stop and report rather than widening the scope.
- [ ] Retarget nothing in the four test sites that is behavioural. They construct records with `status: "..."` literals; if a behavioural assertion has to change, the change is wrong.
- [ ] **Do not merge the server vocabulary with the browser one.** `BrowserTaskLifecycleLegality`'s closed browser vocabulary and this server type describe different layers, and `0.33.33.37` published them separately on purpose. Narrowing this one does not make them the same contract.

**Withdrawn: the previous `0.33.33.38.3` page-state child.** Its 4,374-diagnostic family was 1,561 unannotated parameters, which belong to `.39`-`.44`, plus 2,038 of page-local state that the rollup already forbids `.38` from inventing shapes for, plus 775 double-counted with the DOM and nullability cohorts. There is no shared contract left underneath it. The one genuinely shared thing that classification was reaching for is the namespace declaration, which `.38.1` and `.38.2` now own with measurement behind it.

**Excluded, and deliberately not absorbed.** The cold app-shell bootstrap unavailable-host path stays a framework-level deferred concern; it is not solved by weakening a descriptor or recreating a client fallback. The footer duplicate loader stays a separate measured concern; shared-script vocabulary being reviewed here is not a reason to pull in delivery architecture.

**Implementation order.** `.38.1` and `.38.2.1` are landed. **`.38.2.7` corrects the publication inventory and must precede `.38.2.2`**, which reads that inventory to decide which surfaces exist; `.38.2.6` classifies the six small declared members; `.38.2.2` then follows, carrying the root diagnostics that depend on its declarations; `.38.2.3` and `.38.2.4` run together; `.38.2.5` runs last, because removing the catch-all before the declarations exist would break the estate rather than govern it. `.38.3` and `.38.4` are remeasured against the ledger after `.38.2` archives. `.38.5` touches the server program only and is independent of all of it.

**The finding `.38.1` produced applies to every remaining child of this rollup.** Publication and adoption are separable when a checkpoint adds a *new* surface with *new* consumers, which is why `0.33.33.35.2`, `.35.3`, and `.37` worked that way. **They are not separable when a checkpoint declares an *existing* namespace member**, because that retypes reads which already exist rather than adding any. `.38.2` declares 48 more existing members and must be sliced on that basis; `.38.3` and `.38.4` should be re-examined for the same property before they are drawn.

### 0.33.33.39 - Type shared browser framework code

**Model: High Effort** - Shared browser helpers have broad fan-in and include descriptor, recovery, modal, API, and shell behavior.

Today's measurement: the already-isolated shared cohort is **47 files, 21,550 lines, 4,123 diagnostics**, and included `view-renderer.js` (404) and `view-builder.js` (492). **`0.33.33.35` has since run**: the renderer is **1,698 lines / 326** and the builder **1,911 / 462**, and the cohort gained four extracted siblings - `view-action-security.js`, `view-search-options.js`, `view-data-binding.js`, and `view-modal-stack.js` - **all at zero**. The `0.33.33.38` remeasurement gate re-derives this cohort anyway; these figures replace the pre-`.35` ones so the reslice does not start from a stale count.

- [ ] Close full-strict debt in `public/js/shared/`, app-shell/bootstrap, navigation, dialogs, formatters, records, and view helpers.
- [ ] Use the `0.33.33.38` DOM/response/state contracts and narrow event targets explicitly.
- [ ] Preserve accessibility, focus, recovery, cache-version, CSP, and frozen namespace behavior.
- [ ] **Do not absorb module-specific controller behaviour.** A shared file that turns out to hold module logic is a finding for that module's child, not work for this one.
- [ ] Reduce shared-browser ledger debt to zero.

### 0.33.33.40 - Type the Notes browser controller

**Model: High Effort** - Notes is the largest browser controller and includes secure content, revisions, links, collections, attachments, and Markdown.

Today's measurement: `public/js/notes.js` alone is **4,682 lines with 391 top-level names and 1,306 diagnostics** — the largest single owner in the browser program. **This is already too large for one implementation child** on the evidence of every comparable `0.33.33.32` child, but its internal boundaries are not drawn here because `0.33.33.33.6` rescopes it and `0.33.33.38` changes what its diagnostics are.

**Resliced into implementation children by `0.33.33.40.1`, which typed the page-state store and learned why the rest cannot follow the same shape.** The owner budget is **494** after `0.33.33.38.4.2` closed the six response-handoff state fields: params 377, state 95, assorted 22. It was 528 before that child, and the 34 it lost were eliminated as a prerequisite of the Notes response boundary rather than banked for a later `0.33.33.40` child. `notes.js` carries far more than that - the rest belongs to the DOM and genuine-`unknown` families other checkpoints own - so size this from the classifier, never from the file total.

- [ ] Close full-strict debt in Notes and its browser-owned helpers using named state, response, DOM, and action contracts.
- [ ] Preserve secure/plain note separation, safe Markdown, revision rules, linked context, attachments, and modal focus.
- [ ] Do not redesign the Notes surface or split new classic-script subsystems.
- [ ] Reduce the Notes browser ledger to zero with focused desktop/mobile proof.

#### 0.33.33.40.2 - The Notes wire-boundary state fields

**`0.33.33.40.1` proved this child cannot be drawn as a state child, and that is its most useful result.** Annotating the whole state object with one named `NotesPageState` contract - the shape the reslice expected - closes 47 state diagnostics and **opens 40 genuine `unknown` ones**, because `notes: []`, `collections: []`, `availableTags: []`, `selectedNote: null` and their siblings hold **unvalidated API bodies that `never[]` and `null` were silently permitting reads through**. Reading a property off `never` is legal; reading one off `unknown` is not.

- [ ] **The transfer is real and belongs to `0.33.33.38.4`, not here.** The full-object contract was measured, not guessed: state 1,823 to 1,776, `unknown` 378 to 418, `0.33.33.40` 534 to 490, and the per-file-per-code ledger rejected it on `notes.js` `TS18046` 49 to 89.
- [ ] **`0.33.33.38.4.2` answered half of this and the circular dependency is gone.** A note, a note-list item, pagination and a collection now have named contracts narrowed at runtime, so the fields that store them are typed. **What is still waiting is the rest**: a link target, a tag and the primary-context records have no contract yet, and `tagPicker`/`bulkTagPicker` wait on `LongtailForge.tags` rather than on any response.
- [ ] **So this child waits on the Notes response contracts.** Once a note, a collection, a tag and a link target have named validated shapes, the state fields that hold them can be typed and the whole object can carry one contract. **Do not type them as `unknown` first** - that trades a hidden boundary for a visible one without settling anything.
- [ ] **Six of the sixteen fields left this child at `0.33.33.38.4.2` and must not be counted here again.** `selectedNote`, `editorNote`, `notes` and `collections` are the direct storage handoff for the Notes entity and collection contracts that child published; `notesPagination` and `bulkCollections` store the same two narrowed responses and could not be left behind without re-opening them. **Those six are closed, and their 32 state diagnostics were eliminated there, not here.**
- [ ] The fields still concerned are `availableTags`, `editorContextSummaries`, `editorSelectedTarget`, `editorStagedTargets`, `linkTargets`, `primaryContextClients`, `primaryContextProjects`, `selectedNoteIds`, `tagPicker` and `bulkTagPicker`. **`tagPicker` and `bulkTagPicker` are a different blocker**: their consumers optional-chain into `readTagIds`, so they need `LongtailForge.tags` declared rather than a response contract.

**Later `0.33.33.40.x` children are not drawn yet.** The remaining 378 parameter and 23 assorted diagnostics have not been clustered, and `0.33.33.40.1` deliberately did not touch them. Draw those boundaries from the classifier after `0.33.33.40.2`, not from this section.

### 0.33.33.41 - Type Tasks and Task Dialog browser controllers

**Model: High Effort** - Task lifecycle, recurrence, reminders, checklist, timers, and editor state share one high-risk workflow.

Today's measurement: `tasks.js` is 2,982 lines and 661 diagnostics; `task-dialog.js` is already IIFE-isolated and is not in the `0.33.33.33` estate.

- [ ] Close full-strict debt in Tasks, Task Dialog, and task-owned browser helpers.
- [ ] **Type against the post-`0.33.33.37` shape.** That checkpoint extracts the shared status-and-timer legality core and leaves visibility, disabled-reason messaging, and DOM state local. Do not plan typing work around the pre-`.37` arrangement, and do not re-consolidate what `.37` deliberately left separate.
- [ ] Preserve list authority, canonical editor behavior, recurrence scope, blocking recovery, timer state, checklist saves, and action policy.
- [ ] Keep Task Dialog's shared closure intact except for already-authorized policy extraction.
- [ ] Reduce this browser ledger cohort to zero with rendered lifecycle coverage.

### 0.33.33.42 - Type Workbench and extract Task Focus

**Model: High Effort** - Workbench is a live orchestration surface with dynamic modules, timers, resume state, and recovery behavior.

Today's measurement: `workbench.js` is **4,239 lines with 295 top-level names and 895 diagnostics**, and is touched by three earlier checkpoints — `0.33.33.33.7` scopes it, `0.33.33.34` moves its action-dependency table out, and `0.33.33.37` takes its legality core.

- [ ] **Extraction and typing are provisionally two children, and the post-`0.33.33.38` remeasurement decides.** Task Focus extraction changes what the file contains; typing a surface and then extracting a mode from it would prove the same behaviour twice. The evidence for splitting is the file's size and its three prior dependencies; the evidence against is that the extraction may be small once `.34` and `.37` have taken their pieces. Measure before slicing.
- [ ] Extract the self-contained Task Focus mode behind typed inputs/events while preserving Workbench ownership of the live surface.
- [ ] Close full-strict debt in Workbench, action loading, candidate rendering, timers, and resume/recovery state.
- [ ] Preserve module contribution boundaries, no-raw-ID labels, focus capture, blocking recovery, and fallback navigation.
- [ ] Reduce the Workbench browser ledger to zero.

### 0.33.33.43 - Type Lists, Files, and Clients/Projects browser controllers

**Model: High Effort** - Three large operational surfaces share hierarchy and view helpers but retain distinct workflows.

Today's measurement, taken independently per module rather than as a group: `clients-projects.js` 3,813 lines / 520 diagnostics across two pages; `lists.js` 2,616 / 696; `files.js` 2,051 / 380. **8,480 lines and 1,596 diagnostics between them**, which is larger than the Notes controller this roadmap already calls the largest.

- [ ] **This will almost certainly need at least one child per module family, and the post-`0.33.33.38` remeasurement draws them.** The three are grouped here by ownership, not because one implementation unit is defensible; nothing measured shows they share state or payload meaning.
- [ ] Close full-strict debt in Lists, Files, Clients/Projects, and their settings/helpers after shared extraction lands.
- [ ] Preserve server-side filtering, compact Files listing/modal rules, Lists execution/detail purpose, and hierarchy permissions.
- [ ] Use shared contracts without merging module-owned state or payload meaning.
- [ ] Reduce this browser ledger cohort to zero with focused module and Playwright coverage.

### 0.33.33.44 - Close the browser program at zero

**Model: High Effort** - Planning rollup and final browser-program closeout; its measured children are drawn by the post-`0.33.33.38` remeasurement.

**Two stale statements are corrected here.** First, `tsconfig.public.json` **already** carries `allowJs`, `checkJs`, unqualified `strict`, and `noImplicitAny`, includes `public/js/**/*.js`, and excludes only `node_modules`. The browser program is already all-file full strict, so this checkpoint **proves and closes it; it does not enable it**. Nine browser files still carry a decorative `// @ts-check` pragma, which program-level `checkJs` has made redundant — the same removal `0.33.33.26.2` made for the 205 server/test pragmas.

Second, the previous wording said to "delete the browser ledger section at zero". That contradicts the lifecycle `0.33.33.32` established and would break live governance, which asserts the program list is exactly `["server-tests", "browser", "scripts"]`. **Retire the browser section at zero exactly as `server-tests` and `scripts` are retired**: the section stays, its diagnostics map empties, its error count reaches zero, the full browser estate remains listed and owned, and governance asserts it may never regain debt. **The temporary compiler ledger is deleted as a whole at `0.33.33.48`**, once all three programs are permanently zero and the governance that depends on it has been migrated or retired. Retirement means permanently required to remain at zero; it never means no longer checked.

- [ ] Receive whatever measured children remain after `0.33.33.39` through `.43`, then close with one final permanent-zero proof child.
- [ ] Close full-strict debt in settings, admin, Search, Notifications, Help, calendar, support, recovery, footer/splash, and remaining page controllers.
- [ ] Remove the nine remaining browser `// @ts-check` pragmas; program-level `checkJs` is already authoritative.
- [ ] **Retire the browser ledger section at zero — do not delete it.** Prove the estate is still fully listed and checked after retirement.
- [ ] Confirm all classic pages and the Dashboard bridge retain their existing delivery modes.
- [ ] Prove the three-program `npm run typecheck` is green with zero suppressions, first-party omissions, or unexplained explicit `any`.

### 0.33.33.45 - Extract proven module-development helper defaults

**Model: High Effort** - Shared module defaults and factories affect every first-party module and must satisfy the Two-Module Rule.

**Two of the four proposed extractions are verified against the current tree and two are not.** `createModuleEntry` has **8 first-party consumers** under `src/modules/*/module.js`, comfortably past the Two-Module Rule. The Time Tracking manifest is **587 lines**, still above the 500-line threshold this checkpoint uses. The public API response helpers and the record-indexer control flow were **not located under their roadmap names** in a current search, so their consumer counts are unverified and are hypotheses until the checkpoint measures them.

- [ ] **Measure each proposed extraction against the current tree before extracting it.** Apply the Two-Module Rule with counted consumers, not with the names this roadmap uses. If an extraction has fewer than two real consumers, record that and drop it rather than building the abstraction.
- [ ] Centralize the byte-identical public API response helpers and repeated record-indexer control flow **where at least two existing consumers are counted**.
- [ ] Default proven `createModuleEntry` constants only where all 8 current consumers agree; do not hide meaningful module declarations.
- [ ] Keep route/service behavior explicit and do not create a route DSL, new manifest fields, empty concern files, or plugin hooks.
- [ ] Compose the 587-line Time Tracking manifest only where the current 500-line/75-line thresholds prove cohesive concern owners.

### 0.33.33.46 - Add the strict-clean module scaffold

**Model: High Effort** - The generator defines the default architecture inherited by Support Tickets and future modules.

- [ ] Add `npm run module:create -- <module-id>` for the proven minimal skeleton: module entry/public seam, contracts, repository, service, browser/public API routes, search indexer, view/controller, Help/docs, terminology, permissions/scopes, and regression-area home.
- [ ] **The scaffold inherits whatever `0.33.33.45` actually extracts, not what it proposed.** Build the generator against the measured post-`.45` module shape.
- [ ] Emit no empty-array padding, speculative concern composition, route DSL, framework edits, or Support Tickets feature behavior.
- [ ] **Generated output must enter all three permanent-zero programs clean.** A scaffold that produces a diagnostic in the server, scripts, or browser program is not done, and its browser controller must already be IIFE-isolated to the `0.33.33.33` standard.
- [ ] Generate a throwaway module in a disposable fixture, build the registry/catalog, boot it, prove navigation/permission/search registration and strict-clean output, then remove it.
- [ ] Require untouched scaffold output to pass the normal validation contract without a transpile step.

### 0.33.33.47 - Establish dependency and module-locality ratchets

**Model: High Effort** - New architecture metrics become lasting gates and must distinguish useful signals from count theater.

**No dependency-cycle measurement tool exists in the current tree**, and nothing in `0.33.33.33` adds one, so this checkpoint still owns building it. Every number it proposes is a hypothesis until that tool produces a baseline.

- [ ] Add a maintained dependency-cycle measurement tool and record the honest baseline before enforcing a no-growth ratchet.
- [ ] Record median files touched for module-local changes, cross-module/framework edits for a standard capability, scaffold-to-green time, and ceremony-file count.
- [ ] Target zero framework-file edits for standard module capabilities and strict-clean new module output, but label timing/locality expectations as hypotheses until measured.
- [ ] Do not turn raw file or line counts into quality gates detached from dependency or behavior ownership.

### 0.33.33.48 - Lean Core branch closeout

**Model: High Effort** - Final closure must prove that reduced machinery retains every protected behavior and that no type debt remains hidden.

**`0.33.33.48` is not the first time any program reaches zero.** The server/test program was retired at zero at `0.33.33.26.2`, the scripts program at `0.33.33.32.28.1`, and the browser program is retired at zero by `0.33.33.44`. This checkpoint deletes the temporary three-program ledger **as a whole**, after all three are already permanently zero, and migrates or retires the governance that reads it.

- [ ] **Delete the temporary compiler ledger only after all three programs are already retired at zero**, and migrate or retire every governance assertion that reads it — including the program-list assertion, the per-owner strict-clean pins, the shrink-only mutation proof, and the three retirement assertions themselves.
- [ ] **Prove the three direct programs remain complete after deletion.** Removing the ledger removes the universe check that currently refuses an unowned first-party file; that guarantee must survive in another form or the deletion has weakened the estate.
- [ ] Retire superseded honesty/seam/pragma inventories in the same pass.
- [ ] **Correct the two `docs/module-contract.md` statements `0.33.33.34` made false**, deferred here because the checkpoint gate reserves durable documentation for this closeout. The document still describes `LongtailForge.filesDialog.openFilePreview()` as a live compatibility entry, which `0.33.33.34` deleted when it reduced that namespace to its canonical Files owner; and it still describes the framework action dispatcher without the dependency loading it now owns through `moduleActions.dependenciesFor` and `moduleActions.ensureDependencies`. Both corrections are drafted in the `0.33.33.34` archive entry.
- [ ] Record final before/after measurements and the complete protection-to-owner map, including any numeric target rejected for safety.
- [ ] Record the regression entry-point disposition against the 250-300 review target (347 as of `0.33.33.25.5`, unchanged at `0.33.33.32.28.1`, with the static reduction concentrated in contract-module re-parenting) and the `maximumActiveScripts` ceiling-regeneration ceremony future modules use to add discovered entry points.
- [ ] Run the branch-wide full regression, permission, browser, audit, packaging, dependency, and protected CI gates once against the final tree.
- [ ] Record the scripted multi-site edit discipline in `AGENTS.md` as durable working practice, carrying over the rule and the concrete failures recorded across the `0.33.33.32` children.
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
