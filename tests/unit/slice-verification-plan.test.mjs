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
      "npm run test:regressions:tasks",
    ]);
    expect(plan.fullCheckIncluded).toBe(false);
    expect(plan.commands).not.toContain("npm run check");
  });

  it.each([
    ["CHANGELOG.md", "release"],
    ["src/core/shared-context.js", "framework"],
  ])("escalates a %s change to one full check with no individual %s command", (filePath, area) => {
    const plan = planFor([filePath]);

    expect(plan.commands).toEqual(["npm run closeout", "npm run check"]);
    expect(plan.fullCheckIncluded).toBe(true);
    expect(plan.commands).not.toContain(`npm run test:regressions:${area}`);
  });

  it("schedules the focused permission area and separate permission harness exactly once", () => {
    const plan = planFor(["src/services/permission-policy.js"]);

    expect(plan.commands).toEqual([
      "npm run closeout",
      "npm run test:regressions:permissions",
      "npm run test:permissions",
    ]);
    expect(plan.commands.filter((command) => command === "npm run test:permissions")).toHaveLength(1);
  });

  it("combines full-check escalation and permissions without duplicates or area commands", () => {
    const plan = planFor(["src/core/permissions.js"]);

    expect(plan.commands).toEqual([
      "npm run closeout",
      "npm run check",
      "npm run test:permissions",
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

  it("runs closeout without inventing an expensive regression for an empty change set", () => {
    const plan = planFor([]);

    expect(plan.mode).toBe("empty");
    expect(plan.commands).toEqual(["npm run closeout"]);
    expect(plan.fullCheckIncluded).toBe(false);
    expect(plan.permissionHarnessIncluded).toBe(false);
  });

  it("formats the mode, executed commands, escalation, permissions, and no-rerun guidance", () => {
    const plan = planFor(["src/core/permissions.js"]);
    const result = executeSliceVerificationPlan(plan, { runCommand: () => ({ status: 0 }) });
    const summary = formatSliceVerificationSummary(plan, result);

    expect(summary).toMatch(/Changed-regression mode: full-check/);
    expect(summary).toMatch(/Commands actually executed:[\s\S]*npm run closeout[\s\S]*npm run check/);
    expect(summary).toMatch(/Full-check escalation included: yes/);
    expect(summary).toMatch(/Permission harness included: yes/);
    expect(summary).toMatch(/Do not run an equivalent local verification command again unless files change/);
  });
});
