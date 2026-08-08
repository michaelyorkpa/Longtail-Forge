import assert from "node:assert/strict";
import { describe, it } from "vitest";
import {
  PUBLIC_DEMO_DENIAL_CODE,
  PUBLIC_DEMO_DENIAL_MESSAGE,
  assertPublicDemoCapabilityAllowed,
  evaluatePublicDemoCapability,
  filterPublicDemoContributionActions,
} from "../../src/core/public-demo-enforcement.js";

describe("public-demo capability enforcement", () => {
  it("allows ordinary behavior unchanged when demo mode is off", () => {
    assert.deepEqual(evaluatePublicDemoCapability("future.undeclared", { demoEnabled: false }), {
      allowed: true,
      capabilityId: "future.undeclared",
      classification: "standard",
    });
  });

  it("allows only the reviewed access level when demo mode is on", () => {
    assert.equal(evaluatePublicDemoCapability("records.workspace", { demoEnabled: true }).allowed, true);
    assert.equal(evaluatePublicDemoCapability("runtime.diagnostics", { demoEnabled: true, access: "read" }).allowed, true);
    assert.equal(evaluatePublicDemoCapability("runtime.diagnostics", { demoEnabled: true }).allowed, false);
    assert.equal(evaluatePublicDemoCapability("api_keys", { demoEnabled: true }).allowed, false);
  });

  it("removes disabled and undeclared registered actions from demo contribution catalogs", () => {
    const contribution = {
      actions: [
        { id: "record", publicDemoCapability: "records.workspace" },
        { id: "admin", publicDemoCapability: "administration.installation" },
        { id: "future" },
      ],
      nested: {
        actions: [
          { id: "read", publicDemoCapability: "runtime.diagnostics" },
        ],
      },
    };
    assert.deepEqual(
      filterPublicDemoContributionActions(contribution, { demoEnabled: true, access: "read" }),
      {
        actions: [{ id: "record", publicDemoCapability: "records.workspace" }],
        nested: {
          actions: [{ id: "read", publicDemoCapability: "runtime.diagnostics" }],
        },
      },
    );
    assert.equal(filterPublicDemoContributionActions(contribution, { demoEnabled: false }), contribution);
  });

  it("fails closed with one safe stable contract for disabled and undeclared capabilities", () => {
    for (const capabilityId of ["support_view", "future.undeclared"]) {
      assert.throws(
        () => assertPublicDemoCapabilityAllowed(capabilityId, { demoEnabled: true }),
        (error) => error.statusCode === 403
          && error.code === PUBLIC_DEMO_DENIAL_CODE
          && error.message === PUBLIC_DEMO_DENIAL_MESSAGE,
      );
    }
  });
});
