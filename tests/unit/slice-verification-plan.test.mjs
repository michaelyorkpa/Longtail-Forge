import { describe, expect, it } from "vitest";
import { createChangedRegressionPlan } from "../../scripts/lib/changed-regression-runner.mjs";
import {
  createSliceVerificationPlan,
  executeSliceVerificationPlan,
  formatSliceVerificationSummary,
} from "../../scripts/lib/slice-verification-plan.mjs";

function planFor(paths) {
  return createSliceVerificationPlan(createChangedRegressionPlan(paths));
}

describe("slice verification planning", () => {
  it("schedules closeout and only the Tasks regression command for a Tasks-only change", () => {
    const plan = planFor(["src/modules/tasks/tasks.service.js"]);

    expect(plan.commands).toEqual([
      "npm run closeout",
      "npm run typecheck",
      "npm run test:regressions:tasks",
    ]);
    expect(plan.fullCheckIncluded).toBe(false);
    expect(plan.commands).not.toContain("npm run check");
  });

  it("keeps changelog bookkeeping on its focused release owner", () => {
    const plan = planFor(["CHANGELOG.md"]);

    expect(plan.commands).toEqual(["npm run closeout", "npm run typecheck", "npm run test:regressions:release"]);
    expect(plan.fullCheckIncluded).toBe(false);
  });

  it("decomposes full escalation into timed fast-check and regression stages", () => {
    const plan = planFor(["src/core/shared-context.js"]);

    expect(plan.commands).toEqual(["npm run closeout", "npm run check:fast", "npm run test:regressions"]);
    expect(plan.fullCheckIncluded).toBe(true);
    expect(plan.commands).not.toContain("npm run typecheck");
  });

  it("enforces the strict ledger exactly once in every plan", () => {
    for (const paths of [
      [],
      ["CHANGELOG.md"],
      ["src/modules/tasks/tasks.service.js"],
      ["src/core/shared-context.js"],
    ]) {
      const plan = planFor(paths);
      const ledgerCommands = plan.commands.filter((command) => (
        command === "npm run typecheck" || command === "npm run check:fast"
      ));

      expect(ledgerCommands).toHaveLength(1);
    }
  });

  it("fails a focused slice when the unconditional strict-ledger gate fails", () => {
    const plan = planFor(["src/modules/tasks/tasks.service.js"]);
    /** @type {string[]} */
    const invocations = [];
    const result = executeSliceVerificationPlan(plan, {
      /** @param {string} command */
      runCommand(command) {
        invocations.push(command);
        return { status: command === "npm run typecheck" ? 5 : 0 };
      },
    });

    expect(result.status).toBe(5);
    expect(invocations).toEqual(["npm run closeout", "npm run typecheck"]);
  });

  it("fully escalates permission changes and discovers the permission harness exactly once", () => {
    const plan = planFor(["src/services/permissions.service.js"]);

    expect(plan.commands).toEqual([
      "npm run closeout",
      "npm run check:fast",
      "npm run test:regressions",
    ]);
    expect(plan.permissionHarnessIncluded).toBe(true);
    expect(plan.commands).not.toContain("npm run test:permissions");
  });

  it("combines full-check escalation and permissions without duplicates or area commands", () => {
    const plan = planFor(["src/core/permissions.js"]);

    expect(plan.commands).toEqual([
      "npm run closeout",
      "npm run check:fast",
      "npm run test:regressions",
    ]);
    expect(new Set(plan.commands).size).toBe(plan.commands.length);
    expect(plan.commands.some((command) => command.startsWith("npm run test:regressions:"))).toBe(false);
  });

  it("stops after a hard closeout failure", () => {
    const plan = planFor(["CHANGELOG.md"]);
    const invocations = [];
    const result = executeSliceVerificationPlan(plan, {
      runCommand(command) {
        invocations.push(command);
        return { status: command === "npm run closeout" ? 7 : 0 };
      },
    });

    expect(result.status).toBe(7);
    expect(invocations).toEqual(["npm run closeout"]);
  });

  it("runs closeout and the strict ledger without inventing an expensive regression for an empty change set", () => {
    const plan = planFor([]);

    expect(plan.mode).toBe("empty");
    expect(plan.commands).toEqual(["npm run closeout", "npm run typecheck"]);
    expect(plan.fullCheckIncluded).toBe(false);
    expect(plan.permissionHarnessIncluded).toBe(false);
  });

  it("formats the mode, executed commands, escalation, permissions, and no-rerun guidance", () => {
    const plan = planFor(["src/core/permissions.js"]);
    const result = executeSliceVerificationPlan(plan, { runCommand: () => ({ status: 0 }) });
    const summary = formatSliceVerificationSummary(plan, result);

    expect(summary).toMatch(/Changed-regression mode: full-check/);
    expect(summary).toMatch(/\[PASSED\] Closeout gates/);
    expect(summary).toMatch(/\[PASSED\] Typecheck\/unit\/lint/);
    expect(summary).toMatch(/\[PASSED\] Regression buckets/);
    expect(summary).toMatch(/Full-check escalation included: yes/);
    expect(summary).toMatch(/Permission harness discovered through regression buckets: yes/);
    expect(summary).toMatch(/Do not run an equivalent local verification command again unless files change/);
  });
});
