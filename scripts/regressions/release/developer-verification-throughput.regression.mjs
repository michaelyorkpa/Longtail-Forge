export const regressionMeta = Object.freeze({
  id: "release.developer-verification-throughput",
  area: "release",
  tier: "release-gate",
  tags: ["ci", "commands", "release", "routing", "timing"],
  description: "Proves ceremony-aware routing, prechecked CI escalation, stage timing, and the generated canonical agent brief.",
  runMode: "static",
});

import assert from "node:assert/strict";
import { escapeRegExp } from "../../test-support/source-scan.mjs";
import { requirePackageManifest, requireScripts } from "../../test-support/package-manifest-assertions.mjs";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { createChangedRegressionPlan } from "../../lib/changed-regression-runner.mjs";
import { isApplicationVersionOnlyChange, suggestRegressionsForPaths } from "../../lib/regression-change-routing.mjs";
import { createSliceVerificationPlan, executeSliceVerificationPlan, formatSliceVerificationSummary } from "../../lib/slice-verification-plan.mjs";
import { enforceZero } from "../../typecheck-governance.mjs";
import {
  CLOSEOUT_CHECKPOINT,
  POST_RELEASE_PATCH_CHECKPOINT,
  RELEASE_PREPARATION_CHECKPOINT,
  TRAILER_NAMES,
  parseCheckpointTrailers,
  resolveCheckpointBaseSha,
  validateCheckpointCommit,
} from "../../release/checkpoint-commits.mjs";

const agentBriefSource = readFileSync("scripts/agent-brief.mjs", "utf8");
assert.match(agentBriefSource, /\^#\{2,4\} Version/, "agent brief should locate umbrella, branch, and numbered child roadmap cursors");

const beforePackage = { name: "longtail-forge", version: "1.0.0", scripts: { check: "old" } };
assert.equal(isApplicationVersionOnlyChange(beforePackage, { ...beforePackage, version: "1.0.1" }, "package.json"), true);
assert.equal(isApplicationVersionOnlyChange(beforePackage, { ...beforePackage, version: "1.0.1", scripts: { check: "new" } }, "package.json"), false);
const beforeLock = { name: "longtail-forge", version: "1.0.0", lockfileVersion: 3, packages: { "": { name: "longtail-forge", version: "1.0.0" } } };
const afterLock = structuredClone(beforeLock);
afterLock.version = "1.0.1";
afterLock.packages[""].version = "1.0.1";
assert.equal(isApplicationVersionOnlyChange(beforeLock, afterLock, "package-lock.json"), true);

for (const path of [
  "src/modules/files/files.routes.js",
  "src/db/schema/current.sql",
  "src/routes/permissions.routes.js",
  ".github/workflows/development-pr.yml",
  "scripts/regression-coverage-manifest.json",
  "unmapped/unknown.bin",
]) {
  assert.equal(suggestRegressionsForPaths([path]).fullCheckRecommended, true, `${path} must retain complete escalation`);
}

const focused = createChangedRegressionPlan(["src/modules/tasks/tasks.service.js"]);
const focusedSlice = createSliceVerificationPlan(focused);
assert.equal(focusedSlice.stages.find(({ id }) => id === "fast-checks").included, false);
assert.equal(focusedSlice.stages.find((item) => item.id === "strict-typecheck").included, true, "focused routing must never skip the strict typecheck gate");
assert.equal(focusedSlice.stages.find((item) => item.id === "strict-typecheck").command, "npm run typecheck");
assert.equal(focusedSlice.stages.find(({ id }) => id === "regressions-1").command, "npm run test:regressions:tasks");
assert.equal(focusedSlice.permissionHarnessIncluded, false);
const fullSlice = createSliceVerificationPlan(createChangedRegressionPlan(["src/db/schema/current.sql"]));
assert.equal(fullSlice.stages.find(({ id }) => id === "fast-checks").included, true);
assert.equal(fullSlice.stages.find((item) => item.id === "strict-typecheck").included, false, "the full typecheck/unit/lint stage already runs the strict typecheck gate once");
assert.equal(fullSlice.stages.find(({ id }) => id === "regressions-1").command, "npm run test:regressions");
assert.equal(fullSlice.permissionHarnessIncluded, true, "the discovered harness should run once inside every full registry");
assert.equal(fullSlice.commands.filter((command) => command === "npm run test:regressions").length, 1);
assert.ok(!fullSlice.commands.includes("npm run test:permissions"), "slice verification must not run the discovered harness a second time");
const permissionSlice = createSliceVerificationPlan(createChangedRegressionPlan(["src/routes/permissions.routes.js"]));
assert.equal(permissionSlice.permissionHarnessIncluded, true);
assert.deepEqual(permissionSlice.commands.filter((command) => /permission/.test(command)), [], "permission routing should reach the harness through the one full registry command");
for (const narrowPaths of [["CHANGELOG.md"], ["src/modules/tasks/tasks.service.js"], ["src/db/schema/current.sql"]]) {
  const routedSlice = createSliceVerificationPlan(createChangedRegressionPlan(narrowPaths));
  const typecheckCommands = routedSlice.commands.filter((command) => command === "npm run typecheck" || command === "npm run check:fast");
  assert.equal(typecheckCommands.length, 1, `every routing outcome must schedule the strict typecheck exactly once (${narrowPaths.join(", ")})`);
}
// `0.33.33.25.11`: an empty selection is refused rather than run, so it schedules nothing - not even
// the strict typecheck - and never reports a pass.
const emptySlice = createSliceVerificationPlan(createChangedRegressionPlan([]));
assert.equal(emptySlice.refused, true, "an empty selection is refused");
assert.deepEqual(emptySlice.commands, [], "and schedules nothing");
// The strict typecheck gate refuses any diagnostic, including one a new file arrives with. These
// drive the gate itself with synthetic states, built as objects and cloned so this owner can
// mutate them member by member without widening anything to `any`.
/** @type {import("../../typecheck-governance.mjs").GovernanceState} */
const syntheticZero = {
  programs: { scripts: { config: "tsconfig.scripts.json", environment: "node", files: ["scripts/synthetic-owner.mjs"], diagnostics: [] } },
  totals: { files: 1, errors: 0, explicitAny: 0 },
  explicitAnyByFile: {},
  expectedErrorDirectives: [],
  declarationProbe: { config: "tsconfig.declarations.json", firstPartyFiles: 0, errors: 0 },
};
const seededIncrease = structuredClone(syntheticZero);
seededIncrease.programs.scripts.diagnostics.push({ filePath: "scripts/synthetic-owner.mjs", code: 7006, line: 1, column: 1, message: "synthetic" });
assert.throws(() => enforceZero(seededIncrease), /scripts\/synthetic-owner\.mjs\(1,1\): TS7006/, "a seeded per-file diagnostic must fail the strict gate");
const seededNewFile = structuredClone(syntheticZero);
seededNewFile.programs.scripts.files.push("scripts/synthetic-new.mjs");
seededNewFile.programs.scripts.diagnostics.push({ filePath: "scripts/synthetic-new.mjs", code: 2322, line: 1, column: 1, message: "synthetic" });
assert.throws(() => enforceZero(seededNewFile), /scripts\/synthetic-new\.mjs\(1,1\): TS2322/, "a seeded new file with diagnostics must fail the strict gate");
const seededTypecheckRun = executeSliceVerificationPlan(focusedSlice, {
  contextSeconds: 0,
  runCommand: (/** @type {string} */ command) => ({ status: command === "npm run typecheck" ? 1 : 0 }),
});
assert.equal(seededTypecheckRun.status, 1, "a failing strict typecheck gate must fail the focused slice run");
const executed = executeSliceVerificationPlan(focusedSlice, { contextSeconds: 0.25, runCommand: () => ({ status: 0 }) });
const summary = formatSliceVerificationSummary(focusedSlice, executed);
for (const label of ["Context/setup", "Closeout gates", "Typecheck/unit/lint", "Strict typecheck", "Regression buckets", "Browser checks", "Packaging"]) {
  assert.match(summary, new RegExp(label.replace("/", "\\/")), `${label} timing/status must stay visible`);
}
assert.match(summary, /\[SKIPPED\]/);
assert.match(summary, /Permission harness discovered through regression buckets: no/);

for (const workflowPath of [
  ".github/workflows/development-pr.yml",
  ".github/workflows/nightly.yml",
  ".github/workflows/promotion.yml",
  ".github/workflows/main-release.yml",
  ".github/workflows/manual-preview.yml",
  ".github/workflows/manual-release.yml",
]) {
  assert.match(readFileSync(workflowPath, "utf8"), /run-timed-stage\.mjs/, `${workflowPath} must emit explicit stage timing`);
}
assert.match(readFileSync(".github/workflows/development-pr.yml", "utf8"), /test:regressions:changed:ci/);

const brief = spawnSync(process.execPath, ["scripts/agent-brief.mjs"], { encoding: "utf8" });
assert.equal(brief.status, 0, brief.stderr);
const activeCursor = readFileSync("ROADMAP.md", "utf8").match(/^Active cursor: `([^`]+)`\./m)?.[1];
assert.ok(activeCursor);
assert.match(brief.stdout, new RegExp(`Agent brief: ${activeCursor.replaceAll(".", "\\.")}`));
assert.match(brief.stdout, /Active roadmap slice and acceptance criteria/);
assert.match(brief.stdout, /Relevant governing decisions/);
assert.match(brief.stdout, /Documentation owners/);
assert.match(brief.stdout, /Likely test commands/);

const roadmapSource = readFileSync("ROADMAP.md", "utf8");
const roadmapArchiveSource = ["0.33.33.1", "0.33.33.2", "0.33.33.3", "0.33.33.6", "0.33.33.12.1"]
  .map((version) => `## Version ${version} - Synthetic completed checkpoint fixture`)
  .join("\n");
const workflowSource = readFileSync(".github/workflows/development-pr.yml", "utf8");
const agentGuide = readFileSync("AGENTS.md", "utf8");
const versioning = readFileSync("docs/versioning.md", "utf8");
const packageSource = requirePackageManifest(JSON.parse(readFileSync("package.json", "utf8")));
const firstCheckpointMessage = checkpointMessage({
  checkpoint: "0.33.33.1",
  docs: "Docs updated: AGENTS.md, docs/versioning.md.",
  summary: "Rebase internal checkpoint ceremony on branch-closeout identity",
});
const firstCheckpoint = validateCheckpointCommit({
  message: firstCheckpointMessage,
  paths: [
    ".github/workflows/development-pr.yml",
    "AGENTS.md",
    "docs/versioning.md",
    "scripts/release/checkpoint-commits.mjs",
    "scripts/regressions/release/developer-verification-throughput.regression.mjs",
  ],
  roadmapArchiveSource,
  roadmapSource,
});
assert.equal(firstCheckpoint.kind, "checkpoint");
assert.deepEqual(firstCheckpoint.errors, []);
assert.deepEqual(firstCheckpoint.ceremonyPaths, ["AGENTS.md", "docs/versioning.md"]);

const nextCheckpoint = validateCheckpointCommit({
  message: checkpointMessage({
    checkpoint: "0.33.33.2",
    docs: "No docs change needed: branch-closeout rollup owns durable prose.",
    summary: "Retire inert historical evidence while retaining live owners",
  }),
  paths: ["scripts/regressions/release/example.regression.mjs", "scripts/regression-coverage-manifest.json"],
  roadmapArchiveSource,
  roadmapSource,
});
assert.equal(nextCheckpoint.kind, "checkpoint");
assert.deepEqual(nextCheckpoint.errors, []);
assert.ok(nextCheckpoint.ceremonyPaths.length <= 2, "the next checkpoint must fit the ceremony ceiling without release identity files");
assert.ok(!nextCheckpoint.paths.some((filePath) => ["package.json", "package-lock.json", "CHANGELOG.md"].includes(filePath)));

const archivedCheckpoint = validateCheckpointCommit({
  message: checkpointMessage({
    checkpoint: "0.33.33.1",
    docs: "No docs change needed: completed checkpoint moved to roadmap archive.",
    summary: "Archive the completed checkpoint after protected merge proof",
  }),
  paths: ["ROADMAP.md", "ROADMAP-ARCHIVE.md"],
  roadmapArchiveSource,
  roadmapSource: roadmapSource.replace(/^### 0\.33\.33\.1[\s\S]*?(?=^### 0\.33\.33\.2)/m, ""),
});
assert.equal(archivedCheckpoint.kind, "checkpoint");
assert.deepEqual(archivedCheckpoint.errors, []);
assert.deepEqual(archivedCheckpoint.ceremonyPaths, ["ROADMAP-ARCHIVE.md", "ROADMAP.md"]);

const nestedArchivedCheckpoint = validateCheckpointCommit({
  message: checkpointMessage({
    checkpoint: "0.33.33.12.1",
    docs: "No docs change needed: completed nested checkpoint moved to roadmap archive.",
    summary: "Archive a declared nested checkpoint without weakening numeric validation",
  }),
  roadmapArchiveSource,
  roadmapSource,
});
assert.equal(nestedArchivedCheckpoint.kind, "checkpoint");
assert.deepEqual(nestedArchivedCheckpoint.errors, []);

for (const invalidCheckpoint of ["0.33.33.0", "0.33.33.12.0", "0.33.33.12.alpha", "0.33.33.12."]) {
  const invalidNestedCheckpoint = validateCheckpointCommit({
    message: checkpointMessage({
      checkpoint: invalidCheckpoint,
      docs: "No docs change needed: synthetic invalid nested checkpoint.",
      summary: "Reject a malformed nested checkpoint identifier",
    }),
    roadmapArchiveSource,
    roadmapSource,
  });
  assert.ok(invalidNestedCheckpoint.errors.includes("LTF-Checkpoint must be a numeric 0.33.33.#[.#...] slice"));
}

// Live checkpoint recognition must accept the heading levels the roadmap
// actually uses. Ordinary implementation checkpoints are `### <id>`, while a
// planning rollup declares its resliced implementation children and any
// corrective child as `#### <id>` beneath its own `###` heading. Before
// 0.33.33.32.2.1 only `###` was recognized, so a valid implementation commit
// for a live `####` child was reported as referring to an undeclared
// checkpoint until its roadmap-to-archive handoff created an archive heading.
const liveHeadingRoadmap = [
  "### 0.33.33.31 - Type database, Files, and jobs regression owners",
  "### 0.33.33.32 - Type product regressions and close the scripts program",
  "#### 0.33.33.32.2 - Type task checklists, relationships, and bulk toolbars",
  "#### 0.33.33.32.3 - Type task recurrence and reminder scheduling",
  "#### 0.33.33.32.2.1 - Correct live resliced-child checkpoint validation",
].join("\n");
for (const liveCheckpoint of ["0.33.33.31", "0.33.33.32", "0.33.33.32.2", "0.33.33.32.3", "0.33.33.32.2.1"]) {
  const liveChild = validateCheckpointCommit({
    message: checkpointMessage({
      checkpoint: liveCheckpoint,
      docs: "No docs change needed: synthetic live checkpoint proof.",
      summary: "Validate a checkpoint that is still live in the roadmap",
    }),
    paths: ["scripts/synthetic-owner.mjs"],
    roadmapArchiveSource: "",
    roadmapSource: liveHeadingRoadmap,
  });
  assert.deepEqual(liveChild.errors, [], `${liveCheckpoint} is declared live and must validate before it is archived`);
  assert.equal(liveChild.kind, "checkpoint");
}

// Identity matching stays exact: a checkpoint absent from both documents
// fails, and a heading that merely shares a numeric prefix never qualifies.
for (const undeclared of ["0.33.33.32.9", "0.33.33.44"]) {
  const missingCheckpoint = validateCheckpointCommit({
    message: checkpointMessage({
      checkpoint: undeclared,
      docs: "No docs change needed: synthetic undeclared checkpoint proof.",
      summary: "Reject a checkpoint that no roadmap document declares",
    }),
    paths: ["scripts/synthetic-owner.mjs"],
    roadmapArchiveSource: "",
    roadmapSource: liveHeadingRoadmap,
  });
  assert.ok(
    missingCheckpoint.errors.includes(`${undeclared} is not a declared numbered checkpoint in ROADMAP.md or ROADMAP-ARCHIVE.md`),
    `${undeclared} must not validate against a roadmap that never declares it`,
  );
}
const prefixOnlyCheckpoint = validateCheckpointCommit({
  message: checkpointMessage({
    checkpoint: "0.33.33.3",
    docs: "No docs change needed: synthetic prefix checkpoint proof.",
    summary: "Reject a checkpoint that only prefixes a declared heading",
  }),
  paths: ["scripts/synthetic-owner.mjs"],
  roadmapArchiveSource: "",
  roadmapSource: "#### 0.33.33.32.3 - Type task recurrence and reminder scheduling",
});
assert.ok(
  prefixOnlyCheckpoint.errors.includes("0.33.33.3 is not a declared numbered checkpoint in ROADMAP.md or ROADMAP-ARCHIVE.md"),
  "a numeric prefix of a declared child must not satisfy checkpoint identity",
);

// A heading level the roadmap does not use for checkpoints must not qualify.
const overDeepHeading = validateCheckpointCommit({
  message: checkpointMessage({
    checkpoint: "0.33.33.32.4",
    docs: "No docs change needed: synthetic heading-level proof.",
    summary: "Reject a checkpoint declared at an unused heading depth",
  }),
  paths: ["scripts/synthetic-owner.mjs"],
  roadmapArchiveSource: "",
  roadmapSource: "###### 0.33.33.32.4 - Type task calendar windows and feed serialization",
});
assert.ok(
  overDeepHeading.errors.includes("0.33.33.32.4 is not a declared numbered checkpoint in ROADMAP.md or ROADMAP-ARCHIVE.md"),
  "only the heading levels the roadmap uses for checkpoints may declare one",
);

// A ROADMAP-only commit with no trailers stays planning, not a checkpoint.
const planningOnlyCommit = validateCheckpointCommit({
  message: "Reslice 0.33.33.32 into twenty-eight children",
  paths: ["ROADMAP.md"],
  roadmapSource: liveHeadingRoadmap,
});
assert.equal(planningOnlyCommit.kind, "planning", "a trailer-free ROADMAP-only commit must stay planning");

const parsedTrailers = parseCheckpointTrailers(firstCheckpointMessage);
assert.equal(parsedTrailers.values.get(TRAILER_NAMES.checkpoint), "0.33.33.1");
assert.equal(parsedTrailers.values.get(TRAILER_NAMES.summary), "Rebase internal checkpoint ceremony on branch-closeout identity");
assert.equal(parsedTrailers.values.get(TRAILER_NAMES.docs), "Docs updated: AGENTS.md, docs/versioning.md.");

const missingTrailers = validateCheckpointCommit({ message: "Implement work without trailers", paths: ["src/core/app.js"], roadmapSource });
assert.match(missingTrailers.errors.join("\n"), /missing required LTF-Checkpoint trailer/);
const separatedTrailers = validateCheckpointCommit({
  message: "Complete work\n\nLTF-Checkpoint: 0.33.33.1\n\nLTF-Summary: Separate trailers incorrectly\n\nLTF-Docs: No docs change needed: synthetic separated trailer proof.",
  paths: ["src/core/app.js"],
  roadmapArchiveSource,
  roadmapSource,
});
assert.match(separatedTrailers.errors.join("\n"), /missing required LTF-Checkpoint trailer/);
assert.match(separatedTrailers.errors.join("\n"), /missing required LTF-Summary trailer/);
const planningCommit = validateCheckpointCommit({ message: "Plan the branch", paths: ["ROADMAP.md"], roadmapSource });
assert.equal(planningCommit.kind, "planning", "a roadmap-only umbrella planning commit may precede checkpoint enforcement");
assert.deepEqual(planningCommit.errors, []);

const deferredIdentity = validateCheckpointCommit({
  message: checkpointMessage({ checkpoint: "0.33.33.2", docs: "No docs change needed: recorded for branch closeout.", summary: "Attempt an early release identity change" }),
  paths: ["package.json", "package-lock.json", "CHANGELOG.md"],
  roadmapSource,
});
for (const filePath of ["package.json", "package-lock.json", "CHANGELOG.md"]) {
  assert.match(deferredIdentity.errors.join("\n"), new RegExp(`${filePath.replace(".", "\\.")} is reserved for`));
}

const packageScriptCheckpoint = validateCheckpointCommit({
  message: checkpointMessage({
    checkpoint: "0.33.33.6",
    docs: "No docs change needed: exact narrow command ownership changed without durable prose.",
    summary: "Make narrow Vitest aliases fail when their owned suites disappear",
  }),
  packageBeforeSource: JSON.stringify({ name: "longtail-forge", scripts: { "test:tasks": "vitest run --passWithNoTests tasks" }, version: "9.8.7.6" }),
  packageAfterSource: JSON.stringify({ name: "longtail-forge", scripts: { "test:tasks": "vitest run tests/contracts/tasks-contracts.test.mjs" }, version: "9.8.7.6" }),
  paths: ["package.json"],
  roadmapArchiveSource,
  roadmapSource,
});
assert.deepEqual(packageScriptCheckpoint.errors, [], "internal checkpoints may change package scripts without changing release identity");

const packageVersionCheckpoint = validateCheckpointCommit({
  message: checkpointMessage({
    checkpoint: "0.33.33.6",
    docs: "No docs change needed: synthetic release-identity rejection.",
    summary: "Attempt an early package version change",
  }),
  packageBeforeSource: JSON.stringify({ name: "longtail-forge", scripts: {}, version: "9.8.7.6" }),
  packageAfterSource: JSON.stringify({ name: "longtail-forge", scripts: {}, version: "9.8.7.7" }),
  paths: ["package.json"],
  roadmapArchiveSource,
  roadmapSource,
});
assert.match(packageVersionCheckpoint.errors.join("\n"), /package\.json is reserved/);

const earlyDurableDocs = validateCheckpointCommit({
  message: checkpointMessage({ checkpoint: "0.33.33.2", docs: "Docs updated: docs/versioning.md.", summary: "Attempt an early durable documentation change" }),
  paths: ["docs/versioning.md"],
  roadmapSource,
});
assert.match(earlyDurableDocs.errors.join("\n"), /durable documentation is reserved/);
const generatedInventoryDocs = validateCheckpointCommit({
  message: checkpointMessage({ checkpoint: "0.33.33.3", docs: "Docs updated: docs/regression-suite.md.", summary: "Refresh the generated regression coverage inventory" }),
  paths: ["docs/regression-suite.md", "scripts/regression-coverage-manifest.json"],
  roadmapArchiveSource,
  roadmapSource,
});
assert.deepEqual(generatedInventoryDocs.errors, [], "generated inventory documentation may move with its internal checkpoint");
const docsMismatch = validateCheckpointCommit({
  message: checkpointMessage({ checkpoint: "0.33.33.1", docs: "Docs updated: docs/versioning.md.", summary: "Declare an incomplete documentation disposition" }),
  paths: ["AGENTS.md", "docs/versioning.md"],
  roadmapSource,
});
assert.match(docsMismatch.errors.join("\n"), /paths must exactly match changed documentation/);
const roadmapDocsMismatch = validateCheckpointCommit({
  message: checkpointMessage({
    checkpoint: "0.33.33.1",
    docs: "Docs updated: ROADMAP-ARCHIVE.md, ROADMAP.md.",
    summary: "Misclassify roadmap bookkeeping as durable documentation",
  }),
  paths: ["ROADMAP.md", "ROADMAP-ARCHIVE.md"],
  roadmapArchiveSource,
  roadmapSource,
});
assert.match(roadmapDocsMismatch.errors.join("\n"), /must use "No docs change needed:/);
const ceremonyOverflow = validateCheckpointCommit({
  message: firstCheckpointMessage,
  paths: ["AGENTS.md", "docs/versioning.md", "ROADMAP.md"],
  roadmapSource,
});
assert.match(ceremonyOverflow.errors.join("\n"), /maximum is 2/);

const closeoutCheckpoint = validateCheckpointCommit({
  message: checkpointMessage({
    checkpoint: CLOSEOUT_CHECKPOINT,
    docs: "Docs updated: AGENTS.md, docs/versioning.md.",
    summary: "Roll up the Lean Core branch release identity and durable evidence",
  }),
  paths: ["AGENTS.md", "CHANGELOG.md", "DECISIONS.md", "ROADMAP-ARCHIVE.md", "ROADMAP.md", "docs/versioning.md", "package-lock.json", "package.json"],
  // `0.33.33.48`: the closeout's own section moves to the archive when it closes the branch, so its
  // declaration comes from a synthetic archive fixture, as the cases above use, rather than from
  // whichever roadmap file happens to hold it today.
  roadmapArchiveSource: `## Version ${CLOSEOUT_CHECKPOINT} - Synthetic branch closeout fixture`,
  roadmapSource,
});
assert.deepEqual(closeoutCheckpoint.errors, [], "branch closeout may own the deferred release and documentation ceremony");

// `0.33.33.49`: the release-preparation addendum after the branch closeout may change what the
// application depends on - dependency declarations, the resolved lockfile, the current changelog
// entry, and owning documentation - but never what it is. Its declaration comes from a synthetic
// archive fixture, like the closeout's, so these cases do not depend on where its section lives.
assert.notEqual(RELEASE_PREPARATION_CHECKPOINT, CLOSEOUT_CHECKPOINT, "the addendum must own its work under its own checkpoint");
const releasePreparationArchive = `${roadmapArchiveSource}\n## Version ${RELEASE_PREPARATION_CHECKPOINT} - Synthetic release preparation fixture`;
const preparationPackageBefore = {
  allowScripts: { "native-addon@1.0.0": true },
  dependencies: { "markdown-it": "^15.0.0" },
  devDependencies: { eslint: "^10.8.1" },
  engines: { node: ">=24.7 <25" },
  name: "longtail-forge",
  scripts: { check: "npm run check:fast" },
  version: "9.8.7.6",
};
const preparationLockBefore = {
  lockfileVersion: 3,
  name: "longtail-forge",
  packages: {
    "": { dependencies: { "markdown-it": "^15.0.0" }, name: "longtail-forge", version: "9.8.7.6" },
    "node_modules/markdown-it": { version: "15.0.0" },
  },
  version: "9.8.7.6",
};
const preparationPackageAfter = { ...preparationPackageBefore, dependencies: { "markdown-it": "^15.0.2" } };
const preparationLockAfter = structuredClone(preparationLockBefore);
preparationLockAfter.packages[""].dependencies["markdown-it"] = "^15.0.2";
preparationLockAfter.packages["node_modules/markdown-it"].version = "15.0.2";

/**
 * @param {{
 *   checkpoint?: string,
 *   docs?: string,
 *   lockAfter?: object,
 *   packageAfter?: object,
 *   paths: string[],
 * }} change
 */
function releasePreparationCommit({
  checkpoint = RELEASE_PREPARATION_CHECKPOINT,
  docs = "No docs change needed: synthetic release-preparation proof.",
  lockAfter = preparationLockAfter,
  packageAfter = preparationPackageAfter,
  paths,
}) {
  return validateCheckpointCommit({
    lockAfterSource: JSON.stringify(lockAfter),
    lockBeforeSource: JSON.stringify(preparationLockBefore),
    message: checkpointMessage({ checkpoint, docs, summary: "Advance a reviewed dependency without changing release identity" }),
    packageAfterSource: JSON.stringify(packageAfter),
    packageBeforeSource: JSON.stringify(preparationPackageBefore),
    paths,
    roadmapArchiveSource: releasePreparationArchive,
    roadmapSource,
  });
}

assert.deepEqual(
  releasePreparationCommit({ paths: ["package-lock.json", "package.json"] }).errors,
  [],
  "the addendum may change dependency declarations and the resolved lockfile with the application version fixed",
);
assert.deepEqual(
  releasePreparationCommit({ paths: [".github/workflows/codeql.yml", "CHANGELOG.md", "scripts/regressions/release/github-release-operations.regression.mjs"] }).errors,
  [],
  "the addendum may change a reviewed workflow, its owning regression, and the current changelog entry",
);
assert.deepEqual(
  releasePreparationCommit({ docs: "Docs updated: docs/versioning.md.", paths: ["docs/versioning.md"] }).errors,
  [],
  "the addendum may update the documentation that owns a changed contract",
);

const preparationVersionErrors = releasePreparationCommit({
  packageAfter: { ...preparationPackageAfter, version: "9.8.7.7" },
  paths: ["package.json"],
}).errors.join("\n");
assert.match(
  preparationVersionErrors,
  new RegExp(`package\\.json under ${escapeRegExp(RELEASE_PREPARATION_CHECKPOINT)} may change only dependency declarations or scripts`),
  "the addendum must refuse an application version change, even beside a dependency change",
);
for (const [field, value] of /** @type {const} */ ([
  ["engines", { node: ">=26" }],
  ["allowScripts", { "native-addon@1.0.0": true, "unreviewed-addon@2.0.0": true }],
  ["name", "renamed-application"],
])) {
  const fieldErrors = releasePreparationCommit({ packageAfter: { ...preparationPackageAfter, [field]: value }, paths: ["package.json"] }).errors;
  assert.ok(
    fieldErrors.some((error) => error.startsWith(`package.json under ${RELEASE_PREPARATION_CHECKPOINT} may change only`)),
    `the addendum must refuse a ${field} change, which is not a dependency declaration`,
  );
}
const preparationLockRootVersion = structuredClone(preparationLockAfter);
preparationLockRootVersion.version = "9.8.7.7";
const preparationLockPackageVersion = structuredClone(preparationLockAfter);
preparationLockPackageVersion.packages[""].version = "9.8.7.7";
for (const [label, lockAfter] of /** @type {const} */ ([
  ["top-level version", preparationLockRootVersion],
  ["root package version", preparationLockPackageVersion],
])) {
  assert.ok(
    releasePreparationCommit({ lockAfter, paths: ["package-lock.json"] }).errors
      .includes(`package-lock.json under ${RELEASE_PREPARATION_CHECKPOINT} must keep its application version fields unchanged`),
    `the addendum must refuse a lockfile ${label} change`,
  );
}

const unrelatedOwnerErrors = releasePreparationCommit({ checkpoint: "0.33.33.2", paths: ["package-lock.json", "package.json"] }).errors.join("\n");
for (const filePath of ["package.json", "package-lock.json"]) {
  assert.match(
    unrelatedOwnerErrors,
    new RegExp(`${escapeRegExp(filePath)} is reserved for ${escapeRegExp(CLOSEOUT_CHECKPOINT)} branch closeout`),
    `an ordinary checkpoint must still be refused ${filePath}; only the addendum owns the dependency change`,
  );
}
assert.match(
  releasePreparationCommit({ checkpoint: "0.33.33.2", docs: "Docs updated: docs/versioning.md.", paths: ["docs/versioning.md"] }).errors.join("\n"),
  /durable documentation is reserved/,
  "an ordinary checkpoint must still be refused durable documentation",
);
assert.match(
  releasePreparationCommit({ paths: ["DECISIONS.md"] }).errors.join("\n"),
  new RegExp(`DECISIONS\\.md is reserved for ${escapeRegExp(CLOSEOUT_CHECKPOINT)} branch closeout`),
  "the addendum must not take over durable decisions",
);
assert.match(
  releasePreparationCommit({ paths: ["CHANGELOG.md", "package-lock.json", "package.json"] }).errors.join("\n"),
  /maximum is 2/,
  "the addendum keeps the two-ceremony-file ceiling",
);

// The post-release patch published after the release may give the application its own
// new identity - the version fields in both package files, set to exactly its checkpoint - plus the
// changelog entry and owning documentation, and nothing else the packages declare.
for (const checkpoint of [CLOSEOUT_CHECKPOINT, RELEASE_PREPARATION_CHECKPOINT]) {
  assert.notEqual(POST_RELEASE_PATCH_CHECKPOINT, checkpoint, "the post-release patch must own its work under its own checkpoint");
}
const postReleasePatchArchive = `${roadmapArchiveSource}\n## Version ${POST_RELEASE_PATCH_CHECKPOINT} - Synthetic post-release patch fixture`;
const patchPackageBefore = { ...preparationPackageBefore, version: "9.8.7" };
const patchPackageAfter = { ...patchPackageBefore, version: POST_RELEASE_PATCH_CHECKPOINT };
const patchLockBefore = structuredClone(preparationLockBefore);
patchLockBefore.version = "9.8.7";
patchLockBefore.packages[""].version = "9.8.7";
const patchLockAfter = structuredClone(patchLockBefore);
patchLockAfter.version = POST_RELEASE_PATCH_CHECKPOINT;
patchLockAfter.packages[""].version = POST_RELEASE_PATCH_CHECKPOINT;

/**
 * @param {{
 *   checkpoint?: string,
 *   docs?: string,
 *   lockAfter?: object,
 *   packageAfter?: object,
 *   paths: string[],
 * }} change
 */
function postReleasePatchCommit({
  checkpoint = POST_RELEASE_PATCH_CHECKPOINT,
  docs = "No docs change needed: synthetic post-release patch proof.",
  lockAfter = patchLockAfter,
  packageAfter = patchPackageAfter,
  paths,
}) {
  return validateCheckpointCommit({
    lockAfterSource: JSON.stringify(lockAfter),
    lockBeforeSource: JSON.stringify(patchLockBefore),
    message: checkpointMessage({ checkpoint, docs, summary: "Give the post-release repair its own release identity" }),
    packageAfterSource: JSON.stringify(packageAfter),
    packageBeforeSource: JSON.stringify(patchPackageBefore),
    paths,
    roadmapArchiveSource: postReleasePatchArchive,
    roadmapSource,
  });
}

assert.deepEqual(
  postReleasePatchCommit({ paths: ["package-lock.json", "package.json"] }).errors,
  [],
  "the post-release patch may move both application version fields to exactly its own identity",
);
assert.deepEqual(
  postReleasePatchCommit({ docs: "Docs updated: docs/preview-deployment.md.", paths: ["CHANGELOG.md", "docs/preview-deployment.md"] }).errors,
  [],
  "the post-release patch may change its changelog entry and the documentation that owns a changed contract",
);
assert.deepEqual(
  postReleasePatchCommit({ paths: ["Dockerfile", "scripts/release/longtail-forge-compose-deploy-host.example"] }).errors,
  [],
  "the post-release patch may change the runtime image and the host helper",
);
for (const [label, packageAfter] of /** @type {const} */ ([
  ["another version", { ...patchPackageAfter, version: `${POST_RELEASE_PATCH_CHECKPOINT}.1` }],
  ["a dependency beside the version", { ...patchPackageAfter, dependencies: { "markdown-it": "^15.0.2" } }],
  ["an engines change beside the version", { ...patchPackageAfter, engines: { node: ">=26" } }],
  ["a lifecycle allowlist change beside the version", { ...patchPackageAfter, allowScripts: { "unreviewed-addon@2.0.0": true } }],
  ["a dependency without the version", { ...patchPackageBefore, dependencies: { "markdown-it": "^15.0.2" } }],
])) {
  assert.ok(
    postReleasePatchCommit({ packageAfter, paths: ["package.json"] }).errors
      .includes(`package.json under ${POST_RELEASE_PATCH_CHECKPOINT} may change only the application version, to exactly ${POST_RELEASE_PATCH_CHECKPOINT}, or scripts`),
    `the post-release patch must refuse ${label}`,
  );
}
const patchLockOtherVersion = structuredClone(patchLockAfter);
patchLockOtherVersion.version = "9.8.8";
patchLockOtherVersion.packages[""].version = "9.8.8";
const patchLockOneField = structuredClone(patchLockAfter);
patchLockOneField.packages[""].version = "9.8.7";
const patchLockGraph = structuredClone(patchLockAfter);
patchLockGraph.packages["node_modules/markdown-it"].version = "15.0.2";
for (const [label, lockAfter] of /** @type {const} */ ([
  ["another version", patchLockOtherVersion],
  ["only one version field", patchLockOneField],
  ["a resolved package beside the version", patchLockGraph],
])) {
  assert.ok(
    postReleasePatchCommit({ lockAfter, paths: ["package-lock.json"] }).errors
      .includes(`package-lock.json under ${POST_RELEASE_PATCH_CHECKPOINT} may change only its application version fields, to exactly ${POST_RELEASE_PATCH_CHECKPOINT}`),
    `the post-release patch must refuse a lockfile with ${label}`,
  );
}
for (const checkpoint of [RELEASE_PREPARATION_CHECKPOINT, "0.33.33.2"]) {
  assert.ok(
    postReleasePatchCommit({ checkpoint, paths: ["package.json"] }).errors.length > 0,
    `${checkpoint} must still be refused the post-release patch's version change`,
  );
}
assert.match(
  postReleasePatchCommit({ checkpoint: "0.33.33.2", docs: "Docs updated: docs/preview-deployment.md.", paths: ["docs/preview-deployment.md"] }).errors.join("\n"),
  /durable documentation is reserved/,
  "an ordinary checkpoint must still be refused durable documentation",
);
assert.match(
  postReleasePatchCommit({ paths: ["DECISIONS.md"] }).errors.join("\n"),
  new RegExp(`DECISIONS\\.md is reserved for ${escapeRegExp(CLOSEOUT_CHECKPOINT)} branch closeout`),
  "the post-release patch must not take over durable decisions",
);
assert.match(
  postReleasePatchCommit({ paths: ["CHANGELOG.md", "package-lock.json", "package.json"] }).errors.join("\n"),
  /maximum is 2/,
  "the post-release patch keeps the two-ceremony-file ceiling",
);

assert.match(workflowSource, /LTF_CHECKPOINT_BASE_SHA: \$\{\{ github\.event\.pull_request\.base\.sha \}\}/);
assert.match(workflowSource, /node scripts\/release\/checkpoint-commits\.mjs/);
assert.match(agentGuide, /LTF-Checkpoint: <slice-id>/);
assert.match(agentGuide, /LTF-Summary: <single-line outcome>/);
assert.match(agentGuide, /LTF-Docs: <documentation disposition>/);
assert.match(agentGuide, /final bookkeeping commit in the same protected pull request/);
assert.match(agentGuide, /ceremony\/bookkeeping paths, not documentation paths/);
assert.match(agentGuide, /npm run checkpoint:validate/);
assert.match(versioning, /Version-wide Internal Checkpoints/);
assert.match(versioning, /final bookkeeping commit in the same protected pull request/);
assert.match(versioning, /becomes authoritative only when that pull request merges/);
assert.match(versioning, /npm run checkpoint:validate/);
assert.match(versioning, /release-preparation addendum declared after the branch closeout/, "the versioning contract should document the addendum's narrow ownership");
assert.match(versioning, /refuses any change to the application version in either package file/, "the versioning contract should record that the addendum never changes release identity");
assert.match(versioning, /post-release patch declared after a release is published/, "the versioning contract should document the post-release patch's narrow ownership");
assert.match(versioning, /application version fields in both package files to exactly its own checkpoint identity/, "the versioning contract should record the post-release patch's only package change");
assert.equal(requireScripts(packageSource)["checkpoint:validate"], "node scripts/release/checkpoint-commits.mjs --base-ref origin/nightly");

const syntheticBaseSha = "a".repeat(40);
assert.equal(resolveCheckpointBaseSha({ environment: { LTF_CHECKPOINT_BASE_SHA: syntheticBaseSha } }), syntheticBaseSha);
let mergeBaseArgs;
assert.equal(resolveCheckpointBaseSha({
  args: ["--base-ref", "origin/nightly"],
  cwd: "synthetic-cwd",
  runGitCommand: (args, cwd) => {
    mergeBaseArgs = { args, cwd };
    return `${syntheticBaseSha}\n`;
  },
}), syntheticBaseSha);
assert.deepEqual(mergeBaseArgs, { args: ["merge-base", "origin/nightly", "HEAD"], cwd: "synthetic-cwd" });
assert.throws(() => resolveCheckpointBaseSha({ args: ["--unknown"] }), /Usage: node scripts\/release\/checkpoint-commits\.mjs/);

console.log("Developer verification throughput regression passed.");

/** @param {{ checkpoint: string, docs: string, summary: string }} trailerValues */
function checkpointMessage({ checkpoint, docs, summary }) {
  return `Complete ${checkpoint}\n\n${TRAILER_NAMES.checkpoint}: ${checkpoint}\n${TRAILER_NAMES.summary}: ${summary}\n${TRAILER_NAMES.docs}: ${docs}`;
}
