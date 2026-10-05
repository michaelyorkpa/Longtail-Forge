import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createChangedRegressionPlan, formatChangedRegressionPlan } from "../../scripts/lib/changed-regression-runner.mjs";
import { collectChangedChangeSet, suggestRegressionsForPaths } from "../../scripts/lib/regression-change-routing.mjs";
import { createSliceVerificationPlan, formatSliceVerificationPlan } from "../../scripts/lib/slice-verification-plan.mjs";

/**
 * Checkpoint verification covers every changed path (`0.33.33.25.11`).
 *
 * Three ways `verify:slice` could print `Status: passed` having proved little or nothing, and the
 * cases that pin each fix:
 *
 * 1. **Per-path escalation.** The fallback used to fire only when no path routed, so `ROADMAP.md`
 *    routing to `release` hid an unrouted source file beside it. Two recorded ranges are replayed.
 * 2. **An empty selection is refused** - pinned in `slice-verification-plan.test.mjs`, and here
 *    through the collector, where a committed tree without a base produces one.
 * 3. **The collector includes tracked uncommitted edits** alongside a committed range, proved in a
 *    temporary repository rather than this one's history.
 */

/** @param {readonly string[]} paths */
const slicePlanFor = (paths) => createSliceVerificationPlan(createChangedRegressionPlan([...paths]));

describe("An unrouted path escalates the whole plan", () => {
  it("escalates a roadmap change beside an unrouted source file, and names the file", () => {
    const suggestion = suggestRegressionsForPaths(["ROADMAP.md", "public/js/clients-projects.js"]);
    expect(suggestion.fallback).toBe(true);
    expect(suggestion.fullCheckRecommended).toBe(true);
    expect(suggestion.commands).toEqual(["npm run test:regressions"]);
    expect(suggestion.unroutedPaths).toEqual(["public/js/clients-projects.js"]);

    const plan = createChangedRegressionPlan(["ROADMAP.md", "public/js/clients-projects.js"]);
    expect(plan.mode).toBe("full-check");
    expect(formatChangedRegressionPlan(plan)).toMatch(/- public\/js\/clients-projects\.js: no route matched -> full gate/);
    expect(formatSliceVerificationPlan(slicePlanFor(plan.paths))).toMatch(/Unrouted paths \(each escalates to the full gate\):\n- public\/js\/clients-projects\.js/);
  });

  it("replays the 0.33.33.43.46 range, which used to select only release", () => {
    const range = [
      "ROADMAP-ARCHIVE.md",
      "ROADMAP.md",
      "public/js/clients-projects.js",
      "scripts/typecheck-debt-ledger.json",
      "tests/e2e/client-projects-edit-dialog-reflow.spec.mjs",
      "tests/unit/clients-projects-element-values-contracts.test.mjs",
    ];
    const plan = slicePlanFor(range);
    expect(plan.mode).toBe("full-check");
    expect(plan.fullCheckIncluded).toBe(true);
    expect(plan.commands).toEqual(["npm run closeout", "npm run check:fast", "npm run test:regressions"]);
    expect(plan.unroutedPaths).toEqual(range.slice(2));
  });

  it("replays the 0.33.33.38.2.11 range, whose shared contract used to route nowhere", () => {
    const range = [
      "ROADMAP-ARCHIVE.md",
      "ROADMAP.md",
      "public/js/navigation.js",
      "scripts/typecheck-debt-ledger.json",
      "src/types/browser-contracts.d.ts",
      "tests/e2e/navigation-href-input.spec.mjs",
      "tests/unit/navigation-href-input-contracts.test.mjs",
    ];
    const plan = slicePlanFor(range);
    expect(plan.fullCheckIncluded).toBe(true);
    expect(plan.unroutedPaths).toEqual(range.slice(2));
  });

  it("keeps documentation-only and bookkeeping-only ranges focused", () => {
    const docs = suggestRegressionsForPaths(["AGENTS.md", "CHANGELOG.md", "ROADMAP.md", "ROADMAP-ARCHIVE.md", "docs/regression-suite.md"]);
    expect(docs.fallback).toBe(false);
    expect(docs.fullCheckRecommended).toBe(false);
    expect(docs.unroutedPaths).toEqual([]);
    expect(docs.areas).toEqual(["docs", "release"]);
  });

  it("keeps a fully routed module change focused on its areas", () => {
    const plan = slicePlanFor(["ROADMAP.md", "src/modules/tasks/tasks.service.js"]);
    expect(plan.mode).toBe("focused");
    expect(plan.unroutedPaths).toEqual([]);
    expect(plan.commands).toEqual(["npm run closeout", "npm run typecheck", "npm run test:regressions:tasks", "npm run test:regressions:release"]);
  });
});

describe("The collector sees every edit it is asked to verify", () => {
  /** @type {string | null} */
  let repository = null;
  const savedBase = process.env.LTF_REGRESSION_BASE_SHA;

  afterEach(() => {
    if (savedBase === undefined) delete process.env.LTF_REGRESSION_BASE_SHA;
    else process.env.LTF_REGRESSION_BASE_SHA = savedBase;
    if (repository) rmSync(repository, { force: true, recursive: true });
    repository = null;
  });

  /** @param {string} cwd @param {string[]} args */
  const git = (cwd, args) => execFileSync("git", ["-c", "user.email=verify@example.test", "-c", "user.name=Verify", "-c", "commit.gpgsign=false", ...args], {
    cwd,
    encoding: "utf8",
  }).trim();

  /** A repository with a base commit, one committed change, one tracked edit and one untracked file. */
  function scenario() {
    const cwd = mkdtempSync(path.join(tmpdir(), "ltf-verify-"));
    repository = cwd;
    git(cwd, ["-c", "init.defaultBranch=main", "init", "-q"]);
    writeFileSync(path.join(cwd, "committed.txt"), "base\n");
    writeFileSync(path.join(cwd, "edited.txt"), "base\n");
    git(cwd, ["add", "."]);
    git(cwd, ["commit", "-q", "-m", "base"]);
    const base = git(cwd, ["rev-parse", "HEAD"]);
    writeFileSync(path.join(cwd, "committed.txt"), "changed\n");
    git(cwd, ["commit", "-q", "-am", "checkpoint"]);
    writeFileSync(path.join(cwd, "edited.txt"), "edited but not committed\n");
    writeFileSync(path.join(cwd, "untracked.txt"), "new\n");
    return { base, cwd };
  }

  it("unites the committed range with tracked uncommitted edits and untracked files", () => {
    const { base, cwd } = scenario();
    process.env.LTF_REGRESSION_BASE_SHA = base;
    const changeSet = collectChangedChangeSet({ cwd });
    expect(changeSet.baseSha).toBe(base);
    expect(changeSet.paths).toEqual(["committed.txt", "edited.txt", "untracked.txt"]);
  });

  it("without a base, inspects only uncommitted edits - and a clean committed tree is refused, not passed", () => {
    const { cwd } = scenario();
    delete process.env.LTF_REGRESSION_BASE_SHA;
    expect(collectChangedChangeSet({ cwd }).paths).toEqual(["edited.txt", "untracked.txt"]);

    git(cwd, ["add", "."]);
    git(cwd, ["commit", "-q", "-m", "everything committed"]);
    const clean = collectChangedChangeSet({ cwd });
    expect(clean.baseSha).toBe(null);
    expect(clean.paths).toEqual([]);
    const plan = slicePlanFor(clean.paths);
    expect(plan.refused).toBe(true);
    expect(formatSliceVerificationPlan(plan)).toMatch(/Nothing to verify: no changed paths were selected\./);
  });
});
