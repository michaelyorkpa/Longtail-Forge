import { describe, expect, it } from "vitest";
import {
  NODE_SECURITY_PATCH_CHECKPOINT,
  RESET_RETENTION_PATCH_CHECKPOINT,
  RESTART_RECOVERY_PATCH_CHECKPOINT,
  validateCheckpointCommit,
} from "../../scripts/release/checkpoint-commits.mjs";

/**
 * The application as the restart-recovery release left it, and the same application moved to
 * `version`, in both package files. `change` may edit the moved package before it is serialized.
 * @param {string} version
 * @param {(manifest: { version: string, dependencies: Record<string, string> }) => void} [change]
 */
function release(version, change = () => {}) {
  const before = { version: RESTART_RECOVERY_PATCH_CHECKPOINT, dependencies: { zod: "^4.6.7" } };
  const after = { ...structuredClone(before), version };
  change(after);
  const lock = (/** @type {typeof before} */ manifest) => ({
    version: manifest.version,
    lockfileVersion: 3,
    packages: { "": structuredClone(manifest), "node_modules/zod": { version: "4.6.7", integrity: "fixed" } },
  });
  return { before, after, lockBefore: lock(before), lockAfter: lock(after) };
}

/** @param {string} checkpoint @param {string[]} paths @param {ReturnType<typeof release>} [values] */
function errors(checkpoint, paths, values = release(RESET_RETENTION_PATCH_CHECKPOINT)) {
  return validateCheckpointCommit({
    message: `Synthetic change\n\nLTF-Checkpoint: ${checkpoint}\nLTF-Summary: A synthetic reset-retention boundary change\nLTF-Docs: ${paths.some((filePath) => filePath.startsWith("docs/")) ? `Docs updated: ${paths.filter((filePath) => filePath.startsWith("docs/")).join(", ")}.` : "No docs change needed: synthetic boundary test."}`,
    paths,
    packageBeforeSource: JSON.stringify(values.before),
    packageAfterSource: JSON.stringify(values.after),
    lockBeforeSource: JSON.stringify(values.lockBefore),
    lockAfterSource: JSON.stringify(values.lockAfter),
    roadmapSource: `### ${checkpoint} - Synthetic patch`,
  }).errors;
}

describe("the reset-retention patch", () => {
  it("is the patch after restart recovery", () => {
    expect(RESET_RETENTION_PATCH_CHECKPOINT).toBe("0.33.33.54");
  });

  it("admits moving the version, in both package files, to exactly its own identity", () => {
    expect(errors(RESET_RETENTION_PATCH_CHECKPOINT, ["package.json", "package-lock.json"])).toEqual([]);
  });

  it("refuses any other identity", () => {
    const values = release(`${RESET_RETENTION_PATCH_CHECKPOINT}.1`);
    expect(errors(RESET_RETENTION_PATCH_CHECKPOINT, ["package.json"], values).join("\n"))
      .toContain(`package.json under ${RESET_RETENTION_PATCH_CHECKPOINT} may change only the application version`);
  });

  it("takes no dependency change beside its identity", () => {
    const values = release(RESET_RETENTION_PATCH_CHECKPOINT, (manifest) => {
      manifest.dependencies.zod = "^4.6.8";
    });
    expect(errors(RESET_RETENTION_PATCH_CHECKPOINT, ["package.json"], values).join("\n"))
      .toContain(`package.json under ${RESET_RETENTION_PATCH_CHECKPOINT} may change only the application version`);
  });

  it("admits the changelog and its owning documentation", () => {
    expect(errors(RESET_RETENTION_PATCH_CHECKPOINT, ["CHANGELOG.md", "docs/demo-data-operations.md"])).toEqual([]);
  });

  it("admits DECISIONS.md, which records how long visitor-entered demo content persists", () => {
    expect(errors(RESET_RETENTION_PATCH_CHECKPOINT, ["DECISIONS.md"])).toEqual([]);
  });

  it("keeps DECISIONS.md reserved for a patch that was not given it", () => {
    expect(errors(NODE_SECURITY_PATCH_CHECKPOINT, ["DECISIONS.md"]).join("\n")).toContain("DECISIONS.md is reserved");
  });

  it("keeps the two-ceremony-file ceiling, DECISIONS.md included", () => {
    expect(errors(RESET_RETENTION_PATCH_CHECKPOINT, ["DECISIONS.md", "ROADMAP.md", "ROADMAP-ARCHIVE.md"]).join("\n"))
      .toContain("changes 3 ceremony files");
  });
});
