import { describe, expect, it } from "vitest";
import {
  NODE_SECURITY_PATCH_CHECKPOINT,
  RESTART_RECOVERY_PATCH_CHECKPOINT,
  RESTART_RECOVERY_PATCH_DECLARATIONS,
  RESTART_RECOVERY_PATCH_DEPENDENCY_UPDATES,
  validateCheckpointCommit,
} from "../../scripts/release/checkpoint-commits.mjs";

/** @typedef {{ version: string, engines: Record<string, string>, dependencies: Record<string, string>, devDependencies: Record<string, string> }} FixtureManifest */

function fixture() {
  /** @type {FixtureManifest} */
  const before = { version: NODE_SECURITY_PATCH_CHECKPOINT, engines: { node: ">=24.22.1 <25" }, dependencies: { unrelated: "1.0.0" }, devDependencies: {} };
  /** @type {FixtureManifest} */
  const after = structuredClone(before);
  for (const [group, name, previous, reviewed] of RESTART_RECOVERY_PATCH_DECLARATIONS) {
    before[group][name] = previous;
    after[group][name] = reviewed;
  }
  /** @type {Record<string, unknown>} */
  const beforePackages = { "": structuredClone(before), "node_modules/unrelated": { version: "1.0.0", integrity: "fixed" } };
  /** @type {Record<string, unknown>} */
  const afterPackages = { "": structuredClone(after), "node_modules/unrelated": { version: "1.0.0", integrity: "fixed" } };
  for (const [packagePath, update] of Object.entries(RESTART_RECOVERY_PATCH_DEPENDENCY_UPDATES)) {
    if (update.before !== null) beforePackages[packagePath] = structuredClone(update.before);
    if (update.after !== null) afterPackages[packagePath] = structuredClone(update.after);
  }
  return {
    before,
    after,
    lockBefore: { version: before.version, lockfileVersion: 3, packages: beforePackages },
    lockAfter: { version: after.version, lockfileVersion: 3, packages: afterPackages },
  };
}

/**
 * @param {(values: ReturnType<typeof fixture>) => void} [change]
 * @param {string} [checkpoint]
 * @param {string[]} [paths]
 */
function foldErrors(change = () => {}, checkpoint = RESTART_RECOVERY_PATCH_CHECKPOINT, paths = ["package.json", "package-lock.json"]) {
  const values = fixture();
  change(values);
  return validateCheckpointCommit({
    message: `Take the reviewed fold\n\nLTF-Checkpoint: ${checkpoint}\nLTF-Summary: Take the reviewed Dependabot fold\nLTF-Docs: No docs change needed: synthetic boundary test.`,
    paths,
    packageBeforeSource: JSON.stringify(values.before),
    packageAfterSource: JSON.stringify(values.after),
    lockBeforeSource: JSON.stringify(values.lockBefore),
    lockAfterSource: JSON.stringify(values.lockAfter),
    roadmapSource: `### ${checkpoint} - Synthetic patch`,
  }).errors;
}

const FOLD_LOCK_ERROR = `package-lock.json under ${RESTART_RECOVERY_PATCH_CHECKPOINT} may change only its application version fields, to exactly ${RESTART_RECOVERY_PATCH_CHECKPOINT}, or take its reviewed dependency fold`;
const FOLD_PACKAGE_ERROR = `package.json under ${RESTART_RECOVERY_PATCH_CHECKPOINT} may change only the application version, to exactly ${RESTART_RECOVERY_PATCH_CHECKPOINT}, or scripts`;

describe("the restart-recovery dependency fold", () => {
  it("admits the complete reviewed transition at the unchanged application version", () => {
    expect(foldErrors()).toEqual([]);
  });

  it("holds the transitions the roadmap reviewed, including the one removal", () => {
    expect(Object.keys(RESTART_RECOVERY_PATCH_DEPENDENCY_UPDATES)).toHaveLength(16);
    expect(RESTART_RECOVERY_PATCH_DEPENDENCY_UPDATES["node_modules/ip-address"].after?.version).toBe("10.7.4");
    expect(RESTART_RECOVERY_PATCH_DEPENDENCY_UPDATES["node_modules/@vitest/mocker"].after?.version).toBe("4.1.12");
    expect(RESTART_RECOVERY_PATCH_DEPENDENCY_UPDATES["node_modules/playwright/node_modules/fsevents"].after).toBeNull();
  });

  it.each(Object.keys(RESTART_RECOVERY_PATCH_DEPENDENCY_UPDATES))("refuses leaving %s behind", (packagePath) => {
    expect(foldErrors(({ lockAfter }) => {
      const previous = RESTART_RECOVERY_PATCH_DEPENDENCY_UPDATES[packagePath].before;
      lockAfter.packages[packagePath] = structuredClone(previous);
    })).toContain(FOLD_LOCK_ERROR);
  });

  it.each(["integrity", "resolved", "license", "dev"])("refuses a changed %s beside a reviewed version", (field) => {
    expect(foldErrors(({ lockAfter }) => {
      const entry = /** @type {Record<string, unknown>} */ (lockAfter.packages["node_modules/zod"]);
      entry[field] = "unexpected";
    })).toContain(FOLD_LOCK_ERROR);
  });

  it("refuses a different target than the reviewed one, as Dependabot's fuller proposal would be", () => {
    expect(foldErrors(({ lockAfter }) => {
      lockAfter.packages["node_modules/vite"] = { version: "8.3.5", integrity: "unreviewed" };
    })).toContain(FOLD_LOCK_ERROR);
  });

  it("refuses an unreviewed resolved package and an unreviewed declaration", () => {
    expect(foldErrors(({ lockAfter }) => {
      lockAfter.packages["node_modules/unrelated"] = { version: "2.0.0", integrity: "fixed" };
    })).toContain(FOLD_LOCK_ERROR);
    expect(foldErrors(({ after }) => { after.dependencies.unrelated = "2.0.0"; })).toContain(FOLD_PACKAGE_ERROR);
    expect(foldErrors(({ after }) => { after.engines.node = ">=24"; })).toContain(FOLD_PACKAGE_ERROR);
  });

  it.each(RESTART_RECOVERY_PATCH_DECLARATIONS.map(([group, name]) => [group, name]))("refuses leaving %s %s undeclared", (group, name) => {
    const declaration = RESTART_RECOVERY_PATCH_DECLARATIONS.find(([, candidate]) => candidate === name);
    expect(foldErrors(({ after }) => { after[/** @type {"dependencies" | "devDependencies"} */ (group)][name] = declaration?.[2] ?? ""; })).toContain(FOLD_PACKAGE_ERROR);
  });

  it("refuses the fold when the root lock entry disagrees with the manifest", () => {
    expect(foldErrors(({ lockAfter }) => {
      const root = /** @type {FixtureManifest} */ (lockAfter.packages[""]);
      root.dependencies.zod = "^4.6.6";
    })).toContain(FOLD_LOCK_ERROR);
  });

  it("refuses taking the fold from any other starting version, or while moving the version", () => {
    expect(foldErrors(({ before, lockBefore }) => {
      before.version = "0.33.33.51";
      lockBefore.version = before.version;
    })).toContain(FOLD_LOCK_ERROR);
    expect(foldErrors(({ after, lockAfter }) => {
      after.version = RESTART_RECOVERY_PATCH_CHECKPOINT;
      lockAfter.version = after.version;
    })).toContain(FOLD_PACKAGE_ERROR);
  });

  it.each(["0.33.33.51", RESTART_RECOVERY_PATCH_CHECKPOINT])("refuses the complete fold when both sides are application version %s", (version) => {
    /** @param {ReturnType<typeof fixture>} values */
    const setVersion = ({ before, after, lockBefore, lockAfter }) => {
      for (const manifest of [before, after, lockBefore, lockAfter, lockBefore.packages[""], lockAfter.packages[""]]) {
        /** @type {FixtureManifest} */ (manifest).version = version;
      }
    };
    expect(foldErrors(setVersion, undefined, ["package.json"])).toContain(FOLD_PACKAGE_ERROR);
    expect(foldErrors(setVersion, undefined, ["package-lock.json"])).toContain(FOLD_LOCK_ERROR);
  });

  it("refuses a lock whose top-level version is another identity on both sides", () => {
    expect(foldErrors(({ lockBefore, lockAfter }) => {
      lockBefore.version = "0.33.33.51";
      lockAfter.version = "0.33.33.51";
    }, undefined, ["package-lock.json"])).toContain(FOLD_LOCK_ERROR);
  });

  it.each(["package.json", "package-lock.json"])("keeps the %s half of the fold to its own checkpoint", (filePath) => {
    expect(foldErrors(undefined, NODE_SECURITY_PATCH_CHECKPOINT, [filePath]).length).toBeGreaterThan(0);
  });
});

describe("the restart-recovery release identity", () => {
  /** @param {string} version */
  function bumpErrors(version) {
    const { after, lockAfter } = fixture();
    const nextPackage = { ...after, version };
    const nextRoot = /** @type {FixtureManifest} */ (lockAfter.packages[""]);
    const nextLock = { ...lockAfter, version, packages: { ...lockAfter.packages, "": { ...nextRoot, version } } };
    return validateCheckpointCommit({
      message: `Set the release identity\n\nLTF-Checkpoint: ${RESTART_RECOVERY_PATCH_CHECKPOINT}\nLTF-Summary: Set the patch's own release identity\nLTF-Docs: No docs change needed: synthetic boundary test.`,
      paths: ["package.json", "package-lock.json"],
      packageBeforeSource: JSON.stringify(after),
      packageAfterSource: JSON.stringify(nextPackage),
      lockBeforeSource: JSON.stringify(lockAfter),
      lockAfterSource: JSON.stringify(nextLock),
      roadmapSource: `### ${RESTART_RECOVERY_PATCH_CHECKPOINT} - Synthetic patch`,
    }).errors;
  }

  it("admits moving the version to exactly its own identity after the fold", () => {
    expect(bumpErrors(RESTART_RECOVERY_PATCH_CHECKPOINT)).toEqual([]);
  });

  it("refuses any other identity", () => {
    expect(bumpErrors(`${RESTART_RECOVERY_PATCH_CHECKPOINT}.1`)).toContain(FOLD_PACKAGE_ERROR);
  });

  /** @param {string} checkpoint @param {string[]} paths */
  function ceremonyErrors(checkpoint, paths) {
    return validateCheckpointCommit({
      message: `Record a decision\n\nLTF-Checkpoint: ${checkpoint}\nLTF-Summary: Record the patch's governing decisions\nLTF-Docs: No docs change needed: synthetic boundary test.`,
      paths,
      roadmapSource: `### ${checkpoint} - Synthetic patch`,
    }).errors;
  }

  it("admits DECISIONS.md, as the operator approved on 2026-11-03", () => {
    expect(ceremonyErrors(RESTART_RECOVERY_PATCH_CHECKPOINT, ["DECISIONS.md"])).toEqual([]);
  });

  it("keeps DECISIONS.md reserved for every other patch", () => {
    expect(ceremonyErrors(NODE_SECURITY_PATCH_CHECKPOINT, ["DECISIONS.md"]).join("\n")).toContain("DECISIONS.md is reserved");
  });

  it("keeps the two-ceremony-file ceiling, DECISIONS.md included", () => {
    expect(ceremonyErrors(RESTART_RECOVERY_PATCH_CHECKPOINT, ["DECISIONS.md", "ROADMAP.md", "ROADMAP-ARCHIVE.md"]).join("\n")).toContain("changes 3 ceremony files");
  });
});
