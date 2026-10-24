import { describe, expect, it } from "vitest";
import { NODE_SECURITY_PATCH_CHECKPOINT, validateCheckpointCommit } from "../../scripts/release/checkpoint-commits.mjs";

function fixture() {
  const before = { version: "0.33.33.51", engines: { node: ">=24.7 <25" }, dependencies: { example: "1.0.0" } };
  const after = { ...before, version: NODE_SECURITY_PATCH_CHECKPOINT, engines: { node: ">=24.22.1 <25" } };
  const lockBefore = { version: before.version, lockfileVersion: 3, packages: { "": before, "node_modules/example": { version: "1.0.0", integrity: "original", dev: false } } };
  const lockAfter = { ...lockBefore, version: after.version, packages: { ...lockBefore.packages, "": after } };
  return { before, after, lockBefore, lockAfter };
}

/** @param {Partial<NonNullable<Parameters<typeof validateCheckpointCommit>[0]>>} overrides */
function check(overrides = {}) {
  const { before, after, lockBefore, lockAfter } = fixture();
  return validateCheckpointCommit({
    message: `Update the Node security runtime\n\nLTF-Checkpoint: ${NODE_SECURITY_PATCH_CHECKPOINT}\nLTF-Summary: Require the patched Node runtime\nLTF-Docs: No docs change needed: synthetic boundary test.`,
    paths: ["package.json", "package-lock.json"],
    packageBeforeSource: JSON.stringify(before),
    packageAfterSource: JSON.stringify(after),
    lockBeforeSource: JSON.stringify(lockBefore),
    lockAfterSource: JSON.stringify(lockAfter),
    roadmapSource: `### ${NODE_SECURITY_PATCH_CHECKPOINT} - Node security refresh`,
    ...overrides,
  });
}

describe("Node security checkpoint ownership", () => {
  it("admits exactly the release version and patched Node floor", () => {
    expect(check().errors).toEqual([]);
  });

  it.each([">=24.22.0 <25", ">=24.22.1", ">=26"])("refuses an unreviewed engine transition to %s", (node) => {
    const { after, lockAfter } = fixture();
    after.engines.node = node;
    expect(check({ packageAfterSource: JSON.stringify(after), lockAfterSource: JSON.stringify(lockAfter) }).errors.length).toBeGreaterThan(0);
  });

  it("refuses another application identity", () => {
    const { after, lockAfter } = fixture();
    after.version = "9.9.9";
    lockAfter.version = after.version;
    expect(check({ packageAfterSource: JSON.stringify(after), lockAfterSource: JSON.stringify(lockAfter) }).errors.length).toBeGreaterThan(0);
  });

  it("refuses a dependency declaration beside the engine change", () => {
    const { after } = fixture();
    after.dependencies = { example: "2.0.0" };
    expect(check({ packageAfterSource: JSON.stringify(after) }).errors.length).toBeGreaterThan(0);
  });

  it.each(["version", "integrity", "dev"])("refuses changing a resolved dependency's %s", (field) => {
    const { lockAfter } = fixture();
    const entry = lockAfter.packages["node_modules/example"];
    if (field === "version") entry.version = "2.0.0";
    if (field === "integrity") entry.integrity = "changed";
    if (field === "dev") entry.dev = true;
    expect(check({ lockAfterSource: JSON.stringify(lockAfter) }).errors.length).toBeGreaterThan(0);
  });

  it("refuses unrelated package metadata", () => {
    const { after } = fixture();
    expect(check({ packageAfterSource: JSON.stringify({ ...after, license: "MIT" }) }).errors.length).toBeGreaterThan(0);
  });

  it("keeps durable decisions and the ceremony ceiling protected", () => {
    expect(check({ paths: ["DECISIONS.md"] }).errors.length).toBeGreaterThan(0);
    expect(check({ paths: ["package.json", "package-lock.json", "CHANGELOG.md"] }).errors.length).toBeGreaterThan(0);
  });

  it("refuses engine changes under the prior image checkpoint", () => {
    const { before, after } = fixture();
    after.version = before.version;
    expect(check({
      message: `Prior patch\n\nLTF-Checkpoint: ${before.version}\nLTF-Summary: Attempt an unauthorized engine change\nLTF-Docs: No docs change needed: synthetic boundary test.`,
      roadmapSource: `### ${before.version} - Prior image patch`,
      packageAfterSource: JSON.stringify(after),
      paths: ["package.json"],
    }).errors.length).toBeGreaterThan(0);
  });
});
