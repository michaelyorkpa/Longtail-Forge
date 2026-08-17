import { describe, expect, it } from "vitest";
import {
  STATIC_EXECUTION_RESOURCE_DIMENSIONS,
  createStaticRegressionExecutionPlan,
} from "../../scripts/lib/static-regression-execution.mjs";

// The environment value is a free-text resource classification; widen it past
// the literal so tests can seed unsafe classifications against the plan.
const safeResources = Object.freeze({
  environment: /** @type {string} */ ("none"),
  globalState: "worker-local",
  timers: "none",
  listeners: "none",
  cache: "worker-local module cache",
  process: "read-only cwd and platform",
  fileSystem: "read-only repository files",
});

function createAudit(overrides = {}) {
  return {
    execution: {
      schemaVersion: 1,
      defaultDecision: "child-process",
      resourceDimensions: [...STATIC_EXECUTION_RESOURCE_DIMENSIONS],
      defaultResources: Object.fromEntries(STATIC_EXECUTION_RESOURCE_DIMENSIONS.map((dimension) => [dimension, "unreviewed; child process required"])),
      entries: [{
        path: "scripts/certified-regression.mjs",
        decision: "worker-parallel",
        fallback: "child-process",
        resources: { ...safeResources },
        rationale: "This synthetic source-only owner reads repository state without mutating process or worker resources and is safe for isolated worker execution.",
      }],
      ...overrides,
    },
  };
}

const entries = [
  { path: "scripts/certified-regression.mjs", runMode: "static" },
  { path: "scripts/uncertified-regression.mjs", runMode: "static" },
  { path: "scripts/database-regression.mjs", runMode: "isolated-database" },
];

describe("static regression execution audit", () => {
  it("runs only certified static owners in workers and falls every other entry back to child isolation", () => {
    const plan = createStaticRegressionExecutionPlan({ audit: createAudit(), entries, env: {} });

    expect(plan.mode).toBe("audited-workers");
    expect(plan.workerCount).toBe(1);
    expect(plan.fallbackCount).toBe(1);
    expect(plan.decisions.get("scripts/certified-regression.mjs").decision).toBe("worker-parallel");
    expect(plan.decisions.get("scripts/uncertified-regression.mjs").decision).toBe("child-process");
    expect(plan.decisions.has("scripts/database-regression.mjs")).toBe(false);
  });

  it("keeps the audited child-process control path independently selectable", () => {
    const plan = createStaticRegressionExecutionPlan({
      audit: createAudit(),
      entries,
      env: { LTF_STATIC_EXECUTION_MODE: "child-process" },
    });

    expect(plan.workerCount).toBe(0);
    expect(plan.fallbackCount).toBe(2);
    expect(plan.decisions.get("scripts/certified-regression.mjs").source).toBe("forced-fallback");
  });

  it("rejects incomplete or unsafe certification instead of silently widening worker eligibility", () => {
    const incomplete = createAudit({ resourceDimensions: STATIC_EXECUTION_RESOURCE_DIMENSIONS.slice(0, -1) });
    expect(() => createStaticRegressionExecutionPlan({ audit: incomplete, entries, env: {} })).toThrow(/must cover environment/);

    const unsafe = createAudit();
    unsafe.execution.entries[0].resources.environment = "writes process.env";
    expect(() => createStaticRegressionExecutionPlan({ audit: unsafe, entries, env: {} })).toThrow(/unsafe environment classification/);
  });

  it("rejects an unknown operator mode", () => {
    expect(() => createStaticRegressionExecutionPlan({
      audit: createAudit(),
      entries,
      env: { LTF_STATIC_EXECUTION_MODE: "all-workers" },
    })).toThrow(/LTF_STATIC_EXECUTION_MODE must be one of/);
  });
});
