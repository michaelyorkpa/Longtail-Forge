export const regressionMeta = Object.freeze({
  id: "release.developer-verification-throughput",
  area: "release",
  tier: "release-gate",
  tags: ["ci", "commands", "release", "routing", "timing"],
  description: "Proves ceremony-aware routing, prechecked CI escalation, stage timing, and the generated canonical agent brief.",
  runMode: "static",
});

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { createChangedRegressionPlan } from "../../lib/changed-regression-runner.mjs";
import { isApplicationVersionOnlyChange, suggestRegressionsForPaths } from "../../lib/regression-change-routing.mjs";
import { createSliceVerificationPlan, executeSliceVerificationPlan, formatSliceVerificationSummary } from "../../lib/slice-verification-plan.mjs";
import { validateShrinkOnly } from "../../typecheck-governance.mjs";
import {
  CLOSEOUT_CHECKPOINT,
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
const afterLock = JSON.parse(JSON.stringify(beforeLock));
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
assert.equal(focusedSlice.stages.find((item) => item.id === "strict-ledger").included, true, "focused routing must never skip the strict-ledger typecheck gate");
assert.equal(focusedSlice.stages.find((item) => item.id === "strict-ledger").command, "npm run typecheck");
assert.equal(focusedSlice.stages.find(({ id }) => id === "regressions-1").command, "npm run test:regressions:tasks");
assert.equal(focusedSlice.permissionHarnessIncluded, false);
const fullSlice = createSliceVerificationPlan(createChangedRegressionPlan(["src/db/schema/current.sql"]));
assert.equal(fullSlice.stages.find(({ id }) => id === "fast-checks").included, true);
assert.equal(fullSlice.stages.find((item) => item.id === "strict-ledger").included, false, "the full typecheck/unit/lint stage already runs the ledger gate once");
assert.equal(fullSlice.stages.find(({ id }) => id === "regressions-1").command, "npm run test:regressions");
assert.equal(fullSlice.permissionHarnessIncluded, true, "the discovered harness should run once inside every full registry");
assert.equal(fullSlice.commands.filter((command) => command === "npm run test:regressions").length, 1);
assert.ok(!fullSlice.commands.includes("npm run test:permissions"), "slice verification must not run the discovered harness a second time");
const permissionSlice = createSliceVerificationPlan(createChangedRegressionPlan(["src/routes/permissions.routes.js"]));
assert.equal(permissionSlice.permissionHarnessIncluded, true);
assert.deepEqual(permissionSlice.commands.filter((command) => /permission/.test(command)), [], "permission routing should reach the harness through the one full registry command");
for (const narrowPaths of [[], ["CHANGELOG.md"], ["src/modules/tasks/tasks.service.js"], ["src/db/schema/current.sql"]]) {
  const routedSlice = createSliceVerificationPlan(createChangedRegressionPlan(narrowPaths));
  const ledgerCommands = routedSlice.commands.filter((command) => command === "npm run typecheck" || command === "npm run check:fast");
  assert.equal(ledgerCommands.length, 1, `every routing outcome must schedule the strict ledger exactly once (${narrowPaths.join(", ") || "empty"})`);
}
const syntheticLedgerSource = JSON.stringify({
  schemaVersion: 1,
  checkpoint: "0.33.33.18.1",
  programs: { scripts: { config: "tsconfig.scripts.json", files: ["scripts/synthetic-owner.mjs"], errorCount: 1, diagnostics: { "scripts/synthetic-owner.mjs": [{ code: 7006, count: 1 }] } } },
  totals: { files: 1, errors: 1, explicitAny: 0 },
  explicitAnyByFile: {},
  expectedErrorDirectives: [],
  declarationProbe: { config: "tsconfig.declarations.json", firstPartyFiles: 0, errors: 0 },
});
const baselineLedgerState = JSON.parse(syntheticLedgerSource);
const seededIncrease = JSON.parse(syntheticLedgerSource);
seededIncrease.programs.scripts.diagnostics["scripts/synthetic-owner.mjs"][0].count = 2;
assert.throws(() => validateShrinkOnly(baselineLedgerState, seededIncrease), /increased 1 -> 2/, "a seeded per-file ledger regression must fail the strict gate");
const seededNewFile = JSON.parse(syntheticLedgerSource);
seededNewFile.programs.scripts.files.push("scripts/synthetic-new.mjs");
seededNewFile.programs.scripts.diagnostics["scripts/synthetic-new.mjs"] = [{ code: 2322, count: 1 }];
assert.throws(() => validateShrinkOnly(baselineLedgerState, seededNewFile), /new file has 1 strict diagnostic/, "a seeded new file with diagnostics must fail the strict gate");
const seededLedgerRun = executeSliceVerificationPlan(focusedSlice, {
  contextSeconds: 0,
  runCommand: (/** @type {string} */ command) => ({ status: command === "npm run typecheck" ? 1 : 0 }),
});
assert.equal(seededLedgerRun.status, 1, "a failing strict-ledger gate must fail the focused slice run");
const executed = executeSliceVerificationPlan(focusedSlice, { contextSeconds: 0.25, runCommand: () => ({ status: 0 }) });
const summary = formatSliceVerificationSummary(focusedSlice, executed);
for (const label of ["Context/setup", "Closeout gates", "Typecheck/unit/lint", "Strict-ledger typecheck", "Regression buckets", "Browser checks", "Packaging"]) {
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
const packageSource = JSON.parse(readFileSync("package.json", "utf8"));
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
  roadmapSource,
});
assert.deepEqual(closeoutCheckpoint.errors, [], "branch closeout may own the deferred release and documentation ceremony");

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
assert.equal(packageSource.scripts["checkpoint:validate"], "node scripts/release/checkpoint-commits.mjs --base-ref origin/nightly");

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
